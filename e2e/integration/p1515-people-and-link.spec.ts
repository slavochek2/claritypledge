/**
 * @file p1515-people-and-link.spec.ts
 * @description P1515 phase 3 against the TEST database (migration 20261021200000): share a canvas with
 * ONE PERSON, and open it to ANYONE WITH THE LINK.
 *
 * Actors: owner O, person P (a witness of O, so search_profiles would return P to O), unrelated X,
 * signed-in stranger S, signed-out V, and the event host H.
 *
 * Every "refused / sees nothing" assertion has a control that shows the same call succeeding for the
 * case that must succeed. Nothing here mutates shared database objects: every row is created by this
 * run under a per-run marker and removed in afterAll.
 *
 * Runs: npx playwright test --project=integration e2e/integration/p1515-people-and-link.spec.ts --workers=1
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
const TAG = `p1515pl${RUN}`;
const NAME = `p1515pl${RUN}`.toLowerCase();
const CANVAS_TAG = `canvas_${NAME}`;
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

const users: TestUser[] = [];
const events: TestEvent[] = [];
const pointIds: string[] = [];
async function mkUser(label: string): Promise<TestUser> {
  const u = await createTestUser({ name: `P1515 ${label} ${RUN}` });
  users.push(u);
  return u;
}
async function mkPoint(owner: string, label: string, systemTags: string[]): Promise<string> {
  const { data, error } = await supabaseAdmin.from('points').insert({
    statement: `${TAG} ${label}`, first_validator_id: owner, visibility: 'private', tags: [TAG], system_tags: systemTags,
  }).select('id').single();
  if (error) throw new Error(`mkPoint ${label}: ${error.message}`);
  pointIds.push(data.id);
  return data.id as string;
}

async function rpc(c: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<{ data: any; error: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return c.rpc(fn, args);
}
async function ok<T = any>(c: SupabaseClient, fn: string, args: Record<string, unknown>, what: string): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await rpc(c, fn, args);
  if (error) throw new Error(`${what}: ${fn} failed: ${error.message}`);
  return data as T;
}
async function refused(c: SupabaseClient, fn: string, args: Record<string, unknown>, what: string) {
  const { error } = await rpc(c, fn, args);
  expect(error, `${what}: refused`).not.toBeNull();
  return error as { code?: string; message: string };
}

let O: TestUser, P: TestUser, X: TestUser, S: TestUser, H: TestUser;
let cO: SupabaseClient, cP: SupabaseClient, cX: SupabaseClient, cS: SupabaseClient;
const V = bare(); // signed out
let pA: string, pB: string;
let E: TestEvent;
let Z: TestUser; // an outsider (phase 3b)
let G: TestOrganization;
const NAME2 = `${NAME}b`;

const getCanvas = (c: SupabaseClient, name = NAME) => ok<Canvas>(c, 'get_canvas', { p_owner: O.user.id, p_name: name }, 'read canvas');
/** a read that carries a link token (the `?k=` of the address); owner and name overridable for the "no such canvas" controls */
const getWithToken = (c: SupabaseClient, token: string | null, name = NAME, owner = O.user.id) =>
  ok<Canvas>(c, 'get_canvas', { p_owner: owner, p_name: name, p_link_token: token }, 'read canvas with a token');
/** the owner's current link token (only the owner's audience function returns it) */
const currentToken = async () => (await ok<{ link_token: string | null }>(cO, 'get_canvas_audience', { p_name: NAME }, 'audience')).link_token;
const write = (c: SupabaseClient, token: string | null, position = 'agree') =>
  rpc(c, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: pA, p_position: position, p_reasoning: null, p_link_token: token });
const ptIds = (c: Canvas) => c.points.map(p => p.id as string).sort();
function expectNothing(c: Canvas, who: string) {
  expect(c.points, `${who}: no points`).toEqual([]);
  expect(c.stories, `${who}: no stories`).toEqual([]);
  expect(c.positions, `${who}: no positions`).toEqual([]);
  expect(c.visibility, `${who}: no hint`).toBeNull();
  expect(c.access.admitted, `${who}: not admitted`).toBe(false);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  O = await mkUser('O'); P = await mkUser('P'); X = await mkUser('X'); S = await mkUser('S'); H = await mkUser('H');
  cO = await signIn(O); cP = await signIn(P); cX = await signIn(X); cS = await signIn(S);
  pA = await mkPoint(O.user.id, 'first bet', [CANVAS_TAG, 'canvas:problem']);
  pB = await mkPoint(O.user.id, 'second bet', [CANVAS_TAG, 'canvas:solution']);
  const story = await supabaseAdmin.from('stories').insert({ content: `${TAG} owner story`, author_id: O.user.id, visibility: 'private' }).select('id').single();
  if (story.error) throw new Error(`story: ${story.error.message}`);
  const link = await supabaseAdmin.from('story_points').insert({ story_id: story.data.id, point_id: pA, author_id: O.user.id });
  if (link.error) throw new Error(`link: ${link.error.message}`);
  const pos = await supabaseAdmin.from('point_positions').insert({ point_id: pA, user_id: O.user.id, position: 'agree' });
  if (pos.error) throw new Error(`position: ${pos.error.message}`);
  // P witnessed O: the relationship search_profiles (and so the invite field) is scoped to.
  const w = await supabaseAdmin.from('witnesses').insert({ profile_id: O.user.id, witness_name: `P1515 witness ${RUN}`, witness_profile_id: P.user.id });
  if (w.error) throw new Error(`witness: ${w.error.message}`);
  E = await createTestEvent(H.user.id, new Date(Date.now() - 2 * DAY), { title: `P1515 people event ${RUN}` });
  events.push(E);
  Z = await mkUser('Z');
  G = await createTestOrganization({ name: `P1515 3b group ${RUN}`, visibility: 'public' });
  for (const u of [O, P, X, S]) await createTestMembership(G.id, u.user.id);
  for (const u of [O, X]) {
    const r = await supabaseAdmin.from('event_rsvps').insert({ event_id: E.id, profile_id: u.user.id, rsvped_at: new Date(Date.now() - 4 * DAY).toISOString() });
    if (r.error) throw new Error(`rsvp: ${r.error.message}`);
  }
});

test.afterAll(async () => {
  test.setTimeout(300_000);
  const { data: pts } = await supabaseAdmin.from('points').select('id').contains('tags', [TAG]);
  const ids = [...new Set([...(pts ?? []).map(p => p.id as string), ...pointIds])];
  await supabaseAdmin.from('canvases').delete().eq('owner_id', O?.user.id ?? '00000000-0000-0000-0000-000000000000');
  if (ids.length) {
    await supabaseAdmin.from('story_points').delete().in('point_id', ids);
    await supabaseAdmin.from('point_positions').delete().in('point_id', ids);
    await supabaseAdmin.from('points').delete().in('id', ids);
  }
  await supabaseAdmin.from('stories').delete().like('content', `${TAG}%`);
  if (O) await supabaseAdmin.from('witnesses').delete().eq('profile_id', O.user.id);
  if (G) await deleteTestOrganization(G.id);
  for (const e of events) await deleteTestEvent(e.id);
  for (const u of users) await deleteTestUser(u.user.id);
});

test('before anything is shared: P, X, S and V all get nothing (the controls for every grant below)', async () => {
  for (const [who, c] of [['P', cP], ['X', cX], ['S', cS], ['V (signed out)', V]] as const) expectNothing(await getCanvas(c), who);
  // CONTROL: the owner reads the same canvas through the same function.
  expect(ptIds(await getCanvas(cO))).toEqual([pA, pB].sort());
});

test('a person: O adds P; P reads everything, takes a position, adds a story; X (not added) does none of it', async () => {
  await ok(cO, 'share_canvas', { p_name: NAME, p_kind: 'person', p_target: P.user.id }, 'share with P');
  const read = await getCanvas(cP);
  expect(ptIds(read)).toEqual([pA, pB].sort());
  expect(read.stories.map(s => s.story.content)).toContain(`${TAG} owner story`);
  expect(read.positions.map(p => p.user_id)).toContain(O.user.id);
  expect(read.access).toMatchObject({ admitted: true, is_owner: false, general_access: 'restricted' });
  // the reader line names the OWNER: "Shared with you by <owner>"
  expect(read.access.via).toMatchObject({ kind: 'person', id: P.user.id, name: O.name });
  expect(read.visibility).toBe('shared');

  await ok(cP, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: pB, p_position: 'disagree', p_reasoning: null }, 'P position');
  const story = await ok<string>(cP, 'canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: pB, p_content: `${TAG} P story` }, 'P story');
  expect(story).toBeTruthy();
  const after = await getCanvas(cO);
  expect(after.positions.filter(p => p.user_id === P.user.id).map(p => p.position)).toEqual(['disagree']);
  expect(after.stories.filter(s => s.added).map(s => s.story.content)).toEqual([`${TAG} P story`]);

  // X is not added: nothing to read, nothing to write.
  expectNothing(await getCanvas(cX), 'X');
  expect((await refused(cX, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: pB, p_position: 'agree', p_reasoning: null }, 'X position')).code).toBe('42501');
  expect((await refused(cX, 'canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: pB, p_content: 'x' }, 'X story')).code).toBe('42501');
});

test('the audience lists the person (people first), and general access reads restricted', async () => {
  await ok(cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: E.id }, 'share with the event');
  const aud = await ok<{ entries: Row[]; general_access: string }>(cO, 'get_canvas_audience', { p_name: NAME }, 'audience');
  expect(aud.general_access).toBe('restricted');
  expect(aud.entries.map(e => e.kind)).toEqual(['person', 'event']);
  expect(aud.entries[0]).toMatchObject({ id: P.user.id, name: P.name, owner_admitted: true, count: 1 });
  expect(aud.entries[0]!.names).toEqual([{ id: P.user.id, name: P.name, slug: expect.anything() }]);
  await ok(cO, 'unshare_canvas', { p_name: NAME, p_kind: 'event', p_target: E.id }, 'unshare the event');
});

test('only a person search_profiles would return can be added: unrelated, self and unknown are refused; the related one is the control', async () => {
  for (const [what, target] of [['unrelated X', X.user.id], ['the owner themself', O.user.id], ['an unknown id', '00000000-0000-0000-0000-0000000000cc']] as const) {
    expect((await refused(cO, 'share_canvas', { p_name: NAME, p_kind: 'person', p_target: target }, what)).code).toBe('42501');
  }
  // CONTROL: P is related (witness), already added: the call is accepted again without a duplicate.
  await ok(cO, 'share_canvas', { p_name: NAME, p_kind: 'person', p_target: P.user.id }, 'P again');
  const aud = await ok<{ entries: Row[] }>(cO, 'get_canvas_audience', { p_name: NAME }, 'audience');
  expect(aud.entries.filter(e => e.kind === 'person')).toHaveLength(1);
  // only the owner of a canvas can add anyone to it
  expect((await refused(cP, 'share_canvas', { p_name: NAME, p_kind: 'person', p_target: S.user.id }, 'P shares O\'s canvas')).code).toBe('42501');
});

test('removing the person ends access on their next request; O keeps the story P added, nobody else reads it', async () => {
  await ok(cO, 'unshare_canvas', { p_name: NAME, p_kind: 'person', p_target: P.user.id }, 'remove P');
  expectNothing(await getCanvas(cP), 'P after removal');
  expect((await refused(cP, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: pB, p_position: 'agree', p_reasoning: null }, 'P position after removal')).code).toBe('42501');
  const owner = await getCanvas(cO);
  expect(owner.stories.filter(s => s.added).map(s => s.story.content)).toEqual([`${TAG} P story`]); // the owner still sees it
  expect(owner.positions.map(p => p.user_id)).not.toContain(P.user.id); // P's position leaves with their access
});

test('anyone with the link is a TOKEN: the right one admits, a missing or wrong one gets the identical not-found shape; S writes with it, V never', async () => {
  // CONTROL (above): S and V got nothing while restricted. The reference answer a stranger gets:
  const reference = JSON.stringify(await getCanvas(cS));
  const opened = await ok<{ general_access: string; link_token: string }>(cO, 'set_canvas_general_access', { p_name: NAME, p_access: 'link' }, 'open the link');
  const token = await currentToken();
  // the call itself returns the token to the owner (Copy link needs no second read to know it)
  expect(opened).toEqual({ general_access: 'link', link_token: token });
  expect(token, 'a 128-bit random token, as hex').toMatch(/^[0-9a-f]{32}$/);

  // Open alone admits nobody: no token, an empty one, a wrong one, a nonexistent canvas and a nonexistent owner all get the SAME bytes.
  const strangerAnswers = [
    ['S, no token', await getWithToken(cS, null)],
    ['S, empty token', await getWithToken(cS, '')],
    ['S, wrong token', await getWithToken(cS, 'f'.repeat(32))],
    ['S, a prefix of the token', await getWithToken(cS, token!.slice(0, 16))],
    ['S, the token on a canvas that does not exist', await getWithToken(cS, token, 'p1515plnosuchcanvas')],
    ['S, a nonexistent owner', await getWithToken(cS, token, NAME, '00000000-0000-0000-0000-0000000000ee')],
    ['V, no token', await getWithToken(V, null)],
    ['V, wrong token', await getWithToken(V, 'f'.repeat(32))],
  ] as const;
  for (const [who, answer] of strangerAnswers) {
    expect(JSON.stringify(answer), `${who}: the same answer as a closed canvas gives a stranger`).toBe(reference);
    expectNothing(answer, who);
  }
  expect(JSON.stringify(strangerAnswers[0][1])).not.toContain('general_access'); // does not reveal that the canvas is open

  // The right token reads, signed in or out.
  const s = await getWithToken(cS, token);
  expect(ptIds(s)).toEqual([pA, pB].sort());
  expect(s.stories.map(x => x.story.content)).toContain(`${TAG} owner story`);
  expect(s.access).toMatchObject({ admitted: true, is_owner: false, general_access: 'link', via: null });
  expect(s.visibility).toBe('shared');
  expect(JSON.stringify(s), 'the token is never echoed to a reader').not.toContain(token!);
  const v = await getWithToken(V, token);
  expect(ptIds(v)).toEqual([pA, pB].sort());
  expect(v.access).toMatchObject({ admitted: true, general_access: 'link' });

  // S writes ONLY with the token.
  expect((await write(cS, null, 'disagree')).error?.code, 'S without the token').toBe('42501');
  expect((await write(cS, 'f'.repeat(32), 'disagree')).error?.code, 'S with a wrong token').toBe('42501');
  expect((await write(cS, token, 'disagree')).error, 'S with the token').toBeNull();
  expect((await rpc(cS, 'canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: pA, p_content: `${TAG} S refused`, p_link_token: null })).error?.code).toBe('42501');
  await ok(cS, 'canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: pA, p_content: `${TAG} S story`, p_link_token: token }, 'S story');
  expect((await getWithToken(V, token)).positions.map(p => p.user_id), 'V reads what the link\'s readers took').toContain(S.user.id);

  // V reads only: every write function refuses a signed-out caller, even with the valid token.
  for (const [fn, args] of [
    ['canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: pA, p_position: 'agree', p_reasoning: null, p_link_token: token }],
    ['canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: pA, p_content: 'v', p_link_token: token }],
    ['canvas_remove_position', { p_owner: O.user.id, p_name: NAME, p_point: pA, p_link_token: token }],
    ['set_canvas_general_access', { p_name: NAME, p_access: 'restricted' }],
    ['share_canvas', { p_name: NAME, p_kind: 'person', p_target: P.user.id }],
    ['get_canvas_audience', { p_name: NAME }],
  ] as const) {
    await refused(V, fn, args as Record<string, unknown>, `V ${fn}`);
  }
  // Only the owner's audience function returns the token, and only for the owner's own canvas.
  expect((await ok<{ link_token: string | null }>(cS, 'get_canvas_audience', { p_name: NAME }, 'S audience')).link_token).toBeNull();
});

test('while open, none of the canvas rows reach anyone through the ordinary read paths (REST), S and V included', async () => {
  for (const [who, c] of [['S', cS], ['V', V]] as const) {
    const points = await c.from('points').select('id').in('id', [pA, pB]);
    expect(points.data ?? [], `${who}: points`).toEqual([]);
    const links = await c.from('story_points').select('story_id').in('point_id', [pA, pB]);
    expect((links.data ?? []).length, `${who}: links`).toBe(0);
    const stories = await c.from('stories').select('id').like('content', `${TAG}%`);
    expect((stories.data ?? []).length, `${who}: stories`).toBe(who === 'S' ? 1 : 0); // S reads only the story S wrote
    const positions = await c.from('point_positions').select('user_id').in('point_id', [pA, pB]);
    const others = (positions.data ?? []).filter(r => r.user_id !== S.user.id);
    expect(others, `${who}: other people's positions`).toEqual([]);
  }
  // CONTROL: the owner reads their own rows the ordinary way.
  const own = await cO.from('points').select('id').in('id', [pA, pB]);
  expect((own.data ?? []).length).toBe(2);
  // A link canvas is in no list: the event page list stays empty for S.
  expect(await ok(cS, 'list_canvases_shared_with_event', { p_event: E.id }, 'event list')).toEqual([]);
  // Rows never change visibility.
  const rows = await supabaseAdmin.from('points').select('visibility').in('id', [pA, pB]);
  expect((rows.data ?? []).map(r => r.visibility)).toEqual(['private', 'private']);
});

test('switching back to "Only people added" kills the token; reopening makes a NEW one and the old link stays dead', async () => {
  const oldToken = await currentToken();
  expect(oldToken).toBeTruthy();
  expect(await ok(cO, 'set_canvas_general_access', { p_name: NAME, p_access: 'restricted' }, 'close the link')).toEqual({ general_access: 'restricted', link_token: null });
  expect(await currentToken(), 'closing clears the token').toBeNull();
  expectNothing(await getWithToken(cS, oldToken), 'S with the old token after closing');
  expectNothing(await getWithToken(V, oldToken), 'V with the old token after closing');
  expect((await write(cS, oldToken)).error?.code, 'S write with the old token').toBe('42501');
  const owner = await getCanvas(cO);
  expect(owner.stories.filter(s => s.added).map(s => s.story.content).sort()).toEqual([`${TAG} P story`, `${TAG} S story`].sort());
  expect(owner.access.general_access).toBe('restricted');

  // Reopen: a different token; the old one is still dead (stale), the new one works.
  await ok(cO, 'set_canvas_general_access', { p_name: NAME, p_access: 'link' }, 'reopen');
  const newToken = await currentToken();
  expect(newToken).toMatch(/^[0-9a-f]{32}$/);
  expect(newToken).not.toBe(oldToken);
  expectNothing(await getWithToken(cS, oldToken), 'S with the stale token after reopening');
  expectNothing(await getWithToken(V, oldToken), 'V with the stale token after reopening');
  expect((await write(cS, oldToken)).error?.code, 'S write with the stale token').toBe('42501');
  expect(ptIds(await getWithToken(cS, newToken))).toEqual([pA, pB].sort()); // CONTROL: the new link works
  expect((await write(cS, newToken)).error).toBeNull();
  // Asking to open an already open canvas keeps the token (a double click must not kill a shared link).
  await ok(cO, 'set_canvas_general_access', { p_name: NAME, p_access: 'link' }, 'open again');
  expect(await currentToken()).toBe(newToken);

  await ok(cO, 'set_canvas_general_access', { p_name: NAME, p_access: 'restricted' }, 'close for the following tests');
  expectNothing(await getWithToken(cS, newToken), 'S with the new token once closed');
});

test('general access is the owner\'s alone and takes only two values, on a canvas that exists', async () => {
  expect((await refused(cS, 'set_canvas_general_access', { p_name: NAME, p_access: 'link' }, 'S opens O\'s canvas')).code).toBe('42501');
  expect((await refused(cO, 'set_canvas_general_access', { p_name: NAME, p_access: 'everyone' }, 'a third value')).code).toBe('42501');
  expect((await refused(cO, 'set_canvas_general_access', { p_name: 'p1515plnosuchcanvas', p_access: 'link' }, 'a canvas with no points')).code).toBe('42501');
  // CONTROL: the owner and a valid value are accepted (and it stays closed for everyone else).
  expect((await ok<{ general_access: string }>(cO, 'set_canvas_general_access', { p_name: NAME, p_access: 'restricted' }, 'owner, valid')).general_access).toBe('restricted');
  expectNothing(await getCanvas(cS), 'S');
});

test('an event the host cancels stops admitting at once (the owner sees Private again); the control is the same event before', async () => {
  await ok(cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: E.id }, 'share with the event');
  const before = await getCanvas(cX);
  expect(ptIds(before)).toEqual([pA, pB].sort()); // X registered in time
  expect((await getCanvas(cO)).visibility).toBe('shared');
  const was = (await supabaseAdmin.from('events').select('status').eq('id', E.id).single()).data?.status as string;
  const cancelled = await supabaseAdmin.from('events').update({ status: 'cancelled' }).eq('id', E.id);
  expect(cancelled.error, cancelled.error?.message).toBeNull();
  expectNothing(await getCanvas(cX), 'X after the event was cancelled');
  expect((await getCanvas(cO)).visibility, 'no entry admits the owner any more').toBe('private');
  await supabaseAdmin.from('events').update({ status: was }).eq('id', E.id);
});

test('anon can execute get_canvas and nothing else of the canvas surface', async () => {
  const { error } = await rpc(V, 'get_canvas', { p_owner: O.user.id, p_name: NAME });
  expect(error, 'a signed-out read is answered (with the empty shape unless the link is open)').toBeNull();
  for (const [fn, args] of [
    ['get_canvas_share_targets', {}],
    ['list_canvases_shared_with_event', { p_event: E.id }],
    ['canvas_remove_added_story', { p_story: '00000000-0000-0000-0000-0000000000dd' }],
    ['unshare_canvas', { p_name: NAME, p_kind: 'person', p_target: P.user.id }],
  ] as const) {
    await refused(V, fn, args as Record<string, unknown>, `V ${fn}`);
  }
});

test('3b: get_canvas returns exactly the rows a per-row _canvas_can_read would (positions and added stories of several readers, one of them outside)', async () => {
  const q1 = await mkPoint(O.user.id, 'b first', [`canvas_${NAME2}`, 'canvas:problem']);
  const q2 = await mkPoint(O.user.id, 'b second', [`canvas_${NAME2}`, 'canvas:solution']);
  await ok(cO, 'share_canvas', { p_name: NAME2, p_kind: 'person', p_target: P.user.id }, 'person P');
  await ok(cO, 'share_canvas', { p_name: NAME2, p_kind: 'event', p_target: E.id }, 'event E');
  await ok(cO, 'share_canvas', { p_name: NAME2, p_kind: 'group', p_target: G.id }, 'group G');
  // positions of the owner, three admitted readers (person, event, group) and an outsider Z who wrote one directly
  const everyone = [O, P, X, S, Z];
  for (const u of everyone) for (const q of [q1, q2]) {
    const r = await supabaseAdmin.from('point_positions').insert({ point_id: q, user_id: u.user.id, position: 'agree' });
    if (r.error) throw new Error(`position: ${r.error.message}`);
  }
  // added stories: three through the real function; Z's recorded directly (someone who lost access)
  for (const [u, c] of [[P, cP], [X, cX], [S, cS]] as const) {
    await ok(c, 'canvas_add_story', { p_owner: O.user.id, p_name: NAME2, p_point: q1, p_content: `${TAG} 3b story ${u.name}` }, `story ${u.name}`);
  }
  const canvas = (await supabaseAdmin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', NAME2).single()).data!.id as string;
  const zs = await supabaseAdmin.from('stories').insert({ content: `${TAG} 3b story outsider`, author_id: Z.user.id, visibility: 'private' }).select('id').single();
  if (zs.error) throw new Error(`Z story: ${zs.error.message}`);
  const zr = await supabaseAdmin.from('canvas_added_stories').insert({ canvas_id: canvas, point_id: q1, story_id: zs.data.id, author_id: Z.user.id });
  if (zr.error) throw new Error(`Z record: ${zr.error.message}`);

  // The oracle: ask the per-row rule directly (the previous behaviour) for every user who has a row.
  const canRead = async (uid: string) => (await supabaseAdmin.rpc('_canvas_can_read', { p_canvas: canvas, p_uid: uid })).data as boolean;
  const expectedReaders = new Set<string>();
  for (const u of everyone) if (u.user.id === O.user.id || await canRead(u.user.id)) expectedReaders.add(u.user.id);
  expect([...expectedReaders].sort()).toEqual([O, P, X, S].map(u => u.user.id).sort()); // CONTROL: the oracle itself excludes Z

  const asReader = await ok<Canvas>(cX, 'get_canvas', { p_owner: O.user.id, p_name: NAME2 }, 'X reads');
  const posUsers = (c: Canvas) => [...new Set(c.positions.map(p => p.user_id as string))].sort();
  expect(asReader.positions).toHaveLength(8); // 4 people x 2 points
  expect(posUsers(asReader)).toEqual([...expectedReaders].sort());
  expect(asReader.stories.filter(x => x.added).map(x => x.story.author_id as string).sort()).toEqual([P, X, S].map(u => u.user.id).sort());
  const asOwner = await ok<Canvas>(cO, 'get_canvas', { p_owner: O.user.id, p_name: NAME2 }, 'O reads');
  expect(posUsers(asOwner)).toEqual([...expectedReaders].sort());
  // the owner also sees the story of the person who is no longer admitted; readers do not (checked above)
  expect(asOwner.stories.filter(x => x.added).map(x => x.story.author_id as string).sort()).toEqual([P, X, S, Z].map(u => u.user.id).sort());
});

test('3b: the reader line names a direct person entry first, then an event, then a group', async () => {
  const via = async (c: SupabaseClient) => (await ok<Canvas>(c, 'get_canvas', { p_owner: O.user.id, p_name: NAME2 }, 'read')).access.via as Row;
  // P: admitted as a person AND as a member of the group G
  expect(await via(cP)).toMatchObject({ kind: 'person', name: O.name });
  await ok(cO, 'unshare_canvas', { p_name: NAME2, p_kind: 'person', p_target: P.user.id }, 'unshare P');
  expect(await via(cP), 'CONTROL: without the person entry P reads through the group').toMatchObject({ kind: 'group', id: G.id });
  expect(await via(cX), 'CONTROL: X reads through the event before the group').toMatchObject({ kind: 'event', id: E.id });
  // S is only in the group
  expect(await via(cS)).toMatchObject({ kind: 'group', id: G.id });
});

// ---------------------------------------------------------------------------------------------------
// Phase 3d: who counts as a reader of an open link canvas. Only the owner, entries and CURRENT-link
// contributors (people who wrote through the current token); never a direct write, a removed person, or
// someone who wrote through an older link.
// ---------------------------------------------------------------------------------------------------
test('3d: an open canvas shows the rows of the owner, entries and current-link contributors only; a direct write, a removed person and an old link\'s contributor stay hidden', async () => {
  const NAME3 = `${NAME}c`;
  const q = await mkPoint(O.user.id, 'c first', [`canvas_${NAME3}`, 'canvas:problem']);
  const adminPos = async (u: TestUser, position = 'agree') => {
    const r = await supabaseAdmin.from('point_positions').upsert({ point_id: q, user_id: u.user.id, position }, { onConflict: 'point_id,user_id' });
    if (r.error) throw new Error(`position: ${r.error.message}`);
  };
  const read = (c: SupabaseClient, token: string | null) => ok<Canvas>(c, 'get_canvas', { p_owner: O.user.id, p_name: NAME3, p_link_token: token }, 'read');
  const users = (c: Canvas) => [...new Set(c.positions.map(p => p.user_id as string))].sort();
  const sorted = (...us: TestUser[]) => us.map(u => u.user.id).sort();
  const writeFor = (c: SupabaseClient, token: string | null, position: string) =>
    ok(c, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME3, p_point: q, p_position: position, p_reasoning: null, p_link_token: token }, 'write');
  await adminPos(O);

  // P is added as a person, writes, and is then removed: P's rows must stay hidden afterwards, even while the link is open.
  await ok(cO, 'share_canvas', { p_name: NAME3, p_kind: 'person', p_target: P.user.id }, 'add P');
  await writeFor(cP, null, 'disagree');
  expect(users(await read(cX, null)), 'X without a token sees nothing').toEqual([]);
  expect(users(await read(cP, null)), 'CONTROL: while P is an entry, P\'s row shows').toEqual(sorted(O, P));
  await ok(cO, 'unshare_canvas', { p_name: NAME3, p_kind: 'person', p_target: P.user.id }, 'remove P');

  // Open the link: T1. S contributes through it; Z has a DIRECT position (never wrote through a function).
  const t1 = (await ok<{ link_token: string }>(cO, 'set_canvas_general_access', { p_name: NAME3, p_access: 'link' }, 'open T1')).link_token;
  await writeFor(cS, t1, 'agree');
  await adminPos(Z, 'disagree');
  const open1 = await read(cX, t1);
  expect(users(open1), 'owner + the current contributor only').toEqual(sorted(O, S));
  expect(users(open1)).not.toContain(Z.user.id); // a direct write never shows
  expect(users(open1)).not.toContain(P.user.id); // the removed person stays hidden while the link is open
  // the owner's own view applies the same rule
  expect(users(await read(cO, null))).toEqual(sorted(O, S));

  // Closing the link hides the old contributor from everyone (the owner too); the owner keeps nothing of S's position.
  await ok(cO, 'set_canvas_general_access', { p_name: NAME3, p_access: 'restricted' }, 'close');
  expect(users(await read(cO, null)), 'closed: S\'s position is hidden').toEqual(sorted(O));

  // Reopen: T2. S wrote through T1, so S's row stays hidden until S writes through T2; a reader holding T2 sees only the owner.
  const t2 = (await ok<{ link_token: string }>(cO, 'set_canvas_general_access', { p_name: NAME3, p_access: 'link' }, 'open T2')).link_token;
  expect(t2).not.toBe(t1);
  expect(users(await read(cX, t2)), 'old-link contributor hidden after the reopen').toEqual(sorted(O));
  await writeFor(cS, t2, 'disagree');
  expect(users(await read(cX, t2)), 'CONTROL: a current-token contributor shows').toEqual(sorted(O, S));
  // the stale token reads nothing at all
  expect(users(await read(cX, t1))).toEqual([]);

  // Equivalence on an OPEN canvas: get_canvas returns exactly the rows the per-person rules give.
  const canvasId = (await supabaseAdmin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', NAME3).single()).data!.id as string;
  const expected = new Set<string>();
  for (const u of [O, P, S, Z, X]) {
    const can = (await supabaseAdmin.rpc('_canvas_can_read', { p_canvas: canvasId, p_uid: u.user.id })).data as boolean;
    const contributor = (await supabaseAdmin.rpc('_canvas_link_contributor_current', { p_canvas: canvasId, p_uid: u.user.id })).data as boolean;
    if (u.user.id === O.user.id || can || contributor) expected.add(u.user.id);
  }
  await adminPos(X, 'agree'); // X has a direct row too: not a reader, not shown
  expect(users(await read(cX, t2))).toEqual([...expected].filter(id => [O, S].some(u => u.user.id === id)).sort());
  expect([...expected].sort(), 'the oracle itself: owner and S (contributor), nobody else').toEqual(sorted(O, S));
  await ok(cO, 'set_canvas_general_access', { p_name: NAME3, p_access: 'restricted' }, 'close for the following tests');
});

test('3d: an owner can always CLOSE the link, even on a canvas with no current points; OPENING it still needs one', async () => {
  const NAME4 = `${NAME}d`;
  const q = await mkPoint(O.user.id, 'd first', [`canvas_${NAME4}`, 'canvas:problem']);
  const opened = await ok<{ link_token: string }>(cO, 'set_canvas_general_access', { p_name: NAME4, p_access: 'link' }, 'open');
  expect(opened.link_token).toMatch(/^[0-9a-f]{32}$/);
  // CONTROL: someone else asking to close changes nothing of the owner's canvas (their own name has no such canvas)
  await ok(cS, 'set_canvas_general_access', { p_name: NAME4, p_access: 'restricted' }, 'S closes');
  expect((await supabaseAdmin.from('canvases').select('general_access, link_token').eq('owner_id', O.user.id).eq('name', NAME4).single()).data)
    .toEqual({ general_access: 'link', link_token: opened.link_token });
  // the canvas loses its last point (the owner deleted it)
  const del = await supabaseAdmin.from('points').delete().eq('id', q);
  expect(del.error, del.error?.message).toBeNull();
  expect((await refused(cO, 'set_canvas_general_access', { p_name: NAME4, p_access: 'link' }, 'open without points')).code).toBe('42501');
  expect(await ok(cO, 'set_canvas_general_access', { p_name: NAME4, p_access: 'restricted' }, 'close without points')).toEqual({ general_access: 'restricted', link_token: null });
  const row = await supabaseAdmin.from('canvases').select('general_access, link_token').eq('owner_id', O.user.id).eq('name', NAME4).single();
  expect(row.data).toEqual({ general_access: 'restricted', link_token: null });
});
