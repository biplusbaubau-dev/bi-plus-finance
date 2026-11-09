#!/usr/bin/env bash
# ==========================================================
# Jalur C: pakai nginx yang SUDAH ADA sebagai pintu masuk HTTPS,
# Caddy dinonaktifkan. Aman untuk VPS yang nginx-nya sudah melayani
# website lain — konfigurasi nginx lain tidak disentuh.
#
#   Internet -> nginx :443 (TLS + Basic Auth) -> app :3000 (Docker)
#
# Pakai:
#   sudo bash use-nginx.sh
# ==========================================================
set -Eeuo pipefail

APP_DIR="/opt/biplus"
NGINX_SITE="/etc/nginx/sites-available/biplus"
HTPASS="/etc/nginx/.htpasswd-biplus"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }
trap 'die "Gagal di baris $LINENO."' ERR

[ "$(id -u)" -eq 0 ] || die "Jalankan sebagai root"
command -v nginx >/dev/null 2>&1 || die "nginx tidak terpasang di sistem ini"
[ -d "$APP_DIR" ] || die "$APP_DIR tidak ditemukan"
cd "$APP_DIR"

DOMAIN="$(grep -E '^APP_DOMAIN=' .env 2>/dev/null | cut -d= -f2- || true)"
[ -n "${DOMAIN:-}" ] || die "APP_DOMAIN tidak ditemukan di $APP_DIR/.env (jalankan bootstrap dulu)"
BASIC_USER="$(grep -E '^BASIC_AUTH_USER=' .env 2>/dev/null | cut -d= -f2- || echo biplus)"
ok "Domain: $DOMAIN"

# ==========================================================
# 1. Pastikan port 443 bebas
# ==========================================================
log "Memeriksa port 443"
if ss -tlnp 2>/dev/null | awk '$4 ~ /:443$/' | grep -q .; then
  LINE="$(ss -tlnp 2>/dev/null | awk '$4 ~ /:443$/' | head -1)"
  PID="$(echo "$LINE" | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
  warn "Port 443 sudah dipakai: $(ps -p "${PID:-0}" -o comm= 2>/dev/null || echo '?') (PID ${PID:-?})"
  warn "Kalau itu nginx, abaikan pesan ini (normal)."
else
  ok "Port 443 bebas"
fi

# ==========================================================
# 2. Matikan Caddy (tidak dipakai di jalur ini)
# ==========================================================
log "Menonaktifkan Caddy"
docker compose stop caddy >/dev/null 2>&1 && ok "Caddy dihentikan" || warn "Caddy memang tidak jalan"
# Cegah Caddy hidup lagi saat `docker compose up -d` berikutnya
cat > docker-compose.override.yml <<'EOF'
# Jalur nginx: Caddy tidak dipakai. Port 80/443 milik nginx sistem.
services:
  caddy:
    profiles: ["caddy"]
EOF
ok "docker-compose.override.yml dibuat (caddy masuk profile 'caddy')"

# ==========================================================
# 3. Pastikan app jalan
# ==========================================================
log "Menyalakan app + db + migrate"
docker compose up -d db migrate app
log "Menunggu app siap"
READY=0
for i in $(seq 1 40); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/ || echo GAGAL)"
  if [ "$CODE" = "200" ]; then READY=1; ok "App merespons 200"; break; fi
  sleep 5
done
[ "$READY" -eq 1 ] || {
  err_out="$(docker compose logs --tail=25 app 2>&1 || true)"
  printf '%s\n' "$err_out"
  die "App tidak merespons di :3000"
}

# ==========================================================
# 4. Basic Auth (htpasswd) — password dari .env tidak dipakai,
#    karena itu hash bcrypt untuk Caddy (formatnya beda).
# ==========================================================
log "Menyiapkan Basic Auth"
if [ -f "$HTPASS" ]; then
  ok "Sudah ada: $HTPASS (tidak ditimpa)"
else
  printf '  Password login web untuk user "%s" [tekan ENTER = generate]: ' "$BASIC_USER"
  read -rs NWPASS || true; echo
  if [ -z "${NWPASS:-}" ]; then
    NWPASS="$(head -c 64 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-16)"
    while [ "${#NWPASS}" -lt 16 ]; do
      NWPASS="$NWPASS$(head -c 32 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')"
    done
    NWPASS="${NWPASS:0:16}"
    echo "  Password digenerate"
  fi
  docker run --rm httpd:alpine htpasswd -nbB "$BASIC_USER" "$NWPASS" > "$HTPASS"
  chmod 640 "$HTPASS"
  chown root:www-data "$HTPASS" 2>/dev/null || true
  ok "Dibuat: $HTPASS"
  cat >> /root/biplus-credentials.txt <<EOF

---
Login nginx (HTTPS)
URL          : https://$DOMAIN
Login web    : $BASIC_USER
Password web : $NWPASS
EOF
  chmod 600 /root/biplus-credentials.txt
  ok "Password disimpan di /root/biplus-credentials.txt"
fi

# ==========================================================
# 5. Konfigurasi nginx
# ==========================================================
log "Menulis konfigurasi nginx"
if [ -f "$NGINX_SITE" ]; then
  cp -f "$NGINX_SITE" "$NGINX_SITE.bak.$(date +%s)"
  warn "Konfigurasi lama dibackup"
fi

cat > "$NGINX_SITE" <<EOF
# BI+ Finance — dibuat otomatis oleh use-nginx.sh
# Caddy tidak dipakai; nginx yang menjadi pintu masuk HTTPS.
# Port 80 TIDAK di-listen di sini karena sudah dipakai nginx lain.

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;

    server_name $DOMAIN;

    # Diisi certbot. Komentar dulu agar nginx -t lolos sebelum certbot.
    # ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    auth_basic           "BI+ Finance";
    auth_basic_user_file $HTPASS;

    server_tokens off;
    client_max_body_size 8M;

    add_header X-Frame-Options        "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host  \$host;

        proxy_set_header Upgrade    \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 120s;
    }
}
EOF
ok "Ditulis: $NGINX_SITE"

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/biplus
ok "Symlink dibuat di sites-enabled"

log "Menguji konfigurasi nginx"
if ! nginx -t 2>&1 | sed 's/^/    /'; then
  die "Konfigurasi nginx tidak valid — perbaiki dulu, file ada di $NGINX_SITE"
fi
ok "nginx -t lolos"

# ==========================================================
# 6. Sertifikat HTTPS dengan certbot
# ==========================================================
log "Memasang sertifikat HTTPS"
if ! command -v certbot >/dev/null 2>&1; then
  warn "certbot belum ada, memasang…"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx
fi

if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  ok "Sertifikat sudah ada untuk $DOMAIN"
else
  warn "Meminta sertifikat baru (butuh DNS mengarah ke VPS ini)"
  echo "  DNS cek: $(getent hosts "$DOMAIN" | awk '{print $1}' | head -1) -> IP VPS: $(curl -4 -fsS --max-time 8 https://api.ipify.org || echo '?')"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
          --register-unsafely-without-email --redirect 2>&1 | tail -12 \
    || warn "certbot gagal — cek DNS/port 80. Konfigurasi tetap tersimpan."
fi

log "Reload nginx"
systemctl reload nginx && ok "nginx direload"

# ==========================================================
# 7. Verifikasi
# ==========================================================
log "Verifikasi"
echo "  app lokal     : $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/)"
echo "  https (tanpa auth) : $(curl -s -k -o /dev/null -w '%{http_code}' --max-time 25 "https://$DOMAIN/" || echo 'GAGAL')  (401 = login aktif, benar)"
echo "  https (dengan auth): $(curl -s -k -o /dev/null -w '%{http_code}' --max-time 25 -u "$BASIC_USER:$(grep -oP "Password web : \K.*" /root/biplus-credentials.txt | tail -1)" "https://$DOMAIN/" || echo GAGAL)"
echo
echo "  Cek manual dengan password asli:"
echo "    curl -k -u $BASIC_USER 'https://$DOMAIN/' -I"

log "SELESAI"
echo "  Buka       : https://$DOMAIN"
echo "  Kredensial : sudo cat /root/biplus-credentials.txt"
echo "  Log app    : docker compose logs -f app"
