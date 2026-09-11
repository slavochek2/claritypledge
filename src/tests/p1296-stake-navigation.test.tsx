/**
 * @file p1296-stake-navigation.test.tsx
 * @description P1296 items 2–5 — /stake is linkable to a tab, leavable from the bottom, and
 * carries the footer on both tabs.
 *
 * The Clarity Night event of 2026-09-18 links to `/stake/aisafety1?tab=stories`. Every test
 * here is a way that exact link, opened by a real attendee, could have gone wrong.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { StakePage } from '@/app/pages/stake-page';
import type { PointWithUserPosition, StoryWithAuthor } from '@/app/types';

const getPoints = vi.hoisted(() => vi.fn());
const getStories = vi.hoisted(() => vi.fn());
const getPointsForStories = vi.hoisted(() => vi.fn());
const getStoriesForPoints = vi.hoisted(() => vi.fn());

vi.mock('@/app/data/points-service', () => ({ pointsService: { getPublicPointsFeed: getPoints } }));
vi.mock('@/app/data/stories-service', () => ({
  storiesService: { getPublicStoriesFeed: getStories, getPointsForStories, getStoriesForPoints },
}));
// Mutable so a test can change who is signed in without remounting the page.
const viewer = vi.hoisted(() => ({ id: 'u1' as string | undefined }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: viewer.id ? { user: { id: viewer.id } } : null }) }));
vi.mock('@/app/components/feed/feed-skeleton', () => ({ FeedSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
// The cards are stubbed to EXPOSE the props the page hands them — the footer's data, the
// viewer, the surface — because that hand-off is exactly what /stake used to get wrong.
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ point, linkedStories, surface }: { point: PointWithUserPosition; linkedStories?: unknown[]; surface?: string }) => (
    <div
      data-testid="point-card"
      data-linked={linkedStories === undefined ? 'not-loaded' : String(linkedStories.length)}
      data-surface={surface}
    >
      {point.statement}
    </div>
  ),
}));
vi.mock('@/app/components/feed/feed-story-card', () => ({
  FeedStoryCard: ({ story, linkedPoints, currentUserId, surface }: { story: StoryWithAuthor; linkedPoints?: unknown[]; currentUserId?: string; surface?: string }) => (
    <div
      data-testid="story-card"
      data-linked={linkedPoints === undefined ? 'not-loaded' : String(linkedPoints.length)}
      data-viewer={currentUserId ?? 'none'}
      data-surface={surface}
    >
      {story.content}
    </div>
  ),
}));

const point = (id: string) => ({ id, statement: `point ${id}`, tags: ['t'], positionCounts: {}, totalPositions: 1 } as unknown as PointWithUserPosition);
const story = (id: string) => ({ id, content: `story ${id}`, tags: ['t'] } as unknown as StoryWithAuthor);

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function renderAt(entries: string[], index = entries.length - 1) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Routes>
        <Route path="/feed" element={<div data-testid="the-feed" />} />
        <Route path="/prev" element={<div data-testid="the-prev" />} />
        <Route path="/stake/:tag" element={<><StakePage /><Where /></>} />
      </Routes>
    </MemoryRouter>
  );
}

const where = () => screen.getByTestId('where').textContent ?? '';
const HEADER_BACK = { name: 'Go back' };
const BOTTOM_BACK = { name: 'Go back from the end of the list' };

beforeEach(() => {
  viewer.id = 'u1';
  getPoints.mockReset().mockResolvedValue([point('p1'), point('p2')]);
  getStories.mockReset().mockResolvedValue([story('s1')]);
  getPointsForStories.mockReset().mockResolvedValue(new Map([['s1', [{ id: 'p1' }]]]));
  getStoriesForPoints.mockReset().mockResolvedValue(new Map([['p1', [{ id: 's1' }]]]));
});

// UAT, founder: *"in stake on the story tab i'm not sure the grouping works"*. The test DB's
// aisafety1 has four stories on four different videos, so nothing there can group; production's
// has several per video. Until this test, /stake's grouping was evidenced only by the deleted
// /tree demo — this pins it on the page itself.
describe('P1296 item 7 — /stake Stories groups stories by source', () => {
  it('two stories on one video are ONE group under one heading; a story on another video stays a plain card', async () => {
    const VID = 'abcDEF12345';
    getStories.mockResolvedValue([
      { ...story('s1'), videoUrl: `https://youtu.be/${VID}` },
      { ...story('s2'), videoUrl: 'https://youtu.be/zyxWVU98765' },
      { ...story('s3'), videoUrl: `https://www.youtube.com/watch?v=${VID}` },
    ]);
    renderAt(['/stake/aisafety1?tab=stories']);
    const group = await screen.findByTestId('source-group');
    expect(screen.getAllByTestId('source-group')).toHaveLength(1);
    expect(within(group).getByTestId('source-group-heading').textContent).toBe('2 stories from this video');
    expect(within(group).getAllByTestId('story-card').map((c) => c.textContent)).toEqual(['story s1', 'story s3']);
    // The other video's story is outside the tray, and nothing is dropped.
    expect(screen.getAllByTestId('story-card')).toHaveLength(3);
  });
});

describe('P1296 item 4 — ?tab= selects the tab, and the page never rewrites it', () => {
  it("the event's exact link opens on Stories, and ?tab=stories is still in the URL after the data loads", async () => {
    renderAt(['/stake/aisafety1?tab=stories']);
    await screen.findAllByTestId('story-card');
    expect(screen.getByTestId('stake-tab-stories').getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByTestId('point-card')).toBeNull();
    expect(where()).toBe('/stake/aisafety1?tab=stories');
  });

  it('a Points-only tag opens on Points even when the link asks for Stories — there is no tab bar to switch back', async () => {
    getStories.mockResolvedValue([]);
    renderAt(['/stake/cmp7?tab=stories']);
    expect(await screen.findAllByTestId('point-card')).toHaveLength(2);
    expect(screen.queryByTestId('stake-tabs')).toBeNull();
    // Derived, not written: the param is left alone for the next visit.
    expect(where()).toBe('/stake/cmp7?tab=stories');
  });

  it('a Stories-only tag shows its stories rather than an empty Points list with no way out', async () => {
    getPoints.mockResolvedValue([]);
    renderAt(['/stake/tonight']);
    expect(await screen.findAllByTestId('story-card')).toHaveLength(1);
    expect(screen.queryByTestId('stake-tabs')).toBeNull();
  });

  it('the tabs show their counts', async () => {
    renderAt(['/stake/aisafety1']);
    await screen.findAllByTestId('point-card');
    expect(screen.getByTestId('stake-tab-points').textContent).toBe('Points (2)');
    expect(screen.getByTestId('stake-tab-stories').textContent).toBe('Stories (1)');
  });
});

describe('P1296 item 4 — a tab switch keeps ?event= and adds no history', () => {
  it('?event= survives switching to Stories and back to Points', async () => {
    renderAt(['/stake/aisafety1?event=cm-1']);
    await screen.findAllByTestId('point-card');

    await userEvent.click(screen.getByTestId('stake-tab-stories'));
    await screen.findAllByTestId('story-card');
    const onStories = new URLSearchParams(where().split('?')[1]);
    expect(onStories.get('event')).toBe('cm-1');
    expect(onStories.get('tab')).toBe('stories');

    await userEvent.click(screen.getByTestId('stake-tab-points'));
    await screen.findAllByTestId('point-card');
    const onPoints = new URLSearchParams(where().split('?')[1]);
    expect(onPoints.get('event')).toBe('cm-1');
    expect(onPoints.get('tab')).toBeNull();
  });

  it.each([['the header button', HEADER_BACK], ['the bottom CTA', BOTTOM_BACK]])(
    'after three tab switches, %s leaves the page in ONE step — the switches added no history',
    async (_which, name) => {
      renderAt(['/prev', '/stake/aisafety1']);
      await screen.findAllByTestId('point-card');
      await userEvent.click(screen.getByTestId('stake-tab-stories'));
      await userEvent.click(screen.getByTestId('stake-tab-points'));
      await userEvent.click(screen.getByTestId('stake-tab-stories'));
      await userEvent.click(screen.getByRole('button', name));
      expect(await screen.findByTestId('the-prev')).toBeInTheDocument();
    },
  );
});

describe('P1296 item 5 — a cold arrival still has a way out after switching tabs', () => {
  /**
   * The HIGH finding of the spec's third review. The old cold test was `location.key ===
   * 'default'`, and a `replace` navigation mints a new key — so the attendee who opened the
   * event link cold, switched a tab and pressed "Go back" was sent `navigate(-1)`, which on a
   * first history entry leaves the app. Here the in-memory router makes that failure visible
   * as "nothing happened": with the old test this assertion times out.
   */
  it.each([['the header button', HEADER_BACK], ['the bottom CTA', BOTTOM_BACK]])(
    'cold on the event link → Points → Stories → %s → the feed',
    async (_which, name) => {
      renderAt(['/stake/aisafety1?tab=stories']);
      await screen.findAllByTestId('story-card');
      await userEvent.click(screen.getByTestId('stake-tab-points'));
      await userEvent.click(screen.getByTestId('stake-tab-stories'));
      await userEvent.click(screen.getByRole('button', name));
      expect(await screen.findByTestId('the-feed')).toBeInTheDocument();
    },
  );
});

describe('P1296 items 2–3 — the footer on BOTH tabs, and the viewer handed down', () => {
  it('point cards receive their linked stories — the footer count renders on Points', async () => {
    renderAt(['/stake/aisafety1']);
    await waitFor(() => expect(screen.getAllByTestId('point-card')[0]!.getAttribute('data-linked')).toBe('1'));
    // "loaded, none linked" is a real state and must read as 0, not as not-loaded.
    expect(screen.getAllByTestId('point-card')[1]!.getAttribute('data-linked')).toBe('0');
    expect(screen.getAllByTestId('point-card')[0]!.getAttribute('data-surface')).toBe('stake');
  });

  it('story cards receive their linked points AND the viewer — an interactive card, not a read-only slab', async () => {
    renderAt(['/stake/aisafety1?tab=stories']);
    await waitFor(() => expect(screen.getByTestId('story-card').getAttribute('data-linked')).toBe('1'));
    expect(screen.getByTestId('story-card').getAttribute('data-viewer')).toBe('u1');
    expect(screen.getByTestId('story-card').getAttribute('data-surface')).toBe('stake');
    expect(getPointsForStories).toHaveBeenCalledWith(['s1'], 'u1');
  });

  it('fetching the footer data fetches the LIST once and never brings the skeleton back', async () => {
    renderAt(['/stake/aisafety1']);
    await waitFor(() => expect(getStoriesForPoints).toHaveBeenCalled());
    await userEvent.click(screen.getByTestId('stake-tab-stories'));
    await waitFor(() => expect(getPointsForStories).toHaveBeenCalled());
    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(getPoints).toHaveBeenCalledTimes(1);
    expect(getStories).toHaveBeenCalledTimes(1);
  });

  /**
   * Review of the fix delta (MEDIUM). The linked stories are read through RLS, which shows an
   * author their OWN private story — so the answer depends on who is signed in. Keying the
   * points side on the ids alone kept the anonymous map after a sign-in in another tab.
   */
  it('a change of viewer refetches the point cards\' linked stories — the answer is per viewer', async () => {
    const { rerender } = renderAt(['/stake/aisafety1']);
    await waitFor(() => expect(getStoriesForPoints).toHaveBeenCalledTimes(1));
    viewer.id = 'u2';
    rerender(
      <MemoryRouter initialEntries={['/stake/aisafety1']}>
        <Routes>
          <Route path="/stake/:tag" element={<><StakePage /><Where /></>} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(getStoriesForPoints).toHaveBeenCalledTimes(2));
  });

  it('switching tabs back and forth fetches each tab\'s links ONCE — same viewer, same ids, same answer', async () => {
    renderAt(['/stake/aisafety1']);
    await waitFor(() => expect(getStoriesForPoints).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByTestId('stake-tab-stories'));
    await waitFor(() => expect(getPointsForStories).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByTestId('stake-tab-points'));
    await userEvent.click(screen.getByTestId('stake-tab-stories'));
    await userEvent.click(screen.getByTestId('stake-tab-points'));
    await waitFor(() => expect(screen.getAllByTestId('point-card')[0]!.getAttribute('data-linked')).toBe('1'));
    expect(getStoriesForPoints).toHaveBeenCalledTimes(1);
    expect(getPointsForStories).toHaveBeenCalledTimes(1);
  });
});
