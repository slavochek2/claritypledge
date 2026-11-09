/**
 * P1536 WP1: canvas draft versions, on the TEST database (migrations 20261029100000 and 20261029100100).
 *   npm run test:integration -- src/tests/integration/p1536-canvas-draft-write.test.ts
 *
 * The engine functions (_canvas_draft_*) are called as the service role, exactly as the canvas-draft edge function
 * calls them; the owner's functions (canvas_draft_open, _publish, _discard, list_my_canvas_versions, get_canvas, ...)
 * are called as signed-in clients. One serial story: open, draft, read as everyone, publish, revise, reuse, supersede,
 * discard, then the caps. Every refusal has a control that shows the same call succeeding for someone who must succeed.
 */
import { traffic } from './p1536-count-fetch'; // first: counts every client's requests (metered-services rule 6)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../../../e2e/helpers/test-event';

type Row = Record<string, any>;

const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1536 ${RUN}`;
const DAY = 86_400_000;
const ZERO = '00000000-0000-0000-0000-000000000000';
const BOX = { segments: 'canvas:segments', problem: 'canvas:problem', solution: 'canvas:solution', channels: 'canvas:channels', revenue: 'canvas:revenue', love: 'canvas:love' };

const bare = () => createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
async function signIn(u: TestUser): Promise<SupabaseClient> {
  const c = bare();
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  if (error) throw new Error(`[P1536] sign-in failed for ${u.name}: ${error.message}`);
  return c;
}
const admin = supabaseAdmin;
/** An engine call as the service role; throws on an error so a broken step stops the story. */
async function engine(fn: string, args: Record<string, unknown>): Promise<any> {
  const r = await admin.rpc(fn, args);
  if (r.error) throw new Error(`${fn}: ${r.error.code} ${r.error.message}`);
  return r.data;
}
async function rpc(c: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<{ data: any; error: any }> {
  return c.rpc(fn, args) as any;
}
async function ok(c: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await rpc(c, fn, args);
  if (error) throw new Error(`${fn}: ${error.code} ${error.message}`);
  return data;
}

let O: TestUser, N: TestUser, X: TestUser, S: TestUser, H: TestUser, C: TestUser;
let cO: SupabaseClient, cN: SupabaseClient, cX: SupabaseClient, cS: SupabaseClient, cC: SupabaseClient;
const anon = bare();
let E: TestEvent;
let mirror = '';
const users: TestUser[] = [];
async function mkUser(label: string): Promise<TestUser> {
  const u = await createTestUser({ name: `P1536 ${label} ${RUN}` });
  users.push(u);
  return u;
}

/**
 * A fresh owner with a signed-in client. The shared owner O has its per-person daily canvas cap (a reservation is
 * canvas_max_usd each) spent by the tests above, so a test that drives several runs of its own takes one of these.
 */
async function freshOwner(label: string): Promise<{ u: TestUser; c: SupabaseClient }> {
  const u = await mkUser(label);
  return { u, c: await signIn(u) };
}

// the story's shared state
let canvasId = '', canvasName = '', token = '';
let d1 = '', root1 = '', name1 = '';
let p1 = '', p2 = '', p3 = '';

const get = async (c: SupabaseClient, name = canvasName, version: string | null = null, tok: string | null = null, owner: TestUser = O): Promise<Row> =>
  ok(c, 'get_canvas', { p_owner: owner.user.id, p_name: name, p_link_token: tok, p_version: version });
const ids = (c: Row) => (c.points as Row[]).map((p) => p.id as string).sort();
const tagRows = async (tag: string, owner: TestUser = O): Promise<Row[]> =>
  (await admin.from('points').select('id, statement, visibility, tags, system_tags, superseded_by').eq('first_validator_id', owner.user.id).contains('system_tags', [tag])).data ?? [];
const draftRow = async (id: string): Promise<Row> => (await admin.from('canvas_drafts').select('*').eq('id', id).single()).data as Row;
const versionRow = async (id: string): Promise<Row> => (await admin.from('canvas_versions').select('*').eq('id', id).single()).data as Row;
const pointRow = async (id: string): Promise<Row> => (await admin.from('points').select('id, statement, system_tags, superseded_by').eq('id', id).single()).data as Row;
const nn = (s: string) => `${TAG} ${s}`;

/** begin + complete a draft run as the engine does. */
async function drive(owner: TestUser, draft: string, actions: unknown[], o: { questions?: Row; decided?: unknown[]; reply?: string; speed?: string } = {}) {
  const begin = await engine('_canvas_draft_run_begin', { p_owner: owner.user.id, p_draft: draft, p_kind: 'draft', p_speed: o.speed ?? 'fast' });
  expect(begin.status, 'begin').toBe('run');
  const done = await engine('_canvas_draft_run_complete', {
    p_run: begin.run_id, p_actions: actions, p_questions: o.questions ?? {}, p_decided: o.decided ?? [], p_reply: o.reply ?? nn('reply'), p_usd: 0.01,
  });
  return { begin, done };
}
/** begin an engine run of any kind and fail it, freeing the owner's single active run. */
async function beginAndFail(owner: TestUser, draft: string, kind: string, usd: number | null) {
  const b = await engine('_canvas_draft_run_begin', { p_owner: owner.user.id, p_draft: draft, p_kind: kind, p_speed: 'fast' });
  if (b.status === 'run') await engine('_canvas_draft_run_fail', { p_run: b.run_id, p_code: 'test', p_reply: null, p_actual_usd: usd });
  return b;
}

beforeAll(async () => {
  O = await mkUser('Owner'); N = await mkUser('Stranger'); X = await mkUser('Attendee'); S = await mkUser('LinkHolder');
  H = await mkUser('Host'); C = await mkUser('Caps');
  [cO, cN, cX, cS, cC] = await Promise.all([signIn(O), signIn(N), signIn(X), signIn(S), signIn(C)]);
  E = await createTestEvent(H.user.id, new Date(Date.now() - 2 * DAY), { title: `P1536 event ${RUN}` });
  for (const u of [O, X]) {
    const r = await admin.from('event_rsvps').insert({ event_id: E.id, profile_id: u.user.id, rsvped_at: new Date(Date.now() - 4 * DAY).toISOString() });
    if (r.error) throw new Error(`rsvp: ${r.error.message}`);
  }
  mirror = (await engine('_chat_ensure_mirror', { p_uid: O.user.id })) as string;
}, 180_000);

afterAll(async () => {
  const mine = users.map((u) => u.user.id);
  await admin.from('canvases').delete().in('owner_id', mine);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('stories').delete().like('content', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', mine);
  if (E) await deleteTestEvent(E.id);
  // ONE call for every user the suite created (metered-services rule 1)
  const gone = await deleteTestUsers(users.map((u) => u.user.id));
  expect(gone.failed, 'every test user was deleted').toBe(0);
  console.log(`P1536 legacy live suite traffic (every client, user setup and teardown included): owners=${users.length} requests=${traffic.requests} authRequests=${traffic.authRequests} responseBytes=${traffic.responseBytes} failedResponses=${traffic.failedResponses}`);
}, 180_000);

describe('P1536 WP1: draft versions (test database)', () => {
  it('open: a new canvas gets an automatic name, an unpublished draft version and a thread root that attaches it', async () => {
    const r = await ok(cO, 'canvas_draft_open');
    expect(r.status).toBe('opened');
    ({ draft_id: d1, thread_root_id: root1, canvas_name: canvasName } = r);
    expect(canvasName).toMatch(/^canvas(_\d+)?$/);
    expect(r.from_seq).toBeNull();
    canvasId = (await admin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', canvasName).single()).data!.id as string;
    const vs = (await admin.from('canvas_versions').select('*').eq('canvas_id', canvasId)).data ?? [];
    expect(vs, 'the draft is the canvas\'s only version: no first version carries the canvas name').toHaveLength(1);
    name1 = vs[0]!.name as string;
    expect(name1).toMatch(new RegExp(`^${canvasName}_d[0-9a-f]{6}$`));
    expect(vs[0]).toMatchObject({ published_at: null, published_seq: null });
    const root = (await admin.from('chat_messages').select('*').eq('id', root1).single()).data as Row;
    expect(root).toMatchObject({ author_id: O.user.id, body: null, attachment_kind: 'canvas_version', attachment_id: vs[0]!.id, thread_root_id: null, kind: 'message' });
    expect((await admin.from('mirror_jobs').select('id').eq('trigger_message_id', root1)).data, 'an attachment-only root asks the mirror nothing').toEqual([]);
    expect(await draftRow(d1)).toMatchObject({ state: 'open', run_count: 0, base_version_id: null, conversation_id: mirror });
  });

  it('the first run writes private points with a box tag, the draft tag, no user tag, the owner\'s position and story, and posts the reply in the thread', async () => {
    const b = await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: d1, p_kind: 'draft', p_speed: 'fast' });
    expect(b).toMatchObject({ status: 'run', base_label: null, base_points: [], tensions: [] });
    expect(b.canvas_path).toMatch(new RegExp(`/canvas/${canvasName}\\?v=${name1}$`));
    expect(Array.isArray(b.thread) && Array.isArray(b.material) && Array.isArray(b.other_names)).toBe(true);
    // CONTROL: a second press while it runs does not start a second run
    expect((await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: d1, p_kind: 'draft', p_speed: 'fast' })).status).toBe('busy');
    const done = await engine('_canvas_draft_run_complete', {
      p_run: b.run_id, p_questions: { [BOX.love]: 'What do you keep doing even when it costs you?' }, p_decided: [{ kind: 'conflict', text: 'x' }],
      p_actions: [
        { action: 'new', box: BOX.segments, statement: nn('cafe owners'), story: nn('story one') },
        { action: 'new', box: BOX.problem, statement: nn('tax panic'), story: '' },
        { action: 'new', box: BOX.revenue, statement: nn('2500 baht'), story: '' },
      ],
      p_reply: nn('draft one'), p_usd: 0.01,
    });
    expect(done).toMatchObject({ status: 'ok', points: 3, kept: 0, created: 3, links: 0 });
    const rows = await tagRows(`canvas_${name1}`);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.visibility).toBe('private');
      expect(r.tags, 'no user tag on a written point').toEqual([]);
      expect(r.system_tags.some((t: string) => t.startsWith('canvas:'))).toBe(true);
    }
    const idOf = (statement: string) => rows.find((r) => r.statement === statement)!.id as string;
    p1 = idOf(nn('cafe owners')); p2 = idOf(nn('tax panic')); p3 = idOf(nn('2500 baht'));
    const pos = await admin.from('point_positions').select('position').eq('user_id', O.user.id).in('point_id', [p1, p2, p3]);
    expect(pos.data, 'D20: the engine gives the owner no stance on a point it writes').toHaveLength(0);
    expect((await admin.from('story_points').select('story_id').in('point_id', [p1, p2, p3])).data).toHaveLength(1);
    const reply = (await admin.from('chat_messages').select('author_id, kind, thread_root_id, derived_refs').eq('conversation_id', mirror).eq('body', nn('draft one')).single()).data as Row;
    expect(reply).toMatchObject({ author_id: null, kind: 'agent', thread_root_id: root1 });
    expect(reply.derived_refs).not.toBeNull();
    const d = await draftRow(d1);
    expect(d).toMatchObject({ run_count: 1, pending_links: [] });
    expect(d.questions).toEqual({ [BOX.love]: 'What do you keep doing even when it costs you?' });
    expect((await admin.from('canvas_draft_runs').select('state').eq('id', b.run_id).single()).data).toMatchObject({ state: 'done' });
  });

  it('the mirror stays quiet in an OPEN draft thread (the canvas engine answers there); CONTROL: an ordinary mirror thread gets a job', async () => {
    const m = await ok(cO, 'send_chat_message', { p_conversation: mirror, p_body: nn('a correction while drafting'), p_thread_root: root1 });
    expect((await ok(cO, 'mirror_request_reply', { p_message: m.id })) ?? []).toEqual([]);
    expect((await admin.from('mirror_jobs').select('id').eq('trigger_message_id', m.id)).data).toEqual([]);
    // CONTROL: the same owner, the same mirror, a thread no canvas draft roots
    const top = await ok(cO, 'send_chat_message', { p_conversation: mirror, p_body: nn('an ordinary thought') });
    const reply = await ok(cO, 'send_chat_message', { p_conversation: mirror, p_body: nn('an ordinary reply in its thread'), p_thread_root: top.id });
    const job = await ok(cO, 'mirror_request_reply', { p_message: reply.id });
    expect(Array.isArray(job) ? job.length : 0, 'an ordinary mirror thread still gets a job').toBe(1);
  });

  it('AC3/AC7: nothing is shared for an unpublished canvas, and once forced open the draft is invisible to everyone but its owner', async () => {
    expect((await rpc(cO, 'share_canvas', { p_name: canvasName, p_kind: 'event', p_target: E.id })).error, 'sharing an unpublished canvas is refused').not.toBeNull();
    expect((await rpc(cO, 'set_canvas_general_access', { p_name: canvasName, p_access: 'link' })).error, 'so is opening its link').not.toBeNull();
    // Force the audience the way a share made BEFORE the first Publish never could: the draft must still not show.
    expect((await admin.from('canvas_audience').insert({ canvas_id: canvasId, kind: 'event', event_id: E.id })).error).toBeNull();
    token = randomBytes(16).toString('hex');
    expect((await admin.from('canvases').update({ general_access: 'link', link_token: token, link_generation: 1 }).eq('id', canvasId)).error).toBeNull();

    const stranger = JSON.stringify(await get(cN));
    expect(JSON.parse(stranger).access.admitted).toBe(false);
    for (const [who, c, tok] of [['N', cN, null], ['X (event)', cX, null], ['S (link)', cS, token], ['signed out', anon, token]] as const) {
      expect(JSON.stringify(await get(c, canvasName, name1, tok)), `${who} asking for the draft by name gets the empty shape`).toBe(stranger);
    }
    for (const [who, c, tok] of [['X (event)', cX, null], ['S (link)', cS, token], ['signed out', anon, token]] as const) {
      const a = await get(c, canvasName, null, tok);
      expect(a.points, `${who}: nothing to read yet`).toEqual([]);
      expect(a.access.admitted, `${who} is admitted`).toBe(true);
      expect(a.access.published_none, `${who}: published_none`).toBe(true);
      expect(a.access.versions, `${who}: no version listed`).toEqual([]);
      expect(a.access.draft, `${who}: no draft key`).toBeUndefined();
    }
    expect(JSON.stringify(await get(cN)), 'N without a version').toBe(stranger);
    // Artifacts (P1545 lists): the admitted reader is not shown the draft-only canvas, in the list or as a chat card
    expect(((await ok(cX, 'list_canvases_shared_with_me')) as Row[]).map((r) => r.canvas_id), 'X: not in Shared with me').not.toContain(canvasId);
    expect(await ok(cX, 'get_chat_artifact_attachment', { p_kind: 'canvas', p_id: canvasId }), 'X: the card is not available').toMatchObject({ available: false });
    // the owner's list: the draft-only canvas once, under its own name, never under the draft version's internal name
    const mine = ((await ok(cO, 'list_my_artifacts_canvases')) as Row[]).map((r) => r.name);
    expect(mine.filter((n) => n === canvasName), 'the owner: the draft-only canvas is listed once').toHaveLength(1);
    expect(mine, 'never the draft version\'s internal name').not.toContain(name1);
    // CONTROL: the owner reads the draft, with its questions
    const o = await get(cO);
    expect(o.points).toHaveLength(3);
    expect(o.access).toMatchObject({ version: name1, published_none: true, is_owner: true });
    expect(o.access.versions[0]).toMatchObject({ name: name1, seq: null, draft: true });
    expect(o.access.draft).toMatchObject({ id: d1, version: name1, thread_root_id: root1, conversation_id: mirror, base_seq: null });
    expect(o.access.draft.questions[BOX.love]).toBeTruthy();
    // rows: no direct read of the draft, its runs or its pending links by anyone else
    const pointIds = [p1, p2, p3];
    expect((await cN.from('points').select('id').in('id', pointIds)).data ?? []).toHaveLength(0);
    expect((await cN.from('canvas_drafts').select('id')).data ?? []).toHaveLength(0);
    expect((await cO.from('canvas_drafts').select('id, state, questions').eq('id', d1)).data).toHaveLength(1);
    expect((await cO.from('canvas_drafts').select('pending_links').eq('id', d1)).error, 'the pending links are never granted').not.toBeNull();
    // writes: nobody but the owner can take a position on a draft point (the owner's own stance: p1536-v6-engine.test.ts, D20), nobody else can publish or discard
    expect((await rpc(cX, 'canvas_set_position', { p_owner: O.user.id, p_name: canvasName, p_point: p1, p_position: 'agree', p_reasoning: null, p_link_token: null })).error).not.toBeNull();
    expect((await rpc(cN, 'canvas_draft_publish', { p_draft: d1 })).error).not.toBeNull();
    expect((await rpc(cN, 'canvas_draft_discard', { p_draft: d1 })).error).not.toBeNull();
  });

  it('Publish: refused while a run is active, applies no link here, numbers the version, deletes the extracted text', async () => {
    await engine('_canvas_draft_add_material', { p_owner: O.user.id, p_draft: d1, p_kind: 'file', p_label: 'deck.md', p_text: nn('material text') });
    expect(await admin.from('canvas_draft_material').select('id').eq('draft_id', d1)).toMatchObject({ data: [expect.anything()] });
    const b = await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: d1, p_kind: 'draft', p_speed: 'fast' });
    expect(b.status).toBe('run');
    expect((await rpc(cO, 'canvas_draft_publish', { p_draft: d1 })).error?.code, 'a run is active').toBe('55006');
    expect((await rpc(cO, 'canvas_draft_discard', { p_draft: d1 })).error?.code, 'and a discard waits for it too').toBe('55006');
    await engine('_canvas_draft_run_fail', { p_run: b.run_id, p_code: 'test', p_reply: null, p_actual_usd: 0 });
    expect((await draftRow(d1)).run_count, 'a run that cost nothing does not count').toBe(1);

    const pub = await ok(cO, 'canvas_draft_publish', { p_draft: d1 });
    expect(pub).toEqual({ seq: 1, skipped_links: 0 });
    const v = await versionRow((await draftRow(d1)).version_id);
    expect(v.published_seq).toBe(1);
    expect(v.published_at).not.toBeNull();
    expect(await draftRow(d1)).toMatchObject({ state: 'published' });
    expect((await admin.from('canvas_draft_material').select('id').eq('draft_id', d1)).data, 'the extracted text goes at Publish').toEqual([]);
    expect((await rpc(cO, 'canvas_draft_publish', { p_draft: d1 })).error?.code, 'a closed draft cannot be published twice').toBe('55000');
    // a published version never changes back or renumbers
    expect((await admin.from('canvas_versions').update({ published_seq: 7 }).eq('id', v.id)).error).not.toBeNull();
    expect((await admin.from('canvas_versions').update({ published_at: null, published_seq: null }).eq('id', v.id)).error).not.toBeNull();
  });

  it('AC4/AC7: after Publish the audience reads it with no new share; a stranger still reads nothing; a position works on a published point', async () => {
    // CONTROL for the Artifacts guard: once published, the reader's list and chat card show it
    expect(((await ok(cX, 'list_canvases_shared_with_me')) as Row[]).map((r) => r.canvas_id), 'X: now in Shared with me').toContain(canvasId);
    expect(await ok(cX, 'get_chat_artifact_attachment', { p_kind: 'canvas', p_id: canvasId }), 'X: the card is available').toMatchObject({ available: true, name: canvasName });
    for (const [who, c, tok] of [['X (event)', cX, null], ['S (link)', cS, token], ['signed out', anon, token]] as const) {
      const a = await get(c, canvasName, null, tok);
      expect(ids(a), `${who} reads the 3 points`).toEqual([p1, p2, p3].sort());
      expect(a.access).toMatchObject({ version: name1, published_none: false });
      expect(a.access.versions).toEqual([expect.objectContaining({ name: name1, seq: 1 })]);
      expect(a.access.versions[0].draft).toBeUndefined();
    }
    expect((await get(cN)).access.admitted, 'CONTROL: N is still a stranger').toBe(false);
    expect((await rpc(cX, 'canvas_set_position', { p_owner: O.user.id, p_name: canvasName, p_point: p1, p_position: 'agree', p_reasoning: null, p_link_token: null })).error).toBeNull();
    // D20: the engine gave the owner no stance on p1; the owner marks it, and it must carry into the next draft like X's
    expect((await rpc(cO, 'canvas_set_position', { p_owner: O.user.id, p_name: canvasName, p_point: p1, p_position: 'agree', p_reasoning: null, p_link_token: null })).error).toBeNull();
    expect(await ok(cO, 'share_canvas', { p_name: canvasName, p_kind: 'event', p_target: E.id }), 'CONTROL: sharing now works').toMatchObject({ shared: true }); // P1650: share_canvas returns { shared, skipped }
  });

  it('a change request in a published thread gets no mirror job (the client asks "Start a new version?")', async () => {
    const m = await ok(cO, 'send_chat_message', { p_conversation: mirror, p_body: nn('change the problem'), p_thread_root: root1 });
    const job = await ok(cO, 'mirror_request_reply', { p_message: m.id });
    expect(job ?? []).toEqual([]);
    expect((await admin.from('mirror_jobs').select('id').eq('trigger_message_id', m.id)).data).toEqual([]);
  });

  let v1id = '', d2 = '', name2 = '', root2 = '';
  let reworded = '', moved = '';
  it('AC10: a second draft from v1 reuses an unchanged point (positions carry over), and links only at Publish', async () => {
    const v1 = (await admin.from('canvas_versions').select('id, name').eq('canvas_id', canvasId).eq('published_seq', 1).single()).data as Row;
    v1id = v1.id;
    expect((await rpc(cN, 'canvas_draft_open', { p_from_version: v1id })).error, 'not the owner of the version').not.toBeNull();
    // D20: the engine gave the owner no stance; the owner marks p1 (kept, same row) and p3 (moved unchanged: the copy keeps position AND reasoning)
    expect((await rpc(cO, 'canvas_set_position', { p_owner: O.user.id, p_name: canvasName, p_point: p1, p_position: 'agree', p_reasoning: null, p_link_token: null })).error).toBeNull();
    expect((await rpc(cO, 'canvas_set_position', { p_owner: O.user.id, p_name: canvasName, p_point: p3, p_position: 'disagree', p_reasoning: 'legacy reasoning', p_link_token: null })).error).toBeNull();
    const o2 = await ok(cO, 'canvas_draft_open', { p_from_version: v1id });
    expect(o2).toMatchObject({ status: 'opened', canvas_name: canvasName, from_seq: 1 });
    d2 = o2.draft_id; root2 = o2.thread_root_id; name2 = o2.version_name;
    const root = (await admin.from('chat_messages').select('attachment_kind, attachment_id, body').eq('id', root2).single()).data as Row;
    expect(root).toMatchObject({ attachment_kind: 'canvas_version', attachment_id: v1id, body: null });
    // one open draft per canvas: asking again continues the open one
    const again = await ok(cO, 'canvas_draft_open', { p_from_version: v1id });
    expect(again).toMatchObject({ status: 'open_elsewhere', draft_id: d2, thread_root_id: root2, from_seq: 1 });
    expect((await admin.from('canvas_drafts').select('id').eq('canvas_id', canvasId).eq('state', 'open')).data).toHaveLength(1);
    // a draft version cannot be the base of another
    expect((await rpc(cO, 'canvas_draft_open', { p_from_version: (await draftRow(d2)).version_id })).error).not.toBeNull();

    const b = await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: d2, p_kind: 'draft', p_speed: 'fast' });
    expect(b.base_label).toBe('v1');
    expect(b.base_points).toHaveLength(3);
    expect(b.base_points.every((p: Row) => p.is_head === true)).toBe(true);
    expect((b.base_points as Row[]).find((p) => p.id === p1)!.other_positions, 'X took a position on p1').toBe(1);
    const done = await engine('_canvas_draft_run_complete', {
      p_run: b.run_id, p_questions: {}, p_decided: [], p_reply: nn('draft two'), p_usd: 0.01,
      p_actions: [
        { action: 'keep', point_id: p1 },
        { action: 'reword', old_point_id: p2, box: BOX.problem, statement: nn('tax panic every deadline'), story: nn('story two') },
        { action: 'move', old_point_id: p3, box: BOX.solution, statement: '', story: '' },
        { action: 'new', box: BOX.channels, statement: nn('two owner groups'), story: '' },
      ],
    });
    expect(done).toMatchObject({ status: 'ok', points: 4, kept: 1, created: 3, links: 2 });
    const rows = await tagRows(`canvas_${name2}`);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.id), 'the unchanged point is the SAME row').toContain(p1);
    expect((await pointRow(p1)).system_tags).toEqual(expect.arrayContaining([`canvas_${name1}`, `canvas_${name2}`]));
    reworded = rows.find((r) => r.statement === nn('tax panic every deadline'))!.id;
    moved = rows.find((r) => r.statement === nn('2500 baht'))!.id; // same words
    expect(moved).not.toBe(p3);
    expect(rows.find((r) => r.id === moved)!.system_tags).toContain(BOX.solution);
    const d = await draftRow(d2);
    expect(d.pending_links).toEqual([
      expect.objectContaining({ old: p2, new: reworded }),
      expect.objectContaining({ old: p3, new: moved }),
    ]);
    // the legacy six-argument completion: a move with the same words copies the owner's stance and reasoning, a reword starts with none
    const copied = await admin.from('point_positions').select('position, reasoning').eq('user_id', O.user.id).eq('point_id', moved);
    expect(copied.error).toBeNull();
    expect(copied.data).toEqual([{ position: 'disagree', reasoning: 'legacy reasoning' }]);
    const rewordedStance = await admin.from('point_positions').select('position').eq('user_id', O.user.id).eq('point_id', reworded);
    expect(rewordedStance.error).toBeNull();
    expect(rewordedStance.data, 'a reworded point starts without a stance').toHaveLength(0);
    expect((await pointRow(p2)).superseded_by, 'no link while drafting').toBeNull();
    expect((await pointRow(p3)).superseded_by).toBeNull();
    // positions carried: X's position on p1 shows in the draft; v1 is untouched
    const dv = await get(cO, canvasName, name2);
    expect((dv.positions as Row[]).filter((p) => p.point_id === p1).map((p) => p.user_id).sort()).toEqual([O.user.id, X.user.id].sort());
    expect(ids(await get(cO, canvasName, name1))).toEqual([p1, p2, p3].sort());
    expect((await get(cX, canvasName, name2)).access.admitted, 'the draft is still invisible to readers').toBe(false);
    // p1 is kept by the unpublished draft, so it carries the draft's tag. A reader of the published v1 must not learn
    // the draft's internal name, or that p1 is in it, from ANY part of the answer; the owner still sees the tag.
    for (const [who, c, tok] of [['X (event)', cX, null], ['S (link)', cS, token], ['signed out', anon, token]] as const) {
      const r = await get(c, canvasName, null, tok);
      expect(ids(r), `${who} reads v1`).toContain(p1);
      expect(JSON.stringify(r), `${who}: no draft tag anywhere in the response`).not.toContain(name2);
      const tags = (r.points as Row[]).find((p) => p.id === p1)!.system_tags as string[];
      expect(tags, `${who}: the published tag and the box tag stay`).toEqual(expect.arrayContaining([`canvas_${name1}`, BOX.segments]));
    }
    // CONTROL: the owner reading the same version sees the draft tag on the kept point
    const own = (await get(cO, canvasName, name1)).points as Row[];
    expect(own.find((p) => p.id === p1)!.system_tags, 'the owner sees every tag').toEqual(expect.arrayContaining([`canvas_${name1}`, `canvas_${name2}`]));
  });

  it('AC6: a revision replaces the draft\'s points: no duplicates, reused points survive, an orphaned story goes', async () => {
    const before = (await tagRows(`canvas_${name2}`)).map((r) => r.id as string).filter((id) => id !== p1);
    expect(before).toHaveLength(3);
    const { done } = await drive(O, d2, [
      { action: 'keep', point_id: p1 },
      { action: 'reword', old_point_id: p2, box: BOX.problem, statement: nn('tax panic, revised'), story: nn('story three') },
      { action: 'new', box: BOX.channels, statement: nn('two owner groups, revised'), story: '' },
    ], { reply: nn('draft two revised') });
    expect(done).toMatchObject({ status: 'ok', points: 3, links: 1 });
    expect((await admin.from('points').select('id').in('id', before)).data, 'the points of the first revision are gone').toEqual([]);
    const rows = await tagRows(`canvas_${name2}`);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.statement)).size, 'no duplicate statements').toBe(3);
    expect(rows.map((r) => r.id)).toContain(p1);
    expect((await admin.from('stories').select('id').eq('content', nn('story two'))).data, 'the story of a deleted point goes with it').toEqual([]);
    expect((await admin.from('stories').select('id').eq('content', nn('story three'))).data).toHaveLength(1);
    expect((await admin.from('stories').select('id').eq('content', nn('story one'))).data, 'a reused point\'s story stays').toHaveLength(1);
    expect((await pointRow(p3)).system_tags, 'the point the revision dropped is not in v2 and keeps only v1\'s tag').not.toContain(`canvas_${name2}`);
    reworded = rows.find((r) => r.statement === nn('tax panic, revised'))!.id;
    const d = await draftRow(d2);
    expect(d.run_count).toBe(2);
    expect(d.pending_links).toEqual([expect.objectContaining({ old: p2, new: reworded })]);
  });

  it('AC10/AC11: Publish links reword to its head, numbers v2; v1 still shows every point it had', async () => {
    const pub = await ok(cO, 'canvas_draft_publish', { p_draft: d2 });
    expect(pub).toEqual({ seq: 2, skipped_links: 0 });
    expect((await pointRow(p2)).superseded_by, 'the old wording now points at the new one').toBe(reworded);
    expect((await pointRow(p3)).superseded_by, 'the revision dropped the move: no link').toBeNull();
    // AC11: v1 shows all three, the superseded one included
    for (const [who, c] of [['owner', cO], ['X', cX]] as const) {
      expect(ids(await get(c, canvasName, name1)), `${who} reads v1`).toEqual([p1, p2, p3].sort());
    }
    const newest = await get(cX);
    expect(newest.access.version, 'no version asked: the newest').toBe(name2);
    expect(ids(newest)).toEqual([p1, reworded, (await tagRows(`canvas_${name2}`)).find((r) => r.statement === nn('two owner groups, revised'))!.id].sort());
    expect(newest.access.versions.map((v: Row) => v.seq), 'newest first').toEqual([2, 1]);
    expect((newest.positions as Row[]).some((p) => p.point_id === p1 && p.user_id === X.user.id), 'X\'s position on the reused point shows in v2').toBe(true);
    const list = await ok(cO, 'list_my_canvas_versions');
    expect((list as Row[]).map((v) => v.seq)).toEqual([2, 1]);
    expect((list as Row[]).every((v) => v.canvas_name === canvasName && v.has_open_draft === false)).toBe(true);
  });

  let name3 = '';
  it('AC10: a draft started from v1 AFTER v2 reworded p2 gets no link for it (one successor per point)', async () => {
    const o3 = await ok(cO, 'canvas_draft_open', { p_from_version: v1id });
    expect(o3.status).toBe('opened');
    const d3 = o3.draft_id; name3 = o3.version_name;
    const b = await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: d3, p_kind: 'draft', p_speed: 'fast' });
    expect((b.base_points as Row[]).find((p) => p.id === p2)!.is_head, 'p2 is no head any more').toBe(false);
    const done = await engine('_canvas_draft_run_complete', {
      p_run: b.run_id, p_questions: {}, p_decided: [], p_reply: nn('draft three'), p_usd: 0.01,
      p_actions: [
        { action: 'keep', point_id: p1 },
        { action: 'reword', old_point_id: p2, box: BOX.problem, statement: nn('tax panic, third wording'), story: '' },
      ],
    });
    expect(done).toMatchObject({ status: 'ok', links: 0 });
    expect((await draftRow(d3)).pending_links).toEqual([]);
    expect(await ok(cO, 'canvas_draft_publish', { p_draft: d3 })).toEqual({ seq: 3, skipped_links: 0 });
    expect((await pointRow(p2)).superseded_by, 'p2 still points at the v2 wording').toBe(reworded);
  });

  it('Publish skips a link whose old point stopped being a head after it was recorded, and says so', async () => {
    const v3 = (await admin.from('canvas_versions').select('id').eq('canvas_id', canvasId).eq('published_seq', 3).single()).data as Row;
    const o = await ok(cO, 'canvas_draft_open', { p_from_version: v3.id });
    const b = await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: o.draft_id, p_kind: 'draft', p_speed: 'fast' });
    const third = (b.base_points as Row[]).find((p) => p.statement === nn('tax panic, third wording'))!;
    await engine('_canvas_draft_run_complete', {
      p_run: b.run_id, p_questions: {}, p_decided: [], p_reply: nn('draft four'), p_usd: 0.01,
      p_actions: [{ action: 'keep', point_id: p1 }, { action: 'reword', old_point_id: third.id, box: BOX.problem, statement: nn('tax panic, fourth wording'), story: '' }],
    });
    expect((await draftRow(o.draft_id)).pending_links).toHaveLength(1);
    // a link written elsewhere in the meantime makes the old point a non-head
    const other = (await admin.from('points').insert({ statement: nn('someone else got there first'), first_validator_id: O.user.id, visibility: 'private', tags: [], system_tags: [BOX.problem, `canvas_${name3}`] }).select('id').single()).data as Row;
    expect((await admin.from('points').update({ superseded_by: other.id }).eq('id', third.id)).error).toBeNull();
    const pub = await ok(cO, 'canvas_draft_publish', { p_draft: o.draft_id });
    expect(pub).toEqual({ seq: 4, skipped_links: 1 });
    expect((await draftRow(o.draft_id)).skipped_links).toEqual([expect.objectContaining({ old: third.id })]);
    expect((await pointRow(third.id)).superseded_by, 'the skipped link was not written over the other one').toBe(other.id);
  });

  it('discard removes only the draft\'s own points and tag, keeps the version row hidden, and leaves no gap in the numbering', async () => {
    const v4 = (await admin.from('canvas_versions').select('id').eq('canvas_id', canvasId).eq('published_seq', 4).single()).data as Row;
    const o = await ok(cO, 'canvas_draft_open', { p_from_version: v4.id });
    const draftTag = `canvas_${o.version_name}`;
    await drive(O, o.draft_id, [{ action: 'keep', point_id: p1 }, { action: 'new', box: BOX.revenue, statement: nn('to be discarded'), story: nn('discarded story') }]);
    expect((await tagRows(draftTag)).map((r) => r.statement).sort()).toEqual([nn('cafe owners'), nn('to be discarded')].sort());
    expect((await rpc(cN, 'canvas_draft_discard', { p_draft: o.draft_id })).error, 'CONTROL: a stranger cannot').not.toBeNull();
    expect(await ok(cO, 'canvas_draft_discard', { p_draft: o.draft_id })).toBe(true);
    expect(await ok(cO, 'canvas_draft_discard', { p_draft: o.draft_id }), 'a second discard is a no-op').toBe(false);
    expect((await admin.from('points').select('id').eq('statement', nn('to be discarded'))).data, 'the created point is gone').toEqual([]);
    expect((await admin.from('stories').select('id').eq('content', nn('discarded story'))).data, 'with its story').toEqual([]);
    expect(await tagRows(draftTag), 'the reused point lost only the discarded draft\'s tag').toEqual([]);
    expect((await pointRow(p1)).system_tags).toEqual(expect.arrayContaining([`canvas_${name1}`, `canvas_${name2}`, `canvas_${name3}`]));
    expect(await draftRow(o.draft_id)).toMatchObject({ state: 'discarded' });
    const listed = await get(cO);
    expect(listed.access.versions.map((v: Row) => v.seq), 'the discarded draft is not listed, not even to the owner').toEqual([4, 3, 2, 1]);
    expect(listed.access.draft).toBeNull();
    // the mirror stays quiet in a DISCARDED draft's thread too
    const late = await ok(cO, 'send_chat_message', { p_conversation: mirror, p_body: nn('after the discard'), p_thread_root: o.thread_root_id });
    expect((await ok(cO, 'mirror_request_reply', { p_message: late.id })) ?? [], 'no job in a discarded draft thread').toEqual([]);
    // the next Publish takes the next number: no gap
    const o2 = await ok(cO, 'canvas_draft_open', { p_from_version: v4.id });
    await drive(O, o2.draft_id, [{ action: 'keep', point_id: p1 }]);
    expect(await ok(cO, 'canvas_draft_publish', { p_draft: o2.draft_id })).toEqual({ seq: 5, skipped_links: 0 });
    // Artifacts: five published versions and a discarded draft are ONE canvas in the owner's list, under its own name
    const mine = ((await ok(cO, 'list_my_artifacts_canvases')) as Row[]).map((r) => r.name as string);
    expect(mine.filter((n) => n === canvasName), 'one row for the canvas').toHaveLength(1);
    expect(mine.filter((n) => n.startsWith(`${canvasName}_d`)), 'no version of it listed as a canvas').toEqual([]);
  });

  it('a canvas version attaches only for its owner and only in the owner\'s own mirror; points still attach', async () => {
    const ownMirror = await ok(cO, 'send_chat_message', { p_conversation: mirror, p_body: null, p_attachment_kind: 'canvas_version', p_attachment_id: v1id });
    expect(ownMirror).toMatchObject({ attachment_kind: 'canvas_version', attachment_id: v1id });
    const dm = await ok(cO, 'start_dm', { p_other: X.user.id }); // O and X share the event, so they may talk
    const dmId = typeof dm === 'string' ? dm : (dm as Row).id ?? (dm as Row).conversation_id;
    expect((await rpc(cO, 'send_chat_message', { p_conversation: dmId, p_body: null, p_attachment_kind: 'canvas_version', p_attachment_id: v1id })).error, 'not into a 1:1').not.toBeNull();
    const nMirror = (await engine('_chat_ensure_mirror', { p_uid: N.user.id })) as string;
    expect((await rpc(cN, 'send_chat_message', { p_conversation: nMirror, p_body: null, p_attachment_kind: 'canvas_version', p_attachment_id: v1id })).error, 'not someone else\'s version').not.toBeNull();
    expect((await rpc(cO, 'send_chat_message', { p_conversation: mirror, p_body: null, p_attachment_kind: 'point', p_attachment_id: p1 })).error, 'CONTROL: an ordinary attachment still works').toBeNull();
    expect((await rpc(cO, 'send_chat_message', { p_conversation: mirror, p_body: null, p_attachment_kind: 'nonsense', p_attachment_id: v1id })).error).not.toBeNull();
  });

  it('material: at most 10 per draft, 200,000 characters each, listed to the owner without its text, removed at discard', async () => {
    const o = await ok(cO, 'canvas_draft_open');
    expect(o.canvas_name, 'a second new canvas gets the next automatic name').toMatch(/^canvas_\d+$/);
    const first = await engine('_canvas_draft_add_material', { p_owner: O.user.id, p_draft: o.draft_id, p_kind: 'file', p_label: 'big.md', p_text: 'x'.repeat(250_000) });
    expect(first).toMatchObject({ status: 'ok', chars: 200_000, truncated: true });
    const ex = await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: o.draft_id, p_kind: 'extract', p_speed: 'fast' });
    expect(ex).toMatchObject({ status: 'run', reserved_usd: 0.35 });
    expect(await engine('_canvas_draft_extract_complete', { p_run: ex.run_id, p_owner: O.user.id, p_draft: o.draft_id, p_label: 'deck.pdf', p_text: nn('from a pdf'), p_usd: 0.05 })).toMatchObject({ status: 'ok' });
    expect((await admin.from('canvas_draft_runs').select('state, kind').eq('id', ex.run_id).single()).data).toMatchObject({ state: 'done', kind: 'extract' });
    for (let i = 0; i < 8; i++) {
      expect((await engine('_canvas_draft_add_material', { p_owner: O.user.id, p_draft: o.draft_id, p_kind: 'link', p_label: `https://example.test/${i}`, p_text: nn(`link ${i}`) })).status).toBe('ok');
    }
    expect((await engine('_canvas_draft_add_material', { p_owner: O.user.id, p_draft: o.draft_id, p_kind: 'link', p_label: 'one too many', p_text: 'x' })).status).toBe('limit');
    const listed = await cO.from('canvas_draft_material').select('id, label, chars, kind').eq('draft_id', o.draft_id);
    expect(listed.data).toHaveLength(10);
    expect((await cO.from('canvas_draft_material').select('text').eq('draft_id', o.draft_id)).error, 'the text is never readable by a client').not.toBeNull();
    expect((await cN.from('canvas_draft_material').select('id')).data ?? []).toHaveLength(0);
    expect(await ok(cO, 'canvas_draft_discard', { p_draft: o.draft_id })).toBe(true);
    expect((await admin.from('canvas_draft_material').select('id').eq('draft_id', o.draft_id)).data, 'the text goes at Discard').toEqual([]);
  });

  it('a client cannot execute any _canvas_draft_* function or helper, signed in or out; the service role can call the engine set', async () => {
    const calls: Array<[string, Row]> = [
      ['_canvas_draft_run_begin', { p_owner: ZERO, p_draft: ZERO, p_kind: 'draft', p_speed: 'fast' }],
      ['_canvas_draft_run_complete', { p_run: ZERO, p_actions: [], p_questions: {}, p_decided: [], p_reply: 'x', p_usd: 0 }],
      ['_canvas_draft_run_fail', { p_run: ZERO, p_code: 'x', p_reply: null, p_actual_usd: 0 }],
      ['_canvas_draft_tensions_complete', { p_run: ZERO, p_tensions: [], p_reply: 'x', p_usd: 0 }],
      ['_canvas_draft_add_material', { p_owner: ZERO, p_draft: ZERO, p_kind: 'file', p_label: 'x', p_text: 'x' }],
      ['_canvas_draft_extract_complete', { p_run: ZERO, p_owner: ZERO, p_draft: ZERO, p_label: 'x', p_text: 'x', p_usd: 0 }],
      ['_canvas_draft_post', { p_conversation: ZERO, p_thread_root: ZERO, p_body: 'x', p_refs: [] }],
      ['_canvas_draft_clear_points', { p_draft: ZERO }],
      ['_canvas_draft_material_retention', { p_draft: ZERO }],
      ['_canvas_next_version_seq', { p_canvas: ZERO }],
      ['_canvas_owner_has_points', { p_owner: ZERO, p_name: 'x' }],
      ['_canvas_has_public_point', { p_owner: ZERO, p_name: 'x' }],
    ];
    const denied = (e: any) => !!e && (e.code === '42501' || /permission denied/i.test(e.message ?? ''));
    for (const [fn, args] of calls) {
      expect(denied((await rpc(cO, fn, args)).error), `${fn} as a signed-in client`).toBe(true);
      expect(denied((await rpc(anon, fn, args)).error), `${fn} signed out`).toBe(true);
    }
    for (const [fn, args] of calls.slice(0, 6)) {
      const r = await admin.rpc(fn, args);
      expect(r.error?.code, `${fn} resolves for the service role (the argument names are right)`).not.toBe('PGRST202');
    }
    expect((await rpc(cO, 'list_my_canvas_versions')).error, 'CONTROL: a client function works').toBeNull();
  });

  describe('review fixes (set A)', () => {
    const authorRef = (id: string) => createHash('sha256').update(`p1512:${id}`).digest('hex');

    it('A1: erasing a person whose words a run read cancels that run, scrubs the tensions and decided notes, and a late completion writes nothing', async () => {
      const Z = await mkUser('Erased');
      const o = await ok(cO, 'canvas_draft_open');
      const begin = await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: o.draft_id, p_kind: 'draft', p_speed: 'fast' });
      expect(begin.status).toBe('run');
      await admin.from('canvas_draft_runs').update({ derived_refs: [authorRef(Z.user.id)] }).eq('id', begin.run_id);
      await admin.from('canvas_drafts').update({ tensions: [{ id: 't1', summary: nn('paraphrase of Z') }], decided: [{ kind: 'conflict', text: nn('paraphrase of Z') }] }).eq('id', o.draft_id);
      const erased = await admin.rpc('erase_chat_data_for', { p_uid: Z.user.id });
      expect(erased.error, 'erase runs').toBeNull();
      expect(erased.data).toMatchObject({ canvas_draft_runs_cancelled: expect.any(Number), canvas_drafts_scrubbed: expect.any(Number) });
      expect((await admin.from('canvas_draft_runs').select('state, error_code').eq('id', begin.run_id).single()).data).toMatchObject({ state: 'cancelled', error_code: 'erased' });
      expect(await draftRow(o.draft_id)).toMatchObject({ tensions: [], decided: [] });
      const spendId = ((await admin.from('canvas_draft_runs').select('spend_id').eq('id', begin.run_id).single()).data as Row).spend_id;
      const done = await engine('_canvas_draft_run_complete', {
        p_run: begin.run_id, p_actions: [{ action: 'new', box: BOX.segments, statement: nn('after erasure'), story: '' }],
        p_questions: {}, p_decided: [], p_reply: nn('late reply'), p_usd: 0.01,
      });
      expect(done, 'a completion of a cancelled run answers nothing').toBeNull();
      expect((await admin.from('points').select('id').eq('statement', nn('after erasure'))).data, 'and writes no point').toEqual([]);
      expect((await admin.from('chat_messages').select('id').eq('body', nn('late reply'))).data, 'and posts no reply').toEqual([]);
      expect((await admin.from('mirror_ai_spend').select('state, actual_usd').eq('id', spendId).single()).data, 'the call was made: it is charged').toMatchObject({ state: 'settled' });
      // CONTROL: a run that read nobody's erased words still completes
      const o2 = await ok(cO, 'canvas_draft_open');
      expect(o2.draft_id, 'the draft with a run is touched: a new one starts').not.toBe(o.draft_id);
      expect((await drive(O, o2.draft_id, [{ action: 'new', box: BOX.segments, statement: nn('a1 control'), story: '' }])).done).toMatchObject({ status: 'ok' });
      await ok(cO, 'canvas_draft_discard', { p_draft: o2.draft_id });
      await ok(cO, 'canvas_draft_discard', { p_draft: o.draft_id });
    });

    /** A published first canvas with the given points; returns the published version's id (a base to draft from). */
    async function publishedBase(points: Array<{ box: string; statement: string }>): Promise<{ versionId: string; ids: string[] }> {
      const o = await ok(cO, 'canvas_draft_open');
      await drive(O, o.draft_id, points.map((p) => ({ action: 'new', box: p.box, statement: p.statement, story: '' })));
      await ok(cO, 'canvas_draft_publish', { p_draft: o.draft_id });
      const versionId = ((await admin.from('canvas_drafts').select('version_id').eq('id', o.draft_id).single()).data as Row).version_id as string;
      const rows = (await admin.from('points').select('id, statement').eq('first_validator_id', O.user.id).in('statement', points.map((p) => p.statement))).data ?? [];
      return { versionId, ids: points.map((p) => rows.find((r) => r.statement === p.statement)!.id as string) };
    }

    it('R1: a draft run that consumed stored tensions is cancelled by erasing the person the tension run read, even after the copy is gone', async () => {
      const Z = await mkUser('ErasedTension');
      const { versionId } = await publishedBase([{ box: BOX.segments, statement: nn('r1 base point') }]);
      const o = await ok(cO, 'canvas_draft_open', { p_from_version: versionId });
      // a tension run that read Z's copied words
      const t = await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: o.draft_id, p_kind: 'tensions', p_speed: 'slow' });
      expect(t.status).toBe('run');
      await admin.from('canvas_draft_runs').update({ derived_refs: [authorRef(Z.user.id)] }).eq('id', t.run_id);
      await engine('_canvas_draft_tensions_complete', { p_run: t.run_id, p_tensions: [{ id: 't1', point_id: null, summary: nn('paraphrase of Z'), options: ['a', 'b'], pick: 1, why: 'w' }], p_reply: nn('tension reply'), p_usd: 0.01 });
      expect((await draftRow(o.draft_id)).tension_refs, 'the tensions keep whose words they came from').toEqual([authorRef(Z.user.id)]);
      // the copy is gone (nothing in the thread names Z); a later draft run consumes the stored tensions
      const run = await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: o.draft_id, p_kind: 'draft', p_speed: 'slow' });
      expect(run.status).toBe('run');
      expect(run.tensions).toHaveLength(1);
      expect((await admin.from('canvas_draft_runs').select('derived_refs').eq('id', run.run_id).single()).data!.derived_refs, 'its refs include the tension run\'s').toContain(authorRef(Z.user.id));
      await admin.rpc('erase_chat_data_for', { p_uid: Z.user.id });
      expect((await admin.from('canvas_draft_runs').select('state').eq('id', run.run_id).single()).data).toMatchObject({ state: 'cancelled' });
      expect(await draftRow(o.draft_id)).toMatchObject({ tensions: [], tension_refs: [] });
      const done = await engine('_canvas_draft_run_complete', {
        p_run: run.run_id, p_actions: [{ action: 'new', box: BOX.channels, statement: nn('r1 after erasure'), story: '' }],
        p_questions: {}, p_decided: [{ kind: 'conflict', text: nn('r1 derived note') }], p_reply: nn('r1 late reply'), p_usd: 0.01,
      });
      expect(done, 'a late completion answers nothing').toBeNull();
      expect((await admin.from('points').select('id').eq('statement', nn('r1 after erasure'))).data, 'writes no point').toEqual([]);
      expect((await admin.from('chat_messages').select('id').eq('body', nn('r1 late reply'))).data, 'posts nothing').toEqual([]);
      expect((await draftRow(o.draft_id)).decided, 'and recreates no derived note').toEqual([]);
      // CONTROL: erasing someone the tension run did not read leaves a draft run alone
      const o2 = await ok(cO, 'canvas_draft_open');
      const r2 = await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: o2.draft_id, p_kind: 'draft', p_speed: 'fast' });
      expect((await admin.from('canvas_draft_runs').select('derived_refs').eq('id', r2.run_id).single()).data!.derived_refs).not.toContain(authorRef(Z.user.id));
      await engine('_canvas_draft_run_fail', { p_run: r2.run_id, p_code: 'test', p_reply: null, p_actual_usd: 0 });
    });

    it('R6: a reword and a move of one run are kept by the next run (the links survive a revision)', async () => {
      const { versionId, ids: [pa, pb] } = await publishedBase([
        { box: BOX.problem, statement: nn('r6 point to reword') }, { box: BOX.solution, statement: nn('r6 point to move') },
      ]) as { versionId: string; ids: [string, string] };
      const o = await ok(cO, 'canvas_draft_open', { p_from_version: versionId });
      const first = await drive(O, o.draft_id, [
        { action: 'reword', old_point_id: pa, box: BOX.problem, statement: nn('r6 reworded'), story: '' },
        { action: 'move', old_point_id: pb, box: BOX.channels },
      ]);
      expect(first.done).toMatchObject({ status: 'ok', links: 2 });
      const second = await engine('_canvas_draft_run_begin', { p_owner: O.user.id, p_draft: o.draft_id, p_kind: 'draft', p_speed: 'fast' });
      const dp = second.draft_points as Row[];
      expect(dp.find((p) => p.statement === nn('r6 reworded'))).toMatchObject({ from_point_id: pa, relation: 'reword' });
      expect(dp.find((p) => p.statement === nn('r6 point to move'))).toMatchObject({ from_point_id: pb, relation: 'move' });
      const done = await engine('_canvas_draft_run_complete', {
        p_run: second.run_id, p_questions: {}, p_decided: [], p_reply: nn('r6 second'), p_usd: 0.01,
        p_actions: [
          { action: 'reword', old_point_id: pa, box: BOX.problem, statement: nn('r6 reworded'), story: '' },
          { action: 'move', old_point_id: pb, box: BOX.channels },
        ],
      });
      expect(done, 'the same actions again').toMatchObject({ status: 'ok', links: 2 });
      expect((await draftRow(o.draft_id)).pending_links).toEqual([
        expect.objectContaining({ old: pa, relation: 'reword' }), expect.objectContaining({ old: pb, relation: 'move' }),
      ]);
      await ok(cO, 'canvas_draft_discard', { p_draft: o.draft_id });
    });

    it('A3: a first canvas (no base) can be discarded; opening a new canvas again continues an untouched one, but not a touched one', async () => {
      const a = await ok(cO, 'canvas_draft_open');
      const again = await ok(cO, 'canvas_draft_open');
      expect(again).toMatchObject({ status: 'opened', resumed: true, draft_id: a.draft_id, canvas_name: a.canvas_name, thread_root_id: a.thread_root_id });
      const canvases = (await admin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', a.canvas_name)).data ?? [];
      expect(canvases, 'no second canvas was created').toHaveLength(1);
      // touch it: a run exists, so the next New canvas starts another
      await beginAndFail(O, a.draft_id, 'draft', 0.01);
      const next = await ok(cO, 'canvas_draft_open');
      expect(next.draft_id, 'a touched draft is not continued').not.toBe(a.draft_id);
      expect(await ok(cO, 'canvas_draft_discard', { p_draft: a.draft_id }), 'a first-canvas draft is discarded like any other').toBe(true);
      expect(await draftRow(a.draft_id)).toMatchObject({ state: 'discarded' });
      await ok(cO, 'canvas_draft_discard', { p_draft: next.draft_id });
    });

    it('A4: a revision and a discard delete only the stories the engine wrote; a story the owner attached by hand survives', async () => {
      const F = await freshOwner('A4');
      const o = await ok(F.c, 'canvas_draft_open');
      // One story per author per point (story_points_author_point_unique): the hand story goes on a draft point the engine wrote
      // WITHOUT a story, which is the only way an owner can attach their own story to a draft point.
      const { done } = await drive(F.u, o.draft_id, [
        { action: 'new', box: BOX.segments, statement: nn('a4 point'), story: nn('a4 engine story') },
        { action: 'new', box: BOX.problem, statement: nn('a4 bare point'), story: '' },
      ]);
      expect(done).toMatchObject({ status: 'ok' });
      const pt = (await tagRows(`canvas_${o.version_name}`, F.u)).find((r) => r.statement === nn('a4 bare point'))!;
      expect(pt, 'the story-less draft point exists').toBeTruthy();
      const hand = await admin.from('stories').insert({ content: nn('a4 hand story'), author_id: F.u.user.id, visibility: 'private' }).select('id').single();
      expect(hand.error).toBeNull();
      const link = await admin.from('story_points').insert({ story_id: hand.data!.id, point_id: pt.id, author_id: F.u.user.id });
      expect(link.error).toBeNull();
      const { done: again } = await drive(F.u, o.draft_id, [{ action: 'new', box: BOX.problem, statement: nn('a4 revised'), story: '' }]);
      expect(again).toMatchObject({ status: 'ok' });
      expect((await admin.from('stories').select('id').eq('content', nn('a4 engine story'))).data, 'the engine\'s own story goes').toEqual([]);
      expect((await admin.from('stories').select('id').eq('content', nn('a4 hand story'))).data, 'the owner\'s story stays').toHaveLength(1);
      await ok(F.c, 'canvas_draft_discard', { p_draft: o.draft_id });
      expect((await admin.from('stories').select('id').eq('content', nn('a4 hand story'))).data, 'also after a discard').toHaveLength(1);
    });

    it('points only: new actions with story null (or no story key; what the engine now sends) create no story row and no story link', async () => {
      const F = await freshOwner('PointsOnlyNew');
      const o = await ok(F.c, 'canvas_draft_open');
      const { done } = await drive(F.u, o.draft_id, [
        { action: 'new', box: BOX.segments, statement: nn('po point'), story: null },
        { action: 'new', box: BOX.problem, statement: nn('po other point') },
      ]);
      expect(done).toMatchObject({ status: 'ok' });
      const pts = (await tagRows(`canvas_${o.version_name}`, F.u)).filter((r) => String(r.statement).startsWith(nn('po')));
      expect(pts, 'both draft points exist').toHaveLength(2);
      expect((await admin.from('story_points').select('story_id').in('point_id', pts.map((p) => p.id as string))).data, 'no story link').toEqual([]);
      expect((await draftRow(o.draft_id)).created_story_ids, 'nothing for a revision or discard to delete').toEqual([]);
      await ok(F.c, 'canvas_draft_discard', { p_draft: o.draft_id });
    });

    it('points only: a reword and a move with story null create no story row and keep the owner\'s existing private story linked; no duplicates, and the stories survive a revision and a discard', async () => {
      const F = await freshOwner('PointsOnlyRewordMove');
      // a published base whose two points each carry the owner's own story
      const o = await ok(F.c, 'canvas_draft_open');
      await drive(F.u, o.draft_id, [
        { action: 'new', box: BOX.problem, statement: nn('rk reword base'), story: nn('rk story A') },
        { action: 'new', box: BOX.revenue, statement: nn('rk move base'), story: nn('rk story B') },
      ]);
      await ok(F.c, 'canvas_draft_publish', { p_draft: o.draft_id });
      const versionId = ((await admin.from('canvas_drafts').select('version_id').eq('id', o.draft_id).single()).data as Row).version_id as string;
      const pointId = async (statement: string) => ((await admin.from('points').select('id').eq('first_validator_id', F.u.user.id).eq('statement', statement).single()).data as Row).id as string;
      const storyId = async (content: string) => ((await admin.from('stories').select('id').eq('content', content).single()).data as Row).id as string;
      const baseA = await pointId(nn('rk reword base'));
      const baseB = await pointId(nn('rk move base'));
      const storyA = await storyId(nn('rk story A'));
      const storyB = await storyId(nn('rk story B'));
      const storyRows = async () => ((await admin.from('stories').select('id').like('content', `${nn('rk story')}%`)).data ?? []).length;
      const linked = async (point: string) => ((await admin.from('story_points').select('story_id').eq('point_id', point)).data ?? []).map((r) => r.story_id as string);
      expect(await storyRows()).toBe(2);

      // the engine's actions: story null on all of them
      const o2 = await ok(F.c, 'canvas_draft_open', { p_from_version: versionId });
      const { done } = await drive(F.u, o2.draft_id, [
        { action: 'reword', old_point_id: baseA, box: BOX.problem, statement: nn('rk reworded'), story: null },
        { action: 'move', old_point_id: baseB, box: BOX.solution, statement: '', story: null },
        { action: 'new', box: BOX.channels, statement: nn('rk fresh'), story: null },
      ]);
      expect(done).toMatchObject({ status: 'ok', points: 3, created: 3, links: 2 });
      const rows = await tagRows(`canvas_${o2.version_name}`, F.u);
      const reworded = rows.find((r) => r.statement === nn('rk reworded'))!.id as string;
      const moved = rows.find((r) => r.statement === nn('rk move base'))!.id as string;
      const fresh = rows.find((r) => r.statement === nn('rk fresh'))!.id as string;
      expect(await linked(reworded), 'the reworded point keeps the owner\'s story A').toEqual([storyA]);
      expect(await linked(moved), 'the moved point keeps the owner\'s story B').toEqual([storyB]);
      expect(await linked(fresh), 'a new point has no story').toEqual([]);
      expect(await storyRows(), 'no story row was created or copied').toBe(2);
      expect((await draftRow(o2.draft_id)).created_story_ids, 'nothing here is the engine\'s, so nothing for a revision to delete').toEqual([]);
      expect(await linked(baseA), 'the base point keeps its own link').toEqual([storyA]);

      // a revision removes the draft\'s points and their links, never the owner\'s stories
      const revised = await drive(F.u, o2.draft_id, [{ action: 'keep', point_id: baseA }, { action: 'keep', point_id: baseB }]);
      expect(revised.done).toMatchObject({ status: 'ok' });
      expect(await storyRows(), 'after a revision').toBe(2);
      expect(await ok(F.c, 'canvas_draft_discard', { p_draft: o2.draft_id })).toBe(true);
      expect(await storyRows(), 'after a discard').toBe(2);
      expect(await linked(baseA)).toEqual([storyA]);
      expect(await linked(baseB)).toEqual([storyB]);
    });

    it('A5: forwarding a draft thread root (a canvas_version attachment) is refused; CONTROL: forwarding an ordinary message works', async () => {
      const dm = await ok(cO, 'start_dm', { p_other: X.user.id });
      const dmId = typeof dm === 'string' ? dm : (dm as Row).id ?? (dm as Row).conversation_id;
      const root = (await admin.from('chat_messages').select('id').eq('conversation_id', mirror).eq('attachment_kind', 'canvas_version').limit(1).single()).data as Row;
      const refused = await rpc(cO, 'forward_chat_message', { p_source: root.id, p_target_conversation: dmId });
      expect(refused.error?.code).toBe('22023');
      const plain = await ok(cO, 'send_chat_message', { p_conversation: dmId, p_body: nn('plain') });
      expect((await rpc(cO, 'forward_chat_message', { p_source: plain.id, p_target_conversation: mirror })).error, 'CONTROL').toBeNull();
    });

    it('A12: the owner reads the draft\'s canvas and version names; no one else can read the row, so no one else reads them', async () => {
      const o = await ok(cO, 'canvas_draft_open');
      const own = await cO.from('canvas_drafts').select('canvas_name, version_name').eq('id', o.draft_id).single();
      expect(own.error).toBeNull();
      expect(own.data).toEqual({ canvas_name: o.canvas_name, version_name: o.version_name });
      expect((await draftRow(o.draft_id)).version_name, 'the stored name is the version row\'s name').toBe(((await versionRow((await draftRow(o.draft_id)).version_id)) as Row).name);
      for (const [who, c] of [['a stranger', cN], ['an attendee', cX], ['a link holder', cS]] as const) {
        const r = await c.from('canvas_drafts').select('canvas_name, version_name').eq('id', o.draft_id);
        expect(r.data, who).toEqual([]);
      }
      expect((await anon.from('canvas_drafts').select('canvas_name').eq('id', o.draft_id)).data ?? [], 'signed out').toEqual([]);
      await ok(cO, 'canvas_draft_discard', { p_draft: o.draft_id });
    });

    it('A6: deleting a run\'s spend row clears the link instead of failing', async () => {
      const spend = await admin.from('mirror_ai_spend').insert({ owner_id: O.user.id, bucket: 'canvas', reserved_usd: 0.01, state: 'released' }).select('id').single();
      expect(spend.error).toBeNull();
      const o = await ok(cO, 'canvas_draft_open');
      const run = await admin.from('canvas_draft_runs').insert({ draft_id: o.draft_id, owner_id: O.user.id, kind: 'draft', speed: 'fast', state: 'failed', spend_id: spend.data!.id }).select('id').single();
      expect(run.error).toBeNull();
      expect((await admin.from('mirror_ai_spend').delete().eq('id', spend.data!.id)).error).toBeNull();
      expect(((await admin.from('canvas_draft_runs').select('spend_id').eq('id', run.data!.id).single()).data as Row).spend_id).toBeNull();
      await ok(cO, 'canvas_draft_discard', { p_draft: o.draft_id });
    });
  });

  describe('spend and revision caps (a fresh owner, so the counters start clean)', () => {
    let dC = '';
    const todaySpend = async () => {
      const day = new Date(); day.setUTCHours(0, 0, 0, 0);
      const rows = (await admin.from('mirror_ai_spend').select('reserved_usd, actual_usd, state, owner_id, bucket').gte('created_at', day.toISOString()).neq('state', 'released')).data ?? [];
      return rows as Row[];
    };

    it('one active run per owner; a run left running for over 5 minutes is dead and charged in full; a failed run that cost nothing is not a revision', async () => {
      dC = (await ok(cC, 'canvas_draft_open')).draft_id;
      const a = await engine('_canvas_draft_run_begin', { p_owner: C.user.id, p_draft: dC, p_kind: 'draft', p_speed: 'fast' });
      expect(a.status).toBe('run');
      expect((await engine('_canvas_draft_run_begin', { p_owner: C.user.id, p_draft: dC, p_kind: 'draft', p_speed: 'fast' })).status).toBe('busy');
      const run = (await admin.from('canvas_draft_runs').select('spend_id').eq('id', a.run_id).single()).data as Row;
      await admin.from('canvas_draft_runs').update({ started_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', a.run_id);
      const b = await engine('_canvas_draft_run_begin', { p_owner: C.user.id, p_draft: dC, p_kind: 'draft', p_speed: 'fast' });
      expect(b.status, 'the dead run no longer blocks').toBe('run');
      expect((await admin.from('canvas_draft_runs').select('state, error_code').eq('id', a.run_id).single()).data).toMatchObject({ state: 'failed', error_code: 'abandoned' });
      expect((await admin.from('mirror_ai_spend').select('state, actual_usd, reserved_usd').eq('id', run.spend_id).single()).data).toMatchObject({ state: 'settled', actual_usd: 0.27, reserved_usd: 0.27 });
      // a late answer from the dead run touches nothing
      expect(await engine('_canvas_draft_run_complete', { p_run: a.run_id, p_actions: [], p_questions: {}, p_decided: [], p_reply: nn('late'), p_usd: 0.01 })).toBeNull();
      expect(await engine('_canvas_draft_run_fail', { p_run: b.run_id, p_code: 'x', p_reply: null, p_actual_usd: 0 })).toBe(true);
      expect((await draftRow(dC)).run_count, 'only the dead run counted: the other cost nothing').toBe(1);
      // a first canvas has no version to be in tension with
      expect((await engine('_canvas_draft_run_begin', { p_owner: C.user.id, p_draft: dC, p_kind: 'tensions', p_speed: 'slow' })).status).toBe('denied');
    });

    it('the 5th draft run of a version is the last: the 6th is cap_reached', async () => {
      for (let i = 0; i < 4; i++) expect((await beginAndFail(C, dC, 'draft', 0.01)).status, `run ${i + 2}`).toBe('run');
      expect((await draftRow(dC)).run_count).toBe(5);
      expect((await engine('_canvas_draft_run_begin', { p_owner: C.user.id, p_draft: dC, p_kind: 'draft', p_speed: 'fast' })).status).toBe('cap_reached');
    });

    it('the person\'s daily dollar cap stops further reservations; reservations never exceed it', async (ctx) => {
      const others = (await todaySpend()).filter((r) => r.owner_id !== C.user.id);
      const global = others.reduce((s, r) => s + Number(r.actual_usd ?? r.reserved_usd), 0);
      if (global > 5) ctx.skip(); // the test database's global daily total is already close to its ceiling: the cap seen would not be this person's
      const d = (await ok(cC, 'canvas_draft_open')).draft_id;
      let granted = 0;
      let last = '';
      for (let i = 0; i < 24 && last !== 'capped'; i++) {   // D18: the per-person cap is $6.00 a day, so up to 18 extract reservations of $0.35
        const b = await engine('_canvas_draft_run_begin', { p_owner: C.user.id, p_draft: d, p_kind: 'extract', p_speed: 'fast' });
        last = b.status;
        if (b.status === 'run') { granted += 1; await engine('_canvas_draft_run_fail', { p_run: b.run_id, p_code: 'test', p_reply: null, p_actual_usd: 0.35 }); }
      }
      expect(granted, 'CONTROL: the cap is not hit at the first call').toBeGreaterThan(0);
      expect(last).toBe('capped');
      expect((await admin.from('canvas_draft_runs').select('state').eq('owner_id', C.user.id).eq('state', 'capped')).data!.length).toBeGreaterThan(0);
      const mine = (await todaySpend()).filter((r) => r.owner_id === C.user.id && r.bucket === 'canvas');
      expect(mine.reduce((s, r) => s + Number(r.actual_usd ?? r.reserved_usd), 0)).toBeLessThanOrEqual(6.0 + 1e-6);
    });
  });
});
