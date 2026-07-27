import { BriefcaseIcon, UsersIcon, TargetIcon } from "lucide-react";

/**
 * The three public audience landings. Lives here, not in a component file, so the desktop
 * header, the desktop dropdown and the mobile menu can all read ONE list — duplicating it
 * is how /founder ended up reachable from one menu and not the others (P987).
 *
 * Callers filter out the current pathname: show the audiences you are NOT on. Do not
 * reintroduce a two-way toggle — with three landings it strands whichever page it is on
 * (P916's toggle left /founder with no link back to "/").
 */
// "For hiring", not "For founders": every co-founder IS a founder, so "For founders" +
// "For co-founders" in one menu named an overlap, not a choice.
// P1004: the key-hire landing moved from "/" to "/hiring"; the build-the-right-thing landing
// now serves "/". "/" is listed here as "For builders" so visitors on /hiring, /coach or
// /founder have a link back to the main landing (the menu filters out the current pathname,
// so it never shows a self-link).
export const AUDIENCE_LINKS = [
  { to: "/founder", label: "For co-founders", Icon: UsersIcon },
  { to: "/hiring", label: "For hiring", Icon: BriefcaseIcon },
  { to: "/coach", label: "For coaches", Icon: BriefcaseIcon },
  { to: "/", label: "For builders", Icon: TargetIcon },
] as const;

/**
 * P1010: the "Events" nav item points at the Clarity Organization page, not the bare
 * events list. /org/cm opens on its Events tab (has_events=true) and embeds the SAME
 * production list — so nothing is hidden, the events just arrive with their community
 * around them. `/events` redirects here too (see prototypes/events/index.tsx), so the
 * app's many hardcoded "back to events" links land in the same place as the menu.
 * `/events/list` stays live and unredirected — it is the webinar funnel's target.
 *
 * ONE constant because four call sites render this item (footer NAV_LINKS, the mobile
 * menu, the desktop dropdown, the bottom nav) — the exact duplication that left
 * /founder reachable from one menu and not the others (P987).
 */
export const EVENTS_NAV_TO = "/org/cm";

/**
 * Active-state matcher for the Events nav item. Covers the org page AND the events
 * routes, because a visitor who opens an event lands on /events/:slug — the tab must
 * stay lit there, not go dark the moment they click through.
 */
export function isEventsNavActive(pathname: string): boolean {
  return (
    pathname === EVENTS_NAV_TO ||
    pathname.startsWith(`${EVENTS_NAV_TO}/`) ||
    pathname === "/events" ||
    pathname.startsWith("/events/")
  );
}

// Navigation links config - used by footer
// Desktop nav bar shows Events + Blog as visible links; rest in dropdown menu
export const NAV_LINKS = [
  { to: EVENTS_NAV_TO, label: "Events" },
  { to: "/pledgers", label: "Pledgers" },
  { to: "/manifesto", label: "Manifesto" },
  { to: "/co-create", label: "Co-create" },
  { to: "/about", label: "About" },
] as const;
