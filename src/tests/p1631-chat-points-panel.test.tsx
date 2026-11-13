/**
 * P1631 "Points in this chat (N)": the menu item (hidden at 0, unknown and in the Mirror), the panel (the chat's own card per point, newest first),
 * a tap on a card's body revealing the message in the chat, and "My rounds" unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ list: vi.fn(), listeners: [] as ((e: unknown) => void)[] }));
vi.mock('@/app/data/chat-points-service', () => ({ listChatPoints: h.list }));
vi.mock('@/app/data/chat-round-threads', () => ({
  getMyRoundThreads: vi.fn().mockResolvedValue([{ rootMessageId: 'r1', roundNo: 1, title: 'Round 1 · A & B', createdAt: 'x' }]),
}));
vi.mock('@/app/pages/chat/ChatTranscribe', () => ({
  ChatTranscribe: ({ children }: { children: (t: undefined) => ReactNode }) => <>{children(undefined)}</>,
  TranscribeMenuItem: () => null,
}));
vi.mock('@/app/pages/chat/EventRoomLink', () => ({ EventRoomLink: () => null }));
vi.mock('@/app/pages/chat/AttachmentCard', () => ({
  AttachmentCard: ({ kind, id }: { kind: string; id: string }) => (
    <div data-testid="card" data-kind={kind} data-id={id}>
      <button type="button">Agree</button>
      <span>body {id}</span>
    </div>
  ),
}));

import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { ConversationTop } from '@/app/pages/chat/MyRounds';
import { PointsPanel } from '@/app/pages/chat/PointsPanel';
import type { ChatSummary } from '@/app/data/chat-service';
import type { HeaderActions } from '@/app/pages/chat/ConversationHeader';

const ctx = {
  userId: 'viewer-id-1',
  chats: [],
  subscribe: (fn: (e: unknown) => void) => {
    h.listeners.push(fn);
    return () => undefined;
  },
} as unknown as ChatContextValue;
const actions = { onBack: vi.fn(), onArchive: vi.fn(), onMarkUnread: vi.fn(), onBlock: vi.fn(), onUnblock: vi.fn(), onRename: vi.fn() } as HeaderActions;
const chat = (kind: string) => ({ conversationId: 'c1', kind, title: 'T', other: null, event: kind === 'event' ? { title: 'E', slug: 'e', datetime: '2026-01-01T00:00:00Z' } : null }) as unknown as ChatSummary;
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ pointId: `p${i}`, messageId: `m${i}`, sharedBy: 'u', createdAt: `2026-01-0${i + 1}` }));

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}{l.search}</div>;
}
const wrap = (node: ReactNode, at = '/chats/c/c1') => (
  <MemoryRouter initialEntries={[at]}>
    <ChatContext.Provider value={ctx}>{node}<Where /></ChatContext.Provider>
  </MemoryRouter>
);
async function openMenu() {
  const trigger = screen.getByLabelText('More');
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
}

describe('Points in this chat menu item', () => {
  beforeEach(() => {
    h.list.mockReset();
    h.listeners.length = 0;
  });

  it('shows N and opens the panel address', async () => {
    h.list.mockResolvedValue(rows(2));
    render(wrap(<ConversationTop summary={chat('group')} blocked={false} actions={actions} />));
    await waitFor(() => expect(h.list).toHaveBeenCalledWith('c1'));
    await act(async () => { await Promise.resolve(); });
    await openMenu();
    const item = await screen.findByTestId('points-in-chat-item');
    expect(item.textContent).toContain('Points in this chat (2)');
    fireEvent.click(item);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/chats/c/c1?points=1'));
  });

  it('is hidden at 0', async () => {
    h.list.mockResolvedValue([]);
    render(wrap(<ConversationTop summary={chat('dm')} blocked={false} actions={actions} />));
    await waitFor(() => expect(h.list).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    await openMenu();
    await screen.findByText('Mark as unread');
    expect(screen.queryByTestId('points-in-chat-item')).toBeNull();
  });

  it('is hidden while the count is unknown', async () => {
    h.list.mockReturnValue(new Promise(() => undefined));
    render(wrap(<ConversationTop summary={chat('dm')} blocked={false} actions={actions} />));
    await openMenu();
    await screen.findByText('Mark as unread');
    expect(screen.queryByTestId('points-in-chat-item')).toBeNull();
  });

  it('is hidden in the Mirror and reads nothing there', async () => {
    h.list.mockResolvedValue(rows(3));
    render(wrap(<ConversationTop summary={chat('mirror')} blocked={false} actions={actions} />));
    await openMenu();
    await screen.findByText('Mark as unread');
    expect(screen.queryByTestId('points-in-chat-item')).toBeNull();
    expect(h.list).not.toHaveBeenCalled();
  });

  it('refreshes N when a point card arrives in this chat', async () => {
    h.list.mockResolvedValueOnce(rows(1)).mockResolvedValue(rows(2));
    render(wrap(<ConversationTop summary={chat('group')} blocked={false} actions={actions} />));
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(1));
    await act(async () => {
      h.listeners.forEach((fn) => fn({ type: 'message', event: { message: { attachmentKind: 'point', conversationId: 'c1' } } }));
    });
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(2));
    await act(async () => { await Promise.resolve(); });
    await openMenu();
    expect((await screen.findByTestId('points-in-chat-item')).textContent).toContain('(2)');
  });

  it('reloads when a point card of this chat is deleted, and N drops', async () => {
    h.list.mockResolvedValueOnce(rows(2)).mockResolvedValue(rows(1));
    render(wrap(<ConversationTop summary={chat('group')} blocked={false} actions={actions} />));
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(1));
    await act(async () => {
      h.listeners.forEach((fn) => fn({ type: 'message', event: { type: 'UPDATE', message: { attachmentKind: 'point', isDeleted: true, conversationId: 'c1' } } }));
    });
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(2));
    await act(async () => { await Promise.resolve(); });
    await openMenu();
    expect((await screen.findByTestId('points-in-chat-item')).textContent).toContain('(1)');
  });

  it('a deletion in another chat does not reload', async () => {
    h.list.mockResolvedValue(rows(1));
    render(wrap(<ConversationTop summary={chat('group')} blocked={false} actions={actions} />));
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(1));
    await act(async () => {
      h.listeners.forEach((fn) => fn({ type: 'message', event: { type: 'UPDATE', message: { attachmentKind: 'point', isDeleted: true, conversationId: 'other' } } }));
    });
    expect(h.list).toHaveBeenCalledTimes(1);
  });

  it('is hidden when the read fails', async () => {
    h.list.mockRejectedValue(new Error('boom'));
    render(wrap(<ConversationTop summary={chat('dm')} blocked={false} actions={actions} />));
    await waitFor(() => expect(h.list).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    await openMenu();
    await screen.findByText('Mark as unread');
    expect(screen.queryByTestId('points-in-chat-item')).toBeNull();
  });

  it('leaves "My rounds" exactly as it was', async () => {
    h.list.mockResolvedValue(rows(1));
    render(wrap(<ConversationTop summary={chat('event')} blocked={false} actions={actions} />));
    await act(async () => { await Promise.resolve(); });
    await openMenu();
    expect((await screen.findByTestId('my-rounds-heading')).textContent).toBe('My rounds');
    expect(screen.getAllByTestId('my-rounds-item')).toHaveLength(1);
  });
});

describe('PointsPanel', () => {
  beforeEach(() => {
    h.list.mockReset(); // braces: a returned function would run as the hook's teardown
  });

  it('lists the points newest first, each as the chat card', async () => {
    h.list.mockResolvedValue(rows(3));
    render(wrap(<PointsPanel conversationId="c1" onClose={vi.fn()} />, '/chats/c/c1?points=1'));
    const cards = await screen.findAllByTestId('card');
    expect(cards.map((c) => c.getAttribute('data-id'))).toEqual(['p2', 'p1', 'p0']);
    expect(cards.every((c) => c.getAttribute('data-kind') === 'point')).toBe(true);
    expect(screen.getByText('Points in this chat')).toBeTruthy();
  });

  it('a tap on a card body reveals the message and drops the panel from the address', async () => {
    h.list.mockResolvedValue(rows(2));
    render(wrap(<PointsPanel conversationId="c1" onClose={vi.fn()} />, '/chats/c/c1?points=1'));
    const cards = await screen.findAllByTestId('card');
    fireEvent.click(cards[0].querySelector('span') as HTMLElement); // newest = p1 / m1
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/chats/c/c1?m=m1'));
  });

  it('shows a loading state while the read is on its way', () => {
    h.list.mockReturnValue(new Promise(() => undefined));
    render(wrap(<PointsPanel conversationId="c1" onClose={vi.fn()} />, '/chats/c/c1?points=1'));
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByTestId('card')).toBeNull();
  });

  it('a failed read shows the error with Retry, and Retry loads the cards', async () => {
    h.list.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(rows(1));
    render(wrap(<PointsPanel conversationId="c1" onClose={vi.fn()} />, '/chats/c/c1?points=1'));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load');
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByTestId('card')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("a tap on the card's own button does not navigate", async () => {
    h.list.mockResolvedValue(rows(1));
    render(wrap(<PointsPanel conversationId="c1" onClose={vi.fn()} />, '/chats/c/c1?points=1'));
    fireEvent.click(await screen.findByText('Agree'));
    expect(screen.getByTestId('where').textContent).toBe('/chats/c/c1?points=1');
  });
});
