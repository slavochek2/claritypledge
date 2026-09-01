/**
 * @file feed-point-card.tsx
 * @description P491: Lightweight point card for the public feed.
 * Takes PointWithUserPosition (production type), renders pin icon, statement, position buttons, tag pills.
 * Slate left border. Clickable → navigates to /point/:id.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pin, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';
import { analytics } from '@/lib/mixpanel';
import { linkifyText } from '@/app/utils/linkify';
import { stripHashtags } from '@/lib/utils';
import { TagPills } from '@/app/components/shared/tag-pills';
import {
  PositionButtons,
} from '@/app/components/shared';
import { adjustPositionCounts } from '@/app/utils/position-helpers';
import { InlineVisibilityIcon } from '@/app/components/shared';
import type { PointWithUserPosition, PositionType } from '@/app/types';
import { pointsService } from '@/app/data/points-service';
import { useAuth } from '@/auth';
import { RemovePositionDialog, useRemovePositionGuard } from '@/app/components/shared/remove-position-dialog';
import { getAnonPosition, setAnonPosition } from '@/app/hooks/useAnonPosition';
import { AnonPositionCTA } from '@/app/components/shared/anon-position-cta';

interface FeedPointCardProps {
  point: PointWithUserPosition;
  activeTag?: string;
  /** P543: Notify parent that a position was removed — parent decides whether to filter or decrement */
  onPointRemoved?: (pointId: string, removedPosition: PositionType | null) => void;
}

export function FeedPointCard({ point, activeTag, onPointRemoved }: FeedPointCardProps) {
  const navigate = useNavigate();
  const { session } = useAuth();

  // P594: Expand/collapse for truncated text
  const statementRef = useRef<HTMLParagraphElement>(null);
  const [statementExpanded, setStatementExpanded] = useState(false);
  const [statementOverflows, setStatementOverflows] = useState(false);

  const checkOverflows = useCallback(() => {
    const stEl = statementRef.current;
    if (stEl) setStatementOverflows(stEl.scrollHeight > stEl.clientHeight + 1);
  }, []);

  useEffect(() => {
    checkOverflows();
  }, [checkOverflows, point.statement]);

  // Optimistic position state
  const [localPosition, setLocalPosition] = useState<PositionType | null>(null);
  // P502: Separate anon position state — used only for button highlight, never for count adjustment
  const [anonPosition, setAnonPositionState] = useState<PositionType | null>(null);
  const serverPosition = point.userPosition?.position ?? null;

  // P401: Guard position removal — only shows dialog when linked stories exist
  const { dialogProps, guardedRemovePosition } = useRemovePositionGuard({
    userId: session?.user?.id ?? '',
    onAfterRemove: () => {
      const removedPosition = localPosition ?? serverPosition;
      setLocalPosition(null);
      // P543: Always delegate to parent — it uses functional setState for current totalPositions
      onPointRemoved?.(point.id, removedPosition);
    },
  });

  const handleClick = () => {
    navigate(`/point/${point.id}`);
  };
  const effectivePosition = session?.user
    ? (localPosition ?? serverPosition)
    : anonPosition;

  useEffect(() => {
    if (localPosition !== null && localPosition === serverPosition) {
      setLocalPosition(null);
    }
  }, [serverPosition, localPosition]);

  // P502: Load anon position from localStorage on mount
  useEffect(() => {
    if (!session?.user) {
      const stored = getAnonPosition(point.id) as PositionType | null;
      if (stored) setAnonPositionState(stored);
    }
  }, [session?.user, point.id]);

  const baseCounts = useMemo(
    () => point.positionCounts ?? {
      strongly_agree: 0, agree: 0, somewhat_agree: 0,
      unsure: 0,
      somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
    },
    [point.positionCounts]
  );

  // P502: Count adjustment uses authedEffective (localPosition ?? serverPosition) —
  // never anonPosition — so anonymous clicks don't inflate aggregates.
  const authedEffective = localPosition ?? serverPosition;
  const counts = useMemo(
    () => adjustPositionCounts(baseCounts, serverPosition, authedEffective),
    [baseCounts, serverPosition, authedEffective],
  );

  const handlePositionClick = async (position: PositionType) => {
    // P502: Anonymous user → optimistic local position, no redirect
    if (!session?.user) {
      const newPosition = effectivePosition === position ? null : position;
      setAnonPositionState(newPosition);
      setAnonPosition(point.id, newPosition);
      return;
    }

    const newPosition = effectivePosition === position ? null : position;

    if (newPosition === null) {
      // Toggle-off: use guarded removal to warn about linked stories
      await guardedRemovePosition(point.id);
      return;
    }

    setLocalPosition(newPosition);

    try {
      await pointsService.setPosition(point.id, session.user.id, newPosition);
      // P543: Card's local optimistic state (localPosition + adjustPositionCounts) handles
      // the visual update — no parent callback needed for set-position path
    } catch {
      // Revert on error
      setLocalPosition(null);
      toast.error('Failed to save position.');
    }
  };

  return (
    <>
    <RemovePositionDialog {...dialogProps} />
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
            {/* Statement with inline visibility icon */}
            <p
              ref={statementRef}
              className={`text-sm font-medium text-foreground break-words ${statementExpanded ? '' : 'line-clamp-6'}`}
            >
              <InlineVisibilityIcon visibility={point.visibility} />{' '}
              {linkifyText(stripHashtags(point.statement, point.tags))}
            </p>
            {statementOverflows && !statementExpanded && (
              <button
                onClick={(e) => { e.stopPropagation(); setStatementExpanded(true); }}
                className="text-sm text-blue-600 font-medium mt-1"
              >
                show more
              </button>
            )}
            {statementExpanded && (
              <button
                onClick={(e) => { e.stopPropagation(); setStatementExpanded(false); }}
                className="text-sm text-muted-foreground mt-1"
              >
                show less
              </button>
            )}

            {/* Tag pills */}
            <TagPills tags={point.tags} context="feed" activeTag={activeTag} className="mt-2" />

            {/* Position buttons + share */}
            <div role="presentation" className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex-1">
                <PositionButtons
                  userPosition={effectivePosition}
                  counts={counts}
                  onPositionClick={handlePositionClick}
                  onClear={async () => {
                    if (!session?.user) {
                      setAnonPositionState(null);
                      setAnonPosition(point.id, null);
                      return;
                    }
                    await guardedRemovePosition(point.id);
                  }}
                />
              </div>
              <button
                onClick={async () => {
                  analytics.track('feed_card_shared', { type: 'point', id: point.id });
                  const url = `${window.location.origin}/point/${point.id}`;
                  const ok = await copyToClipboard(url);
                  if (ok) toast.success('Link copied!');
                }}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Share point"
                title="Copy link"
              >
                <Share2 size={14} />
              </button>
            </div>
            {/* P502: Anonymous position CTA */}
            {!session?.user && anonPosition && (
              <AnonPositionCTA pointId={point.id} position={anonPosition} />
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
