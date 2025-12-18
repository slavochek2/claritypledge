/**
 * @file position-buttons.tsx
 * @description Position selection UI - Agree/Disagree/Skip.
 * Only enabled after understanding is achieved.
 */
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown, SkipForward, Lock } from 'lucide-react';
import type { Position } from '@/app/types';

interface PositionButtonsProps {
  /** Called when position is selected */
  onSelect: (position: Position) => void;
  /** Whether buttons are enabled (understanding must be achieved first) */
  enabled: boolean;
  /** Currently selected position (if any) */
  selectedPosition?: Position;
  /** Whether waiting for partner's response */
  isWaiting?: boolean;
  /** Message to show when disabled */
  disabledMessage?: string;
}

export function PositionButtons({
  onSelect,
  enabled,
  selectedPosition,
  isWaiting = false,
  disabledMessage = 'Understanding must be achieved first',
}: PositionButtonsProps) {
  const positions: { value: Position; label: string; icon: typeof ThumbsUp; color: string }[] = [
    { value: 'agree', label: 'Agree', icon: ThumbsUp, color: 'bg-green-100 text-green-700 hover:bg-green-200 border-green-300' },
    { value: 'disagree', label: 'Disagree', icon: ThumbsDown, color: 'bg-red-100 text-red-700 hover:bg-red-200 border-red-300' },
    { value: 'skip', label: 'Skip', icon: SkipForward, color: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300' },
  ];

  // Show selected state if position was chosen
  if (selectedPosition) {
    const selected = positions.find(p => p.value === selectedPosition);
    if (selected) {
      const Icon = selected.icon;
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">Your position:</p>
          <div className={`flex items-center justify-center gap-2 p-4 rounded-lg border ${selected.color}`}>
            <Icon className="h-5 w-5" />
            <span className="font-medium">{selected.label}</span>
          </div>
          {isWaiting && (
            <p className="text-sm text-muted-foreground text-center animate-pulse">
              Waiting for partner...
            </p>
          )}
        </div>
      );
    }
  }

  // Disabled state with lock icon
  if (!enabled) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
          <Lock className="h-4 w-4" />
          {disabledMessage}
        </p>
        <div className="flex gap-3 opacity-50">
          {positions.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant="outline"
              disabled
              className="flex-1"
            >
              <Icon className="h-4 w-4 mr-2" />
              {label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Active selection state
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground text-center">
        What's your position on this?
      </p>
      <div className="flex gap-3">
        {positions.map(({ value, label, icon: Icon, color }) => (
          <Button
            key={value}
            variant="outline"
            onClick={() => onSelect(value)}
            className={`flex-1 border ${color}`}
          >
            <Icon className="h-4 w-4 mr-2" />
            {label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Understanding ≠ Agreement. You can disagree while fully understanding.
      </p>
    </div>
  );
}
