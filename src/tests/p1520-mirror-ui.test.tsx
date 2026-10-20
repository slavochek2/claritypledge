/**
 * @file p1520-mirror-ui.test.tsx
 * @description P1520 Mirror v2 in the chat UI, with the services mocked:
 *  - a mirror reply renders as the mirror (its face and name, "reading" caption) and offers only Reply;
 *  - a private @mirror row shown in a channel is marked private and takes no actions;
 *  - thinking / failed (Try again) / capped states under the owner's message;
 *  - the portrait under the navy agent tint, falling back to the glyph;
 *  - the @ picker lists the mirror as private, and picking it switches the composer into private mode;
 *  - MirrorProvider asks for a reply exactly once per own mirror message, never for anyone else's or a channel's,
 *    and asks nothing when the server says the mirror is off.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-mappers';

const mirrorSvc = vi.hoisted(() => ({
  askMirror: vi.fn(),
  getMirrorAvailability: vi.fn(),
  getMirrorProfile: vi.fn(),
  listMirrorAsks: vi.fn(),
  listMirrorJobs: vi.fn(),
  newMirrorFace: vi.fn(),
  requestMirrorReply: vi.fn(),
  setMirrorGender: vi.fn(),
}));
vi.mock('@/app/data/mirror-service', () => mirrorSvc);
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-me' } }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { ChatContext, type ChatContextValue, type ChatEvent } from '@/app/pages/chat/chat-state';
import { MirrorContext, type MirrorContextValue } from '@/app/pages/chat/mirror-state';
import { MirrorProvider } from '@/app/pages/chat/mirror-provider';
import { MessageRow, type MessageActions } from '@/app/pages/chat/MessageRow';
import { MirrorMark } from '@/app/pages/chat/chat-kit';
import { Composer } from '@/app/pages/chat/Composer';
import { matchMentions, mentionQuery, type MentionEntry } from '@/app/pages/chat/mention-picker';
import { MirrorInfoDialog } from '@/app/pages/chat/MirrorInfoDialog';

const ME = 'user-id-me';
const MIRROR_ID = 'conv-mirror-1';
const CHANNEL_ID = 'conv-group-1';

const mirrorChat: ChatSummary = {
  conversationId: MIRROR_ID, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const channelChat: ChatSummary = {
  ...mirrorChat, conversationId: CHANNEL_ID, kind: 'group', title: null, org: { id: 'org-1', slug: 'test-org', name: 'Test Org' },
};

function msg(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1', conversationId: MIRROR_ID, authorId: ME, body: 'hello', createdAt: new Date().toISOString(), editedAt: null,
    deletedAt: null, isDeleted: false, replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null,
    forwardSnapshot: null, kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null, ...over,
  };
}

function chatValue(over: Partial<ChatContextValue> = {}): ChatContextValue {
  return {
    userId: ME, status: 'ready', error: null, chats: [mirrorChat, channelChat], unreadCount: 0,
    refresh: vi.fn(), setArchived: vi.fn(), setManualUnread: vi.fn(), markRead: vi.fn(), subscribe: () => () => undefined,
    setViewing: vi.fn(), revision: 0, authors: {}, missingAuthors: new Set(), ensureAuthors: vi.fn(), outbox: [],
    sendMessage: vi.fn(), retrySend: vi.fn(), discardSend: vi.fn(), block: vi.fn(), unblock: vi.fn(), goToChat: vi.fn(),
    resync: vi.fn(), ...over,
  } as ChatContextValue;
}

function mirrorValue(over: Partial<MirrorContextValue> = {}): MirrorContextValue {
  return {
    enabled: true, profile: { conversationId: MIRROR_ID, portraitUrl: null, credit: null, gender: null }, portraitStatus: 'idle',
    statusFor: () => undefined, requestReply: vi.fn(), loadStatuses: vi.fn(), ask: vi.fn(), newFace: vi.fn(),
    ensurePortrait: vi.fn(), setGender: vi.fn(), ...over,
  };
}

const actions: MessageActions = {
  onReply: vi.fn(), onForward: vi.fn(), onClarify: vi.fn(), onMarkUnread: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(),
  onRetry: vi.fn(), onDiscard: vi.fn(), onJumpTo: vi.fn(), lookup: vi.fn(async () => null), getLoaded: () => undefined, version: 0,
};

function wrap(ui: ReactNode, chat = chatValue(), mirror: MirrorContextValue | null = mirrorValue()) {
  return render(
    <MemoryRouter>
      <ChatContext.Provider value={chat}>
        <MirrorContext.Provider value={mirror}>{ui}</MirrorContext.Provider>
      </ChatContext.Provider>
    </MemoryRouter>,
  );
}

function row(m: ChatMessage, extra: { privateHere?: boolean; mine?: boolean } = {}) {
  return (
    <ul>
      <MessageRow msg={m} mine={extra.mine ?? m.authorId === ME} viewerId={ME} author={undefined} authors={{}} compact={false} highlight={false} actions={actions} privateHere={extra.privateHere} />
    </ul>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('P1520 mirror reply rows', () => {
  it('a reply renders as the mirror, says it is a reading, and offers only Reply', () => {
    wrap(row(msg({ id: 'agent-1', kind: 'agent', authorId: null, body: 'She may be tired.', replyToId: 'msg-1' })));
    const author = screen.getByTestId('mirror-author');
    expect(author).toHaveTextContent('Mira');
    expect(author).toHaveTextContent('Your mirror');
    expect(screen.queryByText('Deleted user')).not.toBeInTheDocument();
    expect(screen.getByTestId('mirror-reading')).toHaveTextContent("Mira's reading");
    const bar = screen.getByRole('toolbar', { name: 'Message actions' });
    expect(within(bar).getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    for (const name of ['Forward', 'Thread', /Clarify/, 'More actions']) {
      expect(within(bar).queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('CONTROL: an ordinary own message still offers Forward, Clarify and More actions', () => {
    wrap(row(msg({ id: 'own-1' })));
    const bar = screen.getByRole('toolbar', { name: 'Message actions' });
    expect(within(bar).getByRole('button', { name: 'Forward' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('a private row shown in a channel is marked private and takes no actions', () => {
    wrap(row(msg({ id: 'ask-1', body: 'what does B mean?', contextConversationId: CHANNEL_ID }), { privateHere: true }));
    expect(screen.getByTestId('mirror-private')).toHaveTextContent('Private: only you see this');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('in the mirror itself, an ask says which channel it was asked in, and offers no Forward or Clarify', () => {
    wrap(row(msg({ id: 'ask-2', contextConversationId: CHANNEL_ID })));
    expect(screen.getByTestId('mirror-private')).toHaveTextContent('Asked privately in Test Org · General');
    const bar = screen.getByRole('toolbar', { name: 'Message actions' });
    expect(within(bar).queryByRole('button', { name: 'Forward' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: /Clarify/ })).not.toBeInTheDocument();
  });

  it('shows thinking, capped, and failed with a Try again that asks again', () => {
    const requestReply = vi.fn();
    const { unmount } = wrap(row(msg({ id: 't1' })), chatValue(), mirrorValue({ statusFor: () => 'thinking' }));
    expect(screen.getByTestId('mirror-thinking')).toHaveTextContent('Mira is thinking');
    unmount();
    const r2 = wrap(row(msg({ id: 't2' })), chatValue(), mirrorValue({ statusFor: () => 'capped' }));
    expect(screen.getByTestId('mirror-capped')).toHaveTextContent('Try again tomorrow');
    r2.unmount();
    wrap(row(msg({ id: 't3' })), chatValue(), mirrorValue({ statusFor: () => 'failed', requestReply }));
    fireEvent.click(within(screen.getByTestId('mirror-failed')).getByRole('button', { name: 'Try again' }));
    expect(requestReply).toHaveBeenCalledWith('t3');
  });

  it('shows no mirror state under someone else\'s message, or without the provider', () => {
    wrap(row(msg({ id: 'o1', authorId: 'user-id-other' }), { mine: false }), chatValue(), mirrorValue({ statusFor: () => 'thinking' }));
    expect(screen.queryByTestId('mirror-thinking')).not.toBeInTheDocument();
  });
});

describe('P1520 portrait', () => {
  it('shows the owner\'s portrait under the navy agent tint', () => {
    wrap(<MirrorMark size="md" />, chatValue(), mirrorValue({ profile: { conversationId: MIRROR_ID, portraitUrl: 'https://example.com/p.png', credit: null, gender: null } }));
    expect(screen.getByTestId('mirror-portrait')).toHaveAttribute('src', 'https://example.com/p.png');
    const tint = screen.getByTestId('agent-tint');
    expect(tint.style.backgroundColor).toBe('rgb(30, 58, 138)');
    expect(tint.style.mixBlendMode).toBe('color');
    expect(tint.style.opacity).toBe('0.75');
  });

  it('falls back to the glyph without a portrait, when the image fails, and outside the provider', () => {
    const { unmount } = wrap(<MirrorMark />);
    expect(screen.getByTestId('mirror-glyph')).toBeInTheDocument();
    unmount();
    const r = wrap(<MirrorMark />, chatValue(), mirrorValue({ profile: { conversationId: MIRROR_ID, portraitUrl: 'https://example.com/broken.png', credit: null, gender: null } }));
    fireEvent.error(screen.getByTestId('mirror-portrait'));
    expect(screen.getByTestId('mirror-glyph')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-tint')).not.toBeInTheDocument();
    r.unmount();
    render(<MirrorMark />);
    expect(screen.getByTestId('mirror-glyph')).toBeInTheDocument();
  });
});

describe('P1520 @ picker and private mode', () => {
  const entry: MentionEntry = { id: 'mirror', label: 'Mira', detail: 'Your mirror (private)', mark: <span />, keywords: ['mirror'] };

  it('finds the @query before the caret only at a word start', () => {
    expect(mentionQuery('hi @mi', 6)).toBe('mi');
    expect(mentionQuery('@', 1)).toBe('');
    expect(mentionQuery('mail@x', 6)).toBeNull();
    expect(mentionQuery('hi @mi there', 12)).toBeNull();
    expect(matchMentions([entry], 'mir')).toEqual([entry]);
    expect(matchMentions([entry], 'MI')).toEqual([entry]);
    expect(matchMentions([entry], 'bob')).toEqual([]);
  });

  it('typing @ lists the mirror as private; picking it switches to private mode without inserting text', () => {
    const onPrivateChange = vi.fn();
    wrap(<Composer draftKey="t:1" placeholder="Message Test Org" onSend={vi.fn()} mentions={[entry]} onPrivateChange={onPrivateChange} />);
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: 'hey @', selectionStart: 5 } });
    const picker = screen.getByTestId('mention-picker');
    expect(picker).toHaveTextContent('Mira');
    expect(picker).toHaveTextContent('Your mirror (private)');
    fireEvent.click(within(picker).getByRole('option'));
    expect(onPrivateChange).toHaveBeenCalledWith(entry);
    expect((field as HTMLTextAreaElement).value).toBe('hey ');
  });

  it('private mode is visible, says only you see it, hides attachments and can be left', () => {
    const onPrivateChange = vi.fn();
    wrap(<Composer draftKey="t:2" placeholder="Message Test Org" onSend={vi.fn()} onAttach={vi.fn()} mentions={[entry]} privateTo={entry} onPrivateChange={onPrivateChange} />);
    expect(screen.getByTestId('private-mode')).toHaveTextContent('Private: only you see this');
    expect(screen.getByTestId('composer').querySelector('form')).toHaveAttribute('data-private', 'true');
    expect(screen.getByRole('textbox', { name: 'Ask Mira privately' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach a point or story' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop asking privately' }));
    expect(onPrivateChange).toHaveBeenCalledWith(null);
  });

  it('Backspace on an empty field does not leave private mode; Escape does (review fix)', () => {
    const onPrivateChange = vi.fn();
    wrap(<Composer draftKey="t:4" placeholder="Message Test Org" onSend={vi.fn()} mentions={[entry]} privateTo={entry} onPrivateChange={onPrivateChange} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Backspace' });
    expect(onPrivateChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onPrivateChange).toHaveBeenCalledWith(null);
  });

  it('CONTROL: without mentions, typing @ opens nothing', () => {
    wrap(<Composer draftKey="t:3" placeholder="Message Test Org" onSend={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '@', selectionStart: 1 } });
    expect(screen.queryByTestId('mention-picker')).not.toBeInTheDocument();
  });
});

describe('P1520 mirror info panel', () => {
  it('shows the face, the name and role, Rename, New face and the face choice', () => {
    const newFace = vi.fn();
    const setGender = vi.fn(async () => undefined);
    const onRename = vi.fn();
    wrap(<MirrorInfoDialog chat={mirrorChat} onRename={onRename} onClose={vi.fn()} />, chatValue(),
      mirrorValue({ newFace, setGender, profile: { conversationId: MIRROR_ID, portraitUrl: null, credit: { artist: 'Test Artist', movement: null }, gender: 'male' } }));
    const panel = screen.getByTestId('mirror-info');
    expect(within(panel).getByRole('heading', { name: 'Mira' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('Your mirror');
    expect(screen.getByTestId('mirror-credit')).toHaveTextContent('Test Artist');
    expect(within(panel).getByRole('radio', { name: 'Male' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(panel).getByRole('radio', { name: 'Female' }));
    expect(setGender).toHaveBeenCalledWith('female');
    fireEvent.click(within(panel).getByRole('radio', { name: 'Random' }));
    expect(setGender).toHaveBeenCalledWith(null);
    fireEvent.click(within(panel).getByRole('button', { name: 'New face' }));
    expect(newFace).toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole('button', { name: 'Rename' }));
    expect(onRename).toHaveBeenCalled();
  });

  it('where the mirror cannot paint (prod), shows no New face and no face choice', () => {
    wrap(<MirrorInfoDialog chat={mirrorChat} onRename={vi.fn()} onClose={vi.fn()} />, chatValue(), mirrorValue({ enabled: false }));
    expect(screen.queryByRole('button', { name: 'New face' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
  });
});

describe('P1520 MirrorProvider', () => {
  function setup(enabled: boolean) {
    const listeners = new Set<(e: ChatEvent) => void>();
    const resync = vi.fn();
    mirrorSvc.getMirrorAvailability.mockResolvedValue(enabled);
    mirrorSvc.getMirrorProfile.mockResolvedValue({ conversationId: MIRROR_ID, portraitUrl: null, credit: null, gender: null });
    mirrorSvc.requestMirrorReply.mockResolvedValue('done');
    const chat = chatValue({ subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); }, resync });
    let seen: MirrorContextValue | null = null;
    function Probe() {
      seen = (globalThis as unknown as { __ctx?: MirrorContextValue }).__ctx ?? null;
      return null;
    }
    render(
      <ChatContext.Provider value={chat}>
        <MirrorProvider enabled>
          <MirrorContext.Consumer>{(v) => { (globalThis as unknown as { __ctx?: MirrorContextValue | null }).__ctx = v; return <Probe />; }}</MirrorContext.Consumer>
        </MirrorProvider>
      </ChatContext.Provider>,
    );
    const fire = (e: ChatEvent) => act(() => listeners.forEach((l) => l(e)));
    return { fire, resync, ctx: () => seen ?? (globalThis as unknown as { __ctx: MirrorContextValue }).__ctx };
  }

  it('asks once for an own message in the mirror, from either the send or its Realtime copy', async () => {
    const { fire, resync } = setup(true);
    await waitFor(() => expect(mirrorSvc.getMirrorAvailability).toHaveBeenCalled());
    await act(async () => undefined);
    const m = msg({ id: 'own-mirror-1' });
    fire({ type: 'sent', message: m });
    fire({ type: 'message', event: { type: 'INSERT', message: m } });
    await waitFor(() => expect(mirrorSvc.requestMirrorReply).toHaveBeenCalledTimes(1));
    expect(mirrorSvc.requestMirrorReply).toHaveBeenCalledWith('own-mirror-1');
    await waitFor(() => expect(resync).toHaveBeenCalled());
  });

  it('never asks for someone else\'s message, a channel message, its own reply, or an edit', async () => {
    const { fire } = setup(true);
    await waitFor(() => expect(mirrorSvc.getMirrorAvailability).toHaveBeenCalled());
    await act(async () => undefined);
    fire({ type: 'message', event: { type: 'INSERT', message: msg({ id: 'x1', authorId: 'user-id-other' }) } });
    fire({ type: 'message', event: { type: 'INSERT', message: msg({ id: 'x2', conversationId: CHANNEL_ID }) } });
    fire({ type: 'message', event: { type: 'INSERT', message: msg({ id: 'x3', kind: 'agent', authorId: null, replyToId: 'y' }) } });
    fire({ type: 'message', event: { type: 'UPDATE', message: msg({ id: 'x4' }) } });
    fire({ type: 'message', event: { type: 'INSERT', message: msg({ id: 'x5', kind: 'forward' }) } });
    await act(async () => undefined);
    expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
    // CONTROL: the same harness does ask for an own mirror message
    fire({ type: 'message', event: { type: 'INSERT', message: msg({ id: 'x6', kind: 'clarify' }) } });
    await waitFor(() => expect(mirrorSvc.requestMirrorReply).toHaveBeenCalledWith('x6'));
  });

  it('a message that arrives before availability is known is asked once the mirror turns out to be on (review fix)', async () => {
    let answer: (v: boolean) => void = () => undefined;
    const listeners = new Set<(e: ChatEvent) => void>();
    mirrorSvc.getMirrorAvailability.mockReturnValue(new Promise((r) => { answer = r; }));
    mirrorSvc.getMirrorProfile.mockResolvedValue(null);
    mirrorSvc.requestMirrorReply.mockResolvedValue('done');
    render(
      <ChatContext.Provider value={chatValue({ subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); } })}>
        <MirrorProvider enabled><span /></MirrorProvider>
      </ChatContext.Provider>,
    );
    await act(async () => undefined);
    act(() => listeners.forEach((l) => l({ type: 'sent', message: msg({ id: 'early-1' }) })));
    expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
    await act(async () => answer(true));
    await waitFor(() => expect(mirrorSvc.requestMirrorReply).toHaveBeenCalledWith('early-1'));
  });

  it('asks nothing when the server says the mirror is off', async () => {
    const { fire } = setup(false);
    await waitFor(() => expect(mirrorSvc.getMirrorAvailability).toHaveBeenCalled());
    await act(async () => undefined);
    fire({ type: 'sent', message: msg({ id: 'off-1' }) });
    await act(async () => undefined);
    expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
  });

  it('shows thinking until the reply arrives, and a capped answer as capped', async () => {
    const { fire, ctx } = setup(true);
    await waitFor(() => expect(mirrorSvc.getMirrorAvailability).toHaveBeenCalled());
    await act(async () => undefined);
    let finish: (v: string) => void = () => undefined;
    mirrorSvc.requestMirrorReply.mockReturnValueOnce(new Promise((r) => { finish = r; }));
    fire({ type: 'sent', message: msg({ id: 'p1' }) });
    await waitFor(() => expect(ctx().statusFor('p1')).toBe('thinking'));
    fire({ type: 'message', event: { type: 'INSERT', message: msg({ id: 'r1', kind: 'agent', authorId: null, replyToId: 'p1' }) } });
    await waitFor(() => expect(ctx().statusFor('p1')).toBeUndefined());
    await act(async () => finish('done'));

    mirrorSvc.requestMirrorReply.mockResolvedValueOnce('capped');
    fire({ type: 'sent', message: msg({ id: 'p2' }) });
    await waitFor(() => expect(ctx().statusFor('p2')).toBe('capped'));
  });
});
