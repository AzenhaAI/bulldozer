# BullDozer — project overview

Marketing-analytics & research site: 164 public, parsed cross-country datasets,
every number sourced. This document is the map — what lives where, how it
deploys, and how to add data.

## Where it lives

| Thing | Location |
|---|---|
| **Source code** | `~/Projects/bulldozer` → GitHub [`AzenhaAI/bulldozer`](https://github.com/AzenhaAI/bulldozer) (public, MIT) |
| **Deployed copy** | `~/Projects/azenha/bulldozer/` (the `dist/` build, copied in — not the source) |
| **Live site** | **[azenha.ai/bulldozer](https://azenha.ai/bulldozer/)** — Cloudflare Pages, base path `/bulldozer` |
| **Local preview** | `npm run dev` → http://localhost:4321/bulldozer/ |
| **Raw source data** | `~/Documents/tableau_data/` and `…/BK/Opros/Inter_survey/` (curated public exports the parsers read; not in the repo) |

`~/Projects/azenha` is the whole azenha.ai static site; BullDozer is one folder inside
it. Only `bulldozer/` is our concern there — the rest is unrelated and private.
The old home under shpara.com now answers with a permanent redirect.

## Stack

- **[Astro](https://astro.build) 4** static build, `base: '/bulldozer'`. No client framework —
  interactivity is hand-written vanilla browser JS inlined per component.
- Output is plain static files in `dist/` — host-agnostic, fast everywhere
  (~410 pages, no server runtime).

## Deploy flow

```bash
npm run build                          # → dist/  (static)
rsync -a --delete dist/ ~/Projects/azenha/bulldozer/
# commit BOTH repos:
#   ~/Projects/bulldozer : git add -A         (source)
#   ~/Projects/azenha    : git add bulldozer  (built copy only)
# then publish from ~/Projects/azenha:
./scripts/deploy_prod.sh               # direct upload; a push alone does not deploy
```

Two git repos, always kept in step: the **source** (`~/Projects/bulldozer`)
and the **built copy** committed under `~/Projects/azenha/bulldozer`. In `~/Projects/azenha`
stage only `bulldozer` — the surrounding site has other, unrelated changes.

**Rule:** nothing Russian/Cyrillic in this public surface. Grep before every
push. The interface is English-only.

## Structure

```
src/
  data/
    datasets.ts          auto-registry: import.meta.glob over surveys/*.json + macro/*.json
    surveys/  macro/      normalised { meta: provenance, data: [Observation] } per dataset
    sources.ts           catalogue of source programmes (live + collected)
    country-names.json    { common, official } per ISO-3   (from mledoze/countries)
    country-currency.json { code, name, symbol } per ISO-3
    iso-numeric / iso-alpha2 / country-meta.json
  lib/
    analytics.ts         KPIs, movers, group rollups, period-over-period change
    countryIndex.ts      per-country profile: latest value + world rank per indicator
    geo.ts               canonical ISO codes + clean display names
    topics.ts palette.ts worldgeo.ts
  components/            25 viz components (bubble, heatmap, matrix, maps, index builder…)
  layouts/BaseLayout.astro   header (tabs + burger + search + theme), meta, footer
  pages/                index, explore, macro, markets, surveys, geo, edu,
                        country/[slug], dataset/[slug], stories/, glossary, data/*.json
scripts/
  parse_*.mjs           one parser per source family → normalised JSON  (33 parsers)
  fetch_*.mjs           one-off reference-data generators (names, currency, country-meta)
  make_og_datasets.mjs  per-dataset OG images (sharp)
docs/OVERVIEW.md        this file
```

## Data model

One long-format observation flows through the whole site:

```ts
Observation = { entity, iso, period, value, group? }
```

Surveys, macro statistics and market data all share it. Drop a normalised JSON
into `src/data/surveys/` or `src/data/macro/` and the dataset page, CSV
endpoint, country profiles, search index and explorer pick it up automatically
— `datasets.ts` globs the folders, no code change needed.

`kind` (Polls vs Statistics) is decided centrally by slug in `datasets.ts`
(`isOpinionSurvey`), not by folder. `topic` groups the lists (Economy,
Demographics, Governance, Media…).

## Adding a dataset

1. Write a `scripts/parse_<source>.mjs` that reads a public export and emits
   `{ meta: { title, source, license, url, unit, topic, … }, data: [Observation] }`.
   Provenance (source, licence, url, unit, parse date) is **mandatory**.
2. Run it → JSON lands in `src/data/macro/` or `src/data/surveys/`.
3. Add a card to `src/data/sources.ts` (status `live`, `match` = its `source`).
4. `npm run build`, preview, grep for Cyrillic, deploy (above).

Parsers soft-skip when their source file is absent, so a fresh clone still
builds. IMF WEO fetches live via the open DataMapper API (`npm run fetch:imf`).

## Automation

| GitHub workflow | Schedule | Does |
|---|---|---|
| `update-data.yml` | weekly | re-runs parsers, commits data changes |
| `telegram-digest.yml` | weekly | posts a top-movers digest (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) |

Analytics: GA4 `G-QM1PRCY7M1`, wired in `BaseLayout` behind `import.meta.env.PROD`.

## Principles

1. **Only public data** — cross-country surveys and open statistical sources;
   nothing proprietary or internal, ever.
2. **Every number sourced** — source, licence, URL, unit and parse date on each
   dataset, surfaced in the UI.
3. **No client framework** — Astro static build; hand-written browser JS.
4. **English-only, no Cyrillic** in this public surface.
