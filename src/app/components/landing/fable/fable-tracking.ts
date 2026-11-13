/**
 * Analytics for the fable layout's actions, injected by the page that renders it (P1671). The live
 * pages (/builders, /change-managers) pass their own events; the /tree prototypes pass nothing, so
 * a dev view never counts as a production click. Default: no tracking.
 */
import { createContext, useContext } from "react";

export type CtaLocation = "hero" | "closing";
export type FableTracking = {
  /** The discovery-call CTA, by where it sits on the page. */
  cta?: (location: CtaLocation) => void;
  /** The hero's "Take the Pledge" link. */
  pledge?: () => void;
};

const FableTrackingContext = createContext<FableTracking>({});
export const FableTrackingProvider = FableTrackingContext.Provider;
export const useFableTracking = () => useContext(FableTrackingContext);
