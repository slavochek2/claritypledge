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
import { StoryCardDetail, type StoryAuthor, type CredibilityStats } from '@/app/components/social/StoryCardDetail';
import type { Story, Point } from '@/app/prototypes/shared/types';

// Mock data for testing
const mockAuthor: StoryAuthor = {
  id: 'author-1',
  name: 'Test Author',
  role: 'Developer',
  hasPledged: true,
};

const mockCredibility: CredibilityStats = {
  ear: 5,
  mic: 3,
};

const mockStory: Story = {
  id: 'story-1',
  authorId: 'author-1',
  text: 'Test story content about remote work.',
  createdAt: '2026-01-01T00:00:00Z',
  verificationCount: 3,
  visibility: 'public',
  linkedPointIds: ['point-1'],
};

const mockPoint: Point = {
  id: 'point-1',
  text: 'Remote work is more productive than office work',
  positions: {
    'author-1': { position: 'agree' },
  },
  linkedStoryIds: ['story-1'],
  createdAt: '2026-01-01T00:00:00Z',
};

const mockGetPointPositionCounts = () => ({
  strongly_agree: 2,
  agree: 5,
  somewhat_agree: 1,
  unsure: 2,
  somewhat_disagree: 0,
  disagree: 3,
  strongly_disagree: 1,
});

describe('QuotedPoint dropdown visibility', () => {
  it('should render dropdown buttons for Agree and Disagree groups', () => {
    render(
      <BrowserRouter>
        <StoryCardDetail
          story={mockStory}
          author={mockAuthor}
          authorCredibility={mockCredibility}
          linkedPoints={[mockPoint]}
          getPointPositionCounts={mockGetPointPositionCounts}
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
          author={mockAuthor}
          authorCredibility={mockCredibility}
          linkedPoints={[mockPoint]}
          getPointPositionCounts={mockGetPointPositionCounts}
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
          author={mockAuthor}
          authorCredibility={mockCredibility}
          linkedPoints={[mockPoint]}
          getPointPositionCounts={mockGetPointPositionCounts}
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
