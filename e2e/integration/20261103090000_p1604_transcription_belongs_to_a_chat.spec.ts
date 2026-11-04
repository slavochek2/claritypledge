/**
 * @file 20261103090000_p1604_transcription_belongs_to_a_chat.spec.ts
 * @description P1604 canary (migrations 20261103090000/090100/090200). Walks session rules 1-8 and the access refusals against
 * a DATABASE (the self-hosted TEST server only; never hosted, never prod). Gemini is never called: the worker is replaced by
 * the same service-role RPCs it uses (claim, post_clean_round). Rule 9 (rounds) is covered by p1596-clean-round-transcripts.spec.ts,
 * which must still pass after these migrations. WRITTEN WITHOUT BEING RUN: the migrations are not applied anywhere yet.
 *
 * Two people share a DM (A, B); A also has a DM with C; D is a stranger to both. Time is moved by editing the stamps the sweep
 * reads, never by waiting.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { signIn, ok, type SignedIn } from '../helpers/test-chat';
import { createTestEvent, deleteTestEvent, rsvpToEvent } from '../helpers/test-event';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const RUN = Math.random().toString(36).slice(2, 6).toUpperCase();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let codeN = 0;
const newCode = () => {
  codeN += 1;
  const n = (Date.now() + codeN * 7919) % (32 ** 6);
  let s = '';
  for (let i = 0, x = n; i < 6; i++, x = Math.floor(x / 32)) s = ALPHABET[x % 32] + s;
  return s;
};
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
// history shows only the caller's own span, so a chunk's server-clock time must fall inside the seats' time in the room
const said = (plusMs = 0) => Date.now() - 5_000 + plusMs;

test.describe('P1604: transcription belongs to a chat', () => {
  let users: Record<'a' | 'b' | 'c' | 'd', TestUser>;
  let as: Record<'a' | 'b' | 'c' | 'd', SignedIn>;
  let chatAB = '';
  let chatAC = '';
  const sessionIds: string[] = [];
  const conversationIds: string[] = [];
  let wasEnabled = false;
  let enabledAt: string | null = null;

  async function session(who: 'a' | 'b' | 'c' | 'd'): Promise<string> {
    const { data, error } = await supabaseAdmin.from('clarity_sessions')
      .insert({ code: `P1604${RUN}${who}${sessionIds.length}`.slice(0, 20), creator_name: who, creator_profile_id: users[who].user.id })
      .select('id').single();
    expect(error, `session ${who}: ${error?.message}`).toBeNull();
    sessionIds.push(data!.id);
    return data!.id;
  }
  async function dm(x: 'a' | 'b' | 'c'): Promise<string> {
    const [lo, hi] = [users.a.user.id, users[x].user.id].sort();
    const { data, error } = await supabaseAdmin.from('chat_conversations')
      .insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi }).select('id').single();
    expect(error, `dm: ${error?.message}`).toBeNull();
    conversationIds.push(data!.id);
    return data!.id;
  }
  type Row = { room_id: string; room_code: string; member_id: string; room_conversation_id: string | null; room_part_no: number; room_ended_at: string | null; member_consent_given_at: string };
  async function enter(who: 'a' | 'b' | 'c' | 'd', conv: string | null): Promise<Row> {
    const rows = await ok<Row[]>(as[who].client.rpc('enter_transcribe_room', {
      p_display_name: who.toUpperCase(), p_session_id: await session(who), p_consent: true, p_new_code: newCode(),
      p_event_id: null, p_conversation_id: conv,
    }), `enter ${who}`);
    return rows[0];
  }
  const room = async (id: string) => (await supabaseAdmin.from('transcribe_rooms').select('*').eq('id', id).single()).data!;
  const member = async (id: string) => (await supabaseAdmin.from('transcribe_room_members').select('*').eq('id', id).single()).data!;
  const stop = (who: 'a' | 'b' | 'c' | 'd', roomId: string) => ok(as[who].client.rpc('end_transcribe_room_capture', { p_room_id: roomId }), `stop ${who}`);
  const sweep = () => ok(supabaseAdmin.rpc('transcribe_room_sweep_tick'), 'sweep');
  const jobsOf = async (roomId: string) => (await supabaseAdmin.from('transcribe_round_clean_jobs').select('*').eq('room_id', roomId)).data ?? [];

  test.beforeAll(async () => {
    users = { a: await createTestUser({ name: 'P1604 A' }), b: await createTestUser({ name: 'P1604 B' }),
      c: await createTestUser({ name: 'P1604 C' }), d: await createTestUser({ name: 'P1604 D' }) };
    as = { a: await signIn(users.a), b: await signIn(users.b), c: await signIn(users.c), d: await signIn(users.d) };
    chatAB = await dm('b');
    chatAC = await dm('c');
    const { data: sw } = await supabaseAdmin.from('transcribe_channel_posting').select('enabled, enabled_at').eq('singleton', true).maybeSingle();
    wasEnabled = sw?.enabled ?? false;
    enabledAt = sw?.enabled_at ?? null;
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: true, enabled_at: minutesAgo(24 * 60) }).eq('singleton', true);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: wasEnabled, enabled_at: enabledAt }).eq('singleton', true);
    for (const u of Object.values(users ?? {})) {
      await supabaseAdmin.from('transcribe_rooms').delete().in('id',
        ((await supabaseAdmin.from('transcribe_room_members').select('room_id').eq('profile_id', u.user.id)).data ?? []).map((r) => r.room_id));
    }
    if (sessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessionIds);
    if (conversationIds.length) await supabaseAdmin.from('chat_conversations').delete().in('id', conversationIds);
    for (const u of Object.values(users ?? {})) { try { await deleteTestUser(u.user.id); } catch { /* ignore */ } }
  });

  // ── Access ────────────────────────────────────────────────────────────────
  test('access: a non-member cannot enter a chat\'s room, by id or by code; a stranger\'s plain start never lands in it', async () => {
    const r = await enter('a', chatAB);
    expect(r.room_conversation_id).toBe(chatAB);

    const sessD = await session('d');
    const refusedEnter = await as.d.client.rpc('enter_transcribe_room', {
      p_display_name: 'D', p_session_id: sessD, p_consent: true, p_new_code: newCode(), p_event_id: null, p_conversation_id: chatAB });
    expect(refusedEnter.error?.code, 'enter into a chat the caller is not in').toBe('42501');

    const refusedJoin = await as.d.client.rpc('join_transcribe_room', {
      p_room_id: r.room_id, p_display_name: 'D', p_session_id: sessD, p_consent: true });
    expect(refusedJoin.error?.code, 'join a chat\'s room by code without the chat').toBe('42501');

    const plain = await enter('d', null);
    expect(plain.room_id).not.toBe(r.room_id);
    expect(plain.room_conversation_id).toBeNull();
    const again = await enter('d', null);
    expect(again.room_id, 'every plain start is a NEW room (the old one is left, not rejoined)').not.toBe(plain.room_id);

    const lookup = await ok<{ in_chat: boolean; conversation_id: string | null }[]>(
      as.d.client.rpc('get_transcribe_room_by_code', { p_code: r.room_code }), 'lookup');
    expect(lookup[0].in_chat).toBe(true);
    expect(lookup[0].conversation_id, 'the chat id is shown only to someone who can read the chat').toBeNull();

    await stop('a', r.room_id);
    await stop('d', again.room_id);
  });

  test('access: the mirror never has a room', async () => {
    const { data: mirror } = await supabaseAdmin.from('chat_conversations').insert({ kind: 'mirror', owner_id: users.a.user.id }).select('id').single();
    conversationIds.push(mirror!.id);
    const res = await as.a.client.rpc('enter_transcribe_room', {
      p_display_name: 'A', p_session_id: await session('a'), p_consent: true, p_new_code: newCode(), p_event_id: null, p_conversation_id: mirror!.id });
    expect(res.error?.code).toBe('42501');
  });

  // ── Rule 1 ────────────────────────────────────────────────────────────────
  test('rule 1: a chat has one live session; tapping Transcribe while one is live joins it, and the index is the backstop', async () => {
    const a = await enter('a', chatAB);
    const b = await enter('b', chatAB);
    expect(b.room_id).toBe(a.room_id);
    const dup = await supabaseAdmin.from('transcribe_rooms').insert({ code: newCode(), conversation_id: chatAB });
    expect(dup.error?.code, 'a second open room for the chat is refused by the partial unique index').toBe('23505');

    const live = await ok<{ room_id: string; starter_name: string; recording_count: number; i_am_recording: boolean }[]>(
      as.b.client.rpc('get_chat_live_transcription', { p_conversation_id: chatAB }), 'live line');
    expect(live[0].room_id).toBe(a.room_id);
    expect(live[0].recording_count).toBe(2);
    expect(live[0].i_am_recording).toBe(true);
    const stranger = await ok<unknown[]>(as.d.client.rpc('get_chat_live_transcription', { p_conversation_id: chatAB }), 'stranger');
    expect(stranger, 'a stranger sees no live line').toHaveLength(0);

    await stop('a', a.room_id);
    await stop('b', a.room_id);
  });

  // ── Rules 2 and 3 + the worked example ─────────────────────────────────────
  test('rules 2-3 and the worked example: people coming and going never split a session; when everyone has stopped it is over, with no grace', async () => {
    const a = await enter('a', chatAB);
    const b = await enter('b', chatAB);
    await stop('b', a.room_id);                       // B leaves
    expect((await room(a.room_id)).ended_at, 'A is still recording: the session is not over').toBeNull();
    const b2 = await enter('b', chatAB);              // B comes back in time
    expect(b2.room_id).toBe(a.room_id);
    expect((await member(b2.member_id)).capture_ended_at).toBeNull();
    await stop('b', a.room_id);                       // B leaves again
    await stop('a', a.room_id);                       // A stops, last: the room closes in THAT call
    const ended = await room(a.room_id);
    expect(ended.ended_at, 'the last Stop closes the room in the same transaction').not.toBeNull();
    expect(b.room_id).toBe(a.room_id);

    const next = await enter('a', chatAB);            // "3 minutes later": nobody was recording, so a new session
    expect(next.room_id).not.toBe(a.room_id);

    // B is still recording when A stops, and A rejoins: still one session
    const nb = await enter('b', chatAB);
    expect(nb.room_id).toBe(next.room_id);
    await stop('a', next.room_id);
    expect((await room(next.room_id)).ended_at).toBeNull();
    const na = await enter('a', chatAB);
    expect(na.room_id).toBe(next.room_id);
    await stop('a', next.room_id);
    await stop('b', next.room_id);
  });

  // ── Rule 4 ────────────────────────────────────────────────────────────────
  test('rule 4: someone who vanished without Stop is waited for 10 minutes of silence, then the session ends', async () => {
    const a = await enter('a', chatAB);
    const b = await enter('b', chatAB);
    await stop('a', a.room_id);
    await supabaseAdmin.from('transcribe_room_members').update({ last_seen_at: minutesAgo(9) }).eq('id', b.member_id);
    await sweep();
    expect((await room(a.room_id)).ended_at, 'B was seen 9 minutes ago: the room waits').toBeNull();
    await supabaseAdmin.from('transcribe_room_members').update({ last_seen_at: minutesAgo(11) }).eq('id', b.member_id);
    await sweep();
    const ended = await room(a.room_id);
    expect(ended.ended_at, 'B has been silent 11 minutes: ended').not.toBeNull();
    expect((await member(b.member_id)).capture_ended_at).not.toBeNull();
  });

  // ── Rule 5 ────────────────────────────────────────────────────────────────
  test('rule 5: when everyone left recording is paused for 10 minutes the session ends; the heartbeat starts the clock and says so', async () => {
    const a = await enter('a', chatAB);
    const beat = await ok<{ room_ended: boolean }[]>(as.a.client.rpc('touch_transcribe_room_capture', { p_room_id: a.room_id }), 'beat');
    expect(beat[0].room_ended).toBe(false);
    expect((await member(a.member_id)).paused_since, 'the first paused beat starts the clock').not.toBeNull();
    await supabaseAdmin.from('transcribe_room_members').update({ paused_since: minutesAgo(9), last_seen_at: new Date().toISOString() }).eq('id', a.member_id);
    await sweep();
    expect((await room(a.room_id)).ended_at, '9 minutes paused: the room waits').toBeNull();
    await supabaseAdmin.from('transcribe_room_members').update({ paused_since: minutesAgo(11), last_seen_at: new Date().toISOString() }).eq('id', a.member_id);
    await sweep();
    expect((await room(a.room_id)).ended_at, '11 minutes paused: the room ends').not.toBeNull();
    const after = await ok<{ room_ended: boolean }[]>(as.a.client.rpc('touch_transcribe_room_capture', { p_room_id: a.room_id }), 'beat after');
    expect(after[0].room_ended, 'a paused phone learns the room ended').toBe(true);

    // one recording member keeps the room alive however long the other has been paused
    const a2 = await enter('a', chatAB);
    const b2 = await enter('b', chatAB);
    await supabaseAdmin.from('transcribe_room_members').update({ paused_since: minutesAgo(30), last_seen_at: new Date().toISOString() }).eq('id', a2.member_id);
    await sweep();
    expect((await room(a2.room_id)).ended_at, 'B is not paused').toBeNull();
    expect(b2.room_id).toBe(a2.room_id);
    await stop('a', a2.room_id);
    await stop('b', a2.room_id);
  });

  // ── Rule 6 ────────────────────────────────────────────────────────────────
  test('rule 6: one thread per session, titled by its start, posted once after the session; the job waits 2 minutes', async () => {
    const a = await enter('a', chatAB);
    const b = await enter('b', chatAB);
    await stop('a', a.room_id);
    await stop('b', a.room_id);
    const ended = await room(a.room_id);
    const [job] = await jobsOf(a.room_id);
    expect(job, 'the room-end job exists for a chat session').toBeDefined();
    expect(job.place).toBe('session');
    expect(job.conversation_id).toBe(chatAB);
    expect(job.event_id).toBeNull();
    expect(Date.parse(job.not_before) - Date.parse(ended.ended_at)).toBe(120_000);
    expect((job.seats as { member_id: string }[]).map((s) => s.member_id).sort()).toEqual([a.member_id, b.member_id].sort());

    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 1, claimed_at: new Date().toISOString() }).eq('id', job.id);
    const items = [
      { member_id: a.member_id, chunk_ms: 1_000_000, text: 'hello from A' },
      { member_id: b.member_id, chunk_ms: 1_060_000, text: 'hello from B' },
    ];
    expect(await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 1, p_items: items }), 'post')).toBe(2);
    await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 1, p_items: items }), 'post again');   // idempotent

    const { data: root } = await supabaseAdmin.from('transcribe_session_threads').select('root_message_id').eq('room_id', a.room_id).single();
    const { data: rootMsg } = await supabaseAdmin.from('chat_messages').select('body, system_kind, author_id').eq('id', root!.root_message_id).single();
    expect(rootMsg!.system_kind).toBe('outside_rounds');
    expect(rootMsg!.author_id).toBeNull();
    expect(rootMsg!.body).toBe(`session|${new Date(ended.created_at).toISOString().replace(/\.\d+Z$/, 'Z')}|1`);
    const { data: lines } = await supabaseAdmin.from('chat_messages').select('body, author_id').eq('thread_root_id', root!.root_message_id).order('created_at');
    expect(lines!.map((l) => l.body)).toEqual(['hello from A', 'hello from B']);

    // a second session is a second thread
    const a2 = await enter('a', chatAB);
    await stop('a', a2.room_id);
    const [job2] = await jobsOf(a2.room_id);
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 1, claimed_at: new Date().toISOString() }).eq('id', job2.id);
    await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job2.id, p_attempt: 1,
      p_items: [{ member_id: a2.member_id, chunk_ms: 9_000_000, text: 'second session' }] }), 'post 2');
    const { data: roots } = await supabaseAdmin.from('transcribe_session_threads').select('root_message_id').in('room_id', [a.room_id, a2.room_id]);
    expect(new Set(roots!.map((r) => r.root_message_id)).size, 'two sessions, two thread roots').toBe(2);
  });

  // ── Rule 7 ────────────────────────────────────────────────────────────────
  test('rule 7: starting in another chat stops the recording here instead of refusing', async () => {
    const first = await enter('a', chatAB);
    const second = await enter('a', chatAC);          // no refusal
    expect(second.room_id).not.toBe(first.room_id);
    expect((await member(first.member_id)).capture_ended_at, 'the recording in the first chat stopped').not.toBeNull();
    expect((await room(first.room_id)).ended_at, 'and, with nobody else in it, so did its session').not.toBeNull();
    expect((await member(second.member_id)).capture_ended_at).toBeNull();
    await stop('a', second.room_id);
  });

  // ── Rule 8 ────────────────────────────────────────────────────────────────
  test('rule 8: a session running 3 hours rolls into Part 2 with the people recording; consent is carried, not re-tapped', async () => {
    // transcribe_rooms.created_at is immutable (trigger from P1149), so the old room is INSERTED already 177 minutes old
    const { data: oldRoom, error: oldErr } = await supabaseAdmin.from('transcribe_rooms')
      .insert({ code: newCode(), conversation_id: chatAB, created_at: minutesAgo(177) }).select('id').single();
    expect(oldErr, `seed old room: ${oldErr?.message}`).toBeNull();
    const seat = async (who: 'a' | 'b') => {
      const { data, error } = await supabaseAdmin.from('transcribe_room_members').insert({
        room_id: oldRoom!.id, profile_id: users[who].user.id, display_name: who.toUpperCase(), session_id: await session(who),
        consent_given_at: minutesAgo(176), joined_at: minutesAgo(176), last_seen_at: new Date().toISOString(),
        // B stopped before the roll
        capture_ended_at: who === 'b' ? minutesAgo(30) : null,
      }).select('id').single();
      expect(error, `seed seat ${who}: ${error?.message}`).toBeNull();
      return data!.id as string;
    };
    const a = { room_id: oldRoom!.id, member_id: await seat('a') };
    const b = { room_id: oldRoom!.id, member_id: await seat('b') };
    await sweep();

    const old = await room(a.room_id);
    expect(old.ended_at, 'the 176-minute roll ended the room').not.toBeNull();
    const { data: next } = await supabaseAdmin.from('transcribe_rooms').select('*').eq('continues_room_id', a.room_id).single();
    expect(next!.part_no).toBe(2);
    expect(next!.conversation_id).toBe(chatAB);
    expect(next!.ended_at).toBeNull();

    const { data: seats } = await supabaseAdmin.from('transcribe_room_members').select('*').eq('room_id', next!.id);
    expect(seats!.map((s) => s.profile_id), 'only the person recording is seated').toEqual([users.a.user.id]);
    const original = await member(a.member_id);
    expect(seats![0].consent_given_at, 'the original consent timestamp is copied: no new tap is recorded').toBe(original.consent_given_at);
    expect(seats![0].consent_carried_from_room_id).toBe(a.room_id);
    expect(seats![0].session_id, 'Part 2 has its own session for history').not.toBe(original.session_id);

    const beat = await ok<{ room_ended: boolean; moved_to_room_id: string | null; moved_to_room_code: string | null }[]>(
      as.a.client.rpc('touch_transcribe_room_capture', { p_room_id: a.room_id }), 'beat at the roll');
    expect(beat[0].moved_to_room_id, 'the heartbeat tells the client where it moved').toBe(next!.id);
    expect(beat[0].moved_to_room_code).toBe(next!.code);

    const b3 = await as.b.client.rpc('touch_transcribe_room_capture', { p_room_id: a.room_id });
    expect((b3.data as { moved_to_room_id: string | null }[])[0].moved_to_room_id, 'B was not recording, so was not moved').toBeNull();
    expect(b.room_id).toBe(a.room_id);

    // the old room's window ends where the new one begins
    const [oldJob] = await jobsOf(a.room_id);
    expect(oldJob, 'Part 1 has its own job').toBeDefined();
    await stop('a', next!.id);
  });

  // ── Decision 7: the two passes cannot overwrite each other ─────────────────
  test('Decision 7: the older pass and the clean pass never overwrite each other, in either order; a reader sees only their own jobs', async () => {
    const a = await enter('a', chatAB);
    const b = await enter('b', chatAB);
    await stop('a', a.room_id);
    await stop('b', a.room_id);
    const [job] = await jobsOf(a.room_id);
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 1, claimed_at: new Date().toISOString() }).eq('id', job.id);

    // order 1: clean text first, then the older pass writes its row
    await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 1,
      p_items: [{ member_id: a.member_id, chunk_ms: said(), text: 'clean words' }] }), 'clean first');
    await supabaseAdmin.from('transcribe_room_transcripts').upsert({ room_id: a.room_id,
      segments: [{ member_id: a.member_id, start_ms: 0, end_ms: 1, text: 'older words' }], speaker_map: { [a.member_id]: 'A' } });
    let mine = await ok<{ text: string }[]>(as.a.client.rpc('get_my_clean_transcript', { p_room_id: a.room_id }), 'history a');
    expect(mine.map((r) => r.text)).toEqual(['clean words']);

    // order 2: the older pass rewrites its row AFTER the clean text: the clean text is untouched
    await supabaseAdmin.from('transcribe_room_transcripts').update({ segments: [], updated_at: new Date().toISOString() }).eq('room_id', a.room_id);
    mine = await ok<{ text: string }[]>(as.a.client.rpc('get_my_clean_transcript', { p_room_id: a.room_id }), 'history a 2');
    expect(mine.map((r) => r.text)).toEqual(['clean words']);

    // a job B was NOT part of (another table's words) never reaches B, and a job B was part of reaches B only
    const { data: other } = await supabaseAdmin.from('transcribe_round_clean_jobs').insert({
      kind: 'room', place: 'before', event_id: null, conversation_id: chatAB, room_id: a.room_id,
      seats: [{ member_id: a.member_id, room_id: a.room_id }], window_start: minutesAgo(5), window_end: minutesAgo(1),
      segments: [], not_before: minutesAgo(1), status: 'completed',
    }).select('id').single();
    await supabaseAdmin.from('transcribe_clean_texts').insert({ job_id: other!.id, member_id: a.member_id, chunk_ms: said(1), text: 'a private table' });
    const forA = await ok<{ text: string }[]>(as.a.client.rpc('get_my_clean_transcript', { p_room_id: a.room_id }), 'a sees both');
    expect(forA.map((r) => r.text).sort()).toEqual(['a private table', 'clean words']);
    const forB = await ok<{ text: string }[]>(as.b.client.rpc('get_my_clean_transcript', { p_room_id: a.room_id }), 'b sees only its job');
    expect(forB.map((r) => r.text), 'B was a seat of the room job (clean words were said by A in it) but not of the other table\'s job').toEqual(['clean words']);
    const forD = await ok<unknown[]>(as.d.client.rpc('get_my_clean_transcript', { p_room_id: a.room_id }), 'stranger');
    expect(forD).toHaveLength(0);
    expect(b.room_id).toBe(a.room_id);
  });

  // ── Plain rooms ────────────────────────────────────────────────────────────
  test('a plain /transcribe room gets the clean pass and posts nothing to any chat', async () => {
    const p = await enter('a', null);
    await stop('a', p.room_id);
    const [job] = await jobsOf(p.room_id);
    expect(job.place).toBe('session');
    expect(job.conversation_id).toBeNull();
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 1, claimed_at: new Date().toISOString() }).eq('id', job.id);
    expect(await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 1,
      p_items: [{ member_id: p.member_id, chunk_ms: said(), text: 'plain words' }] }), 'plain post'), 'nothing is posted to a chat').toBe(0);
    const mine = await ok<{ text: string }[]>(as.a.client.rpc('get_my_clean_transcript', { p_room_id: p.room_id }), 'plain history');
    expect(mine.map((r) => r.text)).toEqual(['plain words']);
    const { data: threads } = await supabaseAdmin.from('transcribe_session_threads').select('room_id').eq('room_id', p.room_id);
    expect(threads).toHaveLength(0);
  });

  // ── The kill switch still gates everything ──────────────────────────────────
  test('the kill switch: with posting off, a room end creates no clean job', async () => {
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: false }).eq('singleton', true);
    try {
      const a = await enter('a', chatAB);
      await stop('a', a.room_id);
      expect(await jobsOf(a.room_id)).toHaveLength(0);
    } finally {
      await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: true }).eq('singleton', true);
    }
  });

  // ── The older pass keeps running ────────────────────────────────────────────
  test('the older per-person pass still gets its jobs, once the 2-minute upload window has passed', async () => {
    const a = await enter('a', chatAB);
    await stop('a', a.room_id);
    await sweep();
    const early = (await supabaseAdmin.from('transcribe_room_transcription_jobs').select('id').eq('room_id', a.room_id)).data ?? [];
    expect(early, 'not yet: the final audio of a Stop may still be uploading').toHaveLength(0);
    await supabaseAdmin.from('transcribe_rooms').update({ ended_at: minutesAgo(3) }).eq('id', a.room_id);
    await sweep();
    const jobs = (await supabaseAdmin.from('transcribe_room_transcription_jobs').select('member_id').eq('room_id', a.room_id)).data ?? [];
    expect(jobs.map((j) => j.member_id)).toEqual([a.member_id]);
    await sweep();
    expect(((await supabaseAdmin.from('transcribe_room_transcription_jobs').select('id').eq('room_id', a.room_id)).data ?? []), 'idempotent').toHaveLength(1);
  });

  // ── Decision 4: the incomplete mark ──────────────────────────────────────────
  test('decision 4: a session whose audio did not all arrive says so in the thread title and in history, for that speaker only', async () => {
    const a = await enter('a', chatAB);
    const b = await enter('b', chatAB);
    await stop('a', a.room_id);
    await stop('b', a.room_id);
    const [job] = await jobsOf(a.room_id);
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 1, claimed_at: new Date().toISOString() }).eq('id', job.id);
    const items = [
      { member_id: a.member_id, chunk_ms: said(), text: 'whole audio' },
      { member_id: b.member_id, chunk_ms: said(1), text: 'cut short' },
    ];
    await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 1, p_items: items, p_incomplete: [b.member_id] }), 'post with a mark');

    const { data: root } = await supabaseAdmin.from('transcribe_session_threads').select('root_message_id').eq('room_id', a.room_id).single();
    const { data: rootMsg } = await supabaseAdmin.from('chat_messages').select('body').eq('id', root!.root_message_id).single();
    expect(rootMsg!.body, 'the root names the mark').toMatch(/^session\|[^|]+\|1\|i$/);

    const history = await ok<{ member_id: string; incomplete: boolean }[]>(as.a.client.rpc('get_my_clean_transcript', { p_room_id: a.room_id }), 'history');
    expect(history.find((r) => r.member_id === b.member_id)?.incomplete).toBe(true);
    expect(history.find((r) => r.member_id === a.member_id)?.incomplete).toBe(false);

    // the old 4-argument call (a worker that does not know the mark yet) still works and marks nobody
    const a2 = await enter('a', chatAB);
    await stop('a', a2.room_id);
    const [job2] = await jobsOf(a2.room_id);
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 1, claimed_at: new Date().toISOString() }).eq('id', job2.id);
    await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job2.id, p_attempt: 1,
      p_items: [{ member_id: a2.member_id, chunk_ms: 8_000_000, text: 'old worker' }] }), 'post without the mark');
    const { data: root2 } = await supabaseAdmin.from('transcribe_session_threads').select('root_message_id').eq('room_id', a2.room_id).single();
    const { data: rootMsg2 } = await supabaseAdmin.from('chat_messages').select('body').eq('id', root2!.root_message_id).single();
    expect(rootMsg2!.body).toMatch(/^session\|[^|]+\|1$/);

    // a retry that names someone the first attempt did not marks the existing root
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 2 }).eq('id', job2.id);
    await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job2.id, p_attempt: 2, p_items: [], p_incomplete: [a2.member_id] }), 'retry with a mark');
    const { data: rootMsg3 } = await supabaseAdmin.from('chat_messages').select('body').eq('id', root2!.root_message_id).single();
    expect(rootMsg3!.body).toMatch(/\|i$/);
  });

  // ── Account erasure ──────────────────────────────────────────────────────────
  test('erasure: a deleted person\'s clean text goes with them, like their live text; nobody else\'s history keeps it', async () => {
    const e = await createTestUser({ name: 'P1604 E' });
    const eClient = await signIn(e);
    const [lo, hi] = [users.a.user.id, e.user.id].sort();
    const { data: conv } = await supabaseAdmin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi }).select('id').single();
    conversationIds.push(conv!.id);
    const { data: sess } = await supabaseAdmin.from('clarity_sessions')
      .insert({ code: `P1604${RUN}e`.slice(0, 20), creator_name: 'e', creator_profile_id: e.user.id }).select('id').single();
    sessionIds.push(sess!.id);

    const a = await enter('a', conv!.id);
    const eRow = (await ok<Row[]>(eClient.client.rpc('enter_transcribe_room', {
      p_display_name: 'E', p_session_id: sess!.id, p_consent: true, p_new_code: newCode(), p_event_id: null, p_conversation_id: conv!.id }), 'enter e'))[0];
    await stop('a', a.room_id);
    await ok(eClient.client.rpc('end_transcribe_room_capture', { p_room_id: a.room_id }), 'stop e');
    const [job] = await jobsOf(a.room_id);
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 1, claimed_at: new Date().toISOString() }).eq('id', job.id);
    await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 1, p_items: [
      { member_id: a.member_id, chunk_ms: said(), text: 'a stays' }, { member_id: eRow.member_id, chunk_ms: said(1), text: 'e must go' }] }), 'post');
    expect((await supabaseAdmin.from('transcribe_clean_texts').select('text').eq('member_id', eRow.member_id)).data).toHaveLength(1);

    await ok(eClient.client.rpc('erase_my_account'), 'erase e');

    const left = (await supabaseAdmin.from('transcribe_clean_texts').select('text').eq('member_id', eRow.member_id)).data ?? [];
    expect(left, 'the erased person\'s clean text is gone').toHaveLength(0);
    const hist = await ok<{ text: string }[]>(as.a.client.rpc('get_my_clean_transcript', { p_room_id: a.room_id }), 'a history after');
    expect(hist.map((r) => r.text), 'nobody else\'s history keeps it').toEqual(['a stays']);
    const { data: lines } = await supabaseAdmin.from('chat_messages').select('body, author_id').ilike('body', '%e must go%');
    expect(lines ?? [], 'the line in the chat thread is not left readable under the erased person').toHaveLength(0);
  });

  // ── Code-review fixes (migration 20261104100000) ────────────────────────────
  async function seedAgedRoom(opts: { conv?: string; event?: string; minutes?: number; seats: Array<{ who: 'a' | 'b' | 'c'; ended?: boolean }> }) {
    const { data: r, error } = await supabaseAdmin.from('transcribe_rooms').insert({
      code: newCode(), conversation_id: opts.conv ?? null, event_id: opts.event ?? null, created_at: minutesAgo(opts.minutes ?? 177),
    }).select('id').single();
    expect(error, `seed aged room: ${error?.message}`).toBeNull();
    const ids: Record<string, string> = {};
    for (const seat of opts.seats) {
      const { data, error: e2 } = await supabaseAdmin.from('transcribe_room_members').insert({
        room_id: r!.id, profile_id: users[seat.who].user.id, display_name: seat.who.toUpperCase(), session_id: await session(seat.who),
        consent_given_at: minutesAgo(170), joined_at: minutesAgo(170), last_seen_at: new Date().toISOString(),
        capture_ended_at: seat.ended ? minutesAgo(1) : null,
      }).select('id').single();
      expect(e2, `seed seat: ${e2?.message}`).toBeNull();
      ids[seat.who] = data!.id as string;
    }
    return { roomId: r!.id as string, seats: ids };
  }

  test('review 1: an aged room whose members all just ended is closed by the sweep (it used to stay open and be joined)', async () => {
    const aged = await seedAgedRoom({ conv: chatAB, seats: [{ who: 'a', ended: true }, { who: 'b', ended: true }] });
    await sweep();
    expect((await room(aged.roomId)).ended_at, 'closed, not left open forever').not.toBeNull();
    const fresh = await enter('a', chatAB);
    expect(fresh.room_id, 'the next starter gets a NEW room, not the dead one').not.toBe(aged.roomId);
    await stop('a', fresh.room_id);
  });

  test('review 1: an aged room with no members at all is closed too', async () => {
    const aged = await seedAgedRoom({ conv: chatAB, seats: [] });
    await sweep();
    expect((await room(aged.roomId)).ended_at).not.toBeNull();
  });

  test('review 3: entering while the sweep rolls the same room never leaves two open rooms or a 23505', async () => {
    const aged = await seedAgedRoom({ conv: chatAB, seats: [{ who: 'a' }] });
    const [entered] = await Promise.all([enter('b', chatAB), sweep()]);
    const { data: open } = await supabaseAdmin.from('transcribe_rooms').select('id').eq('conversation_id', chatAB).is('ended_at', null);
    expect((open ?? []).length, 'exactly one open room for the chat').toBe(1);
    expect(open![0].id, 'and B is in it').toBe(entered.room_id);
    expect(entered.room_id !== aged.roomId || (await room(aged.roomId)).ended_at === null).toBe(true);
    await stop('b', entered.room_id);
    await stop('a', entered.room_id).catch(() => undefined);
    await supabaseAdmin.from('transcribe_room_members').update({ capture_ended_at: new Date().toISOString() }).eq('room_id', entered.room_id).is('capture_ended_at', null);
    await sweep();
  });

  test('review 4: a seat that lost access to the chat is not carried into Part 2', async () => {
    const host = await createTestUser({ name: 'P1604 Host' });
    const event = await createTestEvent(host.user.id, new Date(), { title: `P1604 Event ${RUN}` });
    try {
      await rsvpToEvent(event.id, users.a.user.id);          // A may read the event's chat; C never RSVPed
      const { data: conv } = await supabaseAdmin.from('chat_conversations').insert({ kind: 'event', event_id: event.id }).select('id').single();
      conversationIds.push(conv!.id);
      const aged = await seedAgedRoom({ conv: conv!.id, event: event.id, seats: [{ who: 'a' }, { who: 'c' }] });
      await sweep();
      const { data: next } = await supabaseAdmin.from('transcribe_rooms').select('id').eq('continues_room_id', aged.roomId).single();
      const { data: seats } = await supabaseAdmin.from('transcribe_room_members').select('profile_id').eq('room_id', next!.id);
      expect((seats ?? []).map((x) => x.profile_id), 'only the person who can still read the chat is carried over').toEqual([users.a.user.id]);
      expect((await member(aged.seats.c)).capture_ended_at, 'and the one who cannot has an ended seat in Part 1').not.toBeNull();
      const beat = await ok<{ moved_to_room_id: string | null }[]>(as.c.client.rpc('touch_transcribe_room_capture', { p_room_id: aged.roomId }), 'c beat');
      expect(beat[0].moved_to_room_id, 'review 7: the next room is shown only to someone seated there').toBeNull();
    } finally {
      await deleteTestEvent(event.id);
      await deleteTestUser(host.user.id);
    }
  });

  test('review 7: a beat on an ended seat writes nothing', async () => {
    const a = await enter('a', chatAB);
    const b = await enter('b', chatAB);
    await stop('b', a.room_id);
    const before = await member(b.member_id);
    await ok(as.b.client.rpc('touch_transcribe_room_capture', { p_room_id: a.room_id }), 'late beat');
    const after = await member(b.member_id);
    expect(after.last_seen_at).toBe(before.last_seen_at);
    expect(after.paused_since).toBe(before.paused_since);
    await stop('a', a.room_id);
  });

  test('review 4: history is the caller\'s own span: a late joiner never gets the text from before they were there', async () => {
    const a = await enter('a', chatAB);
    await supabaseAdmin.from('transcribe_room_members').update({ joined_at: minutesAgo(20) }).eq('id', a.member_id);   // A has been here a while
    const b = await enter('b', chatAB);                      // joins now
    await stop('a', a.room_id);
    await stop('b', a.room_id);
    const [job] = await jobsOf(a.room_id);
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 1, claimed_at: new Date().toISOString() }).eq('id', job.id);
    const earlier = Date.parse((await member(b.member_id)).joined_at) - 5 * 60_000;   // inside A's span, a full chunk before B arrived
    await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 1, p_items: [
      { member_id: a.member_id, chunk_ms: earlier, text: 'said before B arrived' },
      { member_id: a.member_id, chunk_ms: said(), text: 'said while both were there' },
    ] }), 'post');
    const forA = await ok<{ text: string }[]>(as.a.client.rpc('get_my_clean_transcript', { p_room_id: a.room_id }), 'a');
    const forB = await ok<{ text: string }[]>(as.b.client.rpc('get_my_clean_transcript', { p_room_id: a.room_id }), 'b');
    expect(forA.map((r) => r.text)).toEqual(['said before B arrived', 'said while both were there']);
    expect(forB.map((r) => r.text)).toEqual(['said while both were there']);
  });

  test('review 8: a retry that names nobody does not wipe the incomplete set, and the job still records it with no text', async () => {
    const a = await enter('a', chatAB);
    const b = await enter('b', chatAB);
    await stop('a', a.room_id);
    await stop('b', a.room_id);
    const [job] = await jobsOf(a.room_id);
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 1, claimed_at: new Date().toISOString() }).eq('id', job.id);
    // no text at all, but B is named
    await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 1, p_items: [], p_incomplete: [b.member_id] }), 'no text');
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 2 }).eq('id', job.id);
    await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 2, p_items: [] }), 'retry names nobody');
    const [after] = await jobsOf(a.room_id);
    expect(after.incomplete_member_ids, 'the set survives a retry that names nobody').toEqual([b.member_id]);
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', attempts: 3 }).eq('id', job.id);
    await ok<number>(supabaseAdmin.rpc('post_clean_round', { p_job_id: job.id, p_attempt: 3, p_items: [], p_incomplete: [a.member_id] }), 'adds A');
    expect(((await jobsOf(a.room_id))[0].incomplete_member_ids as string[]).sort()).toEqual([a.member_id, b.member_id].sort());
  });

  // ── Grants ──────────────────────────────────────────────────────────────────
  test('anon cannot call any of the new or changed functions', async () => {
    const { anonClient } = await import('../helpers/test-chat');
    const anon = anonClient();
    for (const [fn, args] of [
      ['enter_transcribe_room', { p_display_name: 'x', p_session_id: '00000000-0000-0000-0000-000000000000', p_consent: true, p_new_code: 'AAAAAA' }],
      ['get_chat_live_transcription', { p_conversation_id: chatAB }],
      ['get_my_clean_transcript', { p_room_id: '00000000-0000-0000-0000-000000000000' }],
      ['touch_transcribe_room_capture', { p_room_id: '00000000-0000-0000-0000-000000000000' }],
      ['get_transcribe_room_by_code', { p_code: 'AAAAAA' }],
    ] as const) {
      const res = await anon.rpc(fn, args as Record<string, unknown>);
      expect(res.error, `${fn} must refuse anon`).not.toBeNull();
    }
  });
});
