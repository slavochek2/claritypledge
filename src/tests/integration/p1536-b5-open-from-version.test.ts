/**
 * P1536 section 3c, B5: a draft opened from a published version starts as that version (migration 20261102090000).
 *   npm run test:integration -- src/tests/integration/p1536-b5-open-from-version.test.ts
 *
 * canvas_draft_open(p_from_version) is called as the signed-in owner, exactly as the client's startCanvasThread does. The published
 * v1 each test starts from is made the way a person makes one: a Send, a run (the model is a STUB: the test hands the worker
 * _canvas_draft_run_complete the result a model could return), then Publish.
 *
 * S3c.1: the RPC test fails before the fix and passes after; each regression case of B5 has a test; control: a new canvas with no
 * base is still empty. Cases that pass BEFORE the fix prove behaviour the migration must not break; the ones that fail before it
 * are the fix itself (the points, and the focus the draft inherits). The legacy public-point copy cannot be seeded through the
 * API (the p1515 trigger refuses a public canvas-tagged point for every role), so it is not here: see the report.
 */
import { traffic } from './p1536-count-fetch';
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;

const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1536b5 ${RUN}`;
const nn = (s: string) => `${TAG} ${s}`;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const BOX = { segments: 'canvas:segments', problem: 'canvas:problem', revenue: 'canvas:revenue' };
const T = 240_000;

const bare = () => createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
async function signIn(u: TestUser): Promise<SupabaseClient> {
  const c = bare();
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  if (error) throw new Error(`[P1536b5] sign-in failed for ${u.name}: ${error.message}`);
  return c;
}
const rpc = (c: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<{ data: any; error: any }> => c.rpc(fn, args) as any;
async function ok(c: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await rpc(c, fn, args);
  if (error) throw new Error(`${fn}: ${error.code} ${error.message}`);
  return data;
}

interface Owner { u: TestUser; c: SupabaseClient; id: string }
const users: TestUser[] = [];
async function mkOwner(label: string): Promise<Owner> {
  const u = await createTestUser({ name: `P1536b5 ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u), id: u.user.id };
}

afterAll(async () => {
  const mine = users.map((u) => u.user.id);
  if (mine.length) {
    await admin.from('canvases').delete().in('owner_id', mine);
    await admin.from('points').delete().like('statement', `${TAG}%`);
    await admin.from('stories').delete().like('content', `${TAG}%`);
    await admin.from('mirror_ai_spend').delete().in('owner_id', mine);
  }
  const gone = await deleteTestUsers(users.map((u) => u.user.id));
  expect(gone.failed, 'every test user was deleted').toBe(0);
  console.log(`P1536b5 live suite traffic: owners=${users.length} requests=${traffic.requests} failedResponses=${traffic.failedResponses}`);
}, 240_000);

/** A published v1 made through the engine: a Send, a stubbed run that writes `points`, Publish. */
interface Published { canvasId: string; canvasName: string; v1: string; v1Name: string; ids: string[]; focus: string | null }
async function publishedV1(o: Owner, opts: { focus?: string | null; withStory?: boolean } = {}): Promise<Published> {
  const focus = opts.focus === undefined ? 'Cafes' : opts.focus;
  const sent = await ok(o.c, 'canvas_workspace_send', {
    p_canvas: null, p_from_version: null, p_expected_draft: null, p_expected_revision: null, p_replace: false,
    p_body: nn('We sell bookkeeping to cafes'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
  });
  expect(sent.status, JSON.stringify(sent)).toBe('ok');
  const b = await ok(admin as unknown as SupabaseClient, '_canvas_draft_run_begin', { p_run: sent.run_id, p_owner: o.id, p_has_file: false, p_cap_reply: null });
  expect(b.status, JSON.stringify(b)).toBe('run');
  const actions = [
    { action: 'new', box: BOX.segments, statement: nn('Cafe owners'), ...(opts.withStory ? { story: nn('A cafe owner told me about receipts') } : {}) },
    { action: 'new', box: BOX.problem, statement: nn('Receipts pile up') },
    { action: 'new', box: BOX.revenue, statement: nn('100 per month') },
  ];
  const d = await ok(admin as unknown as SupabaseClient, '_canvas_draft_run_complete', {
    p_run: sent.run_id, p_owner: o.id, p_actions: actions, p_questions: {}, p_scope: [], p_focus: focus,
    p_other_canvases: [], p_note: null, p_reply: nn('reply'), p_usd: 0.001,
  });
  expect(d.status, JSON.stringify(d)).toBe('ok');
  const st = await ok(o.c, 'get_canvas_draft_state', { p_canvas: sent.canvas_id });
  const pub = await ok(o.c, 'canvas_draft_publish', { p_draft: sent.draft_id, p_expected_revision: st.draft.revision });
  expect(pub, JSON.stringify(pub)).toMatchObject({ status: 'ok', seq: 1 });
  const v1 = (await admin.from('canvas_versions').select('id').eq('canvas_id', sent.canvas_id).eq('name', sent.version_name).single()).data as Row;
  const ids = await pointIds(o.id, sent.version_name);
  expect(ids, 'v1 holds its three points').toHaveLength(3);
  return { canvasId: sent.canvas_id, canvasName: sent.canvas_name, v1: v1.id, v1Name: sent.version_name, ids, focus };
}

async function pointRows(ownerId: string, versionName: string): Promise<Row[]> {
  return ((await admin.from('points').select('id, statement, visibility, system_tags, updated_at, first_validator_id')
    .eq('first_validator_id', ownerId).contains('system_tags', [`canvas_${versionName}`])).data ?? []) as Row[];
}
async function pointIds(ownerId: string, versionName: string): Promise<string[]> {
  return (await pointRows(ownerId, versionName)).map((p) => p.id as string).sort();
}
const draftRow = async (id: string): Promise<Row> => (await admin.from('canvas_drafts').select('*').eq('id', id).single()).data as Row;
const openDrafts = async (ownerId: string): Promise<Row[]> => ((await admin.from('canvas_drafts').select('*').eq('owner_id', ownerId).eq('state', 'open')).data ?? []) as Row[];

describe('B5 a draft opened from a published version starts as that version', () => {
  it('S3c.1 RPC: opening from v1 gives a draft holding v1\'s points, and no box is Changed', async () => {
    const o = await mkOwner('red'); const p = await publishedV1(o);
    const opened = await ok(o.c, 'canvas_draft_open', { p_from_version: p.v1 });
    expect(opened).toMatchObject({ status: 'opened', canvas_name: p.canvasName, from_seq: 1 });
    const d = await draftRow(opened.draft_id);
    expect(d).toMatchObject({ base_version_id: p.v1, state: 'open' });
    expect(await pointIds(o.id, d.version_name), 'the draft holds v1\'s points (same ids)').toEqual(p.ids);
    const st = (await ok(o.c, 'get_canvas_draft_state', { p_canvas: p.canvasId })).draft;
    expect(st).toMatchObject({ has_points: true, differs_from_base: false, changed_boxes: [] });
    const read = await ok(o.c, 'get_canvas', { p_owner: o.id, p_name: p.canvasName, p_link_token: null, p_version: d.version_name });
    expect(read.points as Row[], 'the owner reads those points in the draft').toHaveLength(3);
    expect(read.access.draft.changed_boxes, 'no box reads Changed').toEqual([]);
  }, T);

  it('CONTROL: a new canvas with no base is still empty', async () => {
    const o = await mkOwner('control');
    const opened = await ok(o.c, 'canvas_draft_open');
    expect(opened).toMatchObject({ status: 'opened', from_seq: null });
    const d = await draftRow(opened.draft_id);
    expect(d.base_version_id).toBeNull();
    expect(await pointIds(o.id, d.version_name)).toEqual([]);
    expect(((await admin.from('canvas_draft_points').select('point_id').eq('draft_id', d.id)).data ?? [])).toHaveLength(0);
    expect((await ok(o.c, 'get_canvas_draft_state', { p_canvas: d.canvas_id })).draft).toMatchObject({ has_points: false, differs_from_base: false });
  }, T);

  it('regression: an untouched new-canvas draft is continued, not a second one; a touched one is not', async () => {
    const o = await mkOwner('reuse');
    const a = await ok(o.c, 'canvas_draft_open');
    const again = await ok(o.c, 'canvas_draft_open');
    expect(again, JSON.stringify(again)).toMatchObject({ status: 'opened', resumed: true, draft_id: a.draft_id, thread_root_id: a.thread_root_id, from_seq: null });
    expect(await openDrafts(o.id)).toHaveLength(1);
    // a message in its thread makes it touched: the next new canvas is a second draft
    const ins = await admin.from('chat_messages').insert({ conversation_id: a.conversation_id, author_id: o.id, body: nn('touched'), thread_root_id: a.thread_root_id, kind: 'message' });
    expect(ins.error).toBeNull();
    const second = await ok(o.c, 'canvas_draft_open');
    expect(second.draft_id).not.toBe(a.draft_id);
    expect(second.resumed).toBeUndefined();
    expect(await openDrafts(o.id)).toHaveLength(2);
  }, T);

  it('regression: a second open from the same canvas answers open_elsewhere with the open draft, and writes nothing', async () => {
    const o = await mkOwner('elsewhere'); const p = await publishedV1(o);
    const first = await ok(o.c, 'canvas_draft_open', { p_from_version: p.v1 });
    const d = await draftRow(first.draft_id);
    const pointsBefore = await pointIds(o.id, d.version_name);
    const msgsBefore = ((await admin.from('chat_messages').select('id').eq('conversation_id', first.conversation_id)).data ?? []).length;
    const second = await ok(o.c, 'canvas_draft_open', { p_from_version: p.v1 });
    expect(second).toEqual({
      status: 'open_elsewhere', draft_id: first.draft_id, conversation_id: first.conversation_id, thread_root_id: first.thread_root_id,
      canvas_name: p.canvasName, from_seq: 1,
    });
    expect(await openDrafts(o.id)).toHaveLength(1);
    expect(await pointIds(o.id, d.version_name)).toEqual(pointsBefore);
    expect(((await admin.from('chat_messages').select('id').eq('conversation_id', first.conversation_id)).data ?? []).length).toBe(msgsBefore);
  }, T);

  it('regression: authorization. Not yours, not published, not there and unverified are all refused, with one message for the three that probe ids', async () => {
    const o = await mkOwner('auth'); const n = await mkOwner('stranger'); const p = await publishedV1(o);
    const msg = (r: { error: any }) => `${r.error?.code}|${r.error?.message}`;
    const notYours = await rpc(n.c, 'canvas_draft_open', { p_from_version: p.v1 });
    const notThere = await rpc(o.c, 'canvas_draft_open', { p_from_version: randomUUID() });
    const own = await ok(o.c, 'canvas_draft_open', { p_from_version: p.v1 });
    const notPublished = await rpc(o.c, 'canvas_draft_open', { p_from_version: (await draftRow(own.draft_id)).version_id });
    for (const r of [notYours, notThere, notPublished]) expect(r.error, JSON.stringify(r)).not.toBeNull();
    expect(new Set([msg(notYours), msg(notThere), msg(notPublished)]).size, 'ids cannot be probed: one error').toBe(1);
    expect(notYours.error.code).toBe('42501');
    expect(notYours.error.message).toMatch(/not authorized for this canvas/);
    // the stranger's refused call opened nothing
    expect(await openDrafts(n.id)).toHaveLength(0);
    // an unverified profile
    const u = await mkOwner('unverified');
    expect((await admin.from('profiles').update({ is_verified: false }).eq('id', u.id)).error).toBeNull();
    const unv = await rpc(u.c, 'canvas_draft_open');
    expect(unv.error?.code).toBe('42501');
    expect(await openDrafts(u.id)).toHaveLength(0);
    // signed out
    expect((await rpc(bare(), 'canvas_draft_open')).error, 'anon has no grant').not.toBeNull();
  }, T);

  it('regression: the open-draft cap (10) refuses both a new canvas and a version, with 54000', async () => {
    const o = await mkOwner('cap'); const p = await publishedV1(o);
    for (let i = 0; i < 10; i++) {
      const d = await ok(o.c, 'canvas_draft_open');
      expect(d.status, `draft ${i + 1}`).toBe('opened');
      // touched: a message in its thread, so the next open does not just continue it
      const ins = await admin.from('chat_messages').insert({ conversation_id: d.conversation_id, author_id: o.id, body: nn(`t${i}`), thread_root_id: d.thread_root_id, kind: 'message' });
      expect(ins.error).toBeNull();
    }
    expect(await openDrafts(o.id)).toHaveLength(10);
    const newCanvas = await rpc(o.c, 'canvas_draft_open');
    expect(newCanvas.error?.code, JSON.stringify(newCanvas.error)).toBe('54000');
    const fromVersion = await rpc(o.c, 'canvas_draft_open', { p_from_version: p.v1 });
    expect(fromVersion.error?.code, JSON.stringify(fromVersion.error)).toBe('54000');
    expect(await openDrafts(o.id), 'a refused open writes nothing').toHaveLength(10);
  }, T);

  it('regression: opening starts no run and writes no message into the thread', async () => {
    const o = await mkOwner('norun'); const p = await publishedV1(o);
    const opened = await ok(o.c, 'canvas_draft_open', { p_from_version: p.v1 });
    const d = await draftRow(opened.draft_id);
    expect(((await admin.from('canvas_draft_runs').select('id').eq('draft_id', d.id)).data ?? [])).toHaveLength(0);
    expect(d).toMatchObject({ run_count: 0, tension_count: 0 });
    expect(((await admin.from('chat_messages').select('id').eq('thread_root_id', d.thread_root_id)).data ?? []), 'nothing in the thread').toHaveLength(0);
    // the same for a new canvas
    const fresh = await ok(o.c, 'canvas_draft_open');
    const fd = await draftRow(fresh.draft_id);
    expect(((await admin.from('canvas_draft_runs').select('id').eq('draft_id', fd.id)).data ?? [])).toHaveLength(0);
    expect(((await admin.from('chat_messages').select('id').eq('thread_root_id', fd.thread_root_id)).data ?? [])).toHaveLength(0);
  }, T);

  it('regression: the root. A draft from v1 attaches v1; a new canvas attaches its own draft version; one message each, in the owner\'s mirror', async () => {
    const o = await mkOwner('root'); const p = await publishedV1(o);
    const opened = await ok(o.c, 'canvas_draft_open', { p_from_version: p.v1 });
    const d = await draftRow(opened.draft_id);
    const root = (await admin.from('chat_messages').select('*').eq('id', d.thread_root_id).single()).data as Row;
    expect(root).toMatchObject({ conversation_id: opened.conversation_id, author_id: o.id, body: null, kind: 'message', attachment_kind: 'canvas_version', attachment_id: p.v1 });
    const mirror = (await admin.from('chat_conversations').select('id, kind').eq('id', opened.conversation_id).single()).data as Row;
    expect(mirror.id).toBe(opened.conversation_id);
    const fresh = await ok(o.c, 'canvas_draft_open');
    const fd = await draftRow(fresh.draft_id);
    const froot = (await admin.from('chat_messages').select('*').eq('id', fd.thread_root_id).single()).data as Row;
    expect(froot).toMatchObject({ conversation_id: opened.conversation_id, author_id: o.id, body: null, attachment_kind: 'canvas_version', attachment_id: fd.version_id });
    expect(fd.conversation_id, 'both roots are in the same mirror').toBe(d.conversation_id);
  }, T);

  it('the draft inherits the focus of the draft that published its base; a new canvas has none', async () => {
    const o = await mkOwner('focus'); const p = await publishedV1(o, { focus: 'Cafes' });
    const opened = await ok(o.c, 'canvas_draft_open', { p_from_version: p.v1 });
    expect((await draftRow(opened.draft_id)).focus).toBe('Cafes');
    const fresh = await ok(o.c, 'canvas_draft_open');
    expect((await draftRow(fresh.draft_id)).focus).toBeNull();
  }, T);

  it('private point identity: the draft carries v1\'s own point rows (same ids, still private, not touched), their stories stay linked, and v1 is unchanged', async () => {
    const o = await mkOwner('identity'); const p = await publishedV1(o, { withStory: true });
    const before = await pointRows(o.id, p.v1Name);
    const links = async () => ((await admin.from('story_points').select('story_id, point_id').in('point_id', p.ids)).data ?? [])
      .map((r) => `${r.story_id}:${r.point_id}`).sort();
    const linksBefore = await links();
    expect(linksBefore.length, 'CONTROL: the story is linked to a point, so "stays linked" can fail').toBeGreaterThanOrEqual(1);
    const opened = await ok(o.c, 'canvas_draft_open', { p_from_version: p.v1 });
    const d = await draftRow(opened.draft_id);
    const inDraft = await pointRows(o.id, d.version_name);
    expect(inDraft.map((r) => r.id).sort()).toEqual(p.ids);
    expect(inDraft.every((r) => r.visibility === 'private')).toBe(true);
    const after = await pointRows(o.id, p.v1Name);
    expect(after.map((r) => r.id).sort(), 'v1 keeps its points').toEqual(p.ids);
    for (const row of after) {
      const b = before.find((x) => x.id === row.id)!;
      expect(row.updated_at, `point ${row.id}: updated_at is not touched`).toBe(b.updated_at);
      expect(row.statement).toBe(b.statement);
      expect((row.system_tags as string[]).sort(), 'a point gains only the draft\'s tag').toEqual([...(b.system_tags as string[]), `canvas_${d.version_name}`].sort());
    }
    expect(await links(), 'the stories stay linked to the same points').toEqual(linksBefore);
    expect(((await admin.from('points').select('id').eq('first_validator_id', o.id).like('statement', `${TAG}%`)).data ?? []), 'no copy was made of a private point').toHaveLength(3);
  }, T);
});
