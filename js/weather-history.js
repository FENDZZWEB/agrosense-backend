/**
 * AgroSense — Weather History Page Logic
 * Extracted from weather_history.html inline <script>.
 * Depends on: config.js, auth.js, firebase-init.js, theme.js
 */

// Auth guard (was missing from original!)
AgroAuth.requireAuth();

// Initialize dark mode
AgroTheme.init();

// Initialize Firebase
const database = initFirebase();

// Elements
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const historyContainer = document.getElementById('history-container');
const totalRecordsEl = document.getElementById('total-records');
const btnRefresh = document.getElementById('btn-refresh');

function fetchHistory() {
    loadingState.style.display = 'flex';
    emptyState.classList.add('hidden');
    historyContainer.innerHTML = '';
    totalRecordsEl.textContent = '-';

    // Ambil dari node historical_weather
    database.ref('historical_weather').once('value')
        .then(snapshot => {
            const data = snapshot.val();
            loadingState.style.display = 'none';

            if (!data) {
                emptyState.classList.remove('hidden');
                totalRecordsEl.textContent = '0';
                return;
            }

            // Urutkan tanggal dari terbaru ke terlama
            const dates = Object.keys(data).sort().reverse();
            totalRecordsEl.textContent = dates.length;

            dates.forEach(dateStr => {
                const dayData = data[dateStr];
                if (!dayData || !dayData.DailyForecasts) return;

                // Gunakan prakiraan hari pertama (index 0) yang disimpan pada tanggal tersebut
                const forecast = dayData.DailyForecasts[0];

                // Parse Tanggal
                const dObj = new Date(dateStr);
                const displayDate = isNaN(dObj.getTime()) ? dateStr : dObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

                const minT = forecast.Temperature.Minimum.Value;
                const maxT = forecast.Temperature.Maximum.Value;
                const dayIcon = forecast.Day.IconPhrase;
                const nightIcon = forecast.Night.IconPhrase;
                const rainProp = forecast.Day.RainProbability || 0;
                const hasPrecipitation = forecast.Day.HasPrecipitation ? 'Ya' : 'Tidak';

                const html = `
                    <details class="group bg-white dark:bg-gray-800">
                        <summary class="flex justify-between items-center font-medium cursor-pointer list-none p-5 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                            <div class="flex items-center gap-4">
                                <div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-500 flex items-center justify-center shrink-0">
                                    <i class="fas fa-calendar-day"></i>
                                </div>
                                <div>
                                    <h3 class="text-gray-800 dark:text-gray-200 font-bold">${displayDate}</h3>
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Suhu: ${minT}°C - ${maxT}°C • ${dayIcon}</p>
                                </div>
                            </div>
                            <span class="transition group-open:rotate-180">
                                <i class="fas fa-chevron-down text-gray-400"></i>
                            </span>
                        </summary>
                        <div class="text-gray-600 dark:text-gray-300 p-5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 text-sm">
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div class="bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 shadow-sm">
                                    <span class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kondisi Siang:</span>
                                    <span class="font-bold text-gray-800 dark:text-gray-200"><i class="fas fa-sun text-yellow-500 mr-1.5"></i>${dayIcon}</span>
                                </div>
                                <div class="bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 shadow-sm">
                                    <span class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kondisi Malam:</span>
                                    <span class="font-bold text-gray-800 dark:text-gray-200"><i class="fas fa-moon text-indigo-400 mr-1.5"></i>${nightIcon}</span>
                                </div>
                                <div class="bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 shadow-sm">
                                    <span class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Probabilitas Hujan:</span>
                                    <span class="font-bold text-blue-600 dark:text-blue-400"><i class="fas fa-cloud-rain mr-1.5"></i>${rainProp}%</span>
                                </div>
                                <div class="bg-white dark:bg-gray-700 p-3 rounded border border-gray-200 dark:border-gray-600 shadow-sm">
                                    <span class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Ada Presipitasi:</span>
                                    <span class="font-bold ${forecast.Day.HasPrecipitation ? 'text-blue-500' : 'text-gray-500'}"><i class="fas fa-tint mr-1.5"></i>${hasPrecipitation}</span>
                                </div>
                            </div>
                            <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-400 font-mono">
                                Data mentah: Disimpan dari AccuWeather API pada ${dateStr} 00:00:00
                            </div>
                        </div>
                    </details>
                `;
                historyContainer.insertAdjacentHTML('beforeend', html);
            });
        })
        .catch(err => {
            loadingState.style.display = 'none';
            historyContainer.innerHTML = `<div class="p-6 text-center text-red-500"><i class="fas fa-exclamation-triangle mr-2"></i>Gagal memuat riwayat. Periksa koneksi internet Anda.</div>`;
        });
}

// Initialize
fetchHistory();
btnRefresh.addEventListener('click', fetchHistory);
