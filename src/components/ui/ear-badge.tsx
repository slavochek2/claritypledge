import { Ear } from 'lucide-react';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';

interface EarBadgeProps {
  count: number;
  /** Full name — first name is extracted for the tooltip */
  name: string;
  size?: number;
  className?: string;
}

/**
 * Always-visible ear count badge with 0-aware tooltip.
 * Use next to any author name. Never conditionally hide — 0 is meaningful.
 */
export function EarBadge({ count, name, size = 12, className = '' }: EarBadgeProps) {
  const firstName = name.split(' ')[0];
  const tooltip =
    count === 0
      ? `${firstName} hasn't had any stories confirmed understood yet`
      : `${firstName} understood ${count} ${count === 1 ? 'story' : 'stories'} as confirmed by their owners`;

  return (
    <MobileTooltip content={tooltip}>
      <span className={`inline-flex items-center gap-0.5 text-xs text-muted-foreground ${className}`}>
        <Ear size={size} />
        {count}
      </span>
    </MobileTooltip>
  );
}
