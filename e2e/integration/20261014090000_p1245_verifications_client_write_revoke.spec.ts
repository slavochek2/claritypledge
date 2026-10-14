/**
 * @file 20261014090000_p1245_verifications_client_write_revoke.spec.ts
 * @description P270 canary for 20261014090000_p1245_verifications_client_write_revoke.sql.
 *
 * clarity_verifications is a legacy table: the page that wrote it was deleted (P803) and no
 * client code path inserts, updates or deletes it. The migration therefore takes client write
 * access away entirely instead of adding a session-status predicate to a write path nobody uses.
 *
 * Red before the migration: no client write is refused by this table's grant layer. On prod a
 * signed-in user's INSERT is admitted by the policy; on the test project it happens to fail later,
 * on a legacy trigger that prod does not carry (schema drift), so the INSERT assertions pin the
 * refusing layer, not just "an error". UPDATE/DELETE return no error at all (RLS silently matches
 * zero rows).
 * Green after: every client write is refused with 42501 on clarity_verifications itself, and an
 * admin readback confirms nothing was written or changed.
 *
 * Controls (gate 7c — the paths that must keep working):
 *   - a session participant can still READ the verification (the SELECT policy is untouched);
 *   - the service role can still write (server-side path);
 *   - erase_my_account(), the only remaining writer (SECURITY DEFINER), still deletes the leaver's
 *     verifications.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = Math.random().toString(36).slice(2, 8);

async function signedInClient(email: string): Promise<SupabaseClient> {
  const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`p1245 fixture: sign-in failed: ${error?.message}`);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function seedSession(creator: TestUser, joiner: TestUser, status?: 'cancelled') {
  const { data, error } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code: `P1245${RUN}${Math.random().toString(36).slice(2, 5)}`.toUpperCase(),
      creator_name: creator.name,
      creator_profile_id: creator.user.id,
      joiner_name: joiner.name,
      joiner_profile_id: joiner.user.id,
      ...(status ? { status } : {}),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`p1245 fixture: session seed failed: ${error?.message}`);
  return data.id as string;
}

async function seedMessage(sessionId: string, authorName: string) {
  const { data, error } = await supabaseAdmin
    .from('clarity_chat_messages')
    .insert({ session_id: sessionId, author_name: authorName, content: `p1245 ${RUN} message` })
    .select('id')
    .single();
  if (error || !data) throw new Error(`p1245 fixture: message seed failed: ${error?.message}`);
  return data.id as string;
}

async function seedVerification(messageId: string, verifierName: string) {
  const { data, error } = await supabaseAdmin
    .from('clarity_verifications')
    .insert({ message_id: messageId, verifier_name: verifierName, paraphrase_text: `p1245 ${RUN} seeded` })
    .select('id')
    .single();
  if (error || !data) throw new Error(`p1245 fixture: verification seed failed: ${error?.message}`);
  return data.id as string;
}

/**
 * The refusal must come from this table's own grant layer. Asserting only "some error" is not
 * enough: on the test project an unrelated legacy trigger already fails a client INSERT for a
 * different reason (a permission error on a neighbouring table), which would make the INSERT
 * assertions pass before the migration and prove nothing about it.
 */
function expectGrantRefusal(error: { code?: string; message?: string } | null, what: string) {
  expect(error, `${what} must be refused`).not.toBeNull();
  expect(error?.code, `${what}: expected 42501, got ${error?.code} ${error?.message}`).toBe('42501');
  expect(error?.message, `${what}: refused by the wrong layer`).toContain('table clarity_verifications');
}

async function countByText(text: string) {
  const { count, error } = await supabaseAdmin
    .from('clarity_verifications')
    .select('id', { count: 'exact', head: true })
    .eq('paraphrase_text', text);
  if (error) throw new Error(`p1245 readback failed: ${error.message}`);
  return count ?? 0;
}

test.describe('P1245: client roles cannot write clarity_verifications', () => {

  let speaker: TestUser;
  let listener: TestUser;
  let listenerClient: SupabaseClient;
  const sessionIds: string[] = [];
  let activeMessageId: string;
  let cancelledMessageId: string;
  let seededVerificationId: string;

  test.beforeAll(async () => {
    speaker = await createTestUser({ name: `P1245 Speaker ${RUN}` });
    listener = await createTestUser({ name: `P1245 Listener ${RUN}` });
    listenerClient = await signedInClient(listener.email);

    const active = await seedSession(speaker, listener);
    const cancelled = await seedSession(speaker, listener, 'cancelled');
    sessionIds.push(active, cancelled);
    activeMessageId = await seedMessage(active, speaker.name);
    cancelledMessageId = await seedMessage(cancelled, speaker.name);
    seededVerificationId = await seedVerification(activeMessageId, listener.name);
  });

  test.afterAll(async () => {
    // Sessions cascade to messages, which cascade to verifications.
    if (sessionIds.length) await supabaseAdmin.from('clarity_sessions').delete().in('id', sessionIds);
    if (speaker?.user?.id) await deleteTestUser(speaker.user.id);
    if (listener?.user?.id) await deleteTestUser(listener.user.id);
  });

  test('control: a participant can still read the verification in their session', async () => {
    const { data, error } = await listenerClient
      .from('clarity_verifications').select('id').eq('id', seededVerificationId);
    expect(error, `participant read failed: ${error?.message}`).toBeNull();
    expect(data).toHaveLength(1);
  });

  test('a participant INSERT in an ACTIVE session is refused, and nothing is written', async () => {
    const text = `p1245 ${RUN} client insert active`;
    const { error } = await listenerClient.from('clarity_verifications').insert({
      message_id: activeMessageId, verifier_name: listener.name, paraphrase_text: text,
    });
    expectGrantRefusal(error, 'client INSERT (active session)');
    expect(await countByText(text)).toBe(0);
  });

  test('a participant INSERT in a CANCELLED session is refused, and nothing is written', async () => {
    const text = `p1245 ${RUN} client insert cancelled`;
    const { error } = await listenerClient.from('clarity_verifications').insert({
      message_id: cancelledMessageId, verifier_name: listener.name, paraphrase_text: text,
    });
    expectGrantRefusal(error, 'client INSERT (cancelled session)');
    expect(await countByText(text)).toBe(0);
  });

  test('a participant UPDATE is refused with an error, not a silent zero-row match', async () => {
    const { error } = await listenerClient
      .from('clarity_verifications').update({ paraphrase_text: 'p1245 rewritten' }).eq('id', seededVerificationId);
    expectGrantRefusal(error, 'client UPDATE');
    const { data } = await supabaseAdmin
      .from('clarity_verifications').select('paraphrase_text').eq('id', seededVerificationId).single();
    expect(data?.paraphrase_text).toBe(`p1245 ${RUN} seeded`);
  });

  test('a participant DELETE is refused with an error, and the row survives', async () => {
    const { error } = await listenerClient.from('clarity_verifications').delete().eq('id', seededVerificationId);
    expectGrantRefusal(error, 'client DELETE');
    const { count } = await supabaseAdmin
      .from('clarity_verifications').select('id', { count: 'exact', head: true }).eq('id', seededVerificationId);
    expect(count).toBe(1);
  });

  test('control: the service role can still write the table', async () => {
    const { error } = await supabaseAdmin
      .from('clarity_verifications').update({ position: 'agree' }).eq('id', seededVerificationId);
    expect(error, `service-role update failed: ${error?.message}`).toBeNull();
  });
});

test.describe('P1245 control: erase_my_account still removes the leaver\'s verifications', () => {
  let leaver: TestUser;
  let stayer: TestUser;
  let leaverErased = false;
  let sessionId: string;
  let verificationId: string;

  test.beforeAll(async () => {
    leaver = await createTestUser({ name: `P1245 Leaver ${RUN}` });
    stayer = await createTestUser({ name: `P1245 Stayer ${RUN}` });
    sessionId = await seedSession(leaver, stayer);
    const stayerMessage = await seedMessage(sessionId, stayer.name);
    verificationId = await seedVerification(stayerMessage, leaver.name);
  });

  test.afterAll(async () => {
    if (sessionId) await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    if (stayer?.user?.id) await deleteTestUser(stayer.user.id);
    if (!leaverErased && leaver?.user?.id) await deleteTestUser(leaver.user.id);
  });

  test('the definer path deletes the verification the leaver wrote', async () => {
    const me = await signedInClient(leaver.email);
    const { error } = await me.rpc('erase_my_account');
    expect(error, `erase_my_account failed: ${error?.message}`).toBeNull();
    leaverErased = true;
    const { count, error: readErr } = await supabaseAdmin
      .from('clarity_verifications').select('id', { count: 'exact', head: true }).eq('id', verificationId);
    expect(readErr).toBeNull();
    expect(count).toBe(0);
  });
});
