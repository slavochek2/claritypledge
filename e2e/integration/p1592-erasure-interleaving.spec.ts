/**
 * @file p1592-erasure-interleaving.spec.ts
 * @description P1592 (poster path moved to the P1596 clean post): pinned interleavings of an account erasure with a tablemate's first post, with a host
 * re-seat and with an unseated speaker's line into the Outside rounds thread. PostgREST makes every RPC its own transaction, so the main canary cannot hold a lock in one session
 * while another runs; this spec drives the self-hosted TEST database through psql sessions (the route
 * scripts/selfhosted/migrate.sh uses: gcloud IAP SSH into the db container) and pins the overlap with an
 * advisory-lock barrier instead of sleeps.
 *
 * Opt-in: needs gcloud + the self-hosted TEST VM, so it only runs through
 * scripts/test-p1592-erasure-interleaving.sh (P1592_INTERLEAVING=1). Skipped everywhere else.
 *
 * "Erasure in progress" is the REAL erase_my_account() (jwt sub set the way a signed-in caller's is) in ONE open
 * transaction, parked on a barrier before COMMIT; where the erasure itself is meant to block, the test polls
 * pg_locks until that backend holds an ungranted advisory lock instead of sleeping.
 */
import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from '../helpers/test-event';
import { seedRoomMember } from '../helpers/test-event-room';
import { signIn, ok, type SignedIn } from '../helpers/test-chat';
import { postCleanSql, seatedRoster } from '../helpers/test-clean-post';

test.skip(process.env.P1592_INTERLEAVING !== '1', 'needs gcloud + the self-hosted TEST VM: run scripts/test-p1592-erasure-interleaving.sh');
test.describe.configure({ mode: 'serial', timeout: 300_000 });

const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const SSH = ['compute', 'ssh', 'cp-test-supabase', '--project=gen-lang-client-0869694595', '--zone=asia-southeast1-a',
  '--tunnel-through-iap', '--quiet', '--command', 'sudo docker exec -i supabase-db psql -U postgres -d postgres -X -At -v ON_ERROR_STOP=1'];
const BARRIER_ERASE = 71592001;   // E waits on this before COMMIT
const BARRIER_POST = 71592002;    // P waits on this before COMMIT

interface Sess { proc: ChildProcess; out: string; done: Promise<number | null>; seen: (marker: string, ms?: number) => Promise<void>; }
function psql(sql: string): Sess {
  const proc = spawn('gcloud', SSH, { env: { ...process.env, PATH: `/opt/homebrew/share/google-cloud-sdk/bin:${process.env.PATH}` } });
  const s: Sess = { proc, out: '', done: new Promise((r) => proc.on('close', (c) => r(c))), seen: async () => {} };
  proc.stdout!.on('data', (d) => { s.out += d.toString(); });
  proc.stderr!.on('data', (d) => { s.out += d.toString(); });
  s.seen = async (marker, ms = 90_000) => {
    const t0 = Date.now();
    while (!s.out.includes(marker)) {
      if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${marker}; output so far:\n${s.out}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  proc.stdin!.write(sql);
  proc.stdin!.end();
  return s;
}
async function runSql(sql: string): Promise<string> { const s = psql(sql); await s.done; return s.out; }

test.describe('P1592: erasure interleavings, pinned with psql sessions', () => {
  let host: TestUser, hostC: SignedIn;
  let postingWasEnabled: boolean | null = null;
  let event: TestEvent;
  let roomId = '';
  const users: Record<string, TestUser> = {};
  const room: Record<string, string> = {};
  const tmember: Record<string, string> = {};
  const sessionIds: string[] = [];

  async function addPerson(key: string, name: string) {
    const u = await createTestUser({ name });
    users[key] = u;
    await rsvpToEvent(event.id, u.user.id);
    room[key] = (await seedRoomMember(event.id, { displayName: name, profileId: u.user.id })).id;
    const { data: sess, error: sErr } = await supabaseAdmin.from('clarity_sessions')
      .insert({ code: `P1592I${RUN}${key}`.slice(0, 20), creator_name: name, creator_profile_id: u.user.id }).select('id').single();
    expect(sErr, `session ${key}: ${sErr?.message}`).toBeNull();
    sessionIds.push(sess!.id);
    const { data: m, error } = await supabaseAdmin.from('transcribe_room_members').insert({
      room_id: roomId, profile_id: u.user.id, display_name: name, session_id: sess!.id, consent_given_at: new Date().toISOString(),
    }).select('id').single();
    expect(error, `transcribe member ${key}: ${error?.message}`).toBeNull();
    tmember[key] = m!.id;
  }
  const seat = (key: string, t: number, r: 'first' | 'second') => ({ m: room[key], t, r });
  const eraseMy = (key: string, app: string, barrier?: number) =>
    `SET application_name = '${app}'; BEGIN; SELECT set_config('request.jwt.claims', '{"sub":"${users[key].user.id}","role":"authenticated"}', true); `
    + `SELECT 'E_START'; SELECT public.erase_my_account(); SELECT 'E_READY'; ${barrier ? `SELECT pg_advisory_lock(${barrier}); ` : ''}COMMIT; SELECT 'E_DONE';`;
  /** True once the backend named `app` is waiting on any lock (polled, no fixed sleep). */
  async function waitBlocked(app: string, tries = 15): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
      const out = await runSql(`SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a USING (pid) WHERE a.application_name = '${app}' AND NOT l.granted;`);
      if (/^[1-9]\d*$/m.test(out)) return true;
    }
    return false;
  }
  // P1596 retired live posting: the poster is now the clean post of a claimed (processing) job. The job's seat
  // snapshot holds every transcribe member of the room, and each call uses a fresh chunk so nothing is a replay.
  let chunkSeq = 1000;
  async function mkJob(target: 'room' | { round: string; table: number }): Promise<string> {
    const now = new Date().toISOString();
    const base = target === 'room' ? { kind: 'room', room_id: roomId } : { kind: 'round', round_id: target.round, table_no: target.table };
    const seats = Object.values(tmember).map((m) => ({ member_id: m, room_id: roomId }));
    const roster = target === 'room' ? [] : await seatedRoster(target.round, target.table);
    const { data, error } = await supabaseAdmin.from('transcribe_round_clean_jobs').insert({
      ...base, event_id: event.id, seats, roster, window_start: now, window_end: now, status: 'processing', not_before: now,
    }).select('id').single();
    expect(error, `clean job: ${error?.message}`).toBeNull();
    return data!.id as string;
  }
  const post = (jobId: string, key: string, text: string) =>
    postCleanSql(jobId, tmember[key], chunkSeq++, text);
  async function namesOnThreads(roundIds: string[]): Promise<string> {
    const { data: th } = await supabaseAdmin.from('chat_round_threads').select('id, root_message_id').in('round_id', roundIds);
    const ids = (th ?? []).map((t) => t.id as string);
    const roots = (th ?? []).map((t) => t.root_message_id as string);
    const { data: bodies } = roots.length ? await supabaseAdmin.from('chat_messages').select('body').in('id', roots) : { data: [] };
    const { data: mem } = ids.length ? await supabaseAdmin.from('chat_round_thread_members').select('display_name').in('thread_id', ids) : { data: [] };
    return JSON.stringify({ bodies, mem });
  }
  async function nextRoundNo(): Promise<number> {
    const { data } = await supabaseAdmin.from('event_rounds').select('round_no').eq('event_id', event.id).order('round_no', { ascending: false }).limit(1);
    return ((data ?? [])[0]?.round_no as number | undefined ?? 0) + 1;
  }
  const running: Sess[] = [];
  async function barrierSession(key: number): Promise<Sess> {
    const c = psql(`SET application_name = 'p1592_barrier'; SELECT pg_advisory_lock(${key}); SELECT 'C_HELD'; SELECT pg_sleep(900);`);
    running.push(c);
    await c.seen('C_HELD');
    return c;
  }
  async function dropBarriers() {
    await runSql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'p1592_barrier';`);
  }

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1592I Host' });
    event = await createTestEvent(host.user.id, new Date(), { title: `P1592I Event ${RUN}` });
    const { data: r, error } = await supabaseAdmin.from('transcribe_rooms').insert({ code: `P1592I${RUN}R`, event_id: event.id }).select('id').single();
    expect(error, `room: ${error?.message}`).toBeNull();
    roomId = r!.id;
    await addPerson('x1', 'Xena Erased');
    await addPerson('y1', 'Yuri Staying');
    await addPerson('x2', 'Xavi Erased');
    await addPerson('y2', 'Yara Staying');
    await addPerson('x3', 'Xia Erased');
    await addPerson('y3', 'Yves Staying');
    await addPerson('z4', 'Zoe Erased');      // never seated: her lines go to the Outside rounds thread
    await addPerson('y4', 'Yan Staying');      // never seated either; control that the probe sees a line that stays
    hostC = await signIn(host);
    const { data: sw, error: swErr } = await supabaseAdmin.from('transcribe_channel_posting').select('enabled').eq('singleton', true).maybeSingle();
    expect(swErr, `posting switch: ${swErr?.message}`).toBeNull();
    postingWasEnabled = sw?.enabled ?? false;            // no row reads as off (the default), so restore to off
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: true }).eq('singleton', true);
    await supabaseAdmin.from('transcribe_channel_posting').update({ enabled_at: new Date(Date.now() - 24 * 3600_000).toISOString() }).eq('singleton', true); // jobs need a window after switch-on
  });

  test.afterAll(async () => {
    try { await dropBarriers(); } catch { /* best effort */ }
    for (const s of running) { try { s.proc.kill(); } catch { /* gone */ } }
    // the switch is shared by every test against TEST: put back what was there
    if (postingWasEnabled !== null) {
      try { await supabaseAdmin.from('transcribe_channel_posting').update({ enabled: postingWasEnabled }).eq('singleton', true); } catch { /* keep cleaning up */ }
    }
    await supabaseAdmin.from('transcribe_rooms').delete().eq('id', roomId);
    if (sessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessionIds);
    if (event?.id) await deleteTestEvent(event.id);
    for (const u of [host, ...Object.values(users)]) { if (u?.user?.id) { try { await deleteTestUser(u.user.id); } catch { /* ignore */ } } }
  });

  test('erasure in progress while the host seats the person at a table whose thread does not exist yet, then a tablemate speaks', async () => {
    const n = await nextRoundNo();
    const round = await ok<string>(hostC.client.rpc('host_start_round', {
      p_event_id: event.id, p_round_no: n, p_group_size: 2, p_seats: [seat('y1', 1, 'first'), seat('x1', 2, 'first')],
    }), 'start round (host seat case)');
    const job = await mkJob({ round, table: 1 });
    const barrier = await barrierSession(BARRIER_ERASE);
    // E: erasure of x1 left open before COMMIT
    const E = psql(eraseMy('x1', 'p1592_E1', BARRIER_ERASE));
    running.push(E);
    await E.seen('E_READY');
    // H: the host moves x1 to y1's table (no thread there yet) while E is open
    const H = psql(`BEGIN; SELECT set_config('request.jwt.claims', '{"sub":"${host.user.id}","role":"authenticated"}', true); `
      + `SELECT public.host_set_round_seats('${round}', '[{"m":"${room.x1}","t":1,"r":"second"},{"m":"${room.y1}","t":1,"r":"first"}]'::jsonb); COMMIT; SELECT 'H_DONE';`);
    running.push(H);
    await H.seen('H_DONE');
    // P: y1's first line creates the thread at table 1 while E is still open
    const P = psql(`${post(job, 'y1', 'first line at table one')} SELECT 'P_DONE';`);
    running.push(P);
    await P.seen('P_DONE');
    expect(E.out).not.toContain('E_DONE');                   // the erasure really was still open for H and P
    barrier.proc.kill();
    await dropBarriers();
    await E.seen('E_DONE');
    const seen = await namesOnThreads([round]);
    expect(seen).toContain('Yuri');                           // control: the probe finds a name that is there
    expect(seen, `a thread still names the erased person: ${seen}`).not.toContain('Xena');
  });

  // The open poster holds the erased person's erasing marker SHARED (it won the roster try-lock), so the erasure
  // blocks on that marker, before it ever reaches a thread lock. What this pins is the outcome: an erasure that
  // starts while a first line naming the person is open waits for it, then finds and cleans the new thread.
  test('a tablemate\'s first line naming the person is open when the erasure starts: the erasure waits for it and cleans the new thread', async () => {
    const n = await nextRoundNo();
    const round = await ok<string>(hostC.client.rpc('host_start_round', {
      p_event_id: event.id, p_round_no: n, p_group_size: 2, p_seats: [seat('y2', 1, 'first'), seat('x2', 1, 'second')],
    }), 'start round (poster-first case)');
    const job = await mkJob({ round, table: 1 });
    const barrier = await barrierSession(BARRIER_POST);
    const P = psql(`BEGIN; ${post(job, 'y2', 'poster opens the thread')} SELECT 'P_HELD'; SELECT pg_advisory_lock(${BARRIER_POST}); COMMIT; SELECT 'P_DONE';`);
    running.push(P);
    await P.seen('P_HELD');
    const E = psql(eraseMy('x2', 'p1592_E2'));
    running.push(E);
    await E.seen('E_START');
    const blocked = await waitBlocked('p1592_E2');           // the erasure is provably waiting on the open poster
    expect(E.out).not.toContain('E_DONE');
    barrier.proc.kill();
    await dropBarriers();
    await P.seen('P_DONE');
    await E.seen('E_DONE');
    const seen = await namesOnThreads([round]);
    expect(seen).toContain('Yara');
    expect(seen, `a thread still names the erased person: ${seen}`).not.toContain('Xavi');
    expect(blocked, 'the erasure never blocked on the open poster, so the overlap was not pinned').toBe(true);
  });
  // The destination table's thread ALREADY exists, so the seating trigger has something to join. The REAL
  // erase_my_account is paused after it collected and retitled (erase_chat_data_for) and before it deletes the
  // profile, by a row lock on the person's terms_acceptances row, which its next step deletes. In that window
  // the person is still readable, so without the trigger's erasing-marker check the seat would add them to the
  // thread and retitle it with their name; the profile delete then cascades the member row away but nothing
  // rebuilds the title, and the erasure never visits that table.
  test('erasure in progress (after collection, before the profile delete) while the host seats the person at a table whose thread already exists', async () => {
    const n = await nextRoundNo();
    const round = await ok<string>(hostC.client.rpc('host_start_round', {
      p_event_id: event.id, p_round_no: n, p_group_size: 2, p_seats: [seat('y3', 1, 'first'), seat('x3', 2, 'first')],
    }), 'start round (existing thread case)');
    await runSql(post(await mkJob({ round, table: 1 }), 'y3', 'opens the table one thread'));   // committed thread at table 1
    const { error: tErr } = await supabaseAdmin.from('terms_acceptances').insert({ user_id: users.x3.user.id, terms_version: `p1592-${RUN}` });
    expect(tErr, `terms row: ${tErr?.message}`).toBeNull();
    const pause = psql(`SET application_name = 'p1592_barrier'; BEGIN; SELECT 1 FROM public.terms_acceptances WHERE user_id = '${users.x3.user.id}' FOR UPDATE; SELECT 'C_HELD'; SELECT pg_sleep(900);`);
    running.push(pause);
    await pause.seen('C_HELD');
    const E = psql(eraseMy('x3', 'p1592_E3'));
    running.push(E);
    await E.seen('E_START');
    const blocked = await waitBlocked('p1592_E3');            // provably parked on the terms row, mid-erasure
    const H = psql(`BEGIN; SELECT set_config('request.jwt.claims', '{"sub":"${host.user.id}","role":"authenticated"}', true); `
      + `SELECT public.host_set_round_seats('${round}', '[{"m":"${room.x3}","t":1,"r":"second"},{"m":"${room.y3}","t":1,"r":"first"}]'::jsonb); COMMIT; SELECT 'H_DONE';`);
    running.push(H);
    await H.seen('H_DONE');
    expect(E.out).not.toContain('E_DONE');
    pause.proc.kill();
    await dropBarriers();
    await E.seen('E_DONE');
    const seen = await namesOnThreads([round]);
    expect(seen).toContain('Yves');                           // control: the thread exists and names the tablemate
    expect(seen, `a thread still names the erased person: ${seen}`).not.toContain('Xia');
    expect(blocked, 'the erasure never parked mid-way, so the window was not pinned').toBe(true);
  });

  // An UNSEATED speaker's line goes into the event channel's one outside-rounds thread per place (here "Before round 1"). That path takes the
  // speaker lock and then the channel's outside lock, and erasure deliberately takes only the erasing marker and the
  // speaker lock (never the outside lock), so the poster is opened and parked here exactly as in the second test:
  // the erasure must wait for the open poster on the speaker lock, then scrub the line it committed. What this pins
  // is the outcome: nothing in the channel is authored by the erased person or carries their words, the thread root
  // is untouched, and a line from another unseated person in the same thread stays (control).
  test('an unseated speaker\'s line into the Outside rounds thread is open when the erasure starts: the erasure waits, then scrubs the line; the root stays', async () => {
    const zoeWords = `zoe outside words ${RUN}`;
    const yanWords = `yan stays visible ${RUN}`;
    const outsideJob = await mkJob('room');
    const barrier = await barrierSession(BARRIER_POST);
    const P = psql(`BEGIN; ${post(outsideJob, 'z4', zoeWords)} SELECT 'P_HELD'; SELECT pg_advisory_lock(${BARRIER_POST}); COMMIT; SELECT 'P_DONE';`);
    running.push(P);
    await P.seen('P_HELD');
    const E = psql(eraseMy('z4', 'p1592_E4'));
    running.push(E);
    await E.seen('E_START');
    const blocked = await waitBlocked('p1592_E4');           // the erasure is provably waiting on the open poster
    expect(E.out).not.toContain('E_DONE');
    barrier.proc.kill();
    await dropBarriers();
    await P.seen('P_DONE', 120_000);                         // no deadlock: both sessions finish
    await E.seen('E_DONE', 120_000);
    await runSql(post(outsideJob, 'y4', yanWords));                      // another unseated person speaks after the erasure

    const { data: conv, error: cErr } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'event').eq('event_id', event.id).single();
    expect(cErr, `event channel: ${cErr?.message}`).toBeNull();
    const { data: link, error: lErr } = await supabaseAdmin.from('chat_outside_round_threads').select('root_message_id').eq('conversation_id', conv!.id).single();
    expect(lErr, `outside thread link: ${lErr?.message}`).toBeNull();
    const { data: all, error: aErr } = await supabaseAdmin.from('chat_messages')
      .select('id, author_id, body, deleted_at, system_kind, thread_root_id').eq('conversation_id', conv!.id);
    expect(aErr, `messages: ${aErr?.message}`).toBeNull();
    const rows = all ?? [];
    const root = rows.find((m) => m.id === link!.root_message_id);
    expect(root?.body, 'the outside-rounds root must be untouched by the erasure').toBe('Before round 1')   // a small chunk_ms reads as said before round 1;
    expect(root?.system_kind).toBe('outside_rounds');
    expect(root?.deleted_at ?? null).toBeNull();
    expect(rows.filter((m) => m.author_id === users.z4.user.id), 'a message is still authored by the erased person').toEqual([]);
    expect(JSON.stringify(rows), 'the erased person\'s words survive in the channel').not.toContain(zoeWords);
    // CONTROLS: the probe sees a line that is there, and the erased line really was posted and then scrubbed
    expect(JSON.stringify(rows)).toContain(yanWords);
    const scrubbed = rows.filter((m) => m.thread_root_id === link!.root_message_id && m.author_id === null && m.body === null && m.deleted_at !== null);
    expect(scrubbed.length, 'the open poster never committed a line, so the interleaving was not pinned').toBeGreaterThanOrEqual(1);
    expect(blocked, 'the erasure never blocked on the open poster, so the overlap was not pinned').toBe(true);
  });
});
