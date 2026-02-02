/**
 * @file bottom-nav.tsx
 * @description Mobile bottom navigation for logged-in users
 *
 * P113 Phase 2: Shows fixed bottom nav on mobile for verified users.
 * Uses design system tokens only.
 */
import { Link, useLocation } from "react-router-dom";
import { CalendarIcon, UserIcon, SparklesIcon, VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";

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

  // Only show for logged-in users
  if (!showUserMenu) {
    return null;
  }

  const navItems: NavItem[] = [
    {
      icon: CalendarIcon,
      label: "Events",
      to: "/events",
    },
    {
      icon: UserIcon,
      label: "Profile",
      to: slug ? `/p/${slug}` : "/me",
    },
    {
      icon: SparklesIcon,
      label: "Create",
      disabled: true,
      onClick: () => toast("Coming soon", { description: "Create feature is not yet available" }),
    },
    {
      icon: VideoIcon,
      label: "Live",
      to: "/live",
    },
  ];

  const isActive = (to: string | undefined) => {
    if (!to) return false;
    // Exact match for root paths, prefix match for nested
    if (to === "/events") return location.pathname === "/events" || location.pathname.startsWith("/events/");
    if (to.startsWith("/p/")) return location.pathname.startsWith("/p/");
    if (to === "/live") return location.pathname === "/live" || location.pathname.startsWith("/live/");
    return location.pathname === to;
  };

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border"
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
                className="flex flex-col items-center justify-center gap-1 px-4 py-2 text-muted-foreground opacity-50"
                aria-label={`${item.label} (coming soon)`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              to={item.to!}
              className={`flex flex-col items-center justify-center gap-1 px-4 py-2 transition-colors ${
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
