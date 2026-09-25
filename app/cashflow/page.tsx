import { InventoryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateId, rupiah } from "@/lib/format";
import { ledgerLabel } from "@/lib/finance";

export default async function CashflowPage() {
  const [items, debts] = await Promise.all([
    prisma.cashTransaction.findMany({ orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.payLaterDebt.findMany({
      where: { OR: [
        { purchase: { inventoryItem: { status: { not: InventoryStatus.RETURNED } } } },
        { accessoryId: { not: null } },
      ]},
      orderBy: { startDate: "asc" },
      include: {
        installments: { orderBy: { installmentNo: "asc" } },
        purchase: { include: { inventoryItem: true } },
        accessory: true,
      },
    }),
  ]);

  let balance = 0;
  const rows = items.map((item) => { balance += item.income - item.expense; return { ...item, balance }; }).reverse();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-500">Semua mutasi berasal dari transaksi</p>
        <h1 className="text-3xl font-bold">Cashflow</h1>
      </div>

      {/* PayLater debts */}
      {debts.length > 0 && (
        <section className="card">
          <h2 className="mb-4 text-lg font-bold">Hutang PayLater</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {debts.map((d) => {
              const paid = d.installments.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
              const remaining = d.totalLiability - paid;
              const progress = d.totalLiability > 0 ? Math.round((paid / d.totalLiability) * 100) : 0;
              return (
                <div key={d.id} className="rounded-xl border border-zinc-200 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-xs text-zinc-500">{d.code}</p>
                      <p className="font-semibold">{d.purchase ? `${d.purchase.inventoryItem.code} — ${d.purchase.inventoryItem.model}` : d.accessory ? d.accessory.name : "—"}</p>
                      <p className="text-xs text-zinc-400">{dateId(d.startDate)}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${remaining <= 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {remaining <= 0 ? "Lunas" : `${progress}%`}
                    </span>
                  </div>
                  <div className="mt-3 flex justify-between text-sm">
                    <span className="text-zinc-500">Total</span>
                    <span className="font-semibold">Rp{d.totalLiability.toLocaleString("id-ID")}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-zinc-500">Dibayar</span>
                    <span className="font-semibold text-emerald-600">Rp{paid.toLocaleString("id-ID")}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-zinc-500">Sisa</span>
                    <span className={`font-bold ${remaining <= 0 ? "text-emerald-600" : "text-red-600"}`}>Rp{remaining.toLocaleString("id-ID")}</span>
                  </div>
                  {/* Installments */}
                  <div className="mt-3 flex gap-1">
                    {d.installments.map((i) => (
                      <div key={i.id} className={`flex-1 rounded p-1.5 text-center text-[10px] font-semibold ${i.status === "PAID" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        <div>#{i.installmentNo}</div>
                        <div className="truncate">{(i.dueDate.getMonth() + 1).toString().padStart(2, "0")}/{i.dueDate.getFullYear().toString().slice(-2)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Ledger */}
      <section className="card overflow-x-auto">
        <h2 className="mb-3 text-lg font-bold">Ledger</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Tipe</th>
              <th>Deskripsi</th>
              <th className="text-right">Masuk</th>
              <th className="text-right">Keluar</th>
              <th className="text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>{dateId(item.date)}</td>
                <td>{ledgerLabel[item.type]}</td>
                <td>{item.description}</td>
                <td className="text-right text-emerald-700">{item.income ? rupiah(item.income) : "-"}</td>
                <td className="text-right text-red-600">{item.expense ? rupiah(item.expense) : "-"}</td>
                <td className={`text-right font-semibold ${item.balance < 0 ? "text-red-600" : ""}`}>{rupiah(item.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
