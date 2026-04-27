/**
 * @file p825-free-mode-badge-identity.test.tsx
 * @description Canary for P825 — partner badge identity in FreeModeView.
 *
 * Bug: free-mode-view.tsx:226 invokes <LiveStoryCardExpanded> without badgePersonName
 * (or any of the other badge person props). When the viewer is the story author,
 * the row above the point falls back to story.authorName (the viewer's full name)
 * instead of showing the partner's first name.
 *
 * P792 fixed this for live-mode-view.tsx (guided mode) by threading badgePersonName
 * through all 13 invocation sites. Free mode was out of scope — same defect, different file.
 *
 * This test renders FreeModeView in unlocked phase with author=viewer and asserts the
 * partner's first name appears in the badge row above the point. FAILS before fix.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FreeModeView } from '@/app/components/partners/free-mode-view';
import { DEFAULT_LIVE_STATE, type LiveSessionState } from '@/app/types';

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
  onSliderChange: vi.fn(),
  onSpeakFreely: vi.fn(),
  onRoundComplete: vi.fn(),
  onDiscussAnother: vi.fn(),
};

// alice is the story author and the viewer. partner = "Bob".
// point.profileSubjectPosition='agree' so the badge row renders.
const aliceStory = {
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
    profileSubjectPosition: 'agree' as string | null,
  }],
};

describe('FreeModeView — partner badge identity (P825 canary)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // it.todo until /fix wires badgePersonName props through FreeModeView (P818 pattern).
  // Verified failing locally: no <span class="font-medium">Bob</span> rendered —
  // badge falls back to story.authorName ('alice'). /fix flips this to `it`.
  it.todo('row above point shows partner first name, not viewer (story author) name', () => {
    // freePhase='unlocked' → renders the slider + selectedStory card with points expanded.
    // alice is creator AND story author → isAuthorOfSelected should be true → badge = "Bob".
    // Bug: free-mode-view doesn't thread userId/partnerName to badge props of
    //      LiveStoryCardExpanded → falls back to story.authorName = "alice".
    const state: LiveSessionState = {
      ...DEFAULT_LIVE_STATE,
      sessionMode: 'free',
      freePhase: 'unlocked',
      checkerIsCreator: true,                  // creator = checker = speaker
      livePositionsJoiner: { 'p1': 'agree' },  // partner has a position on the point
    };

    renderWithRouter(
      <FreeModeView
        {...mockHandlers}
        liveState={state}
        partnerName="Bob"
        isCreator={true}
        selectedStory={aliceStory as never}
      />
    );

    // After fix: badge above point shows "Bob" (partner's first name).
    // Before fix: badge falls back to "alice" (story.authorName) — this assertion FAILS.
    //
    // Use queryAllByText to disambiguate from other UI surfaces that may also mention
    // the partner name (e.g., "How well do you believe Bob understands your intention?").
    // The badge row contains a <span className="font-medium">{name}</span>.
    const badgeNames = screen.queryAllByText('Bob', { selector: 'span.font-medium' });
    expect(
      badgeNames.length,
      'Expected the row above the point to show partner first name "Bob", ' +
      'but it fell back to story.authorName because free-mode-view.tsx:226 ' +
      'does not thread badgePersonName to <LiveStoryCardExpanded>.'
    ).toBeGreaterThan(0);

    // Negative invariant — the row must NOT show the viewer's own name.
    const ownNameInBadge = screen.queryAllByText('alice', { selector: 'span.font-medium' });
    expect(
      ownNameInBadge,
      'Row above point must not show the viewer\'s own name (P792 invariant).'
    ).toEqual([]);
  });
});
