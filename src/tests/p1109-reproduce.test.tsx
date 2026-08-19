/**
 * @file p1109-reproduce.test.tsx
 * @description P1109 canary: identity row above a linked point must show the
 * author's pledge ring and avatar colour, matching every other surface that
 * renders that author (e.g. story-card-with-links.tsx, the feed card twin).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { StoryCardDetail } from '@/app/components/social/StoryCardDetail';
import type { StoryWithAuthor, PointSummary, PositionType, PointPosition } from '@/app/types';

const PLEDGED_AVATAR_COLOR = '#FF5733';

const mockStory: StoryWithAuthor = {
  id: 'story-1',
  authorId: 'author-1',
  authorName: 'Pledged Author',
  authorSlug: 'pledged-author',
  authorAvatarColor: PLEDGED_AVATAR_COLOR,
  authorHasPledged: true,
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

const mockUserPositions = new Map<string, PointPosition>();

describe('P1109: identity row pledger ring + avatar colour', () => {
  it('shows the pledge ring and the author avatar colour on the identity row above the linked point', () => {
    render(
      <BrowserRouter>
        <StoryCardDetail
          story={mockStory}
          linkedPoints={[mockPoint]}
          positionCounts={mockPositionCounts}
          userPositions={mockUserPositions}
          isDetailView
          currentUserId="viewer-1"
        />
      </BrowserRouter>
    );

    // Identity row is uniquely styled with "!w-5 !h-5 !text-[10px]" (StoryCardDetail.tsx identity row)
    // — distinct from the main story-header avatar, which has no size-override className.
    // Two other sites share the identical "!w-5" class: the quote-pattern header row (only
    // rendered for context='point-detail', not exercised by this fixture) and LinkedStoryCard
    // (only reachable if hideLinkedStories is ever un-hardcoded at its one call site in this
    // file — currently dead code). Neither co-renders here, so exactly one match is expected.
    // Asserting the count (not just .find()'s first hit) keeps the test from silently picking
    // the wrong avatar if a future scenario co-renders more than one.
    const avatars = screen.getAllByTestId('gravatar-avatar');
    const identityRowAvatars = avatars.filter(el => el.className.includes('!w-5'));
    expect(identityRowAvatars).toHaveLength(1);
    const identityRowAvatar = identityRowAvatars[0];

    // Ring: GravatarAvatar sets data-pledger="true" only when the ring is visible.
    expect(identityRowAvatar).toHaveAttribute('data-pledger', 'true');

    // Colour: falls back to '#0044CC' when avatarColor is dropped at the component boundary.
    expect(identityRowAvatar!.style.backgroundColor).toBe('rgb(255, 87, 51)');

    // The main story-header avatar (no size-override class) is the other avatar in this
    // fixture — also fixed by P1109 (StoryCardDetail.tsx:~274) and must show the same ring
    // and colour, since it reads directly from `story.authorHasPledged` / `authorAvatarColor`.
    const headerAvatars = avatars.filter(el => !el.className.includes('!w-5'));
    expect(headerAvatars).toHaveLength(1);
    expect(headerAvatars[0]).toHaveAttribute('data-pledger', 'true');
    expect(headerAvatars[0].style.backgroundColor).toBe('rgb(255, 87, 51)');
  });

  it('shows the pledge ring and avatar colour on the quote-pattern header row (point-detail context)', () => {
    render(
      <BrowserRouter>
        <StoryCardDetail
          story={mockStory}
          linkedPoints={[mockPoint]}
          positionCounts={mockPositionCounts}
          userPositions={mockUserPositions}
          currentUserId="viewer-1"
          context="point-detail"
          authorPosition="agree"
        />
      </BrowserRouter>
    );

    // showQuotePattern requires context === 'point-detail' && authorPosition (StoryCardDetail.tsx:185)
    // — this is the third of the four GravatarAvatar call sites fixed by P1109 (~line 193).
    const avatars = screen.getAllByTestId('gravatar-avatar');
    const headerRowAvatars = avatars.filter(el => el.className.includes('!w-5'));
    expect(headerRowAvatars).toHaveLength(1);
    expect(headerRowAvatars[0]).toHaveAttribute('data-pledger', 'true');
    expect(headerRowAvatars[0].style.backgroundColor).toBe('rgb(255, 87, 51)');
  });

  it('shows no pledge ring on the identity row for a non-pledged author (fix must not force the ring on)', () => {
    const nonPledgedStory: StoryWithAuthor = {
      ...mockStory,
      authorHasPledged: false,
    };

    render(
      <BrowserRouter>
        <StoryCardDetail
          story={nonPledgedStory}
          linkedPoints={[mockPoint]}
          positionCounts={mockPositionCounts}
          userPositions={mockUserPositions}
          isDetailView
          currentUserId="viewer-1"
        />
      </BrowserRouter>
    );

    const avatars = screen.getAllByTestId('gravatar-avatar');
    const identityRowAvatars = avatars.filter(el => el.className.includes('!w-5'));
    expect(identityRowAvatars).toHaveLength(1);

    // GravatarAvatar only sets data-pledger when the ring is visible — absent means no ring.
    expect(identityRowAvatars[0]).not.toHaveAttribute('data-pledger');
  });
});
