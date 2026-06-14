import firebase_admin
from firebase_admin import credentials, db
import requests
import schedule
import time
import datetime

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
    url = f"https://dataservice.accuweather.com/forecasts/v1/daily/5day/{AW_LOCATION_KEY}?apikey={AW_API_KEY}&metric=true"
    
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
            
            # 2. Ambil data Curah Hujan dari AccuWeather hari ini
            rain = 0.0
            today_weather = db.reference(f'historical_weather/{today_date}').get()
            if today_weather and 'DailyForecasts' in today_weather:
                try:
                    # Ambil curah hujan dari ramalan hari ini (index 0)
                    rain_data = today_weather['DailyForecasts'][0]['Day'].get('Rain', {})
                    rain = float(rain_data.get('Value', 0.0))
                except Exception as e:
                    print(f"    [-] Gagal membaca curah hujan: {e}")
                    
            ai_output_mm = 5.0 # Nilai Default (Fallback)
            
            # --- HITUNG UMUR TANAMAN & CROP COEFFICIENT (Kc) ---
            k_c = 1.0
            umur_tanaman_hari = 0
            fase_tumbuh = "Tidak Diketahui"
            plant_date_str = field_data.get('plant_date', '')
            plant_method = field_data.get('plant_method', 'tanam_pindah')
            
            if plant_date_str:
                try:
                    plant_date_obj = datetime.datetime.strptime(plant_date_str, "%Y-%m-%d").date()
                    today_obj = now_wib.date()
                    umur_tanaman_hari = (today_obj - plant_date_obj).days
                    
                    if umur_tanaman_hari < 0:
                        umur_tanaman_hari = 0
                        
                    # Tambah umur jika tanam pindah (bibit biasanya berumur 20 hari saat dipindah)
                    umur_efektif = umur_tanaman_hari + 20 if plant_method == 'tanam_pindah' else umur_tanaman_hari
                        
                    # Fase Pertumbuhan Padi & Nilai Kc (FAO)
                    if umur_efektif <= 30:
                        k_c = 1.05
                        fase_tumbuh = "Vegetatif Awal"
                    elif umur_efektif <= 60:
                        k_c = 1.20
                        fase_tumbuh = "Vegetatif Aktif"
                    elif umur_efektif <= 90:
                        k_c = 1.00
                        fase_tumbuh = "Generatif (Berbunga)"
                    else:
                        k_c = 0.0 # Pematangan (Sawah harus dikeringkan)
                        fase_tumbuh = "Pematangan (Panen)"
                except Exception as e:
                    print(f"    [-] Error menghitung umur tanaman: {e}")
            
            
            # 3. Prediksi Menggunakan AI
            if lstm_model is not None:
                # SANITY CHECK: Cegah AI kebingungan (halusinasi) karena dataset pelatihan 
                # memiliki nilai maksimal kelembaban tanah 64.88%. 
                # Jika sensor membaca > 65%, berarti sangat basah, langsung set 0 tanpa pikir panjang.
                if soil >= SOIL_MOISTURE_SATURATION:
                    ai_output_mm = 0.0
                else:
                    try:
                        # Skalakan data input
                        input_raw = pd.DataFrame([[suhu, hum, soil, rain]], columns=features)
                        input_scaled = feature_scaler.transform(input_raw)
                        
                        # Buat format sequence 3 time-steps (karena model dilatih dgn time_steps=3)
                        seq = np.array([input_scaled[0], input_scaled[0], input_scaled[0]])
                        seq = np.expand_dims(seq, axis=0) # shape menjadi (1, 3, 4)
                        
                        # Lakukan prediksi
                        pred_scaled = lstm_model.predict(seq, verbose=0)
                        
                        # Kembalikan skala hasil prediksi ke nilai asli (mm)
                        pred_asli = target_scaler.inverse_transform(pred_scaled)
                        ai_output_mm = float(pred_asli[0][0])
                    except Exception as e:
                        print(f"    [-] Error saat prediksi LSTM: {e}")
            
            # Bulatkan dan pastikan tidak minus
            ai_output_mm = round(max(ai_output_mm, 0), 2)
            
            # Terapkan Crop Coefficient (Kc) berdasarkan Fase Umur Tanaman
            ai_output_mm = round(ai_output_mm * k_c, 2)
            
            # 4. Perhitungan Aktual: Volume Liter = Kedalaman (mm) x Luas Area (m²)
            luas_m2 = field_data.get('size_m2', 1)
            total_liter = round(ai_output_mm * luas_m2, 2)
            
            # Logika Pompa berdasarkan ambang batas AI (misal pompa menyala jika AI menyarankan > 5mm air)
            status_pompa = "ON" if ai_output_mm > 5.0 else "OFF"
            # -------------------------------------------------------------
            
            prediction_payload = {
                'timestamp': int(time.time() * 1000),
                'date': today_date,
                'field_name': field_name,
                'ai_depth_mm': ai_output_mm,
                'umur_tanaman_hari': umur_tanaman_hari,
                'fase_tumbuh': fase_tumbuh,
                'kebutuhan_air_liter': total_liter,
                'rekomendasi_pompa': status_pompa,
                'status': 'success'
            }
            
            # Simpan spesifik untuk ID sawah ini
            db.reference(f'ai_predictions/{field_id}/latest').set(prediction_payload)
            db.reference(f'ai_predictions/{field_id}/history/{today_date}').set(prediction_payload)
            
            # Warnai status pompa
            pompa_styled = f"[white on green] {status_pompa} [/]" if status_pompa == "ON" else f"[white on red] {status_pompa} [/]"
            
            table.add_row(
                field_name,
                f"{umur_tanaman_hari} Hr ({fase_tumbuh})",
                iot_status,
                f"{ai_output_mm} mm",
                f"{total_liter:,.1f} L",
                pompa_styled
            )

        console.print(table)
        
    except Exception as e:
        console.print(f"[bold red][-] Terjadi kesalahan saat memproses LSTM: {e}[/bold red]")


def daily_job():
    """Fungsi yang akan dijalankan otomatis setiap hari"""
    fetch_and_store_weather()
    run_lstm_prediction()

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
        schedule.every().day.at(DAILY_RUN_TIME).do(daily_job)
        daily_job()  # Jalankan sekali langsung saat start
        while True:
            schedule.run_pending()
            time.sleep(60)

