/**
 * AgroSense — Weather Data Module
 * Handles AccuWeather fetch, caching, UI updates, and phrase translations.
 * Depends on: config.js, firebase-init.js
 */

const AgroWeather = {
    /**
     * Translate AccuWeather English phrase to Indonesian.
     * @param {string} phrase - AccuWeather Day.IconPhrase
     * @returns {string} Indonesian translation
     */
    translatePhrase(phrase) {
        const lower = (phrase || '').toLowerCase();
        if (lower.includes('t-storm') || lower.includes('storm')) return 'Badai Petir';
        if (lower.includes('mostly cloudy')) return 'Berawan Tebal';
        if (lower.includes('partly cloudy')) return 'Cerah Berawan';
        if (lower.includes('sun') || lower.includes('clear')) return 'Cerah';
        if (lower.includes('cloudy') || lower.includes('clouds')) return 'Berawan';
        if (lower.includes('rain') || lower.includes('shower')) return 'Hujan';
        return phrase || '-';
    },

    /**
     * Get Font Awesome icon class for a weather phrase.
     * @param {string} phrase - AccuWeather Day.IconPhrase
     * @returns {{ iconClass: string, colorClass: string }}
     */
    getWeatherIcon(phrase) {
        const lower = (phrase || '').toLowerCase();
        if (lower.includes('rain') || lower.includes('shower') || lower.includes('storm')) {
            return { iconClass: 'fas fa-cloud-rain', colorClass: 'text-blue-500' };
        }
        if (lower.includes('sun') || lower.includes('clear')) {
            return { iconClass: 'fas fa-sun', colorClass: 'text-yellow-500' };
        }
        if (lower.includes('cloud')) {
            return { iconClass: 'fas fa-cloud', colorClass: 'text-gray-500' };
        }
        return { iconClass: 'fas fa-cloud', colorClass: 'text-gray-500' };
    },

    /**
     * Get header-specific weather icon styling (lighter colors for dark header).
     * @param {string} phrase
     * @returns {{ iconClass: string, colorClass: string }}
     */
    getHeaderWeatherIcon(phrase) {
        const lower = (phrase || '').toLowerCase();
        if (lower.includes('rain') || lower.includes('shower') || lower.includes('storm')) {
            return { iconClass: 'fas fa-cloud-rain', colorClass: 'text-blue-300' };
        }
        if (lower.includes('sun') || lower.includes('clear')) {
            return { iconClass: 'fas fa-sun', colorClass: 'text-yellow-300' };
        }
        return { iconClass: 'fas fa-cloud', colorClass: 'text-gray-300' };
    },

    /**
     * Fetch weather data - Firebase first (from Python backend), then localStorage cache, then AccuWeather direct.
     * Strategi ini menghindari masalah CORS saat diakses dari Firebase Hosting.
     * @param {firebase.database.Database} database - Firebase database instance
     * @returns {Promise<object|null>}
     */
    async fetchForecast(database) {
        const now = Date.now();
        const FIREBASE_STALE_MS = 12 * 60 * 60 * 1000; // 12 jam

        // === LANGKAH 1: Baca dari Firebase (di-push oleh backend Python, bebas CORS) ===
        try {
            const snapshot = await database.ref('weather_forecast').once('value');
            const fbData = snapshot.val();
            if (fbData && fbData.forecast_data && fbData.timestamp &&
                (now - fbData.timestamp) < FIREBASE_STALE_MS) {
                console.log('[Cuaca] Data dari Firebase (backend Python). Diperbarui:', fbData.updated_at);
                localStorage.setItem('aw_forecast', JSON.stringify(fbData.forecast_data));
                localStorage.setItem('aw_forecast_time', now.toString());
                return fbData.forecast_data;
            }
        } catch (fbReadError) {
            console.warn('[Cuaca] Gagal baca Firebase, coba AccuWeather langsung...', fbReadError);
        }

        // === LANGKAH 2: Cek localStorage cache ===
        const cachedData = localStorage.getItem('aw_forecast');
        const cachedTime = localStorage.getItem('aw_forecast_time');
        if (cachedData && cachedTime && (now - parseInt(cachedTime) < APP_CONSTANTS.WEATHER_CACHE_MS)) {
            console.log('[Cuaca] Data dari cache lokal (localStorage).');
            return JSON.parse(cachedData);
        }

        // === LANGKAH 3: Panggil AccuWeather langsung (fallback, mungkin gagal di Firebase Hosting karena CORS) ===
        try {
            console.log('[Cuaca] Mengambil data langsung dari AccuWeather...');
            const url = `https://dataservice.accuweather.com/forecasts/v1/daily/5day/${AW_LOCATION_KEY}?apikey=${AW_API_KEY}&metric=true`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('HTTP Status: ' + response.status);
            }
            const data = await response.json();
            localStorage.setItem('aw_forecast', JSON.stringify(data));
            localStorage.setItem('aw_forecast_time', now.toString());
            try {
                database.ref('weather_forecast').set({
                    timestamp: now,
                    updated_at: new Date().toISOString(),
                    forecast_data: data,
                    source: 'frontend_direct'
                });
            } catch (fbError) { /* silent */ }
            return data;
        } catch (error) {
            console.error('[Cuaca] Semua sumber gagal:', error.message);
            return null;
        }
    },

    /**
     * Fetch current conditions from AccuWeather (includes wind speed & direction).
     * Uses a 30-minute cache to conserve API calls.
     * @returns {Promise<object|null>} Current conditions object with Wind data
     */
    async fetchCurrentConditions() {
        try {
            const cachedData = localStorage.getItem('aw_current');
            const cachedTime = localStorage.getItem('aw_current_time');
            const now = Date.now();
            const CACHE_MS = 30 * 60 * 1000; // 30 minutes

            if (cachedData && cachedTime && (now - parseInt(cachedTime) < CACHE_MS)) {
                console.log('Menggunakan data kondisi saat ini dari cache (AccuWeather)');
                return JSON.parse(cachedData);
            }

            console.log('Mengambil data kondisi saat ini dari AccuWeather...');
            const url = `https://dataservice.accuweather.com/currentconditions/v1/${AW_LOCATION_KEY}?apikey=${AW_API_KEY}&details=true`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Gagal mengambil current conditions. HTTP Status: ' + response.status);
            }

            const data = await response.json();
            // API returns an array, take first element
            const current = Array.isArray(data) ? data[0] : data;

            // Save to cache
            localStorage.setItem('aw_current', JSON.stringify(current));
            localStorage.setItem('aw_current_time', now.toString());

            console.log('Data kondisi saat ini berhasil diambil dari AccuWeather.');
            return current;
        } catch (error) {
            console.error('Error fetching AccuWeather current conditions:', error);
            return null;
        }
    }
};
