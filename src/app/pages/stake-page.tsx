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
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { storiesService } from '@/app/data/stories-service';
import { pointsService } from '@/app/data/points-service';
import { useAuth } from '@/auth';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { FeedSkeleton } from '@/app/components/feed/feed-skeleton';
import { SourceGroup, type GroupPlayer } from '@/app/components/shared/source-group';
import { SEO } from '@/app/components/seo';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { isSafeTag } from '@/app/data/event-links';
import { linkKeyFor, linksFor, type LinkedContentState } from '@/lib/linked-content';
import { groupBySource } from '@/lib/group-by-source';
import type { StoryWithAuthor, PointWithUserPosition, PositionType, PointSummary } from '@/app/types';

const STAKE_LIMIT = 50;

type StakeTab = 'points' | 'stories';

export function StakePage() {
  const { tag } = useParams<{ tag: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const eventSlug = searchParams.get('event');

  const [points, setPoints] = useState<PointWithUserPosition[]>([]);
  const [stories, setStories] = useState<StoryWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // P1212 §5 / P1296 item 2 — the footer counts, batch-fetched per tab exactly as /feed does
  // it. Each map is stored WITH the id set it answers, so a stale map reads as "not loaded"
  // rather than as "none linked" (see linked-content.ts).
  const [storyPointsState, setStoryPointsState] = useState<LinkedContentState<PointSummary>>();
  const [pointStoriesState, setPointStoriesState] = useState<LinkedContentState<StoryWithAuthor>>();

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
  // What each tab's links were last fetched FOR. Switching tabs back and forth changes neither
  // the viewer nor the id set, so it must not repeat the query (review, 2026-09-11). BOTH answers
  // depend on the viewer, so the viewer is part of both keys: the stories side carries the
  // viewer's own positions, and the points side is read through RLS, which shows an author their
  // OWN private story — a sign-in in another tab must not keep the anonymous map.
  const fetchedStoryLinksRef = useRef<string | null>(null);
  const fetchedPointLinksRef = useRef<string | null>(null);

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

  // P1296 item 7 — stories built on one video gather under one player.
  const storyEntries = useMemo(() => groupBySource(stories), [stories]);

  const isEmpty = points.length === 0 && stories.length === 0;

  /**
   * Was this page the FIRST entry in the tab's history — a typed URL, a bookmark, the event's
   * link opened cold? Captured once, at mount.
   */
  const arrivedColdRef = useRef(location.key === 'default');

  /**
   * BACK (founder, 2026-08-31): "if I go to CMP7, I'm there, but it doesn't have
   * the back button to the previous page." Two arrivals, two correct behaviours: coming FROM
   * somewhere there is history to pop; arriving cold there is not, and `navigate(-1)` would
   * leave the app entirely — so those arrivals go to the feed, the nearest surface this page
   * is a cut-down version of.
   *
   * P1296 — THE COLD TEST READS THE HISTORY POSITION, NOT `location.key`. It used to test
   * `location.key === 'default'`, but react-router mints a new key on every navigation,
   * `replace` included, while keeping the history index in `history.state.idx`. So once tab
   * switches became `replace` navigations, a reader who opened the event link cold, switched a
   * tab and tapped "Go back" got `navigate(-1)` — out of the app. `idx === 0` survives a
   * replace. Where there is no browser history index (an in-memory router) the mount-time
   * capture answers the same question.
   */
  const handleBack = useCallback(() => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    const atFirstEntry = typeof idx === 'number' ? idx === 0 : arrivedColdRef.current;
    if (atFirstEntry) navigate('/feed', { replace: true });
    else navigate(-1);
  }, [navigate]);

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
        {!loading && (
          <div className="mt-8 flex justify-center" data-testid="stake-bottom-back">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back from the end of the list"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-blue-200 bg-card px-5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950/40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Go back
            </button>
          </div>
        )}
      </div>
      {/* eventSlug is read so the Links button can carry the event across
          destinations; the surface itself renders identically with or without it. */}
      <span className="hidden" data-testid="stake-event-slug">{eventSlug ?? ''}</span>
    </div>
  );
}
