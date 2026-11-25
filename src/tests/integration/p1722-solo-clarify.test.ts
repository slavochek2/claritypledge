/**
 * P1722 server acceptance criteria that e2e/integration/p1722-solo-clarify.spec.ts does not cover (migrations 20261125104835 and 20261125110523), on the test database.
 *   npm run test:integration -- src/tests/integration/p1722-solo-clarify.test.ts
 * Fixtures follow p1631-publish.test.ts: users from createTestUser, DMs and rooms written with the admin client, drafts begun and completed through the
 * service-role worker functions with hand-written results. The model is never called.
 * Covers: (a) a Public publish that refuses leaves everything as it was, (b) links move to the public point and none is lost, (c) a signed-in outsider can answer a public
 * Clarify point (Mirror and DM, also after the card is deleted) and not a private one, (d) a hard-deleted card still freezes the choice, (e) '#' is stripped from model text,
 * (f) public_warning by source, (g) a card posted in the Mirror starts no Mirror reply.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1722 srv ${RUN}`;
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
  const u = await createTestUser({ name: `P1722 srv ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u), id: u.user.id as string, name: `P1722 srv ${label} ${RUN}` };
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
const goodResult = (stmt: string, ids: { a?: string[]; b?: string[] } = {}) => ({ decision: 'draft', statement: stmt, cited: { a: ids.a ?? [], b: ids.b ?? [] } });
let seq = 0;
const stmt = (label: string) => `${TAG} ${label} ${(seq += 1)}`;

/** a message the owner typed in their Mirror (admin insert: the same row a typed message makes) */
async function typed(x: Who, mirror: string, body: string, extra: Row = {}): Promise<string> {
  const r = await admin.from('chat_messages').insert({ conversation_id: mirror, author_id: x.id, body: `${TAG} ${body}`, kind: 'message', created_at: new Date().toISOString(), ...extra }).select('id').single();
  if (r.error) throw new Error(`fixture typed: ${r.error.message}`);
  return r.data.id as string;
}
async function settle(x: Who) {
  await admin.from('clarify_drafts').update({ state: 'failed', error_code: 'test_cleanup' }).eq('owner_id', x.id).in('state', ['queued', 'running']);
  await admin.from('mirror_ai_spend').delete().eq('owner_id', x.id).eq('bucket', 'canvas');
}
/** the worker's begin, then fail, so the owner is free; returns the run it would send */
async function begin(x: Who, draft: string): Promise<Row> {
  await admin.from('mirror_ai_spend').delete().eq('owner_id', x.id).eq('bucket', 'canvas');
  const run = await ok(A, '_clarify_begin', { p_draft: draft });
  await ok(A, '_clarify_fail', { p_draft: draft, p_code: 'test_cleanup', p_usd: 0, p_run: (await draftRow(draft)).spend_id });
  return run;
}
/** the owner's done draft on a pressed message, with a point and (by default) an 'agree' position */
async function madeDraft(x: Who, source: string, label: string, position: 'agree' | null = 'agree') {
  await settle(x);
  const s = await ok(x.c, 'clarify_start', { p_source: source });
  if (s.status !== 'started') throw new Error(`clarify_start answered ${JSON.stringify(s)}`);
  await ok(A, '_clarify_begin', { p_draft: s.draft_id });
  const done = await ok(A, '_clarify_complete', { p_draft: s.draft_id, p_result: goodResult(stmt(label), { a: [source] }), p_usd: 0.01, p_run: (await draftRow(s.draft_id)).spend_id });
  if (done.status !== 'done') throw new Error(`complete answered ${JSON.stringify(done)}`);
  if (position) {
    const up = await x.c.from('point_positions').upsert({ point_id: done.point_id, user_id: x.id, position }, { onConflict: 'point_id,user_id' });
    if (up.error) throw new Error(`position: ${up.error.message}`);
  }
  return { draft: s.draft_id as string, point: done.point_id as string, root: s.thread_root_id as string };
}
const publish = async (x: Who, draft: string) => ok(x.c, 'clarify_publish', { p_draft: draft, p_client_id: randomUUID(), p_visibility: (await draftRow(draft)).visibility, p_warning_ack: true });
const setVis = (x: Who, draft: string, v: 'private' | 'public') => ok(x.c, 'clarify_set_visibility', { p_draft: draft, p_visibility: v });
const pointsLike = async (s: string) => (await admin.from('points').select('id, visibility').eq('statement', s)).data as Row[];
const warning = async (x: Who, root: string, draft: string) => ((await ok(x.c, 'get_clarify_thread', { p_thread_root: root })).drafts as Row[]).find((d) => d.id === draft)?.public_warning as boolean;

let o: Who; // the owner
let b: Who; // the other person in the DM
let k: Who; // an outsider to every chat here
let mirror: string;
let chatOB: string;
let chatOK: string;

beforeAll(async () => {
  o = await mk('O');
  b = await mk('B');
  k = await mk('K');
  mirror = await mirrorOf(o);
  chatOB = await dm(o, b);
  chatOK = await dm(o, k);
});

afterAll(async () => {
  const ids = users.map((u) => u.user.id);
  await admin.from('canvases').delete().in('owner_id', ids);
  await admin.from('stories').delete().like('content', `${TAG}%`);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
  await deleteTestUsers(ids);
});

describe('(a) a Public publish that refuses after it starts changes nothing', () => {
  it('not_available inside the savepoint: the private point, its position, the pointer and the links stay; no public point, no card', async () => {
    const m = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} a source`, p_client_id: randomUUID() });
    const d = await madeDraft(o, m.id, 'refused-after-start');
    // a link that must survive the refusal
    const st = await admin.from('stories').insert({ author_id: o.id, content: `${TAG} story a`, visibility: 'private' }).select('id').single();
    expect(st.error).toBeNull();
    expect((await o.c.from('story_points').insert({ story_id: st.data!.id, point_id: d.point, author_id: o.id })).error).toBeNull();
    await setVis(o, d.draft, 'public');
    // the target becomes a chat the owner is not in: send_chat_message refuses AFTER the public point was made and the links moved
    const stranger = await dm(b, k);
    expect((await admin.from('clarify_drafts').update({ source_conversation_id: stranger }).eq('id', d.draft)).error).toBeNull();
    const before = await draftRow(d.draft);
    expect(await publish(o, d.draft)).toMatchObject({ status: 'refused', code: 'not_available' });
    const after = await draftRow(d.draft);
    expect(after.point_id).toBe(d.point);
    expect(after.point_id).toBe(before.point_id);
    expect(after.first_published_at).toBeNull();
    expect(after.visibility).toBe('public');
    const mine = await pointsLike((await admin.from('points').select('statement').eq('id', d.point).single()).data!.statement);
    expect(mine, 'one point carries the statement: the private one').toEqual([{ id: d.point, visibility: 'private' }]);
    expect((await admin.from('point_positions').select('position').eq('point_id', d.point).eq('user_id', o.id)).data).toEqual([{ position: 'agree' }]);
    expect((await admin.from('story_points').select('point_id').eq('story_id', st.data!.id)).data).toEqual([{ point_id: d.point }]);
    expect((await admin.from('point_chat_shares').select('message_id').eq('point_id', d.point)).data).toHaveLength(0);
    expect((await admin.from('chat_messages').select('id').eq('conversation_id', stranger).eq('attachment_kind', 'point')).data).toHaveLength(0);
  });

  it('point_linked (a share row appears after the choice was made): refused before anything is written', async () => {
    const m = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} a source 2`, p_client_id: randomUUID() });
    const d = await madeDraft(o, m.id, 'point-linked');
    await setVis(o, d.draft, 'public');
    // another path shares this private point after the owner chose Public (a share row with no draft): the publish must refuse
    const other = chatOK;
    const note = await admin.from('chat_messages').insert({ conversation_id: other, author_id: o.id, body: `${TAG} placeholder`, kind: 'message', created_at: new Date().toISOString() }).select('id').single();
    expect(note.error).toBeNull();
    const sh = await admin.from('point_chat_shares').insert({ message_id: note.data!.id, point_id: d.point, conversation_id: other, shared_by: o.id, draft_id: null });
    expect(sh.error).toBeNull();
    expect(await publish(o, d.draft)).toMatchObject({ status: 'refused', code: 'point_linked' });
    const after = await draftRow(d.draft);
    expect(after.point_id).toBe(d.point);
    expect(after.first_published_at).toBeNull();
    expect((await admin.from('points').select('visibility').eq('id', d.point).single()).data).toEqual({ visibility: 'private' });
    expect((await admin.from('point_positions').select('user_id').eq('point_id', d.point)).data).toHaveLength(1);
    expect((await admin.from('chat_messages').select('id').eq('conversation_id', chatOB).eq('attachment_id', d.point)).data).toHaveLength(0);
  });
});

describe('(b) a Public publish moves every link to the public point', () => {
  it('story link and history, a canvas draft and an added story follow the point; the public point holds one position history row', async () => {
    const src = await typed(o, mirror, 'b source');
    const d = await madeDraft(o, src, 'links-move', null);
    // the owner changes their mind twice before publishing: that history must not reach the public point
    for (const p of ['strongly_agree', 'disagree']) {
      const up = await o.c.from('point_positions').upsert({ point_id: d.point, user_id: o.id, position: p }, { onConflict: 'point_id,user_id' });
      expect(up.error).toBeNull();
    }
    const mkStory = async (label: string) => {
      const s = await admin.from('stories').insert({ author_id: o.id, content: `${TAG} story ${label}`, visibility: 'private' }).select('id').single();
      if (s.error) throw new Error(`fixture story: ${s.error.message}`);
      return s.data.id as string;
    };
    const storyA = await mkStory('b1');
    const storyB = await mkStory('b2');
    expect((await o.c.from('story_points').insert({ story_id: storyA, point_id: d.point, author_id: o.id })).error).toBeNull();
    // a canvas with a draft of the owner, a draft point and an added story
    const cv = await admin.from('canvases').insert({ owner_id: o.id, name: `p1722_${RUN.replace(/[^a-z0-9]/g, '')}` }).select('id').single();
    expect(cv.error).toBeNull();
    const ver = await admin.from('canvas_versions').insert({ canvas_id: cv.data!.id, owner_id: o.id, name: 'v1' }).select('id').single();
    expect(ver.error).toBeNull();
    const root = await typed(o, mirror, 'b canvas thread root');
    const cd = await admin.from('canvas_drafts').insert({ version_id: ver.data!.id, canvas_id: cv.data!.id, owner_id: o.id, conversation_id: mirror, thread_root_id: root, canvas_name: 'c', version_name: 'v1' }).select('id').single();
    expect(cd.error).toBeNull();
    expect((await admin.from('canvas_draft_points').insert({ draft_id: cd.data!.id, point_id: d.point })).error).toBeNull();
    expect((await admin.from('canvas_added_stories').insert({ canvas_id: cv.data!.id, point_id: d.point, story_id: storyB, author_id: o.id })).error).toBeNull();
    const histBefore = (await admin.from('story_point_history').select('id').eq('point_id', d.point)).data!.length;
    expect(histBefore).toBeGreaterThan(0);

    await setVis(o, d.draft, 'public');
    expect(await publish(o, d.draft)).toMatchObject({ status: 'published', conversation_id: mirror, thread_root_id: null });
    const np = (await draftRow(d.draft)).point_id as string;
    expect(np).not.toBe(d.point);
    expect((await admin.from('points').select('id').eq('id', d.point)).data).toHaveLength(0);
    expect((await admin.from('story_points').select('story_id, point_id').eq('story_id', storyA)).data).toEqual([{ story_id: storyA, point_id: np }]);
    expect((await admin.from('story_point_history').select('id').eq('point_id', np)).data).toHaveLength(histBefore);
    expect((await admin.from('canvas_draft_points').select('point_id').eq('draft_id', cd.data!.id)).data).toEqual([{ point_id: np }]);
    expect((await admin.from('canvas_added_stories').select('point_id').eq('story_id', storyB)).data).toEqual([{ point_id: np }]);
    // one position (the owner's final one), one history row for it
    expect((await admin.from('point_positions').select('user_id, position').eq('point_id', np)).data).toEqual([{ user_id: o.id, position: 'disagree' }]);
    const hist = (await admin.from('point_position_history').select('user_id, position').eq('point_id', np)).data as Row[];
    expect(hist).toEqual([{ user_id: o.id, position: 'disagree' }]);
  });
});

describe('(c) a signed-in outsider can answer a public Clarify point, not a private one', () => {
  const answer = (x: Who, point: string, position: string) => x.c.from('point_positions').upsert({ point_id: point, user_id: x.id, position }, { onConflict: 'point_id,user_id' });

  it('published into the Mirror: the outsider takes a position, and again after the card is deleted', async () => {
    const src = await typed(o, mirror, 'c mirror source');
    const d = await madeDraft(o, src, 'public-mirror');
    await setVis(o, d.draft, 'public');
    const pub = await publish(o, d.draft);
    expect(pub.status).toBe('published');
    const point = (await draftRow(d.draft)).point_id as string;
    expect((await answer(k, point, 'agree')).error).toBeNull();
    expect((await admin.from('chat_messages').delete().eq('id', pub.message_id)).error).toBeNull();
    expect((await answer(k, point, 'disagree')).error, 'the card is gone; the point is public').toBeNull();
    expect((await admin.from('point_positions').select('position').eq('point_id', point).eq('user_id', k.id)).data).toEqual([{ position: 'disagree' }]);
  });

  it('published into a DM: the outsider takes a position, and again after the card is deleted', async () => {
    const m = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} c dm source`, p_client_id: randomUUID() });
    const d = await madeDraft(o, m.id, 'public-dm');
    await setVis(o, d.draft, 'public');
    const pub = await publish(o, d.draft);
    expect(pub).toMatchObject({ status: 'published', conversation_id: chatOB });
    const point = (await draftRow(d.draft)).point_id as string;
    expect((await answer(k, point, 'agree')).error).toBeNull();
    expect((await admin.from('chat_messages').delete().eq('id', pub.message_id)).error).toBeNull();
    expect((await answer(k, point, 'unsure')).error).toBeNull();
  });

  it('CONTROL: a private Clarify point published into the same DM refuses the same outsider', async () => {
    const m = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} c private source`, p_client_id: randomUUID() });
    const d = await madeDraft(o, m.id, 'private-dm');
    expect((await publish(o, d.draft)).status).toBe('published');
    const point = (await draftRow(d.draft)).point_id as string;
    expect((await admin.from('points').select('visibility').eq('id', point).single()).data).toEqual({ visibility: 'private' });
    const r = await answer(k, point, 'agree');
    expect(r.error, 'an outsider may not answer a private point').not.toBeNull();
    expect((await admin.from('point_positions').select('user_id').eq('point_id', point).eq('user_id', k.id)).data).toHaveLength(0);
  });
});

describe('(d) a hard-deleted card still freezes the choice', () => {
  it('publish private, delete the card message for good: clarify_set_visibility and clarify_draft_edit answer published', async () => {
    const m = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} d source`, p_client_id: randomUUID() });
    const d = await madeDraft(o, m.id, 'frozen');
    const pub = await publish(o, d.draft);
    expect(pub.status).toBe('published');
    expect((await admin.from('chat_messages').delete().eq('id', pub.message_id)).error).toBeNull();
    expect((await admin.from('point_chat_shares').select('message_id').eq('draft_id', d.draft)).data, 'the share row went with the message').toHaveLength(0);
    expect((await draftRow(d.draft)).first_published_at).not.toBeNull();
    expect(await setVis(o, d.draft, 'public')).toMatchObject({ status: 'refused', code: 'published' });
    expect(await ok(o.c, 'clarify_draft_edit', { p_draft: d.draft, p_statement: `${stmt('edited')}` })).toMatchObject({ status: 'refused', code: 'published' });
  });
});

describe('(e) model text never holds a #', () => {
  it('a model statement with # is stored without it, on the point and the draft', async () => {
    const m = await ok(o.c, 'send_chat_message', { p_conversation: chatOB, p_body: `${TAG} e source`, p_client_id: randomUUID() });
    await settle(o);
    const s = await ok(o.c, 'clarify_start', { p_source: m.id });
    await ok(A, '_clarify_begin', { p_draft: s.draft_id });
    const done = await ok(A, '_clarify_complete', { p_draft: s.draft_id, p_result: goodResult(`${TAG} ship #fast and #loose # now`, { a: [m.id] }), p_usd: 0.01, p_run: (await draftRow(s.draft_id)).spend_id });
    expect(done.status).toBe('done');
    const p = (await admin.from('points').select('statement, tags').eq('id', done.point_id).single()).data as Row;
    expect(p.statement).not.toContain('#');
    expect(p.statement).toContain('ship fast and loose');
    expect(p.tags ?? []).toEqual([]);
  });
});

describe('(f) public_warning follows the rows the run read', () => {
  it('false: the owner\'s own typed Mirror messages with Mirror agent replies around them', async () => {
    const mx = await mk('F1');
    const mm = await mirrorOf(mx);
    const m1 = await typed(mx, mm, 'f first thought');
    const reply = await admin.from('chat_messages').insert({ conversation_id: mm, author_id: null, body: `${TAG} agent reply`, kind: 'agent', reply_to_id: m1, created_at: new Date().toISOString() }).select('id').single();
    expect(reply.error, 'fixture: a Mirror agent reply').toBeNull();
    await typed(mx, mm, 'f second thought');
    const s = await ok(mx.c, 'clarify_start_chat', { p_conversation: mm, p_draft: true });
    expect(s.status).toBe('started');
    const run = await begin(mx, s.draft_id);
    expect(JSON.stringify(run)).not.toContain('agent reply');
    expect((await draftRow(s.draft_id)).public_warning_needed).toBe(false);
    expect(await warning(mx, s.thread_root_id, s.draft_id)).toBe(false);
  });

  it('true: a DM source, even when only the owner\'s messages were sent', async () => {
    const dx = chatOK;
    await ok(o.c, 'send_chat_message', { p_conversation: dx, p_body: `${TAG} f dm one`, p_client_id: randomUUID() });
    const m2 = await ok(o.c, 'send_chat_message', { p_conversation: dx, p_body: `${TAG} f dm two`, p_client_id: randomUUID() });
    await settle(o);
    const s = await ok(o.c, 'clarify_start', { p_source: m2.id });
    expect(s.status).toBe('started');
    await begin(o, s.draft_id);
    expect((await draftRow(s.draft_id)).public_warning_needed).toBe(true);
    expect(await warning(o, s.thread_root_id, s.draft_id)).toBe(true);
  });

  it('true: a transcribed Mirror line', async () => {
    const mx = await mk('F2');
    const mm = await mirrorOf(mx);
    const line = await typed(mx, mm, 'f spoken line', { is_transcription: true });
    const s = await ok(mx.c, 'clarify_start', { p_source: line });
    expect(s.status).toBe('started');
    await begin(mx, s.draft_id);
    expect((await draftRow(s.draft_id)).public_warning_needed).toBe(true);
    expect(await warning(mx, s.thread_root_id, s.draft_id)).toBe(true);
  });

  it('true: a recording', async () => {
    const dx = chatOB;
    const r = await admin.from('transcribe_rooms').insert({ code: `Z${RUN.slice(0, 5).toUpperCase().replace(/[^A-Z2-9]/g, 'X')}`, conversation_id: dx }).select('id').single();
    if (r.error) throw new Error(`fixture room: ${r.error.message}`);
    try {
      const ses = await admin.from('clarity_sessions').insert({ creator_name: o.name, creator_profile_id: o.id, state: {}, demo_status: 'waiting', partnership_status: 'pending', is_private: false }).select('id').single();
      if (ses.error) throw new Error(`fixture session: ${ses.error.message}`);
      const seat = await admin.from('transcribe_room_members').insert({ room_id: r.data.id, profile_id: o.id, display_name: o.name, session_id: ses.data.id, consent_given_at: new Date().toISOString() }).select('id').single();
      if (seat.error) throw new Error(`fixture seat: ${seat.error.message}`);
      const ln = await admin.from('transcribe_messages').insert({ room_id: r.data.id, member_id: seat.data.id, text: `${TAG} f recorded line`, spoken_at: new Date(Date.now() - 60_000).toISOString() }).select('id').single();
      if (ln.error) throw new Error(`fixture line: ${ln.error.message}`);
      await settle(o);
      const s = await ok(o.c, 'clarify_start_recording', { p_room: r.data.id });
      expect(s.status).toBe('started');
      await begin(o, s.draft_id);
      expect((await draftRow(s.draft_id)).public_warning_needed).toBe(true);
      expect(await warning(o, s.thread_root_id, s.draft_id)).toBe(true);
      await admin.from('clarity_sessions').delete().eq('id', ses.data.id);
    } finally {
      await admin.from('transcribe_rooms').delete().eq('id', r.data.id);
    }
  });
});

describe('(g) a card posted in the Mirror starts no Mirror reply', () => {
  it('private and public cards: no job for the card message, none new for the owner, and asking for one returns nothing', async () => {
    for (const vis of ['private', 'public'] as const) {
      const src = await typed(o, mirror, `g source ${vis}`);
      const d = await madeDraft(o, src, `card-${vis}`);
      if (vis === 'public') await setVis(o, d.draft, 'public');
      const jobsBefore = (await admin.from('mirror_jobs').select('id').eq('owner_id', o.id)).data!.length;
      const pub = await publish(o, d.draft);
      expect(pub).toMatchObject({ status: 'published', conversation_id: mirror, thread_root_id: null });
      const card = (await admin.from('chat_messages').select('attachment_kind, attachment_id, kind').eq('id', pub.message_id).single()).data as Row;
      expect(card.attachment_kind).toBe('point');
      expect((await admin.from('mirror_jobs').select('id').eq('trigger_message_id', pub.message_id)).data, `${vis} card: no job`).toHaveLength(0);
      const asked = await rpc(o.c, 'mirror_request_reply', { p_message: pub.message_id });
      expect(asked.error).toBeNull();
      expect(asked.data ?? []).toHaveLength(0);
      expect((await admin.from('mirror_jobs').select('id').eq('owner_id', o.id)).data!.length, `${vis}: no new job`).toBe(jobsBefore);
    }
  });
});
