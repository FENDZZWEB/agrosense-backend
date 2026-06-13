// ================================================================
// FIRMWARE ESP32 - MODE WIFI (Tanpa SIM Card)
// Mengirim data sensor ke Firebase Realtime Database via WiFi
// Board: TTGO T-Call ESP32 atau ESP32 Dev Module
// ================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <DHT.h>

// ================= KONFIGURASI WIFI =================
// Ganti dengan SSID dan Password WiFi Anda
const char* ssid     = "WINDY";       // Hotspot HP
const char* password = "11262530";    // ⚠️ GANTI dengan password WiFi Anda!

// ================= KONFIGURASI FIREBASE =================
// URL Firebase Realtime Database (gunakan https://)
const char* FIREBASE_HOST = "https://smartagriculture-1a4d6-default-rtdb.asia-southeast1.firebasedatabase.app";

// ================= PENGATURAN PIN SENSOR =================
// Sensor DHT22 (Suhu dan Kelembaban Udara)
#define DHTPIN 15          // Pin Data DHT22 dihubungkan ke GPIO 15
#define DHTTYPE DHT22      // Jenis DHT
DHT dht(DHTPIN, DHTTYPE);

// Sensor FC-28 (Kelembaban Tanah)
#define SOIL_MOISTURE_PIN 32  // Pin Analog FC-28 dihubungkan ke GPIO 32

// Nilai kalibrasi sensor kelembaban tanah
// Sesuaikan dengan pembacaan aktual sensor Anda:
// - dryValue: nilai analog saat probe di udara (kering)
// - wetValue: nilai analog saat probe dicelupkan air (basah)
const int dryValue = 4095;
const int wetValue = 1500;

// ================= PENGATURAN WAKTU =================
const int readInterval = 2000;   // Baca sensor tiap 2 detik untuk Serial Monitor
int postInterval = 30000;        // Kirim data ke Firebase tiap 30 detik (bisa berubah dinamis)
const unsigned long historyInterval = 3600000; // Simpan riwayat tiap 1 jam (3.600.000 ms)
unsigned long previousReadMillis = 0;
unsigned long previousPostMillis = 0;
unsigned long previousHistoryMillis = 0;
bool isFirstHistory = true;

// Variabel Global untuk menyimpan data terakhir
float currentTemperature = 0;
float currentHumidity = 0;
float currentSoilMoisture = 0;
int currentSoilAnalog = 0;
String currentSignalStr = "";

// ================= VARIABEL STATUS =================
int reconnectAttempts = 0;
const int maxReconnectAttempts = 10;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n========================================");
  Serial.println("  Smart Agriculture - Mode WiFi");
  Serial.println("  Sistem Monitoring Sawah Tadah Hujan");
  Serial.println("========================================\n");
  
  // Inisialisasi Sensor
  dht.begin();
  analogReadResolution(12); // Resolusi ADC ESP32: 12-bit (0-4095)
  
  // Mulai koneksi WiFi
  connectWiFi();
}

void connectWiFi() {
  // Pastikan disconnect dulu sebelum coba connect ulang
  WiFi.disconnect(true);
  delay(1000);
  WiFi.mode(WIFI_STA);
  delay(500);

  Serial.print("Menghubungkan ke WiFi: ");
  Serial.println(ssid);
  Serial.print("Password: ");
  // Tampilkan beberapa karakter password untuk verifikasi
  String passHint = String(password);
  if (passHint.length() > 2) {
    Serial.print(passHint.substring(0, 2));
    for (int i = 2; i < passHint.length(); i++) Serial.print("*");
  }
  Serial.println();
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    if (attempts > 0 && attempts % 10 == 0) {
      Serial.print(" (");
      Serial.print(attempts);
      Serial.print("/40)");
    }
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi Terhubung!");
    Serial.print("  IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("  Kekuatan Sinyal (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    reconnectAttempts = 0;
  } else {
    Serial.println("\n✗ Gagal terhubung ke WiFi!");
    Serial.print("  Status WiFi: ");
    Serial.println(WiFi.status());
    Serial.println("  Kode status: 1=SSID tidak ditemukan, 4=Gagal connect, 6=Password salah");
    Serial.println("  Mencoba ulang dalam 5 detik...");
    
    reconnectAttempts++;
    if (reconnectAttempts < maxReconnectAttempts) {
      delay(5000);
      connectWiFi();
    } else {
      Serial.println("  Batas percobaan tercapai. Restart ESP32...");
      delay(2000);
      ESP.restart();
    }
  }
}

void loop() {
  unsigned long currentMillis = millis();
  
  // Cek koneksi WiFi, reconnect jika terputus
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n⚠ WiFi terputus! Mencoba reconnect...");
    connectWiFi();
  }
  
  // ── 1. BACA SENSOR BERKALA (Tiap 2 Detik) ──
  if (currentMillis - previousReadMillis >= readInterval) {
    previousReadMillis = currentMillis;
    
    // Baca Sensor DHT22
    currentTemperature = dht.readTemperature();
    currentHumidity = dht.readHumidity();
    
    if (isnan(currentTemperature) || isnan(currentHumidity)) {
      Serial.println("⚠ Gagal membaca sensor DHT22! Cek koneksi.");
      currentTemperature = 0;
      currentHumidity = 0;
    }
    
    // Baca Sensor FC-28
    currentSoilAnalog = analogRead(SOIL_MOISTURE_PIN);
    currentSoilMoisture = map(currentSoilAnalog, dryValue, wetValue, 0, 100);
    currentSoilMoisture = constrain(currentSoilMoisture, 0, 100);
    
    // Baca Sinyal WiFi
    int wifiRSSI = WiFi.RSSI();
    currentSignalStr = "Sangat Baik";
    if (wifiRSSI < -80) currentSignalStr = "Lemah";
    else if (wifiRSSI < -60) currentSignalStr = "Cukup";
    else if (wifiRSSI < -40) currentSignalStr = "Baik";
    
    // --- LOGIKA UPLOAD DINAMIS (KONDISI KRITIS) ---
    // Jika kelembaban tanah kritis (di bawah atau sama dengan 10%), upload tiap 2 detik.
    // Jika sudah disiram dan basah (> 10%), kembali upload tiap 30 detik.
    if (currentSoilMoisture <= 10.0) {
      postInterval = 2000; // 2 Detik
    } else {
      postInterval = 30000; // 30 Detik
    }
    
    // Tampilkan di Serial Monitor
    Serial.println("\n╔══════════════ DATA SENSOR ══════════════╗");
    Serial.print("║ Suhu           : "); Serial.print(currentTemperature); Serial.println(" °C");
    Serial.print("║ Kelembaban Udara: "); Serial.print(currentHumidity); Serial.println(" %");
    Serial.print("║ Analog Tanah   : "); Serial.print(currentSoilAnalog);
    Serial.print(" → Kelembaban: "); Serial.print(currentSoilMoisture); Serial.println(" %");
    Serial.print("║ Interval Upload: "); Serial.print(postInterval / 1000); Serial.println(" Detik");
    Serial.print("║ WiFi RSSI      : "); Serial.print(wifiRSSI); 
    Serial.print(" dBm ("); Serial.print(currentSignalStr); Serial.println(")");
    Serial.println("╚═════════════════════════════════════════╝");
  }
  
  // ── 2. KIRIM KE FIREBASE BERKALA (Dinamis) ──
  if (currentMillis - previousPostMillis >= postInterval) {
    previousPostMillis = currentMillis;
    
    // Cek apakah sudah waktunya simpan history (tiap 1 jam atau baru pertama kali nyala)
    bool saveHistory = false;
    if (currentMillis - previousHistoryMillis >= historyInterval || isFirstHistory) {
      previousHistoryMillis = currentMillis;
      isFirstHistory = false;
      saveHistory = true;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      sendToFirebase(currentSoilMoisture, currentTemperature, currentHumidity, currentSignalStr, saveHistory);
    } else {
      Serial.println("✗ WiFi tidak terhubung, data tidak terkirim.");
    }
  }
}

void sendToFirebase(float soilMoisture, float temperature, float humidity, String signalStr, bool saveHistory) {
  HTTPClient http;
  WiFiClientSecure client;
  
  // Bypass verifikasi SSL (untuk development)
  // Untuk produksi, tambahkan root CA certificate Firebase
  client.setInsecure();
  
  // Path Firebase: /sensor_data/esp32_001.json
  String url = String(FIREBASE_HOST) + "/sensor_data/esp32_001.json";
  
  // Buat JSON payload (sama dengan format versi GPRS)
  String jsonData = "{";
  jsonData += "\"soil_moisture\":" + String(soilMoisture) + ",";
  jsonData += "\"temperature\":" + String(temperature) + ",";
  jsonData += "\"humidity\":" + String(humidity) + ",";
  jsonData += "\"wind_speed\":0,";
  jsonData += "\"battery_level\":100.0,";
  jsonData += "\"signal_strength\":\"" + signalStr + "\",";
  jsonData += "\"connection_type\":\"WiFi\",";
  jsonData += "\"timestamp\": {\".sv\": \"timestamp\"}";
  jsonData += "}";
  
  Serial.print("→ Mengirim ke Firebase... ");
  
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  
  // Gunakan PUT agar data di-overwrite (real-time, bukan history)
  int httpResponseCode = http.PUT(jsonData);
  
  if (httpResponseCode > 0) {
    Serial.print("✓ Berhasil! (HTTP ");
    Serial.print(httpResponseCode);
    Serial.println(")");
  } else {
    Serial.print("✗ Gagal! Error: ");
    Serial.println(httpResponseCode);
  }
  
  http.end();
  
  // ── SIMPAN HISTORY (Jika Waktunya) ──
  if (saveHistory) {
    Serial.print("→ Menyimpan History ke Firebase (POST)... ");
    String historyUrl = String(FIREBASE_HOST) + "/sensor_history/esp32_001.json";
    
    http.begin(client, historyUrl);
    http.addHeader("Content-Type", "application/json");
    
    // Gunakan POST agar Firebase otomatis membuatkan ID Unik (Push ID) untuk list riwayat
    int histResponseCode = http.POST(jsonData);
    
    if (histResponseCode > 0) {
      Serial.println("✓ History Berhasil Tersimpan!");
    } else {
      Serial.print("✗ Gagal simpan history. Error: ");
      Serial.println(histResponseCode);
    }
    http.end();
  }
}
