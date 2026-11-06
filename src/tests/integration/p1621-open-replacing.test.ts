/**
 * P1621 round 2: "Start over" opens a fresh draft in place of the open one in one transaction (migration 20261106013000, canvas_draft_open_replacing).
 *   npm run test:integration -- src/tests/integration/p1621-open-replacing.test.ts
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1621O ${RUN}`;
const nn = (s: string) => `${TAG} ${s}`;
const noSession = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, noSession);
const SEG = 'canvas:segments';

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
const eng = (fn: string, args: Row) => ok(admin as unknown as SupabaseClient, fn, args);

const users: TestUser[] = [];
async function mkOwner(label: string) {
  const u = await createTestUser({ name: `P1621O ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u) };
}
type Owner = Awaited<ReturnType<typeof mkOwner>>;

/** A published v1 with one point, then an open clone of it (the state of a clone's pending page). */
async function cloneOf(o: Owner): Promise<{ canvas: string; v1: string; clone: Row; rev: number }> {
  const r = await ok(o.c, 'canvas_workspace_send', {
    p_canvas: null, p_from_version: null, p_expected_draft: null, p_expected_revision: null, p_replace: false,
    p_body: nn('first'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
  });
  const b = await eng('_canvas_draft_run_begin', { p_run: r.run_id, p_owner: o.u.user.id, p_has_file: false, p_cap_reply: null });
  expect(b.status, JSON.stringify(b)).toBe('run');
  const d = await eng('_canvas_draft_run_complete', {
    p_run: r.run_id, p_owner: o.u.user.id, p_actions: [{ action: 'new', box: SEG, statement: nn('v1 point') }], p_questions: {}, p_scope: [SEG],
    p_focus: null, p_other_canvases: [], p_note: null, p_reply: nn('reply'), p_usd: 0.001,
  });
  expect(d.status, JSON.stringify(d)).toBe('ok');
  const st = await ok(o.c, 'get_canvas_draft_state', { p_canvas: r.canvas_id });
  const pub = await ok(o.c, 'canvas_draft_publish', { p_draft: r.draft_id, p_expected_revision: st.draft.revision });
  expect(pub.status, JSON.stringify(pub)).toBe('ok');
  const v1 = (await admin.from('canvas_versions').select('id').eq('canvas_id', r.canvas_id).eq('name', r.version_name).single()).data as Row;
  const clone = await ok(o.c, 'canvas_draft_open', { p_from_version: v1.id });
  expect(clone.status).toBe('opened');
  const rev = (await ok(o.c, 'get_canvas_draft_state', { p_canvas: r.canvas_id })).draft.revision as number;
  return { canvas: r.canvas_id, v1: v1.id, clone, rev };
}
const openDrafts = async (canvas: string) =>
  ((await admin.from('canvas_drafts').select('id, state, base_version_id').eq('canvas_id', canvas)).data ?? []) as Row[];
const replacing = (c: SupabaseClient, v1: string, draft: string, rev: number) =>
  rpc(c, 'canvas_draft_open_replacing', { p_from_version: v1, p_replace_draft: draft, p_replace_revision: rev });

afterAll(async () => {
  const mine = users.map((u) => u.user.id);
  if (mine.length) {
    await admin.from('canvases').delete().in('owner_id', mine);
    await admin.from('points').delete().like('statement', `${TAG}%`);
    await admin.from('mirror_ai_spend').delete().in('owner_id', mine);
  }
  const gone = await deleteTestUsers(mine);
  expect(gone.failed, 'every test user was deleted').toBe(0);
}, 240_000);

const T = 240_000;

describe('P1621 open a draft in place of the open one', () => {
  it('happy path: the old draft is discarded and a fresh open one from the version answers in the opener shape', async () => {
    const o = await mkOwner('happy'); const s = await cloneOf(o);
    const { data, error } = await replacing(o.c, s.v1, s.clone.draft_id, s.rev);
    expect(error, JSON.stringify(error)).toBeNull();
    expect(data).toMatchObject({ status: 'opened', canvas_name: s.clone.canvas_name, from_seq: s.clone.from_seq });
    expect(data.draft_id).not.toBe(s.clone.draft_id);
    for (const k of ['conversation_id', 'thread_root_id', 'version_name']) expect(data[k], k).toBeTruthy();
    expect(data.resumed).toBeUndefined();
    const rows = await openDrafts(s.canvas);
    expect(rows.find((r) => r.id === s.clone.draft_id)!.state).toBe('discarded');
    const open = rows.filter((r) => r.state === 'open');
    expect(open.map((r) => r.id)).toEqual([data.draft_id]);
    expect(open[0]!.base_version_id).toBe(s.v1);
    const pts = (await admin.from('points').select('statement').contains('system_tags', [`canvas_${data.version_name}`])).data as Row[];
    expect(pts.map((p) => p.statement), 'the fresh draft starts as v1').toEqual([nn('v1 point')]);
  }, T);

  it('a stale revision refuses stale_view and discards nothing', async () => {
    const o = await mkOwner('stale'); const s = await cloneOf(o);
    const { data } = await replacing(o.c, s.v1, s.clone.draft_id, s.rev - 1);
    expect(data).toMatchObject({ status: 'refused', code: 'stale_view', revision: s.rev });
    const rows = await openDrafts(s.canvas);
    expect(rows.filter((r) => r.state === 'open').map((r) => r.id)).toEqual([s.clone.draft_id]);
    expect(rows.filter((r) => r.state === 'discarded')).toHaveLength(0);
  }, T);

  it('a run going refuses busy and discards nothing', async () => {
    const o = await mkOwner('busy'); const s = await cloneOf(o);
    const sent = await ok(o.c, 'canvas_workspace_send', {
      p_canvas: s.canvas, p_from_version: null, p_expected_draft: s.clone.draft_id, p_expected_revision: s.rev, p_replace: false,
      p_body: nn('queued'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    });
    const { data } = await replacing(o.c, s.v1, s.clone.draft_id, sent.revision);
    expect(data).toMatchObject({ status: 'refused', code: 'busy' });
    expect((await openDrafts(s.canvas)).filter((r) => r.state === 'open').map((r) => r.id)).toEqual([s.clone.draft_id]);
  }, T);

  it('a repeat after success returns the same fresh draft (resumed) and makes no third draft', async () => {
    const o = await mkOwner('repeat'); const s = await cloneOf(o);
    const first = (await replacing(o.c, s.v1, s.clone.draft_id, s.rev)).data;
    const again = (await replacing(o.c, s.v1, s.clone.draft_id, s.rev)).data;
    expect(again).toMatchObject({ status: 'opened', resumed: true, draft_id: first.draft_id, conversation_id: first.conversation_id, version_name: first.version_name });
    expect(await openDrafts(s.canvas)).toHaveLength(3);   // v1's own draft (published), the discarded clone, the fresh one
    expect((await openDrafts(s.canvas)).filter((r) => r.state === 'open')).toHaveLength(1);
  }, T);

  it('a draft opened elsewhere after X was discarded is NOT handed back for X; the one this call opened still is, after work in it', async () => {
    const o = await mkOwner('lineage'); const s = await cloneOf(o);
    // X discarded by another flow, then Y opened from the same version and worked in
    expect((await ok(o.c, 'canvas_draft_discard', { p_draft: s.clone.draft_id, p_expected_revision: s.rev })).status).toBe('ok');
    const y = await ok(o.c, 'canvas_draft_open', { p_from_version: s.v1 });
    const yRev = (await ok(o.c, 'get_canvas_draft_state', { p_canvas: s.canvas })).draft.revision as number;
    const added = await ok(o.c, 'canvas_draft_add_point', { p_draft: y.draft_id, p_box: SEG, p_statement: nn('work in Y'), p_expected_revision: yRev, p_client_id: randomUUID() });
    expect(added.status).toBe('ok');
    const stale = (await replacing(o.c, s.v1, s.clone.draft_id, s.rev)).data;
    expect(stale, 'Y was not opened by this call').toMatchObject({ status: 'refused', code: 'stale_view' });
    expect((await openDrafts(s.canvas)).filter((r) => r.state === 'open').map((r) => r.id)).toEqual([y.draft_id]);
    // the lineage case: Z opened BY a replace call is resumed even after the owner worked in it
    const p = await mkOwner('lineage2'); const t = await cloneOf(p);
    const first = (await replacing(p.c, t.v1, t.clone.draft_id, t.rev)).data;
    const zRev = (await ok(p.c, 'get_canvas_draft_state', { p_canvas: t.canvas })).draft.revision as number;
    await ok(p.c, 'canvas_draft_add_point', { p_draft: first.draft_id, p_box: SEG, p_statement: nn('work in Z'), p_expected_revision: zRev, p_client_id: randomUUID() });
    expect((await replacing(p.c, t.v1, t.clone.draft_id, t.rev)).data).toMatchObject({ status: 'opened', resumed: true, draft_id: first.draft_id });
    const lineage = (await admin.from('canvas_drafts').select('replaced_draft_id').eq('id', first.draft_id).single()).data as Row;
    expect(lineage.replaced_draft_id).toBe(t.clone.draft_id);
  }, T);

  it('the half-done state of the old two-step flow (discarded, nothing open) opens a fresh draft', async () => {
    const o = await mkOwner('half'); const s = await cloneOf(o);
    expect((await ok(o.c, 'canvas_draft_discard', { p_draft: s.clone.draft_id, p_expected_revision: s.rev })).status).toBe('ok');
    const { data } = await replacing(o.c, s.v1, s.clone.draft_id, s.rev);
    expect(data).toMatchObject({ status: 'opened' });
    expect((await openDrafts(s.canvas)).filter((r) => r.state === 'open').map((r) => r.id)).toEqual([data.draft_id]);
  }, T);

  it('another signed-in person and a signed-out caller are refused; nothing is discarded', async () => {
    const o = await mkOwner('own'); const x = await mkOwner('other'); const s = await cloneOf(o);
    expect((await replacing(x.c, s.v1, s.clone.draft_id, s.rev)).error?.code).toBe('42501');
    expect((await replacing(createClient(URL_, ANON, noSession), s.v1, s.clone.draft_id, s.rev)).error).toBeTruthy();
    // the owner's own draft id with another person's version, and a foreign draft id with the owner's version
    const y = await cloneOf(x);
    expect((await replacing(o.c, y.v1, s.clone.draft_id, s.rev)).error?.code).toBe('42501');
    expect((await replacing(o.c, s.v1, y.clone.draft_id, y.rev)).error?.code).toBe('42501');
    expect((await openDrafts(s.canvas)).filter((r) => r.state === 'open').map((r) => r.id)).toEqual([s.clone.draft_id]);
    expect((await openDrafts(y.canvas)).filter((r) => r.state === 'open').map((r) => r.id)).toEqual([y.clone.draft_id]);
  }, T);
});
