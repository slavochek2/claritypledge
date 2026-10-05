/**
 * @file p1424-nested-details-only.test.tsx
 * @description P1424 — the items NESTED inside a list card follow P1415's rule: a quoted point
 * under a story card and a linked story under a point card no longer open on a body tap. Each
 * carries its own small `Details →`, the only way in. The nested box stops being a control (no
 * role="button", no tab stop, no pointer cursor); the controls inside it keep working.
 *
 * Outside list cards (point page embed, detail views) the components keep tap-to-open — guarded
 * at the bottom of this file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { QuotedPointCard } from '@/app/components/shared/quoted-point-card';
import { QuotedStory } from '@/app/components/social/point-card-with-links';
import { LinksInNewTabContext } from '@/app/components/shared/links-in-new-tab';
import type { PointSummary, PointWithUserPosition, StoryWithAuthor } from '@/app/types';

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

const quotedPoint: PointSummary = {
  id: 'qp-1', statement: 'A quoted point statement.', tags: [], systemTags: [],
  positionCounts: { agree: 1 }, userPosition: null, visibility: 'public',
};

const point = {
  id: 'point-1', statement: 'A point statement.', tags: [], systemTags: [], visibility: 'public',
  positionCounts: { strongly_agree: 0, agree: 1, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 },
  totalPositions: 1, userPosition: null,
} as unknown as PointWithUserPosition;

const linkedStory = {
  ...story, id: 'ls-1', authorId: 'author-2', authorName: 'Linked Author', authorSlug: 'linked-author',
  content: 'A linked story body.',
} as unknown as StoryWithAuthor;

function nestedBox(container: HTMLElement, kind: 'quoted-point-card' | 'quoted-story') {
  const wrapper = container.querySelector(`[data-testid="${kind}"]`) as HTMLElement;
  expect(wrapper).not.toBeNull();
  // The bordered box is the wrapper's last element child (the byline row sits above it).
  return wrapper.lastElementChild as HTMLElement;
}

beforeEach(() => navigate.mockClear());

describe('P1424 — quoted points under a story card', () => {
  const renderStoryCard = () => {
    const r = render(
      <MemoryRouter>
        <FeedStoryCard story={story} linkedPoints={[quotedPoint]} currentUserId="viewer-1" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('feed-story-point-expander'));
    return r;
  };

  it('tapping the quoted point body navigates nowhere', () => {
    const { container } = renderStoryCard();
    fireEvent.click(screen.getByText('A quoted point statement.'));
    fireEvent.click(nestedBox(container, 'quoted-point-card'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('the nested box is not a control (no role=button, no tab stop, no pointer cursor)', () => {
    const { container } = renderStoryCard();
    const box = nestedBox(container, 'quoted-point-card');
    expect(box.getAttribute('role')).toBeNull();
    expect(box.hasAttribute('tabindex')).toBe(false);
    expect(box.className).not.toMatch(/cursor-pointer/);
    expect(box.className).not.toMatch(/hover:/);
  });

  it('its own Details → opens the point', () => {
    const { container } = renderStoryCard();
    const box = nestedBox(container, 'quoted-point-card');
    fireEvent.click(within(box).getByRole('button', { name: 'Details for this point' }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/point/qp-1'));
  });

  it('position buttons inside still work and never navigate', () => {
    const { container } = renderStoryCard();
    const box = nestedBox(container, 'quoted-point-card');
    const posButtons = within(box).getAllByRole('button').filter(b => !/Details/.test(b.getAttribute('aria-label') ?? ''));
    expect(posButtons.length).toBeGreaterThan(0);
    fireEvent.click(posButtons[0]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keyboard: Tab reaches the nested Details →, Enter opens it', async () => {
    const user = userEvent.setup();
    const { container } = renderStoryCard();
    const details = within(nestedBox(container, 'quoted-point-card')).getByRole('button', { name: 'Details for this point' });
    details.focus();
    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/point/qp-1'));
  });
});

describe('P1424 — linked stories under a point card', () => {
  const renderPointCard = (newTab = false) => {
    const r = render(
      <LinksInNewTabContext.Provider value={newTab}>
        <MemoryRouter>
          <FeedPointCard point={point} linkedStories={[linkedStory]} surface="feed" />
        </MemoryRouter>
      </LinksInNewTabContext.Provider>,
    );
    fireEvent.click(screen.getByTestId('feed-point-story-expander'));
    return r;
  };

  it('tapping the linked story body navigates nowhere', () => {
    const { container } = renderPointCard();
    fireEvent.click(screen.getByText('A linked story body.'));
    fireEvent.click(nestedBox(container, 'quoted-story'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('the nested box is not a control', () => {
    const { container } = renderPointCard();
    const box = nestedBox(container, 'quoted-story');
    expect(box.getAttribute('role')).toBeNull();
    expect(box.hasAttribute('tabindex')).toBe(false);
    expect(box.className).not.toMatch(/cursor-pointer/);
  });

  it('its own Details → opens the story; the author name still opens the profile', () => {
    const { container } = renderPointCard();
    const box = nestedBox(container, 'quoted-story');
    fireEvent.click(within(box).getByRole('button', { name: 'Details for this story' }));
    expect(navigate).toHaveBeenCalledWith('/story/ls-1');
    navigate.mockClear();
    fireEvent.click(screen.getByText('Linked Author'));
    expect(navigate).toHaveBeenCalledWith('/p/linked-author');
  });

  it('in the onboarding / prepare embed (linksInNewTab) Details → opens a new tab', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = renderPointCard(true);
    fireEvent.click(within(nestedBox(container, 'quoted-story')).getByRole('button', { name: 'Details for this story' }));
    expect(open).toHaveBeenCalledWith('/story/ls-1', '_blank', 'noopener,noreferrer');
    expect(navigate).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe('P1424 non-goal guard — outside list cards the nested items keep tap-to-open', () => {
  it('QuotedPointCard without the opt-in still navigates on a body tap', () => {
    const { container } = render(
      <MemoryRouter>
        <QuotedPointCard point={quotedPoint} authorId="a" authorName="A" authorHasPledged={false} />
      </MemoryRouter>,
    );
    const box = nestedBox(container, 'quoted-point-card');
    expect(box.getAttribute('role')).toBe('button');
    fireEvent.click(box);
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/point/qp-1'));
    expect(within(box).queryByRole('button', { name: 'Details for this point' })).toBeNull();
  });

  it('QuotedStory without the opt-in still opens on a body tap (point page embed)', () => {
    const onClick = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <QuotedStory
          story={{ id: 's', authorId: 'a', text: 'Embed story.', createdAt: '2026-09-01T00:00:00Z', visibility: 'public', linkedPointIds: [] } as never}
          onClick={onClick}
        />
      </MemoryRouter>,
    );
    const box = nestedBox(container, 'quoted-story');
    expect(box.getAttribute('role')).toBe('button');
    fireEvent.click(box);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
