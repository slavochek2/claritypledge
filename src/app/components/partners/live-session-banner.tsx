/**
 * @file live-session-banner.tsx
 * @description P23 V9: Simple centered header - "Clarity Meeting with [Partner]"
 * V10: Added exit button (X) in top-left corner
 * V12: Added sound toggle button (right side)
 * V13: Added logo on left, full-width header with proper spacing
 * V14: Unified menu dropdown - consolidated Exit and Sound into hamburger menu
 * V16: KISS - Always show hamburger menu, contents vary by auth state
 *      Removes complexity of conditional avatar/hamburger trigger
 */
import { Link } from 'react-router-dom';
import { Menu, Volume2, VolumeX, LogOut, Home, EyeIcon, LogIn } from 'lucide-react';
import { getFirstName } from './shared';
import { useSoundEnabled } from '@/hooks/use-sound';
import { useAuth } from '@/auth';
import { ClarityLogo } from '@/components/ui/clarity-logo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface LiveSessionBannerProps {
  partnerName?: string;
  onExit?: () => void;
  /** Title to show in center - defaults to "Clarity Meeting with [Partner]" */
  title?: string;
  /** Whether this is a live meeting (shows Leave Meeting option) */
  isLiveMeeting?: boolean;
}

export function LiveSessionBanner({ partnerName, onExit, title, isLiveMeeting = true }: LiveSessionBannerProps) {
  const displayPartnerName = partnerName ? getFirstName(partnerName) : '';
  const [soundEnabled, setSoundEnabled] = useSoundEnabled();
  const { session, user: currentUser, sessionChecked, isLoading } = useAuth();

  // Determine auth state for menu contents (not for trigger button)
  // Show user-specific options only when fully loaded with profile
  const isLoggedIn = sessionChecked && !isLoading && !!session && !!currentUser;
  // Show login option only when we're sure there's no session
  const showLoginOption = sessionChecked && !session;

  // Determine display title
  const displayTitle = title ?? (partnerName ? `Clarity Meeting with ${displayPartnerName}` : 'Live Clarity Meeting');

  return (
    <div className="h-16 border-b bg-background flex items-center justify-between px-4">
      {/* Left: Logo */}
      <Link to="/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
        <ClarityLogo size="sm" />
      </Link>

      {/* Center: Meeting title */}
      <span className="text-sm text-muted-foreground">
        {displayTitle}
      </span>

      {/* Right: Menu dropdown - ALWAYS hamburger (KISS principle) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
            aria-label="Menu"
            data-testid="menu-trigger"
          >
            <Menu className="h-5 w-5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {/* Sound toggle - always available */}
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

          <DropdownMenuSeparator />

          {/* Leave Meeting - only if in live meeting and onExit provided */}
          {isLiveMeeting && onExit && (
            <DropdownMenuItem
              onClick={onExit}
              className="text-destructive focus:text-destructive"
              data-testid="leave-meeting"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Leave Meeting
            </DropdownMenuItem>
          )}

          {/* View My Pledge - only for logged in users with profile */}
          {isLoggedIn && currentUser.slug && (
            <DropdownMenuItem asChild data-testid="view-pledge">
              <Link to={`/p/${currentUser.slug}`}>
                <EyeIcon className="h-4 w-4 mr-2" />
                View My Pledge
              </Link>
            </DropdownMenuItem>
          )}

          {/* Log In - only for anonymous users (when session check complete and no session) */}
          {showLoginOption && (
            <DropdownMenuItem asChild data-testid="login-option">
              <Link to="/login">
                <LogIn className="h-4 w-4 mr-2" />
                Log In
              </Link>
            </DropdownMenuItem>
          )}

          {/* Home - always available */}
          <DropdownMenuItem asChild data-testid="home-link">
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Home
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
