/**
 * P1621 round 3: canvas_drafts.undo_closed_by_hand (migration 20261106015000), read through get_canvas_draft_state.
 *   npm run test:integration -- src/tests/integration/p1621-undo-closed-by-hand.test.ts
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1621H ${RUN}`;
const nn = (s: string) => `${TAG} ${s}`;
const noSession = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, noSession);
const SEG = 'canvas:segments';
const PROB = 'canvas:problem';

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
  const u = await createTestUser({ name: `P1621H ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u) };
}
type Owner = Awaited<ReturnType<typeof mkOwner>>;

class WS {
  canvas = ''; draft = ''; rev = 0; vname = '';
  constructor(public o: Owner) {}
  async state(): Promise<Row> {
    const s = await ok(this.o.c, 'get_canvas_draft_state', { p_canvas: this.canvas });
    if (s.draft) this.rev = s.draft.revision;
    return s;
  }
  async flag(): Promise<{ hand: boolean; undoRun: string | null }> {
    const d = (await this.state()).draft;
    expect(typeof d.undo_closed_by_hand, 'the key is always a boolean').toBe('boolean');
    return { hand: d.undo_closed_by_hand, undoRun: d.undo_run_id };
  }
  /** One message run, begun and completed with the given actions and scope. */
  async cycle(actions: Row[], scope: string[] = [SEG, PROB]): Promise<Row> {
    const r = await ok(this.o.c, 'canvas_workspace_send', {
      p_canvas: this.canvas || null, p_from_version: null, p_expected_draft: this.draft || null, p_expected_revision: this.draft ? this.rev : null,
      p_replace: false, p_body: nn('msg ' + randomUUID().slice(0, 4)), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    });
    expect(r.status, JSON.stringify(r)).toBe('ok');
    this.canvas = r.canvas_id; this.draft = r.draft_id; this.vname = r.version_name;
    const b = await eng('_canvas_draft_run_begin', { p_run: r.run_id, p_owner: this.o.u.user.id, p_has_file: false, p_cap_reply: null });
    expect(b.status, JSON.stringify(b)).toBe('run');
    const d = await eng('_canvas_draft_run_complete', {
      p_run: r.run_id, p_owner: this.o.u.user.id, p_actions: actions, p_questions: {}, p_scope: scope, p_focus: null,
      p_other_canvases: [], p_note: null, p_reply: nn('reply'), p_usd: 0.001,
    });
    expect(d.status, JSON.stringify(d)).toBe('ok');
    await this.state();
    return r;
  }
  async pointId(text: string): Promise<string> {
    const rows = (await admin.from('points').select('id, statement').eq('first_validator_id', this.o.u.user.id).contains('system_tags', [`canvas_${this.vname}`])).data as Row[];
    return rows.find((p) => p.statement === nn(text))!.id;
  }
  async add(box: string, text: string): Promise<Row> {
    const d = await ok(this.o.c, 'canvas_draft_add_point', { p_draft: this.draft, p_box: box, p_statement: nn(text), p_expected_revision: this.rev, p_client_id: randomUUID() });
    expect(d.status, JSON.stringify(d)).toBe('ok');
    await this.state();
    return d;
  }
  async edit(pointId: string, text: string): Promise<void> {
    const d = await ok(this.o.c, 'canvas_draft_edit_point', { p_draft: this.draft, p_point: pointId, p_statement: nn(text), p_expected_revision: this.rev });
    expect(d, JSON.stringify(d)).toMatchObject({ status: 'ok', changed: true });
    await this.state();
  }
  async remove(pointId: string): Promise<void> {
    const d = await ok(this.o.c, 'canvas_draft_remove_point', { p_draft: this.draft, p_point: pointId, p_expected_revision: this.rev });
    expect(d.status, JSON.stringify(d)).toBe('ok');
    await this.state();
  }
}
const newPt = (box: string, s: string): Row => ({ action: 'new', box, statement: nn(s) });

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

describe('P1621 undo_closed_by_hand', () => {
  it('a run with steps leaves it false and Undo offered; each hand write after the run sets it true and closes Undo', async () => {
    for (const kind of ['add', 'edit', 'remove'] as const) {
      const o = await mkOwner(`set-${kind}`); const ws = new WS(o);
      await ws.cycle([newPt(SEG, 'a'), newPt(PROB, 'b')]);
      const before = await ws.flag();
      expect(before.hand, `${kind}: false after a run`).toBe(false);
      expect(before.undoRun, `${kind}: Undo offered`).toBeTruthy();
      if (kind === 'add') await ws.add(PROB, 'hand');
      if (kind === 'edit') await ws.edit(await ws.pointId('a'), 'a edited');
      if (kind === 'remove') await ws.remove(await ws.pointId('b'));
      expect(await ws.flag(), kind).toEqual({ hand: true, undoRun: null });
      // a second hand write, which deletes no step, leaves it true
      await ws.add(SEG, `second ${kind}`);
      expect((await ws.flag()).hand, `${kind}: still true after another hand write`).toBe(true);
    }
  }, T);

  it('false when no run had steps: a hand write on a draft nobody ran, and one after a run that changed no box', async () => {
    const o = await mkOwner('nostep'); const ws = new WS(o);
    const opened = await ok(o.c, 'canvas_draft_open', { p_from_version: null });
    ws.draft = opened.draft_id;
    ws.canvas = (await admin.from('canvas_drafts').select('canvas_id').eq('id', opened.draft_id).single()).data!.canvas_id as string;
    ws.vname = opened.version_name;
    await ws.state();
    expect((await ws.flag()).hand).toBe(false);
    await ws.add(PROB, 'first by hand');
    expect(await ws.flag(), 'no step existed: nothing was closed').toEqual({ hand: false, undoRun: null });
    await ws.add(SEG, 'second by hand');
    expect((await ws.flag()).hand).toBe(false);
    // a run whose scope is empty changes nothing and makes no step; a hand write after it still closes nothing
    await ws.cycle([], []);
    expect((await ws.flag()).undoRun, 'that run has no step').toBeNull();
    await ws.add(PROB, 'third by hand');
    expect((await ws.flag()).hand).toBe(false);
  }, T);

  it('a new run that completes with steps clears it, and Undo is offered for that run again', async () => {
    const o = await mkOwner('cleared-run'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'a')]);
    await ws.add(PROB, 'hand');
    expect((await ws.flag()).hand).toBe(true);
    const a = await ws.pointId('a'); const hand = await ws.pointId('hand');
    const r2 = await ws.cycle([{ action: 'keep', point_id: a }, { action: 'keep', point_id: hand }, newPt(PROB, 'agent')]);
    expect(await ws.flag()).toEqual({ hand: false, undoRun: r2.run_id });
  }, T);

  it('an idle run (keeps everything, so its step is deleted again) does not clear it: still true, Undo still closed', async () => {
    const o = await mkOwner('idle'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'a'), newPt(PROB, 'b')]);
    await ws.edit(await ws.pointId('a'), 'a edited');
    expect(await ws.flag()).toEqual({ hand: true, undoRun: null });
    const keepAll = await Promise.all([ws.pointId('a edited'), ws.pointId('b')]);
    await ws.cycle(keepAll.map((id) => ({ action: 'keep', point_id: id })));
    const steps = (await admin.from('canvas_draft_steps').select('run_id').eq('draft_id', ws.draft)).data ?? [];
    expect(steps, 'the idle run left no step').toEqual([]);
    expect(await ws.flag(), 'no step exists, so Undo is still closed by the hand-write').toEqual({ hand: true, undoRun: null });
  }, T);

  it('cleared by undo: it is false after the undo, and a hand write again sets it', async () => {
    const o = await mkOwner('cleared-undo'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'a')]);
    await ws.add(PROB, 'hand');
    const a = await ws.pointId('a'); const hand = await ws.pointId('hand');
    const r2 = await ws.cycle([{ action: 'keep', point_id: a }, { action: 'keep', point_id: hand }, newPt(PROB, 'agent')]);
    expect((await ws.flag()).hand).toBe(false);
    const u = await ok(o.c, 'canvas_draft_undo', { p_draft: ws.draft, p_expected_run: r2.run_id, p_expected_revision: ws.rev });
    expect(u.status, JSON.stringify(u)).toBe('ok');
    expect(await ws.flag(), 'the hand write had closed the first run; only the undone run had a step').toEqual({ hand: false, undoRun: null });
    await ws.add(SEG, 'after undo');
    expect((await ws.flag()).hand, 'no step was left to close').toBe(false);
  }, T);

  it('an undo that leaves an older step keeps it false, and a hand write then sets it true', async () => {
    const o = await mkOwner('undo-older'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'a')]);
    const a = await ws.pointId('a');
    const r2 = await ws.cycle([{ action: 'keep', point_id: a }, newPt(PROB, 'agent')]);
    const u = await ok(o.c, 'canvas_draft_undo', { p_draft: ws.draft, p_expected_run: r2.run_id, p_expected_revision: ws.rev });
    expect(u.status).toBe('ok');
    const f = await ws.flag();
    expect(f.hand).toBe(false);
    expect(f.undoRun, 'the first run is next').toBeTruthy();
    await ws.add(PROB, 'hand');
    expect(await ws.flag()).toEqual({ hand: true, undoRun: null });
  }, T);

  it('the flag is not readable by the owner through the table (column grant)', async () => {
    const o = await mkOwner('grant'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'a')]);
    const r = await o.c.from('canvas_drafts').select('undo_closed_by_hand').eq('id', ws.draft);
    expect(r.error, 'no select grant on the column').toBeTruthy();
  }, T);
});
