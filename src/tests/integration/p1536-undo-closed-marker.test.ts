/**
 * P1536 D7 / J6 (migration 20261102201000), on the TEST database. "The undone message stays in the thread marked Undone." The mark must survive the draft closing:
 * `get_canvas_draft_state` only lists the OPEN draft's runs, so after Publish or Discard the client could not know which owner messages were undone. The state read now carries
 * `closed_undone`: for every CLOSED (published or discarded) draft of the canvas, the owner messages whose run was undone, by draft id and nothing else (no run, no step, no text).
 *   npm run test:integration -- src/tests/integration/p1536-undo-closed-marker.test.ts
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;  

const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1536undo ${RUN}`;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const users: TestUser[] = [];

async function owner(label: string): Promise<{ u: TestUser; c: SupabaseClient }> {
  const u = await createTestUser({ name: `${TAG} ${label}` });
  users.push(u);
  const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return { u, c };
}
const call = async (c: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Row> => {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code} ${error.message}`);
  return data as Row;
};

/** One applied run, the way the engine makes it: send (message + queued run), begin, complete with one new point. Returns the run and its owner message. */
async function appliedRun(o: { u: TestUser; c: SupabaseClient }, ws: { canvas: string | null; draft: string | null; rev: number | null }, statement: string) {
  const sent = await call(o.c, 'canvas_workspace_send', {
    p_canvas: ws.canvas, p_from_version: null, p_expected_draft: ws.draft, p_expected_revision: ws.rev, p_replace: false, p_body: `${TAG} ${statement}`,
    p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
  });
  expect(sent.status, JSON.stringify(sent)).toBe('ok');
  const uid = o.u.user.id;
  const begun = await call(admin as unknown as SupabaseClient, '_canvas_draft_run_begin', { p_run: sent.run_id, p_owner: uid, p_has_file: false, p_cap_reply: null });
  expect(begun.status, JSON.stringify(begun)).toBe('run');
  const done = await call(admin as unknown as SupabaseClient, '_canvas_draft_run_complete', {
    p_run: sent.run_id, p_owner: uid, p_actions: [{ action: 'new', box: 'canvas:segments', statement: `${TAG} ${statement}` }], p_questions: {}, p_scope: [], p_focus: null,
    p_other_canvases: [], p_note: null, p_reply: `${TAG} reply ${statement}`, p_usd: 0.001,
  });
  expect(done.status, JSON.stringify(done)).toBe('ok');
  ws.canvas = sent.canvas_id; ws.draft = sent.draft_id;
  const state = await call(o.c, 'get_canvas_draft_state', { p_canvas: ws.canvas });
  ws.rev = state.draft.revision;
  const trigger = ((await admin.from('canvas_draft_runs').select('trigger_message_id').eq('id', sent.run_id).single()).data as Row).trigger_message_id as string;
  return { run: sent.run_id as string, trigger };
}

afterAll(async () => {
  const mine = users.map(u => u.user.id);
  if (mine.length) {
    await admin.from('canvases').delete().in('owner_id', mine);
    await admin.from('points').delete().like('statement', `${TAG}%`);
    await admin.from('mirror_ai_spend').delete().in('owner_id', mine);
  }
  expect((await deleteTestUsers(users.map(u => u.user.id))).failed, 'every test user was deleted').toBe(0);
}, 240_000);

const T = 240_000;

describe('J6: the undone mark survives the draft closing', () => {
  it('undo one of two runs, publish, read again: closed_undone lists exactly that owner message under the published draft; the other run and the open-draft shape are untouched', async () => {
    const o = await owner('published');
    const ws = { canvas: null as string | null, draft: null as string | null, rev: null as number | null };
    const r1 = await appliedRun(o, ws, 'first');
    const r2 = await appliedRun(o, ws, 'second');
    const open = await call(o.c, 'get_canvas_draft_state', { p_canvas: ws.canvas });
    expect(open.closed_undone, 'an open draft has no closed drafts to list').toEqual({});
    expect((await call(o.c, 'canvas_draft_undo', { p_draft: ws.draft, p_expected_run: r2.run, p_expected_revision: ws.rev })).status).toBe('ok');
    const rev = (await call(o.c, 'get_canvas_draft_state', { p_canvas: ws.canvas })).draft.revision;
    expect((await call(o.c, 'canvas_draft_publish', { p_draft: ws.draft, p_expected_revision: rev })).status).toBe('ok');
    const after = await call(o.c, 'get_canvas_draft_state', { p_canvas: ws.canvas });
    expect(after.draft, 'the draft is closed: no open draft').toBeNull();
    expect(after.closed_draft.id).toBe(ws.draft);
    expect(after.closed_undone).toEqual({ [ws.draft!]: [r2.trigger] });
    expect(JSON.stringify(after.closed_undone)).not.toContain(r1.trigger);
  }, T);

  it('undo, then DISCARD: the discarded draft keeps its undone marks (a discarded draft is not closed_draft, which lists published drafts only)', async () => {
    const o = await owner('discarded');
    const ws = { canvas: null as string | null, draft: null as string | null, rev: null as number | null };
    const r1 = await appliedRun(o, ws, 'only');
    expect((await call(o.c, 'canvas_draft_undo', { p_draft: ws.draft, p_expected_run: r1.run, p_expected_revision: ws.rev })).status).toBe('ok');
    const rev = (await call(o.c, 'get_canvas_draft_state', { p_canvas: ws.canvas })).draft.revision;
    expect((await call(o.c, 'canvas_draft_discard', { p_draft: ws.draft, p_expected_revision: rev })).status).toBe('ok');
    const after = await call(o.c, 'get_canvas_draft_state', { p_canvas: ws.canvas });
    expect(after.draft).toBeNull();
    expect(after.closed_undone).toEqual({ [ws.draft!]: [r1.trigger] });
  }, T);

  it('a run that was not undone is not listed, and a closed draft with nothing undone is not a key', async () => {
    const o = await owner('plain');
    const ws = { canvas: null as string | null, draft: null as string | null, rev: null as number | null };
    await appliedRun(o, ws, 'kept');
    const rev = (await call(o.c, 'get_canvas_draft_state', { p_canvas: ws.canvas })).draft.revision;
    expect((await call(o.c, 'canvas_draft_publish', { p_draft: ws.draft, p_expected_revision: rev })).status).toBe('ok');
    expect((await call(o.c, 'get_canvas_draft_state', { p_canvas: ws.canvas })).closed_undone).toEqual({});
  }, T);

  it('another owner: the read of this canvas is refused (not authorized), and their own canvas lists none of these ids', async () => {
    const a = await owner('victim'); const b = await owner('other');
    const wa = { canvas: null as string | null, draft: null as string | null, rev: null as number | null };
    const ra = await appliedRun(a, wa, 'mine');
    expect((await call(a.c, 'canvas_draft_undo', { p_draft: wa.draft, p_expected_run: ra.run, p_expected_revision: wa.rev })).status).toBe('ok');
    const rev = (await call(a.c, 'get_canvas_draft_state', { p_canvas: wa.canvas })).draft.revision;
    expect((await call(a.c, 'canvas_draft_discard', { p_draft: wa.draft, p_expected_revision: rev })).status).toBe('ok');
    const { error } = await b.c.rpc('get_canvas_draft_state', { p_canvas: wa.canvas });
    expect(error?.code, 'the owner-only guard is unchanged').toBe('42501');
    const wb = { canvas: null as string | null, draft: null as string | null, rev: null as number | null };
    await appliedRun(b, wb, 'theirs');
    const theirs = await call(b.c, 'get_canvas_draft_state', { p_canvas: wb.canvas });
    expect(JSON.stringify(theirs)).not.toContain(ra.trigger);
    expect(theirs.closed_undone).toEqual({});
  }, T);
});
