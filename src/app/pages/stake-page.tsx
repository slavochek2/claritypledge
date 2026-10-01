/**
 * @file stake-page.tsx
 * @description P1179: the locked stake surface — the feed with things removed.
 *
 * Founder's own reading, verbatim: "Is it like feed but already one tag selected
 * and I cannot search, and I cannot change the sorting and I cannot share a
 * story? It's basically this."
 *
 * REMOVED: search box, tag cloud, sort toggle, Share a Story, the "Home" title.
 * KEPT: the point cards with their position buttons, fixed oldest-first.
 *
 * It does NOT fork feed-page.tsx — the risk register calls that out explicitly.
 * It reuses the same card components and the same services; only the chrome
 * around them differs, and that difference IS the feature.
 *
 * ROUTE: a GLOBAL `/stake/:tag`, optionally `?event=<slug>` (Resolved Decision 2)
 * and `?tab=stories` (P1296). The content is global — cmp7 is the same seven Points at
 * every event — and the only reason to nest it under an event was the Links button, which
 * the query param resolves without nesting. A bare /stake/:tag is a usable, handable
 * cut-down feed with no button and no event context, public exactly as /feed is.
 *
 * ORDERING: oldest-first is requested FROM THE DATABASE (`ascending = true`),
 * never reversed client-side — decisions.md 2026-03-13, and P1055 depends on the
 * instrument's order being the stored order rather than a render-time accident.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { storiesService } from '@/app/data/stories-service';
import { keepsUnstaked, stakeRead } from '@/app/data/offline-reads';
import { readThrough } from '@/lib/offline-read-cache';
import { useOfflineReadState } from '@/app/hooks/use-offline-read-state';
import { NeedsConnection } from '@/app/components/offline/needs-connection';
import { useAuth } from '@/auth';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedSkeleton } from '@/app/components/feed/feed-skeleton';
import { SourceGroup, type GroupPlayer } from '@/app/components/shared/source-group';
import { SEO } from '@/app/components/seo';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { BottomBackButton } from '@/app/components/layout/bottom-back-button';
import { isSafeTag } from '@/app/data/event-links';
import { linkKeyFor, linksFor, type LinkedContentState } from '@/lib/linked-content';
import { groupBySource } from '@/lib/group-by-source';
import {
  listReturnCacheGeneration,
  listReturnCacheKey,
  readListReturnCache,
  updateListReturnCache,
  writeListReturnCache,
} from '@/lib/list-return-cache';
import type { StoryWithAuthor, PointWithUserPosition, PositionType, PointSummary } from '@/app/types';

/*
 * `keepsUnstaked`: zero-position points stay listed only on the standing instruments (cmp7 is
 * seven points; a point nobody has staked yet is still one of the seven). Verified on prod
 * 2026-09-18 before shipping: every zero-position point under these six tags is a real
 * instrument statement (cmp7 1 of 7, cmp10 1 of 10, understanding 2 of 18), none is junk. Any
 * other /stake/<tag> keeps P543, like /feed. It and the list read itself live in
 * offline-reads.ts (P1369 Scope v2), shared with the offline pack so a pre-loaded list is found
 * by exactly this page's read.
 */

type StakeTab = 'points' | 'stories';

/**
 * P1364 §5 — what /stake last rendered, kept for a POP return (see list-return-cache.ts): the
 * lists, the footer link maps, and which viewer+ids each map was fetched for, so the restored
 * page neither refetches the list nor re-asks for links it already holds.
 */
interface StakeSnapshot {
  tag: string;
  points: PointWithUserPosition[];
  stories: StoryWithAuthor[];
  storyPointsState?: LinkedContentState<PointSummary>;
  pointStoriesState?: LinkedContentState<StoryWithAuthor>;
  fetchedStoryLinks: string | null;
  fetchedPointLinks: string | null;
}

/** The stake removal rule: one function for the on-screen list and the cache write-through. */
function removeStakePosition(
  points: PointWithUserPosition[],
  tag: string,
  pointId: string,
  removedPosition: PositionType | null,
): PointWithUserPosition[] {
  return points.map(p => {
    if (p.id !== pointId) return p;
    const counts = { ...p.positionCounts };
    if (removedPosition) counts[removedPosition] = Math.max(0, (counts[removedPosition] || 0) - 1);
    // The viewer's own position is gone too: without this, a remount (switching the
    // Points/Stories tabs) re-seeded the card from the fetched `userPosition` and lit the
    // withdrawn button again. Only the viewer's own withdrawal ever calls this.
    return { ...p, positionCounts: counts, totalPositions: Math.max(0, p.totalPositions - 1), userPosition: undefined };
  })
    // Off the standing instruments, P543 holds locally too: the fetch would hide this point
    // on the next load, so it must not linger until then (round 2).
    .filter(p => keepsUnstaked(tag) || p.totalPositions > 0);
}

export function StakePage() {
  const { tag } = useParams<{ tag: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const { session } = useAuth();
  const eventSlug = searchParams.get('event');
  const viewerUserId = session?.user?.id;

  // P1364 §5 — a POP returns to the list as the reader left it: from the cache, no refetch,
  // no skeleton. Any other arrival fetches.
  // Keyed on what the fetch depends on — the viewer and the tag (in the pathname). `?tab=` and
  // `?event=` only change the view of the same rows.
  const cacheKey = listReturnCacheKey(viewerUserId, location.pathname);
  const [restored] = useState<StakeSnapshot | undefined>(() => {
    if (navigationType !== 'POP') return undefined;
    const hit = readListReturnCache<StakeSnapshot>(cacheKey, 'stake');
    return hit && hit.tag === tag ? hit : undefined;
  });

  const [points, setPoints] = useState<PointWithUserPosition[]>(() => restored?.points ?? []);
  const [stories, setStories] = useState<StoryWithAuthor[]>(() => restored?.stories ?? []);
  const [loading, setLoading] = useState(() => !restored);
  const [error, setError] = useState<string | null>(null);
  // P1369 Scope v2: the list reads through the offline cache — cached copy with the strip, or
  // needs-connection, never an endless skeleton.
  const offlineRead = useOfflineReadState();
  const { apply: applyRead, reconnectKey } = offlineRead;
  // P1212 §5 / P1296 item 2 — the footer counts, batch-fetched per tab exactly as /feed does
  // it. Each map is stored WITH the id set it answers, so a stale map reads as "not loaded"
  // rather than as "none linked" (see linked-content.ts).
  const [storyPointsState, setStoryPointsState] = useState<LinkedContentState<PointSummary> | undefined>(() => restored?.storyPointsState);
  const [pointStoriesState, setPointStoriesState] = useState<LinkedContentState<StoryWithAuthor> | undefined>(() => restored?.pointStoriesState);

  const requestIdRef = useRef(0);
  // What each tab's links were last fetched FOR (restored with the rows on a POP). Switching tabs back and forth changes neither
  // the viewer nor the id set, so it must not repeat the query (review, 2026-09-11). BOTH answers
  // depend on the viewer, so the viewer is part of both keys: the stories side carries the
  // viewer's own positions, and the points side is read through RLS, which shows an author their
  // OWN private story — a sign-in in another tab must not keep the anonymous map.
  const fetchedStoryLinksRef = useRef<string | null>(restored?.fetchedStoryLinks ?? null);
  const fetchedPointLinksRef = useRef<string | null>(restored?.fetchedPointLinks ?? null);
  // What the rows on screen were fetched FOR (viewer + tag). The cache is written only when
  // they answer the current URL.
  const listFetchKey = `${viewerUserId ?? ''}|${tag ?? ''}`;
  const [dataFetchKey, setDataFetchKey] = useState<string | null>(() => (restored ? listFetchKey : null));
  // The cache generation the rows on screen belong to — an own write clears the cache and
  // bumps it, and rows from before that write are never written back (see list-return-cache).
  const dataGenerationRef = useRef<number>(listReturnCacheGeneration());
  // A PUSH to the same URL must fetch fresh; a REPLACE (tab switch) must not (see /feed).
  const lastPushKeyRef = useRef<string | null>(null);
  if (navigationType === 'PUSH') lastPushKeyRef.current = location.key;
  const pushKey = lastPushKeyRef.current;
  // Restored for this trigger → the fetch effect skips it (no background refresh on POP). A
  // ref, so StrictMode's double effect skips both runs.
  const hydratedForRef = useRef<string | null>(restored ? `${listFetchKey}|${pushKey}|0` : null);

  // The menu builder only ever hands out a tag that passed isSafeTag — but this
  // route is a GLOBAL param, reachable by anyone typing an arbitrary string
  // into /stake/:tag directly. That invariant has to be re-checked here, at the
  // boundary that actually serves internet traffic, not assumed from the caller.
  const tagIsValid = isSafeTag(tag);

  const fetchData = useCallback(async () => {
    if (!tag || !isSafeTag(tag)) return;
    const rid = ++requestIdRef.current;
    const requestFetchKey = `${viewerUserId ?? ''}|${tag}`;
    const requestGeneration = listReturnCacheGeneration();
    setLoading(true);
    setError(null);
    try {
      // ascending = true — oldest-first from the DB, the P1075 server-side
      // single-tag path (exactly one tag is always active here, so this never
      // falls back to the client-side multi-tag filter).
      const r = stakeRead(tag, viewerUserId);
      const read = await readThrough(r.type, r.id, r.fetch);
      if (rid !== requestIdRef.current) return; // a slower earlier call resolving late
      const rows = applyRead(read);
      if (!rows) return; // offline, nothing stored: the needs-connection body
      setPoints(rows.points);
      setStories(rows.stories);
      dataGenerationRef.current = requestGeneration;
      setDataFetchKey(requestFetchKey);
    } catch {
      if (rid !== requestIdRef.current) return;
      setError('Could not load this list.');
    } finally {
      if (rid === requestIdRef.current) setLoading(false);
    }
  }, [tag, viewerUserId, applyRead]);

  // AC-9: the ONLY things that refetch are the tag and the viewer. A position
  // change deliberately does NOT appear in any dependency array and no refetch
  // is wired to one — reintroducing that guard is what causes the loading flash
  // the acceptance criterion forbids. The card updates its own count optimistically.
  const navigationTypeRef = useRef(navigationType);
  navigationTypeRef.current = navigationType;
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;
  useEffect(() => {
    const trigger = `${listFetchKey}|${pushKey}|${reconnectKey}`;
    if (hydratedForRef.current === trigger) return; // restored on POP: no refresh
    hydratedForRef.current = null;
    // A POP between two stake entries (another tag, then Back) restores that entry too.
    if (navigationTypeRef.current === 'POP') {
      const hit = readListReturnCache<StakeSnapshot>(cacheKeyRef.current, 'stake');
      if (hit && hit.tag === tag) {
        requestIdRef.current++; // any fetch still in flight is now stale
        hydratedForRef.current = trigger;
        dataGenerationRef.current = listReturnCacheGeneration();
        fetchedStoryLinksRef.current = hit.fetchedStoryLinks;
        fetchedPointLinksRef.current = hit.fetchedPointLinks;
        setPoints(hit.points);
        setStories(hit.stories);
        setStoryPointsState(hit.storyPointsState);
        setPointStoriesState(hit.pointStoriesState);
        setDataFetchKey(listFetchKey);
        setError(null);
        setLoading(false);
        return;
      }
    }
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tag` is inside listFetchKey
  }, [fetchData, listFetchKey, pushKey, reconnectKey]);

  /**
   * A withdrawn position lowers the count and nothing else. Unlike /feed, the point STAYS
   * even at zero: this list is a fixed instrument (cmp7 is seven points), and dropping a
   * point when its last holder cleared it left the room one point short with no way to
   * stake it again (founder screenshot 2026-09-18, "the point disappears from /stake,
   * why??"). The fetch keeps zero-position points for the same reason (standing
   * instruments only — see `keepsUnstaked`). Local only.
   */
  const handlePointRemoved = useCallback((pointId: string, removedPosition: PositionType | null) => {
    setPoints(prev => removeStakePosition(prev, tag ?? '', pointId, removedPosition));
    // P1364: written through to every cached stake entry, so the change cannot be undone by a
    // later Back served from the cache.
    updateListReturnCache<StakeSnapshot>('stake', snap => ({
      ...snap,
      points: removeStakePosition(snap.points, snap.tag, pointId, removedPosition),
    }));
  }, [tag]);

  // A tab renders only if it has content. cmp7/cmp3 are Points only, so no tabs
  // appear there; a per-event topic tag may carry both. Founder: "a tab is only
  // visible if stories are there."
  const showTabs = useMemo(
    () => points.length > 0 && stories.length > 0,
    [points.length, stories.length]
  );

  /**
   * P1296 item 4 — the tab comes from `?tab=`, as /feed's has since P491, and it is a pure
   * DERIVATION, never a write.
   *
   * The Clarity Night event of 2026-09-18 links to `/stake/aisafety1?tab=stories`. The guard
   * this replaces was an effect that SET the tab to Points whenever `showTabs` was false — and
   * `showTabs` is false while the page loads, because both lists are still empty. Ported as a
   * URL write, it would have stripped `?tab=stories` from the event's own link before the data
   * arrived, and the page would open on Points anyway. Deriving it keeps the URL untouched.
   *
   * What the old guard protected still holds: with no tab bar there is no way to switch, so
   * the page shows the only list that has content. `/stake/cmp7?tab=stories` — cmp7 is Points
   * only — opens on Points. (A Stories-only tag now opens on Stories; the old guard forced it
   * onto an empty Points list with no tab bar to leave it.)
   */
  const urlTab: StakeTab = searchParams.get('tab') === 'stories' ? 'stories' : 'points';
  const activeTab: StakeTab = showTabs
    ? urlTab
    : points.length === 0 && stories.length > 0 ? 'stories' : 'points';

  /**
   * Tab switches REPLACE the history entry and keep every other param. `?event=` in
   * particular is what the Links button reads (`event-links.ts` builds
   * `/stake/:tag?event=<slug>`), so `setSearchParams({ tab })` would silently drop it. And a
   * pushed entry per switch would make "Go back" walk the reader back through their own tab
   * switches before it left the page.
   */
  const selectTab = useCallback((next: StakeTab) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (next === 'stories') params.set('tab', 'stories');
      else params.delete('tab');
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  // Keyed on the id SETS rather than the arrays, so a position change that rebuilds the
  // points array with the same ids fetches nothing. Never touches `loading`: the list is
  // fetched once and the skeleton never returns (P1179 AC-9).
  const storyLinkKey = useMemo(() => linkKeyFor(stories.map(s => s.id)), [stories]);
  const pointLinkKey = useMemo(() => linkKeyFor(points.map(p => p.id)), [points]);

  useEffect(() => {
    let cancelled = false;
    if (activeTab === 'stories') {
      const fetchKey = `${viewerUserId ?? ''}|${storyLinkKey}`;
      if (!storyLinkKey || fetchedStoryLinksRef.current === fetchKey) return;
      storiesService
        .getPointsForStories(storyLinkKey.split(','), viewerUserId)
        .then(map => {
          if (cancelled) return;
          fetchedStoryLinksRef.current = fetchKey;
          setStoryPointsState({ key: storyLinkKey, map });
        })
        .catch(() => { /* the count stays hidden; the list itself still renders */ });
    } else {
      const fetchKey = `${viewerUserId ?? ''}|${pointLinkKey}`;
      if (!pointLinkKey || fetchedPointLinksRef.current === fetchKey) return;
      storiesService
        .getStoriesForPoints(pointLinkKey.split(','))
        .then(map => {
          if (cancelled) return;
          fetchedPointLinksRef.current = fetchKey;
          setPointStoriesState({ key: pointLinkKey, map });
        })
        .catch(() => { /* the count stays hidden; the list itself still renders */ });
    }
    return () => { cancelled = true; };
  }, [activeTab, storyLinkKey, pointLinkKey, viewerUserId]);

  // P1364 §5 — keep the cache equal to what is on screen, under the current URL (tab switches,
  // link maps arriving, removals — all written through here).
  useEffect(() => {
    if (!tag || loading || error || dataFetchKey !== listFetchKey) return;
    // An offline copy is not what the Back cache restores as live rows (no strip there).
    if (offlineRead.cachedAt !== null) return;
    if (dataGenerationRef.current !== listReturnCacheGeneration()) return; // pre-write rows
    writeListReturnCache<StakeSnapshot>(cacheKey, 'stake', {
      tag,
      points,
      stories,
      storyPointsState,
      pointStoriesState,
      fetchedStoryLinks: fetchedStoryLinksRef.current,
      fetchedPointLinks: fetchedPointLinksRef.current,
    });
  }, [tag, cacheKey, listFetchKey, dataFetchKey, loading, error, points, stories, storyPointsState, pointStoriesState, offlineRead.cachedAt]);

  // P1296 item 7 — stories built on one video gather under one player.
  const storyEntries = useMemo(() => groupBySource(stories), [stories]);

  const isEmpty = points.length === 0 && stories.length === 0;

  /**
   * BACK (founder, 2026-08-31): "if I go to CMP7, I'm there, but it doesn't have
   * the back button to the previous page." Both controls below use the shared `useGoBack`
   * (P1296's cold test on `history.state.idx`, P1311's outside-referrer rule — see
   * use-go-back.ts) through their `fallback` prop: coming FROM somewhere pops back there;
   * a cold arrival goes to the feed, the nearest surface this page is a cut-down version of.
   * P1364 moved the logic out of this page; it used to carry its own copy.
   */
  const BACK_FALLBACK = '/feed';

  if (!tagIsValid) {
    return (
      <div className="min-h-screen bg-background pt-4 pb-8">
        <SEO title="Stake — Clarity Pledge" description="Take a position." />
        <div className="mx-auto w-full max-w-2xl px-4">
          <FocusHeader fallback={BACK_FALLBACK} />
          <div className="py-12 text-center" data-testid="stake-invalid-tag">
            <h2 className="mb-2 text-lg font-medium text-foreground">Nothing here</h2>
            <p className="text-muted-foreground">This link doesn't point at anything.</p>
          </div>
        </div>
      </div>
    );
  }

  const renderStoryCard = (story: StoryWithAuthor, groupPlayer?: GroupPlayer) => (
    <FeedStoryCard
      key={story.id}
      story={story}
      activeTag={tag}
      linkedPoints={linksFor(storyPointsState, storyLinkKey, story.id)}
      currentUserId={viewerUserId}
      groupPlayer={groupPlayer}
      surface="stake"
    />
  );

  return (
    <div className="min-h-screen bg-background pt-4 pb-8">
      <SEO title={`${tag} — Clarity Pledge`} description={`Take a position on ${tag}.`} />
      <div className="mx-auto w-full max-w-2xl px-4">
        {/* No "Home" title, no search box, no tag cloud, no sort toggle, no
            Share a Story button — every one of those is removed on purpose.

            SPACING: no nav offset here. ClarityLandingLayout's <main> already
            carries `pt-[calc(4rem+safe-area)] lg:pt-[calc(5rem+…)]` for the fixed
            nav; this page also had `pt-20`, so the offset was applied TWICE and
            the first card sat ~5rem below where it belonged, at every width
            (founder screenshot 2026-08-31: "why so much whitespace? cut?"). */}
        <FocusHeader fallback={BACK_FALLBACK} />

        {/* P1376 — the tag is the page's name: shown verbatim under Back, not screen-reader
            only. Same heading weight as /feed's "Home". `break-words`: a user tag has no
            length cap short of isSafeTag, and must not push past 320px. */}
        <h1 className="mb-4 text-2xl font-bold text-foreground break-words">{tag}</h1>

        {showTabs && (
          <div className="mb-4 flex gap-2" role="tablist" data-testid="stake-tabs">
            {(['points', 'stories'] as StakeTab[]).map(t => (
              <button
                key={t}
                role="tab"
                aria-selected={activeTab === t}
                data-testid={`stake-tab-${t}`}
                onClick={() => selectTab(t)}
                className={`min-h-11 px-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t
                    ? 'border-[#002B5C] text-[#002B5C] dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-muted-foreground'
                }`}
              >
                {/* P1296 item 6 / P500 — counts on the tabs, as the profile and /feed have them. */}
                {t === 'points' ? `Points (${points.length})` : `Stories (${stories.length})`}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <FeedSkeleton />
        ) : offlineRead.offlineMiss ? (
          <NeedsConnection onRetry={() => void fetchData()} />
        ) : error ? (
          <div className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">{error}</p>
            <button
              onClick={() => void fetchData()}
              className="min-h-11 font-medium text-blue-600 transition-colors hover:text-blue-700"
            >
              Retry
            </button>
          </div>
        ) : isEmpty ? (
          <div className="py-12 text-center" data-testid="stake-empty">
            <h2 className="mb-2 text-lg font-medium text-foreground">No public content yet</h2>
            <p className="text-muted-foreground">Stories and points shared publicly will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4" data-testid="stake-list">
            {activeTab === 'points'
              ? points.map(point => (
                  <FeedPointCard
                    key={point.id}
                    point={point}
                    activeTag={tag}
                    onPointRemoved={handlePointRemoved}
                    linkedStories={linksFor(pointStoriesState, pointLinkKey, point.id)}
                    surface="stake"
                  />
                ))
              : storyEntries.map(entry => (
                  entry.kind === 'group' ? (
                    <SourceGroup key={entry.key} stories={entry.stories} renderStory={renderStoryCard} />
                  ) : (
                    renderStoryCard(entry.story)
                  )
                ))}
          </div>
        )}

        {/* P1296 item 5 — "Go back" at the bottom too. Founder: *"at the bottom of the page put
            back button as a CTA. Go back. That's cool because otherwise people feel stuck and
            the only CTA is at the top."* Same handler as the header button, so it leaves the
            page the same way — including after tab switches, which add no history.

            Its accessible name is distinct from the header's ("Go back") and contains the
            visible words, so a screen-reader user can tell the two apart and a voice user can
            still say what they see. Outline, not primary: it is a way out, not the page's
            action. Blue and sized to its label, not full width — founder, UAT: *"make button
            blue and smaller? to be consistent"* (blue is the design system's action colour). */}
        {/* P1364 UX Notes: no pill while loading, nor in the error state. */}
        {!loading && !error && (
          <BottomBackButton
            fallback={BACK_FALLBACK}
            testId="stake-bottom-back"
            ariaLabel="Go back from the end of the list"
          />
        )}
      </div>
      {/* eventSlug is read so the Links button can carry the event across
          destinations; the surface itself renders identically with or without it. */}
      <span className="hidden" data-testid="stake-event-slug">{eventSlug ?? ''}</span>
    </div>
  );
}
