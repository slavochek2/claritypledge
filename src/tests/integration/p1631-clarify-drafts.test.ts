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
    expect(r.source_message).toMatchObject({ id: msgs[2]!.id, is_pressed: true });
    const chatIds = r.surrounding_chat.map((x: Row) => x.id);
    expect(chatIds).toEqual([msgs[0]!.id, msgs[1]!.id, msgs[3]!.id]);   // oldest first; every line before the press, never the pressed one
    expect(chatIds).not.toContain(late.id);
    for (const row of [r.source_message, ...r.surrounding_chat, ...r.thread]) expect(Object.keys(row).filter((k) => !['id', 'text', 'is_pressed'].includes(k))).toEqual([]);
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
    expect(((await ok(a.c, 'get_clarify_thread', { p_thread_root: root })).drafts.find((x: Row) => x.id === d.id)).point.owner_position).toBe('agree');
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

  it('erasure: a person whose words a draft read takes the draft\'s point with them (erase_chat_data_for)', async () => {
    await finishActive();
    const s = await ok(a.c, 'clarify_start', { p_source: msgs[2]!.id });
    await begin(s.draft_id);
    const done = await complete(s.draft_id, goodResult(`${TAG} derived from B.`, { a: [msgs[2]!.id] }), 0.01);
    expect((await admin.from('points').select('id').eq('id', done.point_id)).data).toHaveLength(1);
    // the real erasure of B (the cleanup runs inside it, not as a trigger on chat_messages)
    const er = await admin.rpc('erase_chat_data_for', { p_uid: b.id });
    expect(er.error).toBeNull();
    expect((await admin.from('points').select('id').eq('id', done.point_id)).data, 'the point').toHaveLength(0);
    expect(await draftRow(s.draft_id)).toMatchObject({ state: 'failed', error_code: 'erased', point_id: null, suggestions: null, cited: null, derived_refs: [], sent_ids: [] });
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

  it('(GLM 1) erasing a person settles the reservation of a draft that was running on their words; (Gemini 7) a point another user holds a position on survives', async () => {
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
    expect((await admin.from('points').select('id').eq('id', done.point_id)).data, 'a point with someone else\'s position').toHaveLength(1);
    await admin.from('point_positions').delete().eq('point_id', done.point_id);
    await admin.from('points').delete().eq('id', done.point_id);
  });
});
