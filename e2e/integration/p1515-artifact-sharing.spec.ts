/**
 * @file p1515-artifact-sharing.spec.ts
 * @description P1515 phase 1: sharing a canvas with events and groups, enforced in the database
 * (supabase/migrations/20261021100000_p1515_artifact_sharing.sql and the seal migration after it).
 *
 * THE INVARIANT. Private canvas content (points, stories, positions) is readable by the owner and
 * by people an audience entry admits RIGHT NOW, only through get_canvas(); no base read policy is
 * widened, so admission grants nothing through REST, point pages or story pages.
 *
 * EVERY ABSENCE HAS A CONTROL (epistemic gates 7 and 7b): each "X sees nothing" assertion is paired
 * with a read of the same thing, through the same path, by someone who must see it, so an empty
 * result cannot be a blind probe.
 *
 * Actors (all on the TEST database, one run marker on every row):
 *   O owner · A attendee (in time) · A2 attendee + group member · L late registrant
 *   R removed by the host · R2 registered, removal recorded without deleting the RSVP (the race)
 *   G group member who leaves · G2 group member who stays · N outsider · V signed out
 *   Q author of private letter replies · H event host
 *
 * Runs: npx playwright test --project=integration e2e/integration/p1515-artifact-sharing.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import {
  createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization,
} from '../helpers/test-organization';
import { createTestDoc, deleteTestLetter } from '../helpers/test-letter';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Canvas = { points: Row[]; stories: Row[]; positions: Row[]; visibility: string | null; access: Row };

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `p1515${RUN}`;
const NAME = `p1515c${RUN}`.toLowerCase(); // the canvas name (the part after canvas_)
const CANVAS_TAG = `canvas_${NAME}`;
const DAY = 86_400_000;

const bare = () => createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
async function signIn(u: TestUser): Promise<SupabaseClient> {
  const { data, error } = await bare().auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`[P1515] sign-in failed for ${u.name}: ${error?.message}`);
  return createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const users: TestUser[] = [];
const events: TestEvent[] = [];
const orgs: TestOrganization[] = [];
const letters: string[] = [];
const docs: string[] = [];
const pointIdsCreated: string[] = [];
const storyIdsCreated: string[] = [];

async function mkUser(label: string): Promise<TestUser> {
  const u = await createTestUser({ name: `P1515 ${label} ${RUN}` });
  users.push(u);
  return u;
}
async function mkPoint(owner: string, label: string, visibility: 'public' | 'private', systemTags: string[]): Promise<string> {
  const { data, error } = await supabaseAdmin.from('points').insert({
    statement: `${TAG} ${label}`, first_validator_id: owner, visibility, tags: [TAG], system_tags: systemTags,
  }).select('id').single();
  if (error) throw new Error(`mkPoint ${label}: ${error.message}`);
  pointIdsCreated.push(data.id);
  return data.id as string;
}
async function mkStory(author: string, label: string, visibility: 'public' | 'private', linkTo: string[]): Promise<string> {
  const { data, error } = await supabaseAdmin.from('stories').insert({
    content: `${TAG} ${label}`, author_id: author, visibility, tags: [TAG],
  }).select('id').single();
  if (error) throw new Error(`mkStory ${label}: ${error.message}`);
  storyIdsCreated.push(data.id);
  for (const pointId of linkTo) {
    const link = await supabaseAdmin.from('story_points').insert({ story_id: data.id, point_id: pointId, author_id: author });
    if (link.error) throw new Error(`link ${label}: ${link.error.message}`);
  }
  return data.id as string;
}
async function rsvp(eventId: string, userId: string, rsvpedAt: Date): Promise<void> {
  const { error } = await supabaseAdmin.from('event_rsvps').insert({
    event_id: eventId, profile_id: userId, rsvped_at: rsvpedAt.toISOString(),
  });
  if (error) throw new Error(`rsvp: ${error.message}`);
}

// The cast keeps call sites short; every call asserts nothing by itself.
async function rpc(c: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<{ data: any; error: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return c.rpc(fn, args);
}
async function okRpc<T = any>(c: SupabaseClient, fn: string, args: Record<string, unknown>, what: string): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await rpc(c, fn, args);
  if (error) throw new Error(`${what}: ${fn} failed: ${error.message}`);
  return data as T;
}

let O: TestUser, A: TestUser, A2: TestUser, L: TestUser, R: TestUser, R2: TestUser;
let G: TestUser, G2: TestUser, N: TestUser, Q: TestUser, H: TestUser;
let cO: SupabaseClient, cA: SupabaseClient, cA2: SupabaseClient, cL: SupabaseClient, cR: SupabaseClient, cR2: SupabaseClient;
let cG: SupabaseClient, cG2: SupabaseClient, cN: SupabaseClient, cH: SupabaseClient;
const V = bare(); // signed out

let E1: TestEvent, E2: TestEvent, E3: TestEvent;
let Y: TestOrganization, Yp: TestOrganization, Z: TestOrganization;
let T0: string;

// points
let P_pub: string, P_pub2: string, P_priv: string, P_nobox: string, P_foreign: string, P_old: string, P_plain: string;
// all three canvas points, sorted (two public rows, one private; story_points allows ONE story per author per point, P465)
let ALL_POINTS: string[] = [];
// stories
let S_own_pub: string, S_own_priv: string, S_own_priv_on_pub: string, S_n_pub: string;
let S_q_on_pub: string, S_q_on_priv: string, S_a_direct: string;
// A's two stories added through the canvas (set in AC3, read by later tests)
let addedPriv = '', addedPub = '';

const getCanvas = async (c: SupabaseClient, name = NAME): Promise<Canvas> =>
  okRpc<Canvas>(c, 'get_canvas', { p_owner: O.user.id, p_name: name }, 'read canvas');
const ptIds = (c: Canvas) => c.points.map((p) => p.id as string);
const stIds = (c: Canvas) => c.stories.map((s) => s.story_id as string);
const posOn = (c: Canvas, pointId: string) => c.positions.filter((p) => p.point_id === pointId);
const addedBy = (c: Canvas, authorId: string) => c.stories.filter((s) => s.added && s.story.author_id === authorId);

/**
 * Founder ruling 2026-10-21: the audience decides everything inside. Anyone who is not the owner or
 * currently admitted gets "not found": nothing at all, even when some canvas points are public rows,
 * and no flag that says anything exists.
 */
function expectNothing(c: Canvas, who: string) {
  expect(c.points, `${who}: no points`).toEqual([]);
  expect(c.stories, `${who}: no stories`).toEqual([]);
  expect(c.positions, `${who}: no positions`).toEqual([]);
  expect(c.visibility, `${who}: no Private/Shared hint`).toBeNull();
  expect(c.access.admitted, `${who}: not admitted`).toBe(false);
  expect(c.access.via, `${who}: no reason line`).toBeNull();
  expect(c.access.is_owner).toBe(false);
}
function expectAdmitted(c: Canvas, who: string, via: { kind: string; id: string }) {
  expect(ptIds(c).sort(), `${who}: every canvas point`).toEqual(ALL_POINTS);
  expect(stIds(c), `${who}: the owner's private story`).toContain(S_own_priv);
  expect(stIds(c), `${who}: the owner's private story on the public point`).toContain(S_own_priv_on_pub);
  expect(posOn(c, P_priv).map((p) => p.user_id), `${who}: the owner's position on the private point`).toContain(O.user.id);
  expect(c.access.admitted).toBe(true);
  expect(c.access.via).toMatchObject({ kind: via.kind, id: via.id });
  expect(c.access.is_owner).toBe(false);
  expect(c.visibility, `${who}: admitted readers see the shared icon`).toBe('shared');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(420_000);
  T0 = new Date(Date.now() - 5_000).toISOString();
  // Sequential on purpose: the shared test database is slow under load and eleven concurrent
  // auth-admin calls come back 504.
  O = await mkUser('O'); A = await mkUser('A'); A2 = await mkUser('A2'); L = await mkUser('L');
  R = await mkUser('R'); R2 = await mkUser('R2'); G = await mkUser('G'); G2 = await mkUser('G2');
  N = await mkUser('N'); Q = await mkUser('Q'); H = await mkUser('H');
  cO = await signIn(O); cA = await signIn(A); cA2 = await signIn(A2); cL = await signIn(L);
  cR = await signIn(R); cR2 = await signIn(R2); cG = await signIn(G); cG2 = await signIn(G2);
  cN = await signIn(N); cH = await signIn(H);

  // Events started two days ago, so the 12-hour window has closed for anyone who registers now.
  const start = new Date(Date.now() - 2 * DAY);
  E1 = await createTestEvent(H.user.id, start, { title: `P1515 mastermind ${RUN}` });
  E2 = await createTestEvent(H.user.id, start, { title: `P1515 session two ${RUN}` });
  E3 = await createTestEvent(H.user.id, start, { title: `P1515 other event ${RUN}` });
  events.push(E1, E2, E3);
  const early = new Date(start.getTime() - DAY);
  const late = new Date(start.getTime() + 13 * 3_600_000); // 1 hour after the window closed
  for (const u of [O, A, A2, R, R2]) await rsvp(E1.id, u.user.id, early);
  await rsvp(E1.id, L.user.id, late);
  for (const u of [O, A]) await rsvp(E2.id, u.user.id, early);

  Y = await createTestOrganization({ name: `P1515 public group ${RUN}`, visibility: 'public' });
  Yp = await createTestOrganization({ name: `P1515 private group ${RUN}`, visibility: 'private' });
  Z = await createTestOrganization({ name: `P1515 foreign group ${RUN}`, visibility: 'public' });
  orgs.push(Y, Yp, Z);
  for (const u of [O, A2, G, G2]) await createTestMembership(Y.id, u.user.id);
  for (const u of [O, N, G2]) await createTestMembership(Yp.id, u.user.id);
  await createTestMembership(Z.id, G2.user.id);

  // The canvas: O's current-version points carrying canvas_<name> plus a box tag.
  P_pub = await mkPoint(O.user.id, 'public bet', 'public', [CANVAS_TAG, 'canvas:problem']);
  P_pub2 = await mkPoint(O.user.id, 'second public bet', 'public', [CANVAS_TAG, 'canvas:good-at']);
  P_priv = await mkPoint(O.user.id, 'PRIVATE bet', 'private', [CANVAS_TAG, 'canvas:solution']);
  P_nobox = await mkPoint(O.user.id, 'canvas tag without a box', 'public', [CANVAS_TAG]);
  P_foreign = await mkPoint(N.user.id, 'someone elses point with the same tags', 'public', [CANVAS_TAG, 'canvas:problem']);
  P_old = await mkPoint(O.user.id, 'superseded version', 'public', [CANVAS_TAG, 'canvas:love']);
  P_plain = await mkPoint(O.user.id, 'private point on no canvas', 'private', []);
  const sup = await supabaseAdmin.from('points').update({ superseded_by: P_pub }).eq('id', P_old);
  if (sup.error) throw new Error(`supersede: ${sup.error.message}`);

  S_own_pub = await mkStory(O.user.id, 'owner public story', 'public', [P_pub]);
  S_own_priv = await mkStory(O.user.id, 'owner PRIVATE story', 'private', [P_priv]);
  S_own_priv_on_pub = await mkStory(O.user.id, 'owner private story on a public point', 'private', [P_pub2]);
  S_n_pub = await mkStory(N.user.id, 'outsider public story', 'public', [P_pub]);
  S_q_on_pub = await mkStory(Q.user.id, 'private letter reply on public point', 'private', [P_pub]);
  S_q_on_priv = await mkStory(Q.user.id, 'private letter reply on private point', 'private', [P_priv]);
  // A links their own story straight to O's private point id with the ORDINARY client write (the
  // hole the sealing change closes): it works, grants A nothing, and the canvas ignores it.
  S_a_direct = await mkStory(A.user.id, 'A story linked straight to the private point', 'private', []);
  const direct = await cA.from('story_points').insert({ story_id: S_a_direct, point_id: P_priv, author_id: A.user.id });
  if (direct.error) throw new Error(`A direct link: ${direct.error.message}`);
  ALL_POINTS = [P_pub, P_pub2, P_priv].sort();

  for (const [pt, u, pos] of [[P_pub, O, 'agree'], [P_priv, O, 'agree'], [P_pub, N, 'disagree']] as const) {
    const r = await supabaseAdmin.from('point_positions').insert({ point_id: pt, user_id: u.user.id, position: pos });
    if (r.error) throw new Error(`position seed: ${r.error.message}`);
  }
});

test.afterAll(async () => {
  test.setTimeout(300_000);
  for (const id of letters) await deleteTestLetter(id);
  for (const id of docs) {
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', id);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', id);
  }
  // Points outlive their author (first_validator_id is ON DELETE SET NULL): remove by id and marker.
  const { data: marked } = await supabaseAdmin.from('points').select('id').like('statement', `${TAG} %`);
  const ids = [...new Set([...pointIdsCreated, ...(marked ?? []).map((p) => p.id as string)])];
  if (ids.length) {
    await supabaseAdmin.from('story_points').delete().in('point_id', ids);
    await supabaseAdmin.from('point_positions').delete().in('point_id', ids);
    await supabaseAdmin.from('points').update({ superseded_by: null }).in('id', ids);
    await supabaseAdmin.from('points').delete().in('id', ids);
  }
  await supabaseAdmin.from('stories').delete().like('content', `${TAG} %`);
  for (const e of events) await deleteTestEvent(e.id);
  for (const u of users) await deleteTestUser(u.user.id);
  for (const o of orgs) await deleteTestOrganization(o.id);
});

test('AC1: with no entries the canvas is Private: the owner reads all, everyone else gets nothing, public rows or not', async () => {
  const cv = await supabaseAdmin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', NAME);
  expect(cv.data, 'no record yet').toEqual([]);

  // CONTROL: the owner sees every point, so an empty view below is not a blind probe.
  const own = await getCanvas(cO);
  expect(ptIds(own).sort()).toEqual(ALL_POINTS);
  // The owner's stories only: not the outsider's public story (D-A is dropped), nor any private reply.
  expect(stIds(own).sort()).toEqual([S_own_pub, S_own_priv, S_own_priv_on_pub].sort());
  expect(posOn(own, P_priv).map((p) => p.user_id)).toContain(O.user.id);
  // Positions are the owner's (and admitted readers'): N's position on the public point is not shown.
  expect(own.positions.map((p) => p.user_id), 'only the owner has a position here').toEqual([O.user.id, O.user.id]);
  expect(own.visibility).toBe('private');
  expect(own.access).toMatchObject({ is_owner: true, admitted: true, via: null });

  for (const [who, c] of [['A', cA], ['N', cN], ['L', cL], ['V (signed out)', V]] as const) {
    expectNothing(await getCanvas(c), who);
  }

  // Exactly the right points: not the point without a box, not another owner's point with the same
  // tags, not the superseded version, not a private point on no canvas.
  for (const bad of [P_nobox, P_foreign, P_old, P_plain]) expect(ptIds(own)).not.toContain(bad);
  for (const hidden of [S_q_on_pub, S_q_on_priv, S_a_direct, S_n_pub]) expect(stIds(own)).not.toContain(hidden);

  // The name is case-insensitive; a malformed name is just an empty canvas.
  expect(ptIds(await getCanvas(cO, NAME.toUpperCase())).sort()).toEqual(ALL_POINTS);
  const junk = await getCanvas(cO, 'not a name!');
  expect(junk.points).toEqual([]);
});

test('Founder ruling: a stranger gets nothing from get_canvas even though the canvas\'s points are public rows', async () => {
  // The rows really are public (a point\'s own flag does not decide who reads it on the canvas).
  const rows = await supabaseAdmin.from('points').select('id,visibility').in('id', [P_pub, P_pub2]);
  expect(rows.data!.map((r) => r.visibility)).toEqual(['public', 'public']);
  // CONTROL, through the same function: the owner reads exactly those public rows plus the private one.
  const own = await getCanvas(cO);
  expect(ptIds(own)).toEqual(expect.arrayContaining([P_pub, P_pub2]));
  // And the very same rows ARE readable by anyone through ordinary access, so the ruling is about the canvas only.
  const plain = await V.from('points').select('id').in('id', [P_pub, P_pub2]);
  expect(plain.data).toHaveLength(2);
  // Strangers: signed in, signed out, a registrant outside the window, a member of nothing relevant.
  for (const [who, c] of [['signed-in stranger N', cN], ['signed-out V', V], ['late registrant L', cL], ['attendee-to-be A', cA]] as const) {
    expectNothing(await getCanvas(c), who);
  }
  // An unknown owner or canvas is indistinguishable from "not for you".
  const missing = await okRpc<Canvas>(cN, 'get_canvas', { p_owner: '00000000-0000-0000-0000-0000000000bb', p_name: NAME }, 'unknown owner');
  expect(missing.points).toEqual([]);
  expect(missing.visibility).toBeNull();
});

test('AC2: O shares with event E1: A, A2 and the host read everything with the reason line; L, N and V do not', async () => {
  expect(await okRpc(cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: E1.id }, 'share E1')).toBe(true);
  const rec = await supabaseAdmin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', NAME);
  expect(rec.data).toHaveLength(1); // created on first share
  const aud = await supabaseAdmin.from('canvas_audience').select('kind,event_id').eq('canvas_id', rec.data![0].id);
  expect(aud.data).toEqual([{ kind: 'event', event_id: E1.id }]);

  for (const [who, c] of [['A', cA], ['A2', cA2], ['H (host)', cH]] as const) {
    expectAdmitted(await getCanvas(c), who, { kind: 'event', id: E1.id });
  }
  const viaA = (await getCanvas(cA)).access.via;
  expect(viaA.name).toBe(E1.title);

  // L registered after the window, N never registered, V is signed out.
  for (const [who, c] of [['L (late)', cL], ['N', cN], ['V', V], ['G (group member, no group entry yet)', cG]] as const) {
    expectNothing(await getCanvas(c), who);
  }
  // Another person's private letter replies and outsider stories are not inside, even for an admitted reader.
  const a = await getCanvas(cA);
  for (const hidden of [S_q_on_pub, S_q_on_priv, S_a_direct, S_n_pub]) expect(stIds(a)).not.toContain(hidden);
  // N's position on the public point is not shown to an admitted reader either: positions are the owner's and readers'.
  expect(a.positions.map((p) => p.user_id)).not.toContain(N.user.id);
  // The icon: Shared for the owner and for admitted readers, no hint for strangers (expectNothing above).
  expect((await getCanvas(cO)).visibility).toBe('shared');
  expect((await getCanvas(cA)).visibility).toBe('shared');
});

test('AC3: A takes a position and adds a story; O and other readers see both with A\'s name; the story is nowhere else', async () => {
  await okRpc(cA, 'canvas_set_position', {
    p_owner: O.user.id, p_name: NAME, p_point: P_priv, p_position: 'strongly_agree', p_reasoning: `${TAG} because`,
  }, 'A position');
  addedPriv = await okRpc<string>(cA, 'canvas_add_story', {
    p_owner: O.user.id, p_name: NAME, p_point: P_priv, p_content: `${TAG} A story on the private point`,
  }, 'A story');
  addedPub = await okRpc<string>(cA, 'canvas_add_story', {
    p_owner: O.user.id, p_name: NAME, p_point: P_pub, p_content: `${TAG} A story on the public point`,
  }, 'A story on public');
  storyIdsCreated.push(addedPriv, addedPub);

  for (const [who, c] of [['O', cO], ['A2', cA2], ['A', cA]] as const) {
    const cv = await getCanvas(c);
    const mine = posOn(cv, P_priv).find((p) => p.user_id === A.user.id);
    expect(mine, `${who} sees A's position`).toBeTruthy();
    expect(mine!.position).toBe('strongly_agree');
    expect(mine!.user.name).toBe(A.name);
    const stories = addedBy(cv, A.user.id).map((s) => s.story_id);
    expect(stories.sort(), `${who} sees both of A's added stories`).toEqual([addedPriv, addedPub].sort());
    const s = addedBy(cv, A.user.id).find((x) => x.story_id === addedPriv)!;
    expect(s.story.author.name).toBe(A.name);
    expect(s.story.visibility).toBe('private');
    expect(s.point_id).toBe(P_priv);
  }
  // Not admitted: nothing of it, on the private point or the public one.
  for (const [who, c] of [['L', cL], ['N', cN], ['V', V]] as const) {
    const cv = await getCanvas(c);
    expect(stIds(cv), who).not.toContain(addedPriv);
    expect(stIds(cv), who).not.toContain(addedPub);
    expect(posOn(cv, P_priv), who).toEqual([]);
  }

  // The story appears under the point NOWHERE else: no ordinary link, nobody else can read the row.
  const links = await supabaseAdmin.from('story_points').select('story_id').in('story_id', [addedPriv, addedPub]);
  expect(links.data, 'no story_points link').toEqual([]);
  for (const [who, c] of [['O', cO], ['A2', cA2], ['N', cN], ['V', V]] as const) {
    const direct = await c.from('stories').select('id').in('id', [addedPriv, addedPub]);
    expect(direct.data ?? [], `${who} reads the added story by id`).toEqual([]);
    const onPoint = await c.from('story_points').select('story_id').eq('point_id', P_pub);
    expect((onPoint.data ?? []).map((r) => r.story_id), `${who} sees no added story under the point`).not.toContain(addedPub);
  }
  // CONTROL: A reads their own added stories as any private story of theirs, and sees O's links no more.
  const aOwn = await cA.from('stories').select('id').in('id', [addedPriv, addedPub]);
  expect((aOwn.data ?? []).map((r) => r.id).sort(), 'author reads own stories').toEqual([addedPriv, addedPub].sort());

  // The writes are refused to everyone who is not admitted, and by point/owner mismatch.
  const attempts: Array<[string, SupabaseClient, string, Record<string, unknown>]> = [
    ['N position on the public point', cN, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: P_pub, p_position: 'agree', p_reasoning: null }],
    ['L position on the private point', cL, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: P_priv, p_position: 'agree', p_reasoning: null }],
    ['V position', V, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: P_pub, p_position: 'agree', p_reasoning: null }],
    ['A position on a point without a box', cA, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: P_nobox, p_position: 'agree', p_reasoning: null }],
    ['A position on another owner\'s point', cA, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: P_foreign, p_position: 'agree', p_reasoning: null }],
    ['A position on a superseded version', cA, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: P_old, p_position: 'agree', p_reasoning: null }],
    ['N story', cN, 'canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: P_pub, p_content: `${TAG} N sneaks in` }],
    ['L story', cL, 'canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: P_priv, p_content: `${TAG} L sneaks in` }],
    ['V story', V, 'canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: P_pub, p_content: `${TAG} V sneaks in` }],
    ['O story (the owner uses the ordinary path)', cO, 'canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: P_pub, p_content: `${TAG} O via canvas` }],
    ['A story on a point without a box', cA, 'canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: P_nobox, p_content: `${TAG} A wrong point` }],
  ];
  for (const [what, client, fn, args] of attempts) {
    const { error } = await rpc(client, fn, args);
    expect(error, `${what} must be refused`).not.toBeNull();
  }
  const blank = await rpc(cA, 'canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: P_pub, p_content: '   ' });
  expect(blank.error?.code, 'a blank story is refused').toBe('22023');
  // Nothing leaked in from the refused attempts, and N's position on the public point is unchanged.
  const stray = await supabaseAdmin.from('stories').select('id').like('content', `${TAG} % sneaks in`);
  expect(stray.data).toEqual([]);
  const stray2 = await supabaseAdmin.from('stories').select('id').like('content', `${TAG} O via canvas`);
  expect(stray2.data).toEqual([]);
  const nPos = await supabaseAdmin.from('point_positions').select('position').eq('point_id', P_pub).eq('user_id', N.user.id);
  expect(nPos.data).toEqual([{ position: 'disagree' }]);

  // A can change and withdraw a position through the checked functions.
  await okRpc(cA, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: P_priv, p_position: 'disagree', p_reasoning: null }, 'A changes');
  expect(posOn(await getCanvas(cO), P_priv).find((p) => p.user_id === A.user.id)!.position).toBe('disagree');
  await okRpc(cA, 'canvas_remove_position', { p_owner: O.user.id, p_name: NAME, p_point: P_priv }, 'A withdraws');
  expect(posOn(await getCanvas(cO), P_priv).find((p) => p.user_id === A.user.id)).toBeUndefined();
  await okRpc(cA, 'canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: P_priv, p_position: 'strongly_agree', p_reasoning: null }, 'A retakes');
});

test('AC10: canvas admission grants no base access: REST returns the attendee nothing of the owner\'s private rows', async () => {
  // Every probe is run first by the owner (CONTROL: it returns rows), then by A while admitted, N and V.
  const probes: Array<{ what: string; run: (c: SupabaseClient) => PromiseLike<{ data: Row[] | null; error: any }>; ownerMin: number; forbid: (rows: Row[]) => boolean }> = [ // eslint-disable-line @typescript-eslint/no-explicit-any
    { what: 'points by id', run: (c) => c.from('points').select('id').eq('id', P_priv), ownerMin: 1, forbid: (r) => r.length > 0 },
    { what: 'points by canvas system tag', run: (c) => c.from('points').select('id').contains('system_tags', [CANVAS_TAG]).eq('visibility', 'private'), ownerMin: 1, forbid: (r) => r.length > 0 },
    { what: 'owner private story by id', run: (c) => c.from('stories').select('id').eq('id', S_own_priv), ownerMin: 1, forbid: (r) => r.length > 0 },
    { what: 'owner private story on the public point', run: (c) => c.from('stories').select('id').eq('id', S_own_priv_on_pub), ownerMin: 1, forbid: (r) => r.length > 0 },
    { what: 'story versions of the private story', run: (c) => c.from('story_versions').select('id').eq('story_id', S_own_priv), ownerMin: 1, forbid: (r) => r.length > 0 },
    { what: 'story history of the private story', run: (c) => c.from('story_point_history').select('story_id').eq('story_id', S_own_priv), ownerMin: 0, forbid: (r) => r.length > 0 },
    { what: 'O\'s link on the private point', run: (c) => c.from('story_points').select('story_id').eq('story_id', S_own_priv), ownerMin: 1, forbid: (r) => r.length > 0 },
    { what: 'O\'s position on the private point', run: (c) => c.from('point_positions').select('user_id').eq('point_id', P_priv).eq('user_id', O.user.id), ownerMin: 1, forbid: (r) => r.length > 0 },
    { what: 'O\'s position history on the private point', run: (c) => c.from('point_position_history').select('user_id').eq('point_id', P_priv).eq('user_id', O.user.id), ownerMin: 1, forbid: (r) => r.length > 0 },
    { what: 'verifications of the private story', run: (c) => c.from('story_verifications').select('id').eq('story_id', S_own_priv), ownerMin: 0, forbid: (r) => r.length > 0 },
    {
      // The exact query getStoriesForPoints makes (story_points joined to stories).
      what: 'getStoriesForPoints on the private point',
      run: (c) => c.from('story_points').select('point_id, story_id, story:stories!story_points_story_id_fkey(id, content)').eq('point_id', P_priv),
      ownerMin: 1,
      forbid: (r) => r.some((x) => x.story_id === S_own_priv),
    },
  ];
  for (const p of probes) {
    const o = await p.run(cO);
    expect(o.error, `${p.what}: owner read must not error`).toBeNull();
    expect((o.data ?? []).length, `CONTROL ${p.what}: the owner reads it`).toBeGreaterThanOrEqual(p.ownerMin);
    for (const [who, c] of [['A (admitted)', cA], ['A2 (admitted)', cA2], ['N', cN], ['V', V]] as const) {
      const r = await p.run(c);
      expect(r.error, `${who} ${p.what}: an empty result, not an error that hides a leak`).toBeNull();
      expect(p.forbid(r.data ?? []), `${who} reads ${p.what}`).toBe(false);
    }
  }
  // A still reads A's own rows as today (control for the A column above).
  const aStory = await cA.from('stories').select('id').eq('id', S_a_direct);
  expect(aStory.data).toHaveLength(1);
  const aPos = await cA.from('point_positions').select('position').eq('point_id', P_priv).eq('user_id', A.user.id);
  expect(aPos.data).toHaveLength(1);
  // A links A's own story straight to O's private point id: the canvas ignores it (only added
  // stories count) and nothing of O's becomes readable to A (the probes above).
  expect(stIds(await getCanvas(cA))).not.toContain(S_a_direct);
  expect(stIds(await getCanvas(cO))).not.toContain(S_a_direct);
});

test('AC4: O adds group Y: G reads everything; after G leaves Y the next request is public points only; events come before groups', async () => {
  expect(await okRpc(cO, 'share_canvas', { p_name: NAME, p_kind: 'group', p_target: Y.id }, 'share Y')).toBe(true);
  const g = await getCanvas(cG);
  expectAdmitted(g, 'G', { kind: 'group', id: Y.id });
  expect(g.access.via.name).toBe(Y.name);
  expectAdmitted(await getCanvas(cG2), 'G2', { kind: 'group', id: Y.id });
  // A2 is admitted by BOTH entries: the reason line names the event first.
  expectAdmitted(await getCanvas(cA2), 'A2', { kind: 'event', id: E1.id });

  // G leaves Y (a client delete of their own membership, the real path).
  const leave = await cG.from('membership').delete().eq('org_id', Y.id).eq('user_id', G.user.id).select('id');
  expect(leave.error).toBeNull();
  expect(leave.data).toHaveLength(1);
  expectNothing(await getCanvas(cG), 'G after leaving');
  expectAdmitted(await getCanvas(cG2), 'G2 still a member', { kind: 'group', id: Y.id });
});

test('AC5: the host removes R: registration gone, R cannot register again, R sees public points only, R\'s direct writes show nowhere', async () => {
  // CONTROL: R is admitted before the removal.
  expectAdmitted(await getCanvas(cR), 'R before removal', { kind: 'event', id: E1.id });
  await okRpc(cH, 'remove_event_attendee', { p_event: E1.id, p_user: R.user.id }, 'host removes R');

  const reg = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', E1.id).eq('profile_id', R.user.id);
  expect(reg.data, 'registration deleted').toEqual([]);
  const rem = await supabaseAdmin.from('event_removals').select('user_id,removed_by').eq('event_id', E1.id).eq('user_id', R.user.id);
  expect(rem.data).toEqual([{ user_id: R.user.id, removed_by: H.user.id }]);

  // R cannot register again: by the client path, and by the service role (the record is authoritative).
  const again = await cR.from('event_rsvps').insert({ event_id: E1.id, profile_id: R.user.id });
  expect(again.error, 'R cannot re-register').not.toBeNull();
  expect(again.error?.code).toBe('42501');
  const svc = await supabaseAdmin.from('event_rsvps').insert({ event_id: E1.id, profile_id: R.user.id });
  expect(svc.error?.code, 'not even the service role registers a removed person').toBe('42501');
  // CONTROL for the trigger: an ordinary person registers fine (N registers at E3, nothing to do with the canvas).
  const ok = await cN.from('event_rsvps').insert({ event_id: E3.id, profile_id: N.user.id });
  expect(ok.error, 'registration still works for everyone else').toBeNull();

  expectNothing(await getCanvas(cR), 'R after removal');

  // R writes a position on O's private point DIRECTLY (today's unchanged path): it persists, and
  // the canvas shows it to nobody. CONTROL: A's admitted position is shown.
  const direct = await cR.from('point_positions').insert({ point_id: P_priv, user_id: R.user.id, position: 'strongly_disagree' });
  expect(direct.error, 'the ordinary write path is unchanged').toBeNull();
  const stored = await supabaseAdmin.from('point_positions').select('position').eq('point_id', P_priv).eq('user_id', R.user.id);
  expect(stored.data).toEqual([{ position: 'strongly_disagree' }]);
  for (const [who, c] of [['O', cO], ['A', cA], ['A2', cA2]] as const) {
    const cv = await getCanvas(c);
    expect(posOn(cv, P_priv).map((p) => p.user_id), `${who} sees no position by R`).not.toContain(R.user.id);
    expect(posOn(cv, P_priv).map((p) => p.user_id), `CONTROL ${who} sees A's position`).toContain(A.user.id);
  }

  // R2: the race. The removal is recorded while the registration still exists (a registration that
  // committed concurrently). The record is authoritative, so R2 is admitted by nothing.
  expectAdmitted(await getCanvas(cR2), 'R2 before the record', { kind: 'event', id: E1.id });
  const race = await supabaseAdmin.from('event_removals').insert({ event_id: E1.id, user_id: R2.user.id, removed_by: H.user.id });
  expect(race.error).toBeNull();
  const stillRegistered = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', E1.id).eq('profile_id', R2.user.id);
  expect(stillRegistered.data, 'the registration is still there').toHaveLength(1);
  expectNothing(await getCanvas(cR2), 'R2 with a registration but a removal record');
  const svcAdmits = await supabaseAdmin.rpc('_canvas_event_admits', { p_event: E1.id, p_uid: R2.user.id });
  expect(svcAdmits.data).toBe(false);

  // Who may remove: only the host, never the host themselves, never a stranger.
  for (const [what, c, ev, who] of [
    ['an attendee', cA, E1.id, A2.user.id],
    ['the owner (not the host)', cO, E1.id, A.user.id],
    ['signed out', V, E1.id, A.user.id],
    ['the host removing themselves', cH, E1.id, H.user.id],
    ['a non-host on E3', cN, E3.id, A.user.id],
  ] as const) {
    const { error } = await rpc(c, 'remove_event_attendee', { p_event: ev, p_user: who });
    expect(error, `${what} must be refused`).not.toBeNull();
  }
  const a2Reg = await supabaseAdmin.from('event_rsvps').select('id').eq('event_id', E1.id).eq('profile_id', A2.user.id);
  expect(a2Reg.data, 'A2 is still registered').toHaveLength(1);
});

test('AC6 + AC11: unsharing E1 ends A\'s access, G2 keeps access; O keeps A\'s stories, others lose them while A cannot read', async () => {
  expect(await okRpc(cO, 'unshare_canvas', { p_name: NAME, p_kind: 'event', p_target: E1.id }, 'unshare E1')).toBe(true);

  expectNothing(await getCanvas(cA), 'A after E1 was removed');
  expectAdmitted(await getCanvas(cG2), 'G2 (group entry remains)', { kind: 'group', id: Y.id });
  // A2 is still a member of Y: admitted, and now through the group.
  expectAdmitted(await getCanvas(cA2), 'A2 through the group', { kind: 'group', id: Y.id });

  // O still sees A's added stories; another admitted reader does not while A cannot read the canvas.
  expect(addedBy(await getCanvas(cO), A.user.id).map((s) => s.story_id).sort()).toEqual([addedPriv, addedPub].sort());
  expect(stIds(await getCanvas(cA2)), 'A2 does not see A\'s stories while A has no access').not.toContain(addedPriv);
  expect(stIds(await getCanvas(cA2))).not.toContain(addedPub);
  expect(stIds(await getCanvas(cG2))).not.toContain(addedPub);
  // A, no longer admitted, gets nothing at all: not even their own stories, on a public point or not.
  expectNothing(await getCanvas(cA), 'A (no access) sees none of their own stories either');
  // Positions follow the spec's "held by the owner or by people who can currently read the canvas":
  // A's position on the private point is shown to nobody once A cannot read (the owner included),
  // while A's stories stay with the owner above. The row itself is untouched.
  expect(posOn(await getCanvas(cA2), P_priv).map((p) => p.user_id)).not.toContain(A.user.id);
  expect(posOn(await getCanvas(cO), P_priv).map((p) => p.user_id), 'a position by someone who cannot read is not shown').not.toContain(A.user.id);
  expect(posOn(await getCanvas(cO), P_priv).map((p) => p.user_id), 'CONTROL: the owner\'s own position is shown').toContain(O.user.id);
  const kept = await supabaseAdmin.from('point_positions').select('position').eq('point_id', P_priv).eq('user_id', A.user.id);
  expect(kept.data, 'the position row is not deleted').toHaveLength(1);
  // Sharing nothing means the event page lists nothing for A either.
  expect(await okRpc(cA, 'list_canvases_shared_with_event', { p_event: E1.id }, 'list')).toEqual([]);
});

test('Deleting the event cascades its entry: access through it ends at once', async () => {
  expect(await okRpc(cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: E2.id }, 'share E2')).toBe(true);
  expectAdmitted(await getCanvas(cA), 'A through E2', { kind: 'event', id: E2.id });
  const del = await supabaseAdmin.from('events').delete().eq('id', E2.id);
  expect(del.error).toBeNull();
  const entry = await supabaseAdmin.from('canvas_audience').select('id').eq('event_id', E2.id);
  expect(entry.data, 'entry deleted with the event').toEqual([]);
  expectNothing(await getCanvas(cA), 'A after E2 was deleted');
  expectAdmitted(await getCanvas(cG2), 'G2 unaffected', { kind: 'group', id: Y.id });
  // Re-share E1: access returns on the next request (live, nothing copied), and A's stories come back for other readers.
  expect(await okRpc(cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: E1.id }, 're-share E1')).toBe(true);
  expectAdmitted(await getCanvas(cA), 'A after re-share', { kind: 'event', id: E1.id });
  expect(stIds(await getCanvas(cA2))).toContain(addedPriv);
});

test('AC8: the owner can add only events they host or are admitted to and groups they belong to; only the owner changes entries', async () => {
  const refused: Array<[string, SupabaseClient, string, Record<string, unknown>]> = [
    ['an event O is not registered for', cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: E3.id }],
    ['a group O does not belong to', cO, 'share_canvas', { p_name: NAME, p_kind: 'group', p_target: Z.id }],
    ['an unknown kind', cO, 'share_canvas', { p_name: NAME, p_kind: 'link', p_target: E1.id }],
    ['a missing event', cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: '00000000-0000-0000-0000-000000000000' }],
    ['a canvas A does not own', cA, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: E1.id }],
    ['a canvas name O does not own', cO, 'share_canvas', { p_name: `${NAME}x`, p_kind: 'event', p_target: E1.id }],
    ['signed out', V, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: E1.id }],
  ];
  for (const [what, c, fn, args] of refused) {
    const { error } = await rpc(c, fn, args);
    expect(error, `${what} must be refused`).not.toBeNull();
  }
  // CONTROL for the refusals: an event the owner HOSTS is allowed, and so is removing it again.
  const E4 = await createTestEvent(O.user.id, new Date(Date.now() + DAY), { title: `P1515 hosted by O ${RUN}` });
  events.push(E4);
  expect(await okRpc(cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: E4.id }, 'share hosted event')).toBe(true);
  expect(await okRpc(cO, 'unshare_canvas', { p_name: NAME, p_kind: 'event', p_target: E4.id }, 'unshare hosted event')).toBe(true);

  // Nothing was added by the refused calls.
  const rec = await supabaseAdmin.from('canvases').select('id,name').eq('owner_id', O.user.id);
  expect(rec.data!.map((r) => r.name)).toEqual([NAME]);
  const entries = await supabaseAdmin.from('canvas_audience').select('kind,event_id,org_id').eq('canvas_id', rec.data![0].id);
  expect(entries.data!.sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
    { kind: 'event', event_id: E1.id, org_id: null },
    { kind: 'group', event_id: null, org_id: Y.id },
  ]);

  // Another person cannot remove O's entries; the direct tables are closed to clients.
  expect(await okRpc(cA, 'unshare_canvas', { p_name: NAME, p_kind: 'event', p_target: E1.id }, 'A unshare')).toBe(false);
  expectAdmitted(await getCanvas(cA2), 'A2 unaffected by A\'s unshare', { kind: 'event', id: E1.id });
  const ins = await cO.from('canvas_audience').insert({ canvas_id: rec.data![0].id, kind: 'event', event_id: E3.id });
  expect(ins.error, 'direct insert is refused').not.toBeNull();
  const del = await cO.from('canvas_audience').delete().eq('canvas_id', rec.data![0].id);
  expect(del.error, 'direct delete is refused').not.toBeNull();
  const still = await supabaseAdmin.from('canvas_audience').select('id').eq('canvas_id', rec.data![0].id);
  expect(still.data).toHaveLength(2);
});

test('Panel: the audience shows each entry with its count, names for events and public groups, a count only for a private group; only O', async () => {
  expect(await okRpc(cO, 'share_canvas', { p_name: NAME, p_kind: 'group', p_target: Yp.id }, 'share Yp')).toBe(true);
  const aud = await okRpc<{ entries: Row[] }>(cO, 'get_canvas_audience', { p_name: NAME }, 'audience');
  expect(aud.entries.map((e) => e.kind)).toEqual(['event', 'group', 'group']); // events before groups

  const ev = aud.entries.find((e) => e.id === E1.id)!;
  expect(ev.name).toBe(E1.title);
  expect(ev.owner_admitted).toBe(true);
  // Admitted at E1 besides O: the host, A, A2. R was removed, R2 has a removal record, L registered late.
  expect(ev.names.map((n: Row) => n.name).sort()).toEqual([H.name, A.name, A2.name].sort());
  expect(ev.count).toBe(3);

  const pub = aud.entries.find((e) => e.id === Y.id)!;
  expect(pub.public).toBe(true);
  expect(pub.names.map((n: Row) => n.name).sort()).toEqual([A2.name, G2.name].sort()); // G left, O excluded
  expect(pub.count).toBe(2);

  const priv = aud.entries.find((e) => e.id === Yp.id)!;
  expect(priv.public).toBe(false);
  expect(priv.names, 'a private group shows its count only').toBeNull();
  expect(priv.count).toBe(2); // N and G2, O excluded
  expect(JSON.stringify(aud)).not.toContain(N.name); // N is in the private group and is not named anywhere

  // Only the owner: another person sees their OWN canvases (none of this name), signed out is refused.
  expect(await okRpc(cA, 'get_canvas_audience', { p_name: NAME }, 'A audience')).toEqual({ entries: [] });
  const anon = await rpc(V, 'get_canvas_audience', { p_name: NAME });
  expect(anon.error).not.toBeNull();
  // The private group admits its members too (N and G2 read through it).
  expectAdmitted(await getCanvas(cN), 'N through the private group', { kind: 'group', id: Yp.id });
});

test('Share targets: the owner is offered the events they host or are admitted to and every group they belong to (a private one named), and nobody else\'s', async () => {
  const targets = (c: SupabaseClient) => okRpc<{ events: Row[]; groups: Row[] }>(c, 'get_canvas_share_targets', {}, 'share targets');
  const o = await targets(cO);
  // CONTROLS first: what must be offered is offered.
  expect(o.events.map((e) => e.id), 'O registered in time at E1').toContain(E1.id);
  expect(o.events.find((e) => e.id === E1.id)).toMatchObject({ title: E1.title, slug: E1.slug, hosted: false });
  expect(o.groups.map((g) => g.id).sort(), 'O belongs to Y and Yp').toEqual(expect.arrayContaining([Y.id, Yp.id]));
  // A private group's name is unreadable to clients through ordinary access; here its member sees it.
  expect(o.groups.find((g) => g.id === Yp.id)).toMatchObject({ name: Yp.name, public: false });
  expect(o.groups.find((g) => g.id === Y.id)).toMatchObject({ name: Y.name, public: true });
  const direct = await cO.from('organization').select('id').eq('id', Yp.id);
  expect(direct.data, 'CONTROL for the point above: REST cannot name the private group').toEqual([]);
  // The absences: an event O is not registered for, a group O is not in.
  expect(o.events.map((e) => e.id)).not.toContain(E3.id);
  expect(o.groups.map((g) => g.id)).not.toContain(Z.id);
  // The host is offered the event as hosted; a late registrant is not offered it at all; N sees only N's groups.
  expect((await targets(cH)).events.find((e) => e.id === E1.id)).toMatchObject({ hosted: true });
  expect((await targets(cL)).events.map((e) => e.id), 'registered after the window: not admitted, not offered').not.toContain(E1.id);
  const n = await targets(cN);
  expect(n.groups.map((g) => g.id)).toContain(Yp.id);
  expect(n.groups.map((g) => g.id)).not.toContain(Y.id);
  expect((await rpc(V, 'get_canvas_share_targets', {})).error, 'signed out has no grant').not.toBeNull();
});

test('Event page: the canvases shared with E1 are listed to E1\'s admitted people (and the owner) and to no one else', async () => {
  for (const [who, c] of [['A', cA], ['A2', cA2], ['H (host)', cH], ['O (owner)', cO]] as const) {
    const list = await okRpc<Row[]>(c, 'list_canvases_shared_with_event', { p_event: E1.id }, `list ${who}`);
    expect(list, who).toEqual([{ owner_id: O.user.id, owner_name: O.name, owner_slug: O.slug, name: NAME }]);
  }
  for (const [who, c] of [['L (late)', cL], ['R (removed)', cR], ['R2 (removal record)', cR2], ['V', V]] as const) {
    const { data, error } = await rpc(c, 'list_canvases_shared_with_event', { p_event: E1.id });
    if (who === 'V') {
      expect(error, 'signed out has no grant').not.toBeNull();
    } else {
      expect(error).toBeNull();
      expect(data, who).toEqual([]);
    }
  }
  // N is registered at E3 and (via the private group) reads the canvas, but E1's list is not for N.
  expect(await okRpc(cN, 'list_canvases_shared_with_event', { p_event: E1.id }, 'N list')).toEqual([]);
  // Listing an event the canvas is not shared with returns nothing, even to its host.
  expect(await okRpc(cH, 'list_canvases_shared_with_event', { p_event: E3.id }, 'E3 list')).toEqual([]);
});


test('The server stamps when a client registered: a backdated registration does not enter the 12-hour window', async () => {
  // L registered late (service role, explicit time). L cancels and re-registers through the client,
  // asking for a registration time before the event started.
  const cancel = await cL.from('event_rsvps').delete().eq('event_id', E1.id).eq('profile_id', L.user.id).select('id');
  expect(cancel.error).toBeNull();
  expect(cancel.data).toHaveLength(1);
  const backdated = new Date(Date.now() - 5 * DAY).toISOString();
  const re = await cL.from('event_rsvps').insert({ event_id: E1.id, profile_id: L.user.id, rsvped_at: backdated });
  expect(re.error, 'the insert itself still works').toBeNull();
  const stored = await supabaseAdmin.from('event_rsvps').select('rsvped_at').eq('event_id', E1.id).eq('profile_id', L.user.id).single();
  expect(new Date(stored.data!.rsvped_at).getTime(), 'the server decided the time').toBeGreaterThanOrEqual(new Date(T0).getTime());
  expectNothing(await getCanvas(cL), 'L who asked for a backdated registration');
  // Nor by update: a client has no UPDATE policy on event_rsvps, so a backdating update changes no row
  // (and the migration's BEFORE UPDATE stamp keeps rsvped_at even if such a policy is ever added).
  const upd = await cL.from('event_rsvps').update({ rsvped_at: backdated }).eq('event_id', E1.id).eq('profile_id', L.user.id).select('id');
  expect(upd.data ?? [], 'an authenticated client cannot update a registration').toEqual([]);
  const after = await supabaseAdmin.from('event_rsvps').select('rsvped_at').eq('event_id', E1.id).eq('profile_id', L.user.id).single();
  expect(after.data!.rsvped_at, 'rsvped_at is unchanged by the attempted update').toBe(stored.data!.rsvped_at);
  expectNothing(await getCanvas(cL), 'L after a backdating update');

  // CONTROL: the very same registration with an in-time timestamp written by the service role admits L,
  // so the stamp (not some other rule) is what kept L out above.
  await supabaseAdmin.from('event_rsvps').delete().eq('event_id', E1.id).eq('profile_id', L.user.id);
  await rsvp(E1.id, L.user.id, new Date(Date.now() - 5 * DAY));
  expectAdmitted(await getCanvas(cL), 'L with an in-time registration', { kind: 'event', id: E1.id });

  // A registration with no time at all admits nobody (fails closed): Q has none anywhere else.
  const noTime = await supabaseAdmin.from('event_rsvps').insert({ event_id: E1.id, profile_id: Q.user.id, rsvped_at: null });
  expect(noTime.error).toBeNull();
  expect((await supabaseAdmin.rpc('_canvas_event_admits', { p_event: E1.id, p_uid: Q.user.id })).data).toBe(false);
});

test('AC7: when O leaves Y or cancels at E1, that entry admits no one; access is live both ways', async () => {

  // G rejoins Y: access is back at once, nothing was copied anywhere.
  await createTestMembership(Y.id, G.user.id);
  expectAdmitted(await getCanvas(cG), 'G after rejoining', { kind: 'group', id: Y.id });

  // O leaves Y. The Y entry admits no one; G (only in Y) loses it. G2 (also in Yp) and A2 (also at E1) keep theirs.
  const leave = await cO.from('membership').delete().eq('org_id', Y.id).eq('user_id', O.user.id).select('id');
  expect(leave.error).toBeNull();
  expect(leave.data).toHaveLength(1);
  expectNothing(await getCanvas(cG), 'G once O left Y');
  expectAdmitted(await getCanvas(cG2), 'G2 through the private group', { kind: 'group', id: Yp.id });
  expectAdmitted(await getCanvas(cA2), 'A2 through the event', { kind: 'event', id: E1.id });
  const aud = await okRpc<{ entries: Row[] }>(cO, 'get_canvas_audience', { p_name: NAME }, 'audience');
  const y = aud.entries.find((e) => e.id === Y.id)!;
  expect(y.owner_admitted).toBe(false);
  expect(y.count, 'an entry the owner left admits no one').toBe(0);

  // O cancels at E1. Now that entry admits no one either, host included.
  const cancel = await cO.from('event_rsvps').delete().eq('event_id', E1.id).eq('profile_id', O.user.id).select('id');
  expect(cancel.error).toBeNull();
  expect(cancel.data).toHaveLength(1);
  for (const [who, c] of [['A', cA], ['A2', cA2], ['H (host)', cH], ['L', cL]] as const) {
    expectNothing(await getCanvas(c), `${who} once O cancelled at E1`);
  }
  expect(await okRpc(cH, 'list_canvases_shared_with_event', { p_event: E1.id }, 'host list')).toEqual([]);
  expectAdmitted(await getCanvas(cG2), 'G2 CONTROL', { kind: 'group', id: Yp.id });
  expectAdmitted(await getCanvas(cN), 'N CONTROL', { kind: 'group', id: Yp.id });

  // O registers again through the client: stamped now, long after the window, so E1 still admits no one.
  const re = await cO.from('event_rsvps').insert({ event_id: E1.id, profile_id: O.user.id });
  expect(re.error).toBeNull();
  expectNothing(await getCanvas(cA), 'A after O re-registered too late');

  // O rejoins Y: G and A2 read through it again on the next request.
  await createTestMembership(Y.id, O.user.id);
  expectAdmitted(await getCanvas(cG), 'G after O rejoined Y', { kind: 'group', id: Y.id });
  expectAdmitted(await getCanvas(cA2), 'A2 through Y', { kind: 'group', id: Y.id });
});

test('AC13: a letter sealed by A does not copy the private statement of a point A does not own', async () => {
  const P_a = await mkPoint(A.user.id, 'A own private point', 'private', []);
  // S_a_direct is already linked to O's private point (fixture); give it A's own private point and the public one too.
  for (const pt of [P_a, P_pub]) {
    const l = await supabaseAdmin.from('story_points').insert({ story_id: S_a_direct, point_id: pt, author_id: A.user.id });
    expect(l.error).toBeNull();
  }
  const S_seal = S_a_direct;

  const doc = await createTestDoc(A.user.id, `${TAG} doc`);
  docs.push(doc.id);
  const ins = await supabaseAdmin.from('doc_stories').insert({ doc_id: doc.id, story_id: S_seal, position: 0, point_config: {} });
  expect(ins.error).toBeNull();
  const letter = await supabaseAdmin.from('clarity_letters').insert({
    source_doc_id: doc.id, sender_id: A.user.id, mode: 'one-to-one', status: 'draft',
  }).select('id').single();
  expect(letter.error).toBeNull();
  letters.push(letter.data!.id);

  const sealed = await rpc(cA, 'seal_and_send_letter', {
    p_letter_id: letter.data!.id,
    p_predictions: [],
    p_deliveries: [{ receiver_email: `p1515-${RUN}@example.com`, receiver_name: 'Reader' }],
  });
  expect(sealed.error, 'sealing works').toBeNull();

  const snap = await supabaseAdmin.from('letter_story_snapshots').select('point_config').eq('letter_id', letter.data!.id).single();
  expect(snap.error).toBeNull();
  const texts = (snap.data!.point_config.points as Row[]).map((p) => p.text as string);
  // CONTROLS: A's own private point and the public point are in the snapshot.
  expect(texts).toContain(`${TAG} A own private point`);
  expect(texts).toContain(`${TAG} public bet`);
  // The fix: O's private statement is nowhere in the letter.
  expect(texts).not.toContain(`${TAG} PRIVATE bet`);
  expect(JSON.stringify(snap.data)).not.toContain('PRIVATE bet');
});

test('Removing one\'s own added story takes it off the canvas; only its author can; the story stays the author\'s', async () => {
  const added = await okRpc<string>(cA2, 'canvas_add_story', {
    p_owner: O.user.id, p_name: NAME, p_point: P_pub, p_content: `${TAG} A2 story to remove`,
  }, 'A2 adds');
  storyIdsCreated.push(added);
  expect(stIds(await getCanvas(cO))).toContain(added);

  for (const [who, c] of [['O (not the author)', cO], ['A (not the author)', cA], ['V', V]] as const) {
    const { error } = await rpc(c, 'canvas_remove_added_story', { p_story: added });
    expect(error, `${who} must be refused`).not.toBeNull();
  }
  expect(stIds(await getCanvas(cO)), 'still there after the refused removals').toContain(added);

  await okRpc(cA2, 'canvas_remove_added_story', { p_story: added }, 'A2 removes');
  expect(stIds(await getCanvas(cO))).not.toContain(added);
  expect(stIds(await getCanvas(cA2))).not.toContain(added);
  const rec = await supabaseAdmin.from('canvas_added_stories').select('id').eq('story_id', added);
  expect(rec.data).toEqual([]);
  const story = await supabaseAdmin.from('stories').select('author_id,visibility').eq('id', added).single();
  expect(story.data).toEqual({ author_id: A2.user.id, visibility: 'private' });
  const again = await rpc(cA2, 'canvas_remove_added_story', { p_story: added });
  expect(again.error, 'a second removal finds nothing').not.toBeNull();
});

test('Closed surfaces: the new tables and internal functions are unreachable to clients; unknown or missing rows fail closed', async () => {
  const rec = await supabaseAdmin.from('canvases').select('id').eq('owner_id', O.user.id).eq('name', NAME).single();
  const canvasId = rec.data!.id as string;
  const entry = await supabaseAdmin.from('canvas_audience').select('id').eq('canvas_id', canvasId).eq('event_id', E1.id).single();
  const entryId = entry.data!.id as string;

  // Tables: CONTROL the service role reads each; a signed-in or signed-out client gets an error (no privilege), not rows.
  for (const table of ['canvases', 'canvas_audience', 'canvas_added_stories', 'event_removals']) {
    const control = await supabaseAdmin.from(table).select('*').limit(1);
    expect(control.error, `CONTROL service role reads ${table}`).toBeNull();
    for (const [who, c] of [['owner', cO], ['host', cH], ['attendee', cA], ['signed out', V]] as const) {
      const r = await c.from(table).select('*').limit(1);
      expect(r.error, `${who} must not read ${table}`).not.toBeNull();
      expect(r.data ?? []).toEqual([]);
    }
  }
  const forgedRemoval = await cH.from('event_removals').insert({ event_id: E3.id, user_id: A.user.id, removed_by: H.user.id });
  expect(forgedRemoval.error, 'not even the host writes event_removals directly').not.toBeNull();
  const forgedCanvas = await cA.from('canvases').insert({ owner_id: A.user.id, name: 'forged' });
  expect(forgedCanvas.error).not.toBeNull();
  const forgedAdded = await cA.from('canvas_added_stories').insert({ canvas_id: canvasId, point_id: P_priv, story_id: S_a_direct, author_id: A.user.id });
  expect(forgedAdded.error, 'a story cannot be attached to a canvas except through the checked function').not.toBeNull();

  // Internal functions: not executable by any client role.
  const internal: Array<[string, Record<string, unknown>]> = [
    ['_canvas_can_read', { p_canvas: canvasId, p_uid: O.user.id }],
    ['_canvas_admitted_via', { p_canvas: canvasId, p_uid: A.user.id }],
    ['_canvas_entry_admits', { p_entry: entryId, p_uid: A.user.id }],
    ['_canvas_event_admits', { p_event: E1.id, p_uid: A.user.id }],
    ['_canvas_group_admits', { p_org: Y.id, p_uid: G.user.id }],
    ['_canvas_target_admits', { p_kind: 'event', p_event: E1.id, p_org: null, p_uid: A.user.id }],
    ['_canvas_point_in', { p_owner: O.user.id, p_name: NAME, p_point: P_priv }],
    ['_canvas_box_tags', {}],
  ];
  for (const [fn, args] of internal) {
    const control = await supabaseAdmin.rpc(fn, args);
    expect(control.error, `CONTROL service role can call ${fn}`).toBeNull();
    for (const [who, c] of [['owner', cO], ['attendee', cA], ['signed out', V]] as const) {
      const r = await c.rpc(fn, args);
      expect(r.error, `${who} must not execute ${fn}`).not.toBeNull();
      expect(r.data).toBeNull();
    }
  }
  expect((await supabaseAdmin.rpc('_canvas_can_read', { p_canvas: canvasId, p_uid: O.user.id })).data).toBe(true);
  expect((await supabaseAdmin.rpc('_canvas_event_admits', { p_event: E1.id, p_uid: A.user.id })).data).toBe(true);

  // Client write/read functions: closed to signed-out callers (get_canvas alone is open, tested everywhere above).
  const writes: Array<[string, Record<string, unknown>]> = [
    ['canvas_set_position', { p_owner: O.user.id, p_name: NAME, p_point: P_pub, p_position: 'agree', p_reasoning: null }],
    ['canvas_remove_position', { p_owner: O.user.id, p_name: NAME, p_point: P_pub }],
    ['canvas_add_story', { p_owner: O.user.id, p_name: NAME, p_point: P_pub, p_content: 'x' }],
    ['canvas_remove_added_story', { p_story: S_a_direct }],
    ['share_canvas', { p_name: NAME, p_kind: 'event', p_target: E1.id }],
    ['unshare_canvas', { p_name: NAME, p_kind: 'event', p_target: E1.id }],
    ['get_canvas_audience', { p_name: NAME }],
    ['remove_event_attendee', { p_event: E1.id, p_user: A.user.id }],
    ['list_canvases_shared_with_event', { p_event: E1.id }],
  ];
  for (const [fn, args] of writes) {
    const r = await V.rpc(fn, args);
    expect(r.error, `signed out must not execute ${fn}`).not.toBeNull();
  }

  // Fails closed.
  const fresh = '00000000-0000-0000-0000-0000000000aa';
  expect((await supabaseAdmin.rpc('_canvas_can_read', { p_canvas: fresh, p_uid: O.user.id })).data, 'missing canvas').toBe(false);
  expect((await supabaseAdmin.rpc('_canvas_can_read', { p_canvas: canvasId, p_uid: null })).data, 'null person').toBe(false);
  expect((await supabaseAdmin.rpc('_canvas_entry_admits', { p_entry: fresh, p_uid: A.user.id })).data, 'missing entry').toBe(false);
  expect((await supabaseAdmin.rpc('_canvas_event_admits', { p_event: fresh, p_uid: A.user.id })).data, 'missing event').toBe(false);
  expect((await supabaseAdmin.rpc('_canvas_event_admits', { p_event: E1.id, p_uid: null })).data, 'null person at an event').toBe(false);
  expect((await supabaseAdmin.rpc('_canvas_group_admits', { p_org: Y.id, p_uid: null })).data, 'null person in a group').toBe(false);
  expect((await supabaseAdmin.rpc('_canvas_target_admits', { p_kind: 'link', p_event: E1.id, p_org: Y.id, p_uid: A.user.id })).data, 'unknown kind').toBe(false);
  const badKind = await supabaseAdmin.from('canvas_audience').insert({ canvas_id: canvasId, kind: 'link', event_id: E1.id });
  expect(badKind.error, 'an unknown kind cannot even be stored').not.toBeNull();
  const both = await supabaseAdmin.from('canvas_audience').insert({ canvas_id: canvasId, kind: 'event', event_id: E3.id, org_id: Z.id });
  expect(both.error, 'an entry names exactly one target').not.toBeNull();
});
