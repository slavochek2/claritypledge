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

import { markRead, listThread } from '@/app/data/chat-service';

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
