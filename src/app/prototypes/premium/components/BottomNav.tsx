import { useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageCircle, Radio, User, Share2 } from 'lucide-react';
import { navTabs, ROUTE_BASE } from '../config';

const iconMap = {
  feed: Home,
  chat: MessageCircle,
  live: Radio,
  profile: User,
  topology: Share2,
} as const;

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const currentPath = location.pathname;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
      role="tablist"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-[56px] max-w-[500px] mx-auto">
        {navTabs.map((tab) => {
          const isActive = currentPath === tab.path ||
            (tab.id === 'feed' && currentPath.startsWith(`${ROUTE_BASE}/idea`));
          const Icon = iconMap[tab.id as keyof typeof iconMap];

          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              role="tab"
              aria-selected={isActive}
              aria-label={`Navigate to ${tab.label}`}
              className={`
                flex flex-col items-center justify-center gap-1 flex-1 h-full min-h-[44px]
                transition-colors duration-200
                ${isActive ? 'text-[#007AFF]' : 'text-gray-400'}
              `}
            >
              <Icon
                size={24}
                strokeWidth={isActive ? 2 : 1.5}
                className={isActive ? 'fill-current' : ''}
                aria-hidden="true"
              />
              <span className="text-[10px] font-medium tracking-tight">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
