/**
 * @file feed-page.tsx
 * @description P491/P499: Home — public content discovery with creation CTA.
 *
 * Two tabs (Points default, Stories), tag cloud, search bar, URL-driven tag filter.
 * Logged-in users see "Share a Story" button. Internal tags (st1, st2...) hidden from cloud.
 * Accessible to both authenticated and anonymous users (public content only).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X, Globe, ArrowUpDown } from 'lucide-react';
import { storiesService } from '@/app/data/stories-service';
import { pointsService } from '@/app/data/points-service';
import { useAuth } from '@/auth';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { ActiveTagFilter } from '@/app/components/feed/active-tag-filter';
import { FeedSkeleton } from '@/app/components/feed/feed-skeleton';
import { SEO } from '@/app/components/seo';
import { analytics } from '@/lib/mixpanel';
import type { StoryWithAuthor, PointWithUserPosition, PositionType } from '@/app/types';

type FeedTab = 'points' | 'stories';

const FEED_LIMIT = 50;

/** Internal tags used for content organization — hidden from public tag cloud */
const INTERNAL_TAG_PATTERN = /^st\d+$/i;

export function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();

  // URL-driven state
  const activeTag = searchParams.get('tag') || undefined;
  const tabParam = searchParams.get('tab');
  const activeTab: FeedTab = tabParam === 'stories' ? 'stories' : 'points';
  const ascending = searchParams.get('sort') === 'oldest';

  // Data state
  const [stories, setStories] = useState<StoryWithAuthor[]>([]);
  const [points, setPoints] = useState<PointWithUserPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state (local, not in URL)
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const viewerUserId = session?.user?.id;
      const [storiesData, pointsData] = await Promise.all([
        storiesService.getPublicStoriesFeed(FEED_LIMIT, 0, activeTag, ascending),
        pointsService.getPublicPointsFeed(FEED_LIMIT, 0, activeTag, viewerUserId, ascending),
      ]);
      setStories(storiesData);
      setPoints(pointsData);
    } catch {
      setError('Could not load feed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [activeTag, session?.user?.id, ascending]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // P543: Surgical callback — avoid full refetch on position removal
  const handlePointRemoved = useCallback((pointId: string, removedPosition: PositionType | null) => {
    setPoints(prev => prev.map(p => {
      if (p.id !== pointId) return p;
      // Use CURRENT totalPositions from state (not stale closure from card)
      const updatedCounts = { ...p.positionCounts };
      if (removedPosition) updatedCounts[removedPosition] = Math.max(0, (updatedCounts[removedPosition] || 0) - 1);
      const newTotal = Math.max(0, p.totalPositions - 1);
      if (newTotal === 0) return null; // mark for removal
      return { ...p, positionCounts: updatedCounts, totalPositions: newTotal };
    }).filter((p): p is PointWithUserPosition => p !== null));
  }, []);

  // Tag cloud: extract from both stories + points (client-side, Decision 8)
  const tagCloud = useMemo(() => {
    const tagCounts = new Map<string, number>();
    for (const story of stories) {
      for (const tag of story.tags || []) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    for (const point of points) {
      for (const tag of point.tags || []) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    return [...tagCounts.entries()]
      .filter(([tag]) => !INTERNAL_TAG_PATTERN.test(tag))
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [stories, points]);

  // Client-side search filtering (Decision 9)
  const filteredStories = useMemo(() => {
    if (!searchQuery.trim()) return stories;
    const q = searchQuery.toLowerCase();
    return stories.filter(s => s.content.toLowerCase().includes(q));
  }, [stories, searchQuery]);

  const filteredPoints = useMemo(() => {
    if (!searchQuery.trim()) return points;
    const q = searchQuery.toLowerCase();
    return points.filter(p => p.statement.toLowerCase().includes(q));
  }, [points, searchQuery]);

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

  // Tag filter dismiss
  const handleDismissTag = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('tag');
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

  // Tag cloud chip click
  const handleTagCloudClick = (tag: string) => {
    if (tag === activeTag) return; // no-op
    analytics.track('feed_tag_filtered', { tag, source: 'tag_cloud' });
    const params = new URLSearchParams(searchParams);
    params.set('tag', tag);
    setSearchParams(params, { replace: false });
  };

  // Active content based on tab
  const activeContent = activeTab === 'stories' ? filteredStories : filteredPoints;

  const seoTitle = activeTag
    ? `#${activeTag} — ClarityPledge`
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
              const isActive = tag === activeTag;
              return (
                <button
                  key={tag}
                  onClick={() => handleTagCloudClick(tag)}
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300 cursor-default'
                      : 'bg-muted text-muted-foreground hover:bg-blue-50 hover:text-blue-600 cursor-pointer'
                  }`}
                  aria-pressed={isActive}
                  disabled={isActive}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        )}

        {/* Active tag filter pill */}
        {activeTag && (
          <div className="mb-4">
            <ActiveTagFilter tag={activeTag} onDismiss={handleDismissTag} />
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
          <button
            onClick={handleSortToggle}
            className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            aria-label={ascending ? 'Currently oldest first, click for newest' : 'Currently newest first, click for oldest'}
          >
            {ascending ? 'Oldest first' : 'Newest first'}
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
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
              {activeTag ? (
                <>
                  <h2 className="text-lg font-medium text-foreground mb-2">
                    No content tagged #{activeTag} yet
                  </h2>
                  <button
                    onClick={handleDismissTag}
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
                      activeTag={activeTag}
                      onPointRemoved={handlePointRemoved}
                    />
                  ))
                : (filteredStories as StoryWithAuthor[]).map((story) => (
                    <FeedStoryCard
                      key={story.id}
                      story={story}
                      activeTag={activeTag}
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
