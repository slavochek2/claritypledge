/**
 * @file p1508-canvas-sixth-round.test.tsx
 * @description P1508 sixth round — one card order on every point card (R3, R4): statement, tags,
 * the spread row ("Contested" with the two-way arrow), then the position buttons, which carry no
 * counts (R5); and the reserved canvas tags never show as pills (R9).
 *
 * The canvas page itself (layers, two cards plus "N more" opening the box in the panel, the header,
 * outline Previous / Next) is covered end to end in e2e/p1508-clarity-canvas.spec.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import { TagPills } from '@/app/components/shared/tag-pills';
import { PositionButtons } from '@/app/components/shared';
import type { PointWithUserPosition } from '@/app/types';
import type { Point } from '@/app/components/shared/prototype-types';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'viewer-1' } }, user: { id: 'viewer-1' } }),
}));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: async () => undefined }),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { setPosition: vi.fn(async () => undefined) } }));

// Two on each side: contested.
const COUNTS = { strongly_agree: 1, agree: 2, somewhat_agree: 0, unsure: 1, somewhat_disagree: 0, disagree: 2, strongly_disagree: 0 };

/** a precedes b in document order */
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

function expectCardOrder(container: HTMLElement) {
  const tag = screen.getByText('#claritypledge');
  const spreadRow = screen.getByTestId('point-spread-row');
  const buttons = screen.getByTestId('agree-group');
  expect(before(tag, spreadRow)).toBe(true);
  expect(before(spreadRow, buttons)).toBe(true);
  // R5: no counts on the buttons wherever the spread shows.
  expect(container.querySelector('[data-testid$="-count-badge"]')).toBeNull();
  // R3: "Contested" beside the spread, with the two-way arrow, not the fork.
  const contested = screen.getByTestId('contested');
  expect(spreadRow.contains(contested)).toBe(true);
  expect(contested.querySelector('svg.lucide-arrow-left-right')).not.toBeNull();
  expect(contested.querySelector('svg.lucide-split')).toBeNull();
  expect(screen.getByTestId('spread-info')).toBeInTheDocument();
}

describe('R3–R5: the feed and /stake card', () => {
  const point = {
    id: 'point-1',
    statement: 'Speakers overestimate how clearly they communicated. #claritypledge',
    tags: ['claritypledge'],
    systemTags: ['canvas:problem', 'canvas_claritypledge'],
    visibility: 'public',
    positionCounts: COUNTS,
    totalPositions: 6,
    userPosition: { position: 'agree' },
  } as unknown as PointWithUserPosition;

  for (const surface of ['feed', 'stake'] as const) {
    it(`on ${surface}: statement, tags, spread row, then buttons with no counts`, () => {
      const { container } = render(<MemoryRouter><FeedPointCard point={point} surface={surface} linkedStories={[]} /></MemoryRouter>);
      expectCardOrder(container);
      // The bars count from the card's own counts.
      expect(screen.getByTestId('position-spread').getAttribute('title')).toBe('2 disagree, 1 unsure, 2 agree, 1 strongly agree');
    });
  }

  it('a page that reads everyone itself (the canvas) passes its own spread row, which replaces the built one', () => {
    render(
      <MemoryRouter>
        <FeedPointCard point={point} surface="canvas" linkedStories={[]} spread={<div data-testid="page-spread" />} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('page-spread')).toBeInTheDocument();
    expect(screen.queryByTestId('point-spread-row')).toBeNull();
  });
});

describe('R3–R5: the profile card', () => {
  const protoPoint = {
    id: 'point-2',
    text: 'People rarely check what the listener understood.',
    createdAt: '2026-10-01T00:00:00Z',
    positions: {},
    linkedStoryIds: [],
    visibility: 'public',
  } as unknown as Point;

  it('statement, tags, spread row, then buttons with no counts', () => {
    const { container } = render(
      <MemoryRouter>
        <PointCardWithLinks
          point={protoPoint}
          linkedStories={[]}
          profileOwner={{ id: 'owner-1', name: 'Owner One', hasPledged: true, ear: 4, position: 'agree' }}
          currentUserId="viewer-1"
          getPointPositionCounts={() => COUNTS}
          viewerStoryCount={0}
          getStoryAuthor={() => ({ id: 'owner-1', name: 'Owner One', hasPledged: true, ear: 4 })}
          tags={['claritypledge']}
          shareSurface="profile"
        />
      </MemoryRouter>,
    );
    expectCardOrder(container);
  });
});

describe('R5 control: the buttons still show counts where no spread is shown (/live, the letter flow)', () => {
  // Also proves the "no badge" checks above can fail: in this environment the badges do render.
  it('without compact, the count badges render', () => {
    render(<PositionButtons userPosition={null} counts={COUNTS} onPositionClick={() => undefined} />);
    expect(screen.getByTestId('agree-count-badge')).toHaveTextContent('3');
    expect(screen.getByTestId('disagree-count-badge')).toHaveTextContent('2');
  });
});

describe('R9: canvas tags are never pills', () => {
  it('hides canvas_<name>, box tags and the retired canvas:uvp; keeps user tags', () => {
    render(
      <MemoryRouter>
        <TagPills tags={['claritypledge']} systemTags={['canvas_claritypledge', 'canvas:problem', 'canvas:uvp']} context="feed" />
      </MemoryRouter>,
    );
    expect(screen.getByText('#claritypledge')).toBeInTheDocument();
    expect(screen.queryByText(/canvas/)).toBeNull();
  });
});
