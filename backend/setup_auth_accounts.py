"""
AgroSense — Script untuk Membuat Akun Firebase Authentication
Jalankan SEKALI saja untuk membuat akun admin dan tester di Firebase Auth.

Prasyarat: pip install firebase-admin
"""

import firebase_admin
from firebase_admin import credentials, auth, db
import os

# Inisialisasi Firebase Admin
cred_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
cred = credentials.Certificate(cred_path)

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://smartagriculture-1a4d6-default-rtdb.asia-southeast1.firebasedatabase.app/'
    })

# Daftar akun yang akan dibuat
accounts = [
    {
        'email': 'admin@agrosense.app',
        'password': 'admin123',
        'display_name': 'Administrator',
        'role': 'admin'
    },
    {
        'email': 'tester@agrosense.app',
        'password': 'tester123',
        'display_name': 'Tester',
        'role': 'tester'
    }
]

print("=" * 50)
print("  MEMBUAT AKUN FIREBASE AUTHENTICATION")
print("=" * 50)

for acc in accounts:
    try:
        # Cek apakah akun sudah ada
        try:
            existing = auth.get_user_by_email(acc['email'])
            print(f"\n[!] Akun {acc['email']} sudah ada (UID: {existing.uid})")
            uid = existing.uid
        except auth.UserNotFoundError:
            # Buat akun baru
            user = auth.create_user(
                email=acc['email'],
                password=acc['password'],
                display_name=acc['display_name']
            )
            uid = user.uid
            print(f"\n[+] Akun berhasil dibuat:")
            print(f"    Email   : {acc['email']}")
            print(f"    Password: {acc['password']}")
            print(f"    UID     : {uid}")
        
        # Simpan role ke Realtime Database
        db.reference(f'users/{uid}').set({
            'email': acc['email'],
            'role': acc['role'],
            'display_name': acc['display_name']
        })
        print(f"    Role '{acc['role']}' disimpan ke database.")
        
    except Exception as e:
        print(f"\n[-] Gagal membuat akun {acc['email']}: {e}")

print("\n" + "=" * 50)
print("  SELESAI! Anda sekarang bisa login dengan:")
print("  - admin / admin123  (role: admin)")
print("  - tester / tester123 (role: tester)")
print("=" * 50)
