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
  TagIcon,
} from 'lucide-react';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import { AUDIENCE_LINKS, EVENTS_NAV_TO } from './nav-links';

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
            <Link
              to={EVENTS_NAV_TO}
              className={mobileLinkClass}
              onClick={() => {
                analytics.track('org_events_nav_clicked', { source: 'mobile_menu' });
                handleItemClick();
              }}
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
            {/* P1087: grouped under one "Use cases" label and NO LONGER self-filtered —
                the page you are on used to be the one entry missing, so there was no way
                to see where you were in the set. */}
            <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Use cases
            </div>
            {AUDIENCE_LINKS.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                aria-current={a.to === pathname ? "page" : undefined}
                className={`${mobileLinkClass}${a.to === pathname ? " font-semibold text-foreground" : ""}`}
                onClick={handleItemClick}
              >
                <a.Icon className="w-4 h-4 inline mr-2" />
                {a.label}
              </Link>
            ))}
            <Link
              to="/pricing"
              aria-current={pathname === "/pricing" ? "page" : undefined}
              className={mobileLinkClass}
              onClick={handleItemClick}
            >
              <TagIcon className="w-4 h-4 inline mr-2" />
              Pricing
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
          <DropdownMenuItem asChild>
            <Link
              to={EVENTS_NAV_TO}
              className="cursor-pointer"
              onClick={() => analytics.track('org_events_nav_clicked', { source: 'desktop_dropdown' })}
            >
              <CalendarIcon className="w-4 h-4 mr-2" />
              Events
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
            <Link to="/about" className="cursor-pointer">
              <InfoIcon className="w-4 h-4 mr-2" />
              About
            </Link>
          </DropdownMenuItem>
          {/* P987: this dropdown carried NO audience links at all — the switcher lived
              only in the desktop header and the mobile menu, so on any surface where the
              header collapses to the hamburger, /coach and /founder were unreachable. */}
          {/* P1087: no longer self-filtered — see the mobile menu above. */}
          {AUDIENCE_LINKS.map((a) => (
            <DropdownMenuItem key={a.to} asChild>
              <Link
                to={a.to}
                aria-current={a.to === pathname ? "page" : undefined}
                className={`cursor-pointer${a.to === pathname ? " font-semibold text-foreground" : ""}`}
              >
                <a.Icon className="w-4 h-4 mr-2" />
                {a.label}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem asChild>
            <Link
              to="/pricing"
              aria-current={pathname === "/pricing" ? "page" : undefined}
              className="cursor-pointer"
            >
              <TagIcon className="w-4 h-4 mr-2" />
              Pricing
            </Link>
          </DropdownMenuItem>
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
