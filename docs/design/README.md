# Design references

Source material for chart work, kept out of `src/` and `public/` so it never ships
to the site — this folder is not part of the Astro build.

| File | What it is |
|---|---|
| `cap-vs-revenue-slope-reference.html` | Standalone reference for the ribbon slope chart on `/markets` — ranks companies by market cap on one side and revenue on the other, ribbon width encoding size. The implementation lives in `src/pages/markets.astro` (`#co-slope`). |
| `cap-vs-revenue-slope.dc.html` | Compact variant of the same reference. |

Screenshots of shipped pages live in `../screenshots/`.
