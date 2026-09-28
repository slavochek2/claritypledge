/**
 * @file p1296-card-footer.test.tsx
 * @description P1296 item 1 — one footer on every story and point card: count and
 * contribution CTA left; share (the sheet), then open-in-new, right; 44px icons.
 *
 * P1366 re-laid it out (prototype K): share moved into a 44px `⋯` menu in the card's TOP row,
 * open-in-new became an outlined `Details →` in the footer, and the CTAs became text links
 * (`+ Add a story`, `✓ Your story` — which now opens the story to read — and `+ Add a point`).
 * The assertions below that encoded the P1296 layout were rewritten to that layout; the P1296
 * behaviours they guard (the sheet, the event and its surface, no navigation from inside the
 * sheet, the withdrawal fix, the loading state) are unchanged. Full P1366 coverage:
 * p1366-card-footer.test.tsx.
 *
 * Asserted on the two feed cards, which render on /feed and /stake. The profile's cards take
 * the same controls from the same shared file (`card-footer-controls.tsx`); their owner flows
 * are covered by the profile suites.
 */
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { PointWithUserPosition, PositionType, StoryWithAuthor } from '@/app/types';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/mixpanel', () => ({ analytics: { track } }));

const session = vi.hoisted(() => ({ current: { user: { id: 'viewer-1' } } as null | { user: { id: string } } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: session.current, user: session.current?.user ?? null }) }));

vi.mock('@/app/contexts/agent-accounts-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/contexts/agent-accounts-context')>();
  return {
    ...actual,
    useAgentAccountIds: () => ({ isAgentAccountId: () => false, operatorNameFor: () => null, isLoading: false }),
  };
});

// The removal guard's dialog is P401's own concern; here a confirmed withdrawal is what matters.
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: ({ onAfterRemove }: { onAfterRemove: () => void }) => ({
    dialogProps: {},
    guardedRemovePosition: async () => { onAfterRemove(); },
  }),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { setPosition: vi.fn(async () => undefined) } }));
vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils')>()),
  copyToClipboard: vi.fn(async () => true),
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function makeStory(overrides: Partial<StoryWithAuthor> = {}): StoryWithAuthor {
  return {
    id: 'story-1',
    authorId: 'author-1',
    content: 'A story body.',
    visibility: 'public',
    currentVersion: 1,
    understoodCount: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    tags: [],
    systemTags: [],
    authorName: 'Test Author',
    authorSlug: 'test-author',
    ...overrides,
  } as StoryWithAuthor;
}

function makePoint(overrides: Partial<PointWithUserPosition> = {}): PointWithUserPosition {
  return {
    id: 'point-1',
    statement: 'A point statement.',
    tags: [],
    visibility: 'public',
    positionCounts: {
      strongly_agree: 0, agree: 1, somewhat_agree: 0, unsure: 0,
      somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
    },
    totalPositions: 1,
    userPosition: null,
    ...overrides,
  } as unknown as PointWithUserPosition;
}

const linkedStory = (id: string, authorId: string) =>
  makeStory({ id, authorId, authorName: `Author ${id}`, authorSlug: `a-${id}` });

/** P1366 — Share lives in the card's `⋯` menu. */
async function openShare(type: 'story' | 'point') {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: `More actions for this ${type}` }));
  await user.click(await screen.findByRole('menuitem', { name: 'Share' }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  cleanup();
  navigate.mockClear();
  track.mockClear();
  session.current = { user: { id: 'viewer-1' } };
});

describe('P1296 — the story card footer', () => {
  const renderStory = (props: Partial<Parameters<typeof FeedStoryCard>[0]> = {}) =>
    render(<MemoryRouter><FeedStoryCard story={makeStory()} linkedPoints={[]} surface="stake" {...props} /></MemoryRouter>);

  it('P1366: the footer carries Details →; share is ONE control, the 44px ⋯ in the top row, before the footer', () => {
    renderStory();
    const footer = screen.getByTestId('story-card-footer');
    expect(within(footer).getByRole('button', { name: 'Details for this story' })).toBeTruthy();
    const menu = screen.getByRole('button', { name: 'More actions for this story' });
    expect(menu.className).toContain('min-w-11');
    expect(menu.className).toContain('min-h-11');
    expect(within(footer).queryByRole('button', { name: 'More actions for this story' })).toBeNull();
    // the ⋯ precedes the footer in document (and focus) order
    expect(menu.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'More actions for this story' })).toHaveLength(1);
  });

  it('share opens the SHEET (link + embed) and fires feed_card_shared with its surface — and does not navigate', async () => {
    renderStory();
    await openShare('story');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Share story', { selector: 'h2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy embed code' })).toBeTruthy();
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'story', id: 'story-1', surface: 'stake' });
    expect(navigate).not.toHaveBeenCalled();
  });

  /**
   * The sheet renders in a PORTAL, but React bubbles its events through the component tree to
   * the card root — which navigates. What stops it is the footer row's stopPropagation, not the
   * controls (review, 2026-09-11). Asserted from INSIDE the open sheet, where that matters.
   */
  it('clicks inside the open sheet (copy link, the embed preset) never open the story', async () => {
    renderStory();
    const dialog = await openShare('story');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Expanded' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy embed code' }));
    // Both copy controls confirm — the link's and the embed's — and neither opened the story.
    await waitFor(() => expect(within(dialog).getAllByRole('button', { name: 'Copied' })).toHaveLength(2));
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Expanded' }), { key: 'Enter' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('the surface defaults to feed', async () => {
    render(<MemoryRouter><FeedStoryCard story={makeStory()} linkedPoints={[]} /></MemoryRouter>);
    await openShare('story');
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'story', id: 'story-1', surface: 'feed' });
  });

  it('Details → goes to the story', () => {
    renderStory();
    fireEvent.click(screen.getByRole('button', { name: 'Details for this story' }));
    expect(navigate).toHaveBeenCalledWith('/story/story-1');
  });

  it('Enter on the ⋯ acts on the menu, not on the card (no navigation)', async () => {
    renderStory();
    const trigger = screen.getByRole('button', { name: 'More actions for this story' });
    trigger.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("the story's AUTHOR sees + Add a point, and it goes to the story's add-point form", () => {
    renderStory({ currentUserId: 'author-1' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add a point' }));
    expect(navigate).toHaveBeenCalledWith('/story/story-1?addPoint=true');
  });

  it('anyone else sees no + Add a point', () => {
    renderStory({ currentUserId: 'viewer-1' });
    expect(screen.queryByRole('button', { name: '+ Add a point' })).toBeNull();
  });

  it('the count waits for the links: nothing while not loaded, "0 points" once loaded and empty', () => {
    const { unmount } = renderStory({ linkedPoints: undefined });
    expect(screen.queryByText('0 points')).toBeNull();
    // ...but the row itself, with its controls, is there from the first paint.
    expect(screen.getByRole('button', { name: 'Details for this story' })).toBeTruthy();
    unmount();
    renderStory({ linkedPoints: [] });
    expect(screen.getByText('0 points')).toBeTruthy();
  });
});

describe('P1296 — the point card footer', () => {
  // `linkedStories` is taken as-is — NOT defaulted — because `undefined` ("not loaded") is one
  // of the states under test, and a default parameter would silently turn it into `[]`.
  const renderPoint = (point: PointWithUserPosition = makePoint(), ...rest: [StoryWithAuthor[] | undefined] | []) => {
    const linkedStories = rest.length ? rest[0] : [];
    return render(<MemoryRouter><FeedPointCard point={point} linkedStories={linkedStories} surface="stake" /></MemoryRouter>);
  };

  it('P1366: Details → sits in the FOOTER row; share is the ⋯ in the top row — neither in the position-buttons row', () => {
    renderPoint();
    const footer = screen.getByTestId('point-card-footer');
    expect(within(footer).getByRole('button', { name: 'Details for this point' })).toBeTruthy();
    const menu = screen.getByRole('button', { name: 'More actions for this point' });
    expect(within(footer).queryByRole('button', { name: 'More actions for this point' })).toBeNull();
    // the position-buttons row holds the position buttons alone
    const positionsRow = screen.getByTestId('agree-group').closest('[role="presentation"]')!;
    expect(positionsRow.contains(menu)).toBe(false);
    expect(screen.getAllByRole('button', { name: 'More actions for this point' })).toHaveLength(1);
  });

  it('share fires feed_card_shared with type point and its surface', async () => {
    renderPoint();
    await openShare('point');
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'point', id: 'point-1', surface: 'stake' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('clicks inside the open sheet never open the point', async () => {
    renderPoint();
    const dialog = await openShare('point');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Collapsed' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Copied' })).toBeTruthy());
    expect(navigate).not.toHaveBeenCalled();
  });

  /**
   * Review, 2026-09-11 (MEDIUM). A confirmed withdrawal cleared only the card's LOCAL position,
   * so the card fell back to the position from the original fetch: the pill kept offering to
   * add a story for a stance the viewer had just dropped. The page is what lowers the counts
   * (P543), so the card must not lower them a second time either.
   */
  it('after the viewer WITHDRAWS their position, "+ Add a story" goes with it — and the count drops once', async () => {
    function Page() {
      const [point, setPoint] = useState(
        makePoint({
          userPosition: { position: 'agree' },
          positionCounts: { strongly_agree: 0, agree: 2, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 },
          totalPositions: 2,
        } as Partial<PointWithUserPosition>),
      );
      // The same local update /stake and /feed apply on onPointRemoved.
      const onPointRemoved = (_id: string, removed: PositionType | null) =>
        setPoint((prev) => ({
          ...prev,
          positionCounts: { ...prev.positionCounts, ...(removed ? { [removed]: prev.positionCounts[removed] - 1 } : {}) },
          totalPositions: prev.totalPositions - 1,
        }));
      return <FeedPointCard point={point} linkedStories={[]} onPointRemoved={onPointRemoved} />;
    }
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Add a story for this point' })).toBeTruthy();
    expect(screen.getByTestId('agree-count-badge').textContent).toBe('2');

    fireEvent.click(screen.getByTestId('agree-group')); // the selected group opens its menu
    fireEvent.click(await screen.findByRole('option', { name: /clear position/i }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull(),
    );
    expect(screen.getByTestId('agree-count-badge').textContent).toBe('1');
  });

  /**
   * Review of the fix delta (MEDIUM, pre-dating P1296). The page's counts contain only the
   * position the point was FETCHED with. Withdrawing after a local change used to report the
   * local position, so the page lowered the wrong bucket — or, with nothing fetched, lowered a
   * position that was never counted and dropped a point someone else still holds.
   */
  function Page({ initial }: { initial: PointWithUserPosition }) {
    const [point, setPoint] = useState(initial);
    // The same local update /feed applies on onPointRemoved, including dropping a point
    // whose last position is withdrawn.
    const onPointRemoved = (_id: string, removed: PositionType | null) =>
      setPoint((prev) => ({
        ...prev,
        positionCounts: { ...prev.positionCounts, ...(removed ? { [removed]: Math.max(0, prev.positionCounts[removed] - 1) } : {}) },
        totalPositions: Math.max(0, prev.totalPositions - 1),
      }));
    if (point.totalPositions === 0) return <div data-testid="point-removed" />;
    return <FeedPointCard point={point} linkedStories={[]} onPointRemoved={onPointRemoved} />;
  }
  const zero = { strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 };
  async function withdrawFrom(group: string) {
    fireEvent.click(screen.getByTestId(`${group}-group`)); // selected group → its menu
    fireEvent.click(await screen.findByRole('option', { name: /clear position/i }));
  }

  it('fetched "agree", changed to "disagree", then withdrew: the page lowers AGREE — the position it counted', async () => {
    render(<MemoryRouter><Page initial={makePoint({
      userPosition: { position: 'agree' }, positionCounts: { ...zero, agree: 2 }, totalPositions: 2,
    } as Partial<PointWithUserPosition>)} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('disagree-group')); // unselected group → picks disagree
    await waitFor(() => expect(screen.getByTestId('agree-count-badge').textContent).toBe('1'));
    await withdrawFrom('disagree');
    await waitFor(() => expect(screen.queryByRole('option', { name: /clear position/i })).toBeNull());
    expect(screen.getByTestId('agree-count-badge').textContent).toBe('1');
    expect(screen.queryByTestId('disagree-count-badge')).toBeNull();
  });

  it('nothing fetched, added "agree", then withdrew: nothing the page counted is lowered, and the point stays', async () => {
    render(<MemoryRouter><Page initial={makePoint({
      userPosition: null, positionCounts: { ...zero, agree: 1 }, totalPositions: 1,
    } as unknown as Partial<PointWithUserPosition>)} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId('agree-group'));
    await waitFor(() => expect(screen.getByTestId('agree-count-badge').textContent).toBe('2'));
    await withdrawFrom('agree');
    await waitFor(() => expect(screen.queryByRole('option', { name: /clear position/i })).toBeNull());
    expect(screen.queryByTestId('point-removed'), 'another person still holds a position on this point').toBeNull();
    expect(screen.getByTestId('agree-count-badge').textContent).toBe('1');
  });

  it('a viewer who HOLDS a position and has no story here sees + Add a story', () => {
    renderPoint(makePoint({ userPosition: { position: 'agree' } } as Partial<PointWithUserPosition>));
    fireEvent.click(screen.getByRole('button', { name: 'Add a story for this point' }));
    expect(navigate).toHaveBeenCalledWith('/create?pointId=point-1');
  });

  it('a viewer who already has a story on the point sees ✓ Your story instead, opening it to READ (P1366: no edit param)', () => {
    renderPoint(
      makePoint({ userPosition: { position: 'agree' } } as Partial<PointWithUserPosition>),
      [linkedStory('s-other', 'someone-else'), linkedStory('s-mine', 'viewer-1')],
    );
    expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Your story' }));
    expect(navigate).toHaveBeenCalledWith('/story/s-mine');
  });

  it('no CTA before the links load — there is no telling yet whether the viewer has a story', () => {
    renderPoint(makePoint({ userPosition: { position: 'agree' } } as Partial<PointWithUserPosition>), undefined);
    expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull();
    expect(screen.queryByText('0 stories')).toBeNull();
  });

  it('no + Add a story for a viewer who holds no position', () => {
    renderPoint();
    expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull();
  });

  it('no contribution CTA for an anonymous reader', () => {
    session.current = null;
    renderPoint(makePoint({ userPosition: { position: 'agree' } } as Partial<PointWithUserPosition>));
    expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Your story' })).toBeNull();
  });

  it('the statement is text-base and clamped at 40 lines', () => {
    renderPoint();
    const statement = screen.getByText('A point statement.').closest('p')!;
    expect(statement.className).toContain('text-base');
    expect(statement.className).toContain('line-clamp-[40]');
  });
});

describe('P1296 — PointCardWithLinks: the shared footer in the profile LIST only', () => {
  const protoPoint = () => ({
    id: 'pt-1',
    text: 'A point on the point page.',
    createdAt: '2026-09-01T00:00:00Z',
    positions: {},
    linkedStoryIds: [],
    visibility: 'public',
  } as unknown as Parameters<typeof PointCardWithLinks>[0]['point']);

  /**
   * Review, 2026-09-11 (HIGH). The point page renders this card WITHOUT `isDetailView`, so a
   * footer switched on `isDetailView` moved the point page onto the list footer — which the spec
   * rules out ("Do NOT change PointCardWithLinks in its detail view"). The switch is now "the
   * caller named a list surface".
   */
  it('with no list surface (the point page, the landing demos) the footer is main\'s: no "0 stories", the old share icon', () => {
    render(<MemoryRouter><PointCardWithLinks point={protoPoint()} linkedStories={[]} /></MemoryRouter>);
    expect(screen.queryByText('0 stories')).toBeNull();
    const share = screen.getByRole('button', { name: 'Share point' });
    expect(share.className).not.toContain('min-w-11');
    fireEvent.click(share);
    expect(track).not.toHaveBeenCalled();
  });

  it('in the profile list: "0 stories", the 44px ⋯ (P1366: share moved into it), and the event carries surface profile', async () => {
    render(<MemoryRouter><PointCardWithLinks point={protoPoint()} linkedStories={[]} shareSurface="profile" /></MemoryRouter>);
    expect(screen.getByText('0 stories')).toBeTruthy();
    const menu = screen.getByRole('button', { name: 'More actions for this point' });
    expect(menu.className).toContain('min-w-11');
    await openShare('point');
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'point', id: 'pt-1', surface: 'profile' });
  });
});
