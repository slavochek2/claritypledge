/**
 * @file p1576-chat-voice-notes.spec.ts
 * @description DB canary for P1576 Part B (supabase/migrations/20261027120100_p1576_chat_voice_notes.sql).
 *
 * THE INVARIANTS.
 *   1. A voice note is content (has_content), a deleted one is empty (deleted_is_empty), and the two
 *      people of a 1:1 read it while an outsider cannot post, play or fetch it.
 *   2. The storage path is server-only: no client role reads chat_voice_audio, selects an audio_path
 *      column, calls a service-only function, or sees a path in a Realtime payload.
 *   3. Audio never lingers: a message delete, an account erasure and the 30-day retention each remove
 *      the audio row AND queue its object for deletion; the transcript survives retention only.
 *   4. A voice note may live in the owner's mirror, but never as a private @mirror ask or an agent row; a
 *      path that is not derived from (conversation, client id) is refused.
 *   5. Transcription is bounded: three attempts, then failed; a late result never revives a deleted note.
 *
 * EVERY REFUSAL HAS A CONTROL: each refused shape sits next to the same shape succeeding for the caller
 * entitled to it. No bucket is touched: the service-role steps write rows only; the object paths are
 * strings. Gemini is not called.
 *
 * Needs the TEST project (service role + two anon sessions). It is not run by the unit suite:
 *   npx playwright test --project=integration e2e/integration/p1576-chat-voice-notes.spec.ts
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from '../helpers/test-organization';
import { RUN, anonClient, signIn, ok, refused, mirrorOf, adminConversation, myChatIds, purgeChatFor, collect, fireUntil, closeAll, type SignedIn, type Row } from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const created: TestUser[] = [];
const orgs: TestOrganization[] = [];
const convs: string[] = [];
const paths: string[] = [];

async function mk(label: string): Promise<TestUser> {
  const u = await createTestUser({ name: `Vo${label} ${RUN}` });
  created.push(u);
  return u;
}

interface VoiceRow extends Row {
  audio_duration_ms: number | null;
  audio_expired_at: string | null;
  transcript: string | null;
  transcript_status: string | null;
  audio_waveform: number[] | null;
}

/** The edge function's commit step, as the service role: acting AS `uid`. */
async function commit(uid: string, conv: string, over: Record<string, unknown> = {}, durationMs = 4200) {
  const clientId = (over.p_client_id as string | undefined) ?? randomUUID();
  const key = `${conv}/${uid}/${clientId}.wav`;
  const res = await supabaseAdmin.rpc('chat_commit_voice_note', {
    p_uid: uid, p_conversation: conv, p_object_key: key, p_duration_ms: durationMs, p_client_id: clientId, ...over,
  });
  if (!res.error) paths.push(key);
  return { ...res, key, clientId };
}
const commitOk = async (uid: string, conv: string, over: Record<string, unknown> = {}, ms?: number) => {
  const r = await commit(uid, conv, over, ms);
  if (r.error) throw new Error(`commit should have succeeded: ${r.error.message}`);
  return { row: r.data as VoiceRow, key: r.key };
};

const row = async (id: string): Promise<VoiceRow> => {
  const { data, error } = await supabaseAdmin.from('chat_messages').select('*').eq('id', id).single();
  if (error) throw new Error(`row: ${error.message}`);
  return data as VoiceRow;
};
const audioRow = async (id: string) => {
  const { data, error } = await supabaseAdmin.from('chat_voice_audio').select('*').eq('message_id', id).maybeSingle();
  if (error) throw new Error(`audioRow: ${error.message}`);
  return data as { audio_path: string; transcript_attempts: number; transcript_attempted_at: string | null } | null;
};
const queued = async (path: string) => {
  const { data, error } = await supabaseAdmin.from('chat_voice_purge').select('path').eq('path', path);
  if (error) throw new Error(`queued: ${error.message}`);
  return (data ?? []).length === 1;
};
const backdateAttempt = (id: string) =>
  supabaseAdmin.from('chat_voice_audio').update({ transcript_attempted_at: new Date(Date.now() - 3 * 60_000).toISOString() }).eq('message_id', id);
const target = (uid: string, id: string) => supabaseAdmin.rpc('chat_voice_playback_target', { p_uid: uid, p_message: id });

let org: TestOrganization;
let A: TestUser, B: TestUser, C: TestUser, D: TestUser, R: TestUser, T: TestUser, U: TestUser, X: TestUser, P: TestUser, Q: TestUser, W: TestUser, M: TestUser;
let sA: SignedIn, sB: SignedIn, sC: SignedIn, sT: SignedIn, sX: SignedIn, sP: SignedIn, sQ: SignedIn, sW: SignedIn, sM: SignedIn;
let dm: string, dmDB: string, dmRB: string, dmTB: string, dmUB: string, dmXB: string, dmPB: string, dmQB: string, dmWB: string, dmMB: string, mirA: string, mirM: string;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  org = await createTestOrganization({ name: `Voice canary org ${RUN}` });
  orgs.push(org);
  [A, B, C, D, R, T, U, X, P, Q, W, M] = await Promise.all([mk('A'), mk('B'), mk('C'), mk('D'), mk('R'), mk('T'), mk('U'), mk('X'), mk('P'), mk('Q'), mk('W'), mk('M')]);
  for (const u of [A, B, D, R, T, U, X, P, Q, W, M]) await createTestMembership(org.id, u.user.id);
  sA = await signIn(A);
  sB = await signIn(B);
  sC = await signIn(C);
  const sD = await signIn(D);
  const sR = await signIn(R);
  sT = await signIn(T);
  const sU = await signIn(U);
  sX = await signIn(X);
  sP = await signIn(P);
  sQ = await signIn(Q);
  sW = await signIn(W);
  sM = await signIn(M);
  for (const s of [sA, sB, sD, sR, sT, sU, sX, sP, sQ, sW, sM]) await myChatIds(s.client);
  dm = await ok<string>(sA.client.rpc('start_dm', { p_other: B.user.id }), 'A starts dm with B');
  dmDB = await ok<string>(sD.client.rpc('start_dm', { p_other: B.user.id }), 'D starts dm with B');
  dmRB = await ok<string>(sR.client.rpc('start_dm', { p_other: B.user.id }), 'R starts dm with B');
  dmTB = await ok<string>(sT.client.rpc('start_dm', { p_other: B.user.id }), 'T starts dm with B');
  dmUB = await ok<string>(sU.client.rpc('start_dm', { p_other: B.user.id }), 'U starts dm with B');
  dmXB = await ok<string>(sX.client.rpc('start_dm', { p_other: B.user.id }), 'X starts dm with B');
  dmPB = await ok<string>(sP.client.rpc('start_dm', { p_other: B.user.id }), 'P starts dm with B');
  dmQB = await ok<string>(sQ.client.rpc('start_dm', { p_other: B.user.id }), 'Q starts dm with B');
  dmWB = await ok<string>(sW.client.rpc('start_dm', { p_other: B.user.id }), 'W starts dm with B');
  // M only writes in the trigger test: a fresh author, so earlier tests' notes cannot trip the per-minute limit.
  dmMB = await ok<string>(sM.client.rpc('start_dm', { p_other: B.user.id }), 'M starts dm with B');
  convs.push(dm, dmDB, dmRB, dmTB, dmUB, dmXB, dmPB, dmQB, dmWB, dmMB);
  mirA = await mirrorOf(sA);
  mirM = await mirrorOf(sM);
});

test.afterAll(async () => {
  test.setTimeout(240_000);
  await purgeChatFor(created.map((u) => u.user.id), convs);
  if (paths.length) await supabaseAdmin.from('chat_voice_purge').delete().in('path', paths);
  for (const u of created) await deleteTestUser(u.user.id).catch(() => {});
  for (const o of orgs) await deleteTestOrganization(o.id);
});

test('a voice note is content: both people read it, the preview says so, and nobody can read or call the server side', async () => {
  const { row: v, key } = await commitOk(A.user.id, dm);
  expect(v.body, 'a voice note has no text').toBeNull();
  expect(v.audio_duration_ms).toBe(4200);
  expect(v.transcript_status).toBe('pending');
  expect((await audioRow(v.id))?.audio_path, 'the path is the derived one').toBe(key);

  // CONTROL: both members read the row over REST, with the audio state and no path.
  for (const [who, s] of [['A', sA], ['B', sB]] as const) {
    const { data, error } = await s.client.from('chat_messages')
      .select('id, audio_duration_ms, audio_expired_at, transcript, transcript_status').eq('id', v.id);
    expect(error, `${who} reads the row`).toBeNull();
    expect(data?.[0]).toMatchObject({ id: v.id, audio_duration_ms: 4200, transcript_status: 'pending' });
  }
  // the outsider reads nothing
  const outsider = await sC.client.from('chat_messages').select('id').eq('id', v.id);
  expect(outsider.data ?? []).toEqual([]);

  // the chat list previews it
  const chats = await ok<Array<{ conversation_id: string; last_body: string | null }>>(sB.client.rpc('get_my_chats'), 'get_my_chats');
  expect(chats.find((c) => c.conversation_id === dm)?.last_body).toBe('Voice message');

  // the path is not a column, and the storage table is closed to every client role
  expect((await sA.client.from('chat_messages').select('audio_path').eq('id', v.id)).error, 'no audio_path column').not.toBeNull();
  for (const [who, c] of [['A', sA.client], ['B', sB.client], ['anon', anonClient()]] as const) {
    const t = await c.from('chat_voice_audio').select('audio_path');
    expect(t.error !== null || (t.data ?? []).length === 0, `${who} reads no storage path`).toBe(true);
    const q = await c.from('chat_voice_purge').select('path');
    expect(q.error !== null || (q.data ?? []).length === 0, `${who} reads no purge queue`).toBe(true);
  }
  // service-only functions are closed to signed-in and anonymous clients, with a working call as control
  const calls: Array<[string, Record<string, unknown>]> = [
    ['chat_commit_voice_note', { p_uid: A.user.id, p_conversation: dm, p_object_key: `${dm}/${A.user.id}/${randomUUID()}.wav`, p_duration_ms: 1000, p_client_id: randomUUID() }],
    ['chat_voice_check_post', { p_uid: A.user.id, p_conversation: dm }],
    ['chat_voice_reserve_upload', { p_uid: A.user.id, p_conversation: dm }],
    ['chat_voice_purge_due', { p_limit: 5 }],
    ['chat_voice_purge_failed', { p_path: key }],
    ['chat_voice_key_committed', { p_object_key: key }],
    ['chat_voice_playback_target', { p_uid: A.user.id, p_message: v.id }],
    ['chat_voice_claim_transcription', { p_message: v.id }],
    ['chat_voice_finish_transcription', { p_message: v.id, p_ok: true, p_text: 'x' }],
    ['chat_voice_retry_candidates', { p_limit: 5 }],
    ['chat_voice_fail_exhausted', {}],
    ['chat_voice_expire_old', { p_limit: 1 }],
    ['chat_voice_sweep_tick', {}],
    ['chat_voice_retention_tick', {}],
  ];
  for (const [fn, args] of calls) {
    for (const [who, c] of [['A', sA.client], ['anon', anonClient()]] as const) {
      await refused(c.rpc(fn, args), `${who} calling ${fn}`);
    }
  }
  await ok(supabaseAdmin.rpc('chat_voice_check_post', { p_uid: A.user.id, p_conversation: dm }), 'service role check_post (control)');
});

test('commit and playback follow membership; a foreign path is refused', async () => {
  const { row: v, key } = await commitOk(A.user.id, dm);

  // playback: both members get the derived key, the outsider is refused (control + refusal)
  expect((await target(A.user.id, v.id)).data).toBe(key);
  expect((await target(B.user.id, v.id)).data).toBe(key);
  expect((await target(C.user.id, v.id)).error?.code).toBe('42501');
  expect((await target(C.user.id, randomUUID())).error?.code, 'same refusal for an id that does not exist').toBe('42501');

  // commit: the outsider cannot post, the member can (control above)
  expect((await commit(C.user.id, dm)).error?.code).toBe('42501');

  // the owner's own mirror accepts a voice note (founder decision, 20261027120600)
  expect((await commit(A.user.id, mirA)).error).toBeNull();
  expect((await supabaseAdmin.rpc('chat_voice_check_post', { p_uid: A.user.id, p_conversation: mirA })).error).toBeNull();
  // but nobody else can post into it (control: the owner just did)
  expect((await commit(B.user.id, mirA)).error?.code).toBe('42501');

  // the path is derived: any other key is refused (control: the derived one worked above)
  const cid = randomUUID();
  const bad = await supabaseAdmin.rpc('chat_commit_voice_note', {
    p_uid: A.user.id, p_conversation: dm, p_object_key: `${dmDB}/${A.user.id}/${cid}.wav`, p_duration_ms: 1000, p_client_id: cid,
  });
  expect(bad.error?.code).toBe('22023');
  // another member's key (same chat, same upload id, B's segment) is not A's to commit
  const cid2 = randomUUID();
  const theirs = await supabaseAdmin.rpc('chat_commit_voice_note', {
    p_uid: A.user.id, p_conversation: dm, p_object_key: `${dm}/${B.user.id}/${cid2}.wav`, p_duration_ms: 1000, p_client_id: cid2,
  });
  expect(theirs.error?.code).toBe('22023');
  expect((await commit(A.user.id, dm, {}, 120_001)).error?.code, 'over 2 minutes').toBe('22023');
  expect((await commit(A.user.id, dm, {}, 0)).error?.code, 'empty').toBe('22023');
  expect((await commit(A.user.id, dm, {}, 120_000)).error, 'exactly 2 minutes (control)').toBeNull();
});

test('table constraints: audio counts as content, nothing else may ride along, a thread note needs a live root of the same chat', async () => {
  // has_content: a row with no content is still refused (control for the audio branch below)
  const empty = await supabaseAdmin.from('chat_messages').insert({ conversation_id: dm, author_id: A.user.id });
  expect(empty.error?.code).toBe('23514');
  // audio alone is content
  const alone = await supabaseAdmin.from('chat_messages')
    .insert({ conversation_id: dm, author_id: A.user.id, audio_duration_ms: 900, transcript_status: 'pending' }).select('id').single();
  expect(alone.error).toBeNull();
  // audio with a body, or without a status, or with a transcript but no audio, is not a voice note
  for (const bad of [
    { audio_duration_ms: 900, transcript_status: 'pending', body: 'text' },
    { audio_duration_ms: 900 },
    { body: 'text', transcript: 'orphan transcript', transcript_status: 'done' },
    { audio_duration_ms: 120_001, transcript_status: 'pending' },
    { audio_duration_ms: 900, transcript_status: 'pending', transcript: 'x'.repeat(20_001) },
  ]) {
    const r = await supabaseAdmin.from('chat_messages').insert({ conversation_id: dm, author_id: A.user.id, ...bad });
    expect(r.error?.code, JSON.stringify(bad)).toBe('23514');
  }
  // an edit of a voice note's body is refused, so the edit RPC cannot turn it into text
  const { row: v } = await commitOk(A.user.id, dm);
  await refused(sA.client.rpc('edit_chat_message', { p_message: v.id, p_body: 'caption' }), 'editing a voice note');

  // thread: a voice reply under a live root of this chat works (control); a root from another chat does not
  const root = await ok<Row>(sA.client.rpc('send_chat_message', { p_conversation: dm, p_body: `root ${RUN}` }), 'root');
  const reply = await commitOk(B.user.id, dm, { p_thread_root: root.id });
  expect(reply.row.thread_root_id).toBe(root.id);
  // a root that belongs to another chat is refused (B is a member of both chats)
  const otherRoot = await ok<Row>(sB.client.rpc('send_chat_message', { p_conversation: dmDB, p_body: `other root ${RUN}` }), 'other root');
  expect((await commit(A.user.id, dm, { p_thread_root: otherRoot.id })).error?.code).toBe('42501');
  expect((await commit(B.user.id, dm, { p_thread_root: randomUUID() })).error?.code).toBe('42501');
});

test('a retried commit returns the first row and keeps one audio row', async () => {
  const cid = randomUUID();
  const first = await commitOk(A.user.id, dm, { p_client_id: cid });
  const again = await commit(A.user.id, dm, { p_client_id: cid });
  expect(again.error).toBeNull();
  expect((again.data as VoiceRow).id).toBe(first.row.id);
  const { data } = await supabaseAdmin.from('chat_voice_audio').select('message_id').eq('message_id', first.row.id);
  expect(data).toHaveLength(1);
  // a replay carries no fresh duration, and the key now reads as committed (a failed commit must not delete it)
  const replay = await commit(A.user.id, dm, { p_client_id: cid }, 1);
  expect(replay.error).toBeNull();
  expect((await supabaseAdmin.rpc('chat_voice_key_committed', { p_object_key: first.key })).data).toBe(true);
  expect((await supabaseAdmin.rpc('chat_voice_key_committed', { p_object_key: `${dm}/${A.user.id}/${randomUUID()}.wav` })).data).toBe(false);
});

const BARS = Array.from({ length: 50 }, (_, i) => i * 2);

test('audio_waveform: 50 bars of 0..100 are stored, any other shape is refused, a delete clears it, a non-voice row cannot carry one', async () => {
  const good = await commitOk(A.user.id, dm, { p_waveform: BARS });
  expect(good.row.audio_waveform).toEqual(BARS);
  expect((await commit(A.user.id, dm, { p_waveform: BARS.slice(1) })).error?.code, '49 values').toBe('22023');
  expect((await commit(A.user.id, dm, { p_waveform: [...BARS, 1] })).error?.code, '51 values').toBe('22023');
  expect((await commit(A.user.id, dm, { p_waveform: [...BARS.slice(1), 101] })).error?.code, '101').toBe('22023');
  expect((await commit(A.user.id, dm, { p_waveform: [...BARS.slice(1), -1] })).error?.code, '-1').toBe('22023');
  // the table refuses the same shapes from any writer
  const base = { conversation_id: dm, author_id: A.user.id, audio_duration_ms: 900, transcript_status: 'pending' };
  expect((await supabaseAdmin.from('chat_messages').insert({ ...base, audio_waveform: BARS.slice(1) })).error?.code, 'table: 49').toBe('23514');
  expect((await supabaseAdmin.from('chat_messages').insert({ ...base, audio_waveform: [...BARS.slice(1), 101] })).error?.code, 'table: 101').toBe('23514');
  expect((await supabaseAdmin.from('chat_messages').insert({ ...base, audio_waveform: BARS })).error, 'table: valid (control)').toBeNull();
  // a legacy note (no waveform) is fine
  expect((await supabaseAdmin.from('chat_messages').insert(base)).error).toBeNull();
  // a text row cannot carry one
  expect((await supabaseAdmin.from('chat_messages').insert({ conversation_id: dm, author_id: A.user.id, body: 'x', audio_waveform: BARS })).error?.code).toBe('23514');
  await ok(sA.client.rpc('delete_chat_message', { p_message: good.row.id }), 'delete');
  expect((await row(good.row.id)).audio_waveform).toBeNull();
});

test('voice notes in the owner\'s mirror: the mirror waits for the transcript, then reads it; a private ask row still cannot carry audio', async () => {
  const { row: v } = await commitOk(A.user.id, mirA, { p_waveform: BARS });
  const mirrorJobs = async () =>
    (await supabaseAdmin.from('mirror_jobs').select('id').eq('trigger_message_id', v.id)).data ?? [];
  const request = async () => (await ok<Array<{ job_id: string | null; state: string; reply_message_id: string | null }>>(
    sA.client.rpc('mirror_request_reply', { p_message: v.id }), 'mirror_request_reply'))[0]!;

  // pending: no job, state transcribing
  const waiting = await request();
  expect([waiting.job_id, waiting.state, waiting.reply_message_id]).toEqual([null, 'transcribing', null]);
  expect(await mirrorJobs()).toHaveLength(0);

  // done: a job is created and its context carries the transcript, labelled as a voice note
  await ok(supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: v.id, p_ok: true, p_text: `remember the milk ${RUN}` }), 'finish ok');
  const job = await request();
  expect(job.job_id).not.toBeNull();
  expect(job.state).not.toBe('transcribing');
  const begun = await ok<{ status: string; context: Array<{ body: string | null; voice: string | null }> }>(
    supabaseAdmin.rpc('_mirror_begin_job', { p_job: job.job_id }), '_mirror_begin_job');
  // The server trigger (20261027120700) may already have started this job: then begin answers busy/done,
  // and the trigger test below proves the reply. Only a job we begin ourselves exposes its context.
  expect(['run', 'busy', 'done']).toContain(begun.status);
  if (begun.status === 'run') {
    const item = begun.context.find((c) => c.body === `remember the milk ${RUN}`);
    expect(item?.voice).toBe('transcript');
  }

  // failed: no job, state transcript_failed
  const { row: f } = await commitOk(A.user.id, mirA);
  await ok(supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: f.id, p_ok: false, p_final: true }), 'finish failed');
  const failed = (await ok<Array<{ job_id: string | null; state: string }>>(
    sA.client.rpc('mirror_request_reply', { p_message: f.id }), 'request failed'))[0]!;
  expect([failed.job_id, failed.state]).toEqual([null, 'transcript_failed']);
  expect((await supabaseAdmin.from('mirror_jobs').select('id').eq('trigger_message_id', f.id)).data).toHaveLength(0);

  // done but blank (a silent note): treated as failed, no job, no spend
  const { row: blank } = await commitOk(A.user.id, mirA);
  await ok(supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: blank.id, p_ok: true, p_text: '   ' }), 'finish blank');
  const silent = (await ok<Array<{ job_id: string | null; state: string }>>(
    sA.client.rpc('mirror_request_reply', { p_message: blank.id }), 'request blank'))[0]!;
  expect([silent.job_id, silent.state]).toEqual([null, 'transcript_failed']);
  expect((await supabaseAdmin.from('mirror_jobs').select('id').eq('trigger_message_id', blank.id)).data).toHaveLength(0);

  // a private @mirror ask row (context_conversation_id) can never carry audio; an agent row neither
  const ask = await supabaseAdmin.from('chat_messages')
    .insert({ conversation_id: mirA, author_id: A.user.id, context_conversation_id: dm, audio_duration_ms: 900, transcript_status: 'pending' });
  expect(ask.error?.code).toBe('23514');
  const agent = await supabaseAdmin.from('chat_messages')
    .insert({ conversation_id: mirA, author_id: null, kind: 'agent', audio_duration_ms: 900, transcript_status: 'pending' });
  expect(agent.error).not.toBeNull();
});

test('the server opens the Mirror job when a mirror voice note\'s transcript is done (trigger 20261027120700)', async () => {
  const jobsOf = async (id: string) =>
    (await supabaseAdmin.from('mirror_jobs').select('id, kind, owner_id, trigger_message_id, context_conversation_id').eq('trigger_message_id', id)).data ?? [];
  const finish = (id: string, text: string) =>
    ok(supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: id, p_ok: true, p_text: text }), 'finish');

  // pending -> done with a transcript: exactly one reply job for that note. The UPDATE succeeds whether or
  // not the vault secrets exist here (the trigger only warns and leaves the job queued).
  const { row: v } = await commitOk(M.user.id, mirM);
  expect(await jobsOf(v.id)).toHaveLength(0);
  await finish(v.id, `ask the server ${RUN}`);
  const jobs = await jobsOf(v.id);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ kind: 'reply', owner_id: M.user.id, trigger_message_id: v.id, context_conversation_id: null });

  // a second done UPDATE (not a pending -> done transition) and the user's Try again reuse the same job
  await ok(supabaseAdmin.from('chat_messages').update({ transcript_status: 'done' }).eq('id', v.id), 'second done');
  const again = (await ok<Array<{ job_id: string }>>(sM.client.rpc('mirror_request_reply', { p_message: v.id }), 'request'))[0]!;
  expect(again.job_id).toBe(jobs[0]!.id);
  expect(await jobsOf(v.id)).toHaveLength(1);

  // a blank transcript opens no job
  const { row: blank } = await commitOk(M.user.id, mirM);
  await finish(blank.id, '   ');
  expect(await jobsOf(blank.id)).toHaveLength(0);

  // a voice note in a non-mirror chat opens no job
  const { row: human } = await commitOk(M.user.id, dmMB);
  await finish(human.id, `hello ${RUN}`);
  expect(await jobsOf(human.id)).toHaveLength(0);
});

test('a channel @mirror ask reads a done voice note from another member, labelled as a voice note', async () => {
  const gconv = await adminConversation('group', { org_id: org.id });
  const { row: v } = await commitOk(B.user.id, gconv);
  await ok(supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: v.id, p_ok: true, p_text: `channel voice ${RUN}` }), 'finish ok');
  const asked = await ok<Row>(sA.client.rpc('mirror_ask', { p_channel: gconv, p_body: `what did B say? ${RUN}` }), 'mirror_ask');
  const askId = asked.id;
  const jobs = await ok<Array<{ job_id: string }>>(sA.client.rpc('mirror_request_reply', { p_message: askId }), 'request ask');
  const begun = await ok<{ status: string; context: Array<{ body: string | null; voice: string | null }> }>(
    supabaseAdmin.rpc('_mirror_begin_job', { p_job: jobs[0]!.job_id }), '_mirror_begin_job');
  expect(begun.status).toBe('run');
  expect(begun.context.find((c) => c.body === `channel voice ${RUN}`)?.voice).toBe('transcript');
});

// M, not A: A writes over ten notes across this file, and the per-minute limit is per author.
test('deleting a voice note empties the row, removes the audio and queues the object', async () => {
  const { row: v, key } = await commitOk(M.user.id, dmMB);
  expect((await target(B.user.id, v.id)).data, 'playable before (control)').toBe(key);
  expect(await queued(key)).toBe(false);

  await ok(sM.client.rpc('delete_chat_message', { p_message: v.id }), 'delete');
  const after = await row(v.id);
  expect(after.deleted_at).not.toBeNull();
  expect([after.audio_duration_ms, after.transcript, after.transcript_status, after.audio_expired_at, after.audio_waveform]).toEqual([null, null, null, null, null]);
  expect(await audioRow(v.id)).toBeNull();
  expect(await queued(key), 'the object is queued for deletion').toBe(true);
  expect((await target(B.user.id, v.id)).data, 'gone, not an error').toBeNull();
});

test('erasing an account removes its voice notes and queues them, and leaves the other person\'s note alone', async () => {
  const mine = await commitOk(D.user.id, dmDB);
  const theirs = await commitOk(B.user.id, dmDB);
  await ok(supabaseAdmin.rpc('erase_chat_data_for', { p_uid: D.user.id }), 'erase_chat_data_for');

  const erased = await row(mine.row.id);
  expect(erased.deleted_at).not.toBeNull();
  expect([erased.audio_duration_ms, erased.transcript_status]).toEqual([null, null]);
  expect(await audioRow(mine.row.id)).toBeNull();
  expect(await queued(mine.key)).toBe(true);

  // CONTROL: the other person's note is untouched
  expect((await row(theirs.row.id)).audio_duration_ms).toBe(4200);
  expect((await audioRow(theirs.row.id))?.audio_path).toBe(theirs.key);
  expect(await queued(theirs.key)).toBe(false);
});

test('transcription: claim counts attempts, a finished note cannot be re-claimed, three failures end as failed, a delete wins', async () => {
  // success path
  const ok1 = await commitOk(T.user.id, dmTB);
  const claim1 = await supabaseAdmin.rpc('chat_voice_claim_transcription', { p_message: ok1.row.id });
  expect(claim1.data).toBe(ok1.key);
  expect((await supabaseAdmin.rpc('chat_voice_claim_transcription', { p_message: ok1.row.id })).data, 'too soon to retry').toBeNull();
  await ok(supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: ok1.row.id, p_ok: true, p_text: 'hello there' }), 'finish');
  expect(await row(ok1.row.id)).toMatchObject({ transcript: 'hello there', transcript_status: 'done' });
  await backdateAttempt(ok1.row.id);
  expect((await supabaseAdmin.rpc('chat_voice_claim_transcription', { p_message: ok1.row.id })).data, 'done is not re-claimed').toBeNull();

  // failure path: three attempts, then failed (a failed attempt before the third leaves it pending)
  const bad = await commitOk(T.user.id, dmTB);
  for (let i = 1; i <= 3; i++) {
    expect((await supabaseAdmin.rpc('chat_voice_claim_transcription', { p_message: bad.row.id })).data, `attempt ${i}`).toBe(bad.key);
    await supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: bad.row.id, p_ok: false });
    if (i < 3) {
      expect((await row(bad.row.id)).transcript_status, `still pending after ${i}`).toBe('pending');
      await backdateAttempt(bad.row.id);
    }
  }
  expect((await row(bad.row.id)).transcript_status).toBe('failed');
  expect((await audioRow(bad.row.id))?.transcript_attempts).toBe(3);
  await backdateAttempt(bad.row.id);
  expect((await supabaseAdmin.rpc('chat_voice_claim_transcription', { p_message: bad.row.id })).data, 'no fourth attempt').toBeNull();

  // a job that died after its third attempt is closed by the sweep
  const stuck = await commitOk(T.user.id, dmTB);
  for (let i = 1; i <= 3; i++) {
    await supabaseAdmin.rpc('chat_voice_claim_transcription', { p_message: stuck.row.id });
    await backdateAttempt(stuck.row.id);
  }
  expect((await row(stuck.row.id)).transcript_status).toBe('pending');
  const failed = await supabaseAdmin.rpc('chat_voice_fail_exhausted');
  expect(failed.data as number).toBeGreaterThanOrEqual(1);
  expect((await row(stuck.row.id)).transcript_status).toBe('failed');

  // retry candidates: a fresh note is not one (control), an old pending one is
  const fresh = await commitOk(T.user.id, dmTB);
  const old = await commitOk(T.user.id, dmTB);
  await supabaseAdmin.from('chat_messages').update({ created_at: new Date(Date.now() - 5 * 60_000).toISOString() }).eq('id', old.row.id);
  const cands = ((await supabaseAdmin.rpc('chat_voice_retry_candidates', { p_limit: 100 })).data ?? []) as string[];
  expect(cands).toContain(old.row.id);
  expect(cands).not.toContain(fresh.row.id);
  expect(cands).not.toContain(bad.row.id);

  // a result that arrives after the delete changes nothing
  const raced = await commitOk(T.user.id, dmTB);
  await supabaseAdmin.rpc('chat_voice_claim_transcription', { p_message: raced.row.id });
  await ok(sT.client.rpc('delete_chat_message', { p_message: raced.row.id }), 'delete');
  await supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: raced.row.id, p_ok: true, p_text: 'late words' });
  expect((await row(raced.row.id)).transcript, 'a deleted note stays empty').toBeNull();
});

test('retention: audio older than 30 days goes, the transcript stays, a pending note becomes failed', async () => {
  const old = await commitOk(U.user.id, dmUB);
  await supabaseAdmin.rpc('chat_voice_claim_transcription', { p_message: old.row.id });
  await supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: old.row.id, p_ok: true, p_text: 'kept words' });
  const oldPending = await commitOk(U.user.id, dmUB);
  const young = await commitOk(U.user.id, dmUB);
  const stale = new Date(Date.now() - 31 * 86_400_000).toISOString();
  await supabaseAdmin.from('chat_messages').update({ created_at: stale }).in('id', [old.row.id, oldPending.row.id]);

  const n = await supabaseAdmin.rpc('chat_voice_expire_old', { p_limit: 1000 });
  expect(n.data as number).toBeGreaterThanOrEqual(2);

  const o = await row(old.row.id);
  expect(o).toMatchObject({ transcript: 'kept words', transcript_status: 'done', audio_duration_ms: 4200 });
  expect(o.audio_expired_at).not.toBeNull();
  expect(await audioRow(old.row.id)).toBeNull();
  expect(await queued(old.key)).toBe(true);
  expect((await target(B.user.id, old.row.id)).data, 'expired audio is gone, not an error').toBeNull();
  expect((await row(oldPending.row.id)).transcript_status).toBe('failed');

  // CONTROL: a young note is untouched
  expect((await row(young.row.id)).audio_expired_at).toBeNull();
  expect((await audioRow(young.row.id))?.audio_path).toBe(young.key);
});

test('purge backoff: a failed delete moves the path behind fresh ones, and the wait grows to a day', async () => {
  const a = await commitOk(B.user.id, dm);
  const b = await commitOk(B.user.id, dm);
  await ok(sB.client.rpc('delete_chat_message', { p_message: a.row.id }), 'delete a');
  await ok(sB.client.rpc('delete_chat_message', { p_message: b.row.id }), 'delete b');
  const due = async () => ((await supabaseAdmin.rpc('chat_voice_purge_due', { p_limit: 100 })).data ?? []) as string[];
  const entry = async (path: string) => {
    const { data, error } = await supabaseAdmin.from('chat_voice_purge').select('attempts, next_attempt_at').eq('path', path).single();
    if (error) throw new Error(`entry: ${error.message}`);
    return { attempts: data.attempts as number, aheadMs: new Date(data.next_attempt_at as string).getTime() - Date.now() };
  };

  // both are due, the older first (control: the ordering is real before any failure)
  let d = await due();
  expect(d.indexOf(a.key)).toBeGreaterThanOrEqual(0);
  expect(d.indexOf(a.key)).toBeLessThan(d.indexOf(b.key));

  // a's delete fails: it is no longer due, and the fresh path is still read
  await ok(supabaseAdmin.rpc('chat_voice_purge_failed', { p_path: a.key }), 'first failure');
  d = await due();
  expect(d).toContain(b.key);
  expect(d).not.toContain(a.key);
  let e = await entry(a.key);
  expect(e.attempts).toBe(1);
  expect(e.aheadMs, 'about 2 minutes').toBeGreaterThan(60_000);
  expect(e.aheadMs).toBeLessThan(180_000);
  expect((await entry(b.key)).attempts, 'the other path is untouched').toBe(0);

  await ok(supabaseAdmin.rpc('chat_voice_purge_failed', { p_path: a.key }), 'second failure');
  e = await entry(a.key);
  expect(e.attempts).toBe(2);
  expect(e.aheadMs, 'about 4 minutes').toBeGreaterThan(180_000);
  expect(e.aheadMs).toBeLessThan(300_000);

  for (let i = 0; i < 12; i++) await supabaseAdmin.rpc('chat_voice_purge_failed', { p_path: a.key });
  e = await entry(a.key);
  expect(e.aheadMs, 'capped at a day').toBeGreaterThan(23 * 3_600_000);
  expect(e.aheadMs).toBeLessThan(25 * 3_600_000);

  // an unknown path changes nothing and does not error
  expect((await supabaseAdmin.rpc('chat_voice_purge_failed', { p_path: `${dm}/${B.user.id}/${randomUUID()}.wav` })).error).toBeNull();
});

test('retention drains: a call with a tiny batch size still expires every old note', async () => {
  const old = [await commitOk(U.user.id, dmUB), await commitOk(U.user.id, dmUB), await commitOk(U.user.id, dmUB)];
  const stale = new Date(Date.now() - 31 * 86_400_000).toISOString();
  await supabaseAdmin.from('chat_messages').update({ created_at: stale }).in('id', old.map((o) => o.row.id));
  const n = await supabaseAdmin.rpc('chat_voice_expire_old', { p_limit: 1 });
  expect(n.data as number, 'three batches of one, in a single call').toBeGreaterThanOrEqual(3);
  for (const o of old) {
    expect((await row(o.row.id)).audio_expired_at).not.toBeNull();
    expect(await audioRow(o.row.id)).toBeNull();
    expect(await queued(o.key)).toBe(true);
  }
});

test('a client id that belongs to a text message is not a replay: the commit is refused', async () => {
  const cid = randomUUID();
  // the uploader reuses the upload's id for a plain text message, then tries to commit the voice key
  await ok<Row>(sT.client.rpc('send_chat_message', { p_conversation: dmTB, p_body: `text ${RUN}`, p_client_id: cid }), 'text with the upload id');
  const r = await commit(T.user.id, dmTB, { p_client_id: cid });
  expect(r.error?.code).toBe('22023');
  const { data } = await supabaseAdmin.from('chat_voice_audio').select('message_id').eq('audio_path', r.key);
  expect(data ?? [], 'no audio row, and the commit did not hand back the text row').toEqual([]);
  // CONTROL: the same author's voice note under a fresh id still works
  expect((await commit(T.user.id, dmTB)).error).toBeNull();
});

test('at most 10 voice notes per minute per author', async () => {
  for (let i = 0; i < 10; i++) await commitOk(R.user.id, dmRB);
  const eleventh = await commit(R.user.id, dmRB);
  expect(eleventh.error?.code).toBe('54000');
  // CONTROL: another author is not affected
  expect((await commit(B.user.id, dmRB)).error).toBeNull();
});

test('the limit survives deleting: delete-and-resend does not dodge it', async () => {
  // ten notes, each deleted straight away; the ledger still counts them
  for (let i = 0; i < 10; i++) {
    const { row: v } = await commitOk(X.user.id, dmXB);
    await ok(sX.client.rpc('delete_chat_message', { p_message: v.id }), 'delete');
  }
  const { data: live } = await supabaseAdmin.from('chat_messages').select('id').eq('author_id', X.user.id).not('audio_duration_ms', 'is', null);
  expect(live ?? [], 'no voice note is left to count on chat_messages').toEqual([]);
  expect((await commit(X.user.id, dmXB)).error?.code, 'the eleventh in a minute is refused').toBe('54000');
  // the refusal consumed nothing: a refused attempt leaves no ledger row
  const { count } = await supabaseAdmin.from('chat_voice_rate_limits').select('id', { count: 'exact', head: true }).eq('author_id', X.user.id);
  expect(count).toBe(10);
  // CONTROL: after the ledger is cleared the same call succeeds, so the refusal was the limit and nothing else
  await supabaseAdmin.from('chat_voice_rate_limits').delete().eq('author_id', X.user.id);
  expect((await commit(X.user.id, dmXB)).error).toBeNull();
  // clients cannot read the ledger
  const peek = await sX.client.from('chat_voice_rate_limits').select('id');
  expect(peek.error !== null || (peek.data ?? []).length === 0).toBe(true);
});

test('concurrent commits cannot overshoot the limit: exactly 10 of 15 parallel notes are admitted', async () => {
  const results = await Promise.all(Array.from({ length: 15 }, () => commit(P.user.id, dmPB)));
  const admitted = results.filter((r) => !r.error).length;
  const refusedCount = results.filter((r) => r.error?.code === '54000').length;
  expect(admitted, 'exactly the limit is admitted however many arrive at once').toBe(10);
  expect(refusedCount).toBe(5);
  expect(results.filter((r) => r.error && r.error.code !== '54000'), 'no other kind of failure').toEqual([]);
  const { count } = await supabaseAdmin.from('chat_voice_rate_limits').select('id', { count: 'exact', head: true }).eq('author_id', P.user.id).eq('kind', 'commit');
  expect(count, 'refused attempts left no ledger row').toBe(10);
});

test('concurrent retries of ONE upload make one message and charge one slot', async () => {
  const cid = randomUUID();
  const results = await Promise.all(Array.from({ length: 5 }, () => commit(W.user.id, dmWB, { p_client_id: cid })));
  expect(results.filter((r) => r.error), 'every retry is answered, none is refused').toEqual([]);
  const ids = new Set(results.map((r) => (r.data as VoiceRow).id));
  expect(ids.size, 'one message').toBe(1);
  const { data: msgs } = await supabaseAdmin.from('chat_messages').select('id').eq('author_id', W.user.id).eq('client_id', cid);
  expect(msgs).toHaveLength(1);
  const { count } = await supabaseAdmin.from('chat_voice_rate_limits').select('id', { count: 'exact', head: true }).eq('author_id', W.user.id).eq('kind', 'commit');
  expect(count, 'five replays cost one slot, not five').toBe(1);
  // and the author can still send nine more notes in the same minute (the retries did not eat the allowance)
  for (let i = 0; i < 9; i++) await commitOk(W.user.id, dmWB);
  expect((await commit(W.user.id, dmWB)).error?.code, 'the eleventh is the first refusal').toBe('54000');
});

test('upload quota: 20 grants per author, reserved in the database before anything is signed', async () => {
  const reserve = (uid: string, conv: string) => supabaseAdmin.rpc('chat_voice_reserve_upload', { p_uid: uid, p_conversation: conv });

  // refusals first: a non-member of a chat, and a stranger in someone's mirror, consume nothing
  expect((await reserve(C.user.id, dmQB)).error?.code).toBe('42501');
  expect((await reserve(C.user.id, await mirrorOf(sQ))).error?.code).toBe('42501');
  const before = await supabaseAdmin.from('chat_voice_rate_limits').select('id', { count: 'exact', head: true }).eq('author_id', Q.user.id);
  expect(before.count, 'refusals consumed no allowance').toBe(0);

  // 30 in parallel: exactly 20 are admitted
  const results = await Promise.all(Array.from({ length: 30 }, () => reserve(Q.user.id, dmQB)));
  expect(results.filter((r) => !r.error).length).toBe(20);
  expect(results.filter((r) => r.error?.code === '54000').length).toBe(10);
  // the upload allowance is separate from the commit allowance: a note can still be committed
  expect((await commit(Q.user.id, dmQB)).error, 'commits are not starved by spent uploads').toBeNull();
});

test('a final transcription failure ends the note and takes the audio down', async () => {
  const { row: v, key } = await commitOk(T.user.id, dmTB);
  await supabaseAdmin.rpc('chat_voice_claim_transcription', { p_message: v.id });
  expect((await target(B.user.id, v.id)).data, 'playable before (control)').toBe(key);

  await ok(supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: v.id, p_ok: false, p_final: true }), 'final failure');
  const after = await row(v.id);
  expect(after.transcript_status).toBe('failed');
  expect(after.audio_expired_at).not.toBeNull();
  expect(await audioRow(v.id), 'no audio row left').toBeNull();
  expect(await queued(key), 'the object is queued for deletion').toBe(true);
  expect((await target(B.user.id, v.id)).data, 'not playable any more').toBeNull();
  // a non-final failure on a fresh note still leaves it pending (control for the flag)
  const fresh = await commitOk(T.user.id, dmTB);
  await supabaseAdmin.rpc('chat_voice_claim_transcription', { p_message: fresh.row.id });
  await supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: fresh.row.id, p_ok: false });
  expect((await row(fresh.row.id)).transcript_status).toBe('pending');
  expect((await audioRow(fresh.row.id))?.audio_path).toBe(fresh.key);
});

test('realtime: the other person gets the note without any path, then the transcript as an update', async () => {
  const feed = await collect(sB.client, 'voice-B');
  try {
    const cid = randomUUID();
    let id = '';
    const got = await fireUntil(async () => {
      if (!id) id = (await commitOk(A.user.id, dm, { p_client_id: cid }, 3000)).row.id;
    }, () => feed.messages.some((m) => m.type === 'INSERT' && m.new.id === id && id !== ''));
    expect(got, 'B receives the INSERT').toBe(true);
    const insert = feed.messages.find((m) => m.type === 'INSERT' && m.new.id === id)!;
    expect(insert.new).toMatchObject({ audio_duration_ms: 3000, transcript_status: 'pending' });
    expect(Object.keys(insert.new).filter((k) => /path/.test(k))).toEqual([]);

    await supabaseAdmin.rpc('chat_voice_claim_transcription', { p_message: id });
    const updated = await fireUntil(
      async () => { await supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: id, p_ok: true, p_text: 'realtime words' }); },
      () => feed.messages.some((m) => m.type === 'UPDATE' && m.new.id === id && m.new.transcript === 'realtime words'),
    );
    expect(updated, 'B receives the transcript as an UPDATE').toBe(true);
  } finally {
    await closeAll(feed);
  }
});
