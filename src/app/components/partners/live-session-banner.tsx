/**
 * @file live-session-banner.tsx
 * @description P23 V9: Simple centered header - "Clarity Session with [Partner]"
 * V10: Added exit button (X) in top-left corner
 * V12: Added sound toggle button (right side)
 * V13: Added logo on left, full-width header with proper spacing
 * V14: Unified menu dropdown - consolidated Exit and Sound into hamburger menu
 * V16: KISS - Always show hamburger menu, contents vary by auth state
 * V17: P52 - Use shared useNavAuthState hook for consistent auth across all navigations
 *      Added missing menu items: View My Profile, Take the Pledge, Settings
 * V18: P67 - Avatar replaces hamburger for verified users (re-adds conditional trigger)
 */
import { Link, useNavigate } from 'react-router-dom';
import { MenuIcon, Volume2, VolumeX, LogOut, Home } from 'lucide-react';
import { getFirstName } from './shared';
import { useSoundEnabled } from '@/hooks/use-sound';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import { analytics } from '@/lib/mixpanel';
import { ClarityLogo } from '@/components/ui/clarity-logo';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NavigationMenuItems } from '@/app/components/layout/navigation-menu-items';

interface LiveSessionBannerProps {
  partnerName?: string;
  onExit?: () => void;
  /** Title to show in center - defaults to "Clarity Session with [Partner]" */
  title?: string;
  /** Whether this is a live session (shows Leave Session option) */
  isLiveMeeting?: boolean;
}

export function LiveSessionBanner({ partnerName, onExit, title, isLiveMeeting = true }: LiveSessionBannerProps) {
  const navigate = useNavigate();
  const displayPartnerName = partnerName ? getFirstName(partnerName) : '';
  const [soundEnabled, setSoundEnabled] = useSoundEnabled();

  // P52: Use shared navigation auth state hook for consistency with SimpleNavigation
  // P67: user and showUserMenu needed for avatar display
  const { signOut, user, showUserMenu } = useNavAuthState();

  // Determine display title
  const displayTitle = title ?? (partnerName ? `Clarity Session with ${displayPartnerName}` : 'Live Clarity Session');

  return (
    <div className="h-16 lg:h-20 bg-background">
      <div className="container mx-auto px-4 lg:px-8 h-full">
        <div className="relative flex items-center justify-between h-full">
          {/* Left: Logo - P52: Aligned styling with SimpleNavigation */}
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <ClarityLogo size="sm" />
          </Link>

          {/* Center: Meeting title - absolutely positioned for true centering */}
          <span className="absolute left-1/2 -translate-x-1/2 text-sm text-muted-foreground">
            {displayTitle}
          </span>

          {/* Right: Menu dropdown - P67: Avatar for verified users, hamburger for everyone else */}
          {/* P52: Aligned styling with SimpleNavigation for consistent positioning */}
          <DropdownMenu modal={false} onOpenChange={(open) => {
            if (open) {
              analytics.track('nav_menu_opened', {
                trigger: showUserMenu && user ? 'avatar' : 'hamburger',
                device: 'desktop', // LiveSessionBanner is always desktop-style dropdown
              });
            }
          }}>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center justify-center hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md p-2"
            aria-label="Menu"
            data-testid="menu-trigger"
          >
            {showUserMenu && user ? (
              <GravatarAvatar
                name={user.name}
                avatarColor={user.avatarColor}
                photoUrl={user.avatarUrl}
                size="sm"
              />
            ) : (
              <MenuIcon className="w-5 h-5" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-48">
          {/* === LIVE-SPECIFIC SETTINGS === */}
          <DropdownMenuItem
            onClick={() => setSoundEnabled(!soundEnabled)}
            data-testid="sound-toggle"
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 mr-2" />
            ) : (
              <VolumeX className="h-4 w-4 mr-2" />
            )}
            Sound: {soundEnabled ? 'On' : 'Off'}
          </DropdownMenuItem>

          {/* === MEETING ACTIONS === */}
          {isLiveMeeting && onExit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onExit}
                className="text-destructive focus:text-destructive"
                data-testid="leave-meeting"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Leave Session
              </DropdownMenuItem>
            </>
          )}

          {/* === NAVIGATION === */}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild data-testid="home-link">
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Home
            </Link>
          </DropdownMenuItem>

          {/* === AUTH MENU ITEMS - P50 Phase 2: Use shared component === */}
          <NavigationMenuItems
            onSignOut={async () => {
              await signOut();
              navigate('/');
            }}
            includeTestIds={true}
          />
        </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
