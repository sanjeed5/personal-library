#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const booksPath = process.env.BOOKS_FILE
  ? resolve(process.env.BOOKS_FILE)
  : resolve(projectRoot, 'src/data/books.json');
const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
const userAgent = 'Mozilla/5.0 (compatible; sanjeed-library/0.1; +https://sanjeed.in)';

async function fetchWithRetry(url, options = {}, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      headers: { 'User-Agent': userAgent, ...options.headers },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return response;
    if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
      await delay(attempt * 1_000);
      continue;
    }
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

function extractOgImage(html) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const imageTag = metaTags.find((tag) => /(?:property|name)=["']og:image["']/i.test(tag));
  const match = imageTag?.match(/content=["']([^"']+)["']/i);
  return match?.[1]?.replaceAll('&amp;', '&');
}

function trustedCoverUrl(value) {
  if (!value || value.includes('/nophoto/')) return undefined;
  const url = new URL(value);
  const trustedHosts = new Set([
    'm.media-amazon.com',
    'images-na.ssl-images-amazon.com',
    'images.gr-assets.com',
  ]);
  return url.protocol === 'https:' && trustedHosts.has(url.hostname) ? url.toString() : undefined;
}

async function findGoodreadsCover(book) {
  if (!book.goodreadsId) return undefined;
  const page = await fetchWithRetry(`https://www.goodreads.com/book/show/${book.goodreadsId}`, {
    headers: { Accept: 'text/html' },
  });
  const coverUrl = trustedCoverUrl(extractOgImage(await page.text()));
  if (!coverUrl) return undefined;

  const image = await fetchWithRetry(coverUrl, { method: 'HEAD' });
  if (!image.headers.get('content-type')?.startsWith('image/')) return undefined;
  return coverUrl;
}

const books = JSON.parse(await readFile(booksPath, 'utf8'));
let found = 0;
let missing = 0;
let skipped = 0;

for (let index = 0; index < books.length; index += 1) {
  const book = books[index];
  if (book.coverUrl) {
    skipped += 1;
    continue;
  }

  try {
    const coverUrl = await findGoodreadsCover(book);
    if (coverUrl) {
      books[index] = { ...book, coverUrl };
      found += 1;
      console.log(`Found: ${book.title}`);
    } else {
      missing += 1;
      console.log(`No cover: ${book.title}`);
    }

    const temporaryPath = `${booksPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(books, null, 2)}\n`);
    await rename(temporaryPath, booksPath);
    await delay(300);
  } catch (error) {
    missing += 1;
    console.error(`Failed: ${book.title}: ${error.message}`);
  }
}

console.log(`Found ${found}, unresolved ${missing}, skipped ${skipped} existing covers.`);
console.log(`Metadata cache: ${booksPath}`);
