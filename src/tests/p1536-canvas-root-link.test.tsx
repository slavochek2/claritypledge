/**
 * @file p1536-canvas-root-link.test.tsx
 * @description P1536 v3: a canvas draft's thread root, seen in the mirror's main conversation, looks like a thread even
 * with no reply yet: it shows a thread link ("Open draft thread") where a message with replies shows "N replies".
 * Real MessageList and MessageRow, services mocked.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { ConversationApi } from '@/app/pages/chat/MessageList';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } }, user: { id: 'me' } }) }));
vi.mock('@/app/pages/chat/AttachmentCard', () => ({ AttachmentCard: () => <div data-testid="attachment-card" /> }));

import { MessageList } from '@/app/pages/chat/MessageList';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';

const mirrorChat: ChatSummary = {
  conversationId: 'c', kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};

const m = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id, conversationId: 'c', authorId: 'me', body: 'a plain message', createdAt: '2026-10-27T08:00:00.000Z', editedAt: null, deletedAt: null, isDeleted: false,
  replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message',
  attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null, ...over,
});
const canvasRoot = (id: string) => m(id, { body: null, attachmentKind: 'canvas_version', attachmentId: 'ver-1' });

const chatValue = {
  userId: 'me', status: 'ready', error: null, chats: [mirrorChat], authors: {}, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], subscribe: () => () => undefined,
} as unknown as ChatContextValue;

function mount(messages: ChatMessage[], stats: Map<string, { count: number; authorIds: string[] }>, onThread = vi.fn(), inThread = false) {
  const conv = {
    status: 'ready', messages, stats, hasMore: false, loadingEarlier: false, loadEarlier: vi.fn(), ensureLoaded: vi.fn(), lookup: vi.fn(), getLoaded: vi.fn(), syncVersion: 0,
    retrySend: vi.fn(), discard: vi.fn(), edit: vi.fn(), reload: vi.fn(),
  } as unknown as ConversationApi;
  render(
    <MemoryRouter>
      <ChatContext.Provider value={chatValue}>
        <MessageList conv={conv} actions={{ onReply: vi.fn(), onThread } as never} viewerId="me" authors={{}} label="Messages" empty="empty" inThread={inThread} />
      </ChatContext.Provider>
    </MemoryRouter>,
  );
  return onThread;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
});

describe('a canvas draft thread root in the main conversation', () => {
  it('with no reply yet shows a thread link, and clicking it opens that thread', () => {
    const root = canvasRoot('root-new');
    const onThread = mount([root], new Map());
    const link = screen.getByTestId('replies-link');
    expect(link).toHaveTextContent('Open draft thread');
    expect(link.className).toContain('min-h-10');
    fireEvent.click(link);
    expect(onThread).toHaveBeenCalledWith(expect.objectContaining({ id: 'root-new' }));
  });

  it('with replies it shows the ordinary "N replies" (one link, not two)', () => {
    mount([canvasRoot('root-new')], new Map([['root-new', { count: 2, authorIds: ['me'] }]]));
    expect(screen.getAllByTestId('replies-link')).toHaveLength(1);
    expect(screen.getByTestId('replies-link')).toHaveTextContent('2 replies');
  });

  it('CONTROL: an ordinary message with no replies has no thread link', () => {
    mount([m('plain')], new Map());
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });

  it('CONTROL: other attachments (a point) with no replies have none either', () => {
    mount([m('att', { attachmentKind: 'canvas', attachmentId: 'cv-1' })], new Map());
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });

  it('CONTROL: inside the thread panel itself there is no thread link on the root', () => {
    mount([canvasRoot('root-new')], new Map(), vi.fn(), true);
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });

  it('a deleted card has no link', () => {
    mount([{ ...canvasRoot('gone'), isDeleted: true, deletedAt: '2026-10-27T09:00:00.000Z', attachmentKind: null, attachmentId: null }], new Map());
    expect(screen.queryByTestId('replies-link')).not.toBeInTheDocument();
  });
});
