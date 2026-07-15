import { BriefcaseIcon, UsersIcon } from "lucide-react";

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
// "For co-founders" in one menu named an overlap, not a choice. "/" is also not
// founder-scoped — it addresses anyone making a key hire.
export const AUDIENCE_LINKS = [
  { to: "/", label: "For hiring", Icon: BriefcaseIcon },
  { to: "/coach", label: "For coaches", Icon: BriefcaseIcon },
  { to: "/founder", label: "For co-founders", Icon: UsersIcon },
] as const;

// Navigation links config - used by footer
// Desktop nav bar shows Events + Blog as visible links; rest in dropdown menu
export const NAV_LINKS = [
  { to: "/events", label: "Events" },
  { to: "/pledgers", label: "Pledgers" },
  { to: "/manifesto", label: "Manifesto" },
  { to: "/co-create", label: "Co-create" },
  { to: "/about", label: "About" },
] as const;
