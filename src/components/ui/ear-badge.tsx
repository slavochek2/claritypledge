import { Ear } from 'lucide-react';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { earTooltip } from './ear-tooltip';

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
  return (
    <MobileTooltip content={earTooltip(count, name)}>
      <span data-testid="ear-badge" className={`inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5 ${className}`}>
        <Ear size={size} />
        {count}
      </span>
    </MobileTooltip>
  );
}
