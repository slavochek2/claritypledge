/**
 * @file 20261014130000_p1225_mail_rate_limits.spec.ts
 * @description P1225 canary for 20261014130000_p1225_mail_rate_limits.sql,
 *   supabase/functions/_shared/mail-rate-limit.ts and its wiring into
 *   request-letter-response-signin.
 *
 * Two layers:
 *   1. The limiter itself, driven against the live TEST database with random keys under a
 *      test-only function name — every bucket is fresh, so the counts are exact.
 *   2. The DEPLOYED request-letter-response-signin on TEST. Every request from this machine shares
 *      one IP bucket (the edge does not let a client choose its forwarding hops — see the spec's
 *      Dev results). So the suite derives this machine's own IP key through a different function
 *      (confirm-letter-response stores the same salted hash in terms_acceptances.ip_hash), proves
 *      each request adds a row under exactly that key, and only then resets ONLY that key before
 *      each test that needs a fresh allowance, and again at the end so later runs
 *      (e.g. e2e/p719-reproduce.spec.ts) start clean.
 *
 * "Mail was sent" is judged by Mailgun's own `accepted` event for the exact recipient — the
 * function returns 200 even when the provider refuses, so a 200 alone proves nothing.
 * Recipients are @example.com (reserved, no MX): accepted by Mailgun, delivered nowhere.
 *
 * Requires MAILGUN_API_KEY / MAILGUN_DOMAIN / MAILGUN_REGION in .env.test.local (same as
 * p1178-reproduce.spec.ts), plus the usual VITE_SUPABASE_* + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Run: FORCE_COLOR=0 npx playwright test --project=integration e2e/integration/20261014130000_p1225_mail_rate_limits.spec.ts
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { SERVER_CURRENT_TERMS_VERSION } from '../../supabase/functions/_shared/terms-version.ts';
import { createTestLetter, sealTestLetter, deleteTestLetter } from '../helpers/test-letter';
import {
  SIGNIN_MAIL_LIMITS,
  checkMailLimits,
  mailLimitResponse,
  rateLimitedResponse,
  reserveMailSlot,
} from '../../supabase/functions/_shared/mail-rate-limit.ts';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const MAILGUN_REGION = process.env.MAILGUN_REGION ?? 'us';

const TABLE = 'mail_rate_limits';
const RPC = 'reserve_mail_rate_slot';
const TEST_FN = 'p1225-canary';
const SIGNIN_FN = 'request-letter-response-signin';
const SIGNIN_SUBJECT = 'Save your letter responses — click to confirm';
const LIMITED_BODY = { error: 'Too many requests. Please wait a while and try again.' };
const TABLE_REFUSAL = /permission denied for table mail_rate_limits/;
const FUNCTION_REFUSAL = /permission denied for function reserve_mail_rate_slot/;

const freshKey = () => randomBytes(32).toString('hex');
const freshAddress = (tag: string) => `p1225-${tag}-${randomUUID()}@example.com`;

const newClient = () =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

async function rowsFor(fn: string, bucket: 'ip' | 'target', key: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('function_name', fn)
    .eq('bucket', bucket)
    .eq('key_hash', key);
  if (error) throw new Error(`count failed: ${error.message}`);
  return count ?? 0;
}

// ── 1. Privileges ────────────────────────────────────────────────────────────

test.describe('P1225: mail_rate_limits and its function are service-role only', () => {
  let user: TestUser;
  let signedIn: SupabaseClient;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P1225 Signed In' });
    signedIn = newClient();
    const { error } = await signedIn.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
    if (error) throw new Error(`sign-in failed: ${error.message}`);
  });
  test.afterAll(async () => {
    if (user) await deleteTestUser(user.user.id);
  });

  for (const [label, client] of [
    ['anon', () => newClient()],
    ['a signed-in user', () => signedIn],
  ] as const) {
    test(`${label} can neither read, write nor call the reservation function`, async () => {
      const c = client();
      const read = await c.from(TABLE).select('*').limit(1);
      expect(read.data).toBeNull();
      expect(read.error?.message).toMatch(TABLE_REFUSAL);

      const write = await c.from(TABLE).insert({ function_name: TEST_FN, bucket: 'ip', key_hash: freshKey() });
      expect(write.error?.message).toMatch(TABLE_REFUSAL);

      const call = await c.rpc(RPC, {
        p_function_name: TEST_FN, p_bucket: 'ip', p_key_hash: freshKey(), p_limit: 5, p_window_seconds: 600,
      });
      expect(call.error?.message).toMatch(FUNCTION_REFUSAL);
    });
  }

  test('only a 64-char hex digest is storable as a key (never a raw address)', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .insert({ function_name: TEST_FN, bucket: 'target', key_hash: 'someone@example.com' });
    expect(error?.code).toBe('23514'); // check_violation
  });
});

// ── 2. The limiter, fresh keys ───────────────────────────────────────────────

test.describe('P1225: the limiter (live TEST database, fresh keys)', () => {
  test('IP bucket: 5 requests per 10 minutes pass, the 6th gets Retry-After 600', async () => {
    const key = freshKey();
    for (let i = 1; i <= 5; i++) {
      expect(await reserveMailSlot(supabaseAdmin, TEST_FN, 'ip', key, SIGNIN_MAIL_LIMITS.ip), `request ${i}`)
        .toEqual({ allowed: true });
    }
    expect(await reserveMailSlot(supabaseAdmin, TEST_FN, 'ip', key, SIGNIN_MAIL_LIMITS.ip))
      .toEqual({ allowed: false, retryAfterSeconds: 600, bucket: 'ip' });
  });

  test('target bucket: 3 requests per hour pass, the 4th gets Retry-After 3600', async () => {
    const key = freshKey();
    for (let i = 1; i <= 3; i++) {
      expect(await reserveMailSlot(supabaseAdmin, TEST_FN, 'target', key, SIGNIN_MAIL_LIMITS.target), `request ${i}`)
        .toEqual({ allowed: true });
    }
    expect(await reserveMailSlot(supabaseAdmin, TEST_FN, 'target', key, SIGNIN_MAIL_LIMITS.target))
      .toEqual({ allowed: false, retryAfterSeconds: 3600, bucket: 'target' });
  });

  test('control: an exhausted key leaves other IPs, other targets and other functions untouched', async () => {
    const ip = freshKey();
    const target = freshKey();
    for (let i = 0; i < 6; i++) await checkMailLimits(supabaseAdmin, TEST_FN, { ipHash: ip, targetHash: freshKey() }, SIGNIN_MAIL_LIMITS);
    for (let i = 0; i < 4; i++) await checkMailLimits(supabaseAdmin, TEST_FN, { ipHash: freshKey(), targetHash: target }, SIGNIN_MAIL_LIMITS);

    expect((await checkMailLimits(supabaseAdmin, TEST_FN, { ipHash: ip, targetHash: freshKey() }, SIGNIN_MAIL_LIMITS)).allowed).toBe(false);
    expect((await checkMailLimits(supabaseAdmin, TEST_FN, { ipHash: freshKey(), targetHash: target }, SIGNIN_MAIL_LIMITS)).allowed).toBe(false);
    expect(await checkMailLimits(supabaseAdmin, TEST_FN, { ipHash: freshKey(), targetHash: freshKey() }, SIGNIN_MAIL_LIMITS)).toEqual({ allowed: true });
    expect(await checkMailLimits(supabaseAdmin, `${TEST_FN}-other`, { ipHash: ip, targetHash: freshKey() }, SIGNIN_MAIL_LIMITS)).toEqual({ allowed: true });
  });

  test('a request the IP bucket refuses reserves nothing in the target bucket', async () => {
    const ip = freshKey();
    for (let i = 0; i < 5; i++) await reserveMailSlot(supabaseAdmin, TEST_FN, 'ip', ip, SIGNIN_MAIL_LIMITS.ip);
    const target = freshKey();
    expect(await checkMailLimits(supabaseAdmin, TEST_FN, { ipHash: ip, targetHash: target }, SIGNIN_MAIL_LIMITS))
      .toEqual({ allowed: false, retryAfterSeconds: 600, bucket: 'ip' });
    expect(await rowsFor(TEST_FN, 'target', target)).toBe(0);
  });

  test('parallel burst: exactly 5 of 8 simultaneous requests pass, the other 3 are genuine 429s', async () => {
    const key = freshKey();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => reserveMailSlot(supabaseAdmin, TEST_FN, 'ip', key, SIGNIN_MAIL_LIMITS.ip)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.filter((r) => !r.allowed)).toEqual(
      Array.from({ length: 3 }, () => ({ allowed: false, retryAfterSeconds: 600, bucket: 'ip' })),
    );
    expect(await rowsFor(TEST_FN, 'ip', key)).toBe(8); // refused requests still count
  });

  test('the edge runtime clock takes no part: a caller clock 610 s ahead still admits exactly 5', async () => {
    const key = freshKey();
    const realNow = Date.now;
    Date.now = () => realNow() + 610_000;
    try {
      const results = [];
      for (let i = 0; i < 8; i++) results.push(await reserveMailSlot(supabaseAdmin, TEST_FN, 'ip', key, SIGNIN_MAIL_LIMITS.ip));
      expect(results.filter((r) => r.allowed)).toHaveLength(5);
    } finally {
      Date.now = realNow;
    }
  });

  test('fail closed: a database error is a refusal, answered with a generic 500', async () => {
    const noGrant = newClient(); // anon holds no EXECUTE — a real, not simulated, database error
    const r = await reserveMailSlot(noGrant, TEST_FN, 'ip', freshKey(), SIGNIN_MAIL_LIMITS.ip);
    expect(r).toEqual({ allowed: false, unavailable: true });
    expect(await checkMailLimits(noGrant, TEST_FN, { ipHash: freshKey(), targetHash: freshKey() }, SIGNIN_MAIL_LIMITS))
      .toEqual({ allowed: false, unavailable: true });

    const res = mailLimitResponse(r, {})!;
    expect(res.status).toBe(500);
    expect(res.headers.get('Retry-After')).toBeNull();
    expect(await res.json()).toEqual({ error: 'Something went wrong. Please try again.' });
    expect(mailLimitResponse({ allowed: true }, {})).toBeNull();
  });

  test('the 429 is the same body for either bucket, with Retry-After', async () => {
    const cors = { 'Access-Control-Allow-Origin': 'https://claritypledge.com' };
    const a = rateLimitedResponse(600, cors);
    const b = mailLimitResponse({ allowed: false, retryAfterSeconds: 3600, bucket: 'target' }, cors)!;
    expect(a.status).toBe(429);
    expect(b.status).toBe(429);
    expect(a.headers.get('Retry-After')).toBe('600');
    expect(b.headers.get('Retry-After')).toBe('3600');
    expect(await a.text()).toBe(await b.text());
  });
});

// ── 3. The deployed function ────────────────────────────────────────────────

async function waitForAccepted(recipient: string, sinceEpochSeconds: number, timeoutMs = 90_000): Promise<boolean> {
  const host = MAILGUN_REGION === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const auth = 'Basic ' + Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = `${host}/v3/${MAILGUN_DOMAIN}/events?event=accepted&recipient=${encodeURIComponent(recipient)}&begin=${Math.floor(sinceEpochSeconds)}&ascending=yes&limit=50`;
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (res.ok) {
      const page = (await res.json()) as { items?: Array<{ recipient?: string; message?: { headers?: { subject?: string } } }> };
      if ((page.items ?? []).some((i) => i.recipient === recipient && i.message?.headers?.subject === SIGNIN_SUBJECT)) return true;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

test.describe('P1225: deployed request-letter-response-signin', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.skip(!MAILGUN_API_KEY || !MAILGUN_DOMAIN, 'MAILGUN_* missing from .env.test.local — the mail oracle is unavailable');

  const missingLetter = randomUUID();
  let sender: TestUser;
  let docId: string;
  let letterId: string;
  let ownIpKey: string;
  let deriver: TestUser;

  const call = (email: string, letter: string) =>
    fetch(`${SUPABASE_URL}/functions/v1/${SIGNIN_FN}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letterId: letter, name: 'P1225 Canary', email, termsAccepted: true, termsVersion: SERVER_CURRENT_TERMS_VERSION, ratings: [], positions: [],
      }),
    });

  /** Delete this machine's own IP rows for the function — and nothing else. */
  async function resetOwnIpBucket(): Promise<void> {
    const { error } = await supabaseAdmin.from(TABLE).delete()
      .eq('function_name', SIGNIN_FN).eq('bucket', 'ip').eq('key_hash', ownIpKey);
    if (error) throw new Error(`reset failed: ${error.message}`);
    expect(await rowsFor(SIGNIN_FN, 'ip', ownIpKey)).toBe(0);
  }

  /**
   * This machine's IP key, derived through a DIFFERENT function: confirm-letter-response records
   * `hashIp(extractClientIp(req), IP_HASH_SECRET)` in terms_acceptances.ip_hash — the same hash, salt
   * and address extraction the limiter keys on. Nothing here reads mail_rate_limits, so another
   * caller's rows cannot be mistaken for ours.
   */
  async function deriveOwnIpKey(): Promise<string> {
    deriver = await createTestUser({ name: 'P1225 Key Deriver' });
    const { error: pErr } = await supabaseAdmin.from('letter_response_pending').insert({
      user_id: deriver.user.id, letter_id: letterId, name: 'P1225 Key Deriver',
      ratings_json: [], positions_json: [], terms_version: SERVER_CURRENT_TERMS_VERSION,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    if (pErr) throw new Error(`pending insert failed: ${pErr.message}`);
    const client = newClient();
    const { data: auth, error: aErr } = await client.auth.signInWithPassword({ email: deriver.email, password: TEST_PASSWORD });
    if (aErr || !auth.session) throw new Error(`deriver sign-in failed: ${aErr?.message}`);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/confirm-letter-response`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ letterId }),
    });
    expect(res.status, await res.text()).toBe(200);
    const { data, error } = await supabaseAdmin.from('terms_acceptances').select('ip_hash')
      .eq('user_id', deriver.user.id).single();
    if (error || !data?.ip_hash) throw new Error(`no terms_acceptances.ip_hash: ${error?.message}`);
    expect(data.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    return data.ip_hash as string;
  }

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P1225 Sender' });
    const { data: doc, error } = await supabaseAdmin.from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P1225 Doc' }).select('id').single();
    if (error || !doc) throw new Error(`doc insert failed: ${error?.message}`);
    docId = doc.id as string;
    letterId = (await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' })).id;
    await sealTestLetter(letterId);

    ownIpKey = await deriveOwnIpKey();
  });

  test('wiring: every request reserves a row under exactly this machine\'s derived IP key', async () => {
    // Asserted BEFORE any test deletes from that key: if the function stopped reserving (or keyed
    // on something else), the count would not move and nothing would be reset under a wrong key.
    for (let i = 1; i <= 2; i++) {
      const before = await rowsFor(SIGNIN_FN, 'ip', ownIpKey);
      await (await call(freshAddress('probe'), missingLetter)).text();
      expect(await rowsFor(SIGNIN_FN, 'ip', ownIpKey), `probe ${i}`).toBe(before + 1);
    }
  });

  test.afterAll(async () => {
    if (ownIpKey) await resetOwnIpBucket();
    if (deriver) {
      await supabaseAdmin.from('terms_acceptances').delete().eq('user_id', deriver.user.id);
      await supabaseAdmin.from('letter_response_pending').delete().eq('user_id', deriver.user.id);
    }
    if (letterId) {
      const { data: pending } = await supabaseAdmin.from('letter_response_pending').select('user_id').eq('letter_id', letterId);
      for (const row of pending ?? []) {
        await supabaseAdmin.from('letter_response_pending').delete().eq('user_id', row.user_id);
        await supabaseAdmin.from('profiles').delete().eq('id', row.user_id);
        await supabaseAdmin.auth.admin.deleteUser(row.user_id);
      }
      await deleteTestLetter(letterId);
    }
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender) await deleteTestUser(sender.user.id);
    if (deriver) await deleteTestUser(deriver.user.id);
  });

  test('control: a first request from a fresh allowance signs in and the provider accepts the mail', async () => {
    await resetOwnIpBucket();
    const to = freshAddress('control');
    const since = Date.now() / 1000 - 60;
    const res = await call(to, letterId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await waitForAccepted(to, since), `Mailgun accepted event for ${to}`).toBe(true);
    // Known-bad control for the oracle itself: an address nobody sent to is never "accepted".
    expect(await waitForAccepted(freshAddress('never-sent'), since, 10_000)).toBe(false);
  });

  test('requests naming a letter that does not exist cannot spend an address\'s allowance', async () => {
    await resetOwnIpBucket();
    const victim = freshAddress('victim');
    for (let i = 0; i < 3; i++) expect((await call(victim, missingLetter)).status, `bogus ${i + 1}`).toBe(400);

    await resetOwnIpBucket();
    for (let i = 1; i <= 3; i++) {
      const res = await call(victim, letterId);
      expect(res.status, `real ${i}`).toBe(200);
      await res.text();
    }
    // The target limit itself, on the deployed function: the 4th within the hour is refused.
    const fourth = await call(victim, letterId);
    expect(fourth.status).toBe(429);
    expect(fourth.headers.get('Retry-After')).toBe('3600');
    expect(await fourth.json()).toEqual(LIMITED_BODY);
  });

  test('IP limit: 5 requests pass, the 6th is refused with Retry-After 600', async () => {
    await resetOwnIpBucket();
    for (let i = 1; i <= 5; i++) expect((await call(freshAddress('ip'), missingLetter)).status, `request ${i}`).toBe(400);
    const sixth = await call(freshAddress('ip'), missingLetter);
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get('Retry-After')).toBe('600');
    expect(await sixth.json()).toEqual(LIMITED_BODY);
  });

  test('once limited, an address with an account and one without get the identical answer', async () => {
    const existing = process.env.TEST_LISTENER_EMAIL;
    test.skip(!existing, 'TEST_LISTENER_EMAIL not set');
    // A missing letter: should the IP limit somehow not hold, these still send nothing.
    const a = await call(existing!, missingLetter);
    const b = await call(freshAddress('none'), missingLetter);
    expect(a.status).toBe(429);
    expect(b.status).toBe(429);
    expect(a.headers.get('Retry-After')).toBe(b.headers.get('Retry-After'));
    expect(await a.text()).toBe(await b.text());
  });
});
