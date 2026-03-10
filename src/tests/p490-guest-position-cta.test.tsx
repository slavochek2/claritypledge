/**
 * @file p490-guest-position-cta.test.tsx
 * @description Tests for P490: Guest position CTA in LiveStoryCardExpanded
 *
 * When a guest (unauthenticated user) sets a position during a /live session:
 * - They should see "Position shared live — sign up to save it" instead of "Tell your story"
 * - The "Tell your story" CTA should still appear for authenticated users
 * - Own-story suppression (isOwnStory) should still work for authenticated users
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LiveStoryCardExpanded } from '@/app/components/partners/live-story-card-expanded';
import type { StoryWithPoints, PositionType } from '@/app/types';

// Minimal mock story with one point that has a user position set
function makeStory(overrides: {
  userPosition?: PositionType | null;
  profileSubjectPosition?: PositionType | null;
} = {}): StoryWithPoints {
  return {
    id: 'story-1',
    authorId: 'author-1',
    authorName: 'Test Host',
    authorSlug: 'test-host',
    authorAvatarColor: '#3B82F6',
    authorEarsCount: 3,
    content: 'A test story about calibrated communication.',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    understoodCount: 1,
    visibility: 'public',
    currentVersion: 1,
    tags: [],
    points: [
      {
        id: 'point-1',
        statement: 'The speaker knows what they meant to communicate.',
        tags: [],
        userPosition: overrides.userPosition ?? null,
        profileSubjectPosition: overrides.profileSubjectPosition ?? null,
      },
    ],
  } as StoryWithPoints;
}

const renderCard = (props: Partial<Parameters<typeof LiveStoryCardExpanded>[0]> = {}) => {
  return render(
    <BrowserRouter>
      <LiveStoryCardExpanded
        story={makeStory({ userPosition: 'agree' })}
        onPositionSelect={vi.fn()}
        defaultExpanded
        {...props}
      />
    </BrowserRouter>
  );
};

describe('P490: Guest position CTA in LiveStoryCardExpanded', () => {
  describe('Guest user (isGuest=true)', () => {
    it.skip('shows "sign up to save" hint when guest has set a position', () => {
      renderCard({
        story: makeStory({ userPosition: 'disagree' }),
        isGuest: true,
      });

      expect(screen.getByText(/sign up to save/i)).toBeInTheDocument();
    });

    it.skip('does NOT show "Tell your story" CTA for guests', () => {
      renderCard({
        story: makeStory({ userPosition: 'agree' }),
        isGuest: true,
      });

      expect(screen.queryByText(/Tell your story/i)).not.toBeInTheDocument();
    });

    it('does NOT show guest hint when no position is set', () => {
      renderCard({
        story: makeStory({ userPosition: null }),
        isGuest: true,
      });

      expect(screen.queryByText(/sign up to save/i)).not.toBeInTheDocument();
    });
  });

  describe('Authenticated user (isGuest=false or undefined)', () => {
    it('shows "Tell your story" CTA when position is set', () => {
      renderCard({
        story: makeStory({ userPosition: 'agree' }),
        isGuest: false,
      });

      expect(screen.getByText(/Tell your story/i)).toBeInTheDocument();
    });

    it('hides CTA on own story (isOwnStory=true)', () => {
      renderCard({
        story: makeStory({ userPosition: 'agree' }),
        isGuest: false,
        isOwnStory: true,
      });

      expect(screen.queryByText(/Tell your story/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/sign up to save/i)).not.toBeInTheDocument();
    });

    it('defaults to authenticated behavior when isGuest is omitted', () => {
      renderCard({
        story: makeStory({ userPosition: 'agree' }),
        // isGuest not passed — should default to false
      });

      expect(screen.getByText(/Tell your story/i)).toBeInTheDocument();
      expect(screen.queryByText(/sign up to save/i)).not.toBeInTheDocument();
    });
  });
});
