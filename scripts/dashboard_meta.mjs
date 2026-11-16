// Meta and og:description of the static dashboards in public/dashboards.
// The generators wrote the page title or the lead paragraph there (27–200
// characters; Bing flagged the short ones, 16 Nov 2026). Search engines want
// 140–160. Each text states only what the dashboard itself shows: counts of
// countries are read off its own table headers. Idempotent; deploy_site.sh
// runs it before every build, so a regenerated dashboard is fixed again.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DESC = {
  afrobarometer: 'Afrobarometer Round 9 results for 39 African countries: democracy, elections, corruption, trust, public services and more, % by country with significance.',
  arabbarometer: 'Arab Barometer Wave VIII (2023–24) for eight MENA countries: trust, support for democracy, corruption, wish to emigrate, religiosity and the economy.',
  dhs: 'DHS surveys of women aged 15–49 in Tajikistan, Kyrgyzstan and Kazakhstan: literacy, paid work, modern contraception and child marriage, weighted shares.',
  eurobarometer: 'Eurobarometer microdata for 34 countries: democracy, wellbeing, digital life and science, weighted, by country, sex and age with 95% confidence intervals.',
  evs: 'European Values Study 2017–2020 for 36 countries: happiness, trust, politics and social values, weighted, by country, sex and age with confidence intervals.',
  gapminder: 'Gapminder indicators side by side for 239 countries and territories: income, life expectancy, Gini, literacy, HDI, homicides, internet use and energy.',
  issp: 'ISSP Environment 2020 for 27 countries: trust, media, environmental attitudes and what people would give up for nature, by country, sex and age.',
  latinobarometro: 'Latinobarómetro microdata for Latin America: support for democracy, trust and wellbeing, weighted, by country, sex and age with 95% confidence intervals.',
  rlms: 'Russia Longitudinal Monitoring Survey 1994–2024: smoking, internet use, bank cards and life satisfaction in Russia, weighted, by year, sex and age.',
  sdr2: 'Survey Data Recycling (SDR2): 22 survey projects pooled for 142 countries on trust, political participation, membership and wellbeing, % by country.',
  vdem: 'V-Dem v16 for 179 countries: 41 democracy indices, from electoral and liberal democracy to free expression and clean elections, latest year per country.',
  wellcome: 'Wellcome Global Monitor 2018 for 144 countries: trust in science, scientists and medicine, views on vaccines and science knowledge, % by country.',
  whr: 'World Happiness Report (Gallup World Poll) for 147 countries: life ladder and its six factors. Highest: Finland, Iceland, Denmark; lowest: Afghanistan.',
  wrp: 'World Risk Poll 2024 for 142 countries: feeling safe, worries, harm experienced, climate and disasters, discrimination and safety at work, % by country.',
  wvs: 'World Values Survey Wave 7 for 64 countries: values, trust, gender and family, religion, democracy, immigration, security and media, % by country.',
};

let bad = 0;
for (const [name, d] of Object.entries(DESC)) {
  if (d.length < 140 || d.length > 160) { console.error(`${name}: ${d.length} characters`); bad++; }
  const f = new URL(`../public/dashboards/${name}.html`, import.meta.url);
  if (!existsSync(f)) continue;
  const esc = d.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const h = readFileSync(f, 'utf8');
  const out = h
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc}$2`);
  if (out !== h) writeFileSync(f, out);
}
if (bad) process.exit(1);
