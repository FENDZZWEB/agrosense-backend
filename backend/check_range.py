import pandas as pd

df = pd.read_csv('../dataset_sawah_cleaned.csv')
print("Suhu:", df['Suhu'].min(), "-", df['Suhu'].max())
print("Kelembapan_Udara:", df['Kelembapan_Udara'].min(), "-", df['Kelembapan_Udara'].max())
print("Kelembapan_Tanah:", df['Kelembapan_Tanah'].min(), "-", df['Kelembapan_Tanah'].max())
print("Curah_Hujan:", df['Curah_Hujan'].min(), "-", df['Curah_Hujan'].max())
print("Target:", df['Target_Kebutuhan_Air_mm'].min(), "-", df['Target_Kebutuhan_Air_mm'].max())
