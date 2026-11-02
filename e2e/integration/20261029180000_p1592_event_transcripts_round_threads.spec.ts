/**
 * @file 20261029180000_p1592_event_transcripts_round_threads.spec.ts
 * @description P270 canary for 20261029180000_p1592_event_transcripts_round_threads.sql.
 *
 * Drives the database exactly as the transcribe-slice edge function and the round-clean worker do.
 * P1596 retired live posting: `record_transcribe_slice` only STORES a row now, and the clean, attributed
 * text reaches chat through `post_clean_round` against a claimed (processing) clean job. Real users, a
 * real event, real rounds and seats (the host's own RPCs); ground truth is read back with the service role. Visibility is checked as real
 * signed-in users, never with the service role.
 *
 * One serial story, because the properties build on each other (a thread must exist before a second line can
 * append to it, a root must exist before it can be deleted to force a failure, ...).
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from '../helpers/test-event';
import { seedRoomMember } from '../helpers/test-event-room';
import { signIn, ok, refused, type SignedIn } from '../helpers/test-chat';
import { postClean, refreshRoster } from '../helpers/test-clean-post';

type Anyrow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();

test.describe.configure({ mode: 'serial' });

test.describe('P1592: event transcripts land in the event channel, one thread per round table', () => {
  let host: TestUser, alice: TestUser, bob: TestUser, cleo: TestUser, dan: TestUser, outsider: TestUser;
  let hostC: SignedIn, aliceC: SignedIn, bobC: SignedIn, outsiderC: SignedIn;
  let event: TestEvent;
  let roomId: string;
  const room: Record<string, string> = {};      // key -> event_room_members.id
  const tmember: Record<string, string> = {};   // key -> transcribe_room_members.id
  const sessionIds: string[] = [];
  const extraConversations: string[] = [];
  let channelId = '';
  let outsideRoot = '';                         // the event channel's single "Outside rounds" thread root
  const extraUsers: TestUser[] = [];            // people created inside the late tests (cleaned up in afterAll)
  let round1 = '';
  let round2 = '';

  // ---- helpers ----------------------------------------------------------------------------------------
  async function say(key: string, text: string): Promise<string> {
    const { data, error } = await supabaseAdmin.rpc('record_transcribe_slice', {
      p_room_id: roomId, p_member_id: tmember[key], p_text: text,
    });
    expect(error, `record_transcribe_slice(${key}) failed: ${error?.message}`).toBeNull();
    return data as string;
  }
  // P1596: a clean post is made against a job in `processing` whose seat snapshot holds the speaker. The
  // test plays the worker: it inserts the job row (one per round table, one per room) and posts through the RPC.
  type CleanTarget = 'room' | { round: string; table: number };
  const cleanJobs = new Map<string, Promise<string>>();
  let chunkSeq = 1000;
  function cleanJob(target: CleanTarget): Promise<string> {
    const key = target === 'room' ? 'room' : `${target.round}:${target.table}`;
    if (!cleanJobs.has(key)) {
      cleanJobs.set(key, (async () => {
        const now = new Date().toISOString();
        const base = target === 'room'
          ? { kind: 'room', room_id: roomId }
          : { kind: 'round', round_id: target.round, table_no: target.table };
        const { data, error } = await supabaseAdmin.from('transcribe_round_clean_jobs').insert({
          ...base, event_id: event.id, seats: [], window_start: now, window_end: now, status: 'processing', not_before: now,
        }).select('id').single();
        expect(error, `clean job ${key}: ${error?.message}`).toBeNull();
        return data!.id as string;
      })());
    }
    return cleanJobs.get(key)!;
  }
  /** The snapshot is every transcribe member known so far (members created later are added on each call). */
  async function refreshSeats(jobId: string): Promise<void> {
    const seats = Object.values(tmember).map((m) => ({ member_id: m, room_id: roomId }));
    const { error } = await supabaseAdmin.from('transcribe_round_clean_jobs').update({ seats }).eq('id', jobId);
    expect(error, `seat snapshot: ${error?.message}`).toBeNull();
  }
  /** Raw RPC result, for the cases that must fail. */
  async function cleanRaw(key: string, text: string, target: CleanTarget, chunk?: number) {
    const job = await cleanJob(target);
    await refreshSeats(job);
    await refreshRoster(job);   // the roster the cut would have snapshotted: where people sit now
    return postClean(job, tmember[key], chunk ?? chunkSeq++, text);
  }
  /** The clean post; returns the chat message id (null when nothing is posted). */
  async function clean(key: string, text: string, target: CleanTarget, chunk?: number): Promise<string | null> {
    const { id, error } = await cleanRaw(key, text, target, chunk);
    expect(error, `post_clean_round(${key}) failed: ${error?.message}`).toBeNull();
    return id;
  }
  /** A live slice (stored, never posted) followed by its clean post. */
  async function sayClean(key: string, text: string, target: CleanTarget): Promise<{ row: string; msg: string }> {
    const row = await say(key, text);
    const t = await trow(row);
    expect(t.posted_at, 'a live slice must not be posted').toBeNull();
    expect(t.chat_message_id).toBeNull();
    const msg = await clean(key, text, target);
    expect(msg, `clean post of ${key} returned nothing`).toBeTruthy();
    return { row, msg: msg! };
  }
  async function trow(id: string): Promise<Anyrow> {
    const { data, error } = await supabaseAdmin.from('transcribe_messages').select('*').eq('id', id).single();
    expect(error).toBeNull();
    return data as Anyrow;
  }
  async function cmsg(id: string): Promise<Anyrow> {
    const { data, error } = await supabaseAdmin.from('chat_messages').select('*').eq('id', id).single();
    expect(error, `chat message ${id}: ${error?.message}`).toBeNull();
    return data as Anyrow;
  }
  async function threadsOf(roundId: string): Promise<Anyrow[]> {
    const { data } = await supabaseAdmin.from('chat_round_threads').select('*').eq('round_id', roundId);
    return (data ?? []) as Anyrow[];
  }
  async function outsideThreads(): Promise<Anyrow[]> {
    const { data } = await supabaseAdmin.from('chat_outside_round_threads').select('*').eq('conversation_id', channelId);
    return (data ?? []) as Anyrow[];
  }
  async function eventConversations(): Promise<Anyrow[]> {
    const { data } = await supabaseAdmin.from('chat_conversations').select('*').eq('kind', 'event').eq('event_id', event.id);
    return (data ?? []) as Anyrow[];
  }
  async function countMessages(): Promise<number> {
    const { count } = await supabaseAdmin.from('chat_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', channelId);
    return count ?? 0;
  }
  async function addTranscribeMember(key: string, user: TestUser): Promise<void> {
    const code = `P1592${RUN}${key}`.slice(0, 20);
    const { data: session, error: sErr } = await supabaseAdmin
      .from('clarity_sessions').insert({ code, creator_name: `P1592 ${key}`, creator_profile_id: user.user.id }).select('id').single();
    expect(sErr, `session ${key}: ${sErr?.message}`).toBeNull();
    sessionIds.push(session!.id);
    const { data: m, error } = await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: roomId, profile_id: user.user.id, display_name: user.name, session_id: session!.id,
      consent_given_at: new Date().toISOString(),
    }).select('id').single();
    expect(error, `transcribe member ${key}: ${error?.message}`).toBeNull();
    tmember[key] = m!.id;
  }
  async function addRoomMember(key: string, user: TestUser, name: string): Promise<void> {
    const m = await seedRoomMember(event.id, { displayName: name, profileId: user.user.id });
    room[key] = m.id;
  }
  async function setPosting(enabled: boolean): Promise<void> {
    const { error } = await supabaseAdmin.from('transcribe_channel_posting').update({ enabled }).eq('singleton', true);
    expect(error, `kill switch: ${error?.message}`).toBeNull();
  }
  const seat = (key: string, t: number, r: 'first' | 'second' | 'observer') => ({ m: room[key], t, r });

  // ---- fixtures ---------------------------------------------------------------------------------------
  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1592 Host' });
    alice = await createTestUser({ name: 'Alice Tester' });
    bob = await createTestUser({ name: 'Bob Tester' });
    cleo = await createTestUser({ name: 'Cleo Tester' });
    dan = await createTestUser({ name: 'Dan Tester' });
    outsider = await createTestUser({ name: 'Zed Outsider' });

    event = await createTestEvent(host.user.id, new Date(), { title: `P1592 Event ${RUN}` });
    for (const u of [alice, bob, dan]) await rsvpToEvent(event.id, u.user.id);
    // cleo RSVPs later (late RSVP case); the outsider never does.

    await addRoomMember('alice', alice, 'Alice Tester');
    await addRoomMember('bob', bob, 'Bob Tester');
    await addRoomMember('dan', dan, 'Dan Tester');

    const { data: r, error } = await supabaseAdmin.from('transcribe_rooms')
      .insert({ code: `P1592${RUN}R`, event_id: event.id }).select('id').single();
    expect(error, `room: ${error?.message}`).toBeNull();
    roomId = r!.id;
    await addTranscribeMember('alice', alice);
    await addTranscribeMember('bob', bob);
    await addTranscribeMember('dan', dan);
    await addTranscribeMember('outsider', outsider);

    hostC = await signIn(host);
    aliceC = await signIn(alice);
    bobC = await signIn(bob);
    outsiderC = await signIn(outsider);

    // The kill switch ships OFF; this canary exercises the enabled path (TEST keeps it on) and turns it off
    // itself in one test below.
    await setPosting(true);

    // the channel is created lazily: nobody has opened it
    expect((await eventConversations()).length).toBe(0);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('transcribe_rooms').delete().eq('id', roomId);
    if (sessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessionIds);
    if (event?.id) await deleteTestEvent(event.id);
    if (extraConversations.length) await supabaseAdmin.from('chat_conversations').delete().in('id', extraConversations);
    for (const u of [host, alice, bob, cleo, dan, outsider, ...extraUsers]) {
      if (u?.user?.id) { try { await deleteTestUser(u.user.id); } catch { /* already erased by the erasure test */ } }
    }
  });

  // ---- tests ------------------------------------------------------------------------------------------
  test('a client INSERT into transcribe_messages is refused', async () => {
    const before = (await supabaseAdmin.from('transcribe_messages').select('id', { count: 'exact', head: true }).eq('room_id', roomId)).count;
    await refused(
      aliceC.client.from('transcribe_messages').insert({ room_id: roomId, member_id: tmember.alice, text: 'forged "Transcription"' }),
      'client insert into transcribe_messages',
    );
    const after = (await supabaseAdmin.from('transcribe_messages').select('id', { count: 'exact', head: true }).eq('room_id', roomId)).count;
    expect(after).toBe(before);
    // a client cannot rewrite the stored destination or the idempotency marker either, nor delete a row
    await refused(aliceC.client.from('transcribe_messages').update({ posted_at: null, dest_kind: 'channel' }).eq('room_id', roomId), 'client update of transcribe_messages');
    await refused(aliceC.client.from('transcribe_messages').delete().eq('room_id', roomId), 'client delete of transcribe_messages');
    // the kill-switch table and the thread tables are not reachable by a client
    await refused(aliceC.client.from('transcribe_channel_posting').select('*'), 'client read of the kill switch');
  });

  test('not seated (before round 1): the live line is only stored; the clean post lands in the event\'s "The conversation" thread (no round had started), and the channel is created with it', async () => {
    // the live slices are stored and posted nowhere
    const [id, bobId] = await Promise.all([say('alice', 'hello before the rounds'), say('bob', 'bob, before the rounds')]);
    for (const rid of [id, bobId]) {
      const t = await trow(rid);
      expect(t.posted_at).toBeNull();
      expect(t.chat_message_id).toBeNull();
    }
    // the clean posts of the room job: two unseated speakers' first posts arrive together: still ONE thread, one root
    await cleanJob('room');
    const [msgA, msgB] = await Promise.all([clean('alice', 'hello before the rounds', 'room'), clean('bob', 'bob, before the rounds', 'room')]);
    const convs = await eventConversations();
    expect(convs.length).toBe(1);
    channelId = convs[0].id;
    const outside = await outsideThreads();
    expect(outside.length).toBe(1);
    outsideRoot = outside[0].root_message_id;
    const { data: roots } = await supabaseAdmin.from('chat_messages').select('id').eq('conversation_id', channelId).eq('system_kind', 'outside_rounds');
    expect((roots ?? []).map((r) => r.id)).toEqual([outsideRoot]);

    const m = await cmsg(msgA!);
    expect(m.conversation_id).toBe(channelId);
    expect(m.thread_root_id).toBe(outsideRoot);
    expect(m.is_transcription).toBe(true);
    expect(m.author_id).toBe(alice.user.id);
    expect(m.body).toBe('hello before the rounds');
    expect(m.edited_at).toBeNull();
    expect((await cmsg(msgB!)).thread_root_id).toBe(outsideRoot);

    const root = await cmsg(outsideRoot);
    expect(root.system_kind).toBe('outside_rounds');
    expect(root.author_id).toBeNull();
    expect(root.body).toBe('The conversation');
    expect(root.thread_root_id).toBeNull();
    expect(root.edited_at).toBeNull();

    const { data: conv } = await supabaseAdmin.from('chat_conversations').select('last_message_at').eq('id', channelId).single();
    expect(conv!.last_message_at).not.toBeNull();
    // the chat list previews the new root like a round root: its title alone, no author
    const rows = await ok<Anyrow[]>(aliceC.client.rpc('get_my_chats'), 'get_my_chats');
    const ch = rows.find((r) => r.conversation_id === channelId);
    expect(ch!.last_system_kind).toBe('outside_rounds');
    expect(ch!.last_body).toBe('The conversation');
    expect(ch!.last_author_id).toBeNull();
  });

  test('a further unseated speaker joins the same thread (one root), and "My rounds" never lists it', async () => {
    const { msg } = await sayClean('dan', 'dan, before the rounds', 'room');
    const m = await cmsg(msg);
    expect(m.thread_root_id).toBe(outsideRoot);
    expect((await outsideThreads()).length).toBe(1);
    const { count } = await supabaseAdmin.from('chat_messages').select('id', { count: 'exact', head: true })
      .eq('conversation_id', channelId).eq('system_kind', 'outside_rounds');
    expect(count).toBe(1);
    expect(await ok<Anyrow[]>(aliceC.client.rpc('get_my_round_threads', { p_conversation: channelId }), 'alice rounds')).toEqual([]);
    expect(await ok<Anyrow[]>(hostC.client.rpc('get_my_round_threads', { p_conversation: channelId }), 'host rounds')).toEqual([]);
    // no client can reach the new table
    const r = await aliceC.client.from('chat_outside_round_threads').select('*').limit(1);
    expect(r.error, 'chat_outside_round_threads must not be selectable').not.toBeNull();
  });

  test('a Clarify of a line in the Outside rounds thread (or of its root) copies that message alone, never another speaker\'s line', async () => {
    const { data: lines } = await supabaseAdmin.from('chat_messages').select('id, author_id, body')
      .eq('conversation_id', channelId).eq('thread_root_id', outsideRoot);
    const bobLine = (lines ?? []).find((l) => l.author_id === bob.user.id);
    expect(bobLine, 'bob has an unseated line in the thread').toBeTruthy();
    // CONTROL: the thread really holds other speakers' lines, so an empty copy means the copy was restricted
    expect((lines ?? []).some((l) => l.author_id === alice.user.id), 'alice has a line in the thread').toBe(true);
    expect((lines ?? []).some((l) => l.author_id === dan.user.id), 'dan has a line in the thread').toBe(true);

    const cl = await ok<Anyrow>(aliceC.client.rpc('clarify_chat_message', { p_source: bobLine!.id }), 'clarify an outside line');
    expect(cl.forward_snapshot.body).toBe('bob, before the rounds');
    expect(cl.forward_snapshot.thread).toEqual([]);
    expect(cl.forward_snapshot.thread_total).toBe(0);
    const text = JSON.stringify(cl.forward_snapshot);
    expect(text).not.toContain('hello before the rounds');   // alice's line
    expect(text).not.toContain('dan, before the rounds');     // dan's line

    const clRoot = await ok<Anyrow>(aliceC.client.rpc('clarify_chat_message', { p_source: outsideRoot }), 'clarify the outside root');
    expect(clRoot.forward_snapshot.body).toBe('The conversation');
    expect(clRoot.forward_snapshot.system_kind).toBe('outside_rounds');
    expect(clRoot.forward_snapshot.thread).toEqual([]);
    expect(clRoot.forward_snapshot.thread_total).toBe(0);
  });

  test('posting switched off: the live row is still stored, the clean post is refused and posts nothing; back on, posting resumes', async () => {
    await setPosting(false);
    try {
      const before = await countMessages();
      const id = await say('alice', 'said while posting is off');
      const t = await trow(id);
      expect(t.text).toBe('said while posting is off');
      expect(t.posted_at).toBeNull();
      const refusedPost = await cleanRaw('alice', 'said while posting is off', 'room');
      expect(refusedPost.error, 'the clean post must be refused while the switch is off').not.toBeNull();
      expect(await countMessages()).toBe(before);
      // the retired retry tick must not post it either
      await supabaseAdmin.rpc('transcribe_post_retry_tick');
      expect((await trow(id)).posted_at).toBeNull();
      expect(await countMessages()).toBe(before);
    } finally {
      await setPosting(true);
    }
    const on = await clean('alice', 'posting is back on', 'room');
    expect(on).toBeTruthy();
  });

  test('a non-RSVP account: stored, never posted, and its clean post returns nothing', async () => {
    const before = await countMessages();
    const id = await say('outsider', 'I never RSVPd');
    const t = await trow(id);
    expect(t.posted_at).toBeNull();
    expect(t.chat_message_id).toBeNull();
    expect(await countMessages()).toBe(before);
    expect(await clean('outsider', 'I never RSVPd', 'room'), 'words reach only readers of the channel').toBeNull();
    expect(await countMessages()).toBe(before);
  });

  let aliceFirstMsg = '';
  let rootR1 = '';
  let bobMsg = '';
  let aliceSecondMsg = '';

  test('seated pair: one thread "Round 1 · Alice & Bob", clean posts are transcription, one message per post', async () => {
    round1 = await ok<string>(hostC.client.rpc('host_start_round', {
      p_event_id: event.id, p_round_no: 1, p_group_size: 2,
      p_seats: [seat('alice', 1, 'first'), seat('bob', 1, 'second'), seat('dan', 2, 'first')],
    }), 'host_start_round 1');
    const t1 = { round: round1, table: 1 };

    // a live slice alone creates nothing at the table
    await say('alice', 'live only, not posted');
    expect((await threadsOf(round1)).length).toBe(0);

    const { msg: m1id } = await sayClean('alice', 'first line at the table', t1);
    const m1 = await cmsg(m1id);
    const threads = await threadsOf(round1);
    expect(threads.length).toBe(1);                       // the job is for table 1: no thread for table 2
    expect(threads[0].table_no).toBe(1);
    rootR1 = threads[0].root_message_id;
    const root = await cmsg(rootR1);
    expect(root.system_kind).toBe('round_thread');
    expect(root.author_id).toBeNull();
    expect(root.body).toBe('Round 1 · Alice & Bob');
    expect(root.thread_root_id).toBeNull();
    expect(m1.thread_root_id).toBe(rootR1);
    expect(m1.is_transcription).toBe(true);
    expect(m1.author_id).toBe(alice.user.id);
    aliceFirstMsg = m1.id;

    // the same chunk again is idempotent: no second message
    expect(await clean('alice', 'first line at the table', t1, chunkSeq - 1)).toBe(aliceFirstMsg);

    const { msg: m2id } = await sayClean('alice', 'and a second line', t1);
    const m2 = await cmsg(m2id);
    expect(m2.id).not.toBe(aliceFirstMsg);               // every clean post is its own message
    expect(m2.body).toBe('and a second line');
    expect(m2.edited_at).toBeNull();
    expect((await cmsg(aliceFirstMsg)).body).toBe('first line at the table');
    const { data: members } = await supabaseAdmin.from('chat_round_thread_members').select('profile_id').eq('thread_id', threads[0].id);
    expect((members ?? []).map((x) => x.profile_id).sort()).toEqual([alice.user.id, bob.user.id].sort());

    // the partner's post is his own message in the same thread
    const { msg: b1 } = await sayClean('bob', 'bob here', t1);
    const mb = await cmsg(b1);
    expect(mb.id).not.toBe(aliceFirstMsg);
    expect(mb.thread_root_id).toBe(rootR1);
    bobMsg = mb.id;
    const { msg: m3id } = await sayClean('alice', 'alice after bob', t1);
    expect(m3id).not.toBe(aliceFirstMsg);
    expect(m3id).not.toBe(bobMsg);
    aliceSecondMsg = m3id;
  });

  test('the speaker edits own message: the edit stays and a later post is a separate message', async () => {
    await ok(aliceC.client.rpc('edit_chat_message', { p_message: aliceSecondMsg, p_body: 'alice, corrected by alice' }), 'edit_chat_message');
    const edited = await cmsg(aliceSecondMsg);
    expect(edited.edited_at).not.toBeNull();
    const { msg } = await sayClean('alice', 'line after my edit', { round: round1, table: 1 });
    const m = await cmsg(msg);
    expect(m.id).not.toBe(aliceSecondMsg);
    expect(m.edited_at).toBeNull();
    expect((await cmsg(aliceSecondMsg)).body).toBe('alice, corrected by alice');
  });

  test('late RSVP: seated after the root, so no clean post is made, never the channel top level (and the title follows the roster)', async () => {
    // a "Before round 1" root that predates cleo's RSVP (a small chunk_ms reads as said before round 1)
    expect(await clean('alice', 'said before cleo RSVPd', 'room', 5)).toBeTruthy();
    await rsvpToEvent(event.id, cleo.user.id);
    await addRoomMember('cleo', cleo, 'Cleo Tester');
    await addTranscribeMember('cleo', cleo);
    await ok(hostC.client.rpc('host_set_round_seats', {
      p_round_id: round1,
      p_seats: [seat('alice', 1, 'first'), seat('bob', 1, 'second'), seat('cleo', 1, 'observer'), seat('dan', 2, 'first')],
    }), 'host_set_round_seats (cleo joins table 1)');

    await say('cleo', 'I joined late');
    expect(await clean('cleo', 'I joined late', { round: round1, table: 1 })).toBeNull();
    const { count: top } = await supabaseAdmin.from('chat_messages').select('id', { count: 'exact', head: true })
      .eq('conversation_id', channelId).is('thread_root_id', null).eq('is_transcription', true);
    expect(top).toBe(0);
    const root = await cmsg(rootR1);
    expect(root.body).toBe('Round 1 · Alice, Bob & Cleo');
    expect(root.edited_at).toBeNull();                    // a title refresh never marks the root edited
    expect((await threadsOf(round1)).length).toBe(1);
  });

  test('host marks a seated transcriber as left: the live words are only stored, and the room job posts them to the event\'s "After the last round" thread', async () => {
    await ok(hostC.client.rpc('host_set_round_presence', {
      p_event_id: event.id, p_room_member_id: room.alice, p_left: true, p_sits_out_round: null,
    }), 'mark left');
    const before = await countMessages();
    const id = await say('alice', 'said after being marked left');
    expect((await trow(id)).posted_at).toBeNull();
    expect(await countMessages()).toBe(before);
    // chunk_ms is the epoch time the words were said: a small number reads as before round 1, so say it now
    const msg = await clean('alice', 'said after being marked left', 'room', Date.now());
    // rounds have begun, so this is "After the last round", one root per place (the first test's "The conversation" root stays)
    const afterRootId = (await cmsg(msg!)).thread_root_id;
    expect(afterRootId).not.toBe(outsideRoot);
    const afterRoot = await cmsg(afterRootId);
    expect(afterRoot.system_kind).toBe('outside_rounds');
    expect(afterRoot.body).toBe('After the last round');
    expect((await outsideThreads()).length).toBe(3);   // The conversation, Before round 1, After the last round
    await ok(hostC.client.rpc('host_set_round_presence', {
      p_event_id: event.id, p_room_member_id: room.alice, p_left: false, p_sits_out_round: null,
    }), 'clear left');
  });

  test('not seated, but access began after the outside root: the clean post returns nothing and posts nothing (never the channel top level)', async () => {
    await ok(hostC.client.rpc('host_set_round_presence', {
      p_event_id: event.id, p_room_member_id: room.cleo, p_left: true, p_sits_out_round: null,
    }), 'mark cleo left');
    await say('cleo', 'late and unseated');
    const before = await countMessages();
    const threadsBefore = (await outsideThreads()).length;
    // chunk_ms 6 reads as before round 1: the "Before round 1" root predates cleo's RSVP, so she cannot open it
    expect(await clean('cleo', 'late and unseated', 'room', 6)).toBeNull();
    expect(await countMessages()).toBe(before);
    const { count: top } = await supabaseAdmin.from('chat_messages').select('id', { count: 'exact', head: true })
      .eq('conversation_id', channelId).is('thread_root_id', null).eq('is_transcription', true);
    expect(top).toBe(0);                                 // never the channel top level
    expect((await outsideThreads()).length).toBe(threadsBefore);
    await ok(hostC.client.rpc('host_set_round_presence', {
      p_event_id: event.id, p_room_member_id: room.cleo, p_left: false, p_sits_out_round: null,
    }), 'clear cleo left');
  });

  test('unposted rows of a late-access speaker: the label is the event title in BOTH branches (outside thread and round thread)', async () => {
    await setPosting(false);                              // rows stay unposted, the way the kill-switch test leaves them
    try {
      const id = await say('cleo', 'late, and not posted');
      const t = await trow(id);
      expect(t.posted_at).toBeNull();
      // branch 1: unposted, not seated -> would go to the outside-rounds thread, which cleo cannot open
      await supabaseAdmin.from('transcribe_messages').update({ dest_kind: 'channel', dest_event_id: event.id }).eq('id', id);
      const outside = await supabaseAdmin.rpc('transcribe_message_destination', { p_id: id });
      expect(outside.data).toEqual({ kind: 'channel', label: event.title });
      // branch 2: unposted, seated at table 1 of round 1, whose thread (and root) predates cleo's access
      expect((await threadsOf(round1)).length).toBe(1);
      await supabaseAdmin.from('transcribe_messages')
        .update({ dest_kind: 'round', dest_round_id: round1, dest_table_no: 1, dest_event_id: event.id }).eq('id', id);
      const round = await supabaseAdmin.rpc('transcribe_message_destination', { p_id: id });
      expect(round.data).toEqual({ kind: 'channel', label: event.title });
      // control: the same unposted round row of a speaker with older access still names the round thread
      const aliceId = await say('alice', 'on time, and not posted');
      await supabaseAdmin.from('transcribe_messages')
        .update({ dest_kind: 'round', dest_round_id: round1, dest_table_no: 1, dest_event_id: event.id }).eq('id', aliceId);
      const control = await supabaseAdmin.rpc('transcribe_message_destination', { p_id: aliceId });
      expect(control.data).toMatchObject({ kind: 'round' });
      await supabaseAdmin.from('transcribe_messages').update({ dest_kind: 'none', dest_round_id: null, dest_table_no: null, dest_event_id: null }).in('id', [id, aliceId]);
    } finally {
      await setPosting(true);
    }
  });

  test('round 2 with new seating: the same person lands in the round-2 thread; two first lines at once give ONE thread', async () => {
    round2 = await ok<string>(hostC.client.rpc('host_start_round', {
      p_event_id: event.id, p_round_no: 2, p_group_size: 2,
      p_seats: [seat('alice', 1, 'first'), seat('dan', 1, 'second')],
    }), 'host_start_round 2');

    const t2 = { round: round2, table: 1 };
    await cleanJob(t2);
    const [a, d] = await Promise.all([
      say('alice', 'round two, alice').then(() => clean('alice', 'round two, alice', t2)),
      say('dan', 'round two, dan').then(() => clean('dan', 'round two, dan', t2)),
    ]);
    const threads = await threadsOf(round2);
    expect(threads.length).toBe(1);
    const root = await cmsg(threads[0].root_message_id);
    expect(root.body).toBe('Round 2 · Alice & Dan');
    const { data: roots } = await supabaseAdmin.from('chat_messages').select('id')
      .eq('conversation_id', channelId).eq('system_kind', 'round_thread').eq('body', 'Round 2 · Alice & Dan');
    expect((roots ?? []).length).toBe(1);
    expect((await cmsg(a!)).thread_root_id).toBe(threads[0].root_message_id);
    expect((await cmsg(d!)).thread_root_id).toBe(threads[0].root_message_id);
    // round 1's thread was not reused
    expect((await threadsOf(round1))[0].root_message_id).toBe(rootR1);
  });

  test('get_my_round_threads returns only the caller\'s threads; outsiders get nothing', async () => {
    const mine = async (c: SignedIn) => ok<Anyrow[]>(c.client.rpc('get_my_round_threads', { p_conversation: channelId }), 'get_my_round_threads');
    const a = await mine(aliceC);
    expect(a.map((r) => r.title)).toEqual(['Round 2 · Alice & Dan', 'Round 1 · Alice, Bob & Cleo']);
    expect(a.map((r) => r.round_no)).toEqual([2, 1]);
    const b = await mine(bobC);
    expect(b.map((r) => r.title)).toEqual(['Round 1 · Alice, Bob & Cleo']);
    expect((await mine(hostC)).length).toBe(0);            // the host reads everything but was seated nowhere
    expect((await mine(outsiderC)).length).toBe(0);        // cannot read the conversation
    // cleo is a member of the round-1 thread but her access began after its root: not listed
    const cleoC = await signIn(cleo);
    expect((await mine(cleoC)).length).toBe(0);
  });

  test('visibility: an outsider cannot select the channel or its thread messages; the host can', async () => {
    const out = await outsiderC.client.from('chat_messages').select('id').eq('conversation_id', channelId);
    expect(out.error).toBeNull();
    expect((out.data ?? []).length).toBe(0);
    const outThread = await outsiderC.client.from('chat_messages').select('id').eq('thread_root_id', rootR1);
    expect((outThread.data ?? []).length).toBe(0);
    const h = await hostC.client.from('chat_messages').select('id, thread_root_id').eq('conversation_id', channelId);
    expect((h.data ?? []).some((r) => r.thread_root_id === rootR1)).toBe(true);
    // the new tables are not reachable by any client at all
    for (const table of ['chat_round_threads', 'chat_round_thread_members']) {
      const r = await aliceC.client.from(table).select('*').limit(1);
      expect(r.error, `${table} must not be selectable`).not.toBeNull();
    }
  });

  test('get_my_chats: a channel whose last message is a root reports last_system_kind', async () => {
    const rows = await ok<Anyrow[]>(aliceC.client.rpc('get_my_chats'), 'get_my_chats');
    const ch = rows.find((r) => r.conversation_id === channelId);
    expect(ch).toBeTruthy();
    expect(ch!.last_system_kind).toBe('round_thread');
    expect(ch!.last_is_transcription).toBe(false);
    expect(ch!.last_body).toBe('Round 2 · Alice & Dan');
    expect(ch!.last_author_id).toBeNull();
  });

  test('forward / clarify of a transcription carry is_transcription; a root carries system_kind', async () => {
    const dm = await ok<string | Anyrow>(aliceC.client.rpc('start_dm', { p_other: bob.user.id }), 'start_dm');
    const dmId = typeof dm === 'string' ? dm : (dm.id ?? dm.conversation_id);
    extraConversations.push(dmId);
    const fwd = await ok<Anyrow>(aliceC.client.rpc('forward_chat_message', { p_source: aliceFirstMsg, p_target_conversation: dmId }), 'forward transcription');
    expect(fwd.forward_snapshot.is_transcription).toBe(true);
    expect(fwd.forward_snapshot.system_kind).toBeNull();
    const fwdRoot = await ok<Anyrow>(aliceC.client.rpc('forward_chat_message', { p_source: rootR1, p_target_conversation: dmId }), 'forward root');
    expect(fwdRoot.forward_snapshot.system_kind).toBe('round_thread');
    // a copy of a root carries the bare round, never the names (erasure cannot find a name inside a copy)
    expect(fwdRoot.forward_snapshot.body).toBe('Round 1');
    // forwarding a forward keeps both keys
    const again = await ok<Anyrow>(aliceC.client.rpc('forward_chat_message', { p_source: fwd.id, p_target_conversation: dmId }), 'forward a forward');
    expect(again.forward_snapshot.is_transcription).toBe(true);
    const cl = await ok<Anyrow>(aliceC.client.rpc('clarify_chat_message', { p_source: aliceFirstMsg }), 'clarify');
    expect(cl.forward_snapshot.is_transcription).toBe(true);
    const thread = cl.forward_snapshot.thread as Anyrow[];
    const rootEntry = thread.find((e) => e.system_kind === 'round_thread');
    expect(rootEntry, 'the copied thread carries its root entry').toBeTruthy();
    expect(rootEntry!.body).toBe('Round 1');
    // clarifying the root itself: the source body is bare too
    const clRoot = await ok<Anyrow>(aliceC.client.rpc('clarify_chat_message', { p_source: rootR1 }), 'clarify root');
    expect(clRoot.forward_snapshot.body).toBe('Round 1');
  });

  test('later seating: a non-recording observer seated at a table with a thread joins it and its title, unspoken', async () => {
    const thread2 = (await threadsOf(round2))[0];
    const before = await countMessages();
    await ok(hostC.client.rpc('host_set_round_seats', {
      p_round_id: round2, p_seats: [seat('alice', 1, 'first'), seat('dan', 1, 'second'), seat('bob', 1, 'observer')],
    }), 'seat bob as observer at table 1');
    const { data: members } = await supabaseAdmin.from('chat_round_thread_members').select('profile_id').eq('thread_id', thread2.id);
    expect((members ?? []).map((x) => x.profile_id).sort()).toEqual([alice.user.id, bob.user.id, dan.user.id].sort());
    const root = await cmsg(thread2.root_message_id);
    expect(root.body).toBe('Round 2 · Alice, Bob & Dan');
    expect(root.edited_at).toBeNull();
    expect(await countMessages()).toBe(before);              // nobody spoke
    const mine = await ok<Anyrow[]>(bobC.client.rpc('get_my_round_threads', { p_conversation: channelId }), 'bob threads');
    expect(mine.map((r) => r.title)).toContain('Round 2 · Alice, Bob & Dan');
  });

  test('the retired retry tick replays nothing: no new messages, no changed bodies', async () => {
    const before = await supabaseAdmin.from('chat_messages').select('id, body').eq('conversation_id', channelId);
    const rowsBefore = await supabaseAdmin.from('transcribe_messages').select('id, posted_at, chat_message_id').eq('room_id', roomId);
    const { error } = await supabaseAdmin.rpc('transcribe_post_retry_tick');
    expect(error).toBeNull();
    const sweep = await supabaseAdmin.rpc('transcribe_room_sweep_tick');
    expect(sweep.error).toBeNull();
    const after = await supabaseAdmin.from('chat_messages').select('id, body').eq('conversation_id', channelId);
    expect(after.data!.length).toBe(before.data!.length);
    expect(JSON.stringify(after.data!.sort((x, y) => x.id.localeCompare(y.id))))
      .toBe(JSON.stringify(before.data!.sort((x, y) => x.id.localeCompare(y.id))));
    const rowsAfter = await supabaseAdmin.from('transcribe_messages').select('id, posted_at, chat_message_id').eq('room_id', roomId);
    expect(JSON.stringify(rowsAfter.data!.sort((x, y) => x.id.localeCompare(y.id))))
      .toBe(JSON.stringify(rowsBefore.data!.sort((x, y) => x.id.localeCompare(y.id))));
    // and the service-only functions are not callable by a client
    for (const fn of ['transcribe_post_retry_tick', 'transcribe_message_destination', 'apply_transcription_swap', 'record_transcribe_slice']) {
      const e = await refused(aliceC.client.rpc(fn, { p_id: crypto.randomUUID(), p_room_id: roomId, p_member_id: tmember.alice, p_text: 'x', p_updates: [] }), `client ${fn}`);
      expect(e.message).toBeTruthy();
    }
  });

  test('a forced posting failure keeps the live row and posts nothing; once the root is back the same clean post lands in the ORIGINAL place', async () => {
    const thread2 = (await threadsOf(round2))[0];
    const t2 = { round: round2, table: 1 };
    // the state the poster refuses: the round thread's root post is no longer available
    const rootBefore = await cmsg(thread2.root_message_id);
    await supabaseAdmin.from('chat_messages').update({ deleted_at: new Date().toISOString(), body: null }).eq('id', thread2.root_message_id);

    const id = await say('alice', 'this line cannot be posted yet');
    const t = await trow(id);
    expect(t.text).toBe('this line cannot be posted yet');         // the live row survived
    expect(t.posted_at).toBeNull();
    const n0 = await countMessages();
    const chunk = chunkSeq++;
    const failed = await cleanRaw('alice', 'this line cannot be posted yet', t2, chunk);
    expect(failed.error, 'the post must fail while the root is unavailable').not.toBeNull();
    expect(await countMessages()).toBe(n0);                         // nothing posted, no ledger row either
    const { count: ledger } = await supabaseAdmin.from('transcribe_round_clean_posts').select('job_id', { count: 'exact', head: true })
      .eq('job_id', await cleanJob(t2)).eq('chunk_ms', chunk);
    expect(ledger).toBe(0);

    // the host re-seats everyone: alice now sits at table 2
    await ok(hostC.client.rpc('host_set_round_seats', {
      p_round_id: round2, p_seats: [seat('alice', 2, 'first'), seat('dan', 2, 'second')],
    }), 're-seat');

    // the root comes back; the same chunk posts
    await supabaseAdmin.from('chat_messages').update({ deleted_at: null, body: rootBefore.body }).eq('id', thread2.root_message_id);
    const msg = await clean('alice', 'this line cannot be posted yet', t2, chunk);
    const m = await cmsg(msg!);
    expect(m.thread_root_id).toBe(thread2.root_message_id);        // the ORIGINAL thread, not table 2
    expect(m.body).toBe('this line cannot be posted yet');
    expect((await threadsOf(round2)).length).toBe(1);               // the re-seat created no second thread
    // idempotent from here
    const n = await countMessages();
    expect(await clean('alice', 'this line cannot be posted yet', t2, chunk)).toBe(msg);
    expect(await countMessages()).toBe(n);
  });

  test('apply_transcription_swap: updates clean messages only, never edited_at, never the row count', async () => {
    const roomRows = async () => (await supabaseAdmin.from('transcribe_messages').select('id', { count: 'exact', head: true }).eq('room_id', roomId)).count;
    const lines: string[] = [];
    // bob's lines are clean posts of the room job; each is its own message.
    for (const text of ['bob swap clean', 'bob swap edited', 'bob swap deleted', 'bob swap empty-update', 'bob swap long', 'bob swap guarded']) {
      const { row, msg } = await sayClean('bob', text, 'room');
      // apply_transcription_swap only touches a message linked from its stored row (the P1592 live link); the
      // clean post carries no such link, so the test sets it, which is the state the swap guards were written for.
      const { error: linkErr } = await supabaseAdmin.from('transcribe_messages').update({ chat_message_id: msg, posted_at: new Date().toISOString() }).eq('id', row);
      expect(linkErr, `link: ${linkErr?.message}`).toBeNull();
      lines.push(msg);
    }
    const [clean, edited, deleted, emptyUpd, long, guarded] = lines;
    expect(new Set(lines).size).toBe(6);
    await ok(bobC.client.rpc('edit_chat_message', { p_message: edited, p_body: 'bob edited this himself' }), 'edit');
    await ok(bobC.client.rpc('delete_chat_message', { p_message: deleted }), 'delete');

    const rootR2 = (await threadsOf(round2))[0].root_message_id;
    const rowsBefore = await roomRows();
    const { data: n, error } = await supabaseAdmin.rpc('apply_transcription_swap', {
      p_room_id: roomId, p_member_id: tmember.bob,
      p_updates: [
        { chat_message_id: clean, body: '  bob swap, cleaned  ', expected_body: 'bob swap clean' },
        { chat_message_id: guarded, body: 'should not win', expected_body: 'a body the message no longer has' },
        { chat_message_id: edited, body: 'should not win over his edit' },
        { chat_message_id: deleted, body: 'should not resurrect' },
        { chat_message_id: emptyUpd, body: '   ' },
        { chat_message_id: long, body: 'x'.repeat(4001) },
        { chat_message_id: aliceFirstMsg, body: 'foreign message' },       // another speaker's
        { chat_message_id: rootR2, body: 'system post' },                    // not a transcription
        { chat_message_id: crypto.randomUUID(), body: 'unknown' },
        { chat_message_id: 'not-a-uuid', body: 'garbage' },
      ],
    });
    expect(error, `swap failed: ${error?.message}`).toBeNull();
    expect(n).toBe(1);
    const c = await cmsg(clean);
    expect(c.body).toBe('bob swap, cleaned');
    expect(c.edited_at).toBeNull();
    expect((await cmsg(edited)).body).toBe('bob edited this himself');
    const d = await cmsg(deleted);
    expect(d.deleted_at).not.toBeNull();
    expect(d.body).toBeNull();
    expect((await cmsg(guarded)).body).toBe('bob swap guarded');            // expected_body mismatch: kept
    expect((await cmsg(emptyUpd)).body).toBe('bob swap empty-update');
    expect((await cmsg(long)).body).toBe('bob swap long');
    expect((await cmsg(aliceFirstMsg)).body).toBe('first line at the table');
    expect((await cmsg(rootR2)).body).toBe('Round 2 · Alice, Bob & Dan');
    expect(await roomRows()).toBe(rowsBefore);                               // the old version is kept
    // a client cannot call it, and the pairing is checked
    const bad = await supabaseAdmin.rpc('apply_transcription_swap', { p_room_id: roomId, p_member_id: crypto.randomUUID(), p_updates: [] });
    expect(bad.error).not.toBeNull();
  });

  test('the host moves a seated person to another table: they join that table\'s thread, keep the old one, and a same-table upsert changes nothing', async () => {
    const round3 = await ok<string>(hostC.client.rpc('host_start_round', {
      p_event_id: event.id, p_round_no: 3, p_group_size: 2,
      p_seats: [seat('alice', 1, 'first'), seat('bob', 1, 'second'), seat('dan', 2, 'first')],
    }), 'host_start_round 3');
    await sayClean('alice', 'round three, table one', { round: round3, table: 1 });   // the first clean post creates each table's thread
    await sayClean('dan', 'round three, table two', { round: round3, table: 2 });
    const byTable = async () => {
      const m: Record<number, Anyrow> = {};
      for (const t of await threadsOf(round3)) m[t.table_no as number] = t;
      return m;
    };
    const membersOf = async (threadId: string) => {
      const { data } = await supabaseAdmin.from('chat_round_thread_members').select('profile_id').eq('thread_id', threadId);
      return (data ?? []).map((x) => x.profile_id as string).sort();
    };
    const t = await byTable();
    expect(Object.keys(t).sort()).toEqual(['1', '2']);
    expect(await membersOf(t[1].id)).toEqual([alice.user.id, bob.user.id].sort());
    expect(await membersOf(t[2].id)).toEqual([dan.user.id]);

    // an upsert that rewrites the same table does nothing
    await ok(hostC.client.rpc('host_set_round_seats', {
      p_round_id: round3, p_seats: [seat('alice', 1, 'first'), seat('bob', 1, 'second'), seat('dan', 2, 'first')],
    }), 'same-table upsert');
    expect(await membersOf(t[1].id)).toEqual([alice.user.id, bob.user.id].sort());
    expect(await membersOf(t[2].id)).toEqual([dan.user.id]);
    const title1 = (await cmsg(t[1].root_message_id)).body;
    const title2 = (await cmsg(t[2].root_message_id)).body;

    // the real host path: bob moves from table 1 to table 2
    await ok(hostC.client.rpc('host_set_round_seats', {
      p_round_id: round3, p_seats: [seat('alice', 1, 'first'), seat('bob', 2, 'second'), seat('dan', 2, 'first')],
    }), 'move bob to table 2');
    expect(await membersOf(t[2].id)).toEqual([bob.user.id, dan.user.id].sort());          // joined the new table's thread
    expect(await membersOf(t[1].id)).toEqual([alice.user.id, bob.user.id].sort());        // kept the old one: he did sit there
    expect((await cmsg(t[2].root_message_id)).body).toBe('Round 3 · Bob & Dan');          // the title follows the member list
    expect((await cmsg(t[2].root_message_id)).body).not.toBe(title2);
    expect((await cmsg(t[1].root_message_id)).body).toBe(title1);
    const mine = await ok<Anyrow[]>(bobC.client.rpc('get_my_round_threads', { p_conversation: channelId }), 'bob threads');
    const r3 = mine.filter((r) => r.round_no === 3).map((r) => r.root_message_id).sort();
    expect(r3).toEqual([t[1].root_message_id, t[2].root_message_id].sort());
    expect((await threadsOf(round3)).length).toBe(2);                                      // the move created no thread
  });

  test('erasure: no round-thread title keeps an erased person\'s name (same path as p520: erase_my_account)', async () => {
    const cleoC = await signIn(cleo);
    const membersOf = async () => {
      const { data } = await supabaseAdmin.from('chat_round_thread_members').select('thread_id, profile_id, display_name')
        .eq('thread_id', (await threadsOf(round1))[0].id);
      return (data ?? []) as Anyrow[];
    };
    expect((await cmsg(rootR1)).body).toBe('Round 1 · Alice, Bob & Cleo');

    // cleo leaves: back to the pair
    const e1 = await ok<Anyrow>(cleoC.client.rpc('erase_my_account'), 'erase cleo');
    expect(e1.auth_user_deleted).toBe(true);
    expect((await cmsg(rootR1)).body).toBe('Round 1 · Alice & Bob');

    // bob leaves: "Round 1 · Alice"
    const e2 = await ok<Anyrow>(bobC.client.rpc('erase_my_account'), 'erase bob');
    expect(e2.auth_user_deleted).toBe(true);
    const root = await cmsg(rootR1);
    expect(root.body).toBe('Round 1 · Alice');
    expect(root.edited_at).toBeNull();
    expect(root.deleted_at).toBeNull();
    const rows = await membersOf();
    expect(rows.map((r) => r.profile_id)).toEqual([alice.user.id]);
    expect(JSON.stringify(rows)).not.toContain('Bob');
    // control: the same probe finds a name that IS there
    expect(JSON.stringify(rows)).toContain('Alice');
    const { data: roots } = await supabaseAdmin.from('chat_messages').select('body').eq('conversation_id', channelId).eq('system_kind', 'round_thread');
    expect(JSON.stringify(roots)).not.toContain('Bob');
    expect(JSON.stringify(roots)).not.toContain('Cleo');
    // the copies made earlier (forwards, clarifies) never carried a name, so there is none to find
    const { data: copies } = await supabaseAdmin.from('chat_messages').select('forward_snapshot').not('forward_snapshot', 'is', null)
      .eq('forwarded_from_message_id', rootR1);
    expect((copies ?? []).length).toBeGreaterThan(0);
    for (const c of copies ?? []) expect(JSON.stringify(c.forward_snapshot)).not.toMatch(/Bob|Cleo/);
    // a later line at the table must not bring the name back
    const { msg: aloneMsg } = await sayClean('alice', 'alone at the table now', { round: round1, table: 1 });
    expect((await cmsg(aloneMsg)).thread_root_id).not.toBeUndefined();
    expect((await cmsg(rootR1)).body).not.toContain('Bob');

    // the last named member leaves: "Round {n}"
    await ok(aliceC.client.rpc('erase_my_account'), 'erase alice');
    expect((await cmsg(rootR1)).body).toBe('Round 1');
    expect((await membersOf()).length).toBe(0);
  });
  // ---- round 2 review: erasure must find a seat-only thread; host seating takes table locks in table order ----
  async function nextRoundNo(): Promise<number> {
    const { data } = await supabaseAdmin.from('event_rounds').select('round_no').eq('event_id', event.id).order('round_no', { ascending: false }).limit(1);
    return ((data ?? [])[0]?.round_no as number | undefined ?? 0) + 1;
  }
  const late: Record<string, TestUser> = {};
  async function lateMember(key: string, name: string): Promise<TestUser> {
    const u = await createTestUser({ name });
    extraUsers.push(u);
    late[key] = u;
    await rsvpToEvent(event.id, u.user.id);
    await addRoomMember(key, u, name);
    await addTranscribeMember(key, u);
    return u;
  }
  const lateSeats = async (roundId: string): Promise<Record<string, string>> => {
    const { data } = await supabaseAdmin.from('event_round_seats').select('room_member_id, table_no, role').eq('round_id', roundId);
    return Object.fromEntries((data ?? []).map((r) => [r.room_member_id as string, `${r.table_no}/${r.role}`]));
  };
  const lateMembers = async (threadId: string): Promise<string[]> => {
    const { data } = await supabaseAdmin.from('chat_round_thread_members').select('profile_id').eq('thread_id', threadId);
    return (data ?? []).map((x) => x.profile_id as string).sort();
  };

  test('erasure finds a person through their table seat, not only through the thread member list (the seat lookup survives the tombstone)', async () => {
    const erin = await lateMember('erin', 'Erin Tester');
    const fay = await lateMember('fay', 'Fay Tester');
    const erinC = await signIn(erin);
    const roundN = await nextRoundNo();
    const round = await ok<string>(hostC.client.rpc('host_start_round', {
      p_event_id: event.id, p_round_no: roundN, p_group_size: 2,
      p_seats: [seat('erin', 1, 'first'), seat('fay', 1, 'second')],
    }), 'host_start_round (seat-only erasure)');
    await sayClean('fay', 'fay speaks first at this table', { round, table: 1 });
    const th = (await threadsOf(round))[0];
    expect(th).toBeDefined();
    const title = (await cmsg(th.root_message_id)).body;
    expect(title).toBe(`Round ${roundN} · Erin & Fay`);

    // The state this test is about: the person is seated at the table and the title names them, but the
    // thread's own member list does not hold them (written directly: no code path leaves exactly this,
    // which is why it isolates the seat lookup from the member-list lookup).
    await supabaseAdmin.from('chat_round_thread_members').delete().eq('thread_id', th.id).eq('profile_id', erin.user.id);
    expect(await lateMembers(th.id)).toEqual([fay.user.id]);
    expect((await cmsg(th.root_message_id)).body).toContain('Erin');          // control: the probe sees the name

    const e = await ok<Anyrow>(erinC.client.rpc('erase_my_account'), 'erase erin');
    expect(e.auth_user_deleted).toBe(true);
    const root = await cmsg(th.root_message_id);
    expect(root.body).toBe(`Round ${roundN} · Fay`);
    expect(root.body).not.toContain('Erin');
    expect(root.edited_at).toBeNull();
    const { data: roots } = await supabaseAdmin.from('chat_messages').select('body').eq('conversation_id', channelId).eq('system_kind', 'round_thread');
    expect(JSON.stringify(roots)).not.toContain('Erin');
    // a later line at that table keeps it that way: the tombstoned seat is not a member any more
    await sayClean('fay', 'fay again, after erin left', { round, table: 1 });
    expect((await cmsg(th.root_message_id)).body).toBe(`Round ${roundN} · Fay`);
  });

  test('host_set_round_seats: an unordered p_seats input seats exactly as before, threads follow, and a sorted re-send changes nothing', async () => {
    const gus = await lateMember('gus', 'Gus Tester');
    const roundN = await nextRoundNo();
    const round = await ok<string>(hostC.client.rpc('host_start_round', {
      p_event_id: event.id, p_round_no: roundN, p_group_size: 2,
      p_seats: [seat('fay', 1, 'first'), seat('gus', 2, 'first'), seat('dan', 3, 'first')],
    }), 'host_start_round (ordered seating)');
    await sayClean('fay', 'table one', { round, table: 1 }); await sayClean('gus', 'table two', { round, table: 2 }); await sayClean('dan', 'table three', { round, table: 3 });
    const byTable: Record<number, Anyrow> = {};
    for (const t of await threadsOf(round)) byTable[t.table_no as number] = t;
    expect(Object.keys(byTable).sort()).toEqual(['1', '2', '3']);

    // table numbers deliberately NOT in array order (3, 1, 2): everyone moves one table over
    const unordered = [seat('gus', 3, 'first'), seat('dan', 1, 'second'), seat('fay', 2, 'first')];
    await ok(hostC.client.rpc('host_set_round_seats', { p_round_id: round, p_seats: unordered }), 'unordered re-seat');
    const want = { [room.gus]: '3/first', [room.dan]: '1/second', [room.fay]: '2/first' };
    expect(await lateSeats(round)).toEqual(want);
    const fayId = late.fay.user.id;
    const gusId = gus.user.id;
    expect(await lateMembers(byTable[1].id)).toEqual([fayId, dan.user.id].sort());   // dan joined table 1's thread
    expect(await lateMembers(byTable[2].id)).toEqual([fayId, gusId].sort());         // fay joined table 2's
    expect(await lateMembers(byTable[3].id)).toEqual([dan.user.id, gusId].sort());   // gus joined table 3's

    // the same seating sent in table order is a no-op: same rows, no thread changes
    const titlesBefore = JSON.stringify(await Promise.all([1, 2, 3].map(async (n) => (await cmsg(byTable[n].root_message_id)).body)));
    await ok(hostC.client.rpc('host_set_round_seats', {
      p_round_id: round, p_seats: [seat('dan', 1, 'second'), seat('fay', 2, 'first'), seat('gus', 3, 'first')],
    }), 'sorted re-send');
    expect(await lateSeats(round)).toEqual(want);
    expect(JSON.stringify(await Promise.all([1, 2, 3].map(async (n) => (await cmsg(byTable[n].root_message_id)).body)))).toBe(titlesBefore);
  });
});
