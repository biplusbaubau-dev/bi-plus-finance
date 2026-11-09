import { CashTransactionType, InventoryStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type Period = { from?: Date; to?: Date };
export function periodWhere(period: Period): Prisma.DateTimeFilter | undefined {
  if (!period.from && !period.to) return undefined;
  return { ...(period.from ? { gte: period.from } : {}), ...(period.to ? { lte: period.to } : {}) };
}

export async function dashboardData(period: Period = {}) {
  const date = periodWhere(period);
  const [sales, expenses, incomes, inventory, ledger, installments, debts, accessories, recentSales] = await Promise.all([
    prisma.sale.findMany({ where: { date }, include: { inventoryItem: true }, orderBy: { date: "asc" } }),
    prisma.expense.findMany({ where: { date } }),
    prisma.otherIncome.findMany({ where: { date } }),
    prisma.inventoryItem.findMany(),
    prisma.cashTransaction.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.payLaterInstallment.findMany({ where: { status: "PENDING" }, orderBy: { dueDate: "asc" }, include: { debt: { include: { purchase: { include: { inventoryItem: true } }, accessory: true } } } }),
    prisma.payLaterDebt.findMany({
      where: { OR: [
        { purchase: { inventoryItem: { status: { not: InventoryStatus.RETURNED } } } },
        { accessoryId: { not: null } },
        { purchaseId: null, accessoryId: null },
      ]},
      include: { installments: true, purchase: { include: { inventoryItem: true } }, accessory: true },
    }),
    prisma.accessory.findMany(),
    prisma.sale.findMany({ include: { inventoryItem: true }, orderBy: { date: "desc" }, take: 5 }),
  ]);
  const omzet = sales.reduce((sum, sale) => sum + sale.salePrice, 0);
  const cogs = sales.reduce((sum, sale) => sum + sale.inventoryItem.purchasePrice + sale.inventoryItem.additionalCost, 0);
  const sellingCost = sales.reduce((sum, sale) => sum + sale.sellingCost, 0);
  const totalExpense = expenses.reduce((sum, item) => sum + item.amount, 0) + sellingCost;
  const grossProfit = omzet - cogs;
  const debtIncomeIds = new Set(debts.filter((d) => d.purchaseId === null && d.accessoryId === null && d.debtName).map((d) => d.debtName));
  const operationalIncomes = incomes.filter((item) => !debtIncomeIds.has(item.source) && !item.isLoan);
  const netProfit = grossProfit - totalExpense + operationalIncomes.reduce((sum, item) => sum + item.amount, 0);
  const cashBalance = ledger.reduce((sum, item) => sum + item.income - item.expense, 0);
  const available = inventory.filter((item) => item.status === InventoryStatus.IN_STOCK);
  const inventoryValue = available.reduce((sum, item) => sum + item.purchasePrice + item.additionalCost, 0);
  const accessoryValue = accessories.filter((a) => !a.isAsset).reduce((sum, a) => sum + a.stock * a.purchasePrice, 0);
  const assetValue = accessories.filter((a) => a.isAsset).reduce((sum, a) => sum + a.stock * a.purchasePrice, 0);
  const totalInventoryValue = inventoryValue + accessoryValue;
  const estimatedProfit = available.reduce((sum, item) => sum + Math.max(0, (item.askingPrice ?? 0) - item.purchasePrice - item.additionalCost), 0);
  // Sum remaining from ALL debts (both HP and accessories)
  const payLaterOutstanding = debts.reduce((sum, d) => {
    const paid = d.installments.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
    return sum + (d.totalLiability - paid);
  }, 0);
  const daysUntilDue = (due: Date) => Math.ceil((due.getTime() - Date.now()) / 86400000);

  const pendingInstallments = installments.map((i) => ({
    id: i.id,
    debtId: i.debtId,
    installmentNo: i.installmentNo,
    dueDate: i.dueDate,
    amount: i.amount,
    daysUntilDue: daysUntilDue(i.dueDate),
    status: i.status,
    purchase: i.debt?.purchase?.inventoryItem,
    accessory: i.debt?.accessory,
  }));

  const currentMonth = new Date();
  const payLaterDueThisMonth = installments.filter((item) => item.dueDate.getMonth() === currentMonth.getMonth() && item.dueDate.getFullYear() === currentMonth.getFullYear()).reduce((sum, item) => sum + item.amount, 0);
  const monthly = new Map<string, { month: string; omzet: number; profit: number; cashflow: number }>();
  const ensureMonth = (value: Date) => { const key = value.toISOString().slice(0, 7); if (!monthly.has(key)) monthly.set(key, { month: key, omzet: 0, profit: 0, cashflow: 0 }); return monthly.get(key)!; };
  sales.forEach((sale) => { const row = ensureMonth(sale.date); row.omzet += sale.salePrice; row.profit += sale.salePrice - sale.inventoryItem.purchasePrice - sale.inventoryItem.additionalCost - sale.sellingCost; });
  expenses.forEach((item) => { ensureMonth(item.date).profit -= item.amount; });
  incomes.forEach((item) => { ensureMonth(item.date).profit += item.amount; });
  ledger.forEach((item) => { ensureMonth(item.date).cashflow += item.income - item.expense; });

  return { omzet, cogs, totalExpense, grossProfit, netProfit, cashBalance, inventoryValue: totalInventoryValue, unitValue: inventoryValue, accessoryValue, assetValue, totalAssets: totalInventoryValue + assetValue + cashBalance, estimatedProfit, payLaterOutstanding, payLaterDueThisMonth, payLaterCount: installments.length, available: available.length, sold: inventory.filter((i) => i.status === InventoryStatus.SOLD).length, sales, expenses, ledger, monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)), recentSales, pendingInstallments };}

export function makeInvoice() { return `INV-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${Math.floor(Math.random() * 900 + 100)}`; }
export const ledgerLabel: Record<CashTransactionType, string> = { SALE: "Penjualan", PURCHASE: "Pembelian stok", EXPENSE: "Pengeluaran", OTHER_INCOME: "Pemasukan lain", PAYLATER_PAYMENT: "Bayar cicilan PayLater" };

export type Granularity = "daily" | "weekly" | "monthly";

export async function trendData(period: Period = {}, granularity: Granularity = "monthly") {
  const date = periodWhere(period);
  const [sales, expenses, incomes, ledger] = await Promise.all([
    prisma.sale.findMany({ where: { date }, include: { inventoryItem: true }, orderBy: { date: "asc" } }),
    prisma.expense.findMany({ where: { date } }),
    prisma.otherIncome.findMany({ where: { date } }),
    prisma.cashTransaction.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
  ]);

  const bucket = (value: Date): string => {
    const d = value;
    if (granularity === "daily") return d.toISOString().slice(0, 10);
    if (granularity === "weekly") {
      const week = new Date(d);
      week.setDate(d.getDate() - d.getDay());
      return week.toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 7);
  };

  const label = (key: string): string => {
    if (granularity === "daily" || granularity === "weekly") {
      const d = new Date(key + "T00:00:00");
      return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(d);
    }
    const [year, month] = key.split("-");
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
  };

  const buckets = new Map<string, { key: string; label: string; income: number; expense: number; profit: number; sales: number; units: number; balance: number }>();
  const ensure = (value: Date) => {
    const key = bucket(value);
    if (!buckets.has(key)) buckets.set(key, { key, label: label(key), income: 0, expense: 0, profit: 0, sales: 0, units: 0, balance: 0 });
    return buckets.get(key)!;
  };

  sales.forEach((sale) => {
    const row = ensure(sale.date);
    row.sales += sale.salePrice;
    row.profit += sale.salePrice - sale.inventoryItem.purchasePrice - sale.inventoryItem.additionalCost - sale.sellingCost;
    row.income += sale.salePrice - sale.sellingCost;
    row.units += 1;
  });
  expenses.forEach((item) => { const row = ensure(item.date); row.expense += item.amount; row.profit -= item.amount; });
  incomes.forEach((item) => { const row = ensure(item.date); row.income += item.amount; row.profit += item.amount; });

  let balance = 0;
  const sortedLedger = [...ledger].sort((a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
  for (const item of sortedLedger) {
    balance += item.income - item.expense;
    const key = bucket(item.date);
    const row = buckets.get(key);
    if (row) row.balance = balance;
  }

  const data = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (let i = 1; i < data.length; i++) {
    if (data[i].balance === 0) data[i].balance = data[i - 1].balance;
  }
  return { granularity, data };
}
