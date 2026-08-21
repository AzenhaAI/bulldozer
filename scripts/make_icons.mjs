/** Generate the PWA icons (192, 512, maskable) from the one master mark.
 *
 * The web icons used to be drawn here as their own SVG — a bare B — while the
 * app carried the B over the "stat" wordmark. Two drawings of the same logo
 * drift apart the moment either is touched, so both now come from a single
 * file: scripts/icon-master.png, the same 1024px artwork the Flutter launcher
 * icons are built from (bulldozer_app/assets/icon/icon.png).
 *
 * To change the logo, replace the master in the app repo, copy it here, and
 * re-run this. Sizes only get resized, never redrawn.
 *
 *   node scripts/make_icons.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pub = join(__dirname, '..', 'public');
const MASTER = join(__dirname, 'icon-master.png');

/** Rounded-corner mask, so the square master reads as an app icon in a browser. */
const rounded = (size, radius) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
     <rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/>
   </svg>`,
);

async function write(name, size, radius) {
  const base = sharp(MASTER).resize(size, size, { kernel: 'lanczos3' });
  const img = radius
    ? base.composite([{ input: rounded(size, radius), blend: 'dest-in' }])
    : base;
  await img.png().toFile(join(pub, name));
  console.log(`  ✓ ${name} (${size}px${radius ? `, r${radius}` : ', square'})`);
}

// Maskable is left square on purpose: Android crops it to its own shape, and a
// pre-rounded source would lose the corners twice.
await write('icon-192.png', 192, 40);
await write('icon-512.png', 512, 108);
await write('icon-512-maskable.png', 512, 0);
console.log('✓ PWA icons regenerated from the master mark');
