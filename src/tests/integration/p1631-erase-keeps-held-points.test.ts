/**
 * P1631 account erasure keeps a private point other people hold a position on (migration 20261113130000_p1631_erase_keeps_held_points.sql) on the test database.
 *   npm run test:integration -- src/tests/integration/p1631-erase-keeps-held-points.test.ts
 * The real path is used: the erased person calls erase_my_account() with their own session, so the profile delete (the foreign key change) is part of what is proved.
 * Every case has a control that differs in exactly the one fact the rule turns on (does anyone other than the erased person hold a position on the point).
 * Fixtures follow p1631-clarify-scope.test.ts; the model is never called.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1631 erase keeps ${RUN}`;
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
  const u = await createTestUser({ name: `P1631 erase ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u), id: u.user.id as string };
}
type Who = Awaited<ReturnType<typeof mk>>;

const convIds: string[] = [];
async function dm(x: Who, y: Who): Promise<string> {
  const [lo, hi] = [x.id, y.id].sort();
  const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: x.id }).select('id').single();
  if (made.error) throw new Error(`fixture dm: ${made.error.message}`);
  convIds.push(made.data.id as string);
  return made.data.id as string;
}
const send = (who: Who, conv: string, body: string) => ok(who.c, 'send_chat_message', { p_conversation: conv, p_body: body, p_client_id: randomUUID() });
const draftRow = async (id: string) => (await admin.from('clarify_drafts').select('*').eq('id', id).single()).data as Row;
const goodResult = (stmt: string, ids: { a?: string[]; b?: string[] } = {}) => ({ decision: 'draft', statement: stmt, cited: { a: ids.a ?? [], b: ids.b ?? [] } });
/** the author ref the engine stores in derived_refs (_chat_author_ref) */
const refOf = (id: string) => createHash('sha256').update(`p1512:${id}`, 'utf8').digest('hex');
const pointRows = async (id: string) => (await admin.from('points').select('id, first_validator_id, visibility').eq('id', id)).data as Row[];
const positionsOn = async (point: string) => (await admin.from('point_positions').select('user_id, position').eq('point_id', point)).data as Row[];

/** `who`'s done draft on `source`, with a position when `position` is given */
async function madeDraft(who: Who, source: string, label: string, position: 'agree' | null = 'agree') {
  await admin.from('clarify_drafts').update({ state: 'failed', error_code: 'test_cleanup' }).eq('owner_id', who.id).in('state', ['queued', 'running']);
  await admin.from('mirror_ai_spend').delete().eq('owner_id', who.id).eq('bucket', 'canvas');
  const s = await ok(who.c, 'clarify_start', { p_source: source });
  if (s.status !== 'started') throw new Error(`clarify_start answered ${s.status}`);
  await ok(A, '_clarify_begin', { p_draft: s.draft_id });
  const done = await ok(A, '_clarify_complete', {
    p_draft: s.draft_id, p_result: goodResult(`${TAG} ${label}`, { a: [source] }), p_usd: 0.01, p_run: (await draftRow(s.draft_id)).spend_id,
  });
  if (done.status !== 'done') throw new Error(`complete answered ${JSON.stringify(done)}`);
  if (position) {
    const up = await who.c.from('point_positions').upsert({ point_id: done.point_id, user_id: who.id, position }, { onConflict: 'point_id,user_id' });
    if (up.error) throw new Error(`position: ${up.error.message}`);
  }
  return { draft: s.draft_id as string, point: done.point_id as string };
}
async function eraseAccount(who: Who) {
  const { error } = await who.c.rpc('erase_my_account');
  expect(error, `erase_my_account must succeed: ${error?.message}`).toBeNull();
}

const orgIds: string[] = [];
/** a group chat of `members` (organization + accepted memberships, as p1631-publish.test.ts builds one); the chat is cleaned with its organization */
async function groupOf(members: Who[], slug: string): Promise<string> {
  const o = await admin.from('organization').insert({ slug: `p1631-er-${slug}-${RUN}`, name: `${TAG} org ${slug}` }).select('id').single();
  if (o.error) throw new Error(`fixture org: ${o.error.message}`);
  orgIds.push(o.data.id as string);
  const old = new Date(Date.now() - 3_600_000).toISOString();
  for (const m of members) {
    const r = await admin.from('membership').insert({ org_id: o.data.id, user_id: m.id, accepted_at: old });
    if (r.error) throw new Error(`fixture membership: ${r.error.message}`);
  }
  const have = await admin.from('chat_conversations').select('id').eq('kind', 'group').eq('org_id', o.data.id).maybeSingle();
  if (have.data) return have.data.id as string;
  const g = await admin.from('chat_conversations').insert({ kind: 'group', org_id: o.data.id }).select('id').single();
  if (g.error) throw new Error(`fixture group: ${g.error.message}`);
  return g.data.id as string;
}
let m13: Who; let n14: Who; let o15: Who; let p16: Who; let q17: Who; let r18: Who; let s19: Who;
let k11: Who; let l12: Who; let a: Who; let b: Who; let c3: Who; let d4: Who; let e5: Who; let f6: Who; let g7: Who; let h8: Who; let i9: Who; let j10: Who;
beforeAll(async () => {
  a = await mk('A'); b = await mk('B'); c3 = await mk('C'); d4 = await mk('D'); e5 = await mk('E');
  m13 = await mk('M'); n14 = await mk('N'); o15 = await mk('O'); p16 = await mk('P'); q17 = await mk('Q'); r18 = await mk('R'); s19 = await mk('S');
  k11 = await mk('K'); l12 = await mk('L'); f6 = await mk('F'); g7 = await mk('G'); h8 = await mk('H'); i9 = await mk('I'); j10 = await mk('J');
});
afterAll(async () => {
  const ids = users.map((u) => u.user.id);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
  if (convIds.length) await admin.from('chat_conversations').delete().in('id', convIds);
  if (orgIds.length) await admin.from('organization').delete().in('id', orgIds);
  await deleteTestUsers(ids);
});

describe('P1631 erasure keeps a held point (1): a cited person (a draft read their words) is erased', () => {
  it('B erases: the point stays with A\'s position, B\'s position goes, the draft stays and loses only B\'s ref and citations', async () => {
    const conv = await dm(a, b);
    const theirs = await send(b, conv, `${TAG} B said this`);
    const d = await madeDraft(a, theirs.id, 'kept, held by A and B');
    const pub = await ok(a.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() });
    expect(pub.status).toBe('published');
    const up = await b.c.from('point_positions').upsert({ point_id: d.point, user_id: b.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(up.error, 'B may take a position on a published point').toBeNull();
    // premise: the draft read B's words
    const before = await draftRow(d.draft);
    expect(before.derived_refs).toContain(refOf(b.id));

    await eraseAccount(b);

    expect(await pointRows(d.point), 'the point stays').toHaveLength(1);
    expect((await positionsOn(d.point)).map((p) => p.user_id), 'A holds, B is gone').toEqual([a.id]);
    const after = await draftRow(d.draft);
    expect(after).toMatchObject({ state: 'done', point_id: d.point });
    expect(after.derived_refs, 'nothing of B is left on the draft').not.toContain(refOf(b.id));
    expect(after.suggestions, 'the draft is not cleared').toEqual(before.suggestions);
    expect(before.sent_ids, 'premise: B\'s row was sent to the model').toContain(theirs.id);
    expect(after.sent_ids, 'B\'s row is no longer a citation source').not.toContain(theirs.id);
    expect(JSON.stringify(after.cited), 'and no longer cited').not.toContain(theirs.id);
  });

  it('a cited person is erased and nobody holds a position on the point: it stays anyway (the author\'s sentence)', async () => {
    const conv = await dm(c3, d4);
    const theirs = await send(d4, conv, `${TAG} D said this`);
    const d = await madeDraft(c3, theirs.id, 'held by nobody', null);
    expect((await draftRow(d.draft)).derived_refs).toContain(refOf(d4.id));
    expect(await positionsOn(d.point)).toHaveLength(0);

    await eraseAccount(d4);

    expect(await pointRows(d.point), 'cited, not the author: it stays').toHaveLength(1);
    const after = await draftRow(d.draft);
    expect(after).toMatchObject({ state: 'done', point_id: d.point });
    expect(after.derived_refs).not.toContain(refOf(d4.id));
  });

  it('CONTROL: a draft still RUNNING on the erased person\'s words is failed and cleared as before', async () => {
    const conv = await dm(k11, l12);
    const theirs = await send(l12, conv, `${TAG} L said this`);
    await admin.from('mirror_ai_spend').delete().eq('owner_id', k11.id).eq('bucket', 'canvas');
    const s = await ok(k11.c, 'clarify_start', { p_source: theirs.id });
    expect(s.status).toBe('started');
    await ok(A, '_clarify_begin', { p_draft: s.draft_id });
    const live = await draftRow(s.draft_id);
    expect(live.state).toBe('running');
    expect(live.derived_refs).toContain(refOf(l12.id));

    await eraseAccount(l12);

    expect(await draftRow(s.draft_id)).toMatchObject({ state: 'failed', error_code: 'erased', point_id: null, suggestions: null, cited: null, derived_refs: [], sent_ids: [] });
  });
});

describe('P1631 erasure keeps a held point (2): a point the erased person published', () => {
  it('E erases: the point stays readable by F through the card, F\'s position stays, the card has no text and no author', async () => {
    const conv = await dm(e5, f6);
    const src = await send(f6, conv, `${TAG} F said this`);
    const d = await madeDraft(e5, src.id, 'published by E, held by F');
    const pub = await ok(e5.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() });
    expect(pub.status).toBe('published');
    const up = await f6.c.from('point_positions').upsert({ point_id: d.point, user_id: f6.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(up.error).toBeNull();
    expect((await f6.c.from('points').select('id').eq('id', d.point)).data, 'premise: F reads it through the card').toHaveLength(1);

    await eraseAccount(e5);

    expect(await pointRows(d.point), 'the point stays').toHaveLength(1);
    expect((await pointRows(d.point))[0]!.first_validator_id, 'no owner link').toBeNull();
    expect((await positionsOn(d.point)).map((p) => p.user_id), 'F holds, E is gone').toEqual([f6.id]);
    const share = (await admin.from('point_chat_shares').select('*').eq('point_id', d.point)).data as Row[];
    expect(share, 'the share row outlives its publisher').toHaveLength(1);
    expect(share[0]!.shared_by, 'with nothing of E on it').toBeNull();
    const card = (await admin.from('chat_messages').select('*').eq('id', pub.message_id).single()).data as Row;
    expect(card).toMatchObject({ body: null, author_id: null, deleted_at: null, attachment_kind: 'point', attachment_id: d.point });
    expect((await f6.c.from('points').select('id').eq('id', d.point)).data, 'F still reads the point via the card').toHaveLength(1);
    const listed = await ok(f6.c, 'list_chat_points', { p_conversation: conv });
    expect(listed.map((r: Row) => r.point_id)).toContain(d.point);
    expect(listed.find((r: Row) => r.point_id === d.point).shared_by).toBeNull();

    // the last holder erases too: the kept point is orphaned and goes with them
    await eraseAccount(f6);
    expect(await pointRows(d.point), 'no holder left: gone').toHaveLength(0);
  });

  it('CONTROL: G publishes, nobody else holds a position, G erases: the point and its share are deleted as before', async () => {
    const conv = await dm(g7, h8);
    const src = await send(h8, conv, `${TAG} H said this`);
    const d = await madeDraft(g7, src.id, 'published by G, held by nobody else');
    const pub = await ok(g7.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() });
    expect(pub.status).toBe('published');
    expect(await positionsOn(d.point)).toHaveLength(1);

    await eraseAccount(g7);

    expect(await pointRows(d.point)).toHaveLength(0);
    expect((await admin.from('point_chat_shares').select('message_id').eq('point_id', d.point)).data).toHaveLength(0);
    expect((await admin.from('chat_messages').select('attachment_id, deleted_at').eq('id', pub.message_id).single()).data).toMatchObject({ attachment_id: null });
  });
});

describe('P1631 erasure keeps a held point (3): a public point is unaffected', () => {
  it('I erases: the public point stays, orphaned', async () => {
    const p = await admin.from('points').insert({ statement: `${TAG} public`, first_validator_id: i9.id, visibility: 'public' }).select('id').single();
    expect(p.error).toBeNull();
    const up = await admin.from('point_positions').insert({ point_id: p.data!.id, user_id: j10.id, position: 'agree' });
    expect(up.error).toBeNull();

    await eraseAccount(i9);

    const rows = await pointRows(p.data!.id as string);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.first_validator_id).toBeNull();
    expect((await positionsOn(p.data!.id as string)).map((x) => x.user_id)).toEqual([j10.id]);
  });
});

describe('P1631 erasure review fixes: the sweep in a chat that survives (a group), its scope, and refused drafts', () => {
  /** E publishes in `group`, F takes a position; E erases (the point is kept), leaving F the last holder */
  async function keptPoint(group: string, e: Who, f: Who, label: string) {
    const src = await send(f, group, `${TAG} ${label} F said this`);
    const d = await madeDraft(e, src.id, label);
    const pub = await ok(e.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() });
    expect(pub.status).toBe('published');
    const up = await f.c.from('point_positions').upsert({ point_id: d.point, user_id: f.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(up.error).toBeNull();
    await eraseAccount(e);
    expect(await pointRows(d.point), 'premise: kept after the publisher erased').toHaveLength(1);
    expect((await admin.from('point_chat_shares').select('shared_by').eq('point_id', d.point)).data).toEqual([{ shared_by: null }]);
    return d;
  }

  it('GROUP: the last holder erases and the group chat survives, so the sweep in _point_chat_erase_author removes the point', async () => {
    const group = await groupOf([m13, n14, o15], 'last');
    const d = await keptPoint(group, m13, n14, 'group-last');
    await eraseAccount(n14);
    expect(await pointRows(d.point), 'no holder and no author left: gone').toHaveLength(0);
    expect((await admin.from('chat_conversations').select('id').eq('id', group)).data, 'the group chat itself stays (O is still in it)').toHaveLength(1);
  });

  it('F3 CONTROL: the last holder un-held earlier; an unrelated member erasing does not delete the point under its live card', async () => {
    const group = await groupOf([p16, q17, o15], 'scope');
    const d = await keptPoint(group, p16, q17, 'group-scope');
    // Q takes the position back in its own transaction, so the point has no holder at all
    const un = await q17.c.from('point_positions').delete().eq('point_id', d.point).eq('user_id', q17.id);
    expect(un.error).toBeNull();
    expect(await positionsOn(d.point)).toHaveLength(0);

    await eraseAccount(o15);

    expect(await pointRows(d.point), 'O never held it: untouched').toHaveLength(1);
    expect((await admin.from('point_chat_shares').select('point_id').eq('point_id', d.point)).data).toHaveLength(1);
  });

  it('F5: a refused draft that read the erased person loses its suggestions and keeps its state', async () => {
    const conv = await dm(r18, s19);
    const theirs = await send(s19, conv, `${TAG} S said this`);
    await admin.from('mirror_ai_spend').delete().eq('owner_id', r18.id).eq('bucket', 'canvas');
    const s = await ok(r18.c, 'clarify_start', { p_source: theirs.id });
    expect(s.status).toBe('started');
    await ok(A, '_clarify_begin', { p_draft: s.draft_id });
    const done = await ok(A, '_clarify_complete', { p_draft: s.draft_id, p_result: { decision: 'refuse', suggestions: ['one', 'two'] }, p_usd: 0.01, p_run: (await draftRow(s.draft_id)).spend_id });
    expect(done.status).toBe('refused');
    const before = await draftRow(s.draft_id);
    expect(before.suggestions).toEqual(['one', 'two']);
    expect(before.derived_refs).toContain(refOf(s19.id));

    await eraseAccount(s19);

    const after = await draftRow(s.draft_id);
    expect(after.state).toBe('refused');
    expect(after.suggestions, 'model text made from S\'s words is gone').toBeNull();
    expect(after.derived_refs).not.toContain(refOf(s19.id));
  });
});
