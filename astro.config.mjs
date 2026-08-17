import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// BullDozer is served from https://azenha.ai/bulldozer
export default defineConfig({
  site: 'https://azenha.ai',
  base: '/bulldozer',
  trailingSlash: 'always',
  integrations: [mdx(), sitemap()],
});
