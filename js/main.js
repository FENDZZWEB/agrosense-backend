/**
 * AgroSense — Dashboard Logic (Refactored)
 * Depends on: config.js, auth.js, firebase-init.js, theme.js, weather.js
 */

// Auth guard (uses shared module)
AgroAuth.requireAuth();

// Initialize Firebase (uses shared module)
const database = initFirebase();

// Update waktu real-time
function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = now.toLocaleDateString('id-ID', options);
    
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
    document.getElementById('current-time').textContent = now.toLocaleTimeString('id-ID', timeOptions);
}

// Update waktu setiap detik
setInterval(updateDateTime, 1000);
updateDateTime();

// Variable global untuk grafik
let soilMoistureChart;
let moistureHistory = [];
let historyLabels = [];
let currentSensorData = null;
let lastHistorySaveHour = -1; // Throttle: simpan ke history maks 1x per jam

// Inisialisasi Grafik
function initChart(labels, data) {
    const ctx = document.getElementById('soilMoistureChart').getContext('2d');
    
    if (soilMoistureChart) {
        soilMoistureChart.destroy();
    }

    soilMoistureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kelembaban Tanah (%)',
                data: data,
                borderColor: '#8d6e63',
                backgroundColor: 'rgba(141, 110, 99, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#5d4037',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 9
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return ' Kelembaban: ' + context.parsed.y.toFixed(1) + '%';
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: false, min: 0, max: 100, title: { display: true, text: 'Persentase Kelembaban (%)' } },
                x: { title: { display: true, text: 'Tanggal' } }
            }
        }
    });
}

/**
 * Simpan snapshot sensor ke Firebase history (throttled 1x per jam).
 * Path: sensor_history/esp32_001/{YYYY-MM-DD}/{HH}
 */
function saveToHistory(sensorData) {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Hanya simpan jika jam berubah (maks 24 entry per hari)
    if (currentHour === lastHistorySaveHour) return;
    lastHistorySaveHour = currentHour;
    
    const dateKey = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');
    const hourKey = String(currentHour).padStart(2, '0');
    
    database.ref(`sensor_history/esp32_001/${dateKey}/${hourKey}`).set({
        soil_moisture: sensorData.soil_moisture || 0,
        temperature: sensorData.temperature || 0,
        humidity: sensorData.humidity || 0,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        console.log(`[History] Data tersimpan untuk ${dateKey} jam ${hourKey}`);
    }).catch(err => {
        console.error('[History] Gagal menyimpan:', err);
    });
}

/**
 * Muat data historis 7 hari terakhir dari Firebase dan tampilkan di grafik.
 * Mengagregasi rata-rata harian untuk setiap hari.
 */
async function loadHistoricalChart() {
    try {
        // Hitung 7 hari terakhir
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0');
            const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            days.push({ key, label });
        }
        
        const labels = [];
        const data = [];
        
        const promises = days.map(day => database.ref(`sensor_history/esp32_001/${day.key}`).once('value'));
        const snapshots = await Promise.all(promises);
        
        snapshots.forEach((snapshot, index) => {
            const dayData = snapshot.val();
            const day = days[index];
            
            if (dayData) {
                // Hitung rata-rata dari semua jam di hari ini
                const readings = Object.values(dayData);
                const avg = readings.reduce((sum, r) => sum + (r.soil_moisture || 0), 0) / readings.length;
                labels.push(day.label);
                data.push(Math.round(avg * 10) / 10);
            } else {
                labels.push(day.label);
                data.push(null); // Tidak ada data
            }
        });
        
        // Update variabel global
        historyLabels = labels;
        moistureHistory = data;
        
        initChart(historyLabels, moistureHistory);
        console.log('[Chart] Data historis 7 hari berhasil dimuat.');
    } catch (error) {
        console.error('[Chart] Gagal memuat data historis:', error);
        // Fallback: tampilkan chart kosong
        initChart([], []);
    }
}

// Fetch weather using shared module, then update UI
async function fetchAccuWeatherData() {
    const data = await AgroWeather.fetchForecast(database);
    if (data) {
        updateWeatherUI(data);
    } else {
        document.getElementById('wf-rec-desc').textContent = 'Gagal memuat prakiraan cuaca dari satelit.';
    }

    // Fetch current conditions for wind speed (ESP32 doesn't have anemometer)
    const current = await AgroWeather.fetchCurrentConditions();
    if (current) {
        updateWindUI(current);
    }
}

// Update wind speed UI from AccuWeather Current Conditions
function updateWindUI(current) {
    const windEl = document.getElementById('val-wind');
    if (!windEl) return;

    let windSpeed = 0;
    let windDir = '';

    if (current.Wind && current.Wind.Speed && current.Wind.Speed.Metric) {
        windSpeed = current.Wind.Speed.Metric.Value || 0;
    }
    if (current.Wind && current.Wind.Direction && current.Wind.Direction.English) {
        windDir = current.Wind.Direction.English;
    }

    const windText = windDir
        ? `Angin: ${windSpeed} km/jam ${windDir}`
        : `Angin: ${windSpeed} km/jam`;
    windEl.textContent = windText;

    // Also update main temp from current conditions (more accurate than forecast average)
    if (current.Temperature && current.Temperature.Metric) {
        const realTemp = current.Temperature.Metric.Value;
        const tempMainEl = document.getElementById('val-temp-main');
        const tempEl = document.getElementById('val-temp');
        if (tempMainEl) tempMainEl.textContent = realTemp + '°C';
        if (tempEl) tempEl.textContent = 'Suhu: ' + realTemp + '°C';
    }

    // Update humidity from current conditions if available
    if (current.RelativeHumidity !== undefined && current.RelativeHumidity !== null) {
        const humEl = document.getElementById('val-humidity');
        if (humEl) humEl.textContent = 'Kelembaban: ' + current.RelativeHumidity + '%';
    }
}

// Fungsi Update Tampilan Cuaca (uses shared AgroWeather module)
function updateWeatherUI(data) {
    if (!data || !data.DailyForecasts || data.DailyForecasts.length < 3) return;
    
    // --- Update Header Weather ---
    const todayForecast = data.DailyForecasts[0];
    const todayTemp = Math.round((todayForecast.Temperature.Minimum.Value + todayForecast.Temperature.Maximum.Value) / 2);
    const todayPhrase = todayForecast.Day.IconPhrase || '';
    const headerIcon = AgroWeather.getHeaderWeatherIcon(todayPhrase);
    const todayIdnPhrase = AgroWeather.translatePhrase(todayPhrase);

    const hwIcon = document.getElementById('header-weather-icon');
    const hwTemp = document.getElementById('header-weather-temp');
    const hwDesc = document.getElementById('header-weather-desc');
    const valWeatherDesc = document.getElementById('val-weather-desc');
    
    if (hwIcon) hwIcon.className = `${headerIcon.iconClass} mr-1 ${headerIcon.colorClass}`;
    if (hwTemp) hwTemp.textContent = `${todayTemp}°C`;
    if (hwDesc) hwDesc.textContent = todayIdnPhrase;
    if (valWeatherDesc) valWeatherDesc.textContent = todayIdnPhrase;

    let willRain = false;
    let rainDate = '';

    for (let i = 0; i < 3; i++) {
        const forecast = data.DailyForecasts[i];
        const dateObj = new Date(forecast.Date);
        const dateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const temp = Math.round((forecast.Temperature.Minimum.Value + forecast.Temperature.Maximum.Value) / 2);
        
        const phrase = forecast.Day.IconPhrase || '';
        const icon = AgroWeather.getWeatherIcon(phrase);
        const idnPhrase = AgroWeather.translatePhrase(phrase);
        
        // Check for rain
        const lower = phrase.toLowerCase();
        if (!willRain && (lower.includes('rain') || lower.includes('shower') || lower.includes('storm'))) {
            willRain = true;
            rainDate = dateStr;
        }

        // Update DOM
        document.getElementById(`wf-day${i+1}-date`).textContent = dateStr;
        document.getElementById(`wf-day${i+1}-icon`).className = `${icon.iconClass} text-3xl my-3 ${icon.colorClass}`;
        document.getElementById(`wf-day${i+1}-temp`).textContent = temp + '°C';
        document.getElementById(`wf-day${i+1}-desc`).textContent = idnPhrase;
    }
    
    // Update Rekomendasi
    const recDesc = document.getElementById('wf-rec-desc');
    if (willRain) {
        recDesc.textContent = `Prakiraan hujan pada ${rainDate}. Jika kelembaban tanah di atas 60%, pengairan dapat ditunda.`;
        document.getElementById('wf-rec-title').className = 'font-bold text-blue-800';
    } else {
        recDesc.textContent = `Cuaca dominan cerah/berawan. Pastikan kelembaban tanah (sensor FC-28) tidak kurang dari 40%.`;
        document.getElementById('wf-rec-title').className = 'font-bold text-yellow-800';
    }
}

// Fungsi global untuk log aktivitas
window.addLogEntry = function(message, type = 'info', timeStr = null) {
    const container = document.getElementById('logs-container');
    if (!container) return;
    
    if (!timeStr) {
        const now = new Date();
        timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
    }
    
    let icon = 'fas fa-info-circle text-blue-500';
    if (type === 'success') icon = 'fas fa-check-circle text-green-500';
    if (type === 'warning') icon = 'fas fa-exclamation-triangle text-yellow-500';
    if (type === 'danger') icon = 'fas fa-shield-alt text-red-500';
    
    container.innerHTML = `
        <div class="log-entry flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded mb-2 border-l-4 ${type === 'danger' ? 'border-red-500' : (type === 'success' ? 'border-green-500' : 'border-blue-500')}">
            <div class="flex items-center text-sm">
                <i class="${icon} mr-3"></i>
                <span class="dark:text-gray-200">${message}</span>
            </div>
            <span class="text-gray-500 text-xs">${timeStr}</span>
        </div>
    ` + container.innerHTML;
    
    // Batasi log maksimal 15
    while (container.children.length > 15) {
        container.removeChild(container.lastChild);
    }
};

document.addEventListener('DOMContentLoaded', function() {
    // Inisialisasi chart kosong lalu muat data historis 7 hari dari Firebase
    initChart([], []);
    loadHistoricalChart();

    // LOGIKA LOGIN TRACKING (Admin Logs)
    const justLoggedInUser = sessionStorage.getItem('just_logged_in');
    if (justLoggedInUser) {
        sessionStorage.removeItem('just_logged_in');
        
        // Dapatkan IP dan catat ke Firebase
        fetch('https://api.ipify.org?format=json')
            .then(res => res.json())
            .then(data => {
                const ip = data.ip || 'Unknown';
                const ua = navigator.userAgent;
                const network = navigator.connection ? navigator.connection.effectiveType : 'Unknown';
                
                // Ekstrak nama device sederhana dari userAgent
                let deviceName = "Unknown Device";
                if (/Windows/.test(ua)) deviceName = "Windows PC";
                else if (/Mac/.test(ua)) deviceName = "Mac OS";
                else if (/Android/.test(ua)) deviceName = "Android Device";
                else if (/iPhone|iPad/.test(ua)) deviceName = "iOS Device";
                else if (/Linux/.test(ua)) deviceName = "Linux PC";
                
                database.ref('admin_logs').push({
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    username: justLoggedInUser,
                    device: deviceName,
                    userAgent: ua,
                    ip_address: ip,
                    network: network,
                    action: 'LOGIN'
                });
            })
            .catch(err => console.error("Gagal mendapatkan IP:", err));
    }

    // Listener untuk admin_logs (tampilkan di Log Aktivitas Sistem hanya untuk admin)
    if (sessionStorage.getItem('current_role') === 'admin') {
        database.ref('admin_logs').orderByChild('timestamp').limitToLast(5).on('child_added', (snapshot) => {
            const log = snapshot.val();
            if (!log) return;
            
            const dateObj = new Date(log.timestamp);
            const timeStr = dateObj.getHours() + ':' + String(dateObj.getMinutes()).padStart(2, '0') + ':' + String(dateObj.getSeconds()).padStart(2, '0');
            
            let msg = `<span class="font-bold">${log.username.toUpperCase()}</span> login dari <span class="font-medium text-blue-600 dark:text-blue-400">${log.ip_address}</span> (${log.device}) via ${log.network}`;
            window.addLogEntry(msg, 'danger', timeStr);
        });
    }

    // === ROLE-BASED UI RESTRICTIONS ===
    const currentRole = sessionStorage.getItem('current_role');
    const roleLabel = document.getElementById('dropdown-role-label');
    const menuSettings = document.getElementById('menu-settings');

    if (currentRole === 'tester') {
        // Update role badge in dropdown
        if (roleLabel) {
            roleLabel.innerHTML = '<i class="fas fa-eye mr-1"></i> Tester (View Only)';
            roleLabel.className = 'font-bold text-sm text-blue-600 dark:text-blue-400';
        }
        // Hide Settings menu for tester
        if (menuSettings) menuSettings.style.display = 'none';

        // Set fixed tester profile in header
        const headerProfImg = document.getElementById('header-profile-img');
        if (headerProfImg) headerProfImg.src = 'https://ui-avatars.com/api/?name=Tester&background=3b82f6&color=fff';
    } else {
        // Admin role label
        if (roleLabel) {
            roleLabel.innerHTML = '<i class="fas fa-user-shield mr-1"></i> Administrator';
        }
    }

    // Listen ke pengaturan dari Firebase (Profil & Lokasi)
    firebase.database().ref('dashboard_settings').on('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            // Update Profil — hanya untuk admin, tester punya profil tetap
            if (data.profile && currentRole === 'admin') {
                localStorage.setItem('prof_name', data.profile.name);
                localStorage.setItem('prof_email', data.profile.email);
                localStorage.setItem('prof_instansi', data.profile.instansi);
                
                const headerProfImg = document.getElementById('header-profile-img');
                if (data.profile.image) {
                    localStorage.setItem('prof_image', data.profile.image);
                    if (headerProfImg) headerProfImg.src = data.profile.image;
                }
            }
            
            // Update Lokasi di Header
            if (data.location) {
                localStorage.setItem('loc_name', data.location.name);
                localStorage.setItem('loc_lat', data.location.lat);
                localStorage.setItem('loc_lng', data.location.lng);
                
                const locNameEl = document.getElementById('header-loc-name');
                const locCoordsEl = document.getElementById('header-loc-coords');
                const fcLocNameEl = document.getElementById('forecast-loc-name');
                const fcLocCoordsEl = document.getElementById('forecast-loc-coords');
                
                if (locNameEl) locNameEl.textContent = data.location.name;
                if (fcLocNameEl) fcLocNameEl.innerHTML = `<i class="fas fa-map-marker-alt mr-1"></i> ${data.location.name}`;
                
                if (locCoordsEl) locCoordsEl.innerHTML = `Lat: ${data.location.lat} | Lon: ${data.location.lng}`;
                if (fcLocCoordsEl) fcLocCoordsEl.textContent = `Lat: ${data.location.lat} | Lon: ${data.location.lng}`;
            } else {
                localStorage.removeItem('loc_name');
                localStorage.removeItem('loc_lat');
                localStorage.removeItem('loc_lng');
                
                const locNameEl = document.getElementById('header-loc-name');
                const locCoordsEl = document.getElementById('header-loc-coords');
                const fcLocNameEl = document.getElementById('forecast-loc-name');
                const fcLocCoordsEl = document.getElementById('forecast-loc-coords');
                
                if (locNameEl) locNameEl.textContent = "Lokasi Belum Diatur";
                if (fcLocNameEl) fcLocNameEl.innerHTML = `<i class="fas fa-map-marker-alt mr-1"></i> Lokasi Belum Diatur`;
                if (locCoordsEl) locCoordsEl.innerHTML = `Belum ada koordinat`;
                if (fcLocCoordsEl) fcLocCoordsEl.textContent = `Belum ada koordinat`;
            }
        }
    });
    
    // Inisialisasi awal lokasi dari LocalStorage agar tidak berkedip
    const initLocName = localStorage.getItem('loc_name') || "Lokasi Belum Diatur";
    const initLocLat = localStorage.getItem('loc_lat') || "--";
    const initLocLng = localStorage.getItem('loc_lng') || "--";
    
    const initLocNameEl = document.getElementById('header-loc-name');
    const initLocCoordsEl = document.getElementById('header-loc-coords');
    const initFcLocNameEl = document.getElementById('forecast-loc-name');
    const initFcLocCoordsEl = document.getElementById('forecast-loc-coords');
    
    if (initLocNameEl) initLocNameEl.textContent = initLocName;
    if (initFcLocNameEl) initFcLocNameEl.innerHTML = `<i class="fas fa-map-marker-alt mr-1"></i> ${initLocName}`;
    if (initLocLat !== "--") {
        if (initLocCoordsEl) initLocCoordsEl.innerHTML = `Lat: ${initLocLat} | Lon: ${initLocLng}`;
        if (initFcLocCoordsEl) initFcLocCoordsEl.textContent = `Lat: ${initLocLat} | Lon: ${initLocLng}`;
    } else {
        if (initLocCoordsEl) initLocCoordsEl.innerHTML = `Belum ada koordinat`;
        if (initFcLocCoordsEl) initFcLocCoordsEl.textContent = `Belum ada koordinat`;
    }
    
    // Inisialisasi Dark Mode (uses shared module)
    AgroTheme.init();

    // Profile Dropdown Toggle Logic
    const profileBtn = document.getElementById('profile-btn');
    const profileDropdown = document.getElementById('profile-dropdown');
    
    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('hidden');
        });
        
        // Tutup dropdown jika klik di luar area
        document.addEventListener('click', (e) => {
            if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
                profileDropdown.classList.add('hidden');
            }
        });
    }
    
    // Tarik data cuaca dari AccuWeather
    fetchAccuWeatherData();

    // Dengarkan perubahan pada node 'sensor_data' di Firebase
    const sensorRef = database.ref('sensor_data/esp32_001');
    sensorRef.on('value', (snapshot) => {
        const data = snapshot.val();
        const statusEl = document.getElementById('val-online-status');
        
        // Reset local alerts
        window.localAlerts = [];
        
        if (data) {
            currentSensorData = data;
            
            // Cek Status Online/Offline (Jika update terakhir < 5 menit / 300000 ms yang lalu)
            if (data.timestamp && statusEl) {
                const isOnline = (Date.now() - data.timestamp) < 300000;
                if (isOnline) {
                    statusEl.className = "px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 flex items-center";
                    statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2"></span>ONLINE';
                } else {
                    statusEl.className = "px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 flex items-center";
                    statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500 mr-2"></span>OFFLINE';
                    
                    // Tambahkan alert lokal
                    const lastSync = new Date(data.timestamp).toLocaleString('id-ID');
                    window.localAlerts.push({
                        type: 'danger',
                        icon: 'fas fa-wifi',
                        title: 'Koneksi Terputus (Offline)',
                        message: `Alat IoT berhenti mengirim data. Terakhir sinkronisasi: ${lastSync}.`
                    });
                }
            } else if (statusEl) {
                // Jika data ada tapi tidak ada timestamp
                statusEl.className = "px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700 flex items-center";
                statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>NO SYNC';
            }
            
            // Cek kelembaban kritis
            const conditionEl = document.getElementById('val-condition');
            if (data.soil_moisture !== undefined && data.soil_moisture < 40) {
                if (conditionEl) {
                    conditionEl.textContent = 'KRITIS';
                    conditionEl.className = 'font-bold text-lg bg-red-500/80 px-3 py-0.5 rounded-full text-sm text-white';
                }
                window.localAlerts.push({
                    type: 'warning',
                    icon: 'fas fa-exclamation-triangle',
                    title: 'Kelembaban Kritis',
                    message: `Tanah mengering (${data.soil_moisture}%). Butuh pengairan segera jika tidak ada hujan.`
                });
            } else {
                if (conditionEl) {
                    conditionEl.textContent = 'NORMAL';
                    conditionEl.className = 'font-bold text-lg bg-white/20 px-3 py-0.5 rounded-full text-sm';
                }
            }
            
            // Update Data Sensor
            document.getElementById('val-soil-moisture').textContent = (data.soil_moisture || 0) + '%';
            document.getElementById('bar-soil-moisture').style.width = (data.soil_moisture || 0) + '%';
            document.getElementById('bar-soil-moisture').textContent = (data.soil_moisture || 0) + '%';
            
            document.getElementById('val-temp-main').textContent = (data.temperature || 0) + '°C';
            document.getElementById('val-temp').textContent = 'Suhu: ' + (data.temperature || 0) + '°C';
            document.getElementById('val-humidity').textContent = 'Kelembaban: ' + (data.humidity || 0) + '%';
            // Wind speed is updated from AccuWeather Current Conditions, not from ESP32 sensor
            
            document.getElementById('val-battery').textContent = (data.battery_level || 0) + '%';
            document.getElementById('bar-battery').style.width = (data.battery_level || 0) + '%';
            document.getElementById('val-signal').textContent = data.signal_strength || 'Menunggu';
            
            // Simpan snapshot ke Firebase history (throttled 1x per jam)
            saveToHistory(data);
            
            // Update titik hari ini pada grafik 7-hari (update rata-rata hari ini secara real-time)
            if (historyLabels.length > 0) {
                const todayLabel = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                const lastLabel = historyLabels[historyLabels.length - 1];
                if (lastLabel === todayLabel) {
                    // Update nilai hari ini dengan data terbaru
                    moistureHistory[moistureHistory.length - 1] = data.soil_moisture || 0;
                } else {
                    // Hari baru belum ada di chart, tambahkan
                    historyLabels.push(todayLabel);
                    moistureHistory.push(data.soil_moisture || 0);
                    // Jaga maksimal 7 hari
                    if (historyLabels.length > 7) {
                        historyLabels.shift();
                        moistureHistory.shift();
                    }
                }
                initChart(historyLabels, moistureHistory);
            }
        } else {
            // Jika data sama sekali tidak ada di database (Belum ada alat terhubung)
            if (statusEl) {
                statusEl.className = "px-3 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-700 flex items-center";
                statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-gray-500 mr-2"></span>BELUM TERHUBUNG';
            }
            window.localAlerts.push({
                type: 'danger',
                icon: 'fas fa-plug',
                title: 'Sistem Belum Terhubung',
                message: 'Tidak ada data masuk dari alat IoT. Pastikan alat sudah menyala dan terhubung ke server.'
            });
            document.getElementById('val-soil-moisture').textContent = '0%';
            document.getElementById('bar-soil-moisture').style.width = '0%';
            document.getElementById('val-temp-main').textContent = '0°C';
            document.getElementById('val-temp').textContent = 'Suhu: 0°C';
            document.getElementById('val-humidity').textContent = 'Kelembaban: 0%';
            // Wind speed is updated from AccuWeather, not from ESP32 sensor
            document.getElementById('val-battery').textContent = '0%';
            document.getElementById('bar-battery').style.width = '0%';
            document.getElementById('val-signal').textContent = 'Tidak Ada Sinyal';
            
            const conditionEl = document.getElementById('val-condition');
            if (conditionEl) {
                conditionEl.textContent = 'TIDAK DIKETAHUI';
                conditionEl.className = 'font-bold text-lg bg-gray-500/80 px-3 py-0.5 rounded-full text-sm text-white';
            }
        }
        
        if (typeof renderAlerts === 'function') renderAlerts();
    });

    // Dengarkan perubahan data predictions
    const predRef = database.ref('predictions');
    predRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // Konversi objek/array ke format yang diterima oleh komponen React
            const predArray = Array.isArray(data) ? data : Object.values(data);
            window.dispatchEvent(new CustomEvent('dashboardDataFetched', { detail: predArray }));
        }
    });

    // Dengarkan perubahan notifikasi dari Firebase
    window.firebaseAlerts = [];
    window.localAlerts = window.localAlerts || [];
    
    window.renderAlerts = function() {
        const container = document.getElementById('alerts-container');
        if (!container) return;
        
        container.innerHTML = '';
        const allAlerts = [...window.firebaseAlerts, ...window.localAlerts].slice(-3);
        
        if (allAlerts.length > 0) {
             allAlerts.forEach(alert => {
                 let bgClass = 'bg-blue-50 border-blue-200';
                 let iconColor = 'text-blue-500';
                 let titleClass = 'text-gray-800 dark:text-gray-100';
                 let msgClass = 'text-gray-700 dark:text-gray-300';
                 
                 if(alert.type === 'alert' || alert.type === 'danger') {
                     bgClass = 'notification-alert border-l-4 dark:bg-red-900/20';
                     iconColor = 'text-red-500';
                     titleClass = 'text-red-800 dark:text-red-300';
                     msgClass = 'text-red-700 dark:text-red-200';
                 } else if(alert.type === 'warning') {
                     bgClass = 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800';
                     iconColor = 'text-yellow-500';
                     titleClass = 'text-yellow-800 dark:text-yellow-300';
                     msgClass = 'text-yellow-700 dark:text-yellow-200';
                 }
                 
                 container.innerHTML += `
                     <div class="${bgClass} p-4 rounded-lg">
                         <div class="flex items-center">
                             <i class="${alert.icon || 'fas fa-info-circle'} ${iconColor} mr-3"></i>
                             <div>
                                 <h3 class="font-bold ${titleClass}">${alert.title}</h3>
                                 <p class="text-sm ${msgClass}">${alert.message}</p>
                             </div>
                         </div>
                     </div>
                 `;
             });
        } else {
             // Tampilkan pesan kosong (aman)
             container.innerHTML = `
                 <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-100 dark:border-gray-700 text-center">
                     <i class="fas fa-check-circle text-green-500 mb-2 text-2xl"></i>
                     <h3 class="font-bold text-gray-700 dark:text-gray-300">Semua Aman</h3>
                     <p class="text-gray-500 dark:text-gray-400 text-sm">Tidak ada peringatan darurat dari alat IoT.</p>
                 </div>
             `;
        }
    };

    const alertsRef = database.ref('alerts');
    alertsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
             window.firebaseAlerts = Object.values(data);
        } else {
             window.firebaseAlerts = [];
        }
        renderAlerts();
    });

    // Tambahkan efek hover pada kartu
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px)';
        });
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });

    // === LOGIKA MODAL POPUP ===
    const modal = document.getElementById('detail-modal');
    const modalContent = document.getElementById('modal-content');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const closeModalBtn = document.getElementById('close-modal');

    function openModal(title, contentHTML) {
        modalTitle.innerHTML = title;
        modalBody.innerHTML = contentHTML;
        
        modal.classList.remove('hidden', 'pointer-events-none');
        modal.classList.add('flex');
        
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modalContent.classList.remove('scale-95');
        }, 10);
    }

    function closeModal() {
        modal.classList.add('opacity-0');
        modalContent.classList.add('scale-95');
        
        setTimeout(() => {
            modal.classList.add('hidden', 'pointer-events-none');
            modal.classList.remove('flex');
        }, 300);
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    const cardSawah = document.getElementById('card-status-sawah');
    if (cardSawah) {
        cardSawah.addEventListener('click', () => {
            const moist = currentSensorData ? currentSensorData.soil_moisture : '-';
            openModal(
                '<i class="fas fa-leaf text-green-500 mr-2"></i> Detail Status Sawah',
                `
                <div class="space-y-4">
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Nilai Kelembaban:</span>
                        <span class="font-bold text-green-600 dark:text-green-400">${moist}%</span>
                    </div>
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Ambang Batas Kritis:</span>
                        <span class="font-bold text-red-500">40%</span>
                    </div>
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Sensor Terpasang:</span>
                        <span class="font-bold text-gray-800 dark:text-gray-200">FC-28 / YL-69</span>
                    </div>
                    <div class="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg mt-4 text-sm border border-green-200 dark:border-green-800">
                        <i class="fas fa-info-circle text-green-500 mr-2"></i> Kelembaban tanah diukur berdasarkan resistansi dari dua elektroda yang ditancapkan ke dalam tanah sawah. Semakin banyak air, semakin kecil resistansinya.
                    </div>
                </div>
                `
            );
        });
    }

    const cardCuaca = document.getElementById('card-cuaca');
    if (cardCuaca) {
        cardCuaca.addEventListener('click', () => {
            const temp = currentSensorData ? currentSensorData.temperature : '-';
            const hum = currentSensorData ? currentSensorData.humidity : '-';

            // Get wind data from AccuWeather cache
            let windSpeed = '-';
            let windDir = '-';
            let windGust = '-';
            try {
                const cachedCurrent = JSON.parse(localStorage.getItem('aw_current'));
                if (cachedCurrent && cachedCurrent.Wind) {
                    windSpeed = cachedCurrent.Wind.Speed && cachedCurrent.Wind.Speed.Metric
                        ? cachedCurrent.Wind.Speed.Metric.Value + ' km/h'
                        : '-';
                    windDir = cachedCurrent.Wind.Direction
                        ? cachedCurrent.Wind.Direction.Localized + ' (' + (cachedCurrent.Wind.Direction.Degrees || 0) + '°)'
                        : '-';
                }
                if (cachedCurrent && cachedCurrent.WindGust && cachedCurrent.WindGust.Speed && cachedCurrent.WindGust.Speed.Metric) {
                    windGust = cachedCurrent.WindGust.Speed.Metric.Value + ' km/h';
                }
            } catch(e) { /* use defaults */ }

            openModal(
                '<i class="fas fa-cloud-sun text-blue-500 mr-2"></i> Detail Cuaca',
                `
                <div class="space-y-4">
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Suhu Lingkungan:</span>
                        <span class="font-bold text-orange-500">${temp}°C</span>
                    </div>
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Kelembaban Udara (RH):</span>
                        <span class="font-bold text-blue-500">${hum}%</span>
                    </div>
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Kecepatan Angin:</span>
                        <span class="font-bold text-teal-600 dark:text-teal-400">${windSpeed}</span>
                    </div>
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Arah Angin:</span>
                        <span class="font-bold text-gray-800 dark:text-gray-200">${windDir}</span>
                    </div>
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Hembusan Angin Maks:</span>
                        <span class="font-bold text-red-500">${windGust}</span>
                    </div>
                    <div class="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg mt-4 text-sm border border-blue-200 dark:border-blue-800">
                        <i class="fas fa-info-circle text-blue-500 mr-2"></i> Suhu & kelembaban diukur langsung oleh sensor DHT22. Data angin berasal dari stasiun meteorologi terdekat via AccuWeather.
                    </div>
                </div>
                `
            );
        });
    }

    const cardAlat = document.getElementById('card-alat');
    if (cardAlat) {
        cardAlat.addEventListener('click', () => {
            const batt = currentSensorData ? currentSensorData.battery_level : '-';
            const sig = currentSensorData ? currentSensorData.signal_strength : '-';
            openModal(
                '<i class="fas fa-microchip text-indigo-500 mr-2"></i> Detail Node ESP32',
                `
                <div class="space-y-4">
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Mikrokontroler:</span>
                        <span class="font-bold text-gray-800 dark:text-gray-200">LilyGO TTGO T-Call v1.4</span>
                    </div>
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Kapasitas Baterai:</span>
                        <span class="font-bold text-green-600 dark:text-green-400">${batt}%</span>
                    </div>
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Kualitas Sinyal (GPRS):</span>
                        <span class="font-bold text-blue-600 dark:text-blue-400">${sig}</span>
                    </div>
                    <div class="flex justify-between border-b pb-2 dark:border-gray-700">
                        <span class="font-semibold">Jaringan Modem:</span>
                        <span class="font-bold text-gray-800 dark:text-gray-200">SIM800L (2G GSM)</span>
                    </div>
                    <div class="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-lg mt-4 text-sm border border-indigo-200 dark:border-indigo-800">
                        <i class="fas fa-bolt text-indigo-500 mr-2"></i> Perangkat menggunakan daya baterai dan mengirimkan paket data ke Firebase melalui jaringan seluler.
                    </div>
                </div>
                `
            );
        });
    }

    const cardPrakiraan = document.getElementById('card-prakiraan');
    if (cardPrakiraan) {
        cardPrakiraan.addEventListener('click', () => {
            const cachedData = localStorage.getItem('aw_forecast');
            if (!cachedData) {
                openModal(
                    '<i class="fas fa-calendar-alt text-yellow-500 mr-2"></i> Detail Prakiraan Cuaca',
                    '<p>Data prakiraan belum tersedia atau sedang dimuat.</p>'
                );
                return;
            }
            
            try {
                const data = JSON.parse(cachedData);
                if (!data || !data.DailyForecasts) throw new Error("Invalid data");
                
                let detailsHTML = '<div class="space-y-4">';
                
                // Ambil 3 hari
                for (let i = 0; i < Math.min(3, data.DailyForecasts.length); i++) {
                    const forecast = data.DailyForecasts[i];
                    const dateObj = new Date(forecast.Date);
                    const dateStr = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
                    
                    const minTemp = forecast.Temperature.Minimum.Value;
                    const maxTemp = forecast.Temperature.Maximum.Value;
                    
                    const dayPhrase = forecast.Day.IconPhrase;
                    const nightPhrase = forecast.Night.IconPhrase;
                    
                    detailsHTML += `
                    <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                        <div class="font-bold text-lg border-b border-gray-300 dark:border-gray-600 pb-2 mb-2 text-gray-800 dark:text-gray-100">${dateStr}</div>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="block text-gray-500 dark:text-gray-400 font-semibold mb-1">Suhu Harian:</span>
                                <span class="font-bold text-orange-500">${minTemp}°C - ${maxTemp}°C</span>
                            </div>
                            <div>
                                <span class="block text-gray-500 dark:text-gray-400 font-semibold mb-1">Siang Hari:</span>
                                <span class="text-gray-700 dark:text-gray-300">${dayPhrase}</span>
                            </div>
                            <div class="col-span-2 border-t border-gray-200 dark:border-gray-700 pt-2 mt-1">
                                <span class="block text-gray-500 dark:text-gray-400 font-semibold mb-1">Malam Hari:</span>
                                <span class="text-gray-700 dark:text-gray-300">${nightPhrase}</span>
                            </div>
                        </div>
                    </div>
                    `;
                }
                
                // Ambil data lokasi dari pengaturan
                const savedLocName = localStorage.getItem('loc_name') || "Lokasi Belum Diatur";
                const savedLat = localStorage.getItem('loc_lat') || "--";
                const savedLng = localStorage.getItem('loc_lng') || "--";

                detailsHTML += `
                    <div class="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-lg mt-4 text-sm border border-yellow-200 dark:border-yellow-800">
                        <div class="font-bold text-yellow-800 dark:text-yellow-400 mb-1"><i class="fas fa-map-marker-alt mr-2"></i> ${savedLocName}</div>
                        <div class="text-xs text-yellow-700 dark:text-yellow-500 mb-2 font-mono ml-5">Lat: ${savedLat} | Lon: ${savedLng}</div>
                        <i class="fas fa-satellite text-yellow-500 mr-2"></i> Data ini adalah hasil prediksi makroklimat 3 hari ke depan yang diambil langsung dari satelit AccuWeather.
                    </div>
                </div>`;
                
                openModal(
                    '<i class="fas fa-calendar-alt text-yellow-500 mr-2"></i> Analisis Prakiraan Cuaca (Satelit)',
                    detailsHTML
                );
            } catch (e) {
                openModal(
                    '<i class="fas fa-exclamation-triangle text-red-500 mr-2"></i> Error',
                    '<p>Terjadi kesalahan saat membaca data cuaca.</p>'
                );
            }
        });
    }

    // --- Lihat Profil Modal ---
    const viewProfileBtn = document.getElementById('view-profile-btn');
    if (viewProfileBtn) {
        viewProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const role = sessionStorage.getItem('current_role');

            if (role === 'tester') {
                // Tester profile - fixed, read-only
                openModal(
                    '<i class="fas fa-id-card text-blue-500 mr-2"></i> Profil Pengguna',
                    `
                    <div class="flex flex-col items-center space-y-4 py-4">
                        <img src="https://ui-avatars.com/api/?name=Tester&background=3b82f6&color=fff" alt="Tester" class="w-48 h-48 rounded-full object-cover border-4 border-blue-200 shadow-xl">
                        <div class="text-center w-full">
                            <h3 class="text-2xl font-bold text-gray-800 dark:text-white mb-1">Tester</h3>
                            <p class="text-blue-600 dark:text-blue-400 font-medium mb-3">tester@agrosense.demo</p>
                            <div class="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-600 inline-block w-full max-w-sm text-left">
                                <div class="flex items-center text-gray-700 dark:text-gray-300">
                                    <i class="fas fa-eye w-6 text-center text-blue-500 mr-2"></i>
                                    <span>Akses: View Only</span>
                                </div>
                                <div class="flex items-center text-gray-700 dark:text-gray-300 mt-2">
                                    <i class="fas fa-shield-alt w-6 text-center text-yellow-500 mr-2"></i>
                                    <span>Tidak dapat mengubah pengaturan</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    `
                );
            } else {
                // Admin profile - from saved data
                const savedName = localStorage.getItem('prof_name') || 'Admin Penelitian';
                const savedEmail = localStorage.getItem('prof_email') || 'admin@konsel.ac.id';
                const savedInstansi = localStorage.getItem('prof_instansi') || 'Universitas Halu Oleo';
                const savedImage = localStorage.getItem('prof_image') || 'https://ui-avatars.com/api/?name=Admin+Sawah&background=4caf50&color=fff';
                
                openModal(
                    '<i class="fas fa-id-card text-green-600 mr-2"></i> Profil Pengguna',
                    `
                    <div class="flex flex-col items-center space-y-4 py-4">
                        <img src="${savedImage}" alt="Profile Large" class="w-48 h-48 rounded-full object-cover border-4 border-green-200 shadow-xl">
                        <div class="text-center w-full">
                            <h3 class="text-2xl font-bold text-gray-800 dark:text-white mb-1">${savedName}</h3>
                            <p class="text-green-600 dark:text-green-400 font-medium mb-3">${savedEmail}</p>
                            <div class="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-600 inline-block w-full max-w-sm text-left">
                                <div class="flex items-center text-gray-700 dark:text-gray-300">
                                    <i class="fas fa-university w-6 text-center text-blue-500 mr-2"></i>
                                    <span>${savedInstansi}</span>
                                </div>
                                <div class="flex items-center text-gray-700 dark:text-gray-300 mt-2">
                                    <i class="fas fa-user-shield w-6 text-center text-orange-500 mr-2"></i>
                                    <span>Administrator Sistem</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    `
                );
            }
        });
    }

    // Dengarkan perubahan pada prediksi AI dari Python Backend
    const predictionRef = database.ref('ai_predictions');
    predictionRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            let predictionsList = [];
            
            // Loop semua sawah yang ada di ai_predictions
            for (const [fieldId, fieldData] of Object.entries(data)) {
                if (fieldData.latest) {
                    const p = fieldData.latest;
                    let category = "Tidak Perlu Pengairan";
                    if (p.kebutuhan_air_liter > 500) category = "Pengairan Tinggi"; // Disesuaikan skala liter sawah
                    else if (p.kebutuhan_air_liter > 100) category = "Pengairan Sedang";
                    else if (p.kebutuhan_air_liter > 0) category = "Pengairan Rendah";
                    
                    let rec = p.rekomendasi_pompa === "ON" ? "Nyalakan pompa air sekarang." : "Pompa tidak perlu dinyalakan.";
                    
                    predictionsList.push({
                        date: `${p.date} - ${p.field_name || fieldId}`,
                        water: p.kebutuhan_air_liter,
                        category: category,
                        recommendation: rec
                    });
                }
            }
            
            if (predictionsList.length === 0) {
                 predictionsList = [{ date: '-', water: 0, category: 'Belum Ada', recommendation: 'Belum ada data prediksi AI.' }];
            }
            
            // Dispatch event ke komponen React
            window.latestAIPredictions = predictionsList;
            window.dispatchEvent(new CustomEvent('dashboardDataFetched', { detail: predictionsList }));
            addLogEntry('Data prediksi AI multi-sawah diperbarui', 'success');
        }
    });

    // --- Tampilkan Log Lengkap ---
    const btnFullLogs = document.getElementById('btn-full-logs');
    if (btnFullLogs) {
        btnFullLogs.addEventListener('click', () => {
            const role = sessionStorage.getItem('current_role');
            if (role === 'tester') {
                openModal(
                    '<i class="fas fa-history text-green-600 mr-2"></i> Log Aktivitas Sistem',
                    '<div class="text-center py-6 text-gray-500"><i class="fas fa-lock text-4xl mb-3 text-gray-300"></i><p>Maaf, fitur ini terkunci untuk role Tester.</p></div>'
                );
                return;
            }
            
            // Show loading state
            openModal(
                '<i class="fas fa-history text-indigo-600 mr-2"></i> Log Aktivitas Sistem (20 Terakhir)',
                '<div class="text-center py-8 text-gray-500"><i class="fas fa-spinner fa-spin text-4xl mb-4 text-indigo-300"></i><p>Mengambil data log dari server database...</p></div>'
            );
            
            // Fetch logs from Firebase
            database.ref('admin_logs').orderByChild('timestamp').limitToLast(20).once('value')
                .then((snapshot) => {
                    const data = snapshot.val();
                    if (!data) {
                        document.getElementById('modal-body').innerHTML = '<div class="text-center py-6 text-gray-500"><i class="fas fa-history text-4xl mb-3 text-gray-300"></i><p>Tidak ada riwayat aktivitas yang tersimpan.</p></div>';
                        return;
                    }
                    
                    let logsHTML = '<div class="space-y-3">';
                    const logsArray = Object.values(data).sort((a, b) => b.timestamp - a.timestamp); // Descending order
                    
                    logsArray.forEach(log => {
                        const dateObj = new Date(log.timestamp);
                        const dateStr = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                        const timeStr = dateObj.getHours() + ':' + String(dateObj.getMinutes()).padStart(2, '0') + ':' + String(dateObj.getSeconds()).padStart(2, '0');
                        
                        logsHTML += `
                            <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 text-sm flex flex-col md:flex-row md:justify-between md:items-center gap-2 transition-all hover:shadow-md">
                                <div>
                                    <span class="font-bold text-gray-800 dark:text-gray-200 uppercase">${log.username}</span> 
                                    <span class="text-gray-600 dark:text-gray-400">login dari</span> 
                                    <span class="text-blue-600 dark:text-blue-400 font-mono text-xs bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-800">${log.ip_address}</span>
                                    <p class="text-xs text-gray-400 mt-1"><i class="fas fa-desktop mr-1"></i> ${log.device} via ${log.network}</p>
                                </div>
                                <div class="text-gray-500 dark:text-gray-400 text-xs text-left md:text-right whitespace-nowrap bg-white dark:bg-gray-700 px-2 py-1 rounded shadow-sm">
                                    <div class="font-bold text-gray-700 dark:text-gray-300"><i class="far fa-calendar-alt mr-1"></i>${dateStr}</div>
                                    <div><i class="far fa-clock mr-1"></i>${timeStr}</div>
                                </div>
                            </div>
                        `;
                    });
                    
                    logsHTML += '</div><div class="mt-5 text-xs text-center text-gray-400 p-2 bg-gray-50 dark:bg-gray-800 rounded">Menampilkan hingga 20 rekam jejak aktivitas admin terbaru berdasarkan data Firebase Realtime Database.</div>';
                    document.getElementById('modal-body').innerHTML = logsHTML;
                })
                .catch((err) => {
                    document.getElementById('modal-body').innerHTML = '<div class="text-center py-6 text-red-500"><i class="fas fa-exclamation-triangle text-4xl mb-3"></i><p>Gagal memuat log dari database.</p></div>';
                });
        });
    }

});
