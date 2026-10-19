/**
 * @file canvas-page.tsx
 * @description P1508: Clarity Canvas — an owner's canvas at `/canvas/:handle/:projectTag`.
 *
 * There is no canvas record: a canvas is derived from owner + project tag. Its contents are the
 * owner's current-version points that carry the project tag (a user tag) and a box tag (a system
 * tag), placed into twelve boxes — the lean canvas's nine and three ikigai boxes.
 *
 * Read-only on screen (owners change their canvas through their agent, a follow-up spec). Each
 * box shows the production point card in its compact form; opening one shows the full card with
 * its stories in a side panel (desktop) or a full-screen sheet (mobile).
 *
 * VISIBILITY: the owner sees their private points; anyone else, public ones only (enforced in the
 * read and by RLS). Everything on screen is keyed by the viewer, so signing out or switching
 * account drops private points, stories and the open panel in the same render.
 *
 * Browse page (src.md): no back button; BottomNav shows on mobile.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/auth';
import { getProfileBySlugResult } from '@/app/data/api';
import { pointsService } from '@/app/data/points-service';
import { storiesService } from '@/app/data/stories-service';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { SEO } from '@/app/components/seo';
import { NotFoundPage } from '@/app/pages/not-found-page';
import { CANVAS_BOXES, groupPointsByBox, normalizeProjectTag, type CanvasBoxTag } from '@/lib/canvas-boxes';
import type { PointWithUserPosition, StoryWithAuthor } from '@/app/types';

/** Desktop placement: the standard lean-canvas shape on a 10-column, 3-row grid. */
const LEAN_PLACEMENT: Record<string, string> = {
  'canvas:problem': 'lg:col-start-1 lg:col-span-2 lg:row-start-1 lg:row-span-2',
  'canvas:solution': 'lg:col-start-3 lg:col-span-2 lg:row-start-1',
  'canvas:metrics': 'lg:col-start-3 lg:col-span-2 lg:row-start-2',
  'canvas:uvp': 'lg:col-start-5 lg:col-span-2 lg:row-start-1 lg:row-span-2',
  'canvas:advantage': 'lg:col-start-7 lg:col-span-2 lg:row-start-1',
  'canvas:channels': 'lg:col-start-7 lg:col-span-2 lg:row-start-2',
  'canvas:segments': 'lg:col-start-9 lg:col-span-2 lg:row-start-1 lg:row-span-2',
  'canvas:cost': 'lg:col-start-1 lg:col-span-5 lg:row-start-3',
  'canvas:revenue': 'lg:col-start-6 lg:col-span-5 lg:row-start-3',
};
const IKIGAI_TAGS: ReadonlySet<string> = new Set(['canvas:love', 'canvas:good-at', 'canvas:world-needs']);
const LEAN_BOXES = CANVAS_BOXES.filter(b => !IKIGAI_TAGS.has(b.tag));
const IKIGAI_BOXES = CANVAS_BOXES.filter(b => IKIGAI_TAGS.has(b.tag));

type CanvasData =
  | { status: 'ready'; ownerName: string; points: PointWithUserPosition[]; stories: Map<string, StoryWithAuthor[]> }
  | { status: 'not-found' }
  | { status: 'error' };

/** What is on screen, and which viewer + address it was read FOR. */
interface Loaded {
  key: string;
  data: CanvasData;
}

/** Remount a card when the viewer's position on it changes, so its local vote state never
 *  outlives a refreshed row (the box card and the panel card are separate instances).
 *  `generation` remounts the box cards after the panel closes: a signed-out vote lives only in
 *  the browser, so no refreshed row carries it — a fresh mount reads it back. */
function cardKey(point: PointWithUserPosition, generation = 0): string {
  return `${point.id}:${point.userPosition?.position ?? ''}:${point.userPosition?.updatedAt ?? ''}:${generation}`;
}

export function CanvasPage() {
  const { handle, projectTag: rawTag } = useParams<{ handle: string; projectTag: string }>();
  const projectTag = normalizeProjectTag(rawTag);
  const { session, sessionChecked } = useAuth();
  const viewerId = session?.user?.id;
  const key = `${viewerId ?? ''}|${handle ?? ''}|${projectTag ?? ''}`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The open point lives in the address (`?point=`), so Back from a story or point page reopens
  // it. It opens only if it is one of the points THIS viewer's read returned.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPointId = searchParams.get('point');
  const [panelCloses, setPanelCloses] = useState(0);
  const requestRef = useRef(0);

  /** `refresh`: a re-read of what is already on screen (panel open/close, a withdrawn
   *  position). Its failure keeps the rows already shown instead of replacing the grid. */
  const read = useCallback(async (forKey: string, refresh = false) => {
    const rid = ++requestRef.current;
    const settle = (data: CanvasData) => {
      if (rid !== requestRef.current) return;
      if (refresh && data.status !== 'ready') return;
      setLoaded({ key: forKey, data });
    };
    if (!handle || !projectTag) return settle({ status: 'not-found' });
    try {
      const owner = await getProfileBySlugResult(handle);
      if (!owner.success) return settle({ status: owner.error === 'not_found' ? 'not-found' : 'error' });
      const points = await pointsService.getCanvasPoints(owner.data.id, projectTag, viewerId);
      if (points.length === 0) return settle({ status: 'not-found' });
      const stories = await storiesService.getStoriesForPoints(points.map(p => p.id), undefined, { strict: true });
      settle({ status: 'ready', ownerName: owner.data.name, points, stories });
    } catch {
      settle({ status: 'error' });
    }
  }, [handle, projectTag, viewerId]);

  // Wait for the session check: reading before it would show the owner the public canvas first.
  useEffect(() => {
    if (!sessionChecked) return;
    void read(key);
  }, [sessionChecked, key, read]);

  // Anything read for another viewer or address is not shown — not even for one render.
  const current = loaded && loaded.key === key ? loaded.data : null;
  const ready = current?.status === 'ready' ? current : null;
  const openPoint = ready && requestedPointId ? ready.points.find(p => p.id === requestedPointId) ?? null : null;

  const setPointParam = useCallback((pointId: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (pointId) next.set('point', pointId); else next.delete('point');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const closePanel = useCallback(() => {
    setPointParam(null);
    setPanelCloses(n => n + 1);
    void read(key, true); // a position taken in the panel shows on the box card
  }, [key, read, setPointParam]);

  const openPanel = (pointId: string) => {
    setPointParam(pointId);
    void read(key, true); // a position taken on the box card shows in the panel
  };
  // A withdrawn position: the page's counts include it until re-read (feed and stake lower
  // their own counts here; the canvas re-reads, which also remounts the card).
  // A signed-out withdrawal has no row to re-read, so the box cards also remount (`generation`).
  const refresh = useCallback(() => {
    setPanelCloses(n => n + 1);
    void read(key, true);
  }, [key, read]);

  if (current?.status === 'not-found') return <NotFoundPage />;

  const title = ready ? ready.ownerName : null;

  return (
    <div className="flex flex-col px-4 pb-6 pt-3 lg:h-[calc(100dvh-5rem)] lg:px-6 lg:pb-4">
      {ready && <SEO title={`${ready.ownerName} · #${projectTag} — Clarity Pledge`} noIndex />}
      <header className="mb-3 flex min-h-8 flex-wrap items-baseline gap-x-3 gap-y-1">
        {title ? (
          <>
            <h1 className="text-xl font-semibold text-foreground">
              <Link to={`/p/${handle}`} className="rounded-sm hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{title}</Link>
            </h1>
            <span className="text-base text-foreground/60">#{projectTag}</span>
          </>
        ) : (
          current?.status !== 'error' && <div className="h-7 w-64 animate-pulse rounded bg-muted" aria-hidden />
        )}
      </header>

      {current?.status === 'error' ? (
        // The stake page's error pattern (message + Retry), one for the whole page.
        <div role="alert" className="py-12 text-center">
          <p className="mb-4 text-muted-foreground">Could not load this canvas.</p>
          <button
            type="button"
            onClick={() => void read(key)}
            className="min-h-11 font-medium text-blue-600 transition-colors hover:text-blue-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <CanvasGrid
          boxes={ready ? groupPointsByBox(ready.points) : null}
          stories={ready?.stories}
          onOpen={openPanel}
          openPointId={openPoint?.id ?? null}
          generation={panelCloses}
          onPointRemoved={refresh}
        />
      )}

      {openPoint && ready && (
        <PointPanel onClose={closePanel} label={openPoint.statement} pointId={openPoint.id}>
          <FeedPointCard
            key={cardKey(openPoint)}
            point={openPoint}
            linkedStories={ready.stories.get(openPoint.id) ?? []}
            surface="canvas"
            onPointRemoved={refresh}
          />
        </PointPanel>
      )}
    </div>
  );
}

function CanvasGrid({ boxes, stories, onOpen, openPointId, generation, onPointRemoved }: {
  boxes: Map<CanvasBoxTag, PointWithUserPosition[]> | null;
  stories?: Map<string, StoryWithAuthor[]>;
  onOpen: (pointId: string) => void;
  openPointId: string | null;
  generation: number;
  onPointRemoved: () => void;
}) {
  const renderBox = (box: (typeof CANVAS_BOXES)[number], placement = '') => (
    <CanvasBox
      key={box.tag}
      tag={box.tag}
      title={box.title}
      points={boxes ? boxes.get(box.tag) ?? [] : null}
      stories={stories}
      onOpen={onOpen}
      openPointId={openPointId}
      generation={generation}
      onPointRemoved={onPointRemoved}
      className={placement}
    />
  );
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1" data-testid="canvas-grid" aria-busy={boxes === null}>
      <div className="flex flex-col gap-3 lg:grid lg:min-h-0 lg:flex-[3] lg:grid-cols-10 lg:grid-rows-3">
        {LEAN_BOXES.map(box => renderBox(box, LEAN_PLACEMENT[box.tag]))}
      </div>
      {/* The ikigai row is a quarter shorter than a lean row: it starts empty (spec), and the
          lean boxes need the height for a whole compact card. */}
      <div className="flex flex-col gap-3 lg:grid lg:min-h-0 lg:flex-[0.75] lg:grid-cols-3">
        {IKIGAI_BOXES.map(box => renderBox(box))}
      </div>
    </div>
  );
}

function CanvasBox({ tag, title, points, stories, onOpen, openPointId, generation, onPointRemoved, className }: {
  tag: CanvasBoxTag;
  title: string;
  /** null while loading (skeleton) */
  points: PointWithUserPosition[] | null;
  stories?: Map<string, StoryWithAuthor[]>;
  onOpen: (pointId: string) => void;
  openPointId: string | null;
  generation: number;
  onPointRemoved: () => void;
  className: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // Desktop: more points below the fold of this box. The fade says "this box scrolls".
  const [moreBelow, setMoreBelow] = useState(false);
  const headingId = `canvas-box-${tag.replace(':', '-')}`;
  const empty = points !== null && points.length === 0;

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    setMoreBelow(list.scrollHeight - list.scrollTop - list.clientHeight > 4);
    // Mobile only: the sideways list reports which card is in view ("n / N").
    if (list.scrollWidth > list.clientWidth) {
      const first = list.firstElementChild as HTMLElement | null;
      const step = first ? first.offsetWidth + 12 : list.clientWidth;
      setIndex(Math.min((points?.length ?? 1) - 1, Math.round(list.scrollLeft / step)));
    }
  }, [points]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    measure();
    // The list AND its cards: a card that changes height changes the list's scrollHeight
    // without resizing the list itself.
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    Array.from(list.children).forEach(child => observer.observe(child));
    return () => observer.disconnect();
  }, [measure]);

  return (
    <section
      aria-labelledby={headingId}
      data-testid={`canvas-box-${tag}`}
      data-empty={empty || undefined}
      className={`flex min-w-0 flex-col rounded-lg border p-3 lg:min-h-0 ${empty ? 'border-dashed border-border bg-muted/30' : 'border-border bg-muted/60'} ${className}`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id={headingId} className={`text-sm font-semibold ${empty ? 'text-foreground/60' : 'text-foreground'}`}>{title}</h2>
        {points && points.length > 1 && (
          <>
            <span className="text-sm tabular-nums text-foreground/60 lg:hidden" data-testid="canvas-box-counter" aria-live="polite">
              {index + 1} / {points.length}
            </span>
            {/* Desktop: how many points the box holds, since some sit below its fold. */}
            <span className="hidden text-sm tabular-nums text-foreground/60 lg:inline" data-testid="canvas-box-count">
              {points.length}
            </span>
          </>
        )}
      </div>
      {points === null ? (
        <div className="h-24 animate-pulse rounded-md bg-muted" aria-hidden />
      ) : (
        points.length > 0 && (
          <div className="relative flex min-h-0 flex-col lg:flex-1">
            <div
              ref={listRef}
              onScroll={measure}
              className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 pt-0.5 lg:min-h-0 lg:flex-1 lg:snap-none lg:flex-col lg:gap-2 lg:overflow-x-hidden lg:overflow-y-auto"
              data-testid="canvas-box-list"
            >
              {points.map(point => (
                <div
                  key={point.id}
                  data-selected={point.id === openPointId || undefined}
                  className={`shrink-0 snap-center rounded-lg lg:w-auto ${points.length > 1 ? 'w-[88%]' : 'w-full'} ${point.id === openPointId ? 'ring-2 ring-blue-500' : ''}`}
                >
                  <FeedPointCard
                    key={cardKey(point, generation)}
                    point={point}
                    linkedStories={stories?.get(point.id) ?? []}
                    surface="canvas"
                    compact
                    onOpen={() => onOpen(point.id)}
                    onPointRemoved={onPointRemoved}
                  />
                </div>
              ))}
            </div>
            {moreBelow && (
              <div
                aria-hidden
                data-testid="canvas-box-more"
                className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-10 rounded-b-lg bg-gradient-to-t from-muted to-transparent lg:block"
              />
            )}
          </div>
        )
      )}
    </section>
  );
}

/**
 * The open point: a side panel on desktop, a full-screen sheet on mobile — modal on both. The
 * page behind is made `inert` (no focus, no clicks) and a backdrop closes it. Not the Radix
 * dialog: that one locks pointer events on <body>, and the position buttons' menu renders in a
 * portal on <body>, outside the panel. Escape and the close button dismiss it; focus moves in
 * and back.
 */
function PointPanel({ children, onClose, label, pointId }: { children: ReactNode; onClose: () => void; label: string; pointId: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    // Escape closes the panel — unless focus is in something the card opened above it (the share
    // sheet, a confirmation), which handles its own Escape.
    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (e.key === 'Escape' && panel.contains(document.activeElement)) onCloseRef.current();
      // Tab wraps inside the panel (the page behind is inert; this keeps focus off the browser
      // chrome too). Only while focus is in the panel — a dialog the card opened keeps its own.
      if (e.key === 'Tab' && (panel === document.activeElement || panel.contains(document.activeElement))) {
        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
        )).filter(el => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      root?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      // Closing remounts the box cards (a new `generation`), so the button that opened the panel
      // may be gone: return focus to the same point's new card instead.
      const target = opener?.isConnected
        ? opener
        : document.querySelector<HTMLElement>(`[data-testid="canvas-point-card-${pointId}"] button`);
      target?.focus?.();
    };
  }, [pointId]);

  /* Portalled to the end of <body>, outside the inert #root: above the fixed top nav and
     BottomNav (also z-50, but earlier in the document), and still below the menus and dialogs
     the card opens from inside it, which portal in later. */
  return createPortal(
    <>
      <div aria-hidden data-testid="canvas-panel-backdrop" onClick={onClose} className="fixed inset-0 z-50 hidden bg-black/20 lg:block" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Point: ${label}`}
        tabIndex={-1}
        data-testid="canvas-point-panel"
        className="fixed inset-0 z-50 flex flex-col bg-background outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[480px] lg:border-l lg:border-border lg:shadow-xl"
      >
        <div className="flex shrink-0 justify-end px-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/70 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </>,
    document.body,
  );
}
