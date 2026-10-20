/**
 * @file p1520-mirror-canary.spec.ts
 * @description DB canary for Mirror v2 (supabase/migrations/20261020213000_p1520_mirror_v2.sql).
 *
 * THE INVARIANTS.
 *   1. A mirror reply, and an @mirror ask made in a channel, are readable by their owner only — over
 *      REST, over Realtime and through every RPC — and touch nothing in the channel.
 *   2. A model call is paid for at most once per triggering message, and never past a cap.
 *   3. Erasing a person removes the AI text derived from their words, including work in flight.
 *
 * The model itself is not called here: the edge function's service-role steps (_mirror_begin_job,
 * _mirror_complete_job, ...) are driven directly with a fixed text, so this file runs without any AI
 * key and costs nothing. Spend rows are settled to 0 so the global ceiling on the shared test project
 * is not consumed by test runs.
 *
 * EVERY REFUSAL HAS A CONTROL (P1512 canary rule): each refused shape is paired with the same shape
 * succeeding for the caller entitled to it, and ground truth is re-read through the service role.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from '../helpers/test-organization';
import {
  RUN, signIn, anonClient, ok, refused, sleep, adminMessages, adminConversation, mirrorOf, myChatIds,
  collect, fireUntil, closeAll, purgeChatFor, type SignedIn, type Row, type Collected,
} from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const created: TestUser[] = [];
const orgs: TestOrganization[] = [];

async function mk(label: string): Promise<TestUser> {
  const u = await createTestUser({ name: `Mi${label} ${RUN}` });
  created.push(u);
  return u;
}

interface JobRef { job_id: string; state: string; reply_message_id: string | null }
interface Begin { status: string; kind?: string; context?: Array<Record<string, unknown>>; question?: { body: string } | null; channel_title?: string | null; reply_message_id?: string }

const send = (s: SignedIn, conv: string, body: string) =>
  ok<Row>(s.client.rpc('send_chat_message', { p_conversation: conv, p_body: body }), `send "${body}"`);
const requestReply = async (s: SignedIn, message: string) =>
  (await ok<JobRef[]>(s.client.rpc('mirror_request_reply', { p_message: message }), 'mirror_request_reply'))[0]!;
const begin = (job: string) => ok<Begin>(supabaseAdmin.rpc('_mirror_begin_job', { p_job: job }), '_mirror_begin_job');
const complete = (job: string, body: string) =>
  supabaseAdmin.rpc('_mirror_complete_job', { p_job: job, p_body: body, p_actual_usd: 0 });
async function adminJob(id: string) {
  const { data, error } = await supabaseAdmin.from('mirror_jobs').select('*').eq('id', id).single();
  if (error) throw new Error(`adminJob: ${error.message}`);
  return data as { state: string; derived_refs: string[] | null; attempts: number; spend_id: string | null; reply_message_id: string | null };
}
async function adminRow(id: string): Promise<Row & { derived_refs: string[] | null; context_conversation_id: string | null }> {
  const { data, error } = await supabaseAdmin.from('chat_messages').select('*').eq('id', id).single();
  if (error) throw new Error(`adminRow: ${error.message}`);
  return data as Row & { derived_refs: string[] | null; context_conversation_id: string | null };
}
/** The opaque author ref P1512 uses for erasure (sha256 of 'p1512:' || uuid). */
async function refOf(uid: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(`p1512:${uid}`).digest('hex');
}

let org: TestOrganization;
let A: TestUser, B: TestUser, C: TestUser;
let sA: SignedIn, sB: SignedIn, sC: SignedIn;
let gconv: string, mirA: string, mirB: string;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  org = await createTestOrganization({ name: `Mirror canary org ${RUN}` });
  orgs.push(org);
  [A, B, C] = await Promise.all([mk('A'), mk('B'), mk('C')]);
  await createTestMembership(org.id, A.user.id);
  await createTestMembership(org.id, B.user.id);
  sA = await signIn(A);
  sB = await signIn(B);
  sC = await signIn(C);
  await myChatIds(sA.client);
  await myChatIds(sB.client);
  gconv = await adminConversation('group', { org_id: org.id });
  mirA = await mirrorOf(sA);
  mirB = await mirrorOf(sB);
});

test.afterAll(async () => {
  test.setTimeout(240_000);
  await purgeChatFor(created.map((u) => u.user.id));
  for (const u of created) await deleteTestUser(u.user.id).catch(() => {});
  for (const o of orgs) await deleteTestOrganization(o.id);
});

test('structure: clients cannot write jobs or spend, cannot read spend or derived refs, cannot run the service steps', async () => {
  const msg = await send(sA, mirA, `structure-${RUN}`);
  const job = await requestReply(sA, msg.id);

  for (const [who, client] of [['owner A', sA.client], ['outsider C', sC.client], ['anon', anonClient()]] as const) {
    const writes: Array<[string, PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>]> = [
      ['insert a job', client.from('mirror_jobs').insert({ owner_id: A.user.id, kind: 'portrait' })],
      ['mark a job done', client.from('mirror_jobs').update({ state: 'done' }).eq('id', job.job_id)],
      ['delete a job', client.from('mirror_jobs').delete().eq('id', job.job_id)],
      ['insert spend', client.from('mirror_ai_spend').insert({ owner_id: A.user.id, bucket: 'reply', reserved_usd: 0.01 })],
      ['read spend', client.from('mirror_ai_spend').select('id')],
      ['read a job\'s derived refs', client.from('mirror_jobs').select('derived_refs')],
    ];
    for (const [what, p] of writes) {
      const err = await refused(p, `${who} must not ${what}`);
      expect(err.code, `${who} ${what}: ${err.message}`).toBe('42501');
    }
    for (const [fn, args] of [
      ['_mirror_begin_job', { p_job: job.job_id }],
      ['_mirror_complete_job', { p_job: job.job_id, p_body: 'forged', p_actual_usd: 0 }],
      ['_mirror_reserve', { p_owner: A.user.id, p_bucket: 'reply', p_max_usd: 0.01 }],
      ['_mirror_begin_portrait', { p_owner: A.user.id }],
    ] as const) {
      await refused(client.rpc(fn, args), `${who} must not call ${fn}`);
    }
  }

  // CONTROL: the owner reads their own job's state (column grant), the outsider sees nothing.
  const own = await sA.client.from('mirror_jobs').select('id, state').eq('id', job.job_id);
  expect(own.error).toBeNull();
  expect(own.data).toEqual([{ id: job.job_id, state: 'queued' }]);
  const other = await sC.client.from('mirror_jobs').select('id').eq('id', job.job_id);
  expect(other.data).toEqual([]);
  // CONTROL: the service role runs the step the clients could not.
  expect((await begin(job.job_id)).status).toBe('run');
  expect((await complete(job.job_id, 'structure reply')).error).toBeNull();
});

test('mirror chat: one reply per message, attached to it, from the mirror; a retry never replies twice; the mirror never answers itself', async () => {
  const msg = await send(sA, mirA, `what did she mean ${RUN}`);
  const j1 = await requestReply(sA, msg.id);
  const j2 = await requestReply(sA, msg.id);
  expect(j2.job_id, 'the same message always maps to the same job').toBe(j1.job_id);

  const b = await begin(j1.job_id);
  expect(b.status).toBe('run');
  expect(b.kind).toBe('reply');
  const last = b.context!.at(-1)!;
  expect(last.body, 'the triggering message is the last item of the context').toBe(`what did she mean ${RUN}`);
  expect(last.who).toBe('owner');
  expect((await begin(j1.job_id)).status, 'a second start while running is refused, not paid twice').toBe('busy');

  const { data: reply, error } = await complete(j1.job_id, `my reading ${RUN}`);
  expect(error).toBeNull();
  const r = reply as Row;
  expect(r.kind).toBe('agent');
  expect(r.author_id).toBeNull();
  expect(r.reply_to_id).toBe(msg.id);
  expect(r.conversation_id).toBe(mirA);

  const again = await begin(j1.job_id);
  expect(again.status, 'a done job is never re-run').toBe('done');
  expect(again.reply_message_id).toBe(r.id);
  const second = await complete(j1.job_id, 'duplicate');
  expect(second.data, 'completing a done job writes nothing').toBeNull();
  expect((await adminMessages(mirA)).filter((m) => m.reply_to_id === msg.id && m.kind === 'agent').length).toBe(1);

  // the owner reads the reply; the mirror cannot be asked to answer its own reply
  const seen = await sA.client.from('chat_messages').select('id, kind').eq('id', r.id);
  expect(seen.data).toEqual([{ id: r.id, kind: 'agent' }]);
  await refused(sA.client.rpc('mirror_request_reply', { p_message: r.id }), 'reply to the mirror\'s own reply');
  // nobody else may ask for a reply to A's message, nor read the reply
  await refused(sB.client.rpc('mirror_request_reply', { p_message: msg.id }), 'B requests a reply to A\'s message');
  expect((await sB.client.from('chat_messages').select('id').eq('id', r.id)).data).toEqual([]);
});

test('@mirror in a channel: only the asker can read the ask and the answer — REST, Realtime, unread and the channel itself are untouched', async () => {
  const gMsgB = await send(sB, gconv, `B says the plan is late ${RUN}`);
  const privateMirror = await send(sA, mirA, `PRIVATE-MIRROR-NOTE ${RUN}`);
  const chatsBefore = await ok<Array<{ conversation_id: string; unread_count: number }>>(sB.client.rpc('get_my_chats'), 'B chats');
  const gBefore = chatsBefore.find((c) => c.conversation_id === gconv)!;
  const { data: convBefore } = await supabaseAdmin.from('chat_conversations').select('last_message_at').eq('id', gconv).single();
  const groupRowsBefore = (await adminMessages(gconv)).length;

  let colA: Collected | undefined, colB: Collected | undefined;
  try {
    colA = await collect(sA.client, 'p1520-A');
    colB = await collect(sB.client, 'p1520-B');
    const question = `@mirror what does B mean ${RUN}`;
    let ask: Row | undefined;
    const clientId = randomUUID();
    const delivered = await fireUntil(
      async () => { ask = await ok<Row>(sA.client.rpc('mirror_ask', { p_channel: gconv, p_body: question, p_client_id: clientId }), 'mirror_ask'); },
      () => colA!.messages.some((m) => m.new.id === ask?.id),
    );
    expect(delivered, 'CONTROL: the asker\'s own client receives the ask over Realtime').toBe(true);
    expect(ask!.conversation_id, 'the ask lives in the asker\'s mirror').toBe(mirA);

    const job = await requestReply(sA, ask!.id);
    const b = await begin(job.job_id);
    expect(b.status).toBe('run');
    expect(b.kind).toBe('ask');
    expect(b.question?.body).toBe(question);
    const ctxText = JSON.stringify(b.context);
    expect(ctxText, 'the channel message is in the context').toContain(`B says the plan is late ${RUN}`);
    expect(ctxText, 'the asker\'s private mirror history never travels into a channel ask').not.toContain('PRIVATE-MIRROR-NOTE');
    expect((await adminJob(job.job_id)).derived_refs).toContain(await refOf(B.user.id));

    const { data: ans, error } = await complete(job.job_id, `answer ${RUN}`);
    expect(error).toBeNull();
    const answer = ans as Row;
    expect((await adminRow(answer.id)).context_conversation_id).toBe(gconv);

    // A can read both through the channel tag; B cannot read either by id or by tag
    const aView = await sA.client.from('chat_messages').select('id').eq('context_conversation_id', gconv);
    expect(aView.data!.map((r) => r.id).sort()).toEqual([ask!.id, answer.id].sort());
    for (const id of [ask!.id, answer.id]) {
      expect((await sB.client.from('chat_messages').select('id').eq('id', id)).data, `B reads ${id}`).toEqual([]);
    }
    expect((await sB.client.from('chat_messages').select('id').eq('context_conversation_id', gconv)).data).toEqual([]);

    // Realtime: give B's channel time, then prove nothing of A's mirror arrived while A's did
    await fireUntil(async () => {}, () => colA!.messages.some((m) => m.new.id === answer.id), 15_000);
    expect(colA!.messages.some((m) => m.new.id === answer.id), 'CONTROL: A receives the answer live').toBe(true);
    await sleep(2_000);
    const leaked = colB!.messages.filter((m) => m.new.conversation_id === mirA || m.new.context_conversation_id === gconv);
    expect(leaked, 'B\'s live channel receives none of A\'s ask or answer').toEqual([]);

    // the channel itself never moved
    expect((await adminMessages(gconv)).length).toBe(groupRowsBefore);
    const { data: convAfter } = await supabaseAdmin.from('chat_conversations').select('last_message_at').eq('id', gconv).single();
    expect(convAfter!.last_message_at).toBe(convBefore!.last_message_at);
    const gAfter = (await ok<Array<{ conversation_id: string; unread_count: number }>>(sB.client.rpc('get_my_chats'), 'B chats'))
      .find((c) => c.conversation_id === gconv)!;
    expect(gAfter.unread_count).toBe(gBefore.unread_count);
    void gMsgB; void privateMirror;
  } finally {
    await closeAll(colA, colB);
  }
});

test('@mirror is refused outside your own channels, and in 1:1s and mirrors; a reused client id never cross-posts', async () => {
  await refused(sC.client.rpc('mirror_ask', { p_channel: gconv, p_body: 'x' }), 'outsider C asks in A and B\'s group');
  await refused(sA.client.rpc('mirror_ask', { p_channel: mirA, p_body: 'x' }), 'ask inside a mirror');
  const dm = await ok<string>(sA.client.rpc('start_dm', { p_other: B.user.id }), 'A starts a dm with B');
  await refused(sA.client.rpc('mirror_ask', { p_channel: dm, p_body: 'x' }), 'ask inside a 1:1');
  const cid = randomUUID();
  const first = await ok<Row>(sA.client.rpc('mirror_ask', { p_channel: gconv, p_body: 'first', p_client_id: cid }), 'control ask');
  const replay = await ok<Row>(sA.client.rpc('mirror_ask', { p_channel: gconv, p_body: 'first', p_client_id: cid }), 'retry');
  expect(replay.id, 'a retried ask returns the stored row').toBe(first.id);
  await refused(sA.client.rpc('send_chat_message', { p_conversation: gconv, p_body: 'cross', p_client_id: cid }), 'reuse the ask\'s client id in the channel');
  await purgeChatFor([], [dm]);
});

test('a mirror reply can never be forwarded or clarified; an ordinary message still can (control)', async () => {
  const msg = await send(sA, mirA, `forward-test ${RUN}`);
  const job = await requestReply(sA, msg.id);
  await begin(job.job_id);
  const reply = (await complete(job.job_id, `secret reading ${RUN}`)).data as Row;
  const e1 = await refused(sA.client.rpc('forward_chat_message', { p_source: reply.id, p_target_conversation: gconv }), 'forward a mirror reply');
  expect(e1.message).toMatch(/private|not available/);
  await refused(sA.client.rpc('clarify_chat_message', { p_source: reply.id }), 'clarify a mirror reply');
  const fwd = await ok<Row>(sA.client.rpc('forward_chat_message', { p_source: msg.id, p_target_conversation: mirA }), 'control: forward own message');
  expect(fwd.kind).toBe('forward');
});

test('a private @mirror ask can never be forwarded or clarified into a channel (review fix); a plain mirror note can (control)', async () => {
  const ask = await ok<Row>(sA.client.rpc('mirror_ask', { p_channel: gconv, p_body: `secret ask ${RUN}` }), 'ask');
  await refused(sA.client.rpc('forward_chat_message', { p_source: ask.id, p_target_conversation: gconv }), 'forward an ask into the channel');
  await refused(sA.client.rpc('clarify_chat_message', { p_source: ask.id }), 'clarify an ask');
  expect((await adminMessages(gconv)).some((m) => (m.forward_snapshot as { body?: string } | null)?.body === `secret ask ${RUN}`)).toBe(false);
  const note = await send(sA, mirA, `plain note ${RUN}`);
  const fwd = await ok<Row>(sA.client.rpc('forward_chat_message', { p_source: note.id, p_target_conversation: gconv }), 'control: forward a plain note');
  expect(fwd.conversation_id).toBe(gconv);
});

test('a restarted dead job charges the abandoned attempt in full, never releases it (review fix)', async () => {
  const m = await send(sA, mirA, `restart ${RUN}`);
  const job = await requestReply(sA, m.id);
  expect((await begin(job.job_id)).status).toBe('run');
  const first = (await adminJob(job.job_id)).spend_id!;
  await supabaseAdmin.from('mirror_jobs').update({ started_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('id', job.job_id);
  expect((await begin(job.job_id)).status, 'a dead running job may restart').toBe('run');
  const second = (await adminJob(job.job_id)).spend_id!;
  expect(second).not.toBe(first);
  const { data: s1 } = await supabaseAdmin.from('mirror_ai_spend').select('state, actual_usd, reserved_usd').eq('id', first).single();
  expect(s1!.state).toBe('settled');
  expect(Number(s1!.actual_usd)).toBe(Number(s1!.reserved_usd));
  await complete(job.job_id, 'restart reply');
  // keep the shared test project's global ceiling clean
  await supabaseAdmin.from('mirror_ai_spend').update({ actual_usd: 0 }).in('id', [first, second]);
});

test('spend: reservations are atomic — 40 parallel reservations for one person admit exactly the daily count', async () => {
  const D = await mk('D');
  const { data: lim } = await supabaseAdmin.rpc('_mirror_limits');
  const cap = (lim as Record<string, number>).person_reply_daily_count;
  const results = await Promise.all(Array.from({ length: cap + 10 }, () =>
    supabaseAdmin.rpc('_mirror_reserve', { p_owner: D.user.id, p_bucket: 'reply', p_max_usd: 0.0001 })));
  const admitted = results.filter((r) => r.data).map((r) => r.data as string);
  expect(results.filter((r) => r.error), 'no reservation errored').toEqual([]);
  expect(admitted.length).toBe(cap);
  for (const id of admitted) await supabaseAdmin.rpc('_mirror_settle', { p_spend: id, p_actual_usd: 0 });
  // the portrait bucket is counted separately
  const p = await supabaseAdmin.rpc('_mirror_reserve', { p_owner: D.user.id, p_bucket: 'portrait', p_max_usd: 0.0001 });
  expect(p.data, 'CONTROL: a full reply bucket does not block portraits').toBeTruthy();
  await supabaseAdmin.rpc('_mirror_settle', { p_spend: p.data, p_actual_usd: 0 });

  // a job begun past the cap is marked capped, and nothing is reserved for it
  const sD = await signIn(D);
  const mirD = await mirrorOf(sD);
  const msg = await send(sD, mirD, 'over the cap');
  const job = await requestReply(sD, msg.id);
  expect((await begin(job.job_id)).status).toBe('capped');
  const j = await adminJob(job.job_id);
  expect(j.state).toBe('capped');
  expect(j.spend_id).toBeNull();
});

test('a reservation past the global or per-person dollar cap is refused (the dollar caps, not only the counts)', async () => {
  const E = await mk('E');
  const { data: lim } = await supabaseAdmin.rpc('_mirror_limits');
  const personUsd = (lim as Record<string, number>).person_reply_daily_usd;
  const over = await supabaseAdmin.rpc('_mirror_reserve', { p_owner: E.user.id, p_bucket: 'reply', p_max_usd: personUsd + 0.01 });
  expect(over.error).toBeNull();
  expect(over.data, 'one call bigger than the person\'s daily allowance is refused').toBeNull();
  const fits = await supabaseAdmin.rpc('_mirror_reserve', { p_owner: E.user.id, p_bucket: 'reply', p_max_usd: personUsd / 2 });
  expect(fits.data, 'CONTROL: a call within the allowance is admitted').toBeTruthy();
  await supabaseAdmin.rpc('_mirror_settle', { p_spend: fits.data, p_actual_usd: 0 });
});

test('portrait: one at a time per owner, the gender choice is stored, a finished portrait lands on the owner\'s mirror only', async () => {
  await ok(sA.client.rpc('set_mirror_gender', { p_gender: 'female' }), 'A picks female');
  await refused(sA.client.rpc('set_mirror_gender', { p_gender: 'robot' }), 'unknown gender');
  const p1 = await ok<{ status: string; job_id: string; gender: string }>(
    supabaseAdmin.rpc('_mirror_begin_portrait', { p_owner: A.user.id }), 'begin portrait');
  expect(p1.status).toBe('run');
  expect(p1.gender).toBe('female');
  const p2 = await ok<{ status: string }>(supabaseAdmin.rpc('_mirror_begin_portrait', { p_owner: A.user.id }), 'second begin');
  expect(p2.status, 'a double tap never starts a second paid generation').toBe('busy');
  const url = `https://example.com/mirror/${randomUUID()}.png`;
  const old = await ok<string>(supabaseAdmin.rpc('_mirror_finish_portrait', {
    p_job: p1.job_id, p_url: url, p_credit: { artist: 'Test Artist' }, p_actual_usd: 0 }), 'finish');
  expect(old).toBe('');
  const mine = await sA.client.from('chat_conversations').select('portrait_url, portrait_gender').eq('id', mirA).single();
  expect(mine.data).toEqual({ portrait_url: url, portrait_gender: 'female' });
  expect((await sB.client.from('chat_conversations').select('id').eq('id', mirA)).data, 'B cannot see A\'s mirror or its portrait').toEqual([]);
  // a finished job cannot be finished again
  expect((await supabaseAdmin.rpc('_mirror_finish_portrait', { p_job: p1.job_id, p_url: 'x', p_credit: {}, p_actual_usd: 0 })).data).toBeNull();
  // the next begin offers the current artist for exclusion
  const p3 = await ok<{ status: string; job_id: string; exclude_artist: string }>(
    supabaseAdmin.rpc('_mirror_begin_portrait', { p_owner: A.user.id }), 'third begin');
  expect(p3.exclude_artist).toBe('Test Artist');
  await supabaseAdmin.rpc('_mirror_fail_job', { p_job: p3.job_id, p_code: 'test', p_actual_usd: null });
  void mirB;
});

test('erase: replies derived from an erased person are scrubbed, their in-flight work is cancelled, and a late completion is refused', async () => {
  const X = await mk('X');
  await createTestMembership(org.id, X.user.id);
  const sX = await signIn(X);
  await myChatIds(sX.client);
  const xMsg = await send(sX, gconv, `X private words ${RUN}`);

  // B copies X's message into B's mirror and the mirror answers: the reply is derived from X
  const clar = await ok<Row>(sB.client.rpc('clarify_chat_message', { p_source: xMsg.id, p_note: 'why?' }), 'B clarifies X');
  const done = await requestReply(sB, clar.id);
  await begin(done.job_id);
  const derived = (await complete(done.job_id, `X seems worried ${RUN}`)).data as Row;
  expect((await adminRow(derived.id)).derived_refs).toContain(await refOf(X.user.id));

  // A second job is in flight when X erases
  const clar2 = await ok<Row>(sB.client.rpc('clarify_chat_message', { p_source: xMsg.id }), 'B clarifies X again');
  const flight = await requestReply(sB, clar2.id);
  expect((await begin(flight.job_id)).status).toBe('run');

  // A reply NOT derived from X survives (control)
  const own = await send(sB, mirB, `unrelated ${RUN}`);
  // B's earlier mirror rows include X's copy, so ask about a fresh message in a fresh mirror context
  const ownJob = await requestReply(sB, own.id);
  await begin(ownJob.job_id);
  const ownReply = (await complete(ownJob.job_id, `unrelated reply ${RUN}`)).data as Row;

  const { error } = await sX.client.rpc('erase_my_account');
  expect(error, `erase_my_account must succeed: ${error?.message}`).toBeNull();

  const scrubbed = await adminRow(derived.id);
  expect(scrubbed.body, 'the derived reply has no text').toBeNull();
  expect(scrubbed.deleted_at).not.toBeNull();
  expect((await adminJob(flight.job_id)).state, 'the in-flight job is cancelled').toBe('cancelled');
  const late = await complete(flight.job_id, `late ${RUN}`);
  expect(late.data, 'a late completion writes nothing').toBeNull();
  expect((await adminMessages(mirB)).some((m) => m.body === `late ${RUN}`)).toBe(false);

  // The "unrelated" reply's context was B's mirror, which held X's copies and the X-derived reply, so it
  // inherited X's ref and is scrubbed too: derivation is transitive through earlier mirror replies.
  expect((await adminJob(ownJob.job_id)).derived_refs).toContain(await refOf(X.user.id));
  expect((await adminRow(ownReply.id)).body).toBeNull();
  // B's own words are B's: the clarify copies keep B's note, only X's quoted words are gone
  const clarAfter = await adminRow(clar.id);
  expect(clarAfter.body).toBe('why?');
  expect((clarAfter.forward_snapshot as { body: unknown } | null)?.body ?? null).toBeNull();
});

test('erase: a reply in a mirror whose context never held the erased person survives (control for the scrub)', async () => {
  const Y = await mk('Y');
  const Z = await mk('Z');
  const sZ = await signIn(Z);
  const mirZ = await mirrorOf(sZ);
  const msg = await send(sZ, mirZ, `Z alone ${RUN}`);
  const job = await requestReply(sZ, msg.id);
  await begin(job.job_id);
  const reply = (await complete(job.job_id, `Z reply ${RUN}`)).data as Row;
  const sY = await signIn(Y);
  await myChatIds(sY.client);
  expect((await sY.client.rpc('erase_my_account')).error).toBeNull();
  expect((await adminRow(reply.id)).body, 'an unrelated reply is untouched by someone else\'s erasure').toBe(`Z reply ${RUN}`);
});
