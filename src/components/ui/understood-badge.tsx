import { Ear } from 'lucide-react';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';

interface UnderstoodBadgeProps {
  count: number;
  size?: 'xs' | 'sm';
  className?: string;
}

/**
 * Per-story understood count badge with ear icon and tooltip.
 * Always visible (including count=0) — "empty state over hidden" principle.
 * Sibling of EarBadge (profile-level); same visual language, different scope.
 */
export function UnderstoodBadge({ count, size = 'sm', className = '' }: UnderstoodBadgeProps) {
  const tooltip =
    count === 0
      ? 'No verifications of cognitive understanding for this story yet'
      : `${count} ${count === 1 ? 'verification' : 'verifications'} of cognitive understanding — confirmed in a live session`;

  const sizeClasses = size === 'xs'
    ? 'text-xs px-1 py-0.5'
    : 'text-sm px-1.5 py-0.5';

  const iconSize = size === 'xs' ? 10 : 12;

  return (
    <MobileTooltip content={tooltip}>
      <span className={`inline-flex items-center gap-0.5 font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full ${sizeClasses} ${className}`}>
        <Ear size={iconSize} />
        {count} verified
      </span>
    </MobileTooltip>
  );
}
