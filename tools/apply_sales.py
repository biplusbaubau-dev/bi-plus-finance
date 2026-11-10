#!/usr/bin/env python3
"""Tahap 2: jual unit yang sudah ada di database (meniru createSale di app/actions.ts).

Menulis: Sale + CashTransaction(SALE) + InventoryItem.status=SOLD.
Append-only: menolak unit yang sudah punya Sale / status bukan IN_STOCK.

Pemakaian:
  python3 tools/apply_sales.py sales.json            # DRY RUN
  python3 tools/apply_sales.py sales.json --apply --backup

Format sales.json:
{"sales":[{"code":"BI-015","salePrice":3500000,"saleDate":"2026-11-04","paymentMethod":"CASH","customerName":null}]}
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys

_spec = importlib.util.spec_from_file_location(
    "import_units", os.path.join(os.path.dirname(os.path.abspath(__file__)), "import_units.py"))
assert _spec is not None and _spec.loader is not None
iu = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(iu)

q, ts, pdate, num, norm_pm, cuid, psql = iu.q, iu.ts, iu.pdate, iu.num, iu.norm_pm, iu.cuid, iu.psql


def db_rows(sql: str) -> list[dict]:
    out = psql(sql, tuples_only=True)
    rows = []
    for line in out.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.split("|")
        rows.append({"id": parts[0], "code": parts[1], "status": parts[2], "model": parts[3],
                     "storage": parts[4], "cost": int(parts[5] or 0), "has_sale": parts[6] == "t"})
    return rows


def main(argv: list[str]) -> int:
    apply = "--apply" in argv
    do_backup = "--backup" in argv
    files = [a for a in argv[1:] if not a.startswith("--")]
    if not files:
        print(__doc__)
        return 2
    data = json.load(open(files[0], encoding="utf-8"))
    sales = data["sales"] if isinstance(data, dict) else data
    if not sales:
        print("data kosong")
        return 2

    codes = ",".join(q(str(s.get("code", "")).strip()) for s in sales)
    units = {u["code"]: u for u in db_rows(
        'SELECT i.id, i.code, i.status::text, i.model, i.storage, '
        '(i."purchasePrice"+i."additionalCost"), (s.id IS NOT NULL) '
        'FROM "InventoryItem" i LEFT JOIN "Sale" s ON s."inventoryItemId"=i.id '
        f'WHERE i.code IN ({codes});')}

    existing_inv = {x.strip() for x in psql('SELECT "invoiceNo" FROM "Sale";', tuples_only=True).split("\n") if x.strip()}
    sql: list[str] = []
    plan: list[str] = []
    errors: list[str] = []
    warnings: list[str] = []
    seen: set[str] = set()

    for idx, s in enumerate(sales, 1):
        code = str(s.get("code") or "").strip()
        try:
            if not code:
                raise ValueError("code kosong")
            if code in seen:
                raise ValueError(f"code {code} dobel di file input")
            seen.add(code)
            u = units.get(code)
            if not u:
                raise ValueError(f"code {code} tidak ada di database — input stoknya dulu")
            if u["has_sale"]:
                raise ValueError(f"code {code} sudah pernah dijual (punya Sale)")
            if u["status"] != "IN_STOCK":
                raise ValueError(f"code {code} statusnya {u['status']}, bukan IN_STOCK")

            sale_price = num(s.get("salePrice"), f"{code}.salePrice")
            selling_cost = num(s.get("sellingCost"), f"{code}.sellingCost", required=False)
            if sale_price <= 0:
                raise ValueError(f"{code}.salePrice: harus > 0")
            d = pdate(s.get("saleDate"), f"{code}.saleDate")
            pm = norm_pm(s.get("paymentMethod"), f"{code}.salePaymentMethod")
            cust = (str(s["customerName"]).strip() or None) if s.get("customerName") else None
            notes = (str(s["notes"]).strip() or None) if s.get("notes") else None

            inv = iu.invoice_no(d)
            for _ in range(50):
                if inv not in existing_inv:
                    break
                inv = iu.invoice_no(d)
            existing_inv.add(inv)

            sale_id = cuid()
            sql.append(
                'INSERT INTO "Sale" (id,"invoiceNo",date,"salePrice","sellingCost","paymentMethod",'
                '"customerName",notes,"inventoryItemId","createdAt") VALUES ('
                f'{q(sale_id)},{q(inv)},{ts(d)},{sale_price},{selling_cost},{q(pm)},'
                f'{q(cust)},{q(notes)},{q(u["id"])},now());')
            sql.append(
                'INSERT INTO "CashTransaction" (id,date,type,description,income,expense,"paymentMethod",'
                '"saleId","createdAt") VALUES ('
                f'{q(cuid())},{ts(d)},\'SALE\',{q("Penjualan " + u["model"] + " (" + code + ")")},'
                f'{sale_price - selling_cost},0,{q(pm)},{q(sale_id)},now());')
            sql.append(f'UPDATE "InventoryItem" SET status=\'SOLD\', "updatedAt"=now() WHERE id={q(u["id"])};')

            margin = sale_price - selling_cost - u["cost"]
            if margin < 0:
                warnings.append(f"{code}: RUGI {margin:,} (jual {sale_price:,} < modal {u['cost']:,})")
            plan.append(f'  {code:9s} {u["model"][:34]:34s} | modal {u["cost"]:>10,} | '
                        f'jual {d} {sale_price:>10,} | margin {margin:>10,} | {inv}')
        except Exception as exc:
            errors.append(f"baris {idx}: {exc}")

    print(f"=== RENCANA PENJUALAN ({len(sales)} unit) ===")
    print("\n".join(plan) if plan else "  (tidak ada baris valid)")
    if plan:
        tot_sale = sum(1 for _ in plan)
        print(f"\n  total {tot_sale} unit")
    if warnings:
        print("\n=== PERHATIAN ===")
        print("\n".join("  ! " + w for w in warnings))
    if errors:
        print("\n=== ERROR (dibatalkan semua) ===")
        print("\n".join("  x " + e for e in errors))
        return 1

    print(f"\n{len(sql)} statement SQL. Mode: {'APPLY' if apply else 'DRY RUN'}")
    if not apply:
        print("\nJalankan ulang dengan --apply --backup untuk menulis.")
        return 0

    if do_backup:
        print("backup:", iu.backup())
    psql("BEGIN;\n" + "\n".join(sql) + "\nCOMMIT;\n")
    check = psql(
        "SELECT count(*) FROM \"Sale\" s JOIN \"InventoryItem\" i ON i.id=s.\"inventoryItemId\" "
        f"WHERE i.code IN ({codes});", tuples_only=True).strip()
    print(f"OK. unit terjual sekarang: {check}/{len(sales)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
