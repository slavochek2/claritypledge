/**
 * @file p1179-stake-surface.test.tsx
 * @description P1179 AC-6 / AC-7 / AC-8 — the feed with things REMOVED, and the
 * oldest-first ordering requested from the database rather than reversed here.
 *
 * The ordering assertion reads the ARGUMENT passed to the service, not the order
 * of the rendered list. A render assertion passes just as happily on a
 * client-side `.reverse()`, which is the exact thing decisions.md 2026-03-13 and
 * P1055's instrument requirement forbid.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StakePage } from '@/app/pages/stake-page';
import type { PointWithUserPosition, StoryWithAuthor } from '@/app/types';

const getPoints = vi.hoisted(() => vi.fn());
const getStories = vi.hoisted(() => vi.fn());

vi.mock('@/app/data/points-service', () => ({ pointsService: { getPublicPointsFeed: getPoints } }));
vi.mock('@/app/data/stories-service', () => ({ storiesService: { getPublicStoriesFeed: getStories } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }));
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ point }: { point: PointWithUserPosition }) =>
    <div data-testid="point-card">{point.statement}</div>,
}));
vi.mock('@/app/components/feed/feed-story-card', () => ({
  FeedStoryCard: ({ story }: { story: StoryWithAuthor }) =>
    <div data-testid="story-card">{story.title}</div>,
}));
vi.mock('@/app/components/feed/feed-skeleton', () => ({ FeedSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

const point = (id: string, statement: string) => ({
  id, statement, context: '', tags: ['cmp7'], positionCounts: {}, totalPositions: 1,
} as unknown as PointWithUserPosition);
const story = (id: string, title: string) => ({ id, title } as unknown as StoryWithAuthor);

function renderStake(path = '/stake/cmp7') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/stake/:tag" element={<StakePage />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => { getPoints.mockReset(); getStories.mockReset(); });

describe('P1179 AC-6 — the locked surface has the feed chrome removed', () => {
  beforeEach(() => {
    getPoints.mockResolvedValue([point('p1', 'first'), point('p2', 'second')]);
    getStories.mockResolvedValue([]);
  });

  it('renders the points', async () => {
    renderStake();
    expect(await screen.findAllByTestId('point-card')).toHaveLength(2);
  });

  it('has NO search box, NO sort toggle, NO Share a Story button and no "Home" title', async () => {
    renderStake();
    await screen.findAllByTestId('point-card');
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
    expect(screen.queryByText(/share a story/i)).toBeNull();
    expect(screen.queryByText(/^home$/i)).toBeNull();
    expect(screen.queryByText(/oldest|newest|sort/i)).toBeNull();
    expect(screen.queryByText(/browse all content/i)).toBeNull();
  });

  it('requests oldest-first FROM THE DATABASE and never reverses client-side', async () => {
    renderStake();
    await screen.findAllByTestId('point-card');
    // signature: (limit, offset, tag, viewerUserId, ascending)
    expect(getPoints).toHaveBeenCalledWith(50, 0, 'cmp7', 'u1', true);
    expect(getStories).toHaveBeenCalledWith(50, 0, 'cmp7', true);
    // the rendered order is the service's order, untouched
    const cards = screen.getAllByTestId('point-card').map(c => c.textContent);
    expect(cards).toEqual(['first', 'second']);
  });

  it('filters by exactly one tag — the P1075 server-side path, never the multi-tag fallback', async () => {
    renderStake('/stake/cmp3');
    await screen.findAllByTestId('point-card');
    expect(getPoints.mock.calls[0][2]).toBe('cmp3');
  });
});

describe('P1179 AC-7 / AC-8 — a tab renders only if it has content', () => {
  it('AC-7: a Points-only tag shows NO tabs', async () => {
    getPoints.mockResolvedValue([point('p1', 'first')]);
    getStories.mockResolvedValue([]);
    renderStake();
    await screen.findAllByTestId('point-card');
    expect(screen.queryByTestId('stake-tabs')).toBeNull();
  });

  it('AC-8: a tag carrying BOTH shows both tabs', async () => {
    getPoints.mockResolvedValue([point('p1', 'first')]);
    getStories.mockResolvedValue([story('s1', 'a story')]);
    renderStake('/stake/tonight');
    await screen.findByTestId('stake-tabs');
    expect(screen.getByTestId('stake-tab-points')).toBeInTheDocument();
    expect(screen.getByTestId('stake-tab-stories')).toBeInTheDocument();
  });

  it('a Stories-only tag shows no tabs either — the rule is "only if it has content", both ways', async () => {
    getPoints.mockResolvedValue([]);
    getStories.mockResolvedValue([story('s1', 'a story')]);
    renderStake('/stake/tonight');
    await waitFor(() => expect(screen.queryByTestId('skeleton')).toBeNull());
    expect(screen.queryByTestId('stake-tabs')).toBeNull();
  });

  it('an empty tag renders the feed\'s existing empty state, not a crash', async () => {
    getPoints.mockResolvedValue([]);
    getStories.mockResolvedValue([]);
    renderStake('/stake/tonight');
    expect(await screen.findByTestId('stake-empty')).toBeInTheDocument();
  });
});

/**
 * BACK (2026-08-31, founder): "if I go to CMP7, I'm there, but it doesn't have
 * the back button to the previous page."
 *
 * Two arrivals, two correct behaviours. Coming FROM the room there is history to
 * pop; arriving on a typed URL or a shared link there is not, and `navigate(-1)`
 * there walks the attendee out of the app mid-event. `location.key === 'default'`
 * is react-router's marker for that first-entry case.
 */
describe('P1179 — the stake surface has a Back button', () => {
  beforeEach(() => {
    getPoints.mockResolvedValue([point('p1', 'first')]);
    getStories.mockResolvedValue([]);
  });

  it('renders one', async () => {
    renderStake();
    expect(await screen.findByRole('button', { name: /go back/i })).toBeInTheDocument();
  });

  it('pops history when there IS a previous entry', async () => {
    render(
      <MemoryRouter initialEntries={['/events/cm-1/room', '/stake/cmp7?event=cm-1']} initialIndex={1}>
        <Routes>
          <Route path="/events/:slug/room" element={<div data-testid="the-room" />} />
          <Route path="/stake/:tag" element={<StakePage />} />
        </Routes>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: /go back/i }));
    expect(await screen.findByTestId('the-room')).toBeInTheDocument();
  });

  it('goes to the feed instead when this is the FIRST history entry — never out of the app', async () => {
    render(
      <MemoryRouter initialEntries={['/stake/cmp7']}>
        <Routes>
          <Route path="/feed" element={<div data-testid="the-feed" />} />
          <Route path="/stake/:tag" element={<StakePage />} />
        </Routes>
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: /go back/i }));
    expect(await screen.findByTestId('the-feed')).toBeInTheDocument();
  });
});
