# Deploy BI+ Finance App ke VPS (Docker Compose)

Panduan ini mengasumsikan **Ubuntu/Debian, RAM 1–2 GB**, akses publik dengan
**HTTPS + Basic Auth** lewat Caddy.

Arsitektur yang dijalankan `docker-compose.yml`:

```
Internet ──443──> caddy (HTTPS + Basic Auth)
                     │ (jaringan internal Docker)
                     └─> app (Next.js standalone, :3000)
                            └─> db (PostgreSQL 16, :5432)
```

Hanya **port 80 & 443** yang terbuka ke internet. Database & app tidak bisa
diakses dari luar.

---

## 0. Yang dibutuhkan

- VPS Ubuntu 22.04/24.04 atau Debian 12
- Domain (opsional tapi **sangat** disarankan — perlu untuk HTTPS)
- Backup data lokal yang sudah ada (lihat langkah 3)

---

## 1. Siapkan VPS

SSH ke VPS, lalu:

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Swap 2 GB (WAJIB untuk RAM 1 GB saat build Next.js)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker          # atau logout & login lagi

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Verifikasi
docker --version && docker compose version && free -h
```

---

## 2. Kirim kode ke VPS

**JANGAN upload `node_modules` (731 MB) atau `.next` (226 MB)** — build dilakukan
di VPS. Yang perlu dikirim hanya kode + prisma (kecil).

Dari **Windows PowerShell** (folder project):

```powershell
# Ganti USER dan IP_VPS
$VPS = "user@203.0.113.10"
$SRC = "C:\Users\Administrator\Documents\Codex\2026-08-25\referenced-chatgpt-conversation-this-is-an\bi-plus-finance-app"
$DST = "/home/user/biplus"

ssh $VPS "mkdir -p $DST"

# Kirim hanya yang perlu (rsync dari Git Bash / WSL)
wsl rsync -avz --progress `
  --exclude node_modules --exclude .next --exclude .git `
  --exclude 'db_backup*.json' --exclude import_data.json `
  --exclude 'public/uploads' --exclude '*.log' `
  "$SRC/" "${VPS}:${DST}/"
```

Alternatif tanpa rsync: `scp -r` per folder (`app components lib prisma deploy public` +
`package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs tailwind*`).

---

## 3. Migrasi data keuangan (DB 9 MB)

**Di Windows** — dump database lokal:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" `
  -U postgres -d bi_plus_finance --no-owner --no-acl `
  -f biplus_local.sql
```

Kalau password diminta, ketik password Postgres lokal. Lalu kirim:

```powershell
scp biplus_local.sql user@203.0.113.10:/home/user/biplus/
```

---

## 4. Konfigurasi

Di VPS, dalam folder `biplus`:

```bash
cd ~/biplus
cp .env.production.example .env.production
chmod 600 .env.production
```

Buat password DB yang kuat:

```bash
openssl rand -base64 32        # → tempel ke POSTGRES_PASSWORD
```

Buat hash password Basic Auth (password login yang kamu ketik di browser):

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'PasswordLoginAnda'
# → keluaran $2a$14$....  tempel ke BASIC_AUTH_HASH (pakai kutip tunggal!)
```

Edit `.env.production`:

```bash
nano .env.production
```

Isi `APP_DOMAIN` dengan domain yang **A record-nya sudah diarahkan ke IP VPS**.

> ⚠️ Tanpa domain (pakai IP), HTTPS otomatis tidak bisa. Untuk uji coba, ubah
> `deploy/Caddyfile` baris pertama menjadi `:80 {` dan hapus blok `header
> Strict-Transport-Security`. Untuk pemakaian nyata, pakai domain.

---

## 5. Nyalakan

```bash
docker compose up -d --build      # build pertama 3–6 menit
docker compose ps                 # semua harus "running" / "exited (0)" untuk migrate
docker compose logs -f app        # pantau
```

Buka `https://domain-kamu.com` → browser meminta username & password.

---

## 6. Impor data keuangan

```bash
# Salin dump ke container DB lalu restore
docker compose cp biplus_local.sql db:/tmp/biplus.sql
docker compose exec -T db psql -U biplus -d bi_plus_finance -f /tmp/biplus.sql

# Verifikasi
docker compose exec -T db psql -U biplus -d bi_plus_finance -c \
  'SELECT (SELECT COUNT(*) FROM "InventoryItem") AS item,
          (SELECT COUNT(*) FROM "Sale") AS sale,
          (SELECT COUNT(*) FROM "CashTransaction") AS kas;'
```

Harusnya: item 16, sale 13, kas 46.

Upload foto unit (6 file, 1,1 MB) dari Windows:

```powershell
wsl scp -r "public/uploads/units" user@203.0.113.10:/tmp/units
```
lalu di VPS:
```bash
docker compose cp /tmp/units/. app:/app/public/uploads/units/
docker compose restart app
```

---

## 7. Backup rutin

```bash
chmod +x deploy/backup.sh
./deploy/backup.sh                    # hasil: backups/biplus_*.sql.gz

# Jadwalkan harian jam 02:00
crontab -e
# tambahkan:
0 2 * * * cd /home/user/biplus && ./deploy/backup.sh >> backups/cron.log 2>&1
```

---

## 8. Update aplikasi

```bash
cd ~/biplus
./deploy/backup.sh                 # SELALU backup dulu
# kirim kode baru dari Windows (rsync), lalu:
docker compose up -d --build
docker compose logs -f app
```

---

## Perintah harian

| Kebutuhan | Perintah |
|---|---|
| Lihat status | `docker compose ps` |
| Lihat log app | `docker compose logs -f app` |
| Restart app | `docker compose restart app` |
| Matikan | `docker compose down` |
| Matikan + hapus data | `docker compose down -v` ⚠️ |
| Masuk psql | `docker compose exec db psql -U biplus -d bi_plus_finance` |

---

## Troubleshooting

**Build mati / `Killed` di tengah jalan**
RAM habis. Pastikan swap 2 GB aktif (`free -h`), atau build di mesin lain lalu
kirim image: `docker save | ssh 'docker load'`.

**502 Bad Gateway**
Container `app` belum siap atau crash. Cek `docker compose logs app`. Pastikan
`migrate` selesai (exit 0) sebelum `app` start.

**Login Basic Auth ditolak terus**
`BASIC_AUTH_HASH` harus hasil `caddy hash-password` **utuh** dan dibungkus
kutip tunggal di `.env.production` — karakter `$` bisa diinterpolasi shell.

**Data hilang setelah rebuild**
Jangan pernah `docker compose down -v` — itu menghapus volume `pgdata`.

**Upload foto gagal / hilang**
Foto disimpan di volume `uploads`. Pastikan volume itu ada
(`docker volume ls | grep uploads`) dan container jalan sebagai user yang
punya izin tulis ke `/app/public/uploads`.
