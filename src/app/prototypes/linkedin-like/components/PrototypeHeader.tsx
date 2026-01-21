import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Plus, ChevronDown, Settings, LogOut, Newspaper, CalendarDays, User, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { currentUser } from '../data/mock-data';
import { routes } from '../config';

/**
 * LinkedIn-style header with always-visible icon navigation
 * Nav items: Feed, My Events, My Profile, Notifications
 * Me dropdown: Settings, Logout
 */
export function PrototypeHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Check which nav item is active
  const isActive = (path: string) => {
    if (path.includes('/feed') && (location.pathname.includes('/feed') || location.pathname.includes('/story/') || location.pathname.includes('/point/'))) return true;
    if (path.includes('/my-events') && location.pathname.includes('/my-events')) return true;
    if (path.includes('/profile') && location.pathname.includes('/profile')) return true;
    return location.pathname === path;
  };

  const navItems = [
    { path: routes.feed, label: 'Feed', icon: Newspaper },
    { path: routes.myEvents, label: 'My Events', icon: CalendarDays },
    { path: routes.profile, label: 'My Profile', icon: User },
  ];

  return (
    <header className="sticky top-0 bg-white border-b border-gray-200 z-50">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link
            to={routes.feed}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              C
            </div>
            <span className="font-semibold text-gray-900 hidden sm:block">Clarity</span>
          </Link>

          {/* Center: Nav icons (desktop only) */}
          <div className="hidden sm:flex items-center gap-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex flex-col items-center justify-center px-4 py-1 min-w-[72px] transition-colors ${
                    active
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-xs mt-0.5 font-medium">{item.label}</span>
                </Link>
              );
            })}
            {/* Notifications */}
            <button
              className="flex flex-col items-center justify-center px-4 py-1 min-w-[72px] text-gray-500 hover:text-gray-700 border-b-2 border-transparent transition-colors relative"
              onClick={() => {/* TODO: notifications panel */}}
            >
              <Bell size={20} />
              <span className="text-xs mt-0.5 font-medium">Notifications</span>
              {/* Notification badge */}
              <span className="absolute top-0 right-3 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          </div>

          {/* Right side: CTA + Me dropdown */}
          <div className="flex items-center gap-2">
            {/* Start a Clarity Session CTA */}
            <Button
              onClick={() => navigate(routes.live)}
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white hidden sm:flex"
            >
              <Plus size={16} />
              <span className="hidden md:inline">Start a Clarity Session</span>
              <span className="md:hidden">New</span>
            </Button>

            {/* Me dropdown */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1 p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-lg">
                  {currentUser.avatar}
                </div>
                <ChevronDown size={16} className="text-gray-500 hidden sm:block" />
              </button>

              {dropdownOpen && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setDropdownOpen(false)}
                  />

                  {/* Dropdown menu */}
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        // Settings - placeholder for now
                      }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Settings size={16} />
                      Settings
                    </button>

                    <div className="border-t border-gray-100 my-1" />

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        navigate('/');
                      }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                    >
                      <LogOut size={16} />
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
