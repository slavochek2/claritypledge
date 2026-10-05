/**
 * Measurement for the "Go first" prototype: explicit events only, logged to the console.
 * No analytics library, no dwell time, no scroll depth, no inferred scoring.
 *
 * A preview of a form that submits nowhere is never a completed primary action.
 */
import type { Route } from "./machine";

export type Ending = "work-yes" | "work-no" | "one" | "room-events" | "room-elsewhere" | "examples";

export type TrackEvent =
  | { name: "journey_started" }
  | { name: "demonstration_completed" }
  | { name: "demo_guess"; value: number }
  | { name: "mirror_opened" }
  | { name: "fork_reached" }
  | { name: "route_chosen"; route: Route }
  | { name: "primary_action_completed"; ending: Ending }
  | { name: "skip_pressed"; screen: number; via: "skip" | "logo" };

export function track(event: TrackEvent): void {
  if (!import.meta.env.DEV) return;
  const { name, ...props } = event;
  // eslint-disable-next-line no-console -- JOURNEY.md section 5: the prototype logs its explicit events to the console only, in development
  console.info("[landing-first]", name, props);
}
