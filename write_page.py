import os

# File path
path = "C:/Users/Administrator/Documents/Codex/2026-08-25/referenced-chatgpt-conversation-this-is-an/bi-plus-finance-app/app/page.tsx"

new_page = r'''import Link from "next/link";
import { dashboardData, trendData } from "@/lib/finance";
import { dateId, rupiah } from "@/lib/format";
import { TrendChart } from "@/components/trend-chart";
function getPeriod(range, from, to) { if (from || to) return { from: from ? new Date(from + "T00:00:00") : undefined, to: to ? new Date(to + "T23:59:59") : undefined }; const now = new Date(); const start = new Date(now); if (range === "today") start.setHours(0, 0, 0, 0); else if (range === "7d") start.setDate(now.getDate() - 6); else if (range === "month") start.setDate(1); else if (range === "last") { start.setMonth(now.getMonth() - 1, 1); const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59); return { from: start, to: end }; } else return {}; return { from: start, to: now }; }
export default async function Dashboard({ searchParams }) {
  const { range, from, to } = await searchParams;
  const period = getPeriod(range, from, to);
  const [data, trend] = await Promise.all([
    dashboardData(period),
    trendData(period, range === "today" || range === "7d" ? "daily" : "monthly")
  ]);
  const granularity = range === "today" || range === "7d" ? "daily" : "monthly";
  const metrics = [
    ["Omzet", data.omzet],
    ["Profit kotor", data.grossProfit],
    ["Pengeluaran", data.totalExpense],
    ["Net profit", data.netProfit],
    ["Saldo kas", data.cashBalance],
    ["Modal di inventory", data.inventoryValue],
    ["Sisa PayLater", data.payLaterOutstanding],
    ["Jatuh tempo bulan ini", data.payLaterDueThisMonth],
  ];
  const filters = [["all", "Semua"], ["today", "Hari ini"], ["7d", "7 hari"], ["month", "Bulan ini"], ["last", "Bulan lalu"]];

  const countdownLabel = (days) => {
    if (days < 0) return Math.abs(days) + " hari lalu (terlambat)";
    if (days === 0) return "Hari ini";
    if (days === 1) return "Besok";
    return days + " hari lagi";
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">Ringkasan bisnis</p>
          <h1 className="text-3xl font-bold">Dashboard</h1>
        </div>
        <Link className="btn" href="/transactions">+ Catat transaksi</Link>
      </section>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map(([key, label]) => (
          <Link key={key} href={key === "all" ? "/" : "/?range=" + key}
            className={"whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold " + (range === key || (!range && !from && key === "all") ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200")}>
            {label}
          </Link>
        ))}
      </div>
      <form className="flex items-end gap-2">
        <label>Dari<input name="from" type="date" defaultValue={from} /></label>
        <label>Sampai<input name="to" type="date" defaultValue={to} /></label>
        <button className="btn-secondary" type="submit">Terapkan</button>
      </form>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div className="card" key={String(label)}>
            <p className="text-xs font-medium text-zinc-500">{label}</p>
            <p className={"mt-2 text-lg font-bold " + (Number(value) < 0 ? "text-red-600" : "")}>
              {rupiah(Number(value))}
            </p>
          </div>
        ))}
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-zinc-500">Unit tersedia</p>
          <p className="mt-1 text-3xl font-bold">{data.available}</p>
        </div>
        <div className="card">
          <p className="text-sm text-zinc-500">Unit terjual</p>
          <p className="mt-1 text-3xl font-bold">{data.sold}</p>
        </div>
        <div className="card">
          <p className="text-sm text-zinc-500">Cicilan belum dibayar</p>
          <p className="mt-1 text-3xl font-bold">{data.payLaterCount}</p>
        </div>
      </section>
      {data.pendingInstallments && data.pendingInstallments.length > 0 && (
        <section className="card overflow-x-auto">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Cicilan yang belum dibayar</h2>
            <Link href="/cashflow" className="text-sm font-semibold underline">Lihat semua</Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>No</th>
                <th>Jatuh tempo</th>
                <th>Status</th>
                <th className="text-right">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {data.pendingInstallments.map((item) => (
                <tr key={item.id} className={item.daysUntilDue < 0 ? "bg-red-50" : ""}>
                  <td>{item.installmentNo}</td>
                  <td>
                    <span className="font-medium">{dateId(item.dueDate)}</span>
                    <span className="text-xs text-zinc-400 ml-2">{countdownLabel(item.daysUntilDue)}</span>
                  </td>
                  <td>
                    {item.daysUntilDue < 0 ? (
                      <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Terlambat</span>
                    ) : item.daysUntilDue <= 3 ? (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{countdownLabel(item.daysUntilDue)}</span>
                    ) : (
                      <span className="text-xs text-zinc-500">{countdownLabel(item.daysUntilDue)}</span>
                    )}
                  </td>
                  <td className="text-right font-medium text-red-600">{rupiah(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <section className="card">
        <h2 className="font-bold">Tren {granularity === "daily" ? "harian" : granularity === "weekly" ? "mingguan" : "bulanan"}</h2>
        <p className="mb-2 text-sm text-zinc-500">Income, profit, expense, dan saldo kas</p>
        <TrendChart initialData={trend.data} initialGranularity={granularity} />
      </section>
      <section className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Penjualan terakhir</h2>
          <Link href="/sales" className="text-sm font-semibold underline">Lihat semua</Link>
        </div>
        {(!data.recentSales || data.recentSales.length === 0) ? (
          <p className="text-sm text-zinc-400 py-4 text-center">Belum ada penjualan</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>No. Invoice</th>
                <th>Item</th>
                <th className="text-right">Harga Jual</th>
                <th className="text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSales.map((sale) => {
                const profit = sale.salePrice - (sale.inventoryItem.purchasePrice + sale.inventoryItem.additionalCost + sale.sellingCost);
                return (
                  <tr key={sale.id}>
                    <td>{dateId(sale.date)}</td>
                    <td className="font-mono text-xs">{sale.invoiceNo}</td>
                    <td>
                      <span className="font-medium">{sale.inventoryItem.code}</span>
                      <span className="text-zinc-400 text-xs ml-2">{sale.inventoryItem.brand} {sale.inventoryItem.model} {sale.inventoryItem.storage}</span>
                    </td>
                    <td className="text-right font-medium text-emerald-700">{rupiah(sale.salePrice)}</td>
                    <td className={"text-right font-medium " + (profit < 0 ? "text-red-600" : "text-blue-700")}>
                      {rupiah(profit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <section className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Transaksi kas terbaru</h2>
          <Link href="/cashflow" className="text-sm font-semibold underline">Lihat semua</Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Jenis</th>
              <th>Deskripsi</th>
              <th className="text-right">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {data.ledger.slice(-6).reverse().map((item) => (
              <tr key={item.id}>
                <td>{dateId(item.date)}</td>
                <td>{item.type}</td>
                <td>{item.description}</td>
                <td className={"text-right font-medium " + (item.income ? "text-emerald-700" : "text-red-600")}>
                  {item.income ? "+" : "-"}{rupiah(item.income || item.expense)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
'''

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_page)
print('Written OK:', os.path.getsize(path), 'bytes')
