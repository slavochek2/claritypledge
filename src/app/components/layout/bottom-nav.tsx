/**
 * @file bottom-nav.tsx
 * @description Mobile bottom navigation for logged-in users
 *
 * P113 Phase 2: Shows fixed bottom nav on mobile for verified users.
 * Uses design system tokens only.
 */
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CalendarIcon, UserIcon, MailIcon, HomeIcon, UsersIcon } from "lucide-react";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";
import { useLiveSession } from "@/app/contexts/live-session-context";
import { useUnreadLetterCount } from "@/app/hooks/useUnreadLetterCount";
import { useOpenLiveInvite } from "@/app/hooks/useOpenLiveInvite";
import { usePendingPartnerInvitationCount } from "@/app/hooks/usePendingPartnerInvitationCount";
import { EVENTS_NAV_TO, isEventsNavActive } from "./nav-links";

interface NavItem {
  icon: typeof CalendarIcon;
  label: string;
  to?: string;
  disabled?: boolean;
  onClick?: () => void;
  badge?: number; // count shown as a blue pill on the icon; hidden when 0
  badgeNoun?: string; // aria-label suffix, e.g. "unread" → "Letters, 3 unread"
}

export function BottomNav() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { showUserMenu, slug } = useNavAuthState();
  const { isLive } = useLiveSession();
  const { count: unreadLetterCount } = useUnreadLetterCount();
  const { invite } = useOpenLiveInvite();
  const { count: partnerInviteCount } = usePendingPartnerInvitationCount();

  // Only show for logged-in users
  if (!showUserMenu) {
    return null;
  }

  // P588: Hide during active live sessions (context-based, not route-based).
  // isLive is true when view='live' && !sessionEnded && !partnerLeft.
  // Lobby (/live), join form, session ended → isLive=false → BottomNav shows.
  if (isLive) {
    return null;
  }

  // Hide on creation/focus pages — these use FocusHeader instead.
  // Content pages (/story/, /point/) keep bottom nav for navigation.
  // P932: a completed letter (?done=1) leaves immersive mode — restore the bottom nav
  // so the receiver can be directed onward. Only the /letter/ reading route is exempted;
  // other focus routes (and letter results/overview, which don't set ?done) stay hidden.
  const letterDone = searchParams.get('done') === '1';
  const focusRoutes = ['/agreements/', '/create', '/letter/', '/letters/drafts/', '/explain-back/', '/me/calibration'];
  // /org/:slug is a browse page, but /org/:slug/join (the terms gate) is a focus
  // page — a prefix entry can't express that, so it gets its own exact pattern.
  // P1016/P1024: /meet (formerly /terms) carries its own sticky action bar, which the
  // bottom nav would sit on top of. Kept as an EXACT pattern — the old '/terms' entry
  // needed one to avoid swallowing /terms-of-service, and exactness is still correct
  // here: nothing else lives under /meet.
  const onFocusRoute = focusRoutes.some(r => location.pathname.startsWith(r))
    || /^\/org\/[^/]+\/join\/?$/.test(location.pathname)
    || /^\/meet\/?$/.test(location.pathname);
  const completedLetterReading = letterDone && location.pathname.startsWith('/letter/');
  if (onFocusRoute && !completedLetterReading) {
    return null;
  }

  const navItems: NavItem[] = [
    {
      icon: HomeIcon,
      label: "Home",
      to: "/feed",
    },
    {
      icon: MailIcon,
      label: "Letters",
      to: "/letters",
      badge: unreadLetterCount + (invite ? 1 : 0),
      badgeNoun: "unread",
    },
    // P885: Partners needs the user's slug for its link target — omit the item
    // (rather than render a broken link) in the rare case slug is missing.
    ...(slug
      ? [{
          icon: UsersIcon,
          label: "Partners",
          to: `/p/${slug}/partners`,
          badge: partnerInviteCount,
          badgeNoun: partnerInviteCount === 1 ? "pending invitation" : "pending invitations",
        }]
      : []),
    {
      icon: CalendarIcon,
      label: "Events",
      to: EVENTS_NAV_TO,
    },
    {
      icon: UserIcon,
      label: "My Profile",
      to: slug ? `/p/${slug}` : "/me",
    },
  ];

  const isActive = (to: string | undefined) => {
    if (!to) return false;
    if (to === "/feed") return location.pathname === "/feed";
    if (to === EVENTS_NAV_TO) return isEventsNavActive(location.pathname);
    if (to === "/letters") return location.pathname.startsWith("/letters");
    if (to === "/sessions") return location.pathname === "/sessions";
    return location.pathname === to;
  };

  return (
    <nav
      data-nav="bottom"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);

          if (item.disabled) {
            return (
              <button
                key={item.label}
                onClick={item.onClick}
                className="flex flex-col items-center justify-center gap-1 flex-1 py-2 text-muted-foreground opacity-50"
                aria-label={`${item.label} (coming soon)`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          }

          const itemClass = `flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors ${
            active ? "text-blue-500" : "text-muted-foreground hover:text-foreground"
          }`;
          const badgeCount = item.badge ?? 0;
          const showBadge = badgeCount > 0;
          const itemInner = (
            <>
              <span className="relative">
                <Icon className={`w-5 h-5 transition-all ${active ? "stroke-[2.5px]" : "stroke-[1.5px]"}`} />
                {showBadge && (
                  <span
                    data-badge
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 text-[10px] font-bold leading-4 text-white bg-blue-500 rounded-full text-center"
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </span>
              <span className={`text-xs leading-none transition-all ${active ? "font-semibold" : "font-normal"}`}>{item.label}</span>
              <div className={`w-1 h-1 rounded-full mt-0.5 transition-colors ${active ? "bg-blue-500" : "bg-transparent"}`} />
            </>
          );

          if (!item.to) return null; // Non-disabled items always have `to`; guard satisfies TS
          const ariaLabel = showBadge ? `${item.label}, ${badgeCount} ${item.badgeNoun ?? "unread"}` : undefined;
          return (
            <Link
              key={item.label}
              to={item.to}
              className={itemClass}
              aria-current={active ? "page" : undefined}
              aria-label={ariaLabel}
            >
              {itemInner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
