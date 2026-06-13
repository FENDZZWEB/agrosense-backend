"""
AgroSense — Backend Configuration
Single source of truth for Python backend scripts.
"""

import os

# AccuWeather API Configuration
AW_API_KEY = os.environ.get("AW_API_KEY", "")  # Set via GitHub Secrets / env variable
AW_LOCATION_KEY = os.environ.get("AW_LOCATION_KEY", "3482444")  # Desa Andoolo Utama, Konawe Selatan

# Firebase Configuration
FIREBASE_DB_URL = "https://smartagriculture-1a4d6-default-rtdb.asia-southeast1.firebasedatabase.app/"
SERVICE_ACCOUNT_KEY = os.environ.get("FIREBASE_KEY_PATH", "serviceAccountKey.json")

# Paths — model & dataset sekarang ada di dalam folder backend/
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATASET_PATH = os.path.join(BASE_DIR, "dataset_sawah_cleaned.csv")
MODEL_PATH = os.path.join(BASE_DIR, "model_lstm_sawah.h5")

# LSTM Configuration
FEATURES = ['Suhu', 'Kelembapan_Udara', 'Kelembapan_Tanah', 'Curah_Hujan']
TARGET_COL = 'Target_Kebutuhan_Air_mm'
TIME_STEPS = 3
SOIL_MOISTURE_SATURATION = 65.0  # Above this % = saturated, no irrigation needed
OFFLINE_THRESHOLD_MS = 2 * 60 * 60 * 1000  # 2 hours

# Schedule
DAILY_RUN_TIME = "06:00"
