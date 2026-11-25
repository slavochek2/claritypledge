/**
 * P1722 item 5: a public point card shown as a chat attachment offers the existing Share (⋯ menu) and only that.
 * A private point, a quoted (compact) card and a story card in a chat offer no Share.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import type { PointWithUserPosition } from '@/app/types';

const attachment = vi.hoisted(() => ({ item: null as unknown }));
vi.mock('@/app/data/chat-ui-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/chat-ui-helpers')>()),
  loadAttachment: vi.fn(async () => attachment.item),
}));

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'viewer-1' } }, user: { id: 'viewer-1' } }) }));
vi.mock('@/app/contexts/agent-accounts-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/agent-accounts-context')>()),
  useAgentAccountIds: () => ({ isAgentAccountId: () => false, operatorNameFor: () => null, isLoading: false }),
}));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: async () => undefined }),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { setPosition: vi.fn(async () => undefined) } }));

const point = (visibility: 'public' | 'private'): PointWithUserPosition => ({
  id: 'point-1', statement: 'A point statement.', tags: [], visibility,
  positionCounts: { strongly_agree: 0, agree: 1, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 },
  totalPositions: 1, userPosition: null,
}) as unknown as PointWithUserPosition;

const more = () => screen.queryByRole('button', { name: /More actions for this point/ });
const show = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
afterEach(cleanup);

describe('FeedPointCard shareOnly (chat attachment)', () => {
  it('a public point keeps its ⋯ menu (Share)', () => {
    show(<FeedPointCard point={point('public')} shareOnly />);
    expect(more()).not.toBeNull();
  });
  it('a private point shows no ⋯ menu', () => {
    show(<FeedPointCard point={point('private')} shareOnly />);
    expect(more()).toBeNull();
  });
  it('a compact (quoted) card shows no menu, public or private', () => {
    show(<FeedPointCard point={point('public')} compact shareOnly />);
    expect(more()).toBeNull();
  });
  it('without the prop the card is unchanged (control)', () => {
    show(<FeedPointCard point={point('private')} />);
    expect(more()).not.toBeNull();
  });
});

// jsdom has no stylesheet, so "hidden by the wrapper's CSS" is read from the wrapper's class: it carries the ⋯-hiding rule or it does not.
const HIDES_MENU = 'More_actions_for_this';
const HIDES_ADD_STORY = 'Add_a_point_to_this_story';

describe('AttachmentCard (rendered, chat attachment)', () => {
  const card = (kind: 'point' | 'story', compact = false) =>
    render(<MemoryRouter><AttachmentCard kind={kind} id="x1" viewerId="viewer-1" compact={compact} /></MemoryRouter>);
  const wrapper = (kind: 'point' | 'story') => screen.findByTestId(`attachment-${kind}`);

  it('a public point: the ⋯ is not hidden, its menu holds Share and not Edit or Delete, and the story invitation stays hidden', async () => {
    attachment.item = { kind: 'point', id: 'x1', title: 't', tags: [], point: point('public') };
    card('point');
    const box = await wrapper('point');
    expect(box.className).not.toContain(HIDES_MENU);
    expect(box.className).toContain(HIDES_ADD_STORY);
    fireEvent.pointerDown(screen.getByRole('button', { name: /More actions for this point/ }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    expect(await screen.findByRole('menuitem', { name: 'Share' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Add a point to this story/ })).toBeNull();
  });

  it('a quoted (compact) private point: no ⋯ menu at all', async () => {
    attachment.item = { kind: 'point', id: 'x1', title: 't', tags: [], point: point('private') };
    card('point', true);
    expect(await wrapper('point')).toBeInTheDocument();
    expect(more()).toBeNull();
  });

  it('a quoted (compact) public point: the wrapper still hides the ⋯ and none renders', async () => {
    attachment.item = { kind: 'point', id: 'x1', title: 't', tags: [], point: point('public') };
    card('point', true);
    const box = await wrapper('point');
    expect(box.className).toContain(HIDES_MENU);
    expect(more()).toBeNull();
  });

  it('a story card: the wrapper hides the ⋯ (no Share)', async () => {
    attachment.item = {
      kind: 'story', id: 'x1', title: 's', tags: [],
      story: { id: 'x1', authorId: 'a1', content: 'A story body.', visibility: 'public', currentVersion: 1, understoodCount: 0, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', tags: [], systemTags: [], authorName: 'Test Author', authorSlug: 'test-author' },
      linkedPoints: [],
    } as never;
    card('story');
    const box = await wrapper('story');
    expect(box.className).toContain(HIDES_MENU);
  });

  it('a private point (non-compact): the wrapper hides the ⋯ (no Share)', async () => {
    attachment.item = { kind: 'point', id: 'x1', title: 't', tags: [], point: point('private') };
    card('point');
    const box = await wrapper('point');
    expect(box.className).toContain(HIDES_MENU);
  });
});
