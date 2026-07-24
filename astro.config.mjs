import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// BullDozer is served from https://shpara.com/bulldozer
export default defineConfig({
  site: 'https://shpara.com',
  base: '/bulldozer',
  trailingSlash: 'always',
  integrations: [mdx(), sitemap()],
});
