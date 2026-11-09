-- CreateEnum
CREATE TYPE "AccessoryTrxType" AS ENUM ('PURCHASE', 'SALE', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "OtherIncome" ADD COLUMN     "isLoan" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PayLaterDebt" ADD COLUMN     "accessoryId" TEXT,
ADD COLUMN     "debtName" TEXT,
ALTER COLUMN "purchaseId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "UnitImage" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "caption" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accessory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "purchasePrice" INTEGER NOT NULL DEFAULT 0,
    "sellingPrice" INTEGER NOT NULL DEFAULT 0,
    "isAsset" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accessory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessoryTransaction" (
    "id" TEXT NOT NULL,
    "accessoryId" TEXT NOT NULL,
    "type" "AccessoryTrxType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnitImage_inventoryItemId_idx" ON "UnitImage"("inventoryItemId");

-- CreateIndex
CREATE INDEX "AccessoryTransaction_accessoryId_idx" ON "AccessoryTransaction"("accessoryId");

-- AddForeignKey
ALTER TABLE "PayLaterDebt" ADD CONSTRAINT "PayLaterDebt_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitImage" ADD CONSTRAINT "UnitImage_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryTransaction" ADD CONSTRAINT "AccessoryTransaction_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

