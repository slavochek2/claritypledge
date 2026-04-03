/**
 * @file letter-point-engagement.tsx
 * @description P581 Task 8: Point engagement component for letter reading.
 * Shows point statement with 3-button position (disagree/unsure/agree).
 * Author position locked until receiver engages (D10, D37).
 */

import { useState } from 'react';
import { Lock, Check, HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PositionType } from '@/app/types';

type SimplePosition = 'disagree' | 'unsure' | 'agree';

interface LetterPointEngagementProps {
  pointText: string;
  pointId: string;
  authorPosition: PositionType | null;
  authorName: string;
  onPosition: (position: SimplePosition) => void;
  onAddStory?: () => void;
  disabled?: boolean;
}


/** Map a 7-point PositionType to a display label */
function positionLabel(pos: PositionType): string {
  const labels: Record<string, string> = {
    strongly_agree: 'Strongly Agree',
    agree: 'Agree',
    somewhat_agree: 'Somewhat Agree',
    unsure: 'Unsure',
    somewhat_disagree: 'Somewhat Disagree',
    disagree: 'Disagree',
    strongly_disagree: 'Strongly Disagree',
  };
  return labels[pos] ?? pos;
}

const POSITION_BUTTONS: Array<{ value: SimplePosition; label: string; icon: typeof Check }> = [
  { value: 'disagree', label: 'Disagree', icon: X },
  { value: 'unsure', label: 'Unsure', icon: HelpCircle },
  { value: 'agree', label: 'Agree', icon: Check },
];

export function LetterPointEngagement({
  pointText,
  pointId: _pointId,
  authorPosition,
  authorName,
  onPosition,
  onAddStory,
  disabled,
}: LetterPointEngagementProps) {
  const [selected, setSelected] = useState<SimplePosition | null>(null);
  const hasEngaged = selected !== null;

  const handleSelect = (position: SimplePosition) => {
    if (disabled || hasEngaged) return;
    setSelected(position);
    onPosition(position);
  };

  return (
    <div className="space-y-4">
      {/* Point statement */}
      <blockquote className="text-base text-[#1A1A1A] font-medium border-l-2 border-[#0044CC] pl-4">
        {pointText}
      </blockquote>

      {/* Position buttons */}
      <div className="flex gap-2">
        {POSITION_BUTTONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleSelect(value)}
            disabled={disabled || hasEngaged}
            className={`
              flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2
              rounded-lg text-sm font-medium transition-all
              ${hasEngaged && selected === value
                ? 'bg-[#0044CC] text-white ring-2 ring-[#0044CC] ring-offset-1'
                : hasEngaged
                  ? 'bg-gray-100 text-gray-400 cursor-default'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Author position: locked or revealed */}
      <div
        className={`flex items-center gap-2 text-sm transition-opacity duration-500 ${
          hasEngaged ? 'opacity-100' : 'opacity-100'
        }`}
      >
        {hasEngaged && authorPosition ? (
          <span className="text-[#1A1A1A]/70">
            {authorName}: <span className="font-medium">{positionLabel(authorPosition)}</span>
          </span>
        ) : (
          <span className="text-[#1A1A1A]/40 flex items-center gap-1">
            <Lock size={12} />
            {authorName}&apos;s position hidden until you engage
          </span>
        )}
      </div>

      {/* Add a story CTA */}
      {onAddStory && (
        <Button
          variant="ghost"
          size="sm"
          className="text-[#0044CC] hover:text-[#0044CC]/80"
          onClick={onAddStory}
        >
          + Add a story
        </Button>
      )}
    </div>
  );
}
