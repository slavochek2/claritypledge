/**
 * @file p1576-mirror-voice.test.tsx
 * @description P1576: voice notes in the mirror. The SERVER answers a voice note once its transcript is done, so
 * MirrorProvider only DISPLAYS: transcribing, thinking, or "could not transcribe". It never calls mirror-reply for a
 * voice note by itself (only the explicit Try again does) and reads nothing from chat-service.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatAudio, ChatMessage, ChatSummary } from '@/app/data/chat-mappers';

const mirrorSvc = vi.hoisted(() => ({
  askMirror: vi.fn(), getMirrorAvailability: vi.fn(), getMirrorProfile: vi.fn(), listMirrorAsks: vi.fn(),
  listMirrorJobs: vi.fn(), newMirrorFace: vi.fn(), requestMirrorReply: vi.fn(), setMirrorGender: vi.fn(),
}));
vi.mock('@/app/data/mirror-service', () => mirrorSvc);
/** Every chat-service function is counted: the voice display must make no read at all. */
const chatReads = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@/app/data/chat-service', async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(actual).map(([k, v]) => [k, typeof v === 'function' ? (...a: unknown[]) => { chatReads.calls++; return (v as (...x: unknown[]) => unknown)(...a); } : v]),
  );
});
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'user-id-me' } }) }));

import { ChatContext, type ChatContextValue, type ChatEvent } from '@/app/pages/chat/chat-state';
import { MirrorContext, type MirrorContextValue } from '@/app/pages/chat/mirror-state';
import { MirrorProvider } from '@/app/pages/chat/mirror-provider';
import { MirrorReplyState } from '@/app/pages/chat/MirrorReplyState';
import { voiceStatesToResume } from '@/app/pages/chat/mirror-voice';

const ME = 'user-id-me';
const MIRROR_ID = 'conv-mirror-1';
const mirrorChat: ChatSummary = {
  conversationId: MIRROR_ID, kind: 'mirror', title: 'Mira', other: null, org: null, event: null, ownerFirstName: 'Test',
  lastMessage: null, unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false,
  membersSince: null, canSend: true, blockedByMe: false,
};
const audio = (over: Partial<ChatAudio> = {}): ChatAudio => ({ durationMs: 4000, transcript: null, transcriptStatus: 'pending', hasAudio: true, audioWaveform: null, ...over });
function note(over: Partial<ChatMessage> = {}, a: Partial<ChatAudio> = {}): ChatMessage {
  return {
    id: 'v1', conversationId: MIRROR_ID, authorId: ME, body: null, createdAt: new Date().toISOString(), editedAt: null,
    deletedAt: null, isDeleted: false, replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null,
    forwardSnapshot: null, kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null,
    audio: audio(a), ...over,
  };
}

describe('voiceStatesToResume', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  it('shows failed and blank-done notes, and pending ones young enough to finish; a done note with words needs nothing', () => {
    const rows = [
      note({ id: 'done-words', createdAt: at(3_600_000) }, { transcriptStatus: 'done', transcript: 'b' }),
      note({ id: 'done-blank', createdAt: at(3_600_000) }, { transcriptStatus: 'done', transcript: '  ' }),
      note({ id: 'recent-pending', createdAt: at(30_000) }),
      note({ id: 'stale-pending', createdAt: at(86_400_000) }),
      note({ id: 'old-failed', createdAt: at(86_400_000) }, { transcriptStatus: 'failed' }),
      note({ id: 'text', audio: null, body: 'typed', createdAt: at(1000) }),
      note({ id: 'unlisted', createdAt: at(1000) }, { transcriptStatus: 'failed' }),
    ];
    const ids = ['done-words', 'done-blank', 'recent-pending', 'stale-pending', 'old-failed', 'text'];
    expect(voiceStatesToResume(rows, ids, now)).toEqual({ 'done-blank': 'failed', 'recent-pending': 'pending', 'old-failed': 'failed' });
  });
});

describe('MirrorReplyState for a voice note', () => {
  const ctx = (status: MirrorContextValue['statusFor'] extends (id: string) => infer R ? R : never): MirrorContextValue => ({
    enabled: true, profile: null, portraitStatus: 'idle', statusFor: () => status, requestReply: vi.fn(), loadStatuses: vi.fn(),
    ask: vi.fn(), newFace: vi.fn(), ensurePortrait: vi.fn(), setGender: vi.fn(),
  });
  it('transcript_failed says it cannot answer, with no Try again (retrying cannot help)', () => {
    render(<MirrorContext.Provider value={ctx('transcript_failed')}><MirrorReplyState messageId="v1" name="Mira" /></MirrorContext.Provider>);
    expect(screen.getByTestId('mirror-transcript-failed')).toHaveTextContent("Couldn't transcribe this voice message, so I can't answer it. Type it or record again.");
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
  it('transcribing shows nothing of its own: the bubble above says Transcribing…', () => {
    const { container } = render(<MirrorContext.Provider value={ctx('transcribing')}><MirrorReplyState messageId="v1" name="Mira" /></MirrorContext.Provider>);
    expect(container).toBeEmptyDOMElement();
  });
  it('CONTROL: thinking still renders', () => {
    render(<MirrorContext.Provider value={ctx('thinking')}><MirrorReplyState messageId="v1" name="Mira" /></MirrorContext.Provider>);
    expect(screen.getByTestId('mirror-thinking')).toBeInTheDocument();
  });
});

describe('MirrorProvider and voice notes', () => {
  function setup() {
    const listeners = new Set<(e: ChatEvent) => void>();
    const resync = vi.fn();
    mirrorSvc.getMirrorAvailability.mockResolvedValue(true);
    mirrorSvc.getMirrorProfile.mockResolvedValue(null);
    mirrorSvc.requestMirrorReply.mockResolvedValue('done');
    mirrorSvc.listMirrorJobs.mockResolvedValue(new Map());
    const chat = {
      userId: ME, status: 'ready', error: null, chats: [mirrorChat], unreadCount: 0, subscribe: (l: (e: ChatEvent) => void) => { listeners.add(l); return () => listeners.delete(l); },
      resync, revision: 0, authors: {}, outbox: [],
    } as unknown as ChatContextValue;
    let seen: MirrorContextValue | null = null;
    render(
      <ChatContext.Provider value={chat}>
        <MirrorProvider enabled>
          <MirrorContext.Consumer>{(v) => { seen = v; return null; }}</MirrorContext.Consumer>
        </MirrorProvider>
      </ChatContext.Provider>,
    );
    const fire = (e: ChatEvent) => act(() => listeners.forEach((l) => l(e)));
    const insert = (m: ChatMessage) => fire({ type: 'message', event: { type: 'INSERT', message: m } });
    const update = (m: ChatMessage) => fire({ type: 'message', event: { type: 'UPDATE', message: m } });
    return { insert, update, resync, resyncs: () => resync.mock.calls.length, fire, ctx: () => seen as unknown as MirrorContextValue };
  }
  const ready = async () => {
    await waitFor(() => expect(mirrorSvc.getMirrorAvailability).toHaveBeenCalled());
    await act(async () => undefined);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    chatReads.calls = 0;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  const done = { transcriptStatus: 'done' as const, transcript: 'hello there' };
  const hide = () => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  const show = () => void delete (document as unknown as Record<string, unknown>).visibilityState;

  it('a pending own voice note shows transcribing and makes no request or read, across resyncs, time and a hidden tab', async () => {
    const { insert, fire, ctx } = setup();
    await ready();
    insert(note());
    expect(ctx().statusFor('v1')).toBe('transcribing');
    hide();
    try {
      await fire({ type: 'resync' });
      await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60_000); });
    } finally {
      show();
    }
    await fire({ type: 'resync' });
    expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
    expect(chatReads.calls).toBe(0);
    expect(ctx().statusFor('v1')).toBe('transcribing');
  });

  it('a sent (own device) pending note shows transcribing too', async () => {
    const { fire, ctx } = setup();
    await ready();
    await fire({ type: 'sent', message: note() } as ChatEvent);
    expect(ctx().statusFor('v1')).toBe('transcribing');
    expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
  });

  it('the UPDATE to done shows thinking with no request, even hidden; the agent reply clears it', async () => {
    const { insert, update, ctx } = setup();
    await ready();
    insert(note());
    hide();
    try {
      update(note({}, done));
      update(note({}, done)); // a duplicate Realtime copy
    } finally {
      show();
    }
    expect(ctx().statusFor('v1')).toBe('thinking');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
    expect(chatReads.calls).toBe(0);
    insert(note({ id: 'agent-1', kind: 'agent', authorId: 'agent', replyToId: 'v1', audio: null, body: 'I hear you' }));
    expect(ctx().statusFor('v1')).toBeUndefined();
  });

  it('thinking that the server never answers (job stays queued or never appears) ends as failed, with Try again', async () => {
    const { insert, update, ctx } = setup();
    await ready();
    mirrorSvc.listMirrorJobs.mockResolvedValue(new Map());
    insert(note());
    update(note({}, done));
    expect(ctx().statusFor('v1')).toBe('thinking');
    await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000); });
    expect(ctx().statusFor('v1')).toBe('failed');
    expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
  });

  it('the job check reads nothing while the tab is hidden, and resumes when it is shown', async () => {
    const { insert, update } = setup();
    await ready();
    mirrorSvc.listMirrorJobs.mockResolvedValue(new Map());
    insert(note());
    update(note({}, done));
    mirrorSvc.listMirrorJobs.mockClear();
    hide();
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });
      expect(mirrorSvc.listMirrorJobs).not.toHaveBeenCalled();
    } finally {
      show();
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    expect(mirrorSvc.listMirrorJobs).toHaveBeenCalled();
  });

  it('a job check that answers done after the tab was hidden does not re-sync from the background', async () => {
    const { insert, update, ctx, resyncs } = setup();
    await ready();
    let answer: (m: Map<string, unknown>) => void = () => undefined;
    mirrorSvc.listMirrorJobs.mockImplementationOnce(() => new Promise((r) => { answer = r; }));
    insert(note());
    update(note({}, done));
    await act(async () => { await vi.advanceTimersByTimeAsync(21_000); }); // the check starts while visible
    expect(mirrorSvc.listMirrorJobs).toHaveBeenCalled();
    const before = resyncs();
    hide();
    try {
      await act(async () => { answer(new Map([['v1', { state: 'done', createdAt: new Date().toISOString() }]])); });
      expect(ctx().statusFor('v1')).toBeUndefined();
      expect(resyncs()).toBe(before);
    } finally {
      show();
    }
  });

  it('a failed transcript and a blank done transcript show transcript_failed and never ask', async () => {
    const { insert, update, ctx } = setup();
    await ready();
    insert(note());
    update(note({}, { transcriptStatus: 'failed' }));
    expect(ctx().statusFor('v1')).toBe('transcript_failed');
    insert(note({ id: 'b1' }));
    update(note({ id: 'b1' }, { transcriptStatus: 'done', transcript: '   ' }));
    expect(ctx().statusFor('b1')).toBe('transcript_failed');
    insert(note({ id: 'f2' }, { transcriptStatus: 'failed' }));
    expect(ctx().statusFor('f2')).toBe('transcript_failed');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
  });

  it('a note that arrives already done shows thinking and asks nothing', async () => {
    const { insert, ctx } = setup();
    await ready();
    insert(note({ id: 'd1' }, done));
    expect(ctx().statusFor('d1')).toBe('thinking');
    expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
  });

  it('an UPDATE of an old note not shown as transcribing, or of someone else\'s note, changes nothing', async () => {
    const { insert, update, ctx } = setup();
    await ready();
    update(note({ id: 'never-seen' }, done));
    insert(note({ id: 'o1', authorId: 'user-id-other' }));
    update(note({ id: 'o1', authorId: 'user-id-other' }, done));
    update(note({ id: 'out', conversationId: 'conv-elsewhere' }, { transcriptStatus: 'failed' }));
    insert(note({ id: 'out2', conversationId: 'conv-elsewhere' }));
    for (const id of ['never-seen', 'o1', 'out', 'out2']) expect(ctx().statusFor(id)).toBeUndefined();
    expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
  });

  it('Try again on a voice note calls requestReply exactly once; a transcribing answer maps to transcribing', async () => {
    const { insert, update, ctx } = setup();
    await ready();
    insert(note());
    update(note({}, { transcriptStatus: 'failed' }));
    mirrorSvc.requestMirrorReply.mockResolvedValueOnce('transcribing');
    act(() => ctx().requestReply('v1'));
    await waitFor(() => expect(ctx().statusFor('v1')).toBe('transcribing'));
    expect(mirrorSvc.requestMirrorReply).toHaveBeenCalledTimes(1);
    expect(mirrorSvc.requestMirrorReply).toHaveBeenCalledWith('v1');
    mirrorSvc.requestMirrorReply.mockResolvedValueOnce('transcript_failed');
    act(() => ctx().requestReply('v1'));
    await waitFor(() => expect(ctx().statusFor('v1')).toBe('transcript_failed'));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(mirrorSvc.requestMirrorReply).toHaveBeenCalledTimes(2); // one per press, nothing automatic
  });

  describe('on reopening the chat', () => {
    it('failed and blank notes show transcript_failed, a young pending one transcribing, with no request', async () => {
      const { ctx, update } = setup();
      await ready();
      ctx().loadStatuses(['p1', 'f1', 'b1'], { p1: 'pending', f1: 'failed', b1: 'failed' });
      await waitFor(() => expect(ctx().statusFor('p1')).toBe('transcribing'));
      expect(ctx().statusFor('f1')).toBe('transcript_failed');
      expect(ctx().statusFor('b1')).toBe('transcript_failed');
      update(note({ id: 'p1' }, done));
      expect(ctx().statusFor('p1')).toBe('thinking');
      expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
    });

    it('a voice note with a job is left to the job: running thinking, failed offers Try again, capped capped', async () => {
      const { ctx } = setup();
      await ready();
      const created = new Date().toISOString();
      mirrorSvc.listMirrorJobs.mockResolvedValue(new Map([
        ['r1', { state: 'running', createdAt: created }],
        ['f1', { state: 'failed', createdAt: created }],
        ['c1', { state: 'capped', createdAt: created }],
      ]));
      ctx().loadStatuses(['r1', 'f1', 'c1'], { r1: 'pending', f1: 'pending', c1: 'pending' });
      await waitFor(() => expect(ctx().statusFor('r1')).toBe('thinking'));
      expect(ctx().statusFor('f1')).toBe('failed');
      expect(ctx().statusFor('c1')).toBe('capped');
      expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
    });

    it('a done note with words and no job shows nothing and asks nothing, however often the chat re-reads', async () => {
      const { ctx } = setup();
      await ready();
      ctx().loadStatuses(['v1'], {});
      ctx().loadStatuses(['v1'], {});
      await act(async () => undefined);
      expect(ctx().statusFor('v1')).toBeUndefined();
      expect(mirrorSvc.requestMirrorReply).not.toHaveBeenCalled();
    });
  });
});
