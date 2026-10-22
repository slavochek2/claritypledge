/**
 * @file bottom-nav.tsx
 * @description Mobile bottom navigation for logged-in users
 *
 * P113 Phase 2: Shows fixed bottom nav on mobile for verified users.
 * Uses design system tokens only.
 *
 * P1512: Home, Feed, Groups, Letters and You. P1543: Events replaces Groups (Groups moves into the You sheet). Home is the chat list, Feed is what Home used to be.
 * "You" opens a sheet (profile, Partners with its badge, Tools, Events, Settings, Log Out), and on an
 * event day a slim "Today's event" strip sits on top of the tabs — the top bar that used to carry
 * both is not rendered in the signed-in shell.
 */
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarCheckIcon } from "lucide-react";
import { analytics } from "@/lib/mixpanel";
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";
import { useNavAuthState } from "@/hooks/use-nav-auth-state";
import { useLiveSession } from "@/app/contexts/live-session-context";
import { EVENTS_LIST_TO, EVENTS_NAV_TO } from "./nav-links";
import { isBottomNavHiddenRoute } from "./bottom-nav-routes";
import { MeSheet } from "./app-shell/me-sheet";
import { PHONE_TAB_IDS, useShellEntries, useShellTodaysEvent, type ShellEntry, type ShellEntryId } from "./app-shell/shell-nav";


function tabClass(active: boolean) {
  return `flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
    active ? "text-blue-600" : "text-muted-foreground hover:text-foreground"
  }`;
}

function TabBody({ entry, active, children }: { entry: ShellEntry; active: boolean; children?: React.ReactNode }) {
  const Icon = entry.Icon;
  return (
    <>
      <span className="relative flex">
        {children ?? <Icon className={`w-5 h-5 transition-all ${active ? "stroke-[2.5px]" : "stroke-[1.5px]"}`} />}
        {entry.badge > 0 && (
          <span
            data-badge
            className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 text-[10px] font-bold leading-4 text-white bg-blue-600 rounded-full text-center"
          >
            {entry.badge > 99 ? "99+" : entry.badge}
          </span>
        )}
      </span>
      <span className={`text-xs leading-none transition-all ${active ? "font-semibold" : "font-normal"}`}>{entry.label}</span>
      <div className={`w-1 h-1 rounded-full mt-0.5 transition-colors ${active ? "bg-blue-600" : "bg-transparent"}`} />
    </>
  );
}

export function BottomNav() {
  const location = useLocation();
  const { showUserMenu, user, hasPledged, isProfilePending } = useNavAuthState();
  const { isLive } = useLiveSession();
  const entries = useShellEntries();
  const todays = useShellTodaysEvent();
  const [meOpen, setMeOpen] = useState(false);

  // Only show for logged-in users. P1421: that includes a known session whose profile is
  // still loading — on a slow link the bar used to appear ~10s late, under the user's thumb.
  if (!showUserMenu && !isProfilePending) {
    return null;
  }

  // P588: Hide during active live sessions (context-based, not route-based).
  // isLive is true when view='live' && !sessionEnded && !partnerLeft.
  // Lobby (/live), join form, session ended → isLive=false → BottomNav shows.
  if (isLive) {
    return null;
  }

  if (isBottomNavHiddenRoute(location.pathname, location.search)) {
    return null;
  }

  const byId = (id: ShellEntryId) => entries.find(e => e.id === id);
  const tabs = PHONE_TAB_IDS.map(byId).filter((e): e is ShellEntry => !!e);
  // The You tab is lit on the pages it opens onto: the profile and Partners.
  const meActive = !!(byId("profile")?.active || byId("partners")?.active);
  const meEntry = byId("profile");
  // Partners lives behind Me, so its pending-invite count rides on this tab.
  const meBadge = byId("partners")?.badge ?? 0;
  const meLabel = meBadge > 0 ? `You, ${meBadge} pending ${meBadge === 1 ? "invitation" : "invitations"}` : "You";

  return (
    <nav
      data-nav="bottom"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border shadow-sheet pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile navigation"
    >
      {todays && (
        <Link
          to={todays.href}
          title={todays.event.title}
          data-testid="tonights-event-cta"
          className="flex h-10 items-center justify-center gap-2 border-b border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
          onClick={() =>
            analytics.track("nav_cta_clicked", { cta: "tonights_event", device: "mobile", registered: !!todays.event.registered })
          }
        >
          <CalendarCheckIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          Today's event
        </Link>
      )}
      <div className="flex items-center justify-around h-16">
        {tabs.map(entry => {
          if (entry.to === null) return null;
          const ariaLabel = entry.badge > 0 ? `${entry.label}, ${entry.badge} ${entry.badgeNoun}` : undefined;
          return (
            <Link
              key={entry.id}
              to={entry.to}
              className={tabClass(entry.active)}
              aria-current={entry.active ? "page" : undefined}
              aria-label={ariaLabel}
              onClick={
                entry.to === EVENTS_NAV_TO
                  ? () => analytics.track("org_events_nav_clicked", { source: "bottom_nav" })
                  : entry.to === EVENTS_LIST_TO
                    ? () => analytics.track("events_list_nav_clicked", { source: "bottom_nav" })
                    : undefined
              }
            >
              <TabBody entry={entry} active={entry.active} />
            </Link>
          );
        })}

        {/* Me: P1421 keeps the slot's box while the profile loads, so the five tabs hold their widths.
            P1539: drawn at its final weight (an avatar-sized disc, label at the resting colour, no fade or pulse),
            so the tab does not change from grey to avatar when the profile lands. */}
        {isProfilePending || !user || !meEntry ? (
          <div
            aria-hidden="true"
            data-nav-slot-placeholder="You"
            className="flex flex-col items-center justify-center gap-1 flex-1 py-2 text-muted-foreground pointer-events-none select-none"
          >
            <span className="relative flex">
              <span className="block h-5 w-5 rounded-full bg-muted" />
            </span>
            <span className="text-xs leading-none font-normal">You</span>
            <div className="w-1 h-1 rounded-full mt-0.5 bg-transparent" />
          </div>
        ) : (
          <button
            type="button"
            data-testid="bottom-nav-me"
            className={tabClass(meActive)}
            aria-haspopup="dialog"
            aria-expanded={meOpen}
            aria-label={meLabel}
            onClick={() => {
              setMeOpen(true);
              analytics.track("nav_menu_opened", { trigger: "avatar", device: "mobile" });
            }}
          >
            <TabBody entry={{ ...meEntry, label: "You", badge: meBadge }} active={meActive}>
              <GravatarAvatar
                name={user.name}
                avatarColor={user.avatarColor}
                photoUrl={user.avatarUrl}
                size="sm"
                // The same box as the other tabs' icons (w-5 h-5). A pledger keeps the ring, thin and flush: the
                // default ring has a 2px offset gap that made this one tab look oversized.
                className="!h-5 !w-5 !text-[9px] !ring-1 !ring-offset-0"
                isPledger={hasPledged}
              />
            </TabBody>
          </button>
        )}
      </div>
      <MeSheet open={meOpen} onOpenChange={setMeOpen} />
    </nav>
  );
}
