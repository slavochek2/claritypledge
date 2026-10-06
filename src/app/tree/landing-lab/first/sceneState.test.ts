import { describe, expect, it } from "vitest";
import {
  GLOW_REACH,
  HIGH_RATING,
  LOW_DIM,
  SEPARATION,
  bodyPositions,
  gapBetween,
  mistBox,
  projectPair,
  sceneTarget,
  visibleShareOfBack,
} from "./sceneState";

const SIZES: [number, number][] = [
  [375, 372],
  [320, 212],
  [375, 163],
  [320, 125],
  [720, 900],
  [1440, 900],
];

describe("Go first scene framing", () => {
  it.each(SIZES)("keeps both bodies and their glow inside a %ix%i scene, side-on and end-on", (w, h) => {
    for (const view of [0, 1] as const) {
      for (const d of projectPair(view, 0, w, h)) {
        const reach = d.r * GLOW_REACH;
        expect(d.x - reach).toBeGreaterThanOrEqual(0);
        expect(d.x + reach).toBeLessThanOrEqual(w);
        expect(d.y - reach).toBeGreaterThanOrEqual(0);
        expect(d.y + reach).toBeLessThanOrEqual(h);
      }
    }
  });

  it("lays the pair left and right when side-on", () => {
    const [p, q] = projectPair(1, 0, 375, 163);
    expect(Math.abs(q.x - p.x)).toBeGreaterThan(5 * Math.abs(q.y - p.y));
  });

  it("shows about a quarter of the back body when end-on, as a second body", () => {
    for (const [w, h] of SIZES) {
      const [back, front] = projectPair(0, 0, w, h);
      const share = visibleShareOfBack(back, front);
      expect(share).toBeGreaterThan(0.18);
      expect(share).toBeLessThan(0.35);
    }
  });

  it("has a gap side-on and none end-on", () => {
    expect(gapBetween(...projectPair(1, 0, 375, 163))).not.toBeNull();
    expect(gapBetween(...projectPair(0, 0, 375, 372))).toBeNull();
    expect(mistBox(...projectPair(0, 0, 375, 372))).toBeNull();
  });

  it("never changes the distance between the bodies", () => {
    for (const [view, turn] of [[0, 0], [1, 0], [1, 1], [0.5, -1]] as const) {
      const [a, b] = bodyPositions(view, turn);
      expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])).toBeCloseTo(SEPARATION, 6);
    }
  });
});

describe("Go first scene states", () => {
  const at = (screen: Parameters<typeof sceneTarget>[0]["screen"], beat = 0) => sceneTarget({ screen, beat });

  it("is end-on on screen 1 and side-on in clear air once the story turns", () => {
    expect(at("promise")).toMatchObject({ view: 0, mist: 0 });
    expect(at("story", 1)).toMatchObject({ view: 1, mist: 0, dim: 0, filament: 0 });
  });

  it("reacts to revealed ratings only: low dims and mists, high clears and joins", () => {
    // Before any rating: the statement, the first try, the guess.
    for (const beat of [0, 1, 2]) expect(at("demo", beat)).toMatchObject({ mist: 0, dim: 0, filament: 0 });
    // The first rating (4) is low.
    expect(at("demo", 3)).toMatchObject({ dim: LOW_DIM, filament: 0 });
    expect(at("demo", 3).mist).toBeGreaterThan(0);
    // Still low while the second try is read.
    expect(at("demo", 4)).toMatchObject({ dim: LOW_DIM, filament: 0 });
    // The second rating (9) is high: mist clears, a filament joins the bodies.
    expect(at("demo", 5)).toMatchObject({ mist: 0, dim: 0, filament: 1 });
    expect(HIGH_RATING).toBeLessThanOrEqual(9);
  });

  it("mists the gap from the norm on, with both bodies crisp", () => {
    for (const screen of ["norm", "fork", "work", "examples", "mirror"] as const) {
      expect(at(screen)).toMatchObject({ view: 1, mist: 1, dim: 0, filament: 0 });
    }
  });
});
