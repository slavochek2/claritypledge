/**
 * @file p1282-point-embed-expands-stories.test.tsx
 * @description P1282 — the point embed toggles its story list open and renders nothing.
 *
 * WHY THIS IS A RENDER TEST AND NOT A GREP. The defect is not a missing symbol. Every piece
 * of the expansion is present, imported and reachable: `storiesExpanded` flips, the chevron
 * rotates, the accessible name becomes "Collapse linked stories", and the `story_points`
 * fetch returns 200 with content, `video_url` and `video_quotes`. What fails is one boolean
 * in the JSX gate — `(liveSessionMode || profileOwner)` — which on the embed route is
 * `(false || undefined)`, because `point-detail-page.tsx` builds `profileOwner` only when the
 * URL carries `?from=<userId>`. A grep for any of these symbols passes today.
 *
 * WHY THE CONTROL CASE IS IN THIS FILE AND NOT A SEPARATE ONE (epistemic gate 7c). A gate
 * whose fixture contains only inputs it should ACCEPT has an unmeasured false-positive rate.
 * The feed case below is the input that must keep being REFUSED: in the feed there is no
 * embed, no live session and no profile owner, and stories must stay collapsed. If a future
 * change widens the gate too far, that test — not this comment — is what catches it.
 *
 * HISTORY. `c5803784e` (2026-03-18, "fix: allow inline expand of points/stories in blog
 * embeds") removed the `!isEmbed` guard from this exact block and left the owner condition
 * standing, so the fix was half-applied for six months. The sibling surface,
 * `story-card-with-links.tsx:545`, gates its linked-*points* expansion on nothing but
 * `pointsExpanded && linkedPoints.length > 0` — which is why the story embed expands and the
 * point embed does not.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { Point, Story } from '@/app/components/shared/prototype-types';

const AGENT_ID = 'agent-1';
const POINT_ID = 'point-1';
const STORY_TEXT = 'Concentration of capability is the governance problem.';

vi.mock('@/app/contexts/agent-accounts-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/contexts/agent-accounts-context')>();
  return {
    ...actual,
    useAgentAccountIds: () => ({
      isAgentAccountId: (id?: string | null) => id === AGENT_ID,
      operatorNameFor: () => 'ClarityPledge',
      isLoading: false,
    }),
  };
});

vi.mock('@/auth', () => ({
  useAuth: () => ({ session: null, user: null, isLoading: false }),
}));

function point(): Point {
  return {
    id: POINT_ID,
    text: 'Extinction-level risk from AI is a serious near-term concern.',
    createdAt: '2026-09-09T00:00:00Z',
    positions: {},
    linkedStoryIds: ['story-1'],
    visibility: 'public',
  };
}

function story(overrides: Partial<Story> = {}): Story {
  return {
    id: 'story-1',
    authorId: AGENT_ID,
    text: STORY_TEXT,
    createdAt: '2026-09-09T00:00:00Z',
    visibility: 'public',
    linkedPointIds: [POINT_ID],
    understoodCount: 0,
    ...overrides,
  };
}

/** `useEmbedNavigation` reads `?embed=true`; `?expanded=true` seeds `storiesExpanded`. */
function renderAt(search: string, stories: Story[]) {
  return render(
    <MemoryRouter initialEntries={[`/point/${POINT_ID}${search}`]}>
      <PointCardWithLinks point={point()} linkedStories={stories} />
    </MemoryRouter>,
  );
}

describe('P1282 — linked stories in an embedded point', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the linked story when the embed opens pre-expanded', () => {
    renderAt('?embed=true&expanded=true', [story()]);
    expect(screen.getByText(new RegExp(STORY_TEXT, 'i'))).toBeInTheDocument();
  });

  it('renders the linked story after the reader clicks the disclosure in an embed', () => {
    renderAt('?embed=true', [story()]);

    // Collapsed to start: the control exists, the content does not.
    expect(screen.queryByText(new RegExp(STORY_TEXT, 'i'))).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Expand linked stories'));

    expect(screen.getByText(new RegExp(STORY_TEXT, 'i'))).toBeInTheDocument();
  });

  it('collapses again on a second click', () => {
    renderAt('?embed=true&expanded=true', [story()]);
    fireEvent.click(screen.getByLabelText('Collapse linked stories'));
    expect(screen.queryByText(new RegExp(STORY_TEXT, 'i'))).not.toBeInTheDocument();
  });

  it('caps at three stories and offers a "+N more" control', () => {
    const many = [1, 2, 3, 4, 5].map((n) =>
      story({ id: `story-${n}`, text: `Linked story body number ${n}.` }),
    );
    renderAt('?embed=true&expanded=true', many);

    expect(screen.getByText(/Linked story body number 3\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Linked story body number 4\./i)).not.toBeInTheDocument();
    expect(screen.getByText('+2 more stories')).toBeInTheDocument();
  });

  // ─── CONTROL (gate 7c): the input that must still be REFUSED. ─────────────────────────
  it('does NOT expand stories in the feed — no embed, no live session, no profile owner', () => {
    renderAt('', [story()]);
    fireEvent.click(screen.getByLabelText('Expand linked stories'));
    expect(screen.queryByText(new RegExp(STORY_TEXT, 'i'))).not.toBeInTheDocument();
  });
});
