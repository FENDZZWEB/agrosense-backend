import firebase_admin
from firebase_admin import credentials, db
import requests
import schedule
import time
import datetime
import threading

# Timezone WIB (UTC+8) — agar tanggal selalu dihitung berdasarkan waktu Indonesia
# bukan waktu server (GitHub Actions = UTC)
WIB = datetime.timezone(datetime.timedelta(hours=8))
import json
import os
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
import warnings
from rich.console import Console
from rich.table import Table
from config import (
    AW_API_KEY, AW_LOCATION_KEY, FIREBASE_DB_URL, SERVICE_ACCOUNT_KEY,
    BASE_DIR, DATASET_PATH, MODEL_PATH, FEATURES, TARGET_COL,
    TIME_STEPS, SOIL_MOISTURE_SATURATION, OFFLINE_THRESHOLD_MS, DAILY_RUN_TIME
)

console = Console()
warnings.filterwarnings("ignore")

# ==========================================
# INISIALISASI MODEL LSTM & SCALER
# ==========================================
base_dir = BASE_DIR
try:
    # Disable TF warnings for cleaner logs
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2' 
    from tensorflow.keras.models import load_model
    
    console.print("[yellow][*] Menyiapkan Scaler dari dataset_sawah_cleaned.csv...[/yellow]")
    df_clean = pd.read_csv(DATASET_PATH)
    features = FEATURES
    
    feature_scaler = MinMaxScaler(feature_range=(0, 1))
    feature_scaler.fit(df_clean[features])
    
    target_scaler = MinMaxScaler(feature_range=(0, 1))
    target_scaler.fit(df_clean[[TARGET_COL]])
    
    console.print("[yellow][*] Memuat Model LSTM...[/yellow]")
    lstm_model = load_model(MODEL_PATH)
    console.print("[bold green][+] Model AI LSTM dan Scaler berhasil dimuat![/bold green]")
except Exception as e:
    lstm_model = None
    console.print(f"[bold red][-] Gagal memuat Model AI LSTM: {e}[/bold red]")

# AccuWeather and Firebase config loaded from config.py

# ==========================================
# INISIALISASI FIREBASE ADMIN
# ==========================================
# PERHATIAN: Anda wajib mendownload "serviceAccountKey.json" dari Firebase Console!
try:
    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
    firebase_admin.initialize_app(cred, {
        'databaseURL': FIREBASE_DB_URL
    })
    print("[+] Firebase berhasil terhubung.")
except Exception as e:
    print(f"[-] Gagal terhubung ke Firebase: {e}")
    print("Pastikan file serviceAccountKey.json berada di folder yang sama!")
    exit(1)

def fetch_and_store_weather():
    """Mengambil data dari AccuWeather dan menyimpannya sebagai data historis"""
    now_wib = datetime.datetime.now(WIB)
    print(f"[{now_wib.strftime('%Y-%m-%d %H:%M:%S')} WIB] Memulai penarikan data cuaca...")
    url = f"https://dataservice.accuweather.com/forecasts/v1/daily/5day/{AW_LOCATION_KEY}?apikey={AW_API_KEY}&metric=true&details=true"
    
    try:
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            today_date = now_wib.strftime("%Y-%m-%d")
            
            # Simpan ke node historical_weather/YYYY-MM-DD
            db.reference(f'historical_weather/{today_date}').set(data)
            
            # Update juga node cuaca terbaru agar web dashboard bisa membacanya tanpa panggil API
            db.reference('weather_forecast').set({
                'timestamp': int(time.time() * 1000),
                'updated_at': datetime.datetime.now().isoformat(),
                'forecast_data': data,
                'source': 'python_backend'
            })
            print(f"[+] Data cuaca {today_date} berhasil disimpan ke database.")
            return data
        else:
            print(f"[-] Gagal mengambil cuaca HTTP {response.status_code}")
            return None
    except Exception as e:
        print(f"[-] Error jaringan saat fetch cuaca: {e}")
        return None

def run_lstm_prediction():
    """Menarik data historis dari Firebase, memproses LSTM, lalu push hasilnya"""
    now_wib = datetime.datetime.now(WIB)
    print(f"[{now_wib.strftime('%Y-%m-%d %H:%M:%S')} WIB] Memulai perhitungan AI LSTM...")
    
    try:
        # 1. Ambil daftar semua sawah yang terdaftar di Firebase
        fields = db.reference('fields').get()
        if not fields:
            print("[-] Tidak ada data sawah di database (fields kosong).")
            return

        today_date = now_wib.strftime("%Y-%m-%d")
        
        # 2. Ambil seluruh sensor_data untuk cross-check
        all_sensor_data = db.reference('sensor_data').get() or {}
        
        # Inisialisasi Tabel Output yang Menarik
        table = Table(title=f"Laporan AI Irigasi: {today_date}", show_header=True, header_style="bold magenta")
        table.add_column("Sawah", style="cyan", width=20)
        table.add_column("Umur (Fase)", justify="center", style="blue")
        table.add_column("Status IoT", justify="center")
        table.add_column("Prediksi Air (mm)", justify="right", style="green")
        table.add_column("Total Liter", justify="right", style="yellow")
        table.add_column("Rekomendasi Pompa", justify="center", style="bold")
        
        for field_id, field_data in fields.items():
            field_name = field_data.get('name', field_id)
            device_id = field_data.get('device_id', None)
            
            # CEK KEHADIRAN & KEBARUAN DATA SENSOR
            is_offline = True
            
            if device_id and device_id in all_sensor_data:
                sensor = all_sensor_data[device_id]
                # Ambil timestamp dari Firebase (dalam milidetik)
                last_update = sensor.get('timestamp', 0)
                current_time = int(time.time() * 1000)
                
                # Cek apakah selisih waktu lebih dari 2 jam (2 * 60 * 60 * 1000 ms)
                if (current_time - last_update) < OFFLINE_THRESHOLD_MS:
                    is_offline = False # Data masih segar (alat online)

            if is_offline:
                iot_status = "[red]OFFLINE (Simulasi)[/red]"
                import random as rnd 
                sensor = {
                    'temperature': rnd.uniform(28.0, 34.0),
                    'humidity': rnd.uniform(60.0, 85.0),
                    'soil_moisture': rnd.uniform(30.0, 60.0)
                }
            else:
                iot_status = "[green]ONLINE (Real)[/green]"
                # Ambil Data Real-time Sensor Asli karena alat terbukti sedang menyala
                sensor = all_sensor_data[device_id]
            suhu = float(sensor.get('temperature', 30.0))
            hum = float(sensor.get('humidity', 70.0))
            soil = float(sensor.get('soil_moisture', 50.0))
            
            # 2. Ambil ramalan cuaca 5 hari
            today_weather = db.reference(f'historical_weather/{today_date}').get()
            
            predictions_5_days = []
            
            # --- BASE CROP LOGIC ---
            k_c_base = 1.0
            umur_tanaman_hari_base = 0
            plant_date_str = field_data.get('plant_date', '')
            plant_method = field_data.get('plant_method', 'tanam_pindah')
            if plant_date_str:
                try:
                    plant_date_obj = datetime.datetime.strptime(plant_date_str, "%Y-%m-%d").date()
                    today_obj = now_wib.date()
                    umur_tanaman_hari_base = (today_obj - plant_date_obj).days
                    if umur_tanaman_hari_base < 0:
                        umur_tanaman_hari_base = 0
                except:
                    pass

            # Loop untuk 5 hari ke depan
            for i in range(5):
                # 1. Tanggal prediksi (Hari ke-i)
                target_date_obj = now_wib + datetime.timedelta(days=i)
                target_date_str = target_date_obj.strftime("%Y-%m-%d")
                
                # 2. Ambil curah hujan & suhu dari ramalan hari ke-i
                rain_i = 0.0
                suhu_i = suhu
                if today_weather and 'DailyForecasts' in today_weather and i < len(today_weather['DailyForecasts']):
                    try:
                        day_forecast = today_weather['DailyForecasts'][i]
                        rain_data = day_forecast['Day'].get('Rain', {})
                        rain_i = float(rain_data.get('Value', 0.0))
                        
                        # Update suhu dari ramalan jika ada
                        temp_min = float(day_forecast['Temperature']['Minimum']['Value'])
                        temp_max = float(day_forecast['Temperature']['Maximum']['Value'])
                        suhu_i = (temp_min + temp_max) / 2.0
                    except:
                        pass
                
                # 3. Hitung umur tanaman dan Kc untuk hari ke-i
                umur_hari_i = umur_tanaman_hari_base + i
                umur_efektif_i = umur_hari_i + 20 if plant_method == 'tanam_pindah' else umur_hari_i
                
                k_c_i = 1.0
                fase_tumbuh_i = "Tidak Diketahui"
                if umur_efektif_i <= 30:
                    k_c_i = 1.05
                    fase_tumbuh_i = "Vegetatif Awal"
                elif umur_efektif_i <= 60:
                    k_c_i = 1.20
                    fase_tumbuh_i = "Vegetatif Aktif"
                elif umur_efektif_i <= 90:
                    k_c_i = 1.00
                    fase_tumbuh_i = "Generatif (Berbunga)"
                else:
                    k_c_i = 0.0
                    fase_tumbuh_i = "Pematangan (Panen)"
                    
                # 4. Prediksi AI
                ai_output_mm_i = 5.0
                if lstm_model is not None:
                    # Sanity check: di hari ke-0 pakai soil moisture aktual
                    # Untuk hari > 0 asumsikan soil moisture stabil/simulasi, namun threshold ini tetap aman
                    if soil >= SOIL_MOISTURE_SATURATION and i == 0:
                        ai_output_mm_i = 0.0
                    else:
                        try:
                            # input: suhu ramalan, kelembaban udara saat ini, soil saat ini, curah hujan ramalan
                            # Catatan: soil kelembaban tanah di asumsikan konstan untuk prediksi kebutuhan air 
                            # berdasarkan curah hujan ramalan
                            input_raw = pd.DataFrame([[suhu_i, hum, soil, rain_i]], columns=features)
                            input_scaled = feature_scaler.transform(input_raw)
                            seq = np.array([input_scaled[0], input_scaled[0], input_scaled[0]])
                            seq = np.expand_dims(seq, axis=0)
                            pred_scaled = lstm_model.predict(seq, verbose=0)
                            pred_asli = target_scaler.inverse_transform(pred_scaled)
                            ai_output_mm_i = float(pred_asli[0][0])
                        except Exception as e:
                            console.print(f"[yellow][!] Gagal prediksi LSTM hari ke-{i+1}: {e}, fallback ke 5.0mm[/yellow]")
                            
                ai_output_mm_i = round(max(ai_output_mm_i, 0), 2)
                ai_output_mm_i = round(ai_output_mm_i * k_c_i, 2)
                
                luas_m2 = field_data.get('size_m2', 1)
                total_liter = round(ai_output_mm_i * luas_m2, 2)
                status_pompa = "ON" if ai_output_mm_i > 5.0 else "OFF"
                
                prediction_payload = {
                    'timestamp': int(time.time() * 1000),
                    'date': target_date_str,
                    'hari_ke': i + 1,
                    'field_name': field_name,
                    'ai_depth_mm': ai_output_mm_i,
                    'umur_tanaman_hari': umur_hari_i,
                    'fase_tumbuh': fase_tumbuh_i,
                    'kebutuhan_air_liter': total_liter,
                    'rekomendasi_pompa': status_pompa,
                    'status': 'success'
                }
                
                predictions_5_days.append(prediction_payload)

            # Simpan 5 hari ke Firebase
            # Simpan prediksi 5 hari sebagai node terpisah (day_1 s/d day_5)
            # agar kompatibel dengan Firebase yang tidak mendukung array integer key
            for idx, pred in enumerate(predictions_5_days):
                db.reference(f'ai_predictions/{field_id}/day_{idx + 1}').set(pred)

            # Simpan juga node 'latest' (hari ini) untuk backward compatibility
            db.reference(f'ai_predictions/{field_id}/latest').set(predictions_5_days[0])
            db.reference(f'ai_predictions/{field_id}/history/{today_date}').set(predictions_5_days[0])
            
            # Warnai status pompa untuk tabel log CLI (hari ke 1 saja)
            p_today = predictions_5_days[0]
            pompa_styled = f"[white on green] {p_today['rekomendasi_pompa']} [/]" if p_today['rekomendasi_pompa'] == "ON" else f"[white on red] {p_today['rekomendasi_pompa']} [/]"
            
            table.add_row(
                field_name,
                f"{p_today['umur_tanaman_hari']} Hr ({p_today['fase_tumbuh']})",
                iot_status,
                f"{p_today['ai_depth_mm']} mm",
                f"{p_today['kebutuhan_air_liter']:,.1f} L",
                pompa_styled
            )

        console.print(table)
        
    except Exception as e:
        console.print(f"[bold red][-] Terjadi kesalahan saat memproses LSTM: {e}[/bold red]")


prediction_lock = threading.Lock()
is_first_trigger_check = True

# ==========================================
# AGREGASI & CLEANUP SENSOR HISTORY HARIAN
# ==========================================
def aggregate_and_cleanup_sensor_history():
    """
    Hitung rata-rata harian dari data sensor per jam (sensor_history),
    simpan hasilnya ke sensor_daily_avg, lalu hapus data jam-an yang sudah diagregasi.
    Dipanggil otomatis setiap hari oleh daily_job().
    """
    now_wib = datetime.datetime.now(WIB)
    yesterday = (now_wib - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    console.print(f"[yellow][*] Memulai agregasi sensor history untuk tanggal {yesterday}...[/yellow]")

    try:
        # 1. Ambil seluruh sensor_history dari Firebase
        history_ref = db.reference('sensor_history/esp32_001')
        all_history = history_ref.get() or {}

        if not all_history:
            console.print("[yellow][!] Tidak ada data sensor_history untuk diagregasi.[/yellow]")
            return

        # 2. Filter hanya record dari hari kemarin
        yesterday_records = {}
        for push_id, record in all_history.items():
            if not isinstance(record, dict):
                continue
            ts_ms = record.get('timestamp', 0)
            try:
                # Guard: pastikan timestamp sudah diproses Firebase (integer/float)
                # Jika masih berupa dict {'.sv': 'timestamp'}, berarti belum diproses → skip
                if not isinstance(ts_ms, (int, float)) or ts_ms == 0:
                    console.print(f"[yellow][!] Record {push_id} dilewati: timestamp tidak valid ({type(ts_ms).__name__}: {ts_ms})[/yellow]")
                    continue
                # timestamp dari Firebase Server dalam milidetik → konversi ke detik
                dt = datetime.datetime.fromtimestamp(ts_ms / 1000, tz=WIB)
                if dt.strftime("%Y-%m-%d") == yesterday:
                    yesterday_records[push_id] = record
            except Exception as e:
                console.print(f"[yellow][!] Gagal parsing timestamp record {push_id}: {e}[/yellow]")
                continue

        if not yesterday_records:
            console.print(f"[yellow][!] Tidak ada record untuk tanggal {yesterday}, lewati agregasi.[/yellow]")
            return

        records = list(yesterday_records.values())
        n = len(records)

        # 3. Hitung rata-rata semua field numerik
        avg_humidity     = sum(float(r.get('humidity',      0)) for r in records) / n
        avg_temperature  = sum(float(r.get('temperature',   0)) for r in records) / n
        avg_soil         = sum(float(r.get('soil_moisture', 0)) for r in records) / n

        # 4. Simpan rata-rata harian ke node baru
        db.reference(f'sensor_daily_avg/esp32_001/{yesterday}').set({
            'date':           yesterday,
            'humidity':       round(avg_humidity,    2),
            'temperature':    round(avg_temperature, 2),
            'soil_moisture':  round(avg_soil,        2),
            'sample_count':   n,
            'aggregated_at':  int(time.time() * 1000)
        })
        console.print(f"[green][+] Rata-rata harian {yesterday} tersimpan ({n} sampel): "
                      f"Suhu={round(avg_temperature,2)}°C, "
                      f"Humidity={round(avg_humidity,2)}%, "
                      f"Soil={round(avg_soil,2)}%[/green]")

        # 5. Hapus record per jam yang sudah diagregasi
        deleted = 0
        for push_id in yesterday_records.keys():
            history_ref.child(push_id).delete()
            deleted += 1

        console.print(f"[green][+] {deleted} record sensor_history kemarin berhasil dihapus.[/green]")

    except Exception as e:
        console.print(f"[bold red][-] Gagal agregasi sensor history: {e}[/bold red]")


def daily_job():
    """Fungsi yang akan dijalankan otomatis setiap hari"""
    with prediction_lock:
        fetch_and_store_weather()
        # aggregate_and_cleanup_sensor_history()  # Agregasi & cleanup data sensor per jam
        run_lstm_prediction()
        
        # Reset trigger status di Firebase agar frontend tidak stuck 'loading'
        try:
            db.reference('prediction_trigger').update({
                'status': 'success',
                'completed_at': int(time.time() * 1000)
            })
        except Exception as e:
            console.print(f"[bold red][-] Gagal update status trigger: {e}[/bold red]")

def handle_prediction_trigger(event):
    """
    Callback dari Firebase Admin SDK .listen().
    event.path  = path relatif dalam ref (misal '/' untuk seluruh node, '/status' untuk sub-key)
    event.data  = nilai pada path tersebut
    event.event_type = 'put' atau 'patch'
    """
    global is_first_trigger_check
    
    if event.data is None:
        return

    # Tentukan apakah status = 'pending'
    status = None
    if event.path == '/' and isinstance(event.data, dict):
        # Seluruh node ditulis ulang (ini yang terjadi saat frontend memanggil .set())
        status = event.data.get('status')
    elif event.path == '/status':
        # Hanya field 'status' yang berubah (ini terjadi saat backend memanggil .update())
        status = event.data

    # Hiraukan pembacaan pertama (initial sync) dari Firebase SDK,
    # kecuali statusnya memang 'pending' (trigger tertunda saat server offline)
    if is_first_trigger_check:
        is_first_trigger_check = False
        if status != 'pending':
            return

    # Hanya proses jika status berubah menjadi 'pending'
    if status == 'pending':
        console.print("\n[bold cyan][*] Menerima trigger prediksi ulang dari Frontend![/bold cyan]")
        
        # Ubah status menjadi 'running'
        db.reference('prediction_trigger').update({
            'status': 'running'
        })
        
        # Jalankan prediksi dengan aman menggunakan lock
        try:
            with prediction_lock:
                fetch_and_store_weather()
                run_lstm_prediction()
            
            # Update status sukses
            db.reference('prediction_trigger').update({
                'status': 'success',
                'completed_at': int(time.time() * 1000)
            })
            console.print("[bold green][+] Prediksi ulang selesai dikerjakan![/bold green]")
        except Exception as e:
            db.reference('prediction_trigger').update({
                'status': 'error',
                'error_message': str(e),
                'completed_at': int(time.time() * 1000)
            })
            console.print(f"[bold red][-] Gagal memproses prediksi ulang: {e}[/bold red]")

# ==========================================
# SCHEDULER UTAMA
# ==========================================
if __name__ == "__main__":
    console.rule("[bold cyan]SMART AGRICULTURE - AI BACKEND ENGINE[/bold cyan]")

    # RUN_MODE: "once" → jalankan sekali lalu keluar (GitHub Actions)
    #           "schedule" → loop terus (server lokal / Railway)
    run_mode = os.environ.get("RUN_MODE", "once")

    if run_mode == "once":
        console.print("[bold green][*] Mode: Satu Kali Eksekusi (GitHub Actions)[/bold green]")
        daily_job()
        console.print("[bold green][+] Eksekusi selesai.[/bold green]")
    else:
        console.print(f"[bold green][*] Mode: Server — Jadwal harian jam {DAILY_RUN_TIME}[/bold green]")
        
        # Mulai mendengarkan trigger dari Firebase Realtime Database
        console.print("[bold green][*] Menyalakan listener Firebase untuk trigger prediksi ulang...[/bold green]")
        db.reference('prediction_trigger').listen(handle_prediction_trigger)
        
        schedule.every().day.at(DAILY_RUN_TIME).do(daily_job)
        daily_job()  # Jalankan sekali langsung saat start
        while True:
            schedule.run_pending()
            time.sleep(1)