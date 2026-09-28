"""AmericasBarometer (LAPOP Lab) merged file -> one row per country, weighted shares.

    python3 scripts/tools/lapop_aggregate.py 2026_merge_CGD_AmericasBarometer_v1.0p.dta > data/raw/lapop/lapop_2026_by_country.csv

Run once per wave, locally (needs pyreadstat). The .dta is obtained from LAPOP
Lab's data directory as a Free User under its Datasets Usage Agreement:
research use only, no redistribution of the data. It is never committed; only
these country aggregates are.

Coding follows LAPOP's own reporting conventions, from the file's value labels:
7-point agreement and trust items are reported as the share answering 5–7;
four-point items as the share on one side. Don't know, refused and "not asked
in this country" are Stata extended missing values (.a/.b/.x), read as missing,
so the base is substantive answers only. Weight: wt, the within-country weight.
A country needs 300 substantive answers for an item to be reported: several
items were not asked everywhere.
"""
import sys
import pyreadstat

# column -> (question, "yes" codes)
SPEC = {
    'support_democracy': ('ing4', [5, 6, 7]),     # democracy is the best form of government
    'satisfied_democracy': ('pn4', [1, 2]),       # very satisfied / satisfied
    'trust_elections': ('b47a', [5, 6, 7]),
    'trust_police': ('b18', [5, 6, 7]),
    'trust_congress': ('b13', [5, 6, 7]),
    'trust_people': ('it1', [1, 2]),              # neighbours very / somewhat trustworthy
    'feel_unsafe': ('aoj11', [3, 4]),             # somewhat / very unsafe in the neighbourhood
    'police_bribe': ('exc2', [1]),                # a police officer asked for a bribe, past 12 months
    'politicians_corrupt': ('exc7new', [4, 5]),   # more than half, or all, politicians corrupt
    'remittances': ('q10a', [1]),                 # household receives remittances
    'home_broadband': ('r18n', [1]),
}
MIN_N = 300
# LAPOP country codes (pais) -> ISO 3166 alpha-3
PAIS = {1: 'MEX', 2: 'GTM', 3: 'SLV', 4: 'HND', 5: 'NIC', 6: 'CRI', 7: 'PAN', 8: 'COL', 9: 'ECU',
        10: 'BOL', 11: 'PER', 12: 'PRY', 13: 'CHL', 14: 'URY', 15: 'BRA', 17: 'ARG', 21: 'DOM',
        22: 'HTI', 36: 'CUB', 40: 'USA', 41: 'CAN'}

cols = ['pais', 'year', 'wt'] + [q for q, _ in SPEC.values()]
df, meta = pyreadstat.read_dta(sys.argv[1], usecols=cols)
names = meta.variable_value_labels['pais']

keys = ['iso3', 'name', 'year', 'respondents'] + [x for k in SPEC for x in (k, k + '_n')]
print(','.join(keys))
for code, g in sorted(df.groupby('pais')):
    code = int(code)
    row = {'iso3': PAIS[code], 'name': names.get(code, ''), 'year': int(g['year'].max()), 'respondents': len(g)}
    for key, (q, yes) in SPEC.items():
        valid = g[q].notna()
        n = int(valid.sum())
        w = g['wt']
        row[key + '_n'] = n
        row[key] = '' if n < MIN_N else f"{100 * w[valid & g[q].isin(yes)].sum() / w[valid].sum():.6f}"
    print(','.join(f'"{row[k]}"' if k == 'name' else str(row[k]) for k in keys))
print(f"{len(df)} respondents, {df['pais'].nunique()} countries", file=sys.stderr)
