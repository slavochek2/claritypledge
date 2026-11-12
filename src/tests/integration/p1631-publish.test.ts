/**
 * P1631 A9: Publish to chat (migration 20261112150000_p1631_publish_to_chat.sql) on the test database.
 *   npm run test:integration -- src/tests/integration/p1631-publish.test.ts
 * Fixtures: a 1:1 A-B (written directly, as p1631-clarify-drafts.test.ts does), a second 1:1 B-C, a stranger C to the first chat, and an anonymous client.
 * The model is not involved: drafts are begun and completed through the service-role worker functions with hand-written results.
 * A group block (organization + membership) covers a later joiner, a removed member, stories, history writes, re-share and client id reuse (migration 20261112170000_p1631_publish_fixes.sql).
 * Not built here (it.todo, each with its reason): an event chat (the fixture needs an event), a refine chain, and the EXPLAIN of the feed.
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

  it('(f) point_share_to_chat is not callable by its author (re-share is off)', async () => {
    const r = await rpc(a.c, 'point_share_to_chat', { p_point: card.point, p_conversation: gconv });
    expect(r.error?.code).toBe('42501');
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
  it.todo('6: earlier_version needs a refine chain (a done refine naming the draft); needs_target needs a Mirror-sourced draft, which clarify_start does not make from a chat message');
  it.todo('7: leaving a chat then publishing answers not_available (the group block above covers removal of a reader, not publishing after leaving)');

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

  it('14: a forward of the card fails for B and for A; point_share_to_chat by B is refused (42501)', async () => {
    const fb = await rpc(b.c, 'forward_chat_message', { p_source: published.message_id, p_target_conversation: convBC });
    expect(fb.error?.message).toMatch(/attachment not available/);
    const fa = await rpc(a.c, 'forward_chat_message', { p_source: published.message_id, p_target_conversation: conv });
    expect(fa.error?.message).toMatch(/attachment not available/);
    expect((await rpc(b.c, 'point_share_to_chat', { p_point: d1.point, p_conversation: convBC })).error?.code).toBe('42501');
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

  it('19: a position on a private point that was never shared is still writable (letters rely on it)', async () => {
    const lone = await madeDraft(msgs[1]!.id, 'never-shared', null);
    const w = await b.c.from('point_positions').upsert({ point_id: lone.point, user_id: b.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(w.error).toBeNull();
  });

  it('18: erasing the author deletes the private points they published, with their shares', async () => {
    const d = await madeDraft(msgs[2]!.id, 'to-erase');
    const r = await ok(a.c, 'clarify_publish', { p_draft: d.draft, p_client_id: randomUUID() });
    expect(r.status).toBe('published');
    await ok(A, 'erase_chat_data_for', { p_uid: a.id });
    expect((await admin.from('points').select('id').eq('id', d.point)).data).toHaveLength(0);
    expect(await shares(d.point)).toHaveLength(0);
  });
  it.todo('18b: erasing a cited third person deletes the point (existing _clarify_erase_person path); needs a second drafting user after A is erased');
  it.todo('20: EXPLAIN of the feed query shows one subplan for chat_shared_point_ids; needs the plan text from a service-role SQL path that the test client does not have');
});
