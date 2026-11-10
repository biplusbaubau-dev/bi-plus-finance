import { prisma } from "@/lib/prisma";
import { ExpenseForm, InstallmentForm, OtherIncomeForm, SaleForm, ShopeeBillForm } from "@/components/forms";
import { rupiah, dateId } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TransactionsPage() {
  const [units, pending, recentSales] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { status: { in: ["IN_STOCK", "RESERVED"] } }, select: { id: true, code: true, model: true, storage: true }, orderBy: { code: "asc" } }),
    prisma.payLaterInstallment.findMany({ where: { status: "PENDING" }, include: { debt: { include: { purchase: { include: { inventoryItem: true } } } } }, orderBy: { dueDate: "asc" } }),
    prisma.sale.findMany({ orderBy: { date: "desc" }, take: 5, include: { inventoryItem: true } }),
  ]);
  const openInstallments = pending.map((i) => ({
    id: i.id,
    kind: i.debt.kind as "PAYLATER" | "LOAN",
    remaining: Math.max(0, i.amount - i.paidAmount),
    label: i.debt.purchase ? `${i.debt.purchase.inventoryItem.code} · ${i.debt.code} · bulan ${i.installmentNo}` : `${i.debt.code} · bulan ${i.installmentNo}`,
  })).filter((i) => i.remaining > 0);
  const installments = openInstallments.map((i) => ({ id: i.id, amount: i.remaining, label: i.label }));
  const totalPer = (kind: "PAYLATER" | "LOAN") => openInstallments.filter((i) => i.kind === kind).reduce((s, i) => s + i.remaining, 0);
  const payLaterTotal = totalPer("PAYLATER");
  const loanTotal = totalPer("LOAN");
  return <div className="space-y-6"><div><p className="text-sm text-zinc-500">Catat pergerakan bisnis</p><h1 className="text-2xl font-bold sm:text-3xl">Transaksi</h1></div><section className="grid gap-4 md:grid-cols-2"><div className="card"><h2 className="mb-4 text-lg font-bold">Jual unit</h2><SaleForm units={units} /></div><div className="card"><h2 className="mb-4 text-lg font-bold">Bayar tagihan Shopee</h2>{payLaterTotal > 0 ? <ShopeeBillForm totalPending={payLaterTotal} /> : <p className="text-sm text-zinc-500">Tidak ada tagihan PayLater.</p>}</div><div className="card"><h2 className="mb-4 text-lg font-bold">Bayar tagihan PNM</h2>{loanTotal > 0 ? <ShopeeBillForm totalPending={loanTotal} kind="LOAN" /> : <p className="text-sm text-zinc-500">Tidak ada tagihan pinjaman.</p>}</div><div className="card"><h2 className="mb-4 text-lg font-bold">Catat expense</h2><ExpenseForm /></div><div className="card"><h2 className="mb-4 text-lg font-bold">Pemasukan lain</h2><OtherIncomeForm /></div></section>{recentSales.length > 0 && <section className="card overflow-x-auto"><h2 className="mb-3 text-lg font-bold">Penjualan terbaru</h2><table className="table"><thead><tr><th>Invoice</th><th>Tanggal</th><th>Unit</th><th className="text-right">Total</th><th></th></tr></thead><tbody>{recentSales.map((s) => <tr key={s.id}><td><span className="font-mono text-xs">{s.invoiceNo}</span></td><td>{dateId(s.date)}</td><td>{s.inventoryItem.code} · {s.inventoryItem.model}</td><td className="text-right font-semibold">{rupiah(s.salePrice - s.sellingCost)}</td><td><Link href={`/sales/${s.id}/invoice`} className="text-xs font-semibold text-blue-600 hover:underline">Lihat invoice</Link></td></tr>)}</tbody></table></section>}</div>;
}
