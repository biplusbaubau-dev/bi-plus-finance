#!/usr/bin/env python3
"""Impor transaksi unit (HP) ke BiPlus — aman, idempoten, dry-run by default.

Alur yang ditiru persis dari app/actions.ts:
  createPurchase : InventoryItem + Purchase + CashTransaction(PURCHASE) [atau PayLaterDebt+Installment]
  createSale     : InventoryItem.status=SOLD + Sale + CashTransaction(SALE)

Pemakaian:
  python3 tools/import_units.py data.json              # DRY RUN: hanya cetak rencana + SQL
  python3 tools/import_units.py data.json --apply      # eksekusi dalam 1 transaksi DB
  python3 tools/import_units.py data.json --apply --backup   # pg_dump tabel dulu ke backup/

Format data.json:
{
  "units": [
    {
      "code": "BI-021",
      "brand": "Apple",
      "model": "iPhone 12 128gb",
      "storage": "128GB",
      "color": "Black",
      "batteryHealth": 89,
      "condition": "Good",
      "imei": null,
      "supplier": "Toko A",
      "purchaseDate": "2026-11-01",
      "purchasePrice": 4500000,
      "additionalCost": 50000,
      "askingPrice": 5200000,
      "purchasePaymentMethod": "CASH",
      "notes": null,
      "sale": {
        "date": "2026-11-05",
        "salePrice": 5300000,
        "sellingCost": 0,
        "paymentMethod": "CASH",
        "customerName": "Budi",
        "notes": null
      }
    }
  ]
}

Aturan validasi (meniru server action):
  - code wajib & unik, model/storage/color/condition wajib
  - purchaseDate wajib, purchasePrice & additionalCost >= 0
  - purchasePaymentMethod PAYLATER -> wajib totalLiability >= modal dan tenorMonths 1..12
  - sale.salePrice >= 0; unit yang sudah SOLD/RETURNED tidak bisa dijual lagi
  - status unit: tanpa "sale" -> IN_STOCK, dengan "sale" -> SOLD
"""
from __future__ import annotations

import json
import os
import secrets
import shutil
import string
import subprocess
import sys
from datetime import date, datetime, timedelta

DB_CONTAINER = "biplus-finance-db-1"
DB_USER = "biplus"
DB_NAME = "bi_plus_finance"
PM = {"CASH", "TRANSFER", "EWALLET", "PAYLATER", "OTHER"}
BACKUP_DIR = "backup"


# ---------------------------------------------------------------- helpers
def cuid() -> str:
    return "c" + "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(24))


def q(value) -> str:
    """SQL literal."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(int(value))
    return "'" + str(value).replace("'", "''") + "'"


def ts(iso: str) -> str:
    """Tanggal dari form -> timestamp 08:00 lokal, sama seperti app (`T08:00:00`)."""
    return "'" + iso + "T08:00:00'::timestamp"


def pdate(value, field: str) -> str:
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    if not value:
        raise ValueError(f"{field}: tanggal wajib diisi")
    s = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    raise ValueError(f"{field}: format tanggal tidak dikenal -> {value!r}")


def num(value, field: str, *, required: bool = True, default: int = 0) -> int:
    if value in (None, ""):
        if required:
            raise ValueError(f"{field}: wajib diisi")
        return default
    if isinstance(value, str):
        value = value.replace("Rp", "").replace(" ", "").replace(".", "").replace(",", ".")
        try:
            value = float(value)
        except ValueError as exc:
            raise ValueError(f"{field}: bukan angka -> {value!r}") from exc
    v = round(float(value))
    if v < 0:
        raise ValueError(f"{field}: tidak boleh negatif")
    return v


def norm_pm(value, field: str, default: str = "CASH") -> str:
    s = (str(value or default)).strip().upper().replace("-", "").replace("_", "")
    alias = {
        "CASH": "CASH", "TUNAI": "CASH", "CASHONLY": "CASH",
        "TRANSFER": "TRANSFER", "TF": "TRANSFER", "BANK": "TRANSFER", "TRANSFERBANK": "TRANSFER",
        "EWALLET": "EWALLET", "E-WALLET": "EWALLET", "DANA": "EWALLET", "OVO": "EWALLET",
        "GOPAY": "EWALLET", "SHOPEEPAY": "EWALLET", "QRIS": "EWALLET",
        "PAYLATER": "PAYLATER", "SPAYLATER": "PAYLATER", "SHOPEEPAYLATER": "PAYLATER",
        "KREDIT": "PAYLATER", "CICILAN": "PAYLATER",
        "OTHER": "OTHER", "LAINNYA": "OTHER", "LAIN": "OTHER",
    }
    if s not in alias:
        raise ValueError(f"{field}: metode pembayaran {value!r} tidak dikenal (pilih: {sorted(PM)})")
    return alias[s]


def invoice_no(d: str) -> str:
    """Format app: INV-YYMMDD-XXX (3 digit acak, unik)."""
    base = "INV-" + d[2:4] + d[5:7] + d[8:10]
    return f"{base}-{secrets.randbelow(900) + 100}"


# ---------------------------------------------------------------- sql builder
class Builder:
    def __init__(self, existing_codes: set[str], existing_invoices: set[str]):
        self.sql: list[str] = []
        self.plan: list[str] = []
        self.codes = set(existing_codes)
        self.invoices = set(existing_invoices)
        self.order = 0

    def add(self, stmt: str) -> None:
        self.sql.append(stmt)

    def unit(self, u: dict) -> list[str]:
        """Validasi + bangkitkan SQL untuk 1 unit. Mengembalikan daftar warning."""
        warnings: list[str] = []
        code = str(u.get("code") or "").strip()
        if not code:
            raise ValueError("code: wajib diisi (contoh BI-021 / AND-005)")
        if code in self.codes:
            raise ValueError(f"code {code}: sudah ada di database (InventoryItem.code unik)")
        self.codes.add(code)

        brand = str(u.get("brand") or "Apple").strip()
        model = str(u.get("model") or "").strip()
        storage = str(u.get("storage") or "").strip()
        color = str(u.get("color") or "Various").strip()
        condition = str(u.get("condition") or "Good").strip()
        if not model:
            raise ValueError(f"{code}: model wajib diisi")
        if not storage:
            raise ValueError(f"{code}: storage wajib diisi")

        pdate_iso = pdate(u.get("purchaseDate"), f"{code}.purchaseDate")
        price = num(u.get("purchasePrice"), f"{code}.purchasePrice")
        addl = num(u.get("additionalCost"), f"{code}.additionalCost", required=False)
        asking = u.get("askingPrice")
        asking = num(asking, f"{code}.askingPrice", required=False) if asking not in (None, "") else None
        bhealth = u.get("batteryHealth")
        bhealth = num(bhealth, f"{code}.batteryHealth", required=False) if bhealth not in (None, "") else None
        if bhealth is not None and not 0 <= bhealth <= 100:
            raise ValueError(f"{code}.batteryHealth: harus 0-100")
        imei = (str(u["imei"]).strip() or None) if u.get("imei") else None
        supplier = (str(u["supplier"]).strip() or None) if u.get("supplier") else None
        notes = (str(u["notes"]).strip() or None) if u.get("notes") else None
        pm = norm_pm(u.get("purchasePaymentMethod"), f"{code}.purchasePaymentMethod")

        sale = u.get("sale") or None
        status = "SOLD" if sale else str(u.get("status") or "IN_STOCK").strip().upper()
        if status not in {"IN_STOCK", "SOLD", "RESERVED", "RETURNED"}:
            raise ValueError(f"{code}.status: {status} tidak valid")

        item_id = cuid()
        self.add(
            "INSERT INTO \"InventoryItem\" (id,code,imei,brand,model,storage,color,\"batteryHealth\","
            "condition,status,\"purchaseDate\",supplier,\"purchasePrice\",\"additionalCost\","
            "\"askingPrice\",notes,\"createdAt\",\"updatedAt\") VALUES ("
            f"{q(item_id)},{q(code)},{q(imei)},{q(brand)},{q(model)},{q(storage)},{q(color)},"
            f"{q(bhealth)},{q(condition)},{q(status)},{ts(pdate_iso)},{q(supplier)},{price},{addl},"
            f"{q(asking)},{q(notes)},now(),now());"
        )

        purchase_id = cuid()
        self.add(
            "INSERT INTO \"Purchase\" (id,date,supplier,\"paymentMethod\",notes,\"inventoryItemId\",\"createdAt\") VALUES ("
            f"{q(purchase_id)},{ts(pdate_iso)},{q(supplier)},{q(pm)},{q(notes)},{q(item_id)},now());"
        )
        label = f"{model} {storage} ({code})"

        if pm == "PAYLATER":
            total = num(u.get("totalLiability"), f"{code}.totalLiability")
            tenor = num(u.get("tenorMonths"), f"{code}.tenorMonths")
            if total < price + addl:
                raise ValueError(f"{code}: totalLiability ({total}) < modal ({price + addl})")
            if not 1 <= tenor <= 12:
                raise ValueError(f"{code}: tenorMonths harus 1-12")
            debt_id = cuid()
            self.add(
                "INSERT INTO \"PayLaterDebt\" (id,code,\"debtName\",\"totalLiability\",\"tenorMonths\","
                "\"startDate\",\"purchaseId\",\"createdAt\") VALUES ("
                f"{q(debt_id)},{q('PL-' + code)},{q(u.get('debtName'))},{total},{tenor},"
                f"{ts(pdate_iso)},{q(purchase_id)},now());"
            )
            monthly = total // tenor
            remainder = total - monthly * tenor
            start = datetime.strptime(pdate_iso, "%Y-%m-%d")
            for i in range(tenor):
                due = start
                month = start.month - 1 + i + 1
                year = start.year + month // 12
                month = month % 12 + 1
                day = min(start.day, [31, 29 if year % 4 == 0 and (year % 100 or year % 400 == 0) else 28,
                                      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
                due = due.replace(year=year, month=month, day=day)
                amount = monthly + (remainder if i == tenor - 1 else 0)
                self.add(
                    "INSERT INTO \"PayLaterInstallment\" (id,\"debtId\",\"installmentNo\",\"dueDate\",amount,status) VALUES ("
                    f"{q(cuid())},{q(debt_id)},{i + 1},{ts(due.strftime('%Y-%m-%d'))},{amount},'PENDING');"
                )
            warnings.append(f"{code}: PayLater {total} / {tenor}x (cicilan {monthly}/bln)")
        else:
            self.add(
                "INSERT INTO \"CashTransaction\" (id,date,type,description,income,expense,\"paymentMethod\","
                "\"purchaseId\",\"createdAt\") VALUES ("
                f"{q(cuid())},{ts(pdate_iso)},'PURCHASE',{q('Beli ' + label)},0,{price + addl},"
                f"{q(pm)},{q(purchase_id)},now());"
            )

        if sale:
            sdate_iso = pdate(sale.get("date"), f"{code}.sale.date")
            if sdate_iso < pdate_iso:
                warnings.append(f"{code}: tanggal jual ({sdate_iso}) lebih awal dari tanggal beli ({pdate_iso})")
            sale_price = num(sale.get("salePrice"), f"{code}.sale.salePrice")
            selling_cost = num(sale.get("sellingCost"), f"{code}.sale.sellingCost", required=False)
            spm = norm_pm(sale.get("paymentMethod"), f"{code}.sale.paymentMethod")
            cust = (str(sale["customerName"]).strip() or None) if sale.get("customerName") else None
            sno = (str(sale["notes"]).strip() or None) if sale.get("notes") else None
            inv = invoice_no(sdate_iso)
            tries = 0
            while inv in self.invoices and tries < 50:
                inv = invoice_no(sdate_iso)
                tries += 1
            self.invoices.add(inv)
            sale_id = cuid()
            self.add(
                "INSERT INTO \"Sale\" (id,\"invoiceNo\",date,\"salePrice\",\"sellingCost\",\"paymentMethod\","
                "\"customerName\",notes,\"inventoryItemId\",\"createdAt\") VALUES ("
                f"{q(sale_id)},{q(inv)},{ts(sdate_iso)},{sale_price},{selling_cost},{q(spm)},"
                f"{q(cust)},{q(sno)},{q(item_id)},now());"
            )
            self.add(
                "INSERT INTO \"CashTransaction\" (id,date,type,description,income,expense,\"paymentMethod\","
                "\"saleId\",\"createdAt\") VALUES ("
                f"{q(cuid())},{ts(sdate_iso)},'SALE',{q('Penjualan ' + model + ' (' + code + ')')},"
                f"{sale_price - selling_cost},0,{q(spm)},{q(sale_id)},now());"
            )
            margin = sale_price - selling_cost - (price + addl)
            self.plan.append(
                f"  {code:10s} {model} {storage} | beli {pdate_iso} Rp{price + addl:,} | "
                f"jual {sdate_iso} Rp{sale_price:,} ({spm}) | margin Rp{margin:,} | {inv}"
            )
        else:
            self.plan.append(
                f"  {code:10s} {model} {storage} | beli {pdate_iso} Rp{price + addl:,} ({pm}) | STOK"
            )
        return warnings


# ---------------------------------------------------------------- db access
def psql(sql: str, *, tuples_only: bool = False) -> str:
    cmd = ["docker", "exec", "-i", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME,
           "-v", "ON_ERROR_STOP=1", "-X"]
    if tuples_only:
        cmd += ["-tA"]
    res = subprocess.run(cmd, input=sql, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip())
    return res.stdout


def load_existing() -> tuple[set[str], set[str]]:
    codes = psql('SELECT code FROM "InventoryItem";', tuples_only=True).split("\n")
    invs = psql('SELECT "invoiceNo" FROM "Sale";', tuples_only=True).split("\n")
    return {c.strip() for c in codes if c.strip()}, {i.strip() for i in invs if i.strip()}


def backup() -> str:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = os.path.join(BACKUP_DIR, datetime.now().strftime("pre-import-%Y%m%d-%H%M%S.sql"))
    with open(path, "w", encoding="utf-8") as fh:
        cmd = ["docker", "exec", DB_CONTAINER, "pg_dump", "-U", DB_USER, "-d", DB_NAME,
               "--data-only", "--column-inserts"]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip())
        fh.write(res.stdout)
    return path


def main(argv: list[str]) -> int:
    apply = "--apply" in argv
    do_backup = "--backup" in argv
    files = [a for a in argv[1:] if not a.startswith("--")]
    if not files:
        print(__doc__)
        return 2
    data = json.load(open(files[0], encoding="utf-8"))
    units = data["units"] if isinstance(data, dict) else data
    if not units:
        print("data kosong")
        return 2

    codes, invoices = load_existing()
    b = Builder(codes, invoices)
    warnings: list[str] = []
    errors: list[str] = []
    for idx, u in enumerate(units, 1):
        try:
            warnings += b.unit(u)
        except Exception as exc:  # kumpulkan semua error dulu, jangan setengah jalan
            errors.append(f"baris {idx}: {exc}")

    print(f"=== RENCANA IMPOR ({len(units)} unit) ===")
    print("\n".join(b.plan) if b.plan else "  (tidak ada baris valid)")
    if warnings:
        print("\n=== PERHATIAN ===")
        print("\n".join("  ! " + w for w in warnings))
    if errors:
        print("\n=== ERROR (impor dibatalkan) ===")
        print("\n".join("  x " + e for e in errors))
        return 1

    print(f"\n{len(b.sql)} statement SQL siap. Mode: {'APPLY' if apply else 'DRY RUN'}")
    if not apply:
        print("\n--- SQL (10 baris pertama) ---")
        print("\n".join(b.sql[:10]))
        print("\nJalankan ulang dengan --apply untuk menulis ke database.")
        return 0

    if do_backup:
        print("backup:", backup())

    psql("BEGIN;\n" + "\n".join(b.sql) + "\nCOMMIT;\n")
    count = psql(
        "SELECT count(*) FROM \"InventoryItem\" i WHERE i.code IN ("
        + ",".join(q(str(u.get("code")).strip()) for u in units) + ");", tuples_only=True).strip()
    print(f"OK. unit sekarang ada di DB: {count}/{len(units)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
