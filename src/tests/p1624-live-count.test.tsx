/**
 * @file p1624-live-count.test.tsx
 * @description P1624: the people-reply value stays right live. Transcript text adds nothing, a person's reply adds one, and a stats
 * read that overlaps the reply's arrival neither loses nor double-counts it.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mapMessageRow, type ChatMessage } from '@/app/data/chat-mappers';
import type { ThreadStats } from '@/app/data/chat-service';

const hoisted = vi.hoisted(() => ({
  getThreadStats: vi.fn(),
  listMessages: vi.fn(),
  listener: null as null | ((e: unknown) => void),
}));
vi.mock('@/app/data/chat-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/chat-service')>()),
  getThreadStats: hoisted.getThreadStats,
  listMessages: hoisted.listMessages,
}));
vi.mock('@/app/pages/chat/chat-state', async (orig) => ({
  ...(await orig<typeof import('@/app/pages/chat/chat-state')>()),
  useChat: () => ({ userId: 'me', ensureAuthors: vi.fn(), subscribe: (l: (e: unknown) => void) => { hoisted.listener = l; return () => undefined; }, outbox: [], authors: {}, missingAuthors: new Set() }),
}));

import { useConversationMessages } from '@/app/pages/chat/use-conversation';

const ROOT = 'root-1';
const rootMsg = mapMessageRow({ id: ROOT, conversation_id: 'c1', author_id: null, body: 'session|2026-11-05T12:37:00Z|1', created_at: '2026-11-05T12:37:00Z', edited_at: null, deleted_at: null, reply_to_id: null, thread_root_id: null, forwarded_from_message_id: null, forward_snapshot: null, kind: 'message', attachment_kind: null, attachment_id: null, system_kind: 'outside_rounds' });
const reply = (id: string, isTranscription: boolean): ChatMessage => ({ ...rootMsg, id, authorId: 'anna', threadRootId: ROOT, isTranscription, systemKind: null, sessionRoot: null, body: 'x' });
const stat = (count: number, peopleCount: number): Map<string, ThreadStats> => new Map([[ROOT, { count, authorIds: [], peopleCount, peopleAuthorIds: [] }]]);
const insert = (m: ChatMessage) => act(() => { hoisted.listener?.({ type: 'event', event: { type: 'INSERT', message: m } }); });

async function mount() {
  const h = renderHook(() => useConversationMessages({ conversationId: 'c1', withThreads: true }));
  await waitFor(() => expect(h.result.current.stats.get(ROOT)).toBeTruthy());
  return h;
}

beforeEach(() => {
  hoisted.getThreadStats.mockReset();
  hoisted.listMessages.mockReset();
  hoisted.listMessages.mockResolvedValue([rootMsg]);
});

describe('P1624 live people count', () => {
  it('transcript text moves the existing count only, with no extra read', async () => {
    hoisted.getThreadStats.mockResolvedValue(stat(1, 0));
    const h = await mount();
    const reads = hoisted.getThreadStats.mock.calls.length;
    insert(reply('t1', true));
    expect(h.result.current.stats.get(ROOT)).toMatchObject({ count: 2, peopleCount: 0, peopleAuthorIds: [] });
    expect(hoisted.getThreadStats.mock.calls.length).toBe(reads);
  });
  it('a reply already inside the read result is not double-counted once the fresh read lands', async () => {
    hoisted.getThreadStats.mockResolvedValue(stat(1, 0));
    const h = await mount();
    hoisted.getThreadStats.mockResolvedValue(stat(2, 1));
    insert(reply('p1', false));
    await waitFor(() => expect(hoisted.getThreadStats.mock.calls.length).toBe(2));
    await waitFor(() => expect(h.result.current.stats.get(ROOT)).toMatchObject({ count: 2, peopleCount: 1 }));
  });
  it('a read started before the reply arrived and landing after it cannot lose the reply', async () => {
    let releaseOld: (v: Map<string, ThreadStats>) => void = () => undefined;
    hoisted.getThreadStats.mockResolvedValueOnce(stat(1, 0));
    const h = await mount();
    // a resync's read begins, and hangs with the state from before the reply
    hoisted.getThreadStats.mockImplementationOnce(() => new Promise((r) => { releaseOld = r; }));
    await act(async () => { hoisted.listener?.({ type: 'resync' }); await Promise.resolve(); });
    await waitFor(() => expect(hoisted.getThreadStats.mock.calls.length).toBe(2));
    hoisted.getThreadStats.mockResolvedValue(stat(2, 1));
    insert(reply('p1', false));
    await waitFor(() => expect(h.result.current.stats.get(ROOT)).toMatchObject({ peopleCount: 1 }));
    await act(async () => { releaseOld(stat(1, 0)); await Promise.resolve(); });
    expect(h.result.current.stats.get(ROOT)).toMatchObject({ count: 2, peopleCount: 1 });
  });
});
