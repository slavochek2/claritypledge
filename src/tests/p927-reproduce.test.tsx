/**
 * @file p927-reproduce.test.tsx
 * @description Canary for P927 — the `point-revealed` CTA label is hardcoded
 * `Read {name}'s story` but `advanceFromPointReveal` routes three ways depending
 * on lead_count (P898) and point count (D36 single-point walk).
 *
 * The label is only correct for the default V>=2, lead_count=1 shape. This canary
 * renders LetterFlowContent at `point-revealed` in each config and asserts the
 * label MATCHES where the button actually goes:
 *
 *   - multi-lead (lead_count>=2), non-last lead → next screen is a POINT → "Next point"   [RED before fix]
 *   - single-point story-first (V=1), story rated → next screen is chapter end → "Complete Letter"  [RED before fix]
 *   - multi-lead, LAST lead → next screen is the story → "Read {name}'s story"  [GREEN anchor]
 *   - default V>=2, lead_count=1 → next screen is the story → "Read {name}'s story"  [GREEN anchor]
 *
 * Before fix: the two RED cases render "Read Alice's story" → their inner
 *   assertions fail. They are guarded by `it.fails` so the suite stays GREEN
 *   while the bug is open (vitest treats an expected-failure as a pass).
 * After fix: a pure label function mirrors advanceFromPointReveal → the inner
 *   assertions PASS → `it.fails` flips RED → the developer MUST remove `.fails`
 *   (turn `it.fails` into `it`) to lock in the corrected behavior. (P835/P895 pattern.)
 *
 * Mirrors the render setup of p712-receiver-skips-point-engage.test.tsx.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import React, { act } from 'react';

// ── Configurable visible-point set, read by the snapshot-mapper mock ──────────
const h = vi.hoisted(() => ({
  points: [] as Array<{ id: string; statement: string }>,
}));

// ── Mocks for heavy sub-components (same surface as P712) ─────────────────────
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: null, user: null }),
}));
vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn(), identify: vi.fn(), people: { set: vi.fn() } },
}));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: vi.fn() }),
}));
vi.mock('@/app/components/layout/focus-header', () => ({ FocusHeader: () => null }));
vi.mock('@/app/components/letters/letter-progress-bar', () => ({ LetterProgressBar: () => null }));
vi.mock('@/app/components/partners/live-story-card-expanded', () => ({
  LiveStoryCardExpanded: () => <div data-testid="story-card" />,
  PointRow: () => <div data-testid="point-row" />,
}));
vi.mock('@/app/components/partners/live-mode-view', () => ({ JourneyToUnderstanding: () => null }));
vi.mock('@/app/components/shared/gap-banner', () => ({ GapBanner: () => null }));
vi.mock('@/app/components/shared/comprehension-rating-card', () => ({ ComprehensionRatingCard: () => null }));
vi.mock('@/app/components/shared/fixed-bottom-bar', () => ({
  FixedBottomBar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="fixed-bottom-bar">{children}</div>
  ),
}));

// snapshotToStoryWithPoints returns the per-test configured visible points.
vi.mock('@/app/utils/letter-snapshot-mapper', () => ({
  snapshotToStoryWithPoints: vi.fn(() => ({
    id: 'story-1',
    title: 'Test Story',
    content: 'Story text',
    authorName: 'Sender',
    points: h.points,
  })),
}));

// P898: keep getEffectiveLeadCount REAL (it reads point_config.lead_count); only
// stub calculateStoryProgress so the progress bar math doesn't need a full walk.
vi.mock('@/app/utils/letter-reading-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/utils/letter-reading-utils')>()),
  calculateStoryProgress: vi.fn(() => 0.5),
}));

import { LetterFlowContent } from '@/app/components/letters/letter-flow-content';
import type { LetterStorySnapshot } from '@/app/types';
import type { UseLetterReadingStateReturn } from '@/app/hooks/useLetterReadingState';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSnapshot(leadCount?: number): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 0,
    point_config: {
      storyText: 'Story text',
      storyTitle: 'Test Story',
      points: h.points.map((p) => ({ id: p.id, text: p.statement, authorPosition: 'agree' })),
      ...(leadCount !== undefined ? { lead_count: leadCount } : {}),
    },
    visibility: 'published',
  } as LetterStorySnapshot;
}

function makeReadingState(
  currentPointIndex: number,
  rating: number | null,
): UseLetterReadingStateReturn {
  return {
    state: {
      currentStoryIndex: 0,
      isComplete: false,
      stories: [
        { phase: 'point-revealed', rating, prediction: 5, positions: {}, currentPointIndex },
      ],
    },
    currentPhase: 'point-revealed',
    submitPointPosition: vi.fn(),
    submitStoryRating: vi.fn(),
    advanceFromPointReveal: vi.fn(),
    advanceFromStoryReveal: vi.fn(),
    advanceFromRemainingPointReveal: vi.fn(),
    nextStory: vi.fn(),
    isSubmitting: false,
    isLocalCompleted: false,
    tokenExpired: false,
  };
}

const SENDER_PROFILE = { avatarColor: '#000', avatarUrl: null, hasPledged: false, ear: 0 };

function makePoints(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `pt${i + 1}`, statement: `Point ${i + 1}` }));
}

function renderPointRevealed(snapshot: LetterStorySnapshot, readingState: UseLetterReadingStateReturn) {
  render(
    <BrowserRouter>
      <LetterFlowContent
        snapshots={[snapshot]}
        senderName="Alice Smith"
        senderProfileOwner={SENDER_PROFILE}
        readingState={readingState}
        showFocusHeader={false}
        renderCompletion={() => <div data-testid="completion" />}
      />
    </BrowserRouter>
  );
  // 400ms delayed advance button
  act(() => {
    vi.advanceTimersByTime(500);
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('P927: point-revealed CTA label matches advanceFromPointReveal destination', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    h.points = [];
  });

  it('multi-lead, non-last lead → "Next point" (not "Read story")', () => {
    h.points = makePoints(3);
    renderPointRevealed(makeSnapshot(2), makeReadingState(0, null));

    expect(screen.getByRole('button', { name: /next point/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /read .*story/i })).toBeNull();
  });

  it('single-point story-first (final story) → "Complete Letter" (not "Read story")', () => {
    h.points = makePoints(1);
    renderPointRevealed(makeSnapshot(), makeReadingState(0, 4));

    expect(screen.getByRole('button', { name: /complete letter/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /read .*story/i })).toBeNull();
  });

  // GREEN anchor (passes before AND after fix): 3 points, lead_count=2, on lead #1
  // (the LAST lead) → the story comes next → "Read Alice's story" is correct.
  it('multi-lead, last lead → "Read story" (no regression)', () => {
    h.points = makePoints(3);
    renderPointRevealed(makeSnapshot(2), makeReadingState(1, null));

    expect(screen.getByRole('button', { name: /read .*story/i })).toBeInTheDocument();
  });

  // GREEN anchor (passes before AND after fix): default shape — 2 points,
  // lead_count=1, on the single lead → the story comes next → "Read story" correct.
  it('default single-lead → "Read story" (no regression)', () => {
    h.points = makePoints(2);
    renderPointRevealed(makeSnapshot(1), makeReadingState(0, null));

    expect(screen.getByRole('button', { name: /read .*story/i })).toBeInTheDocument();
  });
});
