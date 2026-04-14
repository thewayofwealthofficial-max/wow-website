import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().max(70),
    description: z.string().max(170),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    category: z.enum([
      'Spending & shame',
      'Anxiety & avoidance',
      'ADHD & money',
      'Self-employed',
      'Budgeting that sticks',
      'Behavioral basics',
    ]),
    redditSource: z.string().url().optional(),
    redditQuestion: z.string().optional(),
    ogImage: z.string().optional(),
    draft: z.boolean().default(false),
    readingTime: z.string().optional(),
  }),
});

export const collections = { blog };
