import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PurchaseForm, SellForm } from "../forms";
import { dateId, rupiah } from "@/lib/format";
import { deleteAccessory } from "./actions";

const payLabel: Record<string, string> = {
  CASH: "Tunai", TRANSFER: "Transfer", EWALLET: "E-wallet", PAYLATER: "PayLater", OTHER: "Lainnya",
};

export default async function AccessoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accessory = await prisma.accessory.findUnique({
    where: { id },
    include: { transactions: { orderBy: { createdAt: "desc" } } },
  });

  if (!accessory) notFound();

  const totalBought = accessory.transactions.filter((t) => t.type === "PURCHASE").reduce((sum, t) => sum + t.quantity, 0);
  const totalSold = accessory.transactions.filter((t) => t.type === "SALE").reduce((sum, t) => sum + t.quantity, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/inventory?tab=aksesoris" className="text-sm underline">← Kembali ke Inventory</Link>

      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-500">{accessory.category}</p>
          <h1 className="text-3xl font-bold">{accessory.name}</h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
          accessory.stock <= 0 ? "bg-red-100 text-red-700" : accessory.stock <= 5 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
        }`}>
          Stok: {accessory.stock}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card"><p className="text-xs text-zinc-500">Stok</p><p className="text-2xl font-bold">{accessory.stock}</p></div>
        <div className="card"><p className="text-xs text-zinc-500">Harga beli</p><p className="text-lg font-bold">Rp{accessory.purchasePrice.toLocaleString("id-ID")}</p></div>
        <div className="card"><p className="text-xs text-zinc-500">Harga jual</p><p className="text-lg font-bold">Rp{accessory.sellingPrice.toLocaleString("id-ID")}</p></div>
        <div className="card"><p className="text-xs text-zinc-500">Nilai inventory</p><p className="text-lg font-bold">Rp{(accessory.stock * accessory.purchasePrice).toLocaleString("id-ID")}</p></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-semibold">Beli stok</h2>
          <PurchaseForm accessoryId={accessory.id} />
        </div>
        <div className="card space-y-3">
          <h2 className="font-semibold">Jual</h2>
          <SellForm accessoryId={accessory.id} />
        </div>
      </div>

      {/* Transaction history */}
      <div className="card">
        <h2 className="mb-3 font-semibold">Riwayat transaksi</h2>
        {accessory.transactions.length === 0 ? (
          <p className="text-sm text-zinc-400">Belum ada transaksi</p>
        ) : (
          <table className="table text-xs">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Tipe</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Harga</th>
                <th className="text-right">Total</th>
                <th>Bayar</th>
              </tr>
            </thead>
            <tbody>
              {accessory.transactions.map((t) => (
                <tr key={t.id}>
                  <td>{dateId(t.createdAt)}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.type === "PURCHASE" ? "bg-red-100 text-red-700" :
                      t.type === "SALE" ? "bg-emerald-100 text-emerald-700" :
                      "bg-zinc-100 text-zinc-600"
                    }`}>{t.type === "PURCHASE" ? "Beli" : t.type === "SALE" ? "Jual" : "Adj"}</span>
                  </td>
                  <td className="text-right">{t.quantity}</td>
                  <td className="text-right">Rp{t.unitPrice.toLocaleString("id-ID")}</td>
                  <td className="text-right font-semibold">Rp{t.totalPrice.toLocaleString("id-ID")}</td>
                  <td className="text-xs">{payLabel[t.paymentMethod] ?? t.paymentMethod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form action={deleteAccessory} className="pt-2">
        <input type="hidden" name="id" value={accessory.id} />
        <button type="submit" className="text-xs text-red-500 hover:underline">Hapus aksesoris</button>
      </form>
    </div>
  );
}
