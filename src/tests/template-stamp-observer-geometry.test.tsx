/**
 * The TEMPLATE watermark is the only VISUAL disclosure that the demo agreement
 * (Einstein/Teresa "signing") is a sample and not a real signed document. It must be
 * able to appear at every viewport width.
 *
 * It could not. The stamp scrolls in via IntersectionObserver with `threshold: 0.6` —
 * but threshold is a ratio OF THE OBSERVED ELEMENT, and the stamp renders ~867px wide
 * (text-5xl, tracking-[0.2em], whitespace-nowrap, scaled 2.7x pre-stamp). In a 375px
 * viewport the greatest achievable ratio is 375/867 = 0.433, measured empirically with
 * a real observer at 0.433. 0.433 < 0.6, so the callback never fired and the stamp sat
 * at opacity 0 forever. Every viewport under ~520px showed a signed-looking agreement
 * with no watermark; desktop reached ratio 1.0 and looked fine, which is why it hid.
 *
 * The fix makes the trigger VIEWPORT-relative (threshold 0 + negative rootMargin) so the
 * element's own size can never defeat it. These tests assert the observer's geometry
 * contract rather than a rendered pixel, because jsdom has no layout and no real
 * IntersectionObserver — the bug lived entirely in the options object.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { TemplateStamp } from "@/app/components/agreements/template-stamp";

type ObserverInit = IntersectionObserverInit | undefined;

let capturedInit: ObserverInit;
let observeCount: number;

class FakeIO {
  constructor(_cb: IntersectionObserverCallback, init?: IntersectionObserverInit) {
    capturedInit = init;
  }
  observe() { observeCount += 1; }
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
  root = null;
  rootMargin = "";
  thresholds = [];
}

/** Greatest intersectionRatio an element of `elW` can reach inside a viewport of `vw`. */
const maxRatio = (vw: number, elW: number, vh = 812, elH = 512) =>
  Math.min(1, vw / elW) * Math.min(1, vh / elH);

const STAMP_WIDTH_PX = 867; // measured in Chrome at 375px: 867x512

describe("TemplateStamp — the scroll trigger must not be defeated by the stamp's own size", () => {
  beforeEach(() => {
    capturedInit = undefined;
    observeCount = 0;
    vi.stubGlobal("IntersectionObserver", FakeIO as unknown as typeof IntersectionObserver);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("documents the geometry that broke it: a 0.6 element-ratio is unreachable on phones", () => {
    // Not testing our code — pinning the arithmetic the old options ignored.
    expect(maxRatio(375, STAMP_WIDTH_PX)).toBeLessThan(0.6);
    expect(maxRatio(320, STAMP_WIDTH_PX)).toBeLessThan(0.6);
    expect(maxRatio(1440, STAMP_WIDTH_PX)).toBeGreaterThanOrEqual(0.6); // why desktop hid it
  });

  it("does not gate on an element-ratio threshold the stamp cannot reach", () => {
    render(<TemplateStamp animate />);
    expect(observeCount).toBe(1);

    const t = capturedInit?.threshold;
    const thresholds = Array.isArray(t) ? t : [t ?? 0];
    const required = Math.max(...thresholds.map((n) => Number(n ?? 0)));

    // Must be satisfiable at the narrowest supported width.
    expect(required).toBeLessThanOrEqual(maxRatio(320, STAMP_WIDTH_PX));
  });

  it("uses a viewport-relative rootMargin so element size cannot defeat the trigger", () => {
    render(<TemplateStamp animate />);
    // A negative rootMargin shrinks the ROOT (the viewport), which is what makes the
    // trigger independent of how wide the stamp renders.
    expect(capturedInit?.rootMargin).toMatch(/-\d+(\.\d+)?%/);
  });

  it("still observes nothing when static (animate=false renders stamped from frame one)", () => {
    render(<TemplateStamp />);
    expect(observeCount).toBe(0);
  });
});
