/**
 * P1631 UAT: in a group whose only point was published into a thread (Open Question 8), the chat's "…" menu showed no "Points in this chat (N)".
 * The server already lists thread cards (list_chat_points has no thread filter; checked read-only on self-hosted TEST: the live body has none, and both
 * members' access starts before the card). The count is read when the chat opens and again only on a Realtime point-card event, a resync (focus,
 * reconnect, the 60 s timer) or nothing at all: a publish whose card had not arrived live left the count at 0. A successful publish now asks the
 * open views to re-read (the provider's resync, which tells every listener `resync`), so the count does not depend on Realtime.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatContextValue, ChatEvent } from '@/app/pages/chat/chat-state';

const listChatPoints = vi.hoisted(() => vi.fn());
vi.mock('@/app/data/chat-points-service', () => ({ listChatPoints }));

import { ChatContext } from '@/app/pages/chat/chat-state';
import { useChatPoints } from '@/app/pages/chat/use-chat-points';
import { useRevealPublished } from '@/app/pages/chat/use-reveal-published';

const GROUP = 'conv-group-1234';
const CARD = { pointId: 'point-id-1234', messageId: 'card-id-1234', sharedBy: 'user-id-1234', createdAt: '2026-01-01T10:00:00Z' };

/** The provider's contract (chat-provider.tsx): resync tells every listener `resync`; Realtime is silent here, as when the card has not arrived live. */
function fakeProvider() {
  const listeners = new Set<(e: ChatEvent) => void>();
  const resync = vi.fn(() => listeners.forEach((l) => l({ type: 'resync' })));
  const value = {
    chats: [], subscribe: (l: (e: ChatEvent) => void) => { listeners.add(l); return () => listeners.delete(l); }, resync,
  } as unknown as ChatContextValue;
  return { value, resync };
}

let reveal: ReturnType<typeof useRevealPublished> = () => undefined;
function Probe() {
  const points = useChatPoints(GROUP, true);
  reveal = useRevealPublished();
  return <span data-testid="count">{points.status === 'ready' ? points.rows.length : '-'}</span>;
}

describe('P1631 UAT: Points in this chat after a publish into a thread', () => {
  beforeEach(() => listChatPoints.mockReset());

  it('a point published into a group thread is counted at once, with no Realtime event', async () => {
    listChatPoints.mockResolvedValueOnce([]).mockResolvedValue([CARD]);
    const { value } = fakeProvider();
    render(<MemoryRouter initialEntries={[`/chats/c/${GROUP}/t/root-id-1234?clarify=mirror-root-1234`]}><ChatContext.Provider value={value}><Probe /></ChatContext.Provider></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'));
    act(() => reveal({ status: 'published', messageId: CARD.messageId, conversationId: GROUP, threadRootId: 'root-id-1234' }));
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
  });

  it('CONTROL: a refused publish asks for no re-read', async () => {
    listChatPoints.mockResolvedValue([]);
    const { value, resync } = fakeProvider();
    render(<MemoryRouter initialEntries={[`/chats/c/${GROUP}?clarify=mirror-root-1234`]}><ChatContext.Provider value={value}><Probe /></ChatContext.Provider></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'));
    act(() => reveal({ status: 'refused', code: 'not_available' }));
    expect(resync).not.toHaveBeenCalled();
    expect(listChatPoints).toHaveBeenCalledTimes(1);
  });
});
