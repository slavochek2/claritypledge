/**
 * @file p1529-db-schema.spec.ts
 * @description P1529 integration canary for the 20261105* migrations on the self-hosted TEST database (TEST only: every call goes
 * through assertSelfHostedTest). Two clients, as the repo's migration template asks: the service role for ground truth and for what a
 * client cannot write, and each person's own signed-in client for every refusal. Covers: make_my_next_version's refusals and its
 * happy path; _canvas_run_is_round_update (true for the tap's run, true for a retry with the same trigger, false for an owner's later
 * message, service role only); get_my_round_canvas (nothing for someone not seated, no canvas name once unshared);
 * get_my_next_version_offer's states; the terms pin (consume_pending_terms_acceptance records v1.8 only).
 *
 * No model call is made: runs are only queued (their state is moved by the service role where a test needs it).
 * Run: npx playwright test --project=integration e2e/integration/p1529-db-schema.spec.ts --workers=1
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestEvent } from '../helpers/test-event';
import {
  assertSelfHostedTest, newLedger, makeUser, makeEvent, publishCanvas, register, shareForEvent, joinRoom, makeTranscribeRoom, keepRoomOpen,
  postRoundLines, completeJobEmpty, fixtureLines, savedSeats, cleanup, leftovers, type Person, type Ledger,
} from '../helpers/p1529-mastermind';

test.describe.configure({ mode: 'serial', timeout: 300_000, retries: 0 });

const ledger: Ledger = newLedger();
const stoppers: Array<() => void> = [];
const BOXES = ['canvas:segments', 'canvas:problem', 'canvas:solution', 'canvas:channels', 'canvas:revenue', 'canvas:metrics', 'canvas:love', 'canvas:good-at', 'canvas:world-needs'];

let host: Person, X: Person, Y: Person, Z: Person;
let E: Awaited<ReturnType<typeof makeEvent>>;
let room = '';
let round1 = '', round3 = '';

const seat = (p: Person, t: number, r: 'first' | 'second' | 'observer') => ({ m: p.room.get(E.id)!, t, r });
async function startRound(no: number, seats: ReturnType<typeof seat>[]): Promise<string> {
  const { data, error } = await host.client.rpc('host_start_round', { p_event_id: E.id, p_round_no: no, p_group_size: 3, p_seats: seats });
  if (error) throw new Error(`host_start_round ${no}: ${error.message}`);
  return data as string;
}
const tap = (p: Person, round: string) => p.client.rpc('make_my_next_version', { p_round: round });
const offer = async (p: Person) => (await p.client.rpc('get_my_next_version_offer', { p_event: E.id })).data as { state: string; round_id?: string };

test.beforeAll(async () => {
  assertSelfHostedTest(); // here, not at load: a load-time throw breaks `playwright --list` for every other environment
  test.setTimeout(600_000);
  host = await makeUser(ledger, 'Hana Qadb');
  X = await makeUser(ledger, 'Xan Qadb');
  Y = await makeUser(ledger, 'Yul Qadb');
  Z = await makeUser(ledger, 'Zed Qadb');
  await publishCanvas(ledger, X, 'Xan canvas');
  await publishCanvas(ledger, Y, 'Yul canvas');
  E = await makeEvent(ledger, host.user, `P1529 QA db schema ${randomUUID().slice(0, 4)}`, { startsInMs: 0 });
  room = await makeTranscribeRoom(ledger, E);
  stoppers.push(await keepRoomOpen(ledger, host.user, room));
  for (const p of [X, Y, Z]) await register(p, E.slug, p === Z ? 'observer' : 'canvas_before', 'usbc');
  for (const p of [X, Y, Z]) await joinRoom(ledger, p, E, { transcribeRoom: room });
  expect((await shareForEvent(X, E.id)).status).toBe('ok');
  expect((await shareForEvent(Y, E.id)).status).toBe('ok');
});

test.afterAll(async () => {
  test.setTimeout(600_000);
  for (const s of stoppers) s();
  const report = await cleanup(ledger);
  const left = await leftovers(ledger);
  console.log(`[P1529 db] cleanup ${JSON.stringify(report)} leftovers ${JSON.stringify(left)}`);
  expect(Object.values(left).every((n) => n === 0), `leftover rows: ${JSON.stringify(left)}`).toBe(true);
});

test('migration objects exist and are not client-callable where they must not be', async () => {
  const nobody = randomUUID();
  const calls: Array<[string, Record<string, unknown>]> = [
    ['make_my_next_version', { p_round: nobody }],
    ['get_my_next_version_offer', { p_event: nobody }],
    ['get_my_round_canvas', { p_round: nobody }],
    ['register_for_event', { p_slug: 'p1529-no-such-event', p_participation: 'observer', p_observer_prep: 'home', p_phone: 'usbc', p_hope: null, p_recording_accepted: true }],
    ['host_set_event_flow', { p_event: nobody, p_flow: 'clarity-night' }],
    ['host_set_observer', { p_event: nobody, p_profile: nobody, p_is_observer: true }],
    ['get_mastermind_host_state', { p_event: nobody }],
    ['get_my_update_state', { p_event: nobody }],
    ['record_event_canvas_open', { p_round: nobody, p_owner: nobody }],
  ];
  for (const [fn, args] of calls) {
    const r = await supabaseAdmin.rpc(fn, args as never);
    // with the right arguments a missing function is the only way to get PGRST202; any other answer (an auth refusal, null) means it exists
    expect(r.error?.code, `${fn} is registered`).not.toBe('PGRST202');
  }
  // _canvas_run_is_round_update is service-role only
  const anon = await X.client.rpc('_canvas_run_is_round_update', { p_run: randomUUID() });
  expect(anon.error, 'a signed-in client may not call _canvas_run_is_round_update').not.toBeNull();
  const svc = await supabaseAdmin.rpc('_canvas_run_is_round_update', { p_run: randomUUID() });
  expect(svc.error).toBeNull();
  expect(svc.data, 'an unknown run is not a round update').toBe(false);
});

test('round 1: make_my_next_version refusals while the round runs and for the wrong person', async () => {
  round1 = await startRound(1, [seat(X, 1, 'first'), seat(Y, 1, 'second')]);
  const viaPartner = await tap(Y, round1);
  expect(viaPartner.error?.code).toBe('42501');
  expect(viaPartner.error?.message).toMatch(/only this round's Clarity Canvas owner/);
  const viaOutsider = await tap(Z, round1);
  expect(viaOutsider.error?.code, 'someone not seated').toBe('42501');
  const running = await tap(X, round1);
  expect(running.error).toBeNull();
  expect(running.data).toMatchObject({ status: 'refused', code: 'round_still_on' });
  expect(await offer(X)).toMatchObject({ state: 'round_on' });
  expect((await offer(Y)).state, 'a partner is offered nothing').toBe('none');
  const owned = await supabaseAdmin.from('event_next_version_taps').select('*', { count: 'exact', head: true }).eq('round_id', round1);
  expect(owned.count, 'refusals write nothing').toBe(0);
});

test('get_my_round_canvas: nothing for someone not seated; the canvas name only while shared', async () => {
  const outsider = await Z.client.rpc('get_my_round_canvas', { p_round: round1 });
  expect(outsider.error).toBeNull();
  expect(outsider.data, 'Z is not seated: nothing').toBeNull();
  const partner = await Y.client.rpc('get_my_round_canvas', { p_round: round1 });
  expect(partner.data).toMatchObject({ owner_profile_id: X.user.user.id, shared: true, canvas_name: X.canvasName });
  const anon = await supabaseAdmin.rpc('get_my_round_canvas', { p_round: round1 });
  expect(anon.data, 'no signed-in caller: nothing').toBeNull();
  // the owner stops sharing: the partner still gets the owner, but no canvas name
  const un = await X.client.rpc('unshare_canvas', { p_name: X.canvasName, p_kind: 'event', p_target: E.id });
  expect(un.error, `unshare: ${un.error?.message}`).toBeNull();
  const after = await Y.client.rpc('get_my_round_canvas', { p_round: round1 });
  expect(after.data).toMatchObject({ owner_profile_id: X.user.user.id, shared: false, canvas_name: null });
  // after round 1 the event's own tap refuses to put it back (the selection is fixed once round 1 started): observed behaviour, recorded
  expect(await shareForEvent(X, E.id)).toMatchObject({ status: 'refused', code: 'fixed_after_round_1' });
  // the owner re-shares through P1515's own share_canvas, which is what the canvas page offers
  const re = await X.client.rpc('share_canvas', { p_name: X.canvasName, p_kind: 'event', p_target: E.id });
  expect(re.error, `share_canvas: ${re.error?.message}`).toBeNull();
  const back = await Y.client.rpc('get_my_round_canvas', { p_round: round1 });
  expect(back.data).toMatchObject({ shared: true, canvas_name: X.canvasName });
});

test('round 2 ends round 1: the offer follows the clean job (transcript_pending, no_recording, offer); a tap starts a run', async () => {
  await startRound(2, [seat(Y, 1, 'first'), seat(X, 1, 'second')]);
  const job = await supabaseAdmin.from('transcribe_round_clean_jobs').select('id, status').eq('round_id', round1).eq('table_no', 1).single();
  expect(job.data, 'the cut made a clean job for table 1').not.toBeNull();
  // the cleaner's own worker may claim a pending job; hold it in 'pending' for a deterministic read
  await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'pending', not_before: new Date(Date.now() + 3_600_000).toISOString() }).eq('id', job.data!.id);
  expect(await offer(X)).toMatchObject({ state: 'transcript_pending', round_id: round1 });
  const pending = await tap(X, round1);
  expect(pending.data).toMatchObject({ status: 'transcript_pending' });
  await completeJobEmpty(round1, 1);
  expect(await offer(X)).toMatchObject({ state: 'no_recording' });
  expect((await tap(X, round1)).data).toMatchObject({ status: 'no_recording' });
  const none = await supabaseAdmin.from('event_next_version_taps').select('*', { count: 'exact', head: true }).eq('round_id', round1);
  expect(none.count).toBe(0);
  // lines arrive (the cleaner's post), the job completes
  await supabaseAdmin.from('transcribe_round_clean_jobs').update({ status: 'processing' }).eq('id', job.data!.id);
  const n = await postRoundLines(round1, 1, { owner: X.tmember.get(E.id)!, partner: Y.tmember.get(E.id)! }, fixtureLines(40));
  expect(n).toBeGreaterThan(0);
  expect(await offer(X)).toMatchObject({ state: 'offer', round_id: round1 });
  const started = await tap(X, round1);
  expect(started.error).toBeNull();
  expect(started.data).toMatchObject({ status: 'ok' });
  expect(started.data.draft_id).toBeTruthy();
  const draftId = started.data.draft_id as string;
  const runs = await supabaseAdmin.from('canvas_draft_runs').select('id, state, trigger_message_id').eq('draft_id', draftId);
  expect(runs.data).toHaveLength(1);
  expect(runs.data![0].state).toBe('queued');
  // copies: owner-authored forwards in the draft's thread, one per posted line, original authors carried
  const d = (await supabaseAdmin.from('canvas_drafts').select('conversation_id, thread_root_id').eq('id', draftId).single()).data!;
  const { data: copies } = await supabaseAdmin.from('chat_messages').select('author_id, forward_author_id').eq('conversation_id', d.conversation_id).eq('thread_root_id', d.thread_root_id).eq('kind', 'forward');
  expect(copies!.length).toBe(n);
  expect(new Set(copies!.map((c) => c.author_id))).toEqual(new Set([X.user.user.id]));
  expect(new Set(copies!.map((c) => c.forward_author_id))).toEqual(new Set([X.user.user.id, Y.user.user.id]));
  // the one message the tap sends in the owner's name
  const { data: ownerMsgs } = await supabaseAdmin.from('chat_messages').select('body').eq('conversation_id', d.conversation_id).eq('thread_root_id', d.thread_root_id).eq('author_id', X.user.user.id).eq('kind', 'message');
  expect(ownerMsgs!.map((m) => m.body)).toEqual(['Update my canvas from what was said in Round 1.']);
  // a repeat tap while that draft is open is that run, nothing new
  const again = await tap(X, round1);
  expect(again.data).toMatchObject({ status: 'started', repeat: true, draft_id: draftId });
  expect((await offer(X)).state).toBe('started');
  expect((await supabaseAdmin.from('canvas_draft_runs').select('id').eq('draft_id', draftId)).data).toHaveLength(1);
  (globalThis as Record<string, unknown>).p1529 = { draftId, tapRun: runs.data![0].id as string, trigger: runs.data![0].trigger_message_id as string };
});

test('_canvas_run_is_round_update: true for the tap\'s run, true for a retry with the same trigger, false for an owner\'s later message', async () => {
  const { draftId, tapRun, trigger } = (globalThis as Record<string, unknown>).p1529 as { draftId: string; tapRun: string; trigger: string };
  const mode = async (run: string) => (await supabaseAdmin.rpc('_canvas_run_is_round_update', { p_run: run })).data as boolean;
  expect(await mode(tapRun), 'the tap\'s own run').toBe(true);
  // fail the tap's run (service role), retry through the owner's own RPC
  await supabaseAdmin.from('canvas_draft_runs').update({ state: 'failed', error_code: 'QA_FORCED', finished_at: new Date().toISOString() }).eq('id', tapRun);
  const rev = (await supabaseAdmin.from('canvas_drafts').select('revision').eq('id', draftId).single()).data!.revision as number;
  const retry = await X.client.rpc('canvas_draft_retry', { p_draft: draftId, p_failed_run: tapRun, p_expected_revision: rev, p_client_id: randomUUID() });
  expect(retry.error, `retry: ${retry.error?.message}`).toBeNull();
  const runs = (await supabaseAdmin.from('canvas_draft_runs').select('id, trigger_message_id, client_id').eq('draft_id', draftId).order('created_at')).data!;
  expect(runs).toHaveLength(2);
  const retryRun = runs[1];
  expect(retryRun.trigger_message_id, 'a retry keeps the failed run\'s trigger message').toBe(trigger);
  expect(retryRun.id).not.toBe(tapRun);
  expect(await mode(retryRun.id as string), 'the retry with the same trigger').toBe(true);
  // the owner's later message on the same draft keeps the strict rule
  await supabaseAdmin.from('canvas_draft_runs').update({ state: 'done', finished_at: new Date().toISOString() }).eq('id', retryRun.id);
  const d = (await supabaseAdmin.from('canvas_drafts').select('canvas_id, revision').eq('id', draftId).single()).data!;
  const later = await X.client.rpc('canvas_workspace_send', {
    p_canvas: d.canvas_id, p_from_version: null, p_expected_draft: draftId, p_expected_revision: d.revision, p_replace: false,
    p_body: 'A later message from me, not the round update.', p_box_refs: BOXES, p_attachment: null, p_client_id: randomUUID(),
  });
  expect(later.error, `later message: ${later.error?.message}`).toBeNull();
  const all = (await supabaseAdmin.from('canvas_draft_runs').select('id, trigger_message_id').eq('draft_id', draftId).order('created_at')).data!;
  expect(all).toHaveLength(3);
  expect(all[2].trigger_message_id).not.toBe(trigger);
  expect(await mode(all[2].id as string), 'an owner\'s later message').toBe(false);
  expect(await mode(retryRun.id as string), 'and the retry is still a round update').toBe(true);
  // close the draft and its run so the next steps start clean
  await supabaseAdmin.from('canvas_draft_runs').update({ state: 'failed', error_code: 'QA_FORCED', finished_at: new Date().toISOString() }).eq('id', all[2].id).in('state', ['queued', 'running']);
  const rev2 = (await supabaseAdmin.from('canvas_drafts').select('revision').eq('id', draftId).single()).data!.revision as number;
  const disc = await X.client.rpc('canvas_draft_discard', { p_draft: draftId, p_expected_revision: rev2 });
  expect(disc.error, `discard: ${disc.error?.message}`).toBeNull();
});

test('offer: draft_open when the owner has another draft of the canvas open; the tap refuses it and writes nothing', async () => {
  const latest = (await supabaseAdmin.from('canvas_versions').select('id').eq('canvas_id', X.canvasId!).not('published_seq', 'is', null).order('published_seq', { ascending: false }).limit(1).single()).data!;
  const open = await X.client.rpc('canvas_draft_open', { p_from_version: latest.id });
  expect(open.error, `own draft: ${open.error?.message}`).toBeNull();
  expect(await offer(X)).toMatchObject({ state: 'draft_open', round_id: round1 });
  const refused = await tap(X, round1);
  expect(refused.data).toMatchObject({ status: 'refused', code: 'draft_already_open' });
  const draft = (await supabaseAdmin.from('canvas_drafts').select('id, revision').eq('owner_id', X.user.user.id).eq('state', 'open').single()).data!;
  const dd = await X.client.rpc('canvas_draft_discard', { p_draft: draft.id, p_expected_revision: draft.revision });
  expect(dd.error, `discard: ${dd.error?.message}`).toBeNull();
  expect((await offer(X)).state).toBe('offer');
});

test('round 3: when the owner owns again the earlier round is closed; a showcase round is refused; a Clarity Night event has no next version', async () => {
  round3 = await startRound(3, [seat(X, 1, 'first'), seat(Y, 1, 'second')]);
  const closed = await tap(X, round1);
  expect(closed.data).toMatchObject({ status: 'refused', code: 'next_owning_round_started' });
  expect(await offer(X)).toMatchObject({ state: 'round_on', round_id: round3 });
  // a Demo round
  await supabaseAdmin.from('event_rounds').update({ showcase: true }).eq('id', round1);
  expect((await tap(X, round1)).data).toMatchObject({ status: 'refused', code: 'demo_round' });
  await supabaseAdmin.from('event_rounds').update({ showcase: false }).eq('id', round1);
  // Clarity Night: the function refuses by flow (22023), whoever is seated first
  const CN = await createTestEvent(host.user.user.id, new Date(), { title: `P1529 QA db CN ${randomUUID().slice(0, 4)}` });
  ledger.events.push(CN);
  const cnPeople: Person[] = [X, Y];
  for (const p of cnPeople) {
    const m = await (await import('../helpers/p1529-mastermind')).seedRoomMember(CN.id, { displayName: p.user.name, profileId: p.user.user.id, optedIn: true, comprehensionRating: 7 });
    p.room.set(CN.id, m.id);
  }
  const r = await host.client.rpc('host_start_round', { p_event_id: CN.id, p_round_no: 1, p_group_size: 3, p_seats: [{ m: X.room.get(CN.id), t: 1, r: 'first' }, { m: Y.room.get(CN.id), t: 1, r: 'second' }] });
  expect(r.error, `CN round: ${r.error?.message}`).toBeNull();
  const nope = await tap(X, r.data as string);
  expect(nope.error?.code).toBe('22023');
  expect(nope.error?.message).toMatch(/no next version/);
  const cnOffer = await X.client.rpc('get_my_next_version_offer', { p_event: CN.id });
  expect(cnOffer.data).toMatchObject({ state: 'none' });
  const seats = await savedSeats(E.id);
  expect(seats.filter((s) => s.role === 'first').map((s) => s.round_no).sort()).toEqual([1, 2, 3]);
});

test('seat guard: an unregistered room member cannot be seated in a mastermind event, and the refusal names them; Clarity Night is unchanged', async () => {
  const SG = await makeEvent(ledger, host.user, `P1529 QA db seat guard ${randomUUID().slice(0, 4)}`, { startsInMs: 0 });
  const sgRoom = await makeTranscribeRoom(ledger, SG);
  stoppers.push(await keepRoomOpen(ledger, host.user, sgRoom));
  await register(X, SG.slug); await register(Y, SG.slug);   // registered properly
  for (const p of [X, Y, Z]) await joinRoom(ledger, p, SG, { transcribeRoom: sgRoom });   // Z is in the room, not registered
  expect((await shareForEvent(X, SG.id)).status).toBe('ok');
  const seat = (p: Person, t: number, r: string) => ({ m: p.room.get(SG.id), t, r });
  const refused = await host.client.rpc('host_start_round', { p_event_id: SG.id, p_round_no: 1, p_group_size: 3, p_seats: [seat(X, 1, 'first'), seat(Z, 1, 'second')] });
  expect(refused.error?.code).toBe('22023');
  expect(refused.error?.message).toMatch(/not registered for this event/);
  expect(refused.error?.details, 'the refusal names the person').toContain(Z.user.name);
  expect((await supabaseAdmin.from('event_rounds').select('*', { count: 'exact', head: true }).eq('event_id', SG.id)).count, 'nothing written').toBe(0);
  // control: the same seating with the registered person works
  const ok = await host.client.rpc('host_start_round', { p_event_id: SG.id, p_round_no: 1, p_group_size: 3, p_seats: [seat(X, 1, 'first'), seat(Y, 1, 'second')] });
  expect(ok.error, `registered seating: ${ok.error?.message}`).toBeNull();
  // the host's own room seat is exempt (the host is never registered as an attendee)
  // and once Z registers, Z can be seated in the next round
  await register(Z, SG.slug);
  const r2 = await host.client.rpc('host_start_round', { p_event_id: SG.id, p_round_no: 2, p_group_size: 3, p_seats: [seat(X, 1, 'first'), seat(Z, 1, 'second')] });
  expect(r2.error, `after registering: ${r2.error?.message}`).toBeNull();
});

test('waiting list: only when full; not a seat; once; the host reads it in order; others cannot; leaving', async () => {
  const W = await makeEvent(ledger, host.user, `P1529 QA db waitlist ${randomUUID().slice(0, 4)}`, { startsInMs: 86_400_000, maxAttendees: 1 });
  const args = { p_participation: 'canvas_before', p_phone: 'usbc', p_hope: null, p_recording_accepted: true };
  expect((await X.client.rpc('join_event_waitlist', { p_slug: W.slug, ...args })).data, 'not full yet').toBe('not_full');
  await register(Y, W.slug);
  expect((await X.client.rpc('join_event_waitlist', { p_slug: W.slug, ...args, p_recording_accepted: false })).error?.message).toMatch(/accepting transcription/);
  expect((await X.client.rpc('join_event_waitlist', { p_slug: W.slug, p_participation: 'observer', p_phone: 'usbc', p_hope: null, p_recording_accepted: true })).error?.message, 'an observer needs the second answer').toMatch(/choose where you will prepare/);
  expect((await X.client.rpc('join_event_waitlist', { p_slug: W.slug, ...args })).data).toBe('ok');
  expect((await X.client.rpc('join_event_waitlist', { p_slug: W.slug, ...args })).data, 'a second tap').toBe('already');
  expect((await Z.client.rpc('join_event_waitlist', { p_slug: W.slug, ...args })).data).toBe('ok');
  expect((await Y.client.rpc('join_event_waitlist', { p_slug: W.slug, ...args })).data, 'a registered person').toBe('registered');
  expect((await supabaseAdmin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', W.id)).count, 'joining is not a seat').toBe(1);
  const list = await host.client.rpc('get_event_waitlist', { p_event: W.id });
  expect((list.data as Array<{ name: string }>).map((r) => r.name)).toEqual([X.user.name, Z.user.name]);
  expect((await X.client.rpc('get_event_waitlist', { p_event: W.id })).error?.code, 'only the host reads the list').toBe('42501');
  const own = await X.client.from('event_waitlist').select('profile_id').eq('event_id', W.id);
  expect(own.data!.map((r) => r.profile_id), 'a person reads only their own row').toEqual([X.user.user.id]);
  expect((await X.client.rpc('leave_event_waitlist', { p_slug: W.slug })).error).toBeNull();
  const after = await host.client.rpc('get_event_waitlist', { p_event: W.id });
  expect((after.data as Array<{ name: string }>).map((r) => r.name)).toEqual([Z.user.name]);
  // a place opens and the person on the list registers: they leave the list by registering
  await supabaseAdmin.from('events').update({ max_attendees: 2 }).eq('id', W.id);
  expect(await register(Z, W.slug)).toBe('ok');
  expect((await supabaseAdmin.from('event_waitlist').select('*', { count: 'exact', head: true }).eq('event_id', W.id)).count, 'registering takes them off the list').toBe(0);
});

test('terms pin: consume_pending_terms_acceptance records v1.8 only (a v1.7 intent is refused and consumed)', async () => {
  const uid = X.user.user.id;
  const setPending = async (version: string, nonce: string) => {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(uid, { app_metadata: { pending_terms: { nonce, version, issued_at: new Date().toISOString() } } });
    expect(error, `app_metadata: ${error?.message}`).toBeNull();
  };
  const accepted = async (v: string) => (await supabaseAdmin.from('terms_acceptances').select('terms_version').eq('user_id', uid).eq('terms_version', v)).data!.length;
  await supabaseAdmin.from('terms_acceptances').delete().eq('user_id', uid).in('terms_version', ['v1.7', 'v1.8']);
  // control: the old version is refused
  const n7 = `${randomUUID()}${randomUUID()}`;
  await setPending('v1.7', n7);
  const old = await X.client.rpc('consume_pending_terms_acceptance', { p_nonce: n7 });
  expect(old.error).toBeNull();
  expect(old.data, 'a v1.7 intent records nothing').toBeNull();
  expect(await accepted('v1.7')).toBe(0);
  expect(await accepted('v1.8')).toBe(0);
  const gone = (await supabaseAdmin.auth.admin.getUserById(uid)).data.user!.app_metadata as Record<string, unknown>;
  expect(gone.pending_terms, 'the refused intent is consumed').toBeUndefined();
  // the current version is recorded
  const n8 = `${randomUUID()}${randomUUID()}`;
  await setPending('v1.8', n8);
  const cur = await X.client.rpc('consume_pending_terms_acceptance', { p_nonce: n8 });
  expect(cur.error).toBeNull();
  expect(cur.data).toBe('v1.8');
  expect(await accepted('v1.8')).toBe(1);
  expect(await accepted('v1.7')).toBe(0);
  // a wrong nonce leaves the intent alone
  const n8b = `${randomUUID()}${randomUUID()}`;
  await setPending('v1.8', n8b);
  const wrong = await X.client.rpc('consume_pending_terms_acceptance', { p_nonce: `${randomUUID()}${randomUUID()}` });
  expect(wrong.data).toBeNull();
  const still = (await supabaseAdmin.auth.admin.getUserById(uid)).data.user!.app_metadata as Record<string, unknown>;
  expect(still.pending_terms).toBeDefined();
});
