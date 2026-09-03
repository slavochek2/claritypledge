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
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MenuIcon, Volume2, VolumeX, LogOut } from 'lucide-react';
import { useSoundEnabled } from '@/hooks/use-sound';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';
import { analytics } from '@/lib/mixpanel';
import { ClarityLogo } from '@/components/ui/clarity-logo';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NavigationMenuItems } from '@/app/components/layout/navigation-menu-items';
interface LiveSessionBannerProps {
  partnerName?: string;
  onExit?: () => void | Promise<void>;
  /** Whether this is a live session (shows Leave Session option) */
  isLiveMeeting?: boolean;
}

export function LiveSessionBanner({ partnerName: _partnerName, onExit, isLiveMeeting = true }: LiveSessionBannerProps) {
  const navigate = useNavigate();
  const [soundEnabled, setSoundEnabled] = useSoundEnabled();
  const [isEnding, setIsEnding] = useState(false);

  // P52: Use shared navigation auth state hook for consistency with SimpleNavigation
  // P67: user and showUserMenu needed for avatar display
  const { signOut, user, showUserMenu, hasPledged } = useNavAuthState();

  async function handleExit() {
    if (isEnding || !onExit) return;
    setIsEnding(true);
    try {
      await onExit();
    } finally {
      setIsEnding(false);
    }
  }
  // P956: the bar's height GROWS by env(safe-area-inset-top) (not just pt) so the inset is
  // added above the h-16/h-20 content row rather than eaten out of it (border-box). pt then
  // pushes the h-full content below the inset. All resolve to h-16/h-20 at inset = 0.
  return (
    <div className="sticky top-0 z-50 h-[calc(4rem+env(safe-area-inset-top))] lg:h-[calc(5rem+env(safe-area-inset-top))] bg-background border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="container mx-auto px-4 lg:px-8 h-full">
        <div className="relative flex items-center justify-between h-full">
          {/* Left: Logo - P52: Aligned styling with SimpleNavigation */}
          <Link
            to="/"
            className="hover:opacity-80 transition-opacity shrink-0"
          >
            <ClarityLogo size="sm" />
          </Link>

          {/* Right: Leave Session button + menu */}
          <div className="flex items-center gap-2">
          {/* Leave Session — primary session action, always visible */}
          {/* P779: Always route through onExit() so terminate() writes sessionEnded=true.
              The other party's subscribeToClaritySession handler reads that write and
              navigates to returnTo (clarity-live-page.tsx, sessionEnded branches ~1053/~1227). */}
          {isLiveMeeting && onExit && (
            <button
              onClick={handleExit}
              disabled={isEnding}
              aria-busy={isEnding}
              aria-label={isEnding ? 'Ending session, please wait' : 'End Session'}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg px-3 h-9 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="leave-meeting"
            >
              <LogOut className="h-4 w-4" />
              <span>{isEnding ? 'Ending…' : 'End Session'}</span>
            </button>
          )}

          {/* Menu dropdown - P67: Avatar for verified users, hamburger for everyone else */}
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
            className="flex items-center justify-center hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md p-2"
            aria-label="Menu"
            data-testid="menu-trigger"
          >
            {showUserMenu && user ? (
              <GravatarAvatar
                name={user.name}
                avatarColor={user.avatarColor}
                photoUrl={user.avatarUrl}
                size="sm"
                isPledger={hasPledged}
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
    </div>
  );
}
