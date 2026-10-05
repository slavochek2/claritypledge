/**
 * @file p1415-cards-details-only.test.tsx
 * @description P1415 — a list card opens ONLY through its `Details →` button (and the explicit
 * links inside it). Tapping the card body navigates nowhere, at any width: on phones the
 * whole-card tap kept sending readers away by accident, and since P1366 every list card carries
 * an always-visible `Details →`.
 *
 * The card root is therefore not a control any more: an `<article>` that keeps its accessible
 * name ("Point: …" / "Story by …"), with no role="button", no tab stop, no pointer cursor and no
 * hover/focus-within border that says "this whole card is a link". This also closes P1366's
 * deferred nested-interactive risk (a role="button" containing buttons).
 *
 * The profile's own StoryCardFull is covered in p1415-profile-story-details-only.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import { LinksInNewTabContext } from '@/app/components/shared/links-in-new-tab';
import type { PointWithUserPosition, StoryWithAuthor } from '@/app/types';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'viewer-1' } }, user: { id: 'viewer-1' } }) }));
vi.mock('@/app/contexts/agent-accounts-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/contexts/agent-accounts-context')>();
  return {
    ...actual,
    useAgentAccountIds: () => ({ isAgentAccountId: () => false, operatorNameFor: () => null, isLoading: false }),
  };
});
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: async () => undefined }),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { setPosition: vi.fn(async () => undefined) } }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const story = {
  id: 'story-1', authorId: 'author-1', content: 'A story body.', visibility: 'public',
  currentVersion: 1, understoodCount: 0, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
  tags: [], systemTags: [], authorName: 'Test Author', authorSlug: 'test-author',
} as unknown as StoryWithAuthor;

const point = {
  id: 'point-1',
  statement: 'A point statement with a link https://example.com/ref in it.',
  tags: [], visibility: 'public',
  positionCounts: { strongly_agree: 0, agree: 1, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 },
  totalPositions: 1, userPosition: null,
} as unknown as PointWithUserPosition;

const profilePoint = {
  id: 'pt-1', text: 'A point on a profile.', createdAt: '2026-09-01T00:00:00Z',
  positions: {}, linkedStoryIds: [], visibility: 'public',
} as unknown as Parameters<typeof PointCardWithLinks>[0]['point'];

type Case = {
  name: string;
  render: () => void;
  testId: string;
  accessibleName: string;
  bodyText: string | RegExp;
  details: string;
  detailPath: string;
  /** Rendered inside a SourceGroup, which focuses the first revealed card. */
  focusTarget?: boolean;
};

const cases: Case[] = [
  {
    name: 'FeedPointCard (/feed, /stake)',
    render: () => render(<MemoryRouter><FeedPointCard point={point} linkedStories={[]} surface="feed" /></MemoryRouter>),
    testId: 'feed-point-card-point-1',
    accessibleName: `Point: ${point.statement}`,
    bodyText: /A point statement with a link/,
    details: 'Details for this point',
    detailPath: '/point/point-1',
  },
  {
    name: 'FeedStoryCard (/feed, /stake)',
    render: () => render(<MemoryRouter><FeedStoryCard story={story} linkedPoints={[]} surface="feed" currentUserId="viewer-1" /></MemoryRouter>),
    testId: 'feed-story-card-story-1',
    accessibleName: 'Story by Test Author',
    bodyText: 'A story body.',
    details: 'Details for this story',
    detailPath: '/story/story-1',
    focusTarget: true,
  },
  {
    name: 'PointCardWithLinks in the profile list',
    render: () => render(
      <MemoryRouter>
        <PointCardWithLinks point={profilePoint} linkedStories={[]} currentUserId="viewer-1" shareSurface="profile" />
      </MemoryRouter>,
    ),
    testId: 'point-card-with-links-pt-1',
    accessibleName: 'Point: A point on a profile.',
    bodyText: 'A point on a profile.',
    details: 'Details for this point',
    detailPath: '/point/pt-1',
  },
];

beforeEach(() => {
  cleanup();
  navigate.mockClear();
});

describe.each(cases)('P1415 — $name opens only via Details', (c) => {
  it('tapping the card body (text, padding) does not navigate', () => {
    c.render();
    fireEvent.click(screen.getByText(c.bodyText, { ignore: '[hidden], script, style' })); // the visible body, not the hidden name span
    fireEvent.click(screen.getByTestId(c.testId));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Enter / Space on the card root does not navigate', () => {
    c.render();
    const root = screen.getByTestId(c.testId);
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.keyDown(root, { key: ' ' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Details → is described by its card, so a screen reader\'s button list tells the cards apart', () => {
    c.render();
    expect(screen.getByRole('button', { name: c.details, exact: true })).toHaveAccessibleDescription(c.accessibleName);
  });

  it('Details → opens the detail page', () => {
    c.render();
    fireEvent.click(screen.getByRole('button', { name: c.details, exact: true }));
    expect(navigate).toHaveBeenCalledWith(c.detailPath);
  });

  it('the root is an <article>, not a control: no role="button", no tab stop', () => {
    c.render();
    const root = screen.getByTestId(c.testId);
    expect(root.tagName).toBe('ARTICLE');
    expect(root.getAttribute('role')).toBeNull();
    // Never a Tab stop: no tabindex, or tabindex="-1". (`root.tabIndex` alone is blind — an
    // element with NO tabindex also reports -1.) The story card is "-1" on purpose: a programmatic
    // focus target for SourceGroup's "Show N more", still not reachable by Tab.
    expect([null, '-1']).toContain(root.getAttribute('tabindex'));
    if (c.focusTarget) {
      root.focus();
      expect(document.activeElement).toBe(root);
    }
    if (c.accessibleName) expect(screen.getByRole('article', { name: c.accessibleName })).toBe(root);
  });

  it('no pointer cursor and no whole-card hover / focus-within border', () => {
    c.render();
    const tokens = screen.getByTestId(c.testId).className.split(/\s+/);
    expect(tokens).not.toContain('cursor-pointer');
    expect(tokens.filter((t) => /^(hover|focus-within):(border|shadow)/.test(t))).toEqual([]);
  });

  it('keyboard: Tab reaches Details and Enter opens the detail page', async () => {
    const user = userEvent.setup();
    c.render();
    const details = screen.getByRole('button', { name: c.details, exact: true });
    for (let i = 0; i < 30 && document.activeElement !== details; i++) await user.tab();
    expect(document.activeElement).toBe(details);
    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith(c.detailPath);
  });
});

describe('P1415 — explicit links inside a card still navigate', () => {
  it("story card: the author's name opens their profile", () => {
    render(<MemoryRouter><FeedStoryCard story={story} linkedPoints={[]} surface="feed" /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Test Author' }));
    expect(navigate).toHaveBeenCalledWith('/p/test-author');
  });
});

describe('P1415 — P1336 linksInNewTab is preserved', () => {
  it('Details opens a NEW tab; a link in the statement never also navigates this tab', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <MemoryRouter>
        <LinksInNewTabContext.Provider value={true}>
          <FeedPointCard point={point} linkedStories={[]} surface="stake" />
        </LinksInNewTabContext.Provider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: /example\.com/ }));
    expect(navigate).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalledWith('/point/point-1', expect.anything(), expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Details for this point', exact: true }));
    expect(open).toHaveBeenCalledWith('/point/point-1', '_blank', 'noopener,noreferrer');
    expect(navigate).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
