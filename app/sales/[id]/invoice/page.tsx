import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const dateId = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "long", year: "numeric" }).format(d);

const payLabel: Record<string, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer Bank",
  EWALLET: "E-Wallet",
  PAYLATER: "SpayLater",
  OTHER: "Lainnya",
};

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { inventoryItem: true },
  });

  if (!sale) notFound();

  const unit = sale.inventoryItem;
  const net = sale.salePrice - sale.sellingCost;

  return (
    <div>
      {/* Print-triggering script */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.addEventListener('load', () => { setTimeout(() => window.print(), 300); });`,
        }}
      />

      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .invoice-box { box-shadow: none !important; border: none !important; margin: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      {/* Back button (hidden on print) */}
      <div className="no-print mx-auto max-w-2xl py-4">
        <Link href="/transactions" className="text-sm underline">← Kembali</Link>
      </div>

      {/* Invoice */}
      <div className="invoice-box mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-200 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">BI+ Finance</h1>
            <p className="text-sm text-zinc-500">Invoice penjualan</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm font-semibold">{sale.invoiceNo}</p>
            <p className="text-xs text-zinc-500">{dateId(sale.date)}</p>
          </div>
        </div>

        {/* Unit details */}
        <div className="mt-6 space-y-4">
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs font-semibold text-zinc-500">Detail unit</p>
            <p className="mt-1 text-lg font-bold">{unit.model} {unit.storage}</p>
            <p className="text-sm text-zinc-600">
              {unit.code} · {unit.color} · BH {unit.batteryHealth ?? "-"}%
              {unit.imei && ` · IMEI ${unit.imei}`}
            </p>
            <p className="text-xs text-zinc-400">{unit.condition}</p>
          </div>

          {/* Financials */}
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-2 text-zinc-500">Harga jual</td>
                <td className="py-2 text-right font-semibold">{rupiah(sale.salePrice)}</td>
              </tr>
              <tr>
                <td className="py-2 text-zinc-500">Biaya penjualan</td>
                <td className="py-2 text-right text-red-600">-{rupiah(sale.sellingCost)}</td>
              </tr>
              <tr className="border-t border-zinc-200">
                <td className="py-3 font-bold">Total bersih</td>
                <td className="py-3 text-right text-lg font-bold">{rupiah(net)}</td>
              </tr>
            </tbody>
          </table>

          {/* Meta */}
          <div className="grid gap-3 border-t border-zinc-200 pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Metode bayar</span>
              <span className="font-medium">{payLabel[sale.paymentMethod] ?? sale.paymentMethod}</span>
            </div>
            {sale.customerName && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Customer</span>
                <span className="font-medium">{sale.customerName}</span>
              </div>
            )}
            {sale.notes && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Catatan</span>
                <span className="font-medium">{sale.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t border-zinc-200 pt-4 text-center text-xs text-zinc-400">
          Terima kasih · Invoice ini sah tanpa tanda tangan
        </div>
      </div>
    </div>
  );
}
