/**
 * @file p1296-feed-grouping.test.tsx
 * @description P1296 items 6–7 on /feed — stories on one video group; the search regroups
 * live; the tabs carry counts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FeedPage } from '@/app/pages/feed-page';
import type { PointWithUserPosition, StoryWithAuthor } from '@/app/types';

const getStories = vi.hoisted(() => vi.fn());
const getPoints = vi.hoisted(() => vi.fn());
vi.mock('@/app/data/stories-service', () => ({
  storiesService: {
    getPublicStoriesFeed: getStories,
    getPointsForStories: vi.fn(async () => new Map()),
    getStoriesForPoints: vi.fn(async () => new Map()),
  },
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getPublicPointsFeed: getPoints } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: null }) }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/feed/feed-story-card', () => ({
  FeedStoryCard: ({ story, groupPlayer }: { story: StoryWithAuthor; groupPlayer?: unknown }) => (
    <div data-testid="story-card" data-grouped={groupPlayer ? 'yes' : 'no'}>{story.content}</div>
  ),
}));
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ point }: { point: PointWithUserPosition }) => <div data-testid="point-card">{point.statement}</div>,
}));

const LEAHY = 'https://www.youtube.com/watch?v=abcDEF12345';
const LECUN = 'https://youtu.be/zyxWVU98765';
const story = (id: string, content: string, videoUrl?: string) =>
  ({ id, content, videoUrl, tags: [] } as unknown as StoryWithAuthor);

beforeEach(() => {
  getStories.mockReset().mockResolvedValue([
    story('l1', 'Leahy on control, which matters most', LEAHY),
    story('c1', 'LeCun on scale', LECUN),
    story('l2', 'Leahy on timelines, which matter too', `${LEAHY}&t=90s`),
    story('l3', 'Leahy on open weights', LEAHY),
  ]);
  getPoints.mockReset().mockResolvedValue([{ id: 'p1', statement: 'a point', tags: [], positionCounts: {}, totalPositions: 1 }]);
});

const renderFeed = () =>
  render(<MemoryRouter initialEntries={['/feed?tab=stories']}><FeedPage /></MemoryRouter>);

describe('P1296 item 7 — /feed Stories groups by source', () => {
  it("gathers one video's stories under one group, at the first one's position; the lone story stays plain", async () => {
    renderFeed();
    const group = await screen.findByTestId('source-group');
    expect(within(group).getByTestId('source-group-heading').textContent).toBe('3 stories from this video');
    // cap 2 — the third is behind "Show 1 more story"
    expect(within(group).getAllByTestId('story-card').map((c) => c.textContent)).toEqual([
      'Leahy on control, which matters most',
      'Leahy on timelines, which matter too',
    ]);
    const plain = screen.getAllByTestId('story-card').filter((c) => !group.contains(c));
    expect(plain.map((c) => c.textContent)).toEqual(['LeCun on scale']);
    expect(plain[0]!.getAttribute('data-grouped')).toBe('no');
    // The group comes first: it sits where its FIRST story sat.
    expect(group.compareDocumentPosition(plain[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the search regroups live: a group left with one story becomes a plain card', async () => {
    renderFeed();
    await screen.findByTestId('source-group');
    fireEvent.change(screen.getByPlaceholderText('Search stories and points...'), { target: { value: 'timelines' } });
    await waitFor(() => expect(screen.queryByTestId('source-group')).toBeNull());
    const cards = screen.getAllByTestId('story-card');
    expect(cards.map((c) => c.textContent)).toEqual(['Leahy on timelines, which matter too']);
    expect(cards[0]!.getAttribute('data-grouped')).toBe('no');
  });

  it('a search that leaves two of a source keeps them grouped — and keeps the SAME player mounted', async () => {
    renderFeed();
    const before = await screen.findByTestId('source-group');
    const playerBefore = before.querySelector('[data-testid="video-thumbnail-link"], [data-testid="story-video-player"]');
    expect(playerBefore, 'the group renders its one player').toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Search stories and points...'), { target: { value: 'matter' } });
    await waitFor(() =>
      expect(within(screen.getByTestId('source-group')).getByTestId('source-group-heading').textContent).toBe(
        '2 stories from this video',
      ),
    );
    const after = screen.getByTestId('source-group');
    expect(within(after).getAllByTestId('story-card').map((c) => c.textContent)).toEqual([
      'Leahy on control, which matters most',
      'Leahy on timelines, which matter too',
    ]);
    // Keyed by source, so the group survived the search rather than remounting — a reader
    // mid-video does not lose the player because they typed in the search box.
    expect(after).toBe(before);
    expect(after.querySelector('[data-testid="video-thumbnail-link"], [data-testid="story-video-player"]')).toBe(playerBefore);
  });
});

describe('P1296 item 6 / P500 — /feed tabs carry counts', () => {
  it('Stories (N) and Points (N), once loaded', async () => {
    renderFeed();
    await screen.findByTestId('source-group');
    expect(screen.getByRole('tab', { name: 'Stories (4)' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Points (1)' })).toBeTruthy();
  });
});
