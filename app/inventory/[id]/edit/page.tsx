import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { duplicateInventory } from "@/app/actions";
import { EditInventoryForm, SellThisUnitForm } from "@/components/forms";
import { UnitImageGallery } from "@/components/unit-image-gallery";

export default async function EditInventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: { images: { orderBy: { uploadedAt: "desc" } }, sale: true },
  });
  if (!item) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/inventory" className="text-sm underline">← Kembali</Link>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-zinc-500">{item.code}</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Edit stok</h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
          item.status === "SOLD" ? "bg-emerald-100 text-emerald-800" :
          item.status === "RETURNED" ? "bg-amber-100 text-amber-800" :
          item.status === "RESERVED" ? "bg-blue-100 text-blue-800" :
          "bg-zinc-100 text-zinc-600"
        }`}>{item.status}</span>
        <form action={duplicateInventory}>
          <input type="hidden" name="id" value={item.id} />
          <button className="btn" type="submit">Duplikat</button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Form */}
        <div className="card space-y-4">
          <h2 className="font-semibold">Data unit</h2>
          <EditInventoryForm item={{ ...item, saleDate: item.sale?.date.toISOString().slice(0, 10) ?? null }} />
        </div>

        {/* Image Gallery */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Screenshot 3uTools</h2>
            <span className="text-xs text-zinc-400">{item.images.length} foto</span>
          </div>
          <UnitImageGallery unitId={item.id} images={item.images} />
        </div>
      </div>

      {item.status !== "SOLD" && item.status !== "RETURNED" && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Jual unit ini</h2>
          <p className="text-xs text-zinc-500">Langsung tercatat sebagai penjualan. Tidak perlu pindah ke tab Transaksi.</p>
          <SellThisUnitForm unit={item} />
        </div>
      )}
    </div>
  );
}
