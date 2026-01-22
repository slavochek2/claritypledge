import { Ear } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

  // Don't show if no stats
  if (stats.ear === 0) {
    return null;
  }

  const firstName = userName?.split(' ')[0] || 'This user';

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-0.5 ${textSize} text-gray-400 cursor-default`}>
            <Ear size={iconSize} />
            <span>{stats.ear}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{firstName} understood others' stories</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
