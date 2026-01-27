import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Settings, LogOut, CalendarDays, User, Radio, PenLine, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { currentUser } from '../data/mock-data';
import { routes } from '../config';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

/**
 * PrototypeHeader - LinkedIn-style icon navigation
 * Icons with labels for main nav, backdrop blur, proper spacing
 */
export function PrototypeHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Check which nav item is active
  const isActive = (path: string) => {
    if (path === routes.myEvents && (
      location.pathname.includes('/my-events') ||
      location.pathname.includes('/story/') ||
      location.pathname.includes('/point/')
    )) return true;
    if (path === routes.profile && location.pathname.includes('/profile')) return true;
    return location.pathname === path;
  };

  const navItems: NavItem[] = [
    { path: routes.myEvents, label: 'My Events', icon: CalendarDays },
    { path: routes.sift, label: 'Create', icon: PenLine },
    { path: routes.profile, label: 'My Profile', icon: User },
  ];

  // Get initials for avatar
  const initials = currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm'
          : 'bg-white/80 backdrop-blur-sm border-b border-gray-100'
      }`}
    >
      <div className="container mx-auto px-4 lg:px-8">
        <div className="relative flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link
            to={routes.myEvents}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              C
            </div>
            <span className="font-semibold text-gray-900 hidden sm:block">Clarity Pledge</span>
          </Link>

          {/* Desktop: Icon nav (LinkedIn-style) + CTA + Avatar */}
          <div className="hidden lg:flex items-center gap-2">
            {/* Nav items with icons */}
            {navItems.map(item => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex flex-col items-center justify-center px-4 py-2 min-w-[80px] rounded-md transition-colors ${
                    active
                      ? 'text-blue-600'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                  <span className="text-xs mt-1 font-medium">{item.label}</span>
                </Link>
              );
            })}

            {/* Start Live CTA */}
            <Link
              to={routes.live}
              title="Start a live clarity session"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors shadow h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
            >
              <Radio size={16} />
              Start Live
            </Link>

            {/* Avatar dropdown */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-full"
                  aria-label="Account menu"
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-medium text-sm"
                    style={{ backgroundColor: currentUser.avatarColor || '#3B82F6' }}
                  >
                    {initials}
                  </div>
                  <ChevronDown size={16} className="text-gray-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-48">
                <DropdownMenuItem asChild>
                  <button className="w-full cursor-pointer">
                    <Settings size={16} className="mr-2" />
                    Settings
                  </button>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate('/')}
                  className="cursor-pointer text-red-600 focus:text-red-600"
                >
                  <LogOut size={16} className="mr-2" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile: Avatar only (bottom nav handles navigation) */}
          <div className="lg:hidden">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1 hover:opacity-80 transition-opacity focus:outline-none"
                  aria-label="Account menu"
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-medium text-sm"
                    style={{ backgroundColor: currentUser.avatarColor || '#3B82F6' }}
                  >
                    {initials}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-48">
                {/* CTA on mobile */}
                <DropdownMenuItem asChild>
                  <Link to={routes.live} title="Start a live clarity session" className="cursor-pointer font-medium text-blue-600 flex items-center gap-2">
                    <Radio size={16} />
                    Start Live
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={routes.sift} className="cursor-pointer flex items-center gap-2">
                    <PenLine size={16} />
                    Create Stories & Points
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <button className="w-full cursor-pointer">
                    <Settings size={16} className="mr-2" />
                    Settings
                  </button>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate('/')}
                  className="cursor-pointer text-red-600 focus:text-red-600"
                >
                  <LogOut size={16} className="mr-2" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
