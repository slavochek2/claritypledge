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
import { Pin } from 'lucide-react';
import { useAuth } from '@/auth';
import { pointsService } from '@/app/data/points-service';
import { storiesService } from '@/app/data/stories-service';
import type { PointWithCounts, PointWithUserPosition, PointPositionWithUser, PositionType, StoryWithAuthor, Story as AppStory } from '@/app/types';
import { getPositionGroup, type PositionButtonGroup } from '@/app/prototypes/shared/types';
import type { Story } from '@/app/prototypes/shared/types';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { FocusHeader } from '@/app/components/layout/focus-header';
import {
  PositionBadge,
  PositionButtons,
  FilterTabs,
  ShareButton,
  type PositionFilter,
  type SevenPointCounts,
} from '@/app/prototypes/linkedin-like/components/shared';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import { EarBadge } from '@/components/ui/ear-badge';
import { StoryCardWithLinks, type StoryAuthor } from '@/app/components/social/story-card-with-links';
import { PointCardWithLinks, type PointProfileOwner } from '@/app/components/social/point-card-with-links';
import type { Point as ProtoPoint, Story as ProtoStory } from '@/app/prototypes/shared/types';
import { LinkedText } from '@/app/components/shared/linked-text';
import { TagPills } from '@/app/components/shared/tag-pills';
import { stripHashtags } from '@/lib/utils';
import { buildAuthGateUrl, toAuthGatePosition } from '@/lib/auth-gate-utils';

/** Normalize positionCounts to SevenPointCounts (ensure all keys present) */
function toSevenPointCounts(counts: Record<string, number>): SevenPointCounts {
  return {
    strongly_agree: counts.strongly_agree ?? 0,
    agree: counts.agree ?? 0,
    somewhat_agree: counts.somewhat_agree ?? 0,
    unsure: counts.unsure ?? 0,
    somewhat_disagree: counts.somewhat_disagree ?? 0,
    disagree: counts.disagree ?? 0,
    strongly_disagree: counts.strongly_disagree ?? 0,
  };
}

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
  const [linkedStories, setLinkedStories] = useState<Map<string, StoryWithAuthor[]>>(new Map());
  const [viewerStory, setViewerStory] = useState<AppStory | null>(null);
  // P401: Guard position removal with linked-stories warning dialog
  const { dialogProps, guardedRemovePosition } = useRemovePositionGuard({
    userId: user?.id ?? '',
    onAfterRemove: async (pointId) => {
      // After confirmed removal, reload to get updated counts
      const updatedPoint = user?.id
        ? await pointsService.getPointWithUserPosition(pointId, user.id)
        : await pointsService.getPointWithCounts(pointId);
      if (updatedPoint) {
        setPoint(updatedPoint);
        setUserPosition(null);
      }
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

    // P458: Anonymous user → redirect to signup with context
    if (!user) {
      const authGatePosition = toAuthGatePosition(position);
      if (!authGatePosition) return;
      const url = buildAuthGateUrl({
        action: 'set-position',
        pointId: id,
        position: authGatePosition,
        redirect: `/point/${id}`,
        pointTitle: point?.statement,
      });
      if (isEmbed) {
        // In embed mode, open the full point page in a new tab with position context
        // so the auth gate flow triggers on the new tab
        window.open(`${window.location.origin}${url}`, '_blank');
      } else {
        navigate(url);
      }
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

      // Reload point to get updated counts
      const updatedPoint = await pointsService.getPointWithUserPosition(id, user.id);
      if (updatedPoint) {
        setPoint(updatedPoint);
      }
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
      <div className="max-w-lg mx-auto px-4 py-8">
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
      <div className="max-w-lg mx-auto px-4 py-8">
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
      verificationCount: s.understoodCount,
    }));

    return (
      <div className="max-w-[550px] mx-auto p-3">
        <RemovePositionDialog {...dialogProps} />
        <PointCardWithLinks
          point={protoPoint}
          linkedStories={embedStories}
          profileOwner={embedProfileOwner}
          currentUserId={user?.id}
          onPositionSelect={(pos) => {
            if (pos === null) {
              // Use guarded removal
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
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* P401: Remove position warning dialog */}
      <RemovePositionDialog {...dialogProps} />

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
                userPosition={userPosition}
                counts={buttonCounts}
                onPositionClick={handlePositionClick}
              />

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
          onFilterChange={setPositionFilter}
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

                  // Req 6: viewer has a story — render full StoryCardWithLinks
                  if (isViewer && viewerStory) {
                    const protoStory: Story = {
                      id: viewerStory.id,
                      authorId: viewerStory.authorId,
                      text: viewerStory.content,
                      createdAt: viewerStory.createdAt,
                      visibility: viewerStory.visibility,
                      linkedPointIds: [],
                      verificationCount: viewerStory.understoodCount,
                    };
                    const storyAuthor: StoryAuthor = {
                      id: holder.userId,
                      name: holder.userName,
                      hasPledged: holder.userHasPledged,
                      ear: holder.earCount,
                    };
                    return (
                      <StoryCardWithLinks
                        key={holder.id}
                        story={protoStory}
                        author={storyAuthor}
                        context="point-detail"
                        profileSubjectPosition={holder.position}
                        tags={viewerStory.tags}
                      />
                    );
                  }

                  const linkedStory = storyByAuthorId.get(holder.userId);
                  if (linkedStory) {
                    const protoStory: Story = {
                      id: linkedStory.id,
                      authorId: linkedStory.authorId,
                      text: linkedStory.content,
                      createdAt: linkedStory.createdAt,
                      visibility: linkedStory.visibility,
                      linkedPointIds: [],
                      verificationCount: linkedStory.understoodCount,
                    };
                    const storyAuthor: StoryAuthor = {
                      id: linkedStory.authorId,
                      name: linkedStory.authorName,
                      role: linkedStory.authorRole,
                      hasPledged: linkedStory.authorHasPledged,
                      ear: linkedStory.authorEarsCount ?? 0,
                    };
                    return (
                      <StoryCardWithLinks
                        key={holder.id}
                        story={protoStory}
                        author={storyAuthor}
                        context="point-detail"
                        profileSubjectPosition={holder.position}
                        tags={linkedStory.tags}
                      />
                    );
                  }

                  // Req 7: viewer has a position but no story — show CTA
                  const showCta = isViewer && userPosition !== null && !viewerStory;
                  return (
                    <PositionHolderCard
                      key={holder.id}
                      holder={holder}
                      onProfileClick={() => navigate(`/p/${holder.userSlug}`)}
                      ctaHref={showCta ? `/create?pointId=${id}` : undefined}
                    />
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
  );
}

/**
 * Compact row for a position holder who has no linked story.
 */
function PositionHolderCard({
  holder,
  onProfileClick,
  ctaHref,
}: {
  holder: PointPositionWithUser;
  onProfileClick: () => void;
  ctaHref?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${holder.userName}'s profile`}
      onClick={onProfileClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onProfileClick();
        }
      }}
      className="group flex items-center gap-3 p-3 bg-muted rounded-lg border border-border cursor-pointer hover:bg-accent hover:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none transition-colors"
    >
      {/* Avatar */}
      <GravatarAvatar
        name={holder.userName}
        photoUrl={holder.userAvatarUrl}
        avatarColor={holder.userAvatarColor}
        size="sm"
        isPledger={holder.userHasPledged}
        className="!w-5 !h-5 !text-[10px]"
      />

      {/* Content */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="font-medium text-foreground text-sm truncate">{holder.userName}</span>
        <EarBadge count={holder.earCount} name={holder.userName} />
        <PositionBadge position={holder.position} />
        {ctaHref ? (
          <a
            href={ctaHref}
            onClick={e => e.stopPropagation()}
            className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
          >
            Add your story →
          </a>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground italic shrink-0">No story yet</span>
        )}
      </div>
    </div>
  );
}

export default PointDetailPage;
