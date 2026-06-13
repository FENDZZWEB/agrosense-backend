// PENTING: Pilih modem yang sesuai. Untuk TTGO T-Call biasanya SIM800
#define TINY_GSM_MODEM_SIM800

#include <TinyGsmClient.h>
#define ENABLE_DEBUG
#define DEBUG_PORT Serial
#include <ESP_SSLClient.h>
#include <ArduinoHttpClient.h>
#include <DHT.h>
#include "esp_system.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

const char *getResetReason(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_UNKNOWN:   return "Unknown (Tidak diketahui)";
    case ESP_RST_POWERON:   return "Power On (Dinyalakan pertama kali)";
    case ESP_RST_EXT:       return "External Pin (Tombol Reset/EN ditekan)";
    case ESP_RST_SW:        return "Software Restart (Perintah reset software)";
    case ESP_RST_PANIC:     return "Exception/Panic (Crash program)";
    case ESP_RST_INT_WDT:   return "Interrupt Watchdog (Lockup loop)";
    case ESP_RST_TASK_WDT:  return "Task Watchdog (Thread tersumbat)";
    case ESP_RST_WDT:       return "Other Watchdog (Watchdog lain)";
    case ESP_RST_DEEPSLEEP: return "Deep Sleep Wakeup";
    case ESP_RST_BROWNOUT:  return "Brownout (Tegangan drop / Kurang Daya)";
    case ESP_RST_SDIO:      return "SDIO Reset";
    default:                return "None";
  }
}

// ================= KONFIGURASI FIREBASE & GPRS =================
// TODO: Isi URL Firebase Anda! (Jangan gunakan "https://" atau "/")
// Contoh: "proyek-iot-1234-default-rtdb.firebaseio.com"
const char* FIREBASE_HOST = "smartagriculture-1a4d6-default-rtdb.asia-southeast1.firebasedatabase.app";
const IPAddress FIREBASE_IP(35, 186, 236, 207); // IP Address hasil resolusi nslookup untuk bypass DNS GPRS

// Konfigurasi APN Provider Kartu SIM Anda (Simpati/Telkomsel menggunakan "internet")
const char apn[]      = "internet"; 
const char gprsUser[] = "";
const char gprsPass[] = "";

// ================= PENGATURAN PIN TTGO T-CALL & SENSOR =================
// Pin Modul SIM800L pada TTGO T-Call v1.3 / v1.4
#define MODEM_RST            5
#define MODEM_PWKEY          4
#define MODEM_POWER_ON       23
#define MODEM_TX             27
#define MODEM_RX             26

// Sensor DHT22 (Suhu dan Kelembaban Udara)
#define DHTPIN 15
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// Sensor FC-28 (Kelembaban Tanah)
#define SOIL_MOISTURE_PIN 32
const int dryValue = 4095;
const int wetValue = 1500;

// ================= WRAPPER CLIENT UNTUK BYPASS DNS GSM =================
class MyTinyGsmClient : public TinyGsmClient {
public:
  MyTinyGsmClient(TinyGsm& modem, uint8_t mux = 0) : TinyGsmClient(modem, mux) {}
  
  int connect(const char* host, uint16_t port) override {
    if (strcmp(host, FIREBASE_HOST) == 0) {
      Serial.println("[Wrapper] Intercepted DNS! Connecting directly to Firebase IP.");
      return TinyGsmClient::connect(FIREBASE_IP, port);
    }
    return TinyGsmClient::connect(host, port);
  }

  int connect(IPAddress ip, uint16_t port) override {
    return TinyGsmClient::connect(ip, port);
  }
};

// ================= OBJEK GPRS & HTTP =================
// Serial1 digunakan untuk komunikasi dengan SIM800L
#define SerialAT Serial1

TinyGsm modem(SerialAT);
// Firebase membutuhkan HTTPS (Port 443)
MyTinyGsmClient base_client(modem);
ESP_SSLClient client;
HttpClient http(client, FIREBASE_HOST, 443);

const int readInterval = 2000;   // Baca sensor tiap 2 detik untuk Serial Monitor
int postInterval = 60000;        // Kirim data ke Firebase tiap 60 detik (bisa berubah dinamis)
const unsigned long historyInterval = 3600000; // Simpan riwayat tiap 1 jam
unsigned long previousReadMillis = 0;
unsigned long previousPostMillis = 0;
unsigned long previousHistoryMillis = 0;
bool isFirstHistory = true;

// Variabel Global untuk menyimpan data terakhir
float currentTemperature = 0;
float currentHumidity = 0;
float currentSoilMoisture = 0;
int currentSoilAnalog = 0;
String currentSignalStr = "Cukup";

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Nonaktifkan brownout detector secara software untuk mencegah reset saat tegangan drop di port USB
  disableLoopWDT(); // Menonaktifkan Watchdog Timer pada thread loop untuk mencegah reset saat proses SSL/TLS BearSSL yang berat
  Serial.begin(115200);
  delay(1000);
  
  esp_reset_reason_t reason = esp_reset_reason();
  Serial.println("\n=========================================");
  Serial.print("ESP32 RESET REASON: ");
  Serial.println(getResetReason(reason));
  Serial.println("=========================================\n");
  
  // Setup Sensor
  dht.begin();
  analogReadResolution(12);

  // Setup Pin Daya SIM800L
  pinMode(MODEM_PWKEY, OUTPUT);
  pinMode(MODEM_RST, OUTPUT);
  pinMode(MODEM_POWER_ON, OUTPUT);

  digitalWrite(MODEM_PWKEY, LOW);
  digitalWrite(MODEM_RST, HIGH);
  digitalWrite(MODEM_POWER_ON, HIGH);

  // Mulai Komunikasi dengan Modem
  SerialAT.begin(115200, SERIAL_8N1, MODEM_RX, MODEM_TX);
  delay(3000);

  Serial.println("Memulai Modem SIM800L...");
  modem.restart();

  Serial.println("Menghubungkan ke Jaringan Seluler...");
  if (!modem.waitForNetwork()) {
    Serial.println("Gagal terhubung ke jaringan seluler!");
    while (true); // Berhenti jika gagal
  }

  Serial.println("Terhubung ke Jaringan. Mengaktifkan GPRS...");
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println("Gagal mengaktifkan GPRS!");
    while (true);
  }
  
  // Tampilkan IP lokal untuk memastikan koneksi GPRS aktif sepenuhnya
  Serial.print("IP Address: ");
  Serial.println(modem.localIP());

  // Atur DNS Server secara manual ke Google DNS (8.8.8.8) untuk mempercepat dan menstabilkan DNS resolution
  Serial.println("Mengatur DNS Google...");
  modem.sendAT("+CDNSCFG=\"8.8.8.8\",\"8.8.4.4\"");
  modem.waitResponse(2000);
  
  // Konfigurasi SSLClient untuk menghandle jabat tangan HTTPS (Firebase) secara software di ESP32
  client.setClient(&base_client);
  client.setInsecure(); // Mengabaikan validasi sertifikat (aman untuk pengetesan & hemat memori)
  client.setBufferSizes(4096, 1024); // Mengatur ukuran buffer transmisi (RX, TX) - 4096 direkomendasikan untuk kestabilan TLS
  client.setDebugLevel(3); // Menampilkan log jabat tangan SSL/TLS ke Serial Monitor untuk debug

  Serial.println("GPRS Terhubung! Siap mengirim data ke Firebase.");
}

void loop() {
  unsigned long currentMillis = millis();
  
  // ── 1. BACA SENSOR BERKALA (Tiap 2 Detik) ──
  if(currentMillis - previousReadMillis >= readInterval) {
    previousReadMillis = currentMillis;
    
    // (OPSIONAL) Kalibrasi offset
    float tempOffset = 0.0;
    float humOffset = 0.0;
    int currentDryValue = dryValue;
    int currentWetValue = wetValue;

    // Baca Sensor DHT22
    currentTemperature = dht.readTemperature() + tempOffset;
    currentHumidity = dht.readHumidity() + humOffset;
    
    if (isnan(currentTemperature) || isnan(currentHumidity)) {
      currentTemperature = 0;
      currentHumidity = 0;
    }
    
    // Baca Sensor FC-28
    currentSoilAnalog = analogRead(SOIL_MOISTURE_PIN);
    currentSoilMoisture = map(currentSoilAnalog, currentDryValue, currentWetValue, 0, 100);
    currentSoilMoisture = constrain(currentSoilMoisture, 0, 100);
    
    // Baca Sinyal GPRS
    int csq = modem.getSignalQuality();
    currentSignalStr = "Baik";
    if (csq < 10) currentSignalStr = "Lemah";
    else if (csq < 15) currentSignalStr = "Cukup";
    
    // --- LOGIKA UPLOAD DINAMIS (KONDISI KRITIS) ---
    // Jika kelembaban tanah kritis (<= 10%), upload dipercepat jadi tiap 5 detik
    // (Beda dengan WiFi yang 2 detik, GPRS butuh waktu lebih lama untuk request HTTP)
    if (currentSoilMoisture <= 10.0) {
      postInterval = 5000; // 5 Detik
    } else {
      postInterval = 60000; // Kembali 60 Detik (Hemat Kuota)
    }
    
    // Tampilkan di Serial Monitor
    Serial.println("\n╔══════════════ DATA SENSOR ══════════════╗");
    Serial.print("║ Suhu           : "); Serial.print(currentTemperature); Serial.println(" °C");
    Serial.print("║ Kelembaban Udara: "); Serial.print(currentHumidity); Serial.println(" %");
    Serial.print("║ Analog Tanah   : "); Serial.print(currentSoilAnalog);
    Serial.print(" → Kelembaban: "); Serial.print(currentSoilMoisture); Serial.println(" %");
    Serial.print("║ Interval Upload: "); Serial.print(postInterval / 1000); Serial.println(" Detik");
    Serial.print("║ GPRS Signal    : "); Serial.print(csq); 
    Serial.print(" CSQ ("); Serial.print(currentSignalStr); Serial.println(")");
    Serial.println("╚═════════════════════════════════════════╝");
  }
  
  // ── 2. KIRIM KE FIREBASE BERKALA (Dinamis) ──
  if(currentMillis - previousPostMillis >= postInterval) {
    previousPostMillis = currentMillis;
    
    // Cek apakah sudah waktunya simpan history
    bool saveHistory = false;
    if (currentMillis - previousHistoryMillis >= historyInterval || isFirstHistory) {
      previousHistoryMillis = currentMillis;
      isFirstHistory = false;
      saveHistory = true;
    }
    
    // 3. Buat Format JSON untuk Firebase
    String jsonData = "{";
    jsonData += "\"soil_moisture\":" + String(currentSoilMoisture) + ",";
    jsonData += "\"temperature\":" + String(currentTemperature) + ",";
    jsonData += "\"humidity\":" + String(currentHumidity) + ",";
    jsonData += "\"wind_speed\":0,";
    jsonData += "\"battery_level\":95.0,";
    jsonData += "\"signal_strength\":\"" + currentSignalStr + "\",";
    jsonData += "\"connection_type\":\"GPRS\",";
    jsonData += "\"timestamp\": {\".sv\": \"timestamp\"}"; // Biarkan Firebase yang mengisi waktu asli
    jsonData += "}";
    
    Serial.println("\nMengirim Data ke Firebase: " + jsonData);
    
    // 4. PUT Request ke Firebase REST API
    String path = "/sensor_data/esp32_001.json";
    
    http.beginRequest();
    http.put(path);
    http.sendHeader("Content-Type", "application/json");
    http.sendHeader("Content-Length", jsonData.length());
    http.beginBody();
    http.print(jsonData);
    http.endRequest();

    int statusCode = http.responseStatusCode();
    String response = http.responseBody();
    
    Serial.print("Status Code: ");
    Serial.println(statusCode);
    Serial.print("Response: ");
    Serial.println(response);
    
    http.stop(); // Tutup koneksi untuk mereset state SSL dan socket
    
    // ── 5. SIMPAN HISTORY (Jika Waktunya) ──
    if (saveHistory) {
      Serial.println("\n→ Menyimpan History ke Firebase (POST)...");
      String histPath = "/sensor_history/esp32_001.json";
      
      http.beginRequest();
      http.post(histPath);
      http.sendHeader("Content-Type", "application/json");
      http.sendHeader("Content-Length", jsonData.length());
      http.beginBody();
      http.print(jsonData);
      http.endRequest();

      int histStatusCode = http.responseStatusCode();
      
      if (histStatusCode > 0) {
        Serial.println("✓ History Berhasil Tersimpan!");
      } else {
        Serial.print("✗ Gagal simpan history. Error: ");
        Serial.println(histStatusCode);
      }
      
      http.stop(); // Tutup koneksi untuk mereset state SSL dan socket
    }
  }
}
