/**
 * P1631 Clarify from the live recording banner (migration 20261113100000_p1631_recording_clarify.sql) on the test database.
 *   npm run test:integration -- src/tests/integration/p1631-recording-clarify.test.ts
 * Fixtures follow p1631-clarify-scope.test.ts: users from createTestUser, rooms, seats and lines written with the admin client, drafts begun and completed through the
 * service-role worker functions with hand-written results. The model is never called.
 *
 * The event cases do not depend on the server-wide transcribe_channel_posting kill switch: the presser has no event_room_members seat, so the press reads
 * `own` whether the switch is on or off. The `round` read set is reached by setting the three rec_* columns of a queued draft by hand (the press itself answers `round`
 * only for a seated person with the switch on, which this file never flips).
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1631 rec ${RUN}`;
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
  const u = await createTestUser({ name: `P1631 rec ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u), id: u.user.id as string, name: `P1631 rec ${label} ${RUN}` };
}
type Who = Awaited<ReturnType<typeof mk>>;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(randomUUID().replace(/-/g, '').slice(0, 6), (c) => ALPHABET[c.charCodeAt(0) % 32]).join('');
const roomIds: string[] = [];
const sessionIds: string[] = [];
const eventIds: string[] = [];

async function dm(x: Who, y: Who): Promise<string> {
  const [lo, hi] = [x.id, y.id].sort();
  const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: x.id }).select('id').single();
  if (made.error) throw new Error(`fixture dm: ${made.error.message}`);
  return made.data.id as string;
}
/** an event chat where `host` hosts and `guest` has RSVPed (both can read it) */
async function eventChat(host: Who, guest: Who): Promise<{ conv: string; eventId: string }> {
  const e = await admin.from('events').insert({
    slug: `p1631-rec-${RUN}-${eventIds.length}`, title: `${TAG} event`, description: 'x', datetime: new Date(Date.now() + 86_400_000).toISOString(), location: 'x', host_id: host.id,
  }).select('id').single();
  if (e.error) throw new Error(`fixture event: ${e.error.message}`);
  eventIds.push(e.data.id as string);
  const r = await admin.from('event_rsvps').insert({ event_id: e.data.id, profile_id: guest.id });
  if (r.error) throw new Error(`fixture rsvp: ${r.error.message}`);
  const have = await admin.from('chat_conversations').select('id').eq('kind', 'event').eq('event_id', e.data.id).maybeSingle();
  if (have.data?.id) return { conv: have.data.id as string, eventId: e.data.id as string };
  const ins = await admin.from('chat_conversations').insert({ kind: 'event', event_id: e.data.id }).select('id').single();
  if (ins.error) throw new Error(`fixture event chat: ${ins.error.message}`);
  return { conv: ins.data.id as string, eventId: e.data.id as string };
}
/** a room of `conv` with one seat per person; returns the room id and each person's seat id */
async function room(conv: string, people: Who[], eventId: string | null = null): Promise<{ id: string; seat: Record<string, string> }> {
  const r = await admin.from('transcribe_rooms').insert({ code: newCode(), conversation_id: conv, event_id: eventId }).select('id').single();
  if (r.error) throw new Error(`fixture room: ${r.error.message}`);
  roomIds.push(r.data.id);
  const seat: Record<string, string> = {};
  for (const p of people) {
    const s = await admin.from('clarity_sessions').insert({ creator_name: p.name, creator_profile_id: p.id, state: {}, demo_status: 'waiting', partnership_status: 'pending', is_private: false }).select('id').single();
    if (s.error) throw new Error(`fixture session: ${s.error.message}`);
    sessionIds.push(s.data.id);
    const m = await admin.from('transcribe_room_members').insert({ room_id: r.data.id, profile_id: p.id, display_name: p.name, session_id: s.data.id, consent_given_at: new Date().toISOString() }).select('id').single();
    if (m.error) throw new Error(`fixture seat: ${m.error.message}`);
    seat[p.id] = m.data.id as string;
  }
  return { id: r.data.id as string, seat };
}
let tick = 0;
/** a live line, as record_transcribe_slice stores it; `extra` are the dest_* columns */
async function line(roomId: string, memberId: string, text: string, extra: Row = {}): Promise<string> {
  tick += 1;
  const r = await admin.from('transcribe_messages').insert({ room_id: roomId, member_id: memberId, text: `${TAG} ${text}`, spoken_at: new Date(Date.now() - 60_000 + tick * 100).toISOString(), ...extra }).select('id').single();
  if (r.error) throw new Error(`fixture line: ${r.error.message}`);
  return r.data.id as string;
}
const draftRow = async (id: string) => (await admin.from('clarify_drafts').select('*').eq('id', id).single()).data as Row;
const goodResult = (stmt: string, ids: { a?: string[]; b?: string[] } = {}) => ({ decision: 'draft', statement: stmt, cited: { a: ids.a ?? [], b: ids.b ?? [] } });

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
const seen = (run: Row): string[] => [run.source_message.id, ...run.surrounding_chat.map((x: Row) => x.id)];

let g: Who; // the presser
let h: Who; // another attendee / the other person in the DM
let k: Who; // a stranger to the room

beforeAll(async () => {
  g = await mk('G');
  h = await mk('H');
  k = await mk('K');
});

afterAll(async () => {
  const ids = users.map((u) => u.user.id);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
  if (roomIds.length) await admin.from('transcribe_rooms').delete().in('id', roomIds);
  if (sessionIds.length) await admin.from('clarity_sessions').delete().in('id', sessionIds);
  if (eventIds.length) await admin.from('events').delete().in('id', eventIds);
  await deleteTestUsers(ids);
});

describe('P1631 clarify_start_recording at an event', () => {
  it('reads only the presser\'s own round and table: another table\'s lines in the same round never reach the run', async () => {
    const { conv, eventId } = await eventChat(g, h);
    const rm = await room(conv, [g, h], eventId);
    const round = await admin.from('event_rounds').insert({ event_id: eventId, round_no: 1, group_size: 2 }).select('id').single();
    if (round.error) throw new Error(`fixture round: ${round.error.message}`);
    const r = round.data.id as string;
    const t1 = await line(rm.id, rm.seat[g.id]!, 'table one, the presser', { dest_kind: 'round', dest_event_id: eventId, dest_round_id: r, dest_table_no: 1 });
    const t1mate = await line(rm.id, rm.seat[h.id]!, 'table one, the same attendee who then moved', { dest_kind: 'round', dest_event_id: eventId, dest_round_id: r, dest_table_no: 1 });
    const t2 = await line(rm.id, rm.seat[h.id]!, 'table two, another attendee', { dest_kind: 'round', dest_event_id: eventId, dest_round_id: r, dest_table_no: 2 });
    const outside = await line(rm.id, rm.seat[g.id]!, 'the presser outside any round', { dest_kind: 'channel', dest_event_id: eventId });

    await settle(g);
    const s = await ok(g.c, 'clarify_start_recording', { p_room: rm.id });
    expect(s.status).toBe('started');
    expect(s.scope).toBe('recording');
    // the press is by a person with no event seat, so it reads `own`; hand-set the same three columns the press writes for a seated person at table 1 of round r
    const before = await draftRow(s.draft_id);
    expect(before.rec_kind, 'no seat in the round: own').toBe('own');
    await admin.from('clarify_drafts').update({ rec_kind: 'round', rec_round_id: r, rec_table_no: 1 }).eq('id', s.draft_id);
    const run = await begin(g, s.draft_id);
    expect(run.scope).toBe('recording');
    const ids = seen(run);
    expect(ids).toContain(t1);
    expect(ids).toContain(t1mate);
    expect(ids, 'the other table\'s line is never read').not.toContain(t2);
    expect(ids, 'a line outside the round is not part of the round read').not.toContain(outside);
    expect(run.thread).toEqual([]);
    // no names anywhere in what was sent
    expect(JSON.stringify(run)).not.toContain(g.name);
    expect(JSON.stringify(run)).not.toContain(h.name);
  });

  it('outside a round (or with no seat) reads only the presser\'s own lines', async () => {
    const { conv, eventId } = await eventChat(g, h);
    const rm = await room(conv, [g, h], eventId);
    const mine1 = await line(rm.id, rm.seat[g.id]!, 'mine one', { dest_kind: 'channel', dest_event_id: eventId });
    const theirs = await line(rm.id, rm.seat[h.id]!, 'theirs', { dest_kind: 'channel', dest_event_id: eventId });
    const mine2 = await line(rm.id, rm.seat[g.id]!, 'mine two', { dest_kind: 'none' });
    await settle(g);
    const s = await ok(g.c, 'clarify_start_recording', { p_room: rm.id });
    expect(s.status).toBe('started');
    expect((await draftRow(s.draft_id)).rec_kind).toBe('own');
    const run = await begin(g, s.draft_id);
    const ids = seen(run);
    expect(ids.sort()).toEqual([mine1, mine2].sort());
    expect(ids).not.toContain(theirs);
    expect(run.source_message.id, 'the newest of the presser\'s lines is the source').toBe(mine2);
    // erasure keeps working: the draft's refs name the speakers of the rows read, here the presser alone
    const d = await draftRow(s.draft_id);
    expect(d.sent_ids.sort()).toEqual([mine1, mine2].sort());
    expect(d.derived_refs.length).toBe(1);
  });

  it('a press with nothing in the read set answers empty and writes nothing', async () => {
    const { conv, eventId } = await eventChat(g, h);
    const rm = await room(conv, [g, h], eventId);
    await line(rm.id, rm.seat[h.id]!, 'only the other attendee spoke', { dest_kind: 'channel', dest_event_id: eventId });
    await settle(g);
    const threads = (await admin.from('clarify_threads').select('root_id').eq('owner_id', g.id)).data!.length;
    const drafts = (await admin.from('clarify_drafts').select('id').eq('owner_id', g.id)).data!.length;
    expect(await ok(g.c, 'clarify_start_recording', { p_room: rm.id })).toEqual({ status: 'empty' });
    expect((await admin.from('clarify_threads').select('root_id').eq('owner_id', g.id)).data!.length).toBe(threads);
    expect((await admin.from('clarify_drafts').select('id').eq('owner_id', g.id)).data!.length).toBe(drafts);
  });
});

describe('P1631 clarify_start_recording in a DM', () => {
  let conv: string;
  let rm: { id: string; seat: Record<string, string> };
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    conv = await dm(g, h);
    rm = await room(conv, [g, h]);
    ids.h1 = await line(rm.id, rm.seat[h.id]!, 'h one');
    ids.g1 = await line(rm.id, rm.seat[g.id]!, 'g one');
    ids.h2 = await line(rm.id, rm.seat[h.id]!, 'h two');
  });

  it('reads every line of the room (the recording is the conversation), with a Mirror root that holds no words', async () => {
    await settle(g);
    const s = await ok(g.c, 'clarify_start_recording', { p_room: rm.id });
    expect(s).toMatchObject({ status: 'started', reused: false, scope: 'recording' });
    const d = await draftRow(s.draft_id);
    expect(d.rec_kind).toBe('room');
    expect(d.rec_until).toBeTruthy();
    expect(d.source_message_id, 'the newest matching line').toBe(ids.h2);
    expect(d.source_conversation_id).toBe(conv);

    const root = (await admin.from('chat_messages').select('*').eq('id', s.thread_root_id).single()).data as Row;
    expect(root.kind).toBe('clarify');
    expect(root.body).toBeNull();
    expect(root.forwarded_from_message_id).toBeNull();
    expect(root.attachment_kind).toBeNull();
    expect(root.forward_snapshot.scope).toBe('recording');
    expect(root.forward_snapshot.conversation_kind).toBe('dm');
    expect(root.forward_snapshot.recording_until).toBeTruthy();
    for (const dropped of ['body', 'author_name', 'thread', 'system_kind']) expect(root.forward_snapshot).not.toHaveProperty(dropped);
    const th = (await admin.from('clarify_threads').select('*').eq('root_id', s.thread_root_id).single()).data as Row;
    expect(th).toMatchObject({ scope: 'recording', recording_room_id: rm.id, owner_id: g.id });

    const run = await begin(g, s.draft_id);
    expect(seen(run).sort()).toEqual([ids.h1, ids.g1, ids.h2].sort());
    expect(run.source_message.id).toBe(ids.h2);
    const refs = (await draftRow(s.draft_id)).derived_refs as string[];
    expect(refs.length, 'both speakers are in the refs').toBe(2);
  });

  it('a second press in the same room reuses the thread: one clarify_threads row, two drafts', async () => {
    await settle(g);
    const first = (await admin.from('clarify_threads').select('root_id').eq('owner_id', g.id).eq('scope', 'recording').eq('recording_room_id', rm.id)).data!;
    expect(first.length).toBe(1);
    const rootBefore = (await admin.from('chat_messages').select('forward_snapshot').eq('id', first[0]!.root_id).single()).data as Row;
    const s = await ok(g.c, 'clarify_start_recording', { p_room: rm.id });
    expect(s).toMatchObject({ status: 'started', reused: true });
    expect(s.thread_root_id).toBe(first[0]!.root_id);
    // migration 20261113190000: the root shows this press's cutoff, and equals the new draft's rec_until
    const rootAfter = (await admin.from('chat_messages').select('forward_snapshot').eq('id', first[0]!.root_id).single()).data as Row;
    expect(new Date(rootAfter.forward_snapshot.recording_until).getTime()).toBeGreaterThan(new Date(rootBefore.forward_snapshot.recording_until).getTime());
    expect(new Date(rootAfter.forward_snapshot.recording_until).getTime()).toBe(new Date((await draftRow(s.draft_id)).rec_until).getTime());
    expect((await admin.from('clarify_threads').select('root_id').eq('owner_id', g.id).eq('scope', 'recording').eq('recording_room_id', rm.id)).data!.length).toBe(1);
    expect((await admin.from('clarify_drafts').select('id').eq('thread_root_id', s.thread_root_id)).data!.length).toBe(2);
  });

  it('a press while a draft is queued answers busy and makes no draft', async () => {
    await settle(g);
    const s = await ok(g.c, 'clarify_start_recording', { p_room: rm.id });
    expect(s.status).toBe('started');
    const count = (await admin.from('clarify_drafts').select('id').eq('owner_id', g.id)).data!.length;
    expect(await ok(g.c, 'clarify_start_recording', { p_room: rm.id })).toEqual({ status: 'busy' });
    expect((await admin.from('clarify_drafts').select('id').eq('owner_id', g.id)).data!.length).toBe(count);
    await settle(g);
  });

  it('a person with no seat in the room gets 42501, so does a room with no chat', async () => {
    await settle(k);
    const r = await rpc(k.c, 'clarify_start_recording', { p_room: rm.id });
    expect(r.error?.code).toBe('42501');
    const bare = await admin.from('transcribe_rooms').insert({ code: newCode() }).select('id').single();
    if (bare.error) throw new Error(`fixture bare room: ${bare.error.message}`);
    roomIds.push(bare.data.id);
    const s = await admin.from('clarity_sessions').insert({ creator_name: g.name, creator_profile_id: g.id, state: {}, demo_status: 'waiting', partnership_status: 'pending', is_private: false }).select('id').single();
    sessionIds.push(s.data!.id);
    await admin.from('transcribe_room_members').insert({ room_id: bare.data.id, profile_id: g.id, display_name: g.name, session_id: s.data!.id, consent_given_at: new Date().toISOString() });
    await settle(g);
    expect((await rpc(g.c, 'clarify_start_recording', { p_room: bare.data.id })).error?.code).toBe('42501');
  });

  it('a follow-up draft on the thread (no rec_* columns) reads the thread\'s first read set and stops at its rec_until', async () => {
    await settle(g);
    const root = (await admin.from('clarify_threads').select('root_id').eq('owner_id', g.id).eq('recording_room_id', rm.id).single()).data!.root_id as string;
    // the NEWEST press's read set is the one a follow-up reads (migration 20261113190000)
    const first = (await admin.from('clarify_drafts').select('rec_until').eq('thread_root_id', root).not('rec_until', 'is', null).order('created_at', { ascending: false }).limit(1).single()).data as Row;
    // a line spoken after the newest press, and a follow-up draft inserted the way clarify_another inserts one
    const late = await admin.from('transcribe_messages').insert({ room_id: rm.id, member_id: rm.seat[h.id], text: `${TAG} said after the press`, spoken_at: new Date(new Date(first.rec_until).getTime() + 5_000).toISOString() }).select('id').single();
    const prev = (await admin.from('clarify_drafts').select('*').eq('thread_root_id', root).order('created_at', { ascending: false }).limit(1).single()).data as Row;
    const ins = await admin.from('clarify_drafts').insert({
      owner_id: g.id, mirror_conversation_id: prev.mirror_conversation_id, thread_root_id: root, source_conversation_id: prev.source_conversation_id, source_message_id: prev.source_message_id,
    }).select('id').single();
    if (ins.error) throw new Error(`fixture follow-up draft: ${ins.error.message}`);
    const run = await begin(g, ins.data.id);
    expect(run.scope).toBe('recording');
    expect(seen(run)).not.toContain(late.data!.id);
    expect(seen(run).length).toBeGreaterThan(0);
    expect((await draftRow(ins.data.id)).rec_kind, 'the run writes the inherited read set onto the draft').toBe('room');
  });

  it('cited transcribed lines come back from get_clarify_thread with their text read from the rows', async () => {
    await settle(g);
    const root = (await admin.from('clarify_threads').select('root_id').eq('owner_id', g.id).eq('recording_room_id', rm.id).single()).data!.root_id as string;
    const s = await ok(g.c, 'clarify_start_recording', { p_room: rm.id });
    expect(s.status).toBe('started');
    expect(s.thread_root_id).toBe(root);
    await ok(A, '_clarify_begin', { p_draft: s.draft_id });
    const done = await ok(A, '_clarify_complete', {
      p_draft: s.draft_id, p_result: goodResult(`${TAG} a recording point`, { a: [ids.h1], b: [ids.g1] }), p_usd: 0.01, p_run: (await draftRow(s.draft_id)).spend_id,
    });
    expect(done.status).toBe('done');
    const t = await ok(g.c, 'get_clarify_thread', { p_thread_root: root });
    const mine = t.drafts.find((x: Row) => x.id === s.draft_id);
    expect(mine.cited.a.map((x: Row) => x.text)).toEqual([`${TAG} h one`]);
    expect(mine.cited.b.map((x: Row) => x.text)).toEqual([`${TAG} g one`]);
    // a stranger to the room reads nothing of it
    const other = await ok(k.c, 'get_clarify_thread', { p_thread_root: root });
    expect(other.drafts).toEqual([]);
    await settle(g);
  });
});
