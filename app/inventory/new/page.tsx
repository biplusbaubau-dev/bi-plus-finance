import Link from "next/link";
import { PurchaseForm } from "@/components/forms";
export default function NewInventory() { return <div className="mx-auto max-w-2xl space-y-5"><Link href="/inventory" className="text-sm underline">← Kembali</Link><div><p className="text-sm text-zinc-500">Pembelian + inventory</p><h1 className="text-2xl font-bold sm:text-3xl">Tambah stok</h1><p className="mt-2 text-sm text-zinc-500">Saat disimpan, unit masuk inventory dan kas berkurang sesuai total modal.</p></div><div className="card"><PurchaseForm /></div></div>; }
