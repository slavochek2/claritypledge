/**
 * @file canvas-page.tsx
 * @description P1508: Clarity Canvas — an owner's canvas at `/canvas/:handle/:projectTag`.
 *
 * There is no canvas record: a canvas is derived from owner + project tag. Its contents are the
 * owner's current-version points that carry the project tag (a user tag) and a box tag (a system
 * tag), placed into twelve boxes — the lean canvas's nine and three ikigai boxes.
 *
 * READ FIRST, ACT ON OPEN (founder, event use): a box card is text to read, with no buttons; the
 * whole card opens the point. Reading is the default; two controls in the feed's own shapes add to
 * it: a Positions switch (each card's spread, strongly disagree to strongly agree) and a Compare
 * picker (two people in the compare page's columns). The open point (a side panel on desktop, a
 * full-screen sheet on mobile) holds the production point card, everyone's positions with names
 * (positions on public points are public), and Previous / Next through the canvas. Opening a point
 * adds a history entry, so Back closes it.
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
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  BarChart3, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Coins, Gem, Globe, Heart, Lightbulb,
  Megaphone, Receipt, ShieldCheck, Star, Users, X, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/auth';
import { getProfileBySlugResult } from '@/app/data/api';
import { pointsService } from '@/app/data/points-service';
import { storiesService } from '@/app/data/stories-service';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { InlineVisibilityIcon } from '@/app/components/shared';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { StanceColumn, type Person } from '@/app/components/compare/statement-row';
import { POSITION_FIRST_PERSON, POSITION_FULL_LABELS, POSITION_ORDER } from '@/lib/compare-positions';
import { SEO } from '@/app/components/seo';
import { NotFoundPage } from '@/app/pages/not-found-page';
import { getAnonPosition } from '@/app/hooks/useAnonPosition';
import { useGoBack } from '@/app/hooks/use-go-back';
import { stripHashtags } from '@/lib/utils';
import { CANVAS_BOXES, canvasBoxOf, groupPointsByBox, normalizeProjectTag, type CanvasBoxTag } from '@/lib/canvas-boxes';
import {
  POSITION_LABELS,
  POSITION_VALUES,
  type PointPositionWithUser,
  type PointWithUserPosition,
  type PositionType,
  type StoryWithAuthor,
} from '@/app/types';

/** Reading order (founder): who it is for, their problem, the solution, why the owner cares and
 *  why it matters, then the rest. The grid fills left to right in this order, and Previous /
 *  Next walk it. */
const READING_ORDER: readonly CanvasBoxTag[] = [
  'canvas:segments', 'canvas:problem', 'canvas:solution',
  'canvas:love', 'canvas:world-needs', 'canvas:uvp',
  'canvas:advantage', 'canvas:good-at', 'canvas:channels',
  'canvas:metrics', 'canvas:revenue', 'canvas:cost',
];
const ORDERED_BOXES = [...CANVAS_BOXES].sort((a, b) => READING_ORDER.indexOf(a.tag) - READING_ORDER.indexOf(b.tag));

/** A small icon per box, so the canvas can be scanned by shape as well as by title. */
const BOX_ICONS: Record<CanvasBoxTag, LucideIcon> = {
  'canvas:segments': Users,
  'canvas:problem': CircleAlert,
  'canvas:solution': Lightbulb,
  'canvas:love': Heart,
  'canvas:world-needs': Globe,
  'canvas:uvp': Gem,
  'canvas:advantage': ShieldCheck,
  'canvas:good-at': Star,
  'canvas:channels': Megaphone,
  'canvas:metrics': BarChart3,
  'canvas:revenue': Coins,
  'canvas:cost': Receipt,
};
/** The owner's own boxes (ikigai), set apart from the business boxes in the same grid. Blue tint:
 *  the design system's colour for a person's own content. */
const IKIGAI_BOXES: ReadonlySet<CanvasBoxTag> = new Set(['canvas:love', 'canvas:world-needs', 'canvas:good-at']);
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
    owner: Person;
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
      settle({
        status: 'ready',
        ownerId: owner.data.id,
        ownerName: owner.data.name,
        owner: {
          name: owner.data.name,
          photoUrl: owner.data.avatarUrl ?? undefined,
          avatarColor: owner.data.avatarColor,
          hasPledged: owner.data.hasPledged ?? false,
        },
        points,
        stories,
        positions,
      });
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

  const boxes = ready ? groupPointsByBox(ready.points) : null;
  const ordered = boxes ? ORDERED_BOXES.flatMap(b => boxes.get(b.tag) ?? []) : [];

  // The controls live in the address too (`?positions=1`, `?with=`), so a shared link opens the
  // same view. Neither set: reading.
  const showPositions = searchParams.get('positions') === '1';
  const people = ready ? peopleOf(ready, handle) : new Map<string, CanvasPerson>();
  // Compare: the viewer against someone (signed out: the owner against someone). The owner is
  // listed first, then whoever took the most positions.
  const baseId = viewerId ?? ready?.ownerId ?? '';
  const others = [...people.values()]
    .filter(p => p.id !== baseId)
    .sort((a, b) => Number(b.id === ready?.ownerId) - Number(a.id === ready?.ownerId) || b.count - a.count);
  const requestedWith = searchParams.get('with');
  const withPerson = others.find(p => p.id === requestedWith) ?? null;
  // The viewer's own column reads "You", as on the compare page.
  const baseKnown: Person | null = !ready
    ? null
    : people.get(baseId) ?? (baseId === ready.ownerId ? ready.owner : null);
  const basePerson: Person | null = !ready
    ? null
    : viewerId ? { ...(baseKnown ?? { hasPledged: false }), name: 'You' } : baseKnown;
  // Opening a point from a card PUSHES a history entry (marked in its state), so Back — the
  // browser's, or a phone's back swipe — closes the point instead of leaving the canvas. Every
  // other change replaces the entry it is on and keeps that mark.
  const location = useLocation();
  const locationStateRef = useRef<unknown>(location.state);
  locationStateRef.current = location.state;
  const setParams = useCallback((changes: Record<string, string | null>, push = false) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
      return next;
    }, push ? { state: { canvasPanel: true } } : { replace: true, state: locationStateRef.current });
  }, [setSearchParams]);
  const openIndex = requestedPointId ? ordered.findIndex(p => p.id === requestedPointId) : -1;
  const openPoint = openIndex >= 0 ? ordered[openIndex] : null;

  // The close button and Escape: step Back off the entry the card pushed — through useGoBack, the
  // one place that may pop (P1364); its fallback is this canvas without the point. A point opened
  // from the address (no entry of ours behind it) just drops `?point=`.
  const withoutPoint = new URLSearchParams(searchParams);
  withoutPoint.delete('point');
  const restQuery = withoutPoint.toString();
  const goBack = useGoBack(`${location.pathname}${restQuery ? `?${restQuery}` : ''}`);
  const closePanel = useCallback(() => {
    if ((locationStateRef.current as { canvasPanel?: boolean } | null)?.canvasPanel) goBack();
    else setParams({ point: null });
  }, [goBack, setParams]);

  // However the point closed (the button, Escape, the backdrop, Back): re-read, so a position
  // taken in the panel shows on the box card. The cards' remount is set during this render, not
  // in an effect: it must land in the same commit that removes the panel, before the panel's
  // cleanup hands focus back to the card — a remount after that would drop the focus.
  const [lastPointId, setLastPointId] = useState(requestedPointId);
  if (lastPointId !== requestedPointId) {
    setLastPointId(requestedPointId);
    if (lastPointId && !requestedPointId) setPanelCloses(n => n + 1);
  }
  useEffect(() => {
    if (panelCloses > 0) void read(keyRef.current, true);
  }, [panelCloses, read]);

  // Opening (or stepping to) a point re-reads, so the names under it include a position the
  // viewer just took on the previous one. From a card: a new history entry; Previous / Next: the
  // same one.
  // Push only from a clean entry: an address still naming a point that is not on screen (removed
  // in the panel, or private to someone else) is reused, so the close button's step Back lands
  // on the canvas and never on that dead entry.
  const requestedPointRef = useRef(requestedPointId);
  requestedPointRef.current = requestedPointId;
  const openPanel = useCallback((pointId: string, push = false) => {
    setParams({ point: pointId }, push && !requestedPointRef.current);
    void read(key, true);
  }, [key, read, setParams]);

  // A position taken or withdrawn in the panel: re-read (the effect above), so the names under
  // the point and the box card behind the panel show it (a signed-out one is re-read from the
  // browser by the box card's remount).
  const refresh = useCallback(() => setPanelCloses(n => n + 1), []);

  if (current?.status === 'not-found') return <NotFoundPage />;

  return (
    <div className="flex flex-col px-4 pb-24 pt-3 lg:px-6 lg:pb-8">
      {ready && <SEO title={`${ready.ownerName} · #${projectTag} — Clarity Pledge`} noIndex />}
      <header className="mb-3">
        {ready ? (
          // Whose canvas, and what it is: a small photo, the owner's name, and "Clarity Canvas" with
          // the project tag under it — one compact row, so the boxes start high on a phone.
          <Link
            to={`/p/${handle}`}
            className="inline-flex max-w-full items-center gap-2.5 rounded-md hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <GravatarAvatar
              name={ready.owner.name}
              photoUrl={ready.owner.photoUrl}
              avatarColor={ready.owner.avatarColor}
              isPledger={ready.owner.hasPledged}
              size="sm"
              showRing={false}
            />
            <span className="flex min-w-0 flex-col">
              <h1 className="truncate text-base font-semibold leading-tight text-foreground sm:text-lg">{ready.ownerName}</h1>
              <span className="truncate text-sm text-foreground/60">
                <span className="font-medium text-foreground/80" data-testid="canvas-kind">Clarity Canvas</span>
                {' · '}
                <span data-testid="canvas-project-tag">#{projectTag}</span>
              </span>
            </span>
          </Link>
        ) : (
          current?.status !== 'error' && <div className="h-10 w-64 animate-pulse rounded bg-muted" aria-hidden />
        )}
      </header>

      {ready && (
        <CanvasControls
          showPositions={showPositions}
          onShowPositions={on => setParams({ positions: on ? '1' : null })}
          base={basePerson}
          others={others}
          withPerson={withPerson}
          onCompare={id => setParams({ with: id })}
          fullCompareHref={viewerId && withPerson?.slug && withPerson.id !== viewerId
            ? `/compare/${withPerson.slug}?tag=${encodeURIComponent(projectTag ?? '')}`
            : null}
        />
      )}
      {ready && showPositions && (
        // Said once, not on every card: what the bars are.
        <p className="-mt-1 mb-3 text-xs text-foreground/70" data-testid="canvas-spread-legend">
          Bars run from strongly disagree (left) to strongly agree (right), as tall as the number of people:
          grey disagrees, blue agrees.
        </p>
      )}

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
              showPositions={showPositions}
              viewerId={viewerId}
              positions={ready.positions.get(point.id) ?? []}
              storyCount={ready.stories.get(point.id)?.length ?? 0}
              compare={basePerson && withPerson
                ? { base: basePerson, baseId, baseIsViewer: !!viewerId, other: withPerson }
                : null}
              selected={point.id === openPoint?.id}
              onOpen={() => openPanel(point.id, true)}
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
            box: CANVAS_BOXES.find(b => b.tag === canvasBoxOf(openPoint.systemTags))?.title,
            total: ordered.length,
            onPrevious: openIndex > 0 ? () => openPanel(ordered[openIndex - 1].id) : undefined,
            onNext: openIndex < ordered.length - 1 ? () => openPanel(ordered[openIndex + 1].id) : undefined,
          }}
        >
          {/* Keyed by the point only: a re-read after a vote must not remount the card under the
              viewer's hand (a second tap adjusts the level of the position just taken). Stories
              start folded behind "N stories", as in the feed: a point with many stays short. */}
          <FeedPointCard
            key={openPoint.id}
            point={openPoint}
            linkedStories={ready.stories.get(openPoint.id) ?? []}
            surface="canvas"
            // The project tag is where the reader already is: shown, not a link out to the feed.
            activeTag={projectTag ?? undefined}
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
  return (
    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="canvas-grid" aria-busy={boxes === null}>
      {ORDERED_BOXES.filter(box => shows(box.tag)).map(box => (
        <CanvasBox
          key={box.tag}
          tag={box.tag}
          title={box.title}
          points={boxes ? boxes.get(box.tag) ?? [] : null}
          renderCard={renderCard}
          openPointId={openPointId}
        />
      ))}
    </div>
  );
}

function CanvasBox({ tag, title, points, renderCard, openPointId }: {
  tag: CanvasBoxTag;
  title: string;
  /** null while loading (skeleton) */
  points: PointWithUserPosition[] | null;
  renderCard: (point: PointWithUserPosition) => ReactNode;
  openPointId: string | null;
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
  const Icon = BOX_ICONS[tag];
  const ikigai = IKIGAI_BOXES.has(tag);
  const surface = empty
    ? 'border-dashed border-border bg-muted/30'
    : ikigai ? 'border-blue-200 bg-blue-50/70' : 'border-border bg-muted/60';

  return (
    <section
      aria-labelledby={headingId}
      data-testid={`canvas-box-${tag}`}
      data-empty={empty || undefined}
      data-ikigai={ikigai || undefined}
      className={`flex min-w-0 flex-col rounded-lg border p-3 ${surface}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon aria-hidden className={`h-4 w-4 shrink-0 ${ikigai ? 'text-blue-600' : 'text-foreground/50'}`} />
          <h2 id={headingId} className={`text-sm font-semibold ${empty ? 'text-foreground/60' : 'text-foreground'}`}>{title}</h2>
          {ikigai && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800" data-testid="canvas-box-ikigai">Ikigai</span>
          )}
        </div>
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

/** Everyone who took a position on any point of this canvas. */
interface CanvasPerson extends Person {
  id: string;
  slug?: string;
  /** how many of the canvas's points they took a position on */
  count: number;
}
function peopleOf(
  ready: { ownerId: string; owner: Person; positions: Map<string, PointPositionWithUser[]> },
  ownerSlug?: string,
): Map<string, CanvasPerson> {
  // The owner is always someone to compare with, positions or not.
  const people = new Map<string, CanvasPerson>([[ready.ownerId, { ...ready.owner, id: ready.ownerId, slug: ownerSlug, count: 0 }]]);
  for (const list of ready.positions.values()) {
    for (const p of list) {
      const known = people.get(p.userId);
      if (known) { known.count += 1; known.slug ??= p.userSlug || undefined; continue; }
      people.set(p.userId, {
        id: p.userId,
        slug: p.userSlug || undefined,
        name: p.userName,
        photoUrl: p.userAvatarUrl ?? undefined,
        avatarColor: p.userAvatarColor,
        hasPledged: p.userHasPledged ?? false,
        count: 1,
      });
    }
  }
  return people;
}

/**
 * What to show under the statements, in the feed's own control shapes (feed-page.tsx): an on/off
 * pill for Positions, and a pill select for Compare whose first choice is nobody. Both off is
 * reading. They combine: the spread and the two columns can show together.
 */
function CanvasControls({ showPositions, onShowPositions, base, others, withPerson, onCompare, fullCompareHref }: {
  showPositions: boolean;
  onShowPositions: (on: boolean) => void;
  base: Person | null;
  others: CanvasPerson[];
  withPerson: CanvasPerson | null;
  onCompare: (id: string | null) => void;
  fullCompareHref: string | null;
}) {
  const pill = 'relative inline-flex h-10 shrink-0 items-center rounded-full border text-sm font-medium transition-colors';
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="canvas-controls">
      <button
        type="button"
        role="switch"
        aria-checked={showPositions}
        onClick={() => onShowPositions(!showPositions)}
        data-testid="canvas-positions-switch"
        className={`${pill} gap-2 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${showPositions ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-border text-foreground hover:bg-muted/60'}`}
      >
        Positions
        <span aria-hidden className={`inline-block h-3 w-3 rounded-full border ${showPositions ? 'border-blue-500 bg-blue-500' : 'border-muted-foreground'}`} />
      </button>
      {/* Nobody else to compare with: the pill is absent, not disabled (P955). */}
      {base && others.length > 0 && (
        <label
          className={`${pill} focus-within:ring-2 focus-within:ring-blue-500 ${withPerson ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-border text-foreground hover:bg-muted/60'}`}
          data-testid="canvas-compare-picker"
        >
          {/* No "Compare:" prefix: the first choice says it, and a chosen name shows on a blue
              pill — so both pills fit one row at 320px. The select carries the padding, so a
              click anywhere on the pill (the chevron included) opens its menu. */}
          <select
            aria-label="Compare with"
            value={withPerson?.id ?? ''}
            onChange={e => onCompare(e.target.value || null)}
            className="h-full max-w-[12rem] cursor-pointer appearance-none truncate rounded-full bg-transparent pl-3 pr-8 text-base font-medium focus:outline-none md:text-sm"
          >
            <option value="">Compare with…</option>
            {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-3 h-4 w-4 opacity-60" />
        </label>
      )}
      {withPerson && fullCompareHref && (
        <Link to={fullCompareHref} className="inline-flex min-h-10 items-center px-1 text-sm font-medium text-blue-600 hover:underline" data-testid="canvas-compare-full">
          Full comparison <ChevronRight className="ml-0.5 h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** A card's compare column is narrow: first names there; the picker above names people in full. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function stanceLabel(position: PositionType | undefined, firstPerson: boolean): string {
  if (!position) return 'No position';
  return (firstPerson ? POSITION_FIRST_PERSON : POSITION_FULL_LABELS)[position];
}

/**
 * How people spread on one point: seven bars, strongly disagree on the left to strongly agree on
 * the right, each as tall as the number of people there. A split shows as two humps. The
 * numbers, level by level, are in the label (screen readers, and the tooltip).
 */
function PositionSpread({ positions }: { positions: PointPositionWithUser[] }) {
  const bars = POSITION_ORDER.map(position => ({ position, n: positions.filter(p => p.position === position).length }));
  const max = Math.max(1, ...bars.map(b => b.n));
  const label = bars
    .filter(b => b.n > 0)
    .map(b => `${b.n} ${POSITION_FIRST_PERSON[b.position].toLowerCase()}`)
    .join(', ');
  return (
    <span role="img" aria-label={label} title={label} className="flex h-5 items-end gap-0.5" data-testid="canvas-card-spread">
      {bars.map(({ position, n }) => {
        const side = sideOf(position);
        const colour = n === 0
          ? 'bg-gray-300'
          : side === 'agree' ? 'bg-blue-500' : side === 'disagree' ? 'bg-slate-500' : 'bg-gray-400';
        return (
          <span
            key={position}
            data-count={n}
            className={`w-1.5 rounded-sm ${colour}`}
            style={{ height: n === 0 ? 2 : Math.max(4, Math.round((n / max) * 20)) }}
          />
        );
      })}
    </span>
  );
}

/**
 * A box card: text to read, no controls inside; the whole card opens the point. Under the
 * statement, when switched on: how everyone spreads (Positions), and two people's positions in
 * the compare page's columns (Compare).
 */
function CanvasCard({ point, showPositions, viewerId, positions, storyCount, compare, selected, onOpen }: {
  point: PointWithUserPosition;
  showPositions: boolean;
  viewerId?: string;
  positions: PointPositionWithUser[];
  storyCount: number;
  compare: { base: Person; baseId: string; baseIsViewer: boolean; other: CanvasPerson } | null;
  selected: boolean;
  onOpen: () => void;
}) {
  // Everyone, the owner included: the same numbers the open point's buttons show.
  const tally = SIDES.map(({ side, label }) => ({ side, label, n: positions.filter(p => sideOf(p.position) === side).length }));
  const count = (side: Side) => tally.find(t => t.side === side)?.n ?? 0;
  // Split: at least two people on each side — where the room has something to talk about.
  const split = count('agree') >= 2 && count('disagree') >= 2;
  // The viewer's own position (signed in: the read; signed out: what this browser kept).
  const positionOf = (userId: string) => positions.find(p => p.userId === userId)?.position;
  const viewerPosition = viewerId
    ? point.userPosition?.position ?? positionOf(viewerId)
    : (getAnonPosition(point.id) as PositionType | null) ?? undefined;

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
      {showPositions && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/70">
          {positions.length > 0
            ? <PositionSpread positions={positions} />
            : <span data-testid="canvas-card-no-positions">No positions yet</span>}
          {split && <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-800" data-testid="canvas-card-split">Split</span>}
          {storyCount > 0 && (
            <span data-testid="canvas-card-stories">{storyCount} {storyCount === 1 ? 'story' : 'stories'}</span>
          )}
          {viewerPosition && (
            <span className="font-medium text-foreground" data-testid="canvas-viewer-position">You: {POSITION_LABELS[viewerPosition]}</span>
          )}
        </div>
      )}
      {compare && (
        <div className="mt-3 flex items-start gap-2" data-testid="canvas-card-compare">
          <StanceColumn
            person={{ ...compare.base, name: firstName(compare.base.name) }}
            label={stanceLabel(compare.baseIsViewer ? viewerPosition ?? positionOf(compare.baseId) : positionOf(compare.baseId), compare.baseIsViewer)}
          />
          <div className="w-px self-stretch bg-gray-200" />
          <StanceColumn person={{ ...compare.other, name: firstName(compare.other.name) }} label={stanceLabel(positionOf(compare.other.id), false)} />
        </div>
      )}
    </button>
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
  step: { index: number; total: number; box?: string; onPrevious?: () => void; onNext?: () => void };
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
          {/* Where this point sits: Previous / Next cross from box to box. */}
          <span className="min-w-0 truncate px-2 text-sm text-foreground/60">
            <span className="tabular-nums" data-testid="canvas-panel-step">{step.index + 1} of {step.total}</span>
            {step.box && <> · <span className="font-medium text-foreground/80" data-testid="canvas-panel-box">{step.box}</span></>}
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
