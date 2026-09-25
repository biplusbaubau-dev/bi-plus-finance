import { ExpenseCategory, InventoryStatus, PaymentMethod, PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const d = (day: string) => new Date(`${day}T08:00:00.000Z`);

async function createPurchase(input: { code: string; imei: string; model: string; storage: string; color: string; batteryHealth: number; condition: string; date: string; supplier: string; purchasePrice: number; additionalCost: number; askingPrice: number }) {
  const { date, ...itemData } = input;
  const item = await prisma.inventoryItem.create({ data: { ...itemData, brand: "Apple", purchaseDate: d(date), status: InventoryStatus.IN_STOCK } });
  const purchase = await prisma.purchase.create({ data: { date: d(input.date), supplier: input.supplier, paymentMethod: PaymentMethod.TRANSFER, inventoryItemId: item.id } });
  await prisma.cashTransaction.create({ data: { date: d(input.date), type: "PURCHASE", description: `Beli ${item.model} ${item.storage}`, expense: input.purchasePrice + input.additionalCost, paymentMethod: "TRANSFER", purchaseId: purchase.id } });
  return item;
}
async function sell(itemId: string, date: string, salePrice: number, sellingCost: number, customer: string) {
  const sale = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.update({ where: { id: itemId }, data: { status: "SOLD" } });
    return tx.sale.create({ data: { invoiceNo: `INV-${date.replaceAll("-", "")}-${item.code}`, date: d(date), salePrice, sellingCost, paymentMethod: "TRANSFER", customerName: customer, inventoryItemId: itemId } });
  });
  await prisma.cashTransaction.create({ data: { date: d(date), type: "SALE", description: `Penjualan ${sale.invoiceNo}`, income: sale.salePrice - sale.sellingCost, paymentMethod: sale.paymentMethod, saleId: sale.id } });
}
async function main() {
  await prisma.cashTransaction.deleteMany(); await prisma.sale.deleteMany(); await prisma.purchase.deleteMany(); await prisma.expense.deleteMany(); await prisma.otherIncome.deleteMany(); await prisma.inventoryItem.deleteMany();
  const items = await Promise.all([
    createPurchase({ code: "BI-001", imei: "356938035643809", model: "iPhone 11", storage: "64GB", color: "Purple", batteryHealth: 86, condition: "Good", date: "2026-08-01", supplier: "Andi", purchasePrice: 2400000, additionalCost: 50000, askingPrice: 3000000 }),
    createPurchase({ code: "BI-002", imei: "356938035643810", model: "iPhone 11", storage: "128GB", color: "White", batteryHealth: 89, condition: "Good", date: "2026-08-04", supplier: "Raka", purchasePrice: 2850000, additionalCost: 75000, askingPrice: 3450000 }),
    createPurchase({ code: "BI-003", imei: "356938035643811", model: "iPhone XR", storage: "64GB", color: "Black", batteryHealth: 84, condition: "Good", date: "2026-08-07", supplier: "Mira", purchasePrice: 1900000, additionalCost: 50000, askingPrice: 2500000 }),
    createPurchase({ code: "BI-004", imei: "356938035643812", model: "iPhone 11", storage: "64GB", color: "Black", batteryHealth: 88, condition: "Excellent", date: "2026-08-10", supplier: "Andi", purchasePrice: 2450000, additionalCost: 50000, askingPrice: 3100000 }),
    createPurchase({ code: "BI-005", imei: "356938035643813", model: "iPhone 12", storage: "64GB", color: "Blue", batteryHealth: 87, condition: "Good", date: "2026-08-12", supplier: "Raka", purchasePrice: 3250000, additionalCost: 100000, askingPrice: 4050000 }),
  ]);
  await sell(items[0].id, "2026-08-15", 3000000, 25000, "Dimas"); await sell(items[2].id, "2026-08-21", 2500000, 15000, "Nadia");
  const expense = await prisma.expense.create({ data: { date: d("2026-08-22"), category: ExpenseCategory.MARKETING, amount: 150000, paymentMethod: PaymentMethod.EWALLET, description: "Iklan Instagram" } });
  await prisma.cashTransaction.create({ data: { date: expense.date, type: "EXPENSE", description: expense.description, expense: expense.amount, paymentMethod: expense.paymentMethod, expenseId: expense.id } });
  const income = await prisma.otherIncome.create({ data: { date: d("2026-08-24"), source: "Penjualan accessories", amount: 125000, paymentMethod: PaymentMethod.CASH } });
  await prisma.cashTransaction.create({ data: { date: income.date, type: "OTHER_INCOME", description: income.source, income: income.amount, paymentMethod: income.paymentMethod, otherIncomeId: income.id } });
}
main().finally(() => prisma.$disconnect());
