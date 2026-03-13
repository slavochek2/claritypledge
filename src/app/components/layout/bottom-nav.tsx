/**
 * @file bottom-nav.tsx
 * @description Mobile bottom navigation for logged-in users
 *
 * P113 Phase 2: Shows fixed bottom nav on mobile for verified users.
 * Uses design system tokens only.
 */
import { Link, useLocation } from "react-router-dom";
import { CalendarIcon, UserIcon, MicIcon, HomeIcon } from "lucide-react";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";
import { useLiveSession } from "@/app/contexts/live-session-context";

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
  const { isLive, setPendingNavTo } = useLiveSession();

  // Only show for logged-in users
  if (!showUserMenu) {
    return null;
  }

  // Hide on focus/detail pages — these use FocusHeader instead.
  // See docs/ux-patterns.md — "Navigation Architecture" pattern.
  const focusRoutes = ['/story/', '/point/', '/agreements/', '/create'];
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
      icon: MicIcon,
      label: "Start Session",
      to: "/live",
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
    if (to === "/live") return location.pathname === "/live" || location.pathname.startsWith("/live/");
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
          const itemInner = (
            <>
              <Icon className={`w-5 h-5 transition-all ${active ? "stroke-[2.5px]" : "stroke-[1.5px]"}`} />
              <span className={`text-xs leading-none transition-all ${active ? "font-semibold" : "font-normal"}`}>{item.label}</span>
            </>
          );

          // Guard: intercept nav away from live session, but not the /live item itself
          if (isLive && item.to !== '/live') {
            return (
              <button
                key={item.label}
                onClick={() => setPendingNavTo(item.to!)}
                className={itemClass}
                aria-current={active ? "page" : undefined}
              >
                {itemInner}
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              to={item.to!}
              className={itemClass}
              aria-current={active ? "page" : undefined}
            >
              {itemInner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
