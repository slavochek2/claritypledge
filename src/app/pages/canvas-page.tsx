/**
 * @file canvas-page.tsx
 * @description P1508: Clarity Canvas — an owner's canvas at `/p/:handle/canvas/:projectTag` (R14).
 *
 * A canvas is its owner's current-version points that carry the reserved `canvas_<name>` system tag
 * and a box tag, placed into nine boxes in three named layers (P1535): The core bet, Go to market,
 * Me and the world.
 *
 * READ FIRST, ACT ON OPEN (founder, event use): one grid in reading order, three columns from
 * 1024px, two from 640px, one below, each layer under its label, compact enough that a canvas with
 * one card per box fits one desktop screen (P1535). A box shows two cards, then
 * "N more", which opens the whole box in the panel (R2) — the grid never moves. A box card is text
 * to read plus its spread, with no buttons; the whole card opens the point. Above the grid:
 * "Clarity Canvas", then "by <owner>" and the canvas's name (a menu when the owner has several)
 * on the left, Compare on the right (R10). The panel (a side panel on desktop, a full-screen sheet
 * below 1024px) holds either a box's list or the production point card showing the owner as their
 * profile does, the point page's "Filter by position" block, and Previous / Next through the
 * canvas. Opening a box or a point adds a history entry, so Back steps out one level.
 *
 * ONE VISIBILITY IDEA (P1515, founder 2026-10-21): a canvas is Private, and its owner chooses who
 * else sees it (events and groups). The canvas's audience decides everything inside: the whole read
 * is one server function (`get_canvas`) that returns content only to the owner and to people an
 * audience entry admits right now; anyone else gets not-found, even if some points are public rows.
 * The owner has a lock control at the top; a reader sees "Shared with you through <entry>"; the
 * shared icon marks the header, each point and each story inside. Writes (positions, an added
 * story, taking one's own added story off) go through the checked functions for everyone, and the
 * read is repeated, never served from the Back cache, when the tab regains focus and when the side
 * panel opens. Everything on screen is keyed by the viewer, so signing out or switching account
 * drops the canvas and the open panel in the same render.
 *
 * PHASE 3 (founder, 2026-10-21): the owner can also add ONE PERSON, and switch general access to
 * "Anyone with the link". Signed-in people then read, take positions and add a story; a signed-out
 * visitor reads only (the page asks get_canvas signed out too: it answers with content only while the
 * link is open, and with the empty not-found shape otherwise) and gets no write control.
 *
 * Browse page (src.md): no back button; BottomNav shows on mobile.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import {
  clearListReturnCache, listReturnCacheGeneration, listReturnCacheKey, readListReturnCache, writeListReturnCache,
} from '@/lib/list-return-cache';
import {
  BarChart3, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Coins, Contrast, Gem, Handshake,
  Lightbulb, Megaphone, Users, X, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/auth';
import { getProfileBySlugResult } from '@/app/data/api';
import { toast } from 'sonner';
import { linkTokenFromAddress, linkTokenVersion, readLinkToken, storeLinkToken, subscribeLinkTokens } from '@/lib/canvas-link-token';
import { canvasService, type AudienceEntry, type CanvasGeneralAccess, type CanvasVersion, type CanvasVia, type CanvasVisibility } from '@/app/data/canvas-service';
import { calibrationService } from '@/app/data/calibration-service';
import { useAgentAccountIds } from '@/app/contexts/agent-accounts-context';
import { FeedPointCard, type FeedPointCardCanvas, type FeedPointCardOwner } from '@/app/components/feed/feed-point-card';
import { type PositionFilter } from '@/app/components/shared';
import { PointSpreadRow } from '@/app/components/shared/position-spread';
import { PointPositionsBlock } from '@/app/components/social/point-positions-block';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { Button } from '@/components/ui/button';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { StanceColumn, type Person } from '@/app/components/compare/statement-row';
import { POSITION_FIRST_PERSON, POSITION_FULL_LABELS } from '@/lib/compare-positions';
import { contestScore, levelCounts } from '@/lib/position-spread';
import { SEO } from '@/app/components/seo';
import { NotFoundPage } from '@/app/pages/not-found-page';
import { getAnonPosition } from '@/app/hooks/useAnonPosition';
import { useGoBack } from '@/app/hooks/use-go-back';
import { stripHashtags } from '@/lib/utils';
import { LetterPositionStoryDialog, type PositionStoryDialogState } from '@/app/components/letters/letter-position-story-dialog';
import { CanvasShareControl } from '@/app/components/canvas/canvas-share-control';
import { CanvasAddStoryDialog, type CanvasAddStoryState } from '@/app/components/canvas/canvas-add-story-dialog';
import { SharedIcon } from '@/app/components/canvas/canvas-audience';
import { composerVisibilityCopy, sharedIconLabel } from '@/lib/canvas-audience-copy';
import { CANVAS_BOXES, CANVAS_LAYERS, canvasBoxOf, canvasPath, groupPointsByBox, normalizeProjectTag, type CanvasBoxTag } from '@/lib/canvas-boxes';
import type {
  PointPositionWithUser,
  PointWithUserPosition,
  PositionType,
  StoryWithAuthor,
} from '@/app/types';

/** Reading order: layer by layer, box by box (sixth round R1). The same order at every width (a
 *  phone stacks it), and Previous / Next walk it. */
const READING_ORDER: readonly CanvasBoxTag[] = CANVAS_LAYERS.flatMap(l => l.boxes);
const ORDERED_BOXES = [...CANVAS_BOXES].sort((a, b) => READING_ORDER.indexOf(a.tag) - READING_ORDER.indexOf(b.tag));
const BOX_TITLES = new Map<CanvasBoxTag, string>(CANVAS_BOXES.map(b => [b.tag, b.title]));

/** A small icon per box, so the canvas can be scanned by shape as well as by title. */
const BOX_ICONS: Record<CanvasBoxTag, LucideIcon> = {
  'canvas:segments': Users,
  'canvas:problem': CircleAlert,
  'canvas:solution': Lightbulb,
  'canvas:channels': Megaphone,
  'canvas:revenue': Coins,
  'canvas:metrics': BarChart3,
  'canvas:love': Gem,
  'canvas:good-at': Contrast,
  'canvas:world-needs': Handshake,
};
/** The canvas stays small: a box shows this many cards, and says how many more it holds (R2). */
const BOX_LIMIT = 2;

type CanvasData =
  | {
    status: 'ready';
    ownerId: string;
    ownerName: string;
    owner: Person;
    points: PointWithUserPosition[];
    stories: Map<string, StoryWithAuthor[]>;
    positions: Map<string, PointPositionWithUser[]>;
    /** P1515: 'private' (no entries) or 'shared'; never null on a canvas the viewer can read */
    visibility: CanvasVisibility;
    isOwner: boolean;
    /** 'link': the owner opened the canvas to anyone with the link */
    generalAccess: CanvasGeneralAccess;
    /** the entry that admits a reader (null for the owner) */
    via: CanvasVia | null;
    /** the owner's audience, for the lock label and the shared icon (null: not read or not the owner) */
    audience: AudienceEntry[] | null;
    /** ids of the stories others added through this canvas */
    addedStoryIds: string[];
    /** the version that is open, and every version of the canvas, newest first (P1515 phase 5) */
    version: string | null;
    versions: CanvasVersion[];
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
  // The open point lives in the address (`?point=`), so Back from a story or point page reopens
  // it. It opens only if it is one of the points THIS viewer's read returned.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { hash: urlHash } = useLocation();
  const requestedPointId = searchParams.get('point');
  // `?v=<version>` picks a version; with none, the newest opens.
  const requestedVersion = searchParams.get('v') || undefined;
  // "Anyone with the link" is an unguessable token that arrives in the address (`#k=`, the fragment Copy link
  // produces: a browser never sends a fragment to the server; or the older `?k=`). It is a capability, so it is
  // taken into tab storage on arrival and the address is replaced WITHOUT it. index.html's head script already does
  // that before any SDK loads; this is the same for an arrival it did not see (in-app navigation) and for tests. It
  // never rides internal navigation. Reads, writes, refresh, Back and the cache key use the stored token.
  const urlToken = linkTokenFromAddress(`?${searchParams.toString()}`, urlHash);
  if (urlToken && handle && projectTag) storeLinkToken(handle, projectTag, urlToken); // idempotent
  // The store is the only copy (its in-memory half covers blocked storage): the page keeps none of its own, so a clear
  // (sign-out in another tab, expiry) re-renders this page without a token even when the viewer id did not change.
  const tokenVersion = useSyncExternalStore(subscribeLinkTokens, linkTokenVersion, linkTokenVersion);
  /** The token NOW: requests and writes read it when they run, never from an earlier render. */
  const tokenNow = () => (handle && projectTag ? readLinkToken(handle, projectTag) : undefined);
  const linkToken = tokenNow();
  const key = `${viewerId ?? ''}|${handle ?? ''}|${projectTag ?? ''}|${linkToken ?? ''}|${requestedVersion ?? ''}`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Back to a canvas shows it as it was left, from the shared return cache (P1364 rules: POP only,
  // cleared on any auth change and after every own write; a read from an older generation is
  // never written back).
  const navigationType = useNavigationType();
  const cacheKey = listReturnCacheKey(viewerId, `${canvasPath(handle ?? '', projectTag ?? '')}${requestedVersion ? `?v=${requestedVersion}` : ''}`, linkToken ?? '');
  // The viewer + address on screen NOW. A callback from a card that outlived its viewer (a vote
  // settling after sign-out) must not start a read for the old key: it would supersede the
  // current read and leave the page loading.
  const keyRef = useRef(key);
  keyRef.current = key;
  // Bumped when the panel closes: a signed-out vote lives only in the browser, so the box cards
  // re-read it then.
  const [panelCloses, setPanelCloses] = useState(0);
  const requestRef = useRef(0);
  // The key a no-?v load adopted for itself: arriving there is not a new address to read.
  const adoptedKeyRef = useRef<string | null>(null);
  const pendingAdoptRef = useRef<{ from: string; to: string; version: string } | null>(null);

  // What is on screen, for `read`: a refresh with nothing ready on screen is a first load.
  const loadedRef = useRef<Loaded | null>(null);
  loadedRef.current = loaded;

  /** `refresh`: a re-read of what is already on screen (panel open/close, a withdrawn
   *  position). Its failure keeps the rows already shown instead of replacing the grid; a
   *  canvas that no longer exists (not-found) is shown as such. */
  const read = useCallback(async (forKey: string, refresh = false) => {
    if (forKey !== keyRef.current) return;
    const onScreen = loadedRef.current;
    const keepOnError = refresh && onScreen?.key === forKey && onScreen.data.status === 'ready';
    const rid = ++requestRef.current;
    const generation = listReturnCacheGeneration();
    const settle = (data: CanvasData) => {
      if (rid !== requestRef.current || forKey !== keyRef.current) return;
      if (keepOnError && data.status === 'error') return;
      // With no ?v on a canvas of several versions, the version that opened is written into the address (replace), so Back and a
      // reload return to THAT version, never to an older one a cached no-?v entry could serve after a newer version appears.
      const adopt = data.status === 'ready' && !requestedVersion && data.versions.length >= 2 && data.version ? data.version : null;
      const adoptedKey = adopt ? `${forKey.slice(0, forKey.lastIndexOf('|') + 1)}${adopt}` : null;
      if (data.status === 'ready' && generation === listReturnCacheGeneration()) {
        writeListReturnCache(adopt ? listReturnCacheKey(viewerId, `${canvasPath(handle ?? '', projectTag ?? '')}?v=${adopt}`, linkToken ?? '') : cacheKey, 'canvas', data);
      }
      // The audience is live: a canvas this viewer can no longer read must not come back from the
      // Back cache. (The cache has no per-key delete; a clear costs other lists one refetch.)
      if (data.status === 'not-found') clearListReturnCache();
      if (adopt && adoptedKey) pendingAdoptRef.current = { from: forKey, to: adoptedKey, version: adopt };
      setLoaded({ key: forKey, data });
    };
    if (!handle || !projectTag) return settle({ status: 'not-found' });
    // Signed out is asked too: get_canvas gives a visitor content only while the owner has opened the
    // canvas to anyone with the link, and the same empty answer (shown as not-found) otherwise.
    try {
      const owner = await getProfileBySlugResult(handle, { withRelations: false });
      if (!owner.success) return settle({ status: owner.error === 'not_found' ? 'not-found' : 'error' });
      // Load time: the owner's audience needs only the owner, so it is read alongside the canvas.
      const viewerIsOwner = viewerId === owner.data.id;
      // undefined = the read failed (null = not the owner, nothing to read)
      const audienceRead: Promise<AudienceEntry[] | null | undefined> = viewerIsOwner
        ? canvasService.getAudience(projectTag).catch(() => undefined)
        : Promise.resolve(null);
      // ONE read for everyone (P1515): the owner and admitted readers get the canvas, anyone else
      // gets nothing, which is shown as not-found exactly as an unknown canvas is.
      // A version is passed only when `?v=` names one: otherwise the call is the one it always was.
      const view = requestedVersion
        ? await canvasService.getCanvas(owner.data.id, projectTag, viewerId, readLinkToken(handle, projectTag), requestedVersion)
        : await canvasService.getCanvas(owner.data.id, projectTag, viewerId, readLinkToken(handle, projectTag));
      // No points: not-found for everyone, EXCEPT the owner of a canvas that has a record (an open link or audience
      // entries): they must still reach the share control to close it (review), so they get the canvas with an empty state.
      if (view.points.length === 0 && !(view.isOwner && view.canvasExists)) return settle({ status: 'not-found' });
      const audienceResult = await audienceRead;
      // A refresh whose audience read failed keeps the audience already loaded for this canvas; only
      // a first load has none to keep (null: shown as the "could not be read" wording).
      const shown = loadedRef.current;
      const previous = shown?.key === forKey && shown.data.status === 'ready' ? shown.data.audience : null;
      const audience = audienceResult === undefined ? previous : audienceResult;
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
        points: view.points,
        stories: view.stories,
        positions: view.positions,
        visibility: view.visibility ?? 'private',
        isOwner: view.isOwner,
        generalAccess: view.generalAccess,
        via: view.via,
        audience,
        addedStoryIds: view.addedStoryIds,
        version: view.version ?? null,
        versions: view.versions ?? [],
      });
    } catch {
      settle({ status: 'error' });
    }
  }, [handle, projectTag, viewerId, cacheKey, requestedVersion, linkToken]);

  // Wait for the session check: reading before it would show the owner the public canvas first.
  useEffect(() => {
    if (!sessionChecked) return;
    if (adoptedKeyRef.current === key) { adoptedKeyRef.current = null; return; } // the page's own address write, data already on screen
    const back = navigationType === 'POP' ? readListReturnCache<CanvasData>(cacheKey, 'canvas') : undefined;
    if (back) {
      requestRef.current++; // a read still in flight for an earlier address must not land now
      setLoaded({ key, data: back });
      // The owner's Back shows the canvas as left (P1364). A reader's access is live, so theirs is
      // followed by a silent read: still admitted, nothing changes; no longer, it becomes not-found.
      if (back.status === 'ready' && !back.isOwner) {
        loadedRef.current = { key, data: back }; // so a failing refresh keeps what the cache served
        void read(key, true);
      }
      return;
    }
    void read(key);
    // navigationType is deliberately NOT a dependency: whether to serve the Back cache is decided once per
    // address (key), from the navigation that brought the viewer here. A panel opening or closing re-renders
    // without changing the key, and must not re-serve the cache (nor bump the request counter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, key, read, cacheKey]);

  // Anything read for another viewer or address is not shown — not even for one render.
  const current = sessionChecked && loaded && loaded.key === key ? loaded.data : null;
  const ready = current?.status === 'ready' ? current : null;

  // Founder, sixth round: disagreement found fast — in every box the most contested card comes
  // first (the smaller side biggest), then the rest in canvas order. Previous / Next follow it too.
  const boxes = ready ? sortBoxesByContest(groupPointsByBox(ready.points), ready.positions) : null;
  const ordered = boxes ? ORDERED_BOXES.flatMap(b => boxes.get(b.tag) ?? []) : [];

  // Compare lives in the address too (`?with=`), so a shared link opens the same view.
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
  // `panel`: a pushed entry marks a panel (closing it steps Back); a version change is not a panel, so it carries no mark.
  const setParams = useCallback((changes: Record<string, string | null>, push = false, panel = true) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v); else next.delete(k);
      return next;
    }, push ? (panel ? { state: { canvasPanel: true } } : {}) : { replace: true, state: locationStateRef.current });
  }, [setSearchParams]);
  // Write the adopted version into the address (replace) and move what is on screen to that address in the same render.
  useEffect(() => {
    const pending = pendingAdoptRef.current;
    if (!pending || !loaded || loaded.key !== pending.from || keyRef.current !== pending.from) return;
    pendingAdoptRef.current = null;
    adoptedKeyRef.current = pending.to;
    setLoaded({ key: pending.to, data: loaded.data });
    setParams({ v: pending.version });
  }, [loaded, setParams]);
  const openIndex = requestedPointId ? ordered.findIndex(p => p.id === requestedPointId) : -1;
  const openPoint = openIndex >= 0 ? ordered[openIndex] : null;
  // R2: a box's "N more" opens the whole box in the panel (`?box=`); a point opened from that list
  // sits on top of it, so Back returns to the list.
  const requestedBox = searchParams.get('box') as CanvasBoxTag | null;
  const openBox = !openPoint && requestedBox && boxes?.has(requestedBox) ? requestedBox : null;

  // The close button and Escape: step Back off the entry the card or "N more" pushed — through
  // useGoBack, the one place that may pop (P1364) — one level: a point opened from a box's list
  // returns to the list. Its fallback, and the close of a panel opened from the address (no entry
  // of ours behind it), drop that one level from the address.
  const topLevel = requestedPointId ? 'point' : 'box';
  const withoutTop = new URLSearchParams(searchParams);
  withoutTop.delete(topLevel);
  const restQuery = withoutTop.toString();
  const goBack = useGoBack(`${location.pathname}${restQuery ? `?${restQuery}` : ''}`);
  const closePanel = useCallback(() => {
    if ((locationStateRef.current as { canvasPanel?: boolean } | null)?.canvasPanel) goBack();
    else setParams({ [topLevel]: null });
  }, [goBack, setParams, topLevel]);

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
  const requestedBoxRef = useRef(requestedBox);
  requestedBoxRef.current = requestedBox;
  const openBoxPanel = useCallback((box: CanvasBoxTag) => {
    setParams({ box }, !requestedPointRef.current && !requestedBoxRef.current);
    // The side panel opening re-reads: access removed since the page loaded shows the reduced view.
    void read(key, true);
  }, [key, read, setParams]);

  // P1515: the audience is live, so the canvas is read again when the tab REGAINS focus — never
  // served from the Back cache. Only after the tab was actually away (blur, or hidden): a focus with
  // no leaving before it is the navigation's own and would defeat "Back shows it as left". What was
  // already on screen is not recalled; the next read decides.
  const isReady = ready !== null;
  const awayRef = useRef(false);
  useEffect(() => {
    if (!isReady) return;
    const leave = () => { awayRef.current = true; };
    const returned = () => {
      if (document.visibilityState === 'hidden' || !awayRef.current) return;
      awayRef.current = false;
      void read(keyRef.current, true);
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') leave(); else returned(); };
    window.addEventListener('blur', leave);
    window.addEventListener('focus', returned);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', returned);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isReady, read]);

  // The link token has been taken into tab storage above: replace the address (query AND fragment) without it, at
  // once and before any other navigation. (Declared before the point-anchor effect below, which also strips it.)
  useEffect(() => {
    if (!urlToken) return;
    const query = new URLSearchParams(location.search);
    query.delete('k');
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    fragment.delete('k');
    navigate(
      { pathname: location.pathname, search: query.toString() ? `?${query}` : '', hash: fragment.toString() ? `#${fragment}` : '' },
      { replace: true, state: locationStateRef.current },
    );
  }, [urlToken, location.pathname, location.search, location.hash, navigate]);
  // The tokens are cleared by the auth lifecycle (AuthContext, api.signOut, useClearLinkTokensOnAuthChange in App.tsx),
  // even while this page is not mounted. When that happens under this page, what the Back cache holds for the canvas was
  // read WITH the token and must not be served again: drop it (the re-read itself follows from the key, which changed).
  const seenTokenVersion = useRef(tokenVersion);
  useEffect(() => {
    if (seenTokenVersion.current === tokenVersion) return;
    seenTokenVersion.current = tokenVersion;
    clearListReturnCache();
  }, [tokenVersion]);

  // A point opened from the address (a shared link, a reload of an old tab): put the canvas itself
  // behind it and mark the point's entry, as a card click does — so Back (the browser's, a phone's
  // swipe) closes the point and stays on the canvas instead of leaving it (review).
  const openPointId = openPoint?.id ?? null;
  // Once per point: the two navigations below must never run twice for the same arrival (review).
  const anchoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!openPointId || anchoredRef.current === openPointId) return;
    if ((locationStateRef.current as { canvasPanel?: boolean } | null)?.canvasPanel) return;
    anchoredRef.current = openPointId;
    // The link token is never carried into history. (Belt and braces: the strip effect above normally lands first
    // in the same commit, so this drop is not independently observable in a test.)
    const withPoint = new URLSearchParams(window.location.search);
    withPoint.delete('k');
    const hereQuery = withPoint.toString();
    const here = `${window.location.pathname}${hereQuery ? `?${hereQuery}` : ''}`;
    const params = new URLSearchParams(withPoint);
    params.delete('point');
    const rest = params.toString();
    navigate(`${window.location.pathname}${rest ? `?${rest}` : ''}`, { replace: true, state: locationStateRef.current });
    navigate(here, { state: { canvasPanel: true } });
  }, [openPointId, navigate]);

  // A position taken or withdrawn in the panel: re-read (the effect above), so the names under
  // the point and the box card behind the panel show it (a signed-out one is re-read from the
  // browser by the box card's remount).
  const refresh = useCallback(() => setPanelCloses(n => n + 1), []);

  // D5: the owner as their profile shows them on the open point. Agent or not decides the ear
  // count (an agent holds no reputation, P1104), read once per canvas.
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const ownerId = ready?.ownerId ?? null;
  const ownerIsAgent = !!ownerId && isAgentAccountId(ownerId);
  const [ownerEar, setOwnerEar] = useState<{ ownerId: string; ear: number } | null>(null);
  useEffect(() => {
    if (!ownerId || identityPending || ownerIsAgent) return;
    let live = true;
    calibrationService.getEarsCount(ownerId)
      .then(ear => { if (live) setOwnerEar({ ownerId, ear }); })
      // No count is shown rather than a wrong one; the rest of the card stands.
      .catch(() => undefined);
    return () => { live = false; };
  }, [ownerId, identityPending, ownerIsAgent]);

  // D6: the open point's "Filter by position" state lives here, never in the address: the filter
  // resets when the point changes, and an expanded story is remembered per point.
  const [positionsFilter, setPositionsFilter] = useState<{ pointId: string; filter: PositionFilter } | null>(null);
  const [expandedStories, setExpandedStories] = useState<Record<string, string | null>>({});
  // Founder, sixth round: "+ Add a story" stays on the canvas — the letters' in-place composer.
  const [storyDialog, setStoryDialog] = useState<PositionStoryDialogState | null>(null);
  // P1515: a reader's story is a NEW private story saved through the checked function (the owner's
  // stays an ordinary one, above).
  const [readerStoryDialog, setReaderStoryDialog] = useState<CanvasAddStoryState | null>(null);
  const closeStoryDialog = useCallback(() => {
    setStoryDialog(null);
    setReaderStoryDialog(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="canvas-point-panel"]')?.focus());
  }, []);

  // The filter resets when the point changes — also on the way back to a point filtered earlier.
  if (positionsFilter && positionsFilter.pointId !== (openPoint?.id ?? null)) setPositionsFilter(null);

  if (current?.status === 'not-found') return <NotFoundPage />;

  const openPositions = openPoint && ready ? ready.positions.get(openPoint.id) ?? [] : [];
  const previousPoint = openIndex > 0 ? ordered[openIndex - 1] : undefined;
  const nextPoint = openIndex >= 0 ? ordered[openIndex + 1] : undefined;
  const cardOwner: FeedPointCardOwner | undefined = openPoint && ready
    ? {
      id: ready.ownerId,
      name: ready.ownerName,
      avatarUrl: ready.owner.photoUrl,
      avatarColor: ready.owner.avatarColor,
      hasPledged: ready.owner.hasPledged,
      ear: !ownerIsAgent && ownerEar?.ownerId === ready.ownerId ? ownerEar.ear : undefined,
      position: openPositions.find(p => p.userId === ready.ownerId)?.position ?? null,
      isAgent: ownerIsAgent,
      identityPending,
    }
    : undefined;

  const compare = basePerson && withPerson
    ? { base: basePerson, baseId, baseIsViewer: !!viewerId, other: withPerson }
    : null;
  // P1515: the one visibility idea. 'shared' marks the header, every point and every story inside.
  const viewerIsOwner = !!ready && ready.isOwner;
  const sharedLabel = ready?.visibility === 'shared'
    ? sharedIconLabel({ isOwner: viewerIsOwner, entries: ready.audience, via: ready.via, generalAccess: ready.generalAccess })
    : null;
  const addedStoryIds = new Set(ready?.addedStoryIds ?? []);
  const composerNote = ready
    ? composerVisibilityCopy({ isOwner: viewerIsOwner, ownerName: ready.ownerName, entries: ready.audience, visibility: ready.visibility, generalAccess: ready.generalAccess })
    : '';
  // The checked writes for the open point's card (positions), and the one for taking an added story off.
  const canvasBindings = (point: PointWithUserPosition): FeedPointCardCanvas | undefined => ready && projectTag
    ? {
      setPosition: position => canvasService.setPosition(ready.ownerId, projectTag, point.id, position, tokenNow()),
      removePosition: () => canvasService.removePosition(ready.ownerId, projectTag, point.id, tokenNow()),
      reader: !viewerIsOwner,
      readOnly: !viewerId,
      sharedLabel,
      ownStoryAdded: (ready.stories.get(point.id) ?? []).some(st => addedStoryIds.has(st.id) && st.authorId === viewerId),
    }
    : undefined;
  const removeAddedStory = async (storyId: string) => {
    try {
      await canvasService.removeAddedStory(storyId);
      refresh();
    } catch {
      toast.error('Failed to remove your story. Please try again.');
    }
  };
  const renderCard = (point: PointWithUserPosition) => ready && (
    <CanvasCard
      key={`${point.id}:${panelCloses}`}
      point={point}
      viewerId={viewerId}
      positions={ready.positions.get(point.id) ?? []}
      compare={compare}
      selected={point.id === openPoint?.id}
      sharedLabel={sharedLabel}
      onOpen={() => openPanel(point.id, true)}
    />
  );
  const openBoxTitle = openBox ? BOX_TITLES.get(openBox) : undefined;

  return (
    <div className="flex flex-col px-4 pb-24 pt-3 lg:px-6 lg:pb-8">
      {ready && <SEO title={`${ready.ownerName} · #${ready.version ?? projectTag} — Clarity Pledge`} noIndex />}
      {/* R10: the name of the thing first, then whose it is and which one: "Clarity Canvas" on its
          own line; under it "by <owner>" and the canvas's name (the menu, when the owner has more
          than one), then Compare, wrapping under them when the row is too narrow. */}
      <header className="mb-4 flex flex-col gap-2" data-testid="canvas-header-row">
        <h1 className="text-3xl font-bold text-foreground md:text-4xl">Clarity Canvas</h1>
        {/* Founder, sixth round: Compare sits right after the canvas name, so the line reads
            "by <owner> · <canvas> · Compare with someone…", not across the page. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-2 text-base max-sm:contents md:text-lg" data-testid="canvas-byline">
            {ready ? (
              // ml-1 on the photo: the pledge ring draws outside it; keep it inside the gutter.
              <span className="ml-1 flex min-w-0 max-w-full items-center gap-2.5 max-sm:order-1 max-sm:w-full" data-testid="canvas-owner">
                <GravatarAvatar
                  name={ready.owner.name}
                  photoUrl={ready.owner.photoUrl}
                  avatarColor={ready.owner.avatarColor}
                  isPledger={ready.owner.hasPledged}
                  isAgent={ownerIsAgent}
                  identityPending={identityPending}
                  size="sm"
                />
                <span className="min-w-0 truncate text-foreground">
                  by{' '}
                  <Link
                    to={`/p/${handle}`}
                    className="rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    data-testid="canvas-owner-name"
                  >
                    {ready.ownerName}
                  </Link>
                </span>
              </span>
            ) : (
              current?.status !== 'error' && <span className="h-8 w-48 animate-pulse rounded bg-muted" aria-hidden />
            )}
            {ready && (
              <span className="flex min-w-0 max-w-full items-center gap-2 max-sm:order-2 max-sm:flex-1 max-sm:flex-wrap" data-testid="canvas-project-slot">
                <span aria-hidden className="hidden shrink-0 text-foreground/40 sm:inline">·</span>
                {/* The dropdown lists the versions of THIS canvas, for owner and readers alike; one version is just its name.
                    Separate canvases are reached by their own address. */}
                {ready.versions.length >= 2
                  ? <VersionSwitcher versions={ready.versions} open={ready.version ?? ready.versions[0]?.name ?? ''} onPick={v => setParams({ v, point: null, box: null }, true, false)} />
                  : <span className="min-w-0 truncate font-medium text-foreground" data-testid="canvas-project-tag">{projectTag}</span>}
              </span>
            )}
          </div>
          {/* P1515: Share sits immediately right of Compare, in the same row. */}
          {ready && (
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 max-sm:contents" data-testid="canvas-actions">
              <ComparePicker
                base={basePerson}
                others={others}
                withPerson={withPerson}
                onCompare={id => setParams({ with: id })}
              />
              {projectTag && viewerIsOwner && (
                <CanvasShareControl
                  name={projectTag}
                  visibility={ready.visibility}
                  generalAccess={ready.generalAccess}
                  link={`${window.location.origin}${canvasPath(handle ?? '', projectTag)}`}
                  entries={ready.audience}
                  onChanged={refresh}
                />
              )}
            </div>
          )}
        </div>
        {/* P1515: a reader's one line (the owner's Share button is in the title row above). */}
        {ready && projectTag && !viewerIsOwner && (ready.via || ready.generalAccess === 'link') && (
          <p className="flex min-w-0 items-center gap-2 text-sm text-foreground/80" data-testid="canvas-shared-with-you">
            <SharedIcon label={sharedLabel ?? 'Shared with you'} />
            <span className="min-w-0">
              {ready.via ? (
                <>
                  {ready.via.kind === 'person' ? 'Shared with you by' : 'Shared with you through'}{' '}
                  {ready.via.kind === 'event' && ready.via.slug ? (
                    <Link to={`/events/${ready.via.slug}`} className="rounded-sm font-medium text-blue-600 hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" data-testid="canvas-shared-via">
                      {ready.via.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground" data-testid="canvas-shared-via">{ready.via.name}</span>
                  )}
                </>
              ) : (
                <span data-testid="canvas-shared-link">Anyone with the link can see this canvas</span>
              )}
            </span>
          </p>
        )}
        {ready && ready.points.length === 0 && (
          // The owner of a canvas that has a record but no current points: the share control above still works.
          <p className="text-sm text-muted-foreground" data-testid="canvas-empty-owner">
            This canvas has no points yet. You can still change who has access above.
          </p>
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
        <CanvasGrid boxes={boxes} renderCard={renderCard} onMore={openBoxPanel} />
      )}

      {/* One panel for both levels (R2), so stepping from a box's list into a point and back
          keeps it open, with focus inside. */}
      {(openPoint || openBox) && ready && (
        <PointPanel
          onClose={closePanel}
          label={openPoint ? `Point: ${openPoint.statement}` : `${openBoxTitle}`}
          viewKey={openPoint?.id ?? `box:${openBox}`}
          closeLabel={openPoint ? 'Close point' : 'Close box'}
          covered={storyDialog !== null || readerStoryDialog !== null}
          step={openPoint
            ? {
              box: BOX_TITLES.get(canvasBoxOf(openPoint.systemTags) as CanvasBoxTag),
              boxTag: canvasBoxOf(openPoint.systemTags) as CanvasBoxTag,
              onPrevious: previousPoint ? () => openPanel(previousPoint.id) : undefined,
              onNext: nextPoint ? () => openPanel(nextPoint.id) : undefined,
            }
            : { box: openBoxTitle, boxTag: openBox ?? undefined }}
        >
          {!openPoint && openBox ? (
            // R2: the whole box, as the same cards; one opens on top of this list.
            <div className="flex flex-col gap-2 pt-2" data-testid="canvas-panel-box-list">
              {(boxes?.get(openBox) ?? []).map(point => renderCard(point))}
            </div>
          ) : openPoint && (<>
          {/* Keyed by the point only: a re-read after a vote must not remount the card under the
              viewer's hand (a second tap adjusts the level of the position just taken). Stories
              start folded, as in the feed; the card shows the owner's story only (D5). */}
          <FeedPointCard
            key={openPoint.id}
            point={openPoint}
            // The card shows the OWNER's story (D5); stories others added through the canvas are
            // read in the block below. A reader who added one is not offered a second (ownStoryAdded).
            linkedStories={(ready.stories.get(openPoint.id) ?? []).filter(st => !addedStoryIds.has(st.id))}
            surface="canvas"
            owner={cardOwner}
            // Escape with the owner's story open closes the story, not the panel (review).
            collapseStoriesOnEscape
            // On the card, as on the /point page's card: how everyone spreads, and why it matters.
            spread={<PointSpreadRow counts={levelCounts(openPositions)} withInfo className="mt-2" />}
            // The project tag is where the reader already is: shown, not a link out to the feed.
            activeTag={ready?.version ?? projectTag ?? undefined}
            onPointRemoved={refresh}
            onPositionSaved={refresh}
            canvas={canvasBindings(openPoint)}
            onAddStory={() => {
              const position = openPositions.find(p => p.userId === viewerId)?.position ?? openPoint.userPosition?.position ?? undefined;
              if (!viewerIsOwner) return setReaderStoryDialog({ pointId: openPoint.id, position });
              setStoryDialog({
                mode: 'add',
                pointId: openPoint.id,
                position,
                // As /create does (P607): the owner's story inherits the point's visibility.
                visibility: openPoint.visibility === 'private' ? 'private' : 'public',
                // ...and a private one says who reads it on this canvas.
                audienceNote: composerNote,
              });
            }}
          />
          {/* D6: the point page's "Filter by position" block, counting from the canvas's one
              positions read; every author's linked stories come from the canvas's batch read. */}
          <div className="mt-4">
            <PointPositionsBlock
              positions={openPositions}
              counts={levelCounts(openPositions)}
              stories={ready.stories.get(openPoint.id) ?? []}
              viewerId={viewerId}
              filter={positionsFilter?.pointId === openPoint.id ? positionsFilter.filter : 'all'}
              onFilterChange={filter => setPositionsFilter({ pointId: openPoint.id, filter })}
              expandedId={expandedStories[openPoint.id] ?? null}
              onExpandedChange={next => setExpandedStories(prev => ({
                ...prev,
                [openPoint.id]: typeof next === 'function' ? next(prev[openPoint.id] ?? null) : next,
              }))}
              storyShownAbove={ready.ownerId}
              collapseOnEscape
              canvas={{ sharedLabel, addedStoryIds, onRemoveAddedStory: id => void removeAddedStory(id) }}
            />
          </div>
          </>)}
        </PointPanel>
      )}
      {/* After the panel, so it portals above it. Saved: re-read, so the card shows "Your story".
          Closed either way: focus back into the panel (no trigger for Radix to return it to). */}
      <LetterPositionStoryDialog
        state={storyDialog}
        onClose={closeStoryDialog}
        onSaved={() => { closeStoryDialog(); refresh(); }}
      />
      <CanvasAddStoryDialog
        state={readerStoryDialog}
        audienceNote={composerNote}
        onSave={(pointId, content) => ready && projectTag
          ? canvasService.addStory(ready.ownerId, projectTag, pointId, content, tokenNow()).then(() => undefined)
          : Promise.reject(new Error('canvas not ready'))}
        onClose={closeStoryDialog}
        onSaved={() => { closeStoryDialog(); refresh(); }}
      />
    </div>
  );
}

/**
 * P1535: the three layers of three boxes, each under its label, in one grid — three columns from
 * 1024px, two from 640px, one below. Every box is shown, filled or not, so the grid keeps its
 * shape. A row is as tall as its tallest box.
 */
function CanvasGrid({ boxes, renderCard, onMore }: {
  /** null while loading (skeletons) */
  boxes: Map<CanvasBoxTag, PointWithUserPosition[]> | null;
  renderCard: (point: PointWithUserPosition) => ReactNode;
  onMore: (box: CanvasBoxTag) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="canvas-grid" aria-busy={boxes === null}>
      {CANVAS_LAYERS.map((layer, i) => (
        <section key={layer.title} aria-label={layer.title} className="contents" data-testid="canvas-layer">
          {/* Founder, sixth round: the layers did not read as groups — a rule above, a bigger title,
              and more room between layers than between boxes. */}
          <h2 className={`col-span-full flex items-baseline gap-2.5 text-base font-semibold tracking-tight text-foreground md:text-lg ${i === 0 ? '' : 'mt-6'}`} data-testid="canvas-layer-title">
            {/* Founder, sixth round: the rules between layers read oddly — whitespace groups them,
                and a number says they are read in order (founder: plain grey, the blue pill distracted). */}
            <span aria-hidden className="font-mono text-sm font-medium text-foreground/40" data-testid="canvas-layer-number">{String(i + 1).padStart(2, '0')}</span>
            <span data-testid="canvas-layer-name">{layer.title}</span>
          </h2>
          {layer.boxes.map(tag => (
            <CanvasBox
              key={tag}
              tag={tag}
              title={BOX_TITLES.get(tag) ?? tag}
              points={boxes ? boxes.get(tag) ?? [] : null}
              renderCard={renderCard}
              onMore={() => onMore(tag)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

/** The box's icon in a small tinted circle, like the pin on every point card. */
function BoxIcon({ tag, className = '' }: { tag: CanvasBoxTag; className?: string }) {
  const Icon = BOX_ICONS[tag];
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 ${className}`.trim()} data-testid="canvas-box-icon">
      <Icon aria-hidden className="h-4 w-4" />
    </span>
  );
}

function sortBoxesByContest(
  boxes: Map<CanvasBoxTag, PointWithUserPosition[]>,
  positions: Map<string, PointPositionWithUser[]>,
): Map<CanvasBoxTag, PointWithUserPosition[]> {
  const score = (p: PointWithUserPosition) => contestScore(levelCounts(positions.get(p.id) ?? []));
  return new Map([...boxes].map(([tag, points]) => [tag, [...points].sort((a, b) => score(b) - score(a))]));
}

/**
 * D3, R2: a sentence-case title with its outline icon, no count; at most two cards and "N more",
 * which opens the whole box in the panel. An empty box reads "Empty" to everyone: owners change the
 * canvas through their agent, so there is nothing to offer here.
 */
function CanvasBox({ tag, title, points, renderCard, onMore }: {
  tag: CanvasBoxTag;
  title: string;
  /** null while loading (skeleton) */
  points: PointWithUserPosition[] | null;
  renderCard: (point: PointWithUserPosition) => ReactNode;
  onMore: () => void;
}) {
  const headingId = `canvas-box-${tag.replace(':', '-')}`;
  const empty = points !== null && points.length === 0;
  // Founder, sixth round: "1 more" promised one card and opened all of them — the label now says
  // what opens.
  const hidden = points ? Math.max(0, points.length - BOX_LIMIT) : 0;
  const titleColour = empty ? 'text-foreground/60' : 'text-foreground';

  return (
    <section
      aria-labelledby={headingId}
      data-testid={`canvas-box-${tag}`}
      data-empty={empty || undefined}
      // Founder (fifth round): white on white hid everything — a grey box holds white cards.
      className={`flex min-w-0 flex-col rounded-xl border border-border bg-muted/60 p-2 sm:p-2.5`}
    >
      <div className="mb-1.5 flex min-w-0 items-center gap-2">
        {/* The icon in a small tinted circle, like the pin on every point card. */}
        <BoxIcon tag={tag} className={empty ? 'opacity-60' : ''} />
        <h3 id={headingId} className={`text-sm font-semibold ${titleColour}`}>{title}</h3>
      </div>
      {points === null ? (
        <div className="h-24 animate-pulse rounded-md bg-background" aria-hidden />
      ) : empty ? (
        <p className="text-sm text-foreground/60">Empty</p>
      ) : (
        <div className="flex flex-col gap-2" data-testid="canvas-box-list">
          {points.slice(0, BOX_LIMIT).map(point => renderCard(point))}
          {hidden > 0 && (
            <button
              type="button"
              id={`canvas-more-${tag.replace(':', '-')}`}
              onClick={onMore}
              aria-haspopup="dialog"
              data-testid="canvas-box-more"
              className="min-h-10 self-end rounded-sm text-sm font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              See all {points.length}
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

/** Filled grey pills with a chevron, so a menu never looks like one of the white canvas cards. */
const PILL = 'relative inline-flex h-10 min-w-0 max-w-full items-center rounded-full text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-blue-500';
const SELECT = 'h-full min-w-0 max-w-[12rem] max-sm:max-w-none max-sm:flex-1 cursor-pointer appearance-none truncate rounded-full bg-transparent pr-8 text-base font-medium focus:outline-none md:text-sm';

/** P1515 phase 5: the canvas's versions, newest first with a date, for everyone the canvas admits. Same outline pill as the
 *  canvas picker; choosing one puts it in the address (`?v=`). */
function VersionSwitcher({ versions, open, onPick }: { versions: CanvasVersion[]; open: string; onPick: (version: string) => void }) {
  const dateOf = (iso: string | null) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  };
  return (
    <label className={`${PILL} border border-foreground/40 bg-muted text-foreground hover:bg-muted/70 max-sm:w-full`} data-testid="canvas-version-picker">
      <select
        aria-label="Version"
        value={open}
        onChange={e => onPick(e.target.value)}
        className={`${SELECT.replace('max-w-[12rem]', 'max-w-[20rem]')} pl-3`}
        data-testid="canvas-version-select"
      >
        {versions.map(v => {
          const date = dateOf(v.createdAt);
          return <option key={v.name} value={v.name}>{date ? `${v.name} · ${date}` : v.name}</option>;
        })}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 h-4 w-4 opacity-70" />
    </label>
  );
}

/** Who to compare with — the compare page's person picker in small (R14: no link to the full page). */
function ComparePicker({ base, others, withPerson, onCompare }: {
  base: Person | null;
  others: CanvasPerson[];
  withPerson: CanvasPerson | null;
  onCompare: (id: string | null) => void;
}) {
  // Nobody else to compare with: the pill is absent, not disabled (P955).
  if (!base || others.length === 0) return null;
  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 max-sm:order-4 max-sm:basis-full" data-testid="canvas-controls">
      <label
        // Founder, sixth round: Compare is a main action but read as a grey filter — a blue
        // outline until someone is picked.
        className={`${PILL} pl-3 ${withPerson ? 'border border-blue-300 bg-blue-50 text-blue-800' : 'border border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
        data-testid="canvas-compare-picker"
      >
        {/* Founder, sixth round: only the arrow opened the menu — the words sat beside it. The
            words are now what shows, and the menu lies invisibly over the whole pill, so any tap
            on it opens the list. */}
        <span aria-hidden className="truncate pr-8">
          {withPerson ? <><span className="text-foreground/70">Comparing with </span>{withPerson.name}</> : 'Compare positions'}
        </span>
        <select
          aria-label="Compare positions with"
          value={withPerson?.id ?? ''}
          onChange={e => onCompare(e.target.value || null)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
        >
          {/* Nobody picked: the list holds only people (the placeholder is hidden from it). */}
          {withPerson ? <option value="">No one</option> : <option value="" disabled hidden>Compare positions</option>}
          {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 h-4 w-4 opacity-70" />
      </label>
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
 * A box card (D4): text to read, no controls inside; the whole card opens the point. Under the
 * statement, always: how everyone spreads, and "Contested" when at least two people stand on each
 * side. When Compare is set, two people's positions in the compare page's columns, small (D8); a
 * person with no position reads "No position", and the card stays where it is.
 */
function CanvasCard({ point, viewerId, positions, compare, selected, sharedLabel, onOpen }: {
  point: PointWithUserPosition;
  viewerId?: string;
  positions: PointPositionWithUser[];
  compare: { base: Person; baseId: string; baseIsViewer: boolean; other: CanvasPerson } | null;
  selected: boolean;
  /** the shared icon's words; null: the canvas is private to its owner (no icon) */
  sharedLabel: string | null;
  onOpen: () => void;
}) {
  // Everyone, the owner included: the same read the open point's card and block count from.
  const counts = levelCounts(positions);
  // The viewer's own position (signed in: the read; signed out: what this browser kept).
  const positionOf = (userId: string) => positions.find(p => p.userId === userId)?.position;
  const viewerPosition = viewerId
    ? point.userPosition?.position ?? positionOf(viewerId)
    : (getAnonPosition(point.id) as PositionType | null) ?? undefined;
  const basePosition = compare
    ? (compare.baseIsViewer ? viewerPosition ?? positionOf(compare.baseId) : positionOf(compare.baseId))
    : undefined;
  const otherPosition = compare ? positionOf(compare.other.id) : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`canvas-point-card-${point.id}`}
      data-selected={selected || undefined}
      className={`group w-full rounded-lg border bg-card p-2.5 text-left shadow-sm transition-all duration-150 hover:-translate-y-px hover:border-blue-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selected ? 'border-blue-500 ring-2 ring-blue-500' : 'border-border'}`}
    >
      <p className="line-clamp-4 break-words text-sm font-medium text-foreground">
        {/* One visibility idea: the canvas's audience, not the point's own flag, decides who reads it. */}
        {sharedLabel && <><SharedIcon label={sharedLabel} />{' '}</>}
        {stripHashtags(point.statement, point.tags)}
      </p>
      {/* The card's spread row (no info button: the card is itself one button). Founder, sixth
          round: nothing invited a click — a quiet chevron, always visible (phones have no hover). */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <PointSpreadRow counts={counts} testId="canvas-card-spread-row" />
        <ChevronRight aria-hidden data-testid="canvas-card-open" className="h-4 w-4 shrink-0 text-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      {compare && (
        <div className="mt-2 flex items-start gap-2" data-testid="canvas-card-compare">
          <StanceColumn
            compact
            muted={!basePosition}
            person={{ ...compare.base, name: firstName(compare.base.name) }}
            label={stanceLabel(basePosition, compare.baseIsViewer)}
          />
          <div className="w-px self-stretch bg-border" />
          <StanceColumn
            compact
            muted={!otherPosition}
            person={{ ...compare.other, name: firstName(compare.other.name) }}
            label={stanceLabel(otherPosition, false)}
          />
        </div>
      )}
    </button>
  );
}

/**
 * The open point: a side panel on desktop, a full-screen sheet on mobile — modal on both. The
 * page behind is made `inert` (no focus, no clicks) and a backdrop closes it. Not the Radix
 * dialog: that one locks pointer events on <body>, and the position buttons' menu renders in a
 * portal on <body>, outside the panel. Escape and the close button dismiss it (below 1024px,
 * FocusHeader's back arrow); focus moves in and back. Previous / Next walk the canvas without
 * closing it.
 */
function PointPanel({ children, onClose, label, viewKey, closeLabel = 'Close point', step, covered = false }: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  /** what the panel shows: a point's id, or `box:<tag>` for a box's list */
  viewKey: string;
  closeLabel?: string;
  step: { box?: string; boxTag?: CanvasBoxTag; onPrevious?: () => void; onNext?: () => void };
  /** A dialog the page opened over the panel (the story composer): its keys are its own. */
  covered?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Read at keydown: the composer's Escape closes it first, and focus falls to <body> before
  // this listener runs — without this, the same Escape would close the panel too (review).
  const coveredRef = useRef(covered);
  coveredRef.current = covered;
  // What is on screen when the panel closes (Previous / Next change it), for returning focus.
  const viewKeyRef = useRef(viewKey);
  viewKeyRef.current = viewKey;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // The box cards remount when the panel closes (a re-read), so the opener is found again by
    // its id ("N more") or its test id (a card, unique per point) rather than kept as an element.
    const openerTestId = opener?.getAttribute('data-testid');
    const openerSelector = opener?.id
      ? `#${CSS.escape(opener.id)}`
      : openerTestId ? `#root [data-testid="${CSS.escape(openerTestId)}"]` : null;
    panelRef.current?.focus();
    // Escape closes the panel — unless focus is in something the card opened above it (the share
    // sheet, a confirmation), which handles its own Escape.
    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || coveredRef.current) return;
      // Something inside handled this Escape already (the spread's info popover, an expanded
      // story): it closes only that.
      // Focus on <body> is still "in" the panel: it is modal and #root is inert, so focus can only
      // land there by falling out of it — a popover that closed, a control that went away (review).
      const inPanel = panel.contains(document.activeElement) || document.activeElement === document.body;
      if (e.key === 'Escape' && !e.defaultPrevented && inPanel) onCloseRef.current();
      // Tab wraps inside the panel (the page behind is inert; this keeps focus off the browser
      // chrome too). Only while focus is in the panel — a dialog the card opened keeps its own.
      if (e.key === 'Tab' && inPanel) {
        const focusables = Array.from(panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])',
        )).filter(el => el.offsetParent !== null);
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        if (!panel.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
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
      // The card of the point on screen at close (a box's list: none); else whatever opened the
      // panel, such as "N more" (never <body>, which is what a panel opened from the address starts with).
      const card = document.querySelector<HTMLElement>(`[data-testid="canvas-point-card-${viewKeyRef.current}"]`);
      const reopened = openerSelector ? document.querySelector<HTMLElement>(openerSelector) : null;
      const target = card ?? (opener?.isConnected && opener !== document.body ? opener : reopened);
      target?.focus?.();
    };
    // Opened once per panel; stepping to another point keeps it open (and keeps the opener).
  }, []);

  // A new point (or a box's list) starts at its top. Stepping to the first or last point removes the button just
  // pressed, which drops focus to <body> (outside the panel, where Escape and Tab no longer
  // reach it): take focus back into the panel.
  useEffect(() => {
    bodyRef.current?.scrollTo?.({ top: 0 });
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, [viewKey]);

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
        aria-label={label}
        tabIndex={-1}
        data-testid="canvas-point-panel"
        className="fixed inset-0 z-50 flex flex-col bg-background outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[480px] lg:border-l lg:border-border lg:shadow-xl"
      >
        {/* Founder, sixth round: the box name read smaller than the card under it. It is the
            breadcrumb: the box's own icon (as on the canvas), one size up, in a header bar. */}
        <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-muted/20 px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
          {/* Below 1024px the sheet fills the screen: the focus pages' back arrow, closing the
              panel (never leaving the canvas — P1364 drift-guard allowlist). */}
          <span className="pl-2 lg:hidden" data-testid="canvas-panel-back">
            <FocusHeader compact onBack={onClose} aria-label={closeLabel} />
          </span>
          {/* Which box this point sits in: Previous / Next cross from box to box. */}
          <span className="flex min-w-0 flex-1 items-center gap-2.5 px-2" data-testid="canvas-panel-box">
            {step.boxTag && <BoxIcon tag={step.boxTag} />}
            <span className="truncate text-base font-semibold tracking-tight text-foreground">{step.box}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="canvas-panel-close"
            className="hidden h-11 w-11 items-center justify-center rounded-full text-foreground/70 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:flex"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* px-2 on phones: the position buttons drop their labels below a 270px row, and the
            card's own padding and pin column leave about that much at 375px. */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 sm:px-4">{children}</div>
        {(step.onPrevious || step.onNext) && <nav
          aria-label="Points on this canvas"
          className="flex shrink-0 items-center justify-between border-t border-border px-2 py-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]"
        >
          {/* At either end the step is absent, not disabled (no dead controls, P955). Outline: a
              real alternative to reading on (R6). */}
          {step.onPrevious ? (
            <Button variant="outline" onClick={step.onPrevious} className="min-h-11 gap-1 border-blue-600 px-3 text-blue-600 hover:bg-blue-50 hover:text-blue-700" data-testid="canvas-panel-previous">
              <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
            </Button>
          ) : <span />}
          {step.onNext && (
            <Button variant="outline" onClick={step.onNext} className="min-h-11 gap-1 border-blue-600 px-3 text-blue-600 hover:bg-blue-50 hover:text-blue-700" data-testid="canvas-panel-next">
              Next <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </nav>}
      </div>
    </>,
    document.body,
  );
}
