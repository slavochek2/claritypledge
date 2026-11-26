/**
 * P1722 closure evidence on the test database: (1) a draft switched to Public before Publish is unreadable by others and not on the profile or feed, (2) Publish from a
 * message the Mirror agent replied to, and from a transcribed line, posts exactly one card into the Mirror main chat, still there on a re-read.
 *   npm run test:integration -- src/tests/integration/p1722-closure.test.ts
 * Fixtures follow p1722-solo-clarify.test.ts: users from createTestUser, DMs and Mirror rows written with the admin client, drafts begun and completed through the
 * service-role worker functions with hand-written results. The model is never called.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, unknown>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1722 closure ${RUN}`;
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
  const u = await createTestUser({ name: `P1722 closure ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u), id: u.user.id as string };
}
type Who = Awaited<ReturnType<typeof mk>>;

async function dm(x: Who, y: Who): Promise<string> {
  const [lo, hi] = [x.id, y.id].sort();
  const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: x.id }).select('id').single();
  if (made.error) throw new Error(`fixture dm: ${made.error.message}`);
  return made.data.id as string;
}
const mirrorOf = async (x: Who) => (await ok(A, '_chat_ensure_mirror', { p_uid: x.id })) as string;
const draftRow = async (id: string) => (await admin.from('clarify_drafts').select('*').eq('id', id).single()).data as Row;
const goodResult = (statement: string, ids: { a?: string[]; b?: string[] } = {}) => ({ decision: 'draft', statement, cited: { a: ids.a ?? [], b: ids.b ?? [] } });
let seq = 0;
const stmt = (label: string) => `${TAG} ${label} ${(seq += 1)}`;

async function typed(x: Who, mirror: string, body: string, extra: Row = {}): Promise<string> {
  const r = await admin.from('chat_messages').insert({ conversation_id: mirror, author_id: x.id, body: `${TAG} ${body}`, kind: 'message', created_at: new Date().toISOString(), ...extra }).select('id').single();
  if (r.error) throw new Error(`fixture typed: ${r.error.message}`);
  return r.data.id as string;
}
async function settle(x: Who) {
  await admin.from('clarify_drafts').update({ state: 'failed', error_code: 'test_cleanup' }).eq('owner_id', x.id).in('state', ['queued', 'running']);
  await admin.from('mirror_ai_spend').delete().eq('owner_id', x.id).eq('bucket', 'canvas');
}
/** run a queued draft to done with a hand-written result */
async function finish(x: Who, draft: string, label: string, cited: string[] = []) {
  await admin.from('mirror_ai_spend').delete().eq('owner_id', x.id).eq('bucket', 'canvas');
  const run = await ok(A, '_clarify_begin', { p_draft: draft });
  if (run.status !== 'run') throw new Error(`begin answered ${JSON.stringify(run)}`);
  const done = await ok(A, '_clarify_complete', { p_draft: draft, p_result: goodResult(stmt(label), { a: cited }), p_usd: 0.01, p_run: (await draftRow(draft)).spend_id });
  if (done.status !== 'done') throw new Error(`complete answered ${JSON.stringify(done)}`);
  return done.point_id as string;
}
async function madeDraft(x: Who, source: string, label: string, position: 'agree' | null = 'agree') {
  await settle(x);
  const s = await ok(x.c, 'clarify_start', { p_source: source });
  if (s.status !== 'started') throw new Error(`clarify_start answered ${JSON.stringify(s)}`);
  const point = await finish(x, s.draft_id, label, [source]);
  if (position) {
    const up = await x.c.from('point_positions').upsert({ point_id: point, user_id: x.id, position }, { onConflict: 'point_id,user_id' });
    if (up.error) throw new Error(`position: ${up.error.message}`);
  }
  return { draft: s.draft_id as string, point, root: s.thread_root_id as string };
}
// FR1_OLD=1 calls the pre-fix two-argument signature: it shows each finding against the functions as they were before this round
const publish = (x: Who, draft: string, vis: 'private' | 'public' = 'private', ack = false) =>
  ok(x.c, 'clarify_publish', process.env.FR1_OLD ? { p_draft: draft, p_client_id: randomUUID() } : { p_draft: draft, p_client_id: randomUUID(), p_visibility: vis, p_warning_ack: ack });
const setVis = (x: Who, draft: string, v: 'private' | 'public') => ok(x.c, 'clarify_set_visibility', { p_draft: draft, p_visibility: v });

let o: Who;
let b: Who;
let k: Who;
let mirror: string;


beforeAll(async () => {
  o = await mk('O');
  b = await mk('B');
  k = await mk('K');
  mirror = await mirrorOf(o);
  await dm(o, b);
});

afterAll(async () => {
  const ids = users.map((u) => u.user.id);
  await admin.from('stories').delete().like('content', `${TAG}%`);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
  await deleteTestUsers(ids);
});


describe('AC: a Public draft before Publish is private to everyone else', () => {
  it('switched to Public but not published: another account and a signed-out reader cannot read the point; profile and feed queries exclude it', async () => {
    const d = await madeDraft(o, await typed(o, mirror, 'prepub source'), 'prepub');
    expect((await setVis(o, d.draft, 'public')).status).toBe('ok');
    expect((await draftRow(d.draft)).visibility).toBe('public');
    const anon = createClient(URL_, ANON, noSession);
    expect((await anon.from('points').select('id').eq('id', d.point)).data).toHaveLength(0);
    expect((await k.c.from('points').select('id').eq('id', d.point)).data).toHaveLength(0);
    // the profile listing and the feed read only visibility = public points; this point is still private
    expect((await o.c.from('points').select('visibility').eq('id', d.point).single()).data?.visibility).toBe('private');
    expect((await k.c.from('points').select('id').eq('visibility', 'public').eq('id', d.point)).data).toHaveLength(0);
    expect((await anon.from('points').select('id').eq('visibility', 'public').eq('first_validator_id', o.id).eq('id', d.point)).data).toHaveLength(0);
  });
});

describe('AC: Publish in the Mirror posts exactly one card into the main chat for every kind of source', () => {
  const cardsFor = async (point: string) => (await admin.from('chat_messages').select('id, conversation_id, thread_root_id').eq('conversation_id', mirror).eq('attachment_kind', 'point').eq('attachment_id', point)).data!;
  const one = async (label: string, source: string) => {
    const d = await madeDraft(o, source, label);
    const pub = await publish(o, d.draft, 'private', false);
    expect(pub).toMatchObject({ status: 'published', conversation_id: mirror, thread_root_id: null });
    const cards = await cardsFor(d.point);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: pub.message_id, thread_root_id: null });
    // after a reload: the owner reads the card through their own session
    expect((await o.c.from('chat_messages').select('id').eq('id', pub.message_id)).data).toHaveLength(1);
    expect((await publish(o, d.draft, 'private', false)).status).toBe('already');
    expect(await cardsFor(d.point)).toHaveLength(1);
  };
  it('a top-level typed message', async () => { await one('pub-top', await typed(o, mirror, 'pub top-level')); });
  it('a message the Mirror agent replied to', async () => {
    const src = await typed(o, mirror, 'pub agent-replied');
    await admin.from('chat_messages').insert({ conversation_id: mirror, author_id: null, body: `${TAG} agent answer`, kind: 'agent', reply_to_id: src, thread_root_id: src, created_at: new Date().toISOString() });
    await one('pub-agent', src);
  });
  it('a transcribed line', async () => { await one('pub-line', await typed(o, mirror, 'pub spoken line', { is_transcription: true })); });
});
