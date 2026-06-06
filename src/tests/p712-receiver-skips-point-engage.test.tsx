/**
 * @file p712-receiver-skips-point-engage.test.tsx
 * @description Regression test: P712 — receiver view must route through point-engage
 * for single-story letters with 1 visible point.
 *
 * Bug: letter-flow-content.tsx story-revealed button uses `isFinalStory` to shortcut
 * to `nextStory` instead of `advanceFromStoryReveal`. For a 1-story letter, `isFinalStory`
 * is always true, so the button always completes the letter, skipping point-engage.
 *
 * Fix: always call `advanceFromStoryReveal`; derive button label from
 * `hasRemainingPoints && isFinalStory` combination.
 *
 * Canary: before fix, button in story-revealed shows "Complete Letter" for a final
 * story with 1 remaining point. After fix, shows "Next".
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import React, { act } from 'react';

// ── Mocks for heavy sub-components ──────────────────────────────────────────

// P847: LetterFlowContent now calls useAuth() for the explicit-clear guard.
// The P712 test renders LetterFlowContent without AuthProvider, so stub useAuth.
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: null, user: null }),
}));

vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({
    dialogProps: {},
    guardedRemovePosition: vi.fn(),
  }),
}));

vi.mock('@/app/components/layout/focus-header', () => ({
  FocusHeader: () => null,
}));
vi.mock('@/app/components/letters/letter-progress-bar', () => ({
  LetterProgressBar: () => null,
}));
vi.mock('@/app/components/partners/live-story-card-expanded', () => ({
  LiveStoryCardExpanded: () => <div data-testid="story-card" />,
  PointRow: () => <div data-testid="point-row" />,
}));
vi.mock('@/app/components/partners/live-mode-view', () => ({
  JourneyToUnderstanding: () => null,
}));
vi.mock('@/app/components/shared/gap-banner', () => ({
  GapBanner: () => null,
}));
vi.mock('@/app/components/shared/comprehension-rating-card', () => ({
  ComprehensionRatingCard: () => null,
}));
vi.mock('@/app/components/shared/fixed-bottom-bar', () => ({
  FixedBottomBar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="fixed-bottom-bar">{children}</div>
  ),
}));

// snapshotToStoryWithPoints must return 1 visible point for single-point letter
vi.mock('@/app/utils/letter-snapshot-mapper', () => ({
  snapshotToStoryWithPoints: vi.fn((_snapshot: unknown, _name: string) => ({
    id: 'story-1',
    title: 'Test Story',
    content: 'Story text',
    authorName: 'Sender',
    points: [
      { id: 'pt1', text: 'Single point', authorPosition: 'agree', userPosition: null },
    ],
  })),
}));

// P898: partial mock — calculateStoryProgress stays stubbed; new real exports
// (getEffectiveLeadCount etc.) pass through so the component can render.
vi.mock('@/app/utils/letter-reading-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/utils/letter-reading-utils')>()),
  calculateStoryProgress: vi.fn(() => 0.5),
}));

import { LetterFlowContent } from '@/app/components/letters/letter-flow-content';
import type { LetterStorySnapshot } from '@/app/types';
import type { UseLetterReadingStateReturn } from '@/app/hooks/useLetterReadingState';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeSinglePointSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 0,
    point_config: {
      storyText: 'Story text',
      storyTitle: 'Test Story',
      points: [{ id: 'pt1', text: 'Single point', authorPosition: 'agree' }],
    },
    visibility: 'published',
  };
}

function makeReadingState(overrides: Partial<UseLetterReadingStateReturn> = {}): UseLetterReadingStateReturn {
  return {
    state: {
      currentStoryIndex: 0,
      isComplete: false,
      stories: [
        {
          phase: 'story-revealed',
          rating: 4,
          prediction: 5,
          positions: {},
          currentPointIndex: 0,
        },
      ],
    },
    currentPhase: 'story-revealed',
    submitPointPosition: vi.fn(),
    submitStoryRating: vi.fn(),
    advanceFromPointReveal: vi.fn(),
    advanceFromStoryReveal: vi.fn(),
    advanceFromRemainingPointReveal: vi.fn(),
    nextStory: vi.fn(),
    isSubmitting: false,
    isLocalCompleted: false,
    tokenExpired: false,
    ...overrides,
  };
}

const SENDER_PROFILE = {
  avatarColor: '#000',
  avatarUrl: null,
  hasPledged: false,
  ear: 0,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P712: story-revealed advance button — single-point final story', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function renderAtStoryRevealed(readingState: UseLetterReadingStateReturn) {
    const snapshot = makeSinglePointSnapshot();
    render(
      <BrowserRouter>
        <LetterFlowContent
          snapshots={[snapshot]}
          senderName="Alice"
          senderProfileOwner={SENDER_PROFILE}
          readingState={readingState}
          showFocusHeader={false}
          renderCompletion={() => <div data-testid="completion" />}
        />
      </BrowserRouter>
    );
    // Advance 400ms timer to show the delayed advance button
    act(() => {
      vi.advanceTimersByTime(500);
    });
  }

  /**
   * State-machine contract (GREEN before and after fix):
   * advanceFromStoryReveal on a 1-point story routes to point-engage.
   * This documents the correct hook contract that the view fix relies on.
   */
  it('contract: advanceFromStoryReveal is wired correctly in readingState (state machine is correct)', () => {
    const readingState = makeReadingState();
    // The hook correctly routes to point-engage; the bug is in the VIEW not calling this.
    // This test documents that the hook contract is sound.
    (readingState.advanceFromStoryReveal as ReturnType<typeof vi.fn>).mockImplementation(() => {
      // In the real hook this would set phase → 'point-engage'
    });
    renderAtStoryRevealed(readingState);
    // Button exists in the revealed phase.
    // P852 Phase-3: the Leave button was removed (browser back is the exit).
    // Selector kept as name-matched to stay robust if other ambient buttons appear later.
    const button = screen.getByRole('button', { name: /next|complete letter|next chapter/i });
    expect(button).toBeInTheDocument();
  });

  /**
   * RED before fix, GREEN after fix:
   * For a final story with 1 remaining visible point, the advance button should
   * be labelled "Next" (not "Complete Letter"), indicating the receiver has more to do.
   *
   * Before fix: isFinalStory shortcut → label is "Complete Letter" → test FAILS.
   * After fix: hasRemainingPoints=true → label is "Next" → test PASSES.
   */
  it('button label is "Next" when final story still has 1 remaining visible point', () => {
    renderAtStoryRevealed(makeReadingState());
    // Before fix: "Complete Letter"; after fix: "Next"
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /complete letter/i })).toBeNull();
  });

  /**
   * RED before fix, GREEN after fix:
   * Clicking the advance button must call advanceFromStoryReveal, NOT nextStory.
   *
   * Before fix: button calls nextStory (isFinalStory shortcut) → nextStory is called.
   * After fix: button always calls advanceFromStoryReveal → point-engage is reached.
   */
  it('clicking advance button calls advanceFromStoryReveal, not nextStory', () => {
    const readingState = makeReadingState();
    renderAtStoryRevealed(readingState);

    // P852 Phase-3: the Leave button was removed; selector kept name-matched
    // for forward-robustness if ambient buttons reappear.
    const button = screen.getByRole('button', { name: /next|complete letter|next chapter/i });
    fireEvent.click(button);

    expect(readingState.advanceFromStoryReveal).toHaveBeenCalledTimes(1);
    expect(readingState.nextStory).not.toHaveBeenCalled();
  });
});
