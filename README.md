# BI+ Finance

Sistem internal untuk mencatat inventory iPhone, penjualan, pengeluaran, pemasukan lain, dan ledger kas BI+.

## Menjalankan lokal

1. Pastikan PostgreSQL berjalan dan buat database `bi_plus_finance`.
2. Salin `.env.example` menjadi `.env`, lalu sesuaikan `DATABASE_URL`.
3. Pasang dependensi: `npm install`.
4. Buat tabel database: `npx prisma migrate dev --name init`.
5. Isi data dummy: `npm run db:seed`.
6. Jalankan aplikasi: `npm run dev`.
7. Buka `http://localhost:3000`.

## Aturan keuangan

- Pembelian membuat inventory dan satu transaksi kas keluar.
- Penjualan hanya dapat dilakukan sekali untuk setiap unit dan membuat transaksi kas masuk sebesar harga jual dikurangi biaya jual/admin.
- Saldo kas dihitung dari tabel `CashTransaction`, bukan angka input manual.
- Profit tidak disamakan dengan kas. Profit muncul saat barang terjual; modal stok yang belum terjual tetap menjadi nilai inventory.

## Batas versi awal

Import CSV/XLSX belum dibuat. Skema transaksi dan inventory disiapkan agar fitur import dapat ditambah kemudian tanpa mengubah inti pencatatan.
