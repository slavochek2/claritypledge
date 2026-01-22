import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, Settings, LogOut, Newspaper, CalendarDays, User, Radio, Bell, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { currentUser, getUnreadNotificationCount, getNotifications, getUserById, getStoryById } from '../data/mock-data';
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
    if (path === routes.feed && (
      location.pathname.includes('/feed') ||
      location.pathname.includes('/story/') ||
      location.pathname.includes('/point/')
    )) return true;
    if (path === routes.myEvents && location.pathname.includes('/my-events')) return true;
    if (path === routes.profile && location.pathname.includes('/profile')) return true;
    return location.pathname === path;
  };

  const navItems: NavItem[] = [
    { path: routes.feed, label: 'Feed', icon: Newspaper },
    { path: routes.myEvents, label: 'My Events', icon: CalendarDays },
    { path: routes.profile, label: 'Profile', icon: User },
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
            to={routes.feed}
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

            {/* Notification Bell */}
            <NotificationBell />

            {/* Start a Clarity Session CTA */}
            <Link
              to={routes.live}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors shadow h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
            >
              <Radio size={16} />
              Start a Clarity Session
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
                  <Link to={routes.profile} className="cursor-pointer">
                    View Profile
                  </Link>
                </DropdownMenuItem>
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
                  <Link to={routes.live} className="cursor-pointer font-medium text-blue-600 flex items-center gap-2">
                    <Radio size={16} />
                    Start a Clarity Session
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={routes.profile} className="cursor-pointer">
                    View Profile
                  </Link>
                </DropdownMenuItem>
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

/**
 * NotificationBell - Bell icon with badge and dropdown
 * Shows verification requests and other notifications
 */
function NotificationBell() {
  const navigate = useNavigate();
  const unreadCount = getUnreadNotificationCount();
  const notifications = getNotifications();

  const getNotificationText = (notification: ReturnType<typeof getNotifications>[0]) => {
    const fromUser = getUserById(notification.fromUserId);
    const story = notification.storyId ? getStoryById(notification.storyId) : null;

    switch (notification.type) {
      case 'verification_request':
        return {
          title: `${fromUser?.name || 'Someone'} wants to verify understanding`,
          subtitle: story ? `"${story.text.slice(0, 50)}..."` : undefined,
        };
      case 'verification_accepted':
        return {
          title: `${fromUser?.name || 'Someone'} accepted your verification request`,
          subtitle: 'Ready to start a Clarity Session',
        };
      case 'verification_declined':
        return {
          title: `${fromUser?.name || 'Someone'} declined your verification request`,
          subtitle: undefined,
        };
      default:
        return { title: 'New notification', subtitle: undefined };
    }
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex flex-col items-center justify-center px-4 py-2 min-w-[80px] rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <div className="relative">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-medium text-white bg-red-500 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <span className="text-xs mt-1 font-medium">Alerts</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-80">
        <div className="px-3 py-2 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Notifications</h3>
        </div>
        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-gray-500 text-sm">
            No notifications yet
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {notifications.map((notification) => {
              const { title, subtitle } = getNotificationText(notification);
              const fromUser = getUserById(notification.fromUserId);

              return (
                <DropdownMenuItem
                  key={notification.id}
                  className={`flex items-start gap-3 px-3 py-3 cursor-pointer ${
                    !notification.read ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => {
                    if (notification.type === 'verification_request' && notification.storyId) {
                      navigate(routes.story(notification.storyId));
                    }
                  }}
                >
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0"
                    style={{ backgroundColor: '#3B82F6' }}
                  >
                    {fromUser?.name.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notification.read ? 'font-medium' : ''} text-gray-900`}>
                      {title}
                    </p>
                    {subtitle && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {subtitle}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(notification.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {/* Unread dot */}
                  {!notification.read && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
