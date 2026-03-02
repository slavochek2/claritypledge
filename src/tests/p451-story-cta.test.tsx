/**
 * @file p451-story-cta.test.tsx
 * @description Regression tests for P451/P456: Story CTA must appear on all position surfaces,
 * not only on the point-detail-page.
 *
 * P451: showStoryCTA is derived from userPosition, so it persists across refresh.
 * P456: StoryCardDetail uses position-aware copy (getPositionCTACopy) instead of generic text.
 *       For 'agree' position: ctaText = 'Why do you agree? →'
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PointCardDetail } from '@/app/components/social/PointCardDetail';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import { StoryCardDetail } from '@/app/components/social/StoryCardDetail';
import type { Point as ProtoPoint } from '@/app/prototypes/shared/types';
import type { Point, PositionType, PointPosition } from '@/app/prototypes/shared/types';
import type { StoryWithAuthor, PointSummary } from '@/app/types';
import type { SevenPointCounts } from '@/app/prototypes/linkedin-like/components/shared';

// ── Shared ────────────────────────────────────────────────────────────────────

const POINT_ID = 'point-1';
const CURRENT_USER = 'user-1';

const emptyCounts: SevenPointCounts = {
  strongly_agree: 0, agree: 2, somewhat_agree: 0,
  unsure: 0, somewhat_disagree: 0, disagree: 1, strongly_disagree: 0,
};

const getEmptyCounts = () => emptyCounts;

// Click the main "Agree" segment button (not the dropdown arrow)
function clickAgree() {
  const agreeBtn = screen.getByText('Agree').closest('button')!;
  fireEvent.click(agreeBtn);
}

// ── PointCardDetail ───────────────────────────────────────────────────────────

const protoPoint: ProtoPoint = {
  id: POINT_ID,
  text: 'Remote work is more productive',
  createdAt: '2026-01-01T00:00:00Z',
  positions: {},
  linkedStoryIds: [],
};

const protoPointWithPosition: ProtoPoint = {
  ...protoPoint,
  positions: { current: { position: 'agree' as PositionType, userId: CURRENT_USER } },
};

describe('P451: PointCardDetail story CTA', () => {
  it('does NOT show CTA before staking', () => {
    render(
      <BrowserRouter>
        <PointCardDetail
          point={protoPoint}
          linkedStories={[]}
          getPointPositionCounts={getEmptyCounts}
          isDetailView
        />
      </BrowserRouter>
    );
    expect(screen.queryByText('Tell your story →')).toBeNull();
  });

  it('shows CTA after staking a position', () => {
    render(
      <BrowserRouter>
        <PointCardDetail
          point={protoPoint}
          linkedStories={[]}
          getPointPositionCounts={getEmptyCounts}
          isDetailView
        />
      </BrowserRouter>
    );
    clickAgree();
    expect(screen.getByText('Tell your story →')).toBeInTheDocument();
  });

  it('shows CTA on load when position is pre-existing (refresh regression)', () => {
    render(
      <BrowserRouter>
        <PointCardDetail
          point={protoPointWithPosition}
          linkedStories={[]}
          getPointPositionCounts={getEmptyCounts}
          isDetailView
        />
      </BrowserRouter>
    );
    expect(screen.getByText('Tell your story →')).toBeInTheDocument();
  });
});

// ── PointCardWithLinks ────────────────────────────────────────────────────────

const linkedPoint: Point = {
  id: POINT_ID,
  text: 'Remote work is more productive',
  createdAt: '2026-01-01T00:00:00Z',
  positions: {},
  linkedStoryIds: [],
};

const linkedPointWithPosition: Point = {
  ...linkedPoint,
  positions: { [CURRENT_USER]: { position: 'agree' as PositionType, userId: CURRENT_USER } },
};

// P465: P451's "Tell your story →" blue button is removed from PointCardWithLinks.
// The CTA is now inline text ("Why do you agree? →") in the footer row.
const AGREE_CTA_LINKS = 'Why do you agree? →';

describe('P451/P465: PointCardWithLinks story CTA', () => {
  it('does NOT show CTA before staking', () => {
    render(
      <BrowserRouter>
        <PointCardWithLinks
          point={linkedPoint}
          currentUserId={CURRENT_USER}
          isDetailView
        />
      </BrowserRouter>
    );
    // P465: P451 blue button removed; P456 inline CTA also absent before staking
    expect(screen.queryByText('Tell your story →')).toBeNull();
    expect(screen.queryByText(AGREE_CTA_LINKS)).toBeNull();
  });

  it('shows position-aware CTA after staking a position (no P451 blue button)', () => {
    render(
      <BrowserRouter>
        <PointCardWithLinks
          point={linkedPoint}
          currentUserId={CURRENT_USER}
          isDetailView
        />
      </BrowserRouter>
    );
    clickAgree();
    // P465: P451 blue "Tell your story →" removed; inline CTA appears (feed pattern)
    expect(screen.queryByText('Tell your story →')).toBeNull();
    expect(screen.getByText(AGREE_CTA_LINKS)).toBeInTheDocument();
  });

  it('shows position-aware CTA on load when position is pre-existing (refresh regression)', () => {
    render(
      <BrowserRouter>
        <PointCardWithLinks
          point={linkedPointWithPosition}
          currentUserId={CURRENT_USER}
          isDetailView
        />
      </BrowserRouter>
    );
    // P465: inline CTA shown; P451 blue button gone
    expect(screen.queryByText('Tell your story →')).toBeNull();
    expect(screen.getByText(AGREE_CTA_LINKS)).toBeInTheDocument();
  });
});

// ── StoryCardDetail (QuotedPointForStory) ────────────────────────────────────

const mockStory: StoryWithAuthor = {
  id: 'story-1',
  authorId: 'author-1',
  authorName: 'Test Author',
  authorSlug: 'test-author',
  authorAvatarColor: '#3B82F6',
  authorEarsCount: 5,
  content: 'Test story content.',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  understoodCount: 0,
  visibility: 'public',
  currentVersion: 1,
  tags: [],
};

const mockPointSummary: PointSummary = {
  id: POINT_ID,
  statement: 'Remote work is more productive',
  tags: [],
};

const positionCounts = new Map<string, Record<PositionType, number>>([
  [POINT_ID, emptyCounts],
]);
const emptyUserPositions = new Map<string, PointPosition>();
const preloadedUserPositions = new Map<string, PointPosition>([
  [POINT_ID, { id: 'pos-1', pointId: POINT_ID, userId: CURRENT_USER, position: 'agree' as PositionType, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
]);

// P456: StoryCardDetail uses position-aware CTA copy. For 'agree' → 'Why do you agree? →'
const AGREE_CTA = 'Why do you agree? →';

describe('P451/P456: StoryCardDetail QuotedPointForStory CTA', () => {
  it('does NOT show CTA before staking', () => {
    render(
      <BrowserRouter>
        <StoryCardDetail
          story={mockStory}
          linkedPoints={[mockPointSummary]}
          positionCounts={positionCounts}
          userPositions={emptyUserPositions}
          isDetailView
        />
      </BrowserRouter>
    );
    expect(screen.queryByText(AGREE_CTA)).toBeNull();
  });

  it('shows position-aware CTA after staking a position on a linked point', () => {
    render(
      <BrowserRouter>
        <StoryCardDetail
          story={mockStory}
          linkedPoints={[mockPointSummary]}
          positionCounts={positionCounts}
          userPositions={emptyUserPositions}
          isDetailView
        />
      </BrowserRouter>
    );
    clickAgree();
    expect(screen.getByText(AGREE_CTA)).toBeInTheDocument();
  });

  it('shows position-aware CTA on load when position is pre-existing (refresh regression)', () => {
    render(
      <BrowserRouter>
        <StoryCardDetail
          story={mockStory}
          linkedPoints={[mockPointSummary]}
          positionCounts={positionCounts}
          userPositions={preloadedUserPositions}
          isDetailView
        />
      </BrowserRouter>
    );
    expect(screen.getByText(AGREE_CTA)).toBeInTheDocument();
  });
});
