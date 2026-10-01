/**
 * @file p1379-public-reveal.test.tsx
 * @description P1379 A2: the story reveal branches on the letter's MODE.
 *
 * Branches under test (every rendered branch of the story-revealed card):
 *   1. one-to-many, rating set, prediction present (an OLD public letter that still
 *      stores one — the known-bad input): reader-only reveal "You said N out of 10.",
 *      NO author number, NO gap/verdict, NO "{Author} thinks…", NO
 *      "Calibration data unavailable.".
 *   2. one-to-many, prediction null (a NEW public letter): the same reader-only reveal —
 *      it must not fall through to "Calibration data unavailable.".
 *   3. one-to-many, reverse story: same string, no author framing.
 *   4. one-to-one, prediction present (CONTROL): verdict + two-marker scale +
 *      "{Author} thinks…" line, exactly as before.
 *   5. one-to-one, prediction null (CONTROL): still "Calibration data unavailable." —
 *      the branch keys on mode, not on prediction === null, so a real missing
 *      prediction stays visible as a bug signal.
 *   6. letterMode omitted: historical one-to-one behaviour.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

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
vi.mock('@/app/components/letters/letter-progress-bar', () => ({ LetterProgressBar: () => null }));
vi.mock('@/app/components/partners/live-story-card-expanded', () => ({
  LiveStoryCardExpanded: () => <div data-testid="story-card" />,
  PointRow: () => <div data-testid="point-row" />,
}));
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
    authorName: 'Alice',
    points: [],
  })),
}));

import { LetterFlowContent } from '@/app/components/letters/letter-flow-content';
import type { LetterMode, LetterStorySnapshot } from '@/app/types';
import type { UseLetterReadingStateReturn } from '@/app/hooks/useLetterReadingState';

function makeSnapshot(reverseStory = false): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 0,
    point_config: {
      storyText: 'Story text',
      storyTitle: 'Test Story',
      points: [],
      ...(reverseStory ? { reverseStory: true } : {}),
    },
    visibility: 'published',
  };
}

function makeRevealedState(rating: number, prediction: number | null): UseLetterReadingStateReturn {
  return {
    state: {
      currentStoryIndex: 0,
      isComplete: false,
      stories: [{ phase: 'story-revealed', rating, prediction, positions: {}, currentPointIndex: 0 }],
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
  };
}

const SENDER_PROFILE = { id: 'sender-1', name: 'Alice Author', avatarColor: '#000', avatarUrl: undefined, hasPledged: false };

function renderReveal(opts: {
  mode?: LetterMode;
  rating: number;
  prediction: number | null;
  reverseStory?: boolean;
  responsesMode?: 'off' | 'invite' | 'push';
  isAuthenticatedReceiver?: boolean;
  identitySettled?: boolean;
}) {
  const readingState = makeRevealedState(opts.rating, opts.prediction);
  const view = render(
    <BrowserRouter>
      <LetterFlowContent
        snapshots={[makeSnapshot(opts.reverseStory)]}
        senderName="Alice Author"
        senderProfileOwner={SENDER_PROFILE}
        readingState={readingState}
        {...(opts.mode ? { letterMode: opts.mode } : {})}
        responsesMode={opts.responsesMode}
        isAuthenticatedReceiver={opts.isAuthenticatedReceiver}
        identitySettled={opts.identitySettled}
        renderCompletion={() => <div data-testid="completion" />}
      />
    </BrowserRouter>
  );
  return { ...view, readingState };
}

function assertNoAuthorFraming(container: HTMLElement) {
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/Calibration data unavailable/);
  expect(text).not.toMatch(/thinks you understand/);
  expect(text).not.toMatch(/calibrated/i);
  expect(text).not.toMatch(/gap/i);
  expect(text).not.toMatch(/Alice \d/); // author value label on the scale
}

describe('P1379: public letter story reveal', () => {
  afterEach(() => vi.clearAllMocks());

  // UAT 2026-10-01: the reader just chose the number — a "You said N" screen is pointless.
  it('one-to-many, responses off, OLD letter with a stored prediction: no reveal screen; advances at once', () => {
    const { container, readingState } = renderReveal({ mode: 'one-to-many', rating: 4, prediction: 8, responsesMode: 'off' });
    expect(readingState.advanceFromStoryReveal).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toMatch(/You said|\b8\b/);
    assertNoAuthorFraming(container);
  });

  it('one-to-many, new letter (no prediction): advances at once, never "Calibration data unavailable."', () => {
    const { container, readingState } = renderReveal({ mode: 'one-to-many', rating: 7, prediction: null, responsesMode: 'off' });
    expect(readingState.advanceFromStoryReveal).toHaveBeenCalledTimes(1);
    assertNoAuthorFraming(container);
  });

  it('one-to-many, invite, but reader is not a signed-in receiver (anon): nothing to prompt → advances', () => {
    const { readingState } = renderReveal({ mode: 'one-to-many', rating: 3, prediction: 9, responsesMode: 'invite', isAuthenticatedReceiver: false });
    expect(readingState.advanceFromStoryReveal).toHaveBeenCalledTimes(1);
  });

  it('one-to-many, invite, signed-in receiver: step kept as the explain-back prompt only (no headline, no scale)', () => {
    const { container, readingState } = renderReveal({ mode: 'one-to-many', rating: 5, prediction: 9, responsesMode: 'invite', isAuthenticatedReceiver: true, reverseStory: true });
    expect(readingState.advanceFromStoryReveal).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /explain back what you understood/i })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/You said/);
    expect(screen.queryByRole('img', { name: /Understanding scale/ })).not.toBeInTheDocument();
    assertNoAuthorFraming(container);
  });

  it('CONTROL one-to-one with a prediction: verdict, two markers and "{Author} thinks…" unchanged; no auto-advance', () => {
    const { container, readingState } = renderReveal({ mode: 'one-to-one', rating: 7, prediction: 4 });
    expect(readingState.advanceFromStoryReveal).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/You 7/);
    expect(container.textContent).toMatch(/Alice 4/);
    expect(container.textContent).toMatch(/3-point gap/);
  });

  it('CONTROL one-to-one with a missing prediction: still "Calibration data unavailable." (bug stays visible)', () => {
    renderReveal({ mode: 'one-to-one', rating: 7, prediction: null });
    expect(screen.getByText('Calibration data unavailable.')).toBeInTheDocument();
  });

  // Review F/#4: unknown mode keeps the one-to-one reveal LAYOUT (never skipped) but
  // the author's number is shown only for an explicit 'one-to-one' (fail closed).
  it('letterMode omitted (unknown): reveal step kept, but no author number', () => {
    const { container, readingState } = renderReveal({ rating: 6, prediction: 6 });
    expect(readingState.advanceFromStoryReveal).not.toHaveBeenCalled();
    expect(screen.getByText('Calibration data unavailable.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Alice 6/);
  });

  it('push responses on a public letter count as enabled (signed-in receiver): not skipped', () => {
    const { readingState } = renderReveal({ mode: 'one-to-many', rating: 5, prediction: null, responsesMode: 'push', isAuthenticatedReceiver: true });
    expect(readingState.advanceFromStoryReveal).not.toHaveBeenCalled();
  });

  it('identity still resolving: a public reveal is NOT auto-skipped yet', () => {
    const { readingState } = renderReveal({ mode: 'one-to-many', rating: 5, prediction: null, responsesMode: 'off', identitySettled: false });
    expect(readingState.advanceFromStoryReveal).not.toHaveBeenCalled();
  });
});
