/**
 * @file 20261109120000_p1652_chat_reactions.spec.ts
 * @description DB behaviour of supabase/migrations/20261109120000_p1652_chat_reactions.sql (needs the migration applied to TEST).
 *   npx playwright test --project=integration e2e/integration/20261109120000_p1652_chat_reactions.spec.ts
 *
 * Every refusal is paired with the same call succeeding for a legitimate caller, and ground truth is re-read through the
 * service role, so a refusal caused by a malformed call cannot pass.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from '../helpers/test-organization';
import { RUN, signIn, anonClient, ok, refused, adminConversation, mirrorOf, purgeChatFor, fireUntil, type SignedIn, type Row } from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const created: TestUser[] = [];
const convs: string[] = [];
let org: TestOrganization;
let A: TestUser, B: TestUser, C: TestUser, D: TestUser;
let sA: SignedIn, sB: SignedIn, sC: SignedIn, sD: SignedIn;
let dm: string, gconv: string;
let dmMsg: Row, gOld: Row;

const mk = async (l: string) => { const u = await createTestUser({ name: `Rx${l} ${RUN}` }); created.push(u); return u; };
const send = (s: SignedIn, conv: string, body: string) =>
  ok<Row>(s.client.rpc('send_chat_message', { p_conversation: conv, p_body: body }), `send ${body}`);
const add = (s: SignedIn, msg: string, emoji = '👍') => s.client.rpc('add_chat_reaction', { p_message: msg, p_emoji: emoji });
const remove = (s: SignedIn, msg: string, emoji = '👍') => s.client.rpc('remove_chat_reaction', { p_message: msg, p_emoji: emoji });
const rows = async (msg: string) => (await supabaseAdmin.from('chat_message_reactions').select('*').eq('message_id', msg)).data ?? [];

test.beforeAll(async () => {
  test.setTimeout(180_000);
  org = await createTestOrganization({ name: `P1652 org ${RUN}` });
  [A, B, C, D] = await Promise.all([mk('A'), mk('B'), mk('C'), mk('D')]);
  await createTestMembership(org.id, A.user.id);
  await createTestMembership(org.id, B.user.id);
  [sA, sB, sC, sD] = [await signIn(A), await signIn(B), await signIn(C), await signIn(D)];
  dm = await ok<string>(sA.client.rpc('start_dm', { p_other: B.user.id }), 'dm');
  convs.push(dm);
  // Group channel: ensure_for_user creates it on the first get_my_chats.
  await ok(sA.client.rpc('get_my_chats'), 'get_my_chats');
  gconv = await adminConversation('group', { org_id: org.id });
  dmMsg = await send(sA, dm, `dm-${RUN}`);
  gOld = await send(sA, gconv, `g-old-${RUN}`);
  await new Promise((r) => setTimeout(r, 1500));
  await createTestMembership(org.id, D.user.id); // late joiner: accepted_at = now, after gOld
});

test.afterAll(async () => {
  test.setTimeout(240_000);
  await purgeChatFor(created.map((u) => u.user.id), convs);
  for (const u of created) await deleteTestUser(u.user.id);
  await deleteTestOrganization(org.id);
});

test('structure: no client can write the table directly; the service role can', async () => {
  for (const [who, c] of [['A', sA.client], ['C', sC.client], ['anon', anonClient()]] as const) {
    const e1 = await refused(c.from('chat_message_reactions').insert({ message_id: dmMsg.id, profile_id: A.user.id, emoji: '👍' }), `${who} insert`);
    expect(e1.code).toBe('42501');
    const e2 = await refused(c.from('chat_message_reactions').delete().eq('message_id', dmMsg.id), `${who} delete`);
    expect(e2.code).toBe('42501');
  }
  const { error } = await supabaseAdmin.from('chat_message_reactions').insert({ message_id: dmMsg.id, profile_id: A.user.id, emoji: '🙏' });
  expect(error).toBeNull();
  await supabaseAdmin.from('chat_message_reactions').delete().eq('message_id', dmMsg.id);
});

test('member adds, repeat is a no-op, two emoji coexist, remove is own-only and repeatable', async () => {
  const first = await ok<Row>(add(sB, dmMsg.id), 'B adds');
  expect(first.profile_id).toBe(B.user.id);
  await ok(add(sB, dmMsg.id), 'B repeats');
  expect(await rows(dmMsg.id)).toHaveLength(1);
  await ok(add(sB, dmMsg.id, '❤️'), 'B second emoji');
  expect(await rows(dmMsg.id)).toHaveLength(2);
  // A cannot remove B's reaction: A's remove touches only A's own (none) rows
  await ok(remove(sA, dmMsg.id), 'A removes (own, none)');
  expect(await rows(dmMsg.id)).toHaveLength(2);
  await ok(remove(sB, dmMsg.id), 'B removes one');
  await ok(remove(sB, dmMsg.id), 'B removes again');
  const left = await rows(dmMsg.id);
  expect(left.map((r: Row) => r.emoji)).toEqual(['❤️']);
});

test('add refuses a word that is not in the fixed emoji set; the same call with an emoji works', async () => {
  const m = await send(sA, dm, `word-${RUN}`);
  const err = await refused(add(sB, m.id, 'hello'), 'B adds a word');
  expect(err.code).toBe('22023');
  expect(await rows(m.id)).toHaveLength(0);
  await ok(add(sB, m.id, '🙏'), 'B adds an emoji (control)');
  expect(await rows(m.id)).toHaveLength(1);
});

test('read rule: member sees, non-member sees nothing and cannot add', async () => {
  const seen = await ok<Row[]>(sA.client.from('chat_message_reactions').select('id, emoji').eq('message_id', dmMsg.id), 'A reads');
  expect(seen).toHaveLength(1);
  const none = await ok<Row[]>(sC.client.from('chat_message_reactions').select('id').eq('message_id', dmMsg.id), 'C reads');
  expect(none).toHaveLength(0);
  const err = await refused(add(sC, dmMsg.id), 'C adds');
  expect(err.code).toBe('42501');
  expect(await rows(dmMsg.id)).toHaveLength(1);
});

test('late joiner cannot read or add on a message from before they joined', async () => {
  await ok(add(sA, gOld.id), 'A reacts in group (control)');
  const none = await ok<Row[]>(sD.client.from('chat_message_reactions').select('id').eq('message_id', gOld.id), 'D reads');
  expect(none).toHaveLength(0);
  const err = await refused(add(sD, gOld.id), 'D adds on earlier message');
  expect(err.code).toBe('42501');
  const fresh = await send(sA, gconv, `g-new-${RUN}`);
  await ok(add(sD, fresh.id), 'D adds on a message after joining (control)');
});

test('a person who can no longer post cannot add (blocked 1:1); existing reactions stay', async () => {
  await ok(sA.client.rpc('block_user', { p_other: B.user.id }), 'A blocks B');
  const err = await refused(add(sB, dmMsg.id, '😂'), 'B adds while blocked');
  expect(err.code).toBe('42501');
  expect((await rows(dmMsg.id)).length).toBe(1);
  await ok(sA.client.rpc('unblock_user', { p_other: B.user.id }), 'A unblocks');
  await ok(add(sB, dmMsg.id, '😂'), 'B adds after unblock (control)');
});

test('mirror chat refuses reactions', async () => {
  const mc = await mirrorOf(sA);
  const msg = await send(sA, mc, `mirror-${RUN}`);
  const err = await refused(add(sA, msg.id), 'A reacts in own mirror');
  expect(err.code).toBe('42501');
  expect(await rows(msg.id)).toHaveLength(0);
});

test('deleting a message removes its reactions and refuses new ones', async () => {
  const m = await send(sA, dm, `del-${RUN}`);
  await ok(add(sB, m.id), 'B reacts');
  expect(await rows(m.id)).toHaveLength(1);
  await ok(sA.client.rpc('delete_chat_message', { p_message: m.id }), 'A deletes');
  expect(await rows(m.id)).toHaveLength(0);
  const err = await refused(add(sB, m.id), 'B reacts to deleted');
  expect(err.code).toBe('42501');
});

test('erasing an account removes its reactions', async () => {
  const E = await mk('E');
  await createTestMembership(org.id, E.user.id); // a 1:1 needs a shared connection
  const sE = await signIn(E);
  const edm = await ok<string>(sA.client.rpc('start_dm', { p_other: E.user.id }), 'dm with E');
  convs.push(edm);
  const em = await send(sA, edm, `erase-e-${RUN}`);
  await ok(add(sE, em.id), 'E reacts');
  expect(await rows(em.id)).toHaveLength(1);
  await supabaseAdmin.rpc('erase_chat_data_for', { p_uid: E.user.id });
  await deleteTestUser(E.user.id);
  expect(await rows(em.id)).toHaveLength(0);
});

interface RxWatch { inserts: Row[]; deletes: Row[]; stop: () => Promise<void> }

/** A reactions-table subscription that resolves only once it is SUBSCRIBED (rejects on error or timeout). */
async function watchReactions(client: SignedIn['client'], label: string): Promise<RxWatch> {
  const w: RxWatch = { inserts: [], deletes: [], stop: async () => undefined };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: reactions channel never reached SUBSCRIBED`)), 20_000);
    const ch = client
      .channel(`rx-${label}-${RUN}-${Math.random().toString(36).slice(2, 6)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_message_reactions' }, (p) => w.inserts.push(p.new as Row))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_message_reactions' }, (p) => w.deletes.push(p.old as Row))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(`${label}: channel ${status}`)); }
      });
    w.stop = async () => { await client.removeChannel(ch); };
  });
  return w;
}

test('realtime: a member receives the INSERT and the DELETE; a non-member receives no INSERT, and its DELETE carries only the generated id', async () => {
  const m = await send(sA, dm, `rt-${RUN}`);
  const member = await watchReactions(sA.client, 'member');
  const outsider = await watchReactions(sC.client, 'outsider');
  try {
    // A single write right after SUBSCRIBED can land before the replication slot forwards the table: re-fire (add then remove) until both arrive.
    const arrived = await fireUntil(
      async () => {
        await ok(add(sB, m.id, '🙏'), 'B adds');
        await ok(remove(sB, m.id, '🙏'), 'B removes');
      },
      () => member.inserts.length > 0 && member.deletes.length > 0 && outsider.deletes.length > 0,
      20_000,
    );
    expect(arrived, 'member INSERT, member DELETE and outsider DELETE must all arrive').toBe(true);
    const inserted = member.inserts.find((r) => r.message_id === m.id);
    expect(inserted?.profile_id).toBe(B.user.id);
    expect(inserted?.emoji).toBe('🙏');
    // The DELETE a member sees names the row that was inserted (the id is what the client applies).
    // Any matching pair, not the first insert: in the moments after SUBSCRIBED the first removal can be missed
    // (2 of 6 runs measured), which the client's re-read on reconnect heals. Once settled, the ids must correspond.
    const insertedIds = new Set(member.inserts.map((r) => r.id));
    await expect.poll(() => member.deletes.some((r) => insertedIds.has(r.id)), { timeout: 5_000 }).toBe(true);
    // The outsider: the INSERT is filtered by the read policy (control: the member got it), the DELETE is not and holds only the id.
    expect(outsider.inserts.filter((r) => r.message_id === m.id)).toHaveLength(0);
    expect(Object.keys(outsider.deletes[0] ?? {})).toEqual(['id']);
  } finally {
    await member.stop();
    await outsider.stop();
  }
});
