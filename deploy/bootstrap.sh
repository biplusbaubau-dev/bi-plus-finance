#!/usr/bin/env bash
# ==========================================================
# BI+ Finance App — bootstrap VPS (Ubuntu/Debian)
# Sekali jalan: swap, Docker, firewall, clone, build, restore DB.
#
# Pakai:
#   sudo bash bootstrap.sh
# ==========================================================
set -Eeuo pipefail

APP_DIR="/opt/biplus"
REPO_URL="https://github.com/biplusbaubau-dev/bi-plus-finance.git"
CRED_FILE="/root/biplus-credentials.txt"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "Gagal di baris $LINENO. Periksa pesan di atas."' ERR

# Password acak alfanumerik (aman di dalam DATABASE_URL).
# JANGAN pakai pola  tr </dev/urandom | head -c 32 :
# head menutup pipe -> tr kena SIGPIPE (exit 141) -> set -o pipefail
# membuat script mati. Juga jangan filter sekali jalan, karena hasilnya
# bisa kurang dari 32 karakter. Loop sampai cukup.
genpass() {
  local p="" chunk
  while [ "${#p}" -lt 32 ]; do
    chunk="$(head -c 64 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')"
    p="$p$chunk"
  done
  printf '%s' "${p:0:32}"
}

[ "$(id -u)" -eq 0 ] || die "Jalankan sebagai root: sudo bash bootstrap.sh"

# ==========================================================
# 0. Info sistem
# ==========================================================
log "Memeriksa sistem"
. /etc/os-release 2>/dev/null || true
echo "  OS   : ${PRETTY_NAME:-unknown}"
echo "  RAM  : $(free -h | awk '/^Mem:/{print $2}')"
echo "  Disk : $(df -h / | awk 'NR==2{print $4}') bebas"

# ==========================================================
# 1. Swap 2 GB
# ==========================================================
log "Memeriksa swap"
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "Swap 2 GB diaktifkan"
else
  ok "Swap sudah ada: $(free -h | awk '/^Swap:/{print $2}')"
fi
sysctl -qw vm.swappiness=10 || true

# ==========================================================
# 2. Docker + Compose plugin
# ==========================================================
log "Memeriksa Docker"
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker belum ada, memasang…"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates git rsync
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  ok "Docker terpasang: $(docker --version)"
else
  ok "Docker sudah ada: $(docker --version)"
fi
docker compose version >/dev/null 2>&1 || die "Plugin 'docker compose' tidak ada"
ok "Compose: $(docker compose version --short)"

# ==========================================================
# 3. Firewall (port SSH dideteksi, tidak hardcode)
# ==========================================================
log "Mengatur firewall"
apt-get install -y -qq ufw >/dev/null 2>&1 || true

SSH_PORT="${SSH_PORT:-$(echo "${SSH_CONNECTION:-}" | awk '{print $4}')}"
if [ -z "${SSH_PORT:-}" ] || ! [[ "$SSH_PORT" =~ ^[0-9]+$ ]]; then
  SSH_PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}' || true)"
fi
[ -n "${SSH_PORT:-}" ] || SSH_PORT=22
echo "  Port SSH terdeteksi: $SSH_PORT"

ufw --force reset >/dev/null 2>&1 || true
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow "$SSH_PORT"/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp  comment 'HTTP'  >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
ok "UFW aktif — diizinkan: $SSH_PORT(SSH), 80, 443"
warn "Postgres (5432) & app (3000) TIDAK dibuka ke internet (by design)"

# ==========================================================
# 4. Ambil kode
# ==========================================================
log "Mengambil kode aplikasi"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git fetch --quiet origin
  git reset --hard --quiet origin/master
  ok "Repo diperbarui ke $(git rev-parse --short HEAD)"
else
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --quiet "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
  ok "Repo di-clone: $(git rev-parse --short HEAD)"
fi
chmod +x deploy/*.sh 2>/dev/null || true

# ==========================================================
# 5. Konfigurasi
#    PENTING: `docker compose` hanya membaca file bernama ".env"
#    (atau lewat --env-file). File ".env.production" DIABAIKAN,
#    sehingga ${APP_DOMAIN} jadi kosong dan Caddy gagal dengan
#    "server block without keys". Jadi konfigurasi disimpan di .env
# ==========================================================
log "Menyiapkan konfigurasi"
ENV_FILE="$APP_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  ok ".env sudah ada — dilewati (tidak ditimpa)"
else
  PUBLIC_IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || curl -4 -fsS --max-time 10 https://ifconfig.me || true)"
  if [ -z "$PUBLIC_IP" ]; then
    PUBLIC_IP="$(hostname -I | awk '{print $1}')"
    warn "IP publik tidak terdeteksi, pakai IP lokal: $PUBLIC_IP"
  fi
  NIP_DEFAULT="$(echo "$PUBLIC_IP" | tr '.' '-').nip.io"

  echo
  echo "  Domain untuk aplikasi."
  echo "  - Punya domain? ketik, mis: finance.domainkamu.com"
  echo "  - Belum punya? tekan ENTER → pakai $NIP_DEFAULT (HTTPS tetap jalan)"
  printf '  Domain: '
  read -r DOMAIN || true
  DOMAIN="${DOMAIN:-$NIP_DEFAULT}"
  # Bersihkan spasi / skema yang mungkin ikut tersalin saat paste
  DOMAIN="$(echo "$DOMAIN" | tr -d ' \t' | sed 's#^https\?://##; s#/$##')"
  [ -n "$DOMAIN" ] || die "Domain tidak valid"

  # Password DB: alfanumerik agar aman di dalam DATABASE_URL.
  DB_PASS="$(genpass)"
  [ "${#DB_PASS}" -eq 32 ] || die "Gagal membuat password DB (panjang ${#DB_PASS})"

  echo
  printf '  Username login web [biplus]: '
  read -r BASIC_USER || true
  [ -n "${BASIC_USER:-}" ] || BASIC_USER="biplus"

  printf '  Password login web (tidak ditampilkan): '
  read -rs BASIC_PASS || true; echo
  [ -n "${BASIC_PASS:-}" ] || die "Password tidak boleh kosong"

  log "Membuat hash password (Caddy)"
  # caddy hash-password butuh ARGUMEN --plaintext, tidak mendukung stdin '-'
  BASIC_HASH="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$BASIC_PASS" 2>/dev/null | tail -1 | tr -d '\r')"
  [[ "$BASIC_HASH" == \$2* ]] || die "Gagal membuat hash password (keluaran: '$BASIC_HASH')"

  umask 077
  # Hash bcrypt mengandung '$'. Di file .env (yang dibaca Compose), setiap
  # '$' HARUS di-escape menjadi '$$' agar tidak dianggap variabel.
  # Compose mengubahnya kembali menjadi '$' saat interpolasi.
  HASH_ESCAPED="${BASIC_HASH//\$/\$\$}"
  cat > "$ENV_FILE" <<EOF
APP_DOMAIN=$DOMAIN

POSTGRES_USER=biplus
POSTGRES_PASSWORD=$DB_PASS
POSTGRES_DB=bi_plus_finance

# '$' di-escape sebagai '\$\$' karena file ini dibaca Docker Compose
BASIC_AUTH_USER=$BASIC_USER
BASIC_AUTH_HASH=$HASH_ESCAPED
EOF

  cat > "$CRED_FILE" <<EOF
BI+ Finance — kredensial (JANGAN dishare)
=========================================
URL          : https://$DOMAIN
Login web    : $BASIC_USER
Password web : $BASIC_PASS

DB user      : biplus
DB password  : $DB_PASS
DB name      : bi_plus_finance

Catatan: password di sini plaintext agar bisa disalin.
Hapus file ini setelah disimpan aman:
  shred -u $CRED_FILE
EOF
  umask 022
  chmod 600 "$ENV_FILE" "$CRED_FILE"
  cp -f "$ENV_FILE" "$APP_DIR/.env.production"
  ok "Konfigurasi dibuat — kredensial: $CRED_FILE"
fi

# Muat variabel ke shell untuk langkah restore
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
DBU="${POSTGRES_USER:-biplus}"
DBN="${POSTGRES_DB:-bi_plus_finance}"

# ==========================================================
# 6. Build & jalankan
# ==========================================================
log "Build & start (3–8 menit, harap tunggu)"
docker compose up -d --build

log "Menunggu database siap"
DB_READY=0
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U "$DBU" >/dev/null 2>&1; then
    DB_READY=1; ok "PostgreSQL siap"; break
  fi
  sleep 10
done
[ "$DB_READY" -eq 1 ] || die "PostgreSQL tidak siap setelah 5 menit — cek: docker compose logs db"

log "Status container"
docker compose ps

# ==========================================================
# 7. Restore data keuangan (opsional)
# ==========================================================
SQL_FILE=""
for f in /root/biplus_local.sql "$APP_DIR/biplus_local.sql" /tmp/biplus_local.sql; do
  if [ -f "$f" ]; then SQL_FILE="$f"; break; fi
done

if [ -n "$SQL_FILE" ]; then
  log "Restore database dari $SQL_FILE"
  # migrate deploy sudah membuat tabel kosong; restore butuh skema bersih
  docker compose exec -T db psql -U "$DBU" -d "$DBN" -q \
    -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null
  ok "Skema dikosongkan"

  docker compose cp "$SQL_FILE" db:/tmp/restore.sql
  if docker compose exec -T db psql -U "$DBU" -d "$DBN" -q -f /tmp/restore.sql 2>/tmp/restore.err; then
    ok "Restore selesai"
  else
    warn "Ada pesan saat restore (biasanya aman):"
    head -5 /tmp/restore.err 2>/dev/null | sed 's/^/    /' || true
  fi
  docker compose exec -T db rm -f /tmp/restore.sql || true

  log "Verifikasi data"
  docker compose exec -T db psql -U "$DBU" -d "$DBN" -c \
    'SELECT (SELECT COUNT(*) FROM "InventoryItem")       AS inventory,
            (SELECT COUNT(*) FROM "Sale")                AS sale,
            (SELECT COUNT(*) FROM "CashTransaction")     AS kas,
            (SELECT COUNT(*) FROM "PayLaterInstallment") AS cicilan;' || true
else
  warn "biplus_local.sql tidak ditemukan — database masih kosong."
  warn "Kirim dari Windows:  scp -P <portSSH> biplus_local.sql root@<IP>:/root/"
  warn "lalu jalankan ulang: sudo bash /root/bootstrap.sh"
fi

# ==========================================================
# 8. Foto unit (opsional)
# ==========================================================
if [ -d /tmp/units ] && [ "$(ls -A /tmp/units 2>/dev/null | wc -l)" -gt 0 ]; then
  log "Menyalin foto unit"
  docker compose cp /tmp/units/. app:/app/public/uploads/units/ 2>/dev/null || true
  docker compose restart app >/dev/null
  ok "Foto disalin: $(ls /tmp/units | wc -l) file"
else
  warn "Folder /tmp/units tidak ada — foto unit dilewati"
fi

# ==========================================================
# 9. Ringkasan + cek kesehatan
# ==========================================================
DOMAIN_FINAL="$(grep -E '^APP_DOMAIN=' "$ENV_FILE" | cut -d= -f2-)"
log "Memeriksa kesehatan aplikasi"
# CATATAN: `expose: 3000` TIDAK mem-publish port ke host, jadi tes dari
# host SELALU gagal. Uji lewat container caddy (lihat deploy/diagnose.sh).
HTTP_CODE="$(docker compose exec -T caddy wget -q -O- -T 10 --server-response http://app:3000/ 2>&1 | awk '/HTTP\//{c=$2} END{print c+0}' || true)"
[ "${HTTP_CODE:-0}" -eq 0 ] && HTTP_CODE="?"
echo "  app internal :3000 -> HTTP $HTTP_CODE"
docker compose ps --format '{{.Service}} => {{.State}}' 2>/dev/null | sed 's/^/  /' || true

log "SELESAI"
echo "  URL        : https://$DOMAIN_FINAL"
echo "  Kredensial : sudo cat $CRED_FILE"
echo
echo "  Perintah harian (di $APP_DIR):"
echo "    docker compose logs -f app"
echo "    docker compose restart app"
echo "    ./deploy/backup.sh"
echo
if [[ "$DOMAIN_FINAL" == *.nip.io ]]; then
  echo "  Domain nip.io dipakai — HTTPS otomatis, tidak perlu beli domain."
else
  echo "  Pastikan DNS A record $DOMAIN_FINAL sudah mengarah ke IP VPS ini."
  echo "  Cek dengan: dig +short $DOMAIN_FINAL"
fi
echo "  Tunggu ~30 detik, lalu buka https://$DOMAIN_FINAL"
