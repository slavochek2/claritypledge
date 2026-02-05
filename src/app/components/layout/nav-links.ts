// Navigation links config - used by footer
// Desktop nav bar shows Events + Blog as visible links; rest in dropdown menu
export const NAV_LINKS = [
  { to: "/events", label: "Events" },
  { to: "/pledgers", label: "Pledgers" },
  { to: "/manifesto", label: "Manifesto" },
  { to: "/co-create", label: "Co-create" },
  { to: "/about", label: "About" },
] as const;
