/**
 * @file live-session-banner.tsx
 * @description P23 V9: Simple centered header - "Clarity Meeting with [Partner]"
 * V10: Added exit button (X) in top-left corner
 * V12: Added sound toggle button (right side)
 * V13: Added logo on left, full-width header with proper spacing
 * V14: Unified menu dropdown - consolidated Exit and Sound into hamburger menu
 * V15: Avatar for logged-in users, hamburger for anonymous
 */
import { Link } from 'react-router-dom';
import { Menu, Volume2, VolumeX, LogOut, Home, EyeIcon } from 'lucide-react';
import { capitalizeName } from './shared';
import { useSoundEnabled } from '@/hooks/use-sound';
import { useAuth } from '@/auth';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
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
  const displayPartnerName = partnerName ? capitalizeName(partnerName) : '';
  const [soundEnabled, setSoundEnabled] = useSoundEnabled();
  const { session, user: currentUser, sessionChecked, isLoading } = useAuth();

  // Show avatar when session AND profile are loaded
  const isLoggedIn = sessionChecked && !isLoading && !!session && !!currentUser;

  // Determine display title
  const displayTitle = title ?? (partnerName ? `Clarity Meeting with ${displayPartnerName}` : 'Live Clarity Meeting');

  return (
    <div className="h-16 border-b bg-background flex items-center justify-between px-4">
      {/* Left: Logo */}
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-foreground rounded-lg flex items-center justify-center">
          <span className="text-background font-bold text-lg">C</span>
        </div>
      </Link>

      {/* Center: Meeting title */}
      <span className="text-sm text-muted-foreground">
        {displayTitle}
      </span>

      {/* Right: Menu dropdown - Avatar for logged in, hamburger for anonymous */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {isLoggedIn ? (
            <button
              className="flex items-center justify-center hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-full"
              aria-label="User menu"
            >
              <GravatarAvatar
                email={currentUser.email}
                name={currentUser.name}
                size="sm"
                avatarColor={currentUser.avatarColor}
              />
            </button>
          ) : (
            <button
              className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {/* Sound toggle */}
          <DropdownMenuItem onClick={() => setSoundEnabled(!soundEnabled)}>
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
            <DropdownMenuItem onClick={onExit} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Leave Meeting
            </DropdownMenuItem>
          )}

          {/* View My Pledge - only for logged in users */}
          {isLoggedIn && (
            <DropdownMenuItem asChild>
              <Link to={`/p/${currentUser.slug}`}>
                <EyeIcon className="h-4 w-4 mr-2" />
                View My Pledge
              </Link>
            </DropdownMenuItem>
          )}

          {/* Home - always available */}
          <DropdownMenuItem asChild>
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
