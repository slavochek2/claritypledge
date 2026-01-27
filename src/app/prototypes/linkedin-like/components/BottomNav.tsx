import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, User, Radio, PenLine } from 'lucide-react';
import { routes } from '../config';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { path: routes.myEvents, label: 'My Events', icon: <CalendarDays size={20} /> },
  { path: routes.sift, label: 'Create', icon: <PenLine size={20} /> },
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
    if (path === routes.sift && location.pathname.includes('/sift')) return true;
    return location.pathname === path;
  };

  const handleStartSession = () => {
    // Navigate to start a new session
    navigate('/prototype/live/new');
  };

  const getButtonClasses = (active: boolean) =>
    `flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors ${
      active
        ? 'text-blue-600'
        : 'text-gray-500 active:text-gray-700'
    }`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] z-50 lg:hidden">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-2 pb-[env(safe-area-inset-bottom)]">
        {/* My Events */}
        <button
          onClick={() => navigate(navItems[0].path)}
          className={getButtonClasses(isActive(navItems[0].path))}
        >
          {navItems[0].icon}
          <span className="text-xs mt-1 font-medium">{navItems[0].label}</span>
        </button>

        {/* Create - Center */}
        <button
          onClick={() => navigate(navItems[1].path)}
          className={getButtonClasses(isActive(navItems[1].path))}
        >
          {navItems[1].icon}
          <span className="text-xs mt-1 font-medium">{navItems[1].label}</span>
        </button>

        {/* Start Session */}
        <button
          onClick={handleStartSession}
          className={getButtonClasses(false)}
          aria-label="Start Live"
          title="Start a live clarity session"
        >
          <Radio size={20} />
          <span className="text-xs mt-1 font-medium">Live</span>
        </button>

        {/* My Profile */}
        <button
          onClick={() => navigate(navItems[2].path)}
          className={getButtonClasses(isActive(navItems[2].path))}
        >
          {navItems[2].icon}
          <span className="text-xs mt-1 font-medium">{navItems[2].label}</span>
        </button>
      </div>
    </nav>
  );
}
