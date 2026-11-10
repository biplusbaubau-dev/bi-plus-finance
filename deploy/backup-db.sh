#!/bin/bash
# Backup harian database BiPlus (custom format, bisa langsung pg_restore).
# Dipasang via cron: 19:00 UTC = 02:00 WIB.
# Retensi 14 hari. Tiap file diverifikasi dengan `pg_restore --list` sebelum dianggap sah.
set -uo pipefail

CONTAINER="biplus-finance-db-1"
DB_USER="biplus"
DB_NAME="bi_plus_finance"
DEST="/root/biplus-backup"
KEEP_DAYS=14
LOG="/var/log/biplus-backup.log"

ts() { date +"%Y-%m-%d %H:%M:%S"; }
log() { echo "[$(ts)] $*" | tee -a "$LOG"; }

mkdir -p "$DEST"
STAMP=$(TZ=Asia/Jakarta date +%Y%m%d-%H%M)
OUT="$DEST/biplus-$STAMP.dump"

log "=== mulai backup $DB_NAME ==="

# 1. Pastikan container DB benar-benar hidup
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  log "GAGAL: container $CONTAINER tidak berjalan"
  exit 1
fi

# 2. Dump ke file sementara, baru di-rename kalau sukses (hindari file setengah jadi)
TMP="$OUT.part"
if ! docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$TMP" 2>>"$LOG"; then
  log "GAGAL: pg_dump error"
  rm -f "$TMP"
  exit 1
fi

# 3. Verifikasi arsip bisa dibaca & berisi tabel (pg_restore tidak bisa baca stdin, jadi copy dulu)
VERIFY="/tmp/biplus-verify.dump"
if ! docker cp "$TMP" "$CONTAINER:$VERIFY" >/dev/null 2>&1; then
  log "GAGAL: tidak bisa menyalin arsip ke container untuk verifikasi"
  rm -f "$TMP"
  exit 1
fi
docker exec "$CONTAINER" pg_restore --list "$VERIFY" > /tmp/biplus_restore_list.txt 2>>"$LOG"
RC=$?
docker exec "$CONTAINER" rm -f "$VERIFY" >/dev/null 2>&1
if [ $RC -ne 0 ] || [ ! -s /tmp/biplus_restore_list.txt ]; then
  log "GAGAL: arsip tidak valid (pg_restore --list error)"
  rm -f "$TMP"
  exit 1
fi
TABLES=$(grep -c "TABLE DATA" /tmp/biplus_restore_list.txt || true)
if [ "$TABLES" -lt 1 ]; then
  log "GAGAL: arsip tidak memuat data tabel apa pun"
  rm -f "$TMP"
  exit 1
fi

mv "$TMP" "$OUT"
SIZE=$(du -h "$OUT" | cut -f1)
log "OK: $OUT ($SIZE, $TABLES tabel)"

# 4. Retensi
DELETED=$(find "$DEST" -maxdepth 1 -name "biplus-*.dump" -type f -mtime +"$KEEP_DAYS" -print -delete | wc -l)
TOTAL=$(find "$DEST" -maxdepth 1 -name "biplus-*.dump" -type f | wc -l)
log "retensi: $DELETED file dihapus (>$KEEP_DAYS hari), sisa $TOTAL file"

# 5. Cek ruang disk, beri peringatan kalau menipis
USE=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "$USE" -ge 85 ]; then
  log "PERINGATAN: disk / terpakai ${USE}%"
fi

log "=== selesai ==="
