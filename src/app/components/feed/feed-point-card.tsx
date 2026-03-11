/**
 * @file feed-point-card.tsx
 * @description P491: Lightweight point card for the public feed.
 * Takes PointWithUserPosition (production type), renders pin icon, statement, position buttons, tag pills.
 * Slate left border. Clickable → navigates to /point/:id.
 */

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pin } from 'lucide-react';
import { LinkedText } from '@/app/components/shared/linked-text';
import { TagPills } from '@/app/components/shared/tag-pills';
import {
  PositionButtons,
  type SevenPointCounts,
} from '@/app/prototypes/linkedin-like/components/shared';
import { getPositionGroup } from '@/app/prototypes/shared/types';
import type { PointWithUserPosition, PositionType } from '@/app/types';
import type { PositionButtonGroup } from '@/app/prototypes/shared/types';
import { pointsService } from '@/app/data/points-service';
import { useAuth } from '@/auth';
import { buildAuthGateUrl, toAuthGatePosition } from '@/lib/auth-gate-utils';

interface FeedPointCardProps {
  point: PointWithUserPosition;
  activeTag?: string;
  onPositionChange?: () => void;
}

export function FeedPointCard({ point, activeTag, onPositionChange }: FeedPointCardProps) {
  const navigate = useNavigate();
  const { session } = useAuth();

  const handleClick = () => {
    navigate(`/point/${point.id}`);
  };

  // Optimistic position state
  const [localPosition, setLocalPosition] = useState<PositionType | null>(null);
  const serverPosition = point.userPosition?.position ?? null;
  const effectivePosition = localPosition ?? serverPosition;

  useEffect(() => {
    if (localPosition !== null && localPosition === serverPosition) {
      setLocalPosition(null);
    }
  }, [serverPosition, localPosition]);

  const baseCounts = useMemo(
    () => point.positionCounts ?? {
      strongly_agree: 0, agree: 0, somewhat_agree: 0,
      unsure: 0,
      somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
    },
    [point.positionCounts]
  );

  const counts = useMemo((): SevenPointCounts => {
    const adjusted: SevenPointCounts = { ...baseCounts };
    const getGroup = (pos: PositionType | null): PositionButtonGroup | null => {
      if (!pos) return null;
      return getPositionGroup(pos);
    };
    const serverGroup = getGroup(serverPosition);
    const effectiveGroup = getGroup(effectivePosition);
    if (serverGroup !== effectiveGroup) {
      if (serverGroup === 'agree') adjusted.agree = Math.max(0, adjusted.agree - 1);
      else if (serverGroup === 'disagree') adjusted.disagree = Math.max(0, adjusted.disagree - 1);
      else if (serverGroup === 'unsure') adjusted.unsure = Math.max(0, adjusted.unsure - 1);
      if (effectiveGroup === 'agree') adjusted.agree++;
      else if (effectiveGroup === 'disagree') adjusted.disagree++;
      else if (effectiveGroup === 'unsure') adjusted.unsure++;
    }
    return adjusted;
  }, [baseCounts, serverPosition, effectivePosition]);

  const handlePositionClick = async (position: PositionType) => {
    // Auth gate for anonymous users
    if (!session?.user) {
      const authGatePosition = toAuthGatePosition(position);
      if (authGatePosition) {
        navigate(buildAuthGateUrl({
          action: 'set-position',
          pointId: point.id,
          position: authGatePosition,
          redirect: `/feed${window.location.search}`,
        }));
      }
      return;
    }

    const newPosition = effectivePosition === position ? null : position;
    setLocalPosition(newPosition);

    try {
      if (newPosition) {
        await pointsService.setPosition(point.id, session.user.id, newPosition);
      } else {
        await pointsService.removePosition(point.id, session.user.id);
      }
      onPositionChange?.();
    } catch {
      // Revert on error
      setLocalPosition(null);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="bg-card rounded-lg shadow-sm border-l-4 border-l-muted-foreground/50 border border-border cursor-pointer hover:border-muted-foreground/70 hover:shadow-md transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Pin icon */}
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600">
            <Pin size={16} className="rotate-45" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Statement */}
            <p className="text-sm font-medium text-foreground break-words">
              <LinkedText text={point.statement} />
            </p>

            {point.context && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                <LinkedText text={point.context} />
              </p>
            )}

            {/* Position buttons */}
            <div role="presentation" className="mt-2" onClick={(e) => e.stopPropagation()}>
              <PositionButtons
                userPosition={effectivePosition}
                counts={counts}
                onPositionClick={handlePositionClick}
              />
            </div>

            {/* Tag pills */}
            <TagPills tags={point.tags} context="feed" activeTag={activeTag} className="mt-2" />
          </div>
        </div>
      </div>
    </div>
  );
}
