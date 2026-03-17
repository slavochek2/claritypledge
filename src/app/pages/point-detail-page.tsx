/**
 * @file point-detail-page.tsx
 * @description Point detail page - shows a point with positions.
 * Route: /point/:id
 *
 * Points are shared across profiles. We use a referrer query param to contextualize
 * the view, or show a generic view if no referrer.
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Pin, ChevronRight, ChevronDown } from 'lucide-react';
import { useAuth } from '@/auth';
import { pointsService } from '@/app/data/points-service';
import { storiesService } from '@/app/data/stories-service';
import type { PointWithCounts, PointWithUserPosition, PointPositionWithUser, PositionType, StoryWithAuthor, Story as AppStory } from '@/app/types';
import { toSevenPointCounts, getPositionGroup } from '@/app/utils/position-helpers';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { SEO } from '@/app/components/seo';
import {
  PositionBadge,
  PositionButtons,
  FilterTabs,
  ShareButton,
  ThreadLineGroup,
  ThreadLineItem,
  type PositionFilter,
} from '@/app/components/shared';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import { EarBadge } from '@/components/ui/ear-badge';
import { StoryCardWithLinks, type StoryAuthor } from '@/app/components/social/story-card-with-links';
import { PointCardWithLinks, type PointProfileOwner } from '@/app/components/social/point-card-with-links';
import type { Point as ProtoPoint, Story as ProtoStory } from '@/app/components/shared/prototype-types';
import { LinkedText } from '@/app/components/shared/linked-text';
import { TagPills } from '@/app/components/shared/tag-pills';
import { stripHashtags } from '@/lib/utils';
import { getAnonPosition, setAnonPosition as setAnonPositionStorage } from '@/app/hooks/useAnonPosition';
import { AnonPositionCTA } from '@/app/components/shared/anon-position-cta';


export function PointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [point, setPoint] = useState<PointWithCounts | null>(null);
  const [positions, setPositions] = useState<PointPositionWithUser[]>([]);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
  const [userPosition, setUserPosition] = useState<PositionType | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // P502: Anonymous position state — visual only, no count adjustment
  const [anonPosition, setAnonPositionState] = useState<PositionType | null>(null);
  const [linkedStories, setLinkedStories] = useState<Map<string, StoryWithAuthor[]>>(new Map());
  const [viewerStory, setViewerStory] = useState<AppStory | null>(null);
  // P542: Accordion state — only one story expanded at a time
  const [expandedHolderId, setExpandedHolderId] = useState<string | null>(null);
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

  useEffect(() => {
    async function loadData() {
      if (!id) {
        setError('not_found');
        setLoading(false);
        return;
      }

      try {
        const [pointData, positionData, storiesData, viewerStoryData] = await Promise.all([
          user?.id
            ? pointsService.getPointWithUserPosition(id, user.id)
            : pointsService.getPointWithCounts(id),
          pointsService.getPositionsForPoint(id),
          storiesService.getStoriesForPoints([id]).catch(() => new Map<string, StoryWithAuthor[]>()),
          user?.id
            ? storiesService.getStoryByUserAndPoint(user.id, id).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (!pointData) {
          setError('not_found');
          setLoading(false);
          return;
        }

        setPoint(pointData);
        setPositions(positionData);
        setLinkedStories(storiesData);
        setViewerStory(viewerStoryData);
        if (user?.id && (pointData as PointWithUserPosition).userPosition) {
          setUserPosition((pointData as PointWithUserPosition).userPosition!.position);
        }
        setLoading(false);
      } catch (err) {
        console.error('Error loading point:', err);
        setError('network_error');
        setLoading(false);
      }
    }

    loadData();
  }, [id, user?.id, retryKey]);

  // P502: Load anon position from localStorage on mount
  useEffect(() => {
    if (!user && id) {
      const stored = getAnonPosition(id) as PositionType | null;
      if (stored) setAnonPositionState(stored);
    }
  }, [user, id]);

  // Derive Map<userId, StoryWithAuthor> from the batch-fetched stories for this point.
  // RLS enforces visibility — trust what the query returns.
  const storyByAuthorId = useMemo(() => {
    const stories = linkedStories.get(id ?? '') ?? [];
    const map = new Map<string, StoryWithAuthor>();
    for (const story of stories) {
      // Take only the first story per author (array is ordered desc by created_at)
      if (!map.has(story.authorId)) {
        map.set(story.authorId, story);
      }
    }
    return map;
  }, [linkedStories, id]);

  // Group positions by stance
  const positionGroups = useMemo(() => {
    const groups: Record<PositionButtonGroup, PointPositionWithUser[]> = {
      agree: [],
      disagree: [],
      unsure: [],
    };

    for (const pos of positions) {
      const group = getPositionGroup(pos.position as PositionType);
      groups[group].push(pos);
    }

    return groups;
  }, [positions]);

  // Position counts for filter tabs
  const positionCounts = useMemo(() => {
    if (!point) return { all: 0, agree: 0, disagree: 0, unsure: 0 };
    const counts = toSevenPointCounts(point.positionCounts);
    return {
      all: point.totalPositions,
      agree: counts.agree + counts.strongly_agree + counts.somewhat_agree,
      disagree: counts.disagree + counts.strongly_disagree + counts.somewhat_disagree,
      unsure: counts.unsure,
    };
  }, [point]);

  // Counts for position buttons
  const buttonCounts = useMemo(() => {
    if (!point) return toSevenPointCounts({});
    return toSevenPointCounts(point.positionCounts);
  }, [point]);

  const handlePositionClick = async (position: PositionType) => {
    if (!id) return;

    // P502: Anonymous user → optimistic local position, no redirect
    if (!user) {
      const currentAnon = anonPosition;
      const newPosition = currentAnon === position ? null : position;
      setAnonPositionState(newPosition);
      setAnonPositionStorage(id, newPosition);
      return;
    }

    // Toggle: clicking same position removes it
    const newPosition = userPosition === position ? null : position;

    // Optimistic update
    setUserPosition(newPosition);

    // Persist to database
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
    }
  };

  // Helper to navigate back safely
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/feed');
    }
  };

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
        {/* Skeleton for back button */}
        <div className="h-4 bg-muted rounded w-20 mb-6 animate-pulse" />
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

  if (error || !point) {
    const isNetworkError = error === 'network_error';
    const errorMessage = isNetworkError
      ? 'Failed to load point. Please check your connection.'
      : 'Point not found';

    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        {!isEmbed && <FocusHeader onBack={handleBack} />}
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">{errorMessage}</p>
          {isNetworkError && (
            <button
              onClick={handleRetry}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
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
              if (id) guardedRemovePosition(id);
            } else {
              handlePositionClick(pos as PositionType);
            }
          }}
          getPointPositionCounts={() => toSevenPointCounts(point.positionCounts)}
          getStoryAuthor={(authorId) => {
            const holder = positions.find(p => p.userId === authorId);
            if (!holder) return undefined;
            return {
              id: holder.userId,
              name: holder.userName,
              hasPledged: holder.userHasPledged,
              ear: holder.earCount,
              avatarUrl: holder.userAvatarUrl,
              avatarColor: holder.userAvatarColor,
            };
          }}
        />
      </div>
    );
  }

  // Which position groups to show based on filter
  const positionsToShow: PositionButtonGroup[] =
    positionFilter === 'all' ? ['agree', 'disagree', 'unsure'] : [positionFilter as PositionButtonGroup];

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
      <FocusHeader onBack={handleBack} />

      {/* Point card with full features */}
      <div className="bg-card border border-border rounded-lg shadow-sm border-l-4 border-l-slate-400 overflow-hidden mb-4">
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
              <p className="text-foreground font-medium text-lg mb-3"><LinkedText text={stripHashtags(point.statement, point.tags)} /></p>

              {/* Tag pills */}
              {(point.tags?.length ?? 0) > 0 && (
                <TagPills tags={point.tags!} context="detail" className="mb-3" />
              )}

              {/* Context (if present) */}
              {point.context && (
                <p className="text-sm text-muted-foreground mb-3 italic">{point.context}</p>
              )}

              {/* Position buttons (interactive) */}
              <PositionButtons
                userPosition={user ? userPosition : anonPosition}
                counts={buttonCounts}
                onPositionClick={handlePositionClick}
              />
              {/* P502: Anonymous position CTA */}
              {!user && anonPosition && (
                <AnonPositionCTA pointId={id!} position={anonPosition} isEmbed={isEmbed} />
              )}

            </div>
          </div>
        </div>

        {/* Footer with share button */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-border">
          <ShareButton type="point" id={point.id} description={point.statement.slice(0, 100)} />
        </div>
      </div>


      {/* Positions section */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {/* Filter tabs */}
        <FilterTabs
          activeFilter={positionFilter}
          onFilterChange={(filter) => { setPositionFilter(filter); setExpandedHolderId(null); }}
          counts={positionCounts}
        />

        {/* Position holders by stance */}
        <div className="p-4 space-y-4">
          {positionsToShow.map(positionGroup => {
            const holdersInGroup = positionGroups[positionGroup];

            if (holdersInGroup.length === 0 && positionFilter === 'all') {
              return null; // Hide empty sections when showing all
            }

            if (holdersInGroup.length === 0) {
              return (
                <p key={positionGroup} className="text-center text-muted-foreground text-sm py-3">
                  (no positions yet)
                </p>
              );
            }

            return (
              <div key={positionGroup} className="space-y-3">
                {holdersInGroup.map(holder => {
                  const isViewer = user?.id === holder.userId;

                  // P542: Determine story data — viewer's story takes priority
                  const holderStory = isViewer && viewerStory
                    ? viewerStory
                    : storyByAuthorId.get(holder.userId) ?? null;
                  const hasStory = holderStory !== null;
                  const isExpanded = expandedHolderId === holder.userId;

                  // Viewer with position but no story → show "Add your story" CTA
                  const showCta = isViewer && userPosition !== null && !viewerStory && !hasStory;

                  return (
                    <div key={holder.id}>
                      <PositionHolderCard
                        holder={holder}
                        onProfileClick={() => navigate(`/p/${holder.userSlug}`)}
                        hasStory={hasStory}
                        isExpanded={isExpanded}
                        onToggle={() => {
                          setExpandedHolderId(prev =>
                            prev === holder.userId ? null : holder.userId
                          );
                        }}
                        ctaHref={showCta ? `/create?pointId=${id}` : undefined}
                      />
                      {/* P542: Expandable story region */}
                      {hasStory && isExpanded && (
                        <ExpandableStoryRegion
                          holder={holder}
                          story={holderStory!}
                          isViewer={isViewer}
                          onCollapse={() => setExpandedHolderId(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {positions.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-6">
              No one has taken a position yet
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

/**
 * Compact row for a position holder. Shows chevron + "story" when hasStory is true.
 * P542: All holders render as uniform compact rows.
 */
function PositionHolderCard({
  holder,
  onProfileClick,
  hasStory = false,
  isExpanded = false,
  onToggle,
  ctaHref,
}: {
  holder: PointPositionWithUser;
  onProfileClick: () => void;
  hasStory?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  ctaHref?: string;
}) {
  const toggleRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${holder.userName}'s profile`}
      onClick={onProfileClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // If this row has a story, Enter/Space toggles expand instead of navigating
          if (hasStory && onToggle) {
            onToggle();
          } else {
            onProfileClick();
          }
        }
      }}
      className="group flex items-center gap-3 p-3 bg-muted rounded-lg border border-border cursor-pointer hover:bg-accent hover:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none transition-colors"
      {...(hasStory ? {
        'aria-expanded': isExpanded,
        'aria-controls': `story-${holder.userId}`,
      } : {})}
    >
      {/* Avatar — ring suppressed at compact size */}
      <GravatarAvatar
        name={holder.userName}
        photoUrl={holder.userAvatarUrl}
        avatarColor={holder.userAvatarColor}
        size="sm"
        isPledger={holder.userHasPledged}
        showRing={false}
        className="!w-5 !h-5 !text-[10px]"
      />

      {/* Content */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
        <span className="font-medium text-foreground text-sm truncate">{holder.userName}</span>
        <EarBadge count={holder.earCount} name={holder.userName} />
        <PositionBadge position={holder.position} />

        {/* Chevron + "story" toggle — or "Add your story" CTA */}
        {hasStory && onToggle && (
          <button
            ref={toggleRef}
            data-testid="story-toggle"
            onClick={e => { e.stopPropagation(); onToggle(); }}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 min-h-[28px] px-1"
            aria-label={isExpanded ? `Collapse story by ${holder.userName}` : `Expand story by ${holder.userName}`}
          >
            {isExpanded ? <ChevronDown size={16} className="transition-transform" /> : <ChevronRight size={16} className="transition-transform" />}
            <span>story</span>
          </button>
        )}
        {ctaHref && (
          <a
            href={ctaHref}
            onClick={e => e.stopPropagation()}
            className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
          >
            Add your story →
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * P542: Expanded story region with ThreadLine connecting line.
 * Shows story card below the position row with vertical connector.
 */
function ExpandableStoryRegion({
  holder,
  story,
  isViewer,
  onCollapse,
}: {
  holder: PointPositionWithUser;
  story: StoryWithAuthor | AppStory;
  isViewer: boolean;
  onCollapse: () => void;
}) {
  const regionRef = useRef<HTMLDivElement>(null);

  // Build proto story and author for StoryCardWithLinks
  const protoStory: ProtoStory = {
    id: story.id,
    authorId: 'authorId' in story ? story.authorId : (story as AppStory).authorId,
    text: 'content' in story ? story.content : (story as StoryWithAuthor).content,
    createdAt: story.createdAt,
    visibility: story.visibility,
    linkedPointIds: [],
    understoodCount: story.understoodCount,
  };

  // Author info — differs for viewer (uses holder data) vs others (uses StoryWithAuthor)
  const storyAuthor: StoryAuthor = isViewer || !('authorName' in story)
    ? {
        id: holder.userId,
        name: holder.userName,
        hasPledged: holder.userHasPledged,
        ear: holder.earCount,
        avatarUrl: holder.userAvatarUrl,
        avatarColor: holder.userAvatarColor,
      }
    : {
        id: (story as StoryWithAuthor).authorId,
        name: (story as StoryWithAuthor).authorName,
        role: (story as StoryWithAuthor).authorRole,
        hasPledged: (story as StoryWithAuthor).authorHasPledged,
        ear: (story as StoryWithAuthor).authorEarsCount ?? 0,
        avatarUrl: (story as StoryWithAuthor).authorAvatarUrl,
        avatarColor: (story as StoryWithAuthor).authorAvatarColor,
      };

  const storyTags = 'tags' in story ? story.tags : undefined;

  // Handle Escape key to collapse and return focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCollapse();
        // Return focus to the toggle button in the row
        const toggle = document.querySelector(`[aria-controls="story-${holder.userId}"]`);
        if (toggle instanceof HTMLElement) toggle.focus();
      }
    };

    const region = regionRef.current;
    if (region) {
      region.addEventListener('keydown', handleKeyDown);
      return () => region.removeEventListener('keydown', handleKeyDown);
    }
  }, [holder.userId, onCollapse]);

  return (
    <div
      id={`story-${holder.userId}`}
      role="region"
      aria-label={`${holder.userName}'s story`}
      ref={regionRef}
    >
      <ThreadLineGroup>
        <ThreadLineItem isLast>
          <StoryCardWithLinks
            story={protoStory}
            author={storyAuthor}
            context="point-detail"
            compact
            tags={storyTags}
          />
        </ThreadLineItem>
      </ThreadLineGroup>
    </div>
  );
}

export default PointDetailPage;
