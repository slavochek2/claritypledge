/**
 * @file p1321-profile-email-pin.spec.ts
 * @description P1321 definer-function review, leads L3/L4: profiles.email was writable by its
 * owner — through upsert_my_profile (which copied p_data->>'email' verbatim) and through a
 * direct UPDATE under the own-row policy. Four definer functions treat that column as the
 * person's identity: lookup_party_by_email and add_recipient_to_sealed_letter /
 * seal_and_send_letter resolve an email to a profile with it, and erase_my_account
 * anonymises every delivery and agreement addressed to it. So a user who set their email to
 * someone else's became that person's invitee, and erasing their account wiped that person's
 * pending invitations.
 *
 * After the fix the column follows the auth record: a client write cannot change it, and
 * upsert_my_profile writes the caller's auth.users email whatever p_data carries.
 *
 * profiles.email carries a case-sensitive UNIQUE constraint, so writing a REGISTERED user's exact
 * address fails on the constraint and proves nothing — the first draft of this file passed
 * against the unfixed database for exactly that reason. The exposure is (a) an address nobody
 * has registered yet, e.g. a person invited by email, and (b) a case variant of a registered
 * address, which the lower()-comparing lookups then match. Both are asserted.
 *
 * Controls: the same upsert with the caller's real email still saves the other fields, and
 * lookup_party_by_email still finds a real address, so a refusal is not a broken setup.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';

test.describe.configure({ mode: 'serial' });

let attacker: { id: string; email: string; slug: string; name: string };
let victim: { id: string; email: string };
let invitee: string; // an address no account holds
let observer: { id: string; email: string };
let attackerClient: SupabaseClient;
let observerClient: SupabaseClient;

async function signedIn(email: string) {
  // Throwaway auth client — signing in on supabaseAdmin would replace its service-role session.
  const auth = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  expect(error, `sign-in failed: ${error?.message}`).toBeNull();
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function storedEmail(id: string) {
  const { data, error } = await supabaseAdmin.from('profiles').select('email').eq('id', id).single();
  expect(error).toBeNull();
  return data!.email as string;
}

function upsertPayload(email: string, name: string) {
  return {
    email,
    name,
    slug: attacker.slug,
    role: 'Test Engineer',
    avatar_color: '#4A90E2',
    pledge_version: 2,
    accepted_terms_version: 'v1.4',
  };
}

test.beforeAll(async () => {
  const a = await createTestUser({ email: generateTestEmail() });
  attacker = { id: a.user.id, email: a.email, slug: a.slug, name: a.name };
  const v = await createTestUser({ email: generateTestEmail() });
  victim = { id: v.user.id, email: v.email };
  invitee = generateTestEmail();
  const o = await createTestUser({ email: generateTestEmail() });
  observer = { id: o.user.id, email: o.email };
  attackerClient = await signedIn(attacker.email);
  observerClient = await signedIn(observer.email);
});

test.afterAll(async () => {
  for (const id of [attacker?.id, victim?.id, observer?.id].filter(Boolean) as string[]) {
    await deleteTestUser(id);
  }
});

test.describe('P1321 L3/L4: profiles.email follows the auth record', () => {
  test('control: upsert_my_profile with the caller\'s own email saves the other fields', async () => {
    const { error } = await attackerClient.rpc('upsert_my_profile', {
      p_data: upsertPayload(attacker.email, 'P1321 control name'),
    });
    expect(error).toBeNull();
    const { data } = await supabaseAdmin.from('profiles').select('name').eq('id', attacker.id).single();
    expect(data?.name).toBe('P1321 control name');
    expect(await storedEmail(attacker.id)).toBe(attacker.email);
  });

  test('upsert_my_profile ignores an unregistered address in p_data', async () => {
    await attackerClient.rpc('upsert_my_profile', {
      p_data: upsertPayload(invitee, attacker.name),
    });
    expect(await storedEmail(attacker.id)).toBe(attacker.email);
  });

  test('so an invitee\'s address resolves to nobody, not to the attacker', async () => {
    const { data, error } = await observerClient.rpc('lookup_party_by_email', { p_email: invitee });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test('a direct UPDATE to a case variant of a registered address does not change it', async () => {
    await attackerClient.from('profiles').update({ email: victim.email.toUpperCase() }).eq('id', attacker.id);
    expect(await storedEmail(attacker.id)).toBe(attacker.email);
  });

  test('control: the victim\'s address still resolves to the victim', async () => {
    const { data, error } = await observerClient.rpc('lookup_party_by_email', { p_email: victim.email });
    expect(error).toBeNull();
    expect((data as { id: string } | null)?.id).toBe(victim.id);
  });
});
