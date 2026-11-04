/**
 * @file p1604-clarify-session-thread.spec.ts
 * @description P1604 (migration 20261104140000): Clarify of a transcript SESSION thread carries the whole thread, from the root or from
 * any line, newest 100 kept with the true total; the before / conversation / after-round threads keep P1592's single-message rule
 * (the CONTROL: same system_kind, not registered as a session). Runs the real RPC as a real signed-in person.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { signIn, ok, mirrorOf, type SignedIn } from '../helpers/test-chat';

type Anyrow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
test.describe.configure({ mode: 'serial', timeout: 120_000 });

const RUN = Math.random().toString(36).slice(2, 6).toUpperCase();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let n = 0;
const newCode = () => { n += 1; return `${ALPHABET[(n * 7) % 32]}${ALPHABET[(n * 11 + 2) % 32]}${RUN.replace(/[^A-Z2-9]/g, 'K').padEnd(4, 'K').slice(0, 4)}`; };
const SESSION_BODY = 'session|2026-11-04T10:00:00Z|1';

test.describe('P1604: Clarify of a session thread', () => {
  let a: TestUser, b: TestUser;
  let asA: SignedIn;
  let asB: SignedIn;
  let chat = '';
  const roomIds: string[] = [];
  let t0 = Date.now();

  async function root(body: string, registerAsSession: boolean) {
    const { data: msg, error } = await supabaseAdmin.from('chat_messages').insert({
      conversation_id: chat, author_id: null, body, system_kind: 'outside_rounds', created_at: new Date(t0++).toISOString(),
    }).select('id').single();
    expect(error, error?.message).toBeNull();
    if (registerAsSession) {
      const { data: room, error: e2 } = await supabaseAdmin.from('transcribe_rooms').insert({ code: newCode(), conversation_id: chat, ended_at: new Date().toISOString() }).select('id').single();
      expect(e2, e2?.message).toBeNull();
      roomIds.push(room!.id);
      const { error: e3 } = await supabaseAdmin.from('transcribe_session_threads').insert({ room_id: room!.id, conversation_id: chat, root_message_id: msg!.id });
      expect(e3, e3?.message).toBeNull();
    }
    return msg!.id as string;
  }
  async function lines(rootId: string, count: number, prefix: string) {
    const ids: string[] = [];
    const rows = Array.from({ length: count }, (_, i) => ({
      conversation_id: chat, author_id: i % 2 === 0 ? a.user.id : b.user.id, body: `${prefix} ${i}`, thread_root_id: rootId,
      is_transcription: true, created_at: new Date(t0++).toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 50) {
      const { data, error } = await supabaseAdmin.from('chat_messages').insert(rows.slice(i, i + 50)).select('id');
      expect(error, error?.message).toBeNull();
      ids.push(...(data ?? []).map((r) => r.id as string));
    }
    return ids;
  }
  const clarify = (source: string) => ok<Anyrow>(asA.client.rpc('clarify_chat_message', { p_source: source }), 'clarify');

  test.beforeAll(async () => {
    a = await createTestUser({ name: 'P1604 Clarify A' });
    b = await createTestUser({ name: 'P1604 Clarify B' });
    asA = await signIn(a);
    asB = await signIn(b);
    const [lo, hi] = [a.user.id, b.user.id].sort();
    const { data: conv } = await supabaseAdmin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi }).select('id').single();
    chat = conv!.id;
    t0 = Date.now() - 3_600_000;
  });

  test.afterAll(async () => {
    if (roomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', roomIds);
    if (chat) await supabaseAdmin.from('chat_conversations').delete().eq('id', chat);
    for (const u of [a, b]) if (u?.user?.id) { try { await deleteTestUser(u.user.id); } catch { /* ignore */ } }
  });

  test('from a LINE of a session thread: the whole thread comes with it, root included', async () => {
    const r = await root(SESSION_BODY, true);
    const ids = await lines(r, 4, 'session line');
    const cl = await clarify(ids[1]);
    expect(cl.forward_snapshot.body).toBe('session line 1');
    const bodies = (cl.forward_snapshot.thread as Anyrow[]).map((t) => t.body);
    expect(bodies, 'root first, then every other line, oldest first').toEqual([SESSION_BODY, 'session line 0', 'session line 2', 'session line 3']);
    expect(cl.forward_snapshot.thread_total).toBe(4);
    const rootEntry = (cl.forward_snapshot.thread as Anyrow[])[0];
    expect(rootEntry.system_kind, 'the root says it is a system post, so the client shows its title').toBe('outside_rounds');
  });

  test('from the ROOT of a session thread: every line comes with it', async () => {
    const r = await root(SESSION_BODY, true);
    await lines(r, 3, 'root-copy line');
    const cl = await clarify(r);
    expect(cl.forward_snapshot.system_kind).toBe('outside_rounds');
    expect((cl.forward_snapshot.thread as Anyrow[]).map((t) => t.body)).toEqual(['root-copy line 0', 'root-copy line 1', 'root-copy line 2']);
    expect(cl.forward_snapshot.thread_total).toBe(3);
  });

  test('CONTROL: a before-round / conversation / after-round thread (same system_kind, not a session) still copies ONE message', async () => {
    const r = await root('Before round 1', false);
    const ids = await lines(r, 4, 'before line');
    const fromLine = await clarify(ids[1]);
    expect(fromLine.forward_snapshot.body).toBe('before line 1');
    expect(fromLine.forward_snapshot.thread).toEqual([]);
    expect(fromLine.forward_snapshot.thread_total).toBe(0);
    const fromRoot = await clarify(r);
    expect(fromRoot.forward_snapshot.thread).toEqual([]);
    expect(fromRoot.forward_snapshot.thread_total).toBe(0);
  });

  test('a 130-line session now comes whole (the limit is 720 lines + the root: 4 speakers x 180 one-minute blocks)', async () => {
    const r = await root(SESSION_BODY, true);
    const ids = await lines(r, 130, 'mid line');
    const cl = await clarify(ids[129]);
    const thread = cl.forward_snapshot.thread as Anyrow[];
    expect(thread).toHaveLength(130);                       // the root and the 129 other lines
    expect(cl.forward_snapshot.thread_total).toBe(130);
    expect(thread[0].body).toBe(SESSION_BODY);
    expect(cl.forward_snapshot.session_thread, 'the snapshot tells the mirror it is a transcript').toBe(true);
  });

  test('a session beyond the limit: the ROOT and the newest 720 other lines are kept, the true total is reported', async () => {
    const r = await root(SESSION_BODY, true);
    const ids = await lines(r, 800, 'huge line');
    const cl = await clarify(ids[799]);
    const thread = cl.forward_snapshot.thread as Anyrow[];
    expect(thread).toHaveLength(721);
    expect(thread[0].body, 'the root is always there, so the title and the transcript mark survive the cut').toBe(SESSION_BODY);
    expect(thread[1].body, 'oldest kept line: 799 others, newest 720 = lines 79..798').toBe('huge line 79');
    expect(thread[thread.length - 1].body).toBe('huge line 798');
    expect(cl.forward_snapshot.thread_total, 'root + the 799 other lines').toBe(800);
  });

  test('CONTROL: an ordinary thread (not a session) keeps 100 and carries no session mark', async () => {
    const { data: top } = await supabaseAdmin.from('chat_messages').insert({
      conversation_id: chat, author_id: a.user.id, body: 'ordinary root', created_at: new Date(t0++).toISOString(),
    }).select('id').single();
    const ids = await lines(top!.id as string, 130, 'ord line');
    const cl = await clarify(ids[129]);
    expect((cl.forward_snapshot.thread as Anyrow[]).length).toBe(100);
    expect(cl.forward_snapshot.thread_total).toBe(130);
    expect(cl.forward_snapshot.session_thread).toBeUndefined();
  });

  test('a copied session thread is not cut at 15,000 characters, and a copy larger than the ordinary offer window does not starve the older rows', async () => {
    const mir = await mirrorOf(asA);
    await ok<Anyrow>(asA.client.rpc('send_chat_message', { p_conversation: mir, p_body: 'older context message' }), 'older');
    const r = await root(SESSION_BODY, true);
    const ids = await lines(r, 200, 'x'.repeat(790));           // ~158,000 characters: more than the ordinary 150,000-character offer window
    const cl = await clarify(ids[199]);
    const job = (await ok<Array<{ job_id: string }>>(asA.client.rpc('mirror_request_reply', { p_message: cl.id }), 'request'))[0]!;
    const begun = await ok<Anyrow>(supabaseAdmin.rpc('_mirror_begin_job', { p_job: job.job_id }), 'begin');
    const item = (begun.context as Anyrow[]).find((c) => c.clarify?.body === `${'x'.repeat(790)} 199`)!;   // earlier tests left other session copies in this mirror
    expect(item, 'the session copy is offered').toBeTruthy();
    const chars = (item.clarify.thread as Anyrow[]).reduce((n, t) => n + String(t.body ?? '').length, 0);
    expect(chars, 'far more than the 15,000-character cap of an ordinary copy').toBeGreaterThan(100_000);
    expect(begun.session).toBe(true);
    expect((begun.context as Anyrow[]).some((c) => c.body === 'older context message'), 'the window was widened, so the older message is still offered').toBe(true);
    await supabaseAdmin.rpc('_mirror_fail_job', { p_job: job.job_id, p_code: 'test', p_actual_usd: 0, p_attempt: begun.attempt });
  });

  test('the mirror: a Clarified session thread reserves the session cost and is marked; an ordinary Clarify reserves the standard cost', async () => {
    const r = await root(SESSION_BODY, true);
    const ids = await lines(r, 6, 'mirror line');
    const cl = await clarify(ids[2]);
    const job = (await ok<Array<{ job_id: string }>>(asA.client.rpc('mirror_request_reply', { p_message: cl.id }), 'request reply'))[0]!;
    const begun = await ok<Anyrow>(supabaseAdmin.rpc('_mirror_begin_job', { p_job: job.job_id }), 'begin');
    expect(begun.status).toBe('run');
    expect(begun.session).toBe(true);
    expect(Number(begun.reserved_usd), '(100,000 in x $1.50 + 4,000 out x $7.50) / 1e6 x 1.25').toBe(0.225);
    const item = (begun.context as Anyrow[]).find((c) => c.clarify?.body === 'mirror line 2')!;   // earlier tests left other Clarifies in this mirror
    expect(item.clarify.session_thread).toBe(true);
    expect(item.clarify.thread.length).toBe(6);              // root + the 5 other lines
    await supabaseAdmin.rpc('_mirror_fail_job', { p_job: job.job_id, p_code: 'test', p_actual_usd: 0, p_attempt: begun.attempt });

    const { data: top } = await supabaseAdmin.from('chat_messages').insert({ conversation_id: chat, author_id: a.user.id, body: 'plain root', created_at: new Date(t0++).toISOString() }).select('id').single();
    const plainIds = await lines(top!.id as string, 4, 'plain line');
    // by B, whose mirror holds no session copy: a session copy ANYWHERE in the offered rows (A's earlier ones) makes a reply a session reply
    const plain = await ok<Anyrow>(asB.client.rpc('clarify_chat_message', { p_source: plainIds[1] }), 'clarify as B');
    const job2 = (await ok<Array<{ job_id: string }>>(asB.client.rpc('mirror_request_reply', { p_message: plain.id }), 'request reply 2'))[0]!;
    const begun2 = await ok<Anyrow>(supabaseAdmin.rpc('_mirror_begin_job', { p_job: job2.job_id }), 'begin 2');
    expect(begun2.session).toBe(false);
    expect(Number(begun2.reserved_usd)).toBe(0.105);
    await supabaseAdmin.rpc('_mirror_fail_job', { p_job: job2.job_id, p_code: 'test', p_actual_usd: 0, p_attempt: begun2.attempt });
  });
});
