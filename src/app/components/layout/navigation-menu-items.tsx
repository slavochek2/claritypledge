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
} from 'lucide-react';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';

interface NavigationMenuItemsProps {
  onSignOut: () => void;
  includeTestIds?: boolean;
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
}: NavigationMenuItemsProps) {
  const { showUserMenu, showPublicCTAs, hasPledged, slug } = useNavAuthState();

  return (
    <>
      {/* Public menu - Log In */}
      {showPublicCTAs && (
        <DropdownMenuItem asChild data-testid={includeTestIds ? 'login-option' : undefined}>
          <Link to="/login" className="cursor-pointer">
            <LogIn className="w-4 h-4 mr-2" />
            Log In
          </Link>
        </DropdownMenuItem>
      )}

      {/* Verified user menu */}
      {showUserMenu && (
        <>
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
