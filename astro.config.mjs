import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://www.wayofwealthstudio.shop',
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
