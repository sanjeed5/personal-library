import '@fontsource-variable/inter';
import '@fontsource-variable/newsreader';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject, type WheelEvent } from 'react';
import { flushSync } from 'react-dom';
import { catalog, type CatalogBook, type ReadingStatus } from './catalog';
import { ShelfEngine, type ShelfMode } from './ShelfEngine';
import { siteConfig } from './site-config';
import './shelf.css';

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');
const VIEW_KEY = 'sanjeed-library-view';

const statusLabels: Record<ReadingStatus, string> = {
  'want-to-read': 'Want to read',
  'currently-reading': 'Currently reading',
  read: 'Read',
  paused: 'Paused',
  dnf: 'Did not finish',
};

type Filter = 'all' | ReadingStatus;
type ViewMode = 'grid' | 'shelf';
type SortMode = 'recent' | 'title' | 'author';

function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return <span aria-hidden="true" className={`arrow-icon arrow-icon--${direction}`}><span /></span>;
}

function CoverTile({
  book,
  selected,
  onChoose,
}: {
  book: CatalogBook;
  selected: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      className={`cover-tile${selected ? ' is-selected' : ''}${book.living ? ' is-living' : ''}`}
      onClick={onChoose}
      aria-pressed={selected}
      title={`${book.title} — ${book.author}`}
    >
      <span className="cover-tile__frame" style={{ background: book.cover }}>
        {book.coverImage ? (
          <img src={book.coverImage} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="cover-tile__fallback">{book.shortTitle}</span>
        )}
      </span>
      <span className="cover-tile__meta">
        <strong>{book.shortTitle}</strong>
        <span>{book.author}</span>
        <small>
          {statusLabels[book.status]}
          {book.rating ? ` · ★ ${book.rating}` : ''}
        </small>
      </span>
    </button>
  );
}

function BookDetailsPanel({
  book,
  index,
  total,
  onClose,
  onWheelPage,
  closeRef,
}: {
  book: CatalogBook;
  index: number;
  total: number;
  onClose: () => void;
  onWheelPage: (event: WheelEvent<HTMLDivElement>) => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <aside className="book-details" aria-hidden={false} aria-label={`Open book details for ${book.title}`} data-testid="book-details">
      <div className="open-book-frame">
        <div className="book-details__toolbar">
          <button ref={closeRef} type="button" className="details-close" data-testid="return-to-shelf" onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span>Close book</span>
          </button>
          <div className="book-details__position">
            <span>{String(index + 1).padStart(3, '0')}</span>
            <span>{String(total).padStart(3, '0')}</span>
          </div>
        </div>
        <article className="open-book" style={{ '--book-cloth': book.cover, '--book-accent': book.accent } as CSSProperties}>
          <section className="open-book__page open-book__page--left" aria-label="Book identity">
            <div className="open-book__page-content" onWheel={onWheelPage}>
              <div className="open-book__page-number">{String(index + 1).padStart(3, '0')}</div>
              <p className="eyebrow">{statusLabels[book.status]}</p>
              <div className="open-book__identity">
                <div className="open-book__cover" style={{ background: book.cover }}>
                  {book.coverImage ? <img src={book.coverImage} alt="" loading="lazy" /> : <span>{book.shortTitle}</span>}
                </div>
                <div>
                  <h2>{book.title}</h2>
                  <p className="book-details__author">{book.author}</p>
                  {book.series ? (
                    <p className="book-details__series">
                      {book.series}
                      {book.seriesPosition ? `, book ${book.seriesPosition}` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
              <dl>
                {book.rating ? (
                  <div>
                    <dt>My rating</dt>
                    <dd>★ {book.rating} / 5</dd>
                  </div>
                ) : null}
                {book.pages ? (
                  <div>
                    <dt>Length</dt>
                    <dd>{book.pages} pages</dd>
                  </div>
                ) : null}
                {book.publishedYear ? (
                  <div>
                    <dt>Published</dt>
                    <dd>{book.publishedYear}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </section>
          <div className="open-book__gutter" aria-hidden="true" />
          <section className="open-book__page open-book__page--right" aria-label="Book description and notes">
            <div className="open-book__page-content open-book__page-content--right" onWheel={onWheelPage}>
              <div className="open-book__page-number">{String(index + 2).padStart(3, '0')}</div>
              <p className="open-book__chapter">About this book</p>
              <p className="book-details__description">{book.description}</p>
              {book.quote ? (
                <blockquote>
                  <p>{book.quote}</p>
                  <cite>{book.quoteBy}</cite>
                </blockquote>
              ) : null}
              <a className="official-link" data-testid="official-link" href={`${baseUrl}/books/${book.slug}/`}>
                <span>Open full details</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </section>
        </article>
      </div>
    </aside>
  );
}

function readStoredView(): ViewMode {
  try {
    const value = window.localStorage.getItem(VIEW_KEY);
    return value === 'shelf' ? 'shelf' : 'grid';
  } catch {
    return 'grid';
  }
}

export default function InteractiveLibrary() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeDetailsRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const coverPreloadsRef = useRef(new Map<string, HTMLImageElement>());
  const engineRef = useRef<ShelfEngine | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<ShelfMode>('browse');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Preparing your library');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortMode>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [spreadOpen, setSpreadOpen] = useState(false);
  const [shelfBooted, setShelfBooted] = useState(false);

  const activeBook = catalog[activeIndex] ?? catalog[0];
  const selectedBook = selectedIndex === null ? null : catalog[selectedIndex];
  const isFocused = selectedIndex !== null && (viewMode === 'grid' || mode !== 'browse');

  useEffect(() => {
    setViewMode(readStoredView());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, viewMode);
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.libraryView = viewMode;
  }, [viewMode]);

  useEffect(() => {
    const coverImage = activeBook?.coverImage;
    if (!coverImage || coverPreloadsRef.current.has(coverImage)) return;
    const preloadTimer = window.setTimeout(() => {
      const image = new Image();
      image.decoding = 'async';
      image.src = coverImage;
      coverPreloadsRef.current.set(coverImage, image);
    }, 80);
    return () => window.clearTimeout(preloadTimer);
  }, [activeBook?.coverImage]);

  const filteredIndexes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matched = catalog.flatMap((book, index) => {
      const matchesFilter = filter === 'all' || book.status === filter;
      const matchesQuery = !normalized || book.searchText.includes(normalized);
      return matchesFilter && matchesQuery ? [index] : [];
    });

    if (sort === 'recent') return matched;

    return [...matched].sort((left, right) => {
      const a = catalog[left];
      const b = catalog[right];
      if (sort === 'author') {
        return a.author.localeCompare(b.author) || a.title.localeCompare(b.title);
      }
      return a.title.localeCompare(b.title) || a.author.localeCompare(b.author);
    });
  }, [query, filter, sort]);

  const counts = useMemo(
    () => ({
      all: catalog.length,
      'currently-reading': catalog.filter((book) => book.status === 'currently-reading').length,
      'want-to-read': catalog.filter((book) => book.status === 'want-to-read').length,
      read: catalog.filter((book) => book.status === 'read').length,
    }),
    [],
  );

  useEffect(() => {
    if (viewMode !== 'shelf') {
      engineRef.current?.dispose();
      engineRef.current = null;
      setShelfBooted(false);
      setReady(true);
      setStatus(`${catalog.length} books · dense grid`);
      setMode('browse');
      return;
    }

    let cancelled = false;
    let engine: ShelfEngine | null = null;
    setReady(false);
    setStatus('Opening the 3D shelf');

    async function start() {
      if (!canvasRef.current) return;
      await document.fonts.ready;
      if (cancelled || !canvasRef.current) return;
      try {
        engine = new ShelfEngine(canvasRef.current, catalog, {
          onActiveIndex: setActiveIndex,
          onMode: (nextMode, index) => {
            setMode(nextMode);
            setSelectedIndex(index);
          },
          onStatus: setStatus,
          onReady: () => flushSync(() => {
            setReady(true);
            setShelfBooted(true);
          }),
        });
        engineRef.current = engine;
        if (selectedIndex !== null) engine.browseTo(selectedIndex);
      } catch {
        setStatus('3D shelf unavailable. Staying on the grid.');
        setViewMode('grid');
        setReady(true);
      }
    }

    void start();
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
    // selectedIndex intentionally omitted — only boot when entering shelf mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      document.querySelector<HTMLInputElement>('.shelf-search input')?.focus();
    };
    document.addEventListener('keydown', focusSearch);
    return () => document.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => {
    if (!isFocused) {
      setSpreadOpen(false);
      return;
    }
    setSpreadOpen(false);
    const openFrame = requestAnimationFrame(() => {
      setSpreadOpen(true);
      requestAnimationFrame(() => closeDetailsRef.current?.focus({ preventScroll: true }));
    });
    return () => cancelAnimationFrame(openFrame);
  }, [isFocused, selectedIndex]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!isFocused) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeBook();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isFocused, spreadOpen, viewMode]);

  function closeBook() {
    if (!isFocused || closeTimerRef.current !== null) return;
    setSpreadOpen(false);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (viewMode === 'shelf') {
        engineRef.current?.returnToShelf();
        canvasRef.current?.focus({ preventScroll: true });
      } else {
        setSelectedIndex(null);
        setMode('browse');
      }
    }, reduceMotion ? 0 : 240);
  }

  function chooseBook(index: number, inspect = true) {
    setActiveIndex(index);
    if (viewMode === 'shelf') {
      if (inspect) engineRef.current?.focusBook(index);
      else engineRef.current?.browseTo(index);
      canvasRef.current?.focus({ preventScroll: true });
      return;
    }
    setSelectedIndex(index);
    setMode(inspect ? 'inspect' : 'browse');
  }

  function browseFiltered(direction: number) {
    if (filteredIndexes.length === 0) return;
    const currentPosition = filteredIndexes.indexOf(activeIndex);
    const base = currentPosition >= 0 ? currentPosition : direction > 0 ? -1 : filteredIndexes.length;
    const nextPosition = Math.max(0, Math.min(filteredIndexes.length - 1, base + direction));
    const nextIndex = filteredIndexes[nextPosition];
    if (viewMode === 'shelf') engineRef.current?.browseTo(nextIndex);
    else {
      setActiveIndex(nextIndex);
      if (selectedIndex !== null) setSelectedIndex(nextIndex);
    }
  }

  function scrollBookPage(event: WheelEvent<HTMLDivElement>) {
    const page = event.currentTarget;
    const currentScrollTop = page.scrollTop;
    const nextScrollTop = Math.max(
      0,
      Math.min(page.scrollHeight - page.clientHeight, currentScrollTop + event.deltaY),
    );
    event.stopPropagation();
    if (nextScrollTop === currentScrollTop) return;
    requestAnimationFrame(() => {
      if (page.scrollTop === currentScrollTop) page.scrollTop = nextScrollTop;
    });
  }

  const rootClass = [
    'press-experience',
    ready ? 'is-ready' : '',
    isFocused ? 'is-focused' : 'is-browsing',
    spreadOpen ? 'is-spread-open' : '',
    viewMode === 'grid' ? 'is-grid-view' : 'is-shelf-view',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <main className={rootClass}>
      {viewMode === 'shelf' ? (
        <canvas
          ref={canvasRef}
          className="shelf-canvas"
          data-testid="shelf-canvas"
          role="application"
          tabIndex={0}
          aria-label={`Interactive three-dimensional shelf of ${catalog.length} books. Drag, scroll, or use arrow keys to browse. Click a book or press Enter to open its details.`}
        />
      ) : null}

      <header className="shelf-header">
        <a className="shelf-wordmark" href={`${baseUrl}/`} aria-label="Sanjeed's Library home">
          <span>{siteConfig.wordmark}</span>
          <span className="wordmark__divider" />
          <span>{viewMode === 'grid' ? 'COVER GRID' : siteConfig.collectionName}</span>
        </a>
        <div className="header-actions">
          <div className="edition-mark">
            <span>{catalog.length} VOLUMES</span>
            <span>{viewMode === 'grid' ? 'DENSE BROWSE' : '01 CONTINUOUS SHELF'}</span>
          </div>
          <div className="view-toggle" role="group" aria-label="Library view">
            <button type="button" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
              Grid
            </button>
            <button type="button" aria-pressed={viewMode === 'shelf'} onClick={() => setViewMode('shelf')}>
              3D shelf
            </button>
          </div>
        </div>
      </header>

      <section className="shelf-tools" aria-label="Search and filter library">
        <label className="shelf-search">
          <span className="sr-only">Search by title, author, or series</span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, author, series"
            autoComplete="off"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
              ×
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </label>
        <div className="shelf-filters" aria-label="Filter by reading status">
          {(
            [
              ['all', `All ${counts.all}`],
              ['currently-reading', `Reading ${counts['currently-reading']}`],
              ['want-to-read', `Want ${counts['want-to-read']}`],
              ['read', `Read ${counts.read}`],
            ] as Array<[Filter, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {viewMode === 'grid' ? (
          <div className="shelf-sort" aria-label="Sort books">
            {(
              [
                ['recent', 'Recent'],
                ['title', 'Title'],
                ['author', 'Author'],
              ] as Array<[SortMode, string]>
            ).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>
                {label}
              </button>
            ))}
            <span className="shelf-sort__count">
              {filteredIndexes.length} shown
            </span>
          </div>
        ) : null}
      </section>

      {viewMode === 'grid' ? (
        <section className="cover-grid-panel" aria-label="Library cover grid">
          <div className="cover-grid">
            {filteredIndexes.map((index) => (
              <CoverTile
                key={catalog[index].id}
                book={catalog[index]}
                selected={selectedIndex === index}
                onChoose={() => chooseBook(index)}
              />
            ))}
            {filteredIndexes.length === 0 ? <p className="catalog-empty">No books match that search.</p> : null}
          </div>
        </section>
      ) : (
        <>
          <section className="browse-caption" aria-hidden={isFocused} data-testid="browse-caption">
            <p className="eyebrow">
              <span>{String(activeIndex + 1).padStart(3, '0')}</span>
              <span className="eyebrow__line" />
              <span>{String(catalog.length).padStart(3, '0')}</span>
            </p>
            <p className="book-status-label">
              {statusLabels[activeBook.status]}
              {activeBook.rating ? ` · ★ ${activeBook.rating}` : ''}
            </p>
            <h1>{activeBook.shortTitle}</h1>
            <p className="browse-caption__author">{activeBook.author}</p>
          </section>

          <button
            type="button"
            className="shelf-arrow shelf-arrow--left"
            data-testid="browse-previous"
            aria-label="Previous matching book"
            disabled={isFocused || filteredIndexes.length === 0}
            onClick={() => browseFiltered(-1)}
          >
            <ArrowIcon direction="left" />
          </button>
          <button
            type="button"
            className="shelf-arrow shelf-arrow--right"
            data-testid="browse-next"
            aria-label="Next matching book"
            disabled={isFocused || filteredIndexes.length === 0}
            onClick={() => browseFiltered(1)}
          >
            <ArrowIcon direction="right" />
          </button>

          <nav className="shelf-index" aria-label="Catalog position">
            <label className="shelf-scrubber">
              <span className="sr-only">Shelf position</span>
              <input
                type="range"
                min="0"
                max={catalog.length - 1}
                value={activeIndex}
                disabled={isFocused}
                onChange={(event) => engineRef.current?.browseTo(Number(event.target.value))}
              />
            </label>
            <div className="input-hint" aria-hidden="true">
              <span>CLICK FOR DETAILS</span>
              <i />
              <span>DRAG TO BROWSE</span>
              <i />
              <span>SCROLL</span>
            </div>
          </nav>
        </>
      )}

      {selectedBook && isFocused ? (
        <BookDetailsPanel
          book={selectedBook}
          index={selectedIndex!}
          total={catalog.length}
          onClose={closeBook}
          onWheelPage={scrollBookPage}
          closeRef={closeDetailsRef}
        />
      ) : null}

      {viewMode === 'shelf' ? (
        <div className="experience-status" role="status" aria-live="polite">
          <span className="experience-status__dot" />
          <span>{status}</span>
        </div>
      ) : null}
      {viewMode === 'shelf' && !shelfBooted ? (
        <div className="loading-screen" aria-hidden={ready}>
          <div className="loading-screen__mark">
            <span />
            <span />
            <span />
          </div>
          <p>Opening the shelf</p>
        </div>
      ) : null}
      <p className="independent-note">
        {viewMode === 'grid'
          ? 'Scroll the grid, filter by status, or switch to the 3D shelf.'
          : siteConfig.independentNote}
      </p>
      <div className="sr-only" aria-live="polite">
        {isFocused && selectedBook
          ? `${selectedBook.title} by ${selectedBook.author} is open to its details spread.`
          : `Selected ${activeBook.title} by ${activeBook.author}.`}
      </div>
    </main>
  );
}
