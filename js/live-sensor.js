/**
 * AgroSense — Live Sensor Terminal Page Logic
 * Extracted from live_sensor.html inline <script>.
 * Depends on: config.js, auth.js, firebase-init.js
 */

// Auth guard
AgroAuth.requireAuth();

// Initialize Firebase
const database = initFirebase();
const terminalOutput = document.getElementById('terminal-output');
const statusEl = document.getElementById('connection-status');

let lastTimestamp = 0;

// Auto-scroll to bottom
function scrollToBottom() {
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

document.getElementById('btn-clear').addEventListener('click', () => {
    terminalOutput.innerHTML = '<div class="text-gray-400 mb-4">AgroSense Web Terminal v1.0<br>Terminal cleared. Waiting for new data...</div>';
});

// Listen to Firebase
database.ref('sensor_data/esp32_001').on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // Check if online (data younger than 2 minutes)
    const isOnline = (Date.now() - data.timestamp) < 120000;
    if (isOnline) {
        statusEl.className = "px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30 flex items-center";
        statusEl.innerHTML = '<div class="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2"></div> ONLINE';
    } else {
        statusEl.className = "px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center";
        statusEl.innerHTML = '<div class="w-2 h-2 rounded-full bg-red-500 mr-2"></div> OFFLINE';
    }

    // Prevent duplicate logs if timestamp hasn't changed
    if (data.timestamp === lastTimestamp) return;
    lastTimestamp = data.timestamp;

    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
        now.getMinutes().toString().padStart(2, '0') + ':' +
        now.getSeconds().toString().padStart(2, '0') + '.' +
        now.getMilliseconds().toString().padStart(3, '0');

    // Format Log
    const logHTML = `
    <div class="terminal-line">
        <div class="text-blue-400 mb-1">[${timeStr}] <span class="text-gray-300">Menerima payload JSON dari esp32_001...</span></div>
        <div class="terminal-text whitespace-pre">╔══════════════ DATA SENSOR ══════════════╗
║ Suhu           : ${Number(data.temperature).toFixed(2)} °C
║ Kelembaban Udara: ${Number(data.humidity).toFixed(2)} %
║ Kelembaban Tanah: ${Number(data.soil_moisture).toFixed(2)} %
║ Sinyal         : ${AgroSecurity.escapeHTML(data.signal_strength) || 'N/A'}
║ Koneksi        : ${AgroSecurity.escapeHTML(data.connection_type) || 'Unknown'}
║ Baterai        : ${Number(data.battery_level) || 0} %
╚═════════════════════════════════════════╝</div>
    </div>`;

    terminalOutput.innerHTML += logHTML;

    // Keep only last 50 logs to prevent memory leak
    const lines = terminalOutput.querySelectorAll('.terminal-line');
    if (lines.length > 50) {
        lines[0].remove();
    }

    scrollToBottom();
});
