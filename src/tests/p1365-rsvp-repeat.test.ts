/**
 * @file p1365-rsvp-repeat.test.ts
 * @description P1365 — desktop event page repeats the RSVP after a description
 * taller than the viewport. The geometry itself is covered by
 * e2e/p1365-rsvp-repeat.spec.ts (jsdom has no layout); this pins the gate and
 * the naming invariants.
 */
import { describe, it, expect } from 'vitest';
import { shouldShowRsvpRepeat, RSVP_REPEAT_LABEL, RSVP_REPEAT_LOADING_LABEL } from '@/app/prototypes/events/rsvp-repeat';

const base = {
  affordanceHidden: false,
  isRsvpd: false,
  isPast: false,
  isFull: false,
  descriptionTallerThanViewport: true,
};

describe('shouldShowRsvpRepeat', () => {
  it('shows for a non-RSVP’d viewer when the description is taller than the viewport', () => {
    expect(shouldShowRsvpRepeat(base)).toBe(true);
  });

  it('never shows when the description fits in the viewport', () => {
    expect(shouldShowRsvpRepeat({ ...base, descriptionTallerThanViewport: false })).toBe(false);
  });

  it.each([
    ['host or cancelled', { affordanceHidden: true }],
    ['already RSVP’d', { isRsvpd: true }],
    ['past', { isPast: true }],
    ['full', { isFull: true }],
  ])('never shows when %s', (_label, over) => {
    expect(shouldShowRsvpRepeat({ ...base, ...over })).toBe(false);
  });
});

describe('naming invariants', () => {
  const TOP_LABELS = ['Reserve a seat', 'Joining...', 'Event Ended', 'Event Full'];

  it('the repeat label contains no top-button label and vice versa (role locators match substrings)', () => {
    for (const mine of [RSVP_REPEAT_LABEL, RSVP_REPEAT_LOADING_LABEL]) {
      for (const top of TOP_LABELS) {
        expect(mine.toLowerCase()).not.toContain(top.toLowerCase());
        expect(top.toLowerCase()).not.toContain(mine.toLowerCase());
      }
    }
  });
});
