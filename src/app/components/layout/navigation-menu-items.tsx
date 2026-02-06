/**
 * @file navigation-menu-items.tsx
 * @description Navigation Menu Items with Sandwich Pattern (P115)
 *
 * TWO STATES:
 * 1. Verified user → Public links (Pledgers, Manifesto, About) + separator + Settings, Log Out
 * 2. Everyone else → Co-create, Take the Pledge, Log In, Create Account
 *
 * P115 "Sandwich" pattern for logged-in users:
 * - Top section: Public navigation (site discovery)
 * - Separator
 * - Bottom section: Account actions (Settings, Log Out)
 *
 * Note: Co-create removed from logged-in menu (accessible via My Events page)
 *
 * Unverified /live users see the same menu as anonymous users.
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
  UsersIcon,
  BookOpenIcon,
  InfoIcon,
} from 'lucide-react';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';

interface NavigationMenuItemsProps {
  onSignOut: () => void;
  includeTestIds?: boolean;
  /** 'dropdown' for desktop, 'mobile' for mobile menu */
  variant?: 'dropdown' | 'mobile';
  /** Called when a menu item is clicked (useful for closing mobile menu) */
  onItemClick?: () => void;
}

/**
 * Navigation Menu Items - P115 Sandwich Pattern
 *
 * - Verified user: Public links (Pledgers, Manifesto, About) + Settings, Log Out
 * - Everyone else: Co-create, Take the Pledge, Log In, Create Account
 */
export function NavigationMenuItems({
  onSignOut,
  includeTestIds = false,
  variant = 'dropdown',
  onItemClick,
}: NavigationMenuItemsProps) {
  const { showUserMenu, showPublicCTAs } = useNavAuthState();

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
        {/* Public menu - Co-create, Take the Pledge, Log In, Create Account */}
        {showPublicCTAs && (
          <>
            <Link
              to="/co-create"
              className={mobileLinkClass}
              onClick={handleItemClick}
            >
              <UsersIcon className="w-4 h-4 inline mr-2" />
              Co-create
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

        {/* Verified user menu - P115: sandwich pattern with public links + account actions */}
        {showUserMenu && (
          <>
            {/* Public navigation (site discovery) */}
            <Link
              to="/pledgers"
              className={mobileLinkClass}
              onClick={handleItemClick}
            >
              <UsersIcon className="w-4 h-4 inline mr-2" />
              Pledgers
            </Link>
            <Link
              to="/manifesto"
              className={mobileLinkClass}
              onClick={handleItemClick}
            >
              <BookOpenIcon className="w-4 h-4 inline mr-2" />
              Manifesto
            </Link>
            <Link
              to="/about"
              className={mobileLinkClass}
              onClick={handleItemClick}
            >
              <InfoIcon className="w-4 h-4 inline mr-2" />
              About
            </Link>

            {/* Separator */}
            <hr className="border-t border-border my-2" />

            {/* Account actions */}
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
      {/* Public menu - Co-create, Take the Pledge, Log In, Create Account */}
      {showPublicCTAs && (
        <>
          <DropdownMenuItem asChild>
            <Link to="/co-create" className="cursor-pointer">
              <UsersIcon className="w-4 h-4 mr-2" />
              Co-create
            </Link>
          </DropdownMenuItem>
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

      {/* Verified user menu - P115: sandwich pattern with public links + account actions */}
      {showUserMenu && (
        <>
          {/* Public navigation (site discovery) */}
          <DropdownMenuItem asChild>
            <Link to="/pledgers" className="cursor-pointer">
              <UsersIcon className="w-4 h-4 mr-2" />
              Pledgers
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/manifesto" className="cursor-pointer">
              <BookOpenIcon className="w-4 h-4 mr-2" />
              Manifesto
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/about" className="cursor-pointer">
              <InfoIcon className="w-4 h-4 mr-2" />
              About
            </Link>
          </DropdownMenuItem>

          {/* Separator between site nav and account actions */}
          <DropdownMenuSeparator />

          {/* Account actions */}
          <DropdownMenuItem asChild data-testid={includeTestIds ? 'settings' : undefined}>
            <Link to="/settings" className="cursor-pointer">
              <SettingsIcon className="w-4 h-4 mr-2" />
              Settings
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => { onSignOut(); }}
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
