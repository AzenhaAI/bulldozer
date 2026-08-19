import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// BullDozer is served from https://azenha.ai/bulldozer
export default defineConfig({
  site: 'https://azenha.ai',
  base: '/bulldozer',
  trailingSlash: 'always',
  integrations: [mdx(), sitemap()],
  // Safari on an iPhone 5s stops at version 12 and cannot parse ?. or ??. One such
  // token kills the whole script, so the charts never drew and their containers sat
  // there empty, holding height. Building down to that target keeps them working.
  vite: { build: { target: ['safari12', 'chrome64', 'firefox67', 'edge79'] } },
});
