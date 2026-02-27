/**
 * @file simple-navigation.tsx
 * @description KISS Navigation - Two states only
 *
 * 1. Verified user → Icon nav (Events, Create, Profile) + dropdown with public links + Settings, Log Out
 * 2. Everyone else → Text nav links + dropdown with CTAs
 *
 * P115: Logged-in dropdown uses "sandwich" pattern - public links on top, separator, account actions below.
 */
import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuIcon, XIcon, CalendarIcon, UserIcon, HistoryIcon } from "lucide-react";
import { ClarityLogo } from "@/components/ui/clarity-logo";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { analytics } from "@/lib/mixpanel";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";
import { NavigationMenuItems } from "./navigation-menu-items";
import { useLiveSession } from "@/app/contexts/live-session-context";

const MOBILE_MENU_ID = "mobile-navigation-menu";

export function SimpleNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // KISS: Only two states - verified user or everyone else
  // Note: showPublicCTAs, slug, hasPledged handled by NavigationMenuItems (shared component)
  // P67: user is needed for avatar display
  // P76: hasPledged is needed for pledger distinction on avatars
  // P113: slug is needed for icon nav profile link
  const {
    showUserMenu,
    user,
    hasPledged,
    slug,
    signOut,
    isLoading,
    sessionChecked,
  } = useNavAuthState();
  const { isLive, setPendingNavTo } = useLiveSession();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsMobileMenuOpen(false);
      navigate("/");
    } catch {
      setIsMobileMenuOpen(false);
    }
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <nav
      data-nav="main"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-background/95 backdrop-blur-md border-b border-border shadow-sm"
          : "bg-background/80 backdrop-blur-sm"
      }`}
    >
      <div className="container mx-auto px-4 lg:px-8">
        <div className="relative flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link
            to="/"
            className="hover:opacity-80 transition-opacity"
            onClick={(e) => {
              if (location.pathname === "/") {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
                return;
              }
              if (isLive) {
                e.preventDefault();
                setPendingNavTo('/');
              }
            }}
          >
            <ClarityLogo size="sm" />
          </Link>

          {/* Desktop: Nav links + CTA + Menu */}
          <div className="hidden lg:flex items-center gap-3">
            {/* P113: Show icon nav for logged-in users, text links for logged-out */}
            {/* Loading state: skeleton pills to prevent layout flicker */}
            {!sessionChecked || isLoading ? (
              /* Auth resolving: skeleton to prevent logged-out flash */
              <>
                <div className="animate-pulse flex items-center gap-3 transition-opacity duration-150">
                  <div className="h-10 w-[88px] bg-muted rounded-md" />
                  <div className="h-10 w-[80px] bg-muted rounded-md" />
                  <div className="h-10 w-[80px] bg-muted rounded-md" />
                </div>
                {/* Start a Clarity Session CTA — always visible, exists in both auth states */}
                <Link
                  to="/live"
                  title="Start a live clarity session"
                  className="inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                  onClick={() => analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'desktop' })}
                >
                  Start a Clarity Session
                </Link>
                {/* Avatar/hamburger skeleton */}
                <div className="h-9 w-9 bg-muted rounded-full animate-pulse" />
              </>
            ) : showUserMenu ? (
              /* Logged-in: Icon nav with labels (LinkedIn-style) */
              <div className="flex items-center gap-3 transition-opacity duration-150">
                {/* My Sessions — P405: hidden during active session */}
                {!isLive && (
                  <Link
                    to="/sessions"
                    className={`flex flex-col items-center justify-center px-4 py-2 min-w-[80px] rounded-md transition-colors ${
                      location.pathname === "/sessions"
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <HistoryIcon className="w-5 h-5" />
                    <span className="text-xs mt-1 font-medium">Session History</span>
                  </Link>
                )}
                {/* My Events */}
                <Link
                  to="/events"
                  className={`flex flex-col items-center justify-center px-4 py-2 min-w-[80px] rounded-md transition-colors ${
                    location.pathname === "/events" || location.pathname.startsWith("/events/")
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  onClick={isLive ? (e) => { e.preventDefault(); setPendingNavTo('/events'); } : undefined}
                >
                  <CalendarIcon className="w-5 h-5" />
                  <span className="text-xs mt-1 font-medium">My Events</span>
                </Link>
                {/* My Profile */}
                <Link
                  to={slug ? `/p/${slug}` : "/me"}
                  className={`flex flex-col items-center justify-center px-4 py-2 min-w-[80px] rounded-md transition-colors ${
                    location.pathname.startsWith("/p/") || location.pathname === "/me"
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  onClick={isLive ? (e) => { e.preventDefault(); setPendingNavTo(slug ? `/p/${slug}` : '/me'); } : undefined}
                >
                  <UserIcon className="w-5 h-5" />
                  <span className="text-xs mt-1 font-medium">My Profile</span>
                </Link>
                {/* Start a Clarity Session CTA - P114: consistent text, no icon */}
                <Link
                  to="/live"
                  title="Start a live clarity session"
                  className="inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                  onClick={() => analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'desktop' })}
                >
                  Start a Clarity Session
                </Link>
                {/* Menu Trigger - P67: Avatar for verified users */}
                <DropdownMenu modal={false} onOpenChange={(open) => {
                  if (open) {
                    analytics.track('nav_menu_opened', {
                      trigger: 'avatar',
                      device: 'desktop',
                    });
                  }
                }}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center justify-center hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md p-2"
                      aria-label="Menu"
                    >
                      <GravatarAvatar
                        name={user.name}
                        avatarColor={user.avatarColor}
                        photoUrl={user.avatarUrl}
                        size="sm"
                        isPledger={hasPledged}
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={8} className="w-48">
                    <NavigationMenuItems onSignOut={handleSignOut} inActiveSession={isLive} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              /* Logged-out: Only Events visible; rest in hamburger dropdown */
              <div className="flex items-center gap-3 transition-opacity duration-150">
                <Link
                  to="/events"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Events
                </Link>
                {/* Start a Clarity Session CTA */}
                {/* Analytics: Keep 'try_meeting' event name for historical continuity (P66 decision) */}
                <Link
                  to="/live"
                  title="Start a live clarity session"
                  className="inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-10 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                  onClick={() => analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'desktop' })}
                >
                  Start a Clarity Session
                </Link>
                {/* Menu Trigger - hamburger for logged-out users */}
                <DropdownMenu modal={false} onOpenChange={(open) => {
                  if (open) {
                    analytics.track('nav_menu_opened', {
                      trigger: 'hamburger',
                      device: 'desktop',
                    });
                  }
                }}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center justify-center hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md p-2"
                      aria-label="Menu"
                    >
                      <MenuIcon className="w-5 h-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={8} className="w-48">
                    <NavigationMenuItems onSignOut={handleSignOut} inActiveSession={isLive} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Mobile Menu Button - P67: Avatar for verified users when closed, X when open */}
          {/* Loading state: skeleton circle to prevent logged-out flash */}
          {(!sessionChecked || isLoading) ? (
            <div className="lg:hidden p-2">
              <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
            </div>
          ) : (
            <button
              onClick={() => {
                const wasOpen = isMobileMenuOpen;
                setIsMobileMenuOpen(!isMobileMenuOpen);
                // Track opening (not closing)
                if (!wasOpen) {
                  analytics.track('nav_menu_opened', {
                    trigger: showUserMenu && user ? 'avatar' : 'hamburger',
                    device: 'mobile',
                  });
                }
              }}
              className="lg:hidden p-2"
              aria-expanded={isMobileMenuOpen}
              aria-controls={MOBILE_MENU_ID}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMobileMenuOpen ? (
                <XIcon className="w-6 h-6" />
              ) : showUserMenu && user ? (
                <GravatarAvatar
                  name={user.name}
                  avatarColor={user.avatarColor}
                  photoUrl={user.avatarUrl}
                  size="sm"
                  isPledger={hasPledged}
                />
              ) : (
                <MenuIcon className="w-6 h-6" />
              )}
            </button>
          )}
        </div>

        {/* Mobile Menu - KISS: Same two-state logic */}
        {isMobileMenuOpen && (
          <div
            id={MOBILE_MENU_ID}
            className="lg:hidden py-4 pb-6 border-t border-border bg-background shadow-lg"
          >
            <div className="flex flex-col gap-3">
              {/* Primary CTA - P114: consistent text */}
              {/* Analytics: Keep 'try_meeting' event name for historical continuity (P66 decision) */}
              <Link
                to="/live"
                title="Start a live clarity session"
                className="inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-11 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold w-full"
                onClick={() => {
                  analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'mobile' });
                  closeMobileMenu();
                }}
              >
                Start a Clarity Session
              </Link>

              <div className="border-t border-border my-2"></div>

              {/* Mobile menu - Events and Create Story removed (available in bottom nav) */}
              {/* All content navigation (Pledgers, Manifesto, Blog, About) now in NavigationMenuItems */}

              {!showUserMenu && <div className="border-t border-border my-2"></div>}

              {/* KISS: Two states only - using shared NavigationMenuItems */}
              <NavigationMenuItems
                variant="mobile"
                onSignOut={handleSignOut}
                onItemClick={closeMobileMenu}
                inActiveSession={isLive}
              />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
