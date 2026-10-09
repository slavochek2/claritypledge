/**
 * @file p1321-witness-forgery.spec.ts
 * @description P1321 definer-function review, lead L2: the witnesses INSERT policy checked only
 * `auth.uid() = profile_id`, so a signed-in user could add a witness row to their own profile
 * naming ANY registered user as `witness_profile_id`. p878_relationship_scope reads that column
 * as "this person witnessed me", so the forged row put the named user inside the caller's
 * relationship scope — and create_agreement_with_profile, gated on that scope, then created an
 * agreement with them and returned their email in partner_email.
 *
 * No client writes witness_profile_id (addWitness in src/app/data/api.ts sends only profile_id,
 * witness_name, witness_linkedin_url). The control is that insert, which must keep working.
 * The scope assertion uses a fresh victim never otherwise related to the attacker, so a refusal
 * there can only come from the scope gate.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';

test.describe.configure({ mode: 'serial' });

let attackerId: string;
let attackerEmail: string;
let victimId: string;
let attacker: SupabaseClient;

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

test.beforeAll(async () => {
  attackerEmail = generateTestEmail();
  attackerId = (await createTestUser({ email: attackerEmail })).user.id;
  victimId = (await createTestUser({ email: generateTestEmail() })).user.id;
  attacker = await signedIn(attackerEmail);
});

test.afterAll(async () => {
  for (const id of [attackerId, victimId].filter(Boolean)) {
    await supabaseAdmin.from('clarity_agreements').delete().eq('creator_profile_id', id);
    await supabaseAdmin.from('witnesses').delete().eq('profile_id', id);
  }
  if (attackerId) await deleteTestUser(attackerId);
  if (victimId) await deleteTestUser(victimId);
});

test.describe('P1321 L2: a witness row cannot name another user as the witness', () => {
  test('control: the app-shaped insert (no witness_profile_id) still works', async () => {
    const { error } = await attacker
      .from('witnesses')
      .insert({ profile_id: attackerId, witness_name: 'P1321 control witness' });
    expect(error).toBeNull();
  });

  test('refused: an insert that sets witness_profile_id to another user', async () => {
    const { error } = await attacker.from('witnesses').insert({
      profile_id: attackerId,
      witness_name: 'P1321 forged witness',
      witness_profile_id: victimId,
    });
    expect(error?.message).toMatch(/row-level security/i);

    const { count } = await supabaseAdmin
      .from('witnesses')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', attackerId)
      .eq('witness_profile_id', victimId);
    expect(count).toBe(0);
  });

  test('so the victim stays outside the attacker\'s scope: no agreement, no email', async () => {
    const { data, error } = await attacker.rpc('create_agreement_with_profile', {
      p_partner_profile_id: victimId,
      p_partner_display_name: null,
      p_terms_text: 'P1321 L2 probe',
      p_visibility: 'private',
      p_agreement_version: '1',
    });
    expect(error?.message).toMatch(/not in your relationship scope/);
    expect(data).toBeNull();
  });
});
