/**
 * P1631 A9 client: the private-point card (a row for the other person of a 1:1 only), Forward left out of the menu of a known private point, Escape in a menu taken before
 * the page's own listener runs, and the reveal after a publish (the chat or thread address with the card focused).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ positions: vi.fn() }));
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ owner }: { owner?: { id: string; position: string } }) => <div data-testid="feed-point">{owner ? <span data-testid="owner-row">{owner.id}:{owner.position}</span> : null}</div>,
}));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: null }) }));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getPositionsForPoint: h.positions } }));

import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { PrivatePointAttachment } from '@/app/pages/chat/PrivatePointAttachment';
import { isKnownPrivatePoint, notePrivatePoint } from '@/app/pages/chat/private-point-cache';
import { buildMenuItems, type MenuContext } from '@/app/pages/chat/message-menu-items';
import { useMenuBehavior } from '@/app/pages/chat/chat-hooks';
import { useRevealPublished } from '@/app/pages/chat/use-reveal-published';
import type { PointWithUserPosition } from '@/app/types';
import type { ChatMessage } from '@/app/data/chat-service';

const OTHER = 'user-id-other';
const point = { id: 'point-id-1', visibility: 'private', statement: 'a private point' } as unknown as PointWithUserPosition;
const chats = [
  { conversationId: 'c-dm', kind: 'dm', other: { id: OTHER, name: 'Anna Example' } },
  { conversationId: 'c-group', kind: 'group', other: null },
];
const wrap = (children: ReactNode) => (
  <MemoryRouter><ChatContext.Provider value={{ chats } as unknown as ChatContextValue}>{children}</ChatContext.Provider></MemoryRouter>
);
const row = (userId: string) => ({ userId, userName: 'Anna Example', userAvatarUrl: null, userAvatarColor: null, userHasPledged: false, position: 'agree' });

describe('PrivatePointAttachment', () => {
  beforeEach(() => h.positions.mockReset());

  it('a 1:1 where the other person holds a position shows their row', async () => {
    h.positions.mockResolvedValue([row('someone-else'), row(OTHER)]);
    render(wrap(<PrivatePointAttachment point={point} conversationId="c-dm" />));
    expect((await screen.findByTestId('owner-row')).textContent).toBe(`${OTHER}:agree`);
  });

  it('a 1:1 where the other person holds none shows no row', async () => {
    h.positions.mockResolvedValue([row('someone-else')]);
    render(wrap(<PrivatePointAttachment point={point} conversationId="c-dm" />));
    await waitFor(() => expect(h.positions).toHaveBeenCalledWith('point-id-1'));
    expect(screen.queryByTestId('owner-row')).toBeNull();
  });

  it('a group shows no person row and reads no positions', async () => {
    h.positions.mockResolvedValue([row(OTHER)]);
    render(wrap(<PrivatePointAttachment point={point} conversationId="c-group" />));
    expect(screen.getByTestId('feed-point')).toBeTruthy();
    expect(screen.queryByTestId('owner-row')).toBeNull();
    expect(h.positions).not.toHaveBeenCalled();
  });
});

describe('message menu: a private point is never forwarded', () => {
  const server = (attachmentId: string) => ({ id: 'm1', kind: 'message', attachmentKind: 'point', attachmentId, threadRootId: null }) as unknown as ChatMessage;
  const ctx = (s: ChatMessage): MenuContext => ({
    server: s, live: true, privateHere: false, agent: false, mine: false, ownerOnly: false, noCopy: false, voiceNote: false,
    actions: { onReply: vi.fn(), onForward: vi.fn(), onThread: vi.fn(), onClarify: vi.fn() } as unknown as MenuContext['actions'], startEdit: vi.fn(),
  });

  it('Forward is offered for a public point and left out for a known private one', () => {
    expect(buildMenuItems(ctx(server('public-point'))).map((i) => i.key)).toContain('forward');
    notePrivatePoint('private-point');
    expect(isKnownPrivatePoint('private-point')).toBe(true);
    expect(buildMenuItems(ctx(server('private-point'))).map((i) => i.key)).not.toContain('forward');
  });
});

describe('useMenuBehavior: Escape', () => {
  it('closes the menu and marks the event taken, so a document listener that checks defaultPrevented does nothing', () => {
    const onClose = vi.fn();
    const ref = { current: document.createElement('div') };
    const { result } = renderHook(() => useMenuBehavior(ref, onClose));
    const page = vi.fn();
    const listener = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) page(); };
    document.addEventListener('keydown', listener);
    // React's handler runs on the target before the event bubbles to the document
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    ref.current.addEventListener('keydown', (e) => result.current(e as unknown as { key: string; preventDefault: () => void }));
    document.body.appendChild(ref.current);
    ref.current.dispatchEvent(ev);
    document.removeEventListener('keydown', listener);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    expect(page).not.toHaveBeenCalled();
  });
});

describe('useRevealPublished', () => {
  function Where() {
    const l = useLocation();
    return <span data-testid="where">{l.pathname}{l.search}</span>;
  }
  const mount = (initial: string) => {
    let reveal: ReturnType<typeof useRevealPublished> = () => undefined;
    function Probe() {
      reveal = useRevealPublished();
      return null;
    }
    render(<MemoryRouter initialEntries={[initial]}><Probe /><Where /></MemoryRouter>);
    return (r: Parameters<typeof reveal>[0]) => act(() => reveal(r));
  };

  it('a card in the main chat: the chat address with the message focused, the panel parameter gone', () => {
    const go = mount('/chats/c/c-dm?clarify=root-9');
    go({ status: 'published', messageId: 'm9', conversationId: 'c-dm', threadRootId: null });
    expect(screen.getByTestId('where').textContent).toBe('/chats/c/c-dm?m=m9');
  });

  it('a card in a thread: the thread address with the message focused', () => {
    const go = mount('/chats/c/c-dm?clarify=root-9');
    go({ status: 'already', messageId: 'm9', conversationId: 'c-dm', threadRootId: 't1' });
    expect(screen.getByTestId('where').textContent).toBe('/chats/c/c-dm/t/t1?m=m9');
  });

  it('a refusal moves nowhere', () => {
    const go = mount('/chats/c/c-dm?clarify=root-9');
    go({ status: 'refused', code: 'not_available' });
    expect(screen.getByTestId('where').textContent).toBe('/chats/c/c-dm?clarify=root-9');
  });
});
