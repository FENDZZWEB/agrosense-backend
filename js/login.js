/**
 * AgroSense — Login Page Logic
 * Menggunakan Firebase Authentication (Email/Password).
 * Depends on: config.js, firebase-init.js
 */

// ===== FLOATING PARTICLES (Sensor Nodes) =====
(function () {
    const canvas = document.getElementById('bg-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];
    const PARTICLE_COUNT = 50;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    class Particle {
        constructor() { this.reset(true); }
        reset(initial) {
            this.x = Math.random() * canvas.width;
            this.y = initial ? Math.random() * canvas.height : canvas.height + 10;
            this.radius = Math.random() * 2 + 0.5;
            this.speedY = -(Math.random() * 0.3 + 0.1);
            this.speedX = (Math.random() - 0.5) * 0.2;
            this.opacity = Math.random() * 0.4 + 0.1;
            this.color = Math.random() > 0.5 ? '61, 220, 132' : '91, 200, 175';
        }
        update() {
            this.y += this.speedY;
            this.x += this.speedX;
            if (this.y < -10) this.reset(false);
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
            ctx.fill();
            // small glow
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color}, ${this.opacity * 0.15})`;
            ctx.fill();
        }
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle());
    }

    // Draw faint connection lines between nearby particles
    function drawLines() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(61, 220, 132, ${0.04 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        drawLines();
        requestAnimationFrame(animate);
    }
    animate();
})();

// ===== LOGIN LOGIC (Firebase Authentication) =====
(function () {
    const loginForm = document.getElementById('login-form');
    const errorMsg = document.getElementById('error-msg');
    const errorText = document.getElementById('error-text');
    const loginCard = document.getElementById('login-card');
    const loadingOverlay = document.getElementById('loading-overlay');

    // Jika user sudah login, langsung ke dashboard
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            window.location.replace('index.html');
        }
    });

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const u = document.getElementById('username').value.trim();
        const p = document.getElementById('password').value.trim();

        // Validasi kosong
        if (!u || !p) {
            errorText.textContent = 'ID Pengguna dan Kata Sandi wajib diisi.';
            errorMsg.classList.add('visible');
            loginCard.classList.add('shake');
            setTimeout(() => loginCard.classList.remove('shake'), 400);
            return;
        }

        // Konversi username ke format email untuk Firebase Auth
        // Jika user ketik "admin", maka jadi "admin@agrosense.app"
        let email = u;
        if (!email.includes('@')) {
            email = email + '@agrosense.app';
        }

        // Disable tombol selama proses login
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>MEMPROSES...';

        // Login via Firebase Authentication
        firebase.auth().signInWithEmailAndPassword(email, p)
            .then(function(userCredential) {
                const user = userCredential.user;
                errorMsg.classList.remove('visible');

                // Ambil role dari Firebase Database
                return firebase.database().ref('users/' + user.uid + '/role').once('value')
                    .then(function(snap) {
                        const role = snap.val() || 'tester';

                        // Simpan session untuk quick-check di halaman lain (UX only)
                        sessionStorage.setItem('agrosense_uid', user.uid);
                        sessionStorage.setItem('current_role', role);
                        sessionStorage.setItem('just_logged_in', u);

                        // Tampilkan loading
                        loadingOverlay.classList.add('active');

                        setTimeout(function() {
                            window.location.href = 'index.html';
                        }, 1800);
                    });
            })
            .catch(function(error) {
                console.error('Login error:', error.code, error.message);

                // Tampilkan pesan error yang user-friendly
                let msg = 'ID Pengguna atau Kata Sandi salah.';
                if (error.code === 'auth/user-not-found') {
                    msg = 'Pengguna tidak ditemukan. Hubungi administrator.';
                } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                    msg = 'Kata sandi salah. Silakan coba lagi.';
                } else if (error.code === 'auth/too-many-requests') {
                    msg = 'Terlalu banyak percobaan login. Coba lagi nanti.';
                } else if (error.code === 'auth/network-request-failed') {
                    msg = 'Tidak ada koneksi internet. Periksa jaringan Anda.';
                }

                errorText.textContent = msg;
                errorMsg.classList.add('visible');
                loginCard.classList.add('shake');
                setTimeout(() => loginCard.classList.remove('shake'), 400);

                // Re-enable tombol
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-arrow-right-to-bracket" style="margin-right: 8px;"></i>LOGIN';
            });
    });

    // Hide error on input
    document.querySelectorAll('.form-input').forEach(input => {
        input.addEventListener('input', () => {
            errorMsg.classList.remove('visible');
        });
    });

    // ===== SHOW/HIDE PASSWORD =====
    const togglePassword = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');
    const togglePasswordIcon = document.getElementById('toggle-password-icon');

    togglePassword.addEventListener('click', function (e) {
        e.preventDefault();
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);

        if (type === 'text') {
            togglePasswordIcon.classList.remove('fa-eye');
            togglePasswordIcon.classList.add('fa-eye-slash');
            togglePassword.title = "Sembunyikan Kata Sandi";
        } else {
            togglePasswordIcon.classList.remove('fa-eye-slash');
            togglePasswordIcon.classList.add('fa-eye');
            togglePassword.title = "Tampilkan Kata Sandi";
        }
    });
})();

// ===== REAL SENSOR STATUS FROM FIREBASE =====
(function () {
    const database = initFirebase();

    const statusText = document.getElementById('status-text');
    const statusBadge = document.getElementById('status-badge');
    const statusDot = statusBadge.querySelector('.status-dot');

    // Pantau status koneksi fisik ke Firebase
    database.ref(".info/connected").on("value", function(snap) {
        if (snap.val() === false) {
            statusText.textContent = "Koneksi Firebase Terputus...";
            statusDot.style.background = "#ef4444";
            statusDot.style.boxShadow = "0 0 6px #ef4444";
        } else {
            statusText.textContent = "Terhubung ke Firebase...";
            statusDot.style.background = "#3DDC84";
            statusDot.style.boxShadow = "0 0 6px #3DDC84";
            
            // Query daftar sawah terdaftar dari fields/
            database.ref('fields').once('value').then(fieldsSnap => {
                const fieldsData = fieldsSnap.val();
                if (!fieldsData) {
                    statusText.textContent = 'Sistem Aktif — Belum ada sawah';
                    statusDot.style.background = '#f59e0b';
                    statusDot.style.boxShadow = '0 0 6px #f59e0b';
                    return;
                }

                // Kumpulkan semua device_id unik
                const deviceIds = new Set();
                Object.values(fieldsData).forEach(field => {
                    if (field.device_id) deviceIds.add(field.device_id);
                });

                const totalDevices = deviceIds.size;
                if (totalDevices === 0) {
                    statusText.textContent = 'Sistem Aktif — Belum ada perangkat';
                    return;
                }

                // Cek status online masing-masing device
                let onlineCount = 0;
                let checked = 0;

                deviceIds.forEach(deviceId => {
                    database.ref('sensor_data/' + deviceId).once('value').then(snap => {
                        const data = snap.val();
                        if (data && data.timestamp && (Date.now() - data.timestamp) < APP_CONSTANTS.ONLINE_THRESHOLD_MS) {
                            onlineCount++;
                        }
                        checked++;

                        if (checked === totalDevices) {
                            const totalSensors = totalDevices * APP_CONSTANTS.SENSORS_PER_DEVICE;
                            const onlineSensors = onlineCount * APP_CONSTANTS.SENSORS_PER_DEVICE;

                            if (onlineCount > 0) {
                                statusText.textContent = `Sistem Aktif — ${onlineSensors} Sensor Online`;
                                statusDot.style.background = '#3DDC84';
                                statusDot.style.boxShadow = '0 0 6px #3DDC84';
                            } else {
                                statusText.textContent = `${totalSensors} Sensor Terdaftar — Semua Offline`;
                                statusDot.style.background = '#ef4444';
                                statusDot.style.boxShadow = '0 0 6px #ef4444';
                            }
                        }
                    });
                });
            }).catch((err) => {
                console.error("Gagal membaca sawah:", err);
                statusText.textContent = 'Gagal memuat data sawah';
            });
        }
    });
})();
