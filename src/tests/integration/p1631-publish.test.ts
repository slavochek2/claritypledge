/**
 * P1631 A9: Publish to chat (migration 20261112150000_p1631_publish_to_chat.sql) on the test database.
 *   npm run test:integration -- src/tests/integration/p1631-publish.test.ts
 * Fixtures: a 1:1 A-B (written directly, as p1631-clarify-drafts.test.ts does), a second 1:1 B-C, a stranger C to the first chat, and an anonymous client.
 * The model is not involved: drafts are begun and completed through the service-role worker functions with hand-written results.
 * A group block (organization + membership) covers a later joiner, a removed member, stories, history writes, re-share and client id reuse (migration 20261112170000_p1631_publish_fixes.sql).
 * Not built here (it.todo): the EXPLAIN of the feed (the main session measures it).
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1631 pub ${RUN}`;
const noSession = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, noSession);
const A = admin as unknown as SupabaseClient;
const anon = createClient(URL_, ANON, noSession);

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
  const u = await createTestUser({ name: `P1631 pub ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u), id: u.user.id as string };
}
type Who = Awaited<ReturnType<typeof mk>>;

let a: Who;
let b: Who;
let c3: Who;
let conv: string;
let convBC: string;
const msgs: Row[] = [];

async function dm(x: Who, y: Who): Promise<string> {
  const [lo, hi] = [x.id, y.id].sort();
  const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: x.id }).select('id').single();
  if (made.error) throw new Error(`fixture dm: ${made.error.message}`);
  return made.data.id as string;
}
const draftRow = async (id: string) => (await admin.from('clarify_drafts').select('*').eq('id', id).single()).data as Row;
const goodResult = (stmt: string, ids: { a?: string[]; b?: string[] } = {}) => ({ decision: 'draft', statement: stmt, cited: { a: ids.a ?? [], b: ids.b ?? [] } });

/** A's done draft on a pressed message, with a point; A sets a position on it when `position` is given. */
async function madeDraft(source: string, label: string, position: 'agree' | null = 'agree') {
  // the suite's one user makes more runs than a person's daily cap allows: settled spend rows go
  await admin.from('mirror_ai_spend').delete().eq('owner_id', a.id).eq('bucket', 'canvas');
  const s = await ok(a.c, 'clarify_start', { p_source: source });
  if (s.status !== 'started') throw new Error(`clarify_start answered ${s.status}`);
  await ok(A, '_clarify_begin', { p_draft: s.draft_id });
  const run = (await draftRow(s.draft_id)).spend_id as string | null;
  const done = await ok(A, '_clarify_complete', { p_draft: s.draft_id, p_result: goodResult(`${TAG} ${label}`, { a: [source] }), p_usd: 0.01, p_run: run });
  if (done.status !== 'done') throw new Error(`complete answered ${JSON.stringify(done)}`);
  if (position) {
    const up = await a.c.from('point_positions').upsert({ point_id: done.point_id, user_id: a.id, position }, { onConflict: 'point_id,user_id' });
    if (up.error) throw new Error(`position: ${up.error.message}`);
  }
  return { draft: s.draft_id as string, point: done.point_id as string, root: s.thread_root_id as string };
}
const shares = async (point: string) => (await admin.from('point_chat_shares').select('*').eq('point_id', point)).data as Row[];
const readable = async (c: SupabaseClient, point: string) => (await c.from('points').select('id').eq('id', point)).data ?? [];

beforeAll(async () => {
  a = await mk('A');
  b = await mk('B');
  c3 = await mk('C');
  conv = await dm(a, b);
  convBC = await dm(b, c3);
  const send = async (who: Who, body: string, extra: Row = {}) => {
    const r = await ok(who.c, 'send_chat_message', { p_conversation: conv, p_body: body, p_client_id: randomUUID(), ...extra });
    msgs.push(r);
    return r;
  };
  await send(b, `${TAG} wait a month before the pricing change`);
  await send(a, `${TAG} waiting costs us the quarter`);
  await send(b, `${TAG} pricing needs a trial first`);
  await send(b, `${TAG} a reply in the thread`, { p_thread_root: msgs[0]!.id });
});

afterAll(async () => {
  const ids = users.map((u) => u.user.id);
  await admin.from('stories').delete().like('title', `${TAG}%`);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
  await deleteTestUsers(ids);
});

// A group chat (organization + membership), run BEFORE the main block: that block ends by erasing A.
describe('P1631 publish to chat: a group (history rule, removal, later joiner) and the fixes migration', () => {
  let d: Who;
  let org: string;
  let gconv: string;
  let card: { draft: string; point: string; root: string };
  let cardMsg: string;
  const privateStory = async (who: Who, label: string) => {
    const s = await admin.from('stories').insert({ author_id: who.id, content: `${TAG} story ${label}`, visibility: 'private' }).select('id').single();
    if (s.error) throw new Error(`fixture story: ${s.error.message}`);
    return s.data.id as string;
  };
  const link = (who: Who, story: string, point: string) => who.c.from('story_points').insert({ story_id: story, point_id: point, author_id: who.id });

  beforeAll(async () => {
    d = await mk('D');
    const o = await admin.from('organization').insert({ slug: `p1631-${RUN}`, name: `${TAG} org` }).select('id').single();
    if (o.error) throw new Error(`fixture org: ${o.error.message}`);
    org = o.data.id as string;
    const old = new Date(Date.now() - 3_600_000).toISOString();
    for (const who of [a, b, c3]) {
      const m = await admin.from('membership').insert({ org_id: org, user_id: who.id, accepted_at: old });
      if (m.error) throw new Error(`fixture membership: ${m.error.message}`);
    }
    // the group chat may already exist (a trigger or a sweep); otherwise it is made here
    const have = await admin.from('chat_conversations').select('id').eq('kind', 'group').eq('org_id', org).maybeSingle();
    if (have.data) gconv = have.data.id as string;
    else {
      const g = await admin.from('chat_conversations').insert({ kind: 'group', org_id: org }).select('id').single();
      if (g.error) throw new Error(`fixture group chat: ${g.error.message}`);
      gconv = g.data.id as string;
    }
    const src = await ok(a.c, 'send_chat_message', { p_conversation: gconv, p_body: `${TAG} group message`, p_client_id: randomUUID() });
    card = await madeDraft(src.id, 'group card');
    const pub = await ok(a.c, 'clarify_publish', { p_draft: card.draft, p_client_id: randomUUID() });
    expect(pub).toMatchObject({ status: 'published', conversation_id: gconv });
    cardMsg = pub.message_id as string;
    // D joins AFTER the card: accepted_at is later than the card's created_at
    const dm_ = await admin.from('membership').insert({ org_id: org, user_id: d.id });
    if (dm_.error) throw new Error(`fixture later joiner: ${dm_.error.message}`);
  });

  afterAll(async () => {
    await admin.from('organization').delete().eq('id', org);
  });

  it('(a) a later joiner D cannot read the point, its positions or the card, and cannot write a position', async () => {
    expect(await readable(d.c, card.point)).toHaveLength(0);
    expect((await d.c.from('point_positions').select('id').eq('point_id', card.point)).data).toHaveLength(0);
    expect((await d.c.from('chat_messages').select('id').eq('id', cardMsg)).data).toHaveLength(0);
    expect(await ok(d.c, 'list_chat_points', { p_conversation: gconv })).toEqual([]);
    expect(await ok(d.c, 'point_chat_shared', { p_point: card.point })).toBe(false);
    const w = await d.c.from('point_positions').upsert({ point_id: card.point, user_id: d.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(w.error).toBeTruthy();
  });

  it('(c) a member B reads and writes; point_chat_shared is true for B and for the author', async () => {
    expect(await readable(b.c, card.point)).toHaveLength(1);
    const w = await b.c.from('point_positions').upsert({ point_id: card.point, user_id: b.id, position: 'disagree' }, { onConflict: 'point_id,user_id' });
    expect(w.error).toBeNull();
    expect(await ok(b.c, 'point_chat_shared', { p_point: card.point })).toBe(true);
    expect(await ok(a.c, 'point_chat_shared', { p_point: card.point })).toBe(true);
  });

  it('(d) a non-reader cannot link a story to the shared point; the owner and a member can (their own private story)', async () => {
    const dStory = await privateStory(d, 'D');
    const refused = await link(d, dStory, card.point);
    expect(refused.error, 'a person who cannot read the point cannot link a story').toBeTruthy();
    expect((await admin.from('story_points').select('story_id').eq('story_id', dStory)).data).toHaveLength(0);
    expect((await link(a, await privateStory(a, 'A'), card.point)).error).toBeNull();
    expect((await link(b, await privateStory(b, 'B'), card.point)).error).toBeNull();
  });

  it('(b) a removed member C loses read and position writes, including the UPDATE of their existing position', async () => {
    const own = await c3.c.from('point_positions').upsert({ point_id: card.point, user_id: c3.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(own.error).toBeNull();
    const gone = await admin.from('membership').delete().eq('org_id', org).eq('user_id', c3.id);
    expect(gone.error).toBeNull();
    expect(await readable(c3.c, card.point)).toHaveLength(0);
    // everyone always sees their own position row (the existing own-row policy); nobody else's
    expect((await c3.c.from('point_positions').select('id').eq('point_id', card.point).neq('user_id', c3.id)).data).toHaveLength(0);
    const w = await c3.c.from('point_positions').upsert({ point_id: card.point, user_id: c3.id, position: 'disagree' }, { onConflict: 'point_id,user_id' });
    expect(w.error).toBeTruthy();
    await c3.c.from('point_positions').update({ position: 'disagree' }).eq('point_id', card.point).eq('user_id', c3.id);
    expect((await admin.from('point_positions').select('position').eq('point_id', card.point).eq('user_id', c3.id).single()).data?.position, 'the update changed nothing').toBe('agree');
    const story = await link(c3, await privateStory(c3, 'C'), card.point);
    expect(story.error, 'a removed member cannot link a story').toBeTruthy();
  });

  it('(e) an authenticated client cannot insert into point_position_history', async () => {
    const r = await b.c.from('point_position_history').insert({ point_id: card.point, user_id: b.id, position: 'agree' });
    expect(r.error).toBeTruthy();
  });

  it('(f) point_share_to_chat no longer exists (dropped 20261113150000): calling it as its author is a missing-function error, not a permission error', async () => {
    const r = await rpc(a.c, 'point_share_to_chat', { p_point: card.point, p_conversation: gconv });
    expect(r.error).toBeTruthy();
    expect(r.error?.code).not.toBe('42501');
    expect(['PGRST202', '42883']).toContain(r.error?.code);
  });

  it('(g) a client id already used by a text message is refused client_id_reused and writes no share', async () => {
    const src = await ok(a.c, 'send_chat_message', { p_conversation: gconv, p_body: `${TAG} second group message`, p_client_id: randomUUID() });
    const fresh = await madeDraft(src.id, 'reuse');
    const cid = randomUUID();
    await ok(a.c, 'send_chat_message', { p_conversation: gconv, p_body: `${TAG} a plain text with the id`, p_client_id: cid });
    const r = await ok(a.c, 'clarify_publish', { p_draft: fresh.draft, p_client_id: cid });
    expect(r).toMatchObject({ status: 'refused', code: 'client_id_reused' });
    expect(await shares(fresh.point)).toHaveLength(0);
  });

  // Runs LAST in this describe: it removes the author from the group and does not restore them. The next describe uses DMs only.
  it('(h) the author keeps their own point and their own position after leaving the chat; a removed member does not (AC "a person outside the chat")', async () => {
    expect(await readable(a.c, card.point), 'the author reads the point before leaving').toHaveLength(1);
    const before = await a.c.from('point_positions').select('position').eq('point_id', card.point).eq('user_id', a.id).single();
    expect(before.error, 'the author held a position before leaving (publish requires one)').toBeNull();
    const gone = await admin.from('membership').delete().eq('org_id', org).eq('user_id', a.id).select('user_id');
    expect(gone.error).toBeNull();
    expect(gone.data, 'exactly one membership row removed, so the author really left').toHaveLength(1);
    expect(await readable(a.c, card.point), 'the author still reads the point').toHaveLength(1);
    const mine = await a.c.from('point_positions').select('position').eq('point_id', card.point).eq('user_id', a.id).single();
    expect(mine.error).toBeNull();
    expect(mine.data?.position, 'and still sees their own position').toBe(before.data?.position);
    // control, guarded so it cannot silently depend on (b): C is not a member, and the same probe reads nothing for them
    expect((await admin.from('membership').select('user_id').eq('org_id', org).eq('user_id', c3.id)).data, 'C is outside the group').toHaveLength(0);
    expect(await readable(c3.c, card.point), 'control: the removed member C reads nothing').toHaveLength(0);
  });
});

describe('P1631 publish to chat', () => {
  let d1: { draft: string; point: string; root: string };
  let published: Row;

  it('1: publish writes one message and one share row; the point stays private with no tags', async () => {
    d1 = await madeDraft(msgs[2]!.id, 'first');
    published = await ok(a.c, 'clarify_publish', { p_draft: d1.draft, p_client_id: randomUUID() });
    expect(published).toMatchObject({ status: 'published', conversation_id: conv });
    const m = (await admin.from('chat_messages').select('*').eq('id', published.message_id).single()).data as Row;
    expect(m).toMatchObject({ kind: 'message', attachment_kind: 'point', attachment_id: d1.point, author_id: a.id, conversation_id: conv });
    expect(await shares(d1.point)).toHaveLength(1);
    const p = (await admin.from('points').select('*').eq('id', d1.point).single()).data as Row;
    expect(p).toMatchObject({ visibility: 'private', tags: [], system_tags: [] });
  });

  it('2: B reads the point, its positions (with profiles) and history, and sets, updates and removes their own position', async () => {
    expect(await readable(b.c, d1.point)).toHaveLength(1);
    const pos = await b.c.from('point_positions').select('user_id, user:profiles!point_positions_user_id_fkey(id, name)').eq('point_id', d1.point);
    expect(pos.data?.map((r: Row) => r.user_id)).toContain(a.id);
    expect((await b.c.from('point_position_history').select('id').eq('point_id', d1.point)).error).toBeNull();
    const set = await b.c.from('point_positions').upsert({ point_id: d1.point, user_id: b.id, position: 'disagree' }, { onConflict: 'point_id,user_id' });
    expect(set.error).toBeNull();
    const upd = await b.c.from('point_positions').upsert({ point_id: d1.point, user_id: b.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(upd.error).toBeNull();
    expect((await admin.from('point_positions').select('position').eq('point_id', d1.point).eq('user_id', b.id).single()).data?.position).toBe('agree');
    expect((await b.c.from('point_positions').delete().eq('point_id', d1.point).eq('user_id', b.id)).error).toBeNull();
    await b.c.from('point_positions').upsert({ point_id: d1.point, user_id: b.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
  });

  it('3: a source reply in a thread publishes into that thread; a deleted root sends it to the main chat', async () => {
    const t = await madeDraft(msgs[3]!.id, 'thread');
    const r = await ok(a.c, 'clarify_publish', { p_draft: t.draft, p_client_id: randomUUID() });
    expect(r).toMatchObject({ status: 'published', thread_root_id: msgs[0]!.id });
    const t2 = await madeDraft(msgs[3]!.id, 'thread-root-gone');
    // a deleted message is empty (chat_messages_deleted_is_empty), so the fixture clears its words and puts them back afterwards
    const body = msgs[0]!.body as string;
    const gone = await admin.from('chat_messages').update({ deleted_at: new Date().toISOString(), body: null }).eq('id', msgs[0]!.id);
    expect(gone.error).toBeNull();
    const r2 = await ok(a.c, 'clarify_publish', { p_draft: t2.draft, p_client_id: randomUUID() });
    expect(r2.status).toBe('published');
    expect(r2.thread_root_id ?? null).toBeNull();
    const back = await admin.from('chat_messages').update({ deleted_at: null, body }).eq('id', msgs[0]!.id);
    expect(back.error).toBeNull();
  });

  it('4: list_chat_points lists the live card for both members', async () => {
    for (const who of [a, b]) {
      const list = await ok(who.c, 'list_chat_points', { p_conversation: conv });
      expect(list.map((x: Row) => x.point_id)).toContain(d1.point);
    }
  });

  it('5: a second publish answers already with the same message; the same client id makes the same row', async () => {
    const again = await ok(a.c, 'clarify_publish', { p_draft: d1.draft, p_client_id: randomUUID() });
    expect(again).toMatchObject({ status: 'already', message_id: published.message_id });
    expect(await shares(d1.point)).toHaveLength(1);
  });

  it('6: refusals: no_position, no_point, a stranger (42501)', async () => {
    const np = await madeDraft(msgs[1]!.id, 'no-position', null);
    expect(await ok(a.c, 'clarify_publish', { p_draft: np.draft })).toMatchObject({ status: 'refused', code: 'no_position' });
    expect((await rpc(c3.c, 'clarify_publish', { p_draft: np.draft })).error?.code).toBe('42501');
    const gone = await ok(a.c, 'clarify_start', { p_source: msgs[0]!.id });
    await ok(A, '_clarify_begin', { p_draft: gone.draft_id });
    await ok(A, '_clarify_fail', { p_draft: gone.draft_id, p_code: 'test_cleanup', p_usd: 0, p_run: (await draftRow(gone.draft_id)).spend_id });
    expect(await ok(a.c, 'clarify_publish', { p_draft: gone.draft_id })).toMatchObject({ status: 'refused', code: 'no_point' });
  });
  // 6 (needs_target, earlier_version) and 7 are in the describe at the end of the file ("fixtures of their own").

  it('8: edit and delete are refused as published; the wording is unchanged', async () => {
    expect(await ok(a.c, 'clarify_draft_edit', { p_draft: d1.draft, p_statement: `${TAG} reworded` })).toMatchObject({ status: 'refused', code: 'published' });
    expect(await ok(a.c, 'clarify_draft_delete', { p_draft: d1.draft })).toMatchObject({ status: 'refused', code: 'published' });
    expect((await admin.from('points').select('statement').eq('id', d1.point).single()).data?.statement).toBe(`${TAG} first`);
  });

  it('9-12: a stranger (C) reads no point, no positions, no history, no card; cannot write a position', async () => {
    expect(await readable(c3.c, d1.point)).toHaveLength(0);
    expect((await c3.c.from('point_positions').select('id').eq('point_id', d1.point)).data).toHaveLength(0);
    expect((await c3.c.from('point_position_history').select('id').eq('point_id', d1.point)).data).toHaveLength(0);
    expect((await c3.c.from('chat_messages').select('id').eq('id', published.message_id)).data).toHaveLength(0);
    expect(await ok(c3.c, 'list_chat_points', { p_conversation: conv })).toEqual([]);
    expect((await ok(c3.c, 'get_clarify_thread', { p_thread_root: d1.root })).drafts).toEqual([]);
    const w = await c3.c.from('point_positions').upsert({ point_id: d1.point, user_id: c3.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(w.error, 'a stranger cannot take a position').toBeTruthy();
  });

  it('13: B cannot attach A\'s private point in another chat', async () => {
    const r = await rpc(b.c, 'send_chat_message', { p_conversation: convBC, p_body: null, p_attachment_kind: 'point', p_attachment_id: d1.point, p_client_id: randomUUID() });
    expect(r.error?.message).toMatch(/attachment not available/);
  });

  it('14: a forward of the card fails for B and for A; point_share_to_chat by B is a missing-function error', async () => {
    const fb = await rpc(b.c, 'forward_chat_message', { p_source: published.message_id, p_target_conversation: convBC });
    expect(fb.error?.message).toMatch(/attachment not available/);
    const fa = await rpc(a.c, 'forward_chat_message', { p_source: published.message_id, p_target_conversation: conv });
    expect(fa.error?.message).toMatch(/attachment not available/);
    expect(['PGRST202', '42883']).toContain((await rpc(b.c, 'point_share_to_chat', { p_point: d1.point, p_conversation: convBC })).error?.code);
  });

  it('15: B\'s Mirror copy of the card grants C nothing', async () => {
    const clar = await rpc(b.c, 'clarify_start', { p_source: published.message_id });
    // a copy of the card message either is refused or carries no access: C still reads nothing
    if (clar.error) expect(clar.error.code).toBeTruthy();
    expect(await readable(c3.c, d1.point)).toHaveLength(0);
  });

  it('16: an anonymous reader gets no private point, public points still work', async () => {
    expect((await anon.from('points').select('id').eq('id', d1.point)).data ?? []).toHaveLength(0);
    expect((await anon.from('points').select('id').eq('visibility', 'public').limit(1)).error).toBeNull();
  });

  it('17: deleting the card ends B\'s read; deleting the draft later keeps the point while B holds a position', async () => {
    // the author deletes the card the way the app does
    await ok(a.c, 'delete_chat_message', { p_message: published.message_id });
    expect(await readable(b.c, d1.point)).toHaveLength(0);
    expect(await ok(a.c, 'clarify_draft_edit', { p_draft: d1.draft, p_statement: `${TAG} again` }), 'frozen even after the card is gone').toMatchObject({ code: 'published' });
    const del = await ok(a.c, 'clarify_draft_delete', { p_draft: d1.draft });
    expect(del).toMatchObject({ status: 'ok', point_kept: true });
  });

  // 19 asserted this on an unpublished Clarify draft, which 20261112200000 (spec review, Codex 2 / Gemini 10) closes: a Clarify draft takes
  // positions from its owner only until it is published. The letters guarantee it named holds for a private point that is not a Clarify draft.
  it('19: a position on a private point that was never shared, and is not a Clarify draft, is still writable (letters rely on it)', async () => {
    const lone = await admin.from('points').insert({ statement: `${TAG} letter-style private`, first_validator_id: a.id, visibility: 'private' }).select('id').single();
    expect(lone.error).toBeNull();
    const w = await b.c.from('point_positions').upsert({ point_id: lone.data!.id, user_id: b.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(w.error).toBeNull();
  });
  it('19b: an unpublished Clarify draft takes a position from its owner only', async () => {
    const lone = await madeDraft(msgs[1]!.id, 'never-shared', null);
    const w = await b.c.from('point_positions').upsert({ point_id: lone.point, user_id: b.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(w.error).not.toBeNull();
    expect((await admin.from('point_positions').select('id').eq('point_id', lone.point).eq('user_id', b.id)).data).toHaveLength(0);
    const own = await a.c.from('point_positions').upsert({ point_id: lone.point, user_id: a.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(own.error).toBeNull();
  });

  it('18: erasing the author deletes the private points they published, with their shares', async () => {
    const d = await madeDraft(msgs[2]!.id, 'to-erase');
    const r = await ok(a.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() });
    expect(r.status).toBe('published');
    await ok(A, 'erase_chat_data_for', { p_uid: a.id });
    expect((await admin.from('points').select('id').eq('id', d.point)).data).toHaveLength(0);
    expect(await shares(d.point)).toHaveLength(0);
  });
  // 18b is in the describe at the end of the file (its own users: A is erased above).
  it.todo('20: EXPLAIN of the feed query shows one subplan for chat_shared_point_ids; needs the plan text from a service-role SQL path that the test client does not have');
});

// Fixtures of their own: users and chats that nothing above touches (A is erased by test 18, so these cannot share A).
describe('P1631 publish to chat: refusals, erasure of a cited person, an event chat', () => {
  let x: Who;
  let y: Who;
  let z: Who;
  let xy: string;
  const orgs: string[] = [];
  const eventIds: string[] = [];

  const settleX = async (who: Who) => {
    await admin.from('clarify_drafts').update({ state: 'failed', error_code: 'test_cleanup' }).eq('owner_id', who.id).in('state', ['queued', 'running']);
    await admin.from('mirror_ai_spend').delete().eq('owner_id', who.id).eq('bucket', 'canvas');
  };
  /** `who`'s done draft on `source` with a position; `cited` ids go in the `b` side of the result */
  async function draftBy(who: Who, source: string, label: string, cited: string[] = []) {
    await settleX(who);
    const s = await ok(who.c, 'clarify_start', { p_source: source });
    if (s.status !== 'started') throw new Error(`clarify_start answered ${s.status}`);
    await ok(A, '_clarify_begin', { p_draft: s.draft_id });
    const done = await ok(A, '_clarify_complete', { p_draft: s.draft_id, p_result: goodResult(`${TAG} ${label}`, { a: [source], b: cited }), p_usd: 0.01, p_run: (await draftRow(s.draft_id)).spend_id });
    if (done.status !== 'done') throw new Error(`complete answered ${JSON.stringify(done)}`);
    const up = await who.c.from('point_positions').upsert({ point_id: done.point_id, user_id: who.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    if (up.error) throw new Error(`position: ${up.error.message}`);
    return { draft: s.draft_id as string, point: done.point_id as string, root: s.thread_root_id as string };
  }
  async function groupOf(members: Who[], slug: string): Promise<string> {
    const o = await admin.from('organization').insert({ slug: `p1631-${slug}-${RUN}`, name: `${TAG} org ${slug}` }).select('id').single();
    if (o.error) throw new Error(`fixture org: ${o.error.message}`);
    orgs.push(o.data.id as string);
    const old = new Date(Date.now() - 3_600_000).toISOString();
    for (const m of members) {
      const r = await admin.from('membership').insert({ org_id: o.data.id, user_id: m.id, accepted_at: old });
      if (r.error) throw new Error(`fixture membership: ${r.error.message}`);
    }
    const have = await admin.from('chat_conversations').select('id').eq('kind', 'group').eq('org_id', o.data.id).maybeSingle();
    if (have.data) return have.data.id as string;
    const g = await admin.from('chat_conversations').insert({ kind: 'group', org_id: o.data.id }).select('id').single();
    if (g.error) throw new Error(`fixture group chat: ${g.error.message}`);
    return g.data.id as string;
  }

  beforeAll(async () => {
    x = await mk('X');
    y = await mk('Y');
    z = await mk('Z');
    xy = await dm(x, y);
  });
  afterAll(async () => {
    for (const o of orgs) await admin.from('organization').delete().eq('id', o);
    for (const e of eventIds) await admin.from('events').delete().eq('id', e);
  });

  it('6: P1722 lifted needs_target for the draft\'s OWN Mirror (the card posts to the Mirror main chat); another person\'s Mirror still answers needs_target', async () => {
    const src = await ok(x.c, 'send_chat_message', { p_conversation: xy, p_body: `${TAG} needs-target source`, p_client_id: randomUUID() });
    const d = await draftBy(x, src.id, 'needs-target');
    const row = await draftRow(d.draft);
    // somebody else's Mirror as the source: never a target
    const theirs = (await admin.rpc('_chat_ensure_mirror', { p_uid: y.id })).data as string;
    const moved = await admin.from('clarify_drafts').update({ source_conversation_id: theirs }).eq('id', d.draft);
    expect(moved.error).toBeNull();
    expect(await ok(x.c, 'clarify_publish', { p_draft: d.draft })).toMatchObject({ status: 'refused', code: 'needs_target' });
    expect(await shares(d.point)).toHaveLength(0);
    // the draft's own Mirror as the source: published into that Mirror's main chat
    const own = await admin.from('clarify_drafts').update({ source_conversation_id: row.mirror_conversation_id }).eq('id', d.draft);
    expect(own.error).toBeNull();
    expect(await ok(x.c, 'clarify_publish', { p_draft: d.draft })).toMatchObject({ status: 'published', conversation_id: row.mirror_conversation_id, thread_root_id: null });
  });

  it('6: earlier_version once a done refine names the draft', async () => {
    const src = await ok(x.c, 'send_chat_message', { p_conversation: xy, p_body: `${TAG} earlier-version source`, p_client_id: randomUUID() });
    const d = await draftBy(x, src.id, 'earlier-version');
    await settleX(x);
    const r = await ok(x.c, 'clarify_message', { p_thread_root: d.root, p_text: 'sharper please', p_target: d.draft });
    expect(r.status).toBe('started');
    await ok(A, '_clarify_begin', { p_draft: r.draft_id });
    const done = await ok(A, '_clarify_complete', { p_draft: r.draft_id, p_result: goodResult(`${TAG} earlier-version refined`, { a: [src.id] }), p_usd: 0.01, p_run: (await draftRow(r.draft_id)).spend_id });
    expect(done.status).toBe('done');
    expect((await draftRow(r.draft_id)).refine_target_id).toBe(d.draft);
    expect(await ok(x.c, 'clarify_publish', { p_draft: d.draft })).toMatchObject({ status: 'refused', code: 'earlier_version' });
    expect(await shares(d.point)).toHaveLength(0);
  });

  it('7: after leaving a group chat, publishing answers refused not_available and writes nothing', async () => {
    const g = await groupOf([x, y], 'leave');
    const src = await ok(x.c, 'send_chat_message', { p_conversation: g, p_body: `${TAG} leave source`, p_client_id: randomUUID() });
    const d = await draftBy(x, src.id, 'left-before-publish');
    const before = (await admin.from('chat_messages').select('id').eq('conversation_id', g)).data!.length;
    const org = orgs[orgs.length - 1]!;
    expect((await admin.from('membership').delete().eq('org_id', org).eq('user_id', x.id)).error).toBeNull();
    expect(await ok(x.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() })).toMatchObject({ status: 'refused', code: 'not_available' });
    expect(await shares(d.point)).toHaveLength(0);
    expect((await admin.from('chat_messages').select('id').eq('conversation_id', g)).data).toHaveLength(before);
  });

  // P1631 OQ9 decided 2026-11-13: a point others hold positions on is kept (X holds a position here, and X is not the erased person)
  it('18b: erasing a cited third person keeps the point X holds a position on', async () => {
    const theirs = await ok(y.c, 'send_chat_message', { p_conversation: xy, p_body: `${TAG} Y's words`, p_client_id: randomUUID() });
    const mine = await ok(x.c, 'send_chat_message', { p_conversation: xy, p_body: `${TAG} X answers`, p_client_id: randomUUID() });
    const d = await draftBy(x, mine.id, 'cites-y', [theirs.id]);
    expect((await admin.from('points').select('id').eq('id', d.point)).data).toHaveLength(1);
    await ok(A, 'erase_chat_data_for', { p_uid: y.id });
    expect((await admin.from('points').select('id').eq('id', d.point)).data, 'X holds a position on it: kept').toHaveLength(1);
  });

  // P1631 OQ9 decided 2026-11-13: erasing a CITED person never deletes the point, with or without positions on it; only erasing its AUTHOR with nobody else holding a position does (test 18)
  it('18c: a cited person is erased and no one holds a position on the point: it stays (the author\'s sentence)', async () => {
    const theirs = await ok(y.c, 'send_chat_message', { p_conversation: xy, p_body: `${TAG} Y's other words`, p_client_id: randomUUID() });
    const mine = await ok(x.c, 'send_chat_message', { p_conversation: xy, p_body: `${TAG} X answers again`, p_client_id: randomUUID() });
    const d = await draftBy(x, mine.id, 'cites-y-nobody-holds', [theirs.id]);
    await admin.from('point_positions').delete().eq('point_id', d.point);
    await ok(A, 'erase_chat_data_for', { p_uid: y.id });
    expect((await admin.from('points').select('id').eq('id', d.point)).data, 'cited, not the author: it stays').toHaveLength(1);
  });

  it('event chat: the host publishes; an RSVPed attendee reads the point, a non-attendee does not', async () => {
    const e = await admin.from('events').insert({
      slug: `p1631-ev-${RUN}`, title: `${TAG} event`, description: 'x', datetime: new Date(Date.now() + 86_400_000).toISOString(), location: 'x', host_id: x.id,
    }).select('id').single();
    if (e.error) throw new Error(`fixture event: ${e.error.message}`);
    eventIds.push(e.data.id as string);
    const r = await admin.from('event_rsvps').insert({ event_id: e.data.id, profile_id: y.id });
    if (r.error) throw new Error(`fixture rsvp: ${r.error.message}`);
    const have = await admin.from('chat_conversations').select('id').eq('kind', 'event').eq('event_id', e.data.id).maybeSingle();
    let ec = have.data?.id as string | undefined;
    if (!ec) {
      const ins = await admin.from('chat_conversations').insert({ kind: 'event', event_id: e.data.id }).select('id').single();
      if (ins.error) throw new Error(`fixture event chat: ${ins.error.message}`);
      ec = ins.data.id as string;
    }
    const src = await ok(x.c, 'send_chat_message', { p_conversation: ec, p_body: `${TAG} event message`, p_client_id: randomUUID() });
    const d = await draftBy(x, src.id, 'event card');
    const pub = await ok(x.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() });
    expect(pub).toMatchObject({ status: 'published', conversation_id: ec });
    expect(await readable(y.c, d.point)).toHaveLength(1);
    expect(await readable(z.c, d.point)).toHaveLength(0);
    expect(await ok(y.c, 'list_chat_points', { p_conversation: ec }).then((l: Row[]) => l.map((q) => q.point_id))).toContain(d.point);
  });
});
