/**
 * @file p1336-letter-reveals-off.test.tsx
 * @description P1336 — `reveals` option on useLetterReadingState.
 *
 * Default (omitted / true): the reading walk is unchanged — every engage step is
 * followed by its reveal phase. `reveals: false`: the reveal phases are skipped,
 * so the walk goes story-rate → point → point → transition with no reveal between.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/app/data/letters-service', () => ({
  submitRating: vi.fn(),
  revealPrediction: vi.fn(),
  submitPointResponse: vi.fn(),
  updateDeliveryStatus: vi.fn().mockResolvedValue(undefined),
  updateDeliveryStatusByToken: vi.fn().mockResolvedValue(undefined),
  submitPointResponseByToken: vi.fn(),
  submitRatingByToken: vi.fn(),
  revealPredictionByToken: vi.fn(),
}));

import { useLetterReadingState, type StoryPhase } from '@/app/hooks/useLetterReadingState';
import type { LetterStorySnapshot } from '@/app/types';

// Story first (lead_count 0), then two points.
const SNAPSHOT: LetterStorySnapshot = {
  letter_id: 'letter-id-1',
  story_id: 'story-id-1',
  version_id: 'version-id-1',
  position: 0,
  visibility: 'public',
  point_config: {
    storyText: 'Story text',
    lead_count: 0,
    points: [
      { id: 'point-id-1', text: 'Point one', authorPosition: 'agree' },
      { id: 'point-id-2', text: 'Point two', authorPosition: 'disagree' },
    ],
  },
};

function walk(reveals: boolean | undefined): StoryPhase[] {
  const { result } = renderHook(() =>
    useLetterReadingState({
      deliveryId: `preview-test-${String(reveals)}`,
      senderId: '',
      snapshots: [SNAPSHOT],
      previewMode: true,
      ...(reveals === undefined ? {} : { reveals }),
    })
  );
  const seen: StoryPhase[] = [result.current.currentPhase];
  const record = () => {
    const p = result.current.currentPhase;
    if (seen[seen.length - 1] !== p) seen.push(p);
  };
  return Object.assign(seen, { result, record }) as unknown as StoryPhase[] & {
    result: typeof result;
    record: () => void;
  };
}

async function run(reveals: boolean | undefined): Promise<StoryPhase[]> {
  sessionStorage.clear();
  localStorage.clear();
  const seen = walk(reveals) as StoryPhase[] & { result: { current: ReturnType<typeof useLetterReadingState> }; record: () => void };
  const { result, record } = seen;
  const step = async (fn: () => unknown) => {
    await act(async () => { await fn(); });
    record();
  };
  await step(() => result.current.submitStoryRating(7));
  if (result.current.currentPhase === 'story-revealed') await step(() => result.current.advanceFromStoryReveal());
  await step(() => result.current.submitPointPosition('point-id-1', 'agree'));
  if (result.current.currentPhase === 'remaining-point-revealed') await step(() => result.current.advanceFromRemainingPointReveal());
  await step(() => result.current.submitPointPosition('point-id-2', 'disagree'));
  if (result.current.currentPhase === 'remaining-point-revealed') await step(() => result.current.advanceFromRemainingPointReveal());
  return [...seen];
}

describe('P1336 useLetterReadingState reveals option', () => {
  it('default: every engage step is followed by its reveal (unchanged behaviour)', async () => {
    expect(await run(undefined)).toEqual([
      'story-rate',
      'story-revealed',
      'remaining-point-engage',
      'remaining-point-revealed',
      'remaining-point-engage',
      'remaining-point-revealed',
      'transition',
    ]);
  });

  it('reveals: true is identical to the default', async () => {
    expect(await run(true)).toEqual(await run(undefined));
  });

  it('reveals: false skips every reveal phase', async () => {
    const phases = await run(false);
    expect(phases).toEqual(['story-rate', 'remaining-point-engage', 'transition']);
    expect(phases.some((p) => p.endsWith('revealed'))).toBe(false);
  });
});
