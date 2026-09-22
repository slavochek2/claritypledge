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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuIcon, XIcon, CalendarIcon, LandmarkIcon, UserIcon, HomeIcon, MailIcon, CalendarCheckIcon, UsersIcon, ChevronDownIcon } from "lucide-react";
import { ClarityLogo } from "@/components/ui/clarity-logo";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
// P1179/P1323: the Links trigger. Renders as a sibling of the avatar in EVERY right-hand group
// so it holds the same position at every width. It returns null when the layout's `surface` is
// not `product` (no provider), or when a page has adopted/declined it (useLinksTriggerOverride).
import { EventLinksButton } from "@/app/components/layout/event-links-menu";
import { analytics } from "@/lib/mixpanel";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";
import { useUnreadLetterCount } from "@/app/hooks/useUnreadLetterCount";
import { useOpenLiveInvite } from "@/app/hooks/useOpenLiveInvite";
import { usePendingPartnerInvitationCount } from "@/app/hooks/usePendingPartnerInvitationCount";
import { NavigationMenuItems } from "./navigation-menu-items";
import { AUDIENCE_LINKS, EVENTS_NAV_TO, isEventsNavActive } from "./nav-links";
import { WEBINAR_REGISTER_URL, WEBINAR_CTA_LABEL } from "@/app/content/webinar";
import { useNextWebinar } from "@/app/hooks/useNextWebinar";
import { useTonightsEvent } from "@/app/hooks/useTonightsEvent";

const MOBILE_MENU_ID = "mobile-navigation-menu";

/**
 * P1351: the signed-in header's primary action on an event day. Renders null when the person
 * has no (non-cancelled) RSVP for an event today, and on that event's own pages — the page
 * already is where the button would go, and a second primary would compete with it (P955).
 */
function TonightsEventCta({ device }: { device: "desktop" | "mobile" }) {
  const event = useTonightsEvent();
  const { pathname } = useLocation();
  if (!event) return null;
  const eventPath = `/events/${event.slug}`;
  if (pathname === eventPath || pathname.startsWith(`${eventPath}/`)) return null;
  // Mobile, below 360px: icon-only 40x40 (the P1323 precedent for the old session button).
  // Measured by e2e/p1351-header-contexts: with the label, logo + this + Tools + avatar pushed
  // the avatar to 357px on a 320px screen. The label stays the accessible name via sr-only.
  const size = device === "desktop" ? "h-10 px-6" : "h-10 w-10 min-[360px]:w-auto min-[360px]:px-4";
  return (
    <Link
      to={eventPath}
      title={event.title}
      data-testid="tonights-event-cta"
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-blue-500 text-sm font-semibold text-white shadow transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${size}`}
      onClick={() => analytics.track("nav_cta_clicked", { cta: "tonights_event", device })}
    >
      <CalendarCheckIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className={device === "mobile" ? "sr-only min-[360px]:not-sr-only min-[360px]:whitespace-nowrap" : undefined}>
        Tonight&apos;s event
      </span>
    </Link>
  );
}

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

  // Which landing's action does this page mirror? (P987) There are now three public
  // landings with three different offers, so "the main landing" above is no longer a
  // single thing: "/" sells the alignment audit, "/coach" the letter (P856), "/founder"
  // the co-founder program behind the webinar funnel. Mirror the page you are ON.
  const onCoach = pathname === "/coach";
  const onFounder = pathname === "/founder";

  // (P856) /coach keeps the product-trial CTA. (P987 + P969) /founder's own hero is
  // old-landing-2's WebinarCta, which degrades to the letter when no Clarity Experiment
  // is upcoming — mirror that, or the nav offers the key-hire audit on a page selling the
  // co-founder program.
  if (onCoach || (onFounder && !nextEvent)) {
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

  // (P987) Every page other than /coach and /founder mirrors "/" → the alignment audit.
  // NOT event-aware, deliberately: P987 removed the webinar CTA from "/" entirely, so
  // there is no webinar promise left to keep or break here. The P969 guarantee (never
  // promise a Clarity Experiment that does not exist) holds a fortiori — these pages now
  // never promise one at all. P969's event-aware fallback still lives on /founder above,
  // which is the only landing still running the webinar funnel.
  if (!onFounder) {
    return (
      <Link
        to="/intro"
        title="Book a free alignment audit"
        className={className}
        onClick={() => {
          analytics.track("nav_cta_clicked", { cta: "book_audit", device });
          onNavigate?.();
        }}
      >
        <CalendarIcon className="w-4 h-4" />
        Book a free alignment audit
      </Link>
    );
  }

  // P937/P951: /founder with an upcoming Clarity Experiment — mirror its hero's webinar CTA.
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

/**
 * The four audience landings, collapsed behind one "Use cases" trigger (P1087).
 *
 * Before this, all four sat flat in the header AND self-filtered — the page you were on
 * was the one page missing from the list. The founder named the defect: "if I'm on one of
 * the pages, it's not really listed... it's a bit weird to always switch." Two consequences
 * fixed here: the header stops spending four slots on a switcher (leaving room for the
 * Pricing link beside it), and NOTHING is filtered out any more, so the set is the same
 * from every page and the one you are on is marked rather than removed.
 *
 * Removing the self-filter is strictly safer than the old rule, not just tidier: filtering
 * is what stranded /founder under P916's two-way toggle. A menu that always lists every
 * destination cannot strand any of them.
 */
function UseCasesMenu({ pathname }: { pathname: string }) {
  const onUseCase = AUDIENCE_LINKS.some((a) => a.to === pathname);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-center gap-1 -mx-2 px-2 py-1 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md ${
          onUseCase ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Use cases
        <ChevronDownIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-56">
        {AUDIENCE_LINKS.map((a) => {
          const active = a.to === pathname;
          return (
            <DropdownMenuItem key={a.to} asChild>
              <Link
                to={a.to}
                aria-current={active ? "page" : undefined}
                className={`cursor-pointer ${active ? "font-semibold text-foreground" : ""}`}
              >
                <a.Icon className="mr-2 h-4 w-4 shrink-0" />
                {a.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * DOM id of the nav's out-of-flow centre slot. A page portals a control into this
 * node to place it in the nav row; see `meeting-terms-page.tsx`.
 */
export const NAV_CENTER_SLOT_ID = "nav-center-slot";

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
  // P1087: same reasoning as P844 above, applied to the pricing page. The nav's blue "Book
  // a free alignment audit" is a second, equally loud primary sitting directly above a page
  // whose whole job is the €295 buy button — and it routes to a FREE call, so it undercuts
  // the paid action it competes with. The page's own CTAs are the only actions offered here.
  const isPricingPage = ["/program", "/pricing", "/offers"].includes(location.pathname);

  // TWO flags, not one. An earlier P1087 revision used a single flag for both CTAs, which
  // suppressed the logged-IN "Start a Clarity Session" button on /pricing as well —
  // and the bottom nav carries no /live entry, so a signed-in user on that page had NO
  // route to the core product from anywhere in the chrome (adversarial review, P1087).
  //
  // The two CTAs are different things and only one of them was ever the problem:
  //   · the MARKETING cta offers a free call — a rival offer to the page's paid one, and
  //     the only thing the founder pointed at. Hidden on pricing AND on event detail.
  //   · the SESSION cta is product navigation, not an offer. It stays hidden on event
  //     detail (P844: it competes with RSVP there) but returns on pricing.
  // Matches the whole /groups/:slug SUBTREE, join page included — deliberate, and
  // wider than "detail page" reads. The group page carries its own CTAs (Join /
  // Manage membership in the header, Join this group at the foot of About) and the
  // join page is a commitment gate, so a free-call offer is a rival on both.
  // The MARKETING cta is suppressed
  // here for the P1087 reason: it offers a free call, a rival offer beside the
  // page's own ask, and it is what a logged-out invite recipient sees.
  //
  // The SESSION cta deliberately is NOT — a first revision hid both and an
  // adversarial review caught it. It re-created exactly the defect the two-flag
  // split above exists to prevent: the bottom nav carries no /live entry
  // (bottom-nav.tsx), so hiding it leaves a signed-in user with NO route to the
  // core product from anywhere in the chrome — on what is now the app's primary
  // events surface, since /events redirects into a group page. A membership button
  // and a session button are not the same offer, so nothing is being overridden.
  // The /groups index is untouched: a directory with no competing action.
  const isGroupDetailPage = location.pathname.split('/').filter(Boolean).length >= 2
    && location.pathname.startsWith('/groups/');
  const hideMarketingCta = isEventDetailPage || isPricingPage || isGroupDetailPage;
  // P1351: `hideSessionCta` is retired with the session button itself. The header's only
  // signed-in primary is now TonightsEventCta, which hides itself on its own event's pages.

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
        to={EVENTS_NAV_TO}
        className={`flex flex-col items-center justify-center px-4 py-2 min-w-[80px] rounded-md transition-colors ${
          isEventsNavActive(location.pathname)
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
        onClick={() => analytics.track('org_events_nav_clicked', { source: 'desktop_top_nav' })}
      >
        <LandmarkIcon className="w-5 h-5" />
        {/* P1193: hardcoded rather than read from nav-links, because this desktop
            top-nav link is hand-written (icon above label) while the menus map over
            PUBLIC_NAV_GROUPS. Keep it in step with the "Groups" label there — the
            p1193 source contract asserts no "Events" label survives in this folder. */}
        <span className="text-xs mt-1 font-medium">Groups</span>
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
            <Link to="/" state={{ fromLogo: true }} className="hover:opacity-80 transition-opacity shrink-0" aria-label="ClarityPledge">
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
    // P1179: ONE provider, and EventLinksButton is mounted in BOTH right-hand groups
    // (mounting the whole menu in both gave two independent instances).
    // P1323 MOVED the provider UP, to ClarityLandingLayoutInner. It used to wrap this
    // <nav> only, which put the page's children OUTSIDE it — so a page with its own
    // sticky header had no way to render the trigger in its own chrome without a portal.
    // With the provider above both, a bespoke-header page calls useLinksTriggerOverride
    // and mounts its own trigger with the page owner, and the nav's instances stand down.
    // (The JSX for that is deliberately NOT written out here, and neither is the element
    // syntax around the component name: p1179-nav-containment scans this file as source
    // text and counts every EventLinksButton ELEMENT it finds, comments included. A worked
    // example in a comment is indistinguishable from a real mount and breaks the count.
    // Measured twice: once with a real prop list, once with an ellipsis standing in for
    // one — the regex does not care which.)
    // Whether the provider exists at all is decided by the layout's `surface` prop; these
    // buttons render null with no context, exactly as they did off a Links route before.
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
            // P1227: the wordmark is display:none below lg, so the mobile link had no name.
            aria-label="ClarityPledge"
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

          {/* P1016: an out-of-flow slot a page can portal a control into — used by
              /terms to put its level track in the nav row instead of on a second row
              below it. ABSOLUTELY POSITIONED on purpose: it takes no part in this
              row's flex layout, so on every page that portals nothing (all of them
              but /terms) its presence cannot shift the logo or the right-hand group.
              The horizontal padding keeps portaled content clear of both.

              P1114 note: this slot's own padding is tuned against /terms's usual
              anonymous visitor (a bare hamburger on the right). The room's
              /events/:slug/meet portals the same track for an always-signed-in
              visitor, whose right-hand control is a wider GravatarAvatar chip — at
              320px the track's own nowrap labels are wider than any padding
              redistribution here can clear (their min-content width alone exceeds
              the slot's total available space once logo+avatar clearance is
              reserved). Fixed on the CONSUMER side instead (EventRoomMeet.tsx hides
              its portal below 375px) rather than changing this shared slot's
              padding, which does not by itself solve the narrowest case and would
              only add unnecessary risk to /terms's unrelated anonymous rendering. */}
          <div
            id={NAV_CENTER_SLOT_ID}
            className="pointer-events-none absolute inset-y-0 left-1/2 flex w-full max-w-lg -translate-x-1/2 items-center px-14 lg:px-0 [&>*]:pointer-events-auto [&>*]:w-full"
          />

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
                {/* P1351: the session button is gone from the header (it lives in Tools). The only
                    blue button a signed-in person sees here is their event, on its day. */}
                {!compact && <TonightsEventCta device="desktop" />}
                {/* P1179: Links — sibling of the avatar, same slot at every width.
                    Desktop gets the anchored dropdown, matching "Use cases"; the
                    bottom sheet is the phone-in-a-room shape and stays below `lg`. */}
                <EventLinksButton variant="dropdown" />
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
                      className="flex items-center justify-center hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md p-2"
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
            ) : compact ? (
              /* Compact + logged out: the marketing chrome is deliberately gone, but the
                 Links menu is page chrome, not marketing — /ready and /meet are handed to
                 people who are not signed in, and the desktop dropdown lives only in this
                 branch (the mobile group below already renders it for both states). It
                 returns null off a Links route, so this stays empty everywhere else. */
              <div className="flex items-center gap-3">
                <EventLinksButton variant="dropdown" />
              </div>
            ) : (
              /* Phase 3b: Logged-out (or unverified): Only Events visible; rest in hamburger dropdown */
              <div className="flex items-center gap-3 transition-opacity duration-150">
                {/* P1323: this branch had NO Links trigger. It was invisible while the menu
                    was gated on a room-shaped path predicate — no route reaching this
                    branch ever satisfied it. Under `surface` the hole is live: a
                    SIGNED-OUT visitor at DESKTOP width on a product route that is not
                    rendered `compact` would get no trigger, while the same person at phone
                    width does. That is an I-1 violation ("reachable at every width") and
                    AC-1/AC-2 both pass without touching it, because /stake/:tag and
                    /transcribe/:code reach the other three branches. AC-17 covers it. */}
                <EventLinksButton variant="dropdown" />
                <UseCasesMenu pathname={location.pathname} />
                <Link
                  to="/pricing"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Pricing
                </Link>
                {/* P844: Hide CTA on event detail pages */}
                {/* P916: route-aware logged-out CTA — Apply on "/", Try a Clarity Letter elsewhere */}
                {!hideMarketingCta && (
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
                      className="flex items-center justify-center hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md p-2"
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
              {/* P1351: no session CTA; the event-day primary only. */}
              {showUserMenu && !compact && <TonightsEventCta device="mobile" />}
              {/* P1179: Links — sibling of the avatar, same slot at every width */}
              <EventLinksButton />
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
            /* P1310: `mobile-nav-panel` (index.css) caps the panel against the
               viewport and scrolls it. Without it the panel is 872px tall on a
               667px phone and the last six entries — Log In among them — cannot
               be reached at all, because the nav above is `position: fixed` and
               page scroll never moves the panel. */
            className="mobile-nav-panel lg:hidden py-4 pb-6 border-t border-border bg-background shadow-lg"
          >
            <div className="flex flex-col gap-3">
              {/* Primary CTA — hidden in compact mode, and on the pricing page for the same
                  reason the desktop one is (P1087): this is the FIRST thing in the mobile
                  sandwich, so a free-call CTA sits above every link on a page selling
                  €295/month. The desktop guard alone left it standing here. */}
              {/* Analytics: Keep 'try_meeting' event name for historical continuity (P66 decision) */}
              {/* P1351: signed-in users get no session entry here (Tools is in the header row). */}
              {!compact && !showUserMenu && !hideMarketingCta && (
                <>
                    /* P916: route-aware logged-out CTA — Apply on "/", Try a Clarity Letter elsewhere */
                    <LoggedOutPrimaryCta device="mobile" sizeClass="h-11 w-full" onNavigate={closeMobileMenu} />
                  <div className="border-t border-border my-2"></div>
                </>
              )}

              {/* Mobile menu - Events and Create Story removed (available in bottom nav) */}
              {/* All content navigation (Pledgers, Manifesto, Blog, About) now in NavigationMenuItems */}

              {/* P1310: a second separator used to render here for the logged-out case.
                  Its condition (`!showUserMenu && !compact && !hideMarketingCta`) is a
                  strict subset of the CTA block's above, which already ends in a
                  separator — so it could only ever draw a SECOND rule directly under the
                  first one, never a lone rule where none existed. Visible as a doubled
                  line under the blue button in the founder's 375px screenshot. The P1087
                  concern it was written for (no stranded rule when the CTA is hidden) is
                  satisfied by the CTA block owning its own separator. */}

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
