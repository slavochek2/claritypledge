/**
 * @file p1512-chat-read-canary.spec.ts
 * @description READ canary for Clarity Chat (supabase/migrations/20261019203000_p1512_clarity_chat.sql).
 *
 * THE INVARIANT. No chat content is readable by a non-member through any path: REST, RPC,
 * Realtime postgres_changes, search, forward, attach or Clarify, even holding a REAL message or
 * conversation id. Plus the access lifecycle of the spec (join / leave / RSVP window / event
 * delete / delete / erase / read state across devices).
 *
 * EVERY ABSENCE HAS A CONTROL. A test that asserts "the outsider got nothing" proves nothing
 * unless the same probe, through the same path, FAILS TO BE EMPTY for a member (epistemic gates
 * 7 and 7b). Each block below reads the member side first and fails if it comes back empty, and the
 * Realtime block re-fires its writes until a control subscriber has received, so silence from the
 * outsider cannot be a dead channel.
 *
 * Actors: A and B share an organization (and a 1:1); C is an outsider; D joins the organization
 * later; H hosts events and P1..P3 RSVP at different times; X erases their account; U reads on two
 * devices.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from '../helpers/test-organization';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import {
  RUN, signIn, ok, refused, sleep, adminMessages, adminConversation, mirrorOf, myChatIds, collect, fireUntil,
  closeAll, purgeChatFor, type SignedIn, type Row,
} from '../helpers/test-chat';
import { keysetBeforeFilter, messageCursor } from '../../src/app/data/chat-mappers';

test.describe.configure({ mode: 'serial' });

const HOUR = 3_600_000;
const T0 = new Date(Date.now() - 5_000).toISOString();

const created: TestUser[] = [];
const eventsToClean: TestEvent[] = [];
const orgsToClean: TestOrganization[] = [];
const convsToClean: string[] = [];

async function mk(label: string): Promise<TestUser> {
  const u = await createTestUser({ name: `Chat${label} ${RUN}` });
  created.push(u);
  return u;
}

const send = (s: SignedIn, conv: string, body: string, extra: Record<string, unknown> = {}) =>
  ok<Row>(s.client.rpc('send_chat_message', { p_conversation: conv, p_body: body, ...extra }), `send "${body}"`);

async function visibleIds(s: SignedIn, conv: string): Promise<string[]> {
  const { data, error } = await s.client.from('chat_messages').select('id').eq('conversation_id', conv);
  if (error) throw new Error(`REST select failed: ${error.message}`);
  return (data ?? []).map((r) => r.id as string);
}

let org: TestOrganization;
let A: TestUser, B: TestUser, C: TestUser;
let sA: SignedIn, sB: SignedIn, sC: SignedIn;
let dm: string;
let m1: Row, m2: Row;
let gconv: string;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  org = await createTestOrganization({ name: `Chat canary org ${RUN}` });
  orgsToClean.push(org);
  [A, B, C] = await Promise.all([mk('A'), mk('B'), mk('C')]);
  await createTestMembership(org.id, A.user.id);
  await createTestMembership(org.id, B.user.id);
  sA = await signIn(A);
  sB = await signIn(B);
  sC = await signIn(C);

  // A and B share the org, so A may start a 1:1 with B; C shares nothing with anyone.
  dm = await ok<string>(sA.client.rpc('start_dm', { p_other: B.user.id }), 'A starts dm with B');
  convsToClean.push(dm);
  m1 = await send(sA, dm, `A-secret-${RUN}`);
  m2 = await send(sB, dm, `B-secret-${RUN}`);

  // Group channel: ensure_for_user creates it on the first get_my_chats.
  await myChatIds(sA.client);
  gconv = await adminConversation('group', { org_id: org.id });
});

test.afterAll(async () => {
  test.setTimeout(240_000);
  await purgeChatFor(created.map((u) => u.user.id), convsToClean);
  for (const e of eventsToClean) await deleteTestEvent(e.id);
  for (const u of created) await deleteTestUser(u.user.id);
  for (const o of orgsToClean) await deleteTestOrganization(o.id);
});

test('REST: an outsider reads nothing by real id, by conversation, by text or by someone else\'s state', async () => {
  // CONTROLS first: the same four reads, through the same client type, DO return rows for members.
  await ok(sA.client.rpc('mark_chat_read', { p_conversation: dm }), 'A marks read (creates A member_state)');
  const aById = await sA.client.from('chat_messages').select('id,body').eq('id', m1.id);
  expect(aById.data?.map((r) => r.id), 'control: A reads m1 by id').toEqual([m1.id]);
  const bByConv = await visibleIds(sB, dm);
  expect(bByConv.sort(), 'control: B reads both dm messages by conversation').toEqual([m1.id, m2.id].sort());
  const bText = await sB.client.from('chat_messages').select('id').ilike('body', `%secret-${RUN}%`);
  expect(bText.data?.length, 'control: B finds the dm by text').toBe(2);
  const aConv = await sA.client.from('chat_conversations').select('id').eq('id', dm);
  expect(aConv.data?.length, 'control: A reads the conversation row').toBe(1);
  const aState = await sA.client.from('chat_member_state').select('conversation_id,profile_id').eq('conversation_id', dm);
  expect(aState.data?.length, 'control: A reads own member_state').toBe(1);

  // THE OUTSIDER (C) through each path.
  for (const [what, q] of [
    ['by message id', sC.client.from('chat_messages').select('*').eq('id', m1.id)],
    ['by conversation id', sC.client.from('chat_messages').select('*').eq('conversation_id', dm)],
    ['by text', sC.client.from('chat_messages').select('*').ilike('body', `%secret-${RUN}%`)],
    ['conversation row by id', sC.client.from('chat_conversations').select('*').eq('id', dm)],
    ['A\'s member_state by conversation', sC.client.from('chat_member_state').select('*').eq('conversation_id', dm)],
    ['A\'s member_state by profile', sC.client.from('chat_member_state').select('*').eq('profile_id', A.user.id)],
  ] as const) {
    const { data, error } = await q;
    expect(error, `outsider ${what}: must be an empty result, not an error that hides a leak`).toBeNull();
    expect(data, `outsider ${what}`).toEqual([]);
  }

  // B cannot read A's read state either (own rows only), though B is in the same conversation.
  const bSeesA = await sB.client.from('chat_member_state').select('*').eq('profile_id', A.user.id);
  expect(bSeesA.data, 'B must not read A\'s member_state').toEqual([]);

  // C's own list does not contain the dm.
  expect(await myChatIds(sC.client)).not.toContain(dm);
  expect(await myChatIds(sA.client), 'control: A\'s list contains the dm').toContain(dm);
});

test('RPC: an outsider holding a real message id cannot forward, clarify, reply, edit, delete, mark or send', async () => {
  const cMirror = await mirrorOf(sC);
  const before = (await adminMessages(dm)).length;

  // CONTROL: the same RPCs work for a member, so a refusal below is authorisation, not a typo.
  const bFwd = await ok<Row>(
    sB.client.rpc('forward_chat_message', { p_source: m1.id, p_target_conversation: await mirrorOf(sB) }),
    'B forwards m1 to own mirror',
  );
  expect(bFwd.kind).toBe('forward');
  const bClar = await ok<Row>(sB.client.rpc('clarify_chat_message', { p_source: m1.id }), 'B clarifies m1');
  expect(bClar.kind).toBe('clarify');

  const cases: Array<[string, PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>]> = [
    ['forward A\'s message to C\'s mirror', sC.client.rpc('forward_chat_message', { p_source: m1.id, p_target_conversation: cMirror })],
    ['clarify A\'s message', sC.client.rpc('clarify_chat_message', { p_source: m1.id })],
    ['send into A/B dm', sC.client.rpc('send_chat_message', { p_conversation: dm, p_body: 'intruder' })],
    ['quote-reply to A\'s message from C\'s own mirror', sC.client.rpc('send_chat_message', { p_conversation: cMirror, p_body: 'x', p_reply_to: m1.id })],
    ['thread-reply to A\'s message', sC.client.rpc('send_chat_message', { p_conversation: cMirror, p_body: 'x', p_thread_root: m1.id })],
    ['edit A\'s message', sC.client.rpc('edit_chat_message', { p_message: m1.id, p_body: 'hacked' })],
    ['delete A\'s message', sC.client.rpc('delete_chat_message', { p_message: m1.id })],
    ['mark the dm read', sC.client.rpc('mark_chat_read', { p_conversation: dm })],
    ['archive the dm', sC.client.rpc('set_chat_state', { p_conversation: dm, p_archived: true })],
    ['forward from A\'s message into the dm itself', sC.client.rpc('forward_chat_message', { p_source: m1.id, p_target_conversation: dm })],
    ['start a dm with A without a shared connection', sC.client.rpc('start_dm', { p_other: A.user.id })],
  ];
  for (const [what, p] of cases) await refused(p, `outsider tries to ${what}`);

  // Nothing moved: no message appeared in the dm, A's text is unchanged.
  const after = await adminMessages(dm);
  expect(after.length, 'only the member-side controls may have written, and none of them write into the dm').toBe(before);
  expect(after.find((r) => r.id === m1.id)?.body).toBe(`A-secret-${RUN}`);
  expect(after.find((r) => r.id === m1.id)?.deleted_at).toBeNull();
});

test('search: an outsider finds neither A\'s messages nor A', async () => {
  // CONTROLS
  const aHits = await ok<Array<{ message_id: string }>>(sA.client.rpc('search_my_messages', { p_query: `secret-${RUN}` }), 'A message search');
  expect(aHits.length, 'control: A finds the dm messages').toBeGreaterThanOrEqual(2);
  const bFindsA = await ok<Array<{ profile_id: string }>>(sB.client.rpc('search_chat_people', { p_query: `ChatA ${RUN}` }), 'B people search');
  expect(bFindsA.map((p) => p.profile_id), 'control: B (shares an org) finds A').toContain(A.user.id);

  const cHits = await ok<unknown[]>(sC.client.rpc('search_my_messages', { p_query: `secret-${RUN}` }), 'C message search');
  expect(cHits).toEqual([]);
  const cFindsA = await ok<Array<{ profile_id: string }>>(sC.client.rpc('search_chat_people', { p_query: `ChatA ${RUN}` }), 'C people search');
  expect(cFindsA.map((p) => p.profile_id)).not.toContain(A.user.id);
  const cBlank = await ok<unknown[]>(sC.client.rpc('search_chat_people', { p_query: '' }), 'C blank people search');
  expect(cBlank, 'a blank query must not list people the caller shares nothing with').toEqual([]);
});

test('Realtime: an outsider\'s live channel receives none of A and B\'s messages or read state, while a member control does', async () => {
  test.setTimeout(90_000);
  const cMirror = await mirrorOf(sC);
  const colA = await collect(sA.client, 'A');
  const colB = await collect(sB.client, 'B');
  const colC = await collect(sC.client, 'C');
  try {
    const marker = `rt-${RUN}`;
    let n = 0;
    const bGotDm = () => colB.messages.some((m) => m.new.conversation_id === dm && String(m.new.body ?? '').startsWith(marker));
    const cGotOwn = () => colC.messages.some((m) => m.new.conversation_id === cMirror);
    const arrived = await fireUntil(
      async () => {
        n++;
        await sA.client.rpc('send_chat_message', { p_conversation: dm, p_body: `${marker}-${n}` });
        await sC.client.rpc('send_chat_message', { p_conversation: cMirror, p_body: `c-own-${n}` });
      },
      () => bGotDm() && cGotOwn(),
    );
    expect(bGotDm(), 'CONTROL: member B must receive A\'s dm message live').toBe(true);
    expect(cGotOwn(), 'CONTROL: C\'s channel must be alive (it receives its own mirror)').toBe(true);
    expect(arrived).toBe(true);

    const leakedToC = colC.messages.filter(
      (m) => m.new.conversation_id === dm || JSON.stringify(m).includes(marker) || JSON.stringify(m).includes(`secret-${RUN}`),
    );
    expect(leakedToC, 'REALTIME LEAK: the outsider received a dm payload').toEqual([]);

    // Read state: A's marker events reach A, never B or C.
    const aGotState = await fireUntil(
      () => sA.client.rpc('mark_chat_read', { p_conversation: dm }),
      () => colA.states.some((s) => s.new.profile_id === A.user.id),
    );
    expect(aGotState, 'CONTROL: A must receive own member_state events').toBe(true);
    await sB.client.rpc('mark_chat_read', { p_conversation: dm });
    await sleep(1500);
    expect(colB.states.filter((s) => s.new.profile_id === A.user.id), 'B must not receive A\'s read state').toEqual([]);
    expect(colC.states.filter((s) => s.new.profile_id === A.user.id), 'C must not receive A\'s read state').toEqual([]);
  } finally {
    await closeAll(colA, colB, colC);
  }
});

test('group channel: history starts when you join, ends when you leave, restarts when you rejoin; a client cannot backdate itself', async () => {
  test.setTimeout(120_000);
  const D = await mk('D');
  const sD = await signIn(D);
  const g1 = await send(sA, gconv, `g1-${RUN}`);
  await sleep(400);

  // D joins THROUGH THE CLIENT PATH, supplying a year-2020 accepted_at to try to read g1.
  await ok(
    sD.client.from('membership').insert({ org_id: org.id, user_id: D.user.id, accepted_at: '2020-01-01T00:00:00Z' }),
    'D joins the org',
  );
  const { data: mrow } = await supabaseAdmin.from('membership').select('accepted_at').eq('org_id', org.id).eq('user_id', D.user.id).single();
  expect(new Date(mrow!.accepted_at as string).getTime(), 'accepted_at must be stamped by the server, not the client').toBeGreaterThan(new Date(T0).getTime());

  expect(await myChatIds(sD.client), 'D sees the General channel after joining').toContain(gconv);
  await sleep(400);
  const g2 = await send(sA, gconv, `g2-${RUN}`);

  const dSees = await visibleIds(sD, gconv);
  expect(dSees, 'D sees messages sent after joining').toContain(g2.id);
  expect(dSees, 'D must NOT see history from before joining (D3)').not.toContain(g1.id);
  const aSees = await visibleIds(sA, gconv);
  expect(aSees, 'control: A sees both').toEqual(expect.arrayContaining([g1.id, g2.id]));

  // D leaves: access ends immediately on REST, in the list, for sending, and over Realtime.
  await ok(sD.client.from('membership').delete().eq('org_id', org.id).eq('user_id', D.user.id), 'D leaves');
  expect(await visibleIds(sD, gconv), 'after leaving D reads nothing').toEqual([]);
  expect(await myChatIds(sD.client)).not.toContain(gconv);
  await refused(sD.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'still here?' }), 'D sends after leaving');

  const colA = await collect(sA.client, 'A-group');
  const colD = await collect(sD.client, 'D-group');
  try {
    let n = 0;
    const aGot = () => colA.messages.some((m) => m.new.conversation_id === gconv && String(m.new.body ?? '').startsWith(`after-leave-${RUN}`));
    await fireUntil(async () => { n++; await sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: `after-leave-${RUN}-${n}` }); }, aGot);
    expect(aGot(), 'CONTROL: A receives the channel message live').toBe(true);
    expect(colD.messages.filter((m) => m.new.conversation_id === gconv), 'REALTIME LEAK: D received a message after leaving').toEqual([]);
  } finally {
    await closeAll(colA, colD);
  }

  // Rejoin: history restarts at the new time, so g2 stays hidden.
  await sleep(400);
  await ok(sD.client.from('membership').insert({ org_id: org.id, user_id: D.user.id }), 'D rejoins');
  await sleep(400);
  const g3 = await send(sA, gconv, `g3-${RUN}`);
  const dAfter = await visibleIds(sD, gconv);
  expect(dAfter).toContain(g3.id);
  expect(dAfter, 'rejoining does not restore old history').not.toContain(g2.id);
  expect(dAfter).not.toContain(g1.id);
});

test('event channel: RSVP inside the 12 h window gets it, a late RSVP does not (whoever inserts it), cancel removes it, host has it from the start', async () => {
  test.setTimeout(120_000);
  const H = await mk('H');
  const P1 = await mk('P1');
  const P2 = await mk('P2');
  const P3 = await mk('P3');
  const [sH, sP1, sP2] = await Promise.all([signIn(H), signIn(P1), signIn(P2)]);

  // --- inside the window --------------------------------------------------
  const ev1 = await createTestEvent(H.user.id, new Date(Date.now() - 2 * HOUR));
  eventsToClean.push(ev1);
  await myChatIds(sH.client); // host's call creates the event channel
  const econv1 = await adminConversation('event', { event_id: ev1.id });
  const e1 = await send(sH, econv1, `e1-${RUN}`);
  await sleep(400);
  await ok(sP1.client.from('event_rsvps').insert({ event_id: ev1.id, profile_id: P1.user.id }), 'P1 RSVPs inside the window');
  await sleep(400);
  const e2 = await send(sH, econv1, `e2-${RUN}`);
  expect(await myChatIds(sP1.client), 'RSVP inside the window grants the channel').toContain(econv1);
  const p1Sees = await visibleIds(sP1, econv1);
  expect(p1Sees).toContain(e2.id);
  expect(p1Sees, 'history from RSVP time only (D3)').not.toContain(e1.id);
  expect(await visibleIds(sH, econv1), 'control: the host has the channel from the start').toEqual(expect.arrayContaining([e1.id, e2.id]));

  // cancel removes access
  await ok(sP1.client.from('event_rsvps').delete().eq('event_id', ev1.id).eq('profile_id', P1.user.id), 'P1 cancels');
  expect(await visibleIds(sP1, econv1), 'cancelling an RSVP removes the channel').toEqual([]);
  expect(await myChatIds(sP1.client)).not.toContain(econv1);

  // --- a client RSVP after the window: stamped by the server, still too late ------------
  const ev2 = await createTestEvent(H.user.id, new Date(Date.now() - 13 * HOUR));
  eventsToClean.push(ev2);
  await myChatIds(sH.client);
  const econv2 = await adminConversation('event', { event_id: ev2.id });
  const x1 = await send(sH, econv2, `x1-${RUN}`);
  await ok(
    sP2.client.from('event_rsvps').insert({ event_id: ev2.id, profile_id: P2.user.id, rsvped_at: new Date(Date.now() - 14 * HOUR).toISOString() }),
    'P2 RSVPs late, claiming an early rsvped_at',
  );
  const { data: rrow } = await supabaseAdmin.from('event_rsvps').select('rsvped_at').eq('event_id', ev2.id).eq('profile_id', P2.user.id).single();
  expect(new Date(rrow!.rsvped_at as string).getTime(), 'a client-supplied rsvped_at must be overwritten with now()').toBeGreaterThan(new Date(T0).getTime());
  await sleep(300);
  await send(sH, econv2, `x2-${RUN}`); // sent AFTER the late RSVP, so only the window rule can hide it
  expect(await visibleIds(sP2, econv2), 'a late RSVP does not get the channel').toEqual([]);
  expect(await myChatIds(sP2.client)).not.toContain(econv2);
  await refused(sP2.client.rpc('send_chat_message', { p_conversation: econv2, p_body: 'let me in' }), 'late RSVP sends');
  expect(await visibleIds(sH, econv2), 'control: the host reads x1').toContain(x1.id);

  // --- service role writes an explicit rsvped_at; the window is evaluated on it ----------
  const ev3Start = Date.now() - 24 * HOUR;
  const ev3 = await createTestEvent(H.user.id, new Date(ev3Start));
  eventsToClean.push(ev3);
  await myChatIds(sH.client);
  const econv3 = await adminConversation('event', { event_id: ev3.id });
  const y1 = await send(sH, econv3, `y1-${RUN}`);
  const early = new Date(ev3Start + HOUR).toISOString();
  await ok(supabaseAdmin.from('event_rsvps').insert({ event_id: ev3.id, profile_id: P3.user.id, rsvped_at: early }), 'service role RSVPs early');
  const { data: srow } = await supabaseAdmin.from('event_rsvps').select('rsvped_at').eq('event_id', ev3.id).eq('profile_id', P3.user.id).single();
  expect(new Date(srow!.rsvped_at as string).toISOString(), 'service_role keeps the value it supplied').toBe(early);
  const sP3 = await signIn(P3);
  expect(await visibleIds(sP3, econv3), 'CONTROL: a service-inserted RSVP made inside the window DOES get the channel').toContain(y1.id);
  await ok(
    supabaseAdmin.from('event_rsvps').update({ rsvped_at: new Date(ev3Start + 13 * HOUR).toISOString() }).eq('event_id', ev3.id).eq('profile_id', P3.user.id),
    'move the RSVP after the window',
  );
  expect(await visibleIds(sP3, econv3), 'a service-inserted RSVP after datetime + 12 h does not get the channel').toEqual([]);
  expect(await myChatIds(sP3.client)).not.toContain(econv3);
});

test('delete: the body is gone over REST, Realtime and the database; forwards keep their copy; deleted text cannot be forwarded or edited', async () => {
  test.setTimeout(90_000);
  const colB = await collect(sB.client, 'B-delete');
  try {
    const marker = `del-${RUN}`;
    let n = 0;
    const inserted = () => colB.messages.find((m) => m.type === 'INSERT' && m.new.conversation_id === gconv && String(m.new.body ?? '').startsWith(marker));
    await fireUntil(async () => { n++; await sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: `${marker}-${n}` }); }, () => !!inserted());
    const ins = inserted();
    expect(ins, 'CONTROL: B receives the INSERT carrying the body').toBeTruthy();
    const victimId = ins!.new.id as string;
    const secretBody = ins!.new.body as string;

    // B forwards it BEFORE it is deleted: the copy must survive (D5).
    const fwd = await ok<Row>(
      sB.client.rpc('forward_chat_message', { p_source: victimId, p_target_conversation: await mirrorOf(sB) }),
      'B forwards the victim message',
    );

    await ok(sA.client.rpc('delete_chat_message', { p_message: victimId }), 'A deletes it');
    const gotUpdate = await fireUntil(async () => undefined, () => colB.messages.some((m) => m.type === 'UPDATE' && m.new.id === victimId), 15_000);
    expect(gotUpdate, 'CONTROL: B receives the UPDATE that carries the deletion').toBe(true);

    const upd = colB.messages.filter((m) => m.type === 'UPDATE' && m.new.id === victimId);
    for (const u of upd) {
      expect(u.new.body, 'REALTIME: the UPDATE payload carries no body').toBeNull();
      expect(u.new.deleted_at, 'REALTIME: the UPDATE marks it deleted').toBeTruthy();
      expect(JSON.stringify(u), 'the old text appears nowhere in the UPDATE payload').not.toContain(secretBody);
    }
    expect(colB.messages.filter((m) => m.type === 'DELETE'), 'a user delete must not be a hard DELETE (Realtime does not RLS-filter those)').toEqual([]);

    const { data: rest } = await sB.client.from('chat_messages').select('body,deleted_at,attachment_id').eq('id', victimId).single();
    expect(rest!.body).toBeNull();
    expect(rest!.deleted_at).toBeTruthy();
    const truth = (await adminMessages(gconv)).find((r) => r.id === victimId)!;
    expect(truth.body, 'the body is removed in the database, not just hidden').toBeNull();
    expect(JSON.stringify(truth)).not.toContain(secretBody);

    const copy = (await adminMessages(await mirrorOf(sB))).find((r) => r.id === fwd.id)!;
    expect(copy.forward_snapshot?.body, 'the forward keeps its own copy (D5)').toBe(secretBody);
    expect(copy.forwarded_from_message_id).toBe(victimId);

    await refused(sB.client.rpc('forward_chat_message', { p_source: victimId, p_target_conversation: await mirrorOf(sB) }), 'forward a deleted message');
    await refused(sB.client.rpc('clarify_chat_message', { p_source: victimId }), 'clarify a deleted message');
    await refused(sA.client.rpc('edit_chat_message', { p_message: victimId, p_body: 'resurrect' }), 'edit a deleted message');
  } finally {
    await closeAll(colB);
  }
});

test('clarify: copies the message and its thread into the caller\'s own mirror only', async () => {
  const root = await send(sA, gconv, `root-${RUN}`);
  const reply = await send(sB, gconv, `reply-${RUN}`, { p_thread_root: root.id });
  const cl = await ok<Row>(sB.client.rpc('clarify_chat_message', { p_source: root.id }), 'B clarifies the root');
  expect(cl.kind).toBe('clarify');
  expect(cl.conversation_id).toBe(await mirrorOf(sB));
  const thread = (cl.forward_snapshot as { thread: Array<{ body: string }> }).thread;
  expect(thread.map((t) => t.body), 'the thread reply rides along').toContain(`reply-${RUN}`);
  expect(thread.every((t) => !('author_id' in t)), 'thread entries carry no raw author id, only an opaque ref').toBe(true);
  // L: the snapshot names the source chat as the clarifier sees it.
  expect(cl.forward_snapshot?.conversation_title, 'group chat title').toBe(`${org.name} · General`);
  const dmClarify = await ok<Row>(sB.client.rpc('clarify_chat_message', { p_source: m1.id }), 'B clarifies the dm message');
  expect(dmClarify.forward_snapshot?.conversation_title, 'dm title is the other person as the clarifier sees them').toBe(A.name);
  // Forwarding a clarify copy does not carry the thread (E).
  const fwdOfClarify = await ok<Row>(
    sB.client.rpc('forward_chat_message', { p_source: cl.id, p_target_conversation: gconv }),
    'B forwards the clarify copy to the group',
  );
  expect(fwdOfClarify.forward_snapshot, 'the original snapshot is kept').toBeTruthy();
  expect('thread' in (fwdOfClarify.forward_snapshot as object), 'a forwarded clarify drops its thread').toBe(false);
  expect(fwdOfClarify.forward_snapshot?.body).toBe(`root-${RUN}`);
  const inSource = (await adminMessages(gconv)).filter((r) => r.kind === 'clarify');
  expect(inSource, 'nothing is posted into the source chat').toEqual([]);
  expect(await visibleIds(sA, await mirrorOf(sB)), 'A cannot read B\'s mirror').toEqual([]);
  expect(reply.thread_root_id).toBe(root.id);
});

test('unread: counts, mark-read, mark-unread and archive agree across two devices of one user, and the state event reaches the second device', async () => {
  test.setTimeout(120_000);
  const org2 = await createTestOrganization({ name: `Chat canary org2 ${RUN}` });
  orgsToClean.push(org2);
  const U = await mk('U');
  await createTestMembership(org2.id, A.user.id);
  await createTestMembership(org2.id, U.user.id);
  const [sU1, sU2] = [await signIn(U), await signIn(U)];

  await myChatIds(sU2.client);
  const dmAU = await ok<string>(sA.client.rpc('start_dm', { p_other: U.user.id }), 'A starts dm with U');
  convsToClean.push(dmAU);
  await send(sA, dmAU, `u1-${RUN}`);
  await send(sA, dmAU, `u2-${RUN}`);
  await myChatIds(sA.client);
  const g2conv = await adminConversation('group', { org_id: org2.id });
  const root = await send(sA, g2conv, `uroot-${RUN}`);
  await send(sA, g2conv, `ureply-${RUN}`, { p_thread_root: root.id });

  type ChatRow = { conversation_id: string; unread_count: number; manual_unread: boolean; archived: boolean; last_read_at: string | null };
  const row = async (s: SignedIn, conv: string) =>
    (await ok<ChatRow[]>(s.client.rpc('get_my_chats'), 'get_my_chats')).find((r) => r.conversation_id === conv)!;

  expect((await row(sU2, dmAU)).unread_count, 'device 2 sees both unread messages').toBe(2);
  expect((await row(sU2, g2conv)).unread_count, 'a thread reply does not count as unread; only the root does').toBe(1);
  expect((await row(sA, dmAU)).unread_count, 'your own messages are never unread').toBe(0);

  const colU2 = await collect(sU2.client, 'U2');
  const colA = await collect(sA.client, 'A-unread');
  try {
    const got = await fireUntil(
      () => sU1.client.rpc('mark_chat_read', { p_conversation: dmAU }),
      () => colU2.states.some((s) => s.new.conversation_id === dmAU && s.new.profile_id === U.user.id),
    );
    expect(got, 'the member_state event from device 1 must reach device 2').toBe(true);
    await sleep(1000);
    expect(colA.states.filter((s) => s.new.profile_id === U.user.id), 'A must not receive U\'s read state').toEqual([]);
  } finally {
    await closeAll(colU2, colA);
  }

  const read = await row(sU2, dmAU);
  expect(read.unread_count, 'device 2 sees zero after device 1 marked read').toBe(0);
  expect(read.last_read_at).toBeTruthy();

  await ok(sU1.client.rpc('set_chat_state', { p_conversation: dmAU, p_manual_unread: true }), 'mark as unread');
  expect((await row(sU2, dmAU)).manual_unread, 'mark-as-unread persists to the other device').toBe(true);
  await ok(sU1.client.rpc('set_chat_state', { p_conversation: dmAU, p_archived: true }), 'archive');
  const arch = await row(sU2, dmAU);
  expect(arch.archived).toBe(true);
  expect(arch.manual_unread, 'archiving leaves the unread mark alone').toBe(true);
  await ok(sU1.client.rpc('mark_chat_read', { p_conversation: dmAU }), 'read again');
  expect((await row(sU2, dmAU)).manual_unread, 'reading clears the manual mark').toBe(false);
  await send(sA, dmAU, `u3-${RUN}`);
  expect((await row(sU2, dmAU)).unread_count, 'a new message after the read marker is unread').toBe(1);

  // G: the sender's own message clears their manual-unread mark and moves their read marker.
  await ok(sU1.client.rpc('set_chat_state', { p_conversation: dmAU, p_manual_unread: true }), 'U marks unread again');
  expect((await row(sU2, dmAU)).manual_unread).toBe(true);
  const reply = await send(sU1, dmAU, `u-reply-${RUN}`);
  const afterSend = await row(sU2, dmAU);
  expect(afterSend.manual_unread, 'sending clears the manual unread mark').toBe(false);
  expect(new Date(afterSend.last_read_at!).getTime(), 'sending advances the sender\'s read marker to the message').toBeGreaterThanOrEqual(new Date(reply.created_at).getTime());
  expect(afterSend.unread_count, 'everything up to the reply counts as read').toBe(0);
});

test('Realtime DELETE: a cascade delete leaks no conversation id, profile id or body to other subscribers', async () => {
  test.setTimeout(90_000);
  const mirrorB = await mirrorOf(sB);
  const colA = await collect(sA.client, 'A-del');
  const colB = await collect(sB.client, 'B-del');
  const colC = await collect(sC.client, 'C-del');
  try {
    const marker = `mirror-del-${RUN}`;
    let n = 0;
    const ownerSaw = () =>
      colB.messages.some((m) => m.type === 'INSERT' && m.new.conversation_id === mirrorB) &&
      colB.states.some((s) => s.new.conversation_id === mirrorB && s.new.profile_id === B.user.id);
    await fireUntil(async () => {
      n++;
      await sB.client.rpc('send_chat_message', { p_conversation: mirrorB, p_body: `${marker}-${n}` });
      await sB.client.rpc('mark_chat_read', { p_conversation: mirrorB });
    }, ownerSaw);
    expect(ownerSaw(), 'CONTROL: the owner receives their own message INSERT and read-state INSERT/UPDATE').toBe(true);
    expect(colB.states.some((s) => s.type === 'UPDATE' || s.type === 'INSERT')).toBe(true);

    // Deleting the conversation cascades to its messages and read state: Realtime DELETEs.
    const { error } = await supabaseAdmin.from('chat_conversations').delete().eq('id', mirrorB);
    expect(error).toBeNull();
    const all = [colA, colB, colC];
    const sawDelete = await fireUntil(async () => undefined, () =>
      all.some((c) => c.messages.some((m) => m.type === 'DELETE') || c.states.some((s) => s.type === 'DELETE')), 20_000);
    expect(sawDelete, 'CONTROL: the DELETE events reached the wire for at least one subscriber (else the checks below prove nothing)').toBe(true);

    for (const [who, c] of [['A', colA], ['B', colB], ['C', colC]] as const) {
      for (const m of c.messages.filter((x) => x.type === 'DELETE')) {
        expect(Object.keys(m.old).sort(), `chat_messages DELETE to ${who} carries only the row id`).toEqual(['id']);
      }
      for (const st of c.states.filter((x) => x.type === 'DELETE')) {
        expect(Object.keys(st.old).sort(), `chat_member_state DELETE to ${who} carries only the row id`).toEqual(['id']);
      }
    }
    for (const [who, c] of [['A', colA], ['C', colC]] as const) {
      const wire = JSON.stringify([c.messages, c.states]);
      expect(wire, `${who} must never see B's mirror conversation id`).not.toContain(mirrorB);
      // Read-state payloads only: B's id may legitimately appear as the AUTHOR of group messages A can
      // read (late-delivered events from earlier tests), but never in a read-state payload.
      const withB = c.states.filter((e) => JSON.stringify(e).includes(B.user.id));
      expect(withB.map((e) => JSON.stringify(e)), `${who} must never see B's profile id in B's read state`).toEqual([]);
      expect(wire, `${who} must never see B's mirror text`).not.toContain(marker);
    }
  } finally {
    await closeAll(colA, colB, colC);
  }
});

test('keyset paging: messages sharing one timestamp are neither skipped nor repeated', async () => {
  const ts = new Date().toISOString();
  const seeded = Array.from({ length: 5 }, (_, i) => ({
    conversation_id: gconv, author_id: A.user.id, body: `tie-${i}-${RUN}`, created_at: ts,
  }));
  const ins = await supabaseAdmin.from('chat_messages').insert(seeded).select('id');
  expect(ins.error).toBeNull();
  const tieIds = new Set((ins.data ?? []).map((r) => r.id as string));

  const all = await sA.client.from('chat_messages').select('id,created_at').eq('conversation_id', gconv).is('thread_root_id', null)
    .order('created_at', { ascending: false }).order('id', { ascending: false });
  const expected = (all.data ?? []).map((r) => r.id as string);

  const seen: string[] = [];
  let cursor: { createdAt: string; id: string } | undefined;
  for (let page = 0; page < 40; page++) {
    let q = sA.client.from('chat_messages').select('id,created_at').eq('conversation_id', gconv).is('thread_root_id', null)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(2);
    if (cursor) q = q.or(keysetBeforeFilter(cursor));
    const { data, error } = await q;
    expect(error, 'cursor query must be valid').toBeNull();
    if (!data || data.length === 0) break;
    seen.push(...data.map((r) => r.id as string));
    const last = data[data.length - 1]!;
    cursor = messageCursor({ createdAt: last.created_at as string, id: last.id as string });
  }
  expect(new Set(seen).size, 'no row repeated').toBe(seen.length);
  expect(seen, 'paging by (created_at, id) visits every message exactly once, in order').toEqual(expected);
  for (const id of tieIds) expect(seen, 'every tied row was visited').toContain(id);
  // CONTROL: a timestamp-only cursor DOES skip the ties, which is why the id tie-break exists.
  const tsOnly = await sA.client.from('chat_messages').select('id').eq('conversation_id', gconv).or(keysetBeforeFilter(ts));
  expect((tsOnly.data ?? []).filter((r) => tieIds.has(r.id as string)).length, 'timestamp-only paging drops tied rows').toBe(0);
});

test('event delete: removing an event that has a channel with messages succeeds and takes the channel with it', async () => {
  const H2 = await mk('H2');
  const sH2 = await signIn(H2);
  const ev = await createTestEvent(H2.user.id, new Date(Date.now() - HOUR));
  eventsToClean.push(ev);
  await myChatIds(sH2.client);
  const econv = await adminConversation('event', { event_id: ev.id });
  const msg = await send(sH2, econv, `before-delete-${RUN}`);
  await ok(sH2.client.rpc('mark_chat_read', { p_conversation: econv }), 'host has read state too');
  expect((await adminMessages(econv)).length).toBe(1);

  // The host deletes through the same client path the app uses.
  const { error } = await sH2.client.from('events').delete().eq('id', ev.id);
  expect(error, `deleting an event with a chat channel must not be blocked: ${error?.message}`).toBeNull();

  const { data: conv } = await supabaseAdmin.from('chat_conversations').select('id').eq('id', econv);
  expect(conv, 'the channel is deleted with the event').toEqual([]);
  const { data: msgs } = await supabaseAdmin.from('chat_messages').select('id').eq('id', msg.id);
  expect(msgs, 'its messages are deleted with it').toEqual([]);
  const { data: st } = await supabaseAdmin.from('chat_member_state').select('conversation_id').eq('conversation_id', econv);
  expect(st).toEqual([]);
});

test('erase: erase_my_account succeeds with chat data; their messages become "Deleted user" with no body, the 1:1 survives for the other side, copies are renamed', async () => {
  test.setTimeout(120_000);
  const X = await mk('X');
  await createTestMembership(org.id, X.user.id, { acceptedAt: '2020-01-01T00:00:00Z' }); // service role keeps an explicit value
  const sX = await signIn(X);
  await myChatIds(sX.client);
  const xMirror = await mirrorOf(sX);

  const root = await send(sA, gconv, `erase-root-${RUN}`);
  const xg1 = await send(sX, gconv, `x-says-${RUN}`);
  const xReply = await send(sX, gconv, `x-thread-${RUN}`, { p_thread_root: root.id });
  const dmXA = await ok<string>(sX.client.rpc('start_dm', { p_other: A.user.id }), 'X starts dm with A');
  convsToClean.push(dmXA);
  const xd1 = await send(sX, dmXA, `x-dm-${RUN}`);
  const ad1 = await send(sA, dmXA, `a-dm-${RUN}`);
  await ok(sX.client.rpc('clarify_chat_message', { p_source: root.id }), 'X clarifies A\'s root into X\'s mirror');
  // A clarifies a message of the 1:1 with X: the copy's title carries X's name.
  const dmClar = await ok<Row>(sA.client.rpc('clarify_chat_message', { p_source: ad1.id }), 'A clarifies a dm message');
  expect(dmClar.forward_snapshot?.conversation_title, 'control: the dm clarify names X as the chat title').toBe(X.name);
  await ok(sX.client.rpc('mark_chat_read', { p_conversation: dmXA }), 'X reads');
  await ok(sX.client.rpc('block_user', { p_other: B.user.id }), 'X blocks B');

  // Copies made by OTHER people that name X.
  const fwd = await ok<Row>(sA.client.rpc('forward_chat_message', { p_source: xg1.id, p_target_conversation: await mirrorOf(sA) }), 'A forwards X\'s message');
  expect(fwd.forward_snapshot?.author_name).toBe(X.name);
  expect(fwd.forward_snapshot?.body, 'control: the copy holds X\'s words before erasure').toBe(`x-says-${RUN}`);
  const clar = await ok<Row>(sA.client.rpc('clarify_chat_message', { p_source: root.id }), 'A clarifies the root (thread has X\'s reply)');
  const threadBefore = (clar.forward_snapshot as { thread: Array<{ author_name: string; author_ref?: string; body?: string | null }> }).thread;
  expect(threadBefore.some((t) => t.author_name === X.name && (t as { author_ref?: string }).author_ref), 'control: the thread entry names X (by opaque ref) before erasure').toBe(true);
  expect(threadBefore.some((t) => 'author_id' in t), 'no raw author id in a copied thread').toBe(false);

  const { error } = await sX.client.rpc('erase_my_account');
  expect(error, `erase_my_account must succeed: ${error?.message}`).toBeNull();

  const after = await adminMessages(gconv);
  for (const id of [xg1.id, xReply.id]) {
    const r = after.find((m) => m.id === id)!;
    expect(r.author_id, 'author cleared').toBeNull();
    expect(r.body, 'body removed').toBeNull();
    expect(r.deleted_at, 'marked deleted').toBeTruthy();
  }
  const dmRows = await adminMessages(dmXA);
  const xdAfter = dmRows.find((m) => m.id === xd1.id)!;
  expect(xdAfter.author_id).toBeNull();
  expect(xdAfter.body).toBeNull();
  expect(dmRows.find((m) => m.id === ad1.id)!.body, 'the other side\'s words are untouched').toBe(`a-dm-${RUN}`);

  const { data: mir } = await supabaseAdmin.from('chat_conversations').select('id').eq('id', xMirror);
  expect(mir, 'X\'s mirror and its copies are erased').toEqual([]);

  const copy = (await adminMessages(await mirrorOf(sA))).find((m) => m.id === fwd.id)!;
  expect(copy.forward_snapshot?.author_name, 'A\'s forward now names "Deleted user"').toBe('Deleted user');
  expect(copy.forward_author_id).toBeNull();
  expect(copy.forward_snapshot?.body, 'erase means erase: the erased user\'s words are gone from a third party\'s forward').toBeNull();
  expect(JSON.stringify(copy.forward_snapshot), 'the text appears nowhere in the copy').not.toContain(`x-says-${RUN}`);
  const clarAfter = (await adminMessages(await mirrorOf(sA))).find((m) => m.id === clar.id)!;
  const threadAfter = (clarAfter.forward_snapshot as { thread: Array<{ author_name: string; author_ref?: string; body?: string | null }> }).thread;
  expect(threadAfter.some((t) => t.author_name === X.name), 'X\'s name is gone from the copied thread').toBe(false);
  expect(threadAfter.some((t) => t.author_ref !== undefined && t.author_name === 'Deleted user'), 'X\'s ref is gone from the copied thread').toBe(false);
  expect(JSON.stringify(clarAfter.forward_snapshot), 'X\'s thread reply text is gone from the copied thread').not.toContain(`x-thread-${RUN}`);
  expect(threadAfter.some((t) => t.author_name === 'Deleted user')).toBe(true);

  const dmClarAfter = (await adminMessages(await mirrorOf(sA))).find((m) => m.id === dmClar.id)!;
  expect(dmClarAfter.forward_snapshot?.conversation_title, 'X\'s name is gone from the title of a clarify made in their 1:1').toBe('Deleted user');
  expect(JSON.stringify(dmClarAfter.forward_snapshot), 'and so is the opaque ref').not.toContain('conversation_title_ref');
  expect(JSON.stringify(dmClarAfter.forward_snapshot)).not.toContain(X.name);

  // C: an erased user's (now deleted) message cannot be copied any more.
  await refused(sA.client.rpc('forward_chat_message', { p_source: xg1.id, p_target_conversation: await mirrorOf(sA) }), 'forward an erased user\'s message');
  await refused(sA.client.rpc('clarify_chat_message', { p_source: xReply.id }), 'clarify an erased user\'s thread reply');
  // ...while clarifying the live root still works and no longer carries X's reply text.
  const clar2 = await ok<Row>(sA.client.rpc('clarify_chat_message', { p_source: root.id }), 'A clarifies the root again after the erase');
  expect(JSON.stringify(clar2.forward_snapshot), 'the erased reply is not in a NEW copy').not.toContain(`x-thread-${RUN}`);

  // The 1:1 is still there and readable for A; A sees the erased counterpart; sending is refused.
  type ChatRow = { conversation_id: string; other_deleted: boolean; other_id: string | null };
  const aChats = await ok<ChatRow[]>(sA.client.rpc('get_my_chats'), 'A lists chats');
  const aDm = aChats.find((r) => r.conversation_id === dmXA);
  expect(aDm, 'A still has the 1:1').toBeTruthy();
  expect(aDm!.other_deleted).toBe(true);
  expect(aDm!.other_id).toBeNull();
  expect(await visibleIds(sA, dmXA), 'A can still read the whole 1:1').toEqual(expect.arrayContaining([xd1.id, ad1.id]));
  await refused(sA.client.rpc('send_chat_message', { p_conversation: dmXA, p_body: 'hello?' }), 'send to an erased person');

  // Census: no chat column still holds X's id.
  const uid = X.user.id;
  const counts = await Promise.all([
    supabaseAdmin.from('chat_messages').select('id', { count: 'exact', head: true }).or(`author_id.eq.${uid},forward_author_id.eq.${uid}`),
    supabaseAdmin.from('chat_conversations').select('id', { count: 'exact', head: true }).or(`owner_id.eq.${uid},dm_user_a.eq.${uid},dm_user_b.eq.${uid},created_by.eq.${uid}`),
    supabaseAdmin.from('chat_member_state').select('conversation_id', { count: 'exact', head: true }).eq('profile_id', uid),
    supabaseAdmin.from('chat_blocks').select('blocker_id', { count: 'exact', head: true }).or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`),
  ]);
  expect(counts.map((c) => c.count), 'messages, conversations, read state, blocks').toEqual([0, 0, 0, 0]);
});
