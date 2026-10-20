/**
 * @file p1508-card-regression.test.tsx
 * @description P1508 fifth round (D5) — the canvas reuses the profile's owner row and the feed
 * card, and moves the profile's owner-row decision into one shared piece. The cards everywhere
 * else must render exactly as before: the snapshots below were recorded BEFORE that change, on the
 * branch's previous commit, and the refactor has to reproduce them byte for byte.
 *
 * Covered: the feed / stake card (FeedPointCard without `owner`), the profile card on one's own
 * and on someone else's profile (PointCardWithLinks, list surface), and the presentational pieces
 * the Day board renders (QuotedPointBox, PointOwnerRow, PointCardShell).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import { PointOwnerRow, QuotedPointBox } from '@/app/components/shared/presentational/quoted-point-card';
import { PointCardShell } from '@/app/components/shared/presentational/point-card-shell';
import type { PointWithUserPosition, StoryWithAuthor } from '@/app/types';
import type { Point, Story } from '@/app/components/shared/prototype-types';

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

const COUNTS = { strongly_agree: 1, agree: 2, somewhat_agree: 0, unsure: 1, somewhat_disagree: 0, disagree: 1, strongly_disagree: 0 };

const feedPoint = {
  id: 'point-1',
  statement: 'Speakers overestimate how clearly they communicated. #claritypledge',
  tags: ['claritypledge'],
  systemTags: ['canvas:problem'],
  visibility: 'public',
  positionCounts: COUNTS,
  totalPositions: 5,
  userPosition: { position: 'agree' },
} as unknown as PointWithUserPosition;

const story = (id: string, authorId: string, authorName: string) => ({
  id, authorId, authorName, authorSlug: authorName.toLowerCase().replace(/\s+/g, '-'),
  content: `Story ${id} by ${authorName}.`, visibility: 'public', createdAt: '2026-10-01T00:00:00Z',
  understoodCount: 0, authorEarsCount: 3, authorHasPledged: true,
}) as unknown as StoryWithAuthor;

const html = (el: HTMLElement) => el.innerHTML;

describe('feed and /stake card (FeedPointCard, no owner) — unchanged', () => {
  it('signed in, with stories, collapsed then expanded', () => {
    auth.viewerId = 'viewer-1';
    const { container, getByTestId } = render(
      <MemoryRouter>
        <FeedPointCard point={feedPoint} surface="feed" linkedStories={[story('s1', 'owner-1', 'Owner One'), story('s2', 'viewer-1', 'Viewer')]} />
      </MemoryRouter>,
    );
    expect(html(container)).toMatchSnapshot('feed collapsed');
    fireEvent.click(getByTestId('feed-point-story-expander'));
    expect(html(container)).toMatchSnapshot('feed expanded');
  });

  it('signed in, no stories, on /stake', () => {
    auth.viewerId = 'viewer-1';
    const { container } = render(<MemoryRouter><FeedPointCard point={feedPoint} surface="stake" linkedStories={[]} /></MemoryRouter>);
    expect(html(container)).toMatchSnapshot('stake no stories');
  });

  it('signed out', () => {
    auth.viewerId = null;
    const { container } = render(<MemoryRouter><FeedPointCard point={{ ...feedPoint, userPosition: null } as unknown as PointWithUserPosition} linkedStories={[story('s1', 'owner-1', 'Owner One')]} /></MemoryRouter>);
    expect(html(container)).toMatchSnapshot('feed signed out');
  });
});

describe('profile card (PointCardWithLinks, list surface) — unchanged', () => {
  const protoPoint: Point = {
    id: 'point-2',
    text: 'People rarely check what the listener understood.',
    createdAt: '2026-10-01T00:00:00Z',
    positions: { 'owner-1': { position: 'agree', timestamp: '2026-10-01T00:00:00Z' } },
    linkedStoryIds: [],
    visibility: 'public',
  } as unknown as Point;
  const ownerStory: Story = {
    id: 'st-1', authorId: 'owner-1', text: 'Owner story text.', createdAt: '2026-10-01T00:00:00Z',
    visibility: 'public', linkedPointIds: [], understoodCount: 0,
  } as unknown as Story;
  const owner = { id: 'owner-1', name: 'Owner One', hasPledged: true, ear: 4, avatarColor: '#123456' };
  const renderProfile = (viewerId: string | undefined, position: 'agree' | undefined, stories: Story[], viewerStoryId?: string) => render(
    <MemoryRouter>
      <PointCardWithLinks
        point={protoPoint}
        linkedStories={stories}
        profileOwner={{ ...owner, position }}
        currentUserId={viewerId}
        getPointPositionCounts={() => COUNTS}
        viewerStoryCount={0}
        viewerStoryId={viewerStoryId}
        getStoryAuthor={() => ({ id: 'owner-1', name: 'Owner One', hasPledged: true, ear: 4 })}
        tags={['claritypledge']}
        shareSurface="profile"
      />
    </MemoryRouter>,
  );

  it("someone else's profile: owner row above the quoted box, their story", () => {
    const { container } = renderProfile('viewer-1', 'agree', [ownerStory], 'viewer-story');
    expect(html(container)).toMatchSnapshot('profile other');
  });

  it("someone else's profile, owner without a position", () => {
    const { container } = renderProfile('viewer-1', undefined, []);
    expect(html(container)).toMatchSnapshot('profile other no position');
  });

  it('one\'s own profile: the own-card header, "Your story"', () => {
    const { container } = renderProfile('owner-1', 'agree', [ownerStory]);
    expect(html(container)).toMatchSnapshot('profile own');
  });

  it('signed out on a profile', () => {
    const { container } = renderProfile(undefined, 'agree', [ownerStory]);
    expect(html(container)).toMatchSnapshot('profile signed out');
  });
});

describe('Day board pieces (presentational) — unchanged', () => {
  it('QuotedPointBox, PointOwnerRow and PointCardShell', () => {
    const { container } = render(
      <div>
        <PointOwnerRow inList isAgent={false} name="Owner One" position="agree" avatar={<span>A</span>} badges={<span>4</span>} menu={<span>⋯</span>} />
        <PointOwnerRow inList={false} isAgent name="Agent · Owner" position="disagree" avatar={<span>A</span>} />
        <QuotedPointBox statement={<p>A statement</p>} footer={<p>footer</p>}><p>child</p></QuotedPointBox>
        <PointCardShell statement={<p>A statement</p>} corner={<span>⋯</span>} footer={<p>footer</p>}><p>child</p></PointCardShell>
      </div>,
    );
    expect(html(container)).toMatchSnapshot('presentational');
  });
});
