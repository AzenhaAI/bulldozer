"""Extract the 'All ages / Persons' block of a WHO GHE deaths-by-country
workbook into a plain CSV the Node parser can read.

    python3 scripts/tools/ghe_xlsx_to_csv.py data/raw/who-ghe/ghe2021_deaths_bycountry_2021.xlsx

Run once per WHO release, on a machine with openpyxl; the CSV is committed
next to the workbook so the scheduled pipeline needs no Python at all. Layout:
first row is the header (code, cause, then one ISO-3 per column), second row
is WHO's data-quality grade per country, the rest are causes with deaths in
thousands.
"""
import csv, sys, pathlib
import openpyxl

src = pathlib.Path(sys.argv[1])
dst = src.with_suffix('.csv')
ws = openpyxl.load_workbook(src, read_only=True)['All ages']
rows = list(ws.iter_rows(values_only=True))
iso, grade = rows[7], rows[8]
cols = [j for j in range(7, len(iso)) if iso[j]]

with dst.open('w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['code', 'cause'] + [iso[j] for j in cols])
    w.writerow(['grade', 'WHO data-quality grade'] + [grade[j] for j in cols])
    for r in rows[10:]:
        if r[0] != 'Persons':
            break
        name = next((c for c in r[2:7] if c is not None and not str(c).rstrip('.').replace('I', '').isdigit() and len(str(c)) > 3), '')
        w.writerow([r[1], name] + [r[j] for j in cols])
print(f'{dst}: {len(cols)} countries')
