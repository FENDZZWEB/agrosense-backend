/**
 * AgroSense — Centralized Configuration
 * Single source of truth for Firebase, API keys, and app constants.
 */

// Firebase Configuration
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBBrXLYyXgkKQflR8uS10ubAmVhF76pKzE",
    authDomain: "smartagriculture-1a4d6.firebaseapp.com",
    databaseURL: "https://smartagriculture-1a4d6-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "smartagriculture-1a4d6",
    storageBucket: "smartagriculture-1a4d6.firebasestorage.app",
    messagingSenderId: "100171530379",
    appId: "1:100171530379:web:1efa7682beb455e5c8d48e",
    measurementId: "G-VQ1NDLMKQ1"
};

// AccuWeather API Configuration
// ⚠️ API Key diatur melalui GitHub Secrets untuk backend Python.
// Untuk development lokal, isi manual di bawah ini.
const AW_API_KEY = "MASUKKAN_API_KEY_DISINI_UNTUK_DEV_LOKAL";
const AW_LOCATION_KEY = "3482444"; // Desa Andoolo Utama, Konawe Selatan

// Application Constants
const APP_CONSTANTS = {
    ONLINE_THRESHOLD_MS: 5 * 60 * 1000,    // 5 minutes — device considered offline after this
    SENSORS_PER_DEVICE: 2,                   // DHT22 + FC-28
    WEATHER_CACHE_MS: 60 * 60 * 1000,       // 1 hour cache for AccuWeather (50 free req/day)
    MAX_CHART_POINTS: 10,                    // Max data points on soil moisture chart
    MAX_LOG_ENTRIES: 15,                     // Max visible log entries
    CRITICAL_MOISTURE_THRESHOLD: 40,         // Below this % = critical
    VERSION: "2.1"
};
