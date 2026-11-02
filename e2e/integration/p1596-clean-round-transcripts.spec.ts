/**
 * @file p1596-clean-round-transcripts.spec.ts
 * @description P1596 canary (migration 20261101120000): live posting is retired; ending a round snapshots one
 * clean job per table; the post RPC writes one attributed message per speaker turn block, idempotently, only
 * for consenting snapshot members; a room end makes a job whose posts land in a fresh outside-rounds root (titled by place).
 * Written without being run (the migration is not applied anywhere yet). Uses the service role and the host's
 * own RPCs, the way e2e/integration/p1592-erasure-interleaving.spec.ts seeds its event.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from '../helpers/test-event';
import { seedRoomMember } from '../helpers/test-event-room';
import { signIn, ok, type SignedIn } from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();

test.describe('P1596: clean round transcripts', () => {
  let host: TestUser, hostC: SignedIn, event: TestEvent;
  let roomId = '';
  let wasEnabled = false;
  const users: Record<string, TestUser> = {};
  const roomMember: Record<string, string> = {};
  const tmember: Record<string, string> = {};
  const sessionIds: string[] = [];

  async function addPerson(key: string, name: string, consent: boolean) {
    const u = await createTestUser({ name });
    users[key] = u;
    await rsvpToEvent(event.id, u.user.id);
    roomMember[key] = (await seedRoomMember(event.id, { displayName: name, profileId: u.user.id })).id;
    const { data: s } = await supabaseAdmin.from('clarity_sessions')
      .insert({ code: `P1596${RUN}${key}`.slice(0, 20), creator_name: name, creator_profile_id: u.user.id }).select('id').single();
    sessionIds.push(s!.id);
    const { data: m, error } = await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: roomId, profile_id: u.user.id, display_name: name, session_id: s!.id,
      consent_given_at: consent ? new Date().toISOString() : null,
    }).select('id').single();
    expect(error, `member ${key}: ${error?.message}`).toBeNull();
    tmember[key] = m!.id;
  }
  const seat = (key: string, t: number, r: 'first' | 'second') => ({ m: roomMember[key], t, r });
  const jobsFor = async (roundId: string) =>
    (await supabaseAdmin.from('transcribe_round_clean_jobs').select('*').eq('round_id', roundId)).data ?? [];
  const processing = (id: string) =>
    supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing', claimed_at: new Date().toISOString() }).eq('id', id);

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1596 Host' });
    event = await createTestEvent(host.user.id, new Date(), { title: `P1596 Event ${RUN}` });
    const { data: r, error } = await supabaseAdmin.from('transcribe_rooms').insert({ code: `P1596${RUN}R`, event_id: event.id }).select('id').single();
    expect(error, `room: ${error?.message}`).toBeNull();
    roomId = r!.id;
    await addPerson('a', 'Alma Table', true);
    await addPerson('b', 'Boris Table', true);
    await addPerson('c', 'Cleo Declined', false);   // seated, never consented: never in a job
    await addPerson('d', 'Dara Unseated', true);    // consented, never seated: room job only
    hostC = await signIn(host);
    const { data: sw } = await supabaseAdmin.from('transcribe_channel_posting').select('enabled').eq('singleton', true).maybeSingle();
    wasEnabled = sw?.enabled ?? false;
    // enabled_at is the floor for every job; this suite's rooms and backdated rounds count as recorded after switch-on
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: true }).eq('singleton', true);
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled_at: new Date(Date.now() - 24 * 3600_000).toISOString() }).eq('singleton', true);
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: wasEnabled }).eq('singleton', true);
    await supabaseAdmin.from('transcribe_rooms').delete().eq('id', roomId);
    if (sessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessionIds);
    if (event?.id) await deleteTestEvent(event.id);
    for (const u of [host, ...Object.values(users)]) { if (u?.user?.id) { try { await deleteTestUser(u.user.id); } catch { /* ignore */ } } }
  });

  let round1 = '';
  let jobId = '';

  test('a live slice is stored and nothing is posted to chat', async () => {
    const id = await ok<string>(supabaseAdmin.rpc('record_transcribe_slice', { p_room_id: roomId, p_member_id: tmember.a, p_text: 'hello from the room page' }), 'slice');
    const { data: row } = await supabaseAdmin.from('transcribe_messages').select('posted_at, chat_message_id, text').eq('id', id).single();
    expect(row?.text).toBe('hello from the room page');
    expect(row?.posted_at).toBeNull();
    expect(row?.chat_message_id).toBeNull();
    await supabaseAdmin.rpc('transcribe_post_retry_tick');
    const { data: after } = await supabaseAdmin.from('transcribe_messages').select('posted_at').eq('id', id).single();
    expect(after?.posted_at, 'the retry must not post either').toBeNull();
  });

  test('ending a round creates one job per table, consenting members only, 40 s after the cut', async () => {
    round1 = await ok<string>(hostC.client.rpc('host_start_round', {
      p_event_id: event.id, p_round_no: 1, p_group_size: 3, p_seats: [seat('a', 1, 'first'), seat('b', 1, 'second'), seat('c', 2, 'first')],
    }), 'round 1');
    expect(await jobsFor(round1), 'no job while the round runs').toHaveLength(0);
    await ok(hostC.client.rpc('host_start_round', {
      p_event_id: event.id, p_round_no: 2, p_group_size: 3, p_seats: [seat('a', 1, 'first'), seat('b', 1, 'second')],
    }), 'round 2 ends round 1');
    const jobs = await jobsFor(round1);
    expect(jobs.map((j) => j.table_no)).toEqual([1]);          // table 2 held only the non-consenting member
    const members = (jobs[0].seats as { member_id: string }[]).map((s) => s.member_id).sort();
    expect(members).toEqual([tmember.a, tmember.b].sort());
    const { data: er } = await supabaseAdmin.from('event_rounds').select('ended_at').eq('id', round1).single();
    expect(Date.parse(jobs[0].not_before) - Date.parse(er!.ended_at)).toBe(40_000);
    expect(JSON.stringify(jobs[0].seats)).not.toMatch(/Alma|Boris|profile/);   // ids only
    jobId = jobs[0].id;
  });

  const items = (...xs: [string, number, string][]) => xs.map(([m, c, t]) => ({ member_id: tmember[m], chunk_ms: c, text: t }));
  const postRpc = (job: string, attempt: number, its: unknown[]) =>
    supabaseAdmin.rpc('post_clean_round', { p_job_id: job, p_attempt: attempt, p_items: its });
  const postedFor = async (job: string) =>
    (await supabaseAdmin.from('transcribe_round_clean_posts').select('member_id, chunk_ms, chat_message_id').eq('job_id', job)).data ?? [];

  test('the job snapshots the seated count and roster, and the old per-item RPC is gone', async () => {
    const [j] = await jobsFor(round1);
    expect(j.seated_count, 'a, b and the declined c are not all at table 1: a and b are').toBe(2);
    expect((j.roster as string[]).sort()).toEqual([roomMember.a, roomMember.b].sort());
    const gone = await supabaseAdmin.rpc('post_clean_round_text', { p_job_id: jobId, p_member_id: tmember.a, p_chunk_ms: 1, p_text: 'x' });
    expect(gone.error, 'post_clean_round_text is dropped').not.toBeNull();
  });

  test('the post RPC refuses a job that is not being processed, then posts one block per speaker, once', async () => {
    const refused = await postRpc(jobId, 0, items(['a', 1, 'x']));
    expect(refused.error, 'pending job').not.toBeNull();
    await processing(jobId);
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ attempts: 1 }).eq('id', jobId);   // what the claim does
    const first = await ok<number>(postRpc(jobId, 1, items(['a', 1000, 'Clean words from Alma.'], ['b', 2000, 'Boris answers.'])), 'post');
    expect(first).toBe(2);
    const ledger = await postedFor(jobId);
    const again = await ok<number>(postRpc(jobId, 1, items(['a', 1000, 'Clean words from Alma.'])), 'post again');
    expect(again, 'a replay returns the same message').toBe(1);
    expect(await postedFor(jobId)).toHaveLength(ledger.length);
    const { data: th } = await supabaseAdmin.from('chat_round_threads').select('root_message_id').eq('round_id', round1).single();
    const { data: msgs } = await supabaseAdmin.from('chat_messages').select('author_id, body, is_transcription, thread_root_id').eq('thread_root_id', th!.root_message_id);
    expect(msgs).toHaveLength(2);
    expect(msgs!.every((m) => m.is_transcription)).toBe(true);
    expect(msgs!.map((m) => m.author_id).sort()).toEqual([users.a.user.id, users.b.user.id].sort());
  });

  test('a stale attempt is refused and posts nothing', async () => {
    const before = await postedFor(jobId);
    const stale = await postRpc(jobId, 0, items(['a', 7000, 'from a worker whose claim was reset']));
    expect(stale.error).not.toBeNull();
    expect(await postedFor(jobId)).toHaveLength(before.length);
  });

  test('one bad item rolls the whole call back: nothing is posted', async () => {
    const before = await postedFor(jobId);
    const bad = await postRpc(jobId, 1, items(['a', 8000, 'would be fine'], ['d', 8001, 'not in this table job']));
    expect(bad.error, 'd is not in this job snapshot').not.toBeNull();
    expect(await postedFor(jobId), 'the good item before the bad one was rolled back too').toHaveLength(before.length);
  });

  test('a member outside the snapshot, or without consent, is never posted', async () => {
    const out = await postRpc(jobId, 1, items(['d', 3000, 'not seated here']));
    expect(out.error, 'unseated member is not in this table job').not.toBeNull();
    const c = await postRpc(jobId, 1, items(['c', 3000, 'declined']));
    expect(c.error).not.toBeNull();
  });

  test('the switch is honoured at the claim', async () => {
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: false }).eq('singleton', true);
    try {
      await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'pending', not_before: new Date(0).toISOString() }).eq('id', jobId);
      const { data } = await supabaseAdmin.rpc('claim_round_clean_job', { p_job_id: jobId });
      expect(data ?? [], 'nothing is claimed while the switch is off').toHaveLength(0);
    } finally {
      await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: true }).eq('singleton', true);
      await supabaseAdmin.from('transcribe_channel_posting').update({ enabled_at: new Date(Date.now() - 24 * 3600_000).toISOString() }).eq('singleton', true); // jobs need a window after switch-on
      await processing(jobId);
    }
  });

  test('clients can reach neither the tables nor the RPC', async () => {
    const a = await signIn(users.a);
    expect((await a.client.from('transcribe_round_clean_jobs').select('id')).data ?? []).toHaveLength(0);
    expect((await a.client.from('transcribe_round_seat_moves').select('round_id')).data ?? []).toHaveLength(0);
    expect((await a.client.rpc('post_clean_round', { p_job_id: jobId, p_attempt: 1, p_items: items(['a', 5, 'x']) })).error).not.toBeNull();
  });

  const startRound = (no: number, seats: ReturnType<typeof seat>[]) =>
    ok<string>(hostC.client.rpc('host_start_round', { p_event_id: event.id, p_round_no: no, p_group_size: 3, p_seats: seats }), `round ${no}`);
  const setSeats = (round: string, seats: ReturnType<typeof seat>[]) =>
    ok(hostC.client.rpc('host_set_round_seats', { p_round_id: round, p_seats: seats }), 'set seats');
  const backdate = (round: string, seconds: number) =>
    supabaseAdmin.from('event_rounds').update({ started_at: new Date(Date.now() - seconds * 1000).toISOString() }).eq('id', round);
  const movesOf = async (round: string) =>
    ((await supabaseAdmin.from('transcribe_round_seat_moves').select('from_table, to_table').eq('round_id', round)).data ?? []);
  const base3 = () => [seat('a', 1, 'first'), seat('b', 1, 'second'), seat('d', 2, 'first')];

  test('seating adjustments in the first 60 s of a round are not moves', async () => {
    const r = await startRound(3, base3());
    await setSeats(r, [seat('a', 1, 'first'), seat('b', 2, 'second'), seat('d', 2, 'first')]);
    expect(await movesOf(r)).toEqual([]);
    await startRound(4, [seat('a', 1, 'first')]);
    expect((await jobsFor(r)).every((j) => j.error !== 'seat_moved')).toBe(true);
  });

  test('an adjustment in the first 60 s starts the affected tables\' job windows at that moment; untouched rounds start at the round start', async () => {
    const r = await startRound(5, base3());
    const { data: before } = await supabaseAdmin.from('event_rounds').select('started_at').eq('id', r).single();
    await setSeats(r, [seat('a', 1, 'first'), seat('b', 2, 'second'), seat('d', 2, 'first')]);
    await startRound(6, [seat('a', 1, 'first')]);
    const jobs = await jobsFor(r);
    expect(jobs.length).toBeGreaterThan(0);
    for (const j of jobs.filter((x) => [1, 2].includes(x.table_no))) {
      expect(new Date(j.window_start).getTime(), `table ${j.table_no}`).toBeGreaterThan(new Date(before!.started_at).getTime());
    }
  });

  test('a seat moved during an open round makes both tables seat_moved jobs that post nothing', async () => {
    const r3 = await startRound(7, base3());
    await backdate(r3, 120);
    await setSeats(r3, [seat('a', 1, 'first'), seat('b', 2, 'second'), seat('d', 2, 'first')]);
    expect(await movesOf(r3)).toEqual([{ from_table: 1, to_table: 2 }]);
    await startRound(8, [seat('a', 1, 'first')]);
    const jobs = await jobsFor(r3);
    expect(jobs.map((j) => [j.table_no, j.status, j.error]).sort()).toEqual([[1, 'completed', 'seat_moved'], [2, 'completed', 'seat_moved']]);
    expect(jobs.every((j) => j.completed_at)).toBe(true);
    for (const j of jobs) expect(await postedFor(j.id)).toHaveLength(0);
  });

  let round9 = '';
  test('A to B to A after 60 s still poisons both tables; a re-save of the same seats logs nothing', async () => {
    const r = await startRound(9, base3());
    round9 = r;
    await backdate(r, 120);
    await setSeats(r, base3());                                   // upsert / delete / insert of the same seats
    expect(await movesOf(r)).toEqual([]);
    await setSeats(r, [seat('a', 1, 'first'), seat('b', 2, 'second'), seat('d', 2, 'first')]);
    await setSeats(r, base3());
    expect(await movesOf(r)).toEqual([{ from_table: 1, to_table: 2 }, { from_table: 2, to_table: 1 }]);
    // someone leaving, then arriving, after 60 s is logged too (rounds stop at 9, so this shares the round)
    await setSeats(r, [seat('a', 1, 'first'), seat('d', 2, 'first')]);
    await setSeats(r, base3());
    expect((await movesOf(r)).slice(2)).toEqual([{ from_table: 1, to_table: null }, { from_table: null, to_table: 1 }]);
  });

  test('the host marking someone left in an open round (after 60 s) is a seat move, even once their seat row is gone; the first 60 s are ignored', async () => {
    const before = (await movesOf(round9)).length;
    // d sits at table 2 in round 9 (restored above): mark left, then delete the seat row
    await ok(hostC.client.rpc('host_set_round_presence', {
      p_event_id: event.id, p_room_member_id: roomMember.d, p_left: true, p_sits_out_round: null }), 'mark d left');
    expect((await movesOf(round9)).slice(before)).toEqual([{ from_table: 2, to_table: null }]);
    await setSeats(round9, [seat('a', 1, 'first'), seat('b', 1, 'second')]);   // d's seat row deleted mid-round
    // within the first 60 s the same change is ignored, like a seat move
    await supabaseAdmin.from('event_round_presence').delete().eq('event_id', event.id);
    await backdate(round9, 10);
    const early = (await movesOf(round9)).length;
    await ok(hostC.client.rpc('host_set_round_presence', {
      p_event_id: event.id, p_room_member_id: roomMember.b, p_left: true, p_sits_out_round: null }), 'mark b left early');
    expect((await movesOf(round9)).length).toBe(early);
    await supabaseAdmin.from('event_round_presence').delete().eq('event_id', event.id);
  });

  test('room end makes one room job; people are excluded by the round snapshots; posts land in a fresh thread root', async () => {
    await ok(hostC.client.rpc('host_end_rounds', { p_event_id: event.id }), 'end rounds');
    await supabaseAdmin.from('transcribe_room_members').update({ capture_ended_at: new Date().toISOString() }).eq('room_id', roomId);
    const { error } = await supabaseAdmin.from('transcribe_rooms').update({ ended_at: new Date().toISOString() }).eq('id', roomId);
    expect(error).toBeNull();
    let { data: rj } = await supabaseAdmin.from('transcribe_round_clean_jobs').select('*').eq('room_id', roomId).eq('kind', 'room');
    // round 1's start made the room's "before" job; the room end makes the "end" job: one room job per room and place
    expect((rj ?? []).map((j) => j.place).sort()).toEqual(['before', 'end']);
    rj = (rj ?? []).filter((j) => j.place === 'end');
    expect(rj).toHaveLength(1);
    const segs = rj![0].segments as { member_ids: string[]; compare_ids: string[] }[];
    expect(segs.some((x) => x.member_ids.includes(tmember.d))).toBe(true);
    // d was marked left in round 9 (seat row deleted): the room job leaves them out of that round's stretch
    const { data: r9 } = await supabaseAdmin.from('event_rounds').select('started_at').eq('id', round9).single();
    const r9seg = (rj![0].segments as { start: string; member_ids: string[] }[])
      .find((x) => new Date(x.start).getTime() === new Date(r9!.started_at).getTime());
    expect(r9seg?.member_ids.includes(tmember.d) ?? false).toBe(false);
    // a and b were seated in round 1 by snapshot: never unseated words in that stretch, but their mics are compared
    expect(segs.every((x) => x.compare_ids.includes(tmember.a) && x.compare_ids.includes(tmember.b))).toBe(true);
    await processing(rj![0].id);
    await supabaseAdmin.from('transcribe_round_clean_jobs').update({ attempts: 1 }).eq('id', rj![0].id);
    expect(await ok<number>(postRpc(rj![0].id, 1, items(['d', 10, 'Dara, after the rounds.'])), 'outside post')).toBe(1);
    const [row] = await postedFor(rj![0].id);
    const { data: msg } = await supabaseAdmin.from('chat_messages').select('thread_root_id').eq('id', row.chat_message_id).single();
    const { data: root } = await supabaseAdmin.from('chat_messages').select('system_kind, body').eq('id', msg!.thread_root_id).single();
    expect(root?.system_kind).toBe('outside_rounds');
  });

  test('a room that ends during an open round: the stretch stays with the round, and closing the round still cuts this room', async () => {
    const ev = await createTestEvent(host.user.id, new Date(), { title: `P1596 Open Round ${RUN}` });
    const { data: r2, error: rErr } = await supabaseAdmin.from('transcribe_rooms').insert({ code: `P1596${RUN}O`, event_id: ev.id }).select('id').single();
    expect(rErr, `room: ${rErr?.message}`).toBeNull();
    const local: Record<string, string> = {};
    const members: Record<string, string> = {};
    const made: string[] = [];
    try {
      for (const key of ['a', 'b', 'd']) {
        await rsvpToEvent(ev.id, users[key].user.id);
        local[key] = (await seedRoomMember(ev.id, { displayName: `Open ${key}`, profileId: users[key].user.id })).id;
        const { data: se } = await supabaseAdmin.from('clarity_sessions')
          .insert({ code: `P1596O${RUN}${key}`.slice(0, 20), creator_name: `Open ${key}`, creator_profile_id: users[key].user.id }).select('id').single();
        made.push(se!.id);
        const { data: m, error } = await supabaseAdmin.from('transcribe_room_members').insert({
          room_id: r2!.id, profile_id: users[key].user.id, display_name: `Open ${key}`, session_id: se!.id, consent_given_at: new Date().toISOString(),
        }).select('id').single();
        expect(error, `member ${key}: ${error?.message}`).toBeNull();
        members[key] = m!.id;
      }
      const openRound = await ok<string>(hostC.client.rpc('host_start_round', {
        p_event_id: ev.id, p_round_no: 1, p_group_size: 3,
        p_seats: [{ m: local.a, t: 1, r: 'first' }, { m: local.b, t: 1, r: 'second' }],
      }), 'open round');
      await supabaseAdmin.from('transcribe_room_members').update({ capture_ended_at: new Date().toISOString() }).eq('room_id', r2!.id);
      const { error: endErr } = await supabaseAdmin.from('transcribe_rooms').update({ ended_at: new Date().toISOString() }).eq('id', r2!.id);
      expect(endErr).toBeNull();

      const { data: rj } = await supabaseAdmin.from('transcribe_round_clean_jobs').select('*').eq('room_id', r2!.id).eq('kind', 'room').eq('place', 'end');
      const segs = (rj?.[0]?.segments ?? []) as { member_ids: string[]; compare_ids: string[] }[];
      expect(segs.length, 'the unseated person still gets the stretch').toBeGreaterThan(0);
      for (const x of segs) {
        expect(x.member_ids, 'seated people are not "after the last round" during their open round').not.toContain(members.a);
        expect(x.member_ids).not.toContain(members.b);
        expect(x.member_ids).toContain(members.d);
        expect(x.compare_ids).toEqual(expect.arrayContaining([members.a, members.b, members.d]));
      }

      await ok(hostC.client.rpc('host_end_rounds', { p_event_id: ev.id }), 'close the round after the room ended');
      const jobs = await jobsFor(openRound);
      expect(jobs.map((j) => j.table_no), 'the later cut keeps the ended room').toEqual([1]);
      expect((jobs[0].seats as { member_id: string }[]).map((x) => x.member_id).sort()).toEqual([members.a, members.b].sort());
    } finally {
      await supabaseAdmin.from('transcribe_rooms').delete().eq('id', r2!.id);
      if (made.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', made);
      await deleteTestEvent(ev.id);
    }
  });

  test('a round nobody closes is cut 2 h after the last room ended; tidying the list after the room ended is not a move', async () => {
    const ev = await createTestEvent(host.user.id, new Date(), { title: `P1596 Abandoned ${RUN}` });
    const { data: r3 } = await supabaseAdmin.from('transcribe_rooms').insert({ code: `P1596${RUN}Q`, event_id: ev.id }).select('id').single();
    const local: Record<string, string> = {};
    const made: string[] = [];
    try {
      for (const key of ['a', 'b']) {
        await rsvpToEvent(ev.id, users[key].user.id);
        local[key] = (await seedRoomMember(ev.id, { displayName: `Gone ${key}`, profileId: users[key].user.id })).id;
        const { data: se } = await supabaseAdmin.from('clarity_sessions')
          .insert({ code: `P1596Q${RUN}${key}`.slice(0, 20), creator_name: `Gone ${key}`, creator_profile_id: users[key].user.id }).select('id').single();
        made.push(se!.id);
        const { error } = await supabaseAdmin.from('transcribe_room_members').insert({
          room_id: r3!.id, profile_id: users[key].user.id, display_name: `Gone ${key}`, session_id: se!.id, consent_given_at: new Date().toISOString(),
        });
        expect(error, error?.message).toBeNull();
      }
      const rid = await ok<string>(hostC.client.rpc('host_start_round', {
        p_event_id: ev.id, p_round_no: 1, p_group_size: 3, p_seats: [{ m: local.a, t: 1, r: 'first' }, { m: local.b, t: 1, r: 'second' }],
      }), 'round');
      const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
      await supabaseAdmin.from('event_rounds').update({ started_at: ago(4) }).eq('id', rid);
      await supabaseAdmin.from('transcribe_room_members').update({ capture_ended_at: ago(1) }).eq('room_id', r3!.id);
      await supabaseAdmin.from('transcribe_rooms').update({ ended_at: ago(1) }).eq('id', r3!.id);

      await supabaseAdmin.from('event_round_seats').update({ table_no: 2 }).eq('round_id', rid).eq('room_member_id', local.a);
      const { data: moves } = await supabaseAdmin.from('transcribe_round_seat_moves').select('id').eq('round_id', rid);
      expect(moves, 'every room ended: tidying is not a move').toHaveLength(0);
      await supabaseAdmin.from('event_round_seats').update({ table_no: 1 }).eq('round_id', rid).eq('room_member_id', local.a);

      await ok(supabaseAdmin.rpc('transcribe_round_clean_tick'), 'tick, 1 h after the room ended');
      expect(await jobsFor(rid), 'too early to call it abandoned').toHaveLength(0);

      const end = ago(3);
      await supabaseAdmin.from('transcribe_rooms').update({ ended_at: end }).eq('id', r3!.id);
      // switched on after this round started: speech from before the switch is never auto-closed and posted
      await supabaseAdmin.from('transcribe_channel_posting').update({ enabled_at: new Date().toISOString() }).eq('singleton', true);
      await ok(supabaseAdmin.rpc('transcribe_round_clean_tick'), 'tick, round older than the switch');
      expect(await jobsFor(rid), 'a round from before the switch stays uncut').toHaveLength(0);
      await supabaseAdmin.from('transcribe_channel_posting').update({ enabled_at: ago(24) }).eq('singleton', true);
      await ok(supabaseAdmin.rpc('transcribe_round_clean_tick'), 'tick, 3 h after');
      const jobs = await jobsFor(rid);
      expect(jobs.map((j) => [j.table_no, j.status])).toEqual([[1, expect.not.stringMatching(/completed/)]]);
      const { data: er } = await supabaseAdmin.from('event_rounds').select('ended_at').eq('id', rid).single();
      expect(new Date(er!.ended_at).getTime()).toBe(new Date(end).getTime());
    } finally {
      await supabaseAdmin.from('transcribe_rooms').delete().eq('id', r3!.id);
      if (made.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', made);
      await deleteTestEvent(ev.id);
    }
  });

  test('a host closing a round from before the switch makes no job, so older speech never posts', async () => {
    const ev = await createTestEvent(host.user.id, new Date(), { title: `P1596 Floor ${RUN}` });
    const { data: r4 } = await supabaseAdmin.from('transcribe_rooms').insert({ code: `P1596${RUN}F`, event_id: ev.id }).select('id').single();
    const after = new Date(Date.now() + 3600_000).toISOString();
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled_at: after }).eq('singleton', true);
    try {
      await rsvpToEvent(ev.id, users.a.user.id);
      const m = (await seedRoomMember(ev.id, { displayName: 'Floor a', profileId: users.a.user.id })).id;
      const { data: se } = await supabaseAdmin.from('clarity_sessions')
        .insert({ code: `P1596F${RUN}a`.slice(0, 20), creator_name: 'Floor a', creator_profile_id: users.a.user.id }).select('id').single();
      await supabaseAdmin.from('transcribe_room_members').insert({
        room_id: r4!.id, profile_id: users.a.user.id, display_name: 'Floor a', session_id: se!.id, consent_given_at: new Date().toISOString(),
      });
      const rid = await ok<string>(hostC.client.rpc('host_start_round', { p_event_id: ev.id, p_round_no: 1, p_group_size: 3, p_seats: [{ m, t: 1, r: 'first' }] }), 'round');
      await ok(hostC.client.rpc('host_end_rounds', { p_event_id: ev.id }), 'host closes it');
      expect(await jobsFor(rid)).toHaveLength(0);
      await supabaseAdmin.from('transcribe_rooms').update({ ended_at: new Date().toISOString() }).eq('id', r4!.id);
      const { data: rj } = await supabaseAdmin.from('transcribe_round_clean_jobs').select('id').eq('room_id', r4!.id);
      expect(rj, 'nor from the room ending').toHaveLength(0);
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', se!.id);
    } finally {
      await supabaseAdmin.from('transcribe_channel_posting').update({ enabled_at: new Date(Date.now() - 24 * 3600_000).toISOString() }).eq('singleton', true);
      await supabaseAdmin.from('transcribe_rooms').delete().eq('id', r4!.id);
      await deleteTestEvent(ev.id);
    }
  });
});
