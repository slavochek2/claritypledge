import { X, HelpCircle, Check } from 'lucide-react';
import type { PositionType } from '@/app/types';

export interface PositionSelectorProps {
  selectedPosition: PositionType | null;
  onSelect: (position: PositionType) => void;
  disabled?: boolean;
}

interface ButtonConfig {
  position: PositionType;
  label: string;
  Icon: typeof Check;
}

const BUTTONS: ButtonConfig[] = [
  { position: 'disagree', label: 'Disagree', Icon: X },
  { position: 'unsure',   label: 'Unsure',   Icon: HelpCircle },
  { position: 'agree',    label: 'Agree',    Icon: Check },
];

export function PositionSelector({
  selectedPosition,
  onSelect,
  disabled = false,
}: PositionSelectorProps) {
  return (
    <div className={`flex gap-2${disabled ? ' opacity-50 pointer-events-none' : ''}`}>
      {BUTTONS.map(({ position, label, Icon }) => {
        const isActive = selectedPosition === position;
        return (
          <button
            key={position}
            onClick={() => onSelect(position)}
            aria-pressed={isActive}
            disabled={disabled}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-lg border',
              'min-h-11 text-sm font-medium transition-colors',
              isActive
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-600',
            ].join(' ')}
            data-testid={`position-selector-${position}`}
          >
            <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={2.5} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
