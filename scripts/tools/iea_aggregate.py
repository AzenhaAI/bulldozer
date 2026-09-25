"""IEA international assessments -> country mean scores, one CSV per study.

    python3 scripts/tools/iea_aggregate.py <study> <IDB zip> > data/raw/iea/<study>.csv

Run once per release, locally (needs pyreadstat). The databases are 60 MB to
1.1 GB of SPSS files and are not committed; the pipeline reads only these CSVs.

Point estimate as IEA computes it: the weighted mean of each of the five
plausible values, averaged. Checked against the published tables before any of
it went live — TIMSS 2023 grade 8 mathematics, Singapore 605.3 (published
605); ICCS 2022 civic knowledge, Poland 554.2 (published 554).

Only the main-study student files are read (suffix below): PIRLS 2021 and
ICCS 2022 also ship a second set per country, and reading both would count
those countries twice. Benchmarking entities (Abu Dhabi, Quebec, England…)
are written too; the Node parser keeps only codes that are countries.
"""
import os
import re
import sys
import tempfile
import zipfile

import numpy as np
import pyreadstat

STUDIES = {
    'timss2023_g8': {'prefix': 'bsg', 'suffix': 'm8', 'weight': 'TOTWGT',
                     'measures': {'math': 'BSMMAT0{}', 'science': 'BSSSCI0{}'}},
    'timss2023_g4': {'prefix': 'asg', 'suffix': 'm8', 'weight': 'TOTWGT',
                     'measures': {'math': 'ASMMAT0{}', 'science': 'ASSSCI0{}'}},
    'pirls2021':    {'prefix': 'ASG', 'suffix': 'R5', 'weight': 'TOTWGT',
                     'measures': {'reading': 'ASRREA0{}'}},
    'iccs2022':     {'prefix': 'ISG', 'suffix': 'C4', 'weight': 'TOTWGTS',
                     'measures': {'civic': 'PV{}CIV'}},
    'icils2023':    {'prefix': 'BSG', 'suffix': 'I3', 'weight': 'TOTWGTS',
                     'measures': {'cil': 'PV{}CIL', 'ct': 'PV{}CT'}},
}

study, zpath = sys.argv[1], sys.argv[2]
S = STUDIES[study]
pat = re.compile(rf"^{S['prefix']}(...){S['suffix']}\.sav$")
rows = []
with zipfile.ZipFile(zpath) as z, tempfile.TemporaryDirectory() as tmp:
    for member in sorted(z.namelist()):
        m = pat.match(os.path.basename(member))
        if not m:
            continue
        path = z.extract(member, tmp)
        _, meta = pyreadstat.read_sav(path, metadataonly=True)
        cols = [S['weight'], 'IDCNTRY']
        wanted = {k: [v.format(i) for i in range(1, 6)] for k, v in S['measures'].items()}
        have = {k: [c for c in v if c in meta.column_names] for k, v in wanted.items()}
        df, meta = pyreadstat.read_sav(path, usecols=cols + [c for v in have.values() for c in v])
        name = meta.variable_value_labels.get('IDCNTRY', {}).get(df['IDCNTRY'].iloc[0], '')
        row = {'code': m.group(1).upper(), 'name': name, 'students': len(df)}
        for k, pvs in have.items():
            if len(pvs) != 5:
                row[k] = ''
                continue
            w = df[S['weight']]
            row[k] = f"{np.mean([np.average(df[p], weights=w) for p in pvs]):.4f}"
        rows.append(row)
        os.remove(path)

keys = ['code', 'name', 'students'] + list(S['measures'])
print(','.join(keys))
for r in rows:
    print(','.join('"%s"' % r[k] if k == 'name' else str(r[k]) for k in keys))
print(f"{study}: {len(rows)} entities", file=sys.stderr)
