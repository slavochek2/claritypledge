/**
 * @file p964-reproduce.test.tsx
 * @description Canary for P964 — onSaved in LetterPositionStoryDialog always calls
 * advanceFromPointReveal() regardless of which phase opened the dialog.
 *
 * BUG: When the dialog is opened from `remaining-point-revealed` and the user
 * saves a story, onSaved fires advanceFromPointReveal() which falls through to
 * `{ phase: 'story-rate' }` — bouncing the reader backward to re-rate an already-
 * rated story. On a multi-point final story this loop never reaches completion.
 *
 * FIX CONTRACT: After the fix, saving from `remaining-point-revealed` must call
 * advanceFromRemainingPointReveal(), not advanceFromPointReveal(). This test
 * FAILS until the fix is applied; it proves the bug exists and pins correct behavior.
 *
 * Test strategy: render LetterFlowContent at remaining-point-revealed phase,
 * advance fake timers past the 400ms CTA-reveal delay, click the explain-why CTA
 * to open the dialog, then call the captured onSaved and assert routing.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import React, { act } from 'react';

// ── Hoisted mutable state ─────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  points: [] as Array<{ id: string; statement: string }>,
  capturedOnSaved: null as (() => void) | null,
}));

// ── Standard mocks (mirrors p927-reproduce pattern) ───────────────────────────
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
vi.mock('@/app/components/letters/intensity-tutorial-modal', () => ({
  IntensityTutorialModal: () => null,
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
vi.mock('@/app/components/letters/letter-reveal-ordinal', () => ({
  LetterRevealOrdinal: () => <div data-testid="reveal-ordinal" />,
}));
vi.mock('@/app/components/letters/letter-reveal-numeric', () => ({
  LetterRevealNumeric: () => null,
}));
vi.mock('@/app/components/letters/calibration-verdict', () => ({
  CalibrationVerdict: () => null,
}));

vi.mock('@/app/utils/letter-snapshot-mapper', () => ({
  snapshotToStoryWithPoints: vi.fn(() => ({
    id: 'story-1',
    title: 'Test Story',
    content: 'Story text',
    authorName: 'Sender',
    points: h.points,
  })),
}));

vi.mock('@/app/utils/letter-reading-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/utils/letter-reading-utils')>()),
  calculateStoryProgress: vi.fn(() => 0.75),
}));

vi.mock('@/app/components/letters/explain-back-capture', () => ({
  ExplainBackCapture: () => null,
}));

// P964 KEY MOCK: captures the onSaved callback so we can trigger it directly
// without rendering full dialog internals (modal, form, fetch).
vi.mock('@/app/components/letters/letter-position-story-dialog', () => ({
  LetterPositionStoryDialog: ({
    onSaved,
    state,
  }: {
    onSaved?: () => void;
    state: unknown;
    onClose?: () => void;
  }) => {
    if (state && onSaved) {
      h.capturedOnSaved = onSaved;
    }
    return state ? <div data-testid="position-story-dialog" /> : null;
  },
}));

import { LetterFlowContent } from '@/app/components/letters/letter-flow-content';
import type { LetterStorySnapshot } from '@/app/types';
import type { UseLetterReadingStateReturn } from '@/app/hooks/useLetterReadingState';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PT1 = 'pt1';
const PT2 = 'pt2';

function makeSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 0,
    point_config: {
      storyText: 'Story text',
      storyTitle: 'Test Story',
      lead_count: 1,
      points: [
        { id: PT1, text: 'Point 1 — the lead', authorPosition: 'agree' },
        { id: PT2, text: 'Point 2 — the remaining point', authorPosition: 'agree' },
      ],
    },
    visibility: 'published',
  } as LetterStorySnapshot;
}

function makeRemainingPointRevealedState(): UseLetterReadingStateReturn {
  const advanceFromPointReveal = vi.fn();
  const advanceFromRemainingPointReveal = vi.fn();
  return {
    state: {
      currentStoryIndex: 0,
      isComplete: false,
      stories: [
        {
          phase: 'remaining-point-revealed',
          rating: 4,
          prediction: 5,
          positions: { [PT1]: 'agree', [PT2]: 'disagree' },
          currentPointIndex: 1,
        },
      ],
    },
    currentPhase: 'remaining-point-revealed',
    submitPointPosition: vi.fn(),
    submitStoryRating: vi.fn(),
    advanceFromPointReveal,
    advanceFromStoryReveal: vi.fn(),
    advanceFromRemainingPointReveal,
    nextStory: vi.fn(),
    isSubmitting: false,
    isLocalCompleted: false,
    tokenExpired: false,
  };
}

function makePointRevealedState(): UseLetterReadingStateReturn {
  const advanceFromPointReveal = vi.fn();
  const advanceFromRemainingPointReveal = vi.fn();
  return {
    state: {
      currentStoryIndex: 0,
      isComplete: false,
      stories: [
        {
          phase: 'point-revealed',
          rating: null,
          prediction: 5,
          positions: { [PT1]: 'agree' },
          currentPointIndex: 0,
        },
      ],
    },
    currentPhase: 'point-revealed',
    submitPointPosition: vi.fn(),
    submitStoryRating: vi.fn(),
    advanceFromPointReveal,
    advanceFromStoryReveal: vi.fn(),
    advanceFromRemainingPointReveal,
    nextStory: vi.fn(),
    isSubmitting: false,
    isLocalCompleted: false,
    tokenExpired: false,
  };
}

const SENDER_PROFILE = { avatarColor: '#000', avatarUrl: null, hasPledged: false, ear: 0 };

function renderAtPhase(readingState: UseLetterReadingStateReturn) {
  render(
    <BrowserRouter>
      <LetterFlowContent
        snapshots={[makeSnapshot()]}
        senderName="Alice Smith"
        senderProfileOwner={SENDER_PROFILE}
        readingState={readingState}
        showFocusHeader={false}
        renderCompletion={() => <div data-testid="completion" />}
        responsesMode="invite"
        isAuthenticatedReceiver={true}
        positionStoriesMap={new Map()} // no existing story → shows explain-why CTA
      />
    </BrowserRouter>
  );
  // Advance past the 400ms CTA-reveal delay (T14)
  act(() => {
    vi.advanceTimersByTime(500);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P964: onSaved from remaining-point-revealed must call advanceFromRemainingPointReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.points = [
      { id: PT1, statement: 'Point 1 — the lead' },
      { id: PT2, statement: 'Point 2 — the remaining point' },
    ];
    h.capturedOnSaved = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    h.capturedOnSaved = null;
  });

  /**
   * BUG: onSaved always calls advanceFromPointReveal() regardless of phase.
   * it.fails = expected failure while bug exists (P835/P895 pattern).
   * After fix: inner assertions PASS → it.fails flips RED → remove `.fails` to lock in the fix.
   */
  it.fails('saving a story from remaining-point-revealed calls advanceFromRemainingPointReveal, not advanceFromPointReveal', () => {
    const readingState = makeRemainingPointRevealedState();
    renderAtPhase(readingState);

    // Click the explain-why / add-a-story CTA to open the dialog
    const addStoryBtn = screen.getByRole('button', { name: /explain why|add a story/i });
    fireEvent.click(addStoryBtn);

    // The mock captures onSaved when the dialog opens (state !== null)
    expect(h.capturedOnSaved, 'dialog must have opened — capturedOnSaved should be set').not.toBeNull();

    // Simulate saving a story; advance past the 1s auto-advance setTimeout in onSaved
    h.capturedOnSaved!();
    act(() => { vi.advanceTimersByTime(1100); });

    // FIX CONTRACT: routing must be phase-correct
    expect(
      readingState.advanceFromRemainingPointReveal,
      'advanceFromRemainingPointReveal must be called — routes to transition/completion',
    ).toHaveBeenCalledOnce();

    // BUG: advanceFromPointReveal falls through to story-rate (the backward loop)
    expect(
      readingState.advanceFromPointReveal,
      'advanceFromPointReveal must NOT be called from remaining-point-revealed — causes story-rate loop',
    ).not.toHaveBeenCalled();
  });

  /**
   * Regression anchor: saving from point-revealed must still call advanceFromPointReveal.
   */
  it('saving a story from point-revealed still calls advanceFromPointReveal (regression guard)', () => {
    const readingState = makePointRevealedState();
    renderAtPhase(readingState);

    const addStoryBtn = screen.getByRole('button', { name: /explain why|add a story/i });
    fireEvent.click(addStoryBtn);

    expect(h.capturedOnSaved, 'dialog must have opened from point-revealed too').not.toBeNull();

    h.capturedOnSaved!();
    act(() => { vi.advanceTimersByTime(1100); });

    expect(
      readingState.advanceFromPointReveal,
      'advanceFromPointReveal must be called from point-revealed (no regression)',
    ).toHaveBeenCalledOnce();

    expect(
      readingState.advanceFromRemainingPointReveal,
      'advanceFromRemainingPointReveal must NOT be called from point-revealed',
    ).not.toHaveBeenCalled();
  });
});
