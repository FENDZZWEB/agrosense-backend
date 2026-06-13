/**
 * AgroSense — Firebase Initialization Helper
 * Ensures Firebase is initialized exactly once across the app.
 * Depends on: config.js (must be loaded first)
 */

// Inisialisasi Firebase App secara otomatis saat script dimuat
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
}

function initFirebase() {
    return firebase.database();
}
