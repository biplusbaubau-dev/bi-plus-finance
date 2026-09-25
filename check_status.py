import psycopg2
import re

with open('.env', 'r') as f:
    for line in f:
        line = line.strip()
        if line.startswith('DATABASE_URL='):
            raw = line.split('=', 1)[1].strip().strip('"')
            break

# Parse postgresql://user:password@host:port/dbname
raw_db = raw.split('?')[0]  # strip query params
m = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', raw_db)
user, password, host, port, dbname = m.groups()
print(f"Host: {host}, DB: {dbname}, User: {user}")

conn = psycopg2.connect(
    host=host,
    port=int(port),
    dbname=dbname,
    user=user,
    password=password
)
cur = conn.cursor()

tables = ['InventoryItem','Sale','Purchase','PayLaterDebt','PayLaterInstallment','CashTransaction','Expense','Accessory','AccessoryTransaction']
print("\n=== Row counts ===")
for t in tables:
    cur.execute(f'SELECT COUNT(*) FROM "{t}"')
    cnt = cur.fetchone()[0]
    print(f"  {t}: {cnt}")

print("\n=== Latest 3 InventoryItems ===")
cur.execute('SELECT * FROM "InventoryItem" ORDER BY id DESC LIMIT 3')
cols = [d[0] for d in cur.description]
for r in cur.fetchall():
    d = dict(zip(cols, r))
    print(f"  {d['code']} | {d['brand']} {d['model']} {d['storage']} | {d['condition']} | {d['status']} | beli Rp {d['purchasePrice']:,}")

print("\n=== Pending Installments ===")
cur.execute('SELECT * FROM "PayLaterInstallment" WHERE "status" = \'PENDING\' ORDER BY "dueDate"')
cols = [d[0] for d in cur.description]
rows = cur.fetchall()
if rows:
    for r in rows:
        d = dict(zip(cols, r))
        print(f"  No {d['installmentNo']} | Due {str(d['dueDate'])[:10]} | Rp {d['amount']:,}")
else:
    print("  (none)")

print("\n=== Cash 7 hari terakhir ===")
cur.execute('''
    SELECT SUM("income") as total_in, SUM("expense") as total_out
    FROM "CashTransaction"
    WHERE "date" >= NOW() - INTERVAL '7 days'
''')
row = cur.fetchone()
print(f"  Masuk: Rp {row[0] or 0:,} | Keluar: Rp {row[1] or 0:,}")

conn.close()
