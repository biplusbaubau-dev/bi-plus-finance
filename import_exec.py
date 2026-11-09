#!/usr/bin/env python3
"""Replace finance rows from import_data.json. Accessory and UnitImage stay."""
import json
import uuid
from datetime import datetime
from urllib.parse import urlparse

import psycopg2

DATA_FILE = "import_data.json"
BACKUP_FILE = "db_backup_before_import.json"


def cuid():
    return "c" + uuid.uuid4().hex[:24]


def db_url():
    with open(".env", encoding="utf-8") as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError("DATABASE_URL missing")


def dt(v):
    return datetime.fromisoformat(v) if v else None


def due_on_25(start, n):
    month = start.month + n
    year = start.year + (month - 1) // 12
    month = (month - 1) % 12 + 1
    return start.replace(year=year, month=month, day=25)


with open(DATA_FILE, encoding="utf-8") as f:
    data = json.load(f)

url = urlparse(db_url())
conn = psycopg2.connect(
    host=url.hostname,
    port=url.port,
    dbname=url.path.lstrip("/"),
    user=url.username,
    password=url.password,
)
conn.autocommit = False
cur = conn.cursor()

backup = {"timestamp": datetime.now().isoformat(), "tables": {}}
cur.execute(
    "SELECT table_name FROM information_schema.tables "
    "WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
)
for table in [r[0] for r in cur.fetchall()]:
    cur.execute(f'SELECT * FROM "{table}"')
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    backup["tables"][table] = {"count": len(rows), "data": [dict(zip(cols, r)) for r in rows]}
    print(f"backup {table}: {len(rows)}")
with open(BACKUP_FILE, "w", encoding="utf-8") as f:
    json.dump(backup, f, default=str)
print(f"wrote {BACKUP_FILE}")

for table in (
    "CashTransaction",
    "Sale",
    "Expense",
    "OtherIncome",
    "PayLaterInstallment",
    "PayLaterDebt",
    "Purchase",
    "InventoryItem",
):
    cur.execute(f'DELETE FROM "{table}"')
print("deleted finance rows")

now = datetime.now()
item_ids = {}
debt_ids = {}

for u in data["units"]:
    item_id = cuid()
    item_ids[u["code"]] = item_id
    purchased = dt(u["purchase_date"])
    cur.execute(
        '''INSERT INTO "InventoryItem"
        (id,code,brand,model,storage,color,condition,status,"purchaseDate",
         "purchasePrice","additionalCost",notes,"createdAt","updatedAt")
        VALUES (%s,%s,%s,%s,%s,'Various','Good',%s,%s,%s,%s,%s,%s,%s)''',
        (
            item_id, u["code"], u["brand"], u["model"], u["storage"], u["status"],
            purchased, u["purchase_price"], u["additional_cost"], u["notes"], now, now,
        ),
    )
    purchase_id = cuid()
    cur.execute(
        '''INSERT INTO "Purchase"(id,date,"paymentMethod",notes,"inventoryItemId","createdAt")
        VALUES (%s,%s,%s,%s,%s,%s)''',
        (purchase_id, purchased, u["payment_method"], u["notes"], item_id, now),
    )
    if u["payment_method"] == "PAYLATER" and u["debt_id"] and u["status"] != "RETURNED":
        debt_id = cuid()
        debt_ids[u["debt_id"]] = debt_id
        cur.execute(
            '''INSERT INTO "PayLaterDebt"
            (id,code,"totalLiability","tenorMonths","startDate","purchaseId","createdAt")
            VALUES (%s,%s,%s,%s,%s,%s,%s)''',
            (debt_id, u["debt_id"], u["total_liability"], u["tenor_months"], purchased, purchase_id, now),
        )

by_debt = {}
for inst in data["installments"]:
    by_debt.setdefault(inst["debt_code"], []).append(inst)

for debt_code, debt_id in debt_ids.items():
    rows = sorted(by_debt.get(debt_code, []), key=lambda x: x["no"])
    unit = next(u for u in data["units"] if u["debt_id"] == debt_code)
    start = dt(unit["purchase_date"])
    if not rows and unit["tenor_months"] > 0:
        monthly = unit["total_liability"] // unit["tenor_months"]
        rem = unit["total_liability"] - monthly * unit["tenor_months"]
        rows = [
            {"no": i + 1, "amount": monthly + (rem if i == unit["tenor_months"] - 1 else 0),
             "due": due_on_25(start, i + 1).date().isoformat(), "paid": False, "paid_at": None}
            for i in range(unit["tenor_months"])
        ]
    for inst in rows:
        due = dt(inst["due"]) or due_on_25(start, inst["no"])
        paid_at = dt(inst["paid_at"]) if inst["paid"] else None
        cur.execute(
            '''INSERT INTO "PayLaterInstallment"
            (id,"debtId","installmentNo","dueDate",amount,status,"paidAt")
            VALUES (%s,%s,%s,%s,%s,%s,%s)''',
            (cuid(), debt_id, inst["no"], due, inst["amount"], "PAID" if inst["paid"] else "PENDING", paid_at),
        )

for sale in data["sales"]:
    if sale["skip_sale"]:
        print(f"skip sale {sale['invoice_no']} BI-003 returned")
        continue
    sold = dt(sale["date"])
    sale_id = cuid()
    note = sale["notes"]
    if sale["accessory"]:
        extra = f"Aksesoris {sale['accessory']:+,}".replace(",", ".")
        note = f"{note} | {extra}" if note else extra
    cur.execute(
        '''INSERT INTO "Sale"
        (id,"invoiceNo",date,"salePrice","sellingCost","paymentMethod",notes,"inventoryItemId","createdAt")
        VALUES (%s,%s,%s,%s,0,%s,%s,%s,%s)''',
        (sale_id, sale["invoice_no"], sold, sale["sale_price"], sale["payment_method"], note, item_ids[sale["unit_code"]], now),
    )

# Kas sheet is the only cash ledger. Sales and purchases are not posted twice.
for row in data["kas"]:
    when = dt(row["date"])
    kind, desc = row["type"], row["description"]
    income, expense = row["income"], row["expense"]
    ref = row["unit_or_debt"]
    if kind == "Penjualan":
        cur.execute('SELECT id FROM "Sale" WHERE "invoiceNo"=%s', (desc,))
        found = cur.fetchone()
        cur.execute(
            '''INSERT INTO "CashTransaction"
            (id,date,type,description,income,expense,"paymentMethod","saleId","createdAt")
            VALUES (%s,%s,'SALE',%s,%s,%s,'CASH',%s,%s)''',
            (cuid(), when, desc, income, expense, found[0] if found else None, now),
        )
    elif kind == "Cicilan":
        cur.execute(
            '''INSERT INTO "CashTransaction"
            (id,date,type,description,income,expense,"paymentMethod","createdAt")
            VALUES (%s,%s,'PAYLATER_PAYMENT',%s,%s,%s,'PAYLATER',%s)''',
            (cuid(), when, f"{desc} {ref or ''}".strip(), income, expense, now),
        )
    elif kind == "Modal" and income > 0 and expense == 0:
        other_id = cuid()
        cur.execute(
            '''INSERT INTO "OtherIncome"(id,date,source,amount,"paymentMethod",notes,"createdAt")
            VALUES (%s,%s,%s,%s,'CASH',%s,%s)''',
            (other_id, when, desc, income, row["notes"], now),
        )
        cur.execute(
            '''INSERT INTO "CashTransaction"
            (id,date,type,description,income,expense,"paymentMethod","otherIncomeId","createdAt")
            VALUES (%s,%s,'OTHER_INCOME',%s,%s,0,'CASH',%s,%s)''',
            (cuid(), when, desc, income, other_id, now),
        )
    elif income > 0 and expense == 0:
        other_id = cuid()
        cur.execute(
            '''INSERT INTO "OtherIncome"(id,date,source,amount,"paymentMethod",notes,"createdAt")
            VALUES (%s,%s,%s,%s,'CASH',%s,%s)''',
            (other_id, when, desc or kind, income, row["notes"], now),
        )
        cur.execute(
            '''INSERT INTO "CashTransaction"
            (id,date,type,description,income,expense,"paymentMethod","otherIncomeId","createdAt")
            VALUES (%s,%s,'OTHER_INCOME',%s,%s,0,'CASH',%s,%s)''',
            (cuid(), when, desc or kind, income, other_id, now),
        )
    elif expense > 0:
        category = "MARKETING" if "iklan" in desc.lower() or "marketing" in desc.lower() else "OTHER"
        if "transport" in desc.lower() or "packing" in desc.lower():
            category = "TRANSPORT"
        exp_id = cuid()
        cur.execute(
            '''INSERT INTO "Expense"(id,date,category,amount,"paymentMethod",description,notes,"createdAt")
            VALUES (%s,%s,%s,%s,'CASH',%s,%s,%s)''',
            (exp_id, when, category, expense, desc, row["notes"], now),
        )
        tx_type = "PURCHASE" if kind in ("Beli stok", "Beli Aksesoris", "Modal") else "EXPENSE"
        cur.execute(
            '''INSERT INTO "CashTransaction"
            (id,date,type,description,income,expense,"paymentMethod","expenseId","createdAt")
            VALUES (%s,%s,%s,%s,0,%s,'CASH',%s,%s)''',
            (cuid(), when, tx_type, desc, expense, exp_id, now),
        )
    else:
        print(f"skip zero kas {when.date()} {kind} {desc}")

conn.commit()

cur.execute('SELECT COALESCE(SUM(income),0), COALESCE(SUM(expense),0) FROM "CashTransaction"')
inc, exp = cur.fetchone()
print(f"cash in {inc:,} out {exp:,} balance {inc - exp:,}")
cur.execute('SELECT status, COUNT(*) FROM "InventoryItem" GROUP BY status ORDER BY status')
print("units", cur.fetchall())
cur.execute('SELECT COUNT(*) FROM "Sale"')
print("sales", cur.fetchone()[0])
cur.execute('SELECT COUNT(*), COUNT(*) FILTER (WHERE status=\'PAID\') FROM "PayLaterInstallment"')
print("installments total/paid", cur.fetchone())
cur.execute(
    '''SELECT COUNT(*) FROM "PayLaterDebt" d
       JOIN "Purchase" p ON p.id=d."purchaseId"
       JOIN "InventoryItem" i ON i.id=p."inventoryItemId"
       WHERE i.status=\'RETURNED\''''
)
print("returned debts (want 0)", cur.fetchone()[0])
cur.close()
conn.close()
print("DONE")
