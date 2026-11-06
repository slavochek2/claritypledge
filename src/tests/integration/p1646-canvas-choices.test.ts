/**
 * P1646: the canvas agent offers the owner a choice when a message contradicts a current point
 * (migration 20261106125500: canvas_draft_choices, _canvas_draft_choice_latest, _canvas_draft_run_complete_choice).
 *   npm run test:integration -- src/tests/integration/p1646-canvas-choices.test.ts
 * The model is a stub, as in p1614-edit-point.test.ts: runs are begun and completed through the service-role worker functions.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1646 ${RUN}`;
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
const A = admin as unknown as SupabaseClient;
const eng = (fn: string, args: Row) => ok(A, fn, args);

const users: TestUser[] = [];
async function mkOwner(label: string) {
  const u = await createTestUser({ name: `P1646 ${label} ${RUN}` });
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
  /** Send one message and begin its run; the caller completes it. */
  async send(body = nn('msg ' + randomUUID().slice(0, 4)), refs: string[] | null = null): Promise<string> {
    const r = await ok(this.o.c, 'canvas_workspace_send', {
      p_canvas: this.canvas || null, p_from_version: null, p_expected_draft: this.draft || null, p_expected_revision: this.draft ? this.rev : null,
      p_replace: false, p_body: body, p_box_refs: refs, p_attachment: null, p_client_id: randomUUID(),
    });
    expect(r.status, JSON.stringify(r)).toBe('ok');
    this.canvas = r.canvas_id; this.draft = r.draft_id; this.vname = r.version_name;
    const b = await eng('_canvas_draft_run_begin', { p_run: r.run_id, p_owner: this.o.u.user.id, p_has_file: false, p_cap_reply: null });
    expect(b.status, JSON.stringify(b)).toBe('run');
    return r.run_id;
  }
  /** A normal run through the existing 10-argument function. */
  async cycle(actions: Row[]): Promise<void> {
    const run = await this.send();
    const d = await eng('_canvas_draft_run_complete', {
      p_run: run, p_owner: this.o.u.user.id, p_actions: actions, p_questions: {}, p_scope: [SEG, PROB], p_focus: null,
      p_other_canvases: [], p_note: null, p_reply: nn('reply'), p_usd: 0.001,
    });
    expect(d.status, JSON.stringify(d)).toBe('ok');
    await this.state();
  }
  async complete(run: string, choice: Row, reply = nn('choice reply'), extra: Row = {}) {
    const out = await rpc(A, '_canvas_draft_run_complete_choice', {
      p_run: run, p_owner: this.o.u.user.id, p_questions: {}, p_note: null, p_reply: reply, p_usd: 0.001, p_choice: choice, ...extra,
    });
    await this.state();   // keep the revision current for the next send
    return out;
  }
  async points(): Promise<Row[]> {
    return ((await admin.from('points').select('id, statement, system_tags').eq('first_validator_id', this.o.u.user.id)
      .contains('system_tags', [`canvas_${this.vname}`])).data ?? []) as Row[];
  }
  async stmts(): Promise<string[]> { return (await this.points()).map((p) => p.statement as string).sort(); }
  byText(rows: Row[], t: string): Row { const r = rows.find((p) => p.statement === t); expect(r, `point "${t}" in the draft`).toBeTruthy(); return r!; }
  async choices(): Promise<Row[]> {
    return ((await admin.from('canvas_draft_choices').select('*').eq('draft_id', this.draft).order('created_at')).data ?? []) as Row[];
  }
}
const newPt = (box: string, s: string): Row => ({ action: 'new', box, statement: nn(s) });
const opt = (letter: string, kind: 'replace' | 'add', box: string, statement: string, replaces: string[] = []): Row => ({
  letter, kind, box, statement: nn(statement), quote: nn('owner words'), means: 'It changes the segment.', also_revisit: [PROB], replaces,
});
const offerChoice = (conflicts: string[], options: Row[], extra: Row = {}): Row => ({
  mode: 'offer', request: nn('the owner request'), conflicts_with: conflicts, options, recommended: 'A', reason: 'it matches what you said', ...extra,
});

/** Canvas with one segment point and one problem point, then a run that offers a choice about the segment point. */
async function offered(label: string, kinds: Array<'replace' | 'add'> = ['replace', 'add'], derivedRefs: string[] | null = null) {
  const o = await mkOwner(label); const ws = new WS(o);
  await ws.cycle([newPt(SEG, 'old segment'), newPt(PROB, 'a problem')]);
  const pts = await ws.points();
  const seg = ws.byText(pts, nn('old segment')); const prob = ws.byText(pts, nn('a problem'));
  const before = await ws.stmts();
  const run = await ws.send();
  if (derivedRefs) await admin.from('canvas_draft_runs').update({ derived_refs: derivedRefs }).eq('id', run);
  const options = kinds.map((k, i) => opt(String.fromCharCode(65 + i), k, SEG, `new segment ${i}`, k === 'replace' ? [seg.id] : []));
  const r = await ws.complete(run, offerChoice([seg.id], options));
  expect(r.error, JSON.stringify(r.error)).toBeNull();
  expect(r.data.status, JSON.stringify(r.data)).toBe('ok');
  await ws.state();
  return { o, ws, seg, prob, before, run, offer: r.data };
}
const apply = async (ws: WS, choiceId: string, letter: string) => {
  const run = await ws.send(nn('pick ' + letter));
  const r = await ws.complete(run, { mode: 'apply', choice_id: choiceId, letter }, nn('applied'));
  expect(r.error, JSON.stringify(r.error)).toBeNull();
  // a refused apply leaves the run running (the engine would then settle it): settle it here so the next send is not busy
  if (r.data.status === 'stale') await ws.complete(run, { mode: 'hold' }, nn('settled'));
  return { run, res: r.data as Row };
};

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

describe('P1646 canvas choices', () => {
  it('an offer stores the choice, changes nothing on the canvas and posts the reply verbatim', async () => {
    const { ws, before, offer, run, seg } = await offered('offer');
    expect(await ws.stmts(), 'the canvas is unchanged').toEqual(before);
    const rows = await ws.choices();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: 'open', owner_id: ws.o.u.user.id, offer_run_id: run, recommended: 'A', conflicts_with: [seg.id] });
    expect(offer.choice_id).toBe(rows[0]!.id);
    expect(rows[0]!.fingerprint).toEqual((await ws.points()).map((p) => p.id).sort());
    const msg = (await admin.from('chat_messages').select('body').eq('canvas_run_id', run).eq('kind', 'agent').single()).data as Row;
    expect(msg.body).toBe(nn('choice reply'));
    const latest = await eng('_canvas_draft_choice_latest', { p_run: run, p_owner: ws.o.u.user.id });
    expect(latest).toMatchObject({ status: 'ok', stale: false, choice: { id: rows[0]!.id, state: 'open', recommended: 'A' } });
  }, T);

  it('apply replace changes exactly that box: the old point is gone, the new one is there, other boxes are untouched', async () => {
    const { ws, seg, prob } = await offered('replace');
    const id = (await ws.choices())[0]!.id;
    const { res } = await apply(ws, id, 'A');
    expect(res.status, JSON.stringify(res)).toBe('ok');
    const now = await ws.points();
    expect(now.map((p) => p.statement).sort()).toEqual([nn('a problem'), nn('new segment 0')].sort());
    expect(now.some((p) => p.id === seg.id), 'the old segment point left the draft').toBe(false);
    expect(now.some((p) => p.id === prob.id), 'the problem point is the same point').toBe(true);
    expect((await ws.choices())[0]).toMatchObject({ state: 'picked', picked_letter: 'A' });
  }, T);

  it('apply add keeps the old point beside the new one', async () => {
    const { ws, seg } = await offered('add');
    const id = (await ws.choices())[0]!.id;
    const { res } = await apply(ws, id, 'B');
    expect(res.status, JSON.stringify(res)).toBe('ok');
    const now = await ws.points();
    expect(now.map((p) => p.statement).sort()).toEqual([nn('a problem'), nn('new segment 1'), nn('old segment')].sort());
    expect(now.some((p) => p.id === seg.id)).toBe(true);
    expect((await ws.choices())[0]).toMatchObject({ state: 'picked', picked_letter: 'B' });
  }, T);

  it('keep changes nothing and closes the choice', async () => {
    const { ws, before } = await offered('keep');
    const id = (await ws.choices())[0]!.id;
    const { res } = await apply(ws, id, 'C');
    expect(res.status, JSON.stringify(res)).toBe('ok');
    expect(await ws.stmts()).toEqual(before);
    expect((await ws.choices())[0]).toMatchObject({ state: 'kept', picked_letter: 'C' });
  }, T);

  it('a choice with one option: A applies, B is the keep letter, C is unknown', async () => {
    const { ws, before } = await offered('one', ['replace']);
    const id = (await ws.choices())[0]!.id;
    const bad = await apply(ws, id, 'C');
    expect(bad.res).toEqual({ status: 'stale' });
    const keep = await apply(ws, id, 'B');
    expect(keep.res.status).toBe('ok');
    expect(await ws.stmts()).toEqual(before);
  }, T);

  it('a stale choice (the canvas changed by a hand edit) answers stale and applies nothing', async () => {
    const { ws, seg } = await offered('stale');
    const id = (await ws.choices())[0]!.id;
    const edit = await ok(ws.o.c, 'canvas_draft_edit_point', { p_draft: ws.draft, p_point: seg.id, p_statement: nn('edited by hand'), p_expected_revision: ws.rev });
    expect(edit.status, JSON.stringify(edit)).toBe('ok');
    await ws.state();
    const after = await ws.stmts();
    const latest = await eng('_canvas_draft_choice_latest', { p_run: (await admin.from('canvas_draft_runs').select('id').eq('draft_id', ws.draft).limit(1).single()).data!.id, p_owner: ws.o.u.user.id });
    expect(latest.stale, 'the state read flags it stale').toBe(true);
    const run = await ws.send(nn('pick A late'));
    const r = await ws.complete(run, { mode: 'apply', choice_id: id, letter: 'A' });
    expect(r.error).toBeNull();
    expect(r.data).toEqual({ status: 'stale' });
    expect((await admin.from('canvas_draft_runs').select('state').eq('id', run).single()).data!.state, 'the inner function was not called').toBe('running');
    expect(await ws.stmts()).toEqual(after);
    expect((await ws.choices())[0]!.state).toBe('open');
    // the engine then settles the run as a hold
    const hold = await ws.complete(run, { mode: 'hold' }, nn('held'));
    expect(hold.data.status).toBe('ok');
  }, T);

  it('an apply against a settled choice answers stale', async () => {
    const { ws } = await offered('settled');
    const id = (await ws.choices())[0]!.id;
    expect((await apply(ws, id, 'C')).res.status).toBe('ok');
    const again = await apply(ws, id, 'A');
    expect(again.res).toEqual({ status: 'stale' });
  }, T);

  it('a new offer supersedes the previous open one', async () => {
    const { ws, seg } = await offered('supersede');
    const first = (await ws.choices())[0]!;
    const run = await ws.send();
    const r = await ws.complete(run, offerChoice([seg.id], [opt('A', 'add', SEG, 'second try')]));
    expect(r.data.status, JSON.stringify(r)).toBe('ok');
    const rows = await ws.choices();
    expect(rows.map((c) => c.state)).toEqual(['superseded', 'open']);
    expect(rows[0]!.id).toBe(first.id);
    expect(rows[1]!.id).toBe(r.data.choice_id);
  }, T);

  it('hold applies nothing and changes no choice row', async () => {
    const { ws, before } = await offered('hold');
    const run = await ws.send();
    const r = await ws.complete(run, { mode: 'hold' }, nn('nothing to pick'));
    expect(r.data.status, JSON.stringify(r)).toBe('ok');
    expect(await ws.stmts()).toEqual(before);
    expect((await ws.choices()).map((c) => c.state)).toEqual(['open']);
  }, T);

  it('bad shapes raise 22023 and write nothing', async () => {
    const o = await mkOwner('shape'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'old segment'), newPt(PROB, 'a problem')]);
    const pts = await ws.points();
    const seg = ws.byText(pts, nn('old segment')); const prob = ws.byText(pts, nn('a problem'));
    const before = await ws.stmts();
    const good = opt('A', 'replace', SEG, 'ok', [seg.id]);
    const cases: Array<[string, Row]> = [
      ['no conflicts', offerChoice([], [good])],
      ['conflict not on the draft', offerChoice([randomUUID()], [good])],
      ['no options', offerChoice([seg.id], [])],
      ['three options', offerChoice([seg.id], [good, opt('B', 'add', SEG, 'b'), opt('C', 'add', SEG, 'c')])],
      ['wrong letter', offerChoice([seg.id], [{ ...good, letter: 'B' }])],
      ['unknown box', offerChoice([seg.id], [{ ...good, box: 'canvas:nope' }])],
      ['empty statement', offerChoice([seg.id], [{ ...good, statement: '  ' }])],
      ['statement over 300', offerChoice([seg.id], [{ ...good, statement: 'x'.repeat(301) }])],
      ['replace with no replaces', offerChoice([seg.id], [{ ...good, replaces: [] }])],
      ['replace of a point in another box', offerChoice([seg.id, prob.id], [{ ...good, replaces: [prob.id] }])],
      ['replaces outside conflicts', offerChoice([seg.id], [{ ...good, replaces: [prob.id] }])],
      ['add that replaces', offerChoice([seg.id], [{ ...opt('A', 'add', SEG, 'x'), replaces: [seg.id] }])],
      ['also_revisit holds its own box', offerChoice([seg.id], [{ ...good, also_revisit: [SEG] }])],
      ['recommended B with one option', offerChoice([seg.id], [good], { recommended: 'B' })],
      ['recommended unknown', offerChoice([seg.id], [good], { recommended: 'Z' })],
      ['empty request', offerChoice([seg.id], [good], { request: ' ' })],
    ];
    for (const [label, choice] of cases) {
      const run = await ws.send();
      const r = await ws.complete(run, choice);
      expect(r.error?.code, label).toBe('22023');
      // the transaction rolled back: the run is still running, so the next case can reuse the message path
      expect((await admin.from('canvas_draft_runs').select('state').eq('id', run).single()).data!.state, label).toBe('running');
      const hold = await ws.complete(run, { mode: 'hold' });
      expect(hold.data.status, label).toBe('ok');
    }
    const unknown = await ws.send();
    expect((await ws.complete(unknown, { mode: 'nope' })).error?.code).toBe('22023');
    expect((await ws.complete(unknown, { mode: 'hold' })).data.status).toBe('ok');
    expect(await ws.stmts()).toEqual(before);
    expect(await ws.choices()).toEqual([]);
  }, T);

  it('an authenticated caller cannot call either function or read the table', async () => {
    const { ws, run } = await offered('grants');
    const a = await rpc(ws.o.c, '_canvas_draft_choice_latest', { p_run: run, p_owner: ws.o.u.user.id });
    expect(a.error, 'authenticated: latest').toBeTruthy();
    const b = await rpc(ws.o.c, '_canvas_draft_run_complete_choice', {
      p_run: run, p_owner: ws.o.u.user.id, p_questions: {}, p_note: null, p_reply: 'x', p_usd: 0, p_choice: { mode: 'hold' },
    });
    expect(b.error, 'authenticated: complete').toBeTruthy();
    const anon = createClient(URL_, ANON, noSession);
    expect((await rpc(anon, '_canvas_draft_choice_latest', { p_run: run, p_owner: ws.o.u.user.id })).error, 'anon').toBeTruthy();
    const read = await ws.o.c.from('canvas_draft_choices').select('id');
    expect(read.error || (read.data ?? []).length === 0, 'the table is closed to clients').toBeTruthy();
  }, T);

  it('latest answers none before any offer and gone for another owner', async () => {
    const o = await mkOwner('latest'); const ws = new WS(o); const x = await mkOwner('latest-other');
    await ws.cycle([newPt(SEG, 'old segment')]);
    const run = await ws.send();
    expect(await eng('_canvas_draft_choice_latest', { p_run: run, p_owner: o.u.user.id })).toEqual({ status: 'none' });
    expect(await eng('_canvas_draft_choice_latest', { p_run: run, p_owner: x.u.user.id })).toEqual({ status: 'gone' });
    expect((await ws.complete(run, { mode: 'hold' })).data.status).toBe('ok');
  }, T);

  it('choices are gone after the draft is discarded', async () => {
    const { ws } = await offered('discard');
    expect(await ws.choices()).toHaveLength(1);
    const d = await ok(ws.o.c, 'canvas_draft_discard', { p_draft: ws.draft, p_expected_revision: ws.rev });
    expect(d.status).toBe('ok');
    expect(await ws.choices()).toEqual([]);
  }, T);

  it('choices are gone after the draft is published', async () => {
    const { ws } = await offered('publish');
    expect(await ws.choices()).toHaveLength(1);
    const p = await ok(ws.o.c, 'canvas_draft_publish', { p_draft: ws.draft, p_expected_revision: ws.rev });
    expect(p.status, JSON.stringify(p)).toBe('ok');
    expect(await ws.choices()).toEqual([]);
  }, T);

  it('a tagged pick whose tags include the option box applies; tags without the box are stale and write nothing; keep works on any tags', async () => {
    const { ws, seg, prob } = await offered('tagged');
    const id = (await ws.choices())[0]!.id;
    // tags WITHOUT the option's box (segments): stale, nothing written, run still running
    const before = await ws.stmts();
    const run1 = await ws.send(nn('tagged problem'), [PROB]);
    const r1 = await ws.complete(run1, { mode: 'apply', choice_id: id, letter: 'A' });
    expect(r1.data).toEqual({ status: 'stale' });
    expect((await admin.from('canvas_draft_runs').select('state').eq('id', run1).single()).data!.state).toBe('running');
    expect(await ws.stmts()).toEqual(before);
    // keep on tagged [PROB]: accepted, nothing written, the tagged box's point stays
    const k = await ws.complete(run1, { mode: 'apply', choice_id: id, letter: 'C' }, nn('kept'));
    expect(k.data.status, JSON.stringify(k)).toBe('ok');
    expect(await ws.stmts()).toEqual(before);
    expect((await ws.choices())[0]).toMatchObject({ state: 'kept' });
    // a fresh offer, then a tagged pick that includes the box
    const run2 = await ws.send();
    const o2 = await ws.complete(run2, offerChoice([seg.id], [opt('A', 'replace', SEG, 'tagged new', [seg.id])]));
    expect(o2.data.status, JSON.stringify(o2)).toBe('ok');
    const run3 = await ws.send(nn('tagged segments'), [SEG]);
    const r3 = await ws.complete(run3, { mode: 'apply', choice_id: o2.data.choice_id, letter: 'A' }, nn('applied tagged'));
    expect(r3.data.status, JSON.stringify(r3)).toBe('ok');
    const now = await ws.points();
    expect(now.map((p) => p.statement).sort()).toEqual([nn('a problem'), nn('tagged new')].sort());
    expect(now.some((p) => p.id === seg.id)).toBe(false);
    expect(now.some((p) => p.id === prob.id)).toBe(true);
  }, T);

  it('a replace option must replace exactly the conflicting points of its box (a subset is refused at offer)', async () => {
    const o = await mkOwner('exact'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'seg one'), newPt(SEG, 'seg two')]);
    const pts = await ws.points();
    const s1 = ws.byText(pts, nn('seg one')); const s2 = ws.byText(pts, nn('seg two'));
    const run = await ws.send();
    const sub = await ws.complete(run, offerChoice([s1.id, s2.id], [opt('A', 'replace', SEG, 'only one gone', [s1.id])]));
    expect(sub.error?.code, 'subset refused').toBe('22023');
    const exact = await ws.complete(run, offerChoice([s1.id, s2.id], [opt('A', 'replace', SEG, 'both gone', [s2.id, s1.id])]));
    expect(exact.data.status, JSON.stringify(exact)).toBe('ok');
    const id = (await ws.choices())[0]!.id;
    const { res } = await apply(ws, id, 'A');
    expect(res.status, JSON.stringify(res)).toBe('ok');
    expect(await ws.stmts()).toEqual([nn('both gone')]);
  }, T);

  it('the REAL erase_chat_data_for on a person whose words a run read removes that run\'s choice; another owner\'s choice survives', async () => {
    const X = await mkOwner('erasee');
    const ref = (await admin.rpc('_chat_author_ref', { p_id: X.u.user.id })).data as string;
    expect(typeof ref).toBe('string');
    const hit = await offered('erase-hit', ['replace'], [ref]);
    const miss = await offered('erase-miss', ['replace']);
    expect(await hit.ws.choices()).toHaveLength(1);
    const erased = await admin.rpc('erase_chat_data_for', { p_uid: X.u.user.id });
    expect(erased.error, JSON.stringify(erased.error)).toBeNull();
    expect(await hit.ws.choices(), 'the choice of a run that read the erased words is gone').toEqual([]);
    expect(await miss.ws.choices(), 'an unrelated choice is untouched').toHaveLength(1);
  }, T);

  it('erase through the FIRST run\'s reply also removes the re-offer\'s copy on a later run (every choice of that draft)', async () => {
    const X = await mkOwner('erasee2');
    const ref = (await admin.rpc('_chat_author_ref', { p_id: X.u.user.id })).data as string;
    const hit = await offered('erase-reoffer', ['replace'], [ref]);
    const miss = await offered('erase-reoffer-miss', ['replace']);
    // the canvas changes, so the first choice is stale; the engine re-offers on a new run (no derived_refs on it)
    const edit = await ok(hit.ws.o.c, 'canvas_draft_edit_point', { p_draft: hit.ws.draft, p_point: hit.seg.id, p_statement: nn('hand edit'), p_expected_revision: hit.ws.rev });
    expect(edit.status, JSON.stringify(edit)).toBe('ok');
    await hit.ws.state();
    const cur = (await hit.ws.points()).find((p) => p.statement === nn('hand edit'))!;
    const run2 = await hit.ws.send();
    const re = await hit.ws.complete(run2, offerChoice([cur.id], [opt('A', 'replace', SEG, 'copied request', [cur.id])]));
    expect(re.data.status, JSON.stringify(re)).toBe('ok');
    const rows = await hit.ws.choices();
    expect(rows.map((c) => c.state), 'two choices from two runs, the first superseded').toEqual(['superseded', 'open']);
    expect(new Set(rows.map((c) => c.offer_run_id)).size).toBe(2);
    const erased = await admin.rpc('erase_chat_data_for', { p_uid: X.u.user.id });
    expect(erased.error, JSON.stringify(erased.error)).toBeNull();
    expect(await hit.ws.choices(), 'no choice of the draft is left').toEqual([]);
    expect(await miss.ws.choices(), 'another owner\'s choice survives').toHaveLength(1);
  }, T);

  it('nulling derived_refs on the offer run\'s agent reply (what erase_chat_data_for does) deletes that run\'s choices', async () => {
    const { ws, run } = await offered('erase');
    expect(await ws.choices()).toHaveLength(1);
    const msg = (await admin.from('chat_messages').select('id, derived_refs').eq('canvas_run_id', run).eq('kind', 'agent').single()).data as Row;
    expect(msg.derived_refs, 'the reply carries refs').not.toBeNull();
    const up = await admin.from('chat_messages').update({ derived_refs: null }).eq('id', msg.id);
    expect(up.error).toBeNull();
    expect(await ws.choices()).toEqual([]);
  }, T);
});
