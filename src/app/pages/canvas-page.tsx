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
import { useParams } from 'react-router-dom';
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
 *  outlives a refreshed row (the box card and the panel card are separate instances). */
function cardKey(point: PointWithUserPosition): string {
  return `${point.id}:${point.userPosition?.position ?? ''}:${point.userPosition?.updatedAt ?? ''}`;
}

export function CanvasPage() {
  const { handle, projectTag: rawTag } = useParams<{ handle: string; projectTag: string }>();
  const projectTag = normalizeProjectTag(rawTag);
  const { session, sessionChecked } = useAuth();
  const viewerId = session?.user?.id;
  const key = `${viewerId ?? ''}|${handle ?? ''}|${projectTag ?? ''}`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [open, setOpen] = useState<{ key: string; pointId: string } | null>(null);
  const requestRef = useRef(0);

  const read = useCallback(async (forKey: string) => {
    const rid = ++requestRef.current;
    const settle = (data: CanvasData) => {
      if (rid === requestRef.current) setLoaded({ key: forKey, data });
    };
    if (!handle || !projectTag) return settle({ status: 'not-found' });
    try {
      const owner = await getProfileBySlugResult(handle);
      if (!owner.success) return settle({ status: owner.error === 'not_found' ? 'not-found' : 'error' });
      const points = await pointsService.getCanvasPoints(owner.data.id, projectTag, viewerId);
      if (points.length === 0) return settle({ status: 'not-found' });
      const stories = await storiesService.getStoriesForPoints(points.map(p => p.id));
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
  const openPointId = open && open.key === key ? open.pointId : null;
  const ready = current?.status === 'ready' ? current : null;
  const openPoint = ready && openPointId ? ready.points.find(p => p.id === openPointId) ?? null : null;

  const closePanel = useCallback(() => {
    setOpen(null);
    void read(key); // a position taken in the panel shows on the box card
  }, [key, read]);

  const openPanel = (pointId: string) => {
    setOpen({ key, pointId });
    void read(key); // a position taken on the box card shows in the panel
  };

  if (current?.status === 'not-found') return <NotFoundPage />;

  const title = ready ? ready.ownerName : null;

  return (
    <div className="flex flex-col px-4 pb-6 pt-3 lg:h-[calc(100dvh-5rem)] lg:px-6 lg:pb-4">
      {ready && <SEO title={`${ready.ownerName} · #${projectTag} — Clarity Pledge`} noIndex />}
      <header className="mb-3 flex min-h-8 flex-wrap items-baseline gap-x-3 gap-y-1">
        {title ? (
          <>
            <h1 className="text-xl font-semibold text-foreground">{title}</h1>
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
        />
      )}

      {openPoint && ready && (
        <PointPanel onClose={closePanel} label={openPoint.statement}>
          <FeedPointCard
            key={cardKey(openPoint)}
            point={openPoint}
            linkedStories={ready.stories.get(openPoint.id) ?? []}
            surface="canvas"
          />
        </PointPanel>
      )}
    </div>
  );
}

function CanvasGrid({ boxes, stories, onOpen }: {
  boxes: Map<CanvasBoxTag, PointWithUserPosition[]> | null;
  stories?: Map<string, StoryWithAuthor[]>;
  onOpen: (pointId: string) => void;
}) {
  const renderBox = (box: (typeof CANVAS_BOXES)[number], placement = '') => (
    <CanvasBox
      key={box.tag}
      tag={box.tag}
      title={box.title}
      points={boxes ? boxes.get(box.tag) ?? [] : null}
      stories={stories}
      onOpen={onOpen}
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

function CanvasBox({ tag, title, points, stories, onOpen, className }: {
  tag: CanvasBoxTag;
  title: string;
  /** null while loading (skeleton) */
  points: PointWithUserPosition[] | null;
  stories?: Map<string, StoryWithAuthor[]>;
  onOpen: (pointId: string) => void;
  className: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const headingId = `canvas-box-${tag.replace(':', '-')}`;
  const empty = points !== null && points.length === 0;

  // Mobile only: the sideways list reports which card is in view ("n / N").
  const onScroll = () => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const first = list.firstElementChild as HTMLElement | null;
    const step = first ? first.offsetWidth + 12 : list.clientWidth;
    setIndex(Math.min((points?.length ?? 1) - 1, Math.round(list.scrollLeft / step)));
  };

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
          <span className="text-sm tabular-nums text-foreground/60 lg:hidden" data-testid="canvas-box-counter" aria-live="polite">
            {index + 1} / {points.length}
          </span>
        )}
      </div>
      {points === null ? (
        <div className="h-24 animate-pulse rounded-md bg-muted" aria-hidden />
      ) : (
        points.length > 0 && (
          <div
            ref={listRef}
            onScroll={onScroll}
            className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 lg:min-h-0 lg:flex-1 lg:snap-none lg:flex-col lg:gap-2 lg:overflow-x-hidden lg:overflow-y-auto"
            data-testid="canvas-box-list"
          >
            {points.map(point => (
              <div key={point.id} className={`shrink-0 snap-center lg:w-auto ${points.length > 1 ? 'w-[88%]' : 'w-full'}`}>
                <FeedPointCard
                  key={cardKey(point)}
                  point={point}
                  linkedStories={stories?.get(point.id) ?? []}
                  surface="canvas"
                  compact
                  onOpen={() => onOpen(point.id)}
                />
              </div>
            ))}
          </div>
        )
      )}
    </section>
  );
}

/**
 * The open point: a side panel on desktop, a full-screen sheet on mobile. Deliberately not a modal
 * dialog — a modal locks pointer events outside itself, and the position buttons' menu renders in
 * a portal outside the panel. Escape and the close button dismiss it; focus moves in and back.
 */
function PointPanel({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  /* Portalled to the end of <body>: above the fixed top nav and BottomNav (also z-50, but
     earlier in the document), and still below the menus and dialogs the card opens from inside
     it, which portal in later. */
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
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
    </div>,
    document.body,
  );
}
