#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const booksPath = process.env.BOOKS_FILE
  ? resolve(process.env.BOOKS_FILE)
  : resolve(projectRoot, 'src/data/books.json');
const refresh = process.argv.includes('--refresh');
const limitIndex = process.argv.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : Infinity;
const userAgent = 'sanjeed-library/0.1 (https://sanjeed.in; hi@sanjeed.in)';

if (!Number.isFinite(limit) && limit !== Infinity) {
  console.error('--limit must be a number');
  process.exit(1);
}

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function cleanSubjects(subjects = []) {
  const blockedPrefixes = [
    'nyt:', 'nyt_', 'accessible book', 'protected daisy',
    'series:', 'franchise:', 'prize:',
  ];
  return [...new Set(subjects
    .map((subject) => String(subject).trim())
    .filter((subject) => subject && !blockedPrefixes.some((prefix) => subject.toLowerCase().startsWith(prefix)))
    .map((subject) => subject.replace(/^(genre|form):/i, '').trim())
    .filter(Boolean)
    .map((subject) => subject[0].toUpperCase() + subject.slice(1)))]
    .slice(0, 8);
}

function descriptionFromWork(work) {
  const description = work?.description;
  if (typeof description === 'string') return description.trim();
  if (description && typeof description.value === 'string') return description.value.trim();
  return undefined;
}

async function fetchJson(url, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return response.json();
    if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
      await delay(1_000 * attempt);
      continue;
    }
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
}

function searchUrl(book) {
  const params = new URLSearchParams({
    fields: 'key,title,author_name,cover_i,first_publish_year,number_of_pages_median,subject',
    limit: '1',
  });
  if (book.isbn13 || book.isbn10) {
    params.set('isbn', book.isbn13 ?? book.isbn10);
  } else {
    params.set('title', book.title);
    params.set('author', book.author);
  }
  return `https://openlibrary.org/search.json?${params}`;
}

async function enrich(book) {
  const search = await fetchJson(searchUrl(book));
  const match = search.docs?.[0];
  if (!match) return { book, matched: false };

  let description = book.description;
  if ((refresh || !description) && match.key) {
    await delay(375);
    const work = await fetchJson(`https://openlibrary.org${match.key}.json`);
    description = descriptionFromWork(work) ?? description;
  }

  return {
    matched: true,
    book: {
      ...book,
      coverUrl: refresh || !book.coverUrl
        ? (match.cover_i ? `https://covers.openlibrary.org/b/id/${match.cover_i}-L.jpg` : book.coverUrl)
        : book.coverUrl,
      openLibraryUrl: refresh || !book.openLibraryUrl
        ? (match.key ? `https://openlibrary.org${match.key}` : book.openLibraryUrl)
        : book.openLibraryUrl,
      description,
      subjects: refresh || !book.subjects?.length ? cleanSubjects(match.subject) : book.subjects,
      pages: refresh || !book.pages ? match.number_of_pages_median ?? book.pages : book.pages,
      publishedYear: refresh || !book.publishedYear ? match.first_publish_year ?? book.publishedYear : book.publishedYear,
    },
  };
}

const books = JSON.parse(await readFile(booksPath, 'utf8'));
let processed = 0;
let matched = 0;
let skipped = 0;

for (let index = 0; index < books.length && processed < limit; index += 1) {
  const book = books[index];
  const complete = book.coverUrl && book.openLibraryUrl && book.description && book.subjects?.length && book.pages && book.publishedYear;
  if (complete && !refresh) {
    skipped += 1;
    continue;
  }

  try {
    const result = await enrich(book);
    books[index] = result.book;
    processed += 1;
    if (result.matched) matched += 1;
    console.log(`${result.matched ? 'Matched' : 'No match'}: ${book.title} by ${book.author}`);

    const temporaryPath = `${booksPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(books, null, 2)}\n`);
    await rename(temporaryPath, booksPath);
    await delay(375);
  } catch (error) {
    console.error(`Failed: ${book.title}: ${error.message}`);
  }
}

console.log(`Processed ${processed}, matched ${matched}, skipped ${skipped}.`);
console.log(`Metadata cache: ${booksPath}`);
