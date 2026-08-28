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

  it('is not a dropdown — the approved open shape is a bottom sheet', () => {
    expect(SRC).not.toContain('DropdownMenu');
  });
});
