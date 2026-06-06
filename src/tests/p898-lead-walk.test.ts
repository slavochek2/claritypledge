/**
 * @file p898-lead-walk.test.ts
 * @description P898: Reader phase-machine walks for the generalized lead count.
 *
 * Walks the full per-story phase sequence through useLetterReadingState for
 * lead counts 0 / 1 (fallback regression) / 2 / all-leads, per the spec's
 * transition table:
 *
 *  | N        | Walk                                                                  |
 *  | 0 (V>=1) | story-rate → story-revealed → remaining-*(0..V-1) → transition        |
 *  | 1        | point-*(0) → story-rate/revealed → remaining-*(1..V-1) → transition   |
 *  | 2..V     | point-*(0..N-1) → story-rate/revealed → remaining-*(N..V-1) → transition |
 *
 * Plus the V=1 D36 legacy walk (story first, point-* after) and clamping of
 * malformed lead_count values. Preview mode is used so no RPC calls fire.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { LetterStorySnapshot } from '@/app/types';

vi.mock('@/app/data/letters-service', () => ({
  submitRating: vi.fn().mockResolvedValue(undefined),
  revealPrediction: vi.fn().mockResolvedValue(null),
  submitPointResponse: vi.fn().mockResolvedValue(undefined),
  updateDeliveryStatus: vi.fn().mockResolvedValue(undefined),
  updateDeliveryStatusByToken: vi.fn().mockResolvedValue(undefined),
  submitPointResponseByToken: vi.fn().mockResolvedValue(undefined),
  submitRatingByToken: vi.fn().mockResolvedValue(undefined),
  revealPredictionByToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

import { useLetterReadingState } from '@/app/hooks/useLetterReadingState';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeSnapshot(opts: {
  pointCount: number;
  leadCount?: unknown;
  hidden?: string[];
}): LetterStorySnapshot {
  const points = Array.from({ length: opts.pointCount }, (_, i) => ({
    id: `p${i}`,
    text: `Point ${i}`,
    authorPosition: 'agree',
    visibility: 'public',
  }));
  const config: Record<string, unknown> = {
    storyText: 'Story text',
    points,
    order: points.map((p) => p.id),
  };
  if (opts.leadCount !== undefined) config.lead_count = opts.leadCount;
  if (opts.hidden) config.hidden = opts.hidden;
  return {
    letter_id: 'letter-898',
    story_id: 'story-898',
    version_id: 'version-898',
    position: 0,
    point_config: config,
    visibility: 'public',
  };
}

function renderReader(snapshot: LetterStorySnapshot) {
  return renderHook(() =>
    useLetterReadingState(
      'delivery-898',
      'sender-898',
      [snapshot],
      undefined,
      true, // previewMode — no RPC, no storage restore
    ),
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

// Walk helpers — each returns the phase after the action settles.
async function positionPoint(result: { current: ReturnType<typeof useLetterReadingState> }, pointId: string) {
  await act(async () => {
    await result.current.submitPointPosition(pointId, 'agree');
  });
}

async function rateStory(result: { current: ReturnType<typeof useLetterReadingState> }) {
  await act(async () => {
    await result.current.submitStoryRating(7);
  });
}

// ── REGRESSION: fallback lead_count (absent → 1) ────────────────────────────

describe('P898 — fallback walk (lead_count absent): identical to today', () => {
  it('V=2: point-*(0) → story pair → remaining-*(1) → transition', async () => {
    const { result } = renderReader(makeSnapshot({ pointCount: 2 }));

    expect(result.current.currentPhase).toBe('point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(0);

    await positionPoint(result, 'p0');
    expect(result.current.currentPhase).toBe('point-revealed');

    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('story-rate');

    await rateStory(result);
    expect(result.current.currentPhase).toBe('story-revealed');

    act(() => result.current.advanceFromStoryReveal());
    expect(result.current.currentPhase).toBe('remaining-point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(1);

    await positionPoint(result, 'p1');
    expect(result.current.currentPhase).toBe('remaining-point-revealed');

    act(() => result.current.advanceFromRemainingPointReveal());
    expect(result.current.currentPhase).toBe('transition');
  });

  it('V=1 (D36 legacy): story pair → point-*(0) → transition', async () => {
    const { result } = renderReader(makeSnapshot({ pointCount: 1 }));

    expect(result.current.currentPhase).toBe('story-rate');

    await rateStory(result);
    expect(result.current.currentPhase).toBe('story-revealed');

    act(() => result.current.advanceFromStoryReveal());
    expect(result.current.currentPhase).toBe('point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(0);

    await positionPoint(result, 'p0');
    expect(result.current.currentPhase).toBe('point-revealed');

    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('transition');
  });

  it('V=0: story pair → transition', async () => {
    const { result } = renderReader(makeSnapshot({ pointCount: 0 }));

    expect(result.current.currentPhase).toBe('story-rate');
    await rateStory(result);
    expect(result.current.currentPhase).toBe('story-revealed');
    act(() => result.current.advanceFromStoryReveal());
    expect(result.current.currentPhase).toBe('transition');
  });
});

// ── N=0: story-first ────────────────────────────────────────────────────────

describe('P898 — N=0 walk (story-first)', () => {
  it('V=2, lead_count=0: story pair → remaining-*(0) → remaining-*(1) → transition', async () => {
    const { result } = renderReader(makeSnapshot({ pointCount: 2, leadCount: 0 }));

    expect(result.current.currentPhase).toBe('story-rate');

    await rateStory(result);
    expect(result.current.currentPhase).toBe('story-revealed');

    act(() => result.current.advanceFromStoryReveal());
    expect(result.current.currentPhase).toBe('remaining-point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(0);

    await positionPoint(result, 'p0');
    expect(result.current.currentPhase).toBe('remaining-point-revealed');

    act(() => result.current.advanceFromRemainingPointReveal());
    expect(result.current.currentPhase).toBe('remaining-point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(1);

    await positionPoint(result, 'p1');
    act(() => result.current.advanceFromRemainingPointReveal());
    expect(result.current.currentPhase).toBe('transition');
  });

  it('V=1, lead_count=0: story pair → remaining-*(0) → transition (spec N=0 row, V>=1)', async () => {
    const { result } = renderReader(makeSnapshot({ pointCount: 1, leadCount: 0 }));

    expect(result.current.currentPhase).toBe('story-rate');
    await rateStory(result);
    act(() => result.current.advanceFromStoryReveal());
    expect(result.current.currentPhase).toBe('remaining-point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(0);

    await positionPoint(result, 'p0');
    act(() => result.current.advanceFromRemainingPointReveal());
    expect(result.current.currentPhase).toBe('transition');
  });
});

// ── N=2: paired pre-story setup ─────────────────────────────────────────────

describe('P898 — N=2 walk (fact-point + anti-point paired lead)', () => {
  it('V=3, lead_count=2: point-*(0) → point-*(1) → story pair → remaining-*(2) → transition', async () => {
    const { result } = renderReader(makeSnapshot({ pointCount: 3, leadCount: 2 }));

    expect(result.current.currentPhase).toBe('point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(0);

    await positionPoint(result, 'p0');
    expect(result.current.currentPhase).toBe('point-revealed');

    // Second lead — stays in point-* phases, index advances
    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(1);

    await positionPoint(result, 'p1');
    expect(result.current.currentPhase).toBe('point-revealed');

    // Last lead revealed → story
    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('story-rate');

    await rateStory(result);
    act(() => result.current.advanceFromStoryReveal());
    expect(result.current.currentPhase).toBe('remaining-point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(2);

    await positionPoint(result, 'p2');
    act(() => result.current.advanceFromRemainingPointReveal());
    expect(result.current.currentPhase).toBe('transition');
  });
});

// ── All-leads: story last ───────────────────────────────────────────────────

describe('P898 — all-leads walk (story last)', () => {
  it('V=2, lead_count=2: point-*(0) → point-*(1) → story pair → transition', async () => {
    const { result } = renderReader(makeSnapshot({ pointCount: 2, leadCount: 2 }));

    expect(result.current.currentPhase).toBe('point-engage');
    await positionPoint(result, 'p0');
    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(1);

    await positionPoint(result, 'p1');
    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('story-rate');

    await rateStory(result);
    expect(result.current.currentPhase).toBe('story-revealed');

    // No remaining points — straight to transition
    act(() => result.current.advanceFromStoryReveal());
    expect(result.current.currentPhase).toBe('transition');
  });
});

// ── Malformed data: clamping ────────────────────────────────────────────────

describe('P898 — malformed lead_count never breaks the walk', () => {
  it('lead_count=99 with V=2 clamps to all-leads', async () => {
    const { result } = renderReader(makeSnapshot({ pointCount: 2, leadCount: 99 }));

    expect(result.current.currentPhase).toBe('point-engage');
    await positionPoint(result, 'p0');
    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('point-engage');
    await positionPoint(result, 'p1');
    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('story-rate');
    await rateStory(result);
    act(() => result.current.advanceFromStoryReveal());
    expect(result.current.currentPhase).toBe('transition');
  });

  it('lead_count=-3 clamps to story-first', () => {
    const { result } = renderReader(makeSnapshot({ pointCount: 2, leadCount: -3 }));
    expect(result.current.currentPhase).toBe('story-rate');
  });

  it('non-numeric lead_count falls back to 1 (today\'s walk)', () => {
    const { result } = renderReader(makeSnapshot({ pointCount: 2, leadCount: 'two' }));
    expect(result.current.currentPhase).toBe('point-engage');
  });

  it('clamp counts VISIBLE points: hidden lead reduces the effective count (full walk)', async () => {
    // 3 points, p0 hidden → visible = [p1, p2]; lead_count 3 clamps to 2 → all-leads walk
    const { result } = renderReader(
      makeSnapshot({ pointCount: 3, leadCount: 3, hidden: ['p0'] }),
    );
    // Walk starts on the first VISIBLE point as a lead
    expect(result.current.currentPhase).toBe('point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(0);

    await positionPoint(result, 'p1');
    expect(result.current.currentPhase).toBe('point-revealed');

    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(1);

    await positionPoint(result, 'p2');
    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('story-rate');

    await rateStory(result);
    expect(result.current.currentPhase).toBe('story-revealed');

    // Clamped all-leads: nothing remains after the story
    act(() => result.current.advanceFromStoryReveal());
    expect(result.current.currentPhase).toBe('transition');
  });
});

// ── P768 priorPositions resume × lead group ─────────────────────────────────

function renderResumedReader(snapshot: LetterStorySnapshot, priorPositions: Record<string, string>) {
  return renderHook(() =>
    useLetterReadingState({
      deliveryId: 'delivery-898',
      senderId: 'sender-898',
      snapshots: [snapshot],
      priorPositions,
    }),
  );
}

describe('P898 — resume with prior responses never frames a post-story point as a lead', () => {
  it('N=2, both leads answered: lands on the LAST lead in point-revealed (advance → story)', () => {
    const { result } = renderResumedReader(
      makeSnapshot({ pointCount: 3, leadCount: 2 }),
      { p0: 'agree', p1: 'agree' },
    );

    expect(result.current.currentPhase).toBe('point-revealed');
    expect(result.current.state.stories[0].currentPointIndex).toBe(1);

    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('story-rate');
  });

  it('N=1 (fallback), lead answered: lands on the lead in point-revealed, not point-engage(1)', () => {
    const { result } = renderResumedReader(
      makeSnapshot({ pointCount: 2 }),
      { p0: 'agree' },
    );

    expect(result.current.currentPhase).toBe('point-revealed');
    expect(result.current.state.stories[0].currentPointIndex).toBe(0);

    act(() => result.current.advanceFromPointReveal());
    expect(result.current.currentPhase).toBe('story-rate');
  });

  it('N=2, only first lead answered: lands on the unanswered second lead in point-engage', () => {
    const { result } = renderResumedReader(
      makeSnapshot({ pointCount: 3, leadCount: 2 }),
      { p0: 'agree' },
    );

    expect(result.current.currentPhase).toBe('point-engage');
    expect(result.current.state.stories[0].currentPointIndex).toBe(1);
  });

  it('N=0 (story-first): seeding leaves the story-rate phase untouched (Invariant 4)', () => {
    const { result } = renderResumedReader(
      makeSnapshot({ pointCount: 2, leadCount: 0 }),
      { p0: 'agree' },
    );

    expect(result.current.currentPhase).toBe('story-rate');
  });
});
