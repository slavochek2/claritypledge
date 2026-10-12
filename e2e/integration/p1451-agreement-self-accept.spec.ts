/**
 * P1451 — only the partner-authorised accept path makes an agreement active.
 *
 * Runs against the TEST project only (npx playwright test --project=integration
 * e2e/integration/p1451-agreement-self-accept.spec.ts). Fixtures are created and
 * removed with the service-role client (exempt from the trigger by design);
 * every write under test uses the anon key with a signed-in user's JWT — the
 * same credentials a browser has.
 *
 * Red state: the four tests in the first group write a row before the P1451
 * migration and are refused (42501) after it. The controls pin every legitimate
 * status write a client makes (agreements-service-real.ts: lazy expiry, cancel,
 * terminate) plus the accept path, and the non-party refusal from P1230.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestAgreement, deleteTestAgreement, type TestAgreement } from '../helpers/test-agreement';

function makeAnonClient(): SupabaseClient {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// One session per user for the whole file: every sign-in counts against the auth rate limit,
// which is what failed these tests under the full lane (finding 5 of the /finish review).
const sessions = new Map<string, Promise<SupabaseClient>>();
function signIn(email: string): Promise<SupabaseClient> {
  if (!sessions.has(email)) sessions.set(email, freshSignIn(email));
  return sessions.get(email)!;
}

async function freshSignIn(email: string): Promise<SupabaseClient> {
  const { data, error } = await makeAnonClient().auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull();
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

async function readRow(id: string) {
  const { data, error } = await supabaseAdmin
    .from('clarity_agreements')
    .select('id, partner_profile_id, partner_signed_at, status')
    .eq('id', id)
    .single();
  expect(error, error?.message).toBeNull();
  return data!;
}

async function publicIdsFor(profileId: string): Promise<unknown[]> {
  const { data, error } = await makeAnonClient().rpc('get_public_agreements_for_profile', {
    p_profile_id: profileId,
  });
  expect(error, error?.message).toBeNull();
  return ((data ?? []) as Record<string, unknown>[]).map((r) => r.id);
}

test.describe('P1451: a client cannot move an agreement to active', () => {
  let creator: TestUser;
  let partner: TestUser;
  let stranger: TestUser;
  const created: string[] = [];

  async function fixture(overrides: Parameters<typeof createTestAgreement>[2]): Promise<TestAgreement> {
    const a = await createTestAgreement(creator.user.id, partner.email, {
      visibility: 'public',
      ...overrides,
    });
    created.push(a.id);
    return a;
  }

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P1451 Creator' });
    partner = await createTestUser({ name: 'P1451 Partner' });
    stranger = await createTestUser({ name: 'P1451 Stranger' });
  });

  test.afterAll(async () => {
    for (const id of created) await deleteTestAgreement(id);
    for (const u of [creator, partner, stranger]) {
      if (u?.user?.id) await deleteTestUser(u.user.id);
    }
  });

  // ── The defect ──────────────────────────────────────────────────────────────

  test('the creator cannot activate an agreement they created the way the app does', async () => {
    const creatorClient = await signIn(creator.email);

    // The app's own insert (createAgreement): pending, no partner.
    const { data: inserted, error: insertError } = await creatorClient
      .from('clarity_agreements')
      .insert({
        creator_profile_id: creator.user.id,
        partner_email: partner.email,
        partner_display_name: 'P1451 Partner',
        terms_text: 'P1451 terms',
        visibility: 'public',
        agreement_version: '4',
      })
      .select('id, status')
      .single();
    expect(insertError, `control: the app's insert must work: ${insertError?.message}`).toBeNull();
    created.push(inserted!.id);
    expect(inserted!.status).toBe('pending');

    const { error } = await creatorClient
      .from('clarity_agreements')
      .update({ status: 'active' })
      .eq('id', inserted!.id)
      .select('id');

    expect(error, 'the trigger must refuse a client move to active').not.toBeNull();
    expect(error!.code).toBe('42501');
    expect(error!.message).toMatch(/becomes active only through accept_agreement/);
    const row = await readRow(inserted!.id);
    expect(row.status).toBe('pending');
    expect(await publicIdsFor(creator.user.id)).not.toContain(inserted!.id);
  });

  test('the creator cannot activate a pending agreement already addressed to a partner', async () => {
    // The state create_agreement_with_profile produces: pending, partner set, unsigned.
    const a = await fixture({ status: 'pending', partnerProfileId: partner.user.id });
    const creatorClient = await signIn(creator.email);

    const { error } = await creatorClient
      .from('clarity_agreements')
      .update({ status: 'active' })
      .eq('id', a.id)
      .select('id');

    expect(error, 'the trigger must refuse a client move to active').not.toBeNull();
    expect(error!.code).toBe('42501');
    expect(error!.message).toMatch(/becomes active only through accept_agreement/);
    const row = await readRow(a.id);
    expect(row.status).toBe('pending');
    expect(row.partner_signed_at).toBeNull();
    expect(await publicIdsFor(partner.user.id)).not.toContain(a.id);
  });

  test('the addressed partner cannot skip the accept path with a table UPDATE', async () => {
    const a = await fixture({ status: 'pending', partnerProfileId: partner.user.id });
    const partnerClient = await signIn(partner.email);

    const { error } = await partnerClient
      .from('clarity_agreements')
      .update({ status: 'active' })
      .eq('id', a.id)
      .select('id');

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
    expect(error!.message).toMatch(/becomes active only through accept_agreement/);
    expect((await readRow(a.id)).status).toBe('pending');
  });

  test('a party cannot revive a terminated or expired agreement into active', async () => {
    const creatorClient = await signIn(creator.email);
    for (const status of ['terminated', 'expired']) {
      const a = await fixture({ status, partnerProfileId: partner.user.id });

      const { error } = await creatorClient
        .from('clarity_agreements')
        .update({ status: 'active' })
        .eq('id', a.id)
        .select('id');

      expect(error, `${status} -> active must be refused`).not.toBeNull();
      expect(error!.code).toBe('42501');
      expect(error!.message).toMatch(/becomes active only through accept_agreement/);
      expect((await readRow(a.id)).status).toBe(status);
    }
  });

  // ── Controls: every legitimate path still works ────────────────────────────

  test('control: accept_agreement() makes the agreement active with the partner set', async () => {
    const a = await fixture({ status: 'pending' });
    const partnerClient = await signIn(partner.email);

    const { data, error } = await partnerClient.rpc('accept_agreement', {
      p_agreement_id: a.id,
      p_token: a.invitationToken,
      p_partner_id: partner.user.id,
    });

    expect(error, error?.message).toBeNull();
    expect(data).toBe(true);
    const row = await readRow(a.id);
    expect(row.status).toBe('active');
    expect(row.partner_profile_id).toBe(partner.user.id);
    expect(row.partner_signed_at).not.toBeNull();
    expect(await publicIdsFor(creator.user.id)).toContain(a.id);
  });

  test('control: a party lazily expires an overdue pending invitation', async () => {
    const a = await fixture({
      status: 'pending',
      invitationExpiresAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    });
    const creatorClient = await signIn(creator.email);

    const { data, error } = await creatorClient
      .from('clarity_agreements')
      .update({ status: 'expired' })
      .eq('id', a.id)
      .select('id');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
    expect((await readRow(a.id)).status).toBe('expired');
  });

  test('control: the creator cancels a pending invitation', async () => {
    const a = await fixture({ status: 'pending' });
    const creatorClient = await signIn(creator.email);

    const { data, error } = await creatorClient
      .from('clarity_agreements')
      .update({ status: 'terminated', terminated_at: new Date().toISOString(), terminated_by: creator.user.id })
      .eq('id', a.id)
      .select('id');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
    expect((await readRow(a.id)).status).toBe('terminated');
  });

  test('control: the partner terminates an active agreement', async () => {
    const a = await fixture({
      status: 'active',
      partnerProfileId: partner.user.id,
      partnerSignedAt: new Date().toISOString(),
    });
    const partnerClient = await signIn(partner.email);

    const { data, error } = await partnerClient
      .from('clarity_agreements')
      .update({ status: 'terminated', terminated_at: new Date().toISOString(), terminated_by: partner.user.id })
      .eq('id', a.id)
      .select('id');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
    expect((await readRow(a.id)).status).toBe('terminated');
  });

  test('control: a non-party cannot update the agreement at all', async () => {
    const a = await fixture({ status: 'pending' });
    const strangerClient = await signIn(stranger.email);

    const { data, error } = await strangerClient
      .from('clarity_agreements')
      .update({ status: 'terminated' })
      .eq('id', a.id)
      .select('id');

    // RLS filters the row out (0 rows, no error) or a guard refuses (42501).
    if (error) expect(error.code).toBe('42501');
    expect(data ?? []).toEqual([]);
    expect((await readRow(a.id)).status).toBe('pending');
  });
});

/**
 * P1451, Codex review finding 1: what the partner accepted is fixed. A client may change an
 * agreement's status (and the terminated_at / terminated_by that go with it) and nothing else —
 * not the terms, the visibility, the signature time or the partner's displayed name.
 *
 * Red state: every test in the first group writes the column before 20261009181000.
 */
test.describe('P1451: a party cannot rewrite what the partner accepted', () => {
  let creator: TestUser;
  let partner: TestUser;
  const created: string[] = [];

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P1451C Creator' });
    partner = await createTestUser({ name: 'P1451C Partner' });
  });

  test.afterAll(async () => {
    for (const id of created) await deleteTestAgreement(id);
    for (const u of [creator, partner]) {
      if (u?.user?.id) await deleteTestUser(u.user.id);
    }
  });

  async function activeAgreement(): Promise<TestAgreement> {
    const a = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'private',
      termsText: 'P1451 accepted terms',
      partnerSignedAt: '2026-10-01T00:00:00.000Z',
    });
    created.push(a.id);
    return a;
  }

  async function contentOf(id: string) {
    const { data, error } = await supabaseAdmin
      .from('clarity_agreements')
      .select('terms_text, visibility, partner_signed_at, partner_display_name, status')
      .eq('id', id)
      .single();
    expect(error, error?.message).toBeNull();
    return data!;
  }

  const edits: Array<[string, Record<string, unknown>]> = [
    ['terms_text', { terms_text: 'P1451 rewritten terms' }],
    ['visibility', { visibility: 'public' }],
    ['partner_signed_at', { partner_signed_at: '2020-01-01T00:00:00.000Z' }],
    ['partner_display_name', { partner_display_name: 'Someone Else' }],
  ];

  for (const [column, patch] of edits) {
    for (const who of ['creator', 'partner'] as const) {
      test(`the ${who} cannot change ${column} on an accepted agreement`, async () => {
        const a = await activeAgreement();
        const before = await contentOf(a.id);
        const client = await signIn(who === 'creator' ? creator.email : partner.email);

        const { error } = await client
          .from('clarity_agreements')
          .update(patch)
          .eq('id', a.id)
          .select('id');

        expect(error, `${who} must not be able to change ${column}`).not.toBeNull();
        expect(error!.code).toBe('42501');
        expect(error!.message).toMatch(/content is fixed/);
        expect(await contentOf(a.id)).toEqual(before);
      });
    }
  }

  test('the creator cannot change the terms of a pending invitation either', async () => {
    const a = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'pending',
      termsText: 'P1451 invited terms',
    });
    created.push(a.id);
    const creatorClient = await signIn(creator.email);

    const { error } = await creatorClient
      .from('clarity_agreements')
      .update({ terms_text: 'P1451 swapped terms' })
      .eq('id', a.id)
      .select('id');

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
    expect(error!.message).toMatch(/content is fixed/);
    expect((await contentOf(a.id)).terms_text).toBe('P1451 invited terms');
  });

  test('control: a party terminates an accepted agreement, setting terminated_at and terminated_by', async () => {
    const a = await activeAgreement();
    const creatorClient = await signIn(creator.email);

    const { data, error } = await creatorClient
      .from('clarity_agreements')
      .update({ status: 'terminated', terminated_at: new Date().toISOString(), terminated_by: creator.user.id })
      .eq('id', a.id)
      .select('id');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
    const after = await contentOf(a.id);
    expect(after.status).toBe('terminated');
    expect(after.terms_text).toBe('P1451 accepted terms');
  });

  test('control: an UPDATE that re-sends unchanged values is not refused', async () => {
    const a = await activeAgreement();
    const partnerClient = await signIn(partner.email);

    const { data, error } = await partnerClient
      .from('clarity_agreements')
      .update({ terms_text: 'P1451 accepted terms', visibility: 'private' })
      .eq('id', a.id)
      .select('id');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
  });
});

/**
 * P1451, /finish review finding 1: a party moves an agreement only along the app's own paths —
 * pending -> expired (lazy expiry), pending -> terminated (cancel), active -> terminated (end it) —
 * and records only itself as the one who ended it. Finding 3: agreement_version stays pinned.
 *
 * Red state: every test in the first group writes the row before 20261009182000.
 */
test.describe('P1451: a party changes status only along the app paths', () => {
  let creator: TestUser;
  let partner: TestUser;
  const created: string[] = [];

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P1451T Creator' });
    partner = await createTestUser({ name: 'P1451T Partner' });
  });

  test.afterAll(async () => {
    for (const id of created) await deleteTestAgreement(id);
    for (const u of [creator, partner]) {
      if (u?.user?.id) await deleteTestUser(u.user.id);
    }
  });

  async function row(status: string, extra: Parameters<typeof createTestAgreement>[2] = {}) {
    const a = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status,
      ...(status === 'active' ? { partnerSignedAt: new Date().toISOString() } : {}),
      ...extra,
    });
    created.push(a.id);
    return a;
  }

  async function stored(id: string) {
    const { data, error } = await supabaseAdmin
      .from('clarity_agreements')
      .select('status, terminated_at, terminated_by, agreement_version')
      .eq('id', id)
      .single();
    expect(error, error?.message).toBeNull();
    return data!;
  }

  const refused: Array<[string, string, 'creator' | 'partner', () => Record<string, unknown>]> = [
    ['the creator cannot record the partner as having declined', 'pending', 'creator', () => ({ status: 'declined' })],
    ['a party cannot move an accepted agreement to expired', 'active', 'partner', () => ({ status: 'expired' })],
    ['a party cannot move an accepted agreement to declined', 'active', 'creator', () => ({ status: 'declined' })],
    ['a party cannot rewrite how an ended agreement ended', 'terminated', 'creator', () => ({ status: 'expired' })],
    ['a party cannot name the other party as the one who ended it', 'active', 'creator',
      () => ({ status: 'terminated', terminated_at: new Date().toISOString(), terminated_by: partner.user.id })],
    ['a party cannot stamp an end time without ending the agreement', 'active', 'partner',
      () => ({ terminated_at: new Date().toISOString() })],
  ];

  for (const [title, status, who, patch] of refused) {
    test(title, async () => {
      const a = await row(status);
      const before = await stored(a.id);
      const client = await signIn(who === 'creator' ? creator.email : partner.email);

      const { error } = await client.from('clarity_agreements').update(patch()).eq('id', a.id).select('id');

      expect(error, 'the trigger must refuse this').not.toBeNull();
      expect(error!.code).toBe('42501');
      expect(error!.message).toMatch(/status change|ended it|end time/);
      expect(await stored(a.id)).toEqual(before);
    });
  }

  test('control: the partner ends an accepted agreement as themselves', async () => {
    const a = await row('active');
    const client = await signIn(partner.email);

    const { data, error } = await client
      .from('clarity_agreements')
      .update({ status: 'terminated', terminated_at: new Date().toISOString(), terminated_by: partner.user.id })
      .eq('id', a.id)
      .select('id');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
    expect((await stored(a.id)).terminated_by).toBe(partner.user.id);
  });

  test('control: decline goes through decline_agreement, not the table', async () => {
    const a = await row('pending', { partnerProfileId: undefined });
    const client = await signIn(partner.email);

    const { error } = await client.rpc('decline_agreement', { p_agreement_id: a.id, p_token: a.invitationToken });

    expect(error, error?.message).toBeNull();
    expect((await stored(a.id)).status).toBe('declined');
  });

  test('agreement_version stays pinned when a party sends a new value', async () => {
    const a = await row('active');
    const before = (await stored(a.id)).agreement_version;
    const client = await signIn(creator.email);

    const { error } = await client
      .from('clarity_agreements')
      .update({ agreement_version: before === '4' ? 'legacy' : '4' })
      .eq('id', a.id)
      .select('id');

    // P857's pin restores the old value silently; the allowlist leaves it to that trigger.
    expect(error, error?.message).toBeNull();
    expect((await stored(a.id)).agreement_version).toBe(before);
  });
});

/**
 * P1451: an agreement notification is sent only when the agreement is in the state it announces,
 * whoever asks — Codex finding 2 ('accepted') and /finish finding 2 (every other action). Runs
 * against the send-agreement-emails function deployed on the TEST project.
 *
 * Red state: before the function change a party got 200 (and a real email) for each refused case.
 */
test.describe('P1451: a notification needs the state it announces', () => {
  test.describe.configure({ timeout: 60000 });
  let creator: TestUser;
  let partner: TestUser;
  const created: string[] = [];
  const tokens = new Map<string, string>();

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P1451E Creator' });
    partner = await createTestUser({ name: 'P1451E Partner' });
  });

  test.afterAll(async () => {
    for (const id of created) await deleteTestAgreement(id);
    for (const u of [creator, partner]) {
      if (u?.user?.id) await deleteTestUser(u.user.id);
    }
  });

  async function fire(action: string, email: string, agreementId: string) {
    if (!tokens.has(email)) {
      const { data, error } = await makeAnonClient().auth.signInWithPassword({ email, password: TEST_PASSWORD });
      expect(error, error?.message).toBeNull();
      tokens.set(email, data!.session!.access_token);
    }
    const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/send-agreement-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.VITE_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${tokens.get(email)}`,
      },
      body: JSON.stringify({ action, agreementId }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  async function agreement(status: string) {
    const a = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status,
      ...(status === 'active' ? { partnerSignedAt: new Date().toISOString() } : {}),
    });
    created.push(a.id);
    return a;
  }

  const refused: Array<[string, string]> = [
    ['accepted', 'pending'],
    ['accepted', 'terminated'],
    ['terminated', 'active'],
    ['declined', 'pending'],
    ['invitation', 'active'],
    ['resend', 'active'],
  ];

  for (const [action, status] of refused) {
    test(`a party cannot send the '${action}' email for a ${status} agreement`, async () => {
      const a = await agreement(status);
      const { status: code, body } = await fire(action, creator.email, a.id);
      expect(code).toBe(403);
      // The status gate's own wording, so a party-check or deployment failure cannot pass this.
      expect(body).toEqual({ error: 'Forbidden', reason: 'state' });
    });
  }

  test('control: a party can send the accepted email for an active agreement', async () => {
    const a = await agreement('active');
    expect((await fire('accepted', partner.email, a.id)).status).toBe(200);
  });

  test('control: a party can send the terminated email for an ended agreement', async () => {
    const a = await agreement('terminated');
    expect((await fire('terminated', creator.email, a.id)).status).toBe(200);
  });
});
