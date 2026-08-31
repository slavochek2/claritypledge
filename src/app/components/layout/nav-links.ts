import {
  BriefcaseIcon,
  UsersIcon,
  TargetIcon,
  TagIcon,
  CalendarIcon,
  AwardIcon,
  ScrollTextIcon,
  BookOpenIcon,
  InfoIcon,
} from "lucide-react";

/**
 * The three public audience landings. Lives here, not in a component file, so the desktop
 * header, the desktop dropdown and the mobile menu can all read ONE list — duplicating it
 * is how /founder ended up reachable from one menu and not the others (P987).
 *
 * Callers render ALL of them, grouped under a "Use cases" menu, and mark the current one
 * with aria-current (P1087). The old rule was the opposite — filter out the current
 * pathname — which meant the page you were on was the one entry missing from the list, so
 * the set looked different from every page and never showed you where you were.
 *
 * Do not reintroduce filtering in any form, including a two-way toggle: P916's toggle left
 * /founder with no link back to "/". A menu that always lists every destination cannot
 * strand any of them, which is why marking beats removing here.
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
 * P1193: the nav item points at the Clarity Groups DIRECTORY, not at one hardcoded
 * group and not at the bare events list.
 *
 * It used to be `/org/cm` — a one-group hack, documented as such from the day it
 * shipped: with a single seeded organization, "Events" could point straight at it
 * and nobody noticed the hardcoding. A second group (· Online, P1060) made that a
 * lie in the menu, sending everyone into Chiang Mai regardless of what they belonged
 * to. `/groups` is the honest target now that a directory exists.
 *
 * The label is "Groups", and the word "Events" leaves the public menu (founder,
 * 2026-08-31). Events are reached THROUGH a group: each group page opens on its own
 * Events tab, which embeds the same production list.
 *
 * `/events` itself still redirects to `/groups/cm` (prototypes/events/index.tsx) so
 * the app's ~11 hardcoded `to="/events"` back-links keep landing somewhere real —
 * that redirect carries its own one-group hardcoding, untouched by P1193 and worth
 * revisiting separately. `/events/list` is the unredirected standalone list and the
 * webinar funnel's target; it has no menu entry and never did.
 *
 * ONE constant because four call sites render this item (footer NAV_LINKS, the mobile
 * menu, the desktop dropdown, the bottom nav) — the exact duplication that left
 * /founder reachable from one menu and not the others (P987).
 */
export const EVENTS_NAV_TO = "/groups";

/**
 * Active-state matcher for the Groups nav item. Covers the group routes AND the
 * events routes, because a visitor who opens an event lands on /events/:slug — the
 * tab must stay lit there, not go dark the moment they click through.
 *
 * `/org*` is deliberately absent: those paths redirect to `/groups*` before anything
 * renders (App.tsx OrgLegacyRedirect), so no nav ever sees them.
 */
export function isEventsNavActive(pathname: string): boolean {
  return (
    pathname === EVENTS_NAV_TO ||
    pathname.startsWith(`${EVENTS_NAV_TO}/`) ||
    pathname === "/events" ||
    pathname.startsWith("/events/")
  );
}

/**
 * The public menu, as GROUPS (P1087). Both the mobile sandwich and the desktop hamburger
 * render this one structure, in this one order.
 *
 * Two separate defects motivated it. First, the flat list had grown to ten unlabelled
 * items — the founder's read was "it's a bit of chaos", and labelling only the Use-cases
 * block made the unlabelled remainder look like leftovers rather than a group. Second,
 * and invisible until you compare the files: the two menus listed the SAME items in
 * DIFFERENT orders (mobile ran Events → Pledgers → audiences → Pricing → Manifesto → Blog
 * → About; the dropdown ran Events → Blog → Pledgers → Manifesto → About → audiences →
 * Pricing). One structure makes divergence impossible rather than merely unlikely.
 *
 * Use cases leads, per the founder: it is the question a first-time visitor is actually
 * asking. Account actions (Take the Pledge / Log In / Create Account) are deliberately NOT
 * here — they carry test ids, a `hideLoginItem` case and analytics, and they sit below a
 * separator in the dropdown. Keeping them hand-written keeps this structure simple.
 *
 * `external: true` renders an <a target="_blank">; everything else is a router <Link>.
 */
export const PUBLIC_NAV_GROUPS = [
  { label: "Use cases", items: AUDIENCE_LINKS },
  {
    label: "Product",
    items: [
      { to: "/pricing", label: "Pricing", Icon: TagIcon },
      { to: EVENTS_NAV_TO, label: "Groups", Icon: CalendarIcon },
      { to: "/pledgers", label: "Pledgers", Icon: AwardIcon },
    ],
  },
  {
    label: "Learn",
    items: [
      { to: "/manifesto", label: "Manifesto", Icon: ScrollTextIcon },
      { to: "https://blog.claritypledge.com", label: "Blog", Icon: BookOpenIcon, external: true },
      { to: "/about", label: "About", Icon: InfoIcon },
    ],
  },
] as const;

// Navigation links config - used by footer
// Desktop nav bar shows Groups + Blog as visible links; rest in dropdown menu
export const NAV_LINKS = [
  { to: EVENTS_NAV_TO, label: "Groups" },
  { to: "/pledgers", label: "Pledgers" },
  { to: "/manifesto", label: "Manifesto" },
  { to: "/co-create", label: "Co-create" },
  { to: "/about", label: "About" },
] as const;
