import { prisma } from "@/lib/prisma";
import Link from "next/link";

const categories = ["Cable", "Adaptor", "Baterai", "Case", "Screen protector", "Charger", "Earphone", "Lainnya"];

export default async function AccessoriesPage() {
  const accessories = await prisma.accessory.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { transactions: true } } },
  });

  const totalValue = accessories.reduce((sum, a) => sum + a.stock * a.purchasePrice, 0);
  const totalStock = accessories.reduce((sum, a) => sum + a.stock, 0);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-zinc-500">Daftar aksesoris</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Aksesoris</h1>
        </div>
        <Link href="/accessories/new" className="btn w-full text-center sm:w-auto">+ Tambah aksesoris</Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-zinc-500">Total item</p>
          <p className="mt-1 text-2xl font-bold">{accessories.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-zinc-500">Total stok</p>
          <p className="mt-1 text-2xl font-bold">{totalStock}</p>
        </div>
        <div className="card">
          <p className="text-sm text-zinc-500">Nilai inventory</p>
          <p className="mt-1 text-2xl font-bold">Rp{totalValue.toLocaleString("id-ID")}</p>
        </div>
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
                  <Link href={`/accessories/${a.id}`} className="font-semibold hover:underline">
                    {a.name}
                  </Link>
                  {a.notes && <p className="text-zinc-400">{a.notes}</p>}
                </td>
                <td><span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">{a.category}</span></td>
                <td className={`text-right font-bold ${a.stock <= 2 ? "text-red-600" : a.stock <= 5 ? "text-amber-600" : ""}`}>
                  {a.stock}
                </td>
                <td className="text-right">Rp{a.purchasePrice.toLocaleString("id-ID")}</td>
                <td className="text-right">Rp{a.sellingPrice.toLocaleString("id-ID")}</td>
                <td className="text-right font-semibold">Rp{(a.stock * a.purchasePrice).toLocaleString("id-ID")}</td>
                <td>
                  <Link href={`/accessories/${a.id}`} className="text-xs font-semibold text-blue-600 hover:underline">
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
