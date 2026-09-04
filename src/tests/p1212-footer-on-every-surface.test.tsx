/**
 * @file p1212-footer-on-every-surface.test.tsx
 * @description P1212 §2, founder decision 2026-09-04 — the operator disclosure reaches every
 * surface that renders an agent story, not just the two that happened to have it.
 *
 * WHAT THIS IS FOR. `AgentStoryFooter` shipped with P1141 on two surfaces: the story detail
 * card and the sealed-letter card. An adversarial review counted the call sites and found
 * exactly those two — while §4 of this spec had just propagated the EVIDENCE (video
 * thumbnails, verbatim timecoded quotes attributed to a real living person) to three more.
 *
 * So a feed reader saw `AGENT · on Yann LeCun`, a video, and quotes in his own words, with
 * no line anywhere on the surface saying who operates the account or that the prose around
 * the quotes is machine-written. The disclosure was one click away, on the story page. The
 * founder's call, asked directly, was to close the gap rather than rely on the click:
 * propagating the argument without its disclosure is the asymmetry this spec exists to end.
 *
 * WHY A PARAMETERISED RENDER TEST AND NOT A GREP. A grep for `AgentStoryFooter` proves the
 * symbol is imported. It cannot prove the component is reached for an agent — and being
 * reached is the whole claim, because every one of these call sites is gated on
 * `isAgent && !identityPending`. This spec has shipped a symbol-present-but-not-rendered
 * defect three separate times; a census that renders is the only kind worth having here.
 *
 * The census is deliberately over the surfaces a READER can arrive at with an agent story on
 * screen. Adding a sixth surface without a footer must fail here, which is why the list is
 * data rather than one test per file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { StoryCardWithLinks } from '@/app/components/social/story-card-with-links';
import type { StoryWithAuthor } from '@/app/types';

const AGENT_ID = 'agent-1';

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
  useAuth: () => ({ session: { user: { id: 'viewer-1' } }, user: { id: 'viewer-1' }, isLoading: false }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function agentStory(overrides: Partial<StoryWithAuthor> = {}): StoryWithAuthor {
  return {
    id: 'story-1',
    authorId: AGENT_ID,
    content: 'Concentration of capability is the governance problem.',
    visibility: 'public',
    currentVersion: 1,
    understoodCount: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    tags: [],
    systemTags: [],
    authorName: 'Agent · Yann LeCun',
    authorSlug: 'agent-yann-lecun',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    videoQuotes: { quotes: [{ text: 'the blocker is not size', seconds: 876 }], durationSeconds: 1200 },
    ...overrides,
  } as StoryWithAuthor;
}

/** Each entry renders ONE surface with ONE agent story on screen. */
const SURFACES: Array<[string, () => void]> = [
  ['Feed story card', () => {
    render(<MemoryRouter><FeedStoryCard story={agentStory()} /></MemoryRouter>);
  }],
  ['Linked story card (point detail / profile)', () => {
    render(
      <MemoryRouter>
        <StoryCardWithLinks
          // This surface takes the PROTOTYPE story shape (`.text`), not the production
          // one (`.content`) — the same conversion its real callers perform.
          story={{ ...agentStory(), text: 'Concentration of capability is the governance problem.' } as never}
          author={{
            id: AGENT_ID,
            name: 'Agent · Yann LeCun',
            slug: 'agent-yann-lecun',
          } as never}
        />
      </MemoryRouter>
    );
  }],
];

beforeEach(() => {
  navigate.mockClear();
  cleanup();
});

describe('P1212 §2 — the operator disclosure renders wherever an agent story does', () => {
  it.each(SURFACES)('%s carries the agent story footer', (_name, renderIt) => {
    renderIt();
    expect(
      screen.queryByTestId('agent-story-footer'),
      'an agent story that shows the argument must also say who operates the account writing it',
    ).toBeTruthy();
  });

  it.each(SURFACES)('%s names the operator and the machine-written prose', (_name, renderIt) => {
    renderIt();
    const text = screen.getByTestId('agent-story-footer').textContent ?? '';
    expect(text).toContain('An agent account operated by ClarityPledge wrote this on Yann LeCun.');
    expect(text).toContain('machine-written');
  });

  /**
   * The negative control. Without it the footer could be rendered unconditionally and every
   * assertion above would still pass — while a HUMAN's story carried a line claiming a
   * machine wrote it, which is a worse falsehood than the one this test exists to prevent.
   */
  it('does NOT render the footer on a human-authored story', () => {
    render(
      <MemoryRouter>
        <FeedStoryCard story={agentStory({ authorId: 'human-1', authorName: 'Jane Doe' })} />
      </MemoryRouter>
    );
    expect(
      screen.queryByTestId('agent-story-footer'),
      'a human story must never carry the machine disclosure',
    ).toBeNull();
  });
});
