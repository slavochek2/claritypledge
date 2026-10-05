/**
 * What the scene shows for each point of the journey, and where the two bodies land on
 * screen. Driven by screen state and by revealed ratings only, never by a drag, a scroll
 * or the pointer. The live renderer (./scene) and the still (./Still) both draw from
 * `projectPair`, so they always agree.
 *
 * Meaningful states:
 *  - view: the pair end-on (one body mostly behind the other) or side-on (two bodies, a gap).
 *  - mist: a haze in the gap only. The bodies themselves are never blurred.
 *  - dim: both bodies a little darker after a low rating.
 *  - filament: a thin white line across the gap after a high rating.
 * The distance between the bodies is a constant. Nothing on this page brings them closer.
 */
import { demoView } from "./demo";
import type { JourneyState } from "./machine";

export interface SceneTarget {
  /** 0 = end-on, 1 = side-on. Only these two values. */
  view: 0 | 1;
  /** Haze in the gap, 0..1. At 1 the gap cannot be seen. */
  mist: number;
  /** Darkening of both bodies, 0..1. */
  dim: number;
  /** The thin line across the gap, 0 or 1. */
  filament: number;
  /** Decorative turn while a fork button has focus, -1..1. */
  turn: number;
}

/** Centre-to-centre distance of the two bodies, in scene units. Never changes. */
export const SEPARATION = 3.0;
export const RADIUS = 0.62;
/** Radians of turn at |turn| = 1. Small on purpose. */
export const MAX_TURN = 0.16;
/**
 * Angle between the pair and the line of sight when end-on: about a quarter of the back
 * body shows beside the front one, so it reads as a second body, not an artifact.
 */
export const END_ON_ANGLE = 0.13;
/** Camera distance. Far enough that the back body is not much smaller than the front. */
const CAMERA_Z = 14;
/** Glow reaches zero at this multiple of a body's radius. */
export const GLOW_REACH = 2.2;
/** A rating at or above this reads as understood. */
export const HIGH_RATING = 8;
/** How much a low rating darkens the bodies. */
export const LOW_DIM = 0.15;
/** How much a low rating thickens the (otherwise clear) gap. */
export const LOW_MIST = 0.35;

const CLEAR: SceneTarget = { view: 1, mist: 0, dim: 0, filament: 0, turn: 0 };
const END_ON: SceneTarget = { ...CLEAR, view: 0 };
const MISTED: SceneTarget = { ...CLEAR, mist: 1 };

/** Turn per fork button, top to bottom. */
const FORK_TURN = [-1, -0.35, 0.35, 1] as const;

/** The scene's answer to the most recent rating revealed in the demonstration. */
function demoTarget(beat: number): SceneTarget {
  const shown = demoView(beat).revealedRatings;
  const last = shown[shown.length - 1];
  if (!last) return CLEAR;
  return last.value >= HIGH_RATING ? { ...CLEAR, filament: 1 } : { ...CLEAR, mist: LOW_MIST, dim: LOW_DIM };
}

export function sceneTarget(s: JourneyState, forkFocus: number | null = null): SceneTarget {
  switch (s.screen) {
    case "promise":
      return END_ON;
    case "story":
      return s.beat === 0 ? END_ON : CLEAR;
    case "meanings":
      return CLEAR;
    case "demo":
      return demoTarget(s.beat);
    case "fork":
      return { ...MISTED, turn: forkFocus === null ? 0 : (FORK_TURN[forkFocus] ?? 0) };
    default:
      // The norm, the mirror and every ending: the gap is there and cannot be seen.
      return MISTED;
  }
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Angle between the pair and the line of sight. */
export function viewAngle(view: number, turn: number): number {
  return END_ON_ANGLE + (Math.PI / 2 - END_ON_ANGLE) * smooth(Math.min(1, Math.max(0, view))) + turn * MAX_TURN;
}

/** Direction in the screen plane the pair lies along: left and right, slightly tilted. */
export function screenAxis(): [number, number] {
  const len = Math.hypot(1, 0.14);
  return [1 / len, 0.14 / len];
}

/** World positions of the two bodies. Their distance is SEPARATION whatever the inputs. */
export function bodyPositions(view: number, turn: number): [[number, number, number], [number, number, number]] {
  const [ax, ay] = screenAxis();
  const th = viewAngle(view, turn);
  const ux = Math.sin(th) * ax;
  const uy = Math.sin(th) * ay;
  const uz = Math.cos(th);
  const h = SEPARATION / 2;
  return [
    [-ux * h, -uy * h, -uz * h],
    [ux * h, uy * h, uz * h],
  ];
}

/** Projected span of the side-on pair with its glow, per unit of focal length. */
function sideOnExtent(): { width: number; height: number } {
  const [a, b] = bodyPositions(1, 0);
  const x = (p: [number, number, number], side: number) => (p[0] + side * RADIUS * GLOW_REACH) / (CAMERA_Z - p[2]);
  const y = (p: [number, number, number]) => (RADIUS * GLOW_REACH) / (CAMERA_Z - p[2]);
  return { width: x(b, 1) - x(a, -1), height: 2 * Math.max(y(a), y(b)) + Math.abs(b[1] / (CAMERA_Z - b[2]) - a[1] / (CAMERA_Z - a[2])) };
}

/** Focal length, in px, that keeps the pair and its glow inside a w x h scene with a margin. */
export function focalLength(w: number, h: number): number {
  const e = sideOnExtent();
  return Math.min((0.92 * w) / e.width, (0.92 * h) / e.height);
}

export interface Disc {
  /** Centre in px from the scene's top-left corner. */
  x: number;
  y: number;
  /** Radius in px. */
  r: number;
  /** Depth: larger is nearer the viewer. */
  z: number;
  /** Which body: "a" is the deeper blue one, "b" the paler one. */
  id: "a" | "b";
}

/** The two bodies as circles on a w x h scene, back one first. Both renderers use this. */
export function projectPair(view: number, turn: number, w: number, h: number): [Disc, Disc] {
  const f = focalLength(w, h);
  const [pa, pb] = bodyPositions(view, turn);
  const disc = (p: [number, number, number], id: "a" | "b"): Disc => {
    const k = f / (CAMERA_Z - p[2]);
    return { x: w / 2 + p[0] * k, y: h / 2 - p[1] * k, r: RADIUS * k, z: p[2], id };
  };
  const a = disc(pa, "a");
  const b = disc(pb, "b");
  return a.z <= b.z ? [a, b] : [b, a];
}

/** The gap between two discs: its two edge points, or null when they overlap. */
export function gapBetween(p: Disc, q: Disc): { from: [number, number]; to: [number, number] } | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= p.r + q.r) return null;
  const ux = dx / d;
  const uy = dy / d;
  return { from: [p.x + ux * p.r, p.y + uy * p.r], to: [q.x - ux * q.r, q.y - uy * q.r] };
}

/** Share of the back disc not covered by the front one, estimated on a grid. */
export function visibleShareOfBack(back: Disc, front: Disc, steps = 120): number {
  let total = 0;
  let shown = 0;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const x = back.x - back.r + (2 * back.r * (i + 0.5)) / steps;
      const y = back.y - back.r + (2 * back.r * (j + 0.5)) / steps;
      if ((x - back.x) ** 2 + (y - back.y) ** 2 > back.r ** 2) continue;
      total++;
      if ((x - front.x) ** 2 + (y - front.y) ** 2 > front.r ** 2) shown++;
    }
  }
  return total ? shown / total : 0;
}

/** The mist's box: an ellipse spanning the gap, a little longer than it and 0.75 r tall. */
export function mistBox(back: Disc, front: Disc) {
  const gap = gapBetween(back, front);
  if (!gap) return null;
  const [fx, fy] = gap.from;
  const [tx, ty] = gap.to;
  const len = Math.hypot(tx - fx, ty - fy);
  const r = Math.min(back.r, front.r);
  return {
    cx: (fx + tx) / 2,
    cy: (fy + ty) / 2,
    halfLength: len / 2 + r * 0.25,
    halfHeight: r * 0.75,
    dir: [(tx - fx) / len, (ty - fy) / len] as [number, number],
    gap,
  };
}
