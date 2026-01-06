import { useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageCircle, Mic, User } from 'lucide-react';
import { navTabs, type TabId } from '../config';

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  home: Home,
  message: MessageCircle,
  mic: Mic,
  user: User,
};

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const getActiveTab = (): TabId => {
    const path = location.pathname;
    if (path.includes('/chats') || path.includes('/chat/')) return 'chats';
    if (path.includes('/live')) return 'live';
    if (path.includes('/profile')) return 'profile';
    return 'ideas';
  };

  const activeTab = getActiveTab();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {navTabs.map((tab) => {
          const Icon = iconMap[tab.icon];
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`
                flex flex-col items-center justify-center
                w-16 h-full min-h-[44px]
                transition-colors duration-200
                ${isActive ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}
              `}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={24} className={isActive ? 'stroke-[2.5]' : ''} />
              <span className={`text-[10px] mt-1 font-medium ${isActive ? 'text-blue-500' : 'text-gray-500'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
      {/* Safe area for iOS */}
      <div className="h-safe-area-inset-bottom bg-white" />
    </nav>
  );
}
