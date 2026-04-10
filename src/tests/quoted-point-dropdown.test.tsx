/**
 * @file quoted-point-dropdown.test.tsx
 * @description Tests that position buttons render correctly in QuotedPoint cards.
 *
 * Updated for P521: Dropdown chevrons removed in favor of auto-dropdown on group click.
 * Tests verify that position buttons render and are accessible within QuotedPoint.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { StoryCardDetail } from '@/app/components/social/StoryCardDetail';
import type { StoryWithAuthor, PointSummary, PositionType, PointPosition } from '@/app/types';

// Mock data for testing - using backend types
const mockStory: StoryWithAuthor = {
  id: 'story-1',
  authorId: 'author-1',
  authorName: 'Test Author',
  authorSlug: 'test-author',
  authorAvatarColor: '#3B82F6',
  authorEarsCount: 5,
  content: 'Test story content about remote work.',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  understoodCount: 3,
  visibility: 'public',
  currentVersion: 1,
  tags: [],
};

const mockPoint: PointSummary = {
  id: 'point-1',
  statement: 'Remote work is more productive than office work',
  tags: [],
  systemTags: [],
  visibility: 'public',
};

const mockPositionCounts = new Map<string, Record<PositionType, number>>([
  ['point-1', {
    strongly_agree: 2,
    agree: 5,
    somewhat_agree: 1,
    unsure: 2,
    somewhat_disagree: 0,
    disagree: 3,
    strongly_disagree: 1,
  }],
]);

const mockUserPositions = new Map<string, PointPosition>([
  ['point-1', {
    id: 'pos-1',
    pointId: 'point-1',
    userId: 'author-1',
    position: 'agree',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }],
]);

describe('QuotedPoint position buttons', () => {
  it('should render position button groups (Disagree, Unsure, Agree)', () => {
    render(
      <BrowserRouter>
        <StoryCardDetail
          story={mockStory}
          linkedPoints={[mockPoint]}
          positionCounts={mockPositionCounts}
          userPositions={mockUserPositions}
          isDetailView
        />
      </BrowserRouter>
    );

    // P521: Position buttons render as group buttons (no separate chevron triggers)
    expect(screen.getByText('Agree')).toBeInTheDocument();
    expect(screen.getByText('Disagree')).toBeInTheDocument();
    expect(screen.getByText('Unsure')).toBeInTheDocument();
  });

  it('should NOT have overflow-hidden on QuotedPoint container that would clip dropdowns', () => {
    render(
      <BrowserRouter>
        <StoryCardDetail
          story={mockStory}
          linkedPoints={[mockPoint]}
          positionCounts={mockPositionCounts}
          userPositions={mockUserPositions}
          isDetailView
        />
      </BrowserRouter>
    );

    // Find the QuotedPoint container (the button that wraps the point card)
    // It should have the group/quote class but NOT overflow-hidden
    const quotedPointButtons = document.querySelectorAll('button.group\\/quote');

    quotedPointButtons.forEach((button) => {
      const hasOverflowHidden = button.classList.contains('overflow-hidden');
      expect(hasOverflowHidden).toBe(false);
    });
  });

  it('should render PositionButtons within QuotedPoint card', () => {
    render(
      <BrowserRouter>
        <StoryCardDetail
          story={mockStory}
          linkedPoints={[mockPoint]}
          positionCounts={mockPositionCounts}
          userPositions={mockUserPositions}
          isDetailView
        />
      </BrowserRouter>
    );

    // P521: Verify position buttons exist inside the presentation wrapper
    const agreeButton = screen.getByText('Agree').closest('button')!;
    const positionWrapper = agreeButton.closest('[role="presentation"]');
    expect(positionWrapper).not.toBeNull();
  });
});
