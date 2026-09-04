/**
 * @file 20260903151000_p1243_rotate_token_atomic_guard.spec.ts
 * @description Integration test for
 *   supabase/migrations/20260903151000_p1243_rotate_token_atomic_guard.sql
 *
 * rotate_invitation_token() used to read `status` with a plain SELECT, check it, and then issue
 * an UNCONDITIONAL update. erase_my_account() could terminate and anonymise the agreement in
 * that window (because the PARTNER erased their account), and the rotation would then overwrite
 * the terminated row back to 'pending' with a fresh, usable invitation token. P1243 moves the
 * creator and status conditions into the UPDATE's own WHERE clause.
 *
 * COVERAGE SPLIT — this file deliberately does not duplicate what already exists.
 * e2e/integration/p1230-pending-agreement-hijack.spec.ts already asserts, and still passes:
 *   - the creator resends a PENDING invitation (token rotates, expiry extends)
 *   - the creator resends an EXPIRED invitation, which returns to pending
 *   - a non-creator is refused 42501, and anon cannot call the RPC at all
 *   - an ACTIVE agreement is refused
 * Those are the legitimate paths and the pre-existing error contract; the refactor had to leave
 * every one of them intact, and running that file is the false-positive measurement.
 *
 * What this file adds is the two properties that suite does not reach, and that a careless
 * rewrite of this function would break silently:
 *
 *   1. TERMINATED is refused. This is the race's end state — the status a partner's erasure
 *      leaves behind. p1230 covers 'active' but never 'terminated'.
 *   2. ID NON-DISCLOSURE. A caller who is not the creator must get the SAME error for an id
 *      that exists and one that does not, so the RPC cannot be used to probe which agreement
 *      ids are real. Moving the decision into the WHERE clause means both cases now arrive at
 *      the same zero-row branch, and the diagnostic re-read has to reproduce one message for
 *      both. That is exactly the kind of contract a refactor drops without any test noticing.
 *
 * The interleaving itself (rotation reads -> erasure terminates -> rotation writes) cannot be
 * staged from Playwright: it needs two concurrent database sessions holding a transaction open,
 * and the anon-key client cannot do that. It was proven separately by replaying both statement
 * sequences against an identical fixture with the erasure injected at the same point — the
 * pre-fix sequence rotated the terminated row back to pending (ROW_COUNT=1), the post-fix
 * sequence matched nothing (ROW_COUNT=0). Recorded in the P1243 spec; not reproducible here.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from '../helpers/test-agreement';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function signIn(email: string): Promise<SupabaseClient> {
  const tmp = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await tmp.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function readRow(id: string) {
  const { data, error } = await supabaseAdmin
    .from('clarity_agreements')
    .select('status, invitation_token')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as { status: string; invitation_token: string };
}

test.describe.configure({ mode: 'serial' });

test.describe('P1243: rotate_invitation_token decides inside the write', () => {
  let creator: TestUser;
  let stranger: TestUser;
  const created: string[] = [];

  test.beforeAll(async () => {
    creator = await createTestUser({ name: `P1243 Creator ${RUN}` });
    stranger = await createTestUser({ name: `P1243 Stranger ${RUN}` });
  });

  test.afterAll(async () => {
    for (const id of created) await deleteTestAgreement(id);
    if (creator) await deleteTestUser(creator.user.id);
    if (stranger) await deleteTestUser(stranger.user.id);
  });

  test('a TERMINATED agreement cannot be rotated back to pending', async () => {
    const a = await createTestAgreement(creator.user.id, `p1243-partner-${RUN}@gmail.com`, {
      status: 'pending',
      visibility: 'private',
    });
    created.push(a.id);

    // The state a partner's erasure leaves behind: terminated and anonymised.
    const { error: termErr } = await supabaseAdmin
      .from('clarity_agreements')
      .update({
        status: 'terminated',
        terminated_at: new Date().toISOString(),
        partner_profile_id: null,
        partner_display_name: 'Deleted user',
      })
      .eq('id', a.id);
    expect(termErr, `fixture setup failed: ${termErr?.message}`).toBeNull();

    const creatorClient = await signIn(creator.email);
    const { error } = await creatorClient.rpc('rotate_invitation_token', { p_agreement_id: a.id });

    expect(error, 'a terminated agreement has no invitation to resend').not.toBeNull();
    expect(error!.code).toBe('42501');

    const row = await readRow(a.id);
    expect(row.status).toBe('terminated');
    expect(row.invitation_token).toBe(a.invitationToken);
  });

  test('a non-creator learns nothing about whether the id exists', async () => {
    const a = await createTestAgreement(creator.user.id, `p1243-partner2-${RUN}@gmail.com`, {
      status: 'pending',
      visibility: 'private',
    });
    created.push(a.id);

    const strangerClient = await signIn(stranger.email);

    const { error: realErr } = await strangerClient.rpc('rotate_invitation_token', {
      p_agreement_id: a.id,
    });
    const { error: fakeErr } = await strangerClient.rpc('rotate_invitation_token', {
      p_agreement_id: '00000000-0000-0000-0000-0000000000ff',
    });

    expect(realErr).not.toBeNull();
    expect(fakeErr).not.toBeNull();
    expect(realErr!.code).toBe('42501');
    expect(fakeErr!.code).toBe('42501');
    // The whole point: an id that exists and one that does not are indistinguishable.
    expect(realErr!.message).toBe(fakeErr!.message);

    expect((await readRow(a.id)).invitation_token).toBe(a.invitationToken);
  });
});
