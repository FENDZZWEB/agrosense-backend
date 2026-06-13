import pandas as pd
import numpy as np

print("Membaca data dari Kaggle...")
df_kaggle = pd.read_csv("irrigation_prediction.csv")

# 1. Filter hanya untuk tanaman padi (Rice)
df_rice = df_kaggle[df_kaggle['Crop_Type'] == 'Rice'].copy()

# 2. Ambil hanya kolom yang kita butuhkan sesuai sensor
# Soil_Moisture, Temperature_C, Humidity, Rainfall_mm, Irrigation_Need
df_rice = df_rice[['Soil_Moisture', 'Temperature_C', 'Humidity', 'Rainfall_mm', 'Irrigation_Need']]

# 3. Ubah nama kolom agar sesuai dengan template kita
df_rice.rename(columns={
    'Soil_Moisture': 'Kelembapan_Tanah',
    'Temperature_C': 'Suhu',
    'Humidity': 'Kelembapan_Udara',
    'Rainfall_mm': 'Curah_Hujan'
}, inplace=True)

# 4. Konversi Target dari Teks (Low, Medium, High) menjadi Angka (mm)
# Karena LSTM kita memprediksi angka (Regresi), kita asumsikan:
# Low = 10 mm, Medium = 40 mm, High = 80 mm (Bisa disesuaikan dengan teori Agronomi)
def convert_target(val):
    if val == 'Low': return 10.0 + np.random.uniform(-5, 5) # Tambah sedikit variasi
    elif val == 'Medium': return 40.0 + np.random.uniform(-5, 5)
    elif val == 'High': return 80.0 + np.random.uniform(-5, 5)
    return 0.0

df_rice['Target_Kebutuhan_Air_mm'] = df_rice['Irrigation_Need'].apply(convert_target)
df_rice.drop(columns=['Irrigation_Need'], inplace=True) # Hapus kolom aslinya

# 5. Tambahkan kolom Tanggal palsu agar berurutan (Syarat Wajib LSTM)
# Karena dataset ini aslinya data acak per-wilayah, kita "sulap" seolah-olah ini data harian 1 sawah
dates = pd.date_range(start='2024-01-01', periods=len(df_rice), freq='D')
df_rice.index = dates
df_rice.index.name = 'Tanggal'

# Simpan ke CSV baru
df_rice.to_csv("dataset_sawah_cleaned.csv")
print(f"Selesai! Data berhasil dibersihkan dan disimpan sebagai 'dataset_sawah_cleaned.csv' dengan {len(df_rice)} baris.")
