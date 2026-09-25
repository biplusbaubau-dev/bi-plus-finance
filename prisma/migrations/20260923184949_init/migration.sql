-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('IN_STOCK', 'SOLD', 'RESERVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'EWALLET', 'PAYLATER', 'OTHER');

-- CreateEnum
CREATE TYPE "CashTransactionType" AS ENUM ('SALE', 'PURCHASE', 'EXPENSE', 'OTHER_INCOME');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('OPERATIONAL', 'TRANSPORT', 'PACKAGING', 'MARKETING', 'ADMIN', 'INTERNET', 'EQUIPMENT', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "imei" TEXT,
    "brand" TEXT NOT NULL DEFAULT 'Apple',
    "model" TEXT NOT NULL,
    "storage" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "batteryHealth" INTEGER,
    "condition" TEXT NOT NULL,
    "status" "InventoryStatus" NOT NULL DEFAULT 'IN_STOCK',
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "supplier" TEXT,
    "purchasePrice" INTEGER NOT NULL,
    "additionalCost" INTEGER NOT NULL DEFAULT 0,
    "askingPrice" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "supplier" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "notes" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "salePrice" INTEGER NOT NULL,
    "sellingCost" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "customerName" TEXT,
    "notes" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtherIncome" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtherIncome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTransaction" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "CashTransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "income" INTEGER NOT NULL DEFAULT 0,
    "expense" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "purchaseId" TEXT,
    "saleId" TEXT,
    "expenseId" TEXT,
    "otherIncomeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_code_key" ON "InventoryItem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_imei_key" ON "InventoryItem"("imei");

-- CreateIndex
CREATE INDEX "InventoryItem_status_purchaseDate_idx" ON "InventoryItem"("status", "purchaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_inventoryItemId_key" ON "Purchase"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_invoiceNo_key" ON "Sale"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_inventoryItemId_key" ON "Sale"("inventoryItemId");

-- CreateIndex
CREATE INDEX "Expense_date_category_idx" ON "Expense"("date", "category");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransaction_purchaseId_key" ON "CashTransaction"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransaction_saleId_key" ON "CashTransaction"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransaction_expenseId_key" ON "CashTransaction"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransaction_otherIncomeId_key" ON "CashTransaction"("otherIncomeId");

-- CreateIndex
CREATE INDEX "CashTransaction_date_type_idx" ON "CashTransaction"("date", "type");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_otherIncomeId_fkey" FOREIGN KEY ("otherIncomeId") REFERENCES "OtherIncome"("id") ON DELETE CASCADE ON UPDATE CASCADE;
