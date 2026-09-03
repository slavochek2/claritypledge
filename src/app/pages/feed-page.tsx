/**
 * @file feed-page.tsx
 * @description P491/P499: Home — public content discovery with creation CTA.
 *
 * Two tabs (Points default, Stories), tag cloud, search bar, URL-driven tag filter.
 * Logged-in users see "Share a Story" button. Internal tags (st1, st2...) hidden from cloud.
 * Accessible to both authenticated and anonymous users (public content only).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X, Globe, ArrowUpDown } from 'lucide-react';
import { storiesService } from '@/app/data/stories-service';
import { pointsService } from '@/app/data/points-service';
import { useAuth } from '@/auth';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedSkeleton } from '@/app/components/feed/feed-skeleton';
import { SEO } from '@/app/components/seo';
import { analytics } from '@/lib/mixpanel';
import { parseTags, serializeTags, filterByTags, collapseToLatest } from '@/lib/feed-utils';
import type { StoryWithAuthor, PointWithUserPosition, PositionType, PointSummary } from '@/app/types';

type FeedTab = 'points' | 'stories';

const FEED_LIMIT = 50;

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
      return { ...p, positionCounts: updatedCounts, totalPositions: newTotal };
    })
    .filter((p): p is PointWithUserPosition => p !== null);
}

export function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();

  // URL-driven state — supports both ?tag=X,Y and ?tag=X&tag=Y
  const activeTags = useMemo(() => {
    const allParams = searchParams.getAll('tag');
    return allParams.flatMap(p => parseTags(p));
  }, [searchParams]);
  const tabParam = searchParams.get('tab');
  const activeTab: FeedTab = tabParam === 'stories' ? 'stories' : 'points';
  const ascending = searchParams.get('sort') === 'oldest';
  const versionLatest = searchParams.get('version') === 'latest';

  // Data state
  const [stories, setStories] = useState<StoryWithAuthor[]>([]);
  const [points, setPoints] = useState<PointWithUserPosition[]>([]);
  // P1075: tag cloud must reflect ALL public content (BR-8, P602), independent of
  // the active tag filter -- kept separate from `stories`/`points` above, which are
  // now server-side filtered by the active tag and can't double as the cloud source.
  const [cloudStories, setCloudStories] = useState<StoryWithAuthor[]>([]);
  const [cloudPoints, setCloudPoints] = useState<PointWithUserPosition[]>([]);
  // P1212 §5 — undefined until the link query resolves; see the effect below.
  const [storyPointsMap, setStoryPointsMap] = useState<Map<string, PointSummary[]>>();
  const [pointStoriesMap, setPointStoriesMap] = useState<Map<string, StoryWithAuthor[]>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state (local, not in URL)
  const [searchQuery, setSearchQuery] = useState('');

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
    setLoading(true);
    setError(null);
    try {
      const viewerUserId = session?.user?.id;
      const tagFilter = activeTags.length === 1 ? activeTags[0] : undefined;

      // BR-8: tag cloud stays computed from ALL public content. When no tag filter
      // is active the list fetch below already is the unfiltered set -- reuse it
      // instead of a redundant extra round-trip. When a tag IS active, the two
      // extra cloud calls fire concurrently with the list calls (single Promise.all)
      // rather than after them -- sequential awaits would double the round-trip
      // latency of every filtered page load.
      if (tagFilter) {
        const [storiesData, pointsData, allStories, allPoints] = await Promise.all([
          storiesService.getPublicStoriesFeed(FEED_LIMIT, 0, tagFilter, ascending),
          pointsService.getPublicPointsFeed(FEED_LIMIT, 0, tagFilter, viewerUserId, ascending),
          storiesService.getPublicStoriesFeed(FEED_LIMIT, 0, undefined, ascending),
          pointsService.getPublicPointsFeed(FEED_LIMIT, 0, undefined, viewerUserId, ascending),
        ]);
        if (isStale()) return;
        setStories(storiesData);
        setPoints(pointsData);
        setCloudStories(allStories);
        setCloudPoints(allPoints);
      } else {
        const [storiesData, pointsData] = await Promise.all([
          storiesService.getPublicStoriesFeed(FEED_LIMIT, 0, undefined, ascending),
          pointsService.getPublicPointsFeed(FEED_LIMIT, 0, undefined, viewerUserId, ascending),
        ]);
        if (isStale()) return;
        setStories(storiesData);
        setPoints(pointsData);
        setCloudStories(storiesData);
        setCloudPoints(pointsData);
      }
    } catch {
      if (!isStale()) setError('Could not load feed. Please try again.');
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [session?.user?.id, ascending, activeTags]);

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

  useEffect(() => {
    let cancelled = false;

    if (activeTab === 'stories') {
      if (visibleStoryIds.length === 0) return;
      storiesService
        .getPointsForStories(visibleStoryIds)
        .then(map => { if (!cancelled) setStoryPointsMap(map); })
        .catch(() => { /* expander stays hidden; the feed itself still renders */ });
    } else {
      if (visiblePointIds.length === 0) return;
      storiesService
        .getStoriesForPoints(visiblePointIds)
        .then(map => { if (!cancelled) setPointStoriesMap(map); })
        .catch(() => { /* expander stays hidden; the feed itself still renders */ });
    }

    return () => { cancelled = true; };
  }, [activeTab, visibleStoryIds, visiblePointIds]);


  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // P543: Surgical callback — avoid full refetch on position removal
  // P1075: also applied to cloudPoints -- a point dropping to zero positions must
  // disappear from the tag cloud too (P543 invariant), not just the rendered list.
  const handlePointRemoved = useCallback((pointId: string, removedPosition: PositionType | null) => {
    setPoints(prev => removePointPosition(prev, pointId, removedPosition));
    setCloudPoints(prev => removePointPosition(prev, pointId, removedPosition));
  }, []);

  // Tag cloud: extract from ALL stories + points (BR-8: computed from all content)
  // P630: tags now includes system tags (merged at data layer). Hide st/v tags from cloud.
  // P1075: reads cloudStories/cloudPoints (always unfiltered), not stories/points
  // (now server-side tag-filtered) -- see fetchData.
  const tagCloud = useMemo(() => {
    const tagCounts = new Map<string, number>();
    for (const story of cloudStories) {
      for (const tag of story.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    for (const point of cloudPoints) {
      for (const tag of point.tags || []) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    return [...tagCounts.entries()]
      .filter(([tag]) => !/^st\d+$/i.test(tag) && !/^v\d+$/i.test(tag))
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [cloudStories, cloudPoints]);

  // Client-side tag + version + search filtering
  const filteredStories = useMemo(() => {
    let result = filterByTags(stories, activeTags);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => s.content.toLowerCase().includes(q));
    }
    return result;
  }, [stories, activeTags, searchQuery]);

  const filteredPoints = useMemo(() => {
    let result = filterByTags(points, activeTags);
    if (versionLatest) {
      result = collapseToLatest(result);
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
    if (tab === 'stories') {
      params.set('tab', 'stories');
    } else {
      params.delete('tab');
    }
    setSearchParams(params, { replace: false });
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
  const handleSortToggle = () => {
    const newSort = ascending ? 'newest' : 'oldest';
    analytics.track('feed_sort_changed', { sort_order: newSort });
    const params = new URLSearchParams(searchParams);
    if (ascending) {
      params.delete('sort');
    } else {
      params.set('sort', 'oldest');
    }
    setSearchParams(params, { replace: false });
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
    setSearchParams(params, { replace: false });
  };

  // Active content based on tab
  const activeContent = activeTab === 'stories' ? filteredStories : filteredPoints;

  const seoTitle = activeTags.length > 0
    ? `${activeTags.map(t => `#${t}`).join(' ')} — ClarityPledge`
    : 'Home — ClarityPledge';

  return (
    <>
      <SEO title={seoTitle} description="Browse public stories and points shared by the ClarityPledge community." />

      <div className="container mx-auto px-4 lg:px-8 py-6 max-w-2xl">
        {/* Page header + Write Story CTA */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground">Home</h1>
          {session && (
            <Link
              to="/create"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors"
            >
              <Globe className="w-4 h-4" />
              Share a Story
            </Link>
          )}
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search stories and points..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Tag cloud (only when we have tags and not loading) */}
        {!loading && tagCloud.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {tagCloud.map((tag) => {
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
            aria-selected={activeTab === 'points'}
            onClick={() => handleTabChange('points')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'points'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Points
            {activeTab === 'points' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
            )}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'stories'}
            onClick={() => handleTabChange('stories')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'stories'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Stories
            {activeTab === 'stories' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
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
            <button
              onClick={handleSortToggle}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              aria-label={ascending ? 'Currently oldest first, click for newest' : 'Currently newest first, click for oldest'}
            >
              {ascending ? 'Oldest first' : 'Newest first'}
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content area */}
        <div role="tabpanel" aria-live="polite">
          {loading ? (
            <FeedSkeleton />
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
              {activeTab === 'points'
                ? (filteredPoints as PointWithUserPosition[]).map((point) => (
                    <FeedPointCard
                      key={point.id}
                      point={point}
                      activeTag={activeTags[0]}
                      onPointRemoved={handlePointRemoved}
                      linkedStories={pointStoriesMap?.get(point.id) ?? (pointStoriesMap ? [] : undefined)}
                    />
                  ))
                : (filteredStories as StoryWithAuthor[]).map((story) => (
                    <FeedStoryCard
                      key={story.id}
                      story={story}
                      activeTag={activeTags[0]}
                      linkedPoints={storyPointsMap?.get(story.id) ?? (storyPointsMap ? [] : undefined)}
                    />
                  ))
              }
            </div>
          )}
        </div>
      </div>
    </>
  );
}
