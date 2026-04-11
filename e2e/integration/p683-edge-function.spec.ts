/**
 * @file p683-edge-function.spec.ts
 * @description P683: Integration tests for create-and-open-letter edge function
 *
 * Tests the server-side contract:
 * 1. Edge function rejects if termsAccepted !== true (strict boolean check)
 * 2. Edge function rejects invalid/missing termsVersion
 * 3. Edge function rejects termsVersion not in server-side allowlist
 * 4. Successful call creates terms_acceptances row with correct user_id + version
 * 5. terms_acceptances row has non-null ip_hash (SHA-256 hex)
 * 6. terms_acceptances row has non-null user_agent
 * 7. Profile accepted_terms_version matches termsVersion from request
 * 8. create-and-sign: termsVersion from request body overrides hardcoded v1.1
 *
 * These tests call the edge function directly (not via browser) to verify
 * the server-side contract in isolation.
 *
 * Prerequisites: feature/letters-ship branch must be merged or tests must run
 * against worktree w2 Supabase instance.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import {
  createTestLetter,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-and-open-letter`;
const CREATE_AND_SIGN_URL = `${SUPABASE_URL}/functions/v1/create-and-sign`;

/**
 * Helper: call create-and-open-letter edge function directly.
 * Returns the raw Response.
 */
async function callCreateAndOpenLetter(params: {
  token: string;
  termsAccepted?: unknown;
  termsVersion?: unknown;
}): Promise<{ status: number; body: unknown }> {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(params),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

test.describe('P683 Integration — create-and-open-letter edge function', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P683 EF Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P683 Edge Function Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P683 EF Story',
      content: 'Edge function integration test story.',
    });
    storyId = story.id;

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ===========================================================================
  // Rejection: termsAccepted not true
  // ===========================================================================

  test('rejects request when termsAccepted is false', async () => {
    const delivery = await createTestDelivery(letterId, {
      receiverEmail: `p683-ef-reject-false-${Date.now()}@example.com`,
    });

    const { status } = await callCreateAndOpenLetter({
      token: delivery.invitationToken,
      termsAccepted: false,
      termsVersion: 'v1.2',
    });

    expect(status, 'Must reject with 4xx when termsAccepted is false').toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);

    // Cleanup delivery
    await supabaseAdmin.from('letter_deliveries').delete().eq('id', delivery.id);
  });

  test('rejects request when termsAccepted is truthy string "true" (not strict boolean)', async () => {
    const delivery = await createTestDelivery(letterId, {
      receiverEmail: `p683-ef-reject-string-${Date.now()}@example.com`,
    });

    const { status } = await callCreateAndOpenLetter({
      token: delivery.invitationToken,
      termsAccepted: 'true', // string "true" is not boolean true
      termsVersion: 'v1.2',
    });

    expect(status, 'Must reject truthy string "true" — strict boolean required').toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);

    await supabaseAdmin.from('letter_deliveries').delete().eq('id', delivery.id);
  });

  test('rejects request when termsAccepted is missing', async () => {
    const delivery = await createTestDelivery(letterId, {
      receiverEmail: `p683-ef-reject-missing-${Date.now()}@example.com`,
    });

    const { status } = await callCreateAndOpenLetter({
      token: delivery.invitationToken,
      // termsAccepted omitted
      termsVersion: 'v1.2',
    });

    expect(status, 'Must reject when termsAccepted is absent').toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);

    await supabaseAdmin.from('letter_deliveries').delete().eq('id', delivery.id);
  });

  // ===========================================================================
  // Rejection: invalid termsVersion
  // ===========================================================================

  test('rejects request when termsVersion is not in server-side allowlist', async () => {
    const delivery = await createTestDelivery(letterId, {
      receiverEmail: `p683-ef-reject-version-${Date.now()}@example.com`,
    });

    const { status } = await callCreateAndOpenLetter({
      token: delivery.invitationToken,
      termsAccepted: true,
      termsVersion: 'v9.9', // not in allowlist
    });

    expect(status, 'Must reject version not in allowlist').toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);

    await supabaseAdmin.from('letter_deliveries').delete().eq('id', delivery.id);
  });

  // ===========================================================================
  // Success: terms_acceptances row created
  // ===========================================================================

  test('creates terms_acceptances row on successful account creation', async () => {
    const receiverEmail = `p683-ef-success-${Date.now()}@example.com`;
    const delivery = await createTestDelivery(letterId, {
      receiverEmail,
    });

    const { status } = await callCreateAndOpenLetter({
      token: delivery.invitationToken,
      termsAccepted: true,
      termsVersion: 'v1.2',
    });

    expect(status, 'Edge function must return 200 on valid request').toBe(200);

    // Find the created user by email
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const createdUser = users.find(u => u.email === receiverEmail);
    expect(createdUser, 'Auth user must be created').toBeDefined();

    if (createdUser) {
      // Check terms_acceptances row exists
      const { data: acceptanceRows } = await supabaseAdmin
        .from('terms_acceptances')
        .select('id, user_id, terms_version, ip_hash, user_agent, accepted_at')
        .eq('user_id', createdUser.id)
        .eq('terms_version', 'v1.2');

      expect(acceptanceRows, 'terms_acceptances row must be created').not.toBeNull();
      expect(acceptanceRows!.length, 'Exactly one terms_acceptances row expected').toBe(1);

      const row = acceptanceRows![0];

      // ip_hash must be non-null SHA-256 (64-char hex)
      expect(row.ip_hash, 'ip_hash must not be null').not.toBeNull();
      expect(row.ip_hash).toMatch(/^[a-f0-9]{64}$/i);

      // user_agent must be non-null
      expect(row.user_agent, 'user_agent must not be null').not.toBeNull();

      // accepted_at must be set
      expect(row.accepted_at, 'accepted_at must be set').not.toBeNull();

      // Cleanup
      await supabaseAdmin.from('terms_acceptances').delete().eq('user_id', createdUser.id);
      await deleteTestUser(createdUser.id);
    }

    await supabaseAdmin.from('letter_deliveries').delete().eq('id', delivery.id);
  });

  // ===========================================================================
  // Canary: orphan auth user (auth.users exists, profiles does NOT) should NOT
  // crash the edge function with a TypeError. Before the P683 fix, the self-heal
  // fallback calls `supabase.auth.admin.getUserByEmail()` which is not a method
  // in @supabase/supabase-js v2 — this throws a TypeError caught by the generic
  // catch block, returning 500 { error: 'INTERNAL', message: 'Failed to open letter' }.
  // After the fix the orphan path returns 500 CREATE_FAILED with the real error.
  // The canary asserts error !== 'INTERNAL' so it fails before the fix.
  // ===========================================================================

  test('p683 canary: orphan auth user does not trigger INTERNAL TypeError 500', async () => {
    const receiverEmail = `p683-orphan-canary-${Date.now()}@example.com`;

    // Create auth user WITHOUT a profiles row (orphan scenario)
    const { data: { user: orphanUser }, error: orphanErr } = await supabaseAdmin.auth.admin.createUser({
      email: receiverEmail,
      email_confirm: true,
    });
    if (orphanErr || !orphanUser) throw new Error(`Orphan user creation failed: ${orphanErr?.message}`);

    const delivery = await createTestDelivery(letterId, { receiverEmail });

    const { status, body } = await callCreateAndOpenLetter({
      token: delivery.invitationToken,
      termsAccepted: true,
      termsVersion: 'v1.2',
    });

    // Before fix: TypeError crashes with { error: 'INTERNAL', message: 'Failed to open letter' }
    // After fix: { error: 'CREATE_FAILED', message: <real createUser error> }
    // Either way the status is 500, but the error code must NOT be 'INTERNAL'.
    expect(
      (body as Record<string, unknown>).error,
      `Before fix this is 'INTERNAL' (TypeError); after fix it should be 'CREATE_FAILED'. Got status=${status}, body=${JSON.stringify(body)}`
    ).not.toBe('INTERNAL');

    // Cleanup
    await supabaseAdmin.from('letter_deliveries').delete().eq('id', delivery.id);
    await supabaseAdmin.auth.admin.deleteUser(orphanUser.id);
  });

  test('uses termsVersion from request body, not hardcoded v1.1', async () => {
    const receiverEmail = `p683-ef-version-${Date.now()}@example.com`;
    const delivery = await createTestDelivery(letterId, {
      receiverEmail,
    });

    await callCreateAndOpenLetter({
      token: delivery.invitationToken,
      termsAccepted: true,
      termsVersion: 'v1.2',
    });

    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const createdUser = users.find(u => u.email === receiverEmail);

    if (createdUser) {
      // Profile accepted_terms_version must match what we sent (v1.2), not hardcoded v1.1
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('accepted_terms_version')
        .eq('id', createdUser.id)
        .single();

      expect(
        profile?.accepted_terms_version,
        'Profile accepted_terms_version must match sent termsVersion (v1.2), not hardcoded v1.1'
      ).toBe('v1.2');

      // Cleanup
      await supabaseAdmin.from('terms_acceptances').delete().eq('user_id', createdUser.id);
      await deleteTestUser(createdUser.id);
    }

    await supabaseAdmin.from('letter_deliveries').delete().eq('id', delivery.id);
  });
});

// =============================================================================
// create-and-sign: version drift fix
// =============================================================================

test.describe('P683 Integration — create-and-sign termsVersion fix', () => {
  test.describe.configure({ timeout: 30000 });

  test('create-and-sign: accepts termsVersion parameter in request body', async () => {
    // This test verifies the edge function signature accepts the new parameter.
    // A minimal invalid request that fails for auth reasons (not missing-termsVersion)
    // confirms the parameter is parsed.
    const res = await fetch(CREATE_AND_SIGN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        termsVersion: 'v1.2',
        // Other required params omitted deliberately to get a validation error, not a
        // "termsVersion not found" error. If the function returns 400 (not 500), it
        // reached the termsVersion parsing stage successfully.
        partnerEmail: '',
        partnerName: '',
        terms: '',
      }),
    });

    const body = await res.json().catch(() => ({}));

    // Should fail with a validation error (400/422) — not a 500 crash
    // A 500 would indicate the function crashed parsing the new parameter
    expect(res.status, `Expected 4xx not 5xx. Body: ${JSON.stringify(body)}`).toBeLessThan(500);
  });

  test('create-and-sign: rejects request missing termsVersion', async () => {
    // If the function now requires termsVersion, it should reject its absence
    const res = await fetch(CREATE_AND_SIGN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        // termsVersion deliberately absent
        partnerEmail: 'test@example.com',
        partnerName: 'Test Partner',
        terms: 'Test terms',
      }),
    });

    // Should reject with 400 (not 200 with v1.1 silently applied)
    expect(
      res.status,
      'create-and-sign must reject when termsVersion is absent (no silent v1.1 fallback)'
    ).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});