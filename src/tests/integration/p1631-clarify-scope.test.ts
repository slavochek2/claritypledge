/**
 * P1631 Clarify scopes (migration 20261112200000_p1631_clarify_scope.sql) on the test database.
 *   npm run test:integration -- src/tests/integration/p1631-clarify-scope.test.ts
 * Fixtures follow p1631-publish.test.ts: users from createTestUser, chats written with the admin client, drafts begun and completed through the
 * service-role worker functions with hand-written results. The model is never called.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1631 scope ${RUN}`;
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
  const u = await createTestUser({ name: `P1631 scope ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u), id: u.user.id as string };
}
type Who = Awaited<ReturnType<typeof mk>>;

async function dm(x: Who, y: Who): Promise<string> {
  const [lo, hi] = [x.id, y.id].sort();
  const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: x.id }).select('id').single();
  if (made.error) throw new Error(`fixture dm: ${made.error.message}`);
  return made.data.id as string;
}
const eventIds: string[] = [];
/** an event chat where `host` is the host and `guest` has RSVPed (both can read it), as p1631-publish.test.ts builds one */
async function eventChat(host: Who, guest: Who): Promise<string> {
  const e = await admin.from('events').insert({
    slug: `p1631-sc-${RUN}-${eventIds.length}`, title: `${TAG} event`, description: 'x', datetime: new Date(Date.now() + 86_400_000).toISOString(), location: 'x', host_id: host.id,
  }).select('id').single();
  if (e.error) throw new Error(`fixture event: ${e.error.message}`);
  eventIds.push(e.data.id as string);
  const r = await admin.from('event_rsvps').insert({ event_id: e.data.id, profile_id: guest.id });
  if (r.error) throw new Error(`fixture rsvp: ${r.error.message}`);
  const have = await admin.from('chat_conversations').select('id').eq('kind', 'event').eq('event_id', e.data.id).maybeSingle();
  if (have.data?.id) return have.data.id as string;
  const ins = await admin.from('chat_conversations').insert({ kind: 'event', event_id: e.data.id }).select('id').single();
  if (ins.error) throw new Error(`fixture event chat: ${ins.error.message}`);
  return ins.data.id as string;
}
/** a typed message written by the admin client (an event chat may not admit a guest's post before the event); `extra` are chat_messages columns */
const typed = async (conv: string, author: Who, body: string, extra: Row = {}) => {
  const r = await admin.from('chat_messages').insert({ conversation_id: conv, author_id: author.id, body, kind: 'message', ...extra }).select('id').single();
  if (r.error) throw new Error(`fixture typed message: ${r.error.message}`);
  return { id: r.data.id as string };
};
const send = (who: Who, conv: string, body: string, extra: Row = {}) =>
  ok(who.c, 'send_chat_message', { p_conversation: conv, p_body: body, p_client_id: randomUUID(), ...extra });
const draftRow = async (id: string) => (await admin.from('clarify_drafts').select('*').eq('id', id).single()).data as Row;
const threadRow = async (root: string) => (await admin.from('clarify_threads').select('*').eq('root_id', root).single()).data as Row;
const goodResult = (stmt: string, ids: { a?: string[]; b?: string[] } = {}) => ({ decision: 'draft', statement: stmt, cited: { a: ids.a ?? [], b: ids.b ?? [] } });

/** frees the owner's active draft and the day's spend so the next start is not busy or capped */
async function settle(who: Who) {
  await admin.from('clarify_drafts').update({ state: 'failed', error_code: 'test_cleanup' }).eq('owner_id', who.id).in('state', ['queued', 'running']);
  await admin.from('mirror_ai_spend').delete().eq('owner_id', who.id).eq('bucket', 'canvas');
}
/** begin a queued draft as the worker does and return the run object; the run is then failed so the owner is free */
async function begin(who: Who, draft: string): Promise<Row> {
  await admin.from('mirror_ai_spend').delete().eq('owner_id', who.id).eq('bucket', 'canvas');
  const run = await ok(A, '_clarify_begin', { p_draft: draft });
  expect(run.status).toBe('run');
  await ok(A, '_clarify_fail', { p_draft: draft, p_code: 'test_cleanup', p_usd: 0, p_run: (await draftRow(draft)).spend_id });
  return run;
}
/** `who`'s done draft on `source`, with a position, and optionally published */
async function madeDraft(who: Who, source: string, label: string) {
  await settle(who);
  const s = await ok(who.c, 'clarify_start', { p_source: source });
  if (s.status !== 'started') throw new Error(`clarify_start answered ${s.status}`);
  await ok(A, '_clarify_begin', { p_draft: s.draft_id });
  const done = await ok(A, '_clarify_complete', {
    p_draft: s.draft_id, p_result: goodResult(`${TAG} ${label}`, { a: [source] }), p_usd: 0.01, p_run: (await draftRow(s.draft_id)).spend_id,
  });
  if (done.status !== 'done') throw new Error(`complete answered ${JSON.stringify(done)}`);
  const up = await who.c.from('point_positions').upsert({ point_id: done.point_id, user_id: who.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
  if (up.error) throw new Error(`position: ${up.error.message}`);
  return { draft: s.draft_id as string, point: done.point_id as string, root: s.thread_root_id as string };
}

let a: Who;
let b: Who;
let c3: Who;
let d4: Who;
let e5: Who;
let f6: Who;

beforeAll(async () => {
  a = await mk('A');
  b = await mk('B');
  c3 = await mk('C');
  d4 = await mk('D');
  e5 = await mk('E');
  f6 = await mk('F');
});

afterAll(async () => {
  const ids = users.map((u) => u.user.id);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
  if (eventIds.length) await admin.from('events').delete().in('id', eventIds);
  await deleteTestUsers(ids);
});

describe('P1631 clarify_start_chat', () => {
  let conv: string;
  let newest: Row;
  let mirror: string;

  beforeAll(async () => {
    conv = await dm(a, b);
    await send(b, conv, `${TAG} first top-level`);
    await send(a, conv, `${TAG} second top-level`);
    newest = await send(b, conv, `${TAG} newest top-level`);
    // a reply is newer than the newest top-level message but is not a candidate anchor
    await send(a, conv, `${TAG} reply, newer than every top-level message`, { p_thread_root: newest.id });
  });

  it('a stranger gets 42501', async () => {
    const r = await rpc(c3.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true });
    expect(r.error?.code).toBe('42501');
  });

  it('a chat with no readable top-level message answers empty and writes nothing', async () => {
    const empty = await dm(a, f6);
    const before = {
      threads: (await admin.from('clarify_threads').select('root_id').eq('owner_id', a.id)).data!.length,
      drafts: (await admin.from('clarify_drafts').select('id').eq('owner_id', a.id)).data!.length,
    };
    const r = await ok(a.c, 'clarify_start_chat', { p_conversation: empty, p_draft: true });
    expect(r).toEqual({ status: 'empty' });
    const after = {
      threads: (await admin.from('clarify_threads').select('root_id').eq('owner_id', a.id)).data!.length,
      drafts: (await admin.from('clarify_drafts').select('id').eq('owner_id', a.id)).data!.length,
    };
    expect(after).toEqual(before);
    const mirrors = await admin.from('chat_conversations').select('id').eq('kind', 'mirror').eq('owner_id', a.id);
    for (const m of mirrors.data ?? []) {
      const msgs = await admin.from('chat_messages').select('id, forwarded_from_message_id').eq('conversation_id', m.id).not('forwarded_from_message_id', 'is', null);
      for (const row of msgs.data ?? []) {
        const src = await admin.from('chat_messages').select('conversation_id').eq('id', row.forwarded_from_message_id).single();
        expect(src.data?.conversation_id, 'no Mirror copy of the empty chat').not.toBe(empty);
      }
    }
  });

  it('with p_draft true: one queued draft on the newest top-level message; the Mirror copy shows the chat only; a second start is busy', async () => {
    await settle(a);
    const r = await ok(a.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true });
    expect(r).toMatchObject({ status: 'started', scope: 'chat' });
    mirror = r.mirror_conversation_id;
    const d = await draftRow(r.draft_id);
    expect(d).toMatchObject({ state: 'queued', source_message_id: newest.id, source_conversation_id: conv, owner_id: a.id });
    expect((await admin.from('clarify_drafts').select('id').eq('owner_id', a.id).eq('thread_root_id', r.thread_root_id)).data).toHaveLength(1);
    expect((await threadRow(r.thread_root_id)).scope).toBe('chat');
    const copy = (await admin.from('chat_messages').select('*').eq('id', r.thread_root_id).single()).data as Row;
    expect(copy.forward_snapshot.scope).toBe('chat');
    for (const k of ['body', 'author_name', 'thread']) expect(copy.forward_snapshot, `snapshot has no ${k}`).not.toHaveProperty(k);
    expect(copy.attachment_kind).toBeNull();
    expect(copy.attachment_id).toBeNull();
    expect(copy.forward_author_id).toBeNull();
    const again = await ok(a.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true });
    expect(again).toEqual({ status: 'busy' });
  });

  it('with p_draft false: a thread and no draft; the first point instruction then starts a draft on this chat', async () => {
    await settle(a);
    const draftsBefore = (await admin.from('clarify_drafts').select('id').eq('owner_id', a.id)).data!.length;
    const r = await ok(a.c, 'clarify_start_chat', { p_conversation: conv, p_draft: false });
    expect(r).toMatchObject({ status: 'started', scope: 'chat', draft_id: null });
    expect((await admin.from('clarify_drafts').select('id').eq('owner_id', a.id)).data).toHaveLength(draftsBefore);
    expect((await threadRow(r.thread_root_id)).scope).toBe('chat');
    expect(((await admin.from('chat_messages').select('forward_snapshot').eq('id', r.thread_root_id).single()).data as Row).forward_snapshot.new_point).toBe(true);
    const m = await ok(a.c, 'clarify_message', { p_thread_root: r.thread_root_id, p_text: 'a point about pricing' });
    expect(m.status).toBe('started');
    expect(await draftRow(m.draft_id)).toMatchObject({ instruction: 'a point about pricing', source_conversation_id: conv, state: 'queued' });
  });

  it('a Mirror conversation (P1722: no longer refused) with nothing to anchor on answers empty', async () => {
    expect(mirror, 'set by the p_draft true test').toBeTruthy();
    await settle(a); // the busy check comes before the kind check
    const r = await rpc(a.c, 'clarify_start_chat', { p_conversation: mirror, p_draft: true });
    expect(r.error, JSON.stringify(r)).toBeNull();
    expect(r.data, JSON.stringify(r)).toMatchObject({ status: 'empty' });
  });
});

describe('P1631 the scope clarify_start records, and what a run reads', () => {
  let conv: string;
  let rootMsg: Row;
  let reply: Row;
  let loner: Row;

  beforeAll(async () => {
    conv = await dm(a, d4);
    rootMsg = await send(d4, conv, `${TAG} thread root`);
    reply = await send(a, conv, `${TAG} a live reply`, { p_thread_root: rootMsg.id });
    loner = await send(d4, conv, `${TAG} a top-level message with no replies`);
  });

  const startScope = async (source: string) => {
    await settle(a);
    const r = await ok(a.c, 'clarify_start', { p_source: source });
    expect(r.status).toBe('started');
    expect((await threadRow(r.thread_root_id)).scope, 'the thread row agrees with the answer').toBe(r.scope);
    return r;
  };

  it("a thread root with a live reply is 'thread'; a top-level message with no replies and a reply are 'message'", async () => {
    expect((await startScope(rootMsg.id)).scope).toBe('thread');
    expect((await startScope(loner.id)).scope).toBe('message');
    expect((await startScope(reply.id)).scope).toBe('message');
  });

  it("_clarify_begin returns the scope; 'thread' and 'chat' have no pressed_author on the source, 'message' has one", async () => {
    const t = await startScope(rootMsg.id);
    const rt = await begin(a, t.draft_id);
    expect(rt.scope).toBe('thread');
    expect(rt.source_message).not.toHaveProperty('pressed_author');

    const m = await startScope(loner.id);
    const rm = await begin(a, m.draft_id);
    expect(rm.scope).toBe('message');
    expect(rm.source_message).toHaveProperty('pressed_author', 'other');

    await settle(a);
    const ch = await ok(a.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true });
    const rc = await begin(a, ch.draft_id);
    expect(rc.scope).toBe('chat');
    expect(rc.source_message).not.toHaveProperty('pressed_author');
  });

  it('chat scope AT AN EVENT reads ordinary thread replies but no row of a round_thread or outside_rounds thread', async () => {
    // (20261112250000: the round/outside-rounds exclusion is for events; a DM's own session threads are read, see the event-only describe)
    const c = await eventChat(a, e5);
    const ordRoot = await typed(c, e5, `${TAG} ordinary root`);
    const ordReply = await typed(c, a, `${TAG} ordinary reply`, { thread_root_id: ordRoot.id });
    const ids: Record<string, { root: string; reply: string }> = {};
    for (const kind of ['round_thread', 'outside_rounds']) {
      const r = await admin.from('chat_messages').insert({ conversation_id: c, author_id: e5.id, body: `${TAG} ${kind} root`, kind: 'message', system_kind: kind }).select('id').single();
      if (r.error) throw new Error(`fixture ${kind} root: ${r.error.message}`);
      const rep = await admin.from('chat_messages').insert({ conversation_id: c, author_id: e5.id, body: `${TAG} ${kind} reply`, kind: 'message', thread_root_id: r.data.id }).select('id').single();
      if (rep.error) throw new Error(`fixture ${kind} reply: ${rep.error.message}`);
      ids[kind] = { root: r.data.id, reply: rep.data.id };
    }
    // the anchor is the newest top-level message, so the fixtures above are all read as context
    await typed(c, e5, `${TAG} anchor, newest top-level`);
    await settle(a);
    const ch = await ok(a.c, 'clarify_start_chat', { p_conversation: c, p_draft: true });
    expect(ch.status).toBe('started');
    const run = await begin(a, ch.draft_id);
    const seen = new Set<string>([...run.thread, ...run.surrounding_chat].map((x: Row) => x.id));
    expect(seen.has(ordReply.id), 'an ordinary thread reply is read').toBe(true);
    for (const kind of Object.keys(ids)) expect(seen.has(ids[kind]!.reply), `a ${kind} reply is never read`).toBe(false);
  });

  it('message scope still reads no thread replies in the surrounding chat', async () => {
    await settle(a);
    const r = await ok(a.c, 'clarify_start', { p_source: loner.id });
    const run = await begin(a, r.draft_id);
    expect(run.scope).toBe('message');
    expect(run.surrounding_chat.map((x: Row) => x.id)).not.toContain(reply.id);
  });
});

describe('P1631 already_drafted and point_chat_shared', () => {
  it('already_drafted includes a point B published into the chat while its card is live, and drops it after the card is deleted', async () => {
    const conv = await dm(a, c3);
    const m1 = await send(c3, conv, `${TAG} a message C wants to answer`);
    await send(a, conv, `${TAG} the anchor for A's chat run`);
    const theirs = await madeDraft(c3, m1.id, 'published by C');
    const pub = await ok(c3.c, 'clarify_publish', { p_draft: theirs.draft, p_client_id: randomUUID() });
    expect(pub.status).toBe('published');
    await send(a, conv, `${TAG} newest, so A's anchor is later than the card`);

    await settle(a);
    const s1 = await ok(a.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true });
    const run1 = await begin(a, s1.draft_id);
    expect(run1.already_drafted).toContain(`${TAG} published by C`);

    await ok(c3.c, 'delete_chat_message', { p_message: pub.message_id });
    await settle(a);
    const s2 = await ok(a.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true });
    const run2 = await begin(a, s2.draft_id);
    expect(run2.already_drafted).not.toContain(`${TAG} published by C`);
  });

  describe('a group the owner leaves', () => {
    let org: string;
    afterAll(async () => {
      if (org) await admin.from('organization').delete().eq('id', org);
    });

    it('point_chat_shared stays true for the owner after the owner leaves, while the card is live', async () => {
      const o = await admin.from('organization').insert({ slug: `p1631s-${RUN}`, name: `${TAG} org` }).select('id').single();
      if (o.error) throw new Error(`fixture org: ${o.error.message}`);
      org = o.data.id as string;
      const old = new Date(Date.now() - 3_600_000).toISOString();
      for (const who of [a, b]) {
        const m = await admin.from('membership').insert({ org_id: org, user_id: who.id, accepted_at: old });
        if (m.error) throw new Error(`fixture membership: ${m.error.message}`);
      }
      const have = await admin.from('chat_conversations').select('id').eq('kind', 'group').eq('org_id', org).maybeSingle();
      let gconv = have.data?.id as string | undefined;
      if (!gconv) {
        const g = await admin.from('chat_conversations').insert({ kind: 'group', org_id: org }).select('id').single();
        if (g.error) throw new Error(`fixture group chat: ${g.error.message}`);
        gconv = g.data.id as string;
      }
      const src = await send(a, gconv, `${TAG} group message`);
      const card = await madeDraft(a, src.id, 'group card for the leaver');
      const pub = await ok(a.c, 'clarify_publish', { p_draft: card.draft, p_client_id: randomUUID() });
      expect(pub.status).toBe('published');
      expect(await ok(a.c, 'point_chat_shared', { p_point: card.point })).toBe(true);
      const left = await admin.from('membership').delete().eq('org_id', org).eq('user_id', a.id);
      expect(left.error).toBeNull();
      expect(await ok(a.c, 'point_chat_shared', { p_point: card.point }), 'the owner keeps it while the card is live').toBe(true);
      expect(await ok(b.c, 'point_chat_shared', { p_point: card.point })).toBe(true);
      await ok(admin as unknown as SupabaseClient, 'delete_chat_message', { p_message: pub.message_id }).catch(() => undefined);
    });
  });
});

// migration 20261112220000_p1631_chat_scope_fixes.sql
describe('P1631 chat scope fixes', () => {
  it('anchors on the newest PLAIN message when a round_thread root is newer; the run reads neither the round root nor its reply', async () => {
    const g = await mk('G');
    const h = await mk('H');
    const conv = await eventChat(g, h); // the round exclusion is for events (20261112250000); the anchor rule (system_kind IS NULL) holds in every chat
    await typed(conv, h, `${TAG} plain older`);
    const plain = await typed(conv, h, `${TAG} newest plain message`);
    // an event-style round root and one reply, both NEWER than every plain message
    const root = await admin.from('chat_messages').insert({ conversation_id: conv, author_id: h.id, body: `${TAG} Round 1 with first names`, kind: 'message', system_kind: 'round_thread' }).select('id').single();
    if (root.error) throw new Error(`fixture round root: ${root.error.message}`);
    const rep = await admin.from('chat_messages').insert({ conversation_id: conv, author_id: h.id, body: `${TAG} round reply`, kind: 'message', thread_root_id: root.data.id }).select('id').single();
    if (rep.error) throw new Error(`fixture round reply: ${rep.error.message}`);

    await settle(g);
    const ch = await ok(g.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true });
    expect(ch.status).toBe('started');
    expect((await draftRow(ch.draft_id)).source_message_id, 'the anchor is the newest plain message').toBe(plain.id);
    const run = await begin(g, ch.draft_id);
    expect(run.source_message.id).toBe(plain.id);
    const seen = new Set<string>([run.source_message.id, ...run.thread.map((x: Row) => x.id), ...run.surrounding_chat.map((x: Row) => x.id)]);
    expect(seen.has(root.data.id), 'the round root is never sent').toBe(false);
    expect(seen.has(rep.data.id), 'the round reply is never sent').toBe(false);
  });

  it('a chat with only a round_thread root answers empty', async () => {
    const g = await mk('G2');
    const h = await mk('H2');
    const conv = await dm(g, h);
    const root = await admin.from('chat_messages').insert({ conversation_id: conv, author_id: h.id, body: `${TAG} only a round root`, kind: 'message', system_kind: 'round_thread' }).select('id').single();
    if (root.error) throw new Error(`fixture round root: ${root.error.message}`);
    await settle(g);
    expect(await ok(g.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true })).toEqual({ status: 'empty' });
  });

  it('a chat-scope thread survives its anchor being deleted: the next run is anchored on the newest remaining plain message', async () => {
    const g = await mk('G3');
    const h = await mk('H3');
    const conv = await dm(g, h);
    const first = await send(h, conv, `${TAG} plain one`);
    const anchor = await send(h, conv, `${TAG} plain two, the anchor`);
    await settle(g);
    const ch = await ok(g.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true });
    expect(ch.status).toBe('started');
    expect((await draftRow(ch.draft_id)).source_message_id).toBe(anchor.id);
    await begin(g, ch.draft_id); // runs and fails the first draft so the thread is free for the next message

    await ok(h.c, 'delete_chat_message', { p_message: anchor.id });
    await settle(g);
    const m = await ok(g.c, 'clarify_message', { p_thread_root: ch.thread_root_id, p_text: 'a point about the first message' });
    expect(m.status).toBe('started');
    const run = await begin(g, m.draft_id);
    expect(run.status).toBe('run');
    expect(run.scope).toBe('chat');
    expect(run.source_message.id, 'the source is the newest remaining plain message').toBe(first.id);
    expect((await draftRow(m.draft_id)).source_message_id).toBe(first.id);
  });
});

// migration 20261112240000_p1631_adversary_fixes.sql
// (20261112250000: these exclusions apply at an EVENT only, so these cases run in an event chat; a DM recording is read, see the next describe)
describe('P1631 adversary fixes: at an event, other attendees\' transcribed lines are never read', () => {
  /** a late arrival's transcribed line: top level, is_transcription true, no system_kind (as _transcribe_post_line posts it) */
  const transcribed = async (conv: string, author: string, body: string) => {
    const r = await admin.from('chat_messages').insert({ conversation_id: conv, author_id: author, body, kind: 'message', is_transcription: true }).select('id').single();
    if (r.error) throw new Error(`fixture transcribed line: ${r.error.message}`);
    return r.data.id as string;
  };

  it('a transcribed top-level line that is the newest row is not the anchor, and neither it nor an older one is in the run; the presser\'s own transcribed line is', async () => {
    const g = await mk('G4');
    const h = await mk('H4');
    const conv = await eventChat(g, h);
    const olderLine = await transcribed(conv, h.id, `${TAG} older transcribed line`);
    const ownLine = await transcribed(conv, g.id, `${TAG} the presser's own transcribed line`);
    const typed1 = await typed(conv, h, `${TAG} typed one`);
    const typed2 = await typed(conv, h, `${TAG} typed two, the newest typed message`);
    const newestLine = await transcribed(conv, h.id, `${TAG} newest transcribed line, newer than every typed message`);

    await settle(g);
    const ch = await ok(g.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true });
    expect(ch.status).toBe('started');
    expect((await draftRow(ch.draft_id)).source_message_id, 'the anchor is the newest TYPED message').toBe(typed2.id);
    const run = await begin(g, ch.draft_id);
    const seen = new Set<string>([run.source_message.id, ...run.thread.map((x: Row) => x.id), ...run.surrounding_chat.map((x: Row) => x.id)]);
    expect(seen.has(typed1.id), 'control: a typed message is read').toBe(true);
    expect(seen.has(newestLine), 'the newest transcribed line is not sent').toBe(false);
    expect(seen.has(olderLine), 'an older transcribed line of another attendee is not sent').toBe(false);
    expect(seen.has(ownLine), 'the presser\'s own transcribed line is kept').toBe(true);
  });

  it('message scope does not read another attendee\'s transcribed lines as surrounding chat either', async () => {
    const g = await mk('G5');
    const h = await mk('H5');
    const conv = await eventChat(g, h);
    const line = await transcribed(conv, h.id, `${TAG} transcribed before the press`);
    await typed(conv, h, `${TAG} typed before the press`);
    const pressed = await typed(conv, h, `${TAG} the pressed typed message`);
    await settle(g);
    const s = await ok(g.c, 'clarify_start', { p_source: pressed.id });
    const run = await begin(g, s.draft_id);
    expect(run.scope).toBe('message');
    expect(run.surrounding_chat.map((x: Row) => x.id)).not.toContain(line);
  });

  it('an event chat holding only another attendee\'s transcribed lines answers empty', async () => {
    const g = await mk('G6');
    const h = await mk('H6');
    const conv = await eventChat(g, h);
    await transcribed(conv, h.id, `${TAG} only transcribed lines`);
    await settle(g);
    expect(await ok(g.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true })).toEqual({ status: 'empty' });
  });
});

// migration 20261112250000_p1631_event_only_exclusion.sql
describe('P1631 event-only exclusion: a recording in a DM is the conversation', () => {
  const roomIds: string[] = [];
  afterAll(async () => {
    if (roomIds.length) await admin.from('transcribe_rooms').delete().in('id', roomIds);
  });
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from(randomUUID().replace(/-/g, '').slice(0, 6), (c) => ALPHABET[c.charCodeAt(0) % 32]).join('');

  it('chat scope in a DM reads the session thread lines and a top-level transcribed line, and may anchor on one', async () => {
    const g = await mk('G7');
    const h = await mk('H7');
    const conv = await dm(g, h);
    const typedOld = await send(h, conv, `${TAG} typed before the recording`);
    // a recording made in the DM: a session thread (root registered in transcribe_session_threads) with transcribed lines, as the app posts it
    const root = await admin.from('chat_messages').insert({ conversation_id: conv, author_id: null, body: 'session|2026-11-04T10:00:00Z|1', kind: 'message', system_kind: 'outside_rounds' }).select('id').single();
    if (root.error) throw new Error(`fixture session root: ${root.error.message}`);
    const room = await admin.from('transcribe_rooms').insert({ code: newCode(), conversation_id: conv, ended_at: new Date().toISOString() }).select('id').single();
    if (room.error) throw new Error(`fixture room: ${room.error.message}`);
    roomIds.push(room.data.id);
    const reg = await admin.from('transcribe_session_threads').insert({ room_id: room.data.id, conversation_id: conv, root_message_id: root.data.id });
    if (reg.error) throw new Error(`fixture session thread: ${reg.error.message}`);
    const lines: string[] = [];
    for (const [i, who] of [h, g, h].entries()) {
      const l = await admin.from('chat_messages').insert({ conversation_id: conv, author_id: who.id, body: `${TAG} session line ${i}`, kind: 'message', thread_root_id: root.data.id, is_transcription: true }).select('id').single();
      if (l.error) throw new Error(`fixture session line: ${l.error.message}`);
      lines.push(l.data.id as string);
    }
    const topLine = await admin.from('chat_messages').insert({ conversation_id: conv, author_id: h.id, body: `${TAG} top-level transcribed line, the newest row`, kind: 'message', is_transcription: true }).select('id').single();
    if (topLine.error) throw new Error(`fixture top-level transcribed line: ${topLine.error.message}`);

    await settle(g);
    const ch = await ok(g.c, 'clarify_start_chat', { p_conversation: conv, p_draft: true });
    expect(ch.status).toBe('started');
    expect((await draftRow(ch.draft_id)).source_message_id, 'in a DM the newest transcribed line may be the anchor (the session ROOT never is)').toBe(topLine.data.id);
    const run = await begin(g, ch.draft_id);
    const seen = new Set<string>([run.source_message.id, ...run.thread.map((x: Row) => x.id), ...run.surrounding_chat.map((x: Row) => x.id)]);
    expect(seen.has(typedOld.id), 'control: a typed message is read').toBe(true);
    for (const l of lines) expect(seen.has(l), 'a session-thread line of the DM recording is read').toBe(true);
    expect(run.source_message.id, 'the session root is never the source').not.toBe(root.data.id);
  });
});

// migration 20261112260000_p1631_clarify_point_card.sql
describe('P1631 Clarify on a published point card', () => {
  it('Clarify on a card message runs with the point statement as the source text, and the card is surrounding chat for a later press', async () => {
    const g = await mk('G8');
    const h = await mk('H8');
    const conv = await dm(g, h);
    const src = await send(h, conv, `${TAG} a message G wants to answer`);
    const card = await madeDraft(g, src.id, 'card statement');
    const pub = await ok(g.c, 'clarify_publish', { p_draft: card.draft, p_client_id: randomUUID() });
    expect(pub.status).toBe('published');
    const msg = (await admin.from('chat_messages').select('attachment_kind, body').eq('id', pub.message_id).single()).data as Row;
    expect(msg.attachment_kind, 'the card is a point attachment').toBe('point');
    expect((msg.body ?? '').trim(), 'the card has no text').toBe('');
    const statement = `Point: ${TAG} card statement`;

    // H presses Clarify on the card
    await settle(h);
    const s = await ok(h.c, 'clarify_start', { p_source: pub.message_id });
    expect(s.status).toBe('started');
    const run = await begin(h, s.draft_id); // begin() asserts status 'run' (it was 'gone' / source_gone before)
    expect(run.source_message.id).toBe(pub.message_id);
    expect(run.source_message.text).toBe(statement);

    // and a later press reads the card as surrounding chat
    const later = await send(h, conv, `${TAG} a later message`);
    await settle(h);
    const s2 = await ok(h.c, 'clarify_start', { p_source: later.id });
    const run2 = await begin(h, s2.draft_id);
    const row = run2.surrounding_chat.find((x: Row) => x.id === pub.message_id);
    expect(row, 'the card is in the surrounding chat').toBeTruthy();
    expect(row.text).toBe(statement);
  });
});
