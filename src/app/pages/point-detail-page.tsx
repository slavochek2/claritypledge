/**
 * @file point-detail-page.tsx
 * @description Point detail page - shows a point with positions.
 * Route: /point/:id
 *
 * Points are shared across profiles. We use a referrer query param to contextualize
 * the view, or show a generic view if no referrer.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Pin, Loader2 } from 'lucide-react';
import { useAuth } from '@/auth';
import { pointsService } from '@/app/data/points-service';
import { resolvePointSlug } from '@/app/data/points-service-real';
import { storiesService } from '@/app/data/stories-service';
import type { PointWithCounts, PointWithUserPosition, PointPositionWithUser, PositionType, StoryWithAuthor, Story as AppStory } from '@/app/types';
import { toSevenPointCounts } from '@/app/utils/position-helpers';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { BottomBackButton, CLEAR_BOTTOM_NAV } from '@/app/components/layout/bottom-back-button';
import { PointSupersedeBanner } from '@/app/components/social/point-supersede-banner';
import { PointVersionHistory } from '@/app/components/social/point-version-history';
import { SEO } from '@/app/components/seo';
import {
  PositionButtons,
  ShareButton,
  type PositionFilter,
} from '@/app/components/shared';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import { PointCardWithLinks, type PointProfileOwner } from '@/app/components/social/point-card-with-links';
import { PointPositionsBlock } from '@/app/components/social/point-positions-block';
import { PointSpreadRow } from '@/app/components/shared/position-spread';
import type { Point as ProtoPoint, Story as ProtoStory } from '@/app/components/shared/prototype-types';
import { linkifyText } from '@/app/utils/linkify';
import { InlineVisibilityIcon } from '@/app/components/shared';
import { TagPills } from '@/app/components/shared/tag-pills';
import { stripHashtags } from '@/lib/utils';
import { getAnonPosition, setAnonPosition as setAnonPositionStorage } from '@/app/hooks/useAnonPosition';
import { AnonPositionCTA } from '@/app/components/shared/anon-position-cta';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useReturnState } from '@/app/hooks/use-return-state';
import { readThrough } from '@/lib/offline-read-cache';
import { useConnectivity, useOfflinePageReport } from '@/app/contexts/offline-status-context';
import { NeedsConnection } from '@/app/components/offline/needs-connection';
import { useOnlineWriteGuard, writeFailureMessage } from '@/app/hooks/use-online-write-guard';
import { networkMark } from '@/lib/network-outcome';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';


/** P1364: the `?filter=` values; `satisfies` ties the list to PositionFilter so a new value is a type error here. */
const POSITION_FILTER_PARAMS = ['agree', 'disagree', 'unsure'] as const satisfies readonly PositionFilter[];
const isPositionFilterParam = (v: string | null): v is (typeof POSITION_FILTER_PARAMS)[number] =>
  (POSITION_FILTER_PARAMS as readonly string[]).includes(v ?? '');

export function PointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [point, setPoint] = useState<PointWithCounts | null>(null);
  const [positions, setPositions] = useState<PointPositionWithUser[]>([]);
  // P1364: the holders' position filter lives in `?filter=` (replace; 'all' has no param), so
  // opening a holder's story and coming Back returns to the same filter.
  const filterParam = searchParams.get('filter');
  const positionFilter: PositionFilter =
    isPositionFilterParam(filterParam) ? filterParam : 'all';
  const setPositionFilter = useCallback((next: PositionFilter) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (next === 'all') params.delete('filter');
      else params.set('filter', next);
      return params;
    }, { replace: true });
  }, [setSearchParams]);
  const [userPosition, setUserPosition] = useState<PositionType | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // P1369: storedAt of the offline copy on screen (null = live data), reported to the strip.
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  useOfflinePageReport(cachedAt === null ? null : { kind: 'cached', storedAt: cachedAt, slow });
  const canWrite = useOnlineWriteGuard(cachedAt !== null);
  const { reconnectTick } = useConnectivity();
  // P502: Anonymous position state — visual only, no count adjustment
  const [anonPosition, setAnonPositionState] = useState<PositionType | null>(null);
  const [linkedStories, setLinkedStories] = useState<Map<string, StoryWithAuthor[]>>(new Map());
  const [viewerStory, setViewerStory] = useState<AppStory | null>(null);
  // P542: Accordion state — only one story expanded at a time
  // P1364 §5: remembered per visit — Back reopens what the reader had open (use-return-state.ts).
  const [expandedHolderId, setExpandedHolderId] = useReturnState<string | null>('point-holder-expanded', null);
  // P621: Unlink point from story dialog state
  const [unlinkTargetStory, setUnlinkTargetStory] = useState<string | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  // P401: Guard position removal with linked-stories warning dialog
  const { dialogProps, guardedRemovePosition } = useRemovePositionGuard({
    userId: user?.id ?? '',
    onAfterRemove: async (pointId) => {
      // After confirmed removal, reload to get updated counts + position holders
      const [updatedPoint, updatedPositions] = await Promise.all([
        user?.id
          ? pointsService.getPointWithUserPosition(pointId, user.id)
          : pointsService.getPointWithCounts(pointId),
        pointsService.getPositionsForPoint(pointId),
      ]);
      if (updatedPoint) {
        setPoint(updatedPoint);
        setUserPosition(null);
      }
      setPositions(updatedPositions);
    },
  });

  // Re-read on reconnect only when what is on screen is not live.
  const reconnectKey = cachedAt !== null || error === 'offline' ? reconnectTick : 0;

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      if (!id) {
        setError('not_found');
        setLoading(false);
        return;
      }

      // Resolve slug (e.g. "st1", "st3-a") to UUID, or use id directly
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      let pointId: string | null = id;
      if (!isUuid) {
        // late: resolves to an id and redirects; the page's own read below carries the strip.
        const slug = await readThrough('point-slug', id, () => resolvePointSlug(id));
        if (cancelled) return;
        if (slug.source === 'offline') {
          setError('offline');
          setLoading(false);
          return;
        }
        pointId = slug.data;
      }

      if (!pointId) {
        setError('not_found');
        setLoading(false);
        return;
      }

      // If slug resolved to a different id, redirect to canonical UUID URL
      if (pointId !== id) {
        navigate(`/point/${pointId}${window.location.search}`, { replace: true });
        return;
      }

      try {
        // P1369: network first; the offline read cache answers only when the network did not.
        // The bundle carries the viewer's own position: stored only when fetched as the cache
        // owner (viewerId), never keyed by `user` — null until the profile loads, so an offline
        // reload (profile never loads) would look under another key and miss.
        const resolvedId = pointId;
        type Bundle = {
          pointData: PointWithUserPosition | PointWithCounts;
          positionData: Awaited<ReturnType<typeof pointsService.getPositionsForPoint>>;
          storiesData: Map<string, StoryWithAuthor[]>;
          viewerStoryData: AppStory | null;
        };
        const show = ({ pointData, positionData, storiesData, viewerStoryData }: Bundle) => {
          setPoint(pointData);
          setPositions(positionData);
          setLinkedStories(storiesData);
          setViewerStory(viewerStoryData);
          // The bundle's own answer, including "no position" (removed on another device).
          if (user?.id) setUserPosition((pointData as PointWithUserPosition).userPosition?.position ?? null);
        };
        const read = await readThrough('point', resolvedId, async (): Promise<Bundle | null> => {
          const [pointData, positionData, storiesData, viewerStoryData] = await Promise.all([
            user?.id
              ? pointsService.getPointWithUserPosition(resolvedId, user.id)
              : pointsService.getPointWithCounts(resolvedId),
            pointsService.getPositionsForPoint(resolvedId),
            storiesService.getStoriesForPoints([resolvedId]).catch(() => new Map<string, StoryWithAuthor[]>()),
            user?.id
              ? storiesService.getStoryByUserAndPoint(user.id, resolvedId).catch(() => null)
              : Promise.resolve(null),
          ]);
          return pointData ? { pointData, positionData, storiesData, viewerStoryData } : null;
        }, {
          viewerId: user?.id ?? null,
          // P1337: a slow network's late answer replaces the saved copy.
          onLate: late => {
            if (cancelled) return;
            setCachedAt(null);
            setSlow(false);
            if (late) show(late);
            else setError('not_found'); // deleted, or no longer visible
          },
        });
        if (cancelled) return;

        if (read.source === 'offline') {
          setError('offline');
          setLoading(false);
          return;
        }
        if (!read.data) {
          setError('not_found');
          setLoading(false);
          return;
        }
        setError(null);
        setCachedAt(read.source === 'cache' ? read.storedAt : null);
        setSlow(read.source === 'cache' && !!read.slow);
        show(read.data);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading point:', err);
        setError('network_error');
        setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id, retryKey, reconnectKey, navigate]);

  // P502: Load anon position from localStorage on mount
  useEffect(() => {
    if (!user && id) {
      const stored = getAnonPosition(id) as PositionType | null;
      if (stored) setAnonPositionState(stored);
    }
  }, [user, id]);

  // Counts for position buttons
  const buttonCounts = useMemo(() => {
    if (!point) return toSevenPointCounts({});
    return toSevenPointCounts(point.positionCounts);
  }, [point]);

  const handlePositionClick = async (position: PositionType) => {
    if (!id) return;

    // P502: Anonymous user → optimistic local position, no redirect. P1369: a stored session
    // without a profile (offline reload: the profile never loads) is a signed-in reader, not anon.
    if (!user && !session?.user) {
      const currentAnon = anonPosition;
      const newPosition = currentAnon === position ? null : position;
      setAnonPositionState(newPosition);
      setAnonPositionStorage(id, newPosition);
      return;
    }

    if (!canWrite()) return;
    if (!user) return; // signed in, profile still loading: nothing to write as yet

    // Toggle: clicking same position removes it
    const newPosition = userPosition === position ? null : position;

    // Optimistic update
    setUserPosition(newPosition);

    // Persist to database
    const sentAt = networkMark();
    try {
      if (newPosition === null) {
        // P401: Use guarded removal — shows dialog if linked stories exist
        // Revert optimistic update first (the guard will handle the actual removal + reload)
        setUserPosition(userPosition);
        await guardedRemovePosition(id);
        return;
      } else {
        await pointsService.setPosition(id, user.id, newPosition);
      }

      // Reload point to get updated counts + position holders
      const [updatedPoint, updatedPositions] = await Promise.all([
        pointsService.getPointWithUserPosition(id, user.id),
        pointsService.getPositionsForPoint(id),
      ]);
      if (updatedPoint) {
        setPoint(updatedPoint);
      }
      setPositions(updatedPositions);
    } catch (err) {
      console.error('Failed to update position:', err);
      // Revert optimistic update on error
      setUserPosition(userPosition);
      // P1369: a write that never reached the server says so (a captive portal's first write is
      // the first request to fail, so the guard above could not know).
      toast.error(writeFailureMessage(err, 'Failed to save position.', sentAt));
    }
  };

  // P1364: Back returns to wherever the reader came from (useGoBack, via the components'
  // `fallback`); only a cold arrival goes to the feed. The old `history.length > 1` test
  // popped out of the site for a reader who arrived from an outside page in a used tab and
  // never reached the fallback for a cold one whose tab had any history at all.
  const BACK_FALLBACK = '/feed';

  // P621: Unlink point from story handlers
  const handleUnlinkClick = useCallback((storyId: string) => {
    setUnlinkTargetStory(storyId);
  }, []);

  const handleUnlinkConfirm = useCallback(async () => {
    if (!unlinkTargetStory || !point) return;
    if (!canWrite()) return;
    setIsUnlinking(true);
    try {
      const ok = await storiesService.unlinkPointFromStory(unlinkTargetStory, point.id);
      if (ok) {
        setViewerStory(null);
        // Also clear from linkedStories map so storyByAuthorId doesn't retain it
        setLinkedStories(prev => {
          const next = new Map(prev);
          const stories = next.get(point.id) ?? [];
          next.set(point.id, stories.filter(s => s.id !== unlinkTargetStory));
          return next;
        });
        setExpandedHolderId(null);
        toast.success('Point unlinked from story');
      } else {
        toast.error('Failed to unlink point. Please try again.');
      }
    } catch {
      toast.error('Failed to unlink point. Please try again.');
    } finally {
      setIsUnlinking(false);
      setUnlinkTargetStory(null);
    }
  }, [unlinkTargetStory, point, setExpandedHolderId, canWrite]);

  // Helper to retry loading
  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    setPoint(null);
    setPositions([]);
    setLinkedStories(new Map());
    setViewerStory(null);
    setRetryKey(k => k + 1);
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* P1364 UX Notes — loading: the top Back only (no pill until the content renders). */}
        {!isEmbed && <FocusHeader fallback={BACK_FALLBACK} />}
        {/* Skeleton for point card */}
        <div className="bg-card border border-border rounded-lg overflow-hidden mb-4 animate-pulse">
          <div className="border-l-4 border-border p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-muted rounded-full" />
              <div className="flex-1">
                <div className="h-5 bg-muted rounded w-3/4 mb-3" />
                <div className="flex gap-2">
                  <div className="h-8 bg-muted rounded w-20" />
                  <div className="h-8 bg-muted rounded w-20" />
                  <div className="h-8 bg-muted rounded w-20" />
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Skeleton for positions section */}
        <div className="bg-card border border-border rounded-lg overflow-hidden animate-pulse">
          <div className="flex border-b border-gray-100">
            <div className="flex-1 h-12 bg-gray-100" />
          </div>
          <div className="p-4 space-y-3">
            <div className="h-16 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  // P1369: offline and never read on this device — the needs-connection body, not "not found".
  if (error === 'offline') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        {!isEmbed && <FocusHeader fallback={BACK_FALLBACK} />}
        <NeedsConnection onRetry={handleRetry} />
      </div>
    );
  }

  if (error || !point) {
    const isNetworkError = error === 'network_error';
    const errorMessage = isNetworkError
      ? 'Failed to load point. Please check your connection.'
      : 'Point not found';

    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        {!isEmbed && <FocusHeader fallback={BACK_FALLBACK} />}
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">{errorMessage}</p>
          {isNetworkError && (
            <button
              onClick={handleRetry}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-700 text-white rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  // Embed mode: render PointCardWithLinks as a compact person's card
  if (isEmbed) {
    const fromUserId = searchParams.get('from');
    const fromHolder = fromUserId
      ? positions.find(p => p.userId === fromUserId)
      : undefined;

    // Convert PointWithCounts → prototype Point type
    const protoPoint: ProtoPoint = {
      id: point.id,
      text: point.statement,
      createdAt: point.createdAt,
      positions: Object.fromEntries(
        positions.map(p => [p.userId, { position: p.position, timestamp: p.createdAt }])
      ),
      linkedStoryIds: [],
      visibility: point.visibility ?? 'public',
    };

    // Build profileOwner if `from` user found in positions
    const embedProfileOwner: PointProfileOwner | undefined = fromHolder
      ? {
          id: fromHolder.userId,
          name: fromHolder.userName,
          hasPledged: fromHolder.userHasPledged,
          ear: fromHolder.earCount,
          position: fromHolder.position as PositionType,
          avatarUrl: fromHolder.userAvatarUrl,
          avatarColor: fromHolder.userAvatarColor,
        }
      : undefined;

    // Get linked stories for the `from` user (or all if no `from`)
    const allStories = linkedStories.get(point.id) ?? [];
    const embedStories: ProtoStory[] = (
      fromUserId
        ? allStories.filter(s => s.authorId === fromUserId)
        : allStories
    ).map(s => ({
      id: s.id,
      authorId: s.authorId,
      text: s.content,
      createdAt: s.createdAt,
      visibility: s.visibility,
      linkedPointIds: [],
      understoodCount: s.understoodCount,
      // P1212 §4: same conversion, same omission as feed-point-card's. QuotedStory renders
      // the media and the quote block when they are present, and this converter is the
      // only reason the embed surface would not show them.
      imageUrl: s.imageUrl,
      videoUrl: s.videoUrl,
      videoQuotes: s.videoQuotes,
    }));

    return (
      <div className="max-w-[550px] mx-auto" style={{ overflow: 'hidden' }} ref={(el) => {
        // Hide body scroll in embed mode and make background transparent
        if (el) {
          document.body.style.overflow = 'hidden';
          document.body.style.margin = '0';
          document.body.style.padding = '0';
          document.body.style.background = 'transparent';
          document.documentElement.style.background = 'transparent';
          const reportHeight = () => {
            let height = el.scrollHeight;
            // Include portal dropdowns (rendered on document.body, outside this wrapper)
            const portalDropdown = document.querySelector<HTMLElement>('[role="listbox"]');
            if (portalDropdown) {
              const dropdownBottom = portalDropdown.getBoundingClientRect().bottom + window.scrollY;
              height = Math.max(height, dropdownBottom);
            }
            height += 4;
            // eslint-disable-next-line no-console -- gated by import.meta.env.DEV; dev-only diagnostic (P1200)
            if (import.meta.env.DEV) console.log('[embed-resize]', height);
            window.parent.postMessage({ type: 'claritypledge-embed-resize', height }, '*');
          };
          const observer = new ResizeObserver(reportHeight);
          observer.observe(el);
          // Watch for portal elements added/removed on body (e.g., intensity dropdowns)
          const bodyObserver = new MutationObserver(reportHeight);
          bodyObserver.observe(document.body, { childList: true });
          reportHeight();
        }
      }}>
        <RemovePositionDialog {...dialogProps} />
        <PointCardWithLinks
          point={protoPoint}
          linkedStories={embedStories}
          profileOwner={embedProfileOwner}
          currentUserId={user?.id}
          tags={point.tags}
          onPositionSelect={(pos) => {
            if (pos === null) {
              if (id && canWrite()) guardedRemovePosition(id);
            } else {
              handlePositionClick(pos as PositionType);
            }
          }}
          getPointPositionCounts={() => toSevenPointCounts(point.positionCounts)}
          /* P1270 §6 — SECOND HALF OF THE FIX, and the one that recovers the NAME.
             `QuotedStory` now keeps its marker set even when this returns undefined, so the
             disclosure can no longer vanish. But it was returning undefined far more often
             than it needed to: it resolved ONLY against position holders, while
             `embedStories` is built from every linked story. A story whose author holds no
             position on the point they filed it under fell through the gap — and there is no
             constraint requiring a filed story to carry a position.
             The fallback below reads `authorName`/`authorSlug`/`authorAvatarUrl` off the
             story itself. `linkedStories` is already `Map<string, StoryWithAuthor[]>`, so
             this data was fetched, in memory, and discarded. */
          getStoryAuthor={(authorId) => {
            const holder = positions.find(p => p.userId === authorId);
            if (holder) {
              return {
                id: holder.userId,
                name: holder.userName,
                hasPledged: holder.userHasPledged,
                ear: holder.earCount,
                avatarUrl: holder.userAvatarUrl,
                avatarColor: holder.userAvatarColor,
              };
            }
            const authored = allStories.find(st => st.authorId === authorId);
            if (!authored) return undefined;
            return {
              id: authorId,
              name: authored.authorName,
              slug: authored.authorSlug,
              hasPledged: authored.authorHasPledged,
              ear: authored.authorEarsCount,
              avatarUrl: authored.authorAvatarUrl,
              avatarColor: authored.authorAvatarColor,
            };
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* P504: SEO meta tags */}
      <SEO
        title={point.statement.length > 70 ? point.statement.slice(0, 67) + '...' : point.statement}
        description={`Shared on ClarityPledge — take a position.`}
        url={`/point/${point.id}`}
        image={point.bannerUrl || undefined}
        type="article"
      />

      {/* P401: Remove position warning dialog */}
      <RemovePositionDialog {...dialogProps} />

      <div className="px-4 py-6">
      <FocusHeader fallback={BACK_FALLBACK} />

      {/* P800: supersede banner — shown when this point has been replaced by a newer version */}
      {point.supersededBy && (
        <PointSupersedeBanner supersededById={point.supersededBy} />
      )}

      {/* P800: version history expander — shown when chain has >1 entry */}
      <PointVersionHistory pointId={point.id} />

      {/* Point card with full features */}
      <div data-card="point" className="bg-card border border-border border-l-4 border-l-slate-300 rounded-lg shadow-sm overflow-hidden mb-4">
        <div className="p-4">
          {/* Two-column layout */}
          <div className="flex gap-3">
            {/* Pin icon */}
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 text-blue-600 dark:text-blue-400">
              <Pin size={20} />
            </div>

            {/* Content column */}
            <div className="flex-1 min-w-0">
              {/* Point text */}
              <p className="text-foreground font-medium text-lg mb-3"><InlineVisibilityIcon visibility={point.visibility ?? 'public'} />{' '}{linkifyText(stripHashtags(point.statement, point.tags))}</p>

              {/* Tag pills */}
              {((point.tags?.length ?? 0) > 0 || (point.systemTags?.length ?? 0) > 0) && (
                <TagPills tags={point.tags ?? []} systemTags={point.systemTags ?? []} context="detail" className="mb-3" />
              )}

              {/* P1508 R3–R5: how everyone stands, then the reader's own position; the buttons carry
                  no counts (the "Filter by position" tabs below keep them). */}
              <PointSpreadRow counts={buttonCounts} withInfo className="mb-2" />

              {/* Position buttons (interactive) */}
              <PositionButtons
                userPosition={user ? userPosition : anonPosition}
                counts={buttonCounts}
                compact
                onPositionClick={handlePositionClick}
                onClear={async () => {
                  if (!id) return;
                  if (!user) {
                    setAnonPositionState(null);
                    setAnonPositionStorage(id, null);
                    return;
                  }
                  if (!canWrite()) return;
                  await guardedRemovePosition(id);
                }}
              />
              {/* P502: Anonymous position CTA */}
              {!user && anonPosition && (
                <AnonPositionCTA pointId={id ?? ''} position={anonPosition} isEmbed={isEmbed} />
              )}

            </div>
          </div>
        </div>

        {/* Footer: story CTA (left) + share (right) — matches profile story card pattern */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          {user && !viewerStory ? (
            <button
              onClick={() => navigate(`/create?pointId=${id}`)}
              className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              + Add a story
            </button>
          ) : (
            <span />
          )}
          <ShareButton type="point" id={point.id} description={point.statement.slice(0, 100)} />
        </div>
      </div>


      {/* P1508 D6: the "Filter by position" block, shared with the canvas's open point. */}
      <PointPositionsBlock
        positions={positions}
        counts={buttonCounts}
        stories={linkedStories.get(id ?? '') ?? []}
        viewerId={user?.id}
        viewerStory={viewerStory}
        filter={positionFilter}
        onFilterChange={setPositionFilter}
        expandedId={expandedHolderId}
        onExpandedChange={setExpandedHolderId}
        onUnlinkStory={handleUnlinkClick}
      />

      {/* P1364 §3 — the same way out at the end of the page. /point keeps the mobile bottom
          nav, so the pill carries extra bottom padding to stay clear of it. */}
      <BottomBackButton fallback={BACK_FALLBACK} testId="point-bottom-back" className={CLEAR_BOTTOM_NAV} />

      </div>

      {/* P621: Unlink point from story confirmation dialog */}
      <Dialog open={unlinkTargetStory !== null} onOpenChange={(open) => { if (!open) { setUnlinkTargetStory(null); setIsUnlinking(false); } }}>
        <DialogContent hideCloseButton>
          <DialogHeader>
            <DialogTitle>Unlink point from story?</DialogTitle>
            <DialogDescription asChild>
              <div>
                {point?.statement && (
                  <p className="italic text-muted-foreground mb-2">
                    &ldquo;{point.statement.length > 80
                      ? point.statement.slice(0, 80) + '...'
                      : point.statement}&rdquo;
                  </p>
                )}
                <p>The point will remain visible to others who have taken positions on it.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUnlinkTargetStory(null)} disabled={isUnlinking}>Cancel</Button>
            <Button variant="destructive" onClick={handleUnlinkConfirm} disabled={isUnlinking}>
              {isUnlinking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Unlinking...</> : 'Unlink'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PointDetailPage;
