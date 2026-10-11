"""ISSP 2019–2023 and Standard Eurobarometer 104.1 / 105.2 -> weighted shares
per country. Run by a person, not by an AI tool.

    /usr/bin/python3 scripts/tools/gesis_aggregate.py "<folder with the ZA*.sav files>"

GESIS's terms of use forbid processing their data with AI systems. This
script was written from the variable lists only (scripts/tools/gesis_varlist.py:
names, question and answer labels — no respondent rows), and it is the owner
who runs it. It writes country aggregates only, to data/raw/issp/ and
data/raw/eurobarometer/, and prints nothing but counts.

ISSP: weighted by WEIGHT (2019, 2020) or WEIGHT_COM (2021–2023); negative
codes (no answer, can't choose, not applicable) are left out of the base, as
in our other surveys. Country = first two letters of c_alphan, so regional
samples (e.g. DE-W/DE-E) count as one country.
Eurobarometer: weighted by w1; "don't know" stays in the base, as in the
European Commission's own reports, so the figures can be checked against them.
Country = isocntry, with DE-W/DE-E joined and the Turkish Cypriot community
(CY-TCC) left out, as the Commission does. A country needs 300 answers.
"""
import sys
import pathlib
import csv
import pyreadstat

FOLDER = pathlib.Path(sys.argv[1]).expanduser()
REPO = pathlib.Path(__file__).resolve().parents[2]
MIN_N = 300

# study -> (year, weight, {column: (variable, yes codes)})
ISSP = {
    'ZA7600': ('2019', 'WEIGHT', {
        'income_gaps_too_large': ('v21', [1, 2]),
        'govt_should_reduce_gaps': ('v22', [1, 2]),
        'rich_poor_conflict_strong': ('v36', [1, 2]),
    }),
    'ZA7650': ('2020', 'WEIGHT', {
        'env_concerned': ('v15', [4, 5]),
        'climate_mostly_human': ('v17', [4]),
        'pay_higher_prices_env': ('v26', [1, 2]),
        'warming_dangerous': ('v41', [1, 2]),
    }),
    'ZA8000': ('2021', 'WEIGHT_COM', {
        'health_system_confidence': ('v2', [1, 2]),
        'doctors_trusted': ('v19', [1, 2]),
        'vaccines_more_harm': ('v31', [1, 2]),
        'health_system_satisfied': ('v44', [1, 2, 3]),
    }),
    'ZA10000': ('2022', 'WEIGHT_COM', {
        'men_earn_women_home': ('v6', [1, 2]),
        'cohabitation_ok': ('v14', [1, 2]),
        'same_sex_couple_parents': ('v17', [1, 2]),
    }),
    'ZA10010': ('2023', 'WEIGHT_COM', {
        'country_better_than_most': ('v10', [1, 2]),
        'immigrants_raise_crime': ('v26', [1, 2]),
        'immigrants_good_economy': ('v27', [1, 2]),
        'reduce_immigration': ('v31', [4, 5]),
    }),
}
# Eurobarometer: trust items are numbered differently in each wave.
EB = {
    'ZA9130': ('2025-autumn', {
        'life_satisfied': ('d70', [1, 2]),
        # Our 2024 life-satisfaction series has "don't know" (code 5) outside
        # the base; this variant continues it.
        'life_satisfied_sub': ('d70', [1, 2], [5]),
        'country_right_direction': ('d73_1', [1]),
        'trust_eu': ('qa6_9', [1]),
        'trust_national_govt': ('qa6_7', [1]),
        'trust_police': ('qa6_3', [1]),
    }),
    'ZA9144': ('2026-spring', {
        'life_satisfied': ('d70', [1, 2]),
        'life_satisfied_sub': ('d70', [1, 2], [5]),
        'country_right_direction': ('d73_1', [1]),
        'trust_eu': ('qa6_12', [1]),
        'trust_national_govt': ('qa6_10', [1]),
        'trust_police': ('qa6_4', [1]),
        'trust_media': ('qa6_1', [1]),
        'trust_scientists': ('qa6_9', [1]),
    }),
}


def find(study):
    hits = sorted(FOLDER.glob(f'{study}_v*.sav'))
    if not hits:
        sys.exit(f'{study}: no .sav file in {FOLDER}')
    return str(hits[0])


def shares(df, weight, items, keep_negative_base):
    rows = []
    for cc, g in sorted(df.groupby('cc')):
        row = {'iso2': cc, 'respondents': len(g)}
        for col, spec in items.items():
            var, yes = spec[0], spec[1]
            dropped = spec[2] if len(spec) > 2 else []
            s = g[var]
            base = s.notna() if keep_negative_base else (s.notna() & (s >= 0))
            base = base & ~s.isin(dropped)
            n = int(base.sum())
            row[col + '_n'] = n
            w = g[weight]
            row[col] = '' if n < MIN_N else f"{100 * w[base & s.isin(yes)].sum() / w[base].sum():.6f}"
        rows.append(row)
    return rows


def write(path, rows, extra):
    keys = list(rows[0].keys())
    with open(path, 'w', newline='') as f:
        wr = csv.DictWriter(f, fieldnames=list(extra) + keys)
        wr.writeheader()
        for r in rows:
            wr.writerow({**extra, **r})


for study, (year, weight, items) in ISSP.items():
    cols = ['c_alphan', weight] + sorted({spec[0] for spec in items.values()})
    df, _ = pyreadstat.read_sav(find(study), usecols=cols, apply_value_formats=False)
    df['cc'] = df['c_alphan'].astype(str).str[:2]
    rows = shares(df, weight, items, keep_negative_base=False)
    out = REPO / 'data' / 'raw' / 'issp' / f'issp_{year}_by_country.csv'
    write(out, rows, {'study': study, 'year': year})
    print(f'{study} ISSP {year}: {len(rows)} countries -> {out.name}')

for study, (wave, items) in EB.items():
    cols = ['isocntry', 'w1'] + sorted({spec[0] for spec in items.values()})
    df, _ = pyreadstat.read_sav(find(study), usecols=cols, apply_value_formats=False)
    df = df[~df['isocntry'].astype(str).str.startswith('CY-TCC')].copy()
    df['cc'] = df['isocntry'].astype(str).str[:2]
    rows = shares(df, 'w1', items, keep_negative_base=True)
    out = REPO / 'data' / 'raw' / 'eurobarometer' / f'eb_{wave}_by_country.csv'
    write(out, rows, {'study': study, 'wave': wave})
    print(f'{study} Eurobarometer {wave}: {len(rows)} countries -> {out.name}')
