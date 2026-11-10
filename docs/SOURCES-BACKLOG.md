# Survey sources not yet in BullDozer

Cross-national surveys with open data that the catalogue does not carry yet,
with where the data is obtained. "Open" here means free to download; several
still want an account, and one wants a written application. Nothing on this
list is paid.

Checked 2026-09-15. What we already have: WVS, EVS, ESS, ISSP (2 items),
Eurobarometer (3), Afrobarometer, Arab Barometer, Latinobarómetro, Caucasus
Barometer, LiTS, Wellcome Global Monitor, World Risk Poll, Digital News Report,
PISA, EHIS, EU-SILC aggregates, DHS (1 country), RLMS.

## Done — history and fresh waves (10 Nov 2026)

Each from a free download with no account; every aggregator first reproduces
the figures already published, then extends them. Aggregators live in
`scripts/tools/`, their per-country output in `data/raw/`, so the weekly run
needs nothing from the Mac.

| Source | Before | Now | Aggregator |
|---|---|---|---|
| **Afrobarometer** | Round 9 only | Rounds 2–10 (2002–2025), 18 series, 45 countries, up to nine points each; Round 10 is new | `afro_aggregate.py` — finds each item by its wording per round, reads codes from value labels; Round 1 and Round 2's trust items left out (other scales) |
| **Caucasus Barometer** | 2013 only | 2008–2024 (Azerbaijan to 2013), 3 series extended + 6 new | `cb_aggregate.py` — CRRC time-series files |
| **World Risk Poll** | 2023 only | 2019, 2021, 2023, 2025 | `wrp_aggregate.py` — 2019 and 2025 wording changes noted per series |
| **LiTS (EBRD)** | wave IV only | 2006, 2010, 2016, 2023 | `lits_aggregate.py` |
| **Wellcome Global Monitor** | 2018 only | 2018 and 2020 (trust in science, scientists) | `wgm2020_aggregate.py` |

Side effect: the azenha.ai upload hit Cloudflare Pages' 20,000-file cap. The
287 per-dataset CSVs are now built on request by a Pages Function in the site
repo (`functions/bulldozer/data/[file].js`), same URLs, same bytes. Headroom
after that is about 250 files — a new dataset costs about four.

## Done

**CSES** — added 2026-09-25 (`cses-*`, four series, 51–53 countries). Not the
afternoon this list once promised: the data is ungated (a plain download despite
the registration page), but the Integrated Module Dataset unpacks to 655 MB of
CSV, beyond the longest string Node can hold. `scripts/tools/cses_imd_aggregate.mjs`
streams it once per release into a 17 KB per-study aggregate under
`data/raw/cses/`, which is what `parse_cses.mjs` and the scheduled run read.
Answer codes come from the codebook: satisfaction with democracy has no code 3
and a "neither" option only in some waves, so it is published as a share
satisfied, not a mean. Module 6 (2021–2026, released Dec 2025) is also ungated
and is the obvious next refresh.

**CSES Module 6** — added 2026-09-25: 16 countries move to 2022–2024. Module 6
renumbers its questionnaire (F3010 is turnout, not satisfaction), so the
aggregator looks every column up by name per release.

**Afrobarometer Round 9** — 3 → 18 series, 39 countries. The original three
came from a CSV in a temporary folder whose script was lost; the rule was
recovered by reproducing them exactly and now lives in
`scripts/tools/afro_aggregate.py` (all rounds since Nov 2026).

**IEA: TIMSS 2023, PIRLS 2021, ICCS 2022, ICILS 2023** — eight series. Direct
downloads from iea.nl's data repository, no account. Checked against IEA's
published tables country by country. Countries IEA reports below the line are
left out, with the reason in the method note.

Source files for all three are re-downloadable from the URLs in each
aggregator's docstring; only the small per-country CSVs are committed.

## Gaps by region

| Survey | Covers | Access | Where |
|---|---|---|---|
| **AmericasBarometer (LAPOP)** | 34 countries, Americas, 2004– | free, account | vanderbilt.edu/lapop → Data access (now under /cgd/data-access/) |
| **Asian Barometer** | 14+ countries, East & SE Asia | free, **written application**, approval takes weeks | asianbarometer.org/data |
| **Pew Global Attitudes** | ~40 countries, yearly | free, account | pewresearch.org/global/datasets |
| **MICS (UNICEF)** | 100+ countries, households, children | free, account + purpose statement | mics.unicef.org/surveys |
| **DHS** (more countries) | 90 countries | free, account + project registration | dhsprogram.com |
| **SHARE** | Europe 50+, 28 countries | free, account, research use | share-eric.eu/data/data-access |
| **EQLS / EWCS (Eurofound)** | EU quality of life, working conditions | free, UK Data Service account | ukdataservice.ac.uk |
| **Generations & Gender (GGS)** | 25 countries, family | free, account | ggp-i.org |
| **World Bank Microdata** | LSMS, STEP, enterprise surveys | free, account per dataset | microdata.worldbank.org |
| **IPUMS International** | census microdata, 100+ countries | free, account | international.ipums.org |

## Deeper cuts of sources we already have

| Survey | What is missing | Where |
|---|---|---|
| **ISSP** | only 2 items in; 30+ yearly modules (work, religion, environment, inequality) | GESIS (search.gesis.org), free account |
| **Eurobarometer** | only 3 items; Standard EB runs twice a year, dozens of items | GESIS, same account |
| **WVS / EVS** | only 2 + 3 items; joint EVS-WVS file has ~300 | worldvaluessurvey.org, evs.gesis.org — already downloaded once |
| **Afrobarometer** | 3 items of ~100 | afrobarometer.org, direct download |

## Education (open, no account)

| | Where |
|---|---|
| **PIAAC** adult skills, **TALIS** teachers (OECD) | oecd.org → PIAAC / TALIS data |

## Not open — what we do instead

**Gallup World Poll** is licensed and paid. We use its published aggregates
through the World Happiness Report, Wellcome Global Monitor and World Risk
Poll, all of which sit on Gallup fieldwork and are free. The raw file is not
coming.

**Ipsos, Edelman, YouGov** publish reports, not data. Aggregates can be
transcribed from a report with the report as the cited source; it is
manual and fragile, so only for a specific story.

## Registration status (2026-09-25)

Accounts are opened by Kirill, in the Chrome profile that has the Claude
extension: `azenha.agent@gmail.com` by default, `agent@azenha.ai` where an
organisation is required. None exists yet.

LAPOP needs no account — "Free User" on the data page. Its licence says
research use only, no redistribution of the data; the terms were accepted on
2026-09-27 and only country aggregates are published (live since 2026-09-28,
`lapop-*`): the free 2004–2023 Grand Merge plus the 2025/26 wave, 28 countries.

Asian Barometer (checked 2026-09-28): an online application form at
asianbarometer.org/datar?page=d10 asks for a full name, title, affiliation and
a research description; use is limited to academic research, education,
policy analysis "or other pre-approved purposes", and the data may not be
passed on. Apply as Azenha AI, describe publishing country-level aggregates
with the required acknowledgement, and expect that they may say no.

## Suggested order

1. ~~**LAPOP**~~ — done 2026-09-28: 11 series, 2004–2026, 28 countries.
2. ~~**Pew**~~ — done 2026-10-11: Spring 2025, 18 series, 24 countries; every figure matches Pew's topline. Earlier waves would add trends.
3. **ISSP + Eurobarometer** deeper — one GESIS account serves both.
4. **Asian Barometer** — start the application now; it is the slow one.

## Next — needs an account, so from the laptop (Nov 2026)

GESIS data (ISSP, Eurobarometer, EVS — and so the EVS half of the
Integrated Values Surveys) cannot go through an AI assistant: GESIS terms §4
prohibit AI processing (see `src/data/licences.ts`). Those are aggregated by
hand, as the ISSP modules already were, or taken from published tables
(Eurobarometer's Commission tables are CC BY 4.0).

| What | Where | Account | Who |
|---|---|---|---|
| **Global Flourishing Study** waves 1–2 (22 countries, 2023–24; wave 3 with a preregistration) | osf.io/c8hbk → "Wave 1, Year 1 Mid-Year and Wave 2 Data: Non-sensitive" (osf.io/xk3yc). Files are not listed to anonymous visitors | OSF (free) | download, then any session can aggregate |
| **WVS trend file 1981–2022** (WVS waves 1–7; the WVS part of the IVS) | worldvaluessurvey.org/WVSEVStrend.jsp | WVS form, non-profit use | download; aggregation allowed (not GESIS) |
| **ESS rounds 1–11** (2002–2023) | ess.sikt.no data portal | ESS (free), CC BY-NC-SA | download; aggregation allowed |
| **EVS trend file 1981–2017** | GESIS ZA7503 | GESIS | by hand only |
| **ISSP repeated modules** (Role of Government 1985–2016, Environment 1993–2020) | GESIS | GESIS | by hand only |
| **Eurobarometer trends** | GESIS microdata, or Commission tables (CC BY 4.0) | GESIS / none | tables: any session; microdata: by hand |
| **Pew Global Attitudes 2002–2024** (trend for the Spring 2025 items) | pewresearch.org/global/datasets | Pew (free), research use only | download |
| **Asian Barometer** wave 6 | asianbarometer.org/datar?page=d10 | written application | apply now; weeks |

Still to check for history from open sources: Arab Barometer waves I–VII
(arabbarometer.org, form), Latinobarómetro rounds 2025/2026, SDR2 1966–2017
(Harvard Dataverse, open).
