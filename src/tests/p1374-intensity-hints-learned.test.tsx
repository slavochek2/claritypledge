/**
 * @file p1374-intensity-hints-learned.test.tsx
 * @description P1374: one "has picked a level" flag governs both letter intensity hints.
 * Not learned + tutorial unseen → modal auto-opens. Not learned + seen → tip text after an
 * Agree/Disagree pick (none after Unsure). Learned → no tip text, no auto-open; "?" replay
 * still works.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { writeIntensityLearned, resetIntensityLearnedMemory } from '@/hooks/use-intensity-learned';
import { resetIntensityPreviewSeenMemory } from '@/hooks/use-intensity-preview-seen';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

vi.mock('@/auth', () => ({
  useAuth: () => ({ session: null, user: null }),
}));
// Stub PositionButtons so the test can deterministically drive a selection
// (the real component routes selection through intensity dropdowns/portals).
// importActual preserves the module's other exports (PositionButton, helpers).
vi.mock('@/app/components/shared/PositionButton', async (importActual) => ({
  ...(await importActual<typeof import('@/app/components/shared/PositionButton')>()),
  PositionButtons: ({ onPositionClick }: { onPositionClick: (p: string) => void }) => (
    <div>
      <button data-testid="cp-pick-agree" onClick={() => onPositionClick('agree')}>pick agree</button>
      <button data-testid="cp-pick-unsure" onClick={() => onPositionClick('unsure')}>pick unsure</button>
      <button data-testid="cp-pick-somewhat" onClick={() => onPositionClick('somewhat_disagree')}>pick somewhat</button>
    </div>
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
const SEEN_KEY = 'letter_intensity_preview_seen_at_v2';
const LEARNED_KEY = 'intensity_learned_at_v1';
const TITLE = 'Tap again if you disagree only Somewhat, or Strongly';

function renderEngage(phase: 'point-engage' | 'remaining-point-engage') {
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
  return screen.getByLabelText('Show the intensity tutorial again').parentElement as HTMLElement;
}

// Both engage surfaces carry their own tip row and PositionButtons call site.
describe.each(['point-engage', 'remaining-point-engage'] as const)('P1374 (%s): letter intensity hints stop once learned', (phase) => {
  beforeEach(() => {
    localStorage.clear();
    resetIntensityLearnedMemory();
    resetIntensityPreviewSeenMemory();
    vi.clearAllMocks();
  });

  it('no stored state: the tutorial modal auto-opens with the shared sentence', () => {
    renderEngage(phase);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: TITLE })).toBeInTheDocument();
  });

  it('seen, not learned: Agree shows the agree tip; Unsure shows no tip text', () => {
    localStorage.setItem(SEEN_KEY, '1');
    const row = renderEngage(phase);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('cp-pick-agree'));
    expect(row).toHaveTextContent('Tap again if you agree only Somewhat, or Strongly');
    fireEvent.click(screen.getByTestId('cp-pick-unsure'));
    expect(row).not.toHaveTextContent(/Tap again/);
  });

  it('picking a Somewhat level hides the tip immediately and persists the learned flag', () => {
    localStorage.setItem(SEEN_KEY, '1');
    const row = renderEngage(phase);
    fireEvent.click(screen.getByTestId('cp-pick-agree'));
    expect(row).toHaveTextContent(/Tap again/);
    fireEvent.click(screen.getByTestId('cp-pick-somewhat'));
    expect(row).not.toHaveTextContent(/Tap again/);
    expect(localStorage.getItem(LEARNED_KEY)).not.toBeNull();
  });

  it('learning elsewhere on the page (shared buttons) hides the letter tip at once', () => {
    localStorage.setItem(SEEN_KEY, '1');
    const row = renderEngage(phase);
    fireEvent.click(screen.getByTestId('cp-pick-agree'));
    expect(row).toHaveTextContent(/Tap again/);
    act(() => writeIntensityLearned());
    expect(row).not.toHaveTextContent(/Tap again/);
  });

  it('a plain Agree pick does not set the learned flag', () => {
    localStorage.setItem(SEEN_KEY, '1');
    renderEngage(phase);
    fireEvent.click(screen.getByTestId('cp-pick-agree'));
    expect(localStorage.getItem(LEARNED_KEY)).toBeNull();
  });

  it('learned (tutorial never seen): no auto-open, no tip text; "?" still opens the modal', () => {
    localStorage.setItem(LEARNED_KEY, '1');
    const row = renderEngage(phase);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('cp-pick-agree'));
    expect(row).not.toHaveTextContent(/Tap again/);
    fireEvent.click(screen.getByLabelText('Show the intensity tutorial again'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
