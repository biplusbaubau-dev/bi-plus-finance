"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createAccessory } from "../actions";

const categories = ["Cable", "Adaptor", "Case", "Screen protector", "Charger", "Earphone", "Lainnya"];
const payments = [
  { v: "CASH", l: "Tunai" },
  { v: "TRANSFER", l: "Transfer" },
  { v: "EWALLET", l: "E-wallet" },
  { v: "PAYLATER", l: "PayLater" },
];

export default function NewAccessoryPage() {
  const [method, setMethod] = useState("CASH");
  const isPayLater = method === "PAYLATER";
  const [price, setPrice] = useState(0);
  const [stock, setStock] = useState(0);
  const totalRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (totalRef.current) totalRef.current.value = String(price * stock);
  }, [price, stock]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/inventory?tab=aksesoris" className="text-sm underline">← Kembali ke Inventory</Link>
      <div>
        <p className="text-sm text-zinc-500">Aksesoris baru</p>
        <h1 className="text-3xl font-bold">Tambah aksesoris</h1>
      </div>
      <div className="card">
        <form action={createAccessory} className="grid gap-3 sm:grid-cols-2">
          <label>Nama<input name="name" placeholder="Cabel USB-C Anker" required /></label>
          <label>Kategori
            <select name="category">
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Harga beli<input name="purchasePrice" type="number" min="0" placeholder="50000" onChange={(e) => setPrice(Number(e.target.value) || 0)} /></label>
          <label>Harga jual<input name="sellingPrice" type="number" min="0" placeholder="75000" /></label>
          <label>Stok awal<input name="stock" type="number" min="0" defaultValue="0" onChange={(e) => setStock(Number(e.target.value) || 0)} /></label>
          <label>Metode bayar
            <select name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
              {payments.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </label>
          <label className={!isPayLater ? "opacity-50" : ""}>Total kewajiban PayLater
            <input ref={totalRef} name="totalLiability" type="number" min="0" placeholder="0" disabled={!isPayLater} />
          </label>
          <label className={!isPayLater ? "opacity-50" : ""}>Tenor (1–12 bulan)
            <input name="tenorMonths" type="number" min="1" max="12" defaultValue="3" disabled={!isPayLater} />
          </label>
          <label className="sm:col-span-2">Catatan<textarea name="notes" rows={2} /></label>
          <button className="btn sm:col-span-2">Simpan</button>
        </form>
        <p className="mt-2 text-xs text-zinc-400">Untuk pembayaran non-PayLater, dua kolom PayLater diabaikan.</p>
      </div>
    </div>
  );
}
