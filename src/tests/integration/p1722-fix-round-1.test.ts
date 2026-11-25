/**
 * P1722 fix round 1 (review findings S1 to S12) on the test database. Migration 20261125130000 is what these cases need.
 *   npm run test:integration -- src/tests/integration/p1722-fix-round-1.test.ts
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
const TAG = `P1722 fix1 ${RUN}`;
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
  const u = await createTestUser({ name: `P1722 fix1 ${label} ${RUN}` });
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
const threadDrafts = async (x: Who, root: string) => (await ok(x.c, 'get_clarify_thread', { p_thread_root: root })).drafts as Row[];

let o: Who;
let b: Who;
let k: Who;
let mirror: string;
let chatOB: string;

beforeAll(async () => {
  o = await mk('O');
  b = await mk('B');
  k = await mk('K');
  mirror = await mirrorOf(o);
  chatOB = await dm(o, b);
});

afterAll(async () => {
  const ids = users.map((u) => u.user.id);
  await admin.from('stories').delete().like('content', `${TAG}%`);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
  await deleteTestUsers(ids);
});

describe('S1 a Public publish never deletes a point somebody else answered', () => {
  it('legacy shape (card hard-deleted, first_published_at empty) with another account position, then with history only: both refuse answered; point and position stay', async () => {
    const m = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} s1 source`, p_client_id: randomUUID() });
    const d = await madeDraft(o, m.id, 's1');
    const pub = await publish(o, d.draft);
    expect(pub.status).toBe('published');
    expect((await b.c.from('point_positions').upsert({ point_id: d.point, user_id: b.id, position: 'agree' }, { onConflict: 'point_id,user_id' })).error).toBeNull();
    await admin.from('chat_messages').delete().eq('id', pub.message_id); // the share row goes with the card
    await admin.from('clarify_drafts').update({ first_published_at: null }).eq('id', d.draft); // a card posted before P1722 has no record on the draft
    expect(await setVis(o, d.draft, 'public')).toMatchObject({ status: 'refused', code: 'answered' });
    await admin.from('clarify_drafts').update({ visibility: 'public' }).eq('id', d.draft);
    expect(await publish(o, d.draft, 'public', true)).toMatchObject({ status: 'refused', code: 'answered' });
    expect((await admin.from('points').select('visibility').eq('id', d.point).single()).data).toEqual({ visibility: 'private' });
    expect((await admin.from('point_positions').select('user_id').eq('point_id', d.point).eq('user_id', b.id)).data).toHaveLength(1);
    // history only: the other account's position row is gone, its history row is not
    await admin.from('point_positions').delete().eq('point_id', d.point).eq('user_id', b.id);
    expect((await admin.from('point_position_history').select('id').eq('point_id', d.point).eq('user_id', b.id)).data!.length).toBeGreaterThan(0);
    expect(await publish(o, d.draft, 'public', true)).toMatchObject({ status: 'refused', code: 'answered' });
    expect((await admin.from('points').select('id').eq('id', d.point)).data).toHaveLength(1);
  });
});

describe('S2 a retry finds the posted card before any other check', () => {
  it('answers already after the draft became an earlier version and after the position was cleared', async () => {
    const m = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} s2 source`, p_client_id: randomUUID() });
    const d = await madeDraft(o, m.id, 's2');
    const first = await publish(o, d.draft);
    expect(first.status).toBe('published');
    const row = await draftRow(d.draft);
    expect((await admin.from('clarify_drafts').insert({ owner_id: o.id, mirror_conversation_id: row.mirror_conversation_id, thread_root_id: row.thread_root_id, source_conversation_id: chatOB, source_message_id: m.id, state: 'done', point_id: d.point, refine_target_id: d.draft })).error).toBeNull();
    expect(await publish(o, d.draft)).toMatchObject({ status: 'already', message_id: first.message_id });
    await admin.from('point_positions').delete().eq('point_id', d.point).eq('user_id', o.id);
    expect(await publish(o, d.draft)).toMatchObject({ status: 'already', message_id: first.message_id });
  });
});

describe('S3 Clarify on a Mirror chat row works over a stored recording', () => {
  it('a Mirror holding only a recording (outside_rounds root, lines as replies) starts a draft that warns', async () => {
    const r = await mk('R');
    const mir = await mirrorOf(r);
    const root = await admin.from('chat_messages').insert({ conversation_id: mir, author_id: null, body: 'session|2026-11-25T08:00:00Z|1', kind: 'message', system_kind: 'outside_rounds', created_at: new Date().toISOString() }).select('id').single();
    expect(root.error).toBeNull();
    for (const t of ['a spoken line one', 'a spoken line two']) {
      const ln = await admin.from('chat_messages').insert({ conversation_id: mir, author_id: r.id, body: `${TAG} ${t}`, kind: 'message', thread_root_id: root.data!.id, is_transcription: true, created_at: new Date().toISOString() });
      expect(ln.error).toBeNull();
    }
    const s = await ok(r.c, 'clarify_start_chat', { p_conversation: mir, p_draft: true });
    expect(s).toMatchObject({ status: 'started' });
    expect(s.draft_id).toBeTruthy();
    await ok(A, '_clarify_begin', { p_draft: s.draft_id });
    expect((await draftRow(s.draft_id)).public_warning_needed).toBe(true);
    await settle(r);
  });
});

describe('S4 publish uses the visibility the user saw, and the warning is enforced here', () => {
  it('visibility_changed, needs_warning, then published; a draft with no warning needs no ack; the default is private', async () => {
    const m = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} s4 source`, p_client_id: randomUUID() });
    const d = await madeDraft(o, m.id, 's4');
    await setVis(o, d.draft, 'public');
    expect(await publish(o, d.draft, 'private', true)).toMatchObject({ status: 'refused', code: 'visibility_changed' });
    expect(await ok(o.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() })).toMatchObject({ status: 'refused', code: 'visibility_changed' });
    expect(await publish(o, d.draft, 'public', false)).toMatchObject({ status: 'refused', code: 'needs_warning' });
    expect((await draftRow(d.draft)).point_id).toBe(d.point);
    expect(await publish(o, d.draft, 'public', true)).toMatchObject({ status: 'published' });
    // a draft read from the owner's own typed Mirror words carries no warning
    const src = await typed(o, mirror, 's4 typed');
    const e = await madeDraft(o, src, 's4-mirror');
    await setVis(o, e.draft, 'public');
    expect(await publish(o, e.draft, 'public', false)).toMatchObject({ status: 'published' });
    // and a private draft published as private is unchanged
    const m2 = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} s4 source 2`, p_client_id: randomUUID() });
    const f = await madeDraft(o, m2.id, 's4-private');
    expect(await publish(o, f.draft, 'private', false)).toMatchObject({ status: 'published' });
  });
});

describe('S5 latest: one card carries Publish and the visibility switch', () => {
  it('of two independent cards of a thread only the newest is latest; the older one refuses set_visibility and publish', async () => {
    const src = await typed(o, mirror, 's5 typed');
    const d1 = await madeDraft(o, src, 's5a');
    const another = await ok(o.c, 'clarify_another', { p_thread_root: d1.root });
    expect(another.status).toBe('started');
    await finish(o, another.draft_id, 's5b', [src]);
    const rows = await threadDrafts(o, d1.root);
    expect(rows.find((r) => r.id === d1.draft)?.is_latest).toBe(false);
    expect(rows.find((r) => r.id === another.draft_id)?.is_latest).toBe(true);
    expect(await setVis(o, d1.draft, 'public')).toMatchObject({ status: 'refused', code: 'earlier_version' });
    expect(await publish(o, d1.draft)).toMatchObject({ status: 'refused', code: 'earlier_version' });
    expect(await setVis(o, another.draft_id, 'public')).toMatchObject({ status: 'ok' });
  });
});

describe('S6 a public Clarify point keeps the record the letter guard reads', () => {
  it('after the card is hard-deleted the owner cannot delete the draft (published); the draft row and the point stay', async () => {
    const src = await typed(o, mirror, 's6 typed');
    const d = await madeDraft(o, src, 's6');
    await setVis(o, d.draft, 'public');
    const pub = await publish(o, d.draft, 'public', false);
    expect(pub.status).toBe('published');
    await admin.from('chat_messages').delete().eq('id', pub.message_id);
    expect(await ok(o.c, 'clarify_draft_delete', { p_draft: d.draft })).toMatchObject({ status: 'refused', code: 'published' });
    const row = await draftRow(d.draft);
    expect(row.point_id).toBeTruthy();
    expect((await admin.from('points').select('visibility').eq('id', row.point_id as string).single()).data).toEqual({ visibility: 'public' });
  });
});

describe('S7 erasure', () => {
  it('a DM partner is erased: the public point stays readable and the owner draft shows erased; a private draft keeps its state (control)', async () => {
    const po = await mk('S7O');
    const pb = await mk('S7B');
    const chat = await dm(po, pb);
    const m1 = await ok(pb.c, 'send_chat_message', { p_conversation: chat, p_body: `${TAG} s7 partner words one`, p_client_id: randomUUID() });
    const pub = await madeDraft(po, m1.id, 's7-public');
    await setVis(po, pub.draft, 'public');
    expect((await publish(po, pub.draft, 'public', true)).status).toBe('published');
    const m2 = await ok(pb.c, 'send_chat_message', { p_conversation: chat, p_body: `${TAG} s7 partner words two`, p_client_id: randomUUID() });
    const priv = await madeDraft(po, m2.id, 's7-private');
    const er = await admin.rpc('erase_chat_data_for', { p_uid: pb.id });
    expect(er.error).toBeNull();
    const after = await draftRow(pub.draft);
    expect(after.state).toBe('failed');
    expect(after.error_code).toBe('erased');
    const np = (await admin.from('points').select('id, visibility, first_validator_id').eq('visibility', 'public').like('statement', `${TAG} s7-public%`)).data!;
    expect(np).toHaveLength(1);
    expect(np[0]!.first_validator_id).toBe(po.id);
    expect((await draftRow(priv.draft)).state).toBe('done');
  });

  it('the owner is erased: the public point stays with its author detached', async () => {
    const q = await mk('S7Q');
    const mq = await mirrorOf(q);
    const src = await typed(q, mq, 's7 owner typed');
    const d = await madeDraft(q, src, 's7-owner');
    await setVis(q, d.draft, 'public');
    expect((await publish(q, d.draft, 'public', false)).status).toBe('published');
    const np = (await draftRow(d.draft)).point_id as string;
    const er = await q.c.rpc('erase_my_account');
    expect(er.error).toBeNull();
    const kept = (await admin.from('points').select('visibility, first_validator_id').eq('id', np).single()).data!;
    expect(kept).toEqual({ visibility: 'public', first_validator_id: null });
  });
});

describe('S8 the public point keeps the story tags of the private one', () => {
  it('system tags other than canvas_ ones are copied (canvas_ ones cannot be public)', async () => {
    const src = await typed(o, mirror, 's8 typed');
    const d = await madeDraft(o, src, 's8');
    expect((await admin.from('points').update({ system_tags: ['st1', 'canvas_box'] }).eq('id', d.point)).error).toBeNull();
    await setVis(o, d.draft, 'public');
    expect((await publish(o, d.draft, 'public', false)).status).toBe('published');
    const np = (await draftRow(d.draft)).point_id as string;
    expect((await admin.from('points').select('system_tags').eq('id', np).single()).data).toEqual({ system_tags: ['st1'] });
  });
});

describe('S9 the warning follows the drafts a run was shown', () => {
  it('a draft shown an earlier warned draft (its source line since deleted) warns too', async () => {
    const t = await mk('S9');
    const mt = await mirrorOf(t);
    const line = await typed(t, mt, 's9 spoken', { is_transcription: true });
    const d1 = await madeDraft(t, line, 's9a');
    expect((await draftRow(d1.draft)).public_warning_needed).toBe(true);
    expect((await admin.from('chat_messages').update({ body: null, deleted_at: new Date().toISOString() }).eq('id', line)).error).toBeNull();
    const typedMsg = await typed(t, mt, 's9 typed words');
    const d2 = await madeDraft(t, typedMsg, 's9b');
    expect((await draftRow(d2.draft)).public_warning_needed).toBe(true);
    // control: the same shape with no warned draft in sight does not warn
    const u = await mk('S9C');
    const mu = await mirrorOf(u);
    const d3 = await madeDraft(u, await typed(u, mu, 's9 control one'), 's9c');
    expect((await draftRow(d3.draft)).public_warning_needed).toBe(false);
  });
});

describe('S10 tags derived by the server mask links like the client', () => {
  it('a # inside a link is not a tag when the tags are derived', async () => {
    const src = await typed(o, mirror, 's10 typed');
    const d = await madeDraft(o, src, 's10');
    const r = await ok(o.c, 'clarify_draft_edit', { p_draft: d.draft, p_statement: `${TAG} see https://example.com/?q=#sales and #real` });
    expect(r.tags).toEqual(['real']);
  });
});

describe('T1 (round 3) a point in a supersede chain is never replaced by a public one', () => {
  async function pair(label: string) {
    const m = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} ${label} source`, p_client_id: randomUUID() });
    const d = await madeDraft(o, m.id, label);
    const other = await admin.from('points').insert({ statement: `${TAG} ${label} other`, first_validator_id: o.id, visibility: 'private', tags: [], system_tags: [] }).select('id').single();
    expect(other.error).toBeNull();
    return { d, other: other.data!.id as string };
  }
  it('outgoing link: the draft point has superseded_by set', async () => {
    const { d, other } = await pair('t1-out');
    const link = await admin.from('points').update({ superseded_by: other }).eq('id', d.point);
    expect(link.error, JSON.stringify(link.error)).toBeNull();
    expect(await setVis(o, d.draft, 'public')).toMatchObject({ status: 'refused', code: 'point_linked' });
    await admin.from('clarify_drafts').update({ visibility: 'public' }).eq('id', d.draft);
    expect(await publish(o, d.draft, 'public', true)).toMatchObject({ status: 'refused', code: 'point_linked' });
    expect((await admin.from('points').select('superseded_by').eq('id', d.point).single()).data).toEqual({ superseded_by: other });
  });
  it('incoming link: another point has superseded_by = the draft point', async () => {
    const { d, other } = await pair('t1-in');
    const link = await admin.from('points').update({ superseded_by: d.point }).eq('id', other);
    expect(link.error, JSON.stringify(link.error)).toBeNull();
    expect(await setVis(o, d.draft, 'public')).toMatchObject({ status: 'refused', code: 'point_linked' });
    await admin.from('clarify_drafts').update({ visibility: 'public' }).eq('id', d.draft);
    expect(await publish(o, d.draft, 'public', true)).toMatchObject({ status: 'refused', code: 'point_linked' });
    expect((await admin.from('points').select('superseded_by').eq('id', other).single()).data).toEqual({ superseded_by: d.point });
    expect((await admin.from('points').select('id').eq('id', d.point)).data).toHaveLength(1);
  });
});

describe('T2 (round 3) a Mirror chat row holding a typed note and then a recording reads the recording', () => {
  it('start_chat anchors on the recording line and _clarify_begin keeps it as the source', async () => {
    const r = await mk('T2');
    const mir = await mirrorOf(r);
    await typed(r, mir, 't2 older typed note about pricing');
    const root = await admin.from('chat_messages').insert({ conversation_id: mir, author_id: null, body: 'session|2026-11-25T09:00:00Z|1', kind: 'message', system_kind: 'outside_rounds', created_at: new Date().toISOString() }).select('id').single();
    expect(root.error).toBeNull();
    for (const t of ['t2 spoken line one', 't2 spoken line two']) {
      const ln = await admin.from('chat_messages').insert({ conversation_id: mir, author_id: r.id, body: `${TAG} ${t}`, kind: 'message', thread_root_id: root.data!.id, is_transcription: true, created_at: new Date().toISOString() });
      expect(ln.error).toBeNull();
    }
    const s = await ok(r.c, 'clarify_start_chat', { p_conversation: mir, p_draft: true });
    expect(s).toMatchObject({ status: 'started' });
    const run = await ok(A, '_clarify_begin', { p_draft: s.draft_id });
    expect(run.status).toBe('run');
    expect(run.source_message.text, JSON.stringify(run.source_message)).toContain('t2 spoken line two');
    await settle(r);
  });
});

describe('X1 (round 5) an erased published draft cannot be retried, and a completion never moves a published draft off its point', () => {
  it('retry refuses; the point pointer stays; _clarify_complete leaves point_id alone', async () => {
    const po = await mk('X1O');
    const pb = await mk('X1B');
    const chat = await dm(po, pb);
    const m1 = await ok(pb.c, 'send_chat_message', { p_conversation: chat, p_body: `${TAG} x1 partner words`, p_client_id: randomUUID() });
    const d = await madeDraft(po, m1.id, 'x1');
    await setVis(po, d.draft, 'public');
    expect((await publish(po, d.draft, 'public', true)).status).toBe('published');
    const pubPoint = (await draftRow(d.draft)).point_id as string;
    expect((await admin.rpc('erase_chat_data_for', { p_uid: pb.id })).error).toBeNull();
    expect(await draftRow(d.draft)).toMatchObject({ state: 'failed', error_code: 'erased', point_id: pubPoint });
    const r = await rpc(po.c, 'clarify_retry', { p_draft: d.draft });
    expect(r.error, JSON.stringify(r)).toBeNull();
    expect(r.data, JSON.stringify(r)).toMatchObject({ status: 'refused' });
    expect(await draftRow(d.draft)).toMatchObject({ state: 'failed', point_id: pubPoint });
    // a completion arriving for a published draft that is somehow running again must not replace its point
    await admin.from('mirror_ai_spend').delete().eq('owner_id', po.id).eq('bucket', 'canvas');
    const spend = await ok(A, '_mirror_reserve', { p_owner: po.id, p_bucket: 'canvas', p_max_usd: 0.05 });
    {
      await admin.from('clarify_drafts').update({ state: 'running', started_at: new Date().toISOString(), spend_id: spend, error_code: null, sent_ids: [m1.id] }).eq('id', d.draft);
      await ok(A, '_clarify_complete', { p_draft: d.draft, p_result: goodResult(stmt('x1-new'), {}), p_usd: 0.01, p_run: spend });
      expect((await draftRow(d.draft)).point_id).toBe(pubPoint);
    }
  });
});

describe('Z1 (round 6) publish refuses wording that changed since the screen showed it', () => {
  it('p_expected_statement: a stale value answers changed and publishes nothing; the current one publishes', async () => {
    const m = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} z1 source`, p_client_id: randomUUID() });
    const d = await madeDraft(o, m.id, 'z1');
    const before = (await admin.from('points').select('statement').eq('id', d.point).single()).data!.statement as string;
    await setVis(o, d.draft, 'public');
    const edited = await ok(o.c, 'clarify_draft_edit', { p_draft: d.draft, p_statement: `${TAG} z1 reworded elsewhere` });
    expect(edited.changed).toBe(true);
    // the owner re-takes a position after the edit (an edit clears it)
    await o.c.from('point_positions').upsert({ point_id: d.point, user_id: o.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    const stale = await ok(o.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID(), p_visibility: 'public', p_warning_ack: true, p_expected_statement: before });
    expect(stale).toMatchObject({ status: 'refused', code: 'changed' });
    expect((await admin.from('points').select('visibility').eq('id', d.point).single()).data).toEqual({ visibility: 'private' });
    const fresh = await ok(o.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID(), p_visibility: 'public', p_warning_ack: true, p_expected_statement: `${TAG} z1 reworded elsewhere` });
    expect(fresh.status).toBe('published');
  });
});

describe('Z3 (round 6) a multiline hashtag-only statement is refused', () => {
  it('"#alpha\\n#beta" is bad statement', async () => {
    const src = await typed(o, mirror, 'z3 typed');
    const d = await madeDraft(o, src, 'z3');
    const bad = await o.c.rpc('clarify_draft_edit', { p_draft: d.draft, p_statement: '#alpha\n#beta' });
    expect(bad.error?.message, JSON.stringify(bad)).toContain('bad statement');
  });
});

describe('X2 (round 5) a statement that is only #tags is refused', () => {
  it('"#a #b" is bad statement; "#a and words" is fine', async () => {
    const src = await typed(o, mirror, 'x2 typed');
    const d = await madeDraft(o, src, 'x2');
    const bad = await o.c.rpc('clarify_draft_edit', { p_draft: d.draft, p_statement: '#alpha #beta' });
    expect(bad.error?.message, JSON.stringify(bad)).toContain('bad statement');
    const good = await ok(o.c, 'clarify_draft_edit', { p_draft: d.draft, p_statement: `${TAG} #alpha with words` });
    expect(good.status).toBe('ok');
  });
});

describe('V1 (round 4) an anchor-less New point thread keeps the reply as its source', () => {
  it('a note typed in the Mirror after the thread was started does not become the run source', async () => {
    const r = await mk('V1');
    const mir = await mirrorOf(r);
    const s = await ok(r.c, 'clarify_start_chat', { p_conversation: mir, p_draft: false });
    expect(s).toMatchObject({ status: 'started', draft_id: null });
    await typed(r, mir, 'v1 older unrelated note in the main chat');
    const first = await ok(r.c, 'clarify_message', { p_thread_root: s.thread_root_id, p_text: `${TAG} v1 the reply itself` });
    expect(first.status).toBe('started');
    const run = await ok(A, '_clarify_begin', { p_draft: first.draft_id });
    expect(run.status).toBe('run');
    expect(run.source_message.text, JSON.stringify(run.source_message)).toContain('v1 the reply itself');
    await settle(r);
  });
});

describe('V2 (round 4) a stored recording is read whole', () => {
  it('a 3-line recording: every line is in the run payload', async () => {
    const r = await mk('V2');
    const mir = await mirrorOf(r);
    const root = await admin.from('chat_messages').insert({ conversation_id: mir, author_id: null, body: 'session|2026-11-25T10:00:00Z|1', kind: 'message', system_kind: 'outside_rounds', created_at: new Date().toISOString() }).select('id').single();
    expect(root.error).toBeNull();
    const lines = ['v2 spoken line one', 'v2 spoken line two', 'v2 spoken line three'];
    for (const t of lines) {
      const ln = await admin.from('chat_messages').insert({ conversation_id: mir, author_id: r.id, body: `${TAG} ${t}`, kind: 'message', thread_root_id: root.data!.id, is_transcription: true, created_at: new Date().toISOString() });
      expect(ln.error).toBeNull();
    }
    const s = await ok(r.c, 'clarify_start_chat', { p_conversation: mir, p_draft: true });
    const run = await ok(A, '_clarify_begin', { p_draft: s.draft_id });
    expect(run.status).toBe('run');
    const all = JSON.stringify([run.source_message, run.thread, run.surrounding_chat]);
    for (const t of lines) expect(all, t).toContain(t);
    expect(JSON.stringify(run.thread), 'the recording is the thread, not surrounding chat').toContain('v2 spoken line one');
    await settle(r);
  });
});

describe('R2 (round 2) the 20-tag limit holds for derived tags too', () => {
  it('a statement with 21 #tags and p_tags NULL is refused; 20 is accepted', async () => {
    const src = await typed(o, mirror, 'r2 typed');
    const d = await madeDraft(o, src, 'r2');
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#t${String(i).padStart(2, '0')}x`).join(' ');
    const bad = await o.c.rpc('clarify_draft_edit', { p_draft: d.draft, p_statement: `${TAG} ${tags(21)}` });
    expect(bad.error?.message, JSON.stringify(bad)).toContain('bad tags');
    const good = await ok(o.c, 'clarify_draft_edit', { p_draft: d.draft, p_statement: `${TAG} ${tags(20)}` });
    expect(good.tags).toHaveLength(20);
  });
});

describe('S12 server refusals and public reads', () => {
  it('clarify_start refuses a forwarded copy, a shared card, a Mirror agent reply and a reply inside a Clarify thread', async () => {
    const src = await typed(o, mirror, 's12 base');
    const d = await madeDraft(o, src, 's12');
    await settle(o);
    const rows: Record<string, string> = {};
    rows.forwarded = await typed(o, mirror, 's12 forwarded', { forwarded_from_message_id: src, forward_snapshot: { body: 'x', author_name: 'x' } });
    rows.card = await typed(o, mirror, 's12 card', { attachment_kind: 'point', attachment_id: d.point });
    rows.agent = (await admin.from('chat_messages').insert({ conversation_id: mirror, author_id: null, body: `${TAG} agent`, kind: 'agent', reply_to_id: src, thread_root_id: src, created_at: new Date().toISOString() }).select('id').single()).data!.id as string;
    rows.inClarify = await typed(o, mirror, 's12 inside clarify thread', { thread_root_id: d.root });
    for (const [name, id] of Object.entries(rows)) {
      const { error } = await rpc(o.c, 'clarify_start', { p_source: id });
      expect(error?.message, name).toContain('clarify: not available');
    }
  });

  it('a signed-out reader sees a public Clarify point and not a private one; the profile listing query includes only the public one; an outsider can add their story to the public one', async () => {
    const pubSrc = await typed(o, mirror, 's12 public source');
    const pubD = await madeDraft(o, pubSrc, 's12-public');
    await setVis(o, pubD.draft, 'public');
    expect((await publish(o, pubD.draft, 'public', false)).status).toBe('published');
    const pubPoint = (await draftRow(pubD.draft)).point_id as string;
    const privD = await madeDraft(o, await typed(o, mirror, 's12 private source'), 's12-private');
    const anon = createClient(URL_, ANON, noSession);
    expect((await anon.from('points').select('id').eq('id', pubPoint)).data).toHaveLength(1);
    expect((await anon.from('points').select('id').eq('id', privD.point)).data).toHaveLength(0);
    const listing = (await o.c.from('points').select('id').eq('first_validator_id', o.id).eq('visibility', 'public').in('id', [pubPoint, privD.point])).data!;
    expect(listing.map((r) => r.id)).toEqual([pubPoint]);
    const st = await admin.from('stories').insert({ author_id: k.id, content: `${TAG} outsider story`, visibility: 'private' }).select('id').single();
    expect(st.error).toBeNull();
    expect((await k.c.from('story_points').insert({ story_id: st.data!.id, point_id: pubPoint, author_id: k.id })).error).toBeNull();
  });
});
