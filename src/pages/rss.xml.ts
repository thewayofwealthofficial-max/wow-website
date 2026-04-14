import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog', ({ data }) => !data.draft))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: 'Way of Wealth — Blog',
    description: 'Honest, research-based notes on the behavioral side of money. By Joel — MSc Behavioral Economics, Qualified Financial Planner.',
    site: context.site ?? 'https://www.wayofwealthstudio.shop',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.id}/`,
      categories: [post.data.category, ...post.data.tags],
      author: 'Joel — Way of Wealth',
    })),
    customData: '<language>en-gb</language>',
  });
}
