/**
 * @file p1468-card-slot-link.test.tsx
 * @description P1468 — `CardSlotLink` moves, unchanged, into presentational/card-footer.tsx so the
 * Day board can render CP's `+ Add a story` without importing card-footer-controls.tsx (which
 * imports analytics). The add-story copy has one home: the exported `ADD_STORY_COPY` there, which
 * `getPositionCTACopy` reads. CP call sites keep importing `CardSlotLink` from card-footer-controls.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as presentational from '@/app/components/shared/presentational/card-footer';
import * as controls from '@/app/components/shared/card-footer-controls';
import { getPositionCTACopy } from '@/app/utils/position-helpers';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

describe('P1468: CardSlotLink lives in presentational/card-footer.tsx', () => {
  it('card-footer-controls re-exports the very same component (CP call sites render the same output)', () => {
    expect(typeof presentational.CardSlotLink).toBe('function');
    expect(controls.CardSlotLink).toBe(presentational.CardSlotLink);
  });

  it('the add-story copy is one exported constant, and getPositionCTACopy reads it for every group', () => {
    expect(presentational.ADD_STORY_COPY).toEqual({ ctaText: '+ Add a story', ariaLabel: 'Add a story for this point' });
    for (const g of ['agree', 'disagree', 'unsure'] as const) {
      const c = getPositionCTACopy(g);
      expect(c.ctaText).toBe(presentational.ADD_STORY_COPY.ctaText);
      expect(c.ariaLabel).toBe(presentational.ADD_STORY_COPY.ariaLabel);
    }
    // the copy is written in card-footer.tsx only, never spelled again in position-helpers.ts
    const helpers = readFileSync(resolve(__dirname, '../app/utils/position-helpers.ts'), 'utf-8');
    expect(helpers).not.toContain("'+ Add a story'");
  });

  it('renders + Add a story with its accessible name, and the click does not bubble to the card', () => {
    const onClick = vi.fn();
    const outer = vi.fn();
    render(
      <div role="presentation" onClick={outer}>
        <presentational.CardSlotLink kind="add-story" copy={presentational.ADD_STORY_COPY} onClick={onClick} />
      </div>,
    );
    const b = screen.getByRole('button', { name: 'Add a story for this point' });
    expect(b.textContent).toBe('+ Add a story');
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('presentational/card-footer.tsx imports no product state and not position-helpers', () => {
    const src = readFileSync(resolve(__dirname, '../app/components/shared/presentational/card-footer.tsx'), 'utf-8');
    const specs = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) expect(s).not.toMatch(/mixpanel|supabase|position-helpers|\/auth|contexts?\//);
  });
});
