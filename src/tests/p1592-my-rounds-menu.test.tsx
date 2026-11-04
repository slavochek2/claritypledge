/**
 * @file p1592-my-rounds-menu.test.tsx
 * @description P1592 D4: "My rounds" lives in an event channel's three-dot menu. With round threads the menu
 * shows the heading and one item per thread, newest first, and an item opens that thread; with none (or in a
 * chat that is not an event channel) there is no heading and the menu is the menu it always was.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSummary } from '@/app/data/chat-mappers';
import type { RoundThread } from '@/app/data/chat-round-threads';
import type { HeaderActions } from '@/app/pages/chat/ConversationHeader';

const go = vi.fn();
const threadsMock = vi.fn<(conversationId: string, enabled: boolean) => RoundThread[]>();
vi.mock('@/app/pages/chat/chat-hooks', () => ({ useChatNavigate: () => go }));
vi.mock('@/app/pages/chat/use-my-round-threads', () => ({ useMyRoundThreads: (c: string, e: boolean) => threadsMock(c, e) }));
// P1604: the header is now wrapped by the transcribe action, which reads the signed-in person and asks whether a session is live.
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ann' } }) }));
vi.mock('@/app/data/chat-live-transcription', () => ({ getChatLiveTranscription: () => Promise.resolve(null) }));

import { ConversationTop } from '@/app/pages/chat/MyRounds';

const base = {
  title: null, other: null, org: null, ownerFirstName: null, lastMessage: null, unreadCount: 0, manualUnread: false, archived: false,
  lastReadAt: null, isPartner: false, membersSince: null, canSend: true, blockedByMe: false,
} as const;
const eventChat: ChatSummary = { ...base, conversationId: 'conv-event', kind: 'event', event: { id: 'e1', slug: 'mastermind', title: 'Mastermind', datetime: '2026-10-29T10:00:00Z' } };
const groupChat: ChatSummary = { ...base, conversationId: 'conv-group', kind: 'group', event: null, org: { id: 'o1', slug: 'org', name: 'Org' } as ChatSummary['org'] };
const actions: HeaderActions = { onBack: vi.fn(), onArchive: vi.fn(), onMarkUnread: vi.fn(), onBlock: vi.fn(), onUnblock: vi.fn(), onRename: vi.fn() };
const round2: RoundThread = { rootMessageId: 'root-2', roundNo: 2, title: 'Round 2 · Anna & Ben', createdAt: '2026-10-29T11:00:00Z' };
const round1: RoundThread = { rootMessageId: 'root-1', roundNo: 1, title: 'Round 1 · Anna & Cleo', createdAt: '2026-10-29T10:30:00Z' };

function openMenu(chat: ChatSummary) {
  render(<MemoryRouter><ConversationTop summary={chat} blocked={false} actions={actions} /></MemoryRouter>);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
  return screen.getByRole('menu');
}

beforeEach(() => {
  vi.clearAllMocks();
  threadsMock.mockReturnValue([]);
});

describe('P1592 My rounds in the three-dot menu', () => {
  it('with two round threads: the heading, then both rounds newest first, then the usual items', () => {
    threadsMock.mockReturnValue([round2, round1]);
    const menu = openMenu(eventChat);
    expect(within(menu).getByTestId('my-rounds-heading')).toHaveTextContent('My rounds');
    const items = within(menu).getAllByTestId('my-rounds-item');
    expect(items.map((i) => i.textContent)).toEqual(['Round 2 · Anna & Ben', 'Round 1 · Anna & Cleo']);
    expect(items[0]!).toHaveAttribute('title', 'Round 2 · Anna & Ben');
    const names = within(menu).getAllByRole('menuitem').map((i) => i.textContent);
    expect(names.slice(-3)).toEqual(['Event page', 'Archive', 'Mark as unread']);
    expect(menu.querySelector('[role="separator"]')).not.toBeNull();
  });

  it('the heading and its items form a labelled group, so a screen reader announces "My rounds"', () => {
    threadsMock.mockReturnValue([round2, round1]);
    const menu = openMenu(eventChat);
    const group = within(menu).getByRole('group', { name: 'My rounds' });
    expect(within(group).getAllByTestId('my-rounds-item')).toHaveLength(2);
    expect(within(group).getByTestId('my-rounds-heading')).toBeInTheDocument();
  });

  it('opens the chosen round thread (the route a reply count opens)', () => {
    threadsMock.mockReturnValue([round2, round1]);
    const menu = openMenu(eventChat);
    fireEvent.click(within(menu).getAllByTestId('my-rounds-item')[1]!);
    expect(go).toHaveBeenCalledTimes(1);
    const to = String(go.mock.calls[0]?.[0]);
    expect(to).toContain('conv-event');
    expect(to).toContain('root-1');
  });

  it('with no round threads there is no heading and no item: the menu is as before', () => {
    const menu = openMenu(eventChat);
    expect(within(menu).queryByTestId('my-rounds-heading')).not.toBeInTheDocument();
    expect(within(menu).queryByTestId('my-rounds-item')).not.toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Transcribe', 'Event page', 'Archive', 'Mark as unread']);   // P1604 adds Transcribe, first after My rounds
  });

  it('a chat that is not an event channel never shows it, and never asks for round threads', () => {
    threadsMock.mockReturnValue([round2]);
    const menu = openMenu(groupChat);
    expect(within(menu).queryByTestId('my-rounds-heading')).not.toBeInTheDocument();
    expect(threadsMock).toHaveBeenCalledWith('conv-group', false);
  });
});
