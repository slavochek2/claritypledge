/**
 * P1722 fix round C4 and C6.
 * C4: a Mirror voice note offers Clarify only once its transcript is done and not empty (the server reads no words from it before that).
 * C6: a reply in a Clarify or canvas-draft thread is recognised from message data (the thread's root message), so it is right with every client registry empty (after a reload).
 */
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/app/data/chat-service';
import { hasClarifyText } from '@/app/pages/chat/mirror-clarify';
import { rowClarifiable } from '@/app/pages/chat/row-clarifiable';
import { isClarifyThread, resetClarifyRuns } from '@/app/pages/chat/clarify-run';
import { isCanvasThread } from '@/app/pages/chat/canvas-thread-registry';

const ME = 'user-id-me';
const MIRROR = 'mirror-1';
const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1', conversationId: MIRROR, authorId: ME, body: 'Remote work makes junior engineers learn slower', createdAt: '2026-11-25T08:00:00.000Z', editedAt: null,
  deletedAt: null, isDeleted: false, replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null,
  kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null, ...over,
} as ChatMessage);
const voice = (status: 'pending' | 'failed' | 'done', transcript: string | null) =>
  msg({ body: '', audio: { durationMs: 4000, transcript, transcriptStatus: status, hasAudio: true, audioWaveform: null } } as Partial<ChatMessage>);
const offers = (m: ChatMessage, loaded: ChatMessage[] = []) =>
  rowClarifiable(m, MIRROR, true, true, (id) => loaded.find((x) => x.id === id));

describe('C4: a Mirror voice note', () => {
  it.each([
    ['pending', voice('pending', null), false],
    ['failed', voice('failed', null), false],
    ['done with words', voice('done', 'Remote work slows juniors'), true],
    ['done and silent (empty transcript)', voice('done', ''), false],
    ['done with only spaces', voice('done', '   '), false],
    ['pending even if a transcript string is present', voice('pending', 'stale'), false],
  ])('%s: Clarify offered = %s', (_n, m, want) => {
    expect(hasClarifyText(m)).toBe(want);
    expect(offers(m)).toBe(want);
  });

  it('a typed message with words is unaffected; a bodiless non-voice row is not offered', () => {
    expect(offers(msg())).toBe(true);
    expect(offers(msg({ body: '' }))).toBe(false);
  });
});

describe('C6: a reply in a draft thread, judged from data with every registry empty', () => {
  const clarifyRoot = msg({ id: 'root-c', kind: 'clarify', threadRootId: null });
  const canvasRoot = msg({ id: 'root-v', kind: 'message', attachmentKind: 'canvas_version', attachmentId: 'v1' });
  const plainRoot = msg({ id: 'root-p' });

  it('the registries really are empty here (the test is not satisfied by them)', () => {
    resetClarifyRuns();
    expect(isClarifyThread('root-c')).toBe(false);
    expect(isCanvasThread('root-v')).toBe(false);
  });

  it('a reply in a Clarify thread: not offered', () => {
    expect(offers(msg({ id: 'r1', threadRootId: 'root-c' }), [clarifyRoot])).toBe(false);
  });
  it('a reply in a canvas-draft thread: not offered', () => {
    expect(offers(msg({ id: 'r2', threadRootId: 'root-v' }), [canvasRoot])).toBe(false);
  });
  it('CONTROL: a reply in an ordinary thread of the Mirror: offered', () => {
    expect(offers(msg({ id: 'r3', threadRootId: 'root-p' }), [plainRoot])).toBe(true);
  });
  it('a reply whose root is not loaded cannot be told apart from a draft thread: not offered', () => {
    expect(offers(msg({ id: 'r4', threadRootId: 'root-unknown' }), [])).toBe(false);
  });
  it('a top-level message needs no root lookup: offered', () => {
    expect(offers(msg({ id: 'top', threadRootId: null }), [])).toBe(true);
  });
  it('outside the Mirror nothing changes: any copyable row offers Clarify', () => {
    expect(rowClarifiable(msg({ conversationId: 'dm-1', threadRootId: 'x' }), MIRROR, false, false)).toBe(true);
  });
});
