#!/usr/bin/env bash
# ==========================================================
# Backup database BI+ Finance dari dalam Docker
# Pemakaian (di folder project, di VPS):
#   ./deploy/backup.sh
# Hasil: backups/biplus_YYYYmmdd_HHMMSS.sql.gz
# ==========================================================
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env.production ] && set -a && . ./.env.production && set +a

STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p backups
OUT="backups/biplus_${STAMP}.sql.gz"

echo "→ Dumping database ${POSTGRES_DB}…"
docker compose exec -T db \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --no-acl \
  | gzip -9 > "${OUT}"

SIZE="$(du -h "${OUT}" | cut -f1)"
echo "✓ Backup selesai: ${OUT} (${SIZE})"

# Simpan hanya 14 backup terakhir
ls -1t backups/biplus_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
echo "→ Total backup tersimpan: $(ls -1 backups/biplus_*.sql.gz 2>/dev/null | wc -l)"
