// Deno test, LIVE against the TEST project:
//   set -a; . ./.env.test.local; set +a
//   SUPABASE_URL=$VITE_SUPABASE_URL deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/check-login-email/p1511-check-login-email.test.ts
// Skips when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are absent.
//
// P1511: the login form's account check, behind the P1225 per-IP limiter. Runs the real handler
// against the real limiter and the real email_exists. Each test sends from its own random
// x-forwarded-for address, so every IP bucket starts empty and the counts are exact. The client is
// wrapped only to record which RPCs ran — "performs no lookup" is asserted on that record.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CHECK_LOGIN_EMAIL_LIMIT, FUNCTION_NAME, createHandler } from './handler.ts';
import type { RpcClient } from '../_shared/mail-rate-limit.ts';

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SECRET = 'p1511-test-salt';
const LIVE = !!URL_ && !!SERVICE;
const live = { ignore: !LIVE, sanitizeOps: false, sanitizeResources: false };
const admin = (): SupabaseClient =>
  createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const uniq = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const randomIp = () => `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250) + 1).join('.')}`;
const ORIGIN = 'http://localhost:5200';

/** Records every RPC name; `failLimiter` makes the limiter call return a database error. */
function spy(db: RpcClient, failLimiter = false) {
  const calls: string[] = [];
  const client: RpcClient = {
    rpc(fn, args) {
      calls.push(fn);
      if (failLimiter && fn === 'reserve_mail_rate_slot') {
        return Promise.resolve({ data: null, error: { code: '08006', message: 'connection failure' } });
      }
      return db.rpc(fn, args);
    },
  };
  return { client, calls };
}

function post(ip: string, body: unknown): Request {
  return new Request('https://fn.test/check-login-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, Origin: ORIGIN },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function result(res: Response): Promise<string> {
  return ((await res.json()) as { result?: string }).result ?? '';
}

async function withProfile(fn: (email: string) => Promise<void>) {
  const sb = admin();
  const email = `p1511-known-${uniq()}@example.com`;
  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(error.message);
  const id = data.user!.id;
  try {
    const { error: e } = await sb.from('profiles').insert({
      id, email, name: 'P1511 Known', slug: `p1511-${uniq()}`, avatar_color: '#0044CC',
      is_verified: true, has_pledged: false, pledge_version: 2, accepted_terms_version: 'v1.4',
    });
    if (e) throw new Error(e.message);
    await fn(email);
  } finally {
    await sb.from('profiles').delete().eq('id', id);
    await sb.auth.admin.deleteUser(id);
  }
}

async function clearBucket(sb: SupabaseClient, ip: string) {
  const { ipLimitKey } = await import('../_shared/mail-rate-limit.ts');
  const key = await ipLimitKey(post(ip, {}), SECRET);
  await sb.from('mail_rate_limits').delete().eq('function_name', FUNCTION_NAME).eq('key_hash', key);
}

Deno.test('the limit is the founder decision: 10 per 10 minutes', () => {
  assertEquals(CHECK_LOGIN_EMAIL_LIMIT, { limit: 10, windowSeconds: 600 });
});

Deno.test('found for a known address (normalized as today), absent for an unknown one', live, async () => {
  await withProfile(async (email) => {
    const sb = admin();
    const ip = randomIp();
    const handler = createHandler({ db: sb, ipHashSecret: SECRET });
    try {
      assertEquals(await result(await handler(post(ip, { email: `  ${email.toUpperCase()} ` }))), 'found');
      assertEquals(await result(await handler(post(ip, { email: `p1511-nobody-${uniq()}@example.com` }))), 'absent');
    } finally {
      await clearBucket(sb, ip);
    }
  });
});

Deno.test('past the limit: limited, and no lookup is performed', live, async () => {
  const sb = admin();
  const ip = randomIp();
  try {
    for (let i = 0; i < CHECK_LOGIN_EMAIL_LIMIT.limit; i++) {
      const res = await createHandler({ db: sb, ipHashSecret: SECRET })(post(ip, { email: `p1511-n${i}-${uniq()}@example.com` }));
      assertEquals(await result(res), 'absent', `request ${i + 1} is inside the allowance`);
    }
    const { client, calls } = spy(sb);
    const res = await createHandler({ db: client, ipHashSecret: SECRET })(post(ip, { email: `p1511-over-${uniq()}@example.com` }));
    assertEquals(await result(res), 'limited');
    assertEquals(calls, ['reserve_mail_rate_slot'], 'a refused request must never reach email_exists');
    assert(Number(res.headers.get('Retry-After')) > 0);
    // Another caller is unaffected: the allowance is per IP.
    assertEquals(await result(await createHandler({ db: sb, ipHashSecret: SECRET })(post(randomIp(), { email: `p1511-other-${uniq()}@example.com` }))), 'absent');
  } finally {
    await clearBucket(sb, ip);
  }
});

Deno.test('limiter database failure: unavailable, and no lookup is performed', async () => {
  // Structural fake underneath: the limiter call fails before it would reach it, and email_exists
  // would answer true — so a lookup that wrongly ran would surface as 'found', not pass silently.
  const fake: RpcClient = { rpc: () => Promise.resolve({ data: true, error: null }) };
  const { client, calls } = spy(fake, true);
  const res = await createHandler({ db: client, ipHashSecret: SECRET })(post(randomIp(), { email: 'p1511-x@example.com' }));
  assertEquals(res.status, 503);
  assertEquals(await result(res), 'unavailable');
  assertEquals(calls, ['reserve_mail_rate_slot']);
});

Deno.test('lookup failure after an admitted slot: unavailable, never absent', async () => {
  const calls: string[] = [];
  const db: RpcClient = {
    rpc(fn) {
      calls.push(fn);
      if (fn === 'reserve_mail_rate_slot') return Promise.resolve({ data: 0, error: null });
      return Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied' } });
    },
  };
  const res = await createHandler({ db, ipHashSecret: SECRET })(post(randomIp(), { email: 'p1511-y@example.com' }));
  assertEquals(await result(res), 'unavailable');
  assertEquals(calls, ['reserve_mail_rate_slot', 'email_exists']);
});

Deno.test('malformed input: 400, no slot spent and no lookup', async () => {
  for (const body of ['not json', {}, { email: 42 }, { email: 'no-at-sign' }, { email: `${'a'.repeat(250)}@x.io` }]) {
    const calls: string[] = [];
    const db: RpcClient = { rpc(fn) { calls.push(fn); return Promise.resolve({ data: 0, error: null }); } };
    const res = await createHandler({ db, ipHashSecret: SECRET })(post(randomIp(), body));
    assertEquals(res.status, 400, JSON.stringify(body));
    assertEquals(calls, []);
  }
});

Deno.test('CORS preflight from the app origin; non-POST refused', async () => {
  const db: RpcClient = { rpc: () => Promise.resolve({ data: 0, error: null }) };
  const handler = createHandler({ db, ipHashSecret: SECRET });
  const pre = await handler(new Request('https://fn.test/x', { method: 'OPTIONS', headers: { Origin: ORIGIN } }));
  assertEquals(pre.status, 200);
  assertEquals(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const get = await handler(new Request('https://fn.test/x', { method: 'GET', headers: { Origin: ORIGIN } }));
  assertEquals(get.status, 405);
});
