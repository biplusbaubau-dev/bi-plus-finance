/*
  Warnings:

  - A unique constraint covering the columns `[installmentId]` on the table `CashTransaction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PAID');

-- AlterEnum
ALTER TYPE "CashTransactionType" ADD VALUE 'PAYLATER_PAYMENT';

-- AlterTable
ALTER TABLE "CashTransaction" ADD COLUMN     "installmentId" TEXT;

-- CreateTable
CREATE TABLE "PayLaterDebt" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "totalLiability" INTEGER NOT NULL,
    "tenorMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayLaterDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayLaterInstallment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "installmentNo" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PayLaterInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayLaterDebt_code_key" ON "PayLaterDebt"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PayLaterDebt_purchaseId_key" ON "PayLaterDebt"("purchaseId");

-- CreateIndex
CREATE INDEX "PayLaterDebt_startDate_idx" ON "PayLaterDebt"("startDate");

-- CreateIndex
CREATE INDEX "PayLaterInstallment_dueDate_status_idx" ON "PayLaterInstallment"("dueDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayLaterInstallment_debtId_installmentNo_key" ON "PayLaterInstallment"("debtId", "installmentNo");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransaction_installmentId_key" ON "CashTransaction"("installmentId");

-- AddForeignKey
ALTER TABLE "PayLaterDebt" ADD CONSTRAINT "PayLaterDebt_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLaterInstallment" ADD CONSTRAINT "PayLaterInstallment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "PayLaterDebt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "PayLaterInstallment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
