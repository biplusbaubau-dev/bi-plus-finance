import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { rupiah, dateId } from "@/lib/format";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "unit" } = await searchParams;

  const [items, accessories] = await Promise.all([
    prisma.inventoryItem.findMany({ orderBy: { purchaseDate: "desc" }, include: { sale: true } }),
    prisma.accessory.findMany({ orderBy: { updatedAt: "desc" }, include: { _count: { select: { transactions: true } } } }),
  ]);

  const totalAccValue = accessories.reduce((sum, a) => sum + a.stock * a.purchasePrice, 0);
  const totalAccStock = accessories.reduce((sum, a) => sum + a.stock, 0);

  const daysBetween = (start: Date, end: Date) => Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="space-y-6">
      <section className="flex items-end justify-between">
        <div>
          <p className="text-sm text-zinc-500">Daftar inventory</p>
          <h1 className="text-3xl font-bold">Inventory</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory/new" className="btn">+ Tambah unit</Link>
          <Link href="/accessories/new" className="btn">+ Tambah aksesoris</Link>
        </div>
      </section>

      <div className="flex gap-2">
        <Link href="/inventory?tab=unit" className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === "unit" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"}`}>
          📱 Unit ({items.length})
        </Link>
        <Link href="/inventory?tab=aksesoris" className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === "aksesoris" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"}`}>
          🎧 Aksesoris ({accessories.length})
        </Link>
      </div>

      {tab === "unit" ? (
        <div className="card overflow-x-auto">
          <table className="table text-xs">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Status</th>
                <th className="text-right">Modal</th>
                <th className="text-right">Target jual</th>
                <th>Masuk</th>
                <th>Terjual</th>
                <th className="text-right">Harga jual</th>
                <th className="text-right">Profit</th>
                <th className="text-right">Hari</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const modal = item.purchasePrice + item.additionalCost;
                const sale = item.sale;
                const salePrice = sale ? sale.salePrice - sale.sellingCost : 0;
                const profit = sale ? salePrice - modal : (item.askingPrice ?? 0) - modal;
                const daysHeld = sale ? daysBetween(item.purchaseDate, sale.date) : null;
                return (
                  <tr key={item.id} className="hover:bg-zinc-50/50">
                    <td>
                      <p className="font-semibold">{item.model} {item.storage}</p>
                      <p className="text-zinc-400">{item.code} · {item.color} · BH {item.batteryHealth ?? "-"}%</p>
                    </td>
                    <td>
                      <span className={`rounded-full px-2 py-1 font-medium ${item.status === "SOLD" ? "bg-emerald-100 text-emerald-800" : item.status === "RESERVED" ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600"}`}>
                        {item.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="text-right">{rupiah(modal)}</td>
                    <td className="text-right">
                      {rupiah(item.askingPrice ?? 0)}
                      {item.status === "IN_STOCK" && (item.askingPrice ?? 0) > 0 && <p className="text-emerald-600">Est. {rupiah(profit)}</p>}
                    </td>
                    <td>{dateId(item.purchaseDate)}</td>
                    <td>{sale ? dateId(sale.date) : "—"}</td>
                    <td className="text-right">{sale ? <span className="text-emerald-700">{rupiah(salePrice)}</span> : "—"}</td>
                    <td className="text-right">
                      {sale ? <span className={profit < 0 ? "text-red-600" : "text-blue-700"}>{rupiah(profit)}</span> : item.status === "IN_STOCK" ? <span className="text-zinc-400">Est. {rupiah(profit)}</span> : "—"}
                    </td>
                    <td className="text-right">
                      {daysHeld ? <span className={daysHeld <= 7 ? "text-emerald-600" : daysHeld <= 21 ? "text-amber-600" : "text-red-500"}>{daysHeld}d</span> : "—"}
                    </td>
                    <td><Link className="text-sm font-semibold underline" href={`/inventory/${item.id}/edit`}>Edit</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="card"><p className="text-sm text-zinc-500">Total item</p><p className="mt-1 text-2xl font-bold">{accessories.length}</p></div>
            <div className="card"><p className="text-sm text-zinc-500">Total stok</p><p className="mt-1 text-2xl font-bold">{totalAccStock}</p></div>
            <div className="card"><p className="text-sm text-zinc-500">Nilai inventory</p><p className="mt-1 text-2xl font-bold">Rp{totalAccValue.toLocaleString("id-ID")}</p></div>
          </section>
          <div className="card overflow-x-auto">
            <table className="table text-xs">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Kategori</th>
                  <th className="text-right">Stok</th>
                  <th className="text-right">Harga beli</th>
                  <th className="text-right">Harga jual</th>
                  <th className="text-right">Nilai</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accessories.map((a) => (
                  <tr key={a.id} className="hover:bg-zinc-50/50">
                    <td>
                      <Link href={`/accessories/${a.id}`} className="font-semibold hover:underline">{a.name}</Link>
                      {a.notes && <p className="text-zinc-400">{a.notes}</p>}
                    </td>
                    <td><span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">{a.category}</span></td>
                    <td className={`text-right font-bold ${a.stock <= 2 ? "text-red-600" : a.stock <= 5 ? "text-amber-600" : ""}`}>{a.stock}</td>
                    <td className="text-right">Rp{a.purchasePrice.toLocaleString("id-ID")}</td>
                    <td className="text-right">Rp{a.sellingPrice.toLocaleString("id-ID")}</td>
                    <td className="text-right font-semibold">Rp{(a.stock * a.purchasePrice).toLocaleString("id-ID")}</td>
                    <td><Link href={`/accessories/${a.id}`} className="text-xs font-semibold text-blue-600 hover:underline">Detail</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
