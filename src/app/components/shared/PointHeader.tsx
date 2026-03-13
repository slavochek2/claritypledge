import { Pin, Ear } from 'lucide-react';
import { PositionBadge } from './PositionBadge';
import { MobileTooltip } from './mobile-tooltip';
import type { Position } from './prototype-types';

interface PointHeaderProps {
  /** Position of the author/profile owner to display */
  authorPosition?: Position;
  /** Full name of the author for position badge */
  authorName?: string;
  /** Ear count (understanding credibility) */
  authorEarCount?: number;
  /** Compact mode for embedded use (QuotedPoint) */
  compact?: boolean;
  /** Show "Point" label (default true for full card, false for quoted) */
  showLabel?: boolean;
}

/**
 * Shared header for Point displays
 * Shows: [Pin] [Author Full Name] 🔊N [Agrees]
 * Position counts removed — buttons already show this info
 */
export function PointHeader({
  authorPosition,
  authorName,
  authorEarCount,
  compact = false,
  showLabel = false,
}: PointHeaderProps) {
  const iconSize = compact ? 10 : 12;
  const textClass = compact ? 'text-[11px]' : 'text-xs';

  return (
    <div className="flex items-center gap-1.5">
      {compact && <Pin size={iconSize} className="text-slate-400" />}
      {showLabel && <span className={`${textClass} text-gray-500`}>Point</span>}
      {authorPosition && (
        <>
          {showLabel && <span className={`${textClass} text-gray-400`}>·</span>}
          {/* Name */}
          {authorName && (
            <span className={`${textClass} text-gray-600`}>{authorName}</span>
          )}
          {/* Ear count - right after name */}
          {authorEarCount !== undefined && (
            <MobileTooltip content={authorEarCount === 0 ? `${authorName?.split(' ')[0] || 'They'} hasn't had any stories confirmed understood yet` : `${authorName?.split(' ')[0] || 'They'} understood ${authorEarCount} ${authorEarCount === 1 ? 'story' : 'stories'} as confirmed by their owners`}>
              <span className={`flex items-center gap-0.5 ${textClass} text-gray-600`}>
                <Ear size={iconSize} />
                {authorEarCount}
              </span>
            </MobileTooltip>
          )}
          {/* Position badge */}
          <PositionBadge position={authorPosition} />
        </>
      )}
    </div>
  );
}
