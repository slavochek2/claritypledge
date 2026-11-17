import { describe, expect, it } from 'vitest';
import type { EventWithHost } from '@/app/types';
import { hikeIntroductionMinutes } from '@/app/prototypes/events/components/use-hike-minutes';
import {
  buildPlan,
  CANVAS_STEP_SECONDS,
  CLIP_SECONDS,
  decisionSeconds,
  LISTENING_GAME_WORDS,
  OBSERVED_TIME_FACTOR,
  PLAYBACK_RATE,
  preparationMinutes,
  PRINCIPLE_WORDS,
  SECONDS_PER_DECISION,
  stepSeconds,
  watchSeconds,
  type CardCounts,
} from '@/app/prototypes/events/prep/prep-plan';
import { prepareStepsFor, prepStatementTag } from '@/app/prototypes/events/prep/prep-timing';
import { recipeForEvent } from '@/app/prototypes/events/series-recipes';

/** The reading rate the rule assumes (the rule's own constant is private; typed here as the independent oracle's input). */
const READING_WORDS_PER_MINUTE = 200;

const hike = { id: 'h1', slug: 'hike-1', seriesSlug: 'social-hike', flow: 'social-hike' } as unknown as EventWithHost;

/** What use-prep-state does for a new person: same plan inputs, full card counts, nothing done. */
function preparationPageMinutes(event: EventWithHost, cards: CardCounts): number {
  const plan = buildPlan({
    parts: [],
    startedAt: null,
    hasStatementTag: !!prepStatementTag(event),
    eventPointCount: cards.stake,
    steps: prepareStepsFor(event),
    keepFinished: !!recipeForEvent(event).prepare.keepFinished,
  });
  return preparationMinutes(plan, [], cards, true);
}

describe('P1675 R8: the minutes match the real time', () => {
  it('(a) the form and the preparation page return the same number for a new person', () => {
    for (let n = 6; n <= 12; n++) {
      const cards = { cmp7: n, stake: 0 };
      expect(hikeIntroductionMinutes(hike, cards)).toBe(preparationPageMinutes(hike, cards));
    }
  });

  it('(b) the number is the sum of per-row rounded (unscaled seconds x factor); 8 and 9 cards give 14 or 15', () => {
    for (const n of [7, 8, 9]) {
      const cards = { cmp7: n, stake: 0 };
      const plan = buildPlan({ parts: [], startedAt: null, hasStatementTag: !!prepStatementTag(hike), eventPointCount: 0, steps: prepareStepsFor(hike), keepFinished: !!recipeForEvent(hike).prepare.keepFinished });
      // Unscaled seconds, recomputed from the rule's raw inputs (clip length / playback rate, word counts / reading rate,
      // seconds per decision). Deliberately NOT stepSeconds or its factor: the oracle must not share the code under test.
      const clip = (c: keyof typeof CLIP_SECONDS) => Math.round(CLIP_SECONDS[c] / PLAYBACK_RATE);
      const reading = (words: number) => Math.round((words / READING_WORDS_PER_MINUTE) * 60);
      const unscaled = (s: string): number => {
        switch (s) {
          case 'welcome': return clip('welcome');
          case 'story': return clip('story');
          case 'game': return reading(LISTENING_GAME_WORDS) + clip('listeningGame');
          case 'principle': return clip('principle') + reading(PRINCIPLE_WORDS) + 2 * SECONDS_PER_DECISION;
          case 'cmp7': return n * SECONDS_PER_DECISION;
          case 'stake': return cards.stake * SECONDS_PER_DECISION;
          case 'research': return clip('research') + SECONDS_PER_DECISION;
          default: throw new Error(`no raw-input oracle for step ${s}`);
        }
      };
      const expected = plan.reduce((sum, s) => sum + Math.max(1, Math.round((unscaled(s) * OBSERVED_TIME_FACTOR) / 60)), 0);
      const actual = hikeIntroductionMinutes(hike, cards);
      expect(actual).toBe(expected);
      if (n === 8 || n === 9) expect([14, 15]).toContain(actual);
    }
  });

  it('(c) canvas seconds are unscaled', () => {
    expect(stepSeconds('canvas', { cmp7: 8, stake: 3 }, true)).toBe(CANVAS_STEP_SECONDS);
  });

  it('(d) watchSeconds is the real clip length at 1.15x, unchanged', () => {
    for (const k of Object.keys(CLIP_SECONDS) as (keyof typeof CLIP_SECONDS)[]) {
      expect(watchSeconds(k)).toBe(Math.round(CLIP_SECONDS[k] / PLAYBACK_RATE));
    }
    expect(watchSeconds('welcome')).toBe(121);
  });

  it("(e) /prepare's misunderstanding row uses the factor", () => {
    expect(decisionSeconds(9)).toBe(9 * SECONDS_PER_DECISION * OBSERVED_TIME_FACTOR);
    expect(OBSERVED_TIME_FACTOR).toBe(15 / 8);
  });
});
