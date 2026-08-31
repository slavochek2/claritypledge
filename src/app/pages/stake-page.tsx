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
 * ROUTE: a GLOBAL `/stake/:tag`, optionally `?event=<slug>` (Resolved Decision 2).
 * The content is global — cmp7 is the same seven Points at every event — and the
 * only reason to nest it under an event was the Links button, which the query
 * param resolves without nesting. A bare /stake/:tag is a usable, handable
 * cut-down feed with no button and no event context, public exactly as /feed is.
 *
 * ORDERING: oldest-first is requested FROM THE DATABASE (`ascending = true`),
 * never reversed client-side — decisions.md 2026-03-13, and P1055 depends on the
 * instrument's order being the stored order rather than a render-time accident.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { storiesService } from '@/app/data/stories-service';
import { pointsService } from '@/app/data/points-service';
import { useAuth } from '@/auth';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedSkeleton } from '@/app/components/feed/feed-skeleton';
import { SEO } from '@/app/components/seo';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { isSafeTag } from '@/app/data/event-links';
import type { StoryWithAuthor, PointWithUserPosition, PositionType } from '@/app/types';

const STAKE_LIMIT = 50;

type StakeTab = 'points' | 'stories';

export function StakePage() {
  const { tag } = useParams<{ tag: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const eventSlug = searchParams.get('event');

  const [points, setPoints] = useState<PointWithUserPosition[]>([]);
  const [stories, setStories] = useState<StoryWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StakeTab>('points');

  const viewerUserId = session?.user?.id;
  const requestIdRef = useRef(0);

  // The menu builder only ever hands out a tag that passed isSafeTag — but this
  // route is a GLOBAL param, reachable by anyone typing an arbitrary string
  // into /stake/:tag directly. That invariant has to be re-checked here, at the
  // boundary that actually serves internet traffic, not assumed from the caller.
  const tagIsValid = isSafeTag(tag);

  const fetchData = useCallback(async () => {
    if (!tag || !isSafeTag(tag)) return;
    const rid = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      // ascending = true — oldest-first from the DB, the P1075 server-side
      // single-tag path (exactly one tag is always active here, so this never
      // falls back to the client-side multi-tag filter).
      const [fetchedPoints, fetchedStories] = await Promise.all([
        pointsService.getPublicPointsFeed(STAKE_LIMIT, 0, tag, viewerUserId, true),
        storiesService.getPublicStoriesFeed(STAKE_LIMIT, 0, tag, true),
      ]);
      if (rid !== requestIdRef.current) return; // a slower earlier call resolving late
      setPoints(fetchedPoints);
      setStories(fetchedStories);
    } catch {
      if (rid !== requestIdRef.current) return;
      setError('Could not load this list.');
    } finally {
      if (rid === requestIdRef.current) setLoading(false);
    }
  }, [tag, viewerUserId]);

  // AC-9: the ONLY things that refetch are the tag and the viewer. A position
  // change deliberately does NOT appear in any dependency array and no refetch
  // is wired to one — reintroducing that guard is what causes the loading flash
  // the acceptance criterion forbids. The card updates its own count optimistically.
  useEffect(() => { void fetchData(); }, [fetchData]);

  /** P543: a point whose last position is withdrawn leaves the list. Local only. */
  const handlePointRemoved = useCallback((pointId: string, removedPosition: PositionType | null) => {
    setPoints(prev => prev
      .map(p => {
        if (p.id !== pointId) return p;
        const counts = { ...p.positionCounts };
        if (removedPosition) counts[removedPosition] = Math.max(0, (counts[removedPosition] || 0) - 1);
        const total = Math.max(0, p.totalPositions - 1);
        if (total === 0) return null;
        return { ...p, positionCounts: counts, totalPositions: total };
      })
      .filter((p): p is PointWithUserPosition => p !== null));
  }, []);

  // A tab renders only if it has content. cmp7/cmp3 are Points only, so no tabs
  // appear there; a per-event topic tag may carry both. Founder: "a tab is only
  // visible if stories are there."
  const showTabs = useMemo(
    () => points.length > 0 && stories.length > 0,
    [points.length, stories.length]
  );

  useEffect(() => {
    if (!showTabs) setActiveTab('points');
  }, [showTabs]);

  const isEmpty = points.length === 0 && stories.length === 0;

  /**
   * BACK (founder, 2026-08-31): "if I go to CMP7, I'm there, but it doesn't have
   * the back button to the previous page."
   *
   * The Links button already carries the attendee sideways to the next
   * destination without a back hop — that property is unchanged and still
   * tested. What was missing is the way OUT of the sideways move: someone who
   * opened cmp7 to look at it had no route back to the room they came from
   * except the browser chrome, which a phone in a live room half-hides.
   *
   * `location.key === 'default'` is react-router's marker for the FIRST history
   * entry — a typed URL, a bookmark, a link from outside. There is nothing
   * behind it, so `navigate(-1)` would leave the app entirely; those arrivals go
   * to the feed instead, which is the nearest surface this page is a cut-down
   * version of.
   */
  const handleBack = useCallback(() => {
    if (location.key === 'default') navigate('/feed', { replace: true });
    else navigate(-1);
  }, [navigate, location.key]);

  if (!tagIsValid) {
    return (
      <div className="min-h-screen bg-background pt-4 pb-8">
        <SEO title="Stake — Clarity Pledge" description="Take a position." />
        <div className="mx-auto w-full max-w-2xl px-4">
          <FocusHeader onBack={handleBack} />
          <div className="py-12 text-center" data-testid="stake-invalid-tag">
            <h2 className="mb-2 text-lg font-medium text-foreground">Nothing here</h2>
            <p className="text-muted-foreground">This link doesn't point at anything.</p>
          </div>
        </div>
      </div>
    );
  }

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
        <h1 className="sr-only">{tag}</h1>

        <FocusHeader onBack={handleBack} />

        {showTabs && (
          <div className="mb-4 flex gap-2" role="tablist" data-testid="stake-tabs">
            {(['points', 'stories'] as StakeTab[]).map(t => (
              <button
                key={t}
                role="tab"
                aria-selected={activeTab === t}
                data-testid={`stake-tab-${t}`}
                onClick={() => setActiveTab(t)}
                className={`min-h-[44px] px-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t
                    ? 'border-[#002B5C] text-[#002B5C] dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-muted-foreground'
                }`}
              >
                {t === 'points' ? 'Points' : 'Stories'}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <FeedSkeleton />
        ) : error ? (
          <div className="py-12 text-center">
            <p className="mb-4 text-muted-foreground">{error}</p>
            <button
              onClick={() => void fetchData()}
              className="min-h-[44px] font-medium text-blue-600 transition-colors hover:text-blue-700"
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
                  />
                ))
              : stories.map(story => (
                  <FeedStoryCard key={story.id} story={story} activeTag={tag} />
                ))}
          </div>
        )}
      </div>
      {/* eventSlug is read so the Links button can carry the event across
          destinations; the surface itself renders identically with or without it. */}
      <span className="hidden" data-testid="stake-event-slug">{eventSlug ?? ''}</span>
    </div>
  );
}
