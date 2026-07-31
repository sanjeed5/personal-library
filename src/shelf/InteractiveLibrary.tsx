import '@fontsource-variable/inter';
import '@fontsource-variable/newsreader';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { catalog, type CatalogBook, type ReadingStatus } from './catalog';
import { ShelfEngine, type ShelfMode } from './ShelfEngine';
import { siteConfig } from './site-config';
import './shelf.css';

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '');

const statusLabels: Record<ReadingStatus, string> = {
  'want-to-read': 'Want to read',
  'currently-reading': 'Currently reading',
  read: 'Read',
  paused: 'Paused',
  dnf: 'Did not finish',
};

type Filter = 'all' | ReadingStatus;

function ArrowIcon({ direction }: { direction: 'left' | 'right' }) {
  return <span aria-hidden="true" className={`arrow-icon arrow-icon--${direction}`}><span /></span>;
}

function BookResult({ book, onChoose }: { book: CatalogBook; onChoose: () => void }) {
  return (
    <button type="button" className="catalog-card" onClick={onChoose}>
      <span className="catalog-card__cover" style={{ background: book.cover }}>
        {book.coverImage ? <img src={book.coverImage} alt="" loading="lazy" /> : null}
      </span>
      <span className="catalog-card__copy">
        <strong>{book.title}</strong>
        <span>{book.author}</span>
        <small>{statusLabels[book.status]}{book.rating ? ` · ★ ${book.rating}` : ''}</small>
      </span>
    </button>
  );
}

export default function InteractiveLibrary() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeDetailsRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const engineRef = useRef<ShelfEngine | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<ShelfMode>('browse');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Preparing your library');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [spreadOpen, setSpreadOpen] = useState(false);

  const activeBook = catalog[activeIndex];
  const selectedBook = selectedIndex === null ? null : catalog[selectedIndex];
  const isFocused = mode !== 'browse';

  const filteredIndexes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.flatMap((book, index) => {
      const matchesFilter = filter === 'all' || book.status === filter;
      const matchesQuery = !normalized || book.searchText.includes(normalized);
      return matchesFilter && matchesQuery ? [index] : [];
    });
  }, [query, filter]);

  const counts = useMemo(() => ({
    all: catalog.length,
    'currently-reading': catalog.filter((book) => book.status === 'currently-reading').length,
    'want-to-read': catalog.filter((book) => book.status === 'want-to-read').length,
    read: catalog.filter((book) => book.status === 'read').length,
  }), []);

  useEffect(() => {
    let cancelled = false;
    let engine: ShelfEngine | null = null;

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
          onReady: () => flushSync(() => setReady(true)),
        });
        engineRef.current = engine;
      } catch {
        setStatus('3D shelf unavailable. Browse the catalog instead.');
        setCatalogOpen(true);
        setReady(true);
      }
    }

    void start();
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

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
    if (mode !== 'inspect') {
      setSpreadOpen(false);
      return;
    }

    setSpreadOpen(false);
    const openFrame = requestAnimationFrame(() => {
      setSpreadOpen(true);
      requestAnimationFrame(() => closeDetailsRef.current?.focus({ preventScroll: true }));
    });
    return () => cancelAnimationFrame(openFrame);
  }, [mode, selectedIndex]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeBook();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isFocused, spreadOpen]);

  function closeBook() {
    if (!isFocused || closeTimerRef.current !== null) return;
    setSpreadOpen(false);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      engineRef.current?.returnToShelf();
      canvasRef.current?.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 240);
  }

  function chooseBook(index: number, inspect = true) {
    setCatalogOpen(false);
    setQuery('');
    if (inspect) engineRef.current?.focusBook(index);
    else engineRef.current?.browseTo(index);
    canvasRef.current?.focus({ preventScroll: true });
  }

  function browseFiltered(direction: number) {
    if (filteredIndexes.length === 0) return;
    const currentPosition = filteredIndexes.indexOf(activeIndex);
    const base = currentPosition >= 0 ? currentPosition : (direction > 0 ? -1 : filteredIndexes.length);
    const nextPosition = Math.max(0, Math.min(filteredIndexes.length - 1, base + direction));
    engineRef.current?.browseTo(filteredIndexes[nextPosition]);
  }

  return (
    <main className={`press-experience ${ready ? 'is-ready' : ''} ${isFocused ? 'is-focused' : 'is-browsing'} ${spreadOpen ? 'is-spread-open' : ''} ${catalogOpen ? 'has-catalog-open' : ''}`}>
      <canvas
        ref={canvasRef}
        className="shelf-canvas"
        data-testid="shelf-canvas"
        role="application"
        tabIndex={0}
        aria-label={`Interactive three-dimensional shelf of ${catalog.length} books. Drag, scroll, or use arrow keys to browse. Click a book or press Enter to open its details.`}
      />

      <header className="shelf-header">
        <a className="shelf-wordmark" href={`${baseUrl}/`} aria-label="Sanjeed's Library home">
          <span>{siteConfig.wordmark}</span>
          <span className="wordmark__divider" />
          <span>{siteConfig.collectionName}</span>
        </a>
        <div className="header-actions">
          <div className="edition-mark"><span>{catalog.length} VOLUMES</span><span>01 CONTINUOUS SHELF</span></div>
          <button type="button" className="catalog-toggle" onClick={() => setCatalogOpen((open) => !open)} aria-expanded={catalogOpen}>
            {catalogOpen ? 'Close catalog' : 'Browse catalog'}
          </button>
        </div>
      </header>

      <section className="shelf-tools" aria-label="Search and filter library">
        <label className="shelf-search">
          <span className="sr-only">Search by title, author, or series</span>
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setCatalogOpen(Boolean(event.target.value)); }}
            onFocus={() => query && setCatalogOpen(true)}
            placeholder="Search this shelf"
            autoComplete="off"
          />
          {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search">×</button> : <kbd>/</kbd>}
        </label>
        <div className="shelf-filters" aria-label="Filter by reading status">
          {([
            ['all', `All ${counts.all}`],
            ['currently-reading', `Reading ${counts['currently-reading']}`],
            ['want-to-read', `Want ${counts['want-to-read']}`],
            ['read', `Read ${counts.read}`],
          ] as Array<[Filter, string]>).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); if (value !== 'all') setCatalogOpen(true); }}>{label}</button>
          ))}
        </div>
      </section>

      <section className="browse-caption" aria-hidden={isFocused} data-testid="browse-caption">
        <p className="eyebrow"><span>{String(activeIndex + 1).padStart(3, '0')}</span><span className="eyebrow__line" /><span>{String(catalog.length).padStart(3, '0')}</span></p>
        <p className="book-status-label">{statusLabels[activeBook.status]}{activeBook.rating ? ` · ★ ${activeBook.rating}` : ''}</p>
        <h1>{activeBook.shortTitle}</h1>
        <p className="browse-caption__author">{activeBook.author}</p>
      </section>

      <button type="button" className="shelf-arrow shelf-arrow--left" data-testid="browse-previous" aria-label="Previous matching book" disabled={isFocused || filteredIndexes.length === 0} onClick={() => browseFiltered(-1)}><ArrowIcon direction="left" /></button>
      <button type="button" className="shelf-arrow shelf-arrow--right" data-testid="browse-next" aria-label="Next matching book" disabled={isFocused || filteredIndexes.length === 0} onClick={() => browseFiltered(1)}><ArrowIcon direction="right" /></button>

      <nav className="shelf-index" aria-label="Catalog position">
        <label className="shelf-scrubber">
          <span className="sr-only">Shelf position</span>
          <input type="range" min="0" max={catalog.length - 1} value={activeIndex} disabled={isFocused} onChange={(event) => engineRef.current?.browseTo(Number(event.target.value))} />
        </label>
        <div className="input-hint" aria-hidden="true"><span>CLICK FOR DETAILS</span><i /><span>DRAG TO BROWSE</span><i /><span>SCROLL</span></div>
      </nav>

      <aside className="book-details" aria-hidden={!isFocused} aria-label={selectedBook ? `Open book details for ${selectedBook.title}` : 'Book details'} data-testid="book-details">
        {selectedBook ? <div className="open-book-frame">
          <div className="book-details__toolbar">
            <button ref={closeDetailsRef} type="button" className="details-close" data-testid="return-to-shelf" onClick={closeBook}><span aria-hidden="true">×</span><span>Close book</span></button>
            <div className="book-details__position"><span>{String(selectedIndex! + 1).padStart(3, '0')}</span><span>{String(catalog.length).padStart(3, '0')}</span></div>
          </div>
          <article className="open-book" style={{ '--book-cloth': selectedBook.cover, '--book-accent': selectedBook.accent } as React.CSSProperties}>
            <section className="open-book__page open-book__page--left" aria-label="Book identity">
              <div className="open-book__page-content">
                <div className="open-book__page-number">{String(selectedIndex! + 1).padStart(3, '0')}</div>
                <p className="eyebrow">{statusLabels[selectedBook.status]}</p>
                <div className="open-book__identity">
                  <div className="open-book__cover" style={{ background: selectedBook.cover }}>
                    {selectedBook.coverImage ? <img src={selectedBook.coverImage} alt="" loading="lazy" /> : <span>{selectedBook.shortTitle}</span>}
                  </div>
                  <div>
                    <h2>{selectedBook.title}</h2>
                    <p className="book-details__author">{selectedBook.author}</p>
                    {selectedBook.series ? <p className="book-details__series">{selectedBook.series}{selectedBook.seriesPosition ? `, book ${selectedBook.seriesPosition}` : ''}</p> : null}
                  </div>
                </div>
                <dl>
                  {selectedBook.rating ? <div><dt>My rating</dt><dd>★ {selectedBook.rating} / 5</dd></div> : null}
                  {selectedBook.pages ? <div><dt>Length</dt><dd>{selectedBook.pages} pages</dd></div> : null}
                  {selectedBook.publishedYear ? <div><dt>Published</dt><dd>{selectedBook.publishedYear}</dd></div> : null}
                </dl>
              </div>
            </section>
            <div className="open-book__gutter" aria-hidden="true" />
            <section className="open-book__page open-book__page--right" aria-label="Book description and notes">
              <div className="open-book__page-content open-book__page-content--right">
                <div className="open-book__page-number">{String(selectedIndex! + 2).padStart(3, '0')}</div>
                <p className="open-book__chapter">About this book</p>
                <p className="book-details__description">{selectedBook.description}</p>
                {selectedBook.quote ? <blockquote><p>{selectedBook.quote}</p><cite>{selectedBook.quoteBy}</cite></blockquote> : null}
                <a className="official-link" data-testid="official-link" href={`${baseUrl}/books/${selectedBook.slug}/`}><span>Open full details</span><span aria-hidden="true">↗</span></a>
              </div>
            </section>
          </article>
        </div> : null}
      </aside>

      <aside className="catalog-drawer" aria-hidden={!catalogOpen} aria-label="Library catalog">
        <div className="catalog-drawer__header">
          <div><p className="eyebrow">Catalog</p><h2>{filteredIndexes.length} {filteredIndexes.length === 1 ? 'book' : 'books'}</h2></div>
          <button type="button" onClick={() => setCatalogOpen(false)} aria-label="Close catalog">×</button>
        </div>
        <div className="catalog-grid">
          {filteredIndexes.map((index) => <BookResult key={catalog[index].id} book={catalog[index]} onChoose={() => chooseBook(index)} />)}
          {filteredIndexes.length === 0 ? <p className="catalog-empty">No books match that search.</p> : null}
        </div>
      </aside>

      <div className="experience-status" role="status" aria-live="polite"><span className="experience-status__dot" /><span>{status}</span></div>
      <div className="loading-screen" aria-hidden={ready}><div className="loading-screen__mark"><span /><span /><span /></div><p>Opening the shelf</p></div>
      <p className="independent-note">{siteConfig.independentNote}</p>
      <div className="sr-only" aria-live="polite">{isFocused && selectedBook ? `${selectedBook.title} by ${selectedBook.author} is open to its details spread.` : `Selected ${activeBook.title} by ${activeBook.author}.`}</div>
    </main>
  );
}
