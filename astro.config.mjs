// @ts-check
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL ?? 'https://library.sanjeed.in';

export default defineConfig({
  site,
  output: 'static',
  integrations: [sitemap(), react()],
});
