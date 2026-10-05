/**
 * One control value (0..1) drives everything: the shader, the static fallback and the
 * DOM. Keeping the mapping in one pure function is what keeps the three in step.
 *
 * The gap is real from the start. Revealing changes only the point of view and the fog;
 * the distance between the two bodies is the same before and after. Only bridging, a
 * separate act, brings them closer, and even at 10 out of 10 they stay two bodies.
 */

export type Stage = "pretending" | "revealed" | "bridging" | "bridged";

export interface SceneState {
  stage: Stage;
  /** 0 = seen end-on through fog, 1 = seen side-on with the fog cleared. */
  reveal: number;
  /** Centre-to-centre distance of the two bodies, in scene units. */
  separation: number;
  /** Where the travelling pulse is along the gap, 0 = first body, 1 = second body. */
  pulsePos: number;
  /** Pulse brightness, 0 when no pulse is in flight. */
  pulseAmp: number;
  /** How established the link between the bodies is, 0..1. */
  bridge: number;
  /** Completed round trips, 0..ROUND_TRIPS. */
  trips: number;
  /** The hidden number, out of 10. */
  score: number;
  /** 1 at 10 out of 10, else 0. */
  done: number;
}

export const ROUND_TRIPS = 3;
export const START_SCORE = 4;
export const SEPARATION_FAR = 3.0;
export const SEPARATION_NEAR = 1.5;

const REVEAL_FROM = 0.02;
const REVEAL_TO = 0.3;
const BRIDGE_FROM = 0.34;
const BRIDGE_TO = 0.98;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function sceneState(value: number): SceneState {
  const p = clamp01(value);
  const reveal = smoothstep(REVEAL_FROM, REVEAL_TO, p);
  const q = clamp01((p - BRIDGE_FROM) / (BRIDGE_TO - BRIDGE_FROM));
  const t = q * ROUND_TRIPS;
  const trips = Math.min(ROUND_TRIPS, Math.floor(t + 1e-6));
  const f = trips >= ROUND_TRIPS ? 0 : t - trips;

  // Out to the other mind in the first half of a trip, explained back in the second.
  const pulsePos = f < 0.5 ? f / 0.5 : 1 - (f - 0.5) / 0.5;
  const inFlight = q > 0 && trips < ROUND_TRIPS;
  const pulseAmp = inFlight ? smoothstep(0, 0.06, f) * (1 - smoothstep(0.94, 1, f)) : 0;

  // The bodies close in as the explanation arrives back and is confirmed.
  const closeness = (trips + (trips < ROUND_TRIPS ? smoothstep(0.7, 1, f) : 0)) / ROUND_TRIPS;
  const separation = SEPARATION_FAR + (SEPARATION_NEAR - SEPARATION_FAR) * closeness;

  const score = START_SCORE + Math.round(((10 - START_SCORE) * trips) / ROUND_TRIPS);
  const done = trips >= ROUND_TRIPS ? 1 : 0;

  let stage: Stage = "pretending";
  if (done) stage = "bridged";
  else if (q > 0) stage = "bridging";
  else if (reveal >= 0.5) stage = "revealed";

  return {
    stage,
    reveal,
    separation,
    pulsePos,
    pulseAmp,
    bridge: q > 0 ? Math.max(0.15, closeness) : 0,
    trips,
    score,
    done,
  };
}

/**
 * Direction, in the screen plane, the pair lies along once seen side-on. Landscape
 * screens get a near-horizontal pair, portrait phones a near-vertical one, so the gap
 * always spans the long side of the screen.
 */
export function screenAxis(aspect: number): [number, number] {
  const k = smoothstep(0.75, 1.25, aspect);
  const x = 0.3 + (1 - 0.3) * k;
  const y = 1 + (0.14 - 1) * k;
  const len = Math.hypot(x, y);
  return [x / len, y / len];
}

/** Angle between the pair and the line of sight: nearly end-on at rest, side-on revealed. */
export function viewAngle(reveal: number): number {
  const e = reveal * reveal * (3 - 2 * reveal);
  return 0.1 + (Math.PI / 2 - 0.1) * e;
}
