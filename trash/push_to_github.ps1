# Langkah-langkah Push ke GitHub & Setup Secrets
# Ganti USERNAME dan REPO_NAME sesuai akun GitHub kamu

$USERNAME = "USERNAME_GITHUB_KAMU"
$REPO_NAME = "agrosense-backend"

# Commit dan push
git -C "C:\xampp\htdocs\smart_agriculture" config user.email "email@kamu.com"
git -C "C:\xampp\htdocs\smart_agriculture" config user.name $USERNAME
git -C "C:\xampp\htdocs\smart_agriculture" commit -m "feat: setup GitHub Actions untuk prediksi LSTM harian"
git -C "C:\xampp\htdocs\smart_agriculture" remote add origin "https://github.com/$USERNAME/$REPO_NAME.git"
git -C "C:\xampp\htdocs\smart_agriculture" push -u origin master
