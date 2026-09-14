/**
 * @file navigation-menu-items.tsx
 * @description The menu behind the hamburger (logged out) and the avatar (logged in).
 *
 * ONE structure, BOTH auth states (P1310). Everyone sees the same public sections —
 * Use cases / Product / Learn, read from `PUBLIC_NAV_GROUPS` — and then one account
 * block that differs by state:
 *   · signed out → Take the Pledge, Log In, Create Account
 *   · signed in  → "Your account": Session History, Settings, Log Out
 *
 * Before P1310 the signed-in branch hand-wrote its own seven items (Session History,
 * Pledgers, Manifesto, Blog, About, Settings, Log Out) while the signed-out branch
 * mapped the shared list. Two consequences the founder hit on a phone: a signed-in
 * person got NO section headings at all, and Use cases, Pricing, Feed and Groups were
 * missing from their menu entirely — reachable only by signing out or typing the URL.
 * That is the same duplication P1087 removed from the two public menus, left alive in
 * the third branch; one list is what makes the three unable to drift again.
 *
 * Supports two variants:
 * - 'dropdown' (default): desktop dropdown menus (uses DropdownMenuItem)
 * - 'mobile': mobile menu (plain Links with mobile styling)
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
  HistoryIcon,
} from 'lucide-react';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import { EVENTS_NAV_TO, PUBLIC_NAV_GROUPS } from './nav-links';

/** The signed-in account block. Not part of PUBLIC_NAV_GROUPS: these three carry test
 *  ids, a sign-out handler and no icon-from-data, so they stay hand-written — the same
 *  reasoning that keeps Take the Pledge / Log In / Create Account out of that list. */
const ACCOUNT_GROUP_LABEL = 'Your account';

/** Stable DOM id for a group heading, shared by the label and its `aria-labelledby`. */
function groupHeadingId(label: string): string {
  return `nav-group-${label.replace(/\s+/g, '-').toLowerCase()}`;
}

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

export function NavigationMenuItems({
  onSignOut,
  includeTestIds = false,
  variant = 'dropdown',
  onItemClick,
  hideLoginItem = false,
}: NavigationMenuItemsProps) {
  // Exactly one of these is true at any time (`showPublicCTAs = !showUserMenu`,
  // use-nav-auth-state.ts) — so the public sections below render unconditionally
  // and only the account block branches.
  const { showUserMenu, showPublicCTAs } = useNavAuthState();
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
    const groupLabelClass = "px-1 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

    return (
      <>
        {/* P1087: ONE grouped structure, shared with the dropdown below. Every group
            carries a label — labelling only "Use cases" made the rest read as
            leftovers, which is the "bit of chaos" the founder named. */}
        {PUBLIC_NAV_GROUPS.map((group) => (
          // role="group" + aria-labelledby, not a bare styled div: the desktop
          // dropdown gets real grouping semantics from Radix's DropdownMenuGroup /
          // DropdownMenuLabel, and without this the mobile menu announced one flat
          // undifferentiated list — the visual grouping existed only for sighted
          // users (adversarial review, P1087).
          <div
            key={group.label}
            role="group"
            aria-labelledby={groupHeadingId(group.label)}
            className="flex flex-col"
          >
            <div id={groupHeadingId(group.label)} className={groupLabelClass}>
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

        {/* Signed-out account actions */}
        {showPublicCTAs && (
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
            {!hideLoginItem && (
              <Link
                to="/login"
                className={mobileLinkClass}
                onClick={handleItemClick}
                data-testid={includeTestIds ? 'login-option' : undefined}
              >
                <LogIn className="w-4 h-4 inline mr-2" />
                Log In
              </Link>
            )}
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
        )}

        {/* Signed-in account actions — the fourth group (P1310) */}
        {showUserMenu && (
          <div
            role="group"
            aria-labelledby={groupHeadingId(ACCOUNT_GROUP_LABEL)}
            className="mt-3 border-t border-border pt-3 flex flex-col"
          >
            <div id={groupHeadingId(ACCOUNT_GROUP_LABEL)} className={groupLabelClass}>
              {ACCOUNT_GROUP_LABEL}
            </div>
            <Link
              to="/sessions"
              className={mobileLinkClass}
              onClick={handleItemClick}
            >
              <HistoryIcon className="w-4 h-4 inline mr-2" />
              Session History
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
          </div>
        )}
      </>
    );
  }

  // Dropdown variant (default) - for desktop dropdown menus
  return (
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

      {/* Signed-out account actions */}
      {showPublicCTAs && (
        <>
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

      {/* Signed-in account actions — the fourth group (P1310) */}
      {showUserMenu && (
        <DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {ACCOUNT_GROUP_LABEL}
          </DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link to="/sessions" className="cursor-pointer">
              <HistoryIcon className="w-4 h-4 mr-2" />
              Session History
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild data-testid={includeTestIds ? 'settings' : undefined}>
            <Link to="/settings" className="cursor-pointer">
              <SettingsIcon className="w-4 h-4 mr-2" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onSignOut}
            className="cursor-pointer"
            data-testid={includeTestIds ? 'sign-out' : undefined}
          >
            <LogOutIcon className="w-4 h-4 mr-2" />
            Log Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      )}
    </>
  );
}
