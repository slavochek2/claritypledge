/**
 * @file p1604-postgrest-embeds.spec.ts
 * @description P1604 live-test regression: every live slice got 429 "Too many active rooms". transcribe_room_members gained a
 * second foreign key to transcribe_rooms (consent_carried_from_room_id), which made the plain `transcribe_rooms!inner` embed
 * ambiguous (PGRST201); countActiveRooms failed closed. Unit tests mock PostgREST and could not see it.
 *
 * This runs the REAL query builders against the real PostgREST: the edge function's own activeRoomsQuery (the same function
 * index.ts calls), the edge function's other reads (getMovedTo's shape), and the client's getCaptureRoomState shape as a
 * signed-in user under RLS. The CONTROL runs the old un-hinted embed and must be refused: if it ever succeeds, this test would
 * no longer be able to see the bug it exists for.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { signIn, ok, type SignedIn } from '../helpers/test-chat';
import { seatInChatQuery } from '../../src/app/data/chat-seat-query';
import { activeRoomsQuery } from '../../supabase/functions/transcribe-slice/active-rooms';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const RUN = Math.random().toString(36).slice(2, 6).toUpperCase();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (n: number) => `${ALPHABET[(n * 7) % 32]}${ALPHABET[(n * 11 + 3) % 32]}${RUN.replace(/[^A-Z2-9]/g, 'K').padEnd(4, 'K').slice(0, 4)}`;

test.describe('P1604: the PostgREST embeds across transcribe_room_members and transcribe_rooms', () => {
  let a: TestUser, d: TestUser;
  let asA: SignedIn, asD: SignedIn;
  const sessionIds: string[] = [];
  let room1 = '';
  let room2 = '';
  let seatA2 = '';

  async function session(user: TestUser, n: number) {
    const { data, error } = await supabaseAdmin.from('clarity_sessions')
      .insert({ code: `P1604E${RUN}${n}`.slice(0, 20), creator_name: 'x', creator_profile_id: user.user.id }).select('id').single();
    expect(error, error?.message).toBeNull();
    sessionIds.push(data!.id);
    return data!.id as string;
  }

  test.beforeAll(async () => {
    a = await createTestUser({ name: 'P1604 Embed A' });
    d = await createTestUser({ name: 'P1604 Embed D' });
    asA = await signIn(a);
    asD = await signIn(d);
    // Part 1 and Part 2 of one session; A's seat in Part 2 carries consent from Part 1: the second foreign key is IN USE
    const r1 = await supabaseAdmin.from('transcribe_rooms').insert({ code: code(1) }).select('id').single();
    expect(r1.error, r1.error?.message).toBeNull();
    room1 = r1.data!.id;
    await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: room1, profile_id: a.user.id, display_name: 'A', session_id: await session(a, 1),
      consent_given_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), capture_ended_at: new Date().toISOString(),
    });
    const r2 = await supabaseAdmin.from('transcribe_rooms').insert({ code: code(2), part_no: 2, continues_room_id: room1 }).select('id').single();
    expect(r2.error, r2.error?.message).toBeNull();
    room2 = r2.data!.id;
    const seat = await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: room2, profile_id: a.user.id, display_name: 'A', session_id: await session(a, 2),
      consent_given_at: new Date().toISOString(), consent_carried_from_room_id: room1, last_seen_at: new Date().toISOString(),
    }).select('id').single();
    expect(seat.error, seat.error?.message).toBeNull();
    seatA2 = seat.data!.id;
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('transcribe_rooms').delete().in('id', [room2, room1].filter(Boolean));
    if (sessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessionIds);
    for (const u of [a, d]) if (u?.user?.id) { try { await deleteTestUser(u.user.id); } catch { /* ignore */ } }
  });

  test('countActiveRooms\' exact query counts the caller\'s open seats and does not fail (the 429 bug)', async () => {
    const cutoff = new Date(Date.now() - 180 * 60_000).toISOString();
    const { count, error } = await activeRoomsQuery(supabaseAdmin, a.user.id, cutoff);
    expect(error, `the real query must run: ${error?.message}`).toBeNull();
    expect(count, 'one open seat (Part 2); the Part 1 seat has ended').toBe(1);
  });

  test('and it filters: a stranger has none, an old cutoff excludes nothing here, a future cutoff excludes everything', async () => {
    const cutoff = new Date(Date.now() - 180 * 60_000).toISOString();
    expect((await activeRoomsQuery(supabaseAdmin, d.user.id, cutoff)).count).toBe(0);
    const future = new Date(Date.now() + 60_000).toISOString();
    expect((await activeRoomsQuery(supabaseAdmin, a.user.id, future)).count, 'the room filter really restricts the member rows').toBe(0);
  });

  test('CONTROL: the old un-hinted embed is refused as ambiguous, so this spec can see the bug', async () => {
    const { error } = await supabaseAdmin.from('transcribe_room_members')
      .select('id, transcribe_rooms!inner(ended_at, created_at)', { count: 'exact', head: true })
      .eq('profile_id', a.user.id);
    expect(error, 'if this stops failing the other tests no longer prove the fix').not.toBeNull();
    // a HEAD request carries no body, so its error has no code; the same embed as a GET names the cause
    const named = await supabaseAdmin.from('transcribe_room_members')
      .select('id, transcribe_rooms!inner(ended_at, created_at)').eq('profile_id', a.user.id).limit(1);
    expect(named.error?.code).toBe('PGRST201');
  });

  test('the edge function\'s getMovedTo reads (no embed) find the seat the roll made', async () => {
    const { data: next, error } = await supabaseAdmin.from('transcribe_rooms').select('id, code').eq('continues_room_id', room1).maybeSingle();
    expect(error, error?.message).toBeNull();
    expect(next!.id).toBe(room2);
    const { data: seat, error: e2 } = await supabaseAdmin.from('transcribe_room_members').select('id')
      .eq('room_id', next!.id).eq('profile_id', a.user.id).maybeSingle();
    expect(e2, e2?.message).toBeNull();
    expect(seat!.id).toBe(seatA2);
  });

  test('the client\'s getCaptureRoomState reads, as the signed-in person under RLS: the seated person follows the move, a stranger sees nothing', async () => {
    const read = async (who: SignedIn) => {
      const room = await who.client.from('transcribe_rooms').select('id, ended_at').eq('id', room1).maybeSingle();
      const next = await who.client.from('transcribe_rooms').select('id, code').eq('continues_room_id', room1).maybeSingle();
      const seat = next.data
        ? await who.client.from('transcribe_room_members').select('id').eq('room_id', next.data.id).eq('profile_id', who.userId).maybeSingle()
        : null;
      return { room, next, seat };
    };
    const mine = await read(asA);
    expect(mine.room.error, mine.room.error?.message).toBeNull();
    expect(mine.next.error, mine.next.error?.message).toBeNull();
    expect(mine.next.data?.id, 'a member of Part 1 can see Part 2').toBe(room2);
    expect(mine.seat?.data?.id).toBe(seatA2);

    const theirs = await read(asD);
    expect(theirs.room.data, 'a stranger cannot even see the room').toBeNull();
    expect(theirs.next.data).toBeNull();
  });

  test('the heartbeat RPC and the room lookup run against the real schema too', async () => {
    const beat = await ok<{ room_ended: boolean; moved_to_room_id: string | null }[]>(
      asA.client.rpc('touch_transcribe_room_capture', { p_room_id: room1 }), 'beat on the ended Part 1 seat');
    expect(beat[0].moved_to_room_id).toBe(room2);
  });

  test('hasTranscribedInChat\'s exact query, as the signed-in person under RLS: true only for a chat they had a seat in', async () => {
    const [lo, hi] = [a.user.id, d.user.id].sort();
    const { data: conv, error: convError } = await supabaseAdmin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi }).select('id').single();
    expect(convError, convError?.message).toBeNull();
    const chatWith = conv!.id as string;
    const chatWithout = crypto.randomUUID();   // a chat with no room: the filter, not the chat, answers
    const r = await supabaseAdmin.from('transcribe_rooms').insert({ code: code(3), conversation_id: chatWith }).select('id').single();
    expect(r.error, r.error?.message).toBeNull();
    await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: r.data!.id, profile_id: a.user.id, display_name: 'A', session_id: await session(a, 3),
      consent_given_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), capture_ended_at: new Date().toISOString(),
    });
    const seated = async (who: SignedIn, chat: string, event: string | null = null) => {
      const { data, error } = await seatInChatQuery(who.client, chat, who.userId, event);
      expect(error, error?.message).toBeNull();
      return (data?.length ?? 0) > 0;
    };
    expect(await seated(asA, chatWith), 'a seat in a room of this chat').toBe(true);
    expect(await seated(asA, chatWithout), 'control: another chat, no seat').toBe(false);
    expect(await seated(asD, chatWith), 'control: a stranger to the room, same chat').toBe(false);
    // an event chat: the seat is in the EVENT's room (event_id, no conversation_id)
    const ev = await supabaseAdmin.from('events').select('id').limit(1).maybeSingle();
    expect(ev.data?.id, 'the event branch must run: TEST needs at least one event').toBeTruthy();
    if (ev.data?.id) {
      const er = await supabaseAdmin.from('transcribe_rooms').insert({ code: code(4), event_id: ev.data.id }).select('id').single();
      expect(er.error, er.error?.message).toBeNull();
      await supabaseAdmin.from('transcribe_room_members').insert({
        room_id: er.data!.id, profile_id: a.user.id, display_name: 'A', session_id: await session(a, 4),
        consent_given_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), capture_ended_at: new Date().toISOString(),
      });
      expect(await seated(asA, chatWithout, ev.data.id), 'a seat in the event room counts for the event chat').toBe(true);
      expect(await seated(asA, chatWithout, null), 'control: the same chat without its event does not').toBe(false);
      expect(await seated(asD, chatWithout, ev.data.id), 'control: a stranger to the event room').toBe(false);
      await supabaseAdmin.from('transcribe_rooms').delete().eq('id', er.data!.id);
    }
    await supabaseAdmin.from('transcribe_rooms').delete().eq('id', r.data!.id);
    await supabaseAdmin.from('chat_conversations').delete().eq('id', chatWith);
  });
});
