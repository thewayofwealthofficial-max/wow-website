import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  // Must match LINKS.siteUrl in src/config/links.ts — this is the only duplication (astro.config is loaded before TS).
  site: 'https://thewayofwealth.shop',
  trailingSlash: 'never',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/draft/'),
    }),
    mdx(),
  ],
  build: {
    format: 'directory',
  },
});
