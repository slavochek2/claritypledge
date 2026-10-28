import { lazy } from "react";

/**
 * Use-case landings that render inside the public ClarityLandingLayout (App.tsx maps them to routes).
 * P1506 /hospitals: unlisted, share-by-link. P1558 /change-managers: noindex, first in the Use cases
 * menu; /change-leads was its first name (see landing-redirects.ts).
 */
export const USE_CASE_LANDINGS = [
  { path: "/hospitals", Page: lazy(() => import("@/app/pages/hospitals-page").then((m) => ({ default: m.HospitalsPage }))) },
  { path: "/change-managers", Page: lazy(() => import("@/app/pages/change-managers-page").then((m) => ({ default: m.ChangeManagersPage }))) },
] as const;
