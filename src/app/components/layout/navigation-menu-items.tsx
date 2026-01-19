/**
 * @file navigation-menu-items.tsx
 * @description KISS Navigation Menu Items
 *
 * TWO STATES ONLY:
 * 1. Verified user → View My Profile, pledge items, Settings, Log Out
 * 2. Everyone else → Log In
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
  EyeIcon,
  SettingsIcon,
  UserIcon,
  FileTextIcon,
  UserPlusIcon,
  LayoutDashboardIcon,
  UsersIcon,
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
 * KISS Navigation Menu Items
 *
 * - Verified user: View My Profile, View My Pledge OR Take the Pledge, Settings, Log Out
 * - Everyone else: Log In
 */
export function NavigationMenuItems({
  onSignOut,
  includeTestIds = false,
  variant = 'dropdown',
  onItemClick,
}: NavigationMenuItemsProps) {
  const { showUserMenu, showPublicCTAs, hasPledged, slug } = useNavAuthState();

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
        {/* Public menu - Collaborate, Take the Pledge, Log In, Create Account */}
        {showPublicCTAs && (
          <>
            <Link
              to="/collaborate"
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

        {/* Verified user menu */}
        {showUserMenu && (
          <>
            {/* P62: Dashboard link */}
            <Link
              to="/home"
              className={mobileLinkClass}
              onClick={handleItemClick}
              data-testid={includeTestIds ? 'dashboard' : undefined}
            >
              <LayoutDashboardIcon className="w-4 h-4 inline mr-2" />
              Dashboard
            </Link>

            <Link
              to="/me"
              className={mobileLinkClass}
              onClick={handleItemClick}
              data-testid={includeTestIds ? 'view-profile' : undefined}
            >
              <UserIcon className="w-4 h-4 inline mr-2" />
              View My Profile
            </Link>

            {hasPledged && slug ? (
              <Link
                to={`/p/${slug}/pledge`}
                className={mobileLinkClass}
                onClick={handleItemClick}
                data-testid={includeTestIds ? 'view-pledge' : undefined}
              >
                <EyeIcon className="w-4 h-4 inline mr-2" />
                View My Pledge
              </Link>
            ) : (
              <Link
                to="/sign-pledge?prefill=true"
                className={mobileLinkClass}
                onClick={handleItemClick}
                data-testid={includeTestIds ? 'take-pledge' : undefined}
              >
                <FileTextIcon className="w-4 h-4 inline mr-2" />
                Take the Pledge
              </Link>
            )}

            <Link
              to="/collaborate"
              className={mobileLinkClass}
              onClick={handleItemClick}
            >
              <UsersIcon className="w-4 h-4 inline mr-2" />
              Co-create
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
      {/* Public menu - Collaborate, Take the Pledge, Log In, Create Account */}
      {showPublicCTAs && (
        <>
          <DropdownMenuItem asChild>
            <Link to="/collaborate" className="cursor-pointer">
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

      {/* Verified user menu */}
      {showUserMenu && (
        <>
          {/* P62: Dashboard link */}
          <DropdownMenuItem asChild data-testid={includeTestIds ? 'dashboard' : undefined}>
            <Link to="/home" className="cursor-pointer">
              <LayoutDashboardIcon className="w-4 h-4 mr-2" />
              Dashboard
            </Link>
          </DropdownMenuItem>

          {/* View My Profile */}
          <DropdownMenuItem asChild data-testid={includeTestIds ? 'view-profile' : undefined}>
            <Link to="/me" className="cursor-pointer">
              <UserIcon className="w-4 h-4 mr-2" />
              View My Profile
            </Link>
          </DropdownMenuItem>

          {/* Pledge: View My Pledge (pledgers) OR Take the Pledge (non-pledgers) */}
          {hasPledged && slug ? (
            <DropdownMenuItem asChild data-testid={includeTestIds ? 'view-pledge' : undefined}>
              <Link to={`/p/${slug}/pledge`} className="cursor-pointer">
                <EyeIcon className="w-4 h-4 mr-2" />
                View My Pledge
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild data-testid={includeTestIds ? 'take-pledge' : undefined}>
              <Link to="/sign-pledge?prefill=true" className="cursor-pointer">
                <FileTextIcon className="w-4 h-4 mr-2" />
                Take the Pledge
              </Link>
            </DropdownMenuItem>
          )}

          {/* Collaborate */}
          <DropdownMenuItem asChild>
            <Link to="/collaborate" className="cursor-pointer">
              <UsersIcon className="w-4 h-4 mr-2" />
              Co-create
            </Link>
          </DropdownMenuItem>

          {/* Settings */}
          <DropdownMenuItem asChild data-testid={includeTestIds ? 'settings' : undefined}>
            <Link to="/settings" className="cursor-pointer">
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
