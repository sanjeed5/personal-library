# Sanjeed's Library

A small personal-library website built with Astro's official `minimal` starter and build-time content collections. It is static, JSON-backed, and ready for Cloudflare Workers static assets.

## Why this shape

- `src/data/books.json` is the canonical library.
- Astro validates every book against `src/content.config.ts`.
- Goodreads CSV is an import source, not a runtime dependency.
- Open Library enrichment happens offline and is cached in Git.
- Visitors receive static HTML, CSS, and a tiny search/filter script.
- Goodreads `Private Notes` are never imported.

## Local development

Requirements: Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run check
npm run build
npm run preview
```

## Import a Goodreads export

Export your library from Goodreads, then run:

```bash
npm run import:goodreads -- ~/Downloads/goodreads_library_export.csv --replace
npm run enrich
npm run enrich:covers
npm run check
npm run build
```

Use `--replace` for a fresh Goodreads export so books removed from Goodreads do not remain as stale manual entries. Manga and comics are excluded by default because this catalog tracks books; pass `--include-manga` only when intentionally publishing them. Omit `--replace` when you intentionally keep books added directly to `books.json`.

Preview an import without writing data:

```bash
npm run import:goodreads -- ~/Downloads/goodreads_library_export.csv --dry-run
```

The importer normalizes Goodreads ISBN formatting, shelves, ratings, dates, reviews, and page counts. Existing enrichment and visibility choices are preserved.

The metadata enrichment command queries Open Library politely, caches results in `src/data/books.json`, and skips complete entries. The cover enrichment command then fills remaining gaps from exact Goodreads IDs and validates each image before caching it. Visitors never call either service. Options:

```bash
npm run enrich -- --limit 10
npm run enrich -- --refresh
```

Always inspect `src/data/books.json` before publishing a new import. Set `visibility` to `false` for any book that should stay private.

## Data fields

Each entry needs a unique `id`, `slug`, `title`, `author`, `status`, and `visibility`. Supported statuses:

- `want-to-read`
- `currently-reading`
- `read`
- `paused`
- `dnf`

Optional fields include ISBNs, cover URL, Open Library URL, description, subjects, series, ratings, dates, pages, review, and featured status.

## Cloudflare deployment

This project is fully static and does not need the Astro Cloudflare runtime adapter.

Local Cloudflare preview:

```bash
npm run cf:preview
```

Manual deployment:

```bash
npx wrangler login
npm run cf:deploy
```

For automatic deployment, import the GitHub repository in Cloudflare Workers Builds and use:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Environment variable: `SITE_URL=https://your-library-domain.example`

The checked-in `wrangler.jsonc` publishes `dist/` and serves the generated `404.html` for missing pages.

## Sources and attribution

Book metadata and covers may come from [Open Library](https://openlibrary.org/). Open Library asks public sites using its covers to link back, which each enriched book page does.
