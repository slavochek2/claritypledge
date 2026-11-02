/**
 * @file p1592-chat-provider-append-no-refetch.test.tsx
 * @description P1592 Cost Budget, through the real ChatProvider: a Realtime UPDATE of a top-level
 * transcription message (an append) must not schedule a get_my_chats refetch; an UPDATE of a typed
 * message still does (the control, so a provider that never refetches cannot pass).
 */
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  getMyChats: vi.fn(),
  emit: null as null | ((e: unknown) => void),
}));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } } }) }));
vi.mock('@/app/routes/home-readiness', () => ({ useHomeReadiness: () => ({ state: 'signed-in', retry: () => undefined }) }));
vi.mock('@/app/data/mirror-service', () => ({
  askMirror: vi.fn(), getMirrorAvailability: vi.fn().mockResolvedValue(false), getMirrorProfile: vi.fn().mockResolvedValue(null),
  listMirrorJobs: vi.fn().mockResolvedValue(new Map()), newMirrorFace: vi.fn(), requestMirrorReply: vi.fn(), setMirrorGender: vi.fn(),
}));
vi.mock('@/app/data/chat-service', () => ({
  getMyChats: svc.getMyChats, listBody: (m: { body: string | null }) => m.body, setChatState: vi.fn(), markRead: vi.fn(), sendMessage: vi.fn(), blockUser: vi.fn(), unblockUser: vi.fn(),
  subscribeToChat: vi.fn((onMessage: (e: unknown) => void) => { svc.emit = onMessage; return () => undefined; }),
}));
vi.mock('@/app/data/chat-ui-helpers', () => ({ getChatAuthors: vi.fn().mockResolvedValue([]) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { ChatProvider, REFRESH_DEBOUNCE_MS } from '@/app/pages/chat/chat-provider';

const summary = {
  conversationId: 'c1', kind: 'event', title: null, other: null, org: null, event: { id: 'e', slug: 's', title: 'T', datetime: '2026-10-29T10:00:00Z' }, ownerFirstName: null,
  lastMessage: { id: 'm1', authorId: 'u2', authorName: 'Anna', body: 'first', kind: 'message', isDeleted: false, createdAt: '2026-10-29T10:00:00Z' },
  unreadCount: 0, manualUnread: false, archived: false, lastReadAt: null, isPartner: false, membersSince: null, canSend: true, blockedByMe: false,
};
const message = (over: Record<string, unknown>) => ({
  id: 'm1', conversationId: 'c1', authorId: 'u2', body: 'more words', createdAt: '2026-10-29T10:00:00Z', editedAt: null, deletedAt: null, isDeleted: false,
  replyToId: null, threadRootId: null, forwardedFromMessageId: null, forwardAuthorId: null, forwardSnapshot: null, kind: 'message', attachmentKind: null, attachmentId: null, ...over,
});

async function mountAndSettle() {
  render(<MemoryRouter initialEntries={['/feed']}><ChatProvider><div /></ChatProvider></MemoryRouter>);
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  svc.emit = null;
  svc.getMyChats.mockReset();
  svc.getMyChats.mockResolvedValue([summary]);
});
afterEach(() => vi.useRealTimers());

describe('P1592 ChatProvider and transcription appends', () => {
  it('an UPDATE of a top-level transcription message schedules no list refetch', async () => {
    await mountAndSettle();
    expect(svc.emit).not.toBeNull();
    const before = svc.getMyChats.mock.calls.length;
    await act(async () => { svc.emit?.({ type: 'UPDATE', message: message({ isTranscription: true }) }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_DEBOUNCE_MS + 500); });
    expect(svc.getMyChats.mock.calls.length).toBe(before);
  });

  it('CONTROL: an UPDATE of a typed top-level message still refetches', async () => {
    await mountAndSettle();
    const before = svc.getMyChats.mock.calls.length;
    await act(async () => { svc.emit?.({ type: 'UPDATE', message: message({ isTranscription: false }) }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_DEBOUNCE_MS + 500); });
    expect(svc.getMyChats.mock.calls.length).toBeGreaterThan(before);
  });
});
