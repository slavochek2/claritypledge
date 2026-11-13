/**
 * P1631 M2: a point published to a chat cannot be carried into a letter (migration 20261112210000_p1631_letter_path.sql) on the test database.
 *   npm run test:integration -- src/tests/integration/p1631-letter-path.test.ts
 * Fixtures: a 1:1 A-B (the chat the point is published into) and an outsider C. The draft/publish helpers are copied from p1631-publish.test.ts.
 * Run only after the migration is applied. Cases:
 *   (1) A publishes a point into the A-B chat, then seals a letter whose story links it: the snapshot does not list the point, and the seal still succeeds.
 *   (2) A letter sealed BEFORE the publish still holds the point in its snapshot; once it is published, a token response from C is refused (false) and writes
 *       neither letter_point_responses nor point_positions.
 *   (3) control: a private point of A that was never published is still in a snapshot and still takes a token response (the guard is not a blanket refusal).
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1631 letter ${RUN}`;
const noSession = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, noSession);
const A = admin as unknown as SupabaseClient;

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

const users: TestUser[] = [];
async function mk(label: string) {
  const u = await createTestUser({ name: `P1631 letter ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u), id: u.user.id as string };
}
type Who = Awaited<ReturnType<typeof mk>>;

let a: Who;
let b: Who;
let c3: Who;
let conv: string;
const letterIds: string[] = [];
const docIds: string[] = [];
const storyIds: string[] = [];

async function dm(x: Who, y: Who): Promise<string> {
  const [lo, hi] = [x.id, y.id].sort();
  const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: x.id }).select('id').single();
  if (made.error) throw new Error(`fixture dm: ${made.error.message}`);
  return made.data.id as string;
}
const draftRow = async (id: string) => (await admin.from('clarify_drafts').select('*').eq('id', id).single()).data as Row;
const goodResult = (stmt: string, ids: { a?: string[]; b?: string[] } = {}) => ({ decision: 'draft', statement: stmt, cited: { a: ids.a ?? [], b: ids.b ?? [] } });

/** A's done draft on a pressed message: a private point of A. */
async function madeDraft(source: string, label: string) {
  await admin.from('mirror_ai_spend').delete().eq('owner_id', a.id).eq('bucket', 'canvas');
  const s = await ok(a.c, 'clarify_start', { p_source: source });
  if (s.status !== 'started') throw new Error(`clarify_start answered ${s.status}`);
  await ok(A, '_clarify_begin', { p_draft: s.draft_id });
  const run = (await draftRow(s.draft_id)).spend_id as string | null;
  const done = await ok(A, '_clarify_complete', { p_draft: s.draft_id, p_result: goodResult(`${TAG} ${label}`, { a: [source] }), p_usd: 0.01, p_run: run });
  if (done.status !== 'done') throw new Error(`complete answered ${JSON.stringify(done)}`);
  // Publish requires the owner's position (clarify_publish refuses no_position), as madeDraft in p1631-publish.test.ts sets it
  const up = await a.c.from('point_positions').upsert({ point_id: done.point_id, user_id: a.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
  if (up.error) throw new Error(`position: ${up.error.message}`);
  return { draft: s.draft_id as string, point: done.point_id as string };
}
/** An ordinary private point of A: not a Clarify draft, never published. */
async function loneThing(label: string): Promise<string> {
  const r = await admin.from('points').insert({ statement: `${TAG} lone ${label}`, first_validator_id: a.id, visibility: 'private' }).select('id').single();
  if (r.error) throw new Error(`fixture point: ${r.error.message}`);
  return r.data.id as string;
}
const shares = async (point: string) => (await admin.from('point_chat_shares').select('*').eq('point_id', point)).data as Row[];

/** A doc with one story (A's) that links `point`; returns the doc id. */
async function docWithPoint(point: string, label: string, existingStory?: string): Promise<{ doc: string; story: string }> {
  // story_points is unique per (author, point): a second doc for the same point reuses the story that already links it
  let storyId = existingStory;
  if (!storyId) {
    const made = await admin.from('stories').insert({ author_id: a.id, content: `${TAG} story ${label}`, visibility: 'private' }).select('id').single();
    if (made.error) throw new Error(`fixture story: ${made.error.message}`);
    storyId = made.data.id as string;
    storyIds.push(storyId);
    const sp = await admin.from('story_points').insert({ story_id: storyId, point_id: point, author_id: a.id });
    if (sp.error) throw new Error(`fixture story_points: ${sp.error.message}`);
  }
  const st = { data: { id: storyId } };
  const d = await admin.from('clarity_docs').insert({ owner_id: a.id, title: `${TAG} doc ${label}`, visibility: 'private' }).select('id').single();
  if (d.error) throw new Error(`fixture doc: ${d.error.message}`);
  docIds.push(d.data.id);
  const ds = await admin.from('doc_stories').insert({ doc_id: d.data.id, story_id: st.data.id, position: 0, point_config: { order: [] } });
  if (ds.error) throw new Error(`fixture doc_stories: ${ds.error.message}`);
  return { doc: d.data.id as string, story: st.data.id as string };
}

/** A creates and seals a one-to-one letter on `doc` for a made-up email; returns the letter id and its delivery token. */
async function seal(doc: string, label: string): Promise<{ letter: string; token: string }> {
  const l = await a.c.from('clarity_letters').insert({ source_doc_id: doc, sender_id: a.id, mode: 'one-to-one' }).select('id').single();
  if (l.error) throw new Error(`fixture letter: ${l.error.message}`);
  letterIds.push(l.data.id);
  const sealed = await ok(a.c, 'seal_and_send_letter', {
    p_letter_id: l.data.id,
    p_predictions: [],
    p_deliveries: [{ receiver_email: `p1631-letter-${label}-${RUN}@example.com`, receiver_name: 'Reader' }],
    p_responses_mode: 'invite',
  });
  expect(sealed).toMatchObject({ sealed: true });
  const dl = await admin.from('letter_deliveries').select('invitation_token').eq('letter_id', l.data.id).single();
  if (dl.error) throw new Error(`fixture delivery: ${dl.error.message}`);
  return { letter: l.data.id as string, token: dl.data.invitation_token as string };
}
const snapshotPointIds = async (letter: string): Promise<string[]> => {
  const { data } = await admin.from('letter_story_snapshots').select('point_config').eq('letter_id', letter);
  return ((data ?? []) as Row[]).flatMap((r) => ((r.point_config?.points ?? []) as Row[]).map((p) => p.id as string));
};

beforeAll(async () => {
  a = await mk('A');
  b = await mk('B');
  c3 = await mk('C');
  conv = await dm(a, b);
}, 120_000);

afterAll(async () => {
  const ids = users.map((u) => u.user.id);
  for (const id of letterIds) {
    await admin.from('letter_point_responses').delete().in('delivery_id', ((await admin.from('letter_deliveries').select('id').eq('letter_id', id)).data ?? []).map((r: Row) => r.id));
    await admin.from('letter_deliveries').delete().eq('letter_id', id);
    await admin.from('letter_story_snapshots').delete().eq('letter_id', id);
    await admin.from('clarity_letters').delete().eq('id', id);
  }
  for (const id of docIds) {
    await admin.from('doc_stories').delete().eq('doc_id', id);
    await admin.from('clarity_docs').delete().eq('id', id);
  }
  await admin.from('stories').delete().in('id', storyIds);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
  await deleteTestUsers(ids);
}, 300_000);

describe('P1631 M2: a chat-published point stays out of letters', () => {
  let shared: { draft: string; point: string };
  let early: { letter: string; token: string };
  let sharedStory: string;

  beforeAll(async () => {
    const src1 = await ok(b.c, 'send_chat_message', { p_conversation: conv, p_body: `${TAG} first message`, p_client_id: randomUUID() });
    const src2 = await ok(b.c, 'send_chat_message', { p_conversation: conv, p_body: `${TAG} second message`, p_client_id: randomUUID() });
    shared = await madeDraft(src1.id, 'shared point');
    await madeDraft(src2.id, 'plain point'); // a second, unpublished draft in the same chat (fixture only)
    // a letter sealed BEFORE the publish holds the shared point in its snapshot (the state of every letter sealed before this migration)
    const d1 = await docWithPoint(shared.point, 'early');
    sharedStory = d1.story;
    early = await seal(d1.doc, 'early');
    // since 20261112240000 a seal leaves a Clarify point out; hold it in the snapshot as a letter sealed before that migration would
    const esnap = await admin.from('letter_story_snapshots').select('story_id, point_config').eq('letter_id', early.letter).single();
    if (esnap.error) throw new Error(`fixture snapshot: ${esnap.error.message}`);
    const ecfg = esnap.data.point_config as Row;
    ecfg.points = [...(ecfg.points ?? []), { id: shared.point, text: `${TAG} old snapshot entry`, visibility: 'private', hidden: false }];
    const eput = await admin.from('letter_story_snapshots').update({ point_config: ecfg }).eq('letter_id', early.letter).eq('story_id', esnap.data.story_id);
    if (eput.error) throw new Error(`fixture snapshot update: ${eput.error.message}`);
    expect(await snapshotPointIds(early.letter)).toContain(shared.point);
    const pub = await ok(a.c, 'clarify_publish', { p_draft: shared.draft, p_client_id: randomUUID() });
    expect(pub).toMatchObject({ status: 'published', conversation_id: conv });
    expect(await shares(shared.point)).toHaveLength(1);
  }, 120_000);

  it('(1) a letter sealed after the publish seals, and its snapshot does not list the published point', async () => {
    const d = await docWithPoint(shared.point, 'late', sharedStory);
    const { letter } = await seal(d.doc, 'late');
    const snap = await admin.from('letter_story_snapshots').select('story_id').eq('letter_id', letter);
    expect(snap.error).toBeNull();
    expect(snap.data ?? []).toHaveLength(1); // the story is still in the letter
    expect(await snapshotPointIds(letter)).not.toContain(shared.point);
  }, 60_000);

  it('(2) a token response on a published point is refused and writes nothing, even from a letter sealed before the publish', async () => {
    const r = await rpc(c3.c, 'submit_point_response_by_token', { p_token: early.token, p_point_id: shared.point, p_position: 'agree' });
    expect(r.error).toBeNull();
    expect(r.data).toBe(false);
    const dl = await admin.from('letter_deliveries').select('id').eq('invitation_token', early.token).single();
    const lpr = await admin.from('letter_point_responses').select('id').eq('delivery_id', dl.data!.id).eq('point_id', shared.point);
    expect(lpr.data ?? []).toHaveLength(0);
    const pp = await admin.from('point_positions').select('user_id').eq('point_id', shared.point).eq('user_id', c3.id);
    expect(pp.data ?? []).toHaveLength(0);
  });

  it('(3) control: a private point that is neither published nor a Clarify point is still in a snapshot and still takes a token response', async () => {
    // (a Clarify draft point is refused since 20261112240000, so the control is an ordinary private point of A, as p1631-publish.test.ts builds one)
    const lone = await loneThing('plain');
    expect(await shares(lone)).toHaveLength(0);
    const d = await docWithPoint(lone, 'plain');
    const { letter, token } = await seal(d.doc, 'plain');
    expect(await snapshotPointIds(letter)).toContain(lone);
    const r = await rpc(c3.c, 'submit_point_response_by_token', { p_token: token, p_point_id: lone, p_position: 'agree' });
    expect(r.error).toBeNull();
    expect(r.data).toBe(true);
  }, 60_000);
});

// migration 20261112240000_p1631_adversary_fixes.sql
describe('P1631 adversary fixes: Clarify points and unrelated answers stay out of letters', () => {
  /** addresses the delivery to `reader` (claim_letter_delivery needs the confirmed email to match) and claims it */
  async function claim(reader: Who, token: string): Promise<string> {
    const up = await admin.from('letter_deliveries').update({ receiver_email: reader.u.email }).eq('invitation_token', token);
    if (up.error) throw new Error(`fixture receiver_email: ${up.error.message}`);
    const claimed = await ok(reader.c, 'claim_letter_delivery', { p_token: token });
    expect(claimed, 'the claim succeeded').toMatchObject({ claimed: true });
    return (await admin.from('letter_deliveries').select('id').eq('invitation_token', token).single()).data!.id as string;
  }
  const position = async (point: string, who: Who) => (await admin.from('point_positions').select('user_id').eq('point_id', point).eq('user_id', who.id)).data ?? [];

  it('a Clarify draft point, published or not, is left out of a new letter, refused by the token response and skipped by the replay', async () => {
    const reader = await mk('ReaderClarify');
    const src = await ok(b.c, 'send_chat_message', { p_conversation: conv, p_body: `${TAG} clarify point source`, p_client_id: randomUUID() });
    const draft = await madeDraft(src.id, 'unpublished clarify point');
    expect(await shares(draft.point)).toHaveLength(0);
    // a new letter: the sealed snapshot does not list the unpublished draft point, and the letter still seals
    const d = await docWithPoint(draft.point, 'adv-clarify');
    const { letter, token } = await seal(d.doc, 'adv-clarify');
    expect(await snapshotPointIds(letter)).not.toContain(draft.point);
    // a letter sealed BEFORE this migration may already hold the point: put it into the snapshot as the old seal would have
    const snap = await admin.from('letter_story_snapshots').select('story_id, point_config').eq('letter_id', letter).single();
    if (snap.error) throw new Error(`fixture snapshot: ${snap.error.message}`);
    const cfg = snap.data.point_config as Row;
    cfg.points = [...(cfg.points ?? []), { id: draft.point, text: `${TAG} old snapshot entry`, visibility: 'private', hidden: false }];
    const put = await admin.from('letter_story_snapshots').update({ point_config: cfg }).eq('letter_id', letter).eq('story_id', snap.data.story_id);
    if (put.error) throw new Error(`fixture snapshot update: ${put.error.message}`);
    // the token response is refused and writes nothing (a signed-in responder would otherwise get a position written as the table owner)
    const r = await rpc(c3.c, 'submit_point_response_by_token', { p_token: token, p_point_id: draft.point, p_position: 'agree' });
    expect(r.error).toBeNull();
    expect(r.data).toBe(false);
    expect(await position(draft.point, c3)).toHaveLength(0);
    // a staged answer for it is not replayed
    const delivery = await claim(reader, token);
    const staged = await admin.from('letter_point_responses').insert({ delivery_id: delivery, point_id: draft.point, position: 'agree' });
    if (staged.error) throw new Error(`fixture staged answer: ${staged.error.message}`);
    await ok(reader.c, 'replay_letter_positions');
    expect(await position(draft.point, reader)).toHaveLength(0);
    // publishing it changes nothing about that
    expect((await ok(a.c, 'clarify_publish', { p_draft: draft.draft, p_client_id: randomUUID() })).status).toBe('published');
    expect((await rpc(c3.c, 'submit_point_response_by_token', { p_token: token, p_point_id: draft.point, p_position: 'agree' })).data).toBe(false);
    await ok(reader.c, 'replay_letter_positions');
    expect(await position(draft.point, reader)).toHaveLength(0);
  }, 120_000);

  it('replay copies only answers for points in that delivery\'s sealed letter: a staged row for a point outside it is not copied', async () => {
    const reader = await mk('ReaderOutside');
    const inside = await loneThing('inside the letter');
    const outside = await loneThing('outside the letter');
    const d = await docWithPoint(inside, 'adv-outside');
    const { letter, token } = await seal(d.doc, 'adv-outside');
    expect(await snapshotPointIds(letter)).toContain(inside);
    expect(await snapshotPointIds(letter)).not.toContain(outside);
    const delivery = await claim(reader, token);
    // the staging policy only checks that the delivery is the caller's, so a recipient can stage any point id
    const stagedIn = await reader.c.from('letter_point_responses').insert({ delivery_id: delivery, point_id: inside, position: 'agree' });
    const stagedOut = await reader.c.from('letter_point_responses').insert({ delivery_id: delivery, point_id: outside, position: 'agree' });
    expect(stagedIn.error, 'staging a point of the letter works').toBeNull();
    // whether the client policy admits the foreign point or not, the replay must not copy it; seed it as the table owner so the test does not depend on the policy
    if (stagedOut.error) {
      const seeded = await admin.from('letter_point_responses').insert({ delivery_id: delivery, point_id: outside, position: 'agree' });
      if (seeded.error) throw new Error(`fixture staged outside answer: ${seeded.error.message}`);
    }
    await ok(reader.c, 'replay_letter_positions');
    expect(await position(inside, reader), 'control: the answer for a point of the letter is replayed').toHaveLength(1);
    expect(await position(outside, reader), 'the answer for a point outside the letter is not').toHaveLength(0);
  }, 120_000);
});

// migration 20261112250000_p1631_event_only_exclusion.sql (N2)
describe('P1631 event-only exclusion: one malformed snapshot does not fail the replay', () => {
  it('a recipient with a letter whose snapshot `points` is malformed still has the valid answers replayed', async () => {
    const reader = await mk('ReaderMalformed');
    const good = await loneThing('replay valid');
    const other = await loneThing('replay in the broken letter');
    // two letters to the same recipient: a sound one, and one whose snapshot is then damaged the way a legacy row could be
    const dg = await docWithPoint(good, 'malformed-good');
    const lg = await seal(dg.doc, 'malformed-good');
    const dBad = await docWithPoint(other, 'malformed-bad');
    const lb = await seal(dBad.doc, 'malformed-bad');
    for (const [tok, pt] of [[lg.token, good], [lb.token, other]] as const) {
      const up = await admin.from('letter_deliveries').update({ receiver_email: reader.u.email }).eq('invitation_token', tok);
      if (up.error) throw new Error(`fixture receiver_email: ${up.error.message}`);
      const claimed = await ok(reader.c, 'claim_letter_delivery', { p_token: tok });
      expect(claimed, 'the claim succeeded').toMatchObject({ claimed: true });
      const dl = await admin.from('letter_deliveries').select('id').eq('invitation_token', tok).single();
      const staged = await admin.from('letter_point_responses').insert({ delivery_id: dl.data!.id, point_id: pt, position: 'agree' });
      if (staged.error) throw new Error(`fixture staged answer: ${staged.error.message}`);
    }
    // damage: `points` becomes a scalar in the second letter's snapshot (jsonb_array_elements on it would raise)
    const snap = await admin.from('letter_story_snapshots').select('story_id, point_config').eq('letter_id', lb.letter).single();
    if (snap.error) throw new Error(`fixture snapshot: ${snap.error.message}`);
    const cfg = { ...(snap.data.point_config as Row), points: 'not an array' };
    const put = await admin.from('letter_story_snapshots').update({ point_config: cfg }).eq('letter_id', lb.letter).eq('story_id', snap.data.story_id);
    if (put.error) throw new Error(`fixture snapshot update: ${put.error.message}`);
    const replay = await rpc(reader.c, 'replay_letter_positions');
    expect(replay.error, 'the replay does not raise').toBeNull();
    const rows = async (pt: string) => (await admin.from('point_positions').select('user_id').eq('point_id', pt).eq('user_id', reader.id)).data ?? [];
    expect(await rows(good), 'the answer in the sound letter is replayed').toHaveLength(1);
    expect(await rows(other), 'the answer in the damaged letter is not (its snapshot lists no point)').toHaveLength(0);
  }, 120_000);
});

// migration 20261112230000_p1631_review_fixes.sql: replay_letter_positions skips a chat-published point
describe('P1631 review fixes: a staged letter answer is not replayed onto a point published afterwards', () => {
  it('an anonymous answer staged before the publish is not replayed to the claimer; an unpublished control point is', async () => {
    const reader = await mk('Reader'); // createTestUser makes a verified profile, which replay_letter_positions requires
    const src1 = await ok(b.c, 'send_chat_message', { p_conversation: conv, p_body: `${TAG} replay one`, p_client_id: randomUUID() });
    const target = await madeDraft(src1.id, 'replay target');
    // the control is an ordinary private point (a Clarify draft point is skipped by the replay since 20261112240000)
    const control = { point: await loneThing('replay control') };
    // two letters, each sealed while its point is still unpublished
    const dt = await docWithPoint(target.point, 'replay-target');
    const lt = await seal(dt.doc, 'replay-target');
    const dc = await docWithPoint(control.point, 'replay-control');
    const lc = await seal(dc.doc, 'replay-control');
    // since 20261112240000 a new seal leaves a Clarify point out of the snapshot; put the target in as a letter sealed before that migration would hold it
    const tsnap = await admin.from('letter_story_snapshots').select('story_id, point_config').eq('letter_id', lt.letter).single();
    if (tsnap.error) throw new Error(`fixture snapshot: ${tsnap.error.message}`);
    const tcfg = tsnap.data.point_config as Row;
    tcfg.points = [...(tcfg.points ?? []), { id: target.point, text: `${TAG} old snapshot entry`, visibility: 'private', hidden: false }];
    const tput = await admin.from('letter_story_snapshots').update({ point_config: tcfg }).eq('letter_id', lt.letter).eq('story_id', tsnap.data.story_id);
    if (tput.error) throw new Error(`fixture snapshot update: ${tput.error.message}`);
    // the anonymous recipient's answers are staged in letter_point_responses, no position yet (auth.uid() is NULL). The control goes through the token link;
    // the Clarify target is refused by the token response now, so its staged answer is seeded as the table owner (a recipient can stage any point id)
    const anon = createClient(URL_, ANON, noSession);
    const rc = await rpc(anon, 'submit_point_response_by_token', { p_token: lc.token, p_point_id: control.point, p_position: 'agree' });
    expect(rc.error).toBeNull();
    expect(rc.data).toBe(true);
    const tdl = await admin.from('letter_deliveries').select('id').eq('invitation_token', lt.token).single();
    const seededT = await admin.from('letter_point_responses').insert({ delivery_id: tdl.data!.id, point_id: target.point, position: 'agree' });
    if (seededT.error) throw new Error(`fixture staged target answer: ${seededT.error.message}`);
    for (const pt of [target.point, control.point]) {
      expect((await admin.from('point_positions').select('user_id').eq('point_id', pt).eq('user_id', reader.id)).data ?? []).toHaveLength(0);
    }
    // the owner now publishes the target into the chat
    const pub = await ok(a.c, 'clarify_publish', { p_draft: target.draft, p_client_id: randomUUID() });
    expect(pub.status).toBe('published');
    // The Clarify guard (clarify_drafts row) and the snapshot guard would each skip the target on their own. This case is about the SHARE guard of 20261112230000,
    // so the draft row is unlinked from the point (point_id NULL, what deleting the point's draft does): only the point_chat_shares row remains to skip it.
    expect(await shares(target.point)).toHaveLength(1);
    const unlink = await admin.from('clarify_drafts').update({ point_id: null }).eq('id', target.draft);
    if (unlink.error) throw new Error(`fixture unlink draft: ${unlink.error.message}`);
    expect((await admin.from('clarify_drafts').select('id').eq('point_id', target.point)).data ?? []).toHaveLength(0);
    // the recipient signs in, claims both deliveries and replays
    // claim_letter_delivery (P1487) admits only the account whose confirmed email is the delivery's address: address both deliveries to the reader
    for (const tok of [lt.token, lc.token]) {
      const up = await admin.from('letter_deliveries').update({ receiver_email: reader.u.email }).eq('invitation_token', tok);
      if (up.error) throw new Error(`fixture receiver_email: ${up.error.message}`);
      const claimed = await ok(reader.c, 'claim_letter_delivery', { p_token: tok });
      expect(claimed, 'the claim succeeded').toMatchObject({ claimed: true });
      expect((await admin.from('letter_deliveries').select('receiver_profile_id').eq('invitation_token', tok).single()).data?.receiver_profile_id).toBe(reader.id);
    }
    await ok(reader.c, 'replay_letter_positions');
    const rows = async (pt: string) => (await admin.from('point_positions').select('user_id').eq('point_id', pt).eq('user_id', reader.id)).data ?? [];
    expect(await rows(control.point), 'control: the replay still writes an unpublished point').toHaveLength(1);
    expect(await rows(target.point), 'no position from outside the chat lands on the chat-published point').toHaveLength(0);
    // the staged answer itself is kept
    const dl = await admin.from('letter_deliveries').select('id').eq('invitation_token', lt.token).single();
    expect(((await admin.from('letter_point_responses').select('id').eq('delivery_id', dl.data!.id).eq('point_id', target.point)).data ?? [])).toHaveLength(1);
  }, 120_000);
});
