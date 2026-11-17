/**
 * P1675 UAT round 2 R10: the hike and Clarity Night show min(computed remaining, the recipe's stated minutes); the mastermind's
 * role minutes are untouched.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrepBlock } from '@/app/prototypes/events/prep/PrepPieces';
import { roomGatePrepLine } from '@/app/prototypes/events/prep/PrepRoom';
import type { EventWithHost } from '@/app/types';
import { hikeStatedMinutes } from '@/app/prototypes/events/components/use-hike-minutes';
import { planTotalMinutes, planTotalOnly } from '@/app/prototypes/events/prep/prep-resume';
import { CLARITY_NIGHT_RECIPE, EVENT_FLOWS, SOCIAL_HIKE_RECIPE, recipeForEvent } from '@/app/prototypes/events/series-recipes';

const hike = { id: 'h1', slug: 'hike-1', seriesSlug: 'social-hike', flow: 'social-hike' } as unknown as EventWithHost;
const mastermind = { id: 'm1', slug: 'mm', seriesSlug: 'sales-mastermind', flow: 'sales-mastermind' } as unknown as EventWithHost;

describe('P1675 R10: stated minutes', () => {
  it('the hike and Clarity Night recipes state 15, the mastermind states none', () => {
    expect(SOCIAL_HIKE_RECIPE.prepare.statedMinutes).toBe(15);
    expect(CLARITY_NIGHT_RECIPE.prepare.statedMinutes).toBe(15);
    expect(recipeForEvent(mastermind).prepare.statedMinutes).toBeUndefined();
  });

  it('the hike form number is the recipe value, with no point reads', () => {
    expect(hikeStatedMinutes(hike, true)).toBe(SOCIAL_HIKE_RECIPE.prepare.statedMinutes);
    expect(hikeStatedMinutes(hike, false)).toBeNull();
    expect(hikeStatedMinutes(null, true)).toBeNull();
  });

  it('recipe guard: every flow states 15 only for clarity-night and social-hike (no silent inheritance by a spread)', () => {
    for (const flow of EVENT_FLOWS) {
      const e = { id: 'x', slug: 'x', seriesSlug: flow, flow } as unknown as EventWithHost;
      const stated = recipeForEvent(e).prepare.statedMinutes;
      if (flow === 'clarity-night' || flow === 'social-hike') expect(stated).toBe(15);
      else expect(stated).toBeUndefined();
    }
  });

  it('totalOnly: only when the cap is in effect (computed above stated); otherwise rows show; mastermind always total-only', () => {
    expect(planTotalOnly({ mastermind: false, computed: 21, statedMinutes: 15 })).toBe(true);
    expect(planTotalOnly({ mastermind: false, computed: 15, statedMinutes: 15 })).toBe(false);
    expect(planTotalOnly({ mastermind: false, computed: 8, statedMinutes: 15 })).toBe(false);
    expect(planTotalOnly({ mastermind: false, computed: null, statedMinutes: 15 })).toBe(false);
    expect(planTotalOnly({ mastermind: false, computed: 21 })).toBe(false);
    expect(planTotalOnly({ mastermind: true, computed: 8 })).toBe(true);
  });

  it('the total is min(computed, stated): never above 15, only shrinks, null while computed is unknown', () => {
    const stated = SOCIAL_HIKE_RECIPE.prepare.statedMinutes;
    const total = (computed: number | null, untouched: boolean) => planTotalMinutes({ mastermind: false, untouched, roleMinutes: null, computed, statedMinutes: stated });
    expect(total(21, true)).toBe(15);
    expect(total(17, false)).toBe(15);
    expect(total(13, false)).toBe(13);
    expect(total(8, true)).toBe(8);
    expect(total(null, true)).toBeNull();
    expect(planTotalMinutes({ mastermind: false, untouched: true, roleMinutes: null, computed: 21 })).toBe(21);
  });

  it('the mastermind keeps its role minutes and ignores a stated value', () => {
    expect(planTotalMinutes({ mastermind: true, untouched: true, roleMinutes: 25, computed: 17 })).toBe(25);
    expect(planTotalMinutes({ mastermind: true, untouched: true, roleMinutes: 25, computed: 17, statedMinutes: 15 })).toBe(25);
    expect(planTotalMinutes({ mastermind: true, untouched: false, roleMinutes: 25, computed: 17, statedMinutes: 15 })).toBeNull();
  });

  it('the room gate line says the stated minutes for Clarity Night and hikes, and keeps "Ten minutes" otherwise (code review, Codex)', () => {
    const night = { id: 'n1', slug: 'night', seriesSlug: null, flow: null } as unknown as EventWithHost;
    expect(roomGatePrepLine(night)).toBe(`${CLARITY_NIGHT_RECIPE.prepare.statedMinutes} minutes of preparation lets you take part fully.`);
    expect(roomGatePrepLine(hike)).toBe(`${SOCIAL_HIKE_RECIPE.prepare.statedMinutes} minutes of preparation lets you take part fully.`);
    expect(roomGatePrepLine(mastermind)).toBe('Ten minutes of preparation lets you take part fully.');
  });

  it('while its minutes are loading, the question shows the series\' stated length, and 10 for a series without one', () => {
    const block = (pending?: number) => (
      <PrepBlock
        progress={{ done: 0, total: 4, complete: false } as never}
        minutes={null}
        pendingMinutes={pending}
        reminded={false}
        proof={{ line: null, people: [] }}
        onPrepare={vi.fn()}
        onRemind={vi.fn()}
      />
    );
    const { unmount } = render(block(CLARITY_NIGHT_RECIPE.prepare.statedMinutes));
    expect(screen.getByTestId('prep-question')).toHaveTextContent('Do you have 15 minutes to prepare for the event?');
    unmount();
    render(block(undefined));
    expect(screen.getByTestId('prep-question')).toHaveTextContent('Do you have 10 minutes to prepare for the event?');
  });

  it('a brand-new person is told the stated length even when the computed one is lower (a hike computing 14 says 15)', () => {
    expect(planTotalMinutes({ mastermind: false, untouched: true, roleMinutes: null, computed: 14, statedMinutes: 15, brandNew: true })).toBe(15);
    expect(planTotalOnly({ mastermind: false, computed: 14, statedMinutes: 15, brandNew: true })).toBe(true);
    // Not brand new (a step done, or parts learned elsewhere): the capped computed number, rows shown when under the cap.
    expect(planTotalMinutes({ mastermind: false, untouched: false, roleMinutes: null, computed: 14, statedMinutes: 15, brandNew: false })).toBe(14);
    expect(planTotalOnly({ mastermind: false, computed: 14, statedMinutes: 15, brandNew: false })).toBe(false);
    // Loading stays null for everyone.
    expect(planTotalMinutes({ mastermind: false, untouched: true, roleMinutes: null, computed: null, statedMinutes: 15, brandNew: true })).toBeNull();
  });
});
