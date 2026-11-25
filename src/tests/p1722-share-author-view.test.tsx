/**
 * P1722 fix round C5: when the viewer IS the point's author, the chat card's ⋯ still offers Share and nothing else (no Edit, Delete, report or story items). The card menu
 * has no role-dependent item (checked in card-footer-controls.tsx); this renders it as the author and as a stranger and compares them.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedPointCard } from '@/app/components/feed/feed-point-card';
import { AttachmentCard } from '@/app/pages/chat/AttachmentCard';
import type { PointWithUserPosition } from '@/app/types';

const attachment = vi.hoisted(() => ({ item: null as unknown }));
const viewer = vi.hoisted(() => ({ id: 'author-1' }));
vi.mock('@/app/data/chat-ui-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/chat-ui-helpers')>()),
  loadAttachment: vi.fn(async () => attachment.item),
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: viewer.id } }, user: { id: viewer.id } }) }));
vi.mock('@/app/contexts/agent-accounts-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/agent-accounts-context')>()),
  useAgentAccountIds: () => ({ isAgentAccountId: () => false, operatorNameFor: () => null, isLoading: false }),
}));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: async () => undefined }),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { setPosition: vi.fn(async () => undefined) } }));

const point = (): PointWithUserPosition => ({
  id: 'point-1', statement: 'A point statement.', tags: [], visibility: 'public', firstValidatorId: 'author-1',
  positionCounts: { strongly_agree: 0, agree: 1, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0 },
  totalPositions: 1, userPosition: null,
}) as unknown as PointWithUserPosition;

const openMenu = () => fireEvent.pointerDown(screen.getByRole('button', { name: /More actions for this point/ }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
const itemNames = async () => {
  await screen.findByRole('menuitem', { name: 'Share' });
  return screen.getAllByRole('menuitem').map((i) => i.textContent?.trim());
};
afterEach(cleanup);

describe.each([['the point author', 'author-1'], ['a stranger', 'someone-else']])('%s viewing a public point card in a chat', (_who, id) => {
  it('FeedPointCard shareOnly (with the author passed as owner): the ⋯ menu is exactly Share', async () => {
    viewer.id = id;
    render(<MemoryRouter><FeedPointCard point={point()} shareOnly owner={{ id: 'author-1', name: 'Ada', slug: 'ada', isAgent: false } as never} /></MemoryRouter>);
    openMenu();
    expect(await itemNames()).toEqual(['Share']);
  });

  it('AttachmentCard (the chat card): the ⋯ menu is exactly Share', async () => {
    viewer.id = id;
    attachment.item = { kind: 'point', id: 'point-1', title: 't', tags: [], point: point() };
    render(<MemoryRouter><AttachmentCard kind="point" id="point-1" viewerId={id} compact={false} /></MemoryRouter>);
    await screen.findByTestId('attachment-point');
    openMenu();
    expect(await itemNames()).toEqual(['Share']);
  });
});
