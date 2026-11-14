"""World Risk Poll (Lloyd's Register Foundation / Gallup), waves 2019–2025 ->
one row per country and wave, weighted shares.

    python3 scripts/tools/wrp_aggregate.py <dir> > data/raw/wrp/wrp_by_country_wave.csv

<dir> holds the files from the Foundation's free download (CC BY 4.0,
https://www.lrfoundation.org.uk/world-risk-poll-data — storage.googleapis.com/
wrp_shares/site_live/23_wrp.zip carries every wave): 19_wrp.sav, 21_wrp.sav,
23_wrp.sav and wrp_25_climate_risk.sav.

The rule reproduces the 2023 figures BullDozer first published (all five
series, every country, to two decimals): weight WGT; share giving the stated
answer among substantive answers — "does not apply" (97), don't know (98) and
refused (99) are left out of the base.

Wording across waves, and what is left out:
  climate threat   2019 L5 says "threat to people in this country"; 2021–2025 WP20719 "threat to this country"
  worry crime      2019 L6C, 2021–2025 WP20722 — the same question
  disaster         2021 WP22245, 2023 WP23344 ("in this country" added). 2025 asks whether people were
                   "impacted by" a disaster (WP24213), a different question, so 2025 is not used.
  can protect      WP22252, 2021–2025 (not asked in 2019)
  discrimination   WP22259, 2021–2025 (not asked in 2019)
"""
import os
import sys
import pyreadstat
from moe import share_moe

WAVES = {
    '2019': ('19_wrp.sav', {'climate_threat': ('L5', [1, 2]), 'worry_crime': ('L6C', [1, 2])}),
    '2021': ('21_wrp.sav', {'climate_threat': ('WP20719', [1, 2]), 'worry_crime': ('WP20722', [1, 2]),
                            'disaster_exp': ('WP22245', [1]), 'can_protect': ('WP22252', [1]), 'discrim_skin': ('WP22259', [1])}),
    '2023': ('23_wrp.sav', {'climate_threat': ('WP20719', [1, 2]), 'worry_crime': ('WP20722', [1, 2]),
                            'disaster_exp': ('WP23344', [1]), 'can_protect': ('WP22252', [1]), 'discrim_skin': ('WP22259', [1])}),
    '2025': ('wrp_25_climate_risk.sav', {'climate_threat': ('WP20719', [1, 2]), 'worry_crime': ('WP20722', [1, 2]),
                                         'can_protect': ('WP22252', [1]), 'discrim_skin': ('WP22259', [1])}),
}
COLS = ['climate_threat', 'worry_crime', 'disaster_exp', 'can_protect', 'discrim_skin']
NOT_BASE = [97, 98, 99]
# Gallup's country samples are about 1,000; 100 substantive answers is the floor
# below which a share is not published (the 2023 figures all clear it).
MIN_N = 100
# Countries surveyed only in 2019/2021, so not in the later files' name lists.
EXTRA_ISO = {'belarus': 'BLR', 'jamaica': 'JAM', 'lesotho': 'LSO', 'rwanda': 'RWA', 'turkmenistan': 'TKM'}


def country_column(meta):
    for c in ('COUNTRY_ISO3', 'COUNTRYNEW', 'Country', 'countrynew', 'WP5AA'):
        if c in meta.column_names:
            return c
    raise SystemExit('no country column')


def main(d):
    # 2019 and 2021 carry country names, not codes; learn name -> ISO3 from the later files.
    name_iso = dict(EXTRA_ISO)
    for f, ncol in (('23_wrp.sav', 'Country'), ('wrp_25_climate_risk.sav', 'COUNTRYNEW')):
        df, meta = pyreadstat.read_sav(os.path.join(d, f), usecols=[ncol, 'COUNTRY_ISO3'])
        lab = meta.variable_value_labels.get(ncol, {})
        for n, iso in df.drop_duplicates().itertuples(index=False):
            name_iso[str(lab.get(n, n)).strip().lower()] = iso
    rows = []
    for wave, (f, items) in WAVES.items():
        path = os.path.join(d, f)
        _, meta = pyreadstat.read_sav(path, metadataonly=True)
        cc = country_column(meta)
        # 21_wrp.sav also carries the 2019 interviews (Year = 2019): keep only
        # the wave's own year, or "2021" would blend in 2019 and show 2019 values
        # for countries not surveyed in 2021 (caught by a fact-check, 10 Nov 2026).
        ycol = next((c for c in ('Year', 'YEAR_WAVE') if c in meta.column_names), None)
        df, meta = pyreadstat.read_sav(path, usecols=[cc, 'WGT'] + ([ycol] if ycol else []) + [q for q, _ in items.values()])
        if ycol:
            df = df[df[ycol] == int(wave)]
        lab = meta.variable_value_labels.get(cc, {})
        unknown = set()
        for key, g in df.groupby(cc):
            if cc == 'COUNTRY_ISO3':
                iso, name = key, key
            else:
                name = str(lab.get(key, key)).strip()
                iso = name_iso.get(name.lower())
                if not iso:
                    unknown.add(name)
                    continue
            row = {'iso3': iso, 'wave': wave}
            for col in COLS:
                if col not in items:
                    row[col] = row[col + '_moe'] = ''
                    continue
                q, yes = items[col]
                v, w = g[q], g['WGT']
                base = v.notna() & ~v.isin(NOT_BASE)
                row[col] = '' if base.sum() < MIN_N else f'{100 * w[base & v.isin(yes)].sum() / w[base].sum():.6f}'
                row[col + '_moe'] = share_moe(row[col], w[base]) if row[col] else ''
            rows.append(row)
        if unknown:
            print(f'{wave}: no ISO3 for {sorted(unknown)}', file=sys.stderr)
    keys = ['iso3', 'wave'] + COLS + [c + '_moe' for c in COLS]
    print(','.join(keys))
    for r in sorted(rows, key=lambda r: (r['iso3'], r['wave'])):
        print(','.join(str(r[k]) for k in keys))


if __name__ == '__main__':
    main(sys.argv[1])
