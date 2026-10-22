/**
 * @file p1546-threads-everywhere.spec.ts
 * @description DB canary for P1546 (supabase/migrations/20261022160000_p1546_threads_everywhere.sql).
 *
 * THE INVARIANTS.
 *   1. Threads exist in a 1:1 and in the mirror. A thread reply is readable by exactly whoever can read
 *      its conversation (the two people / the owner only), over REST and over get_thread_stats.
 *   2. The mirror answers where it was asked: outside threads stays outside, inside a thread stays in
 *      that thread, even with two threads asked back to back and completed out of order. A thread
 *      answer never moves the mirror's last_message_at, and a question only sees its own scope.
 *   3. A deleted thread root keeps its replies readable but takes no new replies (as in channels).
 *
 * EVERY REFUSAL HAS A CONTROL: each refused shape is paired with the same shape succeeding for the caller
 * entitled to it. The model is not called: the service-role steps are driven with a fixed text, and the
 * spend rows are settled to 0 so the shared test project's ceiling is not consumed.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from '../helpers/test-organization';
import { RUN, signIn, ok, refused, mirrorOf, myChatIds, purgeChatFor, type SignedIn, type Row } from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const created: TestUser[] = [];
const orgs: TestOrganization[] = [];
const convs: string[] = [];
const spendIds: string[] = [];

async function mk(label: string): Promise<TestUser> {
  const u = await createTestUser({ name: `Th${label} ${RUN}` });
  created.push(u);
  return u;
}

const send = (s: SignedIn, conv: string, body: string, extra: Record<string, unknown> = {}) =>
  ok<Row>(s.client.rpc('send_chat_message', { p_conversation: conv, p_body: body, ...extra }), `send "${body}"`);

interface JobRef { job_id: string }
interface Begin { status: string; context?: Array<{ body?: string }> }
interface Stat { root_id: string; reply_count: number; recent_author_ids: string[] }

const requestReply = async (s: SignedIn, message: string) =>
  (await ok<JobRef[]>(s.client.rpc('mirror_request_reply', { p_message: message }), 'mirror_request_reply'))[0]!;
const begin = async (job: string) => {
  const b = await ok<Begin>(supabaseAdmin.rpc('_mirror_begin_job', { p_job: job }), '_mirror_begin_job');
  const { data } = await supabaseAdmin.from('mirror_jobs').select('spend_id').eq('id', job).single();
  if (data?.spend_id) spendIds.push(data.spend_id as string);
  return b;
};
const complete = async (job: string, body: string) => {
  const { data, error } = await supabaseAdmin.rpc('_mirror_complete_job', { p_job: job, p_body: body, p_actual_usd: 0 });
  if (error) throw new Error(`_mirror_complete_job: ${error.message}`);
  return data as Row;
};
const ctxText = (b: Begin) => JSON.stringify(b.context ?? []);
async function lastMessageAt(conv: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('chat_conversations').select('last_message_at').eq('id', conv).single();
  if (error) throw new Error(error.message);
  return data.last_message_at as string | null;
}
/** REST equivalent of listThread: the root plus its replies, as the signed-in user sees them. */
async function threadIds(s: SignedIn, conv: string, root: string): Promise<string[]> {
  const { data, error } = await s.client.from('chat_messages').select('id').eq('conversation_id', conv)
    .or(`id.eq.${root},thread_root_id.eq.${root}`);
  if (error) throw new Error(`threadIds: ${error.message}`);
  return (data ?? []).map((r) => r.id as string);
}
async function adminRow(id: string): Promise<Row> {
  const { data, error } = await supabaseAdmin.from('chat_messages').select('*').eq('id', id).single();
  if (error) throw new Error(`adminRow: ${error.message}`);
  return data as Row;
}

let org: TestOrganization;
let A: TestUser, B: TestUser, C: TestUser;
let sA: SignedIn, sB: SignedIn, sC: SignedIn;
let dm: string, mirA: string;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  org = await createTestOrganization({ name: `Threads canary org ${RUN}` });
  orgs.push(org);
  [A, B, C] = await Promise.all([mk('A'), mk('B'), mk('C')]);
  await createTestMembership(org.id, A.user.id);
  await createTestMembership(org.id, B.user.id);
  sA = await signIn(A);
  sB = await signIn(B);
  sC = await signIn(C);
  await myChatIds(sA.client);
  await myChatIds(sB.client);
  dm = await ok<string>(sA.client.rpc('start_dm', { p_other: B.user.id }), 'A starts dm with B');
  convs.push(dm);
  mirA = await mirrorOf(sA);
});

test.afterAll(async () => {
  test.setTimeout(240_000);
  if (spendIds.length) await supabaseAdmin.from('mirror_ai_spend').update({ actual_usd: 0 }).in('id', spendIds);
  await purgeChatFor(created.map((u) => u.user.id), convs);
  for (const u of created) await deleteTestUser(u.user.id).catch(() => {});
  for (const o of orgs) await deleteTestOrganization(o.id);
});

test('DM: both people read a thread reply, an outsider gets nothing and no stats, the member gets the count', async () => {
  const root = await send(sA, dm, `dm-root-${RUN}`);
  const reply = await send(sB, dm, `dm-reply-${RUN}`, { p_thread_root: root.id });
  expect(reply.thread_root_id, 'the reply is a thread reply').toBe(root.id);
  expect((await adminRow(reply.id)).thread_root_id).toBe(root.id);

  // CONTROL: both members read the reply by id and through the listThread-equivalent query.
  for (const [who, s] of [['A', sA], ['B', sB]] as const) {
    const byId = await s.client.from('chat_messages').select('id').eq('id', reply.id);
    expect(byId.data?.map((r) => r.id), `${who} reads the reply by id`).toEqual([reply.id]);
    expect((await threadIds(s, dm, root.id)).sort(), `${who} reads root + reply`).toEqual([root.id, reply.id].sort());
  }
  // A can also thread-reply (the other direction), B reads it
  const reply2 = await send(sA, dm, `dm-reply2-${RUN}`, { p_thread_root: root.id });
  expect((await threadIds(sB, dm, root.id)).sort()).toEqual([root.id, reply.id, reply2.id].sort());

  // REFUSALS: the outsider C reads nothing and cannot ask for stats or write into the thread
  const cById = await sC.client.from('chat_messages').select('id').in('id', [root.id, reply.id]);
  expect(cById.error).toBeNull();
  expect(cById.data, 'C reads neither the root nor the reply').toEqual([]);
  expect(await threadIds(sC, dm, root.id)).toEqual([]);
  await refused(sC.client.rpc('get_thread_stats', { p_conversation: dm, p_roots: [root.id] }), 'outsider asks dm thread stats');
  await refused(sC.client.rpc('send_chat_message', { p_conversation: dm, p_body: 'x', p_thread_root: root.id }), 'outsider thread-replies in the dm');

  // CONTROL for the stats refusal: the members get the count (2 replies, newest author first)
  for (const s of [sA, sB]) {
    const stats = await ok<Stat[]>(s.client.rpc('get_thread_stats', { p_conversation: dm, p_roots: [root.id] }), 'dm stats');
    expect(stats.length).toBe(1);
    expect(stats[0]!.root_id).toBe(root.id);
    expect(stats[0]!.reply_count).toBe(2);
    expect(new Set(stats[0]!.recent_author_ids)).toEqual(new Set([A.user.id, B.user.id]));
  }

  // a thread reply does not become a thread root
  await refused(sA.client.rpc('send_chat_message', { p_conversation: dm, p_body: 'x', p_thread_root: reply.id }), 'thread rooted in a thread reply');
  // a root of another conversation is no root here (control: the same call with the dm's own root worked above)
  const mirNote = await send(sA, mirA, `mirror-note-${RUN}`);
  await refused(sA.client.rpc('send_chat_message', { p_conversation: dm, p_body: 'x', p_thread_root: mirNote.id }), 'thread rooted in another conversation');
});

test('DM: a single reply counts 1 for the member who asks', async () => {
  const root = await send(sA, dm, `dm-count-root-${RUN}`);
  const none = await ok<Stat[]>(sA.client.rpc('get_thread_stats', { p_conversation: dm, p_roots: [root.id] }), 'stats before');
  expect(none[0]?.reply_count, 'a root without replies answers 0').toBe(0);
  await send(sB, dm, `dm-count-reply-${RUN}`, { p_thread_root: root.id });
  const stats = await ok<Stat[]>(sA.client.rpc('get_thread_stats', { p_conversation: dm, p_roots: [root.id] }), 'stats after');
  expect(stats[0]!.reply_count).toBe(1);
  expect(stats[0]!.recent_author_ids).toEqual([B.user.id]);
});

test('mirror: the owner threads in their own mirror; another user can neither read it nor write into it', async () => {
  const root = await send(sA, mirA, `mir-root-${RUN}`);
  const reply = await send(sA, mirA, `mir-reply-${RUN}`, { p_thread_root: root.id });
  expect(reply.thread_root_id).toBe(root.id);

  // CONTROL: the owner reads root + reply and the stats
  expect((await threadIds(sA, mirA, root.id)).sort()).toEqual([root.id, reply.id].sort());
  const stats = await ok<Stat[]>(sA.client.rpc('get_thread_stats', { p_conversation: mirA, p_roots: [root.id] }), 'owner mirror stats');
  expect(stats[0]!.reply_count).toBe(1);

  // REFUSALS: B (a real user with their own mirror) reads 0 rows, gets no stats, cannot write into A's thread
  const bRead = await sB.client.from('chat_messages').select('id').in('id', [root.id, reply.id]);
  expect(bRead.error).toBeNull();
  expect(bRead.data).toEqual([]);
  expect(await threadIds(sB, mirA, root.id)).toEqual([]);
  await refused(sB.client.rpc('get_thread_stats', { p_conversation: mirA, p_roots: [root.id] }), 'B asks A\'s mirror thread stats');
  await refused(sB.client.rpc('send_chat_message', { p_conversation: mirA, p_body: 'x', p_thread_root: root.id }), 'B thread-replies into A\'s mirror');
  await refused(sC.client.rpc('send_chat_message', { p_conversation: mirA, p_body: 'x', p_thread_root: root.id }), 'C thread-replies into A\'s mirror');
  // ground truth: nothing of B's landed there
  expect((await supabaseAdmin.from('chat_messages').select('id').eq('conversation_id', mirA).eq('thread_root_id', root.id)).data!.length).toBe(1);
});

test('mirror answers in place: outside threads stays outside, each thread gets its own answer even when completed out of order, scopes never mix', async () => {
  // --- outside a thread. A thread reply exists first so the "no thread bodies in context" check can bite.
  const R = await send(sA, mirA, `OUT-ROOT-${RUN}`);
  await send(sA, mirA, `OUT-THREADREPLY-${RUN}`, { p_thread_root: R.id });
  const QO = await send(sA, mirA, `OUT-QUESTION-${RUN}`);
  const jO = await requestReply(sA, QO.id);
  const bO = await begin(jO.job_id);
  expect(bO.status).toBe('run');
  expect(ctxText(bO), 'CONTROL: the outside context holds the main-chat root').toContain(`OUT-ROOT-${RUN}`);
  expect(ctxText(bO), 'CONTROL: and the question itself').toContain(`OUT-QUESTION-${RUN}`);
  expect(ctxText(bO), 'no thread reply body in an outside-thread question\'s context').not.toContain(`OUT-THREADREPLY-${RUN}`);
  const aO = await complete(jO.job_id, `answer-out-${RUN}`);
  expect(aO.kind).toBe('agent');
  expect(aO.thread_root_id, 'an outside answer stays outside threads').toBeNull();
  expect(aO.reply_to_id).toBe(QO.id);
  const outAt = await lastMessageAt(mirA);
  expect(outAt, 'CONTROL: a main-chat answer moves last_message_at').toBe(aO.created_at);

  // --- two threads, asked back to back
  const R1 = await send(sA, mirA, `T1-ROOT-${RUN}`);
  const R2 = await send(sA, mirA, `T2-ROOT-${RUN}`);
  const Q1 = await send(sA, mirA, `T1-QUESTION-${RUN}`, { p_thread_root: R1.id });
  const Q2 = await send(sA, mirA, `T2-QUESTION-${RUN}`, { p_thread_root: R2.id });
  const before = await lastMessageAt(mirA);
  const j1 = await requestReply(sA, Q1.id);
  const j2 = await requestReply(sA, Q2.id);
  expect(j1.job_id).not.toBe(j2.job_id);

  const b1 = await begin(j1.job_id);
  const b2 = await begin(j2.job_id);
  expect(b1.status).toBe('run');
  expect(b2.status).toBe('run');
  const c1 = ctxText(b1);
  expect(c1, 'CONTROL: thread 1 sees its root').toContain(`T1-ROOT-${RUN}`);
  expect(c1, 'CONTROL: thread 1 sees its question').toContain(`T1-QUESTION-${RUN}`);
  expect(c1).not.toContain(`T2-ROOT-${RUN}`);
  expect(c1).not.toContain(`T2-QUESTION-${RUN}`);
  expect(c1, 'no main-chat message in a thread question\'s context').not.toContain(`OUT-QUESTION-${RUN}`);
  expect(c1).not.toContain(`OUT-ROOT-${RUN}`);
  const c2 = ctxText(b2);
  expect(c2).toContain(`T2-ROOT-${RUN}`);
  expect(c2).toContain(`T2-QUESTION-${RUN}`);
  expect(c2).not.toContain(`T1-ROOT-${RUN}`);
  expect(c2).not.toContain(`T1-QUESTION-${RUN}`);

  // interleaved: begin1, begin2, complete2, complete1
  const a2 = await complete(j2.job_id, `answer-2-${RUN}`);
  const a1 = await complete(j1.job_id, `answer-1-${RUN}`);
  expect(a1.thread_root_id, 'answer 1 sits in thread 1').toBe(R1.id);
  expect(a1.reply_to_id).toBe(Q1.id);
  expect(a2.thread_root_id, 'answer 2 sits in thread 2').toBe(R2.id);
  expect(a2.reply_to_id).toBe(Q2.id);
  expect(a1.kind).toBe('agent');
  expect(a2.kind).toBe('agent');
  // persisted, not only returned
  expect((await adminRow(a1.id)).thread_root_id).toBe(R1.id);
  expect((await adminRow(a2.id)).thread_root_id).toBe(R2.id);
  // the owner reads each thread with its answer, and the answers are not in the other thread
  expect((await threadIds(sA, mirA, R1.id)).sort()).toEqual([R1.id, Q1.id, a1.id].sort());
  expect((await threadIds(sA, mirA, R2.id)).sort()).toEqual([R2.id, Q2.id, a2.id].sort());
  // thread answers never moved the mirror
  expect(await lastMessageAt(mirA), 'thread answers do not move last_message_at').toBe(before);
  // nobody else reads the answers
  expect((await sB.client.from('chat_messages').select('id').in('id', [a1.id, a2.id])).data).toEqual([]);
});

test('clarify from a mirror thread copies the people in it, never the mirror agent\'s answer (erasure cannot reach a copy)', async () => {
  const R = await send(sA, mirA, `CL-ROOT-${RUN}`);
  const Q = await send(sA, mirA, `CL-QUESTION-${RUN}`, { p_thread_root: R.id });
  const job = await requestReply(sA, Q.id);
  expect((await begin(job.job_id)).status).toBe('run');
  const answer = await complete(job.job_id, `CL-AGENT-ANSWER-${RUN}`);
  expect(answer.thread_root_id, 'the answer is in the thread').toBe(R.id);
  const later = await send(sA, mirA, `CL-LATER-${RUN}`, { p_thread_root: R.id });

  const cl = await ok<Row>(sA.client.rpc('clarify_chat_message', { p_source: later.id }), 'clarify a mirror thread reply');
  const copied = JSON.stringify((cl.forward_snapshot as { thread?: unknown }).thread ?? []);
  // control: the owner's own thread messages ride along
  expect(copied, 'the thread root is copied').toContain(`CL-ROOT-${RUN}`);
  expect(copied, 'the owner\'s question is copied').toContain(`CL-QUESTION-${RUN}`);
  expect(copied, 'the mirror agent\'s answer is never copied').not.toContain(`CL-AGENT-ANSWER-${RUN}`);
});

test('DM: deleting a thread root keeps the replies and closes the thread to new replies', async () => {
  const root = await send(sA, dm, `del-root-${RUN}`);
  const reply = await send(sB, dm, `del-reply-${RUN}`, { p_thread_root: root.id });
  // CONTROL: before the delete, a further reply works
  const early = await send(sA, dm, `del-early-${RUN}`, { p_thread_root: root.id });

  // only the author may delete the root: B is refused (control for the success below)
  await refused(sB.client.rpc('delete_chat_message', { p_message: root.id }), 'B deletes A\'s root');
  await ok(sA.client.rpc('delete_chat_message', { p_message: root.id }), 'A deletes own root');
  expect((await adminRow(root.id)).deleted_at).not.toBeNull();

  for (const [who, s] of [['A', sA], ['B', sB]] as const) {
    const left = await s.client.from('chat_messages').select('id, deleted_at').in('id', [reply.id, early.id]);
    expect(left.data?.map((r) => r.id).sort(), `${who} still reads the replies`).toEqual([reply.id, early.id].sort());
    expect(left.data!.every((r) => r.deleted_at === null)).toBe(true);
  }
  for (const [who, s] of [['A', sA], ['B', sB]] as const) {
    const e = await refused(s.client.rpc('send_chat_message', { p_conversation: dm, p_body: 'late', p_thread_root: root.id }), `${who} replies under the deleted root`);
    expect(e.message).toMatch(/thread not available/);
  }
  // CONTROL: the dm itself is still writable
  await send(sB, dm, `del-after-${RUN}`);
});
