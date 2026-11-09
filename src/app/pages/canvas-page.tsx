/**
 * @file canvas-page.tsx
 * @description P1508: Clarity Canvas — an owner's canvas at `/p/:handle/canvas/:projectTag` (R14).
 *
 * A canvas is its owner's current-version points that carry the reserved `canvas_<name>` system tag
 * and a box tag, placed into nine boxes in three named layers (P1535): Core assumptions,
 * Profitability assumptions, Founder-fit assumptions.
 *
 * READ FIRST, ACT ON OPEN (founder, event use): one grid in reading order, three columns from
 * 1024px, two from 640px, one below, each layer under its label, compact enough that a canvas with
 * one card per box fits one desktop screen (P1535). A box shows one card, then
 * "See all N", which opens the whole box in the panel (R2) — the grid never moves. A box card is text
 * to read plus its spread, with no buttons; the whole card opens the point. Above the grid:
 * the canvas's name as the title under a small "Clarity Canvas" label, then "by <owner>" (and a
 * version menu when the canvas has several) on the left, Compare on the right (R10). The panel (a side panel on desktop, a full-screen sheet
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
 * VERSIONS AND DRAFTS (P1536): a version is read as "v{seq} · {date}", or "v{next} · Draft" for the owner's open one (never its
 * internal name). The owner's draft is theirs alone: Publish in the header (where Share sits on a published version) and, in each
 * empty box, the question the drafting agent left. A draft has no Share, no Compare and no positions. A canvas with nothing
 * published reads "Nothing published yet" to readers. The page's parts live in src/app/components/canvas/ (header, grid, card, panel,
 * publish button); beside it on a wide screen the route wrapper (canvas/canvas-with-thread.tsx) may show the draft's chat thread.
 *
 * Browse page (src.md): no back button; BottomNav shows on mobile.
 */

import { CanvasLoadError } from './canvas-page-placeholders';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import {
  clearListReturnCache, listReturnCacheGeneration, listReturnCacheKey, readListReturnCache, writeListReturnCache,
} from '@/lib/list-return-cache';
import { useAuth } from '@/auth';
import { getProfileBySlugResult } from '@/app/data/api';
import { toast } from 'sonner';
import { linkTokenFromAddress, linkTokenVersion, readLinkToken, storeLinkToken, subscribeLinkTokens } from '@/lib/canvas-link-token';
import { canvasService, type AudienceEntry } from '@/app/data/canvas-service';
import { FeedPointCard, type FeedPointCardCanvas, type FeedPointCardOwner } from '@/app/components/feed/feed-point-card';
import { type PositionFilter } from '@/app/components/shared';
import { PointSpreadRow } from '@/app/components/shared/position-spread';
import { PointPositionsBlock } from '@/app/components/social/point-positions-block';
import { levelCounts } from '@/lib/position-spread';
import { SEO } from '@/app/components/seo';
import { NotFoundPage } from '@/app/pages/not-found-page';
import { useGoBack } from '@/app/hooks/use-go-back';
import { LetterPositionStoryDialog, type PositionStoryDialogState } from '@/app/components/letters/letter-position-story-dialog';
import { CanvasAddStoryDialog, type CanvasAddStoryState } from '@/app/components/canvas/canvas-add-story-dialog';
import { CanvasHeader } from '@/app/components/canvas/canvas-header';
import { BoxEdits, CanvasGrid } from '@/app/components/canvas/canvas-grid';
import { CanvasCard } from '@/app/components/canvas/canvas-card';
import { PointPanel } from '@/app/components/canvas/canvas-point-panel';
import { PanelPointEdit } from '@/app/components/canvas/canvas-panel-point-edit';
import {
  BOX_TITLES, buildReady, canvasSeoTitle, changedBoxes, draftQuestions, editConfigOf, hasNothingToShow, isCanvasNotFound, isViewingDraft, openDraftIdOf, sortBoxesByContest, storyFlags,
  type CanvasData, adoptionSkipsRead,
} from '@/app/components/canvas/canvas-page-data';
import { composerVisibilityCopy, sharedIconLabel } from '@/lib/canvas-audience-copy';
import { CANVAS_BOXES, CANVAS_LAYERS, canvasBoxOf, canvasPath, groupPointsByBox, normalizeProjectTag, type CanvasBoxTag } from '@/lib/canvas-boxes';
import type { PointWithUserPosition } from '@/app/types';
import { CanvasPageBack } from '@/app/components/canvas/canvas-page-back';
import { useCompareSetup, useMarkCanvasRead } from './canvas/canvas-page-read';
import { useCanvasDraftSync } from './canvas/use-canvas-draft-sync';
import { cardOwnerOf, useOwnerIdentity } from './canvas/use-owner-identity';
import { useEditedPointFollow } from './canvas/use-edited-point-follow';
import { canvasPageClass, useCanvasWorkspace, useReportCanvasReady, useWorkspaceReload } from '@/app/components/canvas/canvas-workspace-context';

/** Reading order: layer by layer, box by box (sixth round R1). The same order at every width (a
 *  phone stacks it), and Previous / Next walk it. */
const READING_ORDER: readonly CanvasBoxTag[] = CANVAS_LAYERS.flatMap(l => l.boxes);
const ORDERED_BOXES = [...CANVAS_BOXES].sort((a, b) => READING_ORDER.indexOf(a.tag) - READING_ORDER.indexOf(b.tag));

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
  const rawPointId = searchParams.get('point');
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
      if (isCanvasNotFound(view)) return settle({ status: 'not-found' });
      const audienceResult = await audienceRead;
      // A refresh whose audience read failed keeps the audience already loaded for this canvas; only
      // a first load has none to keep (null: shown as the "could not be read" wording).
      const shown = loadedRef.current;
      const previous = shown?.key === forKey && shown.data.status === 'ready' ? shown.data.audience : null;
      const audience = audienceResult === undefined ? previous : audienceResult;
      settle(buildReady(owner.data, view, audience));
    } catch {
      settle({ status: 'error' });
    }
  }, [handle, projectTag, viewerId, cacheKey, requestedVersion, linkToken]);

  // Wait for the session check: reading before it would show the owner the public canvas first.
  useEffect(() => {
    if (!sessionChecked) return;
    if (adoptionSkipsRead(adoptedKeyRef, loadedRef.current, key)) return; // the page's own address write, data already on screen
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

  // P1545: opening a canvas someone shared with you marks it read (also what a chat share card leads to).
  // Fire-and-forget; the server ignores the owner and link holders.
  useMarkCanvasRead(ready, projectTag, viewerId);
  // P1536 D4: inside the owner's workspace the page tells it what it read (the Publish spot depends on it).
  const workspace = useCanvasWorkspace();
  useReportCanvasReady(ready, requestedVersion ?? null);

  // Founder, sixth round: disagreement found fast — in every box the most contested card comes
  // first (the smaller side biggest), then the rest in canvas order. Previous / Next follow it too.
  const boxes = ready ? sortBoxesByContest(groupPointsByBox(ready.points), ready.positions) : null;
  const ordered = boxes ? ORDERED_BOXES.flatMap(b => boxes.get(b.tag) ?? []) : [];

  // Compare lives in the address too (`?with=`), so a shared link opens the same view. Only a published version compares (P1613: use-compare-setup).
  const { baseId, others, withPerson, basePerson } = useCompareSetup(ready, viewerId, handle, searchParams.get('with'));
  const draftView = !!ready && isViewingDraft(ready);
  const { pointEdit, viewedCanvasId } = editConfigOf(ready, workspace);
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
  // P1621: an edit made on the opened point gives it a new id; the panel follows it and stays open.
  const { requestedId: requestedPointId, follow: followEditedPoint } = useEditedPointFollow(rawPointId, ordered.map(p => p.id), useCallback((id: string) => setParams({ point: id }), [setParams]));
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
  // P1536: the draft on screen changed (its thread finished a run) or closed (published or discarded, here or in the thread
  // beside the page): re-read in place, or leave the draft's address and read the newest published version.
  useCanvasDraftSync(ready, setParams, refresh, viewerId);
  useWorkspaceReload(refresh);

  // D5: the owner as their profile shows them on the open point. Agent or not decides the ear
  // count (an agent holds no reputation, P1104), read once per canvas.
  const ownerIdentity = useOwnerIdentity(ready?.ownerId ?? null);
  const { ownerIsAgent, identityPending } = ownerIdentity;

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
  const cardOwner: FeedPointCardOwner | undefined = openPoint && ready ? cardOwnerOf(ready, openPositions, ownerIdentity) : undefined;

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
      // D20: the owner marks their own stance on draft points (readers never reach a draft). Publishing does not require one.
      noPositions: !viewerId,
      sharedLabel,
      ...storyFlags(ready, point, addedStoryIds, viewerId),
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
      positions={draftView ? null : ready.positions.get(point.id) ?? []}
      compare={compare}
      selected={point.id === openPoint?.id}
      sharedLabel={sharedLabel}
      onOpen={() => openPanel(point.id, true)}
    />
  );
  const openBoxTitle = openBox ? BOX_TITLES.get(openBox) : undefined;

  return (
    <div className={canvasPageClass(workspace.active)} data-canvas-page>
      {/* P1545: a canvas is an artifact; Back returns to where the reader came from, a cold arrival to the canvases list. */}
      <CanvasPageBack />
      {ready && <SEO title={canvasSeoTitle(ready, projectTag)} noIndex />}
      <CanvasHeader
        ready={ready}
        failed={current?.status === 'error'}
        handle={handle}
        projectTag={projectTag}
        ownerIsAgent={ownerIsAgent}
        identityPending={identityPending}
        compare={{ base: basePerson, others, withPerson }}
        sharedLabel={sharedLabel}
        onParams={setParams}
        onChanged={refresh}
      />

      {current?.status === 'error' ? (
        <CanvasLoadError onRetry={() => void read(key)} />
      ) : !(ready && hasNothingToShow(ready)) && (
        <CanvasGrid boxes={boxes} renderCard={renderCard} onMore={openBoxPanel} questions={ready ? draftQuestions(ready) : undefined} changed={changedBoxes(ready)} edit={pointEdit} openDraftId={openDraftIdOf(ready)} canvasId={viewedCanvasId} />
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
              <BoxEdits tag={openBox} points={boxes?.get(openBox) ?? []} edit={pointEdit} renderCard={renderCard} surface="panel" />
            </div>
          ) : openPoint && (<>
          {/* Keyed by the point only: a re-read after a vote must not remount the card under the
              viewer's hand (a second tap adjusts the level of the position just taken). Stories
              start folded, as in the feed; the card shows the owner's story only (D5). */}
          <PanelPointEdit point={openPoint} boxes={boxes} edit={pointEdit} onSaved={followEditedPoint} onRemoved={closePanel}>
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
            // A draft has no positions: an empty fragment replaces the default spread row (null would bring it back).
            spread={draftView ? <></> : <PointSpreadRow counts={levelCounts(openPositions)} withInfo className="mt-2" hideEmpty />}
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
          </PanelPointEdit>
          {/* D6: the point page's "Filter by position" block, counting from the canvas's one
              positions read; every author's linked stories come from the canvas's batch read. */}
          {!draftView && <div className="mt-4">
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
          </div>}
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
