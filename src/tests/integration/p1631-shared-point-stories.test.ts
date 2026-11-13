/**
 * P1631: stories written on a shared point card (migration 20261113110000_p1631_shared_point_stories.sql) on the test database.
 *   npm run test:integration -- src/tests/integration/p1631-shared-point-stories.test.ts
 * Fixture: a DM between A and B in which A publishes a Clarify point (publish fixture copied from p1631-publish.test.ts), a stranger C, and an anonymous client.
 * B writes a story through point_chat_add_story. A reads it, its version and its link; B reads it; C and anonymous do not. An old-path private story on a PUBLIC point stays author-only;
 * a bound story cannot be linked to a second point; deleting the card ends the read.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1631 sps ${RUN}`;
const noSession = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, noSession);
const A = admin as unknown as SupabaseClient;
const anon = createClient(URL_, ANON, noSession);

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
  const u = await createTestUser({ name: `P1631 sps ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u), id: u.user.id as string };
}
type Who = Awaited<ReturnType<typeof mk>>;

let a: Who;
let b: Who;
let c3: Who;
let conv: string;
let cardMsg: string;
let sharedPoint: string;
let story: string; // B's story, written through point_chat_add_story
let aStory: string; // A's story, written through point_chat_add_story
let privatePoint: string; // a private point of B's own, never published
let publicPoint: string;
let publicOnlyStory: string; // B's ordinary private story linked only to a public point
const draftRow = async (id: string) => (await admin.from('clarify_drafts').select('*').eq('id', id).single()).data as Row;

const stories = async (c: SupabaseClient, id: string) => (await c.from('stories').select('id').eq('id', id)).data ?? [];
const versions = async (c: SupabaseClient, id: string) => (await c.from('story_versions').select('id').eq('story_id', id)).data ?? [];
const links = async (c: SupabaseClient, id: string) => (await c.from('story_points').select('point_id').eq('story_id', id)).data ?? [];

beforeAll(async () => {
  a = await mk('A');
  b = await mk('B');
  c3 = await mk('C');
  for (const w of [a, b, c3]) await admin.from('profiles').update({ is_verified: true }).eq('id', w.id);
  const [lo, hi] = [a.id, b.id].sort();
  const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: a.id }).select('id').single();
  if (made.error) throw new Error(`fixture dm: ${made.error.message}`);
  conv = made.data.id as string;
  const src = await ok(b.c, 'send_chat_message', { p_conversation: conv, p_body: `${TAG} wait a month before the pricing change`, p_client_id: randomUUID() });
  await ok(a.c, 'send_chat_message', { p_conversation: conv, p_body: `${TAG} waiting costs us the quarter`, p_client_id: randomUUID() });
  await admin.from('mirror_ai_spend').delete().eq('owner_id', a.id).eq('bucket', 'canvas');
  const s = await ok(a.c, 'clarify_start', { p_source: src.id });
  if (s.status !== 'started') throw new Error(`clarify_start answered ${s.status}`);
  await ok(A, '_clarify_begin', { p_draft: s.draft_id });
  const run = (await draftRow(s.draft_id)).spend_id as string | null;
  const done = await ok(A, '_clarify_complete', {
    p_draft: s.draft_id,
    p_result: { decision: 'draft', statement: `${TAG} point`, cited: { a: [src.id], b: [] } },
    p_usd: 0.01,
    p_run: run,
  });
  if (done.status !== 'done') throw new Error(`complete answered ${JSON.stringify(done)}`);
  sharedPoint = done.point_id as string;
  // Publish requires the owner's position first
  const up = await a.c.from('point_positions').upsert({ point_id: sharedPoint, user_id: a.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
  if (up.error) throw new Error(`position: ${up.error.message}`);
  const pub = await ok(a.c, 'clarify_publish', { p_draft: s.draft_id, p_client_id: randomUUID() });
  expect(pub).toMatchObject({ status: 'published', conversation_id: conv });
  cardMsg = pub.message_id as string;

  story = (await ok(b.c, 'point_chat_add_story', { p_point: sharedPoint, p_message: cardMsg, p_content: `${TAG} story B` })).story_id;

  const pp = await admin.from('points').insert({ statement: `${TAG} B private`, first_validator_id: b.id, visibility: 'private' }).select('id').single();
  if (pp.error) throw new Error(`fixture private point: ${pp.error.message}`);
  privatePoint = pp.data.id as string;
  const pu = await admin.from('points').insert({ statement: `${TAG} public`, first_validator_id: b.id, visibility: 'public' }).select('id').single();
  if (pu.error) throw new Error(`fixture public point: ${pu.error.message}`);
  publicPoint = pu.data.id as string;
  const st = await b.c.from('stories').insert({ author_id: b.id, content: `${TAG} story B public only`, visibility: 'private' }).select('id').single();
  if (st.error) throw new Error(`fixture story: ${st.error.message}`);
  publicOnlyStory = st.data.id as string;
  const l = await b.c.from('story_points').insert({ story_id: publicOnlyStory, point_id: publicPoint, author_id: b.id });
  if (l.error) throw new Error(`fixture public link: ${l.error.message}`);
});

afterAll(async () => {
  const ids = users.map((u) => u.user.id);
  await admin.from('clarity_docs').delete().like('title', `${TAG}%`);
  await admin.from('stories').delete().like('content', `${TAG}%`);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
  await deleteTestUsers(ids);
});

describe('P1631 stories written on a shared point card', () => {
  it('the card\'s other reader A reads B\'s story, its version rows and its link', async () => {
    expect(await stories(a.c, story)).toHaveLength(1);
    expect((await versions(a.c, story)).length).toBeGreaterThan(0);
    expect(await links(a.c, story)).toEqual([{ point_id: sharedPoint }]);
  });

  it('B reads their own story, and it is private and authored by B', async () => {
    const r = await b.c.from('stories').select('author_id, visibility').eq('id', story).single();
    expect(r.data).toMatchObject({ author_id: b.id, visibility: 'private' });
  });

  it('a stranger C and a signed-out reader read nothing of it', async () => {
    for (const who of [c3.c, anon]) {
      expect(await stories(who, story)).toHaveLength(0);
      expect(await versions(who, story)).toHaveLength(0);
      expect(await links(who, story)).toHaveLength(0);
    }
  });

  it('the embedded read the card uses (story_points with its story) returns the story to A', async () => {
    const r = await a.c.from('story_points').select('point_id, story:stories!story_points_story_id_fkey(id, author_id)').eq('point_id', sharedPoint);
    expect(r.error).toBeNull();
    expect((r.data ?? []).map((x: any) => x.story?.id)).toContain(story);
  });

  it('the author A writes one too, and B reads it', async () => {
    aStory = (await ok(a.c, 'point_chat_add_story', { p_point: sharedPoint, p_message: cardMsg, p_content: `${TAG} story A` })).story_id;
    expect(await stories(b.c, aStory)).toHaveLength(1);
    expect(await stories(c3.c, aStory)).toHaveLength(0);
  });

  it('refusals: a stranger, a signed-out caller, a public point, an unpublished private point, an empty story', async () => {
    const args = (p: string, content: string, m: string = cardMsg) => ({ p_point: p, p_message: m, p_content: content });
    expect((await rpc(c3.c, 'point_chat_add_story', args(sharedPoint, `${TAG} x`))).error?.code).toBe('42501');
    expect((await rpc(anon, 'point_chat_add_story', args(sharedPoint, `${TAG} x`))).error).toBeTruthy();
    expect((await rpc(b.c, 'point_chat_add_story', args(publicPoint, `${TAG} x`))).error?.code).toBe('42501');
    expect((await rpc(b.c, 'point_chat_add_story', args(privatePoint, `${TAG} x`))).error?.code).toBe('42501');
    // a message that is not a card of this point, and a card id that does not exist
    expect((await rpc(b.c, 'point_chat_add_story', args(sharedPoint, `${TAG} x`, randomUUID()))).error?.code).toBe('42501');
    expect((await rpc(b.c, 'point_chat_add_story', args(sharedPoint, '   '))).error?.code).toBe('22023');
    // the old three-argument form is gone
    expect((await rpc(b.c, 'point_chat_add_story', { p_point: sharedPoint, p_content: `${TAG} x` })).error).toBeTruthy();
  });

  it('a bound story cannot be put in a letter (doc_stories), by its author, on insert', async () => {
    const doc = await admin.from('clarity_docs').insert({ owner_id: b.id, title: `${TAG} doc`, visibility: 'private' }).select('id').single();
    expect(doc.error).toBeNull();
    const r = await b.c.from('doc_stories').insert({ doc_id: doc.data!.id, story_id: story, position: 0 });
    expect(r.error, 'the trigger refuses a bound story').toBeTruthy();
    expect((await admin.from('doc_stories').select('story_id').eq('story_id', story)).data).toHaveLength(0);
    // an ordinary story of the same author still goes in
    const ok2 = await b.c.from('doc_stories').insert({ doc_id: doc.data!.id, story_id: publicOnlyStory, position: 0 });
    expect(ok2.error).toBeNull();
  });

  it('_chat_story_link_ok reveals nothing about another person\'s story: true for a non-author, false only for the author linking elsewhere', async () => {
    expect((await rpc(c3.c, '_chat_story_link_ok', { p_story: story, p_point: privatePoint })).data).toBe(true);
    expect((await rpc(a.c, '_chat_story_link_ok', { p_story: story, p_point: privatePoint })).data).toBe(true);
    expect((await rpc(b.c, '_chat_story_link_ok', { p_story: story, p_point: privatePoint })).data).toBe(false);
    expect((await rpc(b.c, '_chat_story_link_ok', { p_story: story, p_point: sharedPoint })).data).toBe(true);
  });

  it('the client has no privilege on point_chat_stories', async () => {
    expect((await b.c.from('point_chat_stories').select('story_id')).error).toBeTruthy();
    expect((await b.c.from('point_chat_stories').insert({ story_id: publicOnlyStory, point_id: sharedPoint })).error).toBeTruthy();
    expect((await a.c.from('stories').select('id').eq('id', publicOnlyStory)).data).toHaveLength(0);
  });

  it('an ordinary private story linked only to a public point stays author-only', async () => {
    expect(await stories(b.c, publicOnlyStory)).toHaveLength(1);
    for (const who of [a.c, c3.c, anon]) {
      expect(await stories(who, publicOnlyStory)).toHaveLength(0);
      expect(await versions(who, publicOnlyStory)).toHaveLength(0);
      expect(await links(who, publicOnlyStory)).toHaveLength(0);
    }
  });

  it('no bridging: the author cannot link a bound story to a second point', async () => {
    for (const p of [privatePoint, publicPoint]) {
      const r = await b.c.from('story_points').insert({ story_id: story, point_id: p, author_id: b.id });
      expect(r.error, 'a bound story links only to its own point').toBeTruthy();
    }
    expect(await links(b.c, story)).toEqual([{ point_id: sharedPoint }]);
  });

  it('visibility of a bound story cannot be changed', async () => {
    const r = await b.c.from('stories').update({ visibility: 'public' }).eq('id', story);
    expect(r.error).toBeTruthy();
    expect((await admin.from('stories').select('visibility').eq('id', story).single()).data?.visibility).toBe('private');
  });

  it('reading a story makes nothing else readable: A still cannot read B\'s unpublished private point', async () => {
    expect((await a.c.from('points').select('id').eq('id', privatePoint)).data).toHaveLength(0);
  });

  it('after the card message is deleted each reader loses the OTHER person\'s story and keeps their own', async () => {
    await ok(a.c, 'delete_chat_message', { p_message: cardMsg });
    // B's story: A loses it (rows, versions, link); B keeps it
    expect(await stories(a.c, story)).toHaveLength(0);
    expect(await versions(a.c, story)).toHaveLength(0);
    expect(await links(a.c, story)).toHaveLength(0);
    expect(await stories(b.c, story)).toHaveLength(1);
    // A's story: B loses it; A keeps it as its author
    expect(await stories(b.c, aStory)).toHaveLength(0);
    expect(await versions(b.c, aStory)).toHaveLength(0);
    expect(await links(b.c, aStory)).toHaveLength(0);
    expect(await stories(a.c, aStory)).toHaveLength(1);
  });

  it('the binding is a durable marker: the row survives a physical card delete (message_id NULL) and the letter and link paths stay closed', async () => {
    const gone = await admin.from('chat_messages').delete().eq('id', cardMsg);
    expect(gone.error).toBeNull();
    const row = await admin.from('point_chat_stories').select('story_id, message_id, point_id').eq('story_id', story).single();
    expect(row.error).toBeNull();
    expect(row.data?.message_id).toBeNull();
    expect(await stories(a.c, story)).toHaveLength(0);
    const doc = await admin.from('clarity_docs').insert({ owner_id: b.id, title: `${TAG} doc2`, visibility: 'private' }).select('id').single();
    expect(doc.error).toBeNull();
    expect((await b.c.from('doc_stories').insert({ doc_id: doc.data!.id, story_id: story, position: 0 })).error).toBeTruthy();
    expect((await b.c.from('story_points').insert({ story_id: story, point_id: privatePoint, author_id: b.id })).error).toBeTruthy();
    expect((await rpc(b.c, '_chat_story_link_ok', { p_story: story, p_point: privatePoint })).data).toBe(false);
  });

  it('a live calibration session cannot carry a bound story (source_story_id, selectedStoryId, selectedStoryData.id); an ordinary story can', async () => {
    const mkSession = (extra: Row) => admin.from('clarity_sessions').insert({ code: `T${Math.floor(Math.random() * 1e9)}`, creator_name: `${TAG} s`, ...extra }).select('id').single();
    expect((await mkSession({ source_story_id: story })).error, 'source_story_id').toBeTruthy();
    expect((await mkSession({ live_state: { selectedStoryId: story } })).error, 'selectedStoryId').toBeTruthy();
    expect((await mkSession({ live_state: { selectedStoryData: { id: story, content: 'x' } } })).error, 'selectedStoryData.id').toBeTruthy();
    const okRow = await mkSession({ source_story_id: publicOnlyStory, live_state: { selectedStoryId: publicOnlyStory } });
    expect(okRow.error, 'an ordinary story is unaffected').toBeNull();
    if (okRow.data) await admin.from('clarity_sessions').delete().eq('id', okRow.data.id);
  });

  it('my_chat_bound_story_ids returns the caller\'s own bound stories only', async () => {
    const mine = async (w: Who) => ((await rpc(w.c, 'my_chat_bound_story_ids')).data ?? []) as string[];
    expect(await mine(b)).toContain(story);
    expect(await mine(a)).not.toContain(story);
    expect(await mine(a)).toContain(aStory);
  });

  it('N1: a message that carries the point but is NOT a published share admits no reader; adding the share row admits it', async () => {
    const [lo, hi] = [a.id, c3.id].sort();
    const dmAC = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: a.id }).select('id').single();
    expect(dmAC.error).toBeNull();
    const msg = await admin.from('chat_messages').insert({ conversation_id: dmAC.data!.id, author_id: a.id, kind: 'message', attachment_kind: 'point', attachment_id: sharedPoint }).select('id').single();
    expect(msg.error).toBeNull();
    const st = await admin.from('stories').insert({ author_id: a.id, content: `${TAG} story no share`, visibility: 'private' }).select('id').single();
    expect(st.error).toBeNull();
    const bind = await admin.from('point_chat_stories').insert({ story_id: st.data!.id, point_id: sharedPoint, message_id: msg.data!.id });
    expect(bind.error).toBeNull();
    expect(await stories(c3.c, st.data!.id), 'no share row: C reads nothing').toHaveLength(0);
    const share = await admin.from('point_chat_shares').insert({ message_id: msg.data!.id, point_id: sharedPoint, conversation_id: dmAC.data!.id, shared_by: a.id });
    expect(share.error).toBeNull();
    expect(await stories(c3.c, st.data!.id), 'control: with a share row the same card admits C').toHaveLength(1);
  });
});

// A group: the story follows the CARD. A later joiner who cannot read card 1 must not read its story after the card is deleted and the point is published again (card 2).
describe('P1631 stories follow the card: delete and re-publish in a group', () => {
  let d: Who;
  let org: string;
  let gconv: string;
  let draft: string;
  let point: string;
  let card1: string;
  let card2: string;
  let gstory: string;

  beforeAll(async () => {
    d = await mk('D');
    for (const w of [d]) await admin.from('profiles').update({ is_verified: true }).eq('id', w.id);
    const o = await admin.from('organization').insert({ slug: `p1631-sps-${RUN}`, name: `${TAG} org` }).select('id').single();
    if (o.error) throw new Error(`fixture org: ${o.error.message}`);
    org = o.data.id as string;
    const old = new Date(Date.now() - 3_600_000).toISOString();
    for (const who of [a, b]) {
      const m = await admin.from('membership').insert({ org_id: org, user_id: who.id, accepted_at: old });
      if (m.error) throw new Error(`fixture membership: ${m.error.message}`);
    }
    const have = await admin.from('chat_conversations').select('id').eq('kind', 'group').eq('org_id', org).maybeSingle();
    if (have.data) gconv = have.data.id as string;
    else {
      const g = await admin.from('chat_conversations').insert({ kind: 'group', org_id: org }).select('id').single();
      if (g.error) throw new Error(`fixture group chat: ${g.error.message}`);
      gconv = g.data.id as string;
    }
    const src = await ok(a.c, 'send_chat_message', { p_conversation: gconv, p_body: `${TAG} group message`, p_client_id: randomUUID() });
    await admin.from('mirror_ai_spend').delete().eq('owner_id', a.id).eq('bucket', 'canvas');
    const s = await ok(a.c, 'clarify_start', { p_source: src.id });
    if (s.status !== 'started') throw new Error(`clarify_start answered ${s.status}`);
    draft = s.draft_id as string;
    await ok(A, '_clarify_begin', { p_draft: draft });
    const run = (await draftRow(draft)).spend_id as string | null;
    const done = await ok(A, '_clarify_complete', { p_draft: draft, p_result: { decision: 'draft', statement: `${TAG} group point`, cited: { a: [src.id], b: [] } }, p_usd: 0.01, p_run: run });
    if (done.status !== 'done') throw new Error(`complete answered ${JSON.stringify(done)}`);
    point = done.point_id as string;
    const up = await a.c.from('point_positions').upsert({ point_id: point, user_id: a.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    if (up.error) throw new Error(`position: ${up.error.message}`);
    const pub = await ok(a.c, 'clarify_publish', { p_draft: draft, p_client_id: randomUUID() });
    expect(pub).toMatchObject({ status: 'published', conversation_id: gconv });
    card1 = pub.message_id as string;
    gstory = (await ok(b.c, 'point_chat_add_story', { p_point: point, p_message: card1, p_content: `${TAG} group story B` })).story_id;
    // D joins AFTER card 1
    const dm_ = await admin.from('membership').insert({ org_id: org, user_id: d.id });
    if (dm_.error) throw new Error(`fixture later joiner: ${dm_.error.message}`);
  });

  afterAll(async () => {
    await admin.from('organization').delete().eq('id', org);
  });

  it('before the re-publish: A reads the story (card 1 is live), the later joiner D does not', async () => {
    expect(await stories(a.c, gstory)).toHaveLength(1);
    expect(await stories(d.c, gstory)).toHaveLength(0);
    const refused = await rpc(d.c, 'point_chat_add_story', { p_point: point, p_message: card1, p_content: `${TAG} D tries` });
    expect(refused.error?.code, 'D cannot write on a card posted before D joined').toBe('42501');
  });

  it('after card 1 is deleted and the point is published again, D reads the point on card 2 but NOT the story written on card 1; nobody but its author does', async () => {
    await ok(a.c, 'delete_chat_message', { p_message: card1 });
    const pub = await ok(a.c, 'clarify_publish', { p_draft: draft, p_client_id: randomUUID() });
    expect(pub).toMatchObject({ status: 'published', conversation_id: gconv });
    card2 = pub.message_id as string;
    expect(card2).not.toBe(card1);
    expect((await d.c.from('points').select('id').eq('id', point)).data, 'D reads the point through card 2').toHaveLength(1);
    expect(await stories(d.c, gstory)).toHaveLength(0);
    expect(await versions(d.c, gstory)).toHaveLength(0);
    expect(await links(d.c, gstory)).toHaveLength(0);
    expect(await stories(a.c, gstory), 'the card it was written on is gone: author-only again').toHaveLength(0);
    expect(await stories(b.c, gstory)).toHaveLength(1);
  });

  it('a story cannot be written on the deleted card 1, and card 2 takes new stories', async () => {
    expect((await rpc(b.c, 'point_chat_add_story', { p_point: point, p_message: card1, p_content: `${TAG} late` })).error?.code).toBe('42501');
    const s2 = (await ok(d.c, 'point_chat_add_story', { p_point: point, p_message: card2, p_content: `${TAG} group story D` })).story_id;
    expect(await stories(a.c, s2)).toHaveLength(1);
    expect(await stories(b.c, s2)).toHaveLength(1);
  });
});
