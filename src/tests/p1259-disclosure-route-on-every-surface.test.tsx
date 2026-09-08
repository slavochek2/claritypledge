/**
 * @file p1259-disclosure-route-on-every-surface.test.tsx
 * @description P1259 change 2 — the census that used to demand a FOOTER on every agent
 * story surface now demands a ROUTE. Same list, inverted contract.
 *
 * WAS `p1212-footer-on-every-surface.test.tsx`, renamed with `git mv` so the history of
 * the inversion is followable. The spec's risk table is explicit that this file must be
 * rewritten and not deleted: "`p1212-footer-on-every-surface.test.tsx` will fail by design
 * → MITIGATE: rewrite the assertion to the new contract — footer on the profile, chip on
 * every surface. Do not delete the test."
 *
 * WHAT P1212 ASSERTED, AND WHY IT WAS RIGHT THEN. P1212 §4 propagated the EVIDENCE — video
 * thumbnails, verbatim timecoded quotes attributed to a real living person — to three more
 * surfaces than the disclosure reached. A feed reader saw `AGENT · on Yann LeCun`, a video,
 * and quotes in his own words, with no line saying who operates the account or that the
 * prose around the quotes is machine-written. The founder's call then was to close the gap
 * rather than rely on a click.
 *
 * WHAT CHANGED. Four filed agent stories later, the repeated two-sentence block under every
 * card in a scrolling feed had become furniture. Founder, 2026-09-07: "i would remove it
 * from stories and put only below desiption on profile of agents thats it..?" and, deciding
 * the route: "if people are interested, who is this agent? They click and they read it
 * there. I guess that makes more sense. Otherwise, we have a lot of redundancy, huge amount
 * of text on every story."
 *
 * SO THE CONTRACT IS NOW THREE-PART, and the third part is the one two adversarial reviewers
 * of the spec independently said would be missed:
 *
 *   1. NO surface renders the two-sentence footer.
 *   2. EVERY surface still renders `AGENT · on {Full Name}` — authorship is never unmarked,
 *      even for a reader who never clicks.
 *   3. On every surface, the NAME is an actual control that navigates. The `AGENT` chip is
 *      settled as deliberately not-a-link (`agent-byline.tsx` note 1), so if the name renders
 *      as a plain `<span>` the surface has NO route to the disclosure and part 1 has simply
 *      deleted it. Part 3 is why this file exists at all — parts 1 and 2 are greppable, and
 *      part 3 is the one that silently fails.
 *
 * WHY A PARAMETERISED RENDER TEST AND NOT A GREP — unchanged from P1212, and now doubly so.
 * A grep proves a symbol is imported. It cannot prove the component is REACHED for an agent
 * (every call site is gated on `isAgent && !identityPending`), and it certainly cannot prove
 * that what reached the DOM is a button rather than a span. This spec's parent shipped a
 * symbol-present-but-not-rendered defect three separate times.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { StoryCardWithLinks } from '@/app/components/social/story-card-with-links';
import { StoryCardDetail } from '@/app/components/social/StoryCardDetail';
import { QuotedStory } from '@/app/components/social/point-card-with-links';
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

  /**
   * ADDED AFTER ADVERSARIAL REVIEW, which found this exact surface unrouted and pointed out
   * that this file could not have caught it: the census claimed to be the census while
   * rendering only the two components its predecessor rendered.
   *
   * `StoryCardDetail` takes an EARLY RETURN when `context === 'point-detail'` and an
   * `authorPosition` is present — the "quote pattern" a point page uses in its position
   * sections. That branch renders the whole agent story (its own `story.content`) and it never
   * carried the footer, so once P1259 removed the footer globally it became a machine-written
   * reading of a real named person with no path to the disclosure at all.
   *
   * The props below are the minimum that reaches that branch; getting them wrong renders the
   * OTHER branch and the test passes without testing anything, which is the failure mode this
   * whole file exists to avoid — so the assertion body also checks the branch was reached.
   */
  ['Story card detail — point-detail quote pattern', () => {
    render(
      <MemoryRouter>
        <StoryCardDetail
          story={agentStory()}
          linkedPoints={[]}
          positionCounts={new Map()}
          userPositions={new Map()}
          context="point-detail"
          authorPosition="agree"
        />
      </MemoryRouter>
    );
  }],

  ['Quoted story (feed point card / profile point card)', () => {
    render(
      <MemoryRouter>
        <QuotedStory
          story={{ ...agentStory(), text: 'Concentration of capability is the governance problem.' } as never}
          onClick={() => {}}
          onAuthorClick={() => navigate('/p/agent-yann-lecun')}
          getStoryAuthor={() => ({ id: AGENT_ID, name: 'Agent · Yann LeCun', slug: 'agent-yann-lecun' } as never)}
        />
      </MemoryRouter>
    );
  }],
];

beforeEach(() => {
  navigate.mockClear();
  cleanup();
});

describe('P1259 change 2 — the disclosure moved to the profile, and every surface routes there', () => {
  it.each(SURFACES)('%s renders NO agent story footer', (_name, renderIt) => {
    renderIt();
    expect(
      screen.queryByTestId('agent-story-footer'),
      'the two-sentence footer is removed from every story surface; the disclosure lives on the agent profile',
    ).toBeNull();
  });

  it.each(SURFACES)('%s still marks authorship with the agent byline', (_name, renderIt) => {
    renderIt();
    const byline = screen.getByTestId('agent-byline');
    // The chip's own text plus the connective plus the stripped name. The stored
    // `Agent · ` prefix must not leak — that is what `stripAgentPrefix` is for.
    expect(byline.textContent).toContain('on');
    expect(byline.textContent).toContain('Yann LeCun');
    expect(byline.textContent).not.toContain('Agent · Yann LeCun');
  });

  /**
   * THE ASSERTION THIS FILE EXISTS FOR. `AgentByline` renders the name as a `<button>` only
   * when a call site passes `onNameClick`, and as a `<span>` otherwise — deliberately, so a
   * dead control is never rendered. Before P1259 the span branch was the common one, because
   * the footer carried the disclosure. Now the span branch means a surface with no route.
   *
   * Asserting the TAG, not just that a click fires: a `<span onClick>` would satisfy a
   * fireEvent-based test while remaining unreachable by keyboard and invisible to assistive
   * tech, which is most of what "clickable" has to mean here.
   */
  it.each(SURFACES)('%s renders the byline name as a real control that navigates', (_name, renderIt) => {
    renderIt();
    const nameEl = screen.getByTestId('agent-byline-name');
    expect(
      nameEl.tagName,
      'a surface rendering the name as plain text has no route to the disclosure',
    ).toBe('BUTTON');

    fireEvent.click(nameEl);
    expect(navigate).toHaveBeenCalledTimes(1);
    // Either identifier is a working route: `profile-page-v2` resolves `/p/:id` by slug
    // first and falls back to the profile UUID (see its `getProfileBySlug(id)` path and
    // the `profile.slug === id || profile.id === id` guard). The surfaces genuinely differ
    // — StoryCardDetail passes `authorSlug`, StoryCardWithLinks passes `author.id` — and
    // pinning one spelling here would fail a route that works, which is the opposite of
    // what this assertion is for.
    const target = String(navigate.mock.calls[0]?.[0]);
    expect(target).toMatch(/^\/p\//);
    expect(
      target.includes('agent-yann-lecun') || target.includes(AGENT_ID),
      `the name must navigate to THIS author's profile; got ${target}`,
    ).toBe(true);
  });

  /**
   * The negative control, carried over from P1212 and still load-bearing: without it every
   * assertion above would pass on a card that rendered the agent contract unconditionally,
   * putting a machine byline on a human's story.
   */
  it('does NOT render the agent byline on a human-authored story', () => {
    render(
      <MemoryRouter>
        <FeedStoryCard story={agentStory({ authorId: 'human-1', authorName: 'Jane Doe' })} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('agent-byline')).toBeNull();
    expect(screen.queryByTestId('agent-story-footer')).toBeNull();
  });
});
