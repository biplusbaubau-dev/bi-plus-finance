#!/usr/bin/env python3
"""Eksekusi import dari import_data.json ke database."""
import json, psycopg2, uuid
from datetime import datetime
from urllib.parse import urlparse

DATA_FILE = "import_data.json"
BACKUP_FILE = "db_backup_before_import.json"

def cuid():
    """Generate Prisma-style cuid: c + 24 hex chars."""
    return "c" + uuid.uuid4().hex[:24]

def db_url():
    with open(".env") as f:
        for l in f:
            if l.startswith("DATABASE_URL="):
                return l.split("=",1)[1].strip().strip('"')

def parse_dt(v):
    if v is None: return None
    if isinstance(v,str):
        try: return datetime.fromisoformat(v)
        except: return None
    return v

# Load data
with open(DATA_FILE) as f: d = json.load(f)
units, sales, kas = d["units"], d["sales"], d["kas"]
print(f"Data: {len(units)} units, {len(sales)} sales, {len(kas)} kas")

# Connect
url=db_url(); p=urlparse(url)
cs=f"host={p.hostname} port={p.port} dbname={p.path.lstrip('/')} user={p.username} password={p.password}"
conn=psycopg2.connect(cs); conn.autocommit=False; cur=conn.cursor()
print(f"Connect: {p.hostname}:{p.port}/{p.path.lstrip('/')}")

# Backup
print("\n=== BACKUP ===")
bk={"timestamp":datetime.now().isoformat(),"tables":{}}
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")
for t in [r[0] for r in cur.fetchall()]:
    cur.execute(f'SELECT * FROM "{t}"')
    cols=[d2[0] for d2 in cur.description]; rows=cur.fetchall()
    bk["tables"][t]={"columns":cols,"count":len(rows),"data":[dict(zip(cols,r)) for r in rows]}
    print(f"  {t}: {len(rows)}")
with open(BACKUP_FILE,"w") as f: json.dump(bk,f,default=str)
print(f"Backup: {BACKUP_FILE}")

# Delete all
print("\n=== DELETE ===")
for t in ['"CashTransaction"','"Sale"','"Expense"','"OtherIncome"','"PayLaterInstallment"','"PayLaterDebt"','"Purchase"','"InventoryItem"']:
    cur.execute(f"DELETE FROM {t}")
conn.commit(); print("Done")

# ── Import Units (InventoryItem + Purchase + PayLater) ─────────────
print("\n=== IMPORT UNITS ===")
for u in units:
    pd = parse_dt(u.get("purchase_date"))
    item_id = cuid()
    cur.execute('''INSERT INTO "InventoryItem"(id,code,imei,brand,model,storage,color,
        "batteryHealth",condition,status,"purchaseDate",supplier,"purchasePrice",
        "additionalCost","askingPrice",notes,"updatedAt") VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
        (item_id,u["code"],None,"Apple",u["model"],u["storage"],u["color"],
         None,"Good",u["status"],pd,None,u["purchase_price"],u["additional_cost"],
         u.get("asking_price"),u.get("notes"),datetime.now()))
    
    # Purchase
    purchase_id = cuid()
    cur.execute('''INSERT INTO "Purchase"(id,date,supplier,"paymentMethod",notes,"inventoryItemId")
        VALUES(%s,%s,%s,%s,%s,%s)''', (purchase_id,pd, None, u["payment_method"], u.get("notes"), item_id))
    
    # Cash transaction for non-PayLater
    if u["payment_method"] != "PAYLATER":
        cur.execute('''INSERT INTO "CashTransaction"(id,date,type,description,income,expense,"paymentMethod","purchaseId")
            VALUES(%s,%s,'PURCHASE',%s,0,%s,%s,%s)''',
            (cuid(),pd, f"Beli {u['model']} ({u['code']})", u["purchase_price"]+u["additional_cost"], u["payment_method"], purchase_id))
    
    # PayLater debt + installments
    if u["payment_method"] == "PAYLATER" and u.get("debt_id"):
        debt_id = cuid()
        cur.execute('''INSERT INTO "PayLaterDebt"(id,code,"totalLiability","tenorMonths","startDate","purchaseId")
            VALUES(%s,%s,%s,%s,%s,%s)''',
            (debt_id,u["debt_id"], u["total_liability"], u["tenor_months"], pd, purchase_id))
        if u["tenor_months"] and u["total_liability"]:
            monthly = u["total_liability"] // int(u["tenor_months"])
            remainder = u["total_liability"] - monthly * int(u["tenor_months"])
            for i in range(int(u["tenor_months"])):
                due = pd.replace(month=pd.month+i+1)
                amt = monthly + (remainder if i==int(u["tenor_months"])-1 else 0)
                cur.execute('''INSERT INTO "PayLaterInstallment"(id,"debtId","installmentNo","dueDate",amount,status)
                    VALUES(%s,%s,%s,%s,%s,'PENDING')''', (cuid(),debt_id, i+1, due, amt))

conn.commit(); print("Units OK")

# ── Import Sales ───────────────────────────────────────────────────
print("\n=== IMPORT SALES ===")
for s in sales:
    sd = parse_dt(s.get("date"))
    cur.execute('SELECT id FROM "InventoryItem" WHERE code=%s', (s["unit_code"],))
    row = cur.fetchone()
    if not row:
        print(f"  SKIP {s['unit_code']} not found")
        continue
    item_id = row[0]
    sale_id = cuid()
    cur.execute('''INSERT INTO "Sale"(id,"invoiceNo",date,"salePrice","sellingCost",
        "paymentMethod","customerName",notes,"inventoryItemId") VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
        (sale_id,s["invoice_no"],sd,s["sale_price"],s["selling_cost"],
         s["payment_method"],None,s.get("notes"),item_id))
    cur.execute('UPDATE "InventoryItem" SET status=%s WHERE id=%s', ("SOLD", item_id))
    cur.execute('''INSERT INTO "CashTransaction"(id,date,type,description,income,expense,"paymentMethod","saleId")
        VALUES(%s,%s,'SALE',%s,%s,0,%s,%s)''',
        (cuid(),sd, f"Penjualan {s['model']} ({s['unit_code']})",
         s["total_sale"]-s["selling_cost"], s["payment_method"], sale_id))

conn.commit(); print("Sales OK")

# ── Import Kas ─────────────────────────────────────────────────────
print("\n=== IMPORT KAS ===")
for k in kas:
    kd = parse_dt(k.get("date"))
    itype = k["type"]; desc = k.get("description") or itype
    inc = k.get("income") or 0; exp = k.get("expense") or 0
    ref = k.get("unit_or_debt"); notes = k.get("notes")
    
    if itype == "Penjualan":
        continue  # Already handled by sales
    elif itype == "Modal":
        oi_id = cuid()
        cur.execute('''INSERT INTO "OtherIncome"(id,date,source,amount,"paymentMethod",notes)
            VALUES(%s,%s,%s,%s,'CASH',%s)''', (oi_id,kd, desc, inc, notes))
        cur.execute('''INSERT INTO "CashTransaction"(id,date,type,description,income,expense,"paymentMethod","otherIncomeId")
            VALUES(%s,%s,'OTHER_INCOME',%s,%s,0,'CASH',%s)''', (cuid(),kd, desc, inc, oi_id))
    elif itype in ("Beli stok", "Beli Aksesoris", "Biaya"):
        exp_id = cuid()
        cur.execute('''INSERT INTO "Expense"(id,date,category,amount,"paymentMethod",description,notes)
            VALUES(%s,%s,'OTHER',%s,'CASH',%s,%s)''', (exp_id,kd, exp or inc, desc, notes))
        cur.execute('''INSERT INTO "CashTransaction"(id,date,type,description,income,expense,"paymentMethod","expenseId")
            VALUES(%s,%s,'EXPENSE',%s,0,%s,'CASH',%s)''', (cuid(),kd, desc, exp or inc, exp_id))
    elif itype == "Cicilan":
        if ref:
            cur.execute('SELECT id FROM "PayLaterDebt" WHERE code=%s', (ref,))
            debt_row = cur.fetchone()
            if debt_row:
                cur.execute('SELECT id FROM "PayLaterInstallment" WHERE "debtId"=%s AND status=%s ORDER BY "installmentNo" LIMIT 1', (debt_row[0], "PENDING"))
                inst_row = cur.fetchone()
                if inst_row:
                    cur.execute('UPDATE "PayLaterInstallment" SET status=%s,"paidAt"=%s WHERE id=%s', ("PAID", kd, inst_row[0]))
                    cur.execute('''INSERT INTO "CashTransaction"(id,date,type,description,income,expense,"paymentMethod","installmentId")
                        VALUES(%s,%s,'PAYLATER_PAYMENT',%s,0,%s,'PAYLATER',%s)''',
                        (cuid(),kd, f"Cicilan {ref}", exp, inst_row[0]))
    else:
        cur.execute('''INSERT INTO "CashTransaction"(id,date,type,description,income,expense,"paymentMethod")
            VALUES(%s,%s,'OTHER_INCOME',%s,%s,0,'CASH')''', (cuid(),kd, desc, inc))

conn.commit(); print("Kas OK")

# ── Verify ──────────────────────────────────────────────────────────
print("\n=== VERIFY ===")
for t in ['"InventoryItem"','"Purchase"','"Sale"','"CashTransaction"','"PayLaterDebt"','"PayLaterInstallment"','"Expense"','"OtherIncome"']:
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    print(f"  {t}: {cur.fetchone()[0]}")

cur.close(); conn.close()
print("\nDONE")
