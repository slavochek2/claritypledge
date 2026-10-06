import { describe, expect, it } from "vitest";
import { bottomCut, targetScroll } from "./reveal";

// A 400px panel, a 60px sticky header, 80px of bar at the bottom: 260px to show things in.
const area = { stickyTop: 60, barBottom: 80 };
const view = 400;

describe("Go first panel reveal", () => {
  it("leaves the panel alone when the newest block is already in view", () => {
    expect(targetScroll(0, view, area, { top: 100, bottom: 200 }, [], 1000)).toBe(0);
  });

  it("scrolls a block below the fold up until its bottom clears the bar", () => {
    const t = targetScroll(0, view, area, { top: 400, bottom: 500 }, [], 1000);
    expect(500).toBeLessThanOrEqual(t + view - area.barBottom);
    expect(400).toBeGreaterThanOrEqual(t + area.stickyTop);
  });

  it("puts the top edge of a block taller than the view just under the sticky header", () => {
    const t = targetScroll(0, view, area, { top: 300, bottom: 900 }, [], 1000);
    expect(t + area.stickyTop).toBeLessThanOrEqual(300);
    expect(t + area.stickyTop).toBeGreaterThan(280);
  });

  it("never leaves a card sliced by the top edge", () => {
    // Revealing the newest block (500..640) wants scrollTop 408, which cuts the card at
    // 420..480 under the sticky header's lower edge at 468.
    const card = { top: 420, bottom: 480 };
    const t = targetScroll(0, view, area, { top: 500, bottom: 640 }, [card], 1000);
    const edge = t + area.stickyTop;
    expect(card.top >= edge || card.bottom <= edge).toBe(true);
    expect(500).toBeGreaterThanOrEqual(edge);
    expect(640).toBeLessThanOrEqual(t + view - area.barBottom);
  });

  it("stays inside the scroll range", () => {
    expect(targetScroll(0, view, area, { top: 900, bottom: 960 }, [], 300)).toBe(300);
    expect(targetScroll(500, view, area, { top: 10, bottom: 40 }, [], 1000)).toBe(0);
  });

  it("goes past the scroll range, for the caller to extend, rather than slice a card", () => {
    // The statement (20..200) and the newest card (230..380) cannot both fit in 260px; the
    // content ends at the newest card, so the range stops short of moving past the statement.
    const card = { top: 20, bottom: 200 };
    const newest = { top: 230, bottom: 380 };
    const t = targetScroll(0, view, area, newest, [card], 60);
    expect(t).toBeGreaterThan(60);
    expect(card.bottom).toBeLessThanOrEqual(t + area.stickyTop);
    expect(newest.top).toBeGreaterThanOrEqual(t + area.stickyTop);
    expect(newest.bottom).toBeLessThanOrEqual(t + view - area.barBottom);
  });

  it("raises the bottom edge above a line it would cut, and leaves it where nothing is cut", () => {
    const lines = [
      { top: 100, bottom: 120 },
      { top: 124, bottom: 144 },
      { top: 148, bottom: 168 },
    ];
    expect(bottomCut(lines, 200)).toBe(0);
    expect(bottomCut(lines, 146)).toBe(0); // falls in a gap
    expect(bottomCut(lines, 160)).toBe(13); // cuts the third line: edge to 147
    // A control spanning two lines pushes the edge above its own top.
    expect(bottomCut([...lines, { top: 118, bottom: 166 }], 160)).toBe(61);
  });

  it("gives up rather than blank out more than the limit", () => {
    expect(bottomCut([{ top: 0, bottom: 300 }], 200, 72)).toBe(0);
  });
});
