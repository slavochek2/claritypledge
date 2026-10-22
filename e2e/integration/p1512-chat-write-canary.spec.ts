/**
 * @file p1512-chat-write-canary.spec.ts
 * @description WRITE canary for Clarity Chat (supabase/migrations/20261019203000_p1512_clarity_chat.sql).
 *
 * THE INVARIANT. No one can write what they do not own: insert themselves into a conversation, post
 * as someone else, edit or delete another's message, or point a reply or thread at a message in
 * another conversation. The design makes most of this STRUCTURAL: the chat tables grant
 * authenticated SELECT only and every write is a SECURITY DEFINER RPC that derives the actor from
 * auth.uid() (no "me" parameter exists). This file proves both halves:
 *   1. the structure (direct writes are denied by privilege, not merely by a policy that could be
 *      loosened),
 *   2. the RPC rules (membership, ownership, same-conversation, blocks, the daily limit, and that
 *      an existing 1:1 outlives the shared connection that created it).
 *
 * EVERY REFUSAL HAS A CONTROL. A "refused" assertion passes just as well when the query is simply
 * malformed, so each refused shape is paired with the same shape SUCCEEDING where it should (the
 * service role for direct table writes; the legitimate caller for each RPC), and ground truth is
 * re-read through the service role after every attack to prove nothing moved.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestOrganization, createTestMembership, deleteTestOrganization, deleteTestMembership, type TestOrganization } from '../helpers/test-organization';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import {
  RUN, signIn, anonClient, ok, refused, sleep, adminMessages, adminConversation, mirrorOf, myChatIds,
  purgeChatFor, type SignedIn, type Row,
} from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const created: TestUser[] = [];
const orgs: TestOrganization[] = [];
const convs: string[] = [];
const pointIds: string[] = [];
const storyIds: string[] = [];
const events: TestEvent[] = [];

async function mk(label: string): Promise<TestUser> {
  const u = await createTestUser({ name: `Wr${label} ${RUN}` });
  created.push(u);
  return u;
}

const send = (s: SignedIn, conv: string, body: string, extra: Record<string, unknown> = {}) =>
  ok<Row>(s.client.rpc('send_chat_message', { p_conversation: conv, p_body: body, ...extra }), `send "${body}"`);

let org: TestOrganization;
let A: TestUser, B: TestUser, C: TestUser;
let sA: SignedIn, sB: SignedIn, sC: SignedIn;
let dm: string, gconv: string;
let dmMsg: Row, gMsg: Row;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  org = await createTestOrganization({ name: `Chat write canary org ${RUN}` });
  orgs.push(org);
  [A, B, C] = await Promise.all([mk('A'), mk('B'), mk('C')]);
  await createTestMembership(org.id, A.user.id);
  await createTestMembership(org.id, B.user.id);
  sA = await signIn(A);
  sB = await signIn(B);
  sC = await signIn(C);
  dm = await ok<string>(sA.client.rpc('start_dm', { p_other: B.user.id }), 'A starts dm with B');
  convs.push(dm);
  await myChatIds(sA.client);
  gconv = await adminConversation('group', { org_id: org.id });
  dmMsg = await send(sA, dm, `dm-a-${RUN}`);
  gMsg = await send(sA, gconv, `g-a-${RUN}`);
});

test.afterAll(async () => {
  test.setTimeout(240_000);
  await purgeChatFor(created.map((u) => u.user.id), convs);
  for (const p of pointIds) await deleteTestPoint(p);
  for (const st of storyIds) await deleteTestStory(st);
  for (const e of events) await deleteTestEvent(e.id);
  for (const u of created) await deleteTestUser(u.user.id);
  for (const o of orgs) await deleteTestOrganization(o.id);
});

test('structure: no client can INSERT, UPDATE or DELETE any chat table; the same statements work for the service role', async () => {
  const before = await adminMessages(dm);
  const uids = { a: A.user.id, b: B.user.id, c: C.user.id };
  const [dmA, dmB] = [uids.a, uids.b].sort();

  for (const [who, client] of [['authenticated A', sA.client], ['authenticated C (outsider)', sC.client], ['anon', anonClient()]] as const) {
    const attempts: Array<[string, PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>]> = [
      ['insert a message as A', client.from('chat_messages').insert({ conversation_id: dm, author_id: uids.a, body: 'forged' })],
      ['insert a message as B', client.from('chat_messages').insert({ conversation_id: dm, author_id: uids.b, body: 'forged' })],
      ['update a message body', client.from('chat_messages').update({ body: 'tampered' }).eq('id', dmMsg.id)],
      ['delete a message', client.from('chat_messages').delete().eq('id', dmMsg.id)],
      ['insert a conversation (self-insert a dm)', client.from('chat_conversations').insert({ kind: 'dm', dm_user_a: dmA, dm_user_b: dmB })],
      ['take over a dm (update dm_user_b)', client.from('chat_conversations').update({ dm_user_b: uids.c }).eq('id', dm)],
      ['delete a conversation', client.from('chat_conversations').delete().eq('id', dm)],
      ['insert read state for the dm', client.from('chat_member_state').insert({ conversation_id: dm, profile_id: uids.c })],
      ['update read state', client.from('chat_member_state').update({ archived: true }).eq('conversation_id', dm)],
      ['delete read state', client.from('chat_member_state').delete().eq('conversation_id', dm)],
      ['insert a block', client.from('chat_blocks').insert({ blocker_id: uids.a, blocked_id: uids.b })],
      ['delete a block', client.from('chat_blocks').delete().eq('blocker_id', uids.a)],
    ];
    for (const [what, p] of attempts) {
      const err = await refused(p, `${who} must not ${what}`);
      expect(err.code, `${who} ${what}: expected a privilege error, got ${err.message}`).toBe('42501');
    }
  }

  // CONTROL: the identical statements are valid shapes — the service role performs them.
  const stamp = new Date().toISOString();
  const upd = await supabaseAdmin.from('chat_messages').update({ edited_at: stamp }).eq('id', dmMsg.id).select('id');
  expect(upd.error, 'control: service role may update').toBeNull();
  expect(upd.data?.length).toBe(1);
  await supabaseAdmin.from('chat_messages').update({ edited_at: null }).eq('id', dmMsg.id);

  // Nothing moved.
  const after = await adminMessages(dm);
  expect(after.length).toBe(before.length);
  expect(after.find((r) => r.id === dmMsg.id)?.body).toBe(`dm-a-${RUN}`);
  const { data: conv } = await supabaseAdmin.from('chat_conversations').select('dm_user_a,dm_user_b').eq('id', dm).single();
  expect([conv!.dm_user_a, conv!.dm_user_b].sort()).toEqual([dmA, dmB]);
  const { count: states } = await supabaseAdmin.from('chat_member_state').select('conversation_id', { count: 'exact', head: true }).eq('profile_id', uids.c);
  expect(states, 'no read state was planted for the outsider').toBe(0);
  const { count: blocks } = await supabaseAdmin.from('chat_blocks').select('blocker_id', { count: 'exact', head: true }).eq('blocker_id', uids.a);
  expect(blocks).toBe(0);

  // anon cannot read or call anything either.
  const anon = anonClient();
  const r1 = await anon.from('chat_messages').select('id').limit(1);
  expect(r1.error?.code, 'anon cannot read messages').toBe('42501');
  await refused(anon.rpc('get_my_chats'), 'anon get_my_chats');
  await refused(anon.rpc('send_chat_message', { p_conversation: dm, p_body: 'x' }), 'anon send');
});

test('the author is always the caller: send has no author parameter, and the stored author is the caller', async () => {
  const mine = await send(sA, gconv, `who-${RUN}`);
  expect(mine.author_id, 'the RPC stamps the caller').toBe(A.user.id);
  expect((await adminMessages(gconv)).find((r) => r.id === mine.id)?.author_id).toBe(A.user.id);

  // An invented parameter is refused by the API (no such signature), so there is no way to name another author.
  await refused(sB.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'as A', p_author_id: A.user.id }), 'send with p_author_id');
  await refused(sB.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'as A', author_id: A.user.id }), 'send with author_id');
  const bMsg = await send(sB, gconv, `by-b-${RUN}`);
  expect(bMsg.author_id).toBe(B.user.id);
  const rows = await adminMessages(gconv);
  expect(rows.filter((r) => r.body === 'as A'), 'nothing was posted as A').toEqual([]);

  // A forward is authored by the forwarder, whoever wrote the original.
  const fwd = await ok<Row>(sB.client.rpc('forward_chat_message', { p_source: gMsg.id, p_target_conversation: gconv, p_note: 'fyi' }), 'B forwards A\'s message');
  expect(fwd.author_id).toBe(B.user.id);
  expect(fwd.forward_snapshot?.author_name).toBe(A.name);
});

test('idempotent send: the same client id twice is one message, independent per author, and never crosses conversations', async () => {
  test.setTimeout(120_000);
  const k = randomUUID();
  const first = await send(sA, gconv, `idem-${RUN}`, { p_client_id: k });
  expect(first.client_id, 'the sender gets the key back (to match the Realtime echo)').toBe(k);

  // A retry (the response of the first call was "lost") returns the SAME row and writes nothing new.
  const again = await send(sA, gconv, `idem-${RUN}`, { p_client_id: k });
  expect(again.id, 'the retry returns the original message').toBe(first.id);
  const edited = await send(sA, gconv, `a different body ${RUN}`, { p_client_id: k });
  expect(edited.id, 'a replay never posts again, whatever the body').toBe(first.id);
  expect(edited.body, 'and never overwrites the stored message').toBe(`idem-${RUN}`);
  const { data: rows1 } = await supabaseAdmin.from('chat_messages').select('id').eq('author_id', A.user.id).eq('client_id', k);
  expect(rows1?.length, 'exactly one row exists for the key').toBe(1);

  // CONTROL: without a client id two identical sends are two messages (the key is what dedupes).
  const n1 = await send(sA, gconv, `no-key-${RUN}`);
  const n2 = await send(sA, gconv, `no-key-${RUN}`);
  expect(n2.id).not.toBe(n1.id);

  // The key is per AUTHOR: B using the same value posts an independent message.
  const bSame = await send(sB, gconv, `idem-b-${RUN}`, { p_client_id: k });
  expect(bSame.id).not.toBe(first.id);
  expect(bSame.author_id).toBe(B.user.id);
  expect(bSame.body).toBe(`idem-b-${RUN}`);
  const { data: rows2 } = await supabaseAdmin.from('chat_messages').select('id').eq('client_id', k);
  expect(rows2?.length, 'one row per author for the same key').toBe(2);

  // Never a cross-post: the same key aimed at ANOTHER conversation is refused and writes nothing.
  const dmBefore = (await adminMessages(dm)).length;
  const err = await refused(sA.client.rpc('send_chat_message', { p_conversation: dm, p_body: 'elsewhere', p_client_id: k }), 'reuse a client id in another conversation');
  expect(err.message).toContain('client id already used');
  expect((await adminMessages(dm)).length, 'nothing was posted into the other conversation').toBe(dmBefore);
  // ...and the retry still returns the original in its own conversation afterwards.
  expect((await send(sA, gconv, `idem-${RUN}`, { p_client_id: k })).id).toBe(first.id);

  // A burst of identical retries (a flaky phone firing twice at once) still yields one row.
  const burstKey = randomUUID();
  const burst = await Promise.all(Array.from({ length: 6 }, () =>
    sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: `burst-${RUN}`, p_client_id: burstKey })));
  expect(burst.every((r) => !r.error), `no burst call may fail: ${JSON.stringify(burst.map((r) => r.error?.message))}`).toBe(true);
  expect(new Set(burst.map((r) => (r.data as Row).id)).size, 'all burst calls return the same message').toBe(1);
  const { data: rows3 } = await supabaseAdmin.from('chat_messages').select('id').eq('author_id', A.user.id).eq('client_id', burstKey);
  expect(rows3?.length, 'the burst produced exactly one row').toBe(1);

  // Forwards are idempotent the same way, and the key space is shared (no cross-post through a forward).
  const fk = randomUUID();
  const f1 = await ok<Row>(sB.client.rpc('forward_chat_message', { p_source: gMsg.id, p_target_conversation: gconv, p_client_id: fk }), 'forward');
  const f2 = await ok<Row>(sB.client.rpc('forward_chat_message', { p_source: gMsg.id, p_target_conversation: gconv, p_client_id: fk }), 'forward retry');
  expect(f2.id).toBe(f1.id);
  const { data: rows4 } = await supabaseAdmin.from('chat_messages').select('id').eq('author_id', B.user.id).eq('client_id', fk);
  expect(rows4?.length).toBe(1);
  const errFwd = await refused(sB.client.rpc('forward_chat_message', { p_source: gMsg.id, p_target_conversation: dm, p_client_id: fk }), 'forward with a key already used for another conversation');
  expect(errFwd.message).toContain('client id already used');
});

test('idempotent replay follows current visibility, and a forward replay survives its source being deleted', async () => {
  test.setTimeout(120_000);

  // --- replay is a READ of the stored row: it must respect today's access ------------------------
  const V = await mk('IV');
  await createTestMembership(org.id, V.user.id);
  const sV = await signIn(V);
  const sendKey = randomUUID();
  const fwdKey = randomUUID();
  await sleep(300);
  const vSource = await send(sA, gconv, `visible-to-v-${RUN}`); // after V joined, so V can read and forward it
  const sent = await send(sV, gconv, `before-leaving-${RUN}`, { p_client_id: sendKey });
  const fwd = await ok<Row>(sV.client.rpc('forward_chat_message', { p_source: vSource.id, p_target_conversation: gconv, p_client_id: fwdKey }), 'V forwards');
  // CONTROL: while still a member, both replays return the stored rows.
  expect((await send(sV, gconv, 'x', { p_client_id: sendKey })).id).toBe(sent.id);
  expect((await ok<Row>(sV.client.rpc('forward_chat_message', { p_source: vSource.id, p_target_conversation: gconv, p_client_id: fwdKey }), 'forward replay')).id).toBe(fwd.id);

  await ok(sV.client.from('membership').delete().eq('org_id', org.id).eq('user_id', V.user.id), 'V leaves');
  await sleep(400);
  await ok(sV.client.from('membership').insert({ org_id: org.id, user_id: V.user.id }), 'V rejoins');
  await sleep(300);

  // V can post again (new membership), but history before the rejoin is gone, and so is its replay.
  const rowsBefore = (await adminMessages(gconv)).length;
  const e1 = await refused(sV.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'replay', p_client_id: sendKey }), 'replay a send from the ended membership');
  expect(e1.message).toContain('conversation not available');
  const e2 = await refused(sV.client.rpc('forward_chat_message', { p_source: vSource.id, p_target_conversation: gconv, p_client_id: fwdKey }), 'replay a forward from the ended membership');
  expect(e2.message).toContain('conversation not available');
  expect((await adminMessages(gconv)).length, 'a refused replay inserts nothing').toBe(rowsBefore);
  const { data: keyed } = await supabaseAdmin.from('chat_messages').select('id').eq('author_id', V.user.id).eq('client_id', sendKey);
  expect(keyed?.length, 'still exactly one stored row for the old key').toBe(1);
  // CONTROL: a fresh key works after the rejoin, and ITS replay returns the same row.
  const freshKey = randomUUID();
  const fresh = await send(sV, gconv, `after-rejoin-${RUN}`, { p_client_id: freshKey });
  expect((await send(sV, gconv, 'x', { p_client_id: freshKey })).id).toBe(fresh.id);

  // --- a forward replay is answered before the source is looked at ---------------------------------
  const source = await send(sA, gconv, `forward-source-${RUN}`);
  const k = randomUUID();
  const f1 = await ok<Row>(sB.client.rpc('forward_chat_message', { p_source: source.id, p_target_conversation: gconv, p_client_id: k }), 'B forwards the source');
  await ok(sA.client.rpc('delete_chat_message', { p_message: source.id }), 'the author deletes the source');
  const f2 = await ok<Row>(sB.client.rpc('forward_chat_message', { p_source: source.id, p_target_conversation: gconv, p_client_id: k }), 'replay after the source was deleted');
  expect(f2.id, 'the retry returns the stored forward, not "message not available"').toBe(f1.id);
  expect(f2.forward_snapshot?.body, 'the stored forward keeps its own copy (D5)').toBe(`forward-source-${RUN}`);
  // CONTROL: a NEW forward of the deleted source is still refused.
  await refused(sB.client.rpc('forward_chat_message', { p_source: source.id, p_target_conversation: gconv, p_client_id: randomUUID() }), 'a new forward of a deleted source');
  await refused(sB.client.rpc('forward_chat_message', { p_source: source.id, p_target_conversation: gconv }), 'a keyless forward of a deleted source');
  const { data: copies } = await supabaseAdmin.from('chat_messages').select('id').eq('author_id', B.user.id).eq('client_id', k);
  expect(copies?.length, 'one stored forward for the key').toBe(1);
  // The target permission is still checked before the replay: someone who cannot post there gets nothing.
  await refused(sC.client.rpc('forward_chat_message', { p_source: source.id, p_target_conversation: gconv, p_client_id: k }), 'outsider replays B\'s key');
});

test('edit and delete: only the author can; other people get an error and nothing changes', async () => {
  const msg = await send(sA, gconv, `mine-${RUN}`);
  await refused(sB.client.rpc('edit_chat_message', { p_message: msg.id, p_body: 'B edits A' }), 'B edits A\'s message');
  await refused(sB.client.rpc('delete_chat_message', { p_message: msg.id }), 'B deletes A\'s message');
  await refused(sC.client.rpc('edit_chat_message', { p_message: msg.id, p_body: 'C edits A' }), 'C edits A\'s message');
  await refused(sC.client.rpc('delete_chat_message', { p_message: msg.id }), 'C deletes A\'s message');
  const untouched = (await adminMessages(gconv)).find((r) => r.id === msg.id)!;
  expect(untouched.body).toBe(`mine-${RUN}`);
  expect(untouched.deleted_at).toBeNull();

  // CONTROL: the author can do both through the same calls.
  const edited = await ok<Row & { edited_at: string | null }>(sA.client.rpc('edit_chat_message', { p_message: msg.id, p_body: `edited-${RUN}` }), 'A edits own');
  expect(edited.body).toBe(`edited-${RUN}`);
  expect(edited.edited_at).toBeTruthy();
  const deleted = await ok<Row>(sA.client.rpc('delete_chat_message', { p_message: msg.id }), 'A deletes own');
  expect(deleted.body).toBeNull();
  expect(deleted.deleted_at).toBeTruthy();
  await refused(sA.client.rpc('edit_chat_message', { p_message: msg.id, p_body: 'back from the dead' }), 'edit after delete');

  // Over-long and empty bodies.
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x'.repeat(4001) }), '4001 characters');
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: '   ' }), 'blank body');
  expect((await send(sA, gconv, 'y'.repeat(4000))).body).toHaveLength(4000);
});

test('reply and thread targets must be in the same conversation, undeleted, and (for threads) a channel root', async () => {
  const root = await send(sA, gconv, `root-${RUN}`);
  const reply = await send(sB, gconv, `reply-${RUN}`, { p_thread_root: root.id });
  const gone = await send(sA, gconv, `gone-${RUN}`);
  await ok(sA.client.rpc('delete_chat_message', { p_message: gone.id }), 'delete the target');
  const mirror = await mirrorOf(sA);

  const before = {
    dm: (await adminMessages(dm)).length,
    g: (await adminMessages(gconv)).length,
    m: (await adminMessages(mirror)).length,
  };

  await refused(sA.client.rpc('send_chat_message', { p_conversation: dm, p_body: 'x', p_reply_to: gMsg.id }), 'dm reply pointing at a group message');
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_reply_to: dmMsg.id }), 'group reply pointing at a dm message');
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_thread_root: dmMsg.id }), 'thread rooted in another conversation');
  await refused(sA.client.rpc('send_chat_message', { p_conversation: mirror, p_body: 'x', p_reply_to: dmMsg.id }), 'mirror reply pointing at a dm message');
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_thread_root: reply.id }), 'thread rooted in a thread reply');
  // P1546: a thread inside a 1:1 is allowed now; e2e/integration/p1546-threads-everywhere.spec.ts covers it.
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_reply_to: gone.id }), 'reply to a deleted message');
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_thread_root: gone.id }), 'thread under a deleted message');
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_reply_to: '00000000-0000-4000-8000-000000000000' }), 'reply to a message that does not exist');

  expect({
    dm: (await adminMessages(dm)).length,
    g: (await adminMessages(gconv)).length,
    m: (await adminMessages(mirror)).length,
  }, 'no refused call wrote anything').toEqual(before);

  // CONTROLS: the legitimate shapes of the same calls succeed.
  const quote = await send(sB, dm, `quote-${RUN}`, { p_reply_to: dmMsg.id });
  expect(quote.reply_to_id).toBe(dmMsg.id);
  const quoteInChannel = await send(sB, gconv, `quote-g-${RUN}`, { p_reply_to: gMsg.id });
  expect(quoteInChannel.reply_to_id).toBe(gMsg.id);
  const inThread = await send(sA, gconv, `thread-${RUN}`, { p_thread_root: root.id });
  expect(inThread.thread_root_id).toBe(root.id);

  // Thread replies do not move the channel's last_message_at (the preview ignores them).
  const { data: c1 } = await supabaseAdmin.from('chat_conversations').select('last_message_at').eq('id', gconv).single();
  const lastBefore = c1!.last_message_at as string;
  await sleep(50);
  await send(sB, gconv, `thread-2-${RUN}`, { p_thread_root: root.id });
  const { data: c2 } = await supabaseAdmin.from('chat_conversations').select('last_message_at').eq('id', gconv).single();
  expect(c2!.last_message_at).toBe(lastBefore);
});

test('attachments: a point id is stored as an id; unknown kinds, half-pairs and missing ids are refused', async () => {
  const point = await createTestPoint(A.user.id);
  pointIds.push(point.id);
  const ok1 = await send(sA, gconv, `see this ${RUN}`, { p_attachment_kind: 'point', p_attachment_id: point.id });
  expect(ok1.attachment_kind).toBe('point');
  expect(ok1.attachment_id).toBe(point.id);
  const bare = await send(sA, gconv, '', { p_attachment_kind: 'point', p_attachment_id: point.id }).catch(() => null);
  expect(bare, 'an attachment alone is a valid message').toBeTruthy();

  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_attachment_kind: 'point', p_attachment_id: '00000000-0000-4000-8000-000000000000' }), 'point that does not exist');
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_attachment_kind: 'video', p_attachment_id: point.id }), 'unknown attachment kind');
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_attachment_kind: 'point' }), 'kind without id');
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_attachment_id: point.id }), 'id without kind');
  // D: attaching something you cannot read fails with the SAME error as something that does not exist.
  const privStory = await createTestStory(B.user.id, { visibility: 'private' });
  storyIds.push(privStory.id);
  const pubStory = await createTestStory(B.user.id, { visibility: 'public' });
  storyIds.push(pubStory.id);
  const privPoint = await createTestPoint(B.user.id, { visibility: 'private' });
  pointIds.push(privPoint.id);
  const randomId = '11111111-2222-4333-8444-555555555555';
  const eNone = await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_attachment_kind: 'story', p_attachment_id: randomId }), 'random story id');
  const ePriv = await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_attachment_kind: 'story', p_attachment_id: privStory.id }), 'another user\'s private story');
  const ePrivPoint = await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_attachment_kind: 'point', p_attachment_id: privPoint.id }), 'another user\'s private point');
  const eNonePoint = await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_attachment_kind: 'point', p_attachment_id: randomId }), 'random point id');
  expect(ePriv.message, 'an inaccessible story and a missing one are indistinguishable').toBe(eNone.message);
  expect(ePrivPoint.message, 'an inaccessible point and a missing one are indistinguishable').toBe(eNonePoint.message);
  expect(ePriv.code).toBe(eNone.code);
  // CONTROLS: a public story of someone else and your own private story attach fine.
  expect((await send(sA, gconv, `public story ${RUN}`, { p_attachment_kind: 'story', p_attachment_id: pubStory.id })).attachment_id).toBe(pubStory.id);
  const ownPriv = await createTestStory(A.user.id, { visibility: 'private' });
  storyIds.push(ownPriv.id);
  expect((await send(sA, gconv, `own private story ${RUN}`, { p_attachment_kind: 'story', p_attachment_id: ownPriv.id })).attachment_id).toBe(ownPriv.id);

  // An outsider cannot attach into a conversation they cannot post to, even with a valid point.
  await refused(sC.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'x', p_attachment_kind: 'point', p_attachment_id: point.id }), 'outsider attaches into the group');
});

test('mirror: only the owner writes or renames it; a rename touches only the caller\'s own', async () => {
  const mirrorA = await mirrorOf(sA);
  const mirrorB = await mirrorOf(sB);
  await refused(sB.client.rpc('send_chat_message', { p_conversation: mirrorA, p_body: 'psst' }), 'B posts into A\'s mirror');
  await refused(sB.client.rpc('forward_chat_message', { p_source: (await send(sB, gconv, `b-fwd-${RUN}`)).id, p_target_conversation: mirrorA }), 'B forwards into A\'s mirror');
  expect((await adminMessages(mirrorA)).filter((r) => r.body === 'psst')).toEqual([]);
  // control: the owner posts to their own mirror
  expect((await send(sA, mirrorA, `note-${RUN}`)).conversation_id).toBe(mirrorA);

  expect(await ok<string>(sB.client.rpc('rename_mirror', { p_title: `  B's thoughts ${RUN}  ` }), 'B renames')).toBe(`B's thoughts ${RUN}`);
  const { data: t } = await supabaseAdmin.from('chat_conversations').select('id,title').in('id', [mirrorA, mirrorB]);
  expect(t!.find((r) => r.id === mirrorB)!.title).toBe(`B's thoughts ${RUN}`);
  expect(t!.find((r) => r.id === mirrorA)!.title, 'A\'s mirror is untouched').toBeNull();
  await refused(sB.client.rpc('rename_mirror', { p_title: '' }), 'empty title');
  await refused(sB.client.rpc('rename_mirror', { p_title: 'x'.repeat(61) }), '61-character title');
  expect((await ok<string>(sB.client.rpc('rename_mirror', { p_title: 'x'.repeat(60) }), '60 characters')).length).toBe(60);
});

test('starting a 1:1: needs a shared connection, refuses self and strangers, and a block stops it in both directions', async () => {
  // no shared connection / self / unknown person
  await refused(sC.client.rpc('start_dm', { p_other: A.user.id }), 'C (no connection) starts a dm with A');
  await refused(sA.client.rpc('start_dm', { p_other: C.user.id }), 'A starts a dm with C (the other direction)');
  await refused(sA.client.rpc('start_dm', { p_other: A.user.id }), 'dm with yourself');
  await refused(sA.client.rpc('start_dm', { p_other: '00000000-0000-4000-8000-000000000000' }), 'dm with nobody');
  const { count } = await supabaseAdmin.from('chat_conversations').select('id', { count: 'exact', head: true }).eq('kind', 'dm').or(`dm_user_a.eq.${C.user.id},dm_user_b.eq.${C.user.id}`);
  expect(count, 'no conversation was created for the stranger').toBe(0);

  // CONTROL: with a shared org, A and B start (and re-start) one; the same id comes back.
  expect(await ok<string>(sB.client.rpc('start_dm', { p_other: A.user.id }), 'B re-starts the dm')).toBe(dm);

  // block: a fresh pair that DOES share the org
  const G = await mk('G');
  await createTestMembership(org.id, G.user.id);
  const sG = await signIn(G);
  const found = await ok<Array<{ profile_id: string }>>(sA.client.rpc('search_chat_people', { p_query: `WrG ${RUN}` }), 'A searches for G');
  expect(found.map((p) => p.profile_id), 'control: before the block A finds G').toContain(G.user.id);

  await ok(sG.client.rpc('block_user', { p_other: A.user.id }), 'G blocks A');
  await refused(sA.client.rpc('start_dm', { p_other: G.user.id }), 'blocked A starts a dm with G');
  await refused(sG.client.rpc('start_dm', { p_other: A.user.id }), 'blocker G starts a dm with A');
  const notFound = await ok<Array<{ profile_id: string }>>(sA.client.rpc('search_chat_people', { p_query: `WrG ${RUN}` }), 'A searches for G');
  expect(notFound.map((p) => p.profile_id), 'a blocked person does not find the blocker').not.toContain(G.user.id);
  const blocks = await ok<Array<{ blocked_id: string }>>(sG.client.rpc('get_my_blocks'), 'G lists blocks');
  expect(blocks.map((b) => b.blocked_id)).toEqual([A.user.id]);
  expect((await ok<unknown[]>(sA.client.rpc('get_my_blocks'), 'A lists blocks')), 'A does not learn who blocked them').toEqual([]);
  await refused(sG.client.rpc('block_user', { p_other: G.user.id }), 'block yourself');

  await ok(sG.client.rpc('unblock_user', { p_other: A.user.id }), 'G unblocks A');
  const gdm = await ok<string>(sA.client.rpc('start_dm', { p_other: G.user.id }), 'A starts a dm with G after the unblock');
  convs.push(gdm);
  expect(gdm).toBeTruthy();
});

test('block on an existing 1:1: neither side can send, history stays readable, unblock restores it', async () => {
  const F = await mk('F');
  await createTestMembership(org.id, F.user.id);
  const sF = await signIn(F);
  const dmAF = await ok<string>(sA.client.rpc('start_dm', { p_other: F.user.id }), 'A starts a dm with F');
  convs.push(dmAF);
  const first = await send(sA, dmAF, `before-block-${RUN}`);
  await send(sF, dmAF, `reply-before-block-${RUN}`);

  type ChatFlags = { conversation_id: string; can_send: boolean; blocked_by_me: boolean };
  const flags = async (c: SignedIn) =>
    (await ok<ChatFlags[]>(c.client.rpc('get_my_chats'), 'get_my_chats')).find((r) => r.conversation_id === dmAF)!;
  expect(await flags(sA), 'control: an open 1:1 can send').toMatchObject({ can_send: true, blocked_by_me: false });
  expect(await flags(sF), 'control: an open 1:1 can send (other side)').toMatchObject({ can_send: true, blocked_by_me: false });

  await ok(sF.client.rpc('block_user', { p_other: A.user.id }), 'F blocks A');
  expect(await flags(sF), 'the blocker can offer Unblock').toMatchObject({ can_send: false, blocked_by_me: true });
  expect(await flags(sA), 'the blocked side learns only that sending fails, not who blocked').toMatchObject({ can_send: false, blocked_by_me: false });
  await refused(sA.client.rpc('send_chat_message', { p_conversation: dmAF, p_body: 'still there?' }), 'blocked A sends');
  await refused(sF.client.rpc('send_chat_message', { p_conversation: dmAF, p_body: 'I blocked you' }), 'blocker F sends');
  await refused(sA.client.rpc('edit_chat_message', { p_message: first.id, p_body: 'rewrite history' }), 'blocked A edits');
  await refused(sA.client.rpc('start_dm', { p_other: F.user.id }), 'blocked A opens the existing dm via start_dm');
  const { data: still } = await sA.client.from('chat_messages').select('id').eq('conversation_id', dmAF);
  expect(still?.length, 'history stays readable').toBe(2);
  expect((await adminMessages(dmAF)).length, 'nothing was written while blocked').toBe(2);

  await ok(sF.client.rpc('unblock_user', { p_other: A.user.id }), 'F unblocks A');
  expect(await flags(sA)).toMatchObject({ can_send: true, blocked_by_me: false });
  expect(await flags(sF)).toMatchObject({ can_send: true, blocked_by_me: false });
  await send(sA, dmAF, `after-unblock-${RUN}`);
  expect(await ok<string>(sA.client.rpc('start_dm', { p_other: F.user.id }), 'start after unblock')).toBe(dmAF);
});

test('shared connection through an event counts only RSVPs made inside the window (search and start_dm)', async () => {
  test.setTimeout(150_000);
  const HOUR = 3_600_000;
  const H = await mk('EH');
  const R1 = await mk('ER1');
  const R2 = await mk('ER2');
  const P = await mk('EP');
  const [sR1, sP] = [await signIn(R1), await signIn(P)];
  const evStart = Date.now() - 20 * HOUR; // long over: the window closed at +12 h
  const ev = await createTestEvent(H.user.id, new Date(evStart));
  events.push(ev);
  // R1 and R2 RSVPed inside the window (service role keeps an explicit rsvped_at).
  const { error: e1 } = await supabaseAdmin.from('event_rsvps').insert([
    { event_id: ev.id, profile_id: R1.user.id, rsvped_at: new Date(evStart + HOUR).toISOString() },
    { event_id: ev.id, profile_id: R2.user.id, rsvped_at: new Date(evStart + 2 * HOUR).toISOString() },
  ]);
  expect(e1).toBeNull();
  // P RSVPs NOW through the client path: stamped now(), i.e. 20 h after the start.
  await ok(sP.client.from('event_rsvps').insert({ event_id: ev.id, profile_id: P.user.id }), 'P RSVPs late');

  type Person = { profile_id: string };
  // CONTROLS: the in-window attendees (and the host) find each other and can start a dm.
  const r1Finds = await ok<Person[]>(sR1.client.rpc('search_chat_people', { p_query: `WrER2 ${RUN}` }), 'R1 searches for R2');
  expect(r1Finds.map((x) => x.profile_id), 'control: in-window attendees find each other').toContain(R2.user.id);
  const r1FindsHost = await ok<Person[]>(sR1.client.rpc('search_chat_people', { p_query: `WrEH ${RUN}` }), 'R1 searches for the host');
  expect(r1FindsHost.map((x) => x.profile_id), 'control: an in-window attendee finds the host').toContain(H.user.id);
  const okDm = await ok<string>(sR1.client.rpc('start_dm', { p_other: R2.user.id }), 'R1 starts a dm with R2');
  convs.push(okDm);

  // THE LATE RSVP: finds nobody, is found by nobody, and cannot start a dm with anyone from the event.
  for (const [label, q, id] of [['R1', `WrER1 ${RUN}`, R1.user.id], ['R2', `WrER2 ${RUN}`, R2.user.id], ['the host', `WrEH ${RUN}`, H.user.id]] as const) {
    const found = await ok<Person[]>(sP.client.rpc('search_chat_people', { p_query: q }), `P searches for ${label}`);
    expect(found.map((x) => x.profile_id), `a late RSVP must not find ${label}`).not.toContain(id);
    await refused(sP.client.rpc('start_dm', { p_other: id }), `late RSVP P starts a dm with ${label}`);
  }
  const r1FindsP = await ok<Person[]>(sR1.client.rpc('search_chat_people', { p_query: `WrEP ${RUN}` }), 'R1 searches for P');
  expect(r1FindsP.map((x) => x.profile_id), 'an in-window attendee must not find the late RSVP').not.toContain(P.user.id);
  await refused(sR1.client.rpc('start_dm', { p_other: P.user.id }), 'in-window R1 starts a dm with late P');
});

test('daily limit: 20 new 1:1s in 24 h, the 21st is refused, and re-opening an existing one does not count', async () => {
  test.setTimeout(240_000);
  const org2 = await createTestOrganization({ name: `Chat rate org ${RUN}` });
  orgs.push(org2);
  const R = await mk('R');
  await createTestMembership(org2.id, R.user.id);
  const others: TestUser[] = [];
  for (let i = 0; i < 21; i += 7) {
    others.push(...(await Promise.all(Array.from({ length: 7 }, (_, k) => mk(`L${i + k}`)))));
  }
  const { error: memErr } = await supabaseAdmin.from('membership').insert(others.map((u) => ({ org_id: org2.id, user_id: u.user.id })));
  expect(memErr, 'seed memberships').toBeNull();
  const sR = await signIn(R);

  const ids: string[] = [];
  for (let i = 0; i < 20; i++) {
    ids.push(await ok<string>(sR.client.rpc('start_dm', { p_other: others[i]!.user.id }), `new dm #${i + 1}`));
  }
  convs.push(...ids);
  const err = await refused(sR.client.rpc('start_dm', { p_other: others[20]!.user.id }), 'the 21st new dm');
  expect(err.message).toContain('too many');
  expect(await ok<string>(sR.client.rpc('start_dm', { p_other: others[0]!.user.id }), 're-open an existing dm at the limit')).toBe(ids[0]);
  const { count } = await supabaseAdmin.from('chat_conversations').select('id', { count: 'exact', head: true }).eq('kind', 'dm').eq('created_by', R.user.id);
  expect(count, 'exactly 20 conversations were created').toBe(20);

  // CONTROL: the limit is per person; one of the others can still start a new dm of their own.
  const sOther = await signIn(others[20]!);
  const otherDm = await ok<string>(sOther.client.rpc('start_dm', { p_other: others[19]!.user.id }), 'another person is not limited');
  convs.push(otherDm);
});

test('an existing 1:1 survives the end of the shared connection, but a new one cannot be started', async () => {
  const Q = await mk('Q');
  await createTestMembership(org.id, Q.user.id);
  const sQ = await signIn(Q);
  const dmAQ = await ok<string>(sA.client.rpc('start_dm', { p_other: Q.user.id }), 'A starts a dm with Q');
  convs.push(dmAQ);
  await send(sA, dmAQ, `while-members-${RUN}`);

  await deleteTestMembership(org.id, Q.user.id); // Q leaves the org: nothing is shared any more
  const people = await ok<Array<{ profile_id: string }>>(sA.client.rpc('search_chat_people', { p_query: `WrQ ${RUN}` }), 'A searches for Q');
  expect(people.map((p) => p.profile_id), 'Q is no longer findable by search').not.toContain(Q.user.id);

  expect(await ok<string>(sA.client.rpc('start_dm', { p_other: Q.user.id }), 're-open the existing dm')).toBe(dmAQ);
  await send(sA, dmAQ, `after-leaving-a-${RUN}`);
  await send(sQ, dmAQ, `after-leaving-q-${RUN}`);
  expect((await adminMessages(dmAQ)).length, 'both sides can still send').toBe(3);
  expect(await myChatIds(sQ.client)).toContain(dmAQ);

  // ...while Q has lost the group channel and cannot start anything new with C.
  await refused(sQ.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'still a member?' }), 'Q sends to the group they left');
  await refused(sQ.client.rpc('forward_chat_message', { p_source: (await adminMessages(dmAQ))[0]!.id, p_target_conversation: gconv }), 'Q forwards into the group they left');
  await refused(sQ.client.rpc('start_dm', { p_other: C.user.id }), 'Q starts a dm with a stranger');
  await refused(sQ.client.rpc('mark_chat_read', { p_conversation: gconv }), 'Q marks the group read');
});

test('surface: a client can only ask about its own access, and internal functions are not callable', async () => {
  // chat_access_since answers about the caller only: no probing whether someone else is in a chat.
  const self = await ok<string | null>(sA.client.rpc('chat_access_since', { p_conversation: dm, p_uid: A.user.id }), 'A asks about self');
  expect(self, 'control: A has access to the dm').not.toBeNull();
  const aboutB = await ok<string | null>(sA.client.rpc('chat_access_since', { p_conversation: dm, p_uid: B.user.id }), 'A asks about B');
  expect(aboutB, 'A cannot probe B\'s access').toBeNull();
  const cAboutA = await ok<string | null>(sC.client.rpc('chat_access_since', { p_conversation: dm, p_uid: A.user.id }), 'C asks about A');
  expect(cAboutA).toBeNull();
  const truth = await supabaseAdmin.rpc('chat_access_since', { p_conversation: dm, p_uid: B.user.id });
  expect(truth.data, 'control: the same question through the service role gets a real answer').not.toBeNull();
  await refused(anonClient().rpc('chat_access_since', { p_conversation: dm, p_uid: A.user.id }), 'anon asks');

  for (const [fn, args] of [
    ['_chat_access_since', { p_conversation: dm, p_uid: A.user.id }],
    ['_chat_shared_reason', { p_a: A.user.id, p_b: C.user.id }],
    ['_chat_blocked_either', { p_a: A.user.id, p_b: C.user.id }],
    ['_chat_ensure_for_user', { p_uid: A.user.id }],
    ['_chat_my_conversations', { p_uid: A.user.id }],
    ['erase_chat_data_for', { p_uid: B.user.id }],
  ] as const) {
    await refused(sA.client.rpc(fn, args), `authenticated calls internal ${fn}`);
  }
  // B's data survived the attempt above.
  expect((await adminMessages(dm)).some((r) => r.author_id === B.user.id)).toBe(true);
});
