/**
 * P1336 — the plan, the minutes and the progress every preparation surface reads.
 * ACs: returning person sees rows 3 (decision only), 5, 6; per-part completion with versions
 * (bump re-shows only that part, skipped is not completed); zero points / no tag drop step 5;
 * minutes = sum of the plan rows; "Step k of {remaining}".
 */
import { describe, expect, it } from 'vitest';
import type { PrepPartRow } from '@/app/data/event-prep-service';
import {
  buildPlan,
  eventTopic,
  isNewPerson,
  minutesFor,
  PART_VERSIONS,
  progressOf,
  remainingSteps,
  showsPrincipleIntro,
  stepLabel,
  stepMinutes,
  watchSeconds,
} from '@/app/prototypes/events/prep/prep-plan';

const T0 = '2026-09-01T10:00:00.000Z';
const T1 = '2026-10-01T10:00:00.000Z';
const done = (part: PrepPartRow['part'], at = T0, version = PART_VERSIONS[part]): PrepPartRow => ({
  part,
  contentVersion: version,
  completedAt: at,
  skippedAt: null,
});
const ALL_DONE: PrepPartRow[] = [done('intro_video'), done('cognitive_video'), done('principle_intro'), done('cmp7')];

describe('buildPlan', () => {
  it('a new registrant has all six steps', () => {
    expect(buildPlan({ parts: [], startedAt: null, hasStatementTag: true, eventPointCount: 6 })).toEqual([
      'welcome', 'story', 'principle', 'cmp7', 'stake', 'research',
    ]);
  });

  it('a returning person (intro done) has the decision, the positions and the research only', () => {
    const plan = buildPlan({ parts: ALL_DONE, startedAt: T1, hasStatementTag: true, eventPointCount: 6 });
    expect(plan).toEqual(['principle', 'stake', 'research']);
    expect(showsPrincipleIntro(ALL_DONE, T1)).toBe(false);
  });

  it('bumping one part version re-shows only that part', () => {
    const stale = [done('intro_video', T0, PART_VERSIONS.intro_video - 1 || 0), done('cognitive_video'), done('principle_intro'), done('cmp7')];
    // version 0 < current 1 → not done
    expect(buildPlan({ parts: stale, startedAt: T1, hasStatementTag: true, eventPointCount: 3 })).toEqual([
      'welcome', 'principle', 'stake', 'research',
    ]);
  });

  it('a skipped part is not completed', () => {
    const skipped: PrepPartRow[] = [{ part: 'cmp7', contentVersion: 1, completedAt: null, skippedAt: T0 }];
    expect(buildPlan({ parts: skipped, startedAt: T1, hasStatementTag: false, eventPointCount: 0 })).toContain('cmp7');
    expect(isNewPerson(skipped)).toBe(true);
  });

  it('a part completed during THIS preparation stays in the plan (the count does not shift mid-flow)', () => {
    const parts = [done('intro_video', T1)];
    expect(buildPlan({ parts, startedAt: T1, hasStatementTag: true, eventPointCount: 2 })[0]).toBe('welcome');
  });

  it('zero event points or no statement tag drops step 5; unknown count keeps it', () => {
    expect(buildPlan({ parts: [], startedAt: null, hasStatementTag: true, eventPointCount: 0 })).not.toContain('stake');
    expect(buildPlan({ parts: [], startedAt: null, hasStatementTag: false, eventPointCount: 6 })).not.toContain('stake');
    expect(buildPlan({ parts: [], startedAt: null, hasStatementTag: true, eventPointCount: null })).toContain('stake');
  });
});

describe('minutes', () => {
  it('the question equals the sum of the plan rows', () => {
    const cards = { cmp7: 7, stake: 6 };
    const plan = buildPlan({ parts: [], startedAt: null, hasStatementTag: true, eventPointCount: 6 });
    const rows = plan.map((s) => stepMinutes(s, cards, true));
    expect(minutesFor(plan, cards, true)).toBe(rows.reduce((a, b) => a + b, 0));
  });

  it('dropping step 5 recomputes the minutes', () => {
    const cards = { cmp7: 7, stake: 0 };
    const withStake = minutesFor(['welcome', 'story', 'principle', 'cmp7', 'stake', 'research'], { cmp7: 7, stake: 6 }, true);
    const without = minutesFor(['welcome', 'story', 'principle', 'cmp7', 'research'], cards, true);
    expect(without).toBeLessThan(withStake);
  });

  it('clips count real watching time at 1.15x; every row is at least 1 minute', () => {
    expect(watchSeconds('welcome')).toBe(121);
    expect(watchSeconds('story')).toBe(73);
    expect(stepMinutes('cmp7', { cmp7: 0, stake: 0 }, true)).toBe(1);
  });

  it('the principle without its intro clip is shorter', () => {
    expect(stepMinutes('principle', { cmp7: 0, stake: 0 }, false)).toBeLessThan(stepMinutes('principle', { cmp7: 0, stake: 0 }, true) + 1);
  });
});

describe('progress', () => {
  it('k of M counts only plan steps; complete reads M of M', () => {
    const plan = ['principle', 'stake', 'research'] as const;
    expect(progressOf([...plan], ['principle'], null)).toEqual({ done: 1, total: 3, complete: false });
    expect(progressOf([...plan], ['principle'], T1)).toEqual({ done: 3, total: 3, complete: true });
    expect(remainingSteps([...plan], ['principle'])).toEqual(['stake', 'research']);
  });
});

describe('copy helpers', () => {
  it('step 5 is templated from the point count and the topic', () => {
    expect(stepLabel('stake', 6, 'AI and Your Ikigai')).toBe('Set your positions on 6 points about “AI and Your Ikigai”');
    expect(stepLabel('research', 6, 'x')).toBe("Decide if you'd like to volunteer in R&D");
  });

  it('eventTopic strips the series prefix and keeps the first sentence', () => {
    expect(eventTopic('Clarity Night #2: AI and Your Ikigai. Sinek, Tan, Naval, Watts and Brooks Disagree')).toBe('AI and Your Ikigai');
    expect(eventTopic('Sunday hike')).toBe('Sunday hike');
  });
});
