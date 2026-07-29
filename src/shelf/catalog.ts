import sourceBooks from '../data/books.json';

export type BookMotif =
  | 'lattice' | 'corrosion' | 'efficiency' | 'network' | 'boom'
  | 'organization' | 'schematic' | 'flight' | 'circuit' | 'orbit'
  | 'branches' | 'wave' | 'runner' | 'gather' | 'maze' | 'fracture'
  | 'continuum' | 'windows' | 'steps';

export type ReadingStatus = 'want-to-read' | 'currently-reading' | 'read' | 'paused' | 'dnf';

export type CatalogBook = {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  author: string;
  description: string;
  quote: string;
  quoteBy: string;
  series?: string;
  seriesPosition?: number;
  status: ReadingStatus;
  rating?: number;
  pages?: number;
  publishedYear?: number;
  coverImage?: string;
  searchText: string;
  cover: string;
  accent: string;
  ink: string;
  motif: BookMotif;
  height: number;
  thickness: number;
  living?: boolean;
};

type SourceBook = (typeof sourceBooks)[number];

const motifs: BookMotif[] = [
  'lattice', 'corrosion', 'efficiency', 'network', 'boom', 'organization',
  'schematic', 'flight', 'circuit', 'orbit', 'branches', 'wave', 'runner',
  'gather', 'maze', 'fracture', 'continuum', 'windows', 'steps',
];

const palettes = [
  ['#6f2130', '#d5a756', '#f4ead7'],
  ['#4d746d', '#c8865f', '#f0e5cf'],
  ['#162c55', '#9eb4e8', '#f1eee5'],
  ['#d36e5d', '#172f49', '#f8ecdc'],
  ['#626a49', '#b9c28e', '#eee5cf'],
  ['#25282a', '#d36a58', '#eee4ce'],
  ['#4c3970', '#9ad3bf', '#f3ecdb'],
  ['#1d4f88', '#d6df45', '#f3efe3'],
  ['#bd5a34', '#252321', '#f0e5cf'],
  ['#365943', '#c7a45e', '#eee7d6'],
  ['#70485e', '#e3b869', '#f5eedf'],
  ['#304b61', '#d28a54', '#f1e7d4'],
] as const;

function hash(value: string) {
  let result = 2166136261;
  for (const char of value) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function shortTitle(title: string) {
  if (title.length <= 34) return title;
  const beforeSubtitle = title.split(/[:(]/)[0].trim();
  return beforeSubtitle.length >= 8 && beforeSubtitle.length <= 34
    ? beforeSubtitle
    : `${title.slice(0, 31).trim()}…`;
}

function statusLabelsForCover(status: string) {
  return ({
    'want-to-read': 'Waiting patiently on the shelf.',
    'currently-reading': 'Currently open and in progress.',
    read: 'Read and kept close.',
    paused: 'Paused for another season.',
    dnf: 'Set down before the final page.',
  } as Record<string, string>)[status] ?? 'Part of Sanjeed’s personal library.';
}

function cleanDescription(description?: string) {
  if (!description) return undefined;
  return description
    .replace(/\[[^\]]*PDF[^\]]*\]\([^)]+\)/gi, '')
    .replace(/\(https?:\/\/[^)]+\)/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapBook(book: SourceBook): CatalogBook {
  const seed = hash(book.slug);
  const palette = palettes[seed % palettes.length];
  const searchText = [
    book.title,
    book.author,
    ...(book.additionalAuthors ?? []),
    book.series,
    book.publisher,
    ...(book.shelves ?? []),
    ...(book.subjects ?? []),
  ].filter(Boolean).join(' ').toLowerCase();

  return {
    id: book.slug,
    slug: book.slug,
    title: book.title,
    shortTitle: shortTitle(book.title),
    author: book.author,
    description: cleanDescription(book.description) ?? `${book.title} by ${book.author}.`,
    quote: book.review?.slice(0, 180) ?? statusLabelsForCover(book.status),
    quoteBy: book.review ? "Sanjeed's note" : "Shelf note",
    series: book.series,
    seriesPosition: book.seriesPosition,
    status: book.status as ReadingStatus,
    rating: book.rating,
    pages: book.pages,
    publishedYear: book.publishedYear,
    coverImage: book.coverUrl,
    searchText,
    cover: palette[0],
    accent: palette[1],
    ink: palette[2],
    motif: motifs[seed % motifs.length],
    height: 1.91 + ((seed >>> 4) % 30) / 100,
    thickness: 0.16 + ((seed >>> 9) % 13) / 100,
    living: book.status === 'currently-reading',
  };
}

export const catalog: CatalogBook[] = (sourceBooks as SourceBook[])
  .filter((book) => book.visibility !== false)
  .sort((left, right) => Number(right.featured) - Number(left.featured)
    || (right.dateAdded ?? '').localeCompare(left.dateAdded ?? '')
    || left.title.localeCompare(right.title))
  .map(mapBook);
