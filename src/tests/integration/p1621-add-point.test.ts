/**
 * P1621: the owner adds a point to a box by hand (migration 20261106000000, canvas_draft_add_point).
 *   npm run test:integration -- src/tests/integration/p1621-add-point.test.ts
 * Harness as p1614-edit-point.test.ts: the model is a stub, runs are begun and completed through the service-role worker functions.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1621 ${RUN}`;
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
  const u = await createTestUser({ name: `P1621 ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u) };
}
type Owner = Awaited<ReturnType<typeof mkOwner>>;

class WS {
  canvas = ''; draft = ''; rev = 0; name = ''; vname = '';
  constructor(public o: Owner) {}
  async state(): Promise<Row> {
    const s = await ok(this.o.c, 'get_canvas_draft_state', { p_canvas: this.canvas });
    if (s.draft) this.rev = s.draft.revision;
    return s;
  }
  async cycle(actions: Row[]): Promise<Row> {
    const r = await ok(this.o.c, 'canvas_workspace_send', {
      p_canvas: this.canvas || null, p_from_version: null, p_expected_draft: this.draft || null, p_expected_revision: this.draft ? this.rev : null,
      p_replace: false, p_body: nn('msg ' + randomUUID().slice(0, 4)), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    });
    expect(r.status, JSON.stringify(r)).toBe('ok');
    this.canvas = r.canvas_id; this.draft = r.draft_id; this.name = r.canvas_name; this.vname = r.version_name;
    const b = await eng('_canvas_draft_run_begin', { p_run: r.run_id, p_owner: this.o.u.user.id, p_has_file: false, p_cap_reply: null });
    expect(b.status, JSON.stringify(b)).toBe('run');
    const d = await eng('_canvas_draft_run_complete', {
      p_run: r.run_id, p_owner: this.o.u.user.id, p_actions: actions, p_questions: {}, p_scope: [SEG, PROB], p_focus: null,
      p_other_canvases: [], p_note: null, p_reply: nn('reply'), p_usd: 0.001,
    });
    expect(d.status, JSON.stringify(d)).toBe('ok');
    await this.state();
    return r;
  }
  async points(): Promise<Row[]> {
    return ((await admin.from('points').select('id, statement, visibility, system_tags, first_validator_id').eq('first_validator_id', this.o.u.user.id)
      .contains('system_tags', [`canvas_${this.vname}`])).data ?? []) as Row[];
  }
  add(box: string, text: string, rev = this.rev, clientId: string = randomUUID(), c = this.o.c) {
    return rpc(c, 'canvas_draft_add_point', { p_draft: this.draft, p_box: box, p_statement: text, p_expected_revision: rev, p_client_id: clientId });
  }
  async okAdd(box: string, text: string): Promise<Row> {
    const { data, error } = await this.add(box, text);
    expect(error, JSON.stringify(error)).toBeNull();
    expect(data.status, JSON.stringify(data)).toBe('ok');
    await this.state();
    return data;
  }
  async ledger(): Promise<Row[]> { return ((await admin.from('canvas_draft_points').select('*').eq('draft_id', this.draft)).data ?? []) as Row[]; }
}
const newPt = (box: string, s: string): Row => ({ action: 'new', box, statement: nn(s) });
const publish = (ws: WS) => ok(ws.o.c, 'canvas_draft_publish', { p_draft: ws.draft, p_expected_revision: ws.rev });

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

describe('P1621 add a point to a box of a draft', () => {
  it('adds a private point, bumps the revision, shows on reload, and is in the ledger with no run', async () => {
    const o = await mkOwner('add'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'first')]);
    const revBefore = ws.rev;
    const r = await ws.okAdd(PROB, `  ${nn('hand card')}  `);
    expect(r).toMatchObject({ changed: true, revision: revBefore + 1 });
    const pts = await ws.points();
    const mine = pts.find((p) => p.statement === nn('hand card'))!;
    expect(mine, 'the card is in the draft, trimmed').toBeTruthy();
    expect(mine.visibility).toBe('private');
    expect(mine.system_tags).toEqual([PROB, `canvas_${ws.vname}`]);
    expect(mine.id).toBe(r.point_id);
    const led = (await ws.ledger()).find((l) => l.point_id === r.point_id)!;
    expect(led).toMatchObject({ run_id: null, story_ids: [] });
    expect(led.client_id).toBeTruthy();
    expect((await admin.from('point_positions').select('user_id').eq('point_id', r.point_id)).data, 'no stance').toEqual([]);
    // reload: the canvas read shows it
    const s = await ok(o.c, 'get_canvas', { p_owner: o.u.user.id, p_name: ws.name, p_link_token: null, p_version: ws.vname });
    expect(JSON.stringify(s)).toContain(nn('hand card'));
    // empty, blank, over-long text and a bad box raise 22023 and write nothing
    for (const bad of ['', '   ', 'x'.repeat(301)]) {
      expect((await ws.add(PROB, bad)).error?.code, `"${bad.slice(0, 5)}"`).toBe('22023');
    }
    expect((await ws.add('canvas:nope', nn('x'))).error?.code).toBe('22023');
    expect((await ws.add(PROB, nn('x'), ws.rev, null as unknown as string)).error?.code, 'client id required').toBe('22023');
    expect((await ws.points()).length).toBe(2);
  }, T);

  it('a replay with the same client id makes one row and writes nothing, even after the revision moved on', async () => {
    const o = await mkOwner('replay'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'a')]);
    const cid = randomUUID();
    const first = (await ws.add(PROB, nn('once'), ws.rev, cid)).data;
    expect(first).toMatchObject({ status: 'ok', changed: true });
    await ws.state();
    const again = (await ws.add(PROB, nn('once'), first.revision - 1, cid)).data;   // an old revision: replay answers first
    expect(again).toMatchObject({ status: 'ok', changed: false, point_id: first.point_id, revision: ws.rev });
    expect((await ws.points()).filter((p) => p.statement === nn('once'))).toHaveLength(1);
    expect((await ws.ledger()).filter((l) => l.client_id === cid)).toHaveLength(1);
    expect((await ws.state()).draft.revision, 'the replay did not bump the revision').toBe(ws.rev);
  }, T);

  it('the 4th card in a box is refused box_full and writes nothing; other boxes still accept', async () => {
    const o = await mkOwner('full'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'seed')]);
    for (const t of ['one', 'two', 'three']) await ws.okAdd(PROB, nn(t));
    const revBefore = ws.rev;
    const full = await ws.add(PROB, nn('four'));
    expect(full.data).toMatchObject({ status: 'refused', code: 'box_full', revision: revBefore });
    expect((await ws.points()).filter((p) => p.system_tags.includes(PROB))).toHaveLength(3);
    expect((await ws.state()).draft.revision).toBe(revBefore);
    expect((await ws.add(SEG, nn('elsewhere'))).data).toMatchObject({ status: 'ok', changed: true });
  }, T);

  it('two concurrent saves at 2 cards make exactly 3', async () => {
    const o = await mkOwner('race'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'seed')]);
    await ws.okAdd(PROB, nn('one'));
    await ws.okAdd(PROB, nn('two'));
    const rev = ws.rev;
    const [a, b] = await Promise.all([ws.add(PROB, nn('racer a'), rev), ws.add(PROB, nn('racer b'), rev)]);
    const answers = [a.data, b.data];
    expect(a.error ?? b.error).toBeFalsy();
    expect(answers.filter((x) => x.status === 'ok'), JSON.stringify(answers)).toHaveLength(1);
    expect(answers.filter((x) => x.status === 'refused')).toHaveLength(1);   // stale_view (revision moved) or box_full
    expect((await ws.points()).filter((p) => p.system_tags.includes(PROB))).toHaveLength(3);
  }, T);

  it('the same words already in the box are refused as duplicate (trimmed); another box takes them', async () => {
    const o = await mkOwner('dup'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'seed')]);
    await ws.okAdd(PROB, nn('same words'));
    const dup = await ws.add(PROB, `  ${nn('same words')} `);
    expect(dup.data).toMatchObject({ status: 'refused', code: 'duplicate' });
    expect((await ws.points()).filter((p) => p.statement === nn('same words'))).toHaveLength(1);
    expect((await ws.add(SEG, nn('same words'))).data).toMatchObject({ status: 'ok', changed: true });
  }, T);

  it('another signed-in person and a signed-out caller are refused; a stale revision is stale_view; a run going is busy', async () => {
    const o = await mkOwner('own'); const x = await mkOwner('other'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'mine')]);
    const staleRev = ws.rev;
    expect((await ws.add(PROB, nn('hijack'), ws.rev, randomUUID(), x.c)).error?.code).toBe('42501');
    expect((await ws.add(PROB, nn('anon'), ws.rev, randomUUID(), createClient(URL_, ANON, noSession))).error).toBeTruthy();
    await ws.okAdd(PROB, nn('moves the revision'));
    expect((await ws.add(PROB, nn('late'), staleRev)).data).toMatchObject({ status: 'refused', code: 'stale_view' });
    const r = await ok(o.c, 'canvas_workspace_send', {
      p_canvas: ws.canvas, p_from_version: null, p_expected_draft: ws.draft, p_expected_revision: ws.rev, p_replace: false,
      p_body: nn('queued'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    });
    expect((await ws.add(PROB, nn('racing'), r.revision)).data).toMatchObject({ status: 'refused', code: 'busy' });
    expect((await ws.points()).map((p) => p.statement).sort()).toEqual([nn('mine'), nn('moves the revision')].sort());
  }, T);

  it('a published version is unchanged by an add on the next draft; Publish then carries the card', async () => {
    const o = await mkOwner('pub'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'v1 words')]);
    const v1name = ws.vname;
    await publish(ws);
    const v1 = (await admin.from('canvas_versions').select('id').eq('canvas_id', ws.canvas).eq('name', v1name).single()).data as Row;
    ws.draft = '';
    const sent = await ok(o.c, 'canvas_workspace_send', {
      p_canvas: ws.canvas, p_from_version: v1.id, p_expected_draft: null, p_expected_revision: null, p_replace: false,
      p_body: nn('hello'), p_box_refs: [PROB], p_attachment: null, p_client_id: randomUUID(),
    });
    ws.draft = sent.draft_id; ws.vname = sent.version_name;
    await eng('_canvas_draft_run_begin', { p_run: sent.run_id, p_owner: o.u.user.id, p_has_file: false, p_cap_reply: null });
    await eng('_canvas_draft_run_complete', { p_run: sent.run_id, p_owner: o.u.user.id, p_actions: [], p_questions: {}, p_scope: [], p_focus: null, p_other_canvases: [], p_note: null, p_reply: nn('r'), p_usd: 0.001 });
    await ws.state();
    await ws.okAdd(PROB, nn('draft only'));
    const read = async (v: string) => JSON.stringify(await ok(o.c, 'get_canvas', { p_owner: o.u.user.id, p_name: ws.name, p_link_token: null, p_version: v }));
    expect(await read(v1name)).not.toContain(nn('draft only'));
    expect(await read(ws.vname)).toContain(nn('draft only'));
    const pub = await publish(ws);
    expect(pub.status, JSON.stringify(pub)).toBe('ok');
    expect(await read(ws.vname)).toContain(nn('draft only'));
    expect(await read(v1name)).not.toContain(nn('draft only'));
  }, T);

  it('an add closes Undo for earlier runs; undoing a later run keeps the card', async () => {
    const o = await mkOwner('undo'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'a')]);
    const a = (await ws.points()).find((p) => p.statement === nn('a'))!;
    const r2 = await ws.cycle([{ action: 'keep', point_id: a.id }, newPt(PROB, 'b')]);
    expect((await ws.state()).draft.undo_run_id).toBe(r2.run_id);
    const added = await ws.okAdd(PROB, nn('hand'));
    expect((await ws.state()).draft.undo_run_id, 'no Undo offered').toBeNull();
    const direct = await rpc(o.c, 'canvas_draft_undo', { p_draft: ws.draft, p_expected_run: r2.run_id, p_expected_revision: ws.rev });
    expect(direct.data).toMatchObject({ status: 'refused', code: 'stale_view' });
    expect((await ws.points()).some((p) => p.id === added.point_id)).toBe(true);
  }, T);

  it('discarding the draft leaves the added card nowhere', async () => {
    const o = await mkOwner('discard'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'doomed')]);
    const r = await ws.okAdd(PROB, nn('hand doomed'));
    const d = await ok(o.c, 'canvas_draft_discard', { p_draft: ws.draft, p_expected_revision: ws.rev });
    expect(d.status).toBe('ok');
    expect((await admin.from('points').select('id').eq('id', r.point_id)).data ?? []).toEqual([]);
  }, T);
});
