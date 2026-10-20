/**
 * @file p1508-canvas-fifth-round.test.tsx
 * @description P1508 fifth round — the neutral spread and "Contested" (D4), the open point card
 * showing the canvas owner as their profile does (D5), and the shared "Filter by position" block
 * as the canvas uses it (D6).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FeedPointCard, type FeedPointCardOwner } from '@/app/components/feed/feed-point-card';
import { PointSpreadRow, PositionSpread } from '@/app/components/shared/position-spread';
import { PointPositionsBlock } from '@/app/components/social/point-positions-block';
import { isContested, levelCounts, totalPositions } from '@/lib/position-spread';
import { pointOwnerLayout } from '@/lib/point-owner-layout';
import type { PointPositionWithUser, PointWithUserPosition, PositionType, StoryWithAuthor } from '@/app/types';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
const auth = vi.hoisted(() => ({ viewerId: 'viewer-1' as string | null }));
vi.mock('@/auth', () => ({
  useAuth: () => (auth.viewerId
    ? { session: { user: { id: auth.viewerId } }, user: { id: auth.viewerId } }
    : { session: null, user: null }),
}));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: async () => undefined }),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { setPosition: vi.fn(async () => undefined) } }));

const pos = (userId: string, position: PositionType, name = userId) => ({
  id: `pos-${userId}`, pointId: 'p1', userId, position, createdAt: '', updatedAt: '',
  userName: name, userSlug: userId, earCount: 0, userHasPledged: false,
}) as unknown as PointPositionWithUser;

describe('D4: the spread and "Contested"', () => {
  it('counts seven levels', () => {
    const c = levelCounts([pos('a', 'agree'), pos('b', 'agree'), pos('c', 'strongly_disagree')]);
    expect(c.agree).toBe(2);
    expect(c.strongly_disagree).toBe(1);
    expect(totalPositions(c)).toBe(3);
  });

  it('contested means at least two on each side, at any strength; unsure counts for neither', () => {
    expect(isContested(levelCounts([pos('a', 'agree'), pos('b', 'somewhat_agree'), pos('c', 'disagree'), pos('d', 'strongly_disagree')]))).toBe(true);
    expect(isContested(levelCounts([pos('a', 'agree'), pos('b', 'agree'), pos('c', 'disagree'), pos('d', 'unsure')]))).toBe(false);
    expect(isContested(levelCounts([pos('a', 'agree'), pos('c', 'disagree')]))).toBe(false);
  });

  it('seven bars in one grey, strongly disagree first; counts in the title and label', () => {
    render(<PositionSpread counts={levelCounts([pos('a', 'strongly_disagree'), pos('b', 'agree'), pos('c', 'agree')])} />);
    const spread = screen.getByTestId('position-spread');
    const bars = spread.querySelectorAll('[data-count]');
    expect(bars).toHaveLength(7);
    expect(bars[0]?.getAttribute('data-count')).toBe('1');
    expect(bars[5]?.getAttribute('data-count')).toBe('2');
    for (const bar of bars) expect(bar.className).toContain('bg-foreground/40');
    expect(spread.innerHTML).not.toMatch(/bg-(blue|slate|green|red)/);
    expect(spread.getAttribute('title')).toBe('1 strongly disagree, 2 agree');
    expect(spread.getAttribute('aria-label')).toBe('1 strongly disagree, 2 agree');
    expect(screen.getByTestId('position-spread-centre')).toBeInTheDocument();
  });
});

describe('D5: the open point card shows the canvas owner as their profile does', () => {
  const point = {
    id: 'p1', statement: 'A canvas point', tags: ['claritypledge'], systemTags: ['canvas:uvp'], visibility: 'public',
    positionCounts: { agree: 1 }, totalPositions: 1, userPosition: null,
  } as unknown as PointWithUserPosition;
  const story = (id: string, authorId: string) => ({
    id, authorId, authorName: authorId, authorSlug: authorId, content: `story by ${authorId}`, visibility: 'public',
    createdAt: '2026-10-01T00:00:00Z', understoodCount: 0,
  }) as unknown as StoryWithAuthor;
  const owner = (over: Partial<FeedPointCardOwner> = {}): FeedPointCardOwner => ({
    id: 'owner-1', name: 'Owner One', hasPledged: true, ear: 7, position: 'agree', isAgent: false, ...over,
  });
  const renderCard = (o: FeedPointCardOwner, stories: StoryWithAuthor[]) => render(
    <MemoryRouter><FeedPointCard point={point} surface="canvas" linkedStories={stories} owner={o} /></MemoryRouter>,
  );

  it('the layout rule: someone else sees the row (even with no position, on the canvas); the owner the own header', () => {
    expect(pointOwnerLayout({ isOwnView: false, position: 'agree' })).toBe('quote');
    expect(pointOwnerLayout({ isOwnView: false, position: null })).toBe('own'); // the profile, unchanged
    expect(pointOwnerLayout({ isOwnView: false, position: null, rowWithoutPosition: true })).toBe('quote');
    expect(pointOwnerLayout({ isOwnView: true, position: 'agree', rowWithoutPosition: true })).toBe('own');
  });

  it('a visitor: owner row with name, ear count and badge above a quoted box; only the owner\'s story, "Their story"', () => {
    auth.viewerId = 'viewer-1';
    const { container } = renderCard(owner(), [story('s-owner', 'owner-1'), story('s-other', 'other-1')]);
    const row = screen.getByTestId('point-owner-row');
    expect(row).toHaveTextContent('Owner One');
    expect(row).toHaveTextContent('7');
    expect(row).toHaveTextContent(/Agrees/);
    expect(container.querySelector('.bg-gray-50')).not.toBeNull(); // the quoted box
    expect(screen.getByTestId('feed-point-story-expander')).toHaveTextContent('Their story');
    fireEvent.click(screen.getByTestId('feed-point-story-expander'));
    expect(screen.getByText('story by owner-1')).toBeInTheDocument();
    expect(screen.queryByText('story by other-1')).toBeNull();
  });

  it('the owner holds no position: the row still shows, with a muted "No position"', () => {
    auth.viewerId = 'viewer-1';
    renderCard(owner({ position: null }), []);
    expect(screen.getByTestId('point-owner-no-position')).toHaveTextContent('No position');
    expect(screen.queryByTestId('feed-point-story-expander')).toBeNull(); // no owner story, no label
    expect(screen.queryByText('0 stories')).toBeNull();
  });

  it('an agent owner: no ear count, even with one read (control: a person shows it)', () => {
    auth.viewerId = 'viewer-1';
    const { unmount } = renderCard(owner({ ear: 7 }), []);
    expect(within(screen.getByTestId('point-owner-row')).queryByText('7')).not.toBeNull();
    unmount();
    renderCard(owner({ isAgent: true, ear: 7, name: 'Agent · Helper' }), []);
    expect(within(screen.getByTestId('point-owner-row')).queryByText('7')).toBeNull();
  });

  it('the owner with no position on their own point: their name and "No position", not an empty strip', () => {
    auth.viewerId = 'owner-1';
    renderCard(owner({ position: null }), []);
    const row = screen.getByTestId('point-owner-row');
    expect(row).toHaveTextContent('Owner One');
    expect(within(row).getByTestId('point-owner-no-position')).toHaveTextContent('No position');
  });

  it('the owner: the own-card header, "Your story" once — never a second "Your story" link', () => {
    auth.viewerId = 'owner-1';
    const { container } = renderCard(owner(), [story('s-owner', 'owner-1')]);
    expect(container.querySelector('.bg-gray-50')).toBeNull(); // not quoted
    expect(screen.getByTestId('point-owner-row')).toBeInTheDocument();
    expect(screen.getAllByText('Your story')).toHaveLength(1);
  });

  it('a visitor with their own story here: "Their story" plus their own "Your story" link', () => {
    auth.viewerId = 'other-1';
    renderCard(owner(), [story('s-owner', 'owner-1'), story('s-other', 'other-1')]);
    expect(screen.getByTestId('feed-point-story-expander')).toHaveTextContent('Their story');
    expect(screen.getAllByText('Your story')).toHaveLength(1);
  });
});

describe('D6: the shared "Filter by position" block on the canvas', () => {
  const positions = [pos('owner-1', 'agree', 'Owner One'), pos('a', 'agree', 'Ann'), pos('b', 'disagree', 'Bo'), pos('c', 'disagree', 'Cy')];
  const stories = [
    { id: 's1', authorId: 'owner-1', authorName: 'Owner One', authorSlug: 'owner-1', content: 'owner story', visibility: 'public', createdAt: '', understoodCount: 0 },
    { id: 's2', authorId: 'b', authorName: 'Bo', authorSlug: 'b', content: 'Bo story', visibility: 'public', createdAt: '', understoodCount: 0 },
  ] as unknown as StoryWithAuthor[];

  function Harness({ onFilter = vi.fn() }: { onFilter?: (f: string) => void }) {
    return (
      <MemoryRouter>
        <PointPositionsBlock
          positions={positions}
          counts={levelCounts(positions)}
          stories={stories}
          viewerId="viewer-1"
          filter="all"
          onFilterChange={onFilter}
          expandedId="b"
          onExpandedChange={vi.fn()}
        />
      </MemoryRouter>
    );
  }

  it('the block holds no spread (it lives on the card); tabs count from the positions passed', () => {
    render(<Harness />);
    expect(screen.queryByTestId('position-spread')).toBeNull();
    expect(screen.queryByRole('button', { name: 'How to read the spread' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Agree \(2\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Disagree \(2\)/ })).toBeInTheDocument();
  });

  it('R13: the owner\'s row keeps its story toggle too (the card above shows the same story); others keep theirs', () => {
    render(<Harness />);
    const ownerRow = screen.getByRole('button', { name: "Owner One's profile" });
    expect(within(ownerRow).getByTestId('story-toggle')).toBeInTheDocument();
    const boRow = screen.getByRole('button', { name: "Bo's profile" });
    expect(within(boRow).getByTestId('story-toggle')).toBeInTheDocument();
    expect(screen.queryByText('Perspectives without position')).toBeNull();
  });

  it('R13: an owner story without an owner position is not listed again under "without position"', () => {
    render(
      <MemoryRouter>
        <PointPositionsBlock
          positions={positions.filter(p => p.userId !== 'owner-1')} counts={levelCounts([])} stories={stories}
          viewerId="viewer-1" filter="all" onFilterChange={vi.fn()} expandedId={null} onExpandedChange={vi.fn()}
          storyShownAbove="owner-1"
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Perspectives without position')).toBeNull();
  });

  it('the card\'s spread row: spread, "Contested" as a label, the info button', () => {
    render(<PointSpreadRow counts={levelCounts(positions)} withInfo />);
    const row = screen.getByTestId('point-spread-row');
    expect(within(row).getByTestId('position-spread')).toBeInTheDocument();
    const contested = within(row).getByTestId('contested');
    expect(contested).toHaveTextContent('Contested');
    expect(contested.className).toContain('font-semibold');
    expect(contested.className).toContain('text-foreground');
    expect(contested.className).not.toMatch(/text-foreground\/\d/);
    expect(within(row).getByRole('button', { name: 'How to read the spread' })).toBeInTheDocument();
  });

  it('no positions: "No positions yet", no bars, no "Contested"', () => {
    render(<PointSpreadRow counts={levelCounts([])} />);
    expect(screen.getByTestId('spread-no-positions')).toHaveTextContent('No positions yet');
    expect(screen.queryByTestId('position-spread')).toBeNull();
    expect(screen.queryByTestId('contested')).toBeNull();
  });

  it('Escape with focus on the toggle (just opened) closes the story and is marked handled', () => {
    const onExpandedChange = vi.fn();
    render(
      <MemoryRouter>
        <PointPositionsBlock
          positions={positions} counts={levelCounts(positions)} stories={stories} viewerId="viewer-1"
          filter="all" onFilterChange={vi.fn()} expandedId="b" onExpandedChange={onExpandedChange}
          collapseOnEscape
        />
      </MemoryRouter>,
    );
    const toggle = within(screen.getByRole('button', { name: "Bo's profile" })).getByTestId('story-toggle');
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    toggle.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onExpandedChange).toHaveBeenCalledWith(null);
  });

  it('Escape in an expanded story is marked handled, so the panel around it stays open', () => {
    render(<Harness />);
    const region = screen.getByRole('region', { name: "Bo's story" });
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    region.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
