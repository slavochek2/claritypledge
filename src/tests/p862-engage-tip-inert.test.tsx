/**
 * @file p862-engage-tip-inert.test.tsx
 * @description Regression test: P862 — the post-selection intensity tip row in the
 * letter engage phases must gate its focusable replay button with `inert`, never
 * `aria-hidden`.
 *
 * Bug: letter-flow-content.tsx wrapped the tip row (which contains the focusable
 * "Show the intensity tutorial again" button) in `aria-hidden={selectedPosition === null}`.
 * When the row was hidden while the button still held focus, Chrome emitted:
 * "Blocked aria-hidden on an element because its descendant retained focus."
 *
 * Fix: replace `aria-hidden` with the `inert` attribute, which hides from AT AND
 * blocks focus/interaction without the focused-descendant conflict.
 *
 * Two surfaces (Surface Lens): point-engage AND remaining-point-engage — identical
 * pattern. Both are covered below.
 *
 * Canary: before fix the row carries aria-hidden="true" and no inert; after fix it
 * carries inert and no aria-hidden.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// ── Mocks for heavy sub-components (mirrors p712 harness) ────────────────────
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: null, user: null }),
}));
// Stub PositionButtons so the test can deterministically drive a selection
// (the real component routes selection through intensity dropdowns/portals).
// importActual preserves the module's other exports (PositionButton, helpers).
vi.mock('@/app/components/shared/PositionButton', async (importActual) => ({
  ...(await importActual<typeof import('@/app/components/shared/PositionButton')>()),
  PositionButtons: ({ onPositionClick }: { onPositionClick: (p: string) => void }) => (
    <button data-testid="cp-pick-agree" onClick={() => onPositionClick('agree')}>
      pick agree
    </button>
  ),
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
vi.mock('@/app/utils/letter-snapshot-mapper', () => ({
  snapshotToStoryWithPoints: vi.fn(() => ({
    id: 'story-1',
    title: 'Test Story',
    content: 'Story text',
    authorName: 'Sender',
    points: [{ id: 'pt1', statement: 'Test statement', profileSubjectPosition: null }],
  })),
}));
vi.mock('@/app/utils/letter-reading-utils', () => ({
  calculateStoryProgress: vi.fn(() => 0.5),
}));

import { LetterFlowContent } from '@/app/components/letters/letter-flow-content';
import type { LetterStorySnapshot } from '@/app/types';
import type { UseLetterReadingStateReturn } from '@/app/hooks/useLetterReadingState';

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makeSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 0,
    point_config: {
      storyText: 'Story text',
      storyTitle: 'Test Story',
      points: [{ id: 'pt1', text: 'Test statement', authorPosition: 'agree' }],
    },
    visibility: 'published',
  };
}

function makeReadingState(phase: 'point-engage' | 'remaining-point-engage'): UseLetterReadingStateReturn {
  return {
    state: {
      currentStoryIndex: 0,
      isComplete: false,
      stories: [{ phase, rating: 4, prediction: 5, positions: {}, currentPointIndex: 0 }],
    },
    currentPhase: phase,
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

function renderPhase(phase: 'point-engage' | 'remaining-point-engage') {
  render(
    <BrowserRouter>
      <LetterFlowContent
        snapshots={[makeSnapshot()]}
        senderName="Alice"
        senderProfileOwner={SENDER_PROFILE}
        readingState={makeReadingState(phase)}
        showFocusHeader={false}
        renderCompletion={() => <div data-testid="completion" />}
      />
    </BrowserRouter>
  );
  // The tip row holds the focusable replay button; grab its container via the tip text.
  const tip = screen.getByText('Double-click to adjust position level');
  return tip.parentElement as HTMLElement;
}

describe('P862: engage-phase intensity tip row uses inert, not aria-hidden', () => {
  afterEach(() => vi.clearAllMocks());

  it('point-engage: hidden → inert (not aria-hidden); selected → neither', () => {
    const row = renderPhase('point-engage');
    // The row contains a focusable <button> — gate it via inert, never aria-hidden.
    expect(row.querySelector('button')).not.toBeNull();
    // Hidden state (no position): RED before fix (no inert / had aria-hidden), GREEN after.
    expect(row).toHaveAttribute('inert');
    expect(row).not.toHaveAttribute('aria-hidden');
    // Selected state: inert must clear so the replay button is interactive.
    // Guards against a logic inversion (inert={selectedPosition !== null}).
    fireEvent.click(screen.getAllByTestId('cp-pick-agree')[0]);
    expect(row).not.toHaveAttribute('inert');
    expect(row).not.toHaveAttribute('aria-hidden');
  });

  it('remaining-point-engage: hidden → inert (not aria-hidden); selected → neither (second surface)', () => {
    const row = renderPhase('remaining-point-engage');
    expect(row.querySelector('button')).not.toBeNull();
    expect(row).toHaveAttribute('inert');
    expect(row).not.toHaveAttribute('aria-hidden');
    fireEvent.click(screen.getAllByTestId('cp-pick-agree')[0]);
    expect(row).not.toHaveAttribute('inert');
    expect(row).not.toHaveAttribute('aria-hidden');
  });
});
