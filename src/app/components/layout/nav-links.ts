// Navigation links config - used by footer and mobile menu
// Desktop nav bar shows these as visible links: Events, Pledgers, Manifesto, About
export const NAV_LINKS = [
  { to: "/events", label: "Events" },
  { to: "/pledgers", label: "Pledgers" },
  { to: "/article", label: "Manifesto" },
  { to: "/about", label: "About" },
] as const;
