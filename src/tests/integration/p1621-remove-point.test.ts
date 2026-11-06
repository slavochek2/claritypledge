/**
 * P1621 round 2: the owner removes one point from their open draft (migration 20261106011000, canvas_draft_remove_point).
 *   npm run test:integration -- src/tests/integration/p1621-remove-point.test.ts
 * Harness as p1621-add-point.test.ts: the model is a stub, runs are begun and completed through the service-role worker functions.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1621R ${RUN}`;
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
  const u = await createTestUser({ name: `P1621R ${label} ${RUN}` });
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
  async run(sent: Row, actions: Row[], scope: string[]): Promise<void> {
    const b = await eng('_canvas_draft_run_begin', { p_run: sent.run_id, p_owner: this.o.u.user.id, p_has_file: false, p_cap_reply: null });
    expect(b.status, JSON.stringify(b)).toBe('run');
    const d = await eng('_canvas_draft_run_complete', {
      p_run: sent.run_id, p_owner: this.o.u.user.id, p_actions: actions, p_questions: {}, p_scope: scope, p_focus: null,
      p_other_canvases: [], p_note: null, p_reply: nn('reply'), p_usd: 0.001,
    });
    expect(d.status, JSON.stringify(d)).toBe('ok');
  }
  async cycle(actions: Row[]): Promise<Row> {
    const r = await ok(this.o.c, 'canvas_workspace_send', {
      p_canvas: this.canvas || null, p_from_version: null, p_expected_draft: this.draft || null, p_expected_revision: this.draft ? this.rev : null,
      p_replace: false, p_body: nn('msg ' + randomUUID().slice(0, 4)), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    });
    expect(r.status, JSON.stringify(r)).toBe('ok');
    this.canvas = r.canvas_id; this.draft = r.draft_id; this.name = r.canvas_name; this.vname = r.version_name;
    await this.run(r, actions, [SEG, PROB]);
    await this.state();
    return r;
  }
  async points(): Promise<Row[]> {
    return ((await admin.from('points').select('id, statement, system_tags').eq('first_validator_id', this.o.u.user.id)
      .contains('system_tags', [`canvas_${this.vname}`])).data ?? []) as Row[];
  }
  remove(pointId: string, rev = this.rev, c = this.o.c) {
    return rpc(c, 'canvas_draft_remove_point', { p_draft: this.draft, p_point: pointId, p_expected_revision: rev });
  }
  async ledger(): Promise<Row[]> { return ((await admin.from('canvas_draft_points').select('*').eq('draft_id', this.draft)).data ?? []) as Row[]; }
  async idOf(text: string): Promise<string> { return (await this.points()).find((p) => p.statement === nn(text))!.id; }
  async read(v: string): Promise<string> {
    return JSON.stringify(await ok(this.o.c, 'get_canvas', { p_owner: this.o.u.user.id, p_name: this.name, p_link_token: null, p_version: v }));
  }
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

describe('P1621 remove a point from a draft', () => {
  it('the owner removes a draft-only point: gone from the draft, revision +1, Undo closed; Publish then deletes the row', async () => {
    const o = await mkOwner('own'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'keeper'), newPt(PROB, 'doomed')]);
    const doomed = await ws.idOf('doomed');
    const before = ws.rev;
    const { data, error } = await ws.remove(doomed);
    expect(error, JSON.stringify(error)).toBeNull();
    expect(data).toEqual({ status: 'ok', revision: before + 1 });
    await ws.state();
    expect((await ws.points()).map((p) => p.statement)).toEqual([nn('keeper')]);
    expect((await ws.state()).draft.undo_run_id, 'Undo closed').toBeNull();
    expect((await ws.read(ws.vname)).includes(nn('doomed')), 'not on the draft read').toBe(false);
    expect((await admin.from('points').select('id').eq('id', doomed)).data, 'the row waits for Publish or Discard').toHaveLength(1);
    const pub = await publish(ws);
    expect(pub.status, JSON.stringify(pub)).toBe('ok');
    expect((await admin.from('points').select('id').eq('id', doomed)).data ?? [], 'Publish cleaned the unlinked point').toEqual([]);
    expect(await ws.read(ws.vname)).toContain(nn('keeper'));
  }, T);

  it('removing a point from a clone leaves the published version intact', async () => {
    const o = await mkOwner('clone'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'v1 keep'), newPt(PROB, 'v1 drop me')]);
    const v1name = ws.vname;
    await publish(ws);
    const v1 = (await admin.from('canvas_versions').select('id').eq('canvas_id', ws.canvas).eq('name', v1name).single()).data as Row;
    const sent = await ok(o.c, 'canvas_workspace_send', {
      p_canvas: ws.canvas, p_from_version: v1.id, p_expected_draft: null, p_expected_revision: null, p_replace: false,
      p_body: nn('hello'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    });
    ws.draft = sent.draft_id; ws.vname = sent.version_name;
    await ws.run(sent, [], []);
    await ws.state();
    const inClone = (await ws.points()).find((p) => p.statement === nn('v1 drop me'));
    expect(inClone, 'the clone carries the published point').toBeTruthy();
    const { data } = await ws.remove(inClone!.id);
    expect(data).toMatchObject({ status: 'ok' });
    await ws.state();
    expect((await ws.points()).map((p) => p.statement)).toEqual([nn('v1 keep')]);
    expect(await ws.read(v1name), 'the published version still holds it').toContain(nn('v1 drop me'));
    expect(await ws.read(ws.vname)).not.toContain(nn('v1 drop me'));
    const pub = await publish(ws);
    expect(pub.status, JSON.stringify(pub)).toBe('ok');
    expect(await ws.read(v1name), 'still there after the clone published').toContain(nn('v1 drop me'));
    expect((await admin.from('points').select('id').eq('id', inClone!.id)).data, 'the row a published version references is kept').toHaveLength(1);
  }, T);

  it('keeps a private story linked to the removed point stored, with no link to the card', async () => {
    const o = await mkOwner('story'); const ws = new WS(o);
    await ws.cycle([newPt(PROB, 'with story')]);
    const pid = await ws.idOf('with story');
    const story = (await admin.from('stories').insert({ content: nn('story body'), author_id: o.u.user.id, visibility: 'private' }).select('id').single()).data as Row;
    await admin.from('story_points').insert({ story_id: story.id, point_id: pid, author_id: o.u.user.id });
    expect((await ws.remove(pid)).data).toMatchObject({ status: 'ok' });
    expect((await admin.from('stories').select('id').eq('id', story.id)).data, 'the story is still stored').toHaveLength(1);
    expect((await ws.points()).some((p) => p.id === pid)).toBe(false);
  }, T);

  it('a story a RUN wrote for the removed card stays stored after Remove + Publish, and after Remove + Discard', async () => {
    for (const end of ['publish', 'discard'] as const) {
      const o = await mkOwner(`runstory-${end}`); const ws = new WS(o);
      await ws.cycle([newPt(SEG, 'kept'), { action: 'new', box: PROB, statement: nn('storied'), story: nn(`run story ${end}`) }]);
      const pid = await ws.idOf('storied');
      const link = (await admin.from('story_points').select('story_id').eq('point_id', pid)).data as Row[];
      expect(link, 'the run linked its story to the card').toHaveLength(1);
      const sid = link[0]!.story_id as string;
      expect(((await ws.ledger()).find((l) => l.point_id === pid) as Row).story_ids, 'the ledger names it before Remove').toEqual([sid]);
      expect((await ws.remove(pid)).data).toMatchObject({ status: 'ok' });
      await ws.state();
      const r = end === 'publish'
        ? await publish(ws)
        : await ok(o.c, 'canvas_draft_discard', { p_draft: ws.draft, p_expected_revision: ws.rev });
      expect(r.status, JSON.stringify(r)).toBe('ok');
      expect((await admin.from('points').select('id').eq('id', pid)).data ?? [], 'the draft-only point is gone').toEqual([]);
      const st = (await admin.from('stories').select('id, content').eq('id', sid)).data as Row[];
      expect(st, `the story survives ${end}`).toHaveLength(1);
      expect(st[0]!.content).toBe(nn(`run story ${end}`));
      expect((await admin.from('story_points').select('point_id').eq('story_id', sid)).data ?? [], 'with no link').toEqual([]);
    }
  }, T);

  it('an add replay after the card was removed does not report it present, writes nothing, and a live card still replays ok', async () => {
    const o = await mkOwner('replay'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'seed')]);
    const cid = randomUUID();
    const add = (rev: number, id: string) => rpc(o.c, 'canvas_draft_add_point', { p_draft: ws.draft, p_box: PROB, p_statement: nn('hand'), p_expected_revision: rev, p_client_id: id });
    const first = (await add(ws.rev, cid)).data;
    expect(first).toMatchObject({ status: 'ok', changed: true });
    await ws.state();
    expect((await add(ws.rev, cid)).data, 'still on the draft: replay ok').toMatchObject({ status: 'ok', changed: false, point_id: first.point_id });
    expect((await ws.remove(first.point_id)).data).toMatchObject({ status: 'ok' });
    await ws.state();
    const revAfter = ws.rev;
    expect((await add(revAfter, cid)).data, 'removed: not reported present').toMatchObject({ status: 'refused', code: 'not_found', revision: revAfter });
    expect((await ws.points()).some((p) => p.id === first.point_id)).toBe(false);
    expect((await ws.state()).draft.revision, 'nothing was written').toBe(revAfter);
    expect((await add(revAfter, randomUUID())).data, 'a fresh save of the same words is a normal add').toMatchObject({ status: 'ok', changed: true });
  }, T);

  it('a stale revision is stale_view and a run going is busy; neither removes anything', async () => {
    const o = await mkOwner('refuse'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'one'), newPt(PROB, 'two')]);
    const one = await ws.idOf('one');
    expect((await ws.remove(one, ws.rev - 1)).data).toMatchObject({ status: 'refused', code: 'stale_view' });
    const r = await ok(o.c, 'canvas_workspace_send', {
      p_canvas: ws.canvas, p_from_version: null, p_expected_draft: ws.draft, p_expected_revision: ws.rev, p_replace: false,
      p_body: nn('queued'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    });
    expect((await ws.remove(one, r.revision)).data).toMatchObject({ status: 'refused', code: 'busy' });
    expect((await ws.points()).map((p) => p.statement).sort()).toEqual([nn('one'), nn('two')].sort());
  }, T);

  it('another signed-in person and a signed-out caller are refused', async () => {
    const o = await mkOwner('owner2'); const x = await mkOwner('other'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'mine')]);
    const mine = await ws.idOf('mine');
    expect((await ws.remove(mine, ws.rev, x.c)).error?.code).toBe('42501');
    expect((await ws.remove(mine, ws.rev, createClient(URL_, ANON, noSession))).error).toBeTruthy();
    expect((await ws.points()).map((p) => p.id)).toEqual([mine]);
  }, T);

  it('a repeat after the point is gone answers not_found (or stale_view on the old revision) and writes nothing', async () => {
    const o = await mkOwner('repeat'); const ws = new WS(o);
    await ws.cycle([newPt(SEG, 'a'), newPt(PROB, 'b')]);
    const b = await ws.idOf('b');
    const used = ws.rev;
    expect((await ws.remove(b)).data).toMatchObject({ status: 'ok' });
    await ws.state();
    const revAfter = ws.rev;
    expect((await ws.remove(b, used)).data, 'the lost-answer repeat on the old revision').toMatchObject({ status: 'refused', code: 'stale_view' });
    expect((await ws.remove(b, revAfter)).data).toMatchObject({ status: 'refused', code: 'not_found', revision: revAfter });
    expect((await ws.remove(randomUUID(), revAfter)).data).toMatchObject({ status: 'refused', code: 'not_found' });
    expect((await ws.state()).draft.revision, 'nothing was written').toBe(revAfter);
  }, T);
});
