import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

const books = defineCollection({
  loader: file('src/data/books.json'),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    author: z.string(),
    series: z.string().optional(),
    seriesPosition: z.number().positive().optional(),
    isbn10: z.string().optional(),
    isbn13: z.string().optional(),
    coverUrl: z.url().optional(),
    openLibraryUrl: z.url().optional(),
    description: z.string().optional(),
    subjects: z.array(z.string()).default([]),
    status: z.enum(['want-to-read', 'currently-reading', 'read', 'paused', 'dnf']),
    rating: z.number().min(0).max(5).optional(),
    averageRating: z.number().min(0).max(5).optional(),
    pages: z.number().int().positive().optional(),
    publishedYear: z.number().int().positive().optional(),
    dateAdded: z.string().optional(),
    dateStarted: z.string().optional(),
    dateRead: z.string().optional(),
    review: z.string().optional(),
    visibility: z.boolean().default(true),
    featured: z.boolean().default(false),
  }),
});

export const collections = { books };
