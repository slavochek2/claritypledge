/**
 * @file p1366-card-footer.test.tsx
 * @description P1366 — list-card footers show their actions (prototype K).
 *
 * Bottom row: a SOLID blue expander (`N stories` / `N points`; on a profile `Their story` /
 * `Your story`), the viewer's one slot link (`+ Add a story` · `✓ Your story` · `+ Add a point`),
 * and an outlined `Details →` on the right. Top-right: a `⋯` menu holding `Share` (and, on the
 * profile's own story card, `Edit` / `Delete` — covered in p1366-profile-story-menu.test.tsx).
 *
 * Asserted on the three list cards: FeedPointCard, FeedStoryCard, and PointCardWithLinks in the
 * profile list (`shareSurface`). The point page / embeds / landing demos pass no `shareSurface`
 * and must keep main's footer — asserted at the bottom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FeedStoryCard } from '@/app/components/feed/feed-story-card';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { PointWithUserPosition, StoryWithAuthor } from '@/app/types';
import { pointsService } from '@/app/data/points-service';

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
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: async () => undefined }),
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
const stories = (n: number) => Array.from({ length: n }, (_, i) => linkedStory(`s-${i}`, `other-${i}`));
const points = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p-${i}`, statement: `Point ${i}` })) as unknown as Parameters<typeof FeedStoryCard>[0]['linkedPoints'];

const withPosition = makePoint({ userPosition: { position: 'agree' } } as Partial<PointWithUserPosition>);

beforeEach(() => {
  cleanup();
  vi.mocked(pointsService.setPosition).mockClear();
  navigate.mockClear();
  track.mockClear();
  session.current = { user: { id: 'viewer-1' } };
});

const renderPoint = (point: PointWithUserPosition, linked: StoryWithAuthor[] | undefined) =>
  render(<MemoryRouter><FeedPointCard point={point} linkedStories={linked} surface="stake" /></MemoryRouter>);
const renderStory = (props: Partial<Parameters<typeof FeedStoryCard>[0]> = {}) =>
  render(<MemoryRouter><FeedStoryCard story={makeStory()} linkedPoints={[]} surface="stake" {...props} /></MemoryRouter>);

/** The expander of prototype K (STORIES_CLASS.i). Solid blue until 2026-10-02, when the founder chose the
 *  light action pill (P1308: one filled primary per screen — a card list is many cards). */
/**
 * P1415 superseded P1366's whole-card hover / focus-within highlight: a list card is no longer a
 * link, so nothing on it may say so — no pointer cursor, no border or shadow change on hover or
 * focus-within. P1423 then removed the left marker bar itself; each caller asserts it is gone.
 */
function expectNoCardHighlight(className: string) {
  const tokens = className.split(/\s+/);
  expect(tokens).not.toContain('cursor-pointer');
  expect(tokens.filter((t) => /^(hover|focus-within):(border|shadow)/.test(t))).toEqual([]);
}

function expectSolidExpander(el: HTMLElement) {
  expect(el.tagName).toBe('BUTTON');
  expect(el.className).toContain('bg-blue-50');
  expect(el.className).toContain('text-blue-700');
  expect(el.className).not.toContain('text-white');
  expect(el.className).toContain('h-10');
}

// ─────────────────────────────────────────────────────────────────────────────
describe('P1366 — feed/stake point card', () => {
  it('N stories is a light blue pill button that expands in place', () => {
    renderPoint(makePoint(), stories(2));
    const expander = screen.getByTestId('feed-point-story-expander');
    expectSolidExpander(expander);
    expect(expander.textContent).toBe('2 stories');
    expect(expander.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(expander);
    expect(expander.getAttribute('aria-expanded')).toBe('true');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a long label can never overflow the expander: the button shrinks (min-w-0), the label truncates, the chevron does not', () => {
    renderPoint(makePoint(), stories(2));
    const expander = screen.getByTestId('feed-point-story-expander');
    expect(expander.className).toContain('min-w-0');
    expect(expander.className).toContain('max-w-full');
    // nowrap lives on the label (via `truncate`), not the button — otherwise it defeats truncation
    expect(expander.className).not.toContain('whitespace-nowrap');
    const label = within(expander).getByText('2 stories');
    expect(label.className).toContain('truncate');
    expect(expander.querySelector('svg')!.getAttribute('class')).toContain('shrink-0');
    // the left group yields to Details
    expect(expander.parentElement!.className).toContain('min-w-0');
    // the accessible name is still the whole label
    expect(screen.getByRole('button', { name: '2 stories', exact: true })).toBe(expander);
  });

  it('singular and three-digit counts', () => {
    const { unmount } = renderPoint(makePoint(), stories(1));
    expect(screen.getByTestId('feed-point-story-expander').textContent).toBe('1 story');
    unmount();
    renderPoint(makePoint(), stories(120));
    expect(screen.getByTestId('feed-point-story-expander').textContent).toBe('120 stories');
  });

  it('zero stories and no slot: plain muted "0 stories", no button', () => {
    renderPoint(makePoint(), []);
    const zero = screen.getByText('0 stories');
    expect(zero.tagName).toBe('SPAN');
    expect(zero.className).toContain('text-muted-foreground');
    expect(screen.queryByTestId('feed-point-story-expander')).toBeNull();
  });

  it('zero stories + a position: "+ Add a story" alone, going to the create form', () => {
    renderPoint(withPosition, []);
    expect(screen.queryByText('0 stories')).toBeNull();
    const add = screen.getByRole('button', { name: 'Add a story for this point' });
    expect(add.textContent).toBe('+ Add a story');
    expect(add.className).toContain('text-blue-700');
    expect(add.className).toContain('h-10');
    fireEvent.click(add);
    expect(navigate).toHaveBeenCalledWith('/create?pointId=point-1');
  });

  it('stories + a position + no story of mine: expander AND "+ Add a story"', () => {
    renderPoint(withPosition, stories(3));
    expect(screen.getByTestId('feed-point-story-expander').textContent).toBe('3 stories');
    expect(screen.getByRole('button', { name: 'Add a story for this point' })).toBeTruthy();
  });

  it('a viewer who wrote a story sees "✓ Your story", which opens it to READ (no edit param)', () => {
    renderPoint(withPosition, [linkedStory('s-other', 'someone-else'), linkedStory('s-mine', 'viewer-1')]);
    expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull();
    const mine = screen.getByRole('button', { name: 'Your story' });
    expect(mine.textContent).toContain('Your story');
    fireEvent.click(mine);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/story/s-mine');
    expect(String(navigate.mock.calls[0]?.[0])).not.toContain('edit');
  });

  it('no position and no story: no slot link at all', () => {
    renderPoint(makePoint(), stories(2));
    expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Your story' })).toBeNull();
  });

  it('anonymous reader: no slot link', () => {
    session.current = null;
    renderPoint(withPosition, []);
    expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull();
  });

  it('while stories load: no count, no slot, the row keeps its height, Details is there', () => {
    renderPoint(withPosition, undefined);
    expect(screen.queryByText('0 stories')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull();
    const placeholder = screen.getByTestId('card-footer-loading');
    expect(placeholder.className).toContain('h-10');
    expect(screen.getByRole('button', { name: 'Details for this point' })).toBeTruthy();
  });

  it('Details → is an outlined, always-visible button that opens the point; no open-in-new icon remains', () => {
    renderPoint(makePoint(), []);
    const footer = screen.getByTestId('point-card-footer');
    const details = within(footer).getByRole('button', { name: 'Details for this point' });
    expect(details.textContent).toContain('Details');
    expect(details.className).toContain('border');
    expect(details.className).toContain('h-10');
    expect(details.className).not.toMatch(/invisible|hidden|opacity-0/);
    fireEvent.click(details);
    expect(navigate).toHaveBeenCalledWith('/point/point-1');
    expect(screen.queryByRole('button', { name: 'Open point' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share point' })).toBeNull();
  });

  it('the ⋯ menu sits in the TOP row, not the footer, and holds Share only', async () => {
    const user = userEvent.setup();
    renderPoint(makePoint(), []);
    const trigger = screen.getByRole('button', { name: 'More actions for this point' });
    expect(within(screen.getByTestId('point-card-footer')).queryByRole('button', { name: 'More actions for this point' })).toBeNull();
    expect(trigger.className).toContain('min-w-11');
    expect(trigger.className).toContain('min-h-11');
    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Share']);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Share opens the share SHEET and fires feed_card_shared with its surface — without navigating', async () => {
    const user = userEvent.setup();
    renderPoint(makePoint(), []);
    await user.click(screen.getByRole('button', { name: 'More actions for this point' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Share' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Share point')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Copy embed code' })).toBeTruthy();
    // the link section and the embed code both carry the point's URL
    expect(within(dialog).getAllByText(/\/point\/point-1/).length).toBeGreaterThan(0);
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'point', id: 'point-1', surface: 'stake' });
    expect(track).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('clicks and Enter inside the share sheet never open the point', async () => {
    const user = userEvent.setup();
    renderPoint(makePoint(), []);
    await user.click(screen.getByRole('button', { name: 'More actions for this point' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Share' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Expanded' }));
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Collapsed' }), { key: 'Enter' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Copied' })).toBeTruthy());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keyboard: Enter opens, arrows move, Escape closes and focus returns to the trigger — no navigation', async () => {
    const user = userEvent.setup();
    renderPoint(makePoint(), []);
    const trigger = screen.getByRole('button', { name: 'More actions for this point' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const item = await screen.findByRole('menuitem', { name: 'Share' });
    await waitFor(() => expect(document.activeElement).toBe(item));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item); // one item: arrows stay on it (loop)
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keyboard: Space opens too, and choosing Share by Enter moves focus INTO the sheet', async () => {
    const user = userEvent.setup();
    renderPoint(makePoint(), []);
    const trigger = screen.getByRole('button', { name: 'More actions for this point' });
    trigger.focus();
    await user.keyboard(' ');
    await screen.findByRole('menuitem', { name: 'Share' });
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(navigate).not.toHaveBeenCalled();
    // closing the sheet hands focus back to the ⋯ trigger
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  /**
   * Found by the layout e2e (flaky Escape): the ⋯ trigger's `More` hint is a Radix tooltip, a
   * separate dismissable layer. With the pointer resting on ⋯ after the click, it opened ON TOP of
   * the open menu and took the Escape meant for the menu (measured in Chrome: 1 tooltip open with
   * the menu, at 320 and 1280). The hint is for a closed menu only.
   */
  it('control: hovering the CLOSED ⋯ shows the `More` hint', async () => {
    const user = userEvent.setup();
    renderPoint(makePoint(), []);
    await user.hover(screen.getByRole('button', { name: 'More actions for this point' }));
    expect((await screen.findByRole('tooltip')).textContent).toContain('More');
  });

  it('the `More` hint never shows while the menu is open, so one Escape closes the menu', async () => {
    const user = userEvent.setup();
    renderPoint(makePoint(), []);
    const trigger = screen.getByRole('button', { name: 'More actions for this point' });
    // What Chrome does: the menu opens on POINTERDOWN, the modal makes <body> inert, and the
    // pointerup lands elsewhere — so MobileTooltip's 500ms long-press timer is never cleared and
    // pops the hint (click-locked for 2s) on top of the open menu.
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    await screen.findByRole('menu');
    fireEvent.pointerUp(document.body, { button: 0, pointerType: 'mouse' });
    await new Promise((r) => setTimeout(r, 700));
    expect(screen.queryByRole('tooltip')).toBeNull();
    // one Escape closes the MENU (no locked hint layer on top of it)
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('an outside click closes the menu', async () => {
    const user = userEvent.setup();
    renderPoint(makePoint(), []);
    await user.click(screen.getByRole('button', { name: 'More actions for this point' }));
    await screen.findByRole('menu');
    // The menu is modal, so <body> is inert (pointer-events: none) while it is open; an outside
    // tap lands on the page root — that is what dismisses it.
    await user.pointer({ keys: '[MouseLeft]', target: document.documentElement });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('the footer row starts at the card\'s left edge (px-4, no text-column indent); the expanded story list keeps its indent', () => {
    renderPoint(makePoint(), stories(2));
    const footer = screen.getByTestId('point-card-footer');
    const tokens = footer.className.split(/\s+/);
    expect(tokens).toContain('px-4');
    expect(tokens.filter((t) => /^(sm:)?p[lr]-/.test(t))).toEqual([]);
    fireEvent.click(screen.getByTestId('feed-point-story-expander'));
    const list = screen.getAllByTestId('quoted-story')[0]!.closest('[class*="sm:pl-[44px]"]');
    expect(list, 'expanded stories keep the statement-column indent (60px = 16 + 44)').toBeTruthy();
  });

  it('no whole-card hover / focus-within highlight (P1415); no left stripe (P1423)', () => {
    renderPoint(makePoint(), []);
    const root = screen.getByRole('article', { name: 'Point: A point statement.' });
    expectNoCardHighlight(root.className);
    expect(root.className).not.toMatch(/\bborder-l-/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('P1366 — feed/stake story card', () => {
  it('N points is a light blue pill button; singular "1 point"', () => {
    const { unmount } = renderStory({ linkedPoints: points(2) });
    const expander = screen.getByTestId('feed-story-point-expander');
    expectSolidExpander(expander);
    expect(expander.textContent).toBe('2 points');
    unmount();
    renderStory({ linkedPoints: points(1) });
    expect(screen.getByTestId('feed-story-point-expander').textContent).toBe('1 point');
  });

  it('zero points, not the author: plain "0 points", no link', () => {
    renderStory({ linkedPoints: [], currentUserId: 'viewer-1' });
    expect(screen.getByText('0 points').tagName).toBe('SPAN');
    expect(screen.queryByRole('button', { name: 'Add a point to this story' })).toBeNull();
  });

  it('zero points, the author: "+ Add a point" alone, to the add-point form', () => {
    renderStory({ linkedPoints: [], currentUserId: 'author-1' });
    expect(screen.queryByText('0 points')).toBeNull();
    const add = screen.getByRole('button', { name: 'Add a point to this story' });
    expect(add.textContent).toBe('+ Add a point');
    expect(add.className).toContain('text-blue-700');
    fireEvent.click(add);
    expect(navigate).toHaveBeenCalledWith('/story/story-1?addPoint=true');
  });

  it('the author\'s "+ Add a point" does not wait for the links: shown while they load (and if their fetch fails)', () => {
    renderStory({ linkedPoints: undefined, currentUserId: 'author-1' });
    expect(screen.getByRole('button', { name: 'Add a point to this story' })).toBeTruthy();
    // the count still waits — "not loaded" must not read as "0 points"
    expect(screen.queryByText('0 points')).toBeNull();
    expect(screen.queryByTestId('feed-story-point-expander')).toBeNull();
    expect(screen.getByTestId('card-footer-loading').className).toContain('h-10');
  });

  it('points + the author: expander and "+ Add a point"', () => {
    renderStory({ linkedPoints: points(2), currentUserId: 'author-1' });
    expect(screen.getByTestId('feed-story-point-expander').textContent).toBe('2 points');
    expect(screen.getByRole('button', { name: 'Add a point to this story' })).toBeTruthy();
  });

  it('Details → opens the story; no open-in-new icon', () => {
    renderStory();
    fireEvent.click(within(screen.getByTestId('story-card-footer')).getByRole('button', { name: 'Details for this story' }));
    expect(navigate).toHaveBeenCalledWith('/story/story-1');
    expect(screen.queryByRole('button', { name: 'Open story' })).toBeNull();
  });

  it("the author's own card on the feed gets Share ONLY — no Edit, no Delete", async () => {
    const user = userEvent.setup();
    renderStory({ currentUserId: 'author-1' });
    await user.click(screen.getByRole('button', { name: 'More actions for this story' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Share']);
  });

  it('Share opens the sheet and fires feed_card_shared with its surface', async () => {
    const user = userEvent.setup();
    renderStory();
    await user.click(screen.getByRole('button', { name: 'More actions for this story' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Share' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Share story')).toBeTruthy();
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'story', id: 'story-1', surface: 'stake' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('the surface defaults to feed', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><FeedStoryCard story={makeStory()} linkedPoints={[]} /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'More actions for this story' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Share' }));
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'story', id: 'story-1', surface: 'feed' });
  });

  it('a long author name truncates beside the ⋯ instead of pushing it off the card', () => {
    renderStory({ story: makeStory({ authorName: 'Bartholomew Alexandria Featherstonehaugh-Wolfeschlegelsteinhausen' }) });
    const name = screen.getByText('Bartholomew Alexandria Featherstonehaugh-Wolfeschlegelsteinhausen');
    expect(name.tagName).toBe('BUTTON');
    expect(name.className).toContain('truncate');
    const trigger = screen.getByRole('button', { name: 'More actions for this story' });
    expect(trigger.closest('[role="presentation"]')!.className).toContain('shrink-0');
  });

  it('the footer row starts at the card\'s left edge (px-4, no text-column indent)', () => {
    renderStory({ linkedPoints: points(2) });
    const footer = screen.getByTestId('story-card-footer');
    const tokens = footer.className.split(/\s+/);
    expect(tokens).toContain('px-4');
    expect(tokens.filter((t) => /^(sm:)?p[lr]-/.test(t))).toEqual([]);
  });

  it('no whole-card hover / focus-within highlight (P1415); no left stripe (P1423)', () => {
    renderStory();
    const root = screen.getByRole('article', { name: 'Story by Test Author' });
    expectNoCardHighlight(root.className);
    expect(root.className).not.toMatch(/\bborder-l-/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('P1366 — PointCardWithLinks in the profile list', () => {
  const protoPoint = (positions: Record<string, { position: string }> = {}) => ({
    id: 'pt-1',
    text: 'A point on a profile.',
    createdAt: '2026-09-01T00:00:00Z',
    positions,
    linkedStoryIds: [],
    visibility: 'public',
  } as unknown as Parameters<typeof PointCardWithLinks>[0]['point']);
  const ownerStory = (authorId: string) => ({
    id: 'os-1', authorId, text: 'Owner story', createdAt: '2026-09-01T00:00:00Z',
    visibility: 'public', linkedPointIds: ['pt-1'], understoodCount: 0,
  } as unknown as NonNullable<Parameters<typeof PointCardWithLinks>[0]['linkedStories']>[number]);
  const owner = { id: 'owner-1', name: 'Maya Rivera', position: 'agree' as const };

  type Props = Partial<Parameters<typeof PointCardWithLinks>[0]>;
  const renderProfile = (props: Props) =>
    render(<MemoryRouter><PointCardWithLinks point={protoPoint()} shareSurface="profile" profileOwner={owner} {...props} /></MemoryRouter>);

  // FOUNDER DECISION 2026-09-29: `Their story` (was `<First>'s story`); own profile keeps `Your story`.
  it("someone else's profile: the expander reads 'Their story' — whose, without the name, no count", () => {
    renderProfile({ linkedStories: [ownerStory('owner-1')], currentUserId: 'viewer-1' });
    const expander = screen.getByRole('button', { name: 'Their story', exact: true });
    expect(screen.queryByText(/Maya/)).not.toBeNull(); // the owner's name is still on the card, in the owner row
    expect(screen.queryByRole('button', { name: "Maya's story" })).toBeNull();
    expectSolidExpander(expander);
    expect(expander.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/1 story/)).toBeNull();
    fireEvent.click(expander);
    expect(expander.getAttribute('aria-expanded')).toBe('true');
    expect(navigate).not.toHaveBeenCalled();
  });

  it("one's own profile: the expander reads 'Your story', and no ✓ Your story link is added", () => {
    renderProfile({
      point: protoPoint({ 'owner-1': { position: 'agree' } }),
      linkedStories: [ownerStory('owner-1')],
      currentUserId: 'owner-1',
      viewerStoryCount: 1,
    });
    expectSolidExpander(screen.getByRole('button', { name: 'Your story' }));
    expect(screen.getAllByRole('button', { name: 'Your story' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull();
  });

  it('the owner has no story here: no expander and no count — `0 stories` would read as the point\'s total', () => {
    renderProfile({ linkedStories: [], currentUserId: 'viewer-1' });
    expect(screen.queryByRole('button', { name: 'Their story', exact: true })).toBeNull();
    expect(screen.queryByText('0 stories')).toBeNull();
    expect(screen.getByRole('button', { name: 'Details for this point' })).toBeTruthy();
  });

  it('the label never depends on the name: an empty or very long owner name still reads "Their story"', () => {
    for (const name of ['', '   ', 'Maximiliana Konstantinopoulou-Vandenberghe']) {
      const { unmount } = renderProfile({ profileOwner: { ...owner, name }, linkedStories: [ownerStory('owner-1')], currentUserId: 'viewer-1' });
      expectSolidExpander(screen.getByRole('button', { name: 'Their story', exact: true }));
      unmount();
    }
  });

  it("someone else's profile, I wrote a story here: ✓ Your story opens it to read", () => {
    renderProfile({
      point: protoPoint({ 'viewer-1': { position: 'agree' } }),
      linkedStories: [ownerStory('owner-1')],
      currentUserId: 'viewer-1',
      viewerStoryCount: 1,
      viewerStoryId: 'vs-1',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Your story' }));
    expect(navigate).toHaveBeenCalledWith('/story/vs-1');
    expect(screen.queryByRole('button', { name: 'Add a story for this point' })).toBeNull();
  });

  it("someone else's profile, I hold a position and have no story: + Add a story (it used to show on one's own profile only)", () => {
    renderProfile({
      point: protoPoint({ 'viewer-1': { position: 'disagree' } }),
      linkedStories: [],
      currentUserId: 'viewer-1',
      viewerStoryCount: 0,
    });
    const add = screen.getByRole('button', { name: 'Add a story for this point' });
    expect(add.textContent).toBe('+ Add a story');
    expect(screen.queryByText('0 stories')).toBeNull();
    fireEvent.click(add);
    expect(navigate).toHaveBeenCalledWith('/create?pointId=pt-1');
  });

  it("one's own profile with a position and no story: + Add a story", () => {
    renderProfile({
      point: protoPoint({ 'owner-1': { position: 'agree' } }),
      linkedStories: [],
      currentUserId: 'owner-1',
      viewerStoryCount: 0,
    });
    expect(screen.getByRole('button', { name: 'Add a story for this point' })).toBeTruthy();
  });

  it('the ⋯ joins the owner row, holds Share, and Share fires surface profile', async () => {
    const user = userEvent.setup();
    renderProfile({ linkedStories: [], currentUserId: 'viewer-1' });
    const trigger = screen.getByRole('button', { name: 'More actions for this point' });
    // same row as the owner's name
    expect(trigger.closest('[data-testid="point-owner-row"]')).toBeTruthy();
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Share' }));
    await screen.findByRole('dialog');
    expect(track).toHaveBeenCalledWith('feed_card_shared', { type: 'point', id: 'pt-1', surface: 'profile' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("the owner's name truncates, the ⋯ never shrinks", () => {
    renderProfile({
      profileOwner: { ...owner, name: 'Maximiliana Konstantinopoulou-Vandenberghe' },
      linkedStories: [],
      currentUserId: 'viewer-1',
    });
    const name = screen.getByText('Maximiliana Konstantinopoulou-Vandenberghe');
    expect(name.className).toContain('truncate');
    const trigger = screen.getByRole('button', { name: 'More actions for this point' });
    expect(trigger.closest('[role="presentation"]')!.className).toContain('shrink-0');
  });

  it('own profile (no quote row): the ⋯ still sits top-right, above the footer', () => {
    renderProfile({ point: protoPoint({ 'owner-1': { position: 'agree' } }), linkedStories: [], currentUserId: 'owner-1' });
    const trigger = screen.getByRole('button', { name: 'More actions for this point' });
    expect(trigger.closest('[data-testid="point-owner-row"]')).toBeTruthy();
  });

  it('Details → opens the point; no open-in-new icon and no footer share icon', () => {
    renderProfile({ linkedStories: [], currentUserId: 'viewer-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Details for this point' }));
    expect(navigate).toHaveBeenCalledWith('/point/pt-1');
    expect(screen.queryByRole('button', { name: 'Open point' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share point' })).toBeNull();
  });

  /**
   * FOUNDER DECISION 2026-09-28 (after the /tree placement demo): on someone ELSE's profile the
   * bottom row leaves the grey quote box and runs the card's full width — the same card-level row
   * the own-profile card has. Inside the box it had only 249px at 375, and `Maya's story` +
   * `+ Add a story` + `Details →` needs ~331px.
   */
  it("someone else's profile: the footer row is a card-level row, NOT inside the grey quote box", () => {
    const { container } = renderProfile({ linkedStories: [ownerStory('owner-1')], currentUserId: 'viewer-1' });
    const root = container.querySelector('article')!; // P1415: the list card root
    const quoteBox = root.querySelector('.bg-gray-50')!;
    expect(quoteBox).toBeTruthy(); // the quote pattern is what renders here
    const details = screen.getByRole('button', { name: 'Details for this point', exact: true });
    expect(quoteBox.contains(details)).toBe(false);
    // the row wrapper is a direct child of the card root, with the plain branch's classes
    const row = details.closest('[role="presentation"]')!;
    expect(row.parentElement).toBe(root);
    // FOUNDER DECISION 2026-09-29: the row starts at the card's left edge (in line with the
    // avatar), mirroring Details → flush right — `px-4`, no text-column indent.
    expect(row.className).toBe('px-4 py-2.5 border-t border-border');
    // exactly one footer
    expect(screen.getAllByRole('button', { name: 'Details for this point', exact: true })).toHaveLength(1);
  });

  it("one's own profile (plain branch): the same card-level row", () => {
    const { container } = renderProfile({
      point: protoPoint({ 'owner-1': { position: 'agree' } }),
      linkedStories: [ownerStory('owner-1')],
      currentUserId: 'owner-1',
    });
    const root = container.querySelector('article')!; // P1415: the list card root
    const row = screen.getByRole('button', { name: 'Details for this point', exact: true }).closest('[role="presentation"]')!;
    expect(row.parentElement).toBe(root);
    // FOUNDER DECISION 2026-09-29: the row starts at the card's left edge (in line with the
    // avatar), mirroring Details → flush right — `px-4`, no text-column indent.
    expect(row.className).toBe('px-4 py-2.5 border-t border-border');
  });

  it('no whole-card hover / focus-within highlight (P1415)', () => {
    const { container } = renderProfile({ linkedStories: [], currentUserId: 'viewer-1' });
    const root = container.querySelector('article')!;
    expectNoCardHighlight(root.className);
  });

  it('a PRIVATE point card stays visibly private without a stripe (P1423: muted background)', () => {
    const privatePoint = { ...protoPoint(), visibility: 'private' } as unknown as Parameters<typeof PointCardWithLinks>[0]['point'];
    const { container } = renderProfile({ point: privatePoint, linkedStories: [], currentUserId: 'viewer-1' });
    const root = container.querySelector('article')!;
    expect(root.className.split(/\s+/)).toContain('bg-muted/60');
    expect(root.className).not.toMatch(/\bborder-l-/);
    expectNoCardHighlight(root.className);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('P1366 — the ⋯ menu is MODAL: a tap outside only dismisses it', () => {
  /**
   * Review finding (HIGH). A non-modal menu let the tap that dismisses it ALSO land on whatever
   * was under it — the card (navigation) or a position button (a data write). A modal Radix menu
   * makes the rest of the page inert to the pointer while it is open (`pointer-events: none` on
   * <body>), exactly as a browser hit-tests it; user-event honours that and refuses the click, so
   * the assertions below are the browser's behaviour, not a jsdom artefact. The dismissing tap
   * then lands on the page root, which is what closes the menu.
   */
  async function openMenu(user: ReturnType<typeof userEvent.setup>, type: 'point' | 'story') {
    await user.click(screen.getByRole('button', { name: `More actions for this ${type}` }));
    await screen.findByRole('menu');
  }
  async function tapOutside(user: ReturnType<typeof userEvent.setup>) {
    await user.pointer({ keys: '[MouseLeft]', target: document.documentElement });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  }

  it('point card: tapping the card body to dismiss never navigates', async () => {
    const user = userEvent.setup();
    renderPoint(makePoint(), []);
    await openMenu(user, 'point');
    expect(document.body.style.pointerEvents).toBe('none');
    await expect(user.click(screen.getByText('A point statement.'))).rejects.toThrow(/pointer-events/);
    await tapOutside(user);
    expect(navigate).not.toHaveBeenCalled();
    expect(document.body.style.pointerEvents).not.toBe('none');
  });

  it('point card: tapping a position button to dismiss never writes a position', async () => {
    const user = userEvent.setup();
    renderPoint(makePoint(), []);
    const position = screen.getByTestId('disagree-group');
    await openMenu(user, 'point');
    await expect(user.click(position)).rejects.toThrow(/pointer-events/);
    await tapOutside(user);
    expect(vi.mocked(pointsService.setPosition)).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    // …and once the menu is gone the page is live again: the same tap now takes a position
    await user.click(position);
    await waitFor(() => expect(vi.mocked(pointsService.setPosition)).toHaveBeenCalledTimes(1));
  });

  it('story card: tapping the card body to dismiss never navigates', async () => {
    const user = userEvent.setup();
    renderStory();
    await openMenu(user, 'story');
    await expect(user.click(screen.getByText('A story body.'))).rejects.toThrow(/pointer-events/);
    await tapOutside(user);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('menu → Share → close the sheet, twice: the sheet opens only after the menu closed, and <body> is never left inert', async () => {
    const user = userEvent.setup();
    renderPoint(makePoint(), []);
    const trigger = screen.getByRole('button', { name: 'More actions for this point' });
    for (let i = 0; i < 2; i++) {
      await user.click(trigger);
      await user.click(await screen.findByRole('menuitem', { name: 'Share' }));
      const sheet = await screen.findByRole('dialog');
      expect(screen.queryByRole('menu')).toBeNull();
      await user.click(within(sheet).getByRole('button', { name: /close/i }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(document.body.style.pointerEvents).not.toBe('none'));
    }
    expect(track).toHaveBeenCalledTimes(2);
    expect(navigate).not.toHaveBeenCalled();
    // the page is usable afterwards
    await user.click(screen.getByRole('button', { name: 'Details for this point' }));
    expect(navigate).toHaveBeenCalledWith('/point/point-1');
  });

  it('menu → Share → Escape: focus returns to the ⋯ and <body> is live', async () => {
    const user = userEvent.setup();
    renderStory();
    const trigger = screen.getByRole('button', { name: 'More actions for this story' });
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Share' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.body.style.pointerEvents).not.toBe('none');
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('P1366 — surfaces OUT of scope keep main\'s footer', () => {
  const protoPoint = () => ({
    id: 'pt-2', text: 'Detail-page point.', createdAt: '2026-09-01T00:00:00Z',
    positions: {}, linkedStoryIds: [], visibility: 'public',
  } as unknown as Parameters<typeof PointCardWithLinks>[0]['point']);

  it('no list surface (point page / demos): old share icon + "Open point", no ⋯, no Details, old hover', () => {
    const { container } = render(<MemoryRouter><PointCardWithLinks point={protoPoint()} linkedStories={[]} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Share point' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open point' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Details/ })).toBeNull();
    const root = container.querySelector('[role="button"]')!;
    expect(root.className).toContain('hover:border-slate-300');
    expect(root.className).not.toMatch(/focus-within:border-/);
  });

  it('embed (?embed=true): still the open button, no ⋯, no Details', () => {
    render(
      <MemoryRouter initialEntries={['/point/pt-2?embed=true']}>
        <PointCardWithLinks point={protoPoint()} linkedStories={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Open point' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Details/ })).toBeNull();
  });

  it("embed of someone's point (quote pattern, no list surface): main's footer stays INSIDE the quote box", () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/point/pt-2?embed=true&from=owner-7']}>
        <PointCardWithLinks
          point={protoPoint()}
          linkedStories={[]}
          profileOwner={{ id: 'owner-7', name: 'Embed Owner', position: 'agree' }}
          currentUserId="viewer-7"
        />
      </MemoryRouter>,
    );
    const quoteBox = container.querySelector('.bg-gray-50')!;
    expect(quoteBox).toBeTruthy();
    const open = screen.getByRole('button', { name: 'Open point' });
    expect(quoteBox.contains(open)).toBe(true);
    expect(screen.queryByRole('button', { name: /Details/ })).toBeNull();
  });

  it('live-session mode: the plain grey count, no ⋯, no Details', () => {
    render(
      <MemoryRouter>
        <PointCardWithLinks
          point={protoPoint()}
          linkedStories={[{ id: 'x', authorId: 'a', text: 't', createdAt: '2026-09-01T00:00:00Z', visibility: 'public', linkedPointIds: [], understoodCount: 0 } as never]}
          liveSessionMode
          disableNavigation
        />
      </MemoryRouter>,
    );
    const count = screen.getByRole('button', { name: 'Expand linked stories' });
    expect(count.className).not.toContain('bg-blue-600');
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Details/ })).toBeNull();
  });
});
