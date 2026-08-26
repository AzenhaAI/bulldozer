# BullDozer 🚜

**Bulldoze the noise. Mine the signal.**

Marketing analytics & research site: **164 public, parsed datasets** — surveys, IMF & World Bank macro, markets and people. Every number sourced.

**Live: [azenha.ai/bulldozer](https://azenha.ai/bulldozer/)**

![BullDozer](public/og.png)

> **Where it lives** — source: this repo (`~/Projects/bulldozer`, [github.com/AzenhaAI/bulldozer](https://github.com/AzenhaAI/bulldozer)). Deployed: `npm run build` → `dist/` is rsynced into `~/Projects/azenha/bulldozer/` and served at **azenha.ai/bulldozer** via Cloudflare Pages. See [docs/OVERVIEW.md](docs/OVERVIEW.md) for the full map.

## What's inside

Header tabs: **New · Top · Macro · Polls · Geo · Biz · Edu**; a right-edge burger holds the rest (Quiz, Glossary, About, GitHub). Global search is on 🔍 / `Cmd-K`; light/dark toggle sits beside it.

| Tab | Route | What |
|---|---|---|
| New | `/` | Data stories, featured dashboards and release notes |
| Top | `/explore` | Interactive explorer: bubble, correlations, beeswarm, heatmap, trajectories, index builder |
| Macro | `/macro` | 104 objective statistics — IMF WEO, World Bank WDI/Findex, OECD, BIS, OWID, Maddison, Eurostat, TI CPI, Freedom House, RSF, PISA, UNHCR, Big Mac |
| Polls | `/surveys` | 60 opinion datasets — WVS, WHR, V-Dem, Afrobarometer, Latinobarómetro, ESS, Reuters DNR, Hofstede and more |
| Biz | `/markets` | Largest companies & most valuable brands, with directories and metric switchers |
| Geo | `/geo` | Country profiles (name, official name, ISO codes, currency), similar-country matching, side-by-side comparison |
| Edu | `/edu` | Field guide: dashboard types, BI tools, how the site parses its own data |

Plus **232 static country profiles** ([/country](https://azenha.ai/bulldozer/country)), per-dataset dashboards with KPIs / movers / maps / trends / breadcrumbs, downloadable CSVs, a glossary, and detailed source-level results dashboards.

## Highlights

- **Rosling bubble chart** — income × life expectancy × population, animated 1800→2020 (Gapminder long series, 40k+ observations)
- **Correlation matrix** — Pearson r across 15 curated indicators
- **Composite index builder** — weight indicators into your own country ranking, live re-ranking
- **Similar countries** — nearest-neighbour matching on global percentile profiles
- **Country heatmap** — percentile grid with topic/region/search filters
- **Cultural map of the world** — Inglehart-Welzel dimensions from WVS Wave 7
- **Global search** (`Cmd-K`) across every dataset and country; **canonical country names** (common + official + ISO + currency) independent of source spelling
- Every dataset page ships **schema.org/Dataset JSON-LD**, its own **OG image**, breadcrumbs, prev/next and a **CSV download**

## Principles

1. **Only public data.** Cross-country surveys and open statistical sources; no proprietary or internal data — ever.
2. **Every number sourced.** Each dataset carries source, licence, URL, unit and parse date, surfaced in the UI.
3. **No client framework.** Astro static build; interactivity is hand-written browser JS. 380+ pages, fast everywhere.

## Architecture

```
src/
  data/
    datasets.ts        # auto-registry: import.meta.glob over surveys/*.json + macro/*.json
    surveys/  macro/    # normalised observations { meta: provenance, data: [Observation] }
    sources.ts          # catalogue of survey programmes (live + collected)
  lib/
    analytics.ts        # KPIs, movers, group rollups, period-over-period change
    countryIndex.ts     # per-country profiles: latest value + world rank per indicator
    topics.ts palette.ts worldgeo.ts …
  components/           # 25 viz components (bubble, heatmap, matrix, maps, index builder…)
  pages/                # index, explore, macro, markets, surveys, geo, country/[slug],
                        # dataset/[slug], stories/, glossary
scripts/
  parse_*.mjs           # one parser per source family → normalised JSON
  make_og_datasets.mjs  # per-dataset OG images (sharp)
```

**Data model** — one long-format `Observation`: `{ entity, iso, period, value, group? }`.
Surveys, macro indicators and market data all flow through the same analytics layer.
Drop a normalised JSON into `src/data/surveys/` or `src/data/macro/` and the dataset
page, CSV endpoint, country profiles and explorer pick it up automatically.

## Develop

```bash
npm install
npm run dev     # http://localhost:4321/bulldozer/
npm run build   # → dist/ (static, host-agnostic)
```

Parsers (`npm run parse:*`) read curated public exports and soft-skip when a
source file is absent, so a fresh clone builds out of the box.

## Automation

| Workflow | Schedule | Does |
|---|---|---|
| `update-data.yml` | weekly | re-runs parsers, commits data changes |
| `telegram-digest.yml` | weekly | posts a top-movers digest (env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) |

## Licence

Code is [MIT](LICENSE). The datasets remain the property of their original
publishers — every dataset page credits its source and licence; check the
source's terms before redistributing data.
