import { useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageCircle, Radio, User, Share2 } from 'lucide-react';

const tabs = [
  { id: 'feed', label: 'Ideas', icon: Home, path: '/prototype/premium/feed' },
  { id: 'chat', label: 'Chat', icon: MessageCircle, path: '/prototype/premium/chat' },
  { id: 'live', label: 'Live', icon: Radio, path: '/prototype/premium/live' },
  { id: 'profile', label: 'Profile', icon: User, path: '/prototype/premium/profile' },
  { id: 'topology', label: 'Network', icon: Share2, path: '/prototype/premium/topology' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const currentPath = location.pathname;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-[56px] max-w-[500px] mx-auto">
        {tabs.map((tab) => {
          const isActive = currentPath === tab.path ||
            (tab.id === 'feed' && currentPath.startsWith('/prototype/premium/idea'));
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`
                flex flex-col items-center justify-center gap-1 flex-1 h-full
                transition-colors duration-200
                ${isActive ? 'text-[#007AFF]' : 'text-gray-400'}
              `}
            >
              <Icon
                size={24}
                strokeWidth={isActive ? 2 : 1.5}
                className={isActive ? 'fill-current' : ''}
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
