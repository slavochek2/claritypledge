/**
 * @file p1296-card-footer.test.tsx
 * @description P1296 item 1 — one footer on every story and point card: count and
 * contribution CTA left; share (the sheet), then open-in-new, right; 44px icons.
 *
 * Asserted on the two feed cards, which render on /feed and /stake. The profile's cards take
 * the same controls from the same shared file (`card-footer-controls.tsx`); their owner flows
 * are covered by the profile suites.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import type { PointWithUserPosition, StoryWithAuthor } from '@/app/types';

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

beforeEach(() => {
  cleanup();
  navigate.mockClear();
  track.mockClear();
  session.current = { user: { id: 'viewer-1' } };
});

describe('P1296 — the story card footer', () => {
  const renderStory = (props: Partial<Parameters<typeof FeedStoryCard>[0]> = {}) =>
    render(<MemoryRouter><FeedStoryCard story={makeStory()} linkedPoints={[]} surface="stake" {...props} /></MemoryRouter>);

  it('carries share, then open-in-new, both 44px, INSIDE the footer row', () => {
    renderStory();
    const footer = screen.getByTestId('story-card-footer');
    const share = within(footer).getByRole('button', { name: 'Share story' });
    const open = within(footer).getByRole('button', { name: 'Open story' });
    for (const el of [share, open]) {
      expect(el.className).toContain('min-w-11');
      expect(el.className).toContain('min-h-11');
    }
    // share precedes open-in-new in document (and focus) order
    expect(share.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // and nothing share-like floats in the body above the divider any more
    expect(screen.getAllByRole('button', { name: 'Share story' })).toHaveLength(1);
  });

  it('share opens the SHEET (link + embed) and fires feed_card_shared with its surface — and does not navigate', () => {
    renderStory();
    fireEvent.click(screen.getByRole('button', { name: 'Share story' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Share story', { selector: 'h2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy embed code' })).toBeTruthy();
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'story', id: 'story-1', surface: 'stake' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('the surface defaults to feed', () => {
    render(<MemoryRouter><FeedStoryCard story={makeStory()} linkedPoints={[]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Share story' }));
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'story', id: 'story-1', surface: 'feed' });
  });

  it('open-in-new goes to the story', () => {
    renderStory();
    fireEvent.click(screen.getByRole('button', { name: 'Open story' }));
    expect(navigate).toHaveBeenCalledWith('/story/story-1');
  });

  it('Enter on the share button acts on the button, not on the card (no navigation)', () => {
    renderStory();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Share story' }), { key: 'Enter' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("the story's AUTHOR sees + Add point, and it goes to the story's add-point form", () => {
    renderStory({ currentUserId: 'author-1' });
    fireEvent.click(screen.getByRole('button', { name: '+ Add point' }));
    expect(navigate).toHaveBeenCalledWith('/story/story-1?addPoint=true');
  });

  it('anyone else sees no + Add point', () => {
    renderStory({ currentUserId: 'viewer-1' });
    expect(screen.queryByRole('button', { name: '+ Add point' })).toBeNull();
  });

  it('the count waits for the links: nothing while not loaded, "0 points" once loaded and empty', () => {
    const { unmount } = renderStory({ linkedPoints: undefined });
    expect(screen.queryByText('0 points')).toBeNull();
    // ...but the row itself, with its controls, is there from the first paint.
    expect(screen.getByRole('button', { name: 'Share story' })).toBeTruthy();
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

  it('share and open-in-new sit in a FOOTER row, no longer in the position-buttons row', () => {
    renderPoint();
    const footer = screen.getByTestId('point-card-footer');
    expect(within(footer).getByRole('button', { name: 'Share point' })).toBeTruthy();
    expect(within(footer).getByRole('button', { name: 'Open point' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Share point' })).toHaveLength(1);
  });

  it('share fires feed_card_shared with type point and its surface', () => {
    renderPoint();
    fireEvent.click(screen.getByRole('button', { name: 'Share point' }));
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'point', id: 'point-1', surface: 'stake' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a viewer who HOLDS a position and has no story here sees the position-worded + Add your story', () => {
    renderPoint(makePoint({ userPosition: { position: 'agree' } } as Partial<PointWithUserPosition>));
    fireEvent.click(screen.getByRole('button', { name: 'Add your story for this point' }));
    expect(navigate).toHaveBeenCalledWith('/create?pointId=point-1');
  });

  it('a viewer who already has a story on the point sees ✏ your story instead, going to its editor', () => {
    renderPoint(
      makePoint({ userPosition: { position: 'agree' } } as Partial<PointWithUserPosition>),
      [linkedStory('s-other', 'someone-else'), linkedStory('s-mine', 'viewer-1')],
    );
    expect(screen.queryByRole('button', { name: 'Add your story for this point' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit your story' }));
    expect(navigate).toHaveBeenCalledWith('/story/s-mine?edit=true');
  });

  it('no CTA before the links load — there is no telling yet whether the viewer has a story', () => {
    renderPoint(makePoint({ userPosition: { position: 'agree' } } as Partial<PointWithUserPosition>), undefined);
    expect(screen.queryByRole('button', { name: 'Add your story for this point' })).toBeNull();
    expect(screen.queryByText('0 stories')).toBeNull();
  });

  it('no + Add your story for a viewer who holds no position', () => {
    renderPoint();
    expect(screen.queryByRole('button', { name: 'Add your story for this point' })).toBeNull();
  });

  it('no contribution CTA for an anonymous reader', () => {
    session.current = null;
    renderPoint(makePoint({ userPosition: { position: 'agree' } } as Partial<PointWithUserPosition>));
    expect(screen.queryByRole('button', { name: 'Add your story for this point' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit your story' })).toBeNull();
  });

  it('the statement is text-base and clamped at 40 lines', () => {
    renderPoint();
    const statement = screen.getByText('A point statement.').closest('p')!;
    expect(statement.className).toContain('text-base');
    expect(statement.className).toContain('line-clamp-[40]');
  });
});
