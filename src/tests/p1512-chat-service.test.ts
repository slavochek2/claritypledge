import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
let queryResults: Array<{ data: unknown; error: null | { message: string } }> = [];
const from = vi.fn(() => {
  const next = () => queryResults.shift() ?? { data: null, error: null };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'lt', 'or', 'order', 'limit']) builder[m] = () => builder;
  builder.maybeSingle = () => Promise.resolve(next());
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(next()).then(resolve);
  return builder;
});

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: () => from(), channel: vi.fn(), removeChannel: vi.fn() } }));

import { markRead, listThread, getThreadStats, sendMessage, forwardMessage } from '@/app/data/chat-service';

const conv = (kind: string) => ({
  data: { id: 'c1', kind, org_id: null, event_id: null, owner_id: null, dm_user_a: null, dm_user_b: null, title: null, created_at: 't', last_message_at: null },
  error: null,
});
const row = (over: Record<string, unknown> = {}) => ({
  data: {
    id: 'r1', conversation_id: 'c1', author_id: 'u', body: 'b', created_at: 't', edited_at: null, deleted_at: null,
    reply_to_id: null, thread_root_id: null, forwarded_from_message_id: null, forward_snapshot: null,
    kind: 'message', attachment_kind: null, attachment_id: null, ...over,
  },
  error: null,
});

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  from.mockClear();
  queryResults = [];
});

describe('P1512 markRead', () => {
  it('prefers throughMessageId and never sends a client clock when it is given', async () => {
    await markRead('c1', { throughMessageId: 'm9' });
    expect(rpc).toHaveBeenCalledWith('mark_chat_read', { p_conversation: 'c1', p_through_message: 'm9' });
  });

  it('still accepts the legacy Date and the at option', async () => {
    const d = new Date('2026-10-19T10:00:00.123Z');
    await markRead('c1', d);
    expect(rpc).toHaveBeenLastCalledWith('mark_chat_read', { p_conversation: 'c1', p_at: d.toISOString() });
    await markRead('c1', { at: d });
    expect(rpc).toHaveBeenLastCalledWith('mark_chat_read', { p_conversation: 'c1', p_at: d.toISOString() });
  });

  it('sends only the conversation when nothing else is given (server clock)', async () => {
    await markRead('c1');
    expect(rpc).toHaveBeenLastCalledWith('mark_chat_read', { p_conversation: 'c1' });
  });
});

describe('P1512 listThread', () => {
  it('returns null for a 1:1 or a mirror (no threads there), without fetching the root', async () => {
    queryResults = [conv('dm')];
    expect(await listThread('c1', 'r1')).toBeNull();
    expect(from).toHaveBeenCalledTimes(1);
    queryResults = [conv('mirror')];
    expect(await listThread('c1', 'r1')).toBeNull();
  });

  it('returns null when the conversation is not readable or the root is not in it', async () => {
    queryResults = [{ data: null, error: null }];
    expect(await listThread('c1', 'r1')).toBeNull();
    queryResults = [conv('group'), { data: null, error: null }];
    expect(await listThread('c1', 'r-from-another-chat')).toBeNull();
  });

  it('returns null when the id is itself a thread reply', async () => {
    queryResults = [conv('event'), row({ thread_root_id: 'someone-else' })];
    expect(await listThread('c1', 'r1')).toBeNull();
  });

  it('returns the root first, then its replies, for a root in a channel', async () => {
    queryResults = [conv('group'), row(), { data: [row({ id: 'r2', thread_root_id: 'r1' }).data], error: null }];
    const thread = await listThread('c1', 'r1');
    expect(thread?.map((m) => m.id)).toEqual(['r1', 'r2']);
  });
});

describe('P1512 getThreadStats', () => {
  it('maps rows to a Map and treats a null author list as empty', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { root_id: 'r1', reply_count: 600, recent_author_ids: ['a', 'b', 'c'] },
        { root_id: 'r2', reply_count: 0, recent_author_ids: null },
      ],
      error: null,
    });
    const stats = await getThreadStats('c1', ['r1', 'r2']);
    expect(rpc).toHaveBeenCalledWith('get_thread_stats', { p_conversation: 'c1', p_roots: ['r1', 'r2'] });
    expect(stats.get('r1')).toEqual({ count: 600, authorIds: ['a', 'b', 'c'] });
    expect(stats.get('r2')).toEqual({ count: 0, authorIds: [] });
  });

  it('pages at 100 roots per call, de-duplicates ids and merges the pages', async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `r${i}`);
    rpc.mockImplementation(async (_name: string, args: { p_roots: string[] }) => ({
      data: args.p_roots.map((id) => ({ root_id: id, reply_count: 1, recent_author_ids: [] })),
      error: null,
    }));
    const stats = await getThreadStats('c1', [...ids, ...ids.slice(0, 10)]);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls.map((c) => (c[1] as { p_roots: string[] }).p_roots.length)).toEqual([100, 100, 30]);
    expect(stats.size).toBe(230);
  });

  it('throws on an RPC error instead of returning an empty map', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'chat: conversation not available' } });
    await expect(getThreadStats('c1', ['r1'])).rejects.toThrow('conversation not available');
  });
});

describe('P1512 idempotent send', () => {
  const msgRow = { id: 'm1', conversation_id: 'c1', author_id: 'u', body: 'hi', created_at: 't', edited_at: null, deleted_at: null,
    reply_to_id: null, thread_root_id: null, forwarded_from_message_id: null, forward_snapshot: null, kind: 'message',
    attachment_kind: null, attachment_id: null, client_id: 'k1' };

  it('sends p_client_id only when a clientId is given, and maps client_id back', async () => {
    rpc.mockResolvedValue({ data: msgRow, error: null });
    const withKey = await sendMessage({ conversationId: 'c1', body: 'hi', clientId: 'k1' });
    expect(rpc).toHaveBeenLastCalledWith('send_chat_message', expect.objectContaining({ p_client_id: 'k1' }));
    expect(withKey.clientId).toBe('k1');
    await sendMessage({ conversationId: 'c1', body: 'hi' });
    expect(rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty('p_client_id');
  });

  it('forwardMessage passes the optional clientId as the 4th argument', async () => {
    rpc.mockResolvedValue({ data: { ...msgRow, kind: 'forward' }, error: null });
    await forwardMessage('s1', 'c2', 'note', 'k2');
    expect(rpc).toHaveBeenLastCalledWith('forward_chat_message', { p_source: 's1', p_target_conversation: 'c2', p_note: 'note', p_client_id: 'k2' });
    await forwardMessage('s1', 'c2');
    expect(rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty('p_client_id');
  });
});
