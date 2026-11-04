/**
 * @file p1604-transcription-states.spec.ts
 * @description P1604 (founder live test, migration 20261104110000): the state of a session's transcript, derived from the jobs and the
 * text that exist, member-scoped. processing -> ready; failed; a job past its bound reads as failed (never processing forever);
 * processing beats failed; nobody outside the room learns anything. Rows are seeded with the service role the way the worker's
 * outcome would leave them; the reads run as the real signed-in people.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { signIn, ok, type SignedIn } from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const RUN = Math.random().toString(36).slice(2, 6).toUpperCase();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let n = 0;
const newCode = () => { n += 1; return `${ALPHABET[(n * 5) % 32]}${ALPHABET[(n * 9 + 1) % 32]}${RUN.replace(/[^A-Z2-9]/g, 'K').padEnd(4, 'K').slice(0, 4)}`; };
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

test.describe('P1604: where is my transcript?', () => {
  let a: TestUser, b: TestUser, c: TestUser, d: TestUser;
  let asA: SignedIn, asB: SignedIn, asC: SignedIn, asD: SignedIn;
  let chat = '';
  const roomIds: string[] = [];
  const sessionIds: string[] = [];
  let seat = 0;
  let wasEnabled = false;
  let wasEnabledAt: string | null = null;

  async function endedRoom(opts: { ended?: boolean; endedHoursAgo?: number; conv?: string | null } = {}) {
    const ended = opts.ended ?? true;
    const { data: r, error } = await supabaseAdmin.from('transcribe_rooms').insert({
      code: newCode(), conversation_id: opts.conv === undefined ? chat : opts.conv,
      ended_at: ended ? hoursAgo(opts.endedHoursAgo ?? 0.1) : null,
    }).select('id').single();
    expect(error, `room: ${error?.message}`).toBeNull();
    roomIds.push(r!.id);
    const seats: Record<string, string> = {};
    for (const [key, who] of [['a', a], ['b', b]] as const) {
      seat += 1;
      const { data: s } = await supabaseAdmin.from('clarity_sessions')
        .insert({ code: `P1604S${RUN}${seat}`.slice(0, 20), creator_name: key, creator_profile_id: who.user.id }).select('id').single();
      sessionIds.push(s!.id);
      const { data: m, error: e2 } = await supabaseAdmin.from('transcribe_room_members').insert({
        room_id: r!.id, profile_id: who.user.id, display_name: key.toUpperCase(), session_id: s!.id,
        consent_given_at: hoursAgo(1), last_seen_at: hoursAgo(0.2), capture_ended_at: ended ? hoursAgo(0.1) : null,
      }).select('id').single();
      expect(e2, `seat: ${e2?.message}`).toBeNull();
      seats[key] = m!.id;
    }
    return { roomId: r!.id as string, seats };
  }
  const cleanJob = async (roomId: string, seatIds: string[], status: string, createdHoursAgo = 0) => {
    const { data, error } = await supabaseAdmin.from('transcribe_round_clean_jobs').insert({
      kind: 'room', place: 'session', event_id: null, conversation_id: chat, room_id: roomId,
      seats: seatIds.map((m) => ({ member_id: m, room_id: roomId })), window_start: hoursAgo(1), window_end: hoursAgo(0.1),
      segments: [], status, not_before: hoursAgo(0.05), created_at: hoursAgo(createdHoursAgo),
    }).select('id').single();
    expect(error, `job: ${error?.message}`).toBeNull();
    return data!.id as string;
  };
  const stateFor = async (who: SignedIn, roomId: string) => {
    const rows = await ok<{ room_id: string; state: string; chat_name: string | null }[]>(
      who.client.rpc('get_my_room_transcription_states', { p_room_ids: [roomId] }), 'states');
    return rows[0];
  };

  test.beforeAll(async () => {
    a = await createTestUser({ name: 'P1604 State A' });
    b = await createTestUser({ name: 'P1604 State B' });
    c = await createTestUser({ name: 'P1604 State C' });    // in the chat's wider world, never in the rooms
    d = await createTestUser({ name: 'P1604 State D' });    // a stranger
    asA = await signIn(a); asB = await signIn(b); asC = await signIn(c); asD = await signIn(d);
    const [lo, hi] = [a.user.id, b.user.id].sort();
    const { data: conv } = await supabaseAdmin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi }).select('id').single();
    chat = conv!.id;
    // the job floor (_transcribe_job_after_switch_on) drops a job whose window began before posting was switched on
    const { data: sw } = await supabaseAdmin.from('transcribe_channel_posting').select('enabled, enabled_at').eq('singleton', true).maybeSingle();
    wasEnabled = sw?.enabled ?? false;
    wasEnabledAt = sw?.enabled_at ?? null;
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: true, enabled_at: hoursAgo(48) }).eq('singleton', true);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: wasEnabled, enabled_at: wasEnabledAt }).eq('singleton', true);
    if (roomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', roomIds);
    if (sessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessionIds);
    if (chat) await supabaseAdmin.from('chat_conversations').delete().eq('id', chat);
    for (const u of [a, b, c, d]) if (u?.user?.id) { try { await deleteTestUser(u.user.id); } catch { /* ignore */ } }
  });

  test('a room that is still live is "none"', async () => {
    const r = await endedRoom({ ended: false });
    expect((await stateFor(asA, r.roomId)).state).toBe('none');
  });

  test('ended with a clean job pending or processing: "processing"; the chat\'s name comes with it', async () => {
    const r = await endedRoom();
    const job = await cleanJob(r.roomId, [r.seats.a, r.seats.b], 'pending');
    const row = await stateFor(asA, r.roomId);
    expect(row.state).toBe('processing');
    expect(row.chat_name, 'a DM is named for the other person').toBe('P1604 State B');
    expect((await stateFor(asB, r.roomId)).chat_name).toBe('P1604 State A');
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing' }).eq('id', job);
    expect((await stateFor(asA, r.roomId)).state).toBe('processing');
  });

  test('a failed job is "failed"', async () => {
    const r = await endedRoom();
    await cleanJob(r.roomId, [r.seats.a, r.seats.b], 'failed');
    expect((await stateFor(asA, r.roomId)).state).toBe('failed');
  });

  test('a job still pending after 3 hours reads as failed, never processing forever; at 2 hours it is still processing', async () => {
    const old = await endedRoom({ endedHoursAgo: 5 });
    await cleanJob(old.roomId, [old.seats.a, old.seats.b], 'processing', 4);
    expect((await stateFor(asA, old.roomId)).state).toBe('failed');
    const fresh = await endedRoom({ endedHoursAgo: 2.5 });
    await cleanJob(fresh.roomId, [fresh.seats.a, fresh.seats.b], 'processing', 2);
    expect((await stateFor(asA, fresh.roomId)).state).toBe('processing');
  });

  test('processing beats failed when both exist', async () => {
    const r = await endedRoom();
    await cleanJob(r.roomId, [r.seats.a, r.seats.b], 'failed');
    await supabaseAdmin.from('transcribe_room_transcription_jobs').insert({ room_id: r.roomId, member_id: r.seats.a, status: 'processing' });
    expect((await stateFor(asA, r.roomId)).state).toBe('processing');
  });

  test('the older pass alone: its pending job is processing, its failed job is failed, its text is ready', async () => {
    const p = await endedRoom();
    await supabaseAdmin.from('transcribe_room_transcription_jobs').insert({ room_id: p.roomId, member_id: p.seats.a, status: 'pending' });
    expect((await stateFor(asA, p.roomId)).state).toBe('processing');
    await supabaseAdmin.from('transcribe_room_transcription_jobs').update({ status: 'failed' }).eq('room_id', p.roomId);
    expect((await stateFor(asA, p.roomId)).state).toBe('failed');
    await supabaseAdmin.from('transcribe_room_transcripts').insert({ room_id: p.roomId, segments: [{ member_id: p.seats.a, start_ms: 0, end_ms: 1, text: 'older text' }] });
    expect((await stateFor(asA, p.roomId)).state, 'text that exists beats a failed job').toBe('ready');
  });

  test('once clean text exists the state is "ready", and it clears from the chat\'s processing list', async () => {
    const r = await endedRoom();
    const job = await cleanJob(r.roomId, [r.seats.a, r.seats.b], 'processing');
    let mine = await ok<{ room_id: string }[]>(asA.client.rpc('get_chat_transcription_processing', { p_conversation_id: chat }), 'chat list');
    expect(mine.map((x) => x.room_id)).toContain(r.roomId);
    await supabaseAdmin.from('transcribe_clean_texts').insert({ job_id: job, member_id: r.seats.a, chunk_ms: Date.now() - 1000, text: 'clean words' });
    expect((await stateFor(asA, r.roomId)).state).toBe('ready');
    mine = await ok<{ room_id: string }[]>(asA.client.rpc('get_chat_transcription_processing', { p_conversation_id: chat }), 'chat list');
    expect(mine.map((x) => x.room_id)).not.toContain(r.roomId);
  });

  test('review 1: the older pass finished but a clean job is still open: still "processing" (the thread has not arrived)', async () => {
    const r = await endedRoom();
    const job = await cleanJob(r.roomId, [r.seats.a, r.seats.b], 'processing');
    await supabaseAdmin.from('transcribe_room_transcripts').insert({ room_id: r.roomId, segments: [{ member_id: r.seats.a, start_ms: 0, end_ms: 1, text: 'older text' }] });
    expect((await stateFor(asA, r.roomId)).state).toBe('processing');
    const rows = await ok<{ room_id: string }[]>(asA.client.rpc('get_chat_transcription_processing', { p_conversation_id: chat }), 'chat');
    expect(rows.map((x) => x.room_id), 'the chat keeps its waiting line').toContain(r.roomId);
    await supabaseAdmin.from('transcribe_clean_texts').insert({ job_id: job, member_id: r.seats.a, chunk_ms: Date.now() - 1000, text: 'clean words' });
    expect((await stateFor(asA, r.roomId)).state, 'clean text has arrived').toBe('ready');
  });

  test('review 1: a clean job past its bound does not hold older text hostage', async () => {
    const r = await endedRoom({ endedHoursAgo: 6 });
    await cleanJob(r.roomId, [r.seats.a, r.seats.b], 'processing', 4);
    await supabaseAdmin.from('transcribe_room_transcripts').insert({ room_id: r.roomId, segments: [{ member_id: r.seats.a, start_ms: 0, end_ms: 1, text: 'older text' }] });
    expect((await stateFor(asA, r.roomId)).state).toBe('ready');
  });

  test('review 2: the chat shows a failure only for its NEWEST session; an older failure behind a newer success is not shown', async () => {
    // a fresh chat for this test, so the rooms above do not take part
    const [lo, hi] = [a.user.id, c.user.id].sort();
    const { data: conv } = await supabaseAdmin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi }).select('id').single();
    const own = conv!.id as string;
    const make = async (endedHoursAgo: number) => {
      const { data: r } = await supabaseAdmin.from('transcribe_rooms').insert({ code: newCode(), conversation_id: own, ended_at: hoursAgo(endedHoursAgo) }).select('id').single();
      roomIds.push(r!.id);
      seat += 1;
      const { data: s } = await supabaseAdmin.from('clarity_sessions').insert({ code: `P1604T${RUN}${seat}`.slice(0, 20), creator_name: 'a', creator_profile_id: a.user.id }).select('id').single();
      sessionIds.push(s!.id);
      const { data: m } = await supabaseAdmin.from('transcribe_room_members').insert({
        room_id: r!.id, profile_id: a.user.id, display_name: 'A', session_id: s!.id, consent_given_at: hoursAgo(5), last_seen_at: hoursAgo(1), capture_ended_at: hoursAgo(endedHoursAgo),
      }).select('id').single();
      return { roomId: r!.id as string, member: m!.id as string };
    };
    const job = async (x: { roomId: string; member: string }, status: string) => {
      const { data } = await supabaseAdmin.from('transcribe_round_clean_jobs').insert({
        kind: 'room', place: 'session', event_id: null, conversation_id: own, room_id: x.roomId,
        seats: [{ member_id: x.member, room_id: x.roomId }], window_start: hoursAgo(10), window_end: hoursAgo(1), segments: [], status, not_before: hoursAgo(1),
      }).select('id').single();
      return data!.id as string;
    };
    const list = async () => (await ok<{ room_id: string; state: string }[]>(asA.client.rpc('get_chat_transcription_processing', { p_conversation_id: own }), 'list'));

    const older = await make(8);
    await job(older, 'failed');
    const newer = await make(2);
    const newerJob = await job(newer, 'completed');
    await supabaseAdmin.from('transcribe_clean_texts').insert({ job_id: newerJob, member_id: newer.member, chunk_ms: Date.now() - 1000, text: 'it worked' });
    expect(await list(), 'the older failure is hidden behind the newer success').toEqual([]);

    const newest = await make(0.5);
    await job(newest, 'failed');
    expect((await list()).map((x) => `${x.room_id}:${x.state}`), 'the newest session failed: shown').toEqual([`${newest.roomId}:failed`]);

    const pending = await make(0.2);
    const pendingJob = await job(pending, 'pending');
    expect((await list()).map((x) => x.state).sort(), 'a session still processing is shown; the older failure is not').toEqual(['processing']);
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'completed' }).eq('id', pendingJob);
    await supabaseAdmin.from('chat_conversations').delete().eq('id', own);
  });

  test('an empty finished job (nobody spoke) is "none"', async () => {
    const r = await endedRoom();
    await cleanJob(r.roomId, [r.seats.a, r.seats.b], 'completed');
    expect((await stateFor(asA, r.roomId)).state).toBe('none');
  });

  test('member-scoped: a stranger and a person who was not in the room learn nothing', async () => {
    const r = await endedRoom();
    await cleanJob(r.roomId, [r.seats.a, r.seats.b], 'pending');
    for (const who of [asC, asD]) {
      const rows = await ok<unknown[]>(who.client.rpc('get_my_room_transcription_states', { p_room_ids: [r.roomId] }), 'outsider');
      expect(rows, 'the room is not even returned').toHaveLength(0);
    }
    const chatRows = await ok<unknown[]>(asD.client.rpc('get_chat_transcription_processing', { p_conversation_id: chat }), 'stranger chat');
    expect(chatRows, 'a stranger to the chat sees no list').toHaveLength(0);
  });

  test('the chat list is only processing/failed, only the last 24 hours, only my own rooms', async () => {
    const old = await endedRoom({ endedHoursAgo: 30 });
    await cleanJob(old.roomId, [old.seats.a, old.seats.b], 'pending', 0);
    const rows = await ok<{ room_id: string }[]>(asA.client.rpc('get_chat_transcription_processing', { p_conversation_id: chat }), 'list');
    expect(rows.map((x) => x.room_id), 'a room that ended 30 hours ago is not listed').not.toContain(old.roomId);
  });

  test('anon is refused', async () => {
    const { anonClient } = await import('../helpers/test-chat');
    const anon = anonClient();
    expect((await anon.rpc('get_my_room_transcription_states', { p_room_ids: [] })).error).not.toBeNull();
    expect((await anon.rpc('get_chat_transcription_processing', { p_conversation_id: chat })).error).not.toBeNull();
  });
});
