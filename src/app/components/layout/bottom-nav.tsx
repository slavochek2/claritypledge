/**
 * @file bottom-nav.tsx
 * @description Mobile bottom navigation for logged-in users
 *
 * P113 Phase 2: Shows fixed bottom nav on mobile for verified users.
 * Uses design system tokens only.
 */
import { Link, useLocation } from "react-router-dom";
import { CalendarIcon, UserIcon, MailIcon, HomeIcon } from "lucide-react";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";
import { useLiveSession } from "@/app/contexts/live-session-context";
import { useUnreadLetterCount } from "@/app/hooks/useUnreadLetterCount";

interface NavItem {
  icon: typeof CalendarIcon;
  label: string;
  to?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export function BottomNav() {
  const location = useLocation();
  const { showUserMenu, slug } = useNavAuthState();
  const { isLive } = useLiveSession();
  const { count: unreadLetterCount } = useUnreadLetterCount();

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
  const focusRoutes = ['/agreements/', '/create', '/letter/', '/letters/drafts/'];
  if (focusRoutes.some(r => location.pathname.startsWith(r))) {
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
    },
    {
      icon: CalendarIcon,
      label: "Events",
      to: "/events",
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
    if (to === "/events") return location.pathname === "/events" || location.pathname.startsWith("/events/");
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
          const showBadge = item.to === "/letters" && unreadLetterCount > 0;
          const itemInner = (
            <>
              <span className="relative">
                <Icon className={`w-5 h-5 transition-all ${active ? "stroke-[2.5px]" : "stroke-[1.5px]"}`} />
                {showBadge && (
                  <span
                    data-badge
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 text-[10px] font-bold leading-4 text-white bg-blue-500 rounded-full text-center"
                  >
                    {unreadLetterCount > 99 ? '99+' : unreadLetterCount}
                  </span>
                )}
              </span>
              <span className={`text-xs leading-none transition-all ${active ? "font-semibold" : "font-normal"}`}>{item.label}</span>
              <div className={`w-1 h-1 rounded-full mt-0.5 transition-colors ${active ? "bg-blue-500" : "bg-transparent"}`} />
            </>
          );

          if (!item.to) return null; // Non-disabled items always have `to`; guard satisfies TS
          const ariaLabel = showBadge ? `${item.label}, ${unreadLetterCount} unread` : undefined;
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
