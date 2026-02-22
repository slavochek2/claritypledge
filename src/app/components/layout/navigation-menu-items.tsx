/**
 * @file navigation-menu-items.tsx
 * @description KISS Navigation Menu Items
 *
 * THREE STATES:
 * 1. Verified user (normal) → Events, Pledgers, Manifesto, Blog, About, Settings, Log Out
 * 2. Active /live session → Settings, Log Out ONLY (focused mode)
 * 3. Everyone else → Events, Pledgers, Manifesto, Blog, About, Log In, Create Account
 *
 * Unverified /live users see the same menu as anonymous users.
 * They can verify via /me page, email after meeting, or taking the pledge.
 *
 * Supports two variants:
 * - 'dropdown' (default): For desktop dropdown menus (uses DropdownMenuItem)
 * - 'mobile': For mobile menus (uses plain Links with mobile styling)
 */
import { Link } from 'react-router-dom';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  LogOutIcon,
  LogIn,
  SettingsIcon,
  FileTextIcon,
  UserPlusIcon,
  AwardIcon,
  ScrollTextIcon,
  InfoIcon,
  BookOpenIcon,
  CalendarIcon,
  HistoryIcon,
} from 'lucide-react';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import { useLiveSession } from '@/app/contexts/live-session-context';

interface NavigationMenuItemsProps {
  onSignOut: () => void;
  includeTestIds?: boolean;
  /** 'dropdown' for desktop, 'mobile' for mobile menu */
  variant?: 'dropdown' | 'mobile';
  /** Called when a menu item is clicked (useful for closing mobile menu) */
  onItemClick?: () => void;
  /** Hide navigation items during active /live session (only show Settings, Log Out) */
  inActiveSession?: boolean;
}

/**
 * KISS Navigation Menu Items
 *
 * - Verified user (normal): Events, Pledgers, Manifesto, Blog, About, Settings, Log Out
 * - Active /live session: Settings, Log Out only (focused mode)
 * - Everyone else: Events, Pledgers, Manifesto, Blog, About, Log In, Create Account
 */
export function NavigationMenuItems({
  onSignOut,
  includeTestIds = false,
  variant = 'dropdown',
  onItemClick,
  inActiveSession = false,
}: NavigationMenuItemsProps) {
  const { showUserMenu, showPublicCTAs } = useNavAuthState();
  const { isLive, setPendingNavTo } = useLiveSession();

  const handleItemClick = () => {
    onItemClick?.();
  };

  const handleSignOut = () => {
    onSignOut();
    onItemClick?.();
  };

  // Mobile variant - plain Links with mobile styling
  if (variant === 'mobile') {
    const mobileLinkClass = "text-left text-base font-medium hover:text-primary transition-colors py-2";

    return (
      <>
        {/* Public menu - Nav links + actions */}
        {showPublicCTAs && (
          <>
            <Link
              to="/events"
              className={mobileLinkClass}
              onClick={handleItemClick}
            >
              <CalendarIcon className="w-4 h-4 inline mr-2" />
              Events
            </Link>
            <Link
              to="/pledgers"
              className={mobileLinkClass}
              onClick={handleItemClick}
            >
              <AwardIcon className="w-4 h-4 inline mr-2" />
              Pledgers
            </Link>
            <Link
              to="/manifesto"
              className={mobileLinkClass}
              onClick={handleItemClick}
            >
              <ScrollTextIcon className="w-4 h-4 inline mr-2" />
              Manifesto
            </Link>
            <a
              href="https://blog.claritypledge.com"
              className={mobileLinkClass}
              onClick={handleItemClick}
              target="_blank"
              rel="noopener noreferrer"
            >
              <BookOpenIcon className="w-4 h-4 inline mr-2" />
              Blog
            </a>
            <Link
              to="/about"
              className={mobileLinkClass}
              onClick={handleItemClick}
            >
              <InfoIcon className="w-4 h-4 inline mr-2" />
              About
            </Link>
            <Link
              to="/sign-pledge"
              className={mobileLinkClass}
              onClick={handleItemClick}
              data-testid={includeTestIds ? 'take-pledge' : undefined}
            >
              <FileTextIcon className="w-4 h-4 inline mr-2" />
              Take the Pledge
            </Link>
            <Link
              to="/login"
              className={mobileLinkClass}
              onClick={handleItemClick}
              data-testid={includeTestIds ? 'login-option' : undefined}
            >
              <LogIn className="w-4 h-4 inline mr-2" />
              Log In
            </Link>
            <Link
              to="/signup"
              className={mobileLinkClass}
              onClick={handleItemClick}
              data-testid={includeTestIds ? 'create-account-option' : undefined}
            >
              <UserPlusIcon className="w-4 h-4 inline mr-2" />
              Create Account
            </Link>
          </>
        )}

        {/* Verified user menu */}
        {showUserMenu && (
          <>
            {/* Hide navigation items during active session */}
            {!inActiveSession && (
              <>
                <Link
                  to="/events"
                  className={mobileLinkClass}
                  onClick={handleItemClick}
                >
                  <CalendarIcon className="w-4 h-4 inline mr-2" />
                  Events
                </Link>
                <Link
                  to="/sessions"
                  className={mobileLinkClass}
                  onClick={handleItemClick}
                >
                  <HistoryIcon className="w-4 h-4 inline mr-2" />
                  Session History
                </Link>
                <Link
                  to="/pledgers"
                  className={mobileLinkClass}
                  onClick={handleItemClick}
                >
                  <AwardIcon className="w-4 h-4 inline mr-2" />
                  Pledgers
                </Link>
                <Link
                  to="/manifesto"
                  className={mobileLinkClass}
                  onClick={handleItemClick}
                >
                  <ScrollTextIcon className="w-4 h-4 inline mr-2" />
                  Manifesto
                </Link>
                <a
                  href="https://blog.claritypledge.com"
                  className={mobileLinkClass}
                  onClick={handleItemClick}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <BookOpenIcon className="w-4 h-4 inline mr-2" />
                  Blog
                </a>
                <Link
                  to="/about"
                  className={mobileLinkClass}
                  onClick={handleItemClick}
                >
                  <InfoIcon className="w-4 h-4 inline mr-2" />
                  About
                </Link>
              </>
            )}

            <Link
              to="/settings"
              className={mobileLinkClass}
              onClick={isLive ? (e) => { e.preventDefault(); setPendingNavTo('/settings'); handleItemClick(); } : handleItemClick}
              data-testid={includeTestIds ? 'settings' : undefined}
            >
              <SettingsIcon className="w-4 h-4 inline mr-2" />
              Settings
            </Link>

            <button
              onClick={handleSignOut}
              className={mobileLinkClass}
              data-testid={includeTestIds ? 'sign-out' : undefined}
            >
              <LogOutIcon className="w-4 h-4 inline mr-2" />
              Log Out
            </button>
          </>
        )}
      </>
    );
  }

  // Dropdown variant (default) - for desktop dropdown menus
  return (
    <>
      {/* Public menu - Nav links + actions */}
      {showPublicCTAs && (
        <>
          <DropdownMenuItem asChild>
            <Link to="/pledgers" className="cursor-pointer">
              <AwardIcon className="w-4 h-4 mr-2" />
              Pledgers
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/manifesto" className="cursor-pointer">
              <ScrollTextIcon className="w-4 h-4 mr-2" />
              Manifesto
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href="https://blog.claritypledge.com"
              className="cursor-pointer flex items-center"
              target="_blank"
              rel="noopener noreferrer"
            >
              <BookOpenIcon className="w-4 h-4 mr-2" />
              Blog
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/about" className="cursor-pointer">
              <InfoIcon className="w-4 h-4 mr-2" />
              About
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild data-testid={includeTestIds ? 'take-pledge' : undefined}>
            <Link to="/sign-pledge" className="cursor-pointer">
              <FileTextIcon className="w-4 h-4 mr-2" />
              Take the Pledge
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild data-testid={includeTestIds ? 'login-option' : undefined}>
            <Link to="/login" className="cursor-pointer">
              <LogIn className="w-4 h-4 mr-2" />
              Log In
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild data-testid={includeTestIds ? 'create-account-option' : undefined}>
            <Link to="/signup" className="cursor-pointer">
              <UserPlusIcon className="w-4 h-4 mr-2" />
              Create Account
            </Link>
          </DropdownMenuItem>
        </>
      )}

      {/* Verified user menu */}
      {showUserMenu && (
        <>
          {/* Hide navigation items during active session */}
          {!inActiveSession && (
            <>
              <DropdownMenuItem asChild>
                <Link to="/sessions" className="cursor-pointer">
                  <HistoryIcon className="w-4 h-4 mr-2" />
                  Session History
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/pledgers" className="cursor-pointer">
                  <AwardIcon className="w-4 h-4 mr-2" />
                  Pledgers
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/manifesto" className="cursor-pointer">
                  <ScrollTextIcon className="w-4 h-4 mr-2" />
                  Manifesto
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href="https://blog.claritypledge.com"
                  className="cursor-pointer flex items-center"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <BookOpenIcon className="w-4 h-4 mr-2" />
                  Blog
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/about" className="cursor-pointer">
                  <InfoIcon className="w-4 h-4 mr-2" />
                  About
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Settings */}
          <DropdownMenuItem asChild data-testid={includeTestIds ? 'settings' : undefined}>
            <Link
              to="/settings"
              className="cursor-pointer"
              onClick={isLive ? (e) => { e.preventDefault(); setPendingNavTo('/settings'); } : undefined}
            >
              <SettingsIcon className="w-4 h-4 mr-2" />
              Settings
            </Link>
          </DropdownMenuItem>

          {/* Log Out */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onSignOut}
            className="cursor-pointer"
            data-testid={includeTestIds ? 'sign-out' : undefined}
          >
            <LogOutIcon className="w-4 h-4 mr-2" />
            Log Out
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
