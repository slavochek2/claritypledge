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
import { MenuIcon, XIcon, CalendarIcon, UserIcon, HomeIcon, MicIcon, MailIcon, UsersIcon } from "lucide-react";
import { ClarityLogo } from "@/components/ui/clarity-logo";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { analytics } from "@/lib/mixpanel";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";
import { useUnreadLetterCount } from "@/app/hooks/useUnreadLetterCount";
import { useOpenLiveInvite } from "@/app/hooks/useOpenLiveInvite";
import { usePendingPartnerInvitationCount } from "@/app/hooks/usePendingPartnerInvitationCount";
import { NavigationMenuItems } from "./navigation-menu-items";
import { WEBINAR_REGISTER_URL, WEBINAR_CTA_LABEL } from "@/app/content/webinar";
import { useNextWebinar } from "@/app/hooks/useNextWebinar";

const MOBILE_MENU_ID = "mobile-navigation-menu";

/**
 * Logged-out primary nav CTA. Webinar-first funnel (P937/P951): every public page
 * mirrors the main landing's action — register for the free webinar — so the CTA is
 * consistent across "/", "/pricing", "/pledgers", "/manifesto", "/about", etc. The
 * single exception is "/coach", which serves a different audience and keeps "Try a
 * Clarity Letter" (P856). Shared by the desktop and mobile menus so the two never drift.
 */
function LoggedOutPrimaryCta({
  device,
  sizeClass,
  onNavigate,
}: {
  device: "desktop" | "mobile";
  sizeClass: string;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const { nextEvent } = useNextWebinar();
  const className = `inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold gap-2 ${sizeClass}`;

  // Letter CTA when EITHER: (P856) /coach serves a different audience and keeps the
  // product-trial CTA, OR (P969) there is no upcoming Clarity Experiment to join — in
  // which case promising "the next Clarity Experiment" is a broken promise, so the header
  // mirrors the landing hero and degrades to "Try a Clarity Letter". `nextEvent` comes from
  // the shared useNextWebinar fetch the hero also reads, so the two never disagree mid-load
  // (null while loading → letter, matching the hero's default).
  if (pathname === "/coach" || !nextEvent) {
    return (
      <Link
        to="/letter/ck"
        title="Try a Clarity Letter"
        className={className}
        onClick={() => {
          analytics.track("nav_cta_clicked", { cta: "try_letter", device });
          onNavigate?.();
        }}
      >
        <MailIcon className="w-4 h-4" />
        Try a Clarity Letter
      </Link>
    );
  }

  // P937/P951: default for every other public page — register for the free webinar.
  const onClick = () => {
    analytics.track("nav_cta_clicked", { cta: "webinar_register", device });
    onNavigate?.();
  };
  return WEBINAR_REGISTER_URL.startsWith("/") ? (
    <Link to={WEBINAR_REGISTER_URL} title={WEBINAR_CTA_LABEL} className={className} onClick={onClick}>
      {WEBINAR_CTA_LABEL}
    </Link>
  ) : (
    <a
      href={WEBINAR_REGISTER_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={WEBINAR_CTA_LABEL}
      className={className}
      onClick={onClick}
    >
      {WEBINAR_CTA_LABEL}
    </a>
  );
}

export function SimpleNavigation({ compact, logoOnly }: { compact?: boolean; logoOnly?: boolean }) {
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
    hasSession,
  } = useNavAuthState();
  const { count: unreadLetterCount } = useUnreadLetterCount();
  const { invite } = useOpenLiveInvite();
  const lettersBadgeCount = unreadLetterCount + (invite ? 1 : 0);
  // P885: badge count for the Partners nav entry (incoming pending invitations)
  const { count: partnerInviteCount } = usePendingPartnerInvitationCount();

  // P844: Hide the "Start a Clarity Session" CTA on event detail pages so it doesn't compete with the RSVP primary action.
  // Match: exactly one segment after `/events/` and not the reserved `new` / `list` aliases.
  // Show CTA on: `/events`, `/events/new`, `/events/list`, `/events/:slug/confirm`, `/events/:slug/edit`, and all non-event routes.
  const isEventDetailPage = (() => {
    const segments = location.pathname.split('/').filter(Boolean);
    return (
      segments.length === 2 &&
      segments[0] === 'events' &&
      segments[1] !== 'new' &&
      segments[1] !== 'list' &&
      segments[1] !== 'webinar' &&
      segments[1] !== 'experiment' // P957: canonical registration redirect, not an event detail
    );
  })();
  // Close mobile menu on route change (e.g., bottom nav, back button, page links)
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

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

  // Static routes — no profile data needed, safe to render during profile loading phase.
  // P885: Partners needs the resolved slug, so it only renders when `partnersSlug`
  // is passed (Phase 3a). During profile loading (Phase 2) the slot is omitted.
  const StaticNavLinks = ({ partnersSlug }: { partnersSlug?: string | null } = {}) => (
    <>
      <Link
        to="/feed"
        className={`flex flex-col items-center justify-center px-4 py-2 min-w-[80px] rounded-md transition-colors ${
          location.pathname === "/feed"
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        <HomeIcon className="w-5 h-5" />
        <span className="text-xs mt-1 font-medium">Home</span>
      </Link>
      <Link
        to="/letters"
        className={`flex flex-col items-center justify-center px-4 py-2 min-w-[80px] rounded-md transition-colors ${
          location.pathname.startsWith("/letters")
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        <span className="relative">
          <MailIcon className="w-5 h-5" />
          {lettersBadgeCount > 0 && (
            <span
              data-badge
              className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 text-[10px] font-bold leading-4 text-white bg-blue-500 rounded-full text-center"
            >
              {lettersBadgeCount > 99 ? '99+' : lettersBadgeCount}
            </span>
          )}
        </span>
        <span className="text-xs mt-1 font-medium">Letters</span>
      </Link>
      {partnersSlug && (
        <Link
          to={`/p/${partnersSlug}/partners`}
          className={`flex flex-col items-center justify-center px-4 py-2 min-w-[80px] rounded-md transition-colors ${
            location.pathname === `/p/${partnersSlug}/partners`
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <span className="relative">
            <UsersIcon className="w-5 h-5" />
            {partnerInviteCount > 0 && (
              <span
                data-badge
                className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 text-[10px] font-bold leading-4 text-white bg-blue-500 rounded-full text-center"
              >
                {partnerInviteCount > 99 ? '99+' : partnerInviteCount}
              </span>
            )}
          </span>
          <span className="text-xs mt-1 font-medium">Partners</span>
        </Link>
      )}
      <Link
        to="/events"
        className={`flex flex-col items-center justify-center px-4 py-2 min-w-[80px] rounded-md transition-colors ${
          location.pathname === "/events" || location.pathname.startsWith("/events/")
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        <CalendarIcon className="w-5 h-5" />
        <span className="text-xs mt-1 font-medium">Events</span>
      </Link>
    </>
  );

  if (logoOnly) {
    return (
      <nav
        className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm pt-[env(safe-area-inset-top)]"
      >
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center h-16 lg:h-20">
            <Link to="/" state={{ fromLogo: true }} className="hover:opacity-80 transition-opacity shrink-0">
              <ClarityLogo size="sm" iconOnly className="lg:hidden" />
              <ClarityLogo size="sm" className="hidden lg:inline-flex" />
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  // P956: pt-[env(safe-area-inset-top)] on the nav lets its background cover the
  // iOS status-bar inset (active once viewport-fit=cover is set) so the nav row
  // sits below the notch instead of under it. Resolves to 0 on Android/desktop.
  return (
    <nav
      data-nav="main"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 pt-[env(safe-area-inset-top)] ${
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
            state={{ fromLogo: true }}
            className="hover:opacity-80 transition-opacity shrink-0"
            onClick={(e) => {
              if (location.pathname === "/") {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
          >
            {/* Mobile: icon only to prevent text wrapping in cramped header */}
            <ClarityLogo size="sm" iconOnly className="lg:hidden" />
            <ClarityLogo size="sm" className="hidden lg:inline-flex" />
          </Link>

          {/* Desktop: Nav links + CTA + Menu */}
          <div className="hidden lg:flex items-center gap-3">
            {/* P113: Show icon nav for logged-in users, text links for logged-out */}
            {/* P695: Three-phase gate — full skeleton → static links + profile skeleton → full nav */}
            {!sessionChecked ? (
              /* Phase 1: session check in flight (~10ms) — full skeleton to prevent logged-out flash */
              compact ? (
                <div className="h-9 w-9 bg-muted rounded-full animate-pulse" />
              ) : (
                <>
                  <div className="animate-pulse flex items-center gap-3 transition-opacity duration-150">
                    <div className="h-10 w-[88px] bg-muted rounded-md" />
                    <div className="h-10 w-[80px] bg-muted rounded-md" />
                    <div className="h-10 w-[80px] bg-muted rounded-md" />
                  </div>
                  {/* P844: Hide Start-a-Session CTA on event detail pages (competing primary action) */}
                  {!isEventDetailPage && (
                    <Link
                      to="/live"
                      title="Start a live clarity session"
                      className="inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold gap-2"
                      onClick={(e) => {
                        analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'desktop' });
                        if (location.pathname.startsWith('/live')) {
                          e.preventDefault();
                          navigate('/live', { replace: true });
                          window.location.reload();
                        }
                      }}
                    >
                      <MicIcon className="w-4 h-4" />
                      Start a Clarity Session
                    </Link>
                  )}
                  {/* Avatar/hamburger skeleton */}
                  <div className="h-9 w-9 bg-muted rounded-full animate-pulse" />
                </>
              )
            ) : hasSession && isLoading ? (
              /* Phase 2: session known, profile fetching (100-500ms) — static links clickable */
              compact ? (
                <div className="h-9 w-9 bg-muted rounded-full animate-pulse" />
              ) : (
                <div className="flex items-center gap-3 transition-opacity duration-150">
                  <StaticNavLinks />
                  {/* My Profile slot: skeleton until profile resolves */}
                  <div className="h-10 w-[88px] bg-muted rounded-md animate-pulse" />
                  {/* P844: Hide Start-a-Session CTA on event detail pages */}
                  {!isEventDetailPage && (
                    <Link
                      to="/live"
                      title="Start a live clarity session"
                      className="inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold gap-2"
                      onClick={(e) => {
                        analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'desktop' });
                        if (location.pathname.startsWith('/live')) {
                          e.preventDefault();
                          navigate('/live', { replace: true });
                          window.location.reload();
                        }
                      }}
                    >
                      <MicIcon className="w-4 h-4" />
                      Start a Clarity Session
                    </Link>
                  )}
                  {/* Avatar skeleton */}
                  <div className="h-9 w-9 bg-muted rounded-full animate-pulse" />
                </div>
              )
            ) : showUserMenu ? (
              /* Phase 3a: Logged-in: Icon nav with labels (LinkedIn-style) */
              <div className="flex items-center gap-3 transition-opacity duration-150">
                {!compact && <StaticNavLinks partnersSlug={slug} />}
                {/* My Profile — /p/:slug/partners belongs to the Partners entry (P885), so exclude it here */}
                {!compact && (
                  <Link
                    to={slug ? `/p/${slug}` : "/me"}
                    className={`flex flex-col items-center justify-center px-4 py-2 min-w-[80px] rounded-md transition-colors ${
                      (location.pathname.startsWith("/p/") && !location.pathname.endsWith("/partners")) || location.pathname === "/me"
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <UserIcon className="w-5 h-5" />
                    <span className="text-xs mt-1 font-medium">My Profile</span>
                  </Link>
                )}
                {/* P844: Hide Start-a-Session CTA on event detail pages */}
                {!compact && !isEventDetailPage && (
                  <Link
                    to="/live"
                    title="Start a live clarity session"
                    className="inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-10 rounded-md px-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold gap-2"
                    onClick={(e) => {
                      analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'desktop' });
                      if (location.pathname.startsWith('/live')) {
                        e.preventDefault();
                        navigate('/live', { replace: true });
                        window.location.reload();
                      }
                    }}
                  >
                    <MicIcon className="w-4 h-4" />
                    Start a Clarity Session
                  </Link>
                )}
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
                    <NavigationMenuItems onSignOut={handleSignOut} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : compact ? null : (
              /* Phase 3b: Logged-out (or unverified): Only Events visible; rest in hamburger dropdown */
              <div className="flex items-center gap-3 transition-opacity duration-150">
                {location.pathname === "/coach" ? (
                  <Link
                    to="/"
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    For founders
                  </Link>
                ) : (
                  <Link
                    to="/coach"
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    For coaches
                  </Link>
                )}
                <Link
                  to="/program"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Co-founder Program
                </Link>
                {/* P844: Hide CTA on event detail pages */}
                {/* P916: route-aware logged-out CTA — Apply on "/", Try a Clarity Letter elsewhere */}
                {!isEventDetailPage && (
                  <LoggedOutPrimaryCta device="desktop" sizeClass="h-10" />
                )}
                {/* Secondary action — visible Log in right of the main CTA (Airtable
                    pattern); removed from the desktop dropdown to avoid duplication */}
                <Link
                  to="/login"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Log in
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
                    {/* P856: Log in is a visible header link here — hide the dropdown item */}
                    <NavigationMenuItems onSignOut={handleSignOut} hideLoginItem />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Mobile: Start Session button + Menu Button */}
          {/* P695: Two-phase gate — full skeleton (unknown auth) → hamburger available (profile loading) */}
          {!sessionChecked ? (
            /* Phase 1: session check in flight — skeleton to prevent logged-out flash */
            <div className="lg:hidden p-2">
              <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
            </div>
          ) : (
            <div className="lg:hidden flex items-center gap-2">
              {/* Mobile Start Session CTA — only for authenticated users, hidden in compact mode */}
              {/* P844: Hide on event detail pages (competing primary action) */}
              {showUserMenu && !compact && !isEventDetailPage && (
                <Link
                  to="/live"
                  title="Start a live clarity session"
                  className="inline-flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-full px-4 py-2"
                  onClick={(e) => {
                    analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'mobile' });
                    if (location.pathname.startsWith('/live')) {
                      e.preventDefault();
                      navigate('/live', { replace: true });
                      window.location.reload();
                    }
                  }}
                >
                  <MicIcon className="w-3.5 h-3.5" />
                  Start a Session
                </Link>
              )}
              {/* Avatar (logged in) or hamburger (logged out) — hide hamburger in compact mode */}
              {(showUserMenu || !compact) && (
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
                  className="p-2"
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
          )}
        </div>

        {/* Mobile Menu - KISS: Same two-state logic */}
        {isMobileMenuOpen && (
          <div
            id={MOBILE_MENU_ID}
            className="lg:hidden py-4 pb-6 border-t border-border bg-background shadow-lg"
          >
            <div className="flex flex-col gap-3">
              {/* Primary CTA — hidden in compact mode */}
              {/* Analytics: Keep 'try_meeting' event name for historical continuity (P66 decision) */}
              {!compact && (
                <>
                  {showUserMenu ? (
                    <Link
                      to="/live"
                      title="Start a live clarity session"
                      className="inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow h-11 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold w-full gap-2"
                      onClick={(e) => {
                        analytics.track('nav_cta_clicked', { cta: 'try_meeting', device: 'mobile' });
                        if (location.pathname.startsWith('/live')) {
                          e.preventDefault();
                          navigate('/live', { replace: true });
                          window.location.reload();
                        } else {
                          closeMobileMenu();
                        }
                      }}
                    >
                      <MicIcon className="w-4 h-4" />
                      Start a Clarity Session
                    </Link>
                  ) : (
                    /* P916: route-aware logged-out CTA — Apply on "/", Try a Clarity Letter elsewhere */
                    <LoggedOutPrimaryCta device="mobile" sizeClass="h-11 w-full" onNavigate={closeMobileMenu} />
                  )}
                  <div className="border-t border-border my-2"></div>
                </>
              )}

              {/* Mobile menu - Events and Create Story removed (available in bottom nav) */}
              {/* All content navigation (Pledgers, Manifesto, Blog, About) now in NavigationMenuItems */}

              {!showUserMenu && <div className="border-t border-border my-2"></div>}

              {/* KISS: Two states only - using shared NavigationMenuItems */}
              <NavigationMenuItems
                variant="mobile"
                onSignOut={handleSignOut}
                onItemClick={closeMobileMenu}
              />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
