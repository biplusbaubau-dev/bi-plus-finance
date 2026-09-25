#!/usr/bin/env python3
"""Import Excel BI+ Finance ke PostgreSQL - versi ringkas."""

EXCEL = "C:/Users/Administrator/Downloads/BI+ Finance Report — FINAL v1(2).xlsm"
ENV = ".env"

import openpyxl, psycopg2, json, os, re, sys
from datetime import datetime, timedelta, date
from urllib.parse import urlparse

# ── helpers ────────────────────────────────────────────────────────
def db_url():
    with open(ENV) as f:
        for l in f:
            if l.startswith("DATABASE_URL="):
                return l.split("=",1)[1].strip().strip('"')
    raise RuntimeError("no DATABASE_URL")

def pdate(v):
    if v is None: return None
    if isinstance(v,(datetime,date)): return v if isinstance(v,datetime) else datetime.combine(v,datetime.min.time())
    if isinstance(v,(int,float)):
        try: return datetime(1899,12,30)+timedelta(days=int(v))
        except: return None
    if isinstance(v,str):
        v=v.strip()
        for f in ("%Y-%m-%d","%d/%m/%Y","%m/%d/%Y"):
            try: return datetime.strptime(v,f)
            except: pass
    return None

def pmoney(v):
    if v is None: return 0
    if isinstance(v,(int,float)): return int(v)
    if isinstance(v,str):
        v=v.replace(".","").replace(",","").strip()
        if v in ("","-","none",""): return 0
        try: return int(float(v))
        except: return 0
    return 0

def pstatus(v):
    if not v: return "IN_STOCK"
    s=str(v).lower().replace("✅","").replace("❌","").replace("🟡","").strip()
    if "terjual" in s or "sold" in s: return "SOLD"
    if "reserve" in s or "dipinjam" in s: return "RESERVED"
    if "retur" in s or "return" in s: return "RETURNED"
    return "IN_STOCK"

def ppay(v):
    if not v: return "CASH"
    m={"CASH":"CASH","TUNAI":"CASH","TRANSFER":"TRANSFER","TRANSFER BANK":"TRANSFER",
       "EWALLET":"EWALLET","E-WALLET":"EWALLET","PAYLATER":"PAYLATER","SPAYLATER":"PAYLATER",
       "SPAY":"PAYLATER","OTHER":"OTHER","LAIN":"OTHER","LAINNYA":"OTHER"}
    return m.get(str(v).upper().strip(),"CASH")

# ── load excel ─────────────────────────────────────────────────────
print("Loading Excel...")
wb=openpyxl.load_workbook(EXCEL,data_only=True)

# ── parse Data Unit ────────────────────────────────────────────────
ws_u=wb["Data Unit"]; units=[]
for row in ws_u.iter_rows(min_row=4,values_only=True):
    if not row[0]: continue
    code=str(row[0]).strip()
    if not re.match(r"^[A-Z]+-\d+$",code): continue
    status=pstatus(row[11]); model=str(row[2] or "").strip() or "Unknown"
    pp=pmoney(row[3]); ac=pmoney(row[4])
    units.append(dict(
        code=code, model=model,
        storage="64GB" if "64" in model or "A53" in model or "Realme" in model else ("128GB" if "128" in model else "Unknown"),
        color="Various", battery_health=None, condition="Good",
        status=status, purchase_date=pdate(row[1]), supplier=None,
        purchase_price=pp, additional_cost=ac,
        asking_price=pmoney(row[7]) if status!="SOLD" else None,
        notes=str(row[12] or "").strip() if row[12] and str(row[12]).strip() not in ("","-","None") else None,
        payment_method=ppay(row[13]), sold_date=pdate(row[6]),
        sale_price=pmoney(row[7]) if status=="SOLD" else None,
        debt_id=str(row[14] or "").strip() if row[14] and str(row[14]).strip() not in ("","-","None") else None,
        total_liability=pmoney(row[15]) if row[15] else 0,
        tenor_months=row[16], installment_amount=pmoney(row[17]) if row[17] else None,
    ))

# ── parse Penjualan ────────────────────────────────────────────────
ws_s=wb["Penjualan"]; sales=[]
for row in ws_s.iter_rows(min_row=4,values_only=True):
    if not row[0]: continue
    inv=str(row[0]).strip()
    if not inv.startswith("INV-"): continue
    ucode=str(row[2] or "").strip()
    pm="CASH"
    for u in units:
        if u["code"]==ucode: pm=u["payment_method"]; break
    acc=pmoney(row[5])
    sales.append(dict(
        invoice_no=inv, date=pdate(row[1]), unit_code=ucode,
        model=str(row[3] or "").strip(),
        sale_price=pmoney(row[4]), selling_cost=abs(acc) if acc!=0 else 0,
        payment_method=pm, customer_name=None,
        notes=str(row[10] or "").strip() if row[10] and str(row[10]).strip() not in ("","-","None") else None,
        total_sale=pmoney(row[6]), total_modal=pmoney(row[7]), profit=pmoney(row[8]),
    ))

# ── parse Kas ──────────────────────────────────────────────────────
ws_k=wb["Kas & Cicilan"]; kas=[]
for row in ws_k.iter_rows(min_row=4,values_only=True):
    if not row[0]: continue
    dt=pdate(row[0])
    if not dt: continue
    itype=str(row[1] or "").strip()
    desc=str(row[2] or "").strip()
    inc=pmoney(row[3]); exp=pmoney(row[4])
    ref=str(row[6] or "").strip() if row[6] else None
    kn=str(row[7] or "").strip() if row[7] and str(row[7]).strip() not in ("","-","None") else None
    kas.append(dict(date=dt,type=itype,description=desc,income=inc,expense=exp,unit_or_debt=ref,notes=kn))

print(f"Parsed: {len(units)} units, {len(sales)} sales, {len(kas)} kas entries")

# ── store for import ───────────────────────────────────────────────
IMPORT_DATA = {"units": units, "sales": sales, "kas": kas}

if __name__ == "__main__":
    import json
    with open("import_data.json","w") as f: json.dump(IMPORT_DATA, f, indent=2, default=str, ensure_ascii=False)
    print("Saved import_data.json")
