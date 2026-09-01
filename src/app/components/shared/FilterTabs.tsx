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

/**
 * FilterTabs - Position filter for Point detail page
 *
 * No "All" tab - click active tab again to deselect (shows all)
 * No icons - cleaner appearance
 */
export function FilterTabs({ activeFilter, onFilterChange, counts }: FilterTabsProps) {
  const handleTabClick = (filter: PositionFilter) => {
    // Toggle: clicking active tab deselects it (shows all)
    if (activeFilter === filter) {
      onFilterChange('all');
    } else {
      onFilterChange(filter);
    }
  };

  return (
    <div>
      <p className="px-4 pt-3 pb-1 text-xs text-gray-500">Filter by position:</p>
      <div className="flex border-b border-border">
        <FilterTab
          label="Disagree"
          count={counts.disagree}
          active={activeFilter === 'disagree'}
          onClick={() => handleTabClick('disagree')}
        />
        <FilterTab
          label="Unsure"
          count={counts.unsure}
          active={activeFilter === 'unsure'}
          onClick={() => handleTabClick('unsure')}
        />
        <FilterTab
          label="Agree"
          count={counts.agree}
          active={activeFilter === 'agree'}
          onClick={() => handleTabClick('agree')}
        />
      </div>
    </div>
  );
}

function FilterTab({
  label,
  count,
  active,
  onClick,
  activeColor = 'text-blue-600',
  underlineColor = 'bg-blue-600',
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
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
      {label} ({count})
      {active && (
        <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${underlineColor}`} />
      )}
    </button>
  );
}

export type { PositionFilter };
