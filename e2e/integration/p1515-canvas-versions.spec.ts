/**
 * @file p1515-canvas-versions.spec.ts
 * @description P1515 phase 5 against the TEST database: ONE canvas, MANY versions. The canvas owns the audience, the
 * general access and the link; a version is a set of points (the `canvas_<name>` tag) that belongs to one canvas.
 * Sharing the canvas once reaches every version, past and future.
 *
 * Actors: owner O, person P (a witness of O), event attendee X, group member M, link holder S (signed in), V (signed out),
 * stranger N. Versions: v1 (the canvas's own name = its address), v2, then v3 added AFTER the shares.
 * Every refusal has a control that shows the same call succeeding for someone who must succeed.
 *
 * Runs: npx playwright test --project=integration e2e/integration/p1515-canvas-versions.spec.ts --workers=1
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from '../helpers/test-organization';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Canvas = { points: Row[]; stories: Row[]; positions: Row[]; visibility: string | null; access: Row };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `p1515ver${RUN}`;
const V1 = `p1515ver${RUN}`.toLowerCase(); // the canvas's own name: its address
const V2 = `${V1}two`;
const V3 = `${V1}three`;
const OTHER = `${V1}other`; // a second, separate canvas of the same owner
const DAY = 86_400_000;

const bare = () => createClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
async function signIn(u: TestUser): Promise<SupabaseClient> {
  const { data, error } = await bare().auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`[P1515] sign-in failed for ${u.name}: ${error?.message}`);
  return createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

let O: TestUser, P: TestUser, X: TestUser, M: TestUser, S: TestUser, N: TestUser, H: TestUser;
let cO: SupabaseClient, cP: SupabaseClient, cX: SupabaseClient, cM: SupabaseClient, cS: SupabaseClient, cN: SupabaseClient;
const V = bare(); // signed out
let E: TestEvent;
let G: TestOrganization;
let p1a: string, p1b: string, p2a: string, p3a: string, pOther: string;
let canvasId = '';

const users: TestUser[] = [];
const events: TestEvent[] = [];
const pointIds: string[] = [];
async function mkUser(label: string): Promise<TestUser> {
  const u = await createTestUser({ name: `P1515 ${label} ${RUN}` });
  users.push(u);
  return u;
}
async function mkPoint(owner: string, label: string, version: string, box = 'canvas:problem'): Promise<string> {
  const { data, error } = await supabaseAdmin.from('points').insert({
    statement: `${TAG} ${label}`, first_validator_id: owner, visibility: 'private', tags: [TAG], system_tags: [`canvas_${version}`, box],
  }).select('id').single();
  if (error) throw new Error(`mkPoint ${label}: ${error.message}`);
  pointIds.push(data.id);
  return data.id as string;
}
/** A version is added by the service role (the seed script, later the mirror agent): there is no client function for it. */
async function addVersion(canvasId: string, name: string, createdAt: Date) {
  const { error } = await supabaseAdmin.from('canvas_versions').insert({ canvas_id: canvasId, owner_id: O.user.id, name, created_at: createdAt.toISOString() });
  if (error) throw new Error(`addVersion ${name}: ${error.message}`);
}
async function rpc(c: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<{ data: any; error: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return c.rpc(fn, args);
}
async function ok<T = any>(c: SupabaseClient, fn: string, args: Record<string, unknown>, what: string): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await rpc(c, fn, args);
  if (error) throw new Error(`${what}: ${fn} failed: ${error.message}`);
  return data as T;
}


/** get_canvas, optionally on one version; `token` is the link token of the address */
const get = (c: SupabaseClient, version: string | null = null, token: string | null = null, name = V1) =>
  ok<Canvas>(c, 'get_canvas', { p_owner: O.user.id, p_name: name, p_link_token: token, p_version: version }, `read ${name}@${version ?? 'newest'}`);
const ids = (c: Canvas) => c.points.map(p => p.id as string).sort();
function expectNothing(c: Canvas, who: string) {
  expect(c.points, `${who}: no points`).toEqual([]);
  expect(c.stories, `${who}: no stories`).toEqual([]);
  expect(c.positions, `${who}: no positions`).toEqual([]);
  expect(c.visibility, `${who}: no hint`).toBeNull();
  expect(c.access.admitted, `${who}: not admitted`).toBe(false);
  expect(c.access.versions, `${who}: the versions are not listed to a stranger`).toBeUndefined();
}
const write = (c: SupabaseClient, point: string, token: string | null = null, name = V1) =>
  rpc(c, 'canvas_set_position', { p_owner: O.user.id, p_name: name, p_point: point, p_position: 'agree', p_reasoning: null, p_link_token: token });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  O = await mkUser('O'); P = await mkUser('P'); X = await mkUser('X'); M = await mkUser('M'); S = await mkUser('S'); N = await mkUser('N'); H = await mkUser('H');
  cO = await signIn(O); cP = await signIn(P); cX = await signIn(X); cM = await signIn(M); cS = await signIn(S); cN = await signIn(N);
  p1a = await mkPoint(O.user.id, 'v1 first', V1);
  p1b = await mkPoint(O.user.id, 'v1 second', V1, 'canvas:solution');
  p2a = await mkPoint(O.user.id, 'v2 first', V2);
  pOther = await mkPoint(O.user.id, 'other canvas', OTHER);
  // P witnessed O: the relationship search_profiles (so the invite) is scoped to.
  const w = await supabaseAdmin.from('witnesses').insert({ profile_id: O.user.id, witness_name: `P1515 witness ${RUN}`, witness_profile_id: P.user.id });
  if (w.error) throw new Error(`witness: ${w.error.message}`);
  E = await createTestEvent(H.user.id, new Date(Date.now() - 2 * DAY), { title: `P1515 versions event ${RUN}` });
  events.push(E);
  for (const u of [O, X]) {
    const r = await supabaseAdmin.from('event_rsvps').insert({ event_id: E.id, profile_id: u.user.id, rsvped_at: new Date(Date.now() - 4 * DAY).toISOString() });
    if (r.error) throw new Error(`rsvp: ${r.error.message}`);
  }
  G = await createTestOrganization({ name: `P1515 versions group ${RUN}`, visibility: 'public' });
  for (const u of [O, M]) await createTestMembership(G.id, u.user.id);
});

test.afterAll(async () => {
  test.setTimeout(300_000);
  const { data: pts } = await supabaseAdmin.from('points').select('id').contains('tags', [TAG]);
  const all = [...new Set([...(pts ?? []).map(p => p.id as string), ...pointIds])];
  await supabaseAdmin.from('canvases').delete().eq('owner_id', O?.user.id ?? '00000000-0000-0000-0000-000000000000');
  if (all.length) {
    await supabaseAdmin.from('story_points').delete().in('point_id', all);
    await supabaseAdmin.from('point_positions').delete().in('point_id', all);
    await supabaseAdmin.from('points').delete().in('id', all);
  }
  await supabaseAdmin.from('stories').delete().like('content', `${TAG}%`);
  if (O) await supabaseAdmin.from('witnesses').delete().eq('profile_id', O.user.id);
  if (G) await deleteTestOrganization(G.id);
  for (const e of events) await deleteTestEvent(e.id);
  for (const u of users) await deleteTestUser(u.user.id);
});

test('AC1: O shares the canvas ONCE with person P: P reads both versions and switches; a third version added afterwards needs no new share', async () => {
  // CONTROL: before any share P reads nothing, on either version.
  expectNothing(await get(cP, V1), 'P before the share (v1)');
  expect(await ok(cO, 'share_canvas', { p_name: V1, p_kind: 'person', p_target: P.user.id }, 'share with P')).toBe(true);
  const rec = await supabaseAdmin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', V1).single();
  canvasId = rec.data!.id as string;
  // The canvas record created its own first version.
  const first = await supabaseAdmin.from('canvas_versions').select('name').eq('canvas_id', canvasId);
  expect(first.data, 'a new canvas has its own name as its first version').toEqual([{ name: V1 }]);
  await addVersion(canvasId, V2, new Date(Date.now() + 1_000));

  expect(ids(await get(cP, V1)), 'P reads v1').toEqual([p1a, p1b].sort());
  expect(ids(await get(cP, V2)), 'P reads v2 with the same single share').toEqual([p2a]);

  // A third version, added AFTER the share: readable at once, nothing shared again.
  await addVersion(canvasId, V3, new Date(Date.now() + 2_000));
  p3a = await mkPoint(O.user.id, 'v3 first', V3);
  expect(ids(await get(cP, V3)), 'P reads v3 with no new share').toEqual([p3a]);
  // The audience still has exactly the one person entry.
  const aud = await ok<{ entries: Row[] }>(cO, 'get_canvas_audience', { p_name: V1 }, 'audience');
  expect(aud.entries.map(e => e.kind)).toEqual(['person']);
});

test('AC2: with no version the NEWEST opens; a named older one opens that; the first version\'s address still opens; versions are listed newest first', async () => {
  const newest = await get(cP);
  expect(ids(newest), 'no version: the newest (v3)').toEqual([p3a]);
  expect(newest.access.version).toBe(V3);
  expect(newest.access.versions.map((v: Row) => v.name), 'newest first').toEqual([V3, V2, V1]);
  expect(ids(await get(cP, V1)), 'an older version by name').toEqual([p1a, p1b].sort());
  expect((await get(cP, V1)).access.version).toBe(V1);
  // The address copied before phase 5 (the canvas name, no version) still opens: it is the canvas's address.
  expect(ids(await get(cP, null, null, V1))).toEqual([p3a]);
  // The owner sees the same list; a later version's name also finds the canvas (the address of a version).
  expect((await get(cO)).access.versions.map((v: Row) => v.name)).toEqual([V3, V2, V1]);
  expect(ids(await get(cP, null, null, V2)), 'a version name finds its canvas').toEqual([p3a]);
  // CONTROL: the list is the admitted's alone.
  expectNothing(await get(cN), 'N');
});

test('AC3: the link, an event and a group admit EVERY version; closing the link or removing an entry ends every version on the next request', async () => {
  // the link
  const opened = await ok<{ link_token: string }>(cO, 'set_canvas_general_access', { p_name: V1, p_access: 'link' }, 'open the link');
  const token = opened.link_token;
  for (const [who, c] of [['S (signed in)', cS], ['V (signed out)', V]] as const) {
    expect(ids(await get(c, V1, token)), `${who} v1`).toEqual([p1a, p1b].sort());
    expect(ids(await get(c, V2, token)), `${who} v2`).toEqual([p2a]);
    expect(ids(await get(c, V3, token)), `${who} v3`).toEqual([p3a]);
    expect(ids(await get(c, null, token)), `${who} no version: the newest`).toEqual([p3a]);
    expectNothing(await get(c, V2, null), `${who} v2 without the token`);
  }
  // an event and a group
  expect(await ok(cO, 'share_canvas', { p_name: V1, p_kind: 'event', p_target: E.id }, 'share event')).toBe(true);
  expect(await ok(cO, 'share_canvas', { p_name: V1, p_kind: 'group', p_target: G.id }, 'share group')).toBe(true);
  for (const [who, c] of [['X (event)', cX], ['M (group)', cM]] as const) {
    for (const [v, want] of [[V1, [p1a, p1b].sort()], [V2, [p2a]], [V3, [p3a]]] as const) expect(ids(await get(c, v)), `${who} ${v}`).toEqual(want);
  }
  // removing the event entry ends X on every version; the group keeps M
  expect(await ok(cO, 'unshare_canvas', { p_name: V1, p_kind: 'event', p_target: E.id }, 'unshare event')).toBe(true);
  for (const v of [V1, V2, V3]) expectNothing(await get(cX, v), `X ${v} after the event entry went`);
  expect(ids(await get(cM, V2)), 'CONTROL: M still reads v2').toEqual([p2a]);
  // closing the link ends S and V on every version
  await ok(cO, 'set_canvas_general_access', { p_name: V1, p_access: 'restricted' }, 'close the link');
  for (const [who, c] of [['S', cS], ['V', V]] as const) for (const v of [V1, V2, V3, null]) expectNothing(await get(c, v, token), `${who} ${v ?? 'newest'} after closing`);
  expect(ids(await get(cP, V3)), 'CONTROL: P (a person entry) is unaffected').toEqual([p3a]);
});

test('AC4: positions and added stories are per version; a write on a version of a canvas the caller is not admitted to is refused', async () => {
  // P takes a position on a v2 point and adds a story there: both are v2's, shown nowhere else.
  expect((await write(cP, p2a)).error, 'P writes on v2 through the canvas address').toBeNull();
  const story = await ok<string>(cP, 'canvas_add_story', { p_owner: O.user.id, p_name: V1, p_point: p2a, p_content: `${TAG} P story on v2`, p_link_token: null }, 'P story');
  const v2 = await get(cO, V2);
  expect(v2.positions.map(p => p.user_id), 'v2 shows P\'s position').toContain(P.user.id);
  expect(v2.stories.filter(s => s.added).map(s => s.story_id)).toEqual([story]);
  for (const v of [V1, V3]) {
    const other = await get(cO, v);
    expect(other.positions.map(p => p.user_id), `${v} does not show it`).not.toContain(P.user.id);
    expect(other.stories.filter(s => s.added), `${v} has no added story`).toEqual([]);
  }
  // refused to someone the canvas does not admit, on every version's point
  for (const [what, c] of [['N', cN], ['X (entry removed)', cX], ['S (link closed)', cS]] as const) {
    for (const p of [p1a, p2a, p3a]) {
      const r = await write(c, p);
      expect(r.error, `${what} may not write on ${p}`).not.toBeNull();
    }
    const a = await rpc(c, 'canvas_add_story', { p_owner: O.user.id, p_name: V1, p_point: p2a, p_content: `${TAG} sneaks in`, p_link_token: null });
    expect(a.error, `${what} may not add a story`).not.toBeNull();
  }
  expect((await write(V, p2a)).error, 'V (signed out)').not.toBeNull();
  // a point of ANOTHER canvas cannot be written through this canvas
  expect((await write(cP, pOther)).error, 'a point of another canvas').not.toBeNull();
  const stray = await supabaseAdmin.from('stories').select('id').like('content', `${TAG} sneaks in`);
  expect(stray.data).toEqual([]);
});

test('AC5: a canvas with ONE version behaves exactly as before (same address, same rows, the version list names it)', async () => {
  expect(await ok(cO, 'share_canvas', { p_name: OTHER, p_kind: 'person', p_target: P.user.id }, 'share the other canvas')).toBe(true);
  const c = await get(cP, null, null, OTHER);
  expect(ids(c)).toEqual([pOther]);
  expect(c.access.version).toBe(OTHER);
  expect(c.access.versions.map((v: Row) => v.name)).toEqual([OTHER]);
  expect(ids(await get(cP, OTHER, null, OTHER))).toEqual([pOther]);
  expectNothing(await get(cN, null, null, OTHER), 'N on the other canvas');
});

test('AC6: a version name that belongs to no canvas the viewer can read returns the SAME empty shape as a stranger gets today', async () => {
  const reference = JSON.stringify(await get(cN, null, null, V1)); // a stranger on a real canvas: the empty shape
  const answers = [
    ['P, a version that does not exist', await get(cP, `${V1}nosuch`)],
    ['P, a version of the OTHER canvas asked on this canvas', await get(cP, OTHER)],
    ['P, an unknown canvas name', await get(cP, null, null, `${V1}nocanvas`)],
    ['O, a version that does not exist', await get(cO, `${V1}nosuch`)],
    ['N, a real version', await get(cN, V2)],
    ['V, a real version', await get(V, V2)],
    ['N, a version name of the canvas (as the address)', await get(cN, null, null, V2)],
  ] as const;
  for (const [who, a] of answers) {
    expect(JSON.stringify(a), `${who}: the same bytes as the empty shape`).toBe(reference);
    expectNothing(a, who);
  }
  // CONTROL: the owner reads a real version of the same canvas through the same call.
  expect(ids(await get(cO, V2))).toEqual([p2a]);
});

test('a version name belongs to ONE canvas: a canvas cannot take the name of another canvas\'s version, and a version cannot repeat one', async () => {
  const clash = await rpc(cO, 'set_canvas_general_access', { p_name: V2, p_access: 'link' });
  expect(clash.error, 'v2 is a version of the first canvas: it cannot become a canvas of its own').not.toBeNull();
  const dup = await supabaseAdmin.from('canvas_versions').insert({ canvas_id: canvasId, owner_id: O.user.id, name: V2 });
  expect(dup.error, 'a repeated version name is refused').not.toBeNull();
  // the closed table: no client reads or writes versions directly
  const direct = await cO.from('canvas_versions').select('name');
  expect(direct.error ?? (direct.data ?? []).length === 0, 'clients have no access to the table').toBeTruthy();
});

test('a version row cannot name an owner other than the canvas\'s own (the pair is a foreign key)', async () => {
  const foreign = await supabaseAdmin.from('canvas_versions').insert({ canvas_id: canvasId, owner_id: P.user.id, name: `${V1}foreign` });
  expect(foreign.error, 'B\'s version name cannot be mapped onto A\'s canvas').not.toBeNull();
  // CONTROL: the canvas's own owner is accepted (and the row removed again).
  const own = await supabaseAdmin.from('canvas_versions').insert({ canvas_id: canvasId, owner_id: O.user.id, name: `${V1}own` });
  expect(own.error, 'the real owner is accepted').toBeNull();
  await supabaseAdmin.from('canvas_versions').delete().eq('canvas_id', canvasId).eq('name', `${V1}own`);
});

test('a point is on at most ONE version of a canvas: a second version tag of the same canvas is refused, on insert, on update and when a version is added', async () => {
  // update: p1a is on v1; the v2 tag would put it on two versions of the same canvas
  const upd = await supabaseAdmin.from('points').update({ system_tags: [`canvas_${V1}`, `canvas_${V2}`, 'canvas:problem'] }).eq('id', p1a);
  expect(upd.error, 'tagging a v1 point with the v2 tag is refused').not.toBeNull();
  // insert
  const ins = await supabaseAdmin.from('points').insert({ statement: `${TAG} two tags`, first_validator_id: O.user.id, visibility: 'private', tags: [TAG], system_tags: [`canvas_${V1}`, `canvas_${V3}`, 'canvas:problem'] });
  expect(ins.error, 'a new point with two versions of one canvas is refused').not.toBeNull();
  // a version added later over a point already tagged with its name and another version's
  const both = await mkPoint(O.user.id, 'both tags', V1);
  const tagFirst = await supabaseAdmin.from('points').update({ system_tags: [`canvas_${V1}`, `canvas_${V1}fresh`, 'canvas:problem'] }).eq('id', both);
  expect(tagFirst.error, 'a name that is not a version yet may be tagged').toBeNull();
  const late = await supabaseAdmin.from('canvas_versions').insert({ canvas_id: canvasId, owner_id: O.user.id, name: `${V1}fresh` });
  expect(late.error, 'adding the version would put that point on two versions').not.toBeNull();
  // CONTROLS: a point of another canvas plus this canvas's tag is fine; an unchanged point updates fine; the data is intact
  const cross = await supabaseAdmin.from('points').update({ system_tags: [`canvas_${V1}`, `canvas_${OTHER}`, 'canvas:problem'] }).eq('id', both);
  expect(cross.error, 'tags of two DIFFERENT canvases are allowed').toBeNull();
  const same = await supabaseAdmin.from('points').update({ statement: `${TAG} v1 first` }).eq('id', p1a);
  expect(same.error, 'an ordinary update of a canvas point still works').toBeNull();
  expect(ids(await get(cO, V1)), 'v1 still reads the same points (plus the extra point)').toEqual([p1a, p1b, both].sort());
  expect(ids(await get(cO, V2))).toEqual([p2a]);
});

test('a version row is immutable: its canvas, owner and name cannot change (a rename or a move would dodge the one-version-per-point check)', async () => {
  const before = await supabaseAdmin.from('canvas_versions').select('name,canvas_id,owner_id').eq('canvas_id', canvasId).eq('name', V3).single();
  expect(before.data).toBeTruthy();
  const rename = await supabaseAdmin.from('canvas_versions').update({ name: `${V3}renamed` }).eq('canvas_id', canvasId).eq('name', V3);
  expect(rename.error, 'a rename is refused').not.toBeNull();
  const move = await supabaseAdmin.from('canvas_versions').update({ canvas_id: (await supabaseAdmin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', OTHER).single()).data!.id }).eq('canvas_id', canvasId).eq('name', V3);
  expect(move.error, 'moving a version to another canvas is refused').not.toBeNull();
  const owner = await supabaseAdmin.from('canvas_versions').update({ owner_id: P.user.id }).eq('canvas_id', canvasId).eq('name', V3);
  expect(owner.error, 'changing the owner is refused').not.toBeNull();
  const after = await supabaseAdmin.from('canvas_versions').select('name,canvas_id,owner_id').eq('canvas_id', canvasId).eq('name', V3).single();
  expect(after.data, 'the row is unchanged').toEqual(before.data);
  // CONTROL: a change that touches none of the three is accepted.
  const touch = await supabaseAdmin.from('canvas_versions').update({ created_at: new Date(Date.now() + 5_000).toISOString() }).eq('canvas_id', canvasId).eq('name', V3);
  expect(touch.error, 'created_at may change').toBeNull();
});

test('handing a point to the owner of the canvas re-runs the one-version check (first_validator_id changes, system_tags does not)', async () => {
  // A point of P's carrying two tags that are NOT versions for P: allowed.
  const { data, error } = await supabaseAdmin.from('points').insert({ statement: `${TAG} handed over`, first_validator_id: P.user.id, visibility: 'private', tags: [TAG], system_tags: [`canvas_${V1}`, `canvas_${V2}`, 'canvas:problem'] }).select('id').single();
  expect(error, 'for another owner these are not versions of one canvas').toBeNull();
  pointIds.push(data!.id as string);
  const handover = await supabaseAdmin.from('points').update({ first_validator_id: O.user.id }).eq('id', data!.id);
  expect(handover.error, 'under the canvas owner the point would be on two versions: refused').not.toBeNull();
  // CONTROL: a point with one version tag changes hands freely.
  const one = await supabaseAdmin.from('points').insert({ statement: `${TAG} handed one`, first_validator_id: P.user.id, visibility: 'private', tags: [TAG], system_tags: [`canvas_${V1}`, 'canvas:problem'] }).select('id').single();
  pointIds.push(one.data!.id as string);
  expect((await supabaseAdmin.from('points').update({ first_validator_id: O.user.id }).eq('id', one.data!.id)).error).toBeNull();
});
