import { useState } from 'react';
import { Search, Bell, User, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { routes } from '../config';

interface FeedHeaderProps {
  onCreateIdea: () => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

const filters = [
  { id: 'all', label: 'All Ideas' },
  { id: 'disputed', label: 'Disputed' },
  { id: 'verified', label: 'Verified' },
  { id: 'my-network', label: 'My Network' },
];

export function FeedHeader({ onCreateIdea, activeFilter, onFilterChange }: FeedHeaderProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      {/* Top row: Avatar, Search, Notifications */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate(routes.profile)}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
          aria-label="Go to profile"
        >
          <User size={20} />
        </button>

        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search ideas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 bg-gray-100 rounded-full text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors relative"
          aria-label="Notifications"
        >
          <Bell size={20} />
          {/* Notification dot */}
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 px-4 pb-2 overflow-x-auto scrollbar-hide">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => onFilterChange(filter.id)}
            className={`
              px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap
              transition-colors duration-200 min-h-[32px]
              ${activeFilter === filter.id
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
            `}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Share idea input */}
      <div className="px-4 pb-3">
        <button
          onClick={onCreateIdea}
          className="w-full h-12 px-4 bg-gray-50 hover:bg-gray-100 rounded-xl text-left text-gray-400 text-sm flex items-center gap-3 transition-colors border border-gray-200"
        >
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Plus size={16} className="text-blue-500" />
          </div>
          <span>Share an idea for discussion...</span>
        </button>
      </div>
    </header>
  );
}
