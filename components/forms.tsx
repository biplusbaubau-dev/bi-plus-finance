"use client";
import { useState } from "react";
import { createExpense, createOtherIncome, createPurchase, createSale, payInstallment, payShopeeBill, updateInventory } from "@/app/actions";
const PaymentOptions = () => <select name="paymentMethod" defaultValue="TRANSFER"><option value="CASH">Tunai</option><option value="TRANSFER">Transfer</option><option value="EWALLET">E-wallet</option><option value="PAYLATER">PayLater</option><option value="OTHER">Lainnya</option></select>;
export function PurchaseForm() {
  const [method, setMethod] = useState("TRANSFER");
  const isPayLater = method === "PAYLATER";
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [additionalCost, setAdditionalCost] = useState(0);
  const [totalLiability, setTotalLiability] = useState(0);
  const totalPrice = purchasePrice + additionalCost;
  return (
    <form action={createPurchase} className="grid gap-3 sm:grid-cols-2">
      <label>Kode unit<input name="code" placeholder="BI-006" required /></label>
      <label>IMEI (opsional)<input name="imei" /></label>
      <label>Model<input name="model" placeholder="iPhone 11" required /></label>
      <label>Storage<input name="storage" placeholder="64GB" required /></label>
      <label>Warna<input name="color" required /></label>
      <label>Battery health (%)<input name="batteryHealth" type="number" min="0" max="100" /></label>
      <label>Kondisi<input name="condition" placeholder="Good" required /></label>
      <label>Tanggal beli<input name="purchaseDate" type="date" required /></label>
      <label>Supplier<input name="supplier" /></label>
      <label>Harga beli
        <input name="purchasePrice" type="number" min="0" required onChange={(e) => { const v = Number(e.target.value) || 0; setPurchasePrice(v); setTotalLiability(v + additionalCost); }} />
      </label>
      <label>Biaya tambahan
        <input name="additionalCost" type="number" min="0" defaultValue="0" required onChange={(e) => { const v = Number(e.target.value) || 0; setAdditionalCost(v); setTotalLiability(purchasePrice + v); }} />
      </label>
      <label>Target harga jual<input name="askingPrice" type="number" min="0" /></label>
      <label>Metode bayar
        <select name="paymentMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="CASH">Tunai</option><option value="TRANSFER">Transfer</option><option value="EWALLET">E-wallet</option><option value="PAYLATER">PayLater</option><option value="OTHER">Lainnya</option>
        </select>
      </label>
      <div className={`sm:col-span-2 rounded-xl border p-3 text-sm ${isPayLater ? "border-blue-200 bg-blue-50" : "border-zinc-200 bg-zinc-50"}`}>
        <p className="mb-2 font-semibold">{isPayLater ? "Cicil PayLater" : "Detail PayLater (non-aktif)"}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Total kewajiban PayLater
            <input name="totalLiability" type="number" min="0" value={isPayLater ? totalLiability : 0} onChange={(e) => setTotalLiability(Number(e.target.value) || 0)} disabled={!isPayLater} className={isPayLater ? "" : "opacity-50"} />
          </label>
          <label>Tenor (1–12 bulan)
            <input name="tenorMonths" type="number" min="1" max="12" defaultValue="3" disabled={!isPayLater} className={isPayLater ? "" : "opacity-50"} />
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Auto = Harga beli + Biaya tambahan = Rp {totalPrice.toLocaleString("id-ID")} • Untuk non-PayLater, field diabaikan.</p>
      </div>
      <label className="sm:col-span-2">Catatan<textarea name="notes" rows={2} /></label>
      <button className="btn sm:col-span-2">Simpan pembelian</button>
    </form>
  );
}
export function SaleForm({ units }: { units: { id: string; code: string; model: string; storage: string }[] }) { return <form action={createSale} className="grid gap-3 sm:grid-cols-2"><label>Unit<select name="inventoryItemId" required><option value="">Pilih unit</option>{units.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.model} {u.storage}</option>)}</select></label><label>Tanggal jual<input name="saleDate" type="date" required /></label><label>Harga jual<input name="salePrice" type="number" min="0" required /></label><label>Biaya/admin penjualan<input name="sellingCost" type="number" min="0" defaultValue="0" required /></label><label>Metode bayar<PaymentOptions /></label><label>Nama customer<input name="customerName" /></label><label className="sm:col-span-2">Catatan<textarea name="notes" rows={2} /></label><button className="btn sm:col-span-2">Simpan penjualan</button></form>; }
export function SellThisUnitForm({ unit }: { unit: { id: string; askingPrice: number | null } }) { return <form action={createSale} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="inventoryItemId" value={unit.id} /><label>Tanggal jual<input name="saleDate" type="date" required /></label><label>Harga jual<input name="salePrice" type="number" min="0" defaultValue={unit.askingPrice ?? ""} required /></label><label>Biaya/admin penjualan<input name="sellingCost" type="number" min="0" defaultValue="0" required /></label><label>Metode bayar<PaymentOptions /></label><label>Nama customer<input name="customerName" /></label><label className="sm:col-span-2">Catatan<textarea name="notes" rows={2} /></label><button className="btn sm:col-span-2">Jual unit ini</button></form>; }
export function ExpenseForm() { return <form action={createExpense} className="grid gap-3 sm:grid-cols-2"><label>Tanggal<input name="date" type="date" required /></label><label>Kategori<select name="category" defaultValue="OPERATIONAL"><option value="OPERATIONAL">Operasional</option><option value="TRANSPORT">Transport</option><option value="PACKAGING">Packaging</option><option value="MARKETING">Marketing</option><option value="ADMIN">Admin</option><option value="INTERNET">Internet</option><option value="EQUIPMENT">Equipment</option><option value="OTHER">Lainnya</option></select></label><label>Nominal<input name="amount" type="number" min="0" required /></label><label>Metode bayar<PaymentOptions /></label><label className="sm:col-span-2">Deskripsi<input name="description" required /></label><label className="sm:col-span-2">Catatan<textarea name="notes" rows={2} /></label><button className="btn sm:col-span-2">Simpan pengeluaran</button></form>; }
export function OtherIncomeForm() { return <form action={createOtherIncome} className="grid gap-3 sm:grid-cols-2"><label>Tanggal<input name="date" type="date" required /></label><label>Sumber<input name="source" placeholder="Penjualan accessories" required /></label><label>Nominal<input name="amount" type="number" min="0" required /></label><label>Metode bayar<PaymentOptions /></label><label className="sm:col-span-2">Catatan<textarea name="notes" rows={2} /></label><button className="btn sm:col-span-2">Simpan pemasukan</button></form>; }
export function InstallmentForm({ installments }: { installments: { id: string; label: string; amount: number }[] }) {
  return (
    <form action={payInstallment} className="grid gap-3 sm:grid-cols-2">
      <label>Cicilan<select name="installmentId" required><option value="">Pilih cicilan</option>{installments.map((i) => <option key={i.id} value={i.id}>{i.label} — Rp{i.amount.toLocaleString("id-ID")}</option>)}</select></label>
      <label>Tanggal bayar<input name="paidAt" type="date" required /></label>
      <label className="sm:col-span-2">Nominal bayar<input name="amount" type="number" min={1} step={1} placeholder="Kosongkan untuk melunasi sisa" /></label>
      <button className="btn sm:col-span-2">Catat pembayaran</button>
    </form>
  );
}

export function ShopeeBillForm({
  totalPending,
  kind = "PAYLATER",
  installments = [],
}: {
  totalPending: number;
  kind?: "PAYLATER" | "LOAN";
  installments?: { no: number; due: string; remaining: number }[];
}) {
  const isLoan = kind === "LOAN";
  const satuan = isLoan ? "minggu" : "bulan";
  const [amount, setAmount] = useState<number>(installments[0]?.remaining ?? 0);
  const nominalPeriode = installments[0]?.remaining ?? 0;

  // Preview alokasi (logika sama dengan server): selalu genap per cicilan,
  // kecuali cicilan terakhir yang tersisa.
  const preview: { no: number; due: string; bayar: number; lunas: boolean }[] = [];
  let left = amount;
  for (const it of installments) {
    if (left <= 0) break;
    const bayar = Math.min(it.remaining, left);
    left -= bayar;
    preview.push({ no: it.no, due: it.due, bayar, lunas: bayar >= it.remaining });
  }
  const kepotong = preview.some((p, i) => !p.lunas && i < installments.length - 1);
  const lunasCount = preview.filter((p) => p.lunas).length;
  const maksPeriode = Math.min(installments.length, 12);
  const opsiPeriode = Array.from({ length: maksPeriode }, (_, i) =>
    installments.slice(0, i + 1).reduce((s, it) => s + it.remaining, 0),
  );

  return (
    <form action={payShopeeBill} className="grid gap-3">
      <input type="hidden" name="kind" value={kind} />
      <p className="text-sm text-zinc-500">
        Sisa tagihan {isLoan ? "pinjaman" : "PayLater"}: <b>Rp {totalPending.toLocaleString("id-ID")}</b>
        {nominalPeriode > 0 && (
          <>
            {" · "}
            {isLoan ? "per minggu" : "per bulan"}: <b>Rp {nominalPeriode.toLocaleString("id-ID")}</b>
          </>
        )}
        . Pembayaran dibuat genap per {satuan} — bisa bayar beberapa {satuan} sekaligus.
      </p>
      <label>Tanggal bayar<input name="paidAt" type="date" required /></label>
      {installments.length > 0 && (
        <div className="grid gap-2">
          <span className="text-sm font-medium">Bayar berapa {satuan}?</span>
          <div className="flex flex-wrap gap-2">
            {opsiPeriode.map((nilai, i) => {
              const aktif = amount === nilai;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAmount(nilai)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    aktif
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:border-blue-400"
                  }`}
                >
                  {i + 1} {satuan} · Rp{nilai.toLocaleString("id-ID")}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <label>
        Total dibayar
        <input
          name="amount"
          type="number"
          min={1}
          max={totalPending}
          step={1}
          required
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
      </label>
      {preview.length > 0 && (
        <div
          className={`rounded-lg border p-3 text-xs ${
            kepotong ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"
          }`}
        >
          <p className="font-semibold">
            {kepotong
              ? `Nominal ini memotong ${satuan} ke-${lunasCount + 1} jadi tidak genap — server akan menolak. Pilih nominal tombol di atas.`
              : `Lunas ${lunasCount} ${satuan} penuh`}
          </p>
          <p className="mt-1">
            {preview
              .map((p) => `#${p.no} (${p.due})${p.lunas ? "" : ` · Rp${p.bayar.toLocaleString("id-ID")}`}`)
              .join(", ")}
          </p>
        </div>
      )}
      <button className="btn">Bayar tagihan</button>
    </form>
  );
}

export function EditInventoryForm({ item }: { item: { id: string; code: string; imei: string | null; model: string; storage: string; color: string; batteryHealth: number | null; condition: string; purchaseDate: Date; supplier: string | null; purchasePrice: number; additionalCost: number; askingPrice: number | null; notes: string | null; status: string; saleDate?: string | null } }) { const locked = item.status === "SOLD"; return <form action={updateInventory} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="id" value={item.id} /><p className="sm:col-span-2 text-sm text-zinc-500">Kode unit: <b>{item.code}</b>{locked && " — data modal dikunci karena unit telah terjual."}</p><label>IMEI<input name="imei" defaultValue={item.imei ?? ""} /></label><label>Model<input name="model" defaultValue={item.model} required /></label><label>Storage<input name="storage" defaultValue={item.storage} required /></label><label>Warna<input name="color" defaultValue={item.color} required /></label><label>Battery health (%)<input name="batteryHealth" type="number" min="0" max="100" defaultValue={item.batteryHealth ?? ""} /></label><label>Kondisi<input name="condition" defaultValue={item.condition} required /></label><label>Tanggal beli<input name="purchaseDate" type="date" defaultValue={item.purchaseDate.toISOString().slice(0, 10)} disabled={locked} required /></label><label>Supplier<input name="supplier" defaultValue={item.supplier ?? ""} /></label><label>Harga beli<input name="purchasePrice" type="number" min="0" defaultValue={item.purchasePrice} disabled={locked} required /></label><label>Biaya tambahan<input name="additionalCost" type="number" min="0" defaultValue={item.additionalCost} disabled={locked} required /></label><label>Target harga jual<input name="askingPrice" type="number" min="0" defaultValue={item.askingPrice ?? ""} /></label>{item.saleDate && <label>Tanggal jual<input name="saleDate" type="date" defaultValue={item.saleDate} required /></label>}{!locked && <label>Status<select name="status" defaultValue={item.status}><option value="IN_STOCK">IN STOCK</option><option value="RESERVED">RESERVED</option><option value="RETURNED">RETURNED</option></select></label>}<label className="sm:col-span-2">Catatan<textarea name="notes" rows={2} defaultValue={item.notes ?? ""} /></label><button className="btn sm:col-span-2">Simpan perubahan</button></form>; }
