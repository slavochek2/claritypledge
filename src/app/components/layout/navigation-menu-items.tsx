/**
 * @file navigation-menu-items.tsx
 * @description KISS Navigation Menu Items
 *
 * TWO STATES:
 * 1. Verified user → Events, Pledgers, Manifesto, Blog, About, Settings, Log Out
 * 2. Everyone else → Events, Pledgers, Manifesto, Blog, About, Log In, Create Account
 *
 * Supports two variants:
 * - 'dropdown' (default): For desktop dropdown menus (uses DropdownMenuItem)
 * - 'mobile': For mobile menus (uses plain Links with mobile styling)
 */
import { Link, useLocation } from 'react-router-dom';
import { analytics } from '@/lib/mixpanel';
import {
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
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
  HistoryIcon,
} from 'lucide-react';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import { EVENTS_NAV_TO, PUBLIC_NAV_GROUPS } from './nav-links';

interface NavigationMenuItemsProps {
  onSignOut: () => void;
  includeTestIds?: boolean;
  /** 'dropdown' for desktop, 'mobile' for mobile menu */
  variant?: 'dropdown' | 'mobile';
  /** Called when a menu item is clicked (useful for closing mobile menu) */
  onItemClick?: () => void;
  /** P856: hide the Log In item — used by the desktop header dropdown, where
      Log in is a visible link next to the main CTA. LiveSessionBanner and the
      mobile menu keep the item (no visible login elsewhere on those surfaces). */
  hideLoginItem?: boolean;
}

/**
 * KISS Navigation Menu Items
 *
 * - Verified user: Events, Pledgers, Manifesto, Blog, About, Settings, Log Out
 * - Everyone else: Events, Pledgers, Manifesto, Blog, About, Log In, Create Account
 */
export function NavigationMenuItems({
  onSignOut,
  includeTestIds = false,
  variant = 'dropdown',
  onItemClick,
  hideLoginItem = false,
}: NavigationMenuItemsProps) {
  const { showUserMenu, showPublicCTAs } = useNavAuthState();
  // P916 made this a two-way toggle (/coach <-> "/"). P987 added a third audience
  // (/founder — the still-live co-founder offer), which a toggle cannot express: on
  // /founder it showed "For coaches" and offered NO way back to "/". Render the
  // audiences you are NOT on instead; the self-link filter replaces the toggle.
  const { pathname } = useLocation();

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
            {/* P1087: ONE grouped structure, shared with the dropdown below. Every group
                carries a label — labelling only "Use cases" made the rest read as
                leftovers, which is the "bit of chaos" the founder named. */}
            {PUBLIC_NAV_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col">
                <div className="px-1 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((item) =>
                  'external' in item && item.external ? (
                    <a
                      key={item.to}
                      href={item.to}
                      className={mobileLinkClass}
                      onClick={handleItemClick}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <item.Icon className="w-4 h-4 inline mr-2" />
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      key={item.to}
                      to={item.to}
                      aria-current={item.to === pathname ? 'page' : undefined}
                      className={`${mobileLinkClass}${item.to === pathname ? ' font-semibold text-foreground' : ''}`}
                      onClick={() => {
                        if (item.to === EVENTS_NAV_TO) {
                          analytics.track('org_events_nav_clicked', { source: 'mobile_menu' });
                        }
                        handleItemClick();
                      }}
                    >
                      <item.Icon className="w-4 h-4 inline mr-2" />
                      {item.label}
                    </Link>
                  )
                )}
              </div>
            ))}
            <div className="mt-3 border-t border-border pt-3 flex flex-col">
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
            </div>
          </>
        )}

        {/* Verified user menu */}
        {showUserMenu && (
          <>
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

            <Link
              to="/settings"
              className={mobileLinkClass}
              onClick={handleItemClick}
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
          {/* P1087: same PUBLIC_NAV_GROUPS as the mobile menu, so the two can no longer
              drift in ORDER — before this they listed identical items in two different
              sequences, which no test would have caught. */}
          {PUBLIC_NAV_GROUPS.map((group) => (
            <DropdownMenuGroup key={group.label}>
              <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </DropdownMenuLabel>
              {group.items.map((item) => (
                <DropdownMenuItem key={item.to} asChild>
                  {'external' in item && item.external ? (
                    <a
                      href={item.to}
                      className="cursor-pointer flex items-center"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <item.Icon className="w-4 h-4 mr-2" />
                      {item.label}
                    </a>
                  ) : (
                    <Link
                      to={item.to}
                      aria-current={item.to === pathname ? 'page' : undefined}
                      className={`cursor-pointer${item.to === pathname ? ' font-semibold text-foreground' : ''}`}
                      onClick={() => {
                        if (item.to === EVENTS_NAV_TO) {
                          analytics.track('org_events_nav_clicked', { source: 'desktop_dropdown' });
                        }
                      }}
                    >
                      <item.Icon className="w-4 h-4 mr-2" />
                      {item.label}
                    </Link>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild data-testid={includeTestIds ? 'take-pledge' : undefined}>
            <Link to="/sign-pledge" className="cursor-pointer">
              <FileTextIcon className="w-4 h-4 mr-2" />
              Take the Pledge
            </Link>
          </DropdownMenuItem>
          {!hideLoginItem && (
            <DropdownMenuItem asChild data-testid={includeTestIds ? 'login-option' : undefined}>
              <Link to="/login" className="cursor-pointer">
                <LogIn className="w-4 h-4 mr-2" />
                Log In
              </Link>
            </DropdownMenuItem>
          )}
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

          {/* Settings */}
          <DropdownMenuItem asChild data-testid={includeTestIds ? 'settings' : undefined}>
            <Link
              to="/settings"
              className="cursor-pointer"
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
