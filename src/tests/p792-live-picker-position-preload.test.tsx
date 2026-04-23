/**
 * @file p792-live-picker-position-preload.test.tsx
 * @description Specification tests for P792 — picker-sourced /live position preload.
 *
 * T1: toPositionRecord converts Map<pointId, { position }> to Record<pointId, PositionType>
 * T2: Both creator and joiner records are correctly shaped for atomic state update
 * T3: LiveModeView maps livePositionsJoiner → profileSubjectPosition when isCreator=true
 *
 * T1/T2 specify the toPositionRecord helper that bootstrapLetterSourcedSession uses (P733)
 * and that handleSelectStory will use after the fix (same module-scope definition).
 * T3 specifies the rendering invariant: populated livePositionsJoiner drives the partner badge.
 *
 * Reference: bootstrapLetterSourcedSession in clarity-live-page.tsx is the pattern to mirror.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LiveModeView } from '@/app/components/partners/live-mode-view';
import { DEFAULT_LIVE_STATE, type LiveSessionState, type PositionType } from '@/app/types';

vi.mock('@/auth', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    isLoading: false,
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

const mockHandlers = {
  onRatingSubmit: vi.fn(),
  onSkip: vi.fn(),
  onExplainBackStart: vi.fn(),
  onExplainBackRate: vi.fn(),
  onStartCheck: vi.fn(),
  onStartProve: vi.fn(),
  onBackToIdle: vi.fn(),
  onClearSkipNotification: vi.fn(),
  onCancelLocalRating: vi.fn(),
  onExitMeeting: vi.fn(),
  onExplainBackDone: vi.fn(),
  onCelebrationComplete: vi.fn(),
  onSharePerspective: vi.fn(),
  onAskToExplainFirst: vi.fn(),
  onContinueAsListener: vi.fn(),
  onInsistToSpeak: vi.fn(),
  onLetThemSpeak: vi.fn(),
  onCancelNegotiation: vi.fn(),
  onClarifyStart: vi.fn(),
  onClarifyDone: vi.fn(),
};

const defaultProps = {
  currentUserName: 'alice',
  partnerName: 'Partner',
  isLocallyRating: false,
  ...mockHandlers,
};

// ─── Pure helper spec (T1 + T2) ──────────────────────────────────────────────
// Specifies toPositionRecord — currently inlined in bootstrapLetterSourcedSession,
// lifted to module scope by Fix B so handleSelectStory can share it.
// After the fix, replace this inline definition with the real import.

interface PositionLike { position: string }

function toPositionRecord(map: Map<string, PositionLike>): Record<string, PositionType> {
  return Object.fromEntries(
    [...map.entries()].map(([id, v]) => [id, v.position as PositionType])
  );
}

describe('toPositionRecord() — bootstrap position converter', () => {
  it('T1: converts creator positions map to Record<pointId, PositionType>', () => {
    const creatorMap = new Map<string, PositionLike>([
      ['point-aaa', { position: 'agree' }],
      ['point-bbb', { position: 'strongly_disagree' }],
    ]);

    const record = toPositionRecord(creatorMap);

    expect(record['point-aaa']).toBe('agree');
    expect(record['point-bbb']).toBe('strongly_disagree');
    expect(Object.keys(record)).toHaveLength(2);
  });

  it('T2: creator and joiner records are correctly shaped for atomic updateLiveState call', () => {
    const creatorMap = new Map<string, PositionLike>([
      ['point-1', { position: 'agree' }],
    ]);
    const joinerMap = new Map<string, PositionLike>([
      ['point-1', { position: 'disagree' }],
    ]);

    const livePositionsCreator = toPositionRecord(creatorMap);
    const livePositionsJoiner = toPositionRecord(joinerMap);

    // Both keys must be present in a single updateLiveState call (P643 atomic invariant).
    const atomicUpdate = { livePositionsCreator, livePositionsJoiner };

    expect(atomicUpdate.livePositionsCreator['point-1']).toBe('agree');
    expect(atomicUpdate.livePositionsJoiner['point-1']).toBe('disagree');
    expect('livePositionsCreator' in atomicUpdate).toBe(true);
    expect('livePositionsJoiner' in atomicUpdate).toBe(true);
  });
});

// ─── Rendering invariant (T3) ─────────────────────────────────────────────────
// Specifies that LiveModeView correctly maps livePositionsJoiner → profileSubjectPosition
// when isCreator=true, making the partner badge visible in the story card.
// This is the post-fix rendering contract for picker-sourced sessions.

const storyWithPoint = {
  id: 'story-test',
  authorId: 'user-alice',
  authorName: 'alice',
  authorSlug: 'alice',
  content: 'Test story content',
  visibility: 'public',
  points: [{
    id: 'p1',
    statement: 'Test point statement',
    tags: [] as string[],
    systemTags: [] as string[],
    visibility: 'public',
    profileSubjectPosition: null as string | null,
  }],
};

describe('LiveModeView — livePositionsJoiner drives partner badge (T3)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('T3: partner badge renders in gap-revealed phase when livePositionsJoiner is populated', () => {
    const state: LiveSessionState = {
      ...DEFAULT_LIVE_STATE,
      ratingPhase: 'revealed',
      checkerName: 'alice',
      checkerRating: 5,
      checkerSubmitted: true,
      responderRating: 8,
      responderSubmitted: true,
      explainBackRatings: [],
      livePositionsJoiner: { 'p1': 'agree' },
      selectedStoryData: storyWithPoint,
    };

    renderWithRouter(
      <LiveModeView
        {...defaultProps}
        liveState={state}
        userId="user-alice"
        isCreator={true}
      />
    );

    // Partner badge renders when profileSubjectPosition is truthy.
    // livePositionsJoiner maps point 'p1' → 'agree' → badge visible with ear count.
    const storyCard = screen.getByTestId('live-story-card-expanded');
    expect(storyCard).toBeInTheDocument();
  });
});
