import { Pin, Users } from 'lucide-react';
import { PositionBadge } from './PositionBadge';
import type { Position } from '../../../shared/types';

interface PointHeaderProps {
  /** Total number of positions on this point */
  totalStances: number;
  /** Position of the author/profile owner to display */
  authorPosition?: Position;
  /** First name of the author for position badge */
  authorName?: string;
  /** Whether the author is the current user (hides badge if true) */
  isCurrentUser?: boolean;
  /** Compact mode for embedded use (QuotedPoint) */
  compact?: boolean;
  /** Show "Point" label (default true for full card, false for quoted) */
  showLabel?: boolean;
}

/**
 * Shared header for Point displays
 * Shows: [Pin] Point · N Positions · [Author] Agrees
 */
export function PointHeader({
  totalStances,
  authorPosition,
  authorName,
  isCurrentUser = false,
  compact = false,
  showLabel = false,
}: PointHeaderProps) {
  const iconSize = compact ? 10 : 12;
  const textClass = compact ? 'text-[11px]' : 'text-xs';

  return (
    <div className="flex items-center gap-1.5">
      {compact && <Pin size={iconSize} className="text-slate-400" />}
      {showLabel && <span className={`${textClass} text-gray-500`}>Point</span>}
      {totalStances > 0 && (
        <>
          {showLabel && <span className={`${textClass} text-gray-400`}>·</span>}
          <span className={`flex items-center gap-1 ${textClass} text-gray-500`}>
            <Users size={iconSize} />
            {totalStances} {totalStances === 1 ? 'Position' : 'Positions'}
          </span>
        </>
      )}
      {authorPosition && !isCurrentUser && (
        <>
          <span className={`${textClass} text-gray-400`}>·</span>
          <PositionBadge
            position={authorPosition}
            name={authorName}
            isCurrentUser={false}
          />
        </>
      )}
    </div>
  );
}
