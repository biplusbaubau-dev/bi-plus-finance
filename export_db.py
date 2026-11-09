import getpass
import psycopg2

pw = getpass.getpass('Password: ')
conn = psycopg2.connect(f'postgresql://postgres:{pw}@localhost:5432/bi_plus_finance')
cur = conn.cursor()
cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")
tables = [r[0] for r in cur.fetchall()]
with open('backup.sql', 'w', encoding='utf-8') as f:
    for t in tables:
        cur.execute(f'SELECT * FROM "{t}"')
        cols = [d[0] for d in cur.description]
        for row in cur.fetchall():
            vals = []
            for v in row:
                if v is None:
                    vals.append('NULL')
                elif isinstance(v, (int, float)):
                    vals.append(str(v))
                else:
                    vals.append("'" + str(v).replace("'", "''") + "'")
            f.write(f'INSERT INTO "{t}" ({"","".join(cols)}) VALUES ({",".join(vals)});\n')
print(f'Exported {len(tables)} tables')
conn.close()
