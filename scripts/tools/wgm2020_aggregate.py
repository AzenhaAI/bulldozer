"""Wellcome Global Monitor 2020 (Gallup) public file -> one row per country.

    python3 scripts/tools/wgm2020_aggregate.py wgm-full-wave2-public-file.sav > data/raw/wgm/wgm2020_by_country.csv

Free download: https://wellcome.org/sites/default/files/2021-11/wgm-full-wave2-public-file.sav
(CC BY 4.0). Same rule as the 2018 figures, which came from Wellcome's
crosstabs: weight WGT; share answering "a lot" or "some"; the base includes
"don't know / refused" (99), as the crosstabs' column percentages do.

  trust_science     W6  "Trust science" (2018: Q11C, same wording)
  trust_scientists  W5C "Trust scientists in this country" (2018: Q11E)
The 2018 vaccine questions were not asked in 2020.
"""
import sys
import pyreadstat

df, meta = pyreadstat.read_sav(sys.argv[1], usecols=['COUNTRYNEW', 'WGT', 'W6', 'W5C'])
lab = meta.variable_value_labels.get('COUNTRYNEW', {})
print('country,trust_science,trust_scientists')
for c, g in sorted(df.groupby('COUNTRYNEW'), key=lambda t: str(lab.get(t[0], t[0]))):
    out = []
    for q in ('W6', 'W5C'):
        v, w = g[q], g['WGT']
        base = v.isin([1, 2, 3, 4, 99])
        out.append('' if base.sum() < 300 else f'{100 * w[base & v.isin([1, 2])].sum() / w[base].sum():.6f}')
    print('"%s",%s' % (str(lab.get(c, c)).strip(), ','.join(out)))
