/**
 * @file point-detail-page.tsx
 * @description Point detail page - shows a point with positions.
 * Route: /point/:id
 *
 * Points are shared across profiles. We use a referrer query param to contextualize
 * the view, or show a generic view if no referrer.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pin } from 'lucide-react';
import { pointsService } from '@/app/data/points-service';
import type { PointWithCounts, PointPositionWithUser, PositionType } from '@/app/types';
import { getPositionGroup, type PositionButtonGroup } from '@/app/prototypes/shared/types';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  PositionBadge,
  PositionButtons,
  FilterTabs,
  ShareButton,
  type PositionFilter,
  type SevenPointCounts,
} from '@/app/prototypes/linkedin-like/components/shared';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [point, setPoint] = useState<PointWithCounts | null>(null);
  const [positions, setPositions] = useState<PointPositionWithUser[]>([]);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
  const [userPosition, setUserPosition] = useState<PositionType | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    async function loadData() {
      if (!id) {
        setError('not_found');
        setLoading(false);
        return;
      }

      try {
        const [pointData, positionData] = await Promise.all([
          pointsService.getPointWithCounts(id),
          pointsService.getPositionsForPoint(id),
        ]);

        if (!pointData) {
          setError('not_found');
          setLoading(false);
          return;
        }

        setPoint(pointData);
        setPositions(positionData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading point:', err);
        setError('network_error');
        setLoading(false);
      }
    }

    loadData();
  }, [id, retryKey]);

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

  const handlePositionClick = (position: PositionType) => {
    // Toggle: clicking same position removes it
    setUserPosition(userPosition === position ? null : position);
  };

  // Helper to navigate back safely
  const handleBack = () => {
    const isInternalReferrer = document.referrer && document.referrer.includes(window.location.host);
    if (isInternalReferrer) {
      navigate(-1);
    } else {
      navigate('/events');
    }
  };

  // Helper to retry loading
  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    setPoint(null);
    setPositions([]);
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
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 py-2 -ml-2 pl-2 pr-3 min-h-[44px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded"
          aria-label="Go back to previous page"
        >
          <ArrowLeft size={16} />
          Back
        </button>
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

  // Which position groups to show based on filter
  const positionsToShow: PositionButtonGroup[] =
    positionFilter === 'all' ? ['agree', 'disagree', 'unsure'] : [positionFilter as PositionButtonGroup];

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Back button */}
      <button
        onClick={handleBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 py-2 -ml-2 pl-2 pr-3 min-h-[44px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none rounded"
        aria-label="Go back to previous page"
      >
        <ArrowLeft size={16} />
        Back
      </button>

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
              <p className="text-foreground font-medium text-lg mb-3">{point.statement}</p>

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
                {holdersInGroup.map(holder => (
                  <PositionHolderCard
                    key={holder.id}
                    holder={holder}
                    onProfileClick={() => navigate(`/p/${holder.userSlug}`)}
                  />
                ))}
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
 * Card showing a position holder with their stance
 */
function PositionHolderCard({
  holder,
  onProfileClick,
}: {
  holder: PointPositionWithUser;
  onProfileClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
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
        size="sm"
        className="!w-5 !h-5 !text-[10px]"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground text-sm truncate">{holder.userName}</span>
          <PositionBadge position={holder.position} />
        </div>
        {holder.reasoning && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{holder.reasoning}</p>
        )}
      </div>
    </div>
  );
}

export default PointDetailPage;
