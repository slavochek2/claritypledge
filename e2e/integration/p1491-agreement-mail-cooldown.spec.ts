/**
 * @file p1491-agreement-mail-cooldown.spec.ts
 * @description P1491: send-agreement-emails sends each kind of agreement notice a bounded number
 *   of times per agreement and destination (the P1225 limiter, `reserve_mail_rate_slot`).
 *
 * Drives the DEPLOYED send-agreement-emails on the TEST project with a signed-in party's JWT —
 * the same call the app makes (src/lib/agreement-emails.ts). Every agreement is fresh, so every
 * allowance starts empty; the limit comes from the function's own exported constant.
 *
 * Every address that can receive mail here is @example.com (reserved, no MX): Mailgun accepts,
 * nothing is delivered. The creator is created with such an address too, because the
 * terminated notice goes to both parties.
 *
 * Run: FORCE_COLOR=0 npx playwright test --project=integration --retries=0 \
 *        e2e/integration/p1491-agreement-mail-cooldown.spec.ts
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestAgreement, deleteTestAgreement } from '../helpers/test-agreement';
import { SIGNIN_MAIL_LIMITS } from '../../supabase/functions/_shared/mail-rate-limit.ts';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const FN_URL = `${SUPABASE_URL}/functions/v1/send-agreement-emails`;
const LIMIT = SIGNIN_MAIL_LIMITS.target.limit;
const LIMITED_BODY = { error: 'Too many requests. Please wait a while and try again.' };

const exampleAddress = (tag: string) => `p1491-${tag}-${randomUUID()}@example.com`;

const jwts = new Map<string, Promise<string>>();
function jwtFor(email: string): Promise<string> {
  if (!jwts.has(email)) {
    jwts.set(email, (async () => {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
      expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull();
      return data!.session!.access_token;
    })());
  }
  return jwts.get(email)!;
}

async function callAs(email: string, action: string, agreementId: string): Promise<Response> {
  return fetch(FN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await jwtFor(email)}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, agreementId }),
  });
}

async function statusesOf(email: string, action: string, agreementId: string, n: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const res = await callAs(email, action, agreementId);
    await res.text();
    out.push(res.status);
  }
  return out;
}

test.describe('P1491: agreement notices are rate-limited per agreement and destination', () => {
  test.setTimeout(180_000);

  let creator: TestUser;
  let stranger: TestUser;
  const agreements: string[] = [];

  async function agreement(partnerEmail: string, status = 'pending'): Promise<string> {
    const a = await createTestAgreement(creator.user.id, partnerEmail, { status });
    agreements.push(a.id);
    return a.id;
  }

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P1491 Creator', email: exampleAddress('creator') });
    stranger = await createTestUser({ name: 'P1491 Stranger', email: exampleAddress('stranger') });
  });

  test.afterAll(async () => {
    for (const id of agreements) await deleteTestAgreement(id).catch(() => {});
    for (const u of [creator, stranger]) if (u?.user?.id) await deleteTestUser(u.user.id).catch(() => {});
  });

  test('repeated invitations for one agreement are refused once the allowance is spent', async () => {
    const partner = exampleAddress('partner');
    const id = await agreement(partner);

    expect(await statusesOf(creator.email, 'invitation', id, LIMIT)).toEqual(Array(LIMIT).fill(200));

    const refused = await callAs(creator.email, 'invitation', id);
    expect(refused.status, 'the call past the allowance is refused').toBe(429);
    expect(await refused.json()).toEqual(LIMITED_BODY);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);

    // Control: a different agreement to the same address has its own allowance.
    const other = await agreement(partner);
    expect((await callAs(creator.email, 'invitation', other)).status).toBe(200);
  });

  test('equivalent spellings of one agreement id share one allowance', async () => {
    const id = await agreement(exampleAddress('partner'));
    expect(await statusesOf(creator.email, 'invitation', id, LIMIT)).toEqual(Array(LIMIT).fill(200));

    // The database resolves these to the same agreement; they must not open a fresh allowance.
    for (const spelling of [id.toUpperCase(), id.replace(/-/g, ''), `{${id}}`]) {
      const res = await callAs(creator.email, 'invitation', spelling);
      await res.text();
      expect(res.status, `spelling ${spelling} must hit the same allowance`).toBe(429);
    }
  });

  test('resend draws on the same allowance as the invitation', async () => {
    const id = await agreement(exampleAddress('partner'));
    expect((await callAs(creator.email, 'invitation', id)).status).toBe(200);
    expect(await statusesOf(creator.email, 'resend', id, LIMIT - 1)).toEqual(Array(LIMIT - 1).fill(200));
    expect((await callAs(creator.email, 'resend', id)).status).toBe(429);
  });

  test('repeated termination notices for one agreement are refused once the allowance is spent', async () => {
    const id = await agreement(exampleAddress('partner'), 'terminated');
    expect(await statusesOf(creator.email, 'terminated', id, LIMIT)).toEqual(Array(LIMIT).fill(200));
    expect((await callAs(creator.email, 'terminated', id)).status).toBe(429);
  });

  test('control: refused calls (non-party, wrong state) do not spend the allowance', async () => {
    const id = await agreement(exampleAddress('partner'));

    // A non-party is refused before any allowance is touched (P1451/P1178 party check).
    expect(await statusesOf(stranger.email, 'invitation', id, LIMIT + 1)).toEqual(Array(LIMIT + 1).fill(403));
    // A notice for a state the agreement is not in is refused the same way.
    expect(await statusesOf(creator.email, 'accepted', id, LIMIT + 1)).toEqual(Array(LIMIT + 1).fill(403));

    // The party's own allowance is intact.
    expect(await statusesOf(creator.email, 'invitation', id, LIMIT)).toEqual(Array(LIMIT).fill(200));
  });
});
