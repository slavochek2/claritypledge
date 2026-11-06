/**
 * P1529 founder UAT round 1 (2026-11-06), attendee side: the limit field's parsing, the person's own arrival time, the owner-only canvas
 * step in preparation, the role's preparation minutes, and the room's "Learn and prepare". Clarity Night and Social Hike stay as they were.
 */
import { describe, expect, it } from 'vitest';
import { limitForUpdate, parseLimit } from '@/app/prototypes/events/event-limit';
import { arrivalDate, calendarWindow, ownTimeLine } from '@/app/prototypes/events/event-doors';
import { arrivalOf } from '@/app/prototypes/events/use-my-arrival';
import { buildPlan, ALL_STEPS, STEP_LABELS, stepMinutes } from '@/app/prototypes/events/prep/prep-plan';
import { recipeForEvent, SALES_MASTERMIND_RECIPE, CLARITY_NIGHT_RECIPE, SOCIAL_HIKE_RECIPE } from '@/app/prototypes/events/series-recipes';
import { OBSERVER_PREP_MINUTES, OWNER_PREP_MINUTES, prepOptions } from '@/app/prototypes/events/components/registration-copy';

const START = '2026-11-14T11:30:00+00:00'; // 18:30 in Bangkok, doors 18:00

describe('the limit field', () => {
  it('empty or not a whole number of at least 1 is no limit', () => {
    expect(parseLimit('')).toBeUndefined();
    expect(parseLimit('  ')).toBeUndefined();
    expect(parseLimit('0')).toBeUndefined();
    expect(parseLimit('2.5')).toBeUndefined();
    expect(parseLimit('abc')).toBeUndefined();
    expect(parseLimit('24')).toBe(24);
  });
  it('the edit form removes a limit with null and sets one with a number', () => {
    expect(limitForUpdate('')).toBeNull();
    expect(limitForUpdate('12')).toBe(12);
  });
});

describe('the person\'s own arrival', () => {
  it('doors people arrive 30 minutes before the start; everyone else at the start', () => {
    expect(arrivalDate(START, true).toISOString()).toBe('2026-11-14T11:00:00.000Z');
    expect(arrivalDate(START, false).toISOString()).toBe('2026-11-14T11:30:00.000Z');
  });
  it('the calendar invite starts at the person\'s arrival and still ends with the event', () => {
    const w = calendarWindow(START, 120, true);
    expect(w.startDate.toISOString()).toBe('2026-11-14T11:00:00.000Z');
    expect(w.endDate.toISOString()).toBe('2026-11-14T13:30:00.000Z');
    expect(calendarWindow(START, 120, false).startDate.toISOString()).toBe('2026-11-14T11:30:00.000Z');
  });
  it('the thank-you says the person\'s own time', () => {
    expect(ownTimeLine(START, true, 'Asia/Bangkok')).toBe('Please come at 18:00.');
    expect(ownTimeLine(START, false, 'Asia/Bangkok')).toBe('We start at 18:30 sharp.');
  });
  it('role and arrival come from the stored answers, which are unchanged', () => {
    expect(arrivalOf({ participation: 'canvas_before', observerPrep: null })).toEqual({ owner: true, atDoors: false });
    expect(arrivalOf({ participation: 'canvas_at_doors', observerPrep: null })).toEqual({ owner: true, atDoors: true });
    expect(arrivalOf({ participation: 'observer', observerPrep: 'doors' })).toEqual({ owner: false, atDoors: true });
    expect(arrivalOf({ participation: 'observer', observerPrep: 'home' })).toEqual({ owner: false, atDoors: false });
    expect(arrivalOf(null)).toBeNull();
  });
  it('the registration option formats the doors time from the event', () => {
    expect(prepOptions('improve', '18:30')[1]!.label).toBe("I'll come earlier, at 18:30, and prepare there");
    expect(prepOptions('help', '18:00').map(o => o.value)).toEqual(['home', 'event']);
  });
});

describe('preparation: the canvas is step 4, for owners only', () => {
  const base = { parts: [], startedAt: null, hasStatementTag: true, eventPointCount: 5, steps: SALES_MASTERMIND_RECIPE.prepare.steps, keepFinished: true };
  it('an owner has learning, principle, survey, then the canvas', () => {
    expect(buildPlan({ ...base, canvas: true })).toEqual(['story', 'principle', 'cmp7', 'canvas']);
  });
  it('an observer does not see the canvas step', () => {
    expect(buildPlan({ ...base, canvas: false })).toEqual(['story', 'principle', 'cmp7']);
    expect(buildPlan(base)).toEqual(['story', 'principle', 'cmp7']);
  });
  it('the step is named and has minutes; Clarity Night and the hike never get it', () => {
    expect(STEP_LABELS.canvas).toBe('Your Clarity Canvas');
    expect(stepMinutes('canvas', { cmp7: 0, stake: 0 }, false)).toBeGreaterThan(1);
    expect(ALL_STEPS).not.toContain('canvas');
    expect(CLARITY_NIGHT_RECIPE.prepare.steps).not.toContain('canvas');
    expect(SOCIAL_HIKE_RECIPE.prepare.steps).not.toContain('canvas');
  });
  it('the time by role is 15 for owners and 7 for observers', () => {
    expect(OWNER_PREP_MINUTES).toBe(15);
    expect(OBSERVER_PREP_MINUTES).toBe(7);
  });
});

describe('the event room', () => {
  it('the mastermind room has "Learn and prepare" in its bar, as the hikes have their Learn step', () => {
    expect(recipeForEvent({ flow: 'sales-mastermind' }).room.steps?.learn).toBe('Learn and prepare');
    expect(SOCIAL_HIKE_RECIPE.room.steps?.learn).toBe('Learn the principle');
  });
  it('Clarity Night\'s room keeps no learn step', () => {
    expect(CLARITY_NIGHT_RECIPE.room.steps).toBeNull();
  });
});
