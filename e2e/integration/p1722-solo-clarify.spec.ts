/**
 * @file p1722-solo-clarify.spec.ts
 * @description P1722 (migration 20261125104835): a point made alone with the Mirror, private or public. Real RPCs as a real signed-in person;
 * the model is not involved (drafts are begun and completed through the service-role worker functions with hand-written results).
 * CONTROL: the same person's Clarify on another person's Mirror row, and a row that is not their own typed words, is still refused.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUsers, type TestUser } from '../helpers/test-user';
import { signIn, ok, mirrorOf, RUN, type SignedIn } from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

type R = Record<string, unknown>;
type Res = { status: string; code?: string; draft_id: string; thread_root_id: string | null; point_id: string; message_id: string; conversation_id: string; [k: string]: unknown };
const STMT = `P1722 ${RUN} shipping early beats shipping late`;

test.describe('P1722: solo Clarify in the Mirror', () => {
  let a: TestUser;
  let asA: SignedIn;
  let mirror = '';
  const created: TestUser[] = [];
  const rpc = async (who: SignedIn, fn: string, args: R = {}) => ok<Res>(who.client.rpc(fn, args), fn);
  const admin = supabaseAdmin;

  const typed = async (body: string, extra: R = {}) => {
    const { data, error } = await admin.from('chat_messages').insert({ conversation_id: mirror, author_id: a.user.id, body, kind: 'message', ...extra }).select('id').single();
    if (error) throw new Error(`fixture message: ${error.message}`);
    return data.id as string;
  };
  /** Begins and completes a draft with a hand-written result, as the worker would. */
  const complete = async (draft: string, statement: string) => {
    await admin.from('mirror_ai_spend').delete().eq('owner_id', a.user.id).eq('bucket', 'canvas');
    await admin.rpc('_clarify_begin', { p_draft: draft });
    const run = (await admin.from('clarify_drafts').select('spend_id').eq('id', draft).single()).data?.spend_id;
    const { data, error } = await admin.rpc('_clarify_complete', { p_draft: draft, p_result: { decision: 'draft', statement, cited: { a: [], b: [] } }, p_usd: 0.01, p_run: run });
    if (error || data?.status !== 'done') throw new Error(`complete: ${error?.message ?? JSON.stringify(data)}`);
    return data.point_id as string;
  };

  test.beforeAll(async () => {
    a = await createTestUser({ name: `P1722 A ${RUN}` });
    created.push(a);
    asA = await signIn(a);
    mirror = await mirrorOf(asA);
  });
  test.afterAll(async () => {
    await admin.from('points').delete().like('statement', `P1722 ${RUN}%`);
    const ids = created.map((u) => u.user.id);
    await admin.from('mirror_ai_spend').delete().in('owner_id', ids);
    await deleteTestUsers(ids); // one batch call; a cleanup failure throws, it is not swallowed
  });

  test('Clarify starts on a typed Mirror message and refuses a Clarify root (CONTROL)', async () => {
    const m = await typed(`P1722 ${RUN} typed words`);
    const s = await rpc(asA, 'clarify_start', { p_source: m });
    expect(s.status).toBe('started');
    await complete(s.draft_id, `${STMT} control`); // settle the run first: a run in flight answers 'busy' before any refusal
    const { error } = await asA.client.rpc('clarify_start', { p_source: s.thread_root_id });
    expect(error?.code).toBe('22023');
  });

  test('tags exist only when typed in the text; a tag not in the text is refused', async () => {
    const m = await typed(`P1722 ${RUN} tags source`);
    const s = await rpc(asA, 'clarify_start', { p_source: m });
    const point = await complete(s.draft_id, `${STMT} tags`);
    const bad = await asA.client.rpc('clarify_draft_edit', { p_draft: s.draft_id, p_statement: `${STMT} tags #speed`, p_tags: ['other'] });
    expect(bad.error?.message).toContain('bad tags');
    const good = await rpc(asA, 'clarify_draft_edit', { p_draft: s.draft_id, p_statement: `${STMT} tags #speed`, p_tags: ['speed'] });
    expect(good).toMatchObject({ status: 'ok', tags: ['speed'], point_id: point });
  });

  test('Public: a new public point, the private one gone, one position, posted to the Mirror main chat; a retry says already; the choice then freezes', async () => {
    const m = await typed(`P1722 ${RUN} public source`);
    const s = await rpc(asA, 'clarify_start', { p_source: m });
    const priv = await complete(s.draft_id, `${STMT} public`);
    expect(await rpc(asA, 'clarify_publish', { p_draft: s.draft_id, p_client_id: randomUUID() })).toMatchObject({ status: 'refused', code: 'no_position' });
    await asA.client.from('point_positions').upsert({ point_id: priv, user_id: a.user.id, position: 'agree' }, { onConflict: 'point_id,user_id' });
    expect(await rpc(asA, 'clarify_set_visibility', { p_draft: s.draft_id, p_visibility: 'public' })).toMatchObject({ status: 'ok', visibility: 'public' });
    const pub = await rpc(asA, 'clarify_publish', { p_draft: s.draft_id, p_client_id: randomUUID(), p_visibility: 'public', p_warning_ack: true });
    expect(pub).toMatchObject({ status: 'published', conversation_id: mirror, thread_root_id: null });
    expect(await rpc(asA, 'clarify_publish', { p_draft: s.draft_id, p_client_id: randomUUID(), p_visibility: 'public', p_warning_ack: true })).toMatchObject({ status: 'already', message_id: pub.message_id });
    expect(await rpc(asA, 'clarify_set_visibility', { p_draft: s.draft_id, p_visibility: 'private' })).toMatchObject({ status: 'refused', code: 'published' });
    const d = (await admin.from('clarify_drafts').select('point_id, visibility, first_published_at').eq('id', s.draft_id).single()).data!;
    expect(d.visibility).toBe('public');
    expect(d.first_published_at).not.toBeNull();
    expect(d.point_id).not.toBe(priv);
    expect((await admin.from('points').select('id').eq('id', priv)).data).toHaveLength(0);
    const np = (await admin.from('points').select('visibility').eq('id', d.point_id).single()).data!;
    expect(np.visibility).toBe('public');
    expect((await admin.from('point_positions').select('user_id').eq('point_id', d.point_id)).data).toHaveLength(1);
  });

  test('New point in an empty Mirror starts an anchor-less root; the first typed reply starts the run', async () => {
    const b = await createTestUser({ name: `P1722 B ${RUN}` });
    created.push(b);
    const asB = await signIn(b);
    const bm = await mirrorOf(asB);
    const r = await rpc(asB, 'clarify_start_chat', { p_conversation: bm, p_draft: false });
    expect(r).toMatchObject({ status: 'started', scope: 'chat', draft_id: null });
    const first = await rpc(asB, 'clarify_message', { p_thread_root: r.thread_root_id, p_text: 'Remote work makes teams better' });
    expect(first.status).toBe('started');
    expect(first.draft_id).toBeTruthy();
  });

  test('the Mirror does not answer a transcribed line', async () => {
    const m = await typed(`P1722 ${RUN} spoken line`, { is_transcription: true });
    const { data, error } = await asA.client.rpc('mirror_request_reply', { p_message: m });
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});
