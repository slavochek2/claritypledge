/**
 * @file p1321-letter-delivery-guard.spec.ts
 * @description P1321 definer-function review, lead L1: create_letter_delivery(uuid, int) is the
 * signed-in reader's write path for a PUBLIC (sealed, one-to-many) letter. A delivery row makes
 * its caller the letter's receiver, so the function must refuse every other letter — a draft, a
 * one-to-one letter (whose receivers are invited, never self-enrolled), an expired letter.
 *
 * Mirrors the guard create_letter_delivery_on_open already carries. Every refusal also asserts
 * that no delivery row was written; the sealed one-to-many case is the control proving the
 * caller, the session and the RPC all work, so a refusal cannot be explained by a broken setup.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';

type LetterShape = { mode: 'one-to-one' | 'one-to-many'; status: 'draft' | 'sealed' | 'expired' };

const REFUSED: LetterShape[] = [
  { mode: 'one-to-many', status: 'draft' },
  { mode: 'one-to-one', status: 'sealed' },
  { mode: 'one-to-one', status: 'draft' },
  { mode: 'one-to-many', status: 'expired' },
];
const ALLOWED: LetterShape = { mode: 'one-to-many', status: 'sealed' };

test.describe.configure({ mode: 'serial' });

let senderId: string;
let readerId: string;
let readerEmail: string;
let docId: string;
const letterIds = new Map<string, string>();

const key = (s: LetterShape) => `${s.mode}/${s.status}`;

// Sign in on a throwaway client: signInWithPassword on supabaseAdmin would replace its
// service-role session with the reader's, and every admin read and teardown after it would
// then run as the reader.
async function readerClient() {
  const authClient = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signInWithPassword({
    email: readerEmail,
    password: TEST_PASSWORD,
  });
  expect(error, `reader sign-in failed: ${error?.message}`).toBeNull();
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function deliveryCount(letterId: string) {
  const { count, error } = await supabaseAdmin
    .from('letter_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('letter_id', letterId)
    .eq('receiver_profile_id', readerId);
  expect(error).toBeNull();
  return count ?? -1;
}

test.beforeAll(async () => {
  const { user: sender } = await createTestUser({ email: generateTestEmail() });
  senderId = sender.id;
  readerEmail = generateTestEmail();
  const { user: reader } = await createTestUser({ email: readerEmail });
  readerId = reader.id;

  const { data: doc, error: docErr } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: 'P1321 L1 doc', owner_id: senderId })
    .select('id')
    .single();
  expect(docErr, `doc create failed: ${docErr?.message}`).toBeNull();
  docId = doc!.id;

  for (const shape of [...REFUSED, ALLOWED]) {
    const { data, error } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: senderId,
        mode: shape.mode,
        status: shape.status,
        sealed_at: shape.status === 'draft' ? null : new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(error, `letter ${key(shape)} create failed: ${error?.message}`).toBeNull();
    letterIds.set(key(shape), data!.id);
  }
});

test.afterAll(async () => {
  const ids = [...letterIds.values()];
  if (ids.length) {
    await supabaseAdmin.from('letter_deliveries').delete().in('letter_id', ids);
    await supabaseAdmin.from('clarity_letters').delete().in('id', ids);
  }
  if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
  if (readerId) await deleteTestUser(readerId);
  if (senderId) await deleteTestUser(senderId);
});

test.describe('P1321 L1: create_letter_delivery only enrols readers of a public letter', () => {
  test('control: a sealed one-to-many letter accepts a signed-in reader', async () => {
    const letterId = letterIds.get(key(ALLOWED))!;
    const client = await readerClient();
    const { data, error } = await client.rpc('create_letter_delivery', {
      p_letter_id: letterId,
      p_stories_rated: 0,
    });
    expect(error).toBeNull();
    expect(typeof data).toBe('string');
    expect(await deliveryCount(letterId)).toBe(1);
  });

  for (const shape of REFUSED) {
    test(`refused, and no delivery written: ${key(shape)}`, async () => {
      const letterId = letterIds.get(key(shape))!;
      const client = await readerClient();
      const { data, error } = await client.rpc('create_letter_delivery', {
        p_letter_id: letterId,
        p_stories_rated: 0,
      });
      expect(data).toBeNull();
      expect(error?.message).toMatch(/Letter not accessible/);
      expect(await deliveryCount(letterId)).toBe(0);
    });
  }
});
