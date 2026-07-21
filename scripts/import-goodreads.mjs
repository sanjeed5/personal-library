#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';

const projectRoot = resolve(import.meta.dirname, '..');
const sourcePath = process.argv[2] ? resolve(process.argv[2]) : null;
const outputPath = process.env.BOOKS_FILE
  ? resolve(process.env.BOOKS_FILE)
  : resolve(projectRoot, 'src/data/books.json');
const dryRun = process.argv.includes('--dry-run');

if (!sourcePath) {
  console.error('Usage: npm run import:goodreads -- /path/to/goodreads_library_export.csv [--dry-run]');
  process.exit(1);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function cleanIsbn(value) {
  const cleaned = cleanText(value).replace(/[^0-9X]/gi, '').toUpperCase();
  return cleaned.length === 10 || cleaned.length === 13 ? cleaned : undefined;
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

function toNumber(value, { zeroIsMissing = false } = {}) {
  const parsed = Number(cleanText(value));
  if (!Number.isFinite(parsed) || (zeroIsMissing && parsed === 0)) return undefined;
  return parsed;
}

function normalizeDate(value) {
  const date = cleanText(value).replaceAll('/', '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function normalizeStatus(row) {
  const shelf = cleanText(row['Exclusive Shelf']).toLowerCase();
  if (shelf === 'read') return 'read';
  if (shelf === 'currently-reading') return 'currently-reading';
  return 'want-to-read';
}

function reviewToPlainText(value) {
  return cleanText(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== ''));
}

async function readExistingBooks() {
  try {
    return JSON.parse(await readFile(outputPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

const csv = await readFile(sourcePath, 'utf8');
const rows = parse(csv, {
  columns: true,
  bom: true,
  skip_empty_lines: true,
  relax_column_count: true,
  trim: true,
});

const existingBooks = await readExistingBooks();
const existingByKey = new Map();
for (const book of existingBooks) {
  for (const key of [book.isbn13, book.isbn10, book.id]) {
    if (key) existingByKey.set(key, book);
  }
}

const imported = [];
const seenIds = new Set();
for (const row of rows) {
  const title = cleanText(row.Title);
  const author = cleanText(row.Author);
  if (!title || !author) continue;

  const isbn13 = cleanIsbn(row.ISBN13);
  const isbn10 = cleanIsbn(row.ISBN);
  const baseId = slugify(`${title}-${author}`) || `goodreads-${cleanText(row['Book Id'])}`;
  const existing = existingByKey.get(isbn13) ?? existingByKey.get(isbn10) ?? existingByKey.get(baseId);
  const preferredId = existing?.id ?? baseId;
  let id = preferredId;
  let suffix = 2;
  while (seenIds.has(id)) id = `${preferredId}-${suffix++}`;
  seenIds.add(id);

  const book = compact({
    ...existing,
    id,
    slug: existing?.slug ?? id,
    title,
    author,
    isbn10,
    isbn13,
    status: normalizeStatus(row),
    rating: toNumber(row['My Rating'], { zeroIsMissing: true }),
    averageRating: toNumber(row['Average Rating'], { zeroIsMissing: true }),
    pages: toNumber(row['Number of Pages'], { zeroIsMissing: true }),
    publishedYear: toNumber(row['Original Publication Year'], { zeroIsMissing: true })
      ?? toNumber(row['Year Published'], { zeroIsMissing: true }),
    dateAdded: normalizeDate(row['Date Added']),
    dateRead: normalizeDate(row['Date Read']),
    review: reviewToPlainText(row['My Review']),
    visibility: existing?.visibility ?? true,
    featured: existing?.featured ?? false,
  });

  imported.push(book);
}

const importedKeys = new Set(imported.flatMap((book) => [book.isbn13, book.isbn10, book.id].filter(Boolean)));
const manualBooks = existingBooks.filter((book) => ![book.isbn13, book.isbn10, book.id].some((key) => key && importedKeys.has(key)));
const books = [...imported, ...manualBooks].sort((a, b) =>
  (b.dateAdded ?? '').localeCompare(a.dateAdded ?? '') || a.title.localeCompare(b.title),
);

if (dryRun) {
  console.log(`Would import ${imported.length} Goodreads books and preserve ${manualBooks.length} existing books.`);
  console.log(`Output: ${outputPath}`);
  process.exit(0);
}

const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(books, null, 2)}\n`);
await rename(temporaryPath, outputPath);
console.log(`Imported ${imported.length} Goodreads books.`);
console.log(`Preserved ${manualBooks.length} existing books.`);
console.log(`Wrote ${books.length} books to ${outputPath}.`);
console.log('Goodreads Private Notes were intentionally not imported.');
