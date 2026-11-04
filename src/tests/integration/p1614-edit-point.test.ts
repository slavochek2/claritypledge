/**
 * P1614: the owner edits a point's text directly on an open draft (migration 20261105143000, canvas_draft_edit_point).
 *   npm run test:integration -- src/tests/integration/p1614-edit-point.test.ts
 * The model is a stub, as in p1536-v6-engine.test.ts: runs are begun and completed through the service-role worker functions.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1614 ${RUN}`;
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
  const u = await createTestUser({ name: `P1614 ${label} ${RUN}` });
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
  /** One message, begun and completed by the stub engine. */
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
    return ((await admin.from('points').select('id, statement, system_tags, superseded_by').eq('first_validator_id', this.o.u.user.id)
      .contains('system_tags', [`canvas_${this.vname}`])).data ?? []) as Row[];
  }
  byText(rows: Row[], t: string): Row { const r = rows.find((p) => p.statement === t); expect(r, `point "${t}" in the draft`).toBeTruthy(); return r!; }
  edit(point: string, text: string, rev = this.rev, c = this.o.c) {
    return rpc(c, 'canvas_draft_edit_point', { p_draft: this.draft, p_point: point, p_statement: text, p_expected_revision: rev });
  }
  async okEdit(point: string, text: string): Promise<Row> {
    const { data, error } = await this.edit(point, text);
    expect(error, JSON.stringify(error)).toBeNull();
    expect(data.status, JSON.stringify(data)).toBe('ok');
    await this.state();
    return data;
  }
  async draftRow(): Promise<Row> { return (await admin.from('canvas_drafts').select('*').eq('id', this.draft).single()).data as Row; }
  async ledger(): Promise<Row[]> { return ((await admin.from('canvas_draft_points').select('*').eq('draft_id', this.draft)).data ?? []) as Row[]; }
  async runs(): Promise<Row[]> { return ((await admin.from('canvas_draft_runs').select('id, state').eq('draft_id', this.draft)).data ?? []) as Row[]; }
}
const newPt = (box: string, s: string, story?: string): Row => ({ action: 'new', box, statement: nn(s), ...(story ? { story: nn(story) } : {}) });
const publish = (ws: WS) => ok(ws.o.c, 'canvas_draft_publish', { p_draft: ws.draft, p_expected_revision: ws.rev });

afterAll(async () => {
  const mine = users.map((u) => u.user.id);
  if (mine.length) {
    await admin.from('canvases').delete().in('owner_id', mine);
    await admin.from('points').delete().like('statement', `${TAG}%`);
    await admin.from('stories').delete().like('content', `${TAG}%`);
    await admin.from('mirror_ai_spend').delete().in('owner_id', mine);
  }
  const gone = await deleteTestUsers(mine);
  expect(gone.failed, 'every test user was deleted').toBe(0);
}, 240_000);

const T = 240_000;

describe('P1614 edit a point on a draft', () => {
  it('saves at once, makes a new point, uses no run, bumps the revision, and an unchanged or empty save is handled', async () => {
    const o = await mkOwner('save'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'old words')]);
    const runsBefore = (await ws.runs()).length;
    const used = (await ws.state()).draft.used_runs;
    const old = ws.byText(await ws.points(), nn('old words'));
    const revBefore = ws.rev;
    const r = await ws.okEdit(old.id, `  ${nn('new words')}  `);
    expect(r).toMatchObject({ changed: true, revision: revBefore + 1 });
    const pts = await ws.points();
    expect(pts.map((p) => p.statement)).toEqual([nn('new words')]);
    expect(pts[0]!.id).not.toBe(old.id);
    expect((await ws.runs()).length, 'no run was made').toBe(runsBefore);
    expect((await ws.state()).draft.used_runs, 'no run allowance used').toBe(used);
    expect((await ws.ledger()).some((l) => l.point_id === pts[0]!.id), 'the new point is in the ledger').toBe(true);
    // unchanged save: nothing written, revision unchanged
    const same = await ws.edit(pts[0]!.id, nn('new words'));
    expect(same.data).toMatchObject({ status: 'ok', changed: false, revision: ws.rev });
    expect((await ws.draftRow()).revision).toBe(ws.rev);
    expect((await ws.points()).length).toBe(1);
    // empty and over-long text raise 22023 and write nothing
    for (const bad of ['', '   ', 'x'.repeat(301)]) {
      const e = await ws.edit(pts[0]!.id, bad);
      expect(e.error?.code, `"${bad.slice(0, 5)}"`).toBe('22023');
    }
    expect((await ws.draftRow()).revision).toBe(ws.rev);
  }, T);

  it('a point reused from v1: v1 keeps the old text, Publish supersedes the old point and v2 shows the new text', async () => {
    const o = await mkOwner('reuse'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'v1 words')]);
    const v1name = ws.vname;
    const v1Point = ws.byText(await ws.points(), nn('v1 words'));
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
    expect((await ws.points()).map((p) => p.id), 'the draft starts as v1').toContain(v1Point.id);
    expect((await ws.draftRow()).pending_links).toEqual([]);
    const r = await ws.okEdit(v1Point.id, nn('v2 words'));
    const links = (await ws.draftRow()).pending_links as Row[];
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ old: v1Point.id, new: r.point_id });
    expect((await admin.from('points').select('statement').eq('id', v1Point.id).single()).data!.statement, 'the published point is unchanged').toBe(nn('v1 words'));
    const read = async (v: string) => (await ok(o.c, 'get_canvas', { p_owner: o.u.user.id, p_name: ws.name, p_link_token: null, p_version: v }));
    expect(JSON.stringify(await read(v1name))).toContain(nn('v1 words'));
    expect(JSON.stringify(await read(v1name))).not.toContain(nn('v2 words'));
    const pub = await publish(ws);
    expect(pub.status, JSON.stringify(pub)).toBe('ok');
    expect(Number(pub.skipped_links ?? 0), 'no link skipped').toBe(0);
    expect((await admin.from('points').select('superseded_by').eq('id', v1Point.id).single()).data!.superseded_by, 'the old point is superseded').toBe(r.point_id);
    expect(JSON.stringify(await read(ws.vname))).toContain(nn('v2 words'));
    expect(JSON.stringify(await read(v1name))).toContain(nn('v1 words'));
  }, T);

  it('editing a point the draft made and then discarding leaves nothing behind', async () => {
    const o = await mkOwner('discard'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'doomed')]);
    const p = ws.byText(await ws.points(), nn('doomed'));
    const r = await ws.okEdit(p.id, nn('doomed edited'));
    const d = await ok(o.c, 'canvas_draft_discard', { p_draft: ws.draft, p_expected_revision: ws.rev });
    expect(d.status).toBe('ok');
    const left = (await admin.from('points').select('id').in('id', [p.id, r.point_id])).data ?? [];
    expect(left, 'both the original and the edited point are gone').toEqual([]);
  }, T);

  it('the next run reads the edited wording (the draft\'s points carry it)', async () => {
    const o = await mkOwner('next'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'before')]);
    const p = ws.byText(await ws.points(), nn('before'));
    await ws.okEdit(p.id, nn('after'));
    const s = await ok(o.c, 'get_canvas', { p_owner: o.u.user.id, p_name: ws.name, p_link_token: null, p_version: ws.vname });
    expect(JSON.stringify(s)).toContain(nn('after'));
    expect(JSON.stringify(s)).not.toContain(nn('before'));
    expect((await ws.state()).draft.differs_from_base).toBe(true);
  }, T);

  it('while a run is going the edit is refused as busy and writes nothing; a stale revision is refused as stale_view', async () => {
    const o = await mkOwner('busy'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'steady')]);
    const p = ws.byText(await ws.points(), nn('steady'));
    const staleRev = ws.rev;
    const r = await ok(o.c, 'canvas_workspace_send', {
      p_canvas: ws.canvas, p_from_version: null, p_expected_draft: ws.draft, p_expected_revision: ws.rev, p_replace: false,
      p_body: nn('queued'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    });
    expect(r.status).toBe('ok');
    const busy = await ws.edit(p.id, nn('racing'), r.revision);
    expect(busy.data).toMatchObject({ status: 'refused', code: 'busy' });
    expect((await ws.points()).map((x) => x.statement)).toEqual([nn('steady')]);
    await eng('_canvas_draft_run_begin', { p_run: r.run_id, p_owner: o.u.user.id, p_has_file: false, p_cap_reply: null });
    await eng('_canvas_draft_run_complete', { p_run: r.run_id, p_owner: o.u.user.id, p_actions: [], p_questions: {}, p_scope: [], p_focus: null, p_other_canvases: [], p_note: null, p_reply: nn('r'), p_usd: 0.001 });
    const stale = await ws.edit(p.id, nn('late'), staleRev);
    expect(stale.data).toMatchObject({ status: 'refused', code: 'stale_view' });
  }, T);

  it('another signed-in person and a signed-out caller are refused; a point outside the draft is stale_view', async () => {
    const o = await mkOwner('own'); const x = await mkOwner('other'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'mine')]);
    const p = ws.byText(await ws.points(), nn('mine'));
    const other = await ws.edit(p.id, nn('hijack'), ws.rev, x.c);
    expect(other.error?.code).toBe('42501');
    const anon = await ws.edit(p.id, nn('anon'), ws.rev, createClient(URL_, ANON, noSession));
    expect(anon.error).toBeTruthy();
    const foreign = await ws.edit(randomUUID(), nn('nope'));
    expect(foreign.data).toMatchObject({ status: 'refused', code: 'stale_view' });
    expect((await ws.points()).map((q) => q.statement)).toEqual([nn('mine')]);
  }, T);

  it('after an edit Undo of an earlier run is not offered and refused; undoing a later run keeps the edit, its link and its ledger row', async () => {
    const o = await mkOwner('undo'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'a')]);
    const a0 = ws.byText(await ws.points(), nn('a'));
    const r2 = await ws.cycle([{ action: 'keep', point_id: a0.id }, newPt(PROB, 'b')]);
    expect((await ws.state()).draft.undo_run_id).toBe(r2.run_id);
    const a = ws.byText(await ws.points(), nn('a'));
    const e = await ws.okEdit(a.id, nn('a edited'));
    expect((await ws.state()).draft.undo_run_id, 'no Undo offered').toBeNull();
    const direct = await rpc(o.c, 'canvas_draft_undo', { p_draft: ws.draft, p_expected_run: r2.run_id, p_expected_revision: ws.rev });
    expect(direct.data).toMatchObject({ status: 'refused', code: 'stale_view' });
    const r3 = await ws.cycle([{ action: 'keep', point_id: e.point_id }, { action: 'keep', point_id: ws.byText(await ws.points(), nn('b')).id }, newPt(PROB, 'c')]);
    expect((await ws.state()).draft.undo_run_id).toBe(r3.run_id);
    const u = await ok(o.c, 'canvas_draft_undo', { p_draft: ws.draft, p_expected_run: r3.run_id, p_expected_revision: ws.rev });
    expect(u.status, JSON.stringify(u)).toBe('ok');
    const texts = (await ws.points()).map((p) => p.statement).sort();
    expect(texts).toEqual([nn('a edited'), nn('b')].sort());
    expect((await ws.ledger()).some((l) => l.point_id === e.point_id), 'ledger row kept').toBe(true);
  }, T);

  it('editing twice, or a point the agent reworded, leaves one pending link from the published point to the newest text', async () => {
    const o = await mkOwner('twice'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'base')]);
    const baseName = ws.vname;
    const base = ws.byText(await ws.points(), nn('base'));
    await publish(ws);
    const v1 = (await admin.from('canvas_versions').select('id').eq('canvas_id', ws.canvas).eq('name', baseName).single()).data as Row;
    const sent = await ok(o.c, 'canvas_workspace_send', {
      p_canvas: ws.canvas, p_from_version: v1.id, p_expected_draft: null, p_expected_revision: null, p_replace: false,
      p_body: nn('go'), p_box_refs: [SEG], p_attachment: null, p_client_id: randomUUID(),
    });
    ws.draft = sent.draft_id; ws.vname = sent.version_name;
    await eng('_canvas_draft_run_begin', { p_run: sent.run_id, p_owner: o.u.user.id, p_has_file: false, p_cap_reply: null });
    await eng('_canvas_draft_run_complete', {
      p_run: sent.run_id, p_owner: o.u.user.id, p_actions: [{ action: 'reword', point_id: base.id, box: SEG, statement: nn('agent words') }],
      p_questions: {}, p_scope: [], p_focus: null, p_other_canvases: [], p_note: null, p_reply: nn('r'), p_usd: 0.001 });
    await ws.state();
    const cur = ws.byText(await ws.points(), nn('agent words'));
    const e1 = await ws.okEdit(cur.id, nn('hand one'));
    const e2 = await ws.okEdit(e1.point_id, nn('hand two'));
    const links = (await ws.draftRow()).pending_links as Row[];
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ old: base.id, new: e2.point_id });
    const pub = await publish(ws);
    expect(Number(pub.skipped_links ?? 0), 'no link skipped').toBe(0);
    expect((await admin.from('points').select('superseded_by').eq('id', base.id).single()).data!.superseded_by).toBe(e2.point_id);
  }, T);

  it('the owner\'s stance and private story on the old point are on the new point', async () => {
    const o = await mkOwner('stance'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'with story', 'the story')]);
    const p = ws.byText(await ws.points(), nn('with story'));
    const pos = await admin.from('point_positions').insert({ point_id: p.id, user_id: o.u.user.id, position: 'agree' });
    expect(pos.error).toBeNull();
    const e = await ws.okEdit(p.id, nn('with story edited'));
    const np = (await admin.from('point_positions').select('position').eq('point_id', e.point_id).eq('user_id', o.u.user.id)).data ?? [];
    expect(np.map((x: Row) => x.position)).toEqual(['agree']);
    const oldStories = (await admin.from('story_points').select('story_id').eq('point_id', p.id)).data ?? [];
    const newStories = (await admin.from('story_points').select('story_id').eq('point_id', e.point_id)).data ?? [];
    expect(newStories.map((s: Row) => s.story_id).sort()).toEqual(oldStories.map((s: Row) => s.story_id).sort());
    expect(newStories.length).toBeGreaterThan(0);
  }, T);

  /**
   * AC: "a legacy private copy edit publishes correctly". A legacy PUBLIC canvas point cannot be seeded on the self-hosted TEST server (the
   * trigger refuses it for every role, and the existing p1536-b5 probe needs raw SQL on hosted TEST). So this builds the state the opener leaves
   * behind (_canvas_draft_new): the base point L stays tagged with v1, and the draft holds a PRIVATE copy C tagged for the draft with a ledger row
   * `copied_from = L`. The edit and the engine's own reword only ever read that private copy and its ledger row, so the copy is what is under test;
   * the public visibility of L itself is NOT exercised here (stated in the report). CONTROL: the engine's reword of an identical second copy.
   */
  it('a legacy private copy: edit and an engine reword give the same link result (none), and Publish applies it with v1 untouched', async () => {
    const o = await mkOwner('legacy'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'legacy a'), newPt(PROB, 'legacy b')]);
    const v1name = ws.vname;
    const pts1 = await ws.points();
    const L1 = ws.byText(pts1, nn('legacy a')); const L2 = ws.byText(pts1, nn('legacy b'));
    await publish(ws);
    const v1 = (await admin.from('canvas_versions').select('id').eq('canvas_id', ws.canvas).eq('name', v1name).single()).data as Row;
    ws.draft = '';
    const sent = await ok(o.c, 'canvas_workspace_send', {
      p_canvas: ws.canvas, p_from_version: v1.id, p_expected_draft: null, p_expected_revision: null, p_replace: false,
      p_body: nn('open'), p_box_refs: [PROB], p_attachment: null, p_client_id: randomUUID(),
    });
    ws.draft = sent.draft_id; ws.vname = sent.version_name;
    const dtag = `canvas_${ws.vname}`;
    // the state a legacy public base leaves: private copies of L1 and L2 in the draft, L1 and L2 themselves off the draft, ledger copied_from
    const copyOf = async (L: Row, box: string): Promise<string> => {
      const ins = await admin.from('points').insert({ statement: L.statement, first_validator_id: o.u.user.id, visibility: 'private', tags: [], system_tags: [box, dtag] }).select('id').single();
      expect(ins.error).toBeNull();
      const led = await admin.from('canvas_draft_points').insert({ draft_id: ws.draft, point_id: ins.data!.id, run_id: null, story_ids: [], copied_from: L.id });
      expect(led.error).toBeNull();
      const un = await admin.from('points').update({ system_tags: (L.system_tags as string[]).filter((t) => t !== dtag) }).eq('id', L.id);
      expect(un.error).toBeNull();
      return ins.data!.id as string;
    };
    const c1 = await copyOf(L1, SEG); const c2 = await copyOf(L2, PROB);
    await eng('_canvas_draft_run_begin', { p_run: sent.run_id, p_owner: o.u.user.id, p_has_file: false, p_cap_reply: null });
    // the engine's reword of copy c2 (scope: problem only)
    await eng('_canvas_draft_run_complete', {
      p_run: sent.run_id, p_owner: o.u.user.id, p_actions: [{ action: 'reword', point_id: c2, box: PROB, statement: nn('legacy b engine') }],
      p_questions: {}, p_scope: [], p_focus: null, p_other_canvases: [], p_note: null, p_reply: nn('r'), p_usd: 0.001 });
    await ws.state();
    const linksAfterEngine = (await ws.draftRow()).pending_links as Row[];
    // the hand edit of copy c1
    const e = await ws.okEdit(c1, nn('legacy a edited'));
    const links = (await ws.draftRow()).pending_links as Row[];
    expect(linksAfterEngine, 'the engine records no link for a reword of a private copy').toEqual([]);
    expect(links, 'the hand edit records none either: the same result').toEqual([]);
    const led = await ws.ledger();
    expect(led.find((l) => l.point_id === e.point_id)?.copied_from ?? null, 'the edited point is a plain draft point, not a copy').toBeNull();
    const pub = await publish(ws);
    expect(pub.status, JSON.stringify(pub)).toBe('ok');
    expect(Number(pub.skipped_links ?? 0)).toBe(0);
    const read = async (v: string) => JSON.stringify(await ok(o.c, 'get_canvas', { p_owner: o.u.user.id, p_name: ws.name, p_link_token: null, p_version: v }));
    const v2 = await read(ws.vname);
    expect(v2).toContain(nn('legacy a edited'));
    expect(v2).toContain(nn('legacy b engine'));
    expect(v2).not.toContain(`"${nn('legacy a')}"`);
    const v1read = await read(v1name);
    expect(v1read, 'v1 still reads the original wording').toContain(nn('legacy a'));
    expect(v1read).not.toContain(nn('legacy a edited'));
    const heads = (await admin.from('points').select('id,superseded_by').in('id', [L1.id, L2.id])).data ?? [];
    expect(heads.every((p: Row) => p.superseded_by === null), 'the base points are untouched, as the engine leaves them').toBe(true);
  }, T);

  it('with a base version: undoing a LATER run keeps the hand edit, its pending supersede link and its ledger row', async () => {
    const o = await mkOwner('undolink'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'base a'), newPt(PROB, 'base b')]);
    const v1name = ws.vname;
    const pts1 = await ws.points();
    const a = ws.byText(pts1, nn('base a')); const b = ws.byText(pts1, nn('base b'));
    await publish(ws);
    const v1 = (await admin.from('canvas_versions').select('id').eq('canvas_id', ws.canvas).eq('name', v1name).single()).data as Row;
    ws.draft = '';
    const sent = await ok(o.c, 'canvas_workspace_send', {
      p_canvas: ws.canvas, p_from_version: v1.id, p_expected_draft: null, p_expected_revision: null, p_replace: false,
      p_body: nn('open'), p_box_refs: [PROB], p_attachment: null, p_client_id: randomUUID(),
    });
    ws.draft = sent.draft_id; ws.vname = sent.version_name;
    await eng('_canvas_draft_run_begin', { p_run: sent.run_id, p_owner: o.u.user.id, p_has_file: false, p_cap_reply: null });
    await eng('_canvas_draft_run_complete', { p_run: sent.run_id, p_owner: o.u.user.id, p_actions: [{ action: 'keep', point_id: b.id }], p_questions: {}, p_scope: [], p_focus: null, p_other_canvases: [], p_note: null, p_reply: nn('r'), p_usd: 0.001 });
    await ws.state();
    expect((await ws.draftRow()).base_version_id, 'the draft has a base version').toBeTruthy();
    const e = await ws.okEdit(a.id, nn('base a edited'));
    const linkBefore = (await ws.draftRow()).pending_links as Row[];
    expect(linkBefore).toHaveLength(1);
    expect(linkBefore[0]).toMatchObject({ old: a.id, new: e.point_id });
    expect((await ws.state()).draft.undo_run_id, 'no Undo after the edit').toBeNull();
    const r3 = await ws.cycle([{ action: 'keep', point_id: e.point_id }, { action: 'keep', point_id: b.id }, newPt(PROB, 'later c')]);
    expect((await ws.state()).draft.undo_run_id).toBe(r3.run_id);
    const u = await ok(o.c, 'canvas_draft_undo', { p_draft: ws.draft, p_expected_run: r3.run_id, p_expected_revision: ws.rev });
    expect(u.status, JSON.stringify(u)).toBe('ok');
    expect((await ws.points()).map((p) => p.statement).sort()).toEqual([nn('base a edited'), nn('base b')].sort());
    const linkAfter = (await ws.draftRow()).pending_links as Row[];
    expect(linkAfter, 'the pending supersede link survives the undo of a later run').toEqual(linkBefore);
    expect((await ws.ledger()).some((l) => l.point_id === e.point_id), 'ledger row kept').toBe(true);
    await ws.state();
    const pub = await publish(ws);
    expect(pub.status, JSON.stringify(pub)).toBe('ok');
    expect(Number(pub.skipped_links ?? 0)).toBe(0);
    expect((await admin.from('points').select('superseded_by').eq('id', a.id).single()).data!.superseded_by, 'Publish applies it').toBe(e.point_id);
  }, T);
});
