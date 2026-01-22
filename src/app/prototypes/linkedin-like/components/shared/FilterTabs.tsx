type PositionFilter = 'all' | 'agree' | 'disagree' | 'dont_know';

interface FilterTabsProps {
  activeFilter: PositionFilter;
  onFilterChange: (filter: PositionFilter) => void;
  counts: {
    all: number;
    agree: number;
    disagree: number;
    dont_know: number;
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
        activeColor="text-blue-600"
        underlineColor="bg-blue-600"
      />
      <FilterTab
        label="Disagreed"
        count={counts.disagree}
        active={activeFilter === 'disagree'}
        onClick={() => onFilterChange('disagree')}
      />
      <FilterTab
        label="Unsure"
        count={counts.dont_know}
        active={activeFilter === 'dont_know'}
        onClick={() => onFilterChange('dont_know')}
      />
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
      className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
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
