"""Afrobarometer Round 9 merged file -> one row per country, weighted shares.

    python3 scripts/tools/afro_r9_aggregate.py R9.Merge_39ctry....sav > data/raw/afrobarometer/afro_r9_by_country.csv

Run once per release, locally (needs pyreadstat). The .sav is 80 MB and is not
committed; the pipeline reads only the CSV this writes, in Node.

The rule, recovered by reproducing the three series already published (39 of
39 countries, to the decimal): weight withinwt_ea; denominator = substantive
answers only, so refused, don't know, missing and "did not understand" are
left out. Every code below comes from the file's own value labels.
"""
import sys
import pyreadstat

# column -> (question, codes counted as "yes", codes that are substantive)
SPEC = {
    'dem_pref':        ('Q23',  [3],          [1, 2, 3]),
    'trust_pres':      ('Q37A', [2, 3],       [0, 1, 2, 3]),
    'is_democracy':    ('Q30',  [3, 4],       [1, 2, 3, 4]),
    'right_direction': ('Q3',   [2],          [1, 2]),
    'economy_good':    ('Q4A',  [4, 5],       [1, 2, 3, 4, 5]),
    'without_food':    ('Q6A',  [1, 2, 3, 4], [0, 1, 2, 3, 4]),
    'without_medical': ('Q6C',  [1, 2, 3, 4], [0, 1, 2, 3, 4]),
    'without_cash':    ('Q6E',  [1, 2, 3, 4], [0, 1, 2, 3, 4]),
    'felt_unsafe':     ('Q7A',  [1, 2, 3, 4], [0, 1, 2, 3, 4]),
    'free_speech':     ('Q9A',  [3, 4],       [1, 2, 3, 4]),
    # 0 = "the country is not a democracy": an answer, and not a satisfied one.
    'dem_satisfied':   ('Q31',  [3, 4],       [0, 1, 2, 3, 4]),
    'trust_police':    ('Q37G', [2, 3],       [0, 1, 2, 3]),
    'trust_courts':    ('Q37I', [2, 3],       [0, 1, 2, 3]),
    'corruption_up':   ('Q39A', [1, 2],       [1, 2, 3, 4, 5]),
    'trust_citizens':  ('Q86A', [2, 3],       [0, 1, 2, 3]),
    'china_positive':  ('Q78A', [4, 5],       [1, 2, 3, 4, 5]),
    'us_positive':     ('Q78B', [4, 5],       [1, 2, 3, 4, 5]),
    'internet_news':   ('Q74D', [3, 4],       [0, 1, 2, 3, 4]),
}
MIN_N = 300

cols = ['COUNTRY', 'withinwt_ea'] + sorted({q for q, _, _ in SPEC.values()})
df, meta = pyreadstat.read_sav(sys.argv[1], usecols=cols)
df['country'] = df['COUNTRY'].map(meta.variable_value_labels['COUNTRY'])

out = []
for name, g in sorted(df.groupby('country')):
    row = {'country': name, 'respondents': len(g)}
    for key, (q, yes, ok) in SPEC.items():
        valid = g[q].isin(ok)
        w = g['withinwt_ea']
        row[key] = '' if valid.sum() < MIN_N else f"{100 * w[valid & g[q].isin(yes)].sum() / w[valid].sum():.6f}"
    out.append(row)

keys = ['country', 'respondents'] + list(SPEC)
print(','.join(keys))
for r in out:
    print(','.join('"%s"' % r[k] if k == 'country' else str(r[k]) for k in keys))
print(f"{len(df)} respondents, {len(out)} countries", file=sys.stderr)
