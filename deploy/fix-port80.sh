#!/usr/bin/env bash
# ==========================================================
# Perbaiki konflik port 80/443 yang menghalangi Caddy
#
# Error yang ditangani:
#   failed to bind host port 0.0.0.0:80/tcp: address already in use
#
# Pakai:
#   sudo bash fix-port80.sh          (interaktif, tanya sebelum stop)
#   sudo bash fix-port80.sh --yes    (langsung stop tanpa tanya)
# ==========================================================
set -uo pipefail

APP_DIR="/opt/biplus"
ASSUME_YES=0
[ "${1:-}" = "--yes" ] && ASSUME_YES=1

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
err()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$*"; }
ask()  { # ask "pertanyaan" -> return 0 kalau ya
  [ "$ASSUME_YES" -eq 1 ] && return 0
  printf '\033[1;33m  ? %s [y/N]: \033[0m' "$1"
  read -r ans || true
  [[ "${ans:-}" =~ ^[Yy]$ ]]
}

[ "$(id -u)" -eq 0 ] || { err "Jalankan sebagai root: sudo bash $0"; exit 1; }
[ -d "$APP_DIR" ] || { err "Folder $APP_DIR tidak ditemukan"; exit 1; }
cd "$APP_DIR" || exit 1

# ==========================================================
# 1. Cari proses yang memegang port 80 / 443
# ==========================================================
log "Memeriksa apa yang memakai port 80 dan 443"

CONFLICT_FOUND=0
declare -a PROC_LINES=()

for PORT in 80 443; do
  LINE="$(ss -tlnp 2>/dev/null | awk -v p=":$PORT" '$4 ~ p"$"' | head -1)"
  if [ -z "$LINE" ]; then
    ok "Port $PORT bebas"
    continue
  fi
  CONFLICT_FOUND=1
  ADDR="$(echo "$LINE" | awk '{print $4}')"
  PID="$(echo "$LINE" | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
  PNAME=""
  [ -n "$PID" ] && PNAME="$(ps -p "$PID" -o comm= 2>/dev/null || true)"
  printf '\033[1;31m  ✗ Port %s DIPAKAI\033[0m\n' "$PORT"
  echo "      alamat : $ADDR"
  echo "      proses : ${PNAME:-?} (PID ${PID:-?})"
  PROC_LINES+=("$PORT|${PID:-}|${PNAME:-}")
done

if [ "$CONFLICT_FOUND" -eq 0 ]; then
  ok "Tidak ada konflik port — Caddy seharusnya bisa jalan"
  log "Menyalakan Caddy"
  docker compose up -d caddy
  sleep 6
  docker compose ps caddy
  exit 0
fi

# ==========================================================
# 2. Identifikasi pemilik: container Docker atau service sistem?
# ==========================================================
log "Mengidentifikasi pemilik port"

DOCKER_CONTAINERS=""
for PORT in 80 443; do
  C="$(docker ps --filter "publish=$PORT" --format '{{.Names}}' 2>/dev/null | head -5 || true)"
  [ -n "$C" ] && DOCKER_CONTAINERS="$DOCKER_CONTAINERS $C"
done
DOCKER_CONTAINERS="$(echo "$DOCKER_CONTAINERS" | tr ' ' '\n' | sort -u | sed '/^$/d')"

SERVICES=""
for svc in nginx apache2 httpd caddy lighttpd; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    SERVICES="$SERVICES $svc"
  fi
done
SERVICES="$(echo "$SERVICES" | sed 's/^ *//; s/ *$//')"

if [ -n "$DOCKER_CONTAINERS" ]; then
  echo
  warn "Container Docker memakai port ini:"
  echo "$DOCKER_CONTAINERS" | sed 's/^/      • /'
  warn "Container itu mungkin website/panel lain di VPS ini."
  if ask "Hentikan container di atas?"; then
    while IFS= read -r c; do
      [ -z "$c" ] && continue
      docker stop "$c" >/dev/null 2>&1 && ok "Dihentikan: $c" || err "Gagal stop $c"
    done <<< "$DOCKER_CONTAINERS"
  fi
fi

if [ -n "$SERVICES" ]; then
  echo
  warn "Service sistem aktif yang biasanya memakai port 80/443: $SERVICES"
  warn "Kalau service ini melayani website lain, JANGAN dihentikan."
  if ask "Hentikan & nonaktifkan ($SERVICES)?"; then
    for s in $SERVICES; do
      systemctl stop "$s" >/dev/null 2>&1 && ok "stop $s" || err "gagal stop $s"
      systemctl disable "$s" >/dev/null 2>&1 && ok "disable $s (tidak autostart)" || true
    done
  fi
fi

# ==========================================================
# 3. Cek ulang
# ==========================================================
log "Memeriksa ulang port"
STILL=0
for PORT in 80 443; do
  if ss -tlnp 2>/dev/null | awk -v p=":$PORT" '$4 ~ p"$"' | head -1 | grep -q .; then
    LINE="$(ss -tlnp 2>/dev/null | awk -v p=":$PORT" '$4 ~ p"$"' | head -1)"
    PID="$(echo "$LINE" | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
    err "Port $PORT MASIH dipakai (PID ${PID:-?}, proses: $(ps -p "${PID:-0}" -o comm= 2>/dev/null || echo '?'))"
    STILL=1
  else
    ok "Port $PORT bebas"
  fi
done

if [ "$STILL" -eq 1 ]; then
  echo
  err "Port masih terpakai. Opsi manual:"
  echo "    ss -tlnp | grep -E ':(80|443)\\s'        # lihat pemilik"
  echo "    fuser -k 80/tcp                          # paksa lepas (hati-hati)"
  echo
  warn "Kalau prosesnya milik panel hosting (CyberPanel/aaPanel/Easypanel),"
  warn "jangan dimatikan sembarangan — gunakan subdomain lain atau hentikan"
  warn "lewat panel tersebut."
  exit 1
fi

# ==========================================================
# 4. Nyalakan Caddy
# ==========================================================
log "Menyalakan Caddy"
docker compose up -d caddy
sleep 8

log "Status container"
docker compose ps

log "Log Caddy (30 baris terakhir)"
docker compose logs --tail=30 caddy || true

# ==========================================================
# 5. Verifikasi
# ==========================================================
DOMAIN="$(grep -E '^APP_DOMAIN=' .env 2>/dev/null | cut -d= -f2- || true)"
log "Verifikasi"
echo "  app internal : $(curl -s -o /dev/null -w '%{http_code}' --max-time 20 http://127.0.0.1:3000/ || echo 000)"
if [ -n "${DOMAIN:-}" ]; then
  echo "  http  ://$DOMAIN -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://$DOMAIN/" || echo 000)"
  echo "  https ://$DOMAIN -> $(curl -s -k -o /dev/null -w '%{http_code}' --max-time 30 "https://$DOMAIN/" || echo 000)"
  echo
  echo "  Catatan: sertifikat Let's Encrypt butuh ~30-60 detik pada percobaan pertama."
  echo "  Pantau: docker compose logs -f caddy"
fi

log "SELESAI"
echo "  Buka: https://${DOMAIN:-<domain>}"
echo "  Kredensial: sudo cat /root/biplus-credentials.txt"
