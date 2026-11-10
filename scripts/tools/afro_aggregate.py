"""Afrobarometer merged files, any round -> one row per country, weighted shares.

    python3 scripts/tools/afro_aggregate.py r10.sav > data/raw/afrobarometer/afro_r10_by_country.csv

Replaces afro_r9_aggregate.py (removed), whose rule it keeps exactly (and reproduces
for Round 9 to the decimal): weight withinwt (withinwt_ea from Round 8 on);
denominator = substantive answers only, so refused, don't know, missing, "not
asked in country" and "did not understand" are left out.

Question numbers change every round (support for democracy is Q23 in Round 9,
Q21 in Round 8, Q22 in Round 10), so each item is found by its variable LABEL,
and which codes count as "yes" and which as substantive is read from the VALUE
LABELS of that round's file. An item a round did not ask stays empty; an item
whose label matches more than one variable is refused rather than guessed.

Also writes `year`: the year in which most of a country's interviews were
done (from DATEINTR), so each country's point sits on its own fieldwork year.

Merged files are downloaded from afrobarometer.org (free, no account):
  R1-R7  /wp-content/uploads/2022/02/ (merged_r1_data.sav ... r7_merged_data_34ctry.release.sav)
  R8     /wp-content/uploads/2023/03/afrobarometer_release-dataset_merge-34ctry_r8_en_2023-03-01.sav
  R9     /wp-content/uploads/2025/06/R9.Merge_39ctry.20Nov23.final_.release_Updated.4Jun25-3.sav
  R10    /wp-content/uploads/2026/10/AB_R10.Merge-Dataset_25Feb26.38ctry.release.sav.zip
"""
import re
import sys
import pyreadstat

NA = r'refus|don.?t know|missing|not asked|did not understand|not applicable|no further reply|haven.?t heard'

# key -> (variable-label pattern, yes-answer pattern, substantive-answer pattern)
# Every pattern is checked against the answer scale's size too (N_OK below): a
# round that asked the same thing on another scale — Round 2's trust items run
# "a little bit / a lot / a very great deal" — is left out, not stretched to fit.
TRUST = (r'^(somewhat|a lot)$', r'^(not at all|just a little|somewhat|a lot)$')
OFTEN = (r'once or twice|several|many|always', r'^never$|once or twice|several|many|always')
SPEC = {
    'dem_pref':        (r'support for democracy', r'statement 1|democracy (is )?preferable', r'statement [123]|democracy|non-?democratic|doesn.?t matter'),
    # Round 5 words it "key leadership figure (President/Prime Minister)".
    'trust_pres':      (r'trust (the )?president\b|trust key leadership figure \(president', *TRUST),
    'is_democracy':    (r'extent of democracy$', r'minor problems|full democracy', r'not a democracy|major problems|minor problems|full democracy'),
    'right_direction': (r'(overall )?direction of (the )?country', r'right direction', r'(right|wrong) direction'),
    'economy_good':    (r'country.?s present economic condition|present economic condition of (this|the) country', r'fairly good|very good', r'very bad|fairly bad|neither|fairly good|very good'),
    'without_food':    (r'(gone )?without (enough )?food', *OFTEN),
    'without_medical': (r'without (medicine or )?medical', *OFTEN),
    'without_cash':    (r'without (a )?cash income', *OFTEN),
    'felt_unsafe':     (r'unsafe walking', *OFTEN),
    'free_speech':     (r'(^|\. )free(dom)? to say what you think$', r'somewhat free|completely free', r'not at all free|not very free|somewhat free|completely free'),
    'dem_satisfied':   (r'satisfaction with democracy', r'^(fairly|very) satisfied', r'not a democracy|not at all satisfied|not very satisfied|fairly satisfied|very satisfied'),
    'trust_police':    (r'trust (the )?police\b', *TRUST),
    'trust_courts':    (r'trust (the )?courts', *TRUST),
    'corruption_up':   (r'level of corruption', r'increased', r'increased|stayed the same|decreased'),
    'trust_citizens':  (r'trust other (citizens|\w+ians|nationals)\b', *TRUST),
    'china_positive':  (r'influence of country: china|china.?s influence positive or negative', r'somewhat positive|very positive', r'negative|neither|positive'),
    'us_positive':     (r'influence of country: (united states|usa|us)\b|(u\.?s\.?a?|united states).?s influence positive or negative', r'somewhat positive|very positive', r'negative|neither|positive'),
    'internet_news':   (r'^q?\d+\w*\.? ?internet news$|news source: internet|^internet news', r'few times a week|every day', r'never|less than once a month|few times a month|few times a week|every day'),
}
MIN_N = 300
N_OK = {'dem_pref': 3, 'trust_pres': 4, 'is_democracy': 4, 'right_direction': 2, 'economy_good': 5,
        'without_food': 5, 'without_medical': 5, 'without_cash': 5, 'felt_unsafe': 5, 'free_speech': 4,
        'dem_satisfied': 5, 'trust_police': 4, 'trust_courts': 4, 'corruption_up': 5, 'trust_citizens': 4,
        'china_positive': 5, 'us_positive': 5, 'internet_news': 5}


def pick(names, labels, rx):
    return [c for c, l in zip(names, labels) if l and re.search(rx, l, re.I)]


def main(path):
    _, meta = pyreadstat.read_sav(path, metadataonly=True)
    names, labels = meta.column_names, meta.column_labels
    low = {c.lower(): c for c in names}
    country = low.get('country') or low.get('country_r5list') or next(c for c in names if c.lower().startswith('country'))
    weight = low.get('withinwt_ea') or low.get('withinwt')
    date = low.get('dateintr')
    found, report = {}, []
    for key, (vrx, yrx, okrx) in SPEC.items():
        hits = pick(names, labels, vrx)
        if len(hits) != 1:
            report.append(f'{key}: {"not asked" if not hits else "ambiguous " + ",".join(hits)}')
            continue
        q = hits[0]
        vl = meta.variable_value_labels.get(q, {})
        ok = [k for k, v in vl.items() if re.search(okrx, v, re.I) and not re.search(NA, v, re.I)]
        yes = [k for k in ok if re.search(yrx, vl[k], re.I)]
        if not yes or len(ok) != N_OK[key]:
            report.append(f'{key}: {q} — codes not understood {vl}')
            continue
        found[key] = (q, yes, ok)
        report.append(f'{key}: {q} yes={yes} ok={ok}  [{dict(zip(names, labels))[q]}]')
    print('\n'.join(report), file=sys.stderr)

    cols = [country, weight] + ([date] if date else []) + sorted({q for q, _, _ in found.values()})
    df, m2 = pyreadstat.read_sav(path, usecols=cols)
    df['_c'] = df[country].map(m2.variable_value_labels[country])
    out = []
    for name, g in sorted(df.groupby('_c')):
        row = {'country': str(name).strip(), 'respondents': len(g), 'year': ''}
        # An empty SPSS date reads as 14 Oct 1582; keep only plausible fieldwork years.
        years = g[date].dropna().map(lambda d: d.year) if date else None
        years = years[(years >= 1999) & (years <= 2030)] if years is not None else None
        if years is not None and len(years):
            row['year'] = int(years.mode().iloc[0])
        w = g[weight]
        for key in SPEC:
            if key not in found:
                row[key] = ''
                continue
            q, yes, ok = found[key]
            valid = g[q].isin(ok)
            row[key] = '' if valid.sum() < MIN_N else f"{100 * w[valid & g[q].isin(yes)].sum() / w[valid].sum():.6f}"
        out.append(row)
    keys = ['country', 'respondents', 'year'] + list(SPEC)
    print(','.join(keys))
    for r in out:
        print(','.join('"%s"' % r[k] if k == 'country' else str(r[k]) for k in keys))
    print(f'{len(df)} respondents, {len(out)} countries, weight {weight}, date {date}', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1])
