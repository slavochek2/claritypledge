import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StoryCardDetail } from '@/app/components/social/StoryCardDetail';
import type { StoryWithAuthor, PointSummary, PointPosition, PositionType } from '@/app/types';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const AUTHOR_ID = 'u-author';
const AUTHOR_NAME = 'Test Author';

const BASE_STORY: StoryWithAuthor = {
  id: 'story-1',
  authorId: AUTHOR_ID,
  authorName: AUTHOR_NAME,
  authorSlug: 'test-author',
  content: 'A story about something.',
  visibility: 'public',
  currentVersion: 1,
  understoodCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  tags: [],
  systemTags: [],
};

const BASE_POINT: PointSummary = {
  id: 'point-1',
  statement: 'A test claim.',
  tags: [],
  systemTags: [],
  visibility: 'public',
};

const POSITION_COUNTS = new Map<string, Record<PositionType, number>>([
  ['point-1', { strongly_disagree: 0, disagree: 0, somewhat_disagree: 0, unsure: 0, somewhat_agree: 0, agree: 1, strongly_agree: 0 }],
]);
const USER_POSITIONS = new Map<string, PointPosition>();

function renderCard(currentUserId: string | undefined) {
  return render(
    <MemoryRouter>
      <StoryCardDetail
        story={BASE_STORY}
        linkedPoints={[BASE_POINT]}
        positionCounts={POSITION_COUNTS}
        userPositions={USER_POSITIONS}
        currentUserId={currentUserId}
        isDetailView
      />
    </MemoryRouter>
  );
}

describe('Row above point — story card', () => {
  it('hides author identity row when viewer === story author', () => {
    renderCard(AUTHOR_ID);
    // The outer card header renders authorName in a <button>, not an element with font-medium.
    // The QuotedPoint identity row renders it in <span className="font-medium"> — unique to that row.
    // When the gate is in place, that element must be absent in self-view.
    expect(screen.queryAllByText(AUTHOR_NAME, { selector: '.font-medium' })).toHaveLength(0);
  });

  it('shows author identity row when viewer !== story author', () => {
    renderCard('u-other');
    expect(screen.queryAllByText(AUTHOR_NAME, { selector: '.font-medium' }).length).toBeGreaterThan(0);
  });

  it('shows author identity row when viewer is anonymous', () => {
    renderCard(undefined);
    expect(screen.queryAllByText(AUTHOR_NAME, { selector: '.font-medium' }).length).toBeGreaterThan(0);
  });
});
