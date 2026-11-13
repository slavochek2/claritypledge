/**
 * P1631: a point about a whole thread publishes into that thread (migration 20261113140000_p1631_thread_point_into_thread.sql) on the test database.
 *   npm run test:integration -- src/tests/integration/p1631-thread-into-thread.test.ts
 * Fixtures as p1631-publish.test.ts: a 1:1 A-B written directly, drafts begun and completed through the service-role worker functions with hand-written results.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1631 thr ${RUN}`;
const noSession = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, noSession);
const A = admin as unknown as SupabaseClient;

async function signIn(u: TestUser): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, noSession);
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return c;
}
const rpc = (c: SupabaseClient, fn: string, args: Row = {}) => c.rpc(fn, args) as unknown as Promise<{ data: any; error: any }>;
async function ok(c: SupabaseClient, fn: string, args: Row = {}): Promise<any> {
  const { data, error } = await rpc(c, fn, args);
  if (error) throw new Error(`${fn}: ${error.code} ${error.message}`);
  return data;
}

const users: TestUser[] = [];
async function mk(label: string) {
  const u = await createTestUser({ name: `P1631 thr ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u), id: u.user.id as string };
}
type Who = Awaited<ReturnType<typeof mk>>;

let a: Who;
let b: Who;
let conv: string;

const draftRow = async (id: string) => (await admin.from('clarify_drafts').select('*').eq('id', id).single()).data as Row;
const send = (who: Who, body: string, extra: Row = {}) => ok(who.c, 'send_chat_message', { p_conversation: conv, p_body: body, p_client_id: randomUUID(), ...extra });

/** A's done draft on a pressed message, with a point and a position. */
async function madeDraft(source: string, label: string) {
  await admin.from('mirror_ai_spend').delete().eq('owner_id', a.id).eq('bucket', 'canvas');
  const s = await ok(a.c, 'clarify_start', { p_source: source });
  if (s.status !== 'started') throw new Error(`clarify_start answered ${s.status}`);
  await ok(A, '_clarify_begin', { p_draft: s.draft_id });
  const run = (await draftRow(s.draft_id)).spend_id as string | null;
  const done = await ok(A, '_clarify_complete', {
    p_draft: s.draft_id,
    p_result: { decision: 'draft', statement: `${TAG} ${label}`, cited: { a: [source], b: [] } },
    p_usd: 0.01, p_run: run,
  });
  if (done.status !== 'done') throw new Error(`complete answered ${JSON.stringify(done)}`);
  const up = await a.c.from('point_positions').upsert({ point_id: done.point_id, user_id: a.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
  if (up.error) throw new Error(`position: ${up.error.message}`);
  return { draft: s.draft_id as string, point: done.point_id as string, root: s.thread_root_id as string, scope: s.scope as string };
}

beforeAll(async () => {
  a = await mk('A');
  b = await mk('B');
  const [lo, hi] = [a.id, b.id].sort();
  const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: a.id }).select('id').single();
  if (made.error) throw new Error(`fixture dm: ${made.error.message}`);
  conv = made.data.id as string;
});

afterAll(async () => {
  const ids = users.map((u) => u.user.id);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
  await deleteTestUsers(ids);
});

describe('P1631 a point about a thread publishes into that thread', () => {
  it('thread scope: the card goes into the pressed thread (thread_root_id = that root)', async () => {
    const root = await send(b, `${TAG} thread root one`);
    await send(a, `${TAG} a reply in the thread`, { p_thread_root: root.id });
    const d = await madeDraft(root.id, 'thread point');
    expect(d.scope).toBe('thread');
    const pub = await ok(a.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() });
    expect(pub).toMatchObject({ status: 'published', conversation_id: conv, thread_root_id: root.id });
    const card = (await admin.from('chat_messages').select('thread_root_id, attachment_kind, attachment_id').eq('id', pub.message_id).single()).data as Row;
    expect(card).toMatchObject({ thread_root_id: root.id, attachment_kind: 'point', attachment_id: d.point });
  });

  it('thread scope, root deleted before publishing: the card goes to the main chat', async () => {
    const root = await send(b, `${TAG} thread root two`);
    await send(a, `${TAG} a reply under root two`, { p_thread_root: root.id });
    const d = await madeDraft(root.id, 'deleted root point');
    expect(d.scope).toBe('thread');
    // deleted the way the product does it (the author's own delete RPC empties the body as the table's CHECK requires)
    await ok(b.c, 'delete_chat_message', { p_message: root.id });
    const pub = await ok(a.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() });
    expect(pub.status).toBe('published');
    expect(pub.thread_root_id).toBeNull();
  });

  it('message scope on a top-level message with no replies: the card still goes to the main chat', async () => {
    const lone = await send(b, `${TAG} a lone message`);
    const d = await madeDraft(lone.id, 'lone point');
    expect(d.scope).toBe('message');
    const pub = await ok(a.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() });
    expect(pub).toMatchObject({ status: 'published', conversation_id: conv });
    expect(pub.thread_root_id).toBeNull();
  });
});
