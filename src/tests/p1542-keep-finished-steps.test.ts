// @vitest-environment jsdom
/**
 * P1542 founder decision (A), 2026-10-28: a hike's learning never drops steps the person already finished elsewhere.
 * Seen live: someone who had done the cognitive-understanding video and the cmp7 statements in an earlier preparation
 * opened the room's Learn view and got "Decide about your participation in a new social norm · Step 1 of 1" — the
 * once-per-person parts done before this registration's learning were removed from the plan. Founder: finished steps
 * stay in the list, shown finished (ticked), the person can go back to any of them, and they land on the next
 * unfinished step with honest numbering. Clarity Night's preparation keeps its shortened plan (P1336, e2e
 * p1336-registration-prep "returning person").
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const before = '2026-10-01T10:00:00.000Z';
vi.mock('@/app/data/event-prep-service', () => ({
  getMyPreparation: vi.fn(async () => ({
    eventId: 'ev-1', profileId: 'u1', prepChoice: 'now', currentStep: null, stepsDone: [],
    startedAt: '2026-10-28T08:00:00.000Z', completedAt: null,
  })),
  getMyPrepParts: vi.fn(async () => [
    { part: 'cognitive_video', contentVersion: 1, completedAt: before, skippedAt: null },
    { part: 'cmp7', contentVersion: 1, completedAt: before, skippedAt: null },
    { part: 'principle_intro', contentVersion: 1, completedAt: before, skippedAt: null },
  ]),
  getPrepSocialProof: vi.fn(async () => ({ preparedThis: 0, preparedSeries: 0 })),
}));
vi.mock('@/app/prototypes/events/prep/prep-local-parts', () => ({ syncLocalPrepParts: vi.fn(async () => []) }));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getPublicPointsFeed: vi.fn(async () => []) } }));

import { usePrepState } from '@/app/prototypes/events/prep/use-prep-state';
import type { EventWithHost } from '@/app/types';

const event = (seriesSlug: string | null) => ({
  id: 'ev-1', slug: 'hike', title: 'Social Hike', datetime: '2099-01-01T08:00:00Z', hostId: 'h', seriesSlug,
  statementTag: null, preparationEnabled: true,
} as unknown as EventWithHost);

describe('founder decision (A): finished learning steps stay in a hike\'s plan', () => {
  it('a hike: every step stays, the finished ones count as done, and the next unfinished one is "Step 2 of 3"', async () => {
    const { result } = renderHook(() => usePrepState(event('social-hike'), 'u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The recipe's learning: story, principle, cmp7 (no statement tag, so no positions step).
    expect(result.current.plan).toEqual(['story', 'principle', 'cmp7']);
    expect(result.current.stepsDone).toEqual(['story', 'cmp7']);
    expect(result.current.progress).toMatchObject({ done: 2, total: 3, complete: false });
    const next = result.current.plan.find((s) => !result.current.stepsDone.includes(s));
    expect(next).toBe('principle');
    expect(`Step ${result.current.plan.indexOf(next!) + 1} of ${result.current.plan.length}`).toBe('Step 2 of 3');
  });

  it('review round 2 (3): the principle intro seen at another event is not shown again — the principle opens on its decision', async () => {
    const { result } = renderHook(() => usePrepState(event('social-hike'), 'u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.withPrincipleIntro).toBe(false);
  });

  it('Clarity Night keeps its shortened plan (P1336): parts done before this preparation are not asked again', async () => {
    const { result } = renderHook(() => usePrepState(event(null), 'u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan).not.toContain('story');
    expect(result.current.plan).not.toContain('cmp7');
  });
});
