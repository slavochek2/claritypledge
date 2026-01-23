/**
 * @file ContentTypeTabs.tsx
 * @description Tab filter for Stories/Points/All content types.
 */

export type ContentFilter = 'all' | 'stories' | 'points';

interface ContentTypeTabsProps {
  filter: ContentFilter;
  onChange: (filter: ContentFilter) => void;
  storiesCount: number;
  pointsCount: number;
}

export function ContentTypeTabs({
  filter,
  onChange,
  storiesCount,
  pointsCount,
}: ContentTypeTabsProps) {
  const totalCount = storiesCount + pointsCount;

  const tabs: { id: ContentFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'stories', label: 'Stories', count: storiesCount },
    { id: 'points', label: 'Points', count: pointsCount },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
              filter === tab.id
                ? 'text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            aria-pressed={filter === tab.id}
          >
            {tab.label} ({tab.count})
            {filter === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
