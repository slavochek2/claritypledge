/**
 * @file feed-page.tsx
 * @description P491/P499: Home — public content discovery with creation CTA.
 *
 * Two tabs (Stories first, Points default when no ?tab= param), tag cloud, search
 * bar, URL-driven tag filter.
 * Logged-in users see "Share a Story" button. Internal tags (st1, st2...) hidden from cloud.
 * Accessible to both authenticated and anonymous users (public content only).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { Search, X, Globe, ChevronDown } from 'lucide-react';
import { HomeSideRail, HomeTopBlock } from '@/app/components/feed/home-side-rail';
import { FIXED_TOPIC_TAGS, getEventTopicTags } from '@/app/data/event-topic-tags';
import { PinnedStory, PINNED_STORY_SLUG } from '@/app/components/feed/pinned-story';
import { storiesService } from '@/app/data/stories-service';
import { feedRead } from '@/app/data/offline-reads';
import { readThrough } from '@/lib/offline-read-cache';
import { useOfflineReadState } from '@/app/hooks/use-offline-read-state';
import { NeedsConnection } from '@/app/components/offline/needs-connection';
import { useAuth } from '@/auth';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedSkeleton } from '@/app/components/feed/feed-skeleton';
import { SEO } from '@/app/components/seo';
import { analytics } from '@/lib/mixpanel';
import { parseTags, serializeTags, filterByTags, collapseToLatest, orderBySequence, isSystemTag } from '@/lib/feed-utils';
import type { StoryWithAuthor, PointWithUserPosition, PositionType, PointSummary } from '@/app/types';
import { linkKeyFor, linksFor, type LinkedContentState } from '@/lib/linked-content';
import { groupBySource } from '@/lib/group-by-source';
import { SourceGroup, type GroupPlayer } from '@/app/components/shared/source-group';
import {
  listReturnCacheGeneration,
  listReturnCacheKey,
  readListReturnCache,
  updateListReturnCache,
  writeListReturnCache,
} from '@/lib/list-return-cache';

type FeedTab = 'points' | 'stories';

/** P1392: the feed is the homepage now — the tag cloud shows the most-used few, the rest behind "More tags". */
const TAG_CLOUD_LIMIT = 5;



/**
 * P1364 §5 — what the feed last rendered, kept for a POP return: the lists AND the link maps,
 * so every card has its footer on the first frame and the restored scroll lands on the card
 * the reader left.
 */
export interface FeedSnapshot {
  stories: StoryWithAuthor[];
  points: PointWithUserPosition[];
  cloudStories: StoryWithAuthor[];
  cloudPoints: PointWithUserPosition[];
  storyPointsState?: LinkedContentState<PointSummary>;
  pointStoriesState?: LinkedContentState<StoryWithAuthor>;
}

function hydratedLinkKeys(snapshot: FeedSnapshot | undefined): Set<string> {
  const keys = new Set<string>();
  if (snapshot?.storyPointsState) keys.add(`stories|${snapshot.storyPointsState.key}`);
  if (snapshot?.pointStoriesState) keys.add(`points|${snapshot.pointStoriesState.key}`);
  return keys;
}

// P543 removal logic, shared by `points` and `cloudPoints` -- both must drop a
// point once its last position is withdrawn (P1075 code review: cloudPoints was
// previously only ever written by fetchData, so it went stale after a live removal).
function removePointPosition(
  points: PointWithUserPosition[],
  pointId: string,
  removedPosition: PositionType | null
): PointWithUserPosition[] {
  return points
    .map(p => {
      if (p.id !== pointId) return p;
      // Use CURRENT totalPositions from state (not stale closure from card)
      const updatedCounts = { ...p.positionCounts };
      if (removedPosition) updatedCounts[removedPosition] = Math.max(0, (updatedCounts[removedPosition] || 0) - 1);
      const newTotal = Math.max(0, p.totalPositions - 1);
      if (newTotal === 0) return null; // mark for removal
      // P1364: the viewer's own position is gone too (only the viewer's own withdrawal calls
      // this) — otherwise a remount, or a Back served from the cache, re-lit the withdrawn
      // button from the stale `userPosition`. Same rule as /stake's removeStakePosition.
      return { ...p, positionCounts: updatedCounts, totalPositions: newTotal, userPosition: undefined };
    })
    .filter((p): p is PointWithUserPosition => p !== null);
}

export function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const location = useLocation();
  const navigationType = useNavigationType();
  const viewerUserId = session?.user?.id;

  // URL-driven state — supports both ?tag=X,Y and ?tag=X&tag=Y
  // P1364 §6: memoised on the tag param STRING, not the whole `searchParams` object — any URL
  // change (a tab, the search box) used to mint a new array here and refetch the whole list
  // behind a spinner.
  const tagParamKey = searchParams.getAll('tag').join('\u0000');
  const activeTags = useMemo(
    () => (tagParamKey ? tagParamKey.split('\u0000').flatMap(p => parseTags(p)) : []),
    [tagParamKey]
  );
  const tabParam = searchParams.get('tab');
  // P1392: Stories is the default tab; Points needs ?tab=points.
  const activeTab: FeedTab = tabParam === 'points' ? 'points' : 'stories';
  const ascending = searchParams.get('sort') === 'oldest';
  const versionLatest = searchParams.get('version') === 'latest';

  // P1364 §5 — a POP (Back, browser back/forward) returns to the list exactly as the reader left
  // it, from the in-memory cache, with no refetch and no spinner. Any other arrival fetches.
  // Keyed on what the FETCH depends on (viewer, tags, sort) — not the tab, the search text or
  // the version toggle, which only change the view of the same rows.
  const cacheKey = listReturnCacheKey(
    viewerUserId,
    location.pathname,
    `tag=${tagParamKey}&sort=${ascending ? 'oldest' : 'newest'}`
  );
  const [restored] = useState<FeedSnapshot | undefined>(() =>
    navigationType === 'POP' ? readListReturnCache<FeedSnapshot>(cacheKey, 'feed') : undefined
  );

  // Data state
  const [stories, setStories] = useState<StoryWithAuthor[]>(() => restored?.stories ?? []);
  const [points, setPoints] = useState<PointWithUserPosition[]>(() => restored?.points ?? []);
  // P1075: tag cloud must reflect ALL public content (BR-8, P602), independent of
  // the active tag filter -- kept separate from `stories`/`points` above, which are
  // now server-side filtered by the active tag and can't double as the cloud source.
  const [cloudStories, setCloudStories] = useState<StoryWithAuthor[]>(() => restored?.cloudStories ?? []);
  const [cloudPoints, setCloudPoints] = useState<PointWithUserPosition[]>(() => restored?.cloudPoints ?? []);
  // P1212 §5 — each map is stored WITH the id set it was fetched for, so a map left over
  // from a previous fetch cannot be read as an answer about the current one. See
  // `linked-content.ts` for the re-fetch bug that shape exists to make impossible.
  const [storyPointsState, setStoryPointsState] = useState<LinkedContentState<PointSummary> | undefined>(() => restored?.storyPointsState);
  const [pointStoriesState, setPointStoriesState] = useState<LinkedContentState<StoryWithAuthor> | undefined>(() => restored?.pointStoriesState);
  const [loading, setLoading] = useState(() => !restored);
  const [error, setError] = useState<string | null>(null);
  // P1369 Scope v2: the first page reads through the offline cache (strip + cached copy, or
  // needs-connection — never an endless skeleton).
  const offlineRead = useOfflineReadState();
  const { apply: applyRead, reconnectKey } = offlineRead;

  // What the list's data was fetched FOR (viewer, sort, tags). The cache is written only when the
  // data on screen answers the current URL — never old rows under a new tag's key mid-fetch.
  const fetchKey = `${viewerUserId ?? ''}|${ascending ? 'asc' : 'desc'}|${tagParamKey}`;
  const [dataFetchKey, setDataFetchKey] = useState<string | null>(() => (restored ? fetchKey : null));
  // The cache generation the rows on screen belong to. An own write (a position, an edit)
  // clears the cache and bumps the generation; rows from before it are never written back.
  const dataGenerationRef = useRef<number>(listReturnCacheGeneration());
  // The location.key of the latest PUSH to this page. A PUSH to the SAME URL (tapping Feed in
  // the nav while on the feed) changes nothing else the fetch effect depends on, and must still
  // fetch fresh. A REPLACE (tab, search) leaves it alone, so it still refetches nothing.
  const lastPushKeyRef = useRef<string | null>(null);
  if (navigationType === 'PUSH') lastPushKeyRef.current = location.key;
  const pushKey = lastPushKeyRef.current;
  // What the current rows were restored for: the fetch effect skips it (no background refresh
  // on POP). A ref, not a one-shot flag, so StrictMode's double effect skips both runs.
  const hydratedForRef = useRef<string | null>(restored ? `${fetchKey}|${pushKey}|0` : null);
  // Link maps that came from the cache — the link effect must not refetch them either.
  const hydratedLinksRef = useRef<Set<string>>(hydratedLinkKeys(restored));

  // P1364 §6 — search text lives in `?q=` so it survives open-item → Back. Written on every
  // keystroke with `replace`: the filter is client-side (no request), a same-path replace does
  // not move the scroll, and there is no pending write for a quick tap on a card to outrun.
  const urlQuery = searchParams.get('q') ?? '';
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const lastWrittenQueryRef = useRef(urlQuery);

  // P1075 code review: guards against an older, slower fetchData call resolving
  // after a newer one (e.g. rapid tag-toggle clicks) and overwriting fresher state
  // with stale content. Pre-existing gap (the original 2-call version had it too),
  // but this diff doubles concurrent requests in the tag-filtered path (2 -> 4),
  // widening the completion-order variance -- matches the `cancelled`-flag pattern
  // used elsewhere in this codebase (e.g. create-story-page.tsx), adapted to a
  // request-id since fetchData is also invoked directly (Retry button), not just
  // from the mount effect.
  const fetchIdRef = useRef(0);

  // P1075: tag filtering happens server-side now -- both services already implement
  // it (`.contains('tags'/'system_tags', [tag])`), the feed page just never passed
  // it through, so a tag whose matches fell outside the fixed FEED_LIMIT window
  // silently rendered empty once the table grew past ~50 public rows.
  // Only the single-tag case is scoped server-side -- both services' `tag` param
  // is singular (contains-one), not OR-across-many. Multi-tag URLs (`?tag=X,Y`)
  // keep today's unfiltered-fetch + client-side filterByTags OR-matching below,
  // unchanged by this fix (P602's multi-tag selection is out of this bug's scope).
  const fetchData = useCallback(async () => {
    const requestId = ++fetchIdRef.current;
    const isStale = () => requestId !== fetchIdRef.current;
    const requestFetchKey = fetchKey;
    const requestGeneration = listReturnCacheGeneration();
    hydratedLinksRef.current = new Set(); // fresh rows get fresh link maps
    setLoading(true);
    setError(null);
    try {
      const tagFilter = activeTags.length === 1 ? activeTags[0] : undefined;

      // BR-8: tag cloud stays computed from ALL public content — with a tag filter active, the
      // read (offline-reads.ts feedRead) fetches the unfiltered set alongside, concurrently.
      const r = feedRead(viewerUserId, ascending, tagFilter);
      const read = await readThrough(r.type, r.id, r.fetch, r.options);
      if (isStale()) return;
      const rows = applyRead(read);
      if (!rows) return; // offline, nothing stored: the needs-connection body
      setStories(rows.stories);
      setPoints(rows.points);
      setCloudStories(rows.cloudStories);
      setCloudPoints(rows.cloudPoints);
      dataGenerationRef.current = requestGeneration;
      setDataFetchKey(requestFetchKey);
    } catch {
      if (!isStale()) setError('Could not load feed. Please try again.');
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [viewerUserId, ascending, activeTags, fetchKey, applyRead]);

  // P1212 §5 — point<->story links for the expanders, in ONE query per tab.
  //
  // Deliberately its OWN effect rather than another leg of the Promise.all above: the
  // feed's first paint must not wait on a link query it does not need to render a card.
  // Until the map arrives the cards get `undefined`, which renders no footer at all — the
  // "not loaded" state, distinct from an empty array's "loaded, none linked". A card that
  // flashed `0 stories` before its links landed would be stating a falsehood about the
  // point rather than a fact about the fetch.
  //
  // Only the ACTIVE tab is fetched. The inactive tab's cards are not mounted, so fetching
  // its links would be a round-trip for markup nobody is looking at.
  //
  // KNOWN GAP, stated rather than papered over: the three-state distinction holds while a
  // request is IN FLIGHT, not when one FAILS. Both service methods catch their own DB
  // errors, log them and return an empty Map, so a 400 is indistinguishable here from
  // "genuinely no links" and every card would read `0 points` / `0 stories`. That is the
  // pre-existing contract of `getStoriesForPoints`, which this mirrors deliberately;
  // changing it means changing the service's error shape, which is outside §5.
  const visibleStoryIds = useMemo(() => stories.map(s => s.id), [stories]);
  const visiblePointIds = useMemo(() => points.map(p => p.id), [points]);
  const storyLinkKey = useMemo(() => linkKeyFor(visibleStoryIds), [visibleStoryIds]);
  const pointLinkKey = useMemo(() => linkKeyFor(visiblePointIds), [visiblePointIds]);

  useEffect(() => {
    let cancelled = false;

    if (activeTab === 'stories') {
      if (visibleStoryIds.length === 0) return;
      if (hydratedLinksRef.current.has(`stories|${storyLinkKey}`)) return; // restored on POP
      storiesService
        .getPointsForStories(visibleStoryIds, viewerUserId)
        .then(map => { if (!cancelled) setStoryPointsState({ key: storyLinkKey, map }); })
        .catch(() => { /* expander stays hidden; the feed itself still renders */ });
    } else {
      if (visiblePointIds.length === 0) return;
      if (hydratedLinksRef.current.has(`points|${pointLinkKey}`)) return; // restored on POP
      storiesService
        .getStoriesForPoints(visiblePointIds)
        .then(map => { if (!cancelled) setPointStoriesState({ key: pointLinkKey, map }); })
        .catch(() => { /* expander stays hidden; the feed itself still renders */ });
    }

    return () => { cancelled = true; };
  }, [activeTab, visibleStoryIds, visiblePointIds, storyLinkKey, pointLinkKey, viewerUserId]);


  // Latest navigation facts for the fetch effect, which must re-run only when WHAT is fetched
  // changes (viewer, sort, tags) — not on a tab or search change.
  const navigationTypeRef = useRef(navigationType);
  navigationTypeRef.current = navigationType;
  const cacheKeyRef = useRef(cacheKey);
  cacheKeyRef.current = cacheKey;

  useEffect(() => {
    const trigger = `${fetchKey}|${pushKey}|${reconnectKey}`;
    // Rows restored for exactly this trigger: no background refresh (P1364 §5).
    if (hydratedForRef.current === trigger) return;
    hydratedForRef.current = null;
    // A POP between two feed entries (a tag pushed, then Back) restores that entry too.
    if (navigationTypeRef.current === 'POP') {
      const hit = readListReturnCache<FeedSnapshot>(cacheKeyRef.current, 'feed');
      if (hit) {
        fetchIdRef.current++; // any fetch still in flight is now stale
        hydratedForRef.current = trigger;
        dataGenerationRef.current = listReturnCacheGeneration();
        hydratedLinksRef.current = hydratedLinkKeys(hit);
        setStories(hit.stories);
        setPoints(hit.points);
        setCloudStories(hit.cloudStories);
        setCloudPoints(hit.cloudPoints);
        setStoryPointsState(hit.storyPointsState);
        setPointStoriesState(hit.pointStoriesState);
        setDataFetchKey(fetchKey);
        setError(null);
        setLoading(false);
        return;
      }
    }
    fetchData();
  }, [fetchData, fetchKey, pushKey, reconnectKey]);

  // P1364 §5 — keep the cache equal to what is on screen, under the current URL. This is the
  // write-through for tab switches, search, link maps arriving and surgical removals alike.
  useEffect(() => {
    if (loading || error || dataFetchKey !== fetchKey) return;
    if (offlineRead.cachedAt !== null) return; // an offline copy is not a live Back restore
    if (dataGenerationRef.current !== listReturnCacheGeneration()) return; // pre-write rows
    writeListReturnCache<FeedSnapshot>(cacheKey, 'feed', {
      stories, points, cloudStories, cloudPoints, storyPointsState, pointStoriesState,
    });
  }, [cacheKey, fetchKey, dataFetchKey, loading, error, stories, points, cloudStories, cloudPoints, storyPointsState, pointStoriesState, offlineRead.cachedAt]);

  // P543: Surgical callback — avoid full refetch on position removal
  // P1075: also applied to cloudPoints -- a point dropping to zero positions must
  // disappear from the tag cloud too (P543 invariant), not just the rendered list.
  // P1364: also written through to EVERY cached feed entry (other tags, other sorts), so the
  // removed point cannot come back from the cache on a later Back.
  const handlePointRemoved = useCallback((pointId: string, removedPosition: PositionType | null) => {
    setPoints(prev => removePointPosition(prev, pointId, removedPosition));
    setCloudPoints(prev => removePointPosition(prev, pointId, removedPosition));
    updateListReturnCache<FeedSnapshot>('feed', snap => ({
      ...snap,
      points: removePointPosition(snap.points, pointId, removedPosition),
      cloudPoints: removePointPosition(snap.cloudPoints, pointId, removedPosition),
    }));
  }, []);

  // P1364 §6 — `?q=` follows the URL when it changes from outside (a POP between feed entries).
  useEffect(() => {
    if (urlQuery === lastWrittenQueryRef.current) return;
    lastWrittenQueryRef.current = urlQuery;
    setSearchQuery(urlQuery);
  }, [urlQuery]);

  // Write `?q=` with REPLACE, from the ROUTER's current params (functional form), so every
  // other param — the tab, tags, sort — is carried over untouched.
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    lastWrittenQueryRef.current = value.trim() ? value : '';
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (value.trim()) params.set('q', value);
      else params.delete('q');
      return params;
    }, { replace: true });
  };

  // Tag cloud: extract from ALL stories + points (BR-8: computed from all content)
  // P630: tags now includes system tags (merged at data layer). Hide st/v tags from cloud.
  // P1075: reads cloudStories/cloudPoints (always unfiltered), not stories/points
  // (now server-side tag-filtered) -- see fetchData.
  const [showAllTags, setShowAllTags] = useState(false);
  // P1401: the cloud offers only our event topics + understanding/misunderstanding
  // (event-topic-tags.ts). Any other tag still filters when linked to directly.
  const [eventTopicTags, setEventTopicTags] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    getEventTopicTags().then((t) => !cancelled && setEventTopicTags(t)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const tagCloud = useMemo(() => {
    const allowed = new Set<string>([...FIXED_TOPIC_TAGS, ...eventTopicTags]);
    const tagCounts = new Map<string, number>();
    for (const story of cloudStories) {
      for (const tag of story.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    for (const point of cloudPoints) {
      for (const tag of point.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    return [...tagCounts.entries()]
      .filter(([tag]) => allowed.has(tag))
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [cloudStories, cloudPoints, eventTopicTags]);

  // Client-side tag + version + search filtering
  const filteredStories = useMemo(() => {
    let result = filterByTags(stories, activeTags);
    // One tag is a set with its own st1, st2… order; the sort toggle orders only what has none.
    // Exactly one SET tag: st numbers are global (P1069), so two tags — or a user tag spanning
    // sets — would interleave two sets.
    if (activeTags.length === 1 && isSystemTag(activeTags[0])) result = orderBySequence(result);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => s.content.toLowerCase().includes(q));
    }
    return result;
  }, [stories, activeTags, searchQuery]);

  // P1296 item 7 — group exactly the stories the tab is SHOWING, after the tag and search
  // filters. A pure function of that list, so typing in the search regroups on the next
  // render: a group left with one story becomes a plain card, a group left with none is gone.
  // P1392: signed-out visitors on the plain Stories view get story 1 pinned on top; it is
  // dropped from the list below so it never shows twice.
  const showPinned = !session && activeTab === 'stories' && activeTags.length === 0 && !searchQuery.trim();
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const storyEntries = useMemo(
    () => groupBySource(showPinned && pinnedId
        ? filteredStories.filter((s) => s.id !== pinnedId && !(s.tags ?? []).includes(PINNED_STORY_SLUG))
        : filteredStories),
    [filteredStories, showPinned, pinnedId],
  );

  const filteredPoints = useMemo(() => {
    let result = filterByTags(points, activeTags);
    if (versionLatest) {
      result = collapseToLatest(result);
    } else if (activeTags.length === 1 && isSystemTag(activeTags[0])) {
      result = orderBySequence(result);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.statement.toLowerCase().includes(q));
    }
    return result;
  }, [points, activeTags, versionLatest, searchQuery]);

  // Tab switching
  const handleTabChange = (tab: FeedTab) => {
    const params = new URLSearchParams(searchParams);
    if (tab === 'points') {
      params.set('tab', 'points');
    } else {
      params.delete('tab');
    }
    // P1364 §6: REPLACE — Back leaves the feed rather than flipping through old tabs.
    setSearchParams(params, { replace: true });
  };

  // Tag filter dismiss (single tag from multi-tag set)
  const handleDismissTag = (tagToDismiss: string) => {
    const remaining = activeTags.filter(t => t !== tagToDismiss);
    const params = new URLSearchParams(searchParams);
    const serialized = serializeTags(remaining);
    if (serialized) {
      params.set('tag', serialized);
    } else {
      params.delete('tag');
    }
    setSearchParams(params, { replace: false });
  };

  // Sort toggle
  // P1392: a "Sort:" pill with named choices (the /topics pattern) replaced the toggle
  // whose label read as a status ("Currently newest first, click for oldest").
  const handleSortChange = (newSort: 'newest' | 'oldest') => {
    analytics.track('feed_sort_changed', { sort_order: newSort });
    const params = new URLSearchParams(searchParams);
    if (newSort === 'newest') {
      params.delete('sort');
    } else {
      params.set('sort', 'oldest');
    }
    setSearchParams(params, { replace: true }); // P1364 §6
  };

  // Tag cloud chip click — toggle on/off (multi-select)
  const handleTagCloudClick = (tag: string) => {
    const isActive = activeTags.includes(tag);
    const newTags = isActive
      ? activeTags.filter(t => t !== tag)
      : [...activeTags, tag];
    analytics.track('feed_tag_filtered', { tag, action: isActive ? 'remove' : 'add', source: 'tag_cloud' });
    const params = new URLSearchParams(searchParams);
    const serialized = serializeTags(newTags);
    if (serialized) {
      params.set('tag', serialized);
    } else {
      params.delete('tag');
    }
    setSearchParams(params, { replace: false });
  };

  // Version toggle
  const handleVersionToggle = () => {
    const params = new URLSearchParams(searchParams);
    if (versionLatest) {
      params.delete('version');
    } else {
      params.set('version', 'latest');
    }
    analytics.track('feed_version_toggled', { version: versionLatest ? 'all' : 'latest' });
    setSearchParams(params, { replace: true }); // P1364 §6
  };

  // Active content based on tab
  const activeContent = activeTab === 'stories' ? filteredStories : filteredPoints;

  const seoTitle = activeTags.length > 0
    ? `${activeTags.map(t => `#${t}`).join(' ')} — ClarityPledge`
    : 'Home — ClarityPledge';

  return (
    <>
      <SEO title={seoTitle} description="Browse public stories and points shared by the ClarityPledge community." />

      {/* P1392: desktop adds a right rail (next events, groups); the feed column is unchanged. */}
      <div className="container mx-auto px-4 lg:px-8 py-6 lg:max-w-5xl lg:flex lg:gap-8 lg:justify-center">
      <div className="max-w-2xl w-full mx-auto lg:mx-0">
        {/* P1401: phones get the next events and groups at the very top; desktop has the rail. */}
        <HomeTopBlock />
        {/* Page header + Write Story CTA */}
        {/* P1392 (founder): no visible "Home" title — the stories start higher. The h1 stays for
            screen readers and document outline. */}
        <h1 className="sr-only">Home</h1>
        {/* P1406 (founder): search and Share a Story on one row; the field takes the rest. */}
        <div className="mb-4 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search stories and points..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-9 py-2 border border-border rounded-md bg-background text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {session && (
            <Link
              to="/create"
              aria-label="Share a Story"
              className="inline-flex h-10 shrink-0 items-center gap-2 px-3 sm:px-4 text-sm font-medium text-white bg-blue-500 hover:bg-blue-700 rounded-md transition-colors"
            >
              <Globe className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">Share a Story</span>
              <span className="sm:hidden">Share</span>
            </Link>
          )}
        </div>

        {/* P1406: while loading, hold the tag row's height so the tabs don't jump down. */}
        {loading && <div aria-hidden className="mb-4 h-6 w-2/3 rounded-full bg-muted animate-pulse" data-testid="tag-cloud-placeholder" />}

        {/* Tag cloud (only when we have tags and not loading) */}
        {!loading && tagCloud.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {(showAllTags ? tagCloud : tagCloud.slice(0, TAG_CLOUD_LIMIT)).map((tag) => {
              const isActive = activeTags.includes(tag);
              return (
                <button
                  key={tag}
                  role="checkbox"
                  aria-checked={isActive}
                  onClick={() => handleTagCloudClick(tag)}
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
                      : 'bg-muted text-muted-foreground hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
            {tagCloud.length > TAG_CLOUD_LIMIT && (
              <button
                onClick={() => setShowAllTags((v) => !v)}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm text-blue-600 hover:underline"
              >
                {showAllTags ? 'Fewer tags' : `More tags (${tagCloud.length - TAG_CLOUD_LIMIT})`}
              </button>
            )}
          </div>
        )}

        {/* Active tag filter pills (multi-tag) */}
        {activeTags.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Showing:</span>
              {activeTags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-sm font-medium">
                  #{tag}
                  <button
                    onClick={() => handleDismissTag(tag)}
                    className="ml-1 rounded-full hover:bg-blue-200 p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`Remove filter for #${tag}`}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tab bar + sort toggle */}
        <div role="tablist" className="flex items-center gap-0 border-b border-border mb-4">
          <button
            role="tab"
            aria-selected={activeTab === 'stories'}
            onClick={() => handleTabChange('stories')}
            className={`px-2 sm:px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors relative ${
              activeTab === 'stories'
                ? 'text-blue-600'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {/* P1296 item 6 / P500 — counts on the tabs, as the profile has them. The count is
                what the tab would show (after tag and search), and it waits for the load so a
                tab never claims "(0)" about content still in flight. */}
            Stories{!loading && ` (${filteredStories.length})`}
            {activeTab === 'stories' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'points'}
            onClick={() => handleTabChange('points')}
            className={`px-2 sm:px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors relative ${
              activeTab === 'points'
                ? 'text-blue-600'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Points{!loading && ` (${filteredPoints.length})`}
            {activeTab === 'points' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
          <div className="ml-auto flex items-center gap-3 pb-2">
            {/* Version toggle — points tab only */}
            {activeTab === 'points' && (
              <button
                role="switch"
                aria-checked={versionLatest}
                aria-label="Show latest versions only"
                onClick={handleVersionToggle}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Latest
                <span className={`inline-block w-3 h-3 rounded-full border ${versionLatest ? 'bg-blue-500 border-blue-500' : 'border-muted-foreground'}`} />
              </button>
            )}
            <label className="relative inline-flex h-10 shrink-0 items-center rounded-full border border-border pl-2.5 sm:pl-3 pr-7 sm:pr-8 text-sm text-foreground hover:bg-muted/60">
              {/* P1392 visual QA: the "Sort:" prefix drops below sm so tabs + pill fit at 320px */}
              <span className="hidden sm:inline text-muted-foreground">Sort:</span>
              <select
                aria-label="Sort by"
                value={ascending ? 'oldest' : 'newest'}
                onChange={(e) => handleSortChange(e.target.value as 'newest' | 'oldest')}
                className="h-full cursor-pointer appearance-none bg-transparent pl-1 text-base font-medium focus:outline-none md:text-sm"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
              <ChevronDown aria-hidden className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" />
            </label>
          </div>
        </div>

        {/* Content area */}
        <div role="tabpanel" aria-live="polite">
          {loading ? (
            <FeedSkeleton />
          ) : offlineRead.offlineMiss ? (
            <NeedsConnection onRetry={() => void fetchData()} />
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">{error}</p>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : activeContent.length === 0 ? (
            // Empty state
            <div className="text-center py-12">
              {activeTags.length > 0 ? (
                <>
                  <h2 className="text-lg font-medium text-foreground mb-2">
                    No content matching {activeTags.map(t => `#${t}`).join(' or ')} yet
                  </h2>
                  <button
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.delete('tag');
                      setSearchParams(params, { replace: false });
                    }}
                    className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    Browse all content
                  </button>
                </>
              ) : searchQuery.trim() ? (
                <p className="text-muted-foreground">
                  No {activeTab === 'stories' ? 'stories' : 'points'} matching &ldquo;{searchQuery}&rdquo;
                </p>
              ) : (
                <>
                  <h2 className="text-lg font-medium text-foreground mb-2">
                    No public content yet
                  </h2>
                  <p className="text-muted-foreground">
                    Stories and points shared publicly will appear here.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {showPinned && <PinnedStory onResolved={setPinnedId} />}
              {activeTab === 'points'
                ? (filteredPoints as PointWithUserPosition[]).map((point) => (
                    <FeedPointCard
                      key={point.id}
                      point={point}
                      activeTag={activeTags[0]}
                      onPointRemoved={handlePointRemoved}
                      linkedStories={linksFor(pointStoriesState, pointLinkKey, point.id)}
                    />
                  ))
                : storyEntries.map((entry) => {
                    const renderStoryCard = (story: StoryWithAuthor, groupPlayer?: GroupPlayer) => (
                      <FeedStoryCard
                        key={story.id}
                        story={story}
                        activeTag={activeTags[0]}
                        linkedPoints={linksFor(storyPointsState, storyLinkKey, story.id)}
                        currentUserId={viewerUserId}
                        groupPlayer={groupPlayer}
                      />
                    );
                    return entry.kind === 'group' ? (
                      <SourceGroup key={entry.key} stories={entry.stories} renderStory={renderStoryCard} />
                    ) : (
                      renderStoryCard(entry.story)
                    );
                  })
              }
            </div>
          )}
        </div>
      </div>
      <HomeSideRail />
      </div>
    </>
  );
}
