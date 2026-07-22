import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
import matplotlib.pyplot as plt
import math

# ==========================================
# 1. PERSIAPAN DATASET
# ==========================================
# Ganti nama file ini dengan dataset asli Anda.
# Format kolom yang disarankan: Tanggal, Suhu, Kelembapan_Udara, Kelembapan_Tanah, Curah_Hujan, Target_Kebutuhan_Air_mm
print("[1] Membaca Dataset Asli dari Kaggle...")
df = pd.read_csv("dataset_sawah_apr_jun_2026.csv", index_col="Tanggal", parse_dates=True)

# Pastikan urutan berdasar tanggal
df = df.sort_index()

print(f"Dataset berhasil dimuat dengan {len(df)} baris!")

# ==========================================
# 2. PREPROCESSING (NORMALISASI)
# ==========================================
print("[2] Melakukan Normalisasi Data...")
# LSTM sangat sensitif terhadap skala angka, wajib dinormalisasi ke skala 0 - 1
features = ['Suhu', 'Kelembapan_Udara', 'Kelembapan_Tanah', 'Curah_Hujan']
target_col = ['Target_Kebutuhan_Air_mm']

feature_scaler = MinMaxScaler(feature_range=(0, 1))
target_scaler = MinMaxScaler(feature_range=(0, 1))

scaled_features = feature_scaler.fit_transform(df[features])
scaled_target = target_scaler.fit_transform(df[target_col])

# ==========================================
# 3. PEMBAGIAN DATA (TRAIN, VAL, TEST)
# ==========================================
# Berapa hari ke belakang yang ingin dilihat LSTM untuk memprediksi hari ini?
time_steps = 3 

def create_sequences(features_data, target_data, time_steps):
    X, y = [], []
    for i in range(len(features_data) - time_steps):
        X.append(features_data[i:(i + time_steps)])
        y.append(target_data[i + time_steps])
    return np.array(X), np.array(y)

X, y = create_sequences(scaled_features, scaled_target, time_steps)

# Split Formal: 70% Train, 15% Validation, 15% Test
train_idx = int(len(X) * 0.7)
val_idx = int(len(X) * 0.85)

X_train, y_train = X[:train_idx], y[:train_idx]
X_val, y_val     = X[train_idx:val_idx], y[train_idx:val_idx]
X_test, y_test   = X[val_idx:], y[val_idx:]

print(f"Data Latih (Train)   : {X_train.shape[0]} hari")
print(f"Data Validasi (Val)  : {X_val.shape[0]} hari")
print(f"Data Uji (Test)      : {X_test.shape[0]} hari")

# ==========================================
# 4. PROSES PELATIHAN (LOOPING 5 KALI)
# ==========================================
all_mae = []
all_rmse = []

print(f"\n[!] Memulai Prosedur Pelatihan Lanjut (5 Iterasi)...")

for i in range(1, 6):
    print(f"\n>>> ITERASI KE-{i} <<<")
    
    # Membangun Arsitektur LSTM (Harus dibuat ulang di tiap loop agar bersih)
    model = Sequential()
    model.add(LSTM(units=50, return_sequences=True, input_shape=(X_train.shape[1], X_train.shape[2])))
    model.add(Dropout(0.2))
    model.add(LSTM(units=50, return_sequences=False))
    model.add(Dropout(0.2))
    model.add(Dense(units=1))
    model.compile(optimizer='adam', loss='mean_squared_error')

    # Pelatihan
    history = model.fit(
        X_train, y_train,
        epochs=10, # Kita kurangi ke 10 epoch per loop agar tidak terlalu lama (total 50 epoch)
        batch_size=16,
        validation_data=(X_val, y_val),
        verbose=1
    )

    # Evaluasi pada Data Test (Unseen Data)
    predictions_scaled = model.predict(X_test, verbose=0)
    predictions_asli = target_scaler.inverse_transform(predictions_scaled)
    y_test_asli = target_scaler.inverse_transform(y_test)

    mae = mean_absolute_error(y_test_asli, predictions_asli)
    rmse = math.sqrt(mean_squared_error(y_test_asli, predictions_asli))
    
    all_mae.append(mae)
    all_rmse.append(rmse)
    
    # Simpan model terbaik (misal iterasi terakhir)
    if i == 5:
        model.save('model_lstm_apr_jun.h5')
        # Simpan grafik terakhir
        plt.figure(figsize=(10, 5))
        plt.plot(history.history['loss'], label='Training Loss')
        plt.plot(history.history['val_loss'], label='Validation Loss')
        plt.title(f'Grafik Loss Iterasi ke-{i}')
        plt.legend()
        plt.savefig('grafik_loss.png')

# ==========================================
# 5. OUTPUT FINAL (SETELAH 5 KALI LOOP)
# ==========================================
print("\n" + "="*45)
print("       REKAPITULASI PELATIHAN AI (5 LOOP)      ")
print("="*45)
print(f"{'Iterasi':<15} | {'MAE (mm)':<12} | {'RMSE (mm)':<12}")
print("-" * 45)
for idx, (m, r) in enumerate(zip(all_mae, all_rmse)):
    print(f"Iterasi {idx+1:<8} | {m:<12.4f} | {r:<12.4f}")
print("-" * 45)
print(f"RATA-RATA       | {np.mean(all_mae):<12.4f} | {np.mean(all_rmse):<12.4f}")
print("="*45)
print("[+] Selesai! Model final disimpan sebagai 'model_lstm_apr_jun.h5'")
