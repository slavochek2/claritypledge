import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, User } from 'lucide-react';
import { routes } from '../config';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: routes.myEvents, label: 'My Events', icon: <CalendarDays size={20} /> },
  { path: routes.profile, label: 'My Profile', icon: <User size={20} /> },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    // My Events is active for my-events, story, and point detail pages
    if (path === routes.myEvents && (
      location.pathname.includes('/my-events') ||
      location.pathname.includes('/story/') ||
      location.pathname.includes('/point/')
    )) return true;
    if (path === routes.profile && location.pathname.includes('/profile')) return true;
    return location.pathname === path;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 lg:hidden">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-4">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors ${
                active
                  ? 'text-blue-600'
                  : 'text-gray-500 active:text-gray-700'
              }`}
            >
              {item.icon}
              <span className="text-xs mt-1 font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
