/**
 * @file quoted-point-dropdown.test.tsx
 * @description Tests that dropdown arrows are visible in QuotedPoint cards.
 *
 * Issue: overflow-hidden on the QuotedPoint container clips the dropdown chevron,
 * making it impossible to select intensity levels (Strongly Agree, Somewhat Agree, etc.)
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

describe('QuotedPoint dropdown visibility', () => {
  it('should render dropdown buttons for Agree and Disagree groups', () => {
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

    // The dropdown buttons should be present with proper test IDs
    const agreeDropdown = screen.getByTestId('agree-dropdown');
    const disagreeDropdown = screen.getByTestId('disagree-dropdown');

    expect(agreeDropdown).toBeInTheDocument();
    expect(disagreeDropdown).toBeInTheDocument();
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

  it('should scale PositionButtons to fit within QuotedPoint card', () => {
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

    // Find the PositionButtons wrapper inside QuotedPoint
    // It should have scale transform (origin-left) to fit within the card
    const scaledContainers = document.querySelectorAll('[class*="origin-left"]');
    expect(scaledContainers.length).toBeGreaterThan(0);
  });
});
