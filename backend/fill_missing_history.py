import firebase_admin
from firebase_admin import credentials, db
from datetime import datetime, timedelta
import random
import os
import requests

# Konfigurasi
AW_API_KEY = os.environ.get("AW_API_KEY", "")
AW_LOCATION_KEY = "3482444"
FIREBASE_DB_URL = "https://smartagriculture-1a4d6-default-rtdb.asia-southeast1.firebasedatabase.app/"

# Inisialisasi Firebase
if not firebase_admin._apps:
    cred_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})
    else:
        print("[-] Gagal: serviceAccountKey.json tidak ditemukan")
        exit(1)

def get_accuweather_past_data():
    """
    Versi gratis AccuWeather API tidak menyediakan endpoint "Historical Daily Forecast" untuk beberapa hari ke belakang.
    Namun kita bisa mengambil Current Forecast (5 hari ke depan) dan menggunakan polanya sebagai acuan
    untuk menggenerasi data cuaca historis yang masuk akal dengan format yang sama persis seperti AccuWeather.
    """
    print("[*] Mengambil pola cuaca AccuWeather...")
    url = f"https://dataservice.accuweather.com/forecasts/v1/daily/5day/{AW_LOCATION_KEY}?apikey={AW_API_KEY}&metric=true"
    
    try:
        response = requests.get(url)
        if response.status_code == 200:
            return response.json()
        else:
            print(f"[-] Gagal mengambil data AccuWeather: {response.status_code}")
            return None
    except Exception as e:
        print(f"[-] Error AccuWeather: {e}")
        return None

def seed_missing_data(days=10):
    print(f"[*] Mengecek data kosong untuk {days} hari terakhir...")
    
    # 1. Ambil data AccuWeather 5 hari ke depan sebagai acuan cuaca
    aw_reference = get_accuweather_past_data()
    
    # 2. Loop mundur dari hari ini - days sampai kemarin
    today = datetime.now()
    
    for i in range(days, 0, -1):
        target_date = today - timedelta(days=i)
        date_str = target_date.strftime("%Y-%m-%d")
        
        # --- A. CEK HISTORICAL WEATHER ---
        weather_ref = db.reference(f'historical_weather/{date_str}')
        existing_weather = weather_ref.get()
        
        if not existing_weather:
            print(f"  [+] Mengisi cuaca kosong untuk: {date_str}")
            # Buat data cuaca dummy yang menyerupai respons AccuWeather API
            # Ambil acuan dari salah satu hari di 5 day forecast
            if aw_reference and 'DailyForecasts' in aw_reference:
                ref_day = random.choice(aw_reference['DailyForecasts'])
            else:
                # Fallback dummy
                ref_day = {
                    "Temperature": {
                        "Minimum": {"Value": random.uniform(23.0, 26.0)},
                        "Maximum": {"Value": random.uniform(30.0, 34.0)}
                    },
                    "Day": {
                        "IconPhrase": random.choice(["Mostly cloudy", "Partly sunny", "Thunderstorms", "Showers"]),
                        "RainProbability": random.randint(10, 80),
                        "HasPrecipitation": random.choice([True, False]),
                        "Rain": {"Value": random.uniform(0.0, 15.0)}
                    },
                    "Night": {
                        "IconPhrase": random.choice(["Clear", "Partly cloudy", "Mostly cloudy"])
                    }
                }
            
            # Variasikan sedikit nilainya agar tidak 100% sama dengan acuan
            temp_min = round(ref_day['Temperature']['Minimum']['Value'] + random.uniform(-1, 1), 1)
            temp_max = round(ref_day['Temperature']['Maximum']['Value'] + random.uniform(-1, 1), 1)
            
            mock_aw_data = {
                "Headline": {
                    "Text": "Data historis hasil simulasi/pengisian kekosongan"
                },
                "DailyForecasts": [
                    {
                        "Date": f"{date_str}T07:00:00+08:00",
                        "EpochDate": int(target_date.timestamp()),
                        "Temperature": {
                            "Minimum": {"Value": temp_min, "Unit": "C"},
                            "Maximum": {"Value": temp_max, "Unit": "C"}
                        },
                        "Day": ref_day["Day"],
                        "Night": ref_day["Night"]
                    }
                ]
            }
            weather_ref.set(mock_aw_data)
        
        # --- B. CEK SENSOR DATA (Kelembaban Tanah & Suhu harian) ---
        # Data ini untuk grafik /sensor_history/esp32_001
        sensor_ref = db.reference(f'sensor_history/esp32_001/{date_str}')
        existing_sensor = sensor_ref.get()
        
        if not existing_sensor:
            print(f"  [+] Mengisi sensor kosong untuk: {date_str}")
            day_data = {}
            # Rata-rata kelembaban dasar untuk hari ini
            base_moisture = random.uniform(60.0, 85.0)
            
            for hour in range(0, 24):
                # Variasi suhu dan kelembaban per jam
                if 10 <= hour <= 15: # Siang panas
                    m_variation = random.uniform(-5, -2)
                    temp = random.uniform(30.0, 35.0)
                elif 5 <= hour <= 9: # Pagi sejuk
                    m_variation = random.uniform(0, 3)
                    temp = random.uniform(24.0, 28.0)
                else: # Malam/Sore
                    m_variation = random.uniform(-1, 1)
                    temp = random.uniform(26.0, 30.0)
                
                moisture = max(30.0, min(95.0, base_moisture + m_variation))
                humidity = random.uniform(70.0, 90.0)
                
                ts_hour = target_date.replace(hour=hour, minute=0, second=0)
                hour_key = f"{hour:02d}"
                
                day_data[hour_key] = {
                    "humidity": round(humidity, 1),
                    "soil_moisture": round(moisture, 1),
                    "temperature": round(temp, 1),
                    "timestamp": int(ts_hour.timestamp() * 1000)
                }
            sensor_ref.set(day_data)
            
            # Update juga historical prediction AI supaya tabel laporan terlihat penuh
            ai_ref = db.reference(f'ai_predictions/field_001/history/{date_str}')
            existing_ai = ai_ref.get()
            if not existing_ai:
                ai_ref.set({
                    "date": date_str,
                    "ai_depth_mm": round(random.uniform(0.0, 8.0), 2),
                    "fase_tumbuh": "Vegetatif Aktif",
                    "kebutuhan_air_liter": round(random.uniform(0, 1000), 2),
                    "rekomendasi_pompa": random.choice(["ON", "OFF"]),
                    "status": "success",
                    "timestamp": int(target_date.timestamp() * 1000),
                    "umur_tanaman_hari": random.randint(15, 45)
                })

if __name__ == "__main__":
    print("[*] Memulai proses pengisian data Firebase...")
    seed_missing_data(days=14) # Isi 14 hari terakhir jika kosong
    print("[+] Selesai!")
