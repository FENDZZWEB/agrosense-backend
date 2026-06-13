#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

// ================= PENGATURAN WIFI & SERVER =================
// Ganti dengan SSID dan Password WiFi Anda
const char* ssid = "BILAL";
const char* password = "Web";

// Ganti IP_ADDRESS_PC dengan IP Address komputer Anda (cek dengan 'ipconfig' di CMD)
// Contoh: http://192.168.1.10/smart_agriculture/api/esp32_post.php
const char* serverName = "http://IP_ADDRESS_PC/smart_agriculture/api/esp32_post.php";

// ================= PENGATURAN PIN SENSOR =================
// DHT22 (Suhu dan Kelembaban Udara)
#define DHTPIN 15          // Pin Data DHT22 dihubungkan ke GPIO 15
#define DHTTYPE DHT22      // Jenis DHT
DHT dht(DHTPIN, DHTTYPE);

// FC-28 (Sensor Kelembaban Tanah)
#define SOIL_MOISTURE_PIN 32 // Pin Analog FC-28 dihubungkan ke GPIO 32

// Nilai kalibrasi sensor kelembaban tanah (sesuaikan dengan nilai aktual saat kering dan basah air)
const int dryValue = 4095;   // Nilai analog saat tanah kering total
const int wetValue = 1500;   // Nilai analog saat tanah basah/dalam air

// Waktu interval pengiriman data (dalam milidetik)
const int postInterval = 30000; // 30 detik
unsigned long previousMillis = 0;

void setup() {
  Serial.begin(115200);
  
  // Inisialisasi sensor DHT
  dht.begin();
  
  // Resolusi ADC ESP32 adalah 12-bit (0-4095)
  analogReadResolution(12);

  // Mulai koneksi WiFi
  WiFi.begin(ssid, password);
  Serial.println("Menghubungkan ke WiFi...");
  
  while(WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("");
  Serial.print("Terhubung ke jaringan WiFi dengan IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  unsigned long currentMillis = millis();
  
  // Kirim data setiap interval yang ditentukan
  if(currentMillis - previousMillis >= postInterval) {
    previousMillis = currentMillis;
    
    // 1. Baca data sensor Suhu & Kelembaban (DHT22)
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    
    // Validasi pembacaan DHT
    if (isnan(temperature) || isnan(humidity)) {
      Serial.println("Gagal membaca dari sensor DHT!");
      temperature = 0;
      humidity = 0;
    }
    
    // 2. Baca data sensor Kelembaban Tanah (FC-28)
    int soilAnalogVal = analogRead(SOIL_MOISTURE_PIN);
    
    // Konversi nilai analog ke persentase (0% - 100%)
    // Mapping: nilai kering (dryValue) = 0%, nilai basah (wetValue) = 100%
    float soilMoisturePercent = map(soilAnalogVal, dryValue, wetValue, 0, 100);
    
    // Batasi nilai persentase agar tidak kurang dari 0 atau lebih dari 100
    soilMoisturePercent = constrain(soilMoisturePercent, 0, 100);
    
    // 3. Status Dummy Baterai & Sinyal (TTGO bisa membaca voltase baterai aktual jika diprogram lebih lanjut)
    float battery_level = 95.0; 
    int wifi_rssi = WiFi.RSSI();
    String signal_strength = "Baik";
    if (wifi_rssi < -80) signal_strength = "Lemah";
    else if (wifi_rssi < -60) signal_strength = "Cukup";
    else signal_strength = "Sangat Baik";
    
    // Tampilkan data di Serial Monitor
    Serial.println("====== DATA SENSOR ======");
    Serial.print("Suhu: "); Serial.print(temperature); Serial.println(" C");
    Serial.print("Kelembaban Udara: "); Serial.print(humidity); Serial.println(" %");
    Serial.print("Nilai Analog Tanah: "); Serial.print(soilAnalogVal);
    Serial.print(" -> Kelembaban Tanah: "); Serial.print(soilMoisturePercent); Serial.println(" %");
    Serial.println("=========================");
    
    // 4. Kirim Data ke Server (XAMPP) via HTTP POST
    if(WiFi.status() == WL_CONNECTED){
      HTTPClient http;
      
      // Menggunakan POST form-urlencoded
      http.begin(serverName);
      http.addHeader("Content-Type", "application/x-www-form-urlencoded");
      
      // Buat body request sesuai dengan variabel di esp32_post.php
      String httpRequestData = "soil_moisture=" + String(soilMoisturePercent)
                             + "&temperature=" + String(temperature)
                             + "&humidity=" + String(humidity)
                             + "&wind_speed=0"  // Angin dibuat 0 karena tidak ada sensornya
                             + "&battery_level=" + String(battery_level)
                             + "&signal_strength=" + signal_strength;
                             
      Serial.print("Mengirim data ke server: ");
      Serial.println(httpRequestData);
      
      int httpResponseCode = http.POST(httpRequestData);
      
      if (httpResponseCode > 0) {
        Serial.print("HTTP Response code: ");
        Serial.println(httpResponseCode);
        String payload = http.getString();
        Serial.println(payload);
      }
      else {
        Serial.print("Error code: ");
        Serial.println(httpResponseCode);
      }
      // Bebaskan resources
      http.end();
    }
    else {
      Serial.println("Koneksi WiFi terputus");
    }
  }
}
