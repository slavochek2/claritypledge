/**
 * @file p963-rating-card-not-stranded.test.tsx
 * @description Reproduction + invariant guard for the recurring "cant select again"
 * bug on the comprehension rating step (screenshot Jun 25 21:18, taken 8h AFTER the
 * P959 mountedRef/StrictMode fix — so that fix did not resolve it).
 *
 * ROOT CAUSE (architecture, not a single trigger):
 * The rating scale's interactivity was coupled to a DATA value that can desync from
 * the phase state machine:
 *
 *   letter-flow-content.tsx:  disabled={isSubmitting || currentStory.rating !== null}
 *
 * The card ONLY renders at phase==='story-rate' and UNMOUNTS when phase advances to
 * 'story-revealed'. In the happy path rating is null here, so `rating !== null` is a
 * no-op. It fires ONLY when a submit set `rating` but the phase did NOT advance
 * (StrictMode unmount, null prediction, stale closure, a hung-then-recovered RPC).
 * In that state the clause DISABLES the scale permanently with no recovery — the
 * receiver is stranded exactly as the screenshot shows (faint, unselectable scale).
 *
 * This is why every prior patch bounced: each killed one desync trigger; the disable
 * landmine survived and the next trigger re-stranded the user.
 *
 * INVARIANT (collapse-to-phase): while the rating step is shown, the scale MUST be
 * interactive unless a submit is genuinely in flight. Interactivity derives from
 * `phase` (+ transient `isSubmitting`), never from `rating`.
 *
 * These assert the FIXED behavior, so they FAIL before the fix.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// ── Mocks for heavy sub-components (mirrors p862 harness) ────────────────────
// NOTE: ComprehensionRatingCard and RatingButtons are intentionally NOT mocked —
// the disabled gate under test lives in those real components.
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: null, user: null }),
}));
vi.mock('@/app/components/shared/PositionButton', async (importActual) => ({
  ...(await importActual<typeof import('@/app/components/shared/PositionButton')>()),
  PositionButtons: () => null,
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
vi.mock('@/app/components/shared/fixed-bottom-bar', () => ({
  FixedBottomBar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="fixed-bottom-bar">{children}</div>
  ),
}));
vi.mock('@/app/utils/letter-snapshot-mapper', () => ({
  snapshotToStoryWithPoints: vi.fn(() => ({
    id: 'story-1',
    title: 'Test Story',
    content: 'Story text',
    authorName: 'Sender',
    points: [],
  })),
}));
vi.mock('@/app/utils/letter-reading-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/utils/letter-reading-utils')>()),
  calculateStoryProgress: vi.fn(() => 0.5),
}));

import { LetterFlowContent } from '@/app/components/letters/letter-flow-content';
import type { LetterStorySnapshot } from '@/app/types';
import type { UseLetterReadingStateReturn } from '@/app/hooks/useLetterReadingState';

function makeSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 0,
    point_config: {
      storyText: 'Story text',
      storyTitle: 'Test Story',
      points: [],
    },
    visibility: 'published',
  };
}

/**
 * Reading state at the story-rate phase. `rating` is parameterized so we can
 * model the desync state (rating set, phase still story-rate) that the bug
 * produces — the exact state the screenshot was captured in.
 */
function makeReadingState(opts: { rating: number | null; isSubmitting: boolean }): UseLetterReadingStateReturn {
  return {
    state: {
      currentStoryIndex: 0,
      isComplete: false,
      stories: [{ phase: 'story-rate', rating: opts.rating, prediction: null, positions: {}, currentPointIndex: 0 }],
    },
    currentPhase: 'story-rate',
    submitPointPosition: vi.fn(),
    submitStoryRating: vi.fn(),
    advanceFromPointReveal: vi.fn(),
    advanceFromStoryReveal: vi.fn(),
    advanceFromRemainingPointReveal: vi.fn(),
    nextStory: vi.fn(),
    isSubmitting: opts.isSubmitting,
    isLocalCompleted: false,
    tokenExpired: false,
  };
}

const SENDER_PROFILE = { avatarColor: '#000', avatarUrl: null, hasPledged: false, ear: 0 };

function renderRateStep(opts: { rating: number | null; isSubmitting: boolean }) {
  render(
    <BrowserRouter>
      <LetterFlowContent
        snapshots={[makeSnapshot()]}
        senderName="Alice"
        senderProfileOwner={SENDER_PROFILE}
        readingState={makeReadingState(opts)}
        showFocusHeader={false}
        renderCompletion={() => <div data-testid="completion" />}
      />
    </BrowserRouter>
  );
}

/** The 0-10 scale buttons carry aria-label "Rate N". */
function getScaleButtons(): HTMLButtonElement[] {
  return screen.getAllByRole('button').filter((b) => /^Rate \d+$/.test(b.getAttribute('aria-label') ?? ''));
}

describe('P963: comprehension rating scale must never be stranded-disabled at story-rate', () => {
  afterEach(() => vi.clearAllMocks());

  it('fresh story-rate (rating null, not submitting): scale is interactive', () => {
    renderRateStep({ rating: null, isSubmitting: false });
    const scale = getScaleButtons();
    expect(scale.length).toBe(11); // 0..10
    scale.forEach((b) => expect(b).not.toBeDisabled());
  });

  it('DESYNC (rating set, phase still story-rate, not submitting): scale must re-enable, not lock', () => {
    // This is the screenshot state: a submit recorded `rating` but the phase never
    // advanced. The card is still shown. Coupling disable to `rating !== null` locks
    // the scale here with no recovery. RED before fix, GREEN after.
    renderRateStep({ rating: 5, isSubmitting: false });
    const scale = getScaleButtons();
    expect(scale.length).toBe(11);
    scale.forEach((b) => expect(b).not.toBeDisabled());
  });

  it('in-flight submit (isSubmitting true): scale is disabled — the one legitimate lock', () => {
    // The ONLY time the scale should be inert is while a submit is genuinely running.
    renderRateStep({ rating: null, isSubmitting: true });
    const scale = getScaleButtons();
    scale.forEach((b) => expect(b).toBeDisabled());
  });
});
