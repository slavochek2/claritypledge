/**
 * @file ViewToggle.tsx
 * @description Toggle between List and Card view modes.
 * Per P89: Mobile defaults to Cards, Desktop defaults to List.
 */
import { List, LayoutGrid } from 'lucide-react';

export type ViewMode = 'list' | 'cards';

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
      <button
        onClick={() => onViewChange('list')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          view === 'list'
            ? 'bg-blue-50 text-blue-600'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
        }`}
        aria-label="List view"
        aria-pressed={view === 'list'}
      >
        <List size={16} />
        <span className="hidden sm:inline">List</span>
      </button>
      <button
        onClick={() => onViewChange('cards')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          view === 'cards'
            ? 'bg-blue-50 text-blue-600'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
        }`}
        aria-label="Card view"
        aria-pressed={view === 'cards'}
      >
        <LayoutGrid size={16} />
        <span className="hidden sm:inline">Cards</span>
      </button>
    </div>
  );
}
