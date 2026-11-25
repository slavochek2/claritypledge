/**
 * P1722 item 3 and 4: which Mirror messages offer Clarify, how that reaches the menu, and which rows the Mirror answers.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/app/data/chat-service';
import { isAskable, mirrorMessageClarifiable } from '@/app/pages/chat/mirror-clarify';
import { buildMenuItems } from '@/app/pages/chat/message-menu-items';

const ME = 'user-id-me';
const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1', conversationId: 'mirror-1', authorId: ME, body: 'Remote work makes junior engineers learn slower', createdAt: '2026-11-25T08:00:00.000Z', editedAt: null,
  deletedAt: null, isDeleted: false, replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null,
  kind: 'message', attachmentKind: null, attachmentId: null, clientId: null, contextConversationId: null, ...over,
} as ChatMessage);
const ctx = (inDraft: string[] = []) => ({ viewerId: ME, inDraftThread: (id: string | null) => !!id && inDraft.includes(id) });

describe('mirrorMessageClarifiable', () => {
  it('offers the owner typed message, voice note and transcribed line', () => {
    expect(mirrorMessageClarifiable(msg(), ctx())).toBe(true);
    expect(mirrorMessageClarifiable(msg({ audio: { durationMs: 1000 } } as Partial<ChatMessage>), ctx())).toBe(true);
    expect(mirrorMessageClarifiable(msg({ isTranscription: true } as Partial<ChatMessage>), ctx())).toBe(true);
  });
  it.each([
    ['a Clarify root', { kind: 'clarify' }],
    ['a forwarded copy', { kind: 'forward', forwardedFromMessageId: 'x' }],
    ['a shared point card', { attachmentKind: 'point', attachmentId: 'p1' }],
    ['a shared story card', { attachmentKind: 'story', attachmentId: 's1' }],
    ['a Mirror agent reply', { kind: 'agent', authorId: 'agent-1' }],
    ['another person\'s message', { authorId: 'someone-else' }],
    ['a deleted message', { isDeleted: true }],
    ['a private ask made in another chat', { contextConversationId: 'conv-x' }],
  ] as const)('does not offer %s', (_n, over) => {
    expect(mirrorMessageClarifiable(msg(over as Partial<ChatMessage>), ctx())).toBe(false);
  });
  it('does not offer a reply inside a Clarify or canvas-draft thread', () => {
    expect(mirrorMessageClarifiable(msg({ threadRootId: 'root-1' }), ctx(['root-1']))).toBe(false);
    expect(mirrorMessageClarifiable(msg({ threadRootId: 'root-2' }), ctx(['root-1']))).toBe(true);
  });
});

describe('the menu follows `clarifiable`', () => {
  const base = { live: true, privateHere: false, agent: false, mine: true, ownerOnly: false, startEdit: vi.fn() };
  const actions = { onClarify: vi.fn(), onReply: vi.fn(), onForward: vi.fn(), onDelete: vi.fn(), onEdit: vi.fn() } as never;
  const keys = (clarifiable?: boolean, noCopy = false) => buildMenuItems({ ...base, server: msg(), noCopy, voiceNote: false, clarifiable, actions }).map((i) => i.key);
  it('Clarify shows when clarifiable even for a noCopy row (a voice note), and not when it is not', () => {
    expect(keys(true, true)).toContain('clarify');
    expect(keys(false)).not.toContain('clarify');
  });
  it('unset: follows noCopy as before', () => {
    expect(keys(undefined, false)).toContain('clarify');
    expect(keys(undefined, true)).not.toContain('clarify');
  });
});

describe('isAskable: a transcribed line starts no Mirror reply', () => {
  it('answers a typed own message, not a transcribed one', () => {
    expect(isAskable(msg(), ME, 'mirror-1')).toBe(true);
    expect(isAskable(msg({ isTranscription: true } as Partial<ChatMessage>), ME, 'mirror-1')).toBe(false);
  });
});
