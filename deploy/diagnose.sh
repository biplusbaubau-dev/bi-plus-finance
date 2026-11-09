#!/usr/bin/env bash
# ==========================================================
# Diagnostik BI+ Finance — kumpulkan semua bukti dalam 1 layar.
#
# Kenapa perlu: `expose: 3000` TIDAK mem-publish port ke host, jadi
# `curl 127.0.0.1:3000` dari VPS SELALU gagal (bukan tanda app mati).
# Script ini menguji dari DALAM jaringan Docker.
#
# Pakai:
#   sudo bash deploy/diagnose.sh
# ==========================================================
set -uo pipefail
cd /opt/biplus 2>/dev/null || { echo "Jalankan dari /opt/biplus"; exit 1; }

H() { printf '\n\033[1;36m━━━ %s ━━━\033[0m\n' "$*"; }
g() { printf '\033[33m%s\033[0m\n' "$*" 2>/dev/null || echo "$*"; }
ok() { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
no() { printf '\033[1;31m  ✗ %s\033[0m\n' "$*"; }

DOMAIN="$(grep -E '^APP_DOMAIN=' .env 2>/dev/null | cut -d= -f2- || echo '?')"

H "1. STATUS CONTAINER"
docker compose ps 2>&1

H "2. HEALTHCHECK APP (penyebab 'unhealthy')"
g "docker inspect --format '{{json .State.Health}}'"
HEALTH="$(docker inspect biplus-finance-app-1 --format '{{json .State.Health}}' 2>/dev/null || echo '{}')"
echo "$HEALTH" | head -c 1200
echo
if echo "$HEALTH" | grep -q '"ExitCode":1'; then
  no "Healthcheck GAGAL (perhatikan Output di atas)"
fi

H "3. LOG APP (40 baris terakhir) — BAGIAN TERPENTING"
docker compose logs --tail=40 app 2>&1

H "4. TES DARI DALAM JARINGAN DOCKER (cara yang benar)"
g "Dari container caddy -> http://app:3000"
CADDY_TEST="$(docker compose exec -T caddy wget -q -O- -T 10 --server-response http://app:3000/ 2>&1 | head -12 || true)"
echo "${CADDY_TEST:-  (tidak ada output)}"
echo
g "Dari container app sendiri -> http://127.0.0.1:3000"
docker compose exec -T app node -e "
fetch('http://127.0.0.1:3000/',{redirect:'manual'}).then(r=>{console.log('  HTTP',r.status);return r.text()}).then(t=>console.log('  body:',t.slice(0,200).replace(/\s+/g,' '))).catch(e=>console.log('  ERROR:',e.message))
" 2>&1 | head -6

H "5. APAKAH PROSES NODE HIDUP DI DALAM APP?"
docker compose exec -T app sh -c 'ps aux | grep -v grep | grep -E "node|server" | head -5' 2>&1 || no "tidak bisa masuk container"
echo
g "Port yang di-listen di dalam container app:"
docker compose exec -T app sh -c 'netstat -tln 2>/dev/null | head -6 || ss -tln 2>/dev/null | head -6 || echo "  (netstat/ss tidak ada)"' 2>&1

H "6. LOG CADDY — apakah app dianggap mati?"
docker compose logs --tail=15 caddy 2>&1 | grep -Ei "error|fail|dial|refused|reverse_proxy" | tail -10 || g "  (tidak ada error)"

H "7. SERTIFIKAT HTTPS"
g "Domain: $DOMAIN"
echo "  HTTP   -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://$DOMAIN/" || echo 'GAGAL')"
echo "  HTTPS  -> $(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN/" || echo 'GAGAL')"
echo "  HTTPS tanpa -k (verifikasi sertifikat asli):"
curl -s -o /dev/null -w "   status: %{http_code}  ssl_verify: %{ssl_verify_result}\n" --max-time 20 "https://$DOMAIN/" 2>&1 || echo "   (gagal konek)"
echo
g "File sertifikat di volume Caddy:"
docker compose exec -T caddy sh -c 'ls -1 /data/caddy/certificates/*/ 2>/dev/null | head -5 || echo "  (belum ada)"' 2>&1

H "8. KONEKTIVITAS DATABASE DARI APP"
docker compose exec -T app node -e "
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
p.\$queryRaw\`SELECT 1 as ok\`.then(r=>console.log('  ✓ DB terhubung:',JSON.stringify(r))).catch(e=>console.log('  ✗ DB ERROR:',e.message.split('\n')[0])).finally(()=>p.\$disconnect())
" 2>&1 | head -5

H "9. ISI DATABASE (restore sudah jalan?)"
docker compose exec -T db psql -U biplus -d bi_plus_finance -tAc \
  "SELECT 'InventoryItem='||(SELECT COUNT(*) FROM \"InventoryItem\")||' Sale='||(SELECT COUNT(*) FROM \"Sale\")||' Kas='||(SELECT COUNT(*) FROM \"CashTransaction\");" 2>&1 | head -3

H "10. MEMORY / OOM?"
free -h 2>&1 | head -3
echo
g "Container yang pernah OOM (ExitCode 137):"
docker ps -a --filter "name=biplus" --format '{{.Names}}: {{.Status}}' 2>&1

H "SELESAI — kirim seluruh output ini"
