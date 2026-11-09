#!/usr/bin/env python3
"""Parse BI+ Excel v1(3) into import_data.json. Does not touch the database."""
import json
import re
from datetime import date, datetime, timedelta

import openpyxl

EXCEL = r"C:/Users/Administrator/Downloads/BI+ Finance Report — FINAL v1(3).xlsm"

BRANDS = ("Oppo", "Realme", "Samsung", "Xiaomi", "Vivo", "Infinix", "Tecno", "Nokia", "Huawei", "Advan", "Itel")


def pdate(v):
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, (int, float)):
        return (datetime(1899, 12, 30) + timedelta(days=int(v))).date().isoformat()
    return str(v)[:10]


def money(v):
    if v is None or v == "":
        return 0
    if isinstance(v, (int, float)):
        return int(round(v))
    s = str(v).strip().replace(".", "").replace(",", "")
    if s in ("", "-", "None"):
        return 0
    return int(round(float(s)))


def brand_of(model):
    low = model.lower()
    for name in BRANDS:
        if name.lower() in low:
            return name
    return "Apple"


def storage_of(model):
    if "128" in model:
        return "128GB"
    if "64" in model or "A53" in model or "Realme" in model:
        return "64GB"
    return "Unknown"


wb = openpyxl.load_workbook(EXCEL, data_only=True)

units = []
for row in wb["Data Unit"].iter_rows(min_row=5, values_only=True):
    if not row[0] or not re.match(r"^[A-Z]+-\d+$", str(row[0]).strip()):
        continue
    code = str(row[0]).strip()
    model = str(row[2] or "").strip() or "Unknown"
    note = str(row[12]).strip() if row[12] and str(row[12]).strip() not in ("", "-", "None") else None
    returned = code == "BI-003" or "retur" in (note or "").lower()
    method = "PAYLATER" if str(row[13] or "").strip() == "PayLater" else "CASH"
    tenor = int(row[16]) if isinstance(row[16], (int, float)) else 0
    units.append({
        "code": code,
        "model": model,
        "brand": brand_of(model),
        "storage": storage_of(model),
        "status": "RETURNED" if returned else "SOLD",
        "purchase_date": pdate(row[1]),
        "purchase_price": money(row[3]),
        "additional_cost": money(row[4]),
        "notes": note,
        "payment_method": method,
        "sold_date": pdate(row[6]),
        "debt_id": str(row[14]).strip() if row[14] else None,
        "total_liability": money(row[15]),
        "tenor_months": tenor,
    })

unit_pay = {u["code"]: u["payment_method"] for u in units}
sales = []
for row in wb["Penjualan"].iter_rows(min_row=5, values_only=True):
    if not row[0] or not str(row[0]).startswith("INV-"):
        continue
    code = str(row[2] or "").strip()
    acc = money(row[5])
    sales.append({
        "invoice_no": str(row[0]).strip(),
        "date": pdate(row[1]),
        "unit_code": code,
        "model": str(row[3] or "").strip(),
        "sale_price": money(row[4]),
        "accessory": acc,
        "payment_method": unit_pay.get(code, "CASH"),
        "notes": str(row[10]).strip() if row[10] and str(row[10]).strip() not in ("", "-", "None") else None,
        "total_sale": money(row[6]),
        "skip_sale": code == "BI-003",
    })

kas = []
for row in wb["Kas & Cicilan"].iter_rows(min_row=5, values_only=True):
    jenis = str(row[1] or "").strip()
    if jenis not in {"Modal", "Penjualan", "Cicilan", "Biaya", "Beli Aksesoris", "Beli stok", "Aksesoris"}:
        continue
    if not pdate(row[0]):
        continue
    ref = str(row[6]).strip() if row[6] else None
    desc = str(row[2] or "").strip()
    # BI-005 has no amount and no unit row. User chose to skip it.
    if ref == "BI-005" or "BI-005" in desc:
        continue
    kas.append({
        "date": pdate(row[0]),
        "type": jenis,
        "description": desc or jenis,
        "income": money(row[3]),
        "expense": money(row[4]),
        "unit_or_debt": ref,
        "notes": str(row[7]).strip() if row[7] and str(row[7]).strip() not in ("", "-", "None") else None,
    })

installments = []
for row in list(wb["Kas & Cicilan"].iter_rows(values_only=True))[42:]:
    code = str(row[0] or "").strip()
    if not (code.startswith("SP-") and row[3] not in (None, "")):
        continue
    status = f"{row[7] or ''} {row[9] or ''}"
    installments.append({
        "code": code,
        "debt_code": str(row[1]).strip(),
        "no": int(float(str(row[3]))),
        "due": pdate(row[5]),
        "amount": money(row[6]),
        "paid": "Dibayar" in status or "Selesai" in status,
        "paid_at": pdate(row[8]),
    })

out = {"units": units, "sales": sales, "kas": kas, "installments": installments}
json.dump(out, open("import_data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2, default=str)
print(f"units={len(units)} sales={len(sales)} kas={len(kas)} inst={len(installments)}")
print("returned", [u["code"] for u in units if u["status"] == "RETURNED"])
print("kas types", {k["type"] for k in kas})
