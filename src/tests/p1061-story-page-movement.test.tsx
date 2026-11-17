/**
 * P1061 on the story page and in an opened "1 story" pill: the figures rows and the quoted point's arrows. The
 * arrows chip sits inside a point box that is itself a link to the point: a click or a key on the chip (or inside
 * its explanation) must not open the point.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PointSummary, StoryWithAuthor } from '@/app/types';
import type { StoryMovement } from '@/lib/position-movement';
import { QuotedPointTags, StoryDetailFigures, StoryMovementPoints } from '@/app/components/social/story-detail-movement';
import { HolderStoryFigures } from '@/app/components/social/holder-story-badges';
import { PointStoryArrowsContext } from '@/app/components/movement/point-story-arrows-context';

const movement: StoryMovement = {
  storyId: 'story-id-0001', verifiedCount: 2, moved: 1,
  points: [{ pointId: 'point-id-0001', arrows: { left: 1, same: 1, right: 0 }, verified: { switched: 1, other: 0, same: 1 }, notVerified: { switched: 0, other: 0, same: 0 } }],
};
const story = { id: 'story-id-0001', authorId: 'user-id-0001', authorName: 'Test Author', understoodCount: 2, movement } as unknown as StoryWithAuthor;
const plain = { ...story, movement: undefined } as unknown as StoryWithAuthor;
const point = { id: 'point-id-0001', statement: 'Test statement', tags: [] } as unknown as PointSummary;

describe('P1061 the story page figures row', () => {
  it('shows the panel chip after the card\'s own badge for a human story with movers', () => {
    render(<MemoryRouter><StoryDetailFigures story={story} isAgent={false} identityPending={false} points={[point]} className="row"><span>badge</span></StoryDetailFigures></MemoryRouter>);
    expect(screen.getByText('badge')).toBeTruthy();
    expect(screen.getByTestId('count-chip').getAttribute('aria-label')).toBe('1 of 2 verified people moved. Show by point');
  });

  it('no chip for an agent story or while the registry loads, nor for a story read without a count', () => {
    const { rerender } = render(<MemoryRouter><StoryDetailFigures story={story} isAgent identityPending={false} points={[point]} className="row"><span /></StoryDetailFigures></MemoryRouter>);
    expect(screen.queryByTestId('count-chip')).toBeNull();
    rerender(<MemoryRouter><StoryDetailFigures story={story} isAgent={false} identityPending points={[point]} className="row"><span /></StoryDetailFigures></MemoryRouter>);
    expect(screen.queryByTestId('count-chip')).toBeNull();
    rerender(<MemoryRouter><StoryDetailFigures story={plain} isAgent={false} identityPending={false} points={[point]} className="row"><span /></StoryDetailFigures></MemoryRouter>);
    expect(screen.queryByTestId('count-chip')).toBeNull();
  });
});

describe('P1061 a quoted point\'s arrows', () => {
  const quoted = (s: StoryWithAuthor, onOpen: () => void) => render(
    <StoryMovementPoints story={s} className="points">
      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={onOpen}><QuotedPointTags point={point} /></div>
    </StoryMovementPoints>,
  );

  it('shows the arrows when someone the author verified moved, and a click or key on them does not open the point', () => {
    const onOpen = vi.fn();
    quoted(story, onOpen);
    const chip = screen.getByTestId('moved-chip');
    expect(chip.getAttribute('aria-label')).toBe('1 moved toward disagree, 0 moved toward agree. What this counts');
    fireEvent.click(chip);
    fireEvent.keyDown(chip, { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('no arrows outside a story that carries a count (profile, doc page, landing)', () => {
    quoted(plain, () => {});
    expect(screen.queryByTestId('moved-chip')).toBeNull();
  });
});

describe('P1061 an opened "1 story" pill', () => {
  const pill = (arrowsFor: ((id: string) => { arrows: StoryMovement['points'][number]['arrows']; authorName: string } | null) | null, isAgent = false) => render(
    <PointStoryArrowsContext.Provider value={arrowsFor}>
      <HolderStoryFigures storyId="story-id-0001" isAgent={isAgent} identityPending={false} className="row"><span>badge</span></HolderStoryFigures>
    </PointStoryArrowsContext.Provider>,
  );

  it('shows the story\'s arrows on this point beside its badge, on the point page only', () => {
    pill(() => ({ arrows: { left: 0, same: 2, right: 3 }, authorName: 'Test Author' }));
    expect(screen.getByTestId('moved-chip').getAttribute('aria-label')).toBe('0 moved toward disagree, 3 moved toward agree. What this counts');
  });

  it('nothing outside the point page, or for an agent\'s story', () => {
    pill(null);
    expect(screen.queryByTestId('moved-chip')).toBeNull();
    pill(() => ({ arrows: { left: 1, same: 0, right: 0 }, authorName: 'Test Author' }), true);
    expect(screen.queryByTestId('moved-chip')).toBeNull();
  });
});
