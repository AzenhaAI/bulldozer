"""Pew Research Center Global Attitudes (Spring 2025) -> one row per country.

    /usr/bin/python3 scripts/tools/pew_aggregate.py "<...> Dataset.sav" > data/raw/pew/pew_ga2025_by_country.csv

Run once per wave, locally (needs pyreadstat). The .sav is downloaded from
pewresearch.org with an account under Pew's terms of use; it is never
committed, only these country aggregates are, credited to Pew.

Shares follow Pew's own reporting so they match its published toplines:
weighted by `weight`, with "don't know" and refused kept in the base (Pew
prints them as a row of the table). Only respondents not asked the question
are left out, so a form-split or country-specific item uses its own base.
Australia was asked the leader-confidence items as separate *_dk variables
(an online panel with a "never heard" option); they are merged in.
A country needs 300 respondents asked for an item to be reported.
"""
import sys
import pyreadstat

# column -> (question, "yes" codes, fallback variable used where the main one was not asked)
SPEC = {
    'economy_good': ('econ_sit', [1, 2], None),
    'democracy_satisfied': ('satisfied_democracy', [1, 2], None),
    'fav_us': ('fav_us', [1, 2], None),
    'fav_china': ('fav_china', [1, 2], None),
    'fav_eu': ('fav_eu', [1, 2], None),
    'fav_un': ('fav_un', [1, 2], None),
    'fav_nato': ('fav_nato', [1, 2], None),
    'fav_russia': ('fav_russia', [1, 2], None),
    'conf_trump': ('confid_trump', [1, 2], 'confid_trump_dk'),
    'conf_xi': ('confid_xi', [1, 2], 'confid_xi_dk'),
    'conf_putin': ('confid_putin', [1, 2], 'confid_putin_dk'),
    'god_needed_moral': ('believe_god', [2], None),
    'homosexuality_unacceptable': ('moral_homosexuality', [2], None),
    'climate_major_threat': ('intthreat_climatechange', [1], None),
    'misinfo_major_threat': ('intthreat_misinfo', [1], None),
    'ai_more_concerned': ('ai_cncexc', [2], None),
    'china_leading_economy': ('econ_power', [2], None),
    'us_leading_economy': ('econ_power', [1], None),
}
MIN_N = 300
ISO = {'Canada': 'CAN', 'France': 'FRA', 'Germany': 'DEU', 'Greece': 'GRC', 'Hungary': 'HUN', 'Italy': 'ITA',
       'Netherlands': 'NLD', 'Poland': 'POL', 'Spain': 'ESP', 'Sweden': 'SWE', 'UK': 'GBR', 'Australia': 'AUS',
       'India': 'IND', 'Indonesia': 'IDN', 'Japan': 'JPN', 'South Korea': 'KOR', 'Israel': 'ISR', 'Turkey': 'TUR',
       'Kenya': 'KEN', 'Nigeria': 'NGA', 'South Africa': 'ZAF', 'Argentina': 'ARG', 'Brazil': 'BRA', 'Mexico': 'MEX'}

cols = {'country', 'weight'}
for q, _, fb in SPEC.values():
    cols.add(q)
    if fb: cols.add(fb)
df, meta = pyreadstat.read_sav(sys.argv[1], usecols=sorted(cols))
names = meta.variable_value_labels['country']

keys = ['iso3', 'name', 'respondents'] + [x for k in SPEC for x in (k, k + '_n')]
print(','.join(keys))
for code, g in sorted(df.groupby('country')):
    name = names[code]
    row = {'iso3': ISO[name], 'name': name, 'respondents': len(g)}
    for key, (q, yes, fb) in SPEC.items():
        s = g[q]
        if fb and s.notna().sum() == 0:
            s = g[fb]
        asked = s.notna()
        n = int(asked.sum())
        row[key + '_n'] = n
        w = g['weight']
        row[key] = '' if n < MIN_N else f"{100 * w[asked & s.isin(yes)].sum() / w[asked].sum():.6f}"
    print(','.join(f'"{row[k]}"' if k == 'name' else str(row[k]) for k in keys))
print(f"{len(df)} respondents, {df['country'].nunique()} countries", file=sys.stderr)
