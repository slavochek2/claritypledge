/**
 * @file p1554-mirror-quiet-shares.spec.ts
 * @description DB canary for supabase/migrations/20261023160000_p1554_mirror_quiet_shares.sql.
 *
 * THE INVARIANT. A point or story shared to the mirror with no text creates no mirror job (so no reply
 * and no spend). The control: the same share with a line of text does create one.
 * No model is called; nothing here costs anything.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';
import { RUN, signIn, ok, myChatIds, mirrorOf, purgeChatFor, type SignedIn, type Row } from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

let A: TestUser;
let sA: SignedIn;
let mirA: string;
const pointIds: string[] = [];

interface JobRef { job_id: string; state: string; reply_message_id: string | null }

const send = (body: string, extra: Record<string, unknown> = {}) =>
  ok<Row>(sA.client.rpc('send_chat_message', { p_conversation: mirA, p_body: body, ...extra }), `send "${body}"`);
const requestReply = (message: string) =>
  ok<JobRef[]>(sA.client.rpc('mirror_request_reply', { p_message: message }), 'mirror_request_reply');
async function jobsFor(message: string): Promise<number> {
  const { count, error } = await supabaseAdmin.from('mirror_jobs').select('id', { count: 'exact', head: true }).eq('trigger_message_id', message);
  if (error) throw new Error(`jobsFor: ${error.message}`);
  return count ?? 0;
}

test.beforeAll(async () => {
  A = await createTestUser({ name: `MiQuiet ${RUN}` });
  sA = await signIn(A);
  await myChatIds(sA.client);
  mirA = await mirrorOf(sA);
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  await purgeChatFor([A.user.id]);
  for (const p of pointIds) await deleteTestPoint(p);
  await deleteTestUser(A.user.id).catch(() => {});
});

test('a share with no text creates no job; the same share with a line of text does', async () => {
  const point = await createTestPoint(A.user.id);
  pointIds.push(point.id);
  const attach = { p_attachment_kind: 'point', p_attachment_id: point.id };

  const share = await send('', attach);
  expect(await requestReply(share.id)).toEqual([]);
  expect(await jobsFor(share.id)).toBe(0);

  const blank = await send('   ', attach).catch(() => null);
  if (blank) {
    expect(await requestReply(blank.id)).toEqual([]);
    expect(await jobsFor(blank.id)).toBe(0);
  }

  const withText = await send(`what do you make of this ${RUN}`, attach);
  const rows = await requestReply(withText.id);
  expect(rows).toHaveLength(1);
  expect(await jobsFor(withText.id)).toBe(1);

  const plain = await send(`plain ${RUN}`);
  expect(await requestReply(plain.id)).toHaveLength(1);
});
