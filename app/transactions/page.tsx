import { prisma } from "@/lib/prisma";
import { ExpenseForm, InstallmentForm, OtherIncomeForm, SaleForm } from "@/components/forms";
import { rupiah, dateId } from "@/lib/format";
import Link from "next/link";

export default async function TransactionsPage() {
  const [units, pending, recentSales] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { status: { in: ["IN_STOCK", "RESERVED"] } }, select: { id: true, code: true, model: true, storage: true }, orderBy: { code: "asc" } }),
    prisma.payLaterInstallment.findMany({ where: { status: "PENDING" }, include: { debt: { include: { purchase: { include: { inventoryItem: true } } } } }, orderBy: { dueDate: "asc" } }),
    prisma.sale.findMany({ orderBy: { date: "desc" }, take: 5, include: { inventoryItem: true } }),
  ]);
  const installments = pending.map((i) => ({ id: i.id, amount: i.amount, label: i.debt.purchase ? `${i.debt.purchase.inventoryItem.code} · ${i.debt.code} · bulan ${i.installmentNo}` : `${i.debt.code} · bulan ${i.installmentNo}` }));
  return <div className="space-y-6"><div><p className="text-sm text-zinc-500">Catat pergerakan bisnis</p><h1 className="text-3xl font-bold">Transaksi</h1></div><section className="grid gap-4 lg:grid-cols-2"><div className="card"><h2 className="mb-4 text-lg font-bold">Jual unit</h2><SaleForm units={units} /></div><div className="card"><h2 className="mb-4 text-lg font-bold">Bayar cicilan PayLater</h2>{installments.length ? <InstallmentForm installments={installments} /> : <p className="text-sm text-zinc-500">Tidak ada cicilan yang belum dibayar.</p>}</div><div className="card"><h2 className="mb-4 text-lg font-bold">Catat expense</h2><ExpenseForm /></div><div className="card"><h2 className="mb-4 text-lg font-bold">Pemasukan lain</h2><OtherIncomeForm /></div></section>{recentSales.length > 0 && <section className="card"><h2 className="mb-3 text-lg font-bold">Penjualan terbaru</h2><table className="table"><thead><tr><th>Invoice</th><th>Tanggal</th><th>Unit</th><th className="text-right">Total</th><th></th></tr></thead><tbody>{recentSales.map((s) => <tr key={s.id}><td><span className="font-mono text-xs">{s.invoiceNo}</span></td><td>{dateId(s.date)}</td><td>{s.inventoryItem.code} · {s.inventoryItem.model}</td><td className="text-right font-semibold">{rupiah(s.salePrice - s.sellingCost)}</td><td><Link href={`/sales/${s.id}/invoice`} className="text-xs font-semibold text-blue-600 hover:underline">Lihat invoice</Link></td></tr>)}</tbody></table></section>}</div>;
}
