import { Check, X, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type PositionFilter = 'all' | 'agree' | 'disagree' | 'unsure';

interface FilterTabsProps {
  activeFilter: PositionFilter;
  onFilterChange: (filter: PositionFilter) => void;
  counts: {
    all: number;
    agree: number;
    disagree: number;
    unsure: number;
  };
}

export function FilterTabs({ activeFilter, onFilterChange, counts }: FilterTabsProps) {
  return (
    <div className="flex border-b border-gray-200">
      <FilterTab
        label="All"
        count={counts.all}
        active={activeFilter === 'all'}
        onClick={() => onFilterChange('all')}
      />
      <FilterTab
        label="Agreed"
        count={counts.agree}
        active={activeFilter === 'agree'}
        onClick={() => onFilterChange('agree')}
        icon={Check}
      />
      <FilterTab
        label="Disagreed"
        count={counts.disagree}
        active={activeFilter === 'disagree'}
        onClick={() => onFilterChange('disagree')}
        icon={X}
      />
      <FilterTab
        label="Unsure"
        count={counts.unsure}
        active={activeFilter === 'unsure'}
        onClick={() => onFilterChange('unsure')}
        icon={Minus}
      />
    </div>
  );
}

function FilterTab({
  label,
  count,
  active,
  onClick,
  icon: Icon,
  activeColor = 'text-blue-600',
  underlineColor = 'bg-blue-600',
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  activeColor?: string;
  underlineColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 text-sm font-medium transition-colors relative flex items-center justify-center gap-1 ${
        active ? activeColor : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label} ({count})
      {active && (
        <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${underlineColor}`} />
      )}
    </button>
  );
}

export type { PositionFilter };
