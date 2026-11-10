"use server";
import { InventoryStatus, PaymentMethod, ExpenseCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { makeInvoice } from "@/lib/finance";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
const num = (form: FormData, key: string) => { const v = Number(form.get(key)); if (!Number.isFinite(v) || v < 0) throw new Error(`${key} harus berupa angka positif.`); return Math.round(v); };
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const date = (form: FormData, key: string) => { const v = text(form, key); if (!v || Number.isNaN(Date.parse(v))) throw new Error("Tanggal tidak valid."); return new Date(`${v}T08:00:00`); };
const payment = (form: FormData) => text(form, "paymentMethod") as PaymentMethod;
export async function createPurchase(form: FormData) {
  const code = text(form, "code"); const imei = text(form, "imei") || null; const purchasePrice = num(form, "purchasePrice"); const additionalCost = num(form, "additionalCost"); const purchaseDate = date(form, "purchaseDate");
  const paymentMethod = payment(form);
  await prisma.$transaction(async (tx) => { const item = await tx.inventoryItem.create({ data: { code, imei, brand: "Apple", model: text(form, "model"), storage: text(form, "storage"), color: text(form, "color"), batteryHealth: text(form, "batteryHealth") ? num(form, "batteryHealth") : null, condition: text(form, "condition"), purchaseDate, supplier: text(form, "supplier") || null, purchasePrice, additionalCost, askingPrice: text(form, "askingPrice") ? num(form, "askingPrice") : null, notes: text(form, "notes") || null } }); const p = await tx.purchase.create({ data: { date: purchaseDate, supplier: item.supplier, paymentMethod, notes: item.notes, inventoryItemId: item.id } }); if (paymentMethod === "PAYLATER") { const totalLiability = num(form, "totalLiability"); const tenorMonths = num(form, "tenorMonths"); if (totalLiability < purchasePrice + additionalCost || tenorMonths < 1 || tenorMonths > 12) throw new Error("Total kewajiban PayLater dan tenor tidak valid."); const debt = await tx.payLaterDebt.create({ data: { code: `PL-${item.code}`, totalLiability, tenorMonths, startDate: purchaseDate, purchaseId: p.id } }); const monthly = Math.floor(totalLiability / tenorMonths); const remainder = totalLiability - monthly * tenorMonths; await tx.payLaterInstallment.createMany({ data: Array.from({ length: tenorMonths }, (_, index) => { const dueDate = new Date(purchaseDate); dueDate.setMonth(dueDate.getMonth() + index + 1); return { debtId: debt.id, installmentNo: index + 1, dueDate, amount: monthly + (index === tenorMonths - 1 ? remainder : 0) }; }) }); } else { await tx.cashTransaction.create({ data: { date: purchaseDate, type: "PURCHASE", description: `Beli ${item.model} ${item.storage} (${item.code})`, expense: purchasePrice + additionalCost, paymentMethod, purchaseId: p.id } }); } });
  revalidatePath("/"); revalidatePath("/inventory"); revalidatePath("/cashflow"); redirect("/inventory");
}
export async function updateInventory(form: FormData) { const id = text(form, "id"); const current = await prisma.inventoryItem.findUniqueOrThrow({ where: { id }, include: { sale: true } }); const financialLocked = current.status === "SOLD"; await prisma.$transaction(async (tx) => { await tx.inventoryItem.update({ where: { id }, data: { imei: text(form, "imei") || null, model: text(form, "model"), storage: text(form, "storage"), color: text(form, "color"), batteryHealth: text(form, "batteryHealth") ? num(form, "batteryHealth") : null, condition: text(form, "condition"), supplier: text(form, "supplier") || null, askingPrice: text(form, "askingPrice") ? num(form, "askingPrice") : null, notes: text(form, "notes") || null, ...(!financialLocked ? { purchaseDate: date(form, "purchaseDate"), purchasePrice: num(form, "purchasePrice"), additionalCost: num(form, "additionalCost"), status: text(form, "status") as InventoryStatus } : {}) } }); if (current.sale && text(form, "saleDate")) { const saleDate = date(form, "saleDate"); await tx.sale.update({ where: { id: current.sale.id }, data: { date: saleDate } }); await tx.cashTransaction.updateMany({ where: { saleId: current.sale.id }, data: { date: saleDate } }); } }); revalidatePath("/"); revalidatePath("/inventory"); revalidatePath("/cashflow"); revalidatePath(`/inventory/${id}/edit`); redirect("/inventory"); }
export async function duplicateInventory(form: FormData) { const id = text(form, "id"); const source = await prisma.inventoryItem.findUniqueOrThrow({ where: { id } }); const prefix = source.code.split("-")[0] || "BI"; const siblings = await prisma.inventoryItem.findMany({ where: { code: { startsWith: `${prefix}-` } }, select: { code: true } }); const next = siblings.reduce((max, row) => { const n = Number(row.code.split("-")[1]); return Number.isFinite(n) ? Math.max(max, n) : max; }, 0) + 1; const code = `${prefix}-${String(next).padStart(3, "0")}`; const copy = await prisma.$transaction(async (tx) => { const item = await tx.inventoryItem.create({ data: { code, brand: source.brand, model: source.model, storage: source.storage, color: source.color, batteryHealth: source.batteryHealth, condition: source.condition, status: "IN_STOCK", purchaseDate: new Date(), supplier: source.supplier, purchasePrice: source.purchasePrice, additionalCost: source.additionalCost, askingPrice: source.askingPrice, notes: source.notes ? `Duplikat ${source.code}. ${source.notes}` : `Duplikat ${source.code}` } }); const purchase = await tx.purchase.create({ data: { date: item.purchaseDate, supplier: item.supplier, paymentMethod: "CASH", notes: item.notes, inventoryItemId: item.id } }); await tx.cashTransaction.create({ data: { date: item.purchaseDate, type: "PURCHASE", description: `Beli ${item.model} ${item.storage} (${item.code})`, expense: item.purchasePrice + item.additionalCost, paymentMethod: "CASH", purchaseId: purchase.id } }); return item; }); revalidatePath("/"); revalidatePath("/inventory"); revalidatePath("/cashflow"); redirect(`/inventory/${copy.id}/edit`); }
export async function payInstallment(form: FormData) {
  const installmentId = text(form, "installmentId");
  const paidAt = date(form, "paidAt");
  const inputNominal = form.get("amount");
  await prisma.$transaction(async (tx) => {
    const installment = await tx.payLaterInstallment.findUniqueOrThrow({
      where: { id: installmentId },
      include: { debt: { include: { purchase: { include: { inventoryItem: true } } } } },
    });
    const sisa = installment.amount - installment.paidAmount;
    if (sisa <= 0) throw new Error("Cicilan ini sudah lunas.");
    const kosong = inputNominal === null || String(inputNominal).trim() === "";
    const amount = kosong ? sisa : Math.round(Number(inputNominal));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Nominal bayar harus lebih dari 0.");
    if (amount > sisa) throw new Error(`Nominal bayar (${amount}) melebihi sisa cicilan (${sisa}).`);
    const paidAmount = installment.paidAmount + amount;
    const lunas = paidAmount >= installment.amount;
    await tx.payLaterInstallment.update({
      where: { id: installmentId },
      data: { paidAmount, status: lunas ? "PAID" : "PENDING", paidAt: lunas ? paidAt : installment.paidAt },
    });
    const label = installment.debt.purchase
      ? `${installment.debt.code} — ${installment.debt.purchase.inventoryItem.code} bulan ${installment.installmentNo}`
      : `${installment.debt.code} bulan ${installment.installmentNo}`;
    // installmentId sengaja TIDAK diisi: kolomnya unik (satu transaksi kas per cicilan),
    // sedangkan pembayaran sebagian bisa terjadi berkali-kali untuk cicilan yang sama.
    await tx.cashTransaction.create({
      data: { date: paidAt, type: "PAYLATER_PAYMENT", description: `Cicilan ${label}${lunas ? "" : " (sebagian)"}`, expense: amount, paymentMethod: "PAYLATER" },
    });
  });
  revalidatePath("/");
  revalidatePath("/cashflow");
  revalidatePath("/transactions");
  redirect("/transactions");
}

export async function payShopeeBill(form: FormData) {
  const paidAt = date(form, "paidAt");
  const amount = num(form, "amount");
  if (amount <= 0) throw new Error("Nominal bayar harus lebih dari 0.");
  const kind = text(form, "kind") === "LOAN" ? "LOAN" : "PAYLATER";
  await prisma.$transaction(async (tx) => {
    const pending = await tx.payLaterInstallment.findMany({
      where: {
        status: "PENDING",
        debt: {
          kind,
          OR: [
            { purchase: { inventoryItem: { status: { not: "RETURNED" } } } },
            { accessoryId: { not: null } },
            { purchaseId: null, accessoryId: null },
          ],
        },
      },
      orderBy: [{ dueDate: "asc" }, { installmentNo: "asc" }],
      include: { debt: true },
    });
    const totalSisa = pending.reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount), 0);
    if (totalSisa <= 0) throw new Error("Tidak ada tagihan yang tersisa.");
    if (amount > totalSisa) throw new Error(`Nominal (${amount}) melebihi total tagihan tersisa (${totalSisa}).`);
    let left = amount;
    const codes = new Set<string>();
    for (const item of pending) {
      if (left <= 0) break;
      const sisa = item.amount - item.paidAmount;
      if (sisa <= 0) continue;
      const bayar = Math.min(sisa, left);
      left -= bayar;
      const paidAmount = item.paidAmount + bayar;
      const lunas = paidAmount >= item.amount;
      await tx.payLaterInstallment.update({
        where: { id: item.id },
        data: { paidAmount, status: lunas ? "PAID" : "PENDING", paidAt: lunas ? paidAt : null },
      });
      codes.add(item.debt.code);
    }
    // Dulu fungsi ini TIDAK membuat transaksi kas, jadi uang keluar tapi saldo tidak turun.
    await tx.cashTransaction.create({
      data: {
        date: paidAt,
        type: "PAYLATER_PAYMENT",
        description: `Bayar tagihan ${kind === "LOAN" ? "pinjaman" : "PayLater"} ${[...codes].join(", ")}`,
        expense: amount,
        paymentMethod: "PAYLATER",
      },
    });
  });
  revalidatePath("/");
  revalidatePath("/cashflow");
  revalidatePath("/transactions");
  redirect("/transactions");
}
export async function createSale(form: FormData) { const inventoryItemId = text(form, "inventoryItemId"); const salePrice = num(form, "salePrice"); const sellingCost = num(form, "sellingCost"); const saleDate = date(form, "saleDate"); await prisma.$transaction(async (tx) => { const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: inventoryItemId } }); if (item.status === InventoryStatus.SOLD) throw new Error("Unit ini sudah terjual."); if (item.status === InventoryStatus.RETURNED) throw new Error("Unit retur tidak dapat dijual."); await tx.inventoryItem.update({ where: { id: item.id }, data: { status: "SOLD" } }); const sale = await tx.sale.create({ data: { invoiceNo: makeInvoice(), date: saleDate, salePrice, sellingCost, paymentMethod: payment(form), customerName: text(form, "customerName") || null, notes: text(form, "notes") || null, inventoryItemId } }); await tx.cashTransaction.create({ data: { date: saleDate, type: "SALE", description: `Penjualan ${item.model} (${item.code})`, income: salePrice - sellingCost, paymentMethod: payment(form), saleId: sale.id } }); }); revalidatePath("/"); revalidatePath("/inventory"); revalidatePath("/cashflow"); redirect("/inventory"); }
export async function createExpense(form: FormData) { const expense = await prisma.$transaction(async (tx) => { const item = await tx.expense.create({ data: { date: date(form, "date"), category: text(form, "category") as ExpenseCategory, amount: num(form, "amount"), paymentMethod: payment(form), description: text(form, "description"), notes: text(form, "notes") || null } }); await tx.cashTransaction.create({ data: { date: item.date, type: "EXPENSE", description: item.description, expense: item.amount, paymentMethod: item.paymentMethod, expenseId: item.id } }); return item; }); void expense; revalidatePath("/"); revalidatePath("/cashflow"); redirect("/transactions"); }
export async function createOtherIncome(form: FormData) { await prisma.$transaction(async (tx) => { const item = await tx.otherIncome.create({ data: { date: date(form, "date"), source: text(form, "source"), amount: num(form, "amount"), paymentMethod: payment(form), notes: text(form, "notes") || null } }); await tx.cashTransaction.create({ data: { date: item.date, type: "OTHER_INCOME", description: item.source, income: item.amount, paymentMethod: item.paymentMethod, otherIncomeId: item.id } }); }); revalidatePath("/"); revalidatePath("/cashflow"); redirect("/transactions"); }
