#!/bin/bash
set -e
cd /opt/biplus
TS=$(date +%Y%m%d-%H%M%S)
docker exec biplus-finance-db-1 pg_dump -U biplus bi_plus_finance > "backup/pre-wipe-$TS.sql"
echo "backup: backup/pre-wipe-$TS.sql ($(du -h "backup/pre-wipe-$TS.sql" | cut -f1))"

docker exec -i biplus-finance-db-1 psql -U biplus -d bi_plus_finance -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE "CashTransaction" SET "installmentId" = NULL WHERE "installmentId" IS NOT NULL;
SELECT 'kas sebelum: ' || (SUM(income) - SUM(expense)) AS info FROM "CashTransaction";
DELETE FROM "PayLaterInstallment";
DELETE FROM "PayLaterDebt";
COMMIT;
SQL

echo "=== SESUDAH ==="
q(){ docker exec biplus-finance-db-1 psql -U biplus -d bi_plus_finance -tAc "$1"; }
echo "utang: $(q 'select count(*) from "PayLaterDebt"')  cicilan: $(q 'select count(*) from "PayLaterInstallment"')  kas: $(q 'select sum(income)-sum(expense) from "CashTransaction"')"
echo "PAYLATER_PAYMENT tersisa: $(q 'select count(*)||\' baris, total \'||coalesce(sum(expense),0) from "CashTransaction" where type=\'PAYLATER_PAYMENT\'')"
echo "utuh -> purchase: $(q 'select count(*) from "Purchase"')  unit: $(q 'select count(*) from "InventoryItem"')  penjualan: $(q 'select count(*) from "Sale"')"
