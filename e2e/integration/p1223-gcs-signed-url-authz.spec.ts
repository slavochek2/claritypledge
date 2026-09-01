/**
 * @file p1223-gcs-signed-url-authz.spec.ts
 * @description P1223 (G6) — gcs-signed-url binds the caller to the session before minting.
 *
 * Pre-fix, the DEPLOYED function forwarded any signed-in caller's `sessionCode` to the
 * Cloud Function after a JWT check only. These tests run over HTTP against the TEST
 * project's deployed function (same harness as edge-fn-authz-regression.spec.ts), so they
 * are only green once the P1223 build of `gcs-signed-url` is deployed to test. Against the
 * pre-fix build the first two tests FAIL — that is the failure-path evidence, not a flake.
 *
 * Handler-level coverage with fakes (every branch, no deploy needed):
 *   deno test supabase/functions/gcs-signed-url/handler.test.ts
 *
 * Run: npx playwright test --project=integration e2e/integration/p1223-gcs-signed-url-authz.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestSessionInDB } from '../helpers/test-session';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

async function getAccessToken(email: string): Promise<string> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`[TEST] sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function callGcsSignedUrl(bearer: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gcs-signed-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: parsed };
}

test.describe('P1223 — gcs-signed-url caller binding', () => {
  test.describe.configure({ timeout: 60000 });

  let host: TestUser;
  let joiner: TestUser;
  let outsider: TestUser;
  let sessionCode: string;
  let cleanupSession: () => Promise<void>;

  // Sanitised the same way api.ts does (sanitizeParticipantName): lowercase, non-alnum → '-'.
  const HOST_KEY = 'p1223-session-host';
  const JOINER_KEY = 'p1223-joiner';

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P1223 Session Host' });
    joiner = await createTestUser({ name: 'P1223 Joiner' });
    outsider = await createTestUser({ name: 'P1223 Outsider' });
    const s = await createTestSessionInDB(host.user.id, 'P1223 Joiner', {
      hostName: 'P1223 Session Host',
      guestProfileId: joiner.user.id,
    });
    sessionCode = s.sessionCode;
    cleanupSession = s.cleanup;
  });

  test.afterAll(async () => {
    if (cleanupSession) await cleanupSession();
    if (outsider?.user?.id) await deleteTestUser(outsider.user.id);
    if (joiner?.user?.id) await deleteTestUser(joiner.user.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  test('joiner cannot mint a URL for the creator\'s object names (403), nor vice versa', async () => {
    const joinerToken = await getAccessToken(joiner.email);
    for (const fileName of [`${HOST_KEY}_chunk_000.webm`, `${HOST_KEY}.webm`, `${HOST_KEY}_events_000.json`]) {
      const contentType = fileName.endsWith('.json') ? 'application/json' : 'audio/webm';
      const { status, body } = await callGcsSignedUrl(joinerToken, { sessionCode, fileName, contentType });
      expect(status, `joiner → creator key ${fileName}`).toBe(403);
      expect(body.error).toBe('fileName does not belong to the caller');
    }
    const hostToken = await getAccessToken(host.email);
    const { status } = await callGcsSignedUrl(hostToken, {
      sessionCode,
      fileName: `${JOINER_KEY}_chunk_000.webm`,
      contentType: 'audio/webm',
    });
    expect(status, 'creator → joiner key').toBe(403);
  });

  test('extension and content-type must agree (400), both spoof directions', async () => {
    const token = await getAccessToken(host.email);
    const cases = [
      { fileName: `${HOST_KEY}_events_000.json`, contentType: 'audio/webm' },
      { fileName: `${HOST_KEY}_chunk_000.webm`, contentType: 'application/json' },
    ];
    for (const c of cases) {
      const { status, body } = await callGcsSignedUrl(token, { sessionCode, ...c });
      expect(status, JSON.stringify(c)).toBe(400);
      expect(body.error).toBe('contentType does not match fileName extension');
    }
  });

  test('non-participant with a valid JWT is rejected (403) before any forwarding', async () => {
    const token = await getAccessToken(outsider.email);
    const { status, body } = await callGcsSignedUrl(token, {
      sessionCode,
      fileName: `${HOST_KEY}_chunk_000.webm`,
      contentType: 'audio/webm',
    });
    expect(status, 'outsider must be rejected with 403').toBe(403);
    expect(body.error).toBe('Not a participant of this session');
  });

  test('sessionCode outside ^[A-Z0-9]{6}$ is rejected (400) even for a participant', async () => {
    const token = await getAccessToken(host.email);
    for (const bad of [`../${sessionCode}`, sessionCode.toLowerCase(), `${sessionCode}/..`]) {
      const { status, body } = await callGcsSignedUrl(token, {
        sessionCode: bad,
        fileName: `${HOST_KEY}_chunk_000.webm`,
        contentType: 'audio/webm',
      });
      expect(status, `expected 400 for ${JSON.stringify(bad)}`).toBe(400);
      expect(body.error).toBe('Invalid sessionCode');
    }
  });

  test('participant (creator) passes the gate and reaches the forward step', async () => {
    const token = await getAccessToken(host.email);
    const { status } = await callGcsSignedUrl(token, {
      sessionCode,
      fileName: `${HOST_KEY}_chunk_000.webm`,
      contentType: 'audio/webm',
    });
    // The Cloud Function's own answer (200, or 5xx if it is unreachable from test) is
    // outside this repo; what this asserts is that none of OUR gates fired.
    expect([400, 401, 403], `gate fired for a participant: ${status}`).not.toContain(status);
  });
});
