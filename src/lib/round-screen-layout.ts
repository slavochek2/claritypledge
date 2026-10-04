/**
 * @file round-screen-layout.ts
 * @description P1337 — how the projector lays out a round's tables so every name is as large as
 * it can be on ONE screen, whether the room is 6 people (2 tables) or 40 (13 tables).
 *
 * Try every column count and keep the one that gives the biggest type. A table card is about
 * (3.6 + 2.1 × seats) type-heights tall — header, padding, one row per seat — and about 13.5
 * type-widths wide (role card, face, a short name). Type is capped at 34px (a near-empty room should
 * not shout) and floored at 12px.
 */

export const SCREEN_PAD = 32;
export const SCREEN_HEADER = 150;
export const SCREEN_GAP = 16;

export interface ScreenLayout {
  cols: number;
  rows: number;
  fontPx: number;
}

export function screenLayout(tables: number, maxSeats: number, w: number, h: number): ScreenLayout {
  const availW = w - 2 * SCREEN_PAD;
  const availH = h - 2 * SCREEN_PAD - SCREEN_HEADER;
  let best: ScreenLayout = { cols: 1, rows: Math.max(1, tables), fontPx: 0 };
  for (let cols = 1; cols <= Math.max(1, tables); cols++) {
    const rows = Math.max(1, Math.ceil(tables / cols));
    const cellW = (availW - SCREEN_GAP * (cols - 1)) / cols;
    const cellH = (availH - SCREEN_GAP * (rows - 1)) / rows;
    const fontPx = Math.min(cellH / (3.6 + 2.1 * maxSeats), cellW / 13.5, 34);
    if (fontPx > best.fontPx) best = { cols, rows, fontPx };
  }
  return { ...best, fontPx: Math.max(12, Math.floor(best.fontPx)) };
}
