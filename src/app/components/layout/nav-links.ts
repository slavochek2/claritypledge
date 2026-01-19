// Navigation links config - used by footer and mobile menu
// Desktop nav bar shows these as visible links: Events, Pledgers, Manifesto, About, Collaborate (non-logged-in)
export const NAV_LINKS = [
  { to: "/events", label: "Events" },
  { to: "/pledgers", label: "Pledgers" },
  { to: "/article", label: "Manifesto" },
  { to: "/about", label: "About" },
  { to: "/collaborate", label: "Collaborate" },
] as const;
