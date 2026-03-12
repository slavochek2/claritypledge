/**
 * @file p494-tell-story-visibility.test.tsx
 * @description P494: "Tell your story →" must only appear when user is:
 *   1. Logged in (currentUserId present)
 *   2. Has set a position on the point
 *   3. Has no story yet linked to this point
 *
 * Bug: P458 added an anonymous-user CTA block that shows "Tell your story →"
 * when !currentUserId — the exact inverse of the requirement.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { Point, PositionType } from '@/app/prototypes/shared/types';

const POINT_ID = 'point-1';
const CURRENT_USER = 'user-1';

const basePoint: Point = {
  id: POINT_ID,
  text: 'Calibrated understanding requires three types of agreement',
  createdAt: '2026-01-01T00:00:00Z',
  positions: {},
  linkedStoryIds: [],
};

const pointWithPosition: Point = {
  ...basePoint,
  positions: { [CURRENT_USER]: { position: 'agree' as PositionType, userId: CURRENT_USER } },
};

describe('P494: "Tell your story" visibility gate', () => {
  describe('Anonymous user (no currentUserId)', () => {
    it('does NOT show "Tell your story →" for anonymous users', () => {
      render(
        <BrowserRouter>
          <PointCardWithLinks
            point={basePoint}
            currentUserId={undefined}
            isDetailView
          />
        </BrowserRouter>
      );

      expect(screen.queryByText('Tell your story →')).not.toBeInTheDocument();
    });
  });

  describe('Authenticated user without position', () => {
    it('does NOT show "Tell your story →" when no position is set', () => {
      render(
        <BrowserRouter>
          <PointCardWithLinks
            point={basePoint}
            currentUserId={CURRENT_USER}
            isDetailView
          />
        </BrowserRouter>
      );

      expect(screen.queryByText('Tell your story →')).not.toBeInTheDocument();
    });
  });

  describe('Authenticated user with position and existing story', () => {
    it('does NOT show story CTA when viewer already has a story', () => {
      render(
        <BrowserRouter>
          <PointCardWithLinks
            point={pointWithPosition}
            currentUserId={CURRENT_USER}
            viewerStoryCount={1}
            isDetailView
          />
        </BrowserRouter>
      );

      // Neither the old "Tell your story" nor the position-aware CTA should show
      expect(screen.queryByText('Tell your story →')).not.toBeInTheDocument();
      expect(screen.queryByText('Add your story →')).not.toBeInTheDocument();
    });
  });
});
