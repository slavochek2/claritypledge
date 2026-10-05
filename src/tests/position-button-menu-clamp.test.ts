/**
 * @file position-button-menu-clamp.test.ts
 * @description The PositionButtons dropdown is centred on its segment; near a
 * viewport edge it must clamp so the whole menu stays on screen (8px margin).
 * jsdom does no layout, so this pins the pure clamp math at real phone widths.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { clampMenuCenter } from '@/app/components/shared/menu-clamp';

const original = window.innerWidth;
const setWidth = (w: number) => Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });

afterEach(() => setWidth(original));

describe('clampMenuCenter', () => {
  it('pulls a right-edge "Agree" menu back inside a 375px viewport', () => {
    setWidth(375);
    // Agree segment measured at 244..326 on /feed?tab=points at 375px → centre 285.
    const c = clampMenuCenter(285, 170);
    expect(c + 85).toBeLessThanOrEqual(375 - 8);
    expect(c).toBe(282);
  });

  it('pushes a left-edge menu right at 320px', () => {
    setWidth(320);
    expect(clampMenuCenter(20, 170)).toBe(93);
  });

  it('leaves a menu that already fits untouched', () => {
    setWidth(375);
    expect(clampMenuCenter(187.5, 170)).toBe(187.5);
  });

  it('centres in the viewport when the menu is wider than the space', () => {
    setWidth(150);
    expect(clampMenuCenter(10, 170)).toBe(75);
  });
});
