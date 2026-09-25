# Survey sources not yet in BullDozer

Cross-national surveys with open data that the catalogue does not carry yet,
with where the data is obtained. "Open" here means free to download; several
still want an account, and one wants a written application. Nothing on this
list is paid.

Checked 2026-09-15. What we already have: WVS, EVS, ESS, ISSP (2 items),
Eurobarometer (3), Afrobarometer, Arab Barometer, Latinobarómetro, Caucasus
Barometer, LiTS, Wellcome Global Monitor, World Risk Poll, Digital News Report,
PISA, EHIS, EU-SILC aggregates, DHS (1 country), RLMS.

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
`scripts/tools/afro_r9_aggregate.py`.

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

LAPOP needs no account — "Free User" on the data page — but its licence says
research use only, no commercial use, no redistribution of the data. Waiting
on a decision whether publishing country aggregates fits that.

## Suggested order

1. **LAPOP** — account, closes the Americas gap (Latinobarómetro is 17 countries).
2. **Pew** — account, the widest "attitudes to X" coverage.
3. **ISSP + Eurobarometer** deeper — one GESIS account serves both.
4. **Asian Barometer** — start the application now; it is the slow one.
