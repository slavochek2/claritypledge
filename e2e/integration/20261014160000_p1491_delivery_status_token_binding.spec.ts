/**
 * @file 20261014160000_p1491_delivery_status_token_binding.spec.ts
 * @description P1491 canary for 20261014160000_p1491_delivery_status_token_binding.sql.
 *
 * The token-based delivery-status RPC is the recipient's progress path. After the fix it binds
 * a recipient account to a delivery under the same conditions as claim_letter_delivery, and it
 * is not a path for the letter's sender. Status progression for the recipient keeps working
 * after the invitation is spent (the P683 contract: invitation expiry gates who a delivery is
 * bound to, never the recipient's own engagement).
 *
 * Runs against the TEST project only. Fixtures are written with the service-role client; every
 * call under test uses the anon key, signed out or with a signed-in user's JWT — the same
 * credentials a browser has.
 *
 * Run: FORCE_COLOR=0 npx playwright test --project=integration --retries=0 \
 *        e2e/integration/20261014160000_p1491_delivery_status_token_binding.spec.ts
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import {
  createTestDoc,
  createTestLetter,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const RPC = 'update_delivery_status_by_token';

const anonClient = (): SupabaseClient =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

// One session per user for the whole file — every sign-in counts against the auth rate limit.
const sessions = new Map<string, Promise<SupabaseClient>>();
function signIn(email: string): Promise<SupabaseClient> {
  if (!sessions.has(email)) {
    sessions.set(email, (async () => {
      const { data, error } = await anonClient().auth.signInWithPassword({ email, password: TEST_PASSWORD });
      expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull();
      return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
    })());
  }
  return sessions.get(email)!;
}

async function readDelivery(id: string) {
  const { data, error } = await supabaseAdmin
    .from('letter_deliveries')
    .select('status, receiver_profile_id, opened_at, completed_at')
    .eq('id', id)
    .single();
  expect(error, error?.message).toBeNull();
  return data!;
}

const TEST_PROJECT_REF = 'gfjctyxqlwexxwsmkakq';

function readEnvLocal(name: string): string {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  // Worktrees have no .env.local of their own; fall back to the main checkout's.
  for (const root of [repoRoot, path.resolve(repoRoot, '../../..')]) {
    const f = path.join(root, '.env.local');
    if (!fs.existsSync(f)) continue;
    const line = fs.readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

/**
 * One SQL statement on the TEST database through the Management API (test-scoped write token,
 * the one migrate.sh uses). Used only to hold a row lock the way a concurrent writer would.
 */
async function testDbQuery(sql: string): Promise<unknown> {
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
  if (ref !== TEST_PROJECT_REF) throw new Error(`refusing to run raw SQL against ${ref}: TEST only`);
  const token = readEnvLocal('SUPABASE_TEST_WRITE_TOKEN');
  if (!token) throw new Error('SUPABASE_TEST_WRITE_TOKEN missing from .env.local');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`test DB query failed (${res.status}): ${body}`);
  return JSON.parse(body);
}

const PAST = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const FUTURE = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

test.describe('P1491: token-based delivery status — binding and caller', () => {
  test.setTimeout(90_000);

  let sender: TestUser;
  let recipient: TestUser;
  let stranger: TestUser;
  const letterIds: string[] = [];
  const docIds: string[] = [];

  // A fresh sealed letter per test: deliveries are unique per (letter, address) and per
  // (letter, recipient account), so tests sharing one letter would collide.
  async function sealedLetter(mode: 'one-to-one' | 'one-to-many' = 'one-to-one'): Promise<string> {
    const doc = await createTestDoc(sender.user.id, 'P1491 doc');
    docIds.push(doc.id);
    const id = (await createTestLetter(sender.user.id, doc.id, { mode })).id;
    letterIds.push(id);
    await sealTestLetter(id);
    return id;
  }

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P1491 Sender' });
    recipient = await createTestUser({ name: 'P1491 Recipient' });
    stranger = await createTestUser({ name: 'P1491 Stranger' });
  });

  test.afterAll(async () => {
    for (const id of letterIds) await deleteTestLetter(id).catch(() => {});
    if (docIds.length) await supabaseAdmin.from('clarity_docs').delete().in('id', docIds);
    for (const u of [sender, recipient, stranger]) {
      if (u?.user?.id) await deleteTestUser(u.user.id).catch(() => {});
    }
  });

  // ── The defect ──────────────────────────────────────────────────────────────

  test('the sender cannot advance or take their own letter\'s unclaimed delivery', async () => {
    const d = await createTestDelivery(await sealedLetter(), {
      receiverEmail: generateTestEmail(),
      invitationExpiresAt: FUTURE(),
    });
    const senderClient = await signIn(sender.email);

    const { data, error } = await senderClient.rpc(RPC, { p_token: d.invitationToken, p_status: 'completed' });
    expect(error, error?.message).toBeNull();
    expect(data, 'refused calls report false').toBe(false);

    const row = await readDelivery(d.id);
    expect(row.receiver_profile_id, 'sender must not become the receiver').toBeNull();
    expect(row.status, 'sender must not move the recipient\'s progress').toBe('sent');
    expect(row.completed_at).toBeNull();
  });

  test('the sender cannot advance a delivery already bound to its recipient', async () => {
    const d = await createTestDelivery(await sealedLetter(), {
      receiverEmail: generateTestEmail(),
      receiverProfileId: recipient.user.id,
      status: 'opened',
      invitationExpiresAt: PAST(),
    });
    const senderClient = await signIn(sender.email);

    const { data, error } = await senderClient.rpc(RPC, { p_token: d.invitationToken, p_status: 'completed' });
    expect(error, error?.message).toBeNull();
    expect(data).toBe(false);

    const row = await readDelivery(d.id);
    expect(row.status).toBe('opened');
    expect(row.receiver_profile_id).toBe(recipient.user.id);
  });

  test('an expired invitation does not bind an unclaimed delivery to a signed-in caller', async () => {
    const d = await createTestDelivery(await sealedLetter(), {
      receiverEmail: generateTestEmail(),
      invitationExpiresAt: PAST(),
    });
    const strangerClient = await signIn(stranger.email);

    const { error } = await strangerClient.rpc(RPC, { p_token: d.invitationToken, p_status: 'opened' });
    expect(error, error?.message).toBeNull();

    const row = await readDelivery(d.id);
    expect(row.receiver_profile_id, 'expired invitation must not bind an account').toBeNull();
    // Progress itself is not gated by invitation expiry (P683): the reader's open still counts.
    expect(row.status).toBe('opened');
  });

  // ── Legitimate paths (must pass before and after the fix) ───────────────────

  test('control: a signed-in recipient on an unexpired, unclaimed invitation is bound (claim-equivalent)', async () => {
    const d = await createTestDelivery(await sealedLetter(), {
      receiverEmail: generateTestEmail(),
      invitationExpiresAt: FUTURE(),
    });
    const recipientClient = await signIn(recipient.email);

    const { data, error } = await recipientClient.rpc(RPC, { p_token: d.invitationToken, p_status: 'opened' });
    expect(error, error?.message).toBeNull();
    expect(data).toBe(true);

    const row = await readDelivery(d.id);
    expect(row.status).toBe('opened');
    expect(row.receiver_profile_id).toBe(recipient.user.id);
  });

  test('control: a bound recipient keeps progressing after the invitation is spent (P683)', async () => {
    // create-and-open-letter spends the invitation (expires_at = now) in the same write that binds it.
    const d = await createTestDelivery(await sealedLetter(), {
      receiverEmail: generateTestEmail(),
      receiverProfileId: recipient.user.id,
      status: 'opened',
      invitationExpiresAt: new Date().toISOString(),
    });
    const recipientClient = await signIn(recipient.email);

    for (const status of ['in_progress', 'completed'] as const) {
      const { data, error } = await recipientClient.rpc(RPC, { p_token: d.invitationToken, p_status: status });
      expect(error, error?.message).toBeNull();
      expect(data).toBe(true);
    }
    const row = await readDelivery(d.id);
    expect(row.status).toBe('completed');
    expect(row.completed_at).not.toBeNull();
    expect(row.receiver_profile_id).toBe(recipient.user.id);
  });

  test('control: a signed-out reader of a one-to-one letter still records progress, binding nobody', async () => {
    const d = await createTestDelivery(await sealedLetter(), {
      receiverEmail: generateTestEmail(),
      invitationExpiresAt: FUTURE(),
    });
    const { data, error } = await anonClient().rpc(RPC, { p_token: d.invitationToken, p_status: 'opened' });
    expect(error, error?.message).toBeNull();
    expect(data).toBe(true);

    const row = await readDelivery(d.id);
    expect(row.status).toBe('opened');
    expect(row.opened_at).not.toBeNull();
    expect(row.receiver_profile_id).toBeNull();
  });

  test('control: backward transitions stay no-ops (P979) and one-to-many still needs sign-in (P684)', async () => {
    const d = await createTestDelivery(await sealedLetter(), {
      receiverEmail: generateTestEmail(),
      receiverProfileId: recipient.user.id,
      status: 'completed',
    });
    const recipientClient = await signIn(recipient.email);
    const back = await recipientClient.rpc(RPC, { p_token: d.invitationToken, p_status: 'opened' });
    expect(back.error, back.error?.message).toBeNull();
    expect((await readDelivery(d.id)).status).toBe('completed');

    const many = await createTestDelivery(await sealedLetter('one-to-many'), { receiverProfileId: recipient.user.id });
    const anonMany = await anonClient().rpc(RPC, { p_token: many.invitationToken, p_status: 'opened' });
    expect(anonMany.error?.message ?? '').toMatch(/Authentication required/);
    expect((await readDelivery(many.id)).status).toBe('sent');
  });

  // ── Bound deliveries: who may record progress ───────────────────────────────

  test('a different signed-in account cannot advance a delivery bound to its recipient', async () => {
    const d = await createTestDelivery(await sealedLetter(), {
      receiverEmail: generateTestEmail(),
      receiverProfileId: recipient.user.id,
      status: 'opened',
      invitationExpiresAt: FUTURE(),
    });
    const strangerClient = await signIn(stranger.email);

    const { data, error } = await strangerClient.rpc(RPC, { p_token: d.invitationToken, p_status: 'completed' });
    expect(error, error?.message).toBeNull();
    expect(data, 'a conflicting identity is refused').toBe(false);

    const row = await readDelivery(d.id);
    expect(row.status).toBe('opened');
    expect(row.completed_at).toBeNull();
    expect(row.receiver_profile_id).toBe(recipient.user.id);
  });

  test('policy: a signed-out holder of a one-to-one token records forward progress on a bound delivery, never rebinding it', async () => {
    // P642 bearer model, kept deliberately: the recipient may read the emailed link signed out.
    const d = await createTestDelivery(await sealedLetter(), {
      receiverEmail: generateTestEmail(),
      receiverProfileId: recipient.user.id,
      status: 'opened',
      invitationExpiresAt: new Date().toISOString(),
    });
    const { data, error } = await anonClient().rpc(RPC, { p_token: d.invitationToken, p_status: 'in_progress' });
    expect(error, error?.message).toBeNull();
    expect(data).toBe(true);

    const row = await readDelivery(d.id);
    expect(row.status).toBe('in_progress');
    expect(row.receiver_profile_id).toBe(recipient.user.id);
  });

  test('a claim that lands while the call is in flight is not overwritten or regressed', async () => {
    const d = await createTestDelivery(await sealedLetter(), {
      receiverEmail: generateTestEmail(),
      invitationExpiresAt: FUTURE(),
    });
    const strangerClient = await signIn(stranger.email);
    const marker = `p1491-race-${randomUUID()}`;

    // A concurrent writer (the shape of claim_letter_delivery followed by reading progress):
    // binds the recipient and advances the status, holding the row lock for a few seconds
    // before it commits.
    const holder = testDbQuery(
      `/* ${marker} */ WITH u AS (
         UPDATE public.letter_deliveries
            SET receiver_profile_id = '${recipient.user.id}', status = 'in_progress',
                opened_at = COALESCE(opened_at, now())
          WHERE id = '${d.id}' RETURNING 1)
       SELECT pg_sleep(6) FROM u`,
    );

    // Wait until the writer is actually holding the lock before racing it.
    let holding = false;
    for (let i = 0; i < 40 && !holding; i++) {
      const rows = await testDbQuery(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE state = 'active' AND query LIKE '%${marker}%' AND query NOT LIKE '%pg_stat_activity%'`,
      ) as Array<{ n: number }>;
      holding = (rows[0]?.n ?? 0) > 0;
      if (!holding) await new Promise((r) => setTimeout(r, 250));
    }
    expect(holding, 'the concurrent writer must be holding the row when the call starts').toBe(true);

    const call = strangerClient.rpc(RPC, { p_token: d.invitationToken, p_status: 'opened' });
    const [res] = await Promise.all([call, holder]);
    expect(res.error, res.error?.message).toBeNull();

    const row = await readDelivery(d.id);
    expect(row.receiver_profile_id, 'the claimed receiver survives').toBe(recipient.user.id);
    expect(row.status, 'progress is not regressed').toBe('in_progress');
  });
});
