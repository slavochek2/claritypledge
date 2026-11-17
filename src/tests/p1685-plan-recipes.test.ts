/**
 * P1685 — the Listening Game as its own step: plan order in every flow, the tracked part, the minutes, the switch,
 * the resume point, the migration and the video address.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicMediaUrl } from '@/lib/public-media';
import {
  ALL_STEPS, buildPlan, CLIP_SECONDS, finishedSteps, minutesFor, PART_VERSIONS, PLAYBACK_RATE, STEP_LABELS, STEP_PART,
  OBSERVED_TIME_FACTOR, stepMinutes, stepSeconds, watchSeconds,
} from '@/app/prototypes/events/prep/prep-plan';
import { prepareStepsFor } from '@/app/prototypes/events/prep/prep-timing';
import { resumeScreenOf } from '@/app/prototypes/events/prep/prep-resume';
import { CLARITY_NIGHT_RECIPE, SALES_MASTERMIND_RECIPE, SOCIAL_HIKE_RECIPE } from '@/app/prototypes/events/series-recipes';
import { listeningGamePosterUrl, listeningGameVideoUrl, LISTENING_GAME_COPY } from '@/app/prototypes/events/prep/listening-game';
import { JOIN_LEARNING_STEPS, STANDALONE_STEPS } from '@/app/prototypes/events/prep/PreparePage';
import type { PrepPartRow } from '@/app/data/event-prep-service';

const cards = { cmp7: 0, stake: 0 };
const T0 = '2026-10-01T10:00:00.000Z';
const T1 = '2026-10-28T08:00:00.000Z';
const done = (part: PrepPartRow['part'], at = T0): PrepPartRow => ({ part, contentVersion: PART_VERSIONS[part], completedAt: at, skippedAt: null });
const night = { flow: null, seriesSlug: 'clarity-night' } as never;
const hike = { flow: 'social-hike', seriesSlug: null } as never;
const mastermindBefore = { flow: 'sales-mastermind', seriesSlug: null, canvasTiming: 'before' } as never;
const mastermindAtEvent = { flow: 'sales-mastermind', seriesSlug: null, canvasTiming: 'at_event' } as never;
const planOf = (event: never, over: Partial<Parameters<typeof buildPlan>[0]> = {}) =>
  buildPlan({ parts: [], startedAt: null, hasStatementTag: true, eventPointCount: 5, steps: prepareStepsFor(event), keepFinished: false, ...over });

describe('P1685 step order (founder 2026-11-16: the game comes before the principle everywhere)', () => {
  it('standalone, join and the base list all put the game right before the principle', () => {
    expect([...STANDALONE_STEPS]).toEqual(['story', 'game', 'principle', 'cmp7', 'misunderstanding']);
    expect([...JOIN_LEARNING_STEPS]).toEqual(['story', 'game', 'principle', 'cmp7']);
    expect([...ALL_STEPS]).toEqual(['welcome', 'story', 'game', 'principle', 'cmp7', 'stake', 'research']);
  });
  it('Clarity Night, a hike and the sales mastermind (both timings) have it before the principle', () => {
    expect(planOf(night)).toEqual(['welcome', 'story', 'game', 'principle', 'cmp7', 'stake', 'research']);
    expect(planOf(hike, { keepFinished: true })).toEqual(['story', 'game', 'principle', 'cmp7', 'stake']);
    expect(planOf(mastermindBefore, { keepFinished: true, canvas: true })).toEqual(['story', 'game', 'principle', 'cmp7', 'canvas']);
    expect(planOf(mastermindAtEvent, { keepFinished: true })).toEqual(['story', 'game', 'principle', 'cmp7', 'stake']);
    expect(SALES_MASTERMIND_RECIPE.prepare.steps).toEqual(['story', 'game', 'principle', 'cmp7', 'canvas']);
  });
  it('the step has a label and is the listening_game part', () => {
    expect(STEP_LABELS.game).toMatch(/Listening Game/);
    expect(STEP_PART.game).toBe('listening_game');
    expect(PART_VERSIONS.listening_game).toBe(1);
  });
});

describe('P1685 a tracked part: once per person, resumes', () => {
  it('a returning attendee who finished it does not get the step again; a skipped one does', () => {
    expect(planOf(night, { parts: [done('listening_game')], startedAt: T1 })).not.toContain('game');
    const skipped: PrepPartRow[] = [{ part: 'listening_game', contentVersion: 1, completedAt: null, skippedAt: T0 }];
    expect(planOf(night, { parts: skipped, startedAt: T1 })).toContain('game');
  });
  it('finished during THIS preparation, it stays in the plan so the count does not shift mid-flow', () => {
    expect(planOf(night, { parts: [done('listening_game', T1)], startedAt: T1 })).toContain('game');
  });
  it('a hike keeps it shown as finished when done elsewhere', () => {
    const parts = [done('listening_game')];
    const plan = planOf(hike, { parts, startedAt: T1, keepFinished: true });
    expect(plan).toContain('game');
    expect(finishedSteps(plan, [], parts)).toEqual(['game']);
  });
  it('resumes on the game when it is the stored current step and not yet done', () => {
    const plan = planOf(night);
    expect(resumeScreenOf({ startedAt: T1, currentStep: 'game', plan, stepsDone: ['welcome', 'story'], keepFinished: false })).toBe('game');
    expect(resumeScreenOf({ startedAt: T1, currentStep: null, plan, stepsDone: ['welcome', 'story'], keepFinished: false })).toBe('game');
  });
});

describe('P1685 flag off removes the step', () => {
  afterEach(() => { CLARITY_NIGHT_RECIPE.prepare.listeningGame = true; SOCIAL_HIKE_RECIPE.prepare.listeningGame = true; SALES_MASTERMIND_RECIPE.prepare.listeningGame = true; });
  it('both recipes default on', () => {
    expect(CLARITY_NIGHT_RECIPE.prepare.listeningGame).toBe(true);
    expect(SOCIAL_HIKE_RECIPE.prepare.listeningGame).toBe(true);
    expect(SALES_MASTERMIND_RECIPE.prepare.listeningGame).toBe(true);
  });
  it('the plan is as before the game existed', () => {
    CLARITY_NIGHT_RECIPE.prepare.listeningGame = false;
    expect(planOf(night)).toEqual(['welcome', 'story', 'principle', 'cmp7', 'stake', 'research']);
    SOCIAL_HIKE_RECIPE.prepare.listeningGame = false;
    expect(planOf(hike, { keepFinished: true })).toEqual(['story', 'principle', 'cmp7', 'stake']);
    SALES_MASTERMIND_RECIPE.prepare.listeningGame = false;
    expect(planOf(mastermindBefore, { keepFinished: true, canvas: true })).toEqual(['story', 'principle', 'cmp7', 'canvas']);
    expect(planOf(mastermindAtEvent, { keepFinished: true })).toEqual(['story', 'principle', 'cmp7', 'stake']);
  });
});

describe('P1685 minutes come from the step itself', () => {
  it('the clip is 89.7 s at the playback rate', () => {
    expect(CLIP_SECONDS.listeningGame).toBe(89.7);
    expect(watchSeconds('listeningGame')).toBe(Math.round(89.7 / PLAYBACK_RATE));
  });
  it('stepSeconds(game) is the reading time of the written rules plus the watch time; the principle step no longer carries it', () => {
    const words = [LISTENING_GAME_COPY.heading, LISTENING_GAME_COPY.subtitle, LISTENING_GAME_COPY.rolesHeading, ...LISTENING_GAME_COPY.roles.flatMap((r) => [r.name, r.text]), LISTENING_GAME_COPY.closing].join(' ').split(/\s+/).filter(Boolean).length;
    const expected = (Math.round((words / 200) * 60) + watchSeconds('listeningGame')) * OBSERVED_TIME_FACTOR;
    expect(stepSeconds('game', cards, true)).toBe(expected);
    expect(stepSeconds('game', cards, false)).toBe(expected);
    expect(expected).toBeGreaterThan(watchSeconds('listeningGame'));
    expect(stepMinutes('game', cards, true)).toBe(Math.max(1, Math.round(expected / 60)));
  });
  it('the total counts the game row, so the title and the rows agree', () => {
    const withGame = ['principle', 'game'] as const;
    expect(minutesFor([...withGame], cards, true)).toBe(stepMinutes('principle', cards, true) + stepMinutes('game', cards, true));
    expect(minutesFor([...withGame], cards, true)).toBeGreaterThan(minutesFor(['principle'], cards, true));
  });
});

describe('P1685 the written rules (D2) are founder-approved text in one constant', () => {
  it('reads verbatim', () => {
    expect(LISTENING_GAME_COPY.heading).toBe('The Listening Game');
    expect(LISTENING_GAME_COPY.subtitle).toBe('What you mean (intended meaning) and what the other person understands (interpreted meaning) often differ, and the gap stays hidden. The Listening Game gives you roles that reveal it in 3 seconds.');
    expect(LISTENING_GAME_COPY.rolesHeading).toBe('The roles');
    expect(LISTENING_GAME_COPY.roles).toEqual([
      { name: 'Speaker', text: 'shares anything they like, then asks: "How well do you think you understand me, from 0 to 10?"' },
      { name: 'Listener', text: 'explains back what they heard, without arguing. Their own view waits until they switch roles.' },
      { name: 'Observer', text: 'rings the bell when the listener steps out of their role, or when one person takes most of the speaking time.' },
    ]);
    expect(LISTENING_GAME_COPY.closing).toBe('When everyone knows the roles, asking "did I get you?" stops being awkward. It\'s just the game.');
    expect(STEP_LABELS.game).toBe('The Listening Game: how to reveal the gap in 3 seconds');
  });
});

describe('P1685 the migration widens the two CHECKs and nothing else', () => {
  const sql = readFileSync('supabase/migrations/20261116113000_p1685_listening_game_step_and_part.sql', 'utf8');
  const origin = readFileSync('supabase/migrations/20261001120000_p1336_event_preparations.sql', 'utf8');
  it('keeps every value the original constraints held and adds the new ones', () => {
    const list = (src: string, re: RegExp) => [...(src.match(re)?.[1] ?? '').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    const steps = list(sql, /current_step IN \(([^)]*)\)/);
    const parts = list(sql, /part IN \(([^)]*)\)/);
    for (const v of list(origin, /current_step IN \(([^)]*)\)/)) expect(steps).toContain(v);
    for (const v of list(origin, /part TEXT NOT NULL CHECK \(part IN \(([^)]*)\)/)) expect(parts).toContain(v);
    expect(steps).toContain('game');
    expect(parts).toContain('listening_game');
    // 'canvas' stays out of current_step on purpose (the app never stores it there).
    expect(steps).not.toContain('canvas');
  });
  it('touches only those two constraints, additively', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS event_preparations_current_step_check/);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS person_prep_parts_part_check/);
    expect(sql).not.toMatch(/DROP (TABLE|COLUMN|POLICY|FUNCTION)/i);
    expect(sql).toMatch(/client-safe/);
  });
});

describe('P1685 the video address', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('the production branch is the media bucket URL, never a local path', () => {
    vi.stubEnv('DEV', false);
    expect(listeningGameVideoUrl()).toBe(publicMediaUrl('event-prep/listening-game-v4.mp4'));
    expect(listeningGamePosterUrl()).toBe(publicMediaUrl('event-prep/listening-game-v4-poster.jpg'));
    expect(listeningGameVideoUrl()).not.toContain('local-media');
  });
  it('local in dev; the poster sits next to it', () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(listeningGameVideoUrl()).toBe('/local-media/event-prep/listening-game-v4.mp4');
    expect(listeningGamePosterUrl()).toBe('/local-media/event-prep/listening-game-v4-poster.jpg');
  });
});
