/**
 * P1529 E1/E2: events.canvas_timing: the mapping, the host's write, and what the sales mastermind's preparation holds.
 */
import { eventOptionalCreateColumns } from '@/app/data/event-create-columns';
import type { CreateEventInput } from '@/app/data/events-service.interface';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canvasTimingOf } from '@/app/types/event-fields';
import { eventUpdateColumns } from '@/app/data/event-write-columns';
import { buildPlan } from '@/app/prototypes/events/prep/prep-plan';
import { canvasAtEvent, MISUNDERSTANDING_TAG, prepareStepsFor, prepStatementTag } from '@/app/prototypes/events/prep/prep-timing';
import { arrivalLeadMinutes, calendarWindow, ownTimeLine } from '@/app/prototypes/events/event-doors';
import { recipeForEvent } from '@/app/prototypes/events/series-recipes';
import { prepOptions, prepQuestion } from '@/app/prototypes/events/components/registration-copy';

const mm = { flow: 'sales-mastermind', seriesSlug: null as string | null };

describe('E1 the setting', () => {
  it('reads anything but "before" as at the event (the default)', () => {
    expect(canvasTimingOf('before')).toBe('before');
    expect(canvasTimingOf('at_event')).toBe('at_event');
    expect(canvasTimingOf(undefined)).toBe('at_event');
    expect(canvasTimingOf(null)).toBe('at_event');
    expect(canvasTimingOf('nonsense')).toBe('at_event');
  });
  it('is written only when the host passed it', () => {
    expect(eventUpdateColumns({ canvasTiming: 'before' })).toEqual({ canvas_timing: 'before' });
    expect(eventUpdateColumns({ title: 't' })).not.toHaveProperty('canvas_timing');
  });
  it('the migration adds a NOT NULL column defaulting to at_event with the two values checked', () => {
    const sql = readFileSync('supabase/migrations/20261112191500_p1529_canvas_timing.sql', 'utf8');
    expect(sql).toMatch(/canvas_timing text NOT NULL DEFAULT 'at_event'/);
    expect(sql).toMatch(/CHECK \(canvas_timing IN \('before', 'at_event'\)\)/);
    expect(sql).toMatch(/client-safe/);
  });
});

describe('E2 the preparation plan', () => {
  it('at the event (default): the communication part only, the misunderstanding points, no canvas step', () => {
    const steps = prepareStepsFor(mm);
    expect(steps).toEqual(['story', 'principle', 'game', 'cmp7', 'stake']);
    expect(prepStatementTag(mm)).toBe(MISUNDERSTANDING_TAG);
    const plan = buildPlan({ parts: [], startedAt: null, hasStatementTag: true, eventPointCount: 5, steps, keepFinished: true, canvas: true });
    expect(plan).toEqual(['story', 'principle', 'game', 'cmp7', 'stake']);
  });
  it('an explicit at_event reads the same', () => {
    expect(canvasAtEvent({ ...mm, canvasTiming: 'at_event' } as never)).toBe(true);
  });
  it('before the event: today\'s steps, canvas last, the event\'s own tag', () => {
    const ev = { ...mm, canvasTiming: 'before', statementTag: 'x1' } as never;
    expect(prepareStepsFor(ev)).toEqual(recipeForEvent(ev).prepare.steps);
    expect(prepareStepsFor(ev)).toContain('canvas');
    expect(prepStatementTag(ev)).toBe('x1');
    expect(buildPlan({ parts: [], startedAt: null, hasStatementTag: false, eventPointCount: 0, steps: prepareStepsFor(ev), keepFinished: true, canvas: true }).at(-1)).toBe('canvas');
  });
  it('every other flow is untouched, whatever its timing', () => {
    const night = { flow: null, seriesSlug: 'clarity-night', canvasTiming: 'at_event', statementTag: 'ikigai1' } as never;
    expect(canvasAtEvent(night)).toBe(false);
    expect(prepareStepsFor(night)).toEqual(recipeForEvent(night).prepare.steps);
    expect(prepStatementTag(night)).toBe('ikigai1');
  });
});

describe('E3 registration words', () => {
  it('one question for every role', () => {
    expect(prepQuestion('improve')).toBe('When will you do the 15-minute preparation?');
    expect(prepQuestion('help')).toBe(prepQuestion('improve'));
    expect(prepOptions('help').map((o) => o.value)).toEqual(['home', 'event']);
  });
});

describe('arrival lead: 15 minutes for the mastermind with the canvas at the event, 30 elsewhere', () => {
  const START = '2026-11-14T11:30:00+00:00'; // 18:30 Bangkok
  it('lead by event', () => {
    expect(arrivalLeadMinutes(mm as never)).toBe(15);
    expect(arrivalLeadMinutes({ ...mm, canvasTiming: 'before' } as never)).toBe(30);
    expect(arrivalLeadMinutes({ seriesSlug: 'clarity-night' } as never)).toBe(30);
  });
  it('calendar window and the finish line follow it', () => {
    expect(calendarWindow(START, 150, true, 15).startDate.toISOString()).toBe('2026-11-14T11:15:00.000Z');
    expect(calendarWindow(START, 150, true).startDate.toISOString()).toBe('2026-11-14T11:00:00.000Z');
    expect(calendarWindow(START, 150, false, 15).startDate.toISOString()).toBe(START.replace('+00:00', '.000Z'));
    expect(ownTimeLine(START, true, 'Asia/Bangkok', 15)).toBe('Please come at 18:15.');
    expect(ownTimeLine(START, true, 'Asia/Bangkok')).toBe('Please come at 18:00.');
  });
});

describe('createEvent writes the timing', () => {
  it('passes canvas_timing only when given', () => {
    const base = { title: 't' } as CreateEventInput;
    expect(eventOptionalCreateColumns(base)).not.toHaveProperty('canvas_timing');
    expect(eventOptionalCreateColumns({ ...base, canvasTiming: 'before' })).toHaveProperty('canvas_timing', 'before');
    const src = readFileSync('src/app/data/events-service-real.ts', 'utf8');
    expect(src).toContain('...eventOptionalCreateColumns(data)');
  });
});
