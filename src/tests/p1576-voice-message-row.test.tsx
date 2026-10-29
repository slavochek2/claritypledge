/**
 * P1576 Part B: a voice note in the real MessageRow. It shows the bubble in place of a body, offers Reply
 * (and Thread, and Delete for its author) but never Edit (a voice note has no body to edit), Forward or
 * Clarify (both would copy an empty body). A deleted voice note is just a deleted message.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatAudio, ChatMessage, ChatSummary } from '@/app/data/chat-mappers';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-me' } }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/app/data/chat-voice-service', async (importActual) => ({
  ...(await importActual<typeof import('@/app/data/chat-voice-service')>()),
  getVoicePlaybackUrl: vi.fn(async () => 'https://storage.googleapis.com/b/o?sig=1'),
}));

import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { MirrorContext } from '@/app/pages/chat/mirror-state';
import { MessageRow, type MessageActions } from '@/app/pages/chat/MessageRow';

const ME = 'user-id-me';
const OTHER = 'user-id-other';
const chat: ChatSummary = {
  conversationId: 'c1', kind: 'dm', title: null, other: { id: OTHER, name: 'Ada', slug: 'ada', avatarUrl: null, avatarColor: null }, org: null, event: null,
  ownerFirstName: null, lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const audio = (over: Partial<ChatAudio> = {}): ChatAudio => ({ durationMs: 7000, transcript: 'hello', transcriptStatus: 'done', hasAudio: true, audioWaveform: null, ...over });
function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'v1', conversationId: 'c1', authorId: ME, body: null, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, isDeleted: false,
    replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message', attachmentKind: null,
    attachmentId: null, clientId: null, contextConversationId: null, audio: audio(), ...over,
  };
}
const chatValue = { userId: ME, status: 'ready', chats: [chat], authors: {}, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [], subscribe: () => () => undefined } as unknown as ChatContextValue;
const actions: MessageActions = {
  onReply: vi.fn(), onForward: vi.fn(), onClarify: vi.fn(), onThread: vi.fn(), onMarkUnread: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
  onRetry: vi.fn(), onDiscard: vi.fn(), onJumpTo: vi.fn(), lookup: vi.fn(async () => null), getLoaded: () => undefined, version: 0,
};
function row(m: ChatMessage, mine = m.authorId === ME): ReactNode {
  return (
    <MemoryRouter>
      <ChatContext.Provider value={chatValue}>
        <MirrorContext.Provider value={null}>
          <ul><MessageRow msg={m} mine={mine} viewerId={ME} author={undefined} authors={{}} compact={false} highlight={false} actions={actions} /></ul>
        </MirrorContext.Provider>
      </ChatContext.Provider>
    </MemoryRouter>
  );
}
const toolbar = () => screen.getByRole('toolbar', { name: 'Message actions' });
const has = (name: string | RegExp) => within(toolbar()).queryByRole('button', { name });

beforeEach(() => vi.clearAllMocks());

describe('a voice note in the list', () => {
  it('shows the bubble, with no body text', () => {
    render(row(msg()));
    expect(screen.getByTestId('voice-bubble')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play voice message' })).toBeInTheDocument();
  });

  it('a voice note by someone else offers Reply and Thread, but never Forward, Clarify or More', () => {
    render(row(msg({ authorId: OTHER })));
    expect(has('Reply')).toBeInTheDocument();
    expect(has('Thread')).toBeInTheDocument();
    expect(has('Forward')).not.toBeInTheDocument();
    expect(has(/Clarify/)).not.toBeInTheDocument();
    expect(has('More actions')).not.toBeInTheDocument();
  });

  it('your own voice note has More actions with Delete and NO Edit', () => {
    render(row(msg()));
    expect(has('Forward')).not.toBeInTheDocument();
    expect(has(/Clarify/)).not.toBeInTheDocument();
    fireEvent.click(has('More actions') as HTMLElement);
    const menu = screen.getByRole('menu', { name: 'Message menu' });
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('the right-click list matches: Reply, Reply in thread, Delete; no Forward, Clarify or Edit', () => {
    render(row(msg()));
    fireEvent.contextMenu(screen.getByTestId('voice-bubble'));
    const menu = screen.getByRole('menu', { name: 'Message menu' });
    const names = within(menu).getAllByRole('menuitem').map((i) => i.textContent);
    expect(names).toEqual(['Reply', 'Reply in thread', 'Delete']);
  });

  it('CONTROL: an ordinary own message still offers Forward, Clarify and Edit', () => {
    render(row(msg({ body: 'plain words', audio: null })));
    expect(has('Forward')).toBeInTheDocument();
    expect(has(/Clarify/)).toBeInTheDocument();
    fireEvent.click(has('More actions') as HTMLElement);
    expect(within(screen.getByRole('menu', { name: 'Message menu' })).getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  });

  it('a deleted voice note is just "Message deleted": no bubble, no actions', () => {
    render(row(msg({ isDeleted: true, deletedAt: new Date().toISOString(), audio: null })));
    expect(screen.getByText('Message deleted')).toBeInTheDocument();
    expect(screen.queryByTestId('voice-bubble')).not.toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('pressing Reply on a voice note calls the same reply action', () => {
    render(row(msg({ authorId: OTHER })));
    fireEvent.click(has('Reply') as HTMLElement);
    expect(actions.onReply).toHaveBeenCalledTimes(1);
  });
});
