/**
 * @file p1604-flush-and-sections.spec.ts
 * @description P1604 final-look batch (migration 20261104130000): (1) the clean job of a room is released the moment EVERY seat has
 * reported its last chunk, with the 2-minute wait as the upper bound; (2) a continued seat forgets an old report; (3) the section
 * read (round and table, or the place) and the thread's place are member-scoped. Rows are seeded with the service role; the
 * reports and reads run as the real signed-in people. The measured Stop-to-due time is logged.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { signIn, ok, type SignedIn } from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const RUN = Math.random().toString(36).slice(2, 6).toUpperCase();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let n = 0;
const newCode = () => { n += 1; return `${ALPHABET[(n * 3) % 32]}${ALPHABET[(n * 13 + 5) % 32]}${RUN.replace(/[^A-Z2-9]/g, 'K').padEnd(4, 'K').slice(0, 4)}`; };
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

test.describe('P1604: release on flush, sections, thread place', () => {
  let a: TestUser, b: TestUser, d: TestUser;
  let asA: SignedIn, asB: SignedIn, asD: SignedIn;
  let chat = '';
  const roomIds: string[] = [];
  const sessionIds: string[] = [];
  let seat = 0;
  let wasEnabled = false;
  let wasEnabledAt: string | null = null;

  async function room() {
    const { data: r, error } = await supabaseAdmin.from('transcribe_rooms').insert({ code: newCode(), conversation_id: chat, ended_at: new Date().toISOString() }).select('id').single();
    expect(error, error?.message).toBeNull();
    roomIds.push(r!.id);
    const seats: Record<string, string> = {};
    for (const [key, who] of [['a', a], ['b', b]] as const) {
      seat += 1;
      const { data: s } = await supabaseAdmin.from('clarity_sessions').insert({ code: `P1604F${RUN}${seat}`.slice(0, 20), creator_name: key, creator_profile_id: who.user.id }).select('id').single();
      sessionIds.push(s!.id);
      const { data: m, error: e2 } = await supabaseAdmin.from('transcribe_room_members').insert({
        room_id: r!.id, profile_id: who.user.id, display_name: key.toUpperCase(), session_id: s!.id,
        consent_given_at: new Date(Date.now() - 3600_000).toISOString(), last_seen_at: new Date().toISOString(), capture_ended_at: new Date().toISOString(),
      }).select('id').single();
      expect(e2, e2?.message).toBeNull();
      seats[key] = m!.id;
    }
    return { roomId: r!.id as string, seats };
  }
  const roomJob = async (roomId: string, seatIds: string[], notBefore: string) => {
    const { data, error } = await supabaseAdmin.from('transcribe_round_clean_jobs').insert({
      kind: 'room', place: 'session', event_id: null, conversation_id: chat, room_id: roomId,
      seats: seatIds.map((m) => ({ member_id: m, room_id: roomId })), window_start: new Date(Date.now() - 3600_000).toISOString(),
      window_end: new Date().toISOString(), segments: [], status: 'pending', not_before: notBefore,
    }).select('id').single();
    expect(error, error?.message).toBeNull();
    return data!.id as string;
  };
  const notBefore = async (job: string) => {
    const { data } = await supabaseAdmin.from('transcribe_round_clean_jobs').select('not_before').eq('id', job).single();
    return new Date(data!.not_before as string).getTime();
  };
  const report = (who: SignedIn, roomId: string) => ok(who.client.rpc('report_audio_flushed', { p_room_id: roomId }), 'report');

  test.beforeAll(async () => {
    a = await createTestUser({ name: 'P1604 Flush A' });
    b = await createTestUser({ name: 'P1604 Flush B' });
    d = await createTestUser({ name: 'P1604 Flush D' });
    asA = await signIn(a); asB = await signIn(b); asD = await signIn(d);
    const [lo, hi] = [a.user.id, b.user.id].sort();
    const { data: conv } = await supabaseAdmin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi }).select('id').single();
    chat = conv!.id;
    const { data: sw } = await supabaseAdmin.from('transcribe_channel_posting').select('enabled, enabled_at').eq('singleton', true).maybeSingle();
    wasEnabled = sw?.enabled ?? false;
    wasEnabledAt = sw?.enabled_at ?? null;
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: true, enabled_at: new Date(Date.now() - 48 * 3600_000).toISOString() }).eq('singleton', true);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: wasEnabled, enabled_at: wasEnabledAt }).eq('singleton', true);
    if (roomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', roomIds);
    if (sessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessionIds);
    if (chat) await supabaseAdmin.from('chat_conversations').delete().eq('id', chat);
    for (const u of [a, b, d]) if (u?.user?.id) { try { await deleteTestUser(u.user.id); } catch { /* ignore */ } }
  });

  test('the job is due when EVERY seat has reported, not before; the 2-minute bound is the default', async () => {
    const r = await room();
    const stop = Date.now();
    const bound = minutesFromNow(2);
    const job = await roomJob(r.roomId, [r.seats.a, r.seats.b], bound);
    await report(asA, r.roomId);
    expect(await notBefore(job), 'one of two seats reported: still waiting the full bound').toBeGreaterThan(Date.now() + 90_000);
    await report(asB, r.roomId);
    const due = await notBefore(job);
    expect(due, 'both reported: due now, not in 2 minutes').toBeLessThanOrEqual(Date.now());
    console.log(`[P1604 timing] Stop to job due: ${((due - stop) / 1000).toFixed(1)} s (bound was 120 s)`);
  });

  test('a seat that never reports leaves the bound alone; a stranger\'s report changes nothing', async () => {
    const r = await room();
    const job = await roomJob(r.roomId, [r.seats.a, r.seats.b], minutesFromNow(2));
    await report(asD, r.roomId);
    await report(asA, r.roomId);
    expect(await notBefore(job)).toBeGreaterThan(Date.now() + 90_000);
  });

  test('a seat that is continued forgets its old report', async () => {
    const r = await room();
    await report(asA, r.roomId);
    const before = await supabaseAdmin.from('transcribe_room_members').select('audio_flushed_at').eq('id', r.seats.a).single();
    expect(before.data!.audio_flushed_at).not.toBeNull();
    await supabaseAdmin.from('transcribe_room_members').update({ capture_ended_at: null }).eq('id', r.seats.a);
    const after = await supabaseAdmin.from('transcribe_room_members').select('audio_flushed_at').eq('id', r.seats.a).single();
    expect(after.data!.audio_flushed_at, 'continuing the seat clears the report').toBeNull();
  });

  test('a stale report after a rejoin is ignored: a seat that is recording again cannot be marked flushed', async () => {
    const r = await room();
    await report(asA, r.roomId);
    await supabaseAdmin.from('transcribe_room_members').update({ capture_ended_at: null }).eq('id', r.seats.a);   // A came back
    await report(asA, r.roomId);                                                                                   // the old capture's delayed report
    const mid = await supabaseAdmin.from('transcribe_room_members').select('audio_flushed_at').eq('id', r.seats.a).single();
    expect(mid.data!.audio_flushed_at, 'ignored while the seat records').toBeNull();
    await supabaseAdmin.from('transcribe_room_members').update({ capture_ended_at: new Date().toISOString() }).eq('id', r.seats.a);   // A stops again
    await report(asA, r.roomId);
    const end = await supabaseAdmin.from('transcribe_room_members').select('audio_flushed_at').eq('id', r.seats.a).single();
    expect(end.data!.audio_flushed_at, 'counted once its capture has ended').not.toBeNull();
  });

  test('a seat that never reports holds the job even when every other seat has; a member who is not a seat of the job does not', async () => {
    const r = await room();
    // a third member with no consent: never a seat
    seat += 1;
    const { data: s3 } = await supabaseAdmin.from('clarity_sessions').insert({ code: `P1604H${RUN}${seat}`.slice(0, 20), creator_name: 'd', creator_profile_id: d.user.id }).select('id').single();
    sessionIds.push(s3!.id);
    await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: r.roomId, profile_id: d.user.id, display_name: 'D', session_id: s3!.id, consent_given_at: null,
      last_seen_at: new Date().toISOString(), capture_ended_at: new Date().toISOString(),
    });
    const job = await roomJob(r.roomId, [r.seats.a, r.seats.b], minutesFromNow(2));
    await report(asA, r.roomId);
    expect(await notBefore(job), 'B has not reported: held').toBeGreaterThan(Date.now() + 90_000);
    await report(asB, r.roomId);
    expect(await notBefore(job), 'A and B (the seats) reported; D, not a seat, does not hold it').toBeLessThanOrEqual(Date.now());
  });

  test('reports made before the room closes release the job at close', async () => {
    const { data: rm } = await supabaseAdmin.from('transcribe_rooms').insert({ code: newCode(), conversation_id: chat }).select('id').single();
    roomIds.push(rm!.id);
    const ids: string[] = [];
    for (const [key, who] of [['a', a], ['b', b]] as const) {
      seat += 1;
      const { data: s } = await supabaseAdmin.from('clarity_sessions').insert({ code: `P1604G${RUN}${seat}`.slice(0, 20), creator_name: key, creator_profile_id: who.user.id }).select('id').single();
      sessionIds.push(s!.id);
      const { data: m } = await supabaseAdmin.from('transcribe_room_members').insert({
        room_id: rm!.id, profile_id: who.user.id, display_name: key, session_id: s!.id,
        consent_given_at: new Date(Date.now() - 3600_000).toISOString(), last_seen_at: new Date().toISOString(),
        capture_ended_at: new Date().toISOString(), audio_flushed_at: new Date().toISOString(),
      }).select('id').single();
      ids.push(m!.id);
    }
    // a pending room job exists already (the segments the trigger needs are not under test); closing the room runs the trigger's release
    const job = await roomJob(rm!.id, ids, minutesFromNow(2));
    await supabaseAdmin.from('transcribe_rooms').update({ ended_at: new Date().toISOString() }).eq('id', rm!.id);
    expect(await notBefore(job)).toBeLessThanOrEqual(Date.now());
  });

  test('the thread\'s place: a member with access gets it, a stranger gets nothing', async () => {
    const r = await room();
    const { data: msg, error } = await supabaseAdmin.from('chat_messages').insert({ conversation_id: chat, author_id: a.user.id, body: 'session|2026-11-04T10:00:00Z|1' }).select('id').single();
    expect(error, error?.message).toBeNull();
    await supabaseAdmin.from('transcribe_session_threads').insert({ room_id: r.roomId, conversation_id: chat, root_message_id: msg!.id });
    const mine = await ok<{ conversation_id: string; root_message_id: string }[]>(asB.client.rpc('get_my_transcript_thread', { p_room_id: r.roomId }), 'thread');
    expect(mine).toEqual([{ conversation_id: chat, root_message_id: msg!.id }]);
    const theirs = await ok<unknown[]>(asD.client.rpc('get_my_transcript_thread', { p_room_id: r.roomId }), 'thread, stranger');
    expect(theirs).toEqual([]);
  });

  test('the sections: a room job reads as its place; only the caller\'s own jobs; a stranger sees none', async () => {
    const r = await room();
    const job = await roomJob(r.roomId, [r.seats.a], minutesFromNow(2));   // only A is a seat of it
    const forA = await ok<{ job_id: string; kind: string; place: string; round_no: number | null; table_no: number | null }[]>(
      asA.client.rpc('get_my_clean_transcript_sections', { p_room_id: r.roomId }), 'sections A');
    expect(forA.map((x) => [x.job_id, x.kind, x.place, x.round_no, x.table_no])).toEqual([[job, 'room', 'session', null, null]]);
    expect(await ok<unknown[]>(asB.client.rpc('get_my_clean_transcript_sections', { p_room_id: r.roomId }), 'sections B'), 'B was not a seat of it').toEqual([]);
    expect(await ok<unknown[]>(asD.client.rpc('get_my_clean_transcript_sections', { p_room_id: r.roomId }), 'sections D')).toEqual([]);
  });

  test('the sections of a ROUND job carry the round number and table', async () => {
    const ev = await supabaseAdmin.from('events').select('id').limit(1).maybeSingle();
    expect(ev.data?.id, 'TEST needs one event').toBeTruthy();
    const used = await supabaseAdmin.from('event_rounds').select('round_no').eq('event_id', ev.data!.id);
    const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((k) => !(used.data ?? []).some((x) => x.round_no === k));
    test.skip(free === undefined, 'no free round number on the first event');
    const rd = await supabaseAdmin.from('event_rounds').insert({ event_id: ev.data!.id, round_no: free!, group_size: 2 }).select('id').single();
    expect(rd.error, rd.error?.message).toBeNull();
    const r = await room();
    const { data: job, error } = await supabaseAdmin.from('transcribe_round_clean_jobs').insert({
      kind: 'round', place: null, event_id: ev.data!.id, round_id: rd.data!.id, table_no: 3, conversation_id: chat,
      seats: [{ member_id: r.seats.a, room_id: r.roomId }], window_start: new Date(Date.now() - 600_000).toISOString(),
      window_end: new Date().toISOString(), status: 'completed', not_before: new Date().toISOString(),
    }).select('id').single();
    expect(error, error?.message).toBeNull();
    const rows = await ok<{ job_id: string; kind: string; round_no: number; table_no: number }[]>(
      asA.client.rpc('get_my_clean_transcript_sections', { p_room_id: r.roomId }), 'sections');
    expect(rows.find((x) => x.job_id === job!.id)).toMatchObject({ kind: 'round', round_no: free, table_no: 3 });
    await supabaseAdmin.from('transcribe_round_clean_jobs').delete().eq('id', job!.id);
    await supabaseAdmin.from('event_rounds').delete().eq('id', rd.data!.id);
  });
});
