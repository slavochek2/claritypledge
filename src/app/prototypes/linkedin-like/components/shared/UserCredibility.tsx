import { Ear } from 'lucide-react';
import { MobileTooltip } from './MobileTooltip';
import { getUserCredibilityStats } from '../../../shared/mock-data';

interface UserCredibilityProps {
  userId: string;
  userName?: string;
  /** Compact size for inline use (default: 12px icons) */
  size?: 'sm' | 'md';
}

/**
 * Displays Ear credibility stat for a user.
 * Shows how many people they understood (ear) - the key signal of being a good listener.
 * Used next to user name everywhere for consistent credibility signal.
 */
export function UserCredibility({ userId, userName, size = 'sm' }: UserCredibilityProps) {
  const stats = getUserCredibilityStats(userId);
  const iconSize = size === 'sm' ? 12 : 14;
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  const firstName = userName?.split(' ')[0] || 'This user';
  const tooltip = stats.ear === 0
    ? `${firstName} hasn't had any stories confirmed understood yet`
    : `${firstName} understood ${stats.ear} ${stats.ear === 1 ? 'story' : 'stories'} as confirmed by their owners`;

  return (
    <MobileTooltip content={tooltip}>
      <span className={`inline-flex items-center gap-0.5 ${textSize} text-gray-400`}>
        <Ear size={iconSize} />
        <span>{stats.ear}</span>
      </span>
    </MobileTooltip>
  );
}
