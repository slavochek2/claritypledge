/**
 * Integration test: create_letter_delivery_on_open stamps notified_at (P884 M1).
 *
 * Migration: 20260605090000_p884_stamp_on_open_deliveries.sql
 *
 * P778 self-enrolled reader deliveries (created when an authenticated reader
 * opens a public one-to-many letter) carry a receiver_email but must NEVER
 * receive an invitation email — the reader already opened the letter.
 * Post-P884, send-letter-emails emails every notified_at-IS-NULL delivery, so
 * the RPC must stamp notified_at at insert time.
 *
 * Guarantees under test:
 *   1. RPC-inserted on-open delivery has notified_at set at creation
 *   2. send-letter-emails (sender-invoked, letter-wide) sends 0 emails to a
 *      letter whose only delivery is a self-enrolled reader
 *   3. Idempotent re-open returns the same stamped row
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import {
  createTestLetter,
  createTestStorySnapshot,
  sealTestLetter,
  deleteTestLetter,
  getDeliveryNotifiedAt,
} from '../helpers/test-letter';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345';

async function makeUserClient(email: string) {
  const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await tempClient.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

test.describe('P884: on-open deliveries are stamped do-not-notify', () => {
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  let sender: TestUser;
  let reader: TestUser;
  let senderToken: string;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let readerDeliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P884 OnOpen Sender' });
    reader = await createTestUser({ name: 'P884 OnOpen Reader' });

    const senderClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: signIn, error: signInError } = await senderClient.auth.signInWithPassword({
      email: sender.user.email!,
      password: TEST_PASSWORD,
    });
    if (signInError || !signIn.session) throw new Error(`Sender sign-in failed: ${signInError?.message}`);
    senderToken = signIn.session.access_token;

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P884 OnOpen Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P884 OnOpen Story',
      content: 'Story for on-open delivery test.',
    });
    storyId = story.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    letterId = letter.id;
    await createTestStorySnapshot(letterId, storyId, version?.id ?? storyId);
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (storyId) await deleteTestStory(storyId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (reader?.user?.id) await deleteTestUser(reader.user.id);
  });

  test('RPC stamps notified_at on the self-enrolled delivery at insert', async () => {
    const readerClient = await makeUserClient(reader.user.email!);
    const { data, error } = await readerClient.rpc('create_letter_delivery_on_open', {
      p_letter_id: letterId,
    });

    expect(error, `RPC must succeed: ${error?.message}`).toBeNull();
    const rows = data as Array<{ id: string; notified_at: string | null }>;
    expect(rows?.length, 'RPC must return the inserted delivery').toBe(1);
    readerDeliveryId = rows[0].id;

    expect(
      rows[0].notified_at,
      'on-open delivery must be stamped notified_at at insert (do-not-notify)'
    ).not.toBeNull();
  });

  test('sender-invoked send-letter-emails sends 0 to self-enrolled readers', async () => {
    const stampBefore = await getDeliveryNotifiedAt(readerDeliveryId);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-letter-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${senderToken}`,
      },
      body: JSON.stringify({ letterId }),
    });
    const body = (await res.json().catch(() => ({}))) as { sent?: unknown };

    expect(res.status).toBe(200);
    expect(body.sent, 'letter-wide invoke must not email self-enrolled readers').toBe(0);
    expect(
      await getDeliveryNotifiedAt(readerDeliveryId),
      'self-enrolled delivery stamp must be unchanged by the invoke'
    ).toBe(stampBefore);
  });

  test('idempotent re-open returns the same stamped row', async () => {
    const readerClient = await makeUserClient(reader.user.email!);
    const { data, error } = await readerClient.rpc('create_letter_delivery_on_open', {
      p_letter_id: letterId,
    });

    expect(error, `re-open must succeed: ${error?.message}`).toBeNull();
    const rows = data as Array<{ id: string; notified_at: string | null }>;
    expect(rows?.[0]?.id, 're-open must return the existing delivery').toBe(readerDeliveryId);
    expect(rows?.[0]?.notified_at, 'existing delivery must remain stamped').not.toBeNull();
  });
});
