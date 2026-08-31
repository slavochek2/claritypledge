/**
 * @file p1179-design-system-reuse.test.ts
 * @description P1179 UI-1: the control is built from the existing design system.
 *
 * Founder, verbatim: "needs to follow our design please." This asserts it
 * against the component SOURCE, because the property is about which tokens the
 * file reaches for — a render assertion on the resulting class string would pass
 * just as happily on a hand-rolled copy of the same pixels.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(process.cwd(), 'src/app/components/layout/event-links-menu.tsx'),
  'utf8'
);

describe('P1179 UI-1 — built from the existing design system', () => {
  it('takes the room\'s existing navy/44px treatment from meeting-terms-page, not a local copy', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*ANSWER_BUTTON_CLASS[^}]*\}\s*from\s*['"]@\/app\/pages\/meeting-terms-page['"]/);
  });

  it('uses the existing ui/drawer sheet primitive rather than a new overlay', () => {
    expect(SRC).toMatch(/from\s*['"]@\/components\/ui\/drawer['"]/);
    expect(SRC).toContain('<Drawer');
    expect(SRC).toContain('DrawerContent');
  });

  it('introduces no new colour — no raw hex literal anywhere in the component', () => {
    const hexes = SRC.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes).toEqual([]);
  });

  it('introduces no new radius — no arbitrary rounded-[...] value', () => {
    expect(SRC).not.toMatch(/rounded-\[/);
  });

  it('introduces no new control height — the only height token is the shared 44px', () => {
    const heights = SRC.match(/\b(?:min-)?h-\[[^\]]+\]/g) ?? [];
    expect(heights.filter(h => !h.includes('44px'))).toEqual([]);
  });

  /**
   * SUPERSEDED 2026-08-31. This assertion used to read `not.toContain('DropdownMenu')`
   * — "the approved open shape is a bottom sheet", full stop. The founder revised
   * that after seeing it on a monitor: "on desktop it just like slides up ... it
   * should be like we have the use cases you know at the top and then I click".
   *
   * The contract is now a SPLIT, and both halves are load-bearing, so both are
   * asserted. Deleting the test would have left the phone shape unguarded, which
   * is the half with the actual design argument behind it (thumb reach, one hand,
   * standing in a room).
   */
  it('opens as a bottom sheet on phones and an anchored dropdown on desktop', () => {
    expect(SRC).toContain('Drawer');
    expect(SRC).toContain('DropdownMenu');
  });

  it('reuses the nav\'s own dropdown primitive rather than a second menu system', () => {
    // If this ever imports Popover instead, the desktop menu stops matching
    // "Use cases" — which is the entire reason the shape was changed.
    expect(SRC).toContain("@/components/ui/dropdown-menu");
    expect(SRC).not.toContain('@/components/ui/popover');
  });

  it('anchors the desktop menu to the END, where the trigger actually sits', () => {
    // align="start" would push a 64-wide panel off the right edge of the viewport.
    expect(SRC).toMatch(/align="end"/);
  });
});
