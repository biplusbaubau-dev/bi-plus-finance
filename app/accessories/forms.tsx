"use client";
import { useState } from "react";
import { createAccessory, purchaseAccessory, sellAccessory } from "./actions";

const categories = ["Cable", "Adaptor", "Baterai", "Case", "Screen protector", "Charger", "Earphone", "Lainnya"];
const payments = [
  { v: "CASH", l: "Tunai" },
  { v: "TRANSFER", l: "Transfer" },
  { v: "EWALLET", l: "E-wallet" },
  { v: "PAYLATER", l: "PayLater" },
];

export function NewAccessoryForm() {
  const [method, setMethod] = useState("CASH");
  const isPayLater = method === "PAYLATER";
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [stock, setStock] = useState(0);
  const [totalLiability, setTotalLiability] = useState(0);

  const totalPrice = purchasePrice * stock;

  return (
    <form action={createAccessory} className="grid gap-3 sm:grid-cols-2">
      <label>Nama<input name="name" placeholder="Cabel USB-C Anker" required /></label>
      <label>Kategori
        <select name="category">
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Harga beli
        <input name="purchasePrice" type="number" min="0" placeholder="50000"
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            setPurchasePrice(v);
            setTotalLiability(v * stock);
          }} />
      </label>
      <label>Harga jual<input name="sellingPrice" type="number" min="0" placeholder="75000" /></label>
      <label>Stok awal
        <input name="stock" type="number" min="0" defaultValue="0"
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            setStock(v);
            setTotalLiability(purchasePrice * v);
          }} />
      </label>
      <label>Metode bayar
        <select name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
          {payments.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
      </label>
      <div className={`sm:col-span-2 rounded-xl border p-4 space-y-3 ${isPayLater ? "border-blue-200 bg-blue-50" : "border-zinc-200 bg-zinc-50"}`}>
        <p className="text-sm font-semibold">{isPayLater ? "Cicil PayLater" : "Detail PayLater (non-aktif)"}</p>
        <label>Total kewajiban PayLater
          <input name="totalLiability" type="number" min="0"
            value={isPayLater ? totalLiability : 0}
            onChange={(e) => setTotalLiability(Number(e.target.value) || 0)}
            disabled={!isPayLater}
            className={isPayLater ? "" : "opacity-50"} />
        </label>
        <label>Tenor (1–12 bulan)
          <input name="tenorMonths" type="number" min="1" max="12" defaultValue="3"
            disabled={!isPayLater}
            className={isPayLater ? "" : "opacity-50"} />
        </label>
        <p className="text-xs text-zinc-500">Auto = Harga beli × Stok = Rp {totalPrice.toLocaleString("id-ID")} • Untuk non-PayLater, field diabaikan</p>
      </div>
      <label className="sm:col-span-2">Catatan<textarea name="notes" rows={2} /></label>
      <button className="btn sm:col-span-2">Simpan</button>
    </form>
  );
}

export function PurchaseForm({ accessoryId }: { accessoryId: string }) {
  const [method, setMethod] = useState("CASH");
  const isPayLater = method === "PAYLATER";
  const [quantity, setQuantity] = useState(0);
  const [unitPrice, setUnitPrice] = useState(0);
  const [totalLiability, setTotalLiability] = useState(0);

  const totalPrice = quantity * unitPrice;

  return (
    <form action={purchaseAccessory} className="grid gap-3">
      <input type="hidden" name="accessoryId" value={accessoryId} />
      <label>Quantity
        <input name="quantity" type="number" min="1" placeholder="5" required
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            setQuantity(v);
            setTotalLiability(v * unitPrice);
          }} />
      </label>
      <label>Harga per unit
        <input name="unitPrice" type="number" min="0" required
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            setUnitPrice(v);
            setTotalLiability(quantity * v);
          }} />
      </label>
      <label>Metode bayar
        <select name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
          {payments.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
      </label>
      <div className={`rounded-xl border p-4 space-y-3 ${isPayLater ? "border-blue-200 bg-blue-50" : "border-zinc-200 bg-zinc-50"}`}>
        <p className="text-sm font-semibold">{isPayLater ? "Cicil PayLater" : "Detail PayLater (non-aktif)"}</p>
        <label>Total kewajiban PayLater
          <input name="totalLiability" type="number" min="0"
            value={isPayLater ? totalLiability : 0}
            onChange={(e) => setTotalLiability(Number(e.target.value) || 0)}
            disabled={!isPayLater}
            className={isPayLater ? "" : "opacity-50"} />
        </label>
        <label>Tenor (1–12 bulan)
          <input name="tenorMonths" type="number" min="1" max="12" defaultValue="3"
            disabled={!isPayLater}
            className={isPayLater ? "" : "opacity-50"} />
        </label>
        <p className="text-xs text-zinc-500">Auto = Qty × Harga = Rp {totalPrice.toLocaleString("id-ID")} • Untuk non-PayLater, field diabaikan</p>
      </div>
      <label>Deskripsi<textarea name="description" rows={2} placeholder="Tambah stok" /></label>
      <button className="btn">Beli stok</button>
    </form>
  );
}

export function SellForm({ accessoryId }: { accessoryId: string }) {
  const [method, setMethod] = useState("CASH");
  const isPayLater = method === "PAYLATER";
  const [quantity, setQuantity] = useState(0);
  const [unitPrice, setUnitPrice] = useState(0);
  const [totalLiability, setTotalLiability] = useState(0);

  const totalPrice = quantity * unitPrice;

  return (
    <form action={sellAccessory} className="grid gap-3">
      <input type="hidden" name="accessoryId" value={accessoryId} />
      <label>Quantity
        <input name="quantity" type="number" min="1" placeholder="1" required
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            setQuantity(v);
            setTotalLiability(v * unitPrice);
          }} />
      </label>
      <label>Harga jual per unit
        <input name="unitPrice" type="number" min="0" required
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            setUnitPrice(v);
            setTotalLiability(quantity * v);
          }} />
      </label>
      <label>Metode bayar
        <select name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
          {payments.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
      </label>
      <div className={`rounded-xl border p-4 space-y-3 ${isPayLater ? "border-blue-200 bg-blue-50" : "border-zinc-200 bg-zinc-50"}`}>
        <p className="text-sm font-semibold">{isPayLater ? "Piutang PayLater (Customer)" : "Detail Piutang (non-aktif)"}</p>
        <label>Total piutang
          <input name="totalLiability" type="number" min="0"
            value={isPayLater ? totalLiability : 0}
            onChange={(e) => setTotalLiability(Number(e.target.value) || 0)}
            disabled={!isPayLater}
            className={isPayLater ? "" : "opacity-50"} />
        </label>
        <label>Tenor (1–12 bulan)
          <input name="tenorMonths" type="number" min="1" max="12" defaultValue="3"
            disabled={!isPayLater}
            className={isPayLater ? "" : "opacity-50"} />
        </label>
        <p className="text-xs text-zinc-500">Auto = Qty × Harga jual = Rp {totalPrice.toLocaleString("id-ID")} • Untuk non-PayLater, field diabaikan</p>
      </div>
      <label>Deskripsi<textarea name="description" rows={2} /></label>
      <button className="btn">Jual</button>
    </form>
  );
}
