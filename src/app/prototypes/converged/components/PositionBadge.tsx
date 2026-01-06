import { Check, X, HelpCircle } from 'lucide-react';
import type { Position } from '../data/mock-data';
import { cn } from '@/lib/utils';

interface PositionBadgeProps {
  position: Position;
  label: string; // "You" or person's first name
}

export function PositionBadge({ position, label }: PositionBadgeProps) {
  const config = {
    agree: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: Check },
    disagree: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: X },
    unsure: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: HelpCircle },
  }[position || 'unsure'];

  const Icon = config.icon;

  const positionText = position === 'agree' ? 'Agree' : position === 'disagree' ? 'Disagree' : 'Unsure';

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border',
      config.bg,
      config.text,
      config.border
    )}>
      <Icon className="w-3.5 h-3.5" />
      {label}: {positionText}
    </span>
  );
}
