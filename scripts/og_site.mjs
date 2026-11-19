// The site's own share card (public/og.png, 1200x630): what a link to
// azenha.ai/bulldozer unfurls with in Telegram, WhatsApp, Mail and search.
// Same layout as PapaGaio's card (papagaio/site/scripts/og_site.mjs): the real
// app icon, the flyer's wording, a QR code to the site and the store badges.
// Colours and points follow the A6 flyer (bulldozer_app/store/flyer/card.json).
//
//   npm run build && node scripts/og_site.mjs          -> public/og.png
//   node scripts/og_site.mjs --light --out <file>       the flyer's cream variant
//
// The indicator count comes from the built catalogue (dist/data/catalog.json,
// what the app lists), rounded down to ten with a "+", so the card stays true
// as the nightly data adds indicators.
//
// Chats cache a card by its URL, so BaseLayout names it with ?v=<n>: bump that
// whenever this card is redrawn.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dark = !args.includes('--light'); // dark like PapaGaio's card
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(site, 'public', 'og.png');

const catalogFile = join(site, 'dist', 'data', 'catalog.json');
if (!existsSync(catalogFile)) throw new Error('dist/data/catalog.json is missing: run npm run build first');
const nIndicators = JSON.parse(readFileSync(catalogFile, 'utf8')).length;
const indicators = `${Math.floor(nIndicators / 10) * 10}+`;

const icon = readFileSync(join(site, 'public', 'icon-512.png')).toString('base64');
const F = 'Helvetica Neue, Helvetica, Arial, sans-serif';

const C = dark
  ? { bg: '#16171a', ink: '#f2efe8', dim: '#a9a395', accent: '#ffb000', dot: '#ffb000', link: '#ffb000', qrBox: '#ffffff', qrInk: '#1d1f23', badgeStroke: '#a6a6a6' }
  : { bg: '#faf8f1', ink: '#1d1f23', dim: '#5f5a50', accent: '#c27c00', dot: '#d98a00', link: '#a35f00', qrBox: '#ffffff', qrInk: '#1d1f23', badgeStroke: '#000000' };

const items = [
  ['Rankings', `${indicators} indicators, every country ranked`],
  ['Maps', 'a globe and a map for any indicator'],
  ['Polls', 'world surveys: values, trust, happiness'],
  ['Countries', 'a profile per country, ranks explained'],
  ['Ask AI', 'questions answered from the data'],
  ['Open data', 'source, year and licence on each chart'],
];
const list = items.map(([b, t], i) => {
  const y = 300 + i * 42;
  return `<circle cx="84" cy="${y - 8}" r="6" fill="${C.dot}"/>
  <text x="104" y="${y}" font-family="${F}" font-size="25" fill="${C.ink}"><tspan font-weight="700">${b}</tspan><tspan fill="${C.dim}" dx="9">— ${t}</tspan></text>`;
}).join('\n  ');

// The same qrcode package as PapaGaio's card, pointing at the site.
const require = createRequire(import.meta.url);
const QR = require('/opt/homebrew/lib/node_modules/openclaw/node_modules/qrcode');
const qr = (await QR.toString('https://azenha.ai/bulldozer', { type: 'svg', errorCorrectionLevel: 'M', margin: 0,
  color: { dark: C.qrInk, light: '#0000' } })).replace(/^<\?xml[^>]*>/, '').replace('<svg ', '<svg x="900" y="126" width="196" height="196" ');

// Store badges as on the flyer: Apple's logo and Play's four-colour triangle.
const APPLE = 'M16.37 12.7c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.23 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.03 2.28-1.27 3.13-2.53.99-1.45 1.39-2.85 1.42-2.92-.03-.01-2.72-1.04-2.71-4.13zM13.79 5.07c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.27.68-3 1.54-.66.76-1.24 1.98-1.08 3.15 1.14.09 2.31-.58 3.02-1.44z';
const badge = (y, logo, small, big) => `<rect x="878" y="${y}" width="240" height="64" rx="12" fill="#000" stroke="${C.badgeStroke}" stroke-width="2"/>
  <g transform="translate(896 ${y + 14}) scale(1.5)">${logo}</g>
  <text x="944" y="${y + 26}" font-family="${F}" font-size="14" fill="#dddddd">${small}</text>
  <text x="944" y="${y + 52}" font-family="${F}" font-size="27" font-weight="600" fill="#ffffff">${big}</text>`;
const appStore = badge(364, `<path fill="#fff" d="${APPLE}"/>`, 'Download on the', 'App Store');
const play = badge(442, '<path fill="#34d17a" d="M3.6 1.8 13.4 12 3.6 22.2c-.4-.2-.6-.6-.6-1.1V2.9c0-.5.2-.9.6-1.1z"/><path fill="#fbbc04" d="m16.8 8.6-3.4 3.4 3.4 3.4 3.9-2.2c1.1-.6 1.1-1.8 0-2.4z"/><path fill="#4285f4" d="M3.6 1.8c.3-.2.8-.2 1.3.1l11.9 6.7-3.4 3.4z"/><path fill="#ea4335" d="m13.4 12 3.4 3.4-11.9 6.7c-.5.3-1 .3-1.3.1z"/>', 'GET IT ON', 'Google Play');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#ffb000"/><stop offset="0.55" stop-color="#f08a00"/><stop offset="1" stop-color="#d96c00"/></linearGradient></defs>
  <rect width="1200" height="630" fill="${C.bg}"/>
  <rect width="1200" height="12" fill="url(#g)"/>
  <clipPath id="r"><rect x="72" y="62" width="84" height="84" rx="19"/></clipPath>
  <image href="data:image/png;base64,${icon}" x="72" y="62" width="84" height="84" clip-path="url(#r)"/>
  <text x="178" y="128" font-family="${F}" font-size="62" font-weight="700" fill="${C.ink}">BullDozer <tspan fill="${C.accent}">Stats</tspan></text>
  <text x="72" y="214" font-family="${F}" font-size="36" fill="${C.ink}">The world in numbers, sourced</text>
  ${list}
  <text x="72" y="584" font-family="${F}" font-size="23" fill="${C.dim}">Free · no account · no ads · iPhone, Android and the web</text>
  <rect x="884" y="110" width="228" height="228" rx="18" fill="${C.qrBox}"${dark ? '' : ' stroke="#e3ddcc" stroke-width="2"'}/>
  ${qr}
  ${appStore}
  ${play}
  <text x="998" y="562" text-anchor="middle" font-family="${F}" font-size="27" font-weight="700" fill="${C.link}">azenha.ai/bulldozer</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log(`${out} written (${nIndicators} indicators in the catalogue, card says ${indicators})`);
