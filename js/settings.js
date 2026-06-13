/**
 * AgroSense — Settings Page Logic
 * Extracted from settings.html inline <script>.
 * Fixes: Mobile menu toggle was incorrectly nested inside searchMap().
 * Depends on: config.js, auth.js, firebase-init.js
 */

// Auth guard — admin only
AgroAuth.requireAdmin();

// Check Dark Mode
if (localStorage.getItem('dark-mode') === 'true') {
    document.body.classList.add('dark-mode');
}

// Initialize Firebase
const database = initFirebase();

// --- TAB SWITCHING LOGIC ---
let mapInitialized = false;
let map, marker;

function switchTab(tabId) {
    // Sembunyikan semua konten
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
    });
    // Reset style semua tombol tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.className = "tab-btn w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition";
    });

    // Tampilkan konten aktif
    document.getElementById('tab-' + tabId).classList.remove('hidden');

    // Highlight tombol aktif
    const activeBtn = document.getElementById('tab-btn-' + tabId);
    activeBtn.className = "tab-btn active w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg bg-blue-50 text-blue-700 transition";

    // Update breadcrumb text
    const tabNames = {
        'profile': 'My Profile',
        'notification': 'My Notifications',
        'location': 'Location Settings',
        'calibration': 'Sensor Settings'
    };
    const breadcrumb = document.getElementById('breadcrumb-current');
    if (breadcrumb) breadcrumb.textContent = tabNames[tabId] || 'Settings';

    // Inisialisasi peta JIKA tab lokasi diklik pertama kali
    if (tabId === 'location' && !mapInitialized) {
        initMap();
        mapInitialized = true;
    }
}

// --- MAP LOGIC ---
function initMap() {
    // Load saved coordinates or default to Andoolo
    const savedLat = localStorage.getItem('loc_lat') || -4.433;
    const savedLng = localStorage.getItem('loc_lng') || 122.250;
    const savedLocName = localStorage.getItem('loc_name') || "Andoolo, Konawe Selatan";

    document.getElementById('input-lat').value = savedLat;
    document.getElementById('input-lng').value = savedLng;
    if (document.getElementById('input-loc-name')) {
        document.getElementById('input-loc-name').value = savedLocName;
    }

    // Buat Peta menggunakan Mode Satelit + Label (Google Maps Hybrid)
    map = L.map('map').setView([savedLat, savedLng], 13);

    L.tileLayer('http://mt0.google.com/vt/lyrs=y&hl=id&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps'
    }).addTo(map);

    // Tambahkan Marker
    marker = L.marker([savedLat, savedLng], { draggable: true }).addTo(map);

    // Jika marker digeser
    marker.on('dragend', function (e) {
        const pos = marker.getLatLng();
        document.getElementById('input-lat').value = pos.lat.toFixed(5);
        document.getElementById('input-lng').value = pos.lng.toFixed(5);
    });

    // Jika peta diklik
    map.on('click', function (e) {
        marker.setLatLng(e.latlng);
        document.getElementById('input-lat').value = e.latlng.lat.toFixed(5);
        document.getElementById('input-lng').value = e.latlng.lng.toFixed(5);
    });

    // Fix tile loading bug pada container tersembunyi
    setTimeout(() => { map.invalidateSize(); }, 300);
}

// --- TOAST NOTIFICATION ---
function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').innerText = msg;
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

// --- IMAGE UPLOAD & CROPPER ---
let currentBase64Photo = null;
let cropper;
const cropModal = document.getElementById('crop-modal');
const cropModalContent = document.getElementById('crop-modal-content');
const imageToCrop = document.getElementById('image-to-crop');

function openCropModal() {
    cropModal.classList.remove('hidden');
    cropModal.classList.add('flex');
    setTimeout(() => {
        cropModal.classList.remove('opacity-0');
        cropModalContent.classList.remove('scale-95');
    }, 10);
}

function closeCropModal() {
    cropModal.classList.add('opacity-0');
    cropModalContent.classList.add('scale-95');
    setTimeout(() => {
        cropModal.classList.add('hidden');
        cropModal.classList.remove('flex');
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        // Reset input file agar bisa memilih file yang sama lagi jika dibatalkan
        document.getElementById('input-photo').value = '';
    }, 300);
}

document.getElementById('close-crop-modal').addEventListener('click', closeCropModal);
document.getElementById('btn-cancel-crop').addEventListener('click', closeCropModal);

if (document.getElementById('input-photo')) {
    document.getElementById('input-photo').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                imageToCrop.src = event.target.result;
                openCropModal();

                // Initialize cropper
                setTimeout(() => {
                    if (cropper) {
                        cropper.destroy();
                    }
                    cropper = new Cropper(imageToCrop, {
                        aspectRatio: 1,
                        viewMode: 1,
                        dragMode: 'move',
                        autoCropArea: 0.9,
                        restore: false,
                        guides: true,
                        center: true,
                        highlight: false,
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false,
                    });
                }, 200);
            };
            reader.readAsDataURL(file);
        }
    });
}

document.getElementById('btn-save-crop').addEventListener('click', function () {
    if (cropper) {
        const canvas = cropper.getCroppedCanvas({
            width: 300,
            height: 300,
        });

        currentBase64Photo = canvas.toDataURL('image/jpeg', 0.9);

        document.getElementById('preview-photo').src = currentBase64Photo;
        document.getElementById('sidebar-profile-img').src = currentBase64Photo;

        closeCropModal();
    }
});

// --- SAVE FUNCTIONS ---
function saveProfile() {
    const name = document.getElementById('input-name').value;
    const email = document.getElementById('input-email').value;
    const instansi = document.getElementById('input-instansi').value;
    const imageToSave = currentBase64Photo || localStorage.getItem('prof_image') || "";

    localStorage.setItem('prof_name', name);
    localStorage.setItem('prof_email', email);
    localStorage.setItem('prof_instansi', instansi);

    if (currentBase64Photo) {
        localStorage.setItem('prof_image', currentBase64Photo);
    }

    // Push to Firebase
    database.ref('dashboard_settings/profile').set({
        name: name,
        email: email,
        instansi: instansi,
        image: imageToSave
    });

    document.getElementById('display-name').innerText = name;
    document.getElementById('display-email').innerText = email;

    showToast("Profil berhasil diperbarui!");
}

function saveLocation() {
    const fieldId = document.getElementById('input-field-id').value || "sawah_001";
    const deviceId = document.getElementById('input-device-id').value || "esp32_001";
    const areaSize = document.getElementById('input-area-size').value || "1500";
    const lat = document.getElementById('input-lat').value;
    const lng = document.getElementById('input-lng').value;
    const locName = document.getElementById('input-loc-name') ? document.getElementById('input-loc-name').value : "Andoolo, Konawe Selatan";
    const plantDate = document.getElementById('input-plant-date') ? document.getElementById('input-plant-date').value : "";
    const plantMethod = document.getElementById('input-plant-method') ? document.getElementById('input-plant-method').value : "tanam_pindah";

    // Simpan format lama untuk backward compatibility
    localStorage.setItem('loc_lat', lat);
    localStorage.setItem('loc_lng', lng);
    localStorage.setItem('loc_name', locName);

    // Push ke Firebase format lama
    database.ref('dashboard_settings/location').set({
        lat: lat,
        lng: lng,
        name: locName
    });

    // Push ke Firebase Arsitektur Baru (Multi-Sawah)
    database.ref('fields/' + fieldId).set({
        name: locName,
        size_m2: parseFloat(areaSize),
        device_id: deviceId,
        plant_date: plantDate,
        plant_method: plantMethod,
        location: {
            lat: parseFloat(lat),
            lng: parseFloat(lng)
        }
    });

    showToast("Sawah dan Alat IoT berhasil didaftarkan!");
}

function saveCalibration() {
    const deviceId = document.getElementById('cal-device-select').value;
    if (!deviceId) {
        alert("Silakan pilih alat IoT terlebih dahulu!");
        return;
    }

    const tempCal = document.getElementById('cal-temp').value;
    const humCal = document.getElementById('cal-hum').value;
    const dryCal = document.getElementById('cal-dry').value;
    const wetCal = document.getElementById('cal-wet').value;

    database.ref('calibration/' + deviceId).set({
        tempOffset: tempCal,
        humOffset: humCal,
        adcDry: dryCal,
        adcWet: wetCal
    });

    showToast("Nilai kalibrasi tersimpan ke server untuk " + deviceId + "!");
}

function loadCalibrationData(deviceId) {
    if (!deviceId) {
        document.getElementById('cal-temp').value = 0;
        document.getElementById('cal-hum').value = 0;
        document.getElementById('cal-dry').value = 4095;
        document.getElementById('cal-wet').value = 1500;
        return;
    }

    database.ref('calibration/' + deviceId).once('value').then(snapshot => {
        const data = snapshot.val();
        if (data) {
            document.getElementById('cal-temp').value = data.tempOffset || 0;
            document.getElementById('cal-hum').value = data.humOffset || 0;
            document.getElementById('cal-dry').value = data.adcDry || 4095;
            document.getElementById('cal-wet').value = data.adcWet || 1500;
        } else {
            document.getElementById('cal-temp').value = 0;
            document.getElementById('cal-hum').value = 0;
            document.getElementById('cal-dry').value = 4095;
            document.getElementById('cal-wet').value = 1500;
        }
    });
}

function editField(id) {
    database.ref('fields/' + id).once('value').then((snapshot) => {
        const data = snapshot.val();
        if (data) {
            document.getElementById('input-field-id').value = id;
            document.getElementById('input-loc-name').value = data.name;
            document.getElementById('input-device-id').value = data.device_id;
            document.getElementById('input-area-size').value = data.size_m2;
            document.getElementById('input-lat').value = data.location.lat;
            document.getElementById('input-lng').value = data.location.lng;
            if (document.getElementById('input-plant-date')) document.getElementById('input-plant-date').value = data.plant_date || "";
            if (document.getElementById('input-plant-method')) document.getElementById('input-plant-method').value = data.plant_method || "tanam_pindah";

            // Pindah marker
            if (map && marker) {
                const newLatLng = new L.LatLng(data.location.lat, data.location.lng);
                marker.setLatLng(newLatLng);
                map.setView(newLatLng);
            }

            // Scroll ke atas
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

// Fungsi Hapus Sawah
function deleteField(id) {
    if (confirm("Yakin ingin menghapus Sawah " + id + " beserta Alat IoT-nya?")) {
        database.ref('fields/' + id).remove().then(() => {
            showToast("Sawah berhasil dihapus!");
        });
    }
}

// Fungsi Pencarian Peta
function searchMap() {
    const query = document.getElementById('map-search-input').value;
    if (!query) return;

    const btn = document.querySelector('button[onclick="searchMap()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Mencari...';

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => {
            btn.innerHTML = originalText;
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                const displayName = data[0].display_name;

                // Update inputs
                document.getElementById('input-lat').value = lat.toFixed(5);
                document.getElementById('input-lng').value = lon.toFixed(5);
                document.getElementById('input-loc-name').value = displayName.split(',')[0];

                // Pindahkan map dan marker
                if (map && marker) {
                    const newLatLng = new L.LatLng(lat, lon);
                    marker.setLatLng(newLatLng);
                    map.setView(newLatLng, 13);
                }

                showToast("Lokasi ditemukan!");
            } else {
                alert("Lokasi tidak ditemukan! Coba kata kunci lain.");
            }
        })
        .catch(err => {
            btn.innerHTML = originalText;
            console.error("Gagal mencari lokasi:", err);
            alert("Gagal mencari lokasi. Periksa koneksi internet Anda.");
        });
}

// --- MOBILE MENU TOGGLE ---
// BUG FIX: This was incorrectly nested inside searchMap() in the original code
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebar = document.querySelector('aside');
if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('hidden');
        sidebar.classList.toggle('absolute');
        sidebar.classList.toggle('z-50');
        sidebar.classList.toggle('w-64');
        sidebar.classList.toggle('h-full');
        sidebar.classList.toggle('shadow-2xl');
    });
}

// --- INITIALIZATION ON LOAD ---
window.onload = () => {
    // Cek URL params (misal: settings.html?tab=location)
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');

    if (tabParam) {
        switchTab(tabParam);
    }

    // Dengarkan dari Firebase agar selalu tersinkron
    database.ref('dashboard_settings').on('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            if (data.profile) {
                localStorage.setItem('prof_name', data.profile.name);
                localStorage.setItem('prof_email', data.profile.email);
                localStorage.setItem('prof_instansi', data.profile.instansi);
                if (data.profile.image) {
                    localStorage.setItem('prof_image', data.profile.image);
                    currentBase64Photo = data.profile.image;
                    if (document.getElementById('sidebar-profile-img')) document.getElementById('sidebar-profile-img').src = data.profile.image;
                    if (document.getElementById('preview-photo')) document.getElementById('preview-photo').src = data.profile.image;
                }

                document.getElementById('input-name').value = data.profile.name;
                document.getElementById('display-name').innerText = data.profile.name;
                document.getElementById('input-email').value = data.profile.email;
                document.getElementById('display-email').innerText = data.profile.email;
                document.getElementById('input-instansi').value = data.profile.instansi;
            }
            if (data.location) {
                localStorage.setItem('loc_name', data.location.name);
                localStorage.setItem('loc_lat', data.location.lat);
                localStorage.setItem('loc_lng', data.location.lng);

                document.getElementById('input-lat').value = data.location.lat;
                document.getElementById('input-lng').value = data.location.lng;
                if (document.getElementById('input-loc-name')) document.getElementById('input-loc-name').value = data.location.name;

                // Pindahkan marker peta jika map sudah diinisialisasi
                if (map && marker) {
                    const newLatLng = new L.LatLng(data.location.lat, data.location.lng);
                    marker.setLatLng(newLatLng);
                    map.setView(newLatLng);
                }
            }
            if (data.calibration) {
                document.getElementById('cal-temp').value = data.calibration.tempOffset || 0;
                document.getElementById('cal-hum').value = data.calibration.humOffset || 0;
                document.getElementById('cal-dry').value = data.calibration.adcDry || 4095;
                document.getElementById('cal-wet').value = data.calibration.adcWet || 1500;
            }
        }
    });

    // Dengarkan daftar Sawah (fields)
    database.ref('fields').on('value', snapshot => {
        const fieldsData = snapshot.val();
        const tbody = document.getElementById('fields-table-body');
        const calSelect = document.getElementById('cal-device-select');

        if (tbody) tbody.innerHTML = '';
        if (calSelect) calSelect.innerHTML = '<option value="">-- Pilih Alat --</option>';

        if (fieldsData) {
            for (const [id, data] of Object.entries(fieldsData)) {
                // Populate Table
                if (tbody) {
                    const tr = document.createElement('tr');
                    tr.className = "border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition";
                    tr.innerHTML = `
                        <td class="p-3 font-mono text-blue-600 dark:text-blue-400 font-bold">${AgroSecurity.escapeHTML(id)}</td>
                        <td class="p-3 font-medium">${AgroSecurity.escapeHTML(data.name)}</td>
                        <td class="p-3 font-mono text-green-600 dark:text-green-400">${AgroSecurity.escapeHTML(data.device_id)}</td>
                        <td class="p-3">${AgroSecurity.escapeHTML(data.size_m2)}</td>
                        <td class="p-3 text-center">
                            <button onclick="editField('${AgroSecurity.escapeHTML(id)}')" class="text-blue-500 hover:text-blue-700 mr-3" title="Edit"><i class="fas fa-edit"></i></button>
                            <button onclick="deleteField('${AgroSecurity.escapeHTML(id)}')" class="text-red-500 hover:text-red-700" title="Hapus"><i class="fas fa-trash"></i></button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                }

                // Populate Calibration Dropdown
                if (calSelect && data.device_id) {
                    const option = document.createElement('option');
                    option.value = data.device_id;
                    option.textContent = `${data.device_id} (Lokasi: ${data.name})`;
                    calSelect.appendChild(option);
                }
            }
        } else {
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500"><i class="fas fa-exclamation-circle mr-2"></i>Belum ada Sawah/Alat yang terdaftar.</td></tr>`;
        }
    });
};
