/**
 * @file p1212-expander-parity.test.tsx
 * @description P1212 §5 — the point<->story link renders the same affordance on every
 * surface that shows it, in both directions.
 *
 * WHAT §5 IS ACTUALLY ABOUT. Before this section the link rendered four different ways:
 * profile point cards and the point detail page had a chevron + count expander; feed point
 * cards had no route to the linked stories at all; feed story cards had a static count
 * with nothing behind it. Same relation, four presentations, decided by which page a
 * reader happened to be on — the drift this whole spec exists to close.
 *
 * WHY THESE ARE RENDER TESTS AND NOT A SOURCE-CONTRACT SWEEP. The rest of P1212 uses
 * source greps because four of its seven surfaces are module-private functions that
 * cannot be imported. Both §5 surfaces are exported components taking plain props, so
 * there is nothing stopping a real render — and P1212's own history is the argument for
 * preferring one: §1's parity test asserted the TOKEN `stripQuoteLabel` appeared in each
 * file, passed on all five surfaces, and the label was still on screen on four of them.
 * A grep proves a symbol is present; only a render proves a reader sees the right thing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { QuotedStory } from '@/app/components/social/point-card-with-links';
import { QUOTE_LABEL_PREFIX } from '@/lib/story-quotes';
import type { StoryWithAuthor, PointSummary } from '@/app/types';

/**
 * Agent-ness comes from the REGISTRY, never from the name — the §4b rule that keeps a
 * machine marker off a human's byline on the sealed-letter surface. So a test that wants
 * the agent branch has to say so through the registry; passing a name that merely looks
 * like an agent's must NOT flip it, and the un-mocked default below is what proves that.
 */
vi.mock('@/app/contexts/agent-accounts-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/contexts/agent-accounts-context')>();
  return {
    ...actual,
    useAgentAccountIds: () => ({
      isAgentAccountId: (id?: string | null) => id === 'agent-1',
      operatorNameFor: () => 'ClarityPledge',
      isLoading: false,
    }),
  };
});

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const POINTS: PointSummary[] = [
  {
    id: 'pt-1',
    statement: 'Concentration of AI capability is a governance problem, not a safety one.',
    tags: [],
    systemTags: [],
    visibility: 'public',
  },
  {
    id: 'pt-2',
    statement: 'Open weights do more against concentration than regulation will.',
    tags: [],
    systemTags: [],
    visibility: 'public',
  },
];

function makeStory(overrides: Partial<StoryWithAuthor> = {}): StoryWithAuthor {
  return {
    id: 'story-1',
    authorId: 'author-1',
    content: 'A model holding all human knowledge would have to be fine-tuned locally.',
    visibility: 'public',
    currentVersion: 1,
    understoodCount: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    tags: [],
    systemTags: [],
    authorName: 'Yann LeCun',
    authorSlug: 'yann-lecun',
    ...overrides,
  };
}

function renderFeedStoryCard(props: Partial<Parameters<typeof FeedStoryCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <FeedStoryCard story={makeStory()} {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigate.mockClear();
  cleanup();
});

describe('P1212 §5 — feed story card: linked-point expander', () => {
  /**
   * The three-state prop is the part worth pinning. `undefined` is "the batch query has
   * not resolved", and it must render NOTHING — a card that prints "0 points" while its
   * links are still in flight is stating a falsehood about the story rather than a fact
   * about the fetch, and the reader has no way to tell the two apart.
   */
  it('renders no footer at all while the links are still loading', () => {
    renderFeedStoryCard({ linkedPoints: undefined });
    expect(screen.queryByTestId('feed-story-point-expander')).toBeNull();
    expect(screen.queryByText(/points?$/)).toBeNull();
  });

  it('renders "0 points" once loaded with none linked — loaded-and-empty is not loading', () => {
    renderFeedStoryCard({ linkedPoints: [] });
    expect(screen.getByText('0 points')).toBeTruthy();
    expect(screen.queryByTestId('feed-story-point-expander')).toBeNull();
  });

  it('renders a collapsed expander with the count, matching the profile card affordance', () => {
    renderFeedStoryCard({ linkedPoints: POINTS });
    const expander = screen.getByTestId('feed-story-point-expander');
    expect(expander.textContent).toContain('2 points');
    expect(expander.getAttribute('aria-expanded')).toBe('false');
    // Collapsed means collapsed — the statements must not be in the DOM yet.
    expect(screen.queryByText(POINTS[0]!.statement)).toBeNull();
  });

  it('singularises the count — "1 point", not "1 points"', () => {
    renderFeedStoryCard({ linkedPoints: [POINTS[0]!] });
    expect(screen.getByTestId('feed-story-point-expander').textContent).toContain('1 point');
    expect(screen.getByTestId('feed-story-point-expander').textContent).not.toContain('1 points');
  });

  it('expands in place to the point statements, and flips aria-expanded', () => {
    renderFeedStoryCard({ linkedPoints: POINTS });
    fireEvent.click(screen.getByTestId('feed-story-point-expander'));

    expect(screen.getByTestId('feed-story-point-expander').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(POINTS[0]!.statement)).toBeTruthy();
    expect(screen.getByText(POINTS[1]!.statement)).toBeTruthy();
  });

  it('navigates to the point, not the story, when a linked point is clicked', () => {
    renderFeedStoryCard({ linkedPoints: POINTS });
    fireEvent.click(screen.getByTestId('feed-story-point-expander'));
    fireEvent.click(screen.getByText(POINTS[1]!.statement));

    expect(navigate).toHaveBeenCalledWith('/point/pt-2');
  });

  /**
   * §5 must not re-open §1. The feed story card is a `suppresses label` surface: it
   * renders no quote block, so the stored label must never reach the screen — including
   * once the new footer is on the card.
   */
  it('still suppresses the quote label after §5 adds the footer', () => {
    renderFeedStoryCard({
      linkedPoints: POINTS,
      story: makeStory({
        content: `The blocker is not size.\n\n${QUOTE_LABEL_PREFIX} Yann LeCun\n\n"a quote" — 14:36`,
      }),
    });
    expect(document.body.textContent).not.toContain(QUOTE_LABEL_PREFIX);
    expect(document.body.textContent).toContain('The blocker is not size.');
  });
});

// ---------------------------------------------------------------------------
// The eighth surface. Found while implementing §5, fixed here, and pinned by a RENDER
// test rather than a census row — because the census row does not work.
// ---------------------------------------------------------------------------

/**
 * WHY THIS IS NOT A CENSUS ROW IN p1212-quote-label-parity.test.tsx.
 *
 * It was, first. The census's `suppresses label` policy asserts the file contains
 * `storyTextForDisplay` — and when the fix below was reverted to the leaking
 * `stripHashtags` call, the suite still reported 27 passed, because the IMPORT of
 * `storyTextForDisplay` survived the revert and the grep matched that. The row was
 * decorative: it could not distinguish the fixed component from the broken one.
 *
 * That is the same defect §1 shipped with, one layer up — a source grep proving a symbol
 * is present rather than used. `QuotedStory` was made exportable by §5 (the feed point
 * card renders it), so unlike the four module-private surfaces there is no reason to
 * settle for a grep here.
 */
describe('P1212 §1 (eighth surface) — QuotedStory suppresses the quote label', () => {
  const LABEL_STORY = {
    id: 'qs-1',
    authorId: 'author-1',
    text: `The blocker is not size.\n\n${QUOTE_LABEL_PREFIX} Yann LeCun\n\n"a quote" — 14:36`,
    createdAt: '2026-09-01T00:00:00Z',
    visibility: 'public' as const,
    linkedPointIds: [],
    understoodCount: 0,
  };

  function renderQuoted() {
    return render(
      <MemoryRouter>
        <QuotedStory story={LABEL_STORY} onClick={() => {}} />
      </MemoryRouter>
    );
  }

  it('does not print the label — it renders no quote block, so it must show no heading', () => {
    renderQuoted();
    expect(document.body.textContent).not.toContain(QUOTE_LABEL_PREFIX);
  });

  it('keeps the prose and the quote body — this strips a heading, not content', () => {
    renderQuoted();
    expect(document.body.textContent).toContain('The blocker is not size.');
    expect(document.body.textContent).toContain('a quote');
  });
});

/**
 * The §4d defect, in the component §4d did not reach. `QuotedStory` rendered the STORED
 * profile name, which on an agent account carries the reserved `Agent · ` prefix the
 * database enforces (p1104_agent_accounts.sql:206-209) and `stripAgentPrefix` exists to
 * keep off screen. It leaked 4x on the feed, verified in a browser before this fix.
 *
 * The spec's risk table states the rule for the sibling case — "§5 makes this card MORE
 * reachable, so §5 must not ship before §4d" — and §5 is what puts this component on the
 * feed, so the same sentence binds here.
 */
describe('P1212 §4d (QuotedStory) — the stored `Agent · ` prefix never reaches the screen', () => {
  const AGENT_STORY = {
    id: 'qs-2',
    authorId: 'agent-1',
    text: 'A model holding all human knowledge would have to be fine-tuned locally.',
    createdAt: '2026-09-01T00:00:00Z',
    visibility: 'public' as const,
    linkedPointIds: [],
    understoodCount: 0,
  };

  it('renders the subject name without the reserved prefix', () => {
    render(
      <MemoryRouter>
        <QuotedStory
          story={AGENT_STORY}
          onClick={() => {}}
          getStoryAuthor={() => ({ id: 'agent-1', name: 'Agent · Yann LeCun' })}
        />
      </MemoryRouter>
    );

    expect(document.body.textContent).toContain('Yann LeCun');
    expect(document.body.textContent).not.toContain('Agent ·');
  });
});
