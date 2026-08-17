"""Shared engine for extended survey dashboards (groups + significance).

generate(cfg) reads one microdata file and writes a self-contained HTML
dashboard: weighted shares with 95% confidence intervals, broken down by
country, sex and age, grouped by topic. Same look as the Latinobarómetro and
Eurobarometer dashboards. Significance uses the Kish effective sample size from
the survey weights.
"""
import json
import math
import pathlib
import shutil

import numpy as np
import pyreadstat

AGE_BANDS = [(25, '15–25'), (40, '26–40'), (60, '41–60'), (200, '61+')]

_LIBDIR = pathlib.Path(__file__).resolve().parent
_GAP = json.loads((_LIBDIR / 'gapminder_geo.json').read_text())
_NAME2ROW = {r['name']: r for r in _GAP}
# country names in our survey configs that don't match Gapminder's spelling
_NAME_ALIAS = {
    'Czechia': 'Czech Republic', 'Slovakia': 'Slovak Republic', 'Türkiye': 'Turkey',
    'Bosnia & H.': 'Bosnia and Herzegovina', 'Great Britain': 'United Kingdom', 'United Kingdom': 'UK',
    'United States': 'USA',
}
_REGION_LABEL = {'africa': 'Africa', 'americas': 'Americas', 'asia': 'Asia', 'europe': 'Europe'}


def _iso3_region(name):
    row = _NAME2ROW.get(_NAME_ALIAS.get(name, name))
    if not row:
        return None, None
    return row['iso3166_1_alpha3'], _REGION_LABEL.get(row['world_4region'], 'Other')


def wshare(w, pos):
    sw = w.sum()
    if sw <= 0:
        return None
    p = w[pos].sum() / sw
    n_eff = sw * sw / (w * w).sum()
    se = math.sqrt(max(p * (1 - p), 1e-9) / n_eff)
    return dict(pct=round(p * 100, 1), ci=round(1.96 * se * 100, 1), n=int(round(n_eff)))


def sig_gap(a, b):
    if not a or not b:
        return ''
    sea, seb = a['ci'] / 1.96, b['ci'] / 1.96
    z = abs(a['pct'] - b['pct']) / math.sqrt(sea * sea + seb * seb + 1e-9)
    return '***' if z > 2.58 else '**' if z > 1.96 else '·'


def _bar(name, cell, maxv, extra=''):
    if not cell:
        return f'<div class="row"><span class="lbl">{name}</span><span class="track"></span><span class="val">—</span></div>'
    w = cell['pct'] / maxv * 100
    ciw = cell['ci'] / maxv * 100
    return (f'<div class="row"><span class="lbl">{name}{extra}</span>'
            f'<span class="track"><span class="fill" style="width:{w:.1f}%"></span>'
            f'<span class="ci" style="left:calc({w:.1f}% - {ciw:.1f}%);width:{2 * ciw:.1f}%"></span></span>'
            f'<span class="val">{cell["pct"]:.0f}<em>±{cell["ci"]:.1f}</em></span></div>')


def _cells(df, code, pos_set, base_set, cfg):
    base = df[code].isin(base_set)
    d = df[base]
    w = d['_w'].to_numpy()
    pos = d[code].isin(pos_set).to_numpy()
    out = {'overall': wshare(w, pos), 'country': {}, 'sex': {}, 'age': {}}
    mc = cfg['min_cell']
    for cc, nm in cfg['country_map'].items():
        mk = (d['_cc'] == cc).to_numpy()
        if mk.sum() >= mc:
            out['country'][nm] = wshare(w[mk], pos[mk])
    for sid, nm in cfg['sex_map'].items():
        mk = (d['_sex'] == sid).to_numpy()
        if mk.sum() >= mc:
            out['sex'][nm] = wshare(w[mk], pos[mk])
    for i, (_, nm) in enumerate(AGE_BANDS, 1):
        mk = (d['_age'] == i).to_numpy()
        if mk.sum() >= mc:
            out['age'][nm] = wshare(w[mk], pos[mk])
    return out


def _section(lbl, blurb, c, wave):
    country = sorted(c['country'].items(), key=lambda kv: -(kv[1]['pct'] if kv[1] else 0))
    maxv = max([v['pct'] for _, v in country if v] + [60]) * 1.05
    cbars = ''.join(_bar(n, v, maxv) for n, v in country)
    men = next((v for k, v in c['sex'].items() if k in ('Men', 'Male')), None)
    women = next((v for k, v in c['sex'].items() if k in ('Women', 'Female')), None)
    g = sig_gap(men, women)
    sbars = _bar('Men', men, maxv) + _bar('Women', women, maxv, f' <b class="sig">{g}</b>' if g else '')
    abars = ''.join(_bar(nm, c['age'].get(nm), maxv) for _, nm in AGE_BANDS)
    ov = c['overall']
    return f"""<section class="ind"><h2>{lbl} <span class="ov">{ov['pct']:.0f}%<em>±{ov['ci']:.1f}</em></span></h2>
<p class="blurb">{blurb} Weighted average across {len(country)} countries, {wave}. Bars show 95% confidence intervals.</p>
<div class="grid"><div class="panel"><h3>By country</h3>{cbars}</div>
<div class="side"><div class="panel"><h3>By sex <span class="note">gap sig.: {g or 'n/s'}</span></h3>{sbars}</div>
<div class="panel"><h3>By age</h3>{abars}</div></div></div></section>"""


def write_site_dataset(root, slug, title, topic, value_label, unit, summary, source, license_, url, wave, country_cells):
    """Write one src/data/surveys/<slug>.json from already-computed per-country cells
    (the 'country' dict returned inside a _cells() result: {name: {pct, ci, n}})."""
    data, missing = [], []
    for name, cell in country_cells.items():
        if not cell:
            continue
        iso, region = _iso3_region(name)
        if not iso:
            missing.append(name); continue
        data.append({'entity': name, 'group': region, 'period': str(wave), 'value': cell['pct'], 'iso': iso})
    if missing:
        print(f'    (site dataset {slug}: no ISO for {missing})')
    if len(data) < 8:
        print(f'    – {slug}: only {len(data)} countries, not registered as a site dataset')
        return
    out = {
        'meta': {'title': title, 'summary': summary, 'unit': unit, 'valueLabel': value_label,
                  'changeMode': 'pp', 'topic': topic, 'source': source, 'license': license_,
                  'url': url, 'parsedAt': str(wave), 'kind': 'survey'},
        'data': sorted(data, key=lambda r: -r['value']),
    }
    (pathlib.Path(root) / 'src/data/surveys' / f'{slug}.json').write_text(json.dumps(out, ensure_ascii=False))
    print(f'    ✓ site dataset {slug}: {len(data)} countries')


def generate(cfg):
    print(f'{cfg["name"]} extended dashboard →')
    want = [cfg['weight'], cfg['country_col'], cfg['sex_col'], cfg['age_col']] + [t[1] for t in cfg['inds']]
    _, meta = pyreadstat.read_sav(str(cfg['file']), metadataonly=True)
    have = [c for c in want if c in meta.column_names]
    df, _ = pyreadstat.read_sav(str(cfg['file']), usecols=have)
    for c in want:
        if c not in df.columns:
            df[c] = float('nan')
    cc = df[cfg['country_col']].astype(str)
    if cfg.get('split_country'):
        cc = cc.str.split('-').str[0]
    df['_cc'] = cc
    df = df[df['_cc'].isin(cfg['country_map'])].copy()
    df['_w'] = df[cfg['weight']].clip(lower=0).fillna(0)
    df['_sex'] = df[cfg['sex_col']]
    a = df[cfg['age_col']]
    df['_age'] = np.select([a <= 25, a <= 40, a <= 60, a > 60], [1, 2, 3, 4], default=0)
    print(f'  loaded {len(df):,} respondents, {df["_cc"].nunique()} countries')

    body, last = '', None
    for ind in cfg['inds']:
        topic, code, pos, base, lbl, blurb = ind[:6]
        site = ind[6] if len(ind) > 6 else None
        c = _cells(df, code, set(pos), set(base), cfg)
        if not c['overall']:
            print(f'  – {lbl}: no data, skipped'); continue
        if topic != last:
            body += f'<h2 class="topichdr">{topic}</h2>'; last = topic
        body += _section(lbl, blurb, c, cfg['wave'])
        print(f'  ✓ {lbl}: {c["overall"]["pct"]}% ({len(c["country"])} countries)')
        if site:
            write_site_dataset(cfg['root'], site['slug'], site['title'], site['topic'],
                                site.get('value_label', lbl), site.get('unit', '%'),
                                site.get('summary', blurb), cfg['site_source'], cfg['site_license'],
                                cfg['site_url'], cfg['wave'], c['country'])

    # Clean URL of this dashboard — Cloudflare serves <name>.html at /<name>.
    page_url = f"https://azenha.ai/bulldozer/dashboards/{pathlib.Path(cfg['out_html']).stem}"
    html = _TEMPLATE.format(title=cfg['title'], lead=cfg['lead'], sigkey=cfg['sigkey'],
                            body=body, foot=cfg['foot'], page_url=page_url)
    out = pathlib.Path(cfg['out_html'])
    out.write_text(html)
    if cfg.get('folder_copy'):
        shutil.copy(out, cfg['folder_copy'])
    print(f'  ✓ {out}\n  ✓ copied into source folder')


_TEMPLATE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title>
<meta name="description" content="{lead}">
<link rel="canonical" href="{page_url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="BullDozer"><meta property="og:title" content="{title}"><meta property="og:description" content="{lead}"><meta property="og:url" content="{page_url}"><meta property="og:image" content="https://azenha.ai/bulldozer/og.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{title}"><meta name="twitter:image" content="https://azenha.ai/bulldozer/og.png">
<style>
:root{{--bg:#0e0f11;--card:#16181b;--card2:#1c1f23;--border:#2a2e33;--text:#e7e9ec;--dim:#9aa1a9;--accent:#ffb000}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 Inter,system-ui,sans-serif;padding:24px;max-width:1100px;margin:0 auto}}
h1{{font-size:23px;margin:0 0 2px}}.lead{{color:var(--dim);margin:0 0 18px;font-size:14px;max-width:80ch}}
.topichdr{{font-size:13px;text-transform:uppercase;letter-spacing:2px;color:var(--accent);margin:22px 0 8px;border-bottom:1px solid var(--border);padding-bottom:5px}}
.ind{{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin-bottom:14px}}
.ind h2{{font-size:18px;margin:0 0 2px;display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}}
.ind h2 .ov{{color:var(--accent);font-variant-numeric:tabular-nums}}.ind h2 .ov em{{font-style:normal;font-size:12px;color:var(--dim);margin-left:2px}}
.blurb{{color:var(--dim);font-size:13px;margin:0 0 14px}}
.grid{{display:grid;grid-template-columns:1.4fr 1fr;gap:16px}}@media(max-width:720px){{.grid{{grid-template-columns:1fr}}}}
.panel{{background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px}}
.panel h3{{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--dim);margin:0 0 10px;font-weight:600}}
.panel h3 .note{{text-transform:none;letter-spacing:0;color:var(--accent);font-weight:600;margin-left:6px}}
.row{{display:grid;grid-template-columns:120px 1fr 62px;align-items:center;gap:10px;font-size:13px;margin:5px 0}}
.lbl{{color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}.sig{{color:var(--accent)}}
.track{{position:relative;height:13px;background:#0e0f11;border:1px solid var(--border);border-radius:5px}}
.fill{{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,var(--accent),#ff7a00);border-radius:5px}}
.ci{{position:absolute;top:50%;height:2px;background:rgba(255,255,255,.55);transform:translateY(-50%)}}
.val{{text-align:right;font-variant-numeric:tabular-nums;color:var(--dim)}}.val em{{font-style:normal;font-size:10px;opacity:.7;margin-left:1px}}
.foot{{color:var(--dim);font-size:12px;margin-top:16px}}.foot a{{color:var(--accent)}}
.back{{font-size:13px;margin:0 0 14px}}.back a{{color:var(--dim);text-decoration:none}}.back a:hover{{color:var(--accent)}}
.sigkey{{font-size:11.5px;color:var(--dim);margin:0 0 18px}}
</style></head><body>
<p class="back"><a href="/bulldozer/">&larr; BullDozer</a></p>
<h1>{title}</h1><p class="lead">{lead}</p><p class="sigkey">{sigkey}</p>
{body}
<p class="foot">{foot} &middot; <a href="/bulldozer/">BullDozer</a> &middot; <a href="/bulldozer/surveys">All surveys</a></p></body></html>"""
