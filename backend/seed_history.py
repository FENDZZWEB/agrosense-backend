"""
AgroSense — Seed Historical Sensor Data
Mengisi data historis 7 hari terakhir ke Firebase untuk grafik kelembaban tanah.
Data ini mensimulasikan pola kelembaban sawah tadah hujan yang realistis.
Jalankan sekali saja.
"""

import firebase_admin
from firebase_admin import credentials, db
from datetime import datetime, timedelta
import random
import os

# Firebase setup
FIREBASE_DB_URL = "https://smartagriculture-1a4d6-default-rtdb.asia-southeast1.firebasedatabase.app"

# Cek jika sudah diinisialisasi
if not firebase_admin._apps:
    cred_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})
    else:
        firebase_admin.initialize_app(options={"databaseURL": FIREBASE_DB_URL})

ref = db.reference("sensor_history/esp32_001")

# Pola kelembaban sawah tadah hujan (realistis untuk Konawe Selatan)
# Kelembaban biasanya 60-95% tergantung cuaca dan irigasi
base_moisture = 78  # Rata-rata dasar

print("=" * 60)
print("  SEED DATA HISTORIS KELEMBABAN TANAH (7 Hari)")
print("=" * 60)

for day_offset in range(6, -1, -1):  # 6 hari lalu sampai hari ini
    target_date = datetime.now() - timedelta(days=day_offset)
    date_key = target_date.strftime("%Y-%m-%d")
    date_display = target_date.strftime("%d %b %Y")
    
    # Variasi harian: kelembaban berubah ±5-15% antar hari
    daily_variation = random.uniform(-8, 10)
    daily_base = base_moisture + daily_variation
    daily_base = max(45, min(95, daily_base))  # Clamp 45-95%
    
    day_data = {}
    hours_to_fill = range(6, 23) if day_offset > 0 else range(6, datetime.now().hour + 1)
    
    for hour in hours_to_fill:
        # Pola diurnal: lebih kering di siang hari (10-14), lebih basah di pagi/sore
        if 10 <= hour <= 14:
            hour_variation = random.uniform(-5, -1)  # Siang lebih kering
        elif 6 <= hour <= 9:
            hour_variation = random.uniform(1, 5)     # Pagi lebih basah (embun)
        else:
            hour_variation = random.uniform(-2, 3)     # Sore-malam stabil
        
        moisture = daily_base + hour_variation
        moisture = max(35, min(98, moisture))
        moisture = round(moisture, 1)
        
        # Suhu: lebih tinggi di siang hari
        if 11 <= hour <= 15:
            temp = round(random.uniform(30, 35), 1)
        elif 6 <= hour <= 10:
            temp = round(random.uniform(25, 29), 1)
        else:
            temp = round(random.uniform(27, 32), 1)
        
        # Kelembaban udara
        humidity = round(random.uniform(70, 95), 1)
        
        hour_key = str(hour).zfill(2)
        ts = int((target_date.replace(hour=hour, minute=0, second=0)).timestamp() * 1000)
        
        day_data[hour_key] = {
            "soil_moisture": moisture,
            "temperature": temp,
            "humidity": humidity,
            "timestamp": ts
        }
    
    ref.child(date_key).set(day_data)
    
    # Hitung rata-rata hari ini
    avg_moisture = sum(d["soil_moisture"] for d in day_data.values()) / len(day_data)
    print(f"  [{date_display}] {len(day_data)} entry | Rata-rata: {avg_moisture:.1f}%")

print()
print("[+] Selesai! Data historis 7 hari berhasil ditanam ke Firebase.")
print("    Refresh dashboard untuk melihat grafik 7 hari.")
