/**
 * P1631 step 1: Clarify drafts (migration 20261110153000_p1631_clarify_drafts.sql) on the test database.
 *   npm run test:integration -- src/tests/integration/p1631-clarify-drafts.test.ts
 * The model is not involved: runs are begun and completed through the service-role worker functions with hand-written results, as
 * p1614-edit-point.test.ts does. The handler with a stub model is covered offline by src/tests/p1631-clarify-draft-handler.test.ts.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1631 ${RUN}`;
const noSession = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, noSession);
const A = admin as unknown as SupabaseClient;

async function signIn(u: TestUser): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, noSession);
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return c;
}
const rpc = (c: SupabaseClient, fn: string, args: Row = {}) => c.rpc(fn, args) as unknown as Promise<{ data: any; error: any }>;
async function ok(c: SupabaseClient, fn: string, args: Row = {}): Promise<any> {
  const { data, error } = await rpc(c, fn, args);
  if (error) throw new Error(`${fn}: ${error.code} ${error.message}`);
  return data;
}

const users: TestUser[] = [];
async function mk(label: string) {
  const u = await createTestUser({ name: `P1631 ${label} ${RUN}` });
  users.push(u);
  return { u, c: await signIn(u), id: u.user.id as string, name: `P1631 ${label} ${RUN}` };
}

let a: Awaited<ReturnType<typeof mk>>;
let b: Awaited<ReturnType<typeof mk>>;
let c3: Awaited<ReturnType<typeof mk>>;
let conv: string;
const msgs: Row[] = [];

const draftRow = async (id: string) => (await admin.from('clarify_drafts').select('*').eq('id', id).single()).data as Row;
const spendOf = async (id: string) => (await admin.from('mirror_ai_spend').select('*').eq('id', (await draftRow(id)).spend_id).single()).data as Row;
const begin = (id: string) => ok(A, '_clarify_begin', { p_draft: id });
// the run token is the draft's current spend (P1631 review fix M1/M2); a test that means a stale run passes its own token
const token = async (id: string) => (await draftRow(id)).spend_id as string | null;
const complete = async (id: string, result: Row, usd: number | null, run?: string | null) =>
  ok(A, '_clarify_complete', { p_draft: id, p_result: result, p_usd: usd, p_run: run === undefined ? await token(id) : run });
const failRun = async (id: string, code: string, usd: number | null, run?: string | null) =>
  ok(A, '_clarify_fail', { p_draft: id, p_code: code, p_usd: usd, p_run: run === undefined ? await token(id) : run });
const goodResult = (stmt: string, ids: { a?: string[]; b?: string[] } = {}) => ({ decision: 'draft', statement: stmt, cited: { a: ids.a ?? [], b: ids.b ?? [] } });

async function finishActive(owner = a): Promise<void> {
  // leave no active draft behind between scenarios
  const act = (await admin.from('clarify_drafts').select('id, state').eq('owner_id', owner.id).in('state', ['queued', 'running'])).data ?? [];
  for (const d of act) {
    if (d.state === 'queued') await begin(d.id);
    await failRun(d.id, 'test_cleanup', 0);
  }
  // The suite's throwaway user makes more runs than one person's daily cap (per_person count) allows. With nothing active,
  // its settled spend rows can go, so later scenarios test their own rule rather than the cap (the cap has its own case).
  await admin.from('mirror_ai_spend').delete().eq('owner_id', owner.id).eq('bucket', 'canvas');
}

beforeAll(async () => {
  a = await mk('A');
  b = await mk('B');
  c3 = await mk('C');
  // a DM needs a shared reason (an event, an organisation) to be STARTED; the fixture writes the conversation row directly
  const [lo, hi] = [a.id, b.id].sort();
  const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: a.id }).select('id').single();
  if (made.error) throw new Error(`fixture dm: ${made.error.message}`);
  conv = made.data.id as string;
  const send = async (who: typeof a, body: string) => {
    const r = await ok(who.c, 'send_chat_message', { p_conversation: conv, p_body: body, p_client_id: randomUUID() });
    msgs.push(r);
    return r;
  };
  await send(b, `${TAG} I think we should wait a month before the pricing change.`);
  await send(a, `${TAG} Waiting costs us the quarter.`);
  await send(b, `${TAG} The pressed line: pricing needs a trial first.`);
  await send(a, `${TAG} Fine, but who decides?`);
});

afterAll(async () => {
  const ids = users.map((u) => u.user.id);
  await admin.from('points').delete().like('statement', `${TAG}%`);
  await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
  await deleteTestUsers(users.map((u) => u.user.id));
});

describe('P1631 clarify drafts', () => {
  let draft = '';
  let root = '';

  it('start: the copy lands in the presser\'s own Mirror as the thread root and a queued draft is made; an outsider is refused', async () => {
    const pressed = msgs[2]!.id;
    const bad = await rpc(c3.c, 'clarify_start', { p_source: pressed });
    expect(bad.error?.code, 'an outsider').toBe('42501');
    const r = await ok(a.c, 'clarify_start', { p_source: pressed });
    expect(r.status).toBe('started');
    draft = r.draft_id; root = r.thread_root_id;
    const copy = (await admin.from('chat_messages').select('id, kind, conversation_id, forwarded_from_message_id').eq('id', root).single()).data as Row;
    expect(copy.kind).toBe('clarify');
    expect(copy.conversation_id).toBe(r.mirror_conversation_id);
    expect(copy.forwarded_from_message_id).toBe(pressed);
    const row = await draftRow(draft);
    expect(row).toMatchObject({ state: 'queued', owner_id: a.id, source_conversation_id: conv, source_message_id: pressed, thread_root_id: root });
    // the owner reads it through the column grant; the other participant cannot
    expect((await a.c.from('clarify_drafts').select('id, state').eq('id', draft)).data).toHaveLength(1);
    expect((await b.c.from('clarify_drafts').select('id').eq('id', draft)).data).toHaveLength(0);
    const spend = await a.c.from('clarify_drafts').select('spend_id').eq('id', draft);
    expect(spend.error, 'spend_id is not granted').toBeTruthy();
  });

  it('D8: a second press while one is active answers busy and writes no second copy; a second queued row is refused by the index', async () => {
    const before = (await admin.from('chat_messages').select('id').eq('kind', 'clarify').eq('author_id', a.id)).data!.length;
    expect((await ok(a.c, 'clarify_start', { p_source: msgs[0]!.id })).status).toBe('busy');
    expect((await admin.from('chat_messages').select('id').eq('kind', 'clarify').eq('author_id', a.id)).data!.length).toBe(before);
    expect((await ok(a.c, 'clarify_another', { p_thread_root: root })).status).toBe('busy');
    const dup = await admin.from('clarify_drafts').insert({ owner_id: a.id, mirror_conversation_id: (await draftRow(draft)).mirror_conversation_id, thread_root_id: root, source_conversation_id: conv, source_message_id: msgs[2]!.id });
    expect(dup.error?.code).toBe('23505');
  });

  it('the generic Mirror reply is silent in the thread: no job for the root', async () => {
    const r = await rpc(a.c, 'mirror_request_reply', { p_message: root });
    expect(r.error).toBeNull();
    expect(r.data ?? []).toHaveLength(0);
    expect((await admin.from('mirror_jobs').select('id').eq('trigger_message_id', root)).data).toHaveLength(0);
  });

  it('begin: the context is the pressed row, the thread and the chat up to the press, as {id,text} with no names; the spend is reserved in the canvas bucket', async () => {
    // a line written AFTER the press is never part of it
    const late = await ok(b.c, 'send_chat_message', { p_conversation: conv, p_body: `${TAG} written after the press`, p_client_id: randomUUID() });
    const r = await begin(draft);
    expect(r.status).toBe('run');
    // the pressed row was written by b and a pressed Clarify: the author is "other", a flag and never a name
    expect(r.source_message).toMatchObject({ id: msgs[2]!.id, is_pressed: true, pressed_author: 'other' });
    const chatIds = r.surrounding_chat.map((x: Row) => x.id);
    expect(chatIds).toEqual([msgs[0]!.id, msgs[1]!.id, msgs[3]!.id]);   // oldest first; every line before the press, never the pressed one
    expect(chatIds).not.toContain(late.id);
    for (const row of [r.source_message, ...r.surrounding_chat, ...r.thread]) expect(Object.keys(row).filter((k) => !['id', 'text', 'is_pressed', 'pressed_author'].includes(k))).toEqual([]);
    const text = JSON.stringify(r);
    expect(text).not.toContain(a.name);
    expect(text).not.toContain(b.name);
    const row = await draftRow(draft);
    expect(row.state).toBe('running');
    expect(row.sent_ids.sort()).toEqual([msgs[2]!.id, msgs[0]!.id, msgs[1]!.id, msgs[3]!.id].sort());
    expect(row.derived_refs.length, 'whose words were read').toBeGreaterThanOrEqual(2);
    const spend = await spendOf(draft);
    expect(spend).toMatchObject({ bucket: 'canvas', owner_id: a.id, state: 'reserved' });
    expect(Number(spend.reserved_usd)).toBeCloseTo(0.27, 6);
    expect((await begin(draft)).status, 'a second begin while running').toBe('busy');
  });

  it('D6: an id that was not sent fails the draft bad_output, settles at the actual cost and creates no point', async () => {
    const r = await complete(draft, goodResult(`${TAG} bad`, { a: [msgs[2]!.id], b: [randomUUID()] }), 0.01);
    expect(r).toMatchObject({ status: 'failed', code: 'bad_output' });
    expect((await draftRow(draft))).toMatchObject({ state: 'failed', error_code: 'bad_output', point_id: null });
    expect(await spendOf(draft)).toMatchObject({ state: 'settled' });
    expect(Number((await spendOf(draft)).actual_usd)).toBeCloseTo(0.01, 6);
    expect((await admin.from('points').select('id').eq('statement', `${TAG} bad`)).data).toHaveLength(0);
  });

  it('D6: statement bounds (0 and 301 characters) fail; a refusal answering an instruction fails', async () => {
    expect((await ok(a.c, 'clarify_retry', { p_draft: draft })).status).toBe('started');
    await begin(draft);
    expect((await complete(draft, goodResult(''), 0.01)).code).toBe('bad_output');
    await ok(a.c, 'clarify_retry', { p_draft: draft });
    await begin(draft);
    expect((await complete(draft, goodResult('x'.repeat(301)), 0.01)).code).toBe('bad_output');
  });

  it('retry then complete: a private point of the presser, no tags, listed nowhere but the thread, owner-only; cited lines resolve without names', async () => {
    expect((await ok(a.c, 'clarify_retry', { p_draft: draft })).status).toBe('started');
    await begin(draft);
    const r = await complete(draft, goodResult(`${TAG} Pricing needs a trial before launch.`, { a: [msgs[2]!.id], b: [msgs[0]!.id] }), 0.02);
    expect(r.status).toBe('done');
    const p = (await admin.from('points').select('*').eq('id', r.point_id).single()).data as Row;
    expect(p).toMatchObject({ visibility: 'private', first_validator_id: a.id, tags: [], system_tags: [] });
    expect((await a.c.from('points').select('id').eq('id', p.id)).data).toHaveLength(1);
    expect((await b.c.from('points').select('id').eq('id', p.id)).data, 'the other participant').toHaveLength(0);
    expect((await c3.c.from('points').select('id').eq('id', p.id)).data).toHaveLength(0);
    // D7: no public list and no canvas reader can see it
    expect((await a.c.from('points').select('id').eq('visibility', 'public').eq('id', p.id)).data).toHaveLength(0);
    const t = await ok(a.c, 'get_clarify_thread', { p_thread_root: root });
    const d = t.drafts.find((x: Row) => x.id === draft);
    expect(d).toMatchObject({ state: 'done', point: { id: p.id, owner_position: null } });
    expect(d.cited.a.map((x: Row) => x.id)).toEqual([msgs[2]!.id]);
    expect(d.cited.a[0].text).toContain('pressed line');
    expect(d.cited.b.map((x: Row) => x.id)).toEqual([msgs[0]!.id]);
    for (const q of [...d.cited.a, ...d.cited.b]) expect(Object.keys(q).sort()).toEqual(['at', 'id', 'text']);
    expect(JSON.stringify(t)).not.toContain(b.name);
    expect((await ok(b.c, 'get_clarify_thread', { p_thread_root: root })).drafts, 'someone else asking').toEqual([]);
  });

  it('the already-drafted list carries this point into the next run', async () => {
    const r = await ok(a.c, 'clarify_another', { p_thread_root: root, p_instruction: '  about the trial length  ' });
    expect(r.status).toBe('started');
    const row = await draftRow(r.draft_id);
    expect(row.instruction).toBe('about the trial length');
    const run = await begin(r.draft_id);
    expect(run.owner_instruction).toBe('about the trial length');
    expect(run.already_drafted).toEqual([`${TAG} Pricing needs a trial before launch.`]);
    // a refusal cannot answer an explicit instruction
    const bad = await complete(r.draft_id, { decision: 'refuse', suggestions: ['a', 'b'] }, 0.01);
    expect(bad).toMatchObject({ status: 'failed', code: 'bad_output' });
    expect((await rpc(a.c, 'clarify_another', { p_thread_root: root, p_instruction: 'x'.repeat(501) })).error?.code).toBe('22023');
  });

  it('refusal: no instruction, a refusal with suggestions is stored (at most three, trimmed) and shown; the cited ids stay empty', async () => {
    const r = await ok(a.c, 'clarify_another', { p_thread_root: root });
    await begin(r.draft_id);
    const done = await complete(r.draft_id, { decision: 'refuse', suggestions: [' one ', 'two', 'three', 'four', 7, ''] }, 0.01);
    expect(done.status).toBe('refused');
    const t = await ok(a.c, 'get_clarify_thread', { p_thread_root: root });
    const d = t.drafts.find((x: Row) => x.id === r.draft_id);
    expect(d).toMatchObject({ state: 'refused', suggestions: ['one', 'two', 'three'], point: null, cited: null });
  });

  it('edit: owner text, bounds, unchanged writes nothing, and a position by someone else fixes the point', async () => {
    const t = await ok(a.c, 'get_clarify_thread', { p_thread_root: root });
    const d = t.drafts.find((x: Row) => x.state === 'done');
    const before = (await admin.from('points').select('updated_at').eq('id', d.point.id).single()).data as Row;
    expect(await ok(a.c, 'clarify_draft_edit', { p_draft: d.id, p_statement: d.point.statement })).toMatchObject({ status: 'ok', changed: false });
    expect(((await admin.from('points').select('updated_at').eq('id', d.point.id).single()).data as Row).updated_at, 'unchanged text writes nothing').toBe(before.updated_at);
    expect(await ok(a.c, 'clarify_draft_edit', { p_draft: d.id, p_statement: `${TAG} Pricing needs a trial.` })).toMatchObject({ status: 'ok', changed: true });
    expect(((await admin.from('points').select('statement').eq('id', d.point.id).single()).data as Row).statement).toBe(`${TAG} Pricing needs a trial.`);
    expect((await rpc(a.c, 'clarify_draft_edit', { p_draft: d.id, p_statement: '   ' })).error?.code).toBe('22023');
    expect((await rpc(a.c, 'clarify_draft_edit', { p_draft: d.id, p_statement: 'x'.repeat(301) })).error?.code).toBe('22023');
    expect((await rpc(b.c, 'clarify_draft_edit', { p_draft: d.id, p_statement: 'hijack' })).error?.code, 'not the owner').toBe('42501');
    // the owner's own position does not fix it; another person's does
    await admin.from('point_positions').insert({ point_id: d.point.id, user_id: a.id, position: 'agree' });
    expect(await ok(a.c, 'clarify_draft_edit', { p_draft: d.id, p_statement: `${TAG} Pricing needs a short trial.` })).toMatchObject({ changed: true });
    // 20261111160000: a hand edit clears the owner's own position (new words, so the old stance no longer stands)
    expect(((await ok(a.c, 'get_clarify_thread', { p_thread_root: root })).drafts.find((x: Row) => x.id === d.id)).point.owner_position).toBeNull();
    await admin.from('point_positions').insert({ point_id: d.point.id, user_id: b.id, position: 'disagree' });
    expect(await ok(a.c, 'clarify_draft_edit', { p_draft: d.id, p_statement: `${TAG} changed again` })).toMatchObject({ status: 'refused', code: 'fixed' });
    // delete keeps a point someone else has a position on; the draft row still goes
    expect(await ok(a.c, 'clarify_draft_delete', { p_draft: d.id })).toMatchObject({ status: 'ok', point_kept: true });
    expect((await admin.from('clarify_drafts').select('id').eq('id', d.id)).data).toHaveLength(0);
    await admin.from('point_positions').delete().eq('point_id', d.point.id).eq('user_id', b.id);
    await admin.from('points').delete().eq('id', d.point.id);
  });

  it('delete is refused while a draft is being made; a plain done draft takes its point with it', async () => {
    await finishActive();
    const r = await ok(a.c, 'clarify_another', { p_thread_root: root });
    expect(await ok(a.c, 'clarify_draft_delete', { p_draft: r.draft_id })).toMatchObject({ status: 'refused', code: 'busy' });
    await begin(r.draft_id);
    expect(await ok(a.c, 'clarify_draft_delete', { p_draft: r.draft_id })).toMatchObject({ status: 'refused', code: 'busy' });
    const done = await complete(r.draft_id, goodResult(`${TAG} Delete me.`, { a: [msgs[2]!.id] }), 0.01);
    expect(await ok(a.c, 'clarify_draft_delete', { p_draft: r.draft_id })).toMatchObject({ status: 'ok', point_kept: false });
    expect((await admin.from('points').select('id').eq('id', done.point_id)).data).toHaveLength(0);
  });

  it('a run past five minutes is dead at the next press: failed abandoned and charged in full; a queued one nobody started is failed too, charged nothing', async () => {
    await finishActive();
    const r = await ok(a.c, 'clarify_another', { p_thread_root: root });
    await begin(r.draft_id);
    const spendId = (await draftRow(r.draft_id)).spend_id;
    await admin.from('clarify_drafts').update({ started_at: new Date(Date.now() - 6 * 60_000).toISOString() }).eq('id', r.draft_id);
    // the read shows it failed before anything is written
    const shown = (await ok(a.c, 'get_clarify_thread', { p_thread_root: root })).drafts.find((x: Row) => x.id === r.draft_id);
    expect(shown).toMatchObject({ state: 'failed', error_code: 'abandoned' });
    const next = await ok(a.c, 'clarify_another', { p_thread_root: root });
    expect(next.status, 'the dead run no longer blocks').toBe('started');
    expect(await draftRow(r.draft_id)).toMatchObject({ state: 'failed', error_code: 'abandoned' });
    const spend = (await admin.from('mirror_ai_spend').select('*').eq('id', spendId).single()).data as Row;
    expect(spend).toMatchObject({ state: 'settled' });
    expect(Number(spend.actual_usd)).toBeCloseTo(Number(spend.reserved_usd), 6);
    await admin.from('clarify_drafts').update({ updated_at: new Date(Date.now() - 6 * 60_000).toISOString() }).eq('id', next.draft_id);
    expect((await ok(a.c, 'clarify_another', { p_thread_root: root })).status).toBe('started');
    expect(await draftRow(next.draft_id)).toMatchObject({ state: 'failed', error_code: 'abandoned', spend_id: null });
    await finishActive();
  });

  it('a late completion of an abandoned run writes nothing and settles its spend', async () => {
    const r = await ok(a.c, 'clarify_another', { p_thread_root: root });
    await begin(r.draft_id);
    await admin.from('clarify_drafts').update({ state: 'failed', error_code: 'abandoned' }).eq('id', r.draft_id);
    const late = await complete(r.draft_id, goodResult(`${TAG} late`, { a: [msgs[2]!.id] }), 0.03);
    expect(late.status).toBe('gone');
    expect((await admin.from('points').select('id').eq('statement', `${TAG} late`)).data).toHaveLength(0);
    expect(await spendOf(r.draft_id)).toMatchObject({ state: 'settled' });
  });

  it('fail: released when the model never ran (usd null), charged otherwise; retry is for failed or capped only', async () => {
    await finishActive();
    const r = await ok(a.c, 'clarify_another', { p_thread_root: root });
    await begin(r.draft_id);
    expect(await failRun(r.draft_id, 'too_large', null)).toBe(true);
    expect(await spendOf(r.draft_id)).toMatchObject({ state: 'released' });
    expect(await ok(a.c, 'clarify_retry', { p_draft: r.draft_id })).toMatchObject({ status: 'started' });
    expect(await ok(a.c, 'clarify_retry', { p_draft: r.draft_id })).toMatchObject({ status: 'refused', code: 'not_retryable' });
    expect((await rpc(b.c, 'clarify_retry', { p_draft: r.draft_id })).error?.code).toBe('42501');
    await finishActive();
  });

  it('a draft whose source line is deleted before it starts fails source_gone and reserves nothing', async () => {
    const extra = await ok(b.c, 'send_chat_message', { p_conversation: conv, p_body: `${TAG} soon gone`, p_client_id: randomUUID() });
    const s = await ok(a.c, 'clarify_start', { p_source: extra.id });
    // a deleted message has no body (a table constraint)
    const del = await admin.from('chat_messages').update({ body: null, deleted_at: new Date().toISOString() }).eq('id', extra.id);
    expect(del.error).toBeNull();
    expect((await begin(s.draft_id)).status).toBe('gone');
    expect(await draftRow(s.draft_id)).toMatchObject({ state: 'failed', error_code: 'source_gone', spend_id: null });
  });

  // P1631 OQ9 decided 2026-11-13: a cited person is erased, the point stays (it is its author's sentence); only their ref and the citations of their rows go
  it('erasure: a person whose words a draft read leaves the draft and its point in place, minus their ref and citations (erase_chat_data_for)', async () => {
    await finishActive();
    const s = await ok(a.c, 'clarify_start', { p_source: msgs[2]!.id });
    await begin(s.draft_id);
    const done = await complete(s.draft_id, goodResult(`${TAG} derived from B.`, { a: [msgs[2]!.id] }), 0.01);
    expect((await admin.from('points').select('id').eq('id', done.point_id)).data).toHaveLength(1);
    const before = await draftRow(s.draft_id);
    expect(before.derived_refs.length, 'premise: the draft read B').toBeGreaterThan(0);
    expect(before.sent_ids).toContain(msgs[2]!.id);
    // the real erasure of B (the cleanup runs inside it, not as a trigger on chat_messages)
    const er = await admin.rpc('erase_chat_data_for', { p_uid: b.id });
    expect(er.error).toBeNull();
    expect((await admin.from('points').select('id').eq('id', done.point_id)).data, 'the point stays').toHaveLength(1);
    const after = await draftRow(s.draft_id);
    expect(after).toMatchObject({ state: 'done', point_id: done.point_id });
    expect(after.error_code).not.toBe('erased');
    expect(after.derived_refs.length, 'B\'s ref is gone').toBeLessThan(before.derived_refs.length);
    expect(after.sent_ids, 'B\'s row is no longer a citation source').not.toContain(msgs[2]!.id);
    expect(JSON.stringify(after.cited), 'nor is it cited').not.toContain(msgs[2]!.id);
  });
});

describe('P1631 review fixes (migration 20261110170000)', () => {
  let conv2 = '';
  const said: Row[] = [];
  const refOf = async (id: string) => ((await admin.from('clarify_drafts').select('derived_refs').eq('id', id).single()).data as Row).derived_refs as string[];

  beforeAll(async () => {
    const [lo, hi] = [a.id, c3.id].sort();
    const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: a.id }).select('id').single();
    if (made.error) throw new Error(`fixture dm2: ${made.error.message}`);
    conv2 = made.data.id as string;
    said.push(await ok(c3.c, 'send_chat_message', { p_conversation: conv2, p_body: `${TAG} C says: ship the trial now.`, p_client_id: randomUUID() }));
    said.push(await ok(a.c, 'send_chat_message', { p_conversation: conv2, p_body: `${TAG} A says: not yet.`, p_client_id: randomUUID() }));
  });

  it('H1: a new draft inherits the derived_refs of the earlier drafts whose statements it receives as already_drafted', async () => {
    await finishActive();
    const s1 = await ok(a.c, 'clarify_start', { p_source: said[0]!.id });
    await begin(s1.draft_id);
    await complete(s1.draft_id, goodResult(`${TAG} H1 first.`, { a: [said[0]!.id] }), 0.01);
    await admin.from('clarify_drafts').update({ derived_refs: ['ref:h1-former-author'] }).eq('id', s1.draft_id);
    const s2 = await ok(a.c, 'clarify_another', { p_thread_root: s1.thread_root_id });
    const run = await begin(s2.draft_id);
    expect(run.already_drafted).toContain(`${TAG} H1 first.`);
    expect(await refOf(s2.draft_id), 'refs of the drafts it was told about').toContain('ref:h1-former-author');
    await complete(s2.draft_id, goodResult(`${TAG} H1 second.`, { a: [said[1]!.id] }), 0.01);
  });

  it('H2: deleting the last draft of a thread does not turn the generic Mirror reply on', async () => {
    await finishActive();
    const s = await ok(a.c, 'clarify_start', { p_source: said[1]!.id });
    await begin(s.draft_id);
    await failRun(s.draft_id, 'x', 0);
    expect((await admin.from('clarify_threads').select('root_id').eq('root_id', s.thread_root_id)).data).toHaveLength(1);
    expect(await ok(a.c, 'clarify_draft_delete', { p_draft: s.draft_id })).toMatchObject({ status: 'ok' });
    const r = await rpc(a.c, 'mirror_request_reply', { p_message: s.thread_root_id });
    expect(r.error).toBeNull();
    expect(r.data ?? []).toHaveLength(0);
    expect((await admin.from('mirror_jobs').select('id').eq('trigger_message_id', s.thread_root_id)).data).toHaveLength(0);
  });

  it('M1/M2: a stale run token neither completes nor settles the newer run of the same draft', async () => {
    await finishActive();
    const s = await ok(a.c, 'clarify_start', { p_source: said[0]!.id });
    await begin(s.draft_id);
    const old = (await token(s.draft_id))!;
    await failRun(s.draft_id, 'boom', 0.01);
    await ok(a.c, 'clarify_retry', { p_draft: s.draft_id });
    await begin(s.draft_id);
    const fresh = (await token(s.draft_id))!;
    expect(fresh).not.toBe(old);
    expect(await complete(s.draft_id, goodResult(`${TAG} stale`, { a: [said[0]!.id] }), 0.05, old)).toMatchObject({ status: 'gone' });
    expect(await failRun(s.draft_id, 'stale', 0.05, old)).toBe(false);
    expect(await draftRow(s.draft_id)).toMatchObject({ state: 'running', spend_id: fresh });
    expect(await spendOf(s.draft_id)).toMatchObject({ state: 'reserved' });
    expect((await admin.from('points').select('id').eq('statement', `${TAG} stale`)).data).toHaveLength(0);
    expect(await complete(s.draft_id, goodResult(`${TAG} fresh`, { a: [said[0]!.id] }), 0.02, fresh)).toMatchObject({ status: 'done' });
    expect(await complete(s.draft_id, goodResult(`${TAG} nul`), 0.02, null)).toMatchObject({ status: 'gone' });
  });

  it('L1: a queued draft older than five minutes is failed abandoned by begin, never started', async () => {
    await finishActive();
    const s = await ok(a.c, 'clarify_start', { p_source: said[0]!.id });
    await admin.from('clarify_drafts').update({ updated_at: new Date(Date.now() - 6 * 60_000).toISOString() }).eq('id', s.draft_id);
    expect((await begin(s.draft_id)).status).toBe('failed');
    expect(await draftRow(s.draft_id)).toMatchObject({ state: 'failed', error_code: 'abandoned', spend_id: null });
  });

  it('busy from lock contention carries reason locked; a run in progress does not', async () => {
    await finishActive();
    const s = await ok(a.c, 'clarify_start', { p_source: said[0]!.id });
    await begin(s.draft_id);
    const again = await begin(s.draft_id);
    expect(again).toMatchObject({ status: 'busy' });
    expect(again.reason).toBeUndefined();
    await finishActive();
  });

  it('(Codex 9) a provider cap is stored as state capped, and Retry accepts it', async () => {
    await finishActive();
    const s = await ok(a.c, 'clarify_start', { p_source: said[0]!.id });
    await begin(s.draft_id);
    await failRun(s.draft_id, 'cap', 0);
    expect(await draftRow(s.draft_id)).toMatchObject({ state: 'capped', error_code: 'cap' });
    expect(await ok(a.c, 'clarify_retry', { p_draft: s.draft_id })).toMatchObject({ status: 'started' });
    await finishActive();
  });

  it('(GLM 8, 19) a refusal dedupes its suggestions; one with nothing left after filtering is bad_output and settles at the actual cost', async () => {
    await finishActive();
    const s = await ok(a.c, 'clarify_start', { p_source: said[0]!.id });
    await begin(s.draft_id);
    await complete(s.draft_id, { decision: 'refuse', suggestions: ['one', ' one ', 'two', 'one', 'three', 'four'] }, 0.01);
    expect((await draftRow(s.draft_id)).suggestions).toEqual(['one', 'two', 'three']);
    const n = await ok(a.c, 'clarify_another', { p_thread_root: s.thread_root_id });
    await begin(n.draft_id);
    expect(await complete(n.draft_id, { decision: 'refuse', suggestions: ['  ', 7] }, 0.01)).toMatchObject({ status: 'failed', code: 'bad_output' });
    expect(await draftRow(n.draft_id)).toMatchObject({ state: 'failed', error_code: 'bad_output' });
    expect(await spendOf(n.draft_id)).toMatchObject({ state: 'settled' });
  });

  it('(GLM 1) erasing a person settles the reservation of a draft that was running on their words; (r2, security, overturned by OQ9) the derived point is kept when another user holds a position on it', async () => {
    await finishActive();
    const kept = await ok(a.c, 'clarify_start', { p_source: said[0]!.id });
    await begin(kept.draft_id);
    const done = await complete(kept.draft_id, goodResult(`${TAG} kept by position.`, { a: [said[0]!.id] }), 0.01);
    await admin.from('point_positions').insert({ point_id: done.point_id, user_id: b.id, position: 'agree' });
    const live = await ok(a.c, 'clarify_another', { p_thread_root: kept.thread_root_id });
    await begin(live.draft_id);
    const spendId = (await token(live.draft_id))!;
    expect((await admin.from('mirror_ai_spend').select('state').eq('id', spendId).single()).data).toMatchObject({ state: 'reserved' });
    const er = await admin.rpc('erase_chat_data_for', { p_uid: c3.id });
    expect(er.error).toBeNull();
    expect(await draftRow(live.draft_id)).toMatchObject({ state: 'failed', error_code: 'erased' });
    const spend = (await admin.from('mirror_ai_spend').select('*').eq('id', spendId).single()).data as Row;
    expect(spend.state, 'the reservation no longer counts against the caps').toBe('settled');
    expect(Number(spend.actual_usd)).toBeCloseTo(Number(spend.reserved_usd), 6);
    // P1631 OQ9 decided 2026-11-13: a point others hold positions on is kept
    expect((await admin.from('points').select('id').eq('id', done.point_id)).data, 'B holds a position on it: kept').toHaveLength(1);
    expect((await admin.from('point_positions').select('user_id').eq('point_id', done.point_id)).data, 'B\'s position stays').toEqual([{ user_id: b.id }]);
    expect(await draftRow(kept.draft_id), 'the draft keeps its point').toMatchObject({ point_id: done.point_id });
    expect((await draftRow(kept.draft_id)).error_code, 'and is not failed as erased').not.toBe('erased');
  });

  it('(r2, Opus N1, Gemini 3, GLM 2) a completion or failure for a vanished draft settles or releases its own spend, once', async () => {
    await finishActive();
    // complete for a deleted draft: the reservation is settled, not left held
    const s1 = await ok(a.c, 'clarify_start', { p_source: said[1]!.id });
    await begin(s1.draft_id);
    const run1 = (await token(s1.draft_id))!;
    await admin.from('clarify_drafts').delete().eq('id', s1.draft_id);
    expect(await complete(s1.draft_id, goodResult(`${TAG} vanished`), 0.03, run1)).toMatchObject({ status: 'gone' });
    const sp1 = (await admin.from('mirror_ai_spend').select('*').eq('id', run1).single()).data as Row;
    expect(sp1.state).toBe('settled');
    expect(Number(sp1.actual_usd)).toBeCloseTo(0.03, 6);
    // a second report for the same run never settles it again
    await complete(s1.draft_id, goodResult(`${TAG} vanished`), 0.9, run1);
    expect(Number(((await admin.from('mirror_ai_spend').select('actual_usd').eq('id', run1).single()).data as Row).actual_usd)).toBeCloseTo(0.03, 6);
    // fail with usd null for a deleted draft: released
    const s2 = await ok(a.c, 'clarify_start', { p_source: said[1]!.id });
    await begin(s2.draft_id);
    const run2 = (await token(s2.draft_id))!;
    await admin.from('clarify_drafts').delete().eq('id', s2.draft_id);
    expect(await failRun(s2.draft_id, 'boom', null, run2)).toBe(false);
    expect((await admin.from('mirror_ai_spend').select('state').eq('id', run2).single()).data).toMatchObject({ state: 'released' });
    // a stale fail with null usd releases a still-reserved stale spend, and leaves the newer run alone
    const s3 = await ok(a.c, 'clarify_start', { p_source: said[1]!.id });
    await begin(s3.draft_id);
    const old = (await token(s3.draft_id))!;
    await failRun(s3.draft_id, 'boom', 0.01);
    await ok(a.c, 'clarify_retry', { p_draft: s3.draft_id });
    await begin(s3.draft_id);
    const fresh = (await token(s3.draft_id))!;
    expect(await failRun(s3.draft_id, 'stale', null, old)).toBe(false);
    expect(await spendOf(s3.draft_id)).toMatchObject({ id: fresh, state: 'reserved' });
    await failRun(s3.draft_id, 'done', 0);
  });
});

describe('P1631 step 1b: refine by chatting, and a draft that never started (migration 20261110200000)', () => {
  let src: Row;
  let dd: Awaited<ReturnType<typeof mk>>;
  let thread = '';
  let first = '';
  const mkDone = async (stmt: string) => {
    const s = await ok(a.c, 'clarify_start', { p_source: src.id });
    thread = s.thread_root_id;
    await begin(s.draft_id);
    await complete(s.draft_id, goodResult(`${TAG} ${stmt}`), 0.01);
    return s.draft_id as string;
  };
  const statementOf = async (draftId: string) => {
    const d = await draftRow(draftId);
    return d.point_id ? (((await admin.from('points').select('statement').eq('id', d.point_id).single()).data as Row).statement as string) : null;
  };
  const answer = (target: unknown, stmt: string) => ({ decision: 'draft', statement: `${TAG} ${stmt}`, cited: { a: [], b: [] }, target });

  beforeAll(async () => {
    dd = await mk('D');
    const [lo, hi] = [a.id, dd.id].sort();
    const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: a.id }).select('id').single();
    if (made.error) throw new Error(`fixture dm3: ${made.error.message}`);
    src = await ok(dd.c, 'send_chat_message', { p_conversation: made.data.id, p_body: `${TAG} 1b: ship the trial now.`, p_client_id: randomUUID() });
  });

  it('clarify_message posts the owner text in the thread and queues a run carrying it; the run context holds the owner messages and the latest draft', async () => {
    await finishActive();
    first = await mkDone('first point');
    const sent = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: '  make it sharper  ' });
    expect(sent.status).toBe('started');
    const msg = (await admin.from('chat_messages').select('body, author_id, thread_root_id, kind').eq('id', sent.message_id).single()).data as Row;
    expect(msg).toMatchObject({ body: 'make it sharper', author_id: a.id, thread_root_id: thread, kind: 'message' });
    expect(await draftRow(sent.draft_id)).toMatchObject({ state: 'queued', instruction: 'make it sharper' });
    // busy: nothing is posted for a refused message
    const before = (await admin.from('chat_messages').select('id').eq('thread_root_id', thread)).data!.length;
    expect((await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'second while busy' })).status).toBe('busy');
    expect((await admin.from('chat_messages').select('id').eq('thread_root_id', thread)).data!.length).toBe(before);
    const run = await begin(sent.draft_id);
    expect(run.owner_messages).toEqual(['make it sharper']);
    expect(run.latest_draft).toBe(`${TAG} first point`);
    // the generic Mirror reply stays silent for the owner's message in the thread
    const quiet = await rpc(a.c, 'mirror_request_reply', { p_message: sent.message_id });
    expect(quiet.data ?? []).toHaveLength(0);
    await failRun(sent.draft_id, 'test_cleanup', 0);
  });

  it('pressed_author is "owner" when the presser wrote the pressed row', async () => {
    await finishActive();
    const own = await ok(a.c, 'clarify_start', { p_source: msgs[1]!.id }); // msgs[1] was written by a
    const r = await begin(own.draft_id);
    expect(r.source_message.pressed_author).toBe('owner');
    expect(JSON.stringify(r.source_message)).not.toContain(a.name);
    await failRun(own.draft_id, 'test_cleanup', 0);
  });

  it('clarify_message: only the owner of the thread; text 1..500', async () => {
    await finishActive();
    expect((await rpc(b.c, 'clarify_message', { p_thread_root: thread, p_text: 'hijack' })).error?.code).toBe('42501');
    expect((await rpc(a.c, 'clarify_message', { p_thread_root: thread, p_text: '   ' })).error?.code).toBe('22023');
    expect((await rpc(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'x'.repeat(501) })).error?.code).toBe('22023');
  });

  // 20261111160000 (thread redesign): a refine is a NEW card. The old card, its point and its position stay; the new card has no position and names the card it refined.
  let second = '';
  let third = '';

  it('refine (target latest): the run row is a NEW card with its own new point and no position; the old card, its point and the owner position are untouched, and the new card names the one it refined', async () => {
    await finishActive();
    const before = await draftRow(first);
    const oldStatement = await statementOf(first);
    await admin.from('point_positions').insert({ point_id: before.point_id, user_id: a.id, position: 'agree' });
    const sent = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'make it about the quarter' });
    await begin(sent.draft_id);
    const r = await complete(sent.draft_id, answer('latest', 'refined point'), 0.02);
    expect(r.status).toBe('done');
    expect(r.refined ?? null, 'nothing is refined in place any more').toBeNull();
    second = sent.draft_id;
    const after = await draftRow(second);
    expect(after).toMatchObject({ state: 'done', refine_target_id: first });
    expect(after.point_id).not.toBe(before.point_id);
    expect(await statementOf(second)).toBe(`${TAG} refined point`);
    // the old card is exactly as it was
    expect((await draftRow(first)).point_id).toBe(before.point_id);
    expect(await statementOf(first)).toBe(oldStatement);
    expect((await admin.from('points').select('id').eq('id', before.point_id)).data, 'old point stays').toHaveLength(1);
    expect((await admin.from('point_positions').select('position').eq('point_id', before.point_id).eq('user_id', a.id)).data).toEqual([{ position: 'agree' }]);
    // the position is NOT copied
    expect((await admin.from('point_positions').select('position').eq('point_id', after.point_id)).data).toHaveLength(0);
    const t = await ok(a.c, 'get_clarify_thread', { p_thread_root: thread });
    expect(t.drafts.filter((d: Row) => d.state === 'done')).toHaveLength(2);
    expect(t.drafts.find((d: Row) => d.id === first)).toMatchObject({ refine_target_id: null, point: { owner_position: 'agree' } });
    expect(t.drafts.find((d: Row) => d.id === second)).toMatchObject({ refine_target_id: first, point: { owner_position: null } });
  });

  it('refine without a target field defaults to the latest (a new card naming the previous latest); an invalid target fails bad_output and settles', async () => {
    await finishActive();
    const s1 = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'reword it' });
    await begin(s1.draft_id);
    expect(await complete(s1.draft_id, { decision: 'draft', statement: `${TAG} reworded`, cited: { a: [], b: [] } }, 0.01)).toMatchObject({ status: 'done' });
    third = s1.draft_id;
    expect(await draftRow(third)).toMatchObject({ state: 'done', refine_target_id: second });
    expect(await statementOf(third)).toBe(`${TAG} reworded`);
    expect(await statementOf(second), 'the card it refined is untouched').toBe(`${TAG} refined point`);
    const s2 = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'whatever' });
    await begin(s2.draft_id);
    const run = (await token(s2.draft_id))!;
    expect(await complete(s2.draft_id, answer('sideways', 'bad target'), 0.03)).toMatchObject({ status: 'failed', code: 'bad_output' });
    expect((await admin.from('mirror_ai_spend').select('state').eq('id', run).single()).data).toMatchObject({ state: 'settled' });
    expect(await statementOf(third)).toBe(`${TAG} reworded`);
    await ok(a.c, 'clarify_draft_delete', { p_draft: s2.draft_id });
  });

  it('target new: the run row is another card that refines nothing (refine_target_id null) and the others are untouched', async () => {
    await finishActive();
    const sent = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'another point about who decides' });
    await begin(sent.draft_id);
    expect(await complete(sent.draft_id, answer('new', 'fourth point'), 0.02)).toMatchObject({ status: 'done' });
    expect(await draftRow(sent.draft_id)).toMatchObject({ state: 'done', refine_target_id: null });
    expect(await statementOf(third)).toBe(`${TAG} reworded`);
    expect((await ok(a.c, 'get_clarify_thread', { p_thread_root: thread })).drafts.filter((d: Row) => d.state === 'done')).toHaveLength(4);
  });

  it('an "Another point" run (no instruction) never records a refine target: not while running, not when it fails, not when it is done (20261111183000)', async () => {
    await finishActive();
    const failed = await ok(a.c, 'clarify_another', { p_thread_root: thread });
    await begin(failed.draft_id);
    expect(await draftRow(failed.draft_id), 'running').toMatchObject({ state: 'running', refine_target_id: null });
    await failRun(failed.draft_id, 'test_cleanup', 0);
    expect(await draftRow(failed.draft_id), 'failed').toMatchObject({ state: 'failed', refine_target_id: null });
    await ok(a.c, 'clarify_draft_delete', { p_draft: failed.draft_id });
    const n = await ok(a.c, 'clarify_another', { p_thread_root: thread });
    await begin(n.draft_id);
    expect(await complete(n.draft_id, goodResult(`${TAG} fifth point`), 0.01)).toMatchObject({ status: 'done' });
    expect(await draftRow(n.draft_id)).toMatchObject({ state: 'done', refine_target_id: null });
  });

  it('a run WITH an instruction still records the card it refines while it runs (and a failed one keeps it, which the screen ignores unless a newer card is done)', async () => {
    await finishActive();
    const sent = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'a failing refine' });
    await begin(sent.draft_id);
    const running = await draftRow(sent.draft_id);
    expect(running.refine_target_id).not.toBeNull();
    await failRun(sent.draft_id, 'test_cleanup', 0);
    await ok(a.c, 'clarify_draft_delete', { p_draft: sent.draft_id });
  });

  it('refine when someone else has a position on the latest point: a new card is added and the fixed point stays', async () => {
    await finishActive();
    const latest = (await ok(a.c, 'get_clarify_thread', { p_thread_root: thread })).drafts.filter((d: Row) => d.state === 'done').pop();
    await admin.from('point_positions').insert({ point_id: latest.point.id, user_id: dd.id, position: 'disagree' });
    const sent = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'sharpen it' });
    await begin(sent.draft_id);
    const r = await complete(sent.draft_id, answer('latest', 'sharpened'), 0.02);
    expect(r.status).toBe('done');
    expect(r.refined ?? null).toBeNull();
    expect(await draftRow(sent.draft_id)).toMatchObject({ state: 'done', refine_target_id: latest.id });
    expect(((await admin.from('points').select('statement').eq('id', latest.point.id).single()).data as Row).statement, 'fixed point unchanged').toBe(latest.point.statement);
    expect((await ok(a.c, 'get_clarify_thread', { p_thread_root: thread })).drafts.filter((d: Row) => d.state === 'done')).toHaveLength(6);
  });

  it('Mention in chat: clarify_message with p_target stores that card as the one to refine, begin sends THAT card as latest_draft (already_drafted still lists every card), and the new card names it', async () => {
    await finishActive();
    const sent = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'about the first one', p_target: first });
    expect(await draftRow(sent.draft_id)).toMatchObject({ refine_target_id: first });
    const run = await begin(sent.draft_id);
    expect(run.latest_draft).toBe(await statementOf(first));
    expect(run.already_drafted, 'the refined card stays listed: the run may still answer `new`').toContain(await statementOf(first));
    expect(run.already_drafted).toContain(`${TAG} reworded`);
    expect(await complete(sent.draft_id, answer('latest', 'first, sharper'), 0.02)).toMatchObject({ status: 'done' });
    expect(await draftRow(sent.draft_id)).toMatchObject({ refine_target_id: first });
    expect(await draftRow(first)).toMatchObject({ state: 'done' }); // still there, still an earlier version
  });

  it('p_target is validated: a draft of another thread, an unknown id and a stranger asking are all refused, and no message is posted', async () => {
    await finishActive();
    const mainThread = thread;
    const foreign = await mkDone('another thread'); // mkDone starts a second thread of the same owner and moves `thread` to it
    thread = mainThread;
    await finishActive();
    const posted = async () => (await admin.from('chat_messages').select('id').eq('thread_root_id', mainThread)).data!.length;
    const n = await posted();
    expect((await rpc(a.c, 'clarify_message', { p_thread_root: mainThread, p_text: 'x', p_target: foreign })).error?.code, 'a draft of another thread').toBe('42501');
    expect((await rpc(a.c, 'clarify_message', { p_thread_root: mainThread, p_text: 'x', p_target: randomUUID() })).error?.code, 'an unknown id').toBe('42501');
    expect((await rpc(b.c, 'clarify_message', { p_thread_root: mainThread, p_text: 'x', p_target: first })).error?.code, 'a stranger').toBe('42501');
    expect(await posted(), 'nothing was posted').toBe(n);
  });

  it('a hand edit clears the owner\'s position on that point, and an unchanged text does not', async () => {
    await finishActive();
    const d = await draftRow(first);
    const pid = d.point_id as string;
    const text = await statementOf(first);
    const has = async () => (await admin.from('point_positions').select('position').eq('point_id', pid).eq('user_id', a.id)).data!.length;
    expect(await has()).toBe(1);
    expect(await ok(a.c, 'clarify_draft_edit', { p_draft: first, p_statement: text! })).toMatchObject({ status: 'ok', changed: false });
    expect(await has(), 'unchanged text writes nothing').toBe(1);
    expect(await ok(a.c, 'clarify_draft_edit', { p_draft: first, p_statement: `${TAG} edited by hand` })).toMatchObject({ status: 'ok', changed: true });
    expect(await has(), 'a changed text clears the position').toBe(0);
  });

  it('clarify_mark_failed: a queued draft that never started is failed not_started and can be retried; a started one, a finished one and a stranger are left alone', async () => {
    await finishActive();
    const q = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'try this' });
    expect((await rpc(b.c, 'clarify_mark_failed', { p_draft: q.draft_id })).error?.code, 'not the owner').toBe('42501');
    expect(await ok(a.c, 'clarify_mark_failed', { p_draft: q.draft_id })).toMatchObject({ status: 'failed' });
    expect(await draftRow(q.draft_id)).toMatchObject({ state: 'failed', error_code: 'not_started' });
    expect((await ok(a.c, 'get_clarify_thread', { p_thread_root: thread })).drafts.find((d: Row) => d.id === q.draft_id)).toMatchObject({ state: 'failed', error_code: 'not_started' });
    expect((await ok(a.c, 'clarify_retry', { p_draft: q.draft_id })).status).toBe('started');
    await begin(q.draft_id);
    expect(await ok(a.c, 'clarify_mark_failed', { p_draft: q.draft_id }), 'running').toMatchObject({ status: 'unchanged', state: 'running' });
    await complete(q.draft_id, answer('new', 'late point'), 0.01);
    expect(await ok(a.c, 'clarify_mark_failed', { p_draft: q.draft_id }), 'done').toMatchObject({ status: 'unchanged', state: 'done' });
  });
});

describe('P1631 step 1b review fixes (migration 20261110210000)', () => {
  let src: Row;
  let ee: Awaited<ReturnType<typeof mk>>;
  const answer = (stmt: string, target: unknown = 'latest') => ({ decision: 'draft', statement: `${TAG} ${stmt}`, cited: { a: [], b: [] }, target });
  const mkDone = async (stmt: string) => {
    const s = await ok(a.c, 'clarify_start', { p_source: src.id });
    await begin(s.draft_id);
    await complete(s.draft_id, goodResult(`${TAG} ${stmt}`), 0.01);
    return { draft: s.draft_id as string, thread: s.thread_root_id as string };
  };
  const pointOf = async (draftId: string) => (await draftRow(draftId)).point_id as string;
  const statementOf = async (draftId: string) => (((await admin.from('points').select('statement').eq('id', await pointOf(draftId)).single()).data as Row).statement as string);
  const exists = async (pid: string) => ((await admin.from('points').select('id').eq('id', pid)).data ?? []).length === 1;

  beforeAll(async () => {
    ee = await mk('E');
    const [lo, hi] = [a.id, ee.id].sort();
    const made = await admin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: a.id }).select('id').single();
    if (made.error) throw new Error(`fixture dm4: ${made.error.message}`);
    src = await ok(ee.c, 'send_chat_message', { p_conversation: made.data.id, p_body: `${TAG} r4: move the deadline.`, p_client_id: randomUUID() });
  });

  // 20261111160000: a refine never deletes or edits anything. Each case attaches ONE kind of reference to the old point, refines, and expects: a NEW card with its own new point, the OLD card and point exactly as they were, the spend settled
  const keeps: Array<[string, (pid: string) => Promise<() => Promise<void>>]> = [
    ['a letter response (a foreign key with no ON DELETE action: the delete would raise)', async (pid) => {
      const doc = (await admin.from('clarity_docs').insert({ owner_id: a.id, title: `${TAG} doc` }).select('id').single()).data as Row;
      const letter = (await admin.from('clarity_letters').insert({ source_doc_id: doc.id, sender_id: a.id, mode: 'one-to-one' }).select('id').single()).data as Row;
      const del = (await admin.from('letter_deliveries').insert({ letter_id: letter.id, receiver_email: `r4-${RUN}@example.com` }).select('id').single()).data as Row;
      const r = await admin.from('letter_point_responses').insert({ delivery_id: del.id, point_id: pid, position: 'agree' });
      if (r.error) throw new Error(`letter fixture: ${r.error.message}`);
      return async () => {
        await admin.from('letter_point_responses').delete().eq('delivery_id', del.id);
        await admin.from('letter_deliveries').delete().eq('id', del.id);
        await admin.from('clarity_letters').delete().eq('id', letter.id);
        await admin.from('clarity_docs').delete().eq('id', doc.id);
      };
    }],
    ['a story linked to the point', async (pid) => {
      const st = await admin.from('stories').insert({ author_id: a.id, content: `${TAG} story`, visibility: 'private' }).select('id').single();
      if (st.error) throw new Error(`story fixture: ${st.error.message}`);
      const l = await admin.from('story_points').insert({ story_id: st.data.id, point_id: pid, author_id: a.id });
      if (l.error) throw new Error(`story_points fixture: ${l.error.message}`);
      return async () => { await admin.from('stories').delete().eq('id', st.data.id); };
    }],
    ['a canvas_ system tag', async (pid) => {
      const r = await admin.from('points').update({ system_tags: ['canvas_r4test'] }).eq('id', pid);
      if (r.error) throw new Error(`tag fixture: ${r.error.message}`);
      return async () => {};
    }],
  ];
  for (const [label, attach] of keeps) {
    it(`refine adds a new card and leaves the old card and its point alone when the point has ${label}`, async () => {
      await finishActive();
      const { draft, thread } = await mkDone(`keep ${label.slice(0, 12)}`);
      const old = await pointOf(draft);
      const cleanup = await attach(old);
      try {
        const sent = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'sharper' });
        await begin(sent.draft_id);
        const run = (await token(sent.draft_id))!;
        const r = await complete(sent.draft_id, answer('sharper'), 0.02);
        expect(r.status).toBe('done');
        expect(r.refined ?? null).toBeNull();
        expect(await pointOf(draft), 'the old card keeps its point').toBe(old);
        expect(await exists(old), 'old row kept').toBe(true);
        const now = await pointOf(sent.draft_id);
        expect(now).not.toBe(old);
        expect(await exists(now), 'new row').toBe(true);
        expect(await draftRow(sent.draft_id), 'the run row is the new card').toMatchObject({ state: 'done', refine_target_id: draft });
        expect((await admin.from('mirror_ai_spend').select('state').eq('id', run).single()).data).toMatchObject({ state: 'settled' }); // not rolled back
      } finally {
        await cleanup();
      }
    });
  }

  it('CONTROL: with no reference at all the old point row is STILL kept (nothing is deleted by a refine any more)', async () => {
    await finishActive();
    const { draft, thread } = await mkDone('free');
    const old = await pointOf(draft);
    const sent = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'sharper' });
    await begin(sent.draft_id);
    const r = await complete(sent.draft_id, answer('sharper free'), 0.02);
    expect(r.refined ?? null).toBeNull();
    expect(await exists(old)).toBe(true);
    expect(await pointOf(draft)).toBe(old);
  });

  it('every refine card keeps its own deduplicated sent_ids, and the card it refined keeps its own', async () => {
    await finishActive();
    const { draft, thread } = await mkDone('dedupe');
    const sentBefore = (await admin.from('clarify_drafts').select('sent_ids').eq('id', draft).single()).data!.sent_ids as string[];
    for (const t of ['one', 'two']) {
      const sent = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: t });
      await begin(sent.draft_id);
      await complete(sent.draft_id, answer(`dedupe ${t}`), 0.01);
      const ids = (await admin.from('clarify_drafts').select('sent_ids').eq('id', sent.draft_id).single()).data!.sent_ids as string[];
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect((await admin.from('clarify_drafts').select('sent_ids').eq('id', draft).single()).data!.sent_ids).toEqual(sentBefore);
  });

  it('with every draft of the thread deleted, clarify_message and clarify_another start a new draft from the thread root; a stranger is still refused', async () => {
    await finishActive();
    const { draft, thread } = await mkDone('orphan');
    await ok(a.c, 'clarify_draft_delete', { p_draft: draft });
    expect((await admin.from('clarify_drafts').select('id').eq('thread_root_id', thread)).data).toHaveLength(0);
    expect((await rpc(b.c, 'clarify_message', { p_thread_root: thread, p_text: 'hijack' })).error?.code).toBe('42501');
    expect((await rpc(b.c, 'clarify_another', { p_thread_root: thread })).error?.code).toBe('42501');
    const m = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'try again from nothing' });
    expect(m.status).toBe('started');
    expect(await draftRow(m.draft_id)).toMatchObject({ thread_root_id: thread, source_message_id: src.id, instruction: 'try again from nothing' });
    await begin(m.draft_id);
    await complete(m.draft_id, answer('from nothing', 'new'), 0.01);
    await ok(a.c, 'clarify_draft_delete', { p_draft: m.draft_id });
    const n = await ok(a.c, 'clarify_another', { p_thread_root: thread });
    expect(n.status).toBe('started');
    expect(await draftRow(n.draft_id)).toMatchObject({ thread_root_id: thread, source_message_id: src.id });
    await begin(n.draft_id);
    await failRun(n.draft_id, 'test_cleanup', 0);
  });

  it('a refine names exactly the draft the run showed the model and changes none: a newer draft that appears in between is untouched, and a target deleted in between still just adds the run as a new card', async () => {
    await finishActive();
    const { draft: first, thread } = await mkDone('target one');
    const sent = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'sharper' });
    const run = await begin(sent.draft_id);
    expect(run.latest_draft).toBe(`${TAG} target one`);
    expect((await draftRow(sent.draft_id)).refine_target_id).toBe(first);
    // a newer finished draft appears while the model works (service role: the owner cannot add one while a run is active)
    const np = (await admin.from('points').insert({ statement: `${TAG} newer intruder`, first_validator_id: a.id, visibility: 'private' }).select('id').single()).data as Row;
    const d0 = await draftRow(first);
    const intruder = (await admin.from('clarify_drafts').insert({ owner_id: a.id, mirror_conversation_id: d0.mirror_conversation_id, thread_root_id: thread, source_conversation_id: d0.source_conversation_id,
      source_message_id: d0.source_message_id, point_id: np.id, state: 'done', created_at: new Date(Date.now() + 5000).toISOString() }).select('id').single()).data as Row;
    expect(await complete(sent.draft_id, answer('refined the first'), 0.02)).toMatchObject({ status: 'done' });
    expect(await draftRow(sent.draft_id)).toMatchObject({ state: 'done', refine_target_id: first });
    expect(await statementOf(sent.draft_id)).toBe(`${TAG} refined the first`);
    expect(await statementOf(first), 'the card it refined is not edited').toBe(`${TAG} target one`);
    expect(((await admin.from('points').select('statement').eq('id', np.id).single()).data as Row).statement, 'intruder untouched').toBe(`${TAG} newer intruder`);
    // the target is deleted while the model works: the answer is added as a new draft, nothing else is refined
    await finishActive();
    const s2 = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'sharper again' });
    const run2 = await begin(s2.draft_id);
    expect(run2.latest_draft).toBe(`${TAG} newer intruder`);
    await ok(a.c, 'clarify_draft_delete', { p_draft: intruder.id });
    const r2 = await complete(s2.draft_id, answer('after the delete'), 0.02);
    expect(r2.status).toBe('done');
    expect(r2.refined ?? null).toBeNull();
    expect(await draftRow(s2.draft_id)).toMatchObject({ state: 'done' });
    expect(await statementOf(first), 'no card was edited').toBe(`${TAG} target one`);
  });

  it('clarify_draft_counts: the owner sees one count per thread root of the Mirror conversation, another user gets an empty object', async () => {
    await finishActive();
    const { draft, thread } = await mkDone('counted');
    const conv = (await draftRow(draft)).mirror_conversation_id as string;
    const mine = await ok(a.c, 'clarify_draft_counts', { p_conversation: conv });
    const n = (await admin.from('clarify_drafts').select('id').eq('thread_root_id', thread).eq('owner_id', a.id)).data!.length;
    expect(mine[thread]).toBe(n);
    expect(n).toBeGreaterThan(0);
    expect(await ok(b.c, 'clarify_draft_counts', { p_conversation: conv }), 'someone else asking').toEqual({});
  });

  it('owner_messages holds only messages sent at or before the draft was queued', async () => {
    await finishActive();
    const { thread } = await mkDone('bounded');
    const first = await ok(a.c, 'clarify_message', { p_thread_root: thread, p_text: 'direction one' });
    const conv = (await admin.from('clarify_drafts').select('mirror_conversation_id').eq('id', first.draft_id).single()).data!.mirror_conversation_id;
    await new Promise((r) => setTimeout(r, 50));
    await ok(a.c, 'send_chat_message', { p_conversation: conv, p_body: 'typed after queueing', p_thread_root: thread });
    const run = await begin(first.draft_id);
    expect(run.owner_messages, JSON.stringify(run).slice(0, 300)).toEqual(['direction one']);
    await failRun(first.draft_id, 'test_cleanup', 0);
  });
});
