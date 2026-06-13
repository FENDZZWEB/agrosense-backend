/**
 * AgroSense — Authentication Guard & Role Utilities
 * Menggunakan Firebase Authentication untuk keamanan sisi server.
 * Shared across all protected pages.
 */

const AgroAuth = {
    /**
     * Cek apakah user punya sesi valid.
     * Menggunakan pendekatan hybrid:
     * 1. Cek sessionStorage dulu (cepat, mencegah halaman flash)
     * 2. Validasi dengan Firebase Auth (keamanan nyata)
     */
    requireAuth() {
        // Sembunyikan body agar tidak terjadi flash content sebelum auth selesai
        if (document.body) {
            document.body.style.opacity = '0';
        }

        // Real security check — Firebase Auth memastikan sesi sah
        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().onAuthStateChanged(function(user) {
                if (!user) {
                    // Sesi palsu atau sudah expired — paksa logout
                    sessionStorage.clear();
                    window.location.replace('login.html');
                } else {
                    // Simpan session
                    sessionStorage.setItem('agrosense_uid', user.uid);
                    
                    // Tampilkan kembali halaman dengan transisi halus
                    if (document.body) {
                        document.body.style.transition = 'opacity 0.25s ease-in-out';
                        document.body.style.opacity = '1';
                    }

                    // Ambil role secara async jika belum ada
                    if (!sessionStorage.getItem('current_role')) {
                        firebase.database().ref('users/' + user.uid + '/role').once('value').then(function(snap) {
                            sessionStorage.setItem('current_role', snap.val() || 'tester');
                        });
                    }
                }
            });
        } else {
            window.location.replace('login.html');
        }
    },

    /** Cek apakah user adalah admin. Redirect ke dashboard jika bukan. */
    requireAdmin() {
        this.requireAuth();
        if (sessionStorage.getItem('current_role') !== 'admin') {
            alert('Akses ditolak. Halaman Settings hanya tersedia untuk Administrator.');
            window.location.replace('index.html');
        }
    },

    /** Ambil role user saat ini */
    getRole() {
        return sessionStorage.getItem('current_role') || 'tester';
    },

    /** Cek apakah user saat ini adalah admin */
    isAdmin() {
        return this.getRole() === 'admin';
    },

    /** Lakukan logout: hapus sesi Firebase Auth + sessionStorage lalu redirect */
    logout() {
        if (typeof firebase !== 'undefined' && firebase.auth) {
            firebase.auth().signOut().then(function() {
                sessionStorage.clear();
                window.location.href = 'login.html';
            }).catch(function() {
                sessionStorage.clear();
                window.location.href = 'login.html';
            });
        } else {
            sessionStorage.clear();
            window.location.href = 'login.html';
        }
    }
};
