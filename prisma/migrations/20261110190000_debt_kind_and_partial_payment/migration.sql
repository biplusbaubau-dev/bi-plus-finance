-- Pisahkan utang PayLater dari pinjaman (mis. PNM) + dukungan pembayaran sebagian.

-- 1. Jenis utang
CREATE TYPE "DebtKind" AS ENUM ('PAYLATER', 'LOAN');

ALTER TABLE "PayLaterDebt"
  ADD COLUMN "kind" "DebtKind" NOT NULL DEFAULT 'PAYLATER';

-- 2. Pembayaran sebagian: simpan nominal yang sudah dibayar per cicilan
ALTER TABLE "PayLaterInstallment"
  ADD COLUMN "paidAmount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: cicilan yang sudah PAID dianggap terbayar penuh
UPDATE "PayLaterInstallment"
   SET "paidAmount" = "amount"
 WHERE "status" = 'PAID';

-- Tandai pinjaman (bukan PayLater) supaya tampil di kartu terpisah
UPDATE "PayLaterDebt"
   SET "kind" = 'LOAN'
 WHERE "code" ILIKE 'PNM%' OR "debtName" ILIKE '%pnm%' OR "debtName" ILIKE '%pinjam%';

CREATE INDEX "PayLaterDebt_kind_idx" ON "PayLaterDebt"("kind");
