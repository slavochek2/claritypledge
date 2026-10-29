/**
 * @file p1576-voice-panes.test.tsx
 * @description P1576 Part B: the panes wire the Composer's voice button to the right place. A 1:1 and a
 * group chat offer it, a thread sends INTO the thread, a pending Reply rides along as the note's
 * reply, and the mirror (chat and thread) offers it too. Same harness as p1512-chat-ui: the real chat
 * UI with the service module mocked; the recorder and WAV encode are stubbed.
 */
import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';
import type { ChatMessageEvent } from '@/app/data/chat-service';

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

const ME = vi.hoisted(() => ({ id: 'me', name: 'Mia Maker', slug: 'mia', isVerified: true, avatarColor: '#10b981', avatarUrl: undefined as string | undefined }));
const svc = vi.hoisted(() => ({
  getMyChats: vi.fn(), listMessages: vi.fn(), listThread: vi.fn(), getMessage: vi.fn(), sendMessage: vi.fn(), editMessage: vi.fn(),
  deleteMessage: vi.fn(), forwardMessage: vi.fn(), clarifyMessage: vi.fn(), markRead: vi.fn(), setChatState: vi.fn(), renameMirror: vi.fn(),
  blockUser: vi.fn(), unblockUser: vi.fn(), getMyBlocks: vi.fn(), searchPeople: vi.fn(), searchMessages: vi.fn(), startDm: vi.fn(),
  subscribeToChat: vi.fn(), getThreadStats: vi.fn(), sendVoiceNote: vi.fn(), getVoicePlaybackUrl: vi.fn(),
}));
const helpers = vi.hoisted(() => ({ getChatAuthors: vi.fn(), loadMyShareables: vi.fn(), loadAttachment: vi.fn() }));
const rec = vi.hoisted(() => ({ startRecording: vi.fn(), stopRecording: vi.fn() }));

vi.mock('@/auth', () => ({
  useAuth: () => ({ session: { user: { id: ME.id } }, user: ME, isLoading: false, sessionChecked: true, signOut: vi.fn(), refreshProfile: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/app/data/events-service-real', () => ({ EVENT_GRACE_HOURS: 12 }));
vi.mock('@/app/data/chat-service', async () => ({ ...(await vi.importActual<object>('@/app/data/chat-mappers')), ...svc }));
vi.mock('@/app/data/chat-ui-helpers', () => ({
  ...helpers,
  filterShareables: (items: Array<{ kind: string }>, _q: string, kind: string) => items.filter((i) => i.kind === kind),
}));
vi.mock('@/hooks/use-audio-recorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false, startRecording: rec.startRecording, stopRecording: rec.stopRecording, error: null, stream: null, chunkNumber: 0, requestImmediateFlush: vi.fn(),
  }),
}));
vi.mock('@/lib/audio/clip-wav', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/audio/clip-wav')>()),
  blobToWav16k: vi.fn(async () => Uint8Array.from([1, 2, 3])),
}));

import { ChatProvider } from '@/app/pages/chat/chat-provider';
import ChatHomePage from '@/app/pages/chat/ChatHomePage';

const NOW = Date.now();
const iso = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();
const base: Omit<ChatSummary, 'conversationId' | 'kind'> = {
  title: null, other: null, org: null, event: null, ownerFirstName: null, lastMessage: null, unreadCount: 0, manualUnread: false,
  archived: false, lastReadAt: null, isPartner: false, membersSince: null, canSend: true, blockedByMe: false,
};
const dm = (id: string, name: string): ChatSummary => ({
  ...base, conversationId: id, kind: 'dm', other: { id: `p-${id}`, name, slug: 'ada', avatarUrl: null, avatarColor: null },
});
const group = (id: string, orgName: string): ChatSummary => ({
  ...base, conversationId: id, kind: 'group', org: { id: `o-${id}`, slug: 'builders', name: orgName }, membersSince: iso(1000),
  lastMessage: { id: 'lm', authorId: 'p-grace', authorName: 'Grace Hopper', body: 'hello', kind: 'message', isDeleted: false, createdAt: iso(900) },
});
const mirror = (): ChatSummary => ({ ...base, conversationId: 'c-mirror', kind: 'mirror', ownerFirstName: 'Mia' });
const msg = (conversationId: string, authorId: string | null, body: string, id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, conversationId, authorId, body, createdAt: iso(50), editedAt: null, deletedAt: null, isDeleted: false, replyToId: null, threadRootId: null,
  forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message', attachmentKind: null, attachmentId: null, ...extra,
});
const ADA = { id: 'p-dm1', name: 'Ada Lovelace', slug: 'ada', avatarUrl: null, avatarColor: null, hasPledged: false };

const nav = globalThis.navigator;
const real = { mr: (globalThis as { MediaRecorder?: unknown }).MediaRecorder, ac: (globalThis as { AudioContext?: unknown }).AudioContext };

function renderChat(path: string, chats: ChatSummary[], messagesByConv: Record<string, ChatMessage[]> = {}) {
  svc.getMyChats.mockResolvedValue(chats);
  svc.listMessages.mockImplementation(async (id: string, opts: { threadRootId?: string } = {}) =>
    (messagesByConv[id] ?? []).filter((m) => (opts.threadRootId ? m.threadRootId === opts.threadRootId || m.id === opts.threadRootId : !m.threadRootId)),
  );
  svc.listThread.mockImplementation(async (id: string, rootId: string) =>
    (messagesByConv[id] ?? []).filter((m) => m.id === rootId || m.threadRootId === rootId),
  );
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ChatProvider>
        <Routes>
          <Route path="/chats/*" element={<ChatHomePage />} />
        </Routes>
      </ChatProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.getMyBlocks.mockResolvedValue([]);
  svc.markRead.mockResolvedValue(undefined);
  svc.setChatState.mockResolvedValue(undefined);
  svc.getMessage.mockResolvedValue(null);
  svc.searchPeople.mockResolvedValue([]);
  svc.searchMessages.mockResolvedValue([]);
  svc.subscribeToChat.mockImplementation((_m: (e: ChatMessageEvent) => void) => () => undefined);
  svc.getThreadStats.mockResolvedValue(new Map());
  svc.sendVoiceNote.mockResolvedValue(msg('dm1', ME.id, '', 'v1'));
  helpers.getChatAuthors.mockImplementation(async (ids: string[]) => [ADA, { ...ADA, id: ME.id, name: ME.name }, { ...ADA, id: 'p-grace', name: 'Grace Hopper' }].filter((a) => ids.includes(a.id)));
  helpers.loadMyShareables.mockResolvedValue([]);
  helpers.loadAttachment.mockResolvedValue(null);
  rec.startRecording.mockReset().mockResolvedValue(true);
  rec.stopRecording.mockReset().mockResolvedValue(new Blob(['x'], { type: 'audio/webm' }));
  Object.defineProperty(nav, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true });
  (globalThis as Record<string, unknown>).MediaRecorder = vi.fn();
  (globalThis as Record<string, unknown>).AudioContext = vi.fn();
});
afterEach(() => {
  Object.defineProperty(nav, 'mediaDevices', { value: undefined, configurable: true });
  (globalThis as Record<string, unknown>).MediaRecorder = real.mr;
  (globalThis as Record<string, unknown>).AudioContext = real.ac;
});

const voiceButton = () => screen.queryByRole('button', { name: 'Record a voice message' });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

async function recordAndSend(scope: ReturnType<typeof within>) {
  await act(async () => { fireEvent.click(await scope.findByRole('button', { name: 'Record a voice message' })); });
  await flush();
  await act(async () => { fireEvent.click(scope.getByRole('button', { name: 'Send voice message' })); });
  await flush();
}

describe('where the panes offer voice notes', () => {
  it('a 1:1 offers the round voice button in its empty composer', async () => {
    renderChat('/chats/c/dm1', [mirror(), dm('dm1', 'Ada Lovelace')], { dm1: [] });
    await screen.findByRole('textbox', { name: 'Message Ada' });
    expect(voiceButton()).toBeInTheDocument();
  });

  it('the mirror chat offers it too (the agent answers once the transcript exists), next to dictation', async () => {
    renderChat('/chats/c/c-mirror', [mirror(), dm('dm1', 'Ada Lovelace')], { 'c-mirror': [] });
    await screen.findByRole('textbox', { name: 'Write to your mirror agent' });
    expect(voiceButton()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dictate a message' })).toBeInTheDocument();
  });

  it('a thread of a group chat offers it', async () => {
    renderChat('/chats/c/g1/t/root', [mirror(), group('g1', 'Builders')], { g1: [msg('g1', 'p-grace', 'start a thread here', 'root')] });
    const panel = await screen.findByTestId('thread-panel');
    await within(panel).findByRole('textbox', { name: 'Reply in thread' });
    expect(within(panel).getByRole('button', { name: 'Record a voice message' })).toBeInTheDocument();
  });

  it('a mirror thread offers it', async () => {
    renderChat('/chats/c/c-mirror/t/mroot', [mirror(), dm('dm1', 'Ada Lovelace')], { 'c-mirror': [msg('c-mirror', ME.id, 'ask the mirror', 'mroot')] });
    const panel = await screen.findByTestId('thread-panel');
    await within(panel).findByRole('textbox', { name: 'Reply in thread' });
    expect(within(panel).getByRole('button', { name: 'Record a voice message' })).toBeInTheDocument();
  });
});

describe('what the panes send', () => {
  it('a 1:1 sends the WAV to its conversation, with no thread and no reply', async () => {
    renderChat('/chats/c/dm1', [mirror(), dm('dm1', 'Ada Lovelace')], { dm1: [] });
    await screen.findByRole('textbox', { name: 'Message Ada' });
    await recordAndSend(within(screen.getByTestId('conversation')));
    await waitFor(() => expect(svc.sendVoiceNote).toHaveBeenCalledTimes(1));
    const [conversationId, wav, opts] = svc.sendVoiceNote.mock.calls[0] as [string, Blob, { threadRootId?: string; replyToId?: string }];
    expect(conversationId).toBe('dm1');
    expect(wav.type).toBe('audio/wav');
    expect(opts.threadRootId).toBeUndefined();
    expect(opts.replyToId).toBeUndefined();
  });

  it('a thread sends INTO the thread', async () => {
    renderChat('/chats/c/g1/t/root', [mirror(), group('g1', 'Builders')], { g1: [msg('g1', 'p-grace', 'start a thread here', 'root')] });
    const panel = await screen.findByTestId('thread-panel');
    await recordAndSend(within(panel));
    await waitFor(() => expect(svc.sendVoiceNote).toHaveBeenCalledTimes(1));
    expect(svc.sendVoiceNote.mock.calls[0]?.[0]).toBe('g1');
    expect((svc.sendVoiceNote.mock.calls[0]?.[2] as { threadRootId?: string }).threadRootId).toBe('root');
  });

  it('a pending Reply rides along as the note\'s reply and is cleared once the note is accepted', async () => {
    renderChat('/chats/c/dm1', [mirror(), dm('dm1', 'Ada Lovelace')], { dm1: [msg('dm1', 'p-dm1', 'what do you think?', 'q1')] });
    fireEvent.contextMenu(await screen.findByText('what do you think?'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reply' }));
    expect(await screen.findByTestId('reply-bar')).toBeInTheDocument();
    await recordAndSend(within(screen.getByTestId('conversation')));
    await waitFor(() => expect(svc.sendVoiceNote).toHaveBeenCalledTimes(1));
    expect((svc.sendVoiceNote.mock.calls[0]?.[2] as { replyToId?: string }).replyToId).toBe('q1');
    await waitFor(() => expect(screen.queryByTestId('reply-bar')).not.toBeInTheDocument());
  });

  it('a failed note keeps the Reply (nothing was sent) and offers Retry', async () => {
    const { VoiceNoteError } = await import('@/app/data/chat-voice-service');
    svc.sendVoiceNote.mockRejectedValueOnce(new VoiceNoteError('rate', 429, 'x'));
    renderChat('/chats/c/dm1', [mirror(), dm('dm1', 'Ada Lovelace')], { dm1: [msg('dm1', 'p-dm1', 'what do you think?', 'q1')] });
    fireEvent.contextMenu(await screen.findByText('what do you think?'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reply' }));
    await recordAndSend(within(screen.getByTestId('conversation')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many voice messages');
    expect(screen.getByTestId('reply-bar')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    await waitFor(() => expect(svc.sendVoiceNote).toHaveBeenCalledTimes(2));
    expect((svc.sendVoiceNote.mock.calls[1]?.[2] as { replyToId?: string }).replyToId).toBe('q1');
  });

  it('Retry after a stored upload passes the failure\'s receipt to sendVoiceNote as `resume`', async () => {
    const { VoiceNoteError } = await import('@/app/data/chat-voice-service');
    const receipt = { conversationId: 'dm1', objectKey: 'dm1/obj-9.wav' };
    svc.sendVoiceNote.mockRejectedValueOnce(new VoiceNoteError('failed', 502, 'x', receipt));
    renderChat('/chats/c/dm1', [mirror(), dm('dm1', 'Ada Lovelace')], { dm1: [] });
    await screen.findByRole('textbox', { name: 'Message Ada' });
    await recordAndSend(within(screen.getByTestId('conversation')));
    await screen.findByRole('alert');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    await waitFor(() => expect(svc.sendVoiceNote).toHaveBeenCalledTimes(2));
    expect(svc.sendVoiceNote.mock.calls[0]?.[2]).not.toHaveProperty('resume', receipt);
    expect((svc.sendVoiceNote.mock.calls[1]?.[2] as { resume?: unknown }).resume).toEqual(receipt);
  });
});
