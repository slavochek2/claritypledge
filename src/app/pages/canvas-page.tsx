/**
 * @file canvas-page.tsx
 * @description P1508: Clarity Canvas — an owner's canvas at `/canvas/:handle/:projectTag`.
 *
 * There is no canvas record: a canvas is derived from owner + project tag. Its contents are the
 * owner's current-version points that carry the project tag (a user tag) and a box tag (a system
 * tag), placed into twelve boxes — the lean canvas's nine and three ikigai boxes.
 *
 * READ FIRST, ACT ON OPEN (founder, event use): a box card is text to read — the statement, where
 * the owner stands, how everyone else stands, how many stories. It has no buttons; the whole card
 * opens the point. The open point (a side panel on desktop, a full-screen sheet on mobile) holds
 * the production point card with its stories shown, everyone's positions with names (positions on
 * public points are public), and Previous / Next through the canvas.
 *
 * VISIBILITY: the owner sees their private points; anyone else, public ones only (enforced in the
 * read and by RLS). Everything on screen is keyed by the viewer, so signing out or switching
 * account drops private points, stories and the open panel in the same render. A box with no
 * points is shown to the owner only.
 *
 * Browse page (src.md): no back button; BottomNav shows on mobile.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAuth } from '@/auth';
import { getProfileBySlugResult } from '@/app/data/api';
import { pointsService } from '@/app/data/points-service';
import { storiesService } from '@/app/data/stories-service';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { InlineVisibilityIcon } from '@/app/components/shared';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { SEO } from '@/app/components/seo';
import { NotFoundPage } from '@/app/pages/not-found-page';
import { getAnonPosition } from '@/app/hooks/useAnonPosition';
import { stripHashtags } from '@/lib/utils';
import { CANVAS_BOXES, groupPointsByBox, normalizeProjectTag, type CanvasBoxTag } from '@/lib/canvas-boxes';
import {
  POSITION_LABELS,
  POSITION_VALUES,
  type PointPositionWithUser,
  type PointWithUserPosition,
  type PositionType,
  type StoryWithAuthor,
} from '@/app/types';

/** Desktop placement: the standard lean-canvas shape on a 10-column grid. Rows size to their
 *  content (the page scrolls); a box with nothing to show leaves its cell empty. */
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
/** The canvas stays small: a box shows this many cards, and says how many more it holds. */
const BOX_LIMIT = 3;

type Side = 'agree' | 'unsure' | 'disagree';
const SIDES: { side: Side; label: string }[] = [
  { side: 'agree', label: 'Agree' },
  { side: 'unsure', label: 'Unsure' },
  { side: 'disagree', label: 'Disagree' },
];
function sideOf(position: PositionType): Side {
  const v = POSITION_VALUES[position];
  return v > 0 ? 'agree' : v < 0 ? 'disagree' : 'unsure';
}

type CanvasData =
  | {
    status: 'ready';
    ownerId: string;
    ownerName: string;
    points: PointWithUserPosition[];
    stories: Map<string, StoryWithAuthor[]>;
    positions: Map<string, PointPositionWithUser[]>;
  }
  | { status: 'not-found' }
  | { status: 'error' };

/** What is on screen, and which viewer + address it was read FOR. */
interface Loaded {
  key: string;
  data: CanvasData;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function CanvasPage() {
  const { handle, projectTag: rawTag } = useParams<{ handle: string; projectTag: string }>();
  const projectTag = normalizeProjectTag(rawTag);
  const { session, sessionChecked } = useAuth();
  const viewerId = session?.user?.id;
  const key = `${viewerId ?? ''}|${handle ?? ''}|${projectTag ?? ''}`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The viewer + address on screen NOW. A callback from a card that outlived its viewer (a vote
  // settling after sign-out) must not start a read for the old key: it would supersede the
  // current read and leave the page loading.
  const keyRef = useRef(key);
  keyRef.current = key;
  // The open point lives in the address (`?point=`), so Back from a story or point page reopens
  // it. It opens only if it is one of the points THIS viewer's read returned.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPointId = searchParams.get('point');
  // Bumped when the panel closes: a signed-out vote lives only in the browser, so the box cards
  // re-read it then.
  const [panelCloses, setPanelCloses] = useState(0);
  const requestRef = useRef(0);

  /** `refresh`: a re-read of what is already on screen (panel open/close, a withdrawn
   *  position). Its failure keeps the rows already shown instead of replacing the grid. */
  const read = useCallback(async (forKey: string, refresh = false) => {
    if (forKey !== keyRef.current) return;
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
      const ids = points.map(p => p.id);
      const [stories, positions] = await Promise.all([
        storiesService.getStoriesForPoints(ids, undefined, { strict: true }),
        pointsService.getCanvasPositions(ids),
      ]);
      settle({ status: 'ready', ownerId: owner.data.id, ownerName: owner.data.name, points, stories, positions });
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
  const isOwner = !!ready && viewerId === ready.ownerId;

  // Reading order: the lean boxes, then ikigai — the order Previous / Next walks.
  const boxes = ready ? groupPointsByBox(ready.points) : null;
  const ordered = boxes ? [...LEAN_BOXES, ...IKIGAI_BOXES].flatMap(b => boxes.get(b.tag) ?? []) : [];
  const openIndex = requestedPointId ? ordered.findIndex(p => p.id === requestedPointId) : -1;
  const openPoint = openIndex >= 0 ? ordered[openIndex] : null;

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

  // Opening (or stepping to) a point re-reads, so the names under it include a position the
  // viewer just took on the previous one.
  const openPanel = useCallback((pointId: string) => {
    setPointParam(pointId);
    void read(key, true);
  }, [key, read, setPointParam]);

  // A position taken or withdrawn in the panel: re-read, so the owner line, the names under the
  // point and the box card behind the panel show it (a signed-out one is re-read from the
  // browser by the box card's remount).
  const refresh = useCallback(() => {
    setPanelCloses(n => n + 1);
    void read(key, true);
  }, [key, read]);

  if (current?.status === 'not-found') return <NotFoundPage />;

  return (
    <div className="flex flex-col px-4 pb-24 pt-3 lg:px-6 lg:pb-8">
      {ready && <SEO title={`${ready.ownerName} · #${projectTag} — Clarity Pledge`} noIndex />}
      <header className="mb-4">
        {ready ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold text-foreground">
                <Link to={`/p/${handle}`} className="rounded-sm hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{ready.ownerName}</Link>
              </h1>
              <span className="text-base text-foreground/60">#{projectTag}</span>
            </div>
            {/* [FOUNDER DECISION: intro copy — agent draft, edit freely] */}
            <p className="mt-1 text-sm text-foreground/70" data-testid="canvas-intro">
              {isOwner
                ? 'Your canvas. Open a point to see who stands where, and why.'
                : viewerId
                  ? `${firstName(ready.ownerName)}'s business on one page. Open a point to read why, then say where you stand. Positions show with your name.`
                  : `${firstName(ready.ownerName)}'s business on one page. Open a point to read why, then say where you stand. Sign in so ${firstName(ready.ownerName)} sees your answer.`}
            </p>
          </>
        ) : (
          current?.status !== 'error' && <div className="h-12 w-72 animate-pulse rounded bg-muted" aria-hidden />
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
          boxes={boxes}
          renderCard={point => ready && (
            <CanvasCard
              key={`${point.id}:${panelCloses}`}
              point={point}
              ownerId={ready.ownerId}
              ownerName={ready.ownerName}
              viewerId={viewerId}
              positions={ready.positions.get(point.id) ?? []}
              storyCount={ready.stories.get(point.id)?.length ?? 0}
              selected={point.id === openPoint?.id}
              onOpen={() => openPanel(point.id)}
            />
          )}
          showEmpty={isOwner}
          openPointId={openPoint?.id ?? null}
        />
      )}

      {openPoint && ready && (
        <PointPanel
          onClose={closePanel}
          label={openPoint.statement}
          pointId={openPoint.id}
          step={{
            index: openIndex,
            total: ordered.length,
            onPrevious: openIndex > 0 ? () => openPanel(ordered[openIndex - 1].id) : undefined,
            onNext: openIndex < ordered.length - 1 ? () => openPanel(ordered[openIndex + 1].id) : undefined,
          }}
        >
          <OwnerStance
            ownerName={ready.ownerName}
            position={ready.positions.get(openPoint.id)?.find(p => p.userId === ready.ownerId)?.position}
          />
          {/* Keyed by the point only: a re-read after a vote must not remount the card under the
              viewer's hand (a second tap adjusts the level of the position just taken). */}
          <FeedPointCard
            key={openPoint.id}
            point={openPoint}
            linkedStories={ready.stories.get(openPoint.id) ?? []}
            surface="canvas"
            storiesOpen
            onPointRemoved={refresh}
            onPositionSaved={refresh}
          />
          <WhoStandsWhere positions={ready.positions.get(openPoint.id) ?? []} ownerId={ready.ownerId} />
        </PointPanel>
      )}
    </div>
  );
}

function CanvasGrid({ boxes, renderCard, showEmpty, openPointId }: {
  /** null while loading (skeletons) */
  boxes: Map<CanvasBoxTag, PointWithUserPosition[]> | null;
  renderCard: (point: PointWithUserPosition) => ReactNode;
  /** The owner sees empty boxes (what is left to fill); anyone else does not. */
  showEmpty: boolean;
  openPointId: string | null;
}) {
  const shows = (tag: CanvasBoxTag) => !boxes || showEmpty || (boxes.get(tag)?.length ?? 0) > 0;
  const renderBox = (box: (typeof CANVAS_BOXES)[number], placement = '') => {
    if (!shows(box.tag)) return null;
    // The bottom row: when one of its two boxes is not shown, the other takes the whole row.
    const alone = (box.tag === 'canvas:cost' && !shows('canvas:revenue')) || (box.tag === 'canvas:revenue' && !shows('canvas:cost'));
    return (
      <CanvasBox
        key={box.tag}
        tag={box.tag}
        title={box.title}
        points={boxes ? boxes.get(box.tag) ?? [] : null}
        renderCard={renderCard}
        openPointId={openPointId}
        className={alone ? 'lg:col-start-1 lg:col-span-10 lg:row-start-3' : placement}
      />
    );
  };
  const ikigaiShown = IKIGAI_BOXES.filter(b => shows(b.tag));
  return (
    <div className="flex flex-col gap-3" data-testid="canvas-grid" aria-busy={boxes === null}>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-10 lg:items-stretch">
        {LEAN_BOXES.map(box => renderBox(box, LEAN_PLACEMENT[box.tag]))}
      </div>
      {ikigaiShown.length > 0 && (
        <div className={`flex flex-col gap-3 lg:grid ${ikigaiShown.length === 3 ? 'lg:grid-cols-3' : ikigaiShown.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
          {ikigaiShown.map(box => renderBox(box))}
        </div>
      )}
    </div>
  );
}

function CanvasBox({ tag, title, points, renderCard, openPointId, className }: {
  tag: CanvasBoxTag;
  title: string;
  /** null while loading (skeleton) */
  points: PointWithUserPosition[] | null;
  renderCard: (point: PointWithUserPosition) => ReactNode;
  openPointId: string | null;
  className: string;
}) {
  const [showAll, setShowAll] = useState(false);
  // The open point (Next, or an address with `?point=`) may sit past the first three: open the
  // box so its card is on screen behind the panel, and stays there for focus when it closes.
  const openIsHidden = !!openPointId && !!points && points.findIndex(p => p.id === openPointId) >= BOX_LIMIT;
  useEffect(() => { if (openIsHidden) setShowAll(true); }, [openIsHidden]);
  const headingId = `canvas-box-${tag.replace(':', '-')}`;
  const empty = points !== null && points.length === 0;
  const shown = points && !showAll ? points.slice(0, BOX_LIMIT) : points;
  const hidden = points ? points.length - (shown?.length ?? 0) : 0;

  return (
    <section
      aria-labelledby={headingId}
      data-testid={`canvas-box-${tag}`}
      data-empty={empty || undefined}
      className={`flex min-w-0 flex-col rounded-lg border p-3 ${empty ? 'border-dashed border-border bg-muted/30' : 'border-border bg-muted/60'} ${className}`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id={headingId} className={`text-sm font-semibold ${empty ? 'text-foreground/60' : 'text-foreground'}`}>{title}</h2>
        {points && points.length > 1 && (
          <span className="text-sm tabular-nums text-foreground/60" data-testid="canvas-box-count">{points.length}</span>
        )}
      </div>
      {points === null ? (
        <div className="h-24 animate-pulse rounded-md bg-muted" aria-hidden />
      ) : empty ? (
        <p className="text-sm text-foreground/50">Empty</p>
      ) : (
        <div className="flex flex-col gap-2" data-testid="canvas-box-list">
          {(shown ?? []).map(point => renderCard(point))}
          {(hidden > 0 || showAll) && points.length > BOX_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              aria-expanded={showAll}
              data-testid="canvas-box-more"
              className="min-h-10 self-start rounded-sm text-sm font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {showAll ? 'Show fewer' : `${hidden} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * A box card: text to read, no controls inside. The statement (up to five lines), where the
 * owner stands, how everyone stands (owner included), how many stories, and the viewer's own position.
 */
function CanvasCard({ point, ownerId, ownerName, viewerId, positions, storyCount, selected, onOpen }: {
  point: PointWithUserPosition;
  ownerId: string;
  ownerName: string;
  viewerId?: string;
  positions: PointPositionWithUser[];
  storyCount: number;
  selected: boolean;
  onOpen: () => void;
}) {
  const ownerPosition = positions.find(p => p.userId === ownerId)?.position;
  // Everyone, the owner included: the same numbers the open point's buttons show.
  const tally = SIDES.map(({ side, label }) => ({ label, n: positions.filter(p => sideOf(p.position) === side).length }))
    .filter(t => t.n > 0);
  // The viewer's own position (signed in: the read; signed out: what this browser kept).
  const viewerPosition = viewerId
    ? (viewerId === ownerId ? undefined : point.userPosition?.position)
    : (getAnonPosition(point.id) as PositionType | null) ?? undefined;
  const meta: string[] = [];
  if (tally.length > 0) meta.push(tally.map(t => `${t.n} ${t.label.toLowerCase()}`).join(' · '));
  if (storyCount > 0) meta.push(`${storyCount} ${storyCount === 1 ? 'story' : 'stories'}`);

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`canvas-point-card-${point.id}`}
      data-selected={selected || undefined}
      className={`w-full rounded-lg border bg-card p-3 text-left shadow-sm transition-colors hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selected ? 'border-blue-500 ring-2 ring-blue-500' : 'border-border'}`}
    >
      <p className="line-clamp-5 break-words text-sm font-medium text-foreground">
        {point.visibility === 'private' && <><InlineVisibilityIcon visibility={point.visibility} />{' '}</>}
        {stripHashtags(point.statement, point.tags)}
      </p>
      {(ownerPosition || meta.length > 0 || viewerPosition) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/70">
          {ownerPosition && (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-800" data-testid="canvas-owner-position">
              {firstName(ownerName)}: {POSITION_LABELS[ownerPosition]}
            </span>
          )}
          {meta.length > 0 && <span data-testid="canvas-card-meta">{meta.join(' · ')}</span>}
          {viewerPosition && (
            <span className="font-medium text-foreground" data-testid="canvas-viewer-position">You: {POSITION_LABELS[viewerPosition]}</span>
          )}
        </div>
      )}
    </button>
  );
}

/** The open point's first line: where the owner stands. */
function OwnerStance({ ownerName, position }: { ownerName: string; position?: PositionType }) {
  return (
    <p className="mb-2 text-sm text-foreground/70" data-testid="canvas-panel-owner-position">
      {position
        ? <><span className="font-medium text-foreground">{ownerName}</span>: {POSITION_LABELS[position]}</>
        : <>{ownerName} has not taken a position on this point.</>}
    </p>
  );
}

/** Everyone's positions on the open point, with names, grouped Agree / Unsure / Disagree. */
function WhoStandsWhere({ positions, ownerId }: { positions: PointPositionWithUser[]; ownerId: string }) {
  if (positions.length === 0) return null;
  return (
    <section className="mt-5" aria-labelledby="canvas-who-heading" data-testid="canvas-who-stands-where">
      <h3 id="canvas-who-heading" className="mb-2 text-sm font-semibold text-foreground">
        Positions <span className="font-normal tabular-nums text-foreground/60">{positions.length}</span>
      </h3>
      <div className="flex flex-col gap-3">
        {SIDES.map(({ side, label }) => {
          const group = positions.filter(p => sideOf(p.position) === side);
          if (group.length === 0) return null;
          return (
            <div key={side} data-testid={`canvas-who-${side}`}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-foreground/60">{label} · {group.length}</p>
              <ul className="flex flex-col gap-1">
                {group.map(p => (
                  <li key={p.userId} className="flex items-center gap-2 text-sm">
                    <GravatarAvatar
                      name={p.userName}
                      photoUrl={p.userAvatarUrl ?? undefined}
                      avatarColor={p.userAvatarColor}
                      isPledger={p.userHasPledged ?? false}
                      size="sm"
                      showRing={false}
                    />
                    {p.userSlug
                      ? <Link to={`/p/${p.userSlug}`} className="min-w-0 truncate font-medium text-foreground hover:text-blue-700">{p.userName}</Link>
                      : <span className="min-w-0 truncate font-medium text-foreground">{p.userName}</span>}
                    <span className="shrink-0 text-foreground/60">{POSITION_LABELS[p.position]}{p.userId === ownerId ? ' · owner' : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The open point: a side panel on desktop, a full-screen sheet on mobile — modal on both. The
 * page behind is made `inert` (no focus, no clicks) and a backdrop closes it. Not the Radix
 * dialog: that one locks pointer events on <body>, and the position buttons' menu renders in a
 * portal on <body>, outside the panel. Escape and the close button dismiss it; focus moves in
 * and back. Previous / Next walk the canvas without closing it.
 */
function PointPanel({ children, onClose, label, pointId, step }: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  pointId: string;
  step: { index: number; total: number; onPrevious?: () => void; onNext?: () => void };
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // The point on screen when the panel closes (Previous / Next change it), for returning focus.
  const pointIdRef = useRef(pointId);
  pointIdRef.current = pointId;
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
      // The card of the point on screen at close; else whatever opened the panel (never <body>,
      // which is what a panel opened from the address starts with).
      const card = document.querySelector<HTMLElement>(`[data-testid="canvas-point-card-${pointIdRef.current}"]`);
      const target = card ?? (opener?.isConnected && opener !== document.body ? opener : null);
      target?.focus?.();
    };
    // Opened once per panel; stepping to another point keeps it open (and keeps the opener).
  }, []);

  // A new point starts at its top. Stepping to the first or last point removes the button just
  // pressed, which drops focus to <body> (outside the panel, where Escape and Tab no longer
  // reach it): take focus back into the panel.
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 });
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, [pointId]);

  const stepButton = 'flex h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-blue-600 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';

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
        <div className="flex shrink-0 items-center justify-between px-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
          <span className="px-2 text-sm tabular-nums text-foreground/60" data-testid="canvas-panel-step">
            {step.index + 1} of {step.total}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/70 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* px-2 on phones: the position buttons drop their labels below a 270px row, and the
            card's own padding and pin column leave about that much at 375px. */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 sm:px-4">{children}</div>
        <nav
          aria-label="Points on this canvas"
          className="flex shrink-0 items-center justify-between border-t border-border px-2 py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]"
        >
          {/* At either end the step is absent, not disabled (no dead controls, P955). */}
          {step.onPrevious ? (
            <button type="button" onClick={step.onPrevious} className={stepButton} data-testid="canvas-panel-previous">
              <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
            </button>
          ) : <span />}
          {step.onNext && (
            <button type="button" onClick={step.onNext} className={stepButton} data-testid="canvas-panel-next">
              Next point <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </nav>
      </div>
    </>,
    document.body,
  );
}
