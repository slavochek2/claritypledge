// Deno test: run with
//   deno test --config supabase/functions/deno.json --allow-env supabase/functions/send-agreement-emails/index.test.ts
//
// P1691. Rule under test: the host of every link in an agreement notice comes from the
// configured app address. The only other source is a request origin that matches the exact
// development rule in _shared/cors.ts, and only on a project recognised as a test or local
// target.
//
// Every request goes through the function's real index.ts (its environment guards, the real
// client library, its mail transport). The socket is an in-memory stand-in
// (_shared/serve-capture.test-util.ts) and the database, auth server and mail provider are
// answered in memory (_shared/http-backend.test-util.ts). No deploy, no network: the test runs
// without network permission.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { captureStdServe } from '../_shared/serve-capture.test-util.ts';
import { HttpBackend, type SentMail } from '../_shared/http-backend.test-util.ts';
import { FakeSupabase, isAuthServerLink, linksIn } from '../_shared/fake-supabase.test-util.ts';

const APP = 'https://app.p1691.test';
const PROD_PROJECT = 'https://besjtuodziykmjidubzw.supabase.co';
// The project address a function sees inside a self-hosted or local stack.
const TEST_STACK = 'http://kong:8000';
// A hosted project that is not prod: not recognised as a test target.
const OTHER_HOSTED_PROJECT = 'https://abcdefghijklmnopqrst.supabase.co';
const GENERIC_500 = 'Something went wrong. Please try again.';
const INTERNAL_SECRET = 'internal-test-secret';

Deno.env.set('SUPABASE_URL', PROD_PROJECT);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-only-not-a-real-key');
Deno.env.set('SUPABASE_ANON_KEY', 'test-only-not-a-real-key');
Deno.env.set('MAILGUN_API_KEY', 'test-only-not-a-real-key');
Deno.env.set('MAILGUN_DOMAIN', 'mail.p1691.test');
Deno.env.set('APP_URL', APP);
Deno.env.set('IP_HASH_SECRET', 'p1691-test-salt');
Deno.env.set('INTERNAL_FN_SECRET', INTERNAL_SECRET);

const server = captureStdServe();
await import('./index.ts');

// The function builds its clients per request, and each client starts background timers.
const opts = { sanitizeOps: false, sanitizeResources: false };

const CREATOR = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const BYSTANDER = '99999999-9999-4999-8999-999999999999';
const TO_NEW = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TO_KNOWN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTIVE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ENDED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NEW_ADDRESS = 'new-partner@example.com';
const KNOWN_ADDRESS = 'known-partner@example.com';
const CREATOR_ADDRESS = 'creator@example.com';

const FIXED_LINKS = new Set(['https://claritypledge.com']);

/** Origins that begin like a development origin and are not one. */
const NOT_DEV_ORIGINS = [
  'http://localhost.elsewhere.example.com',
  'http://localhost:1@elsewhere.example.com',
  'http://localhost:5001.elsewhere.example.com',
  'http://localhost:5001@elsewhere.example.com',
  'http://localhostx:5001',
  'http://localhost:5001/',
  'http://localhost:80',
];

function setup(project: string, rpc: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const db = new FakeSupabase({
    rpc,
    tokens: { 'creator-token': CREATOR, 'partner-token': PARTNER, 'bystander-token': BYSTANDER },
    authUsers: [{
      id: PARTNER, email: KNOWN_ADDRESS, email_confirmed_at: '2026-01-01T00:00:00Z',
      identities: [{ provider: 'email' }],
    }],
    tables: {
      profiles: [
        { id: CREATOR, name: 'Cam Creator', email: CREATOR_ADDRESS },
        { id: PARTNER, name: 'Pat Partner', email: KNOWN_ADDRESS },
      ],
      clarity_agreements: [
        {
          id: TO_NEW, creator_profile_id: CREATOR, partner_profile_id: null, partner_email: NEW_ADDRESS,
          invitation_token: 'token-new', invitation_expires_at: '2099-01-01T00:00:00Z', status: 'pending',
        },
        {
          id: TO_KNOWN, creator_profile_id: CREATOR, partner_profile_id: null, partner_email: KNOWN_ADDRESS,
          invitation_token: 'token-known', invitation_expires_at: '2099-01-01T00:00:00Z', status: 'pending',
        },
        {
          id: ACTIVE, creator_profile_id: CREATOR, partner_profile_id: PARTNER, partner_email: KNOWN_ADDRESS,
          invitation_token: 'token-active', invitation_expires_at: '2099-01-01T00:00:00Z', status: 'active',
        },
        {
          id: ENDED, creator_profile_id: CREATOR, partner_profile_id: PARTNER, partner_email: KNOWN_ADDRESS,
          invitation_token: 'token-ended', invitation_expires_at: '2099-01-01T00:00:00Z', status: 'terminated',
        },
      ],
    },
  });
  const backend = new HttpBackend(db);

  /** One request through index.ts, as if the function ran against `project`. */
  const send = (
    origin: string | null,
    action: string,
    agreementId: string,
    auth: Record<string, string> = { Authorization: 'Bearer creator-token' },
  ): Promise<Response> => {
    if (project === '') Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', project);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...auth };
    if (origin !== null) headers['Origin'] = origin;
    return backend.during(() =>
      server.dispatch(new Request('https://fn.p1691.test/send-agreement-emails', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, agreementId }),
      }))
    );
  };
  return { db, sent: backend.mail, seen: backend.seen, send };
}

function assertMailLinksUnder(base: string, mail: SentMail, label: string) {
  const links = [...linksIn(mail.html), ...linksIn(mail.text)];
  assert(links.length > 0, `${label}: the mail carries links`);
  for (const link of links) {
    const ok = link.startsWith(`${base}/`) || FIXED_LINKS.has(link) || isAuthServerLink(link);
    assert(ok, `${label}: link host is not the expected one: ${link}`);
  }
}

/**
 * Sends the invitation to a partner without an account, the invitation to a partner with one,
 * and a resend, and checks every link and every sign-in redirect target sits under `base`.
 */
async function assertInvitationLinksUnder(base: string, origin: string | null, project: string) {
  const label = `${origin ?? 'no origin'} on ${project}`;
  const ctx = setup(project);

  const toNew = await ctx.send(origin, 'invitation', TO_NEW);
  assertEquals(toNew.status, 200, label);
  assertEquals(ctx.sent.length, 1, `${label}: invitation mailed`);
  assertEquals(ctx.sent[0].to, NEW_ADDRESS);
  assertMailLinksUnder(base, ctx.sent[0], `${label} (invitation, no account)`);
  assert(ctx.sent[0].text.includes(`${base}/agreements/${TO_NEW}/accept?token=token-new`), `${label}: plain accept link`);
  assertEquals(ctx.db.links.length, 0, `${label}: no sign-in link for a partner without an account`);

  const toKnown = await ctx.send(origin, 'invitation', TO_KNOWN);
  assertEquals(toKnown.status, 200, label);
  assertEquals(ctx.sent.length, 2);
  assertEquals(ctx.sent[1].to, KNOWN_ADDRESS);
  assertMailLinksUnder(base, ctx.sent[1], `${label} (invitation, account)`);
  assertEquals(ctx.db.links.length, 1, `${label}: one sign-in link is minted`);
  assertEquals(ctx.db.links[0].redirectTo, `${base}/agreements/${TO_KNOWN}/accept?token=token-known`, label);

  const resend = await ctx.send(origin, 'resend', TO_NEW);
  assertEquals(resend.status, 200, label);
  assertEquals(ctx.sent.length, 3);
  assertMailLinksUnder(base, ctx.sent[2], `${label} (resend)`);
  assert(ctx.sent[2].text.includes(`${base}/agreements/${TO_NEW}/accept?token=`), `${label}: resend accept link`);
  assert(!ctx.sent[2].text.includes('token=token-new'), `${label}: a resend carries a new token`);
}

// ── the entry point itself ────────────────────────────────────────────────────

Deno.test('preflight is answered before any configuration is read', opts, async () => {
  const res = await server.dispatch(new Request('https://fn.p1691.test/send-agreement-emails', {
    method: 'OPTIONS', headers: { Origin: 'https://claritypledge.com' },
  }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://claritypledge.com');
});

Deno.test('with the project address missing or unusable, the answer is the generic failure and no mail is sent', opts, async () => {
  const missing = setup('');
  const res = await missing.send('http://localhost:5001', 'invitation', TO_NEW);
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, GENERIC_500);
  assert(res.headers.get('Access-Control-Allow-Origin'));
  assertEquals(missing.seen, [], 'nothing is requested without a project address');

  const unusable = setup('not a url');
  assertEquals((await unusable.send('http://localhost:5001', 'invitation', TO_NEW)).status, 500);
  assertEquals(unusable.sent.length, 0);
});

// ── the legitimate path is kept ───────────────────────────────────────────────

Deno.test('with no request origin, invitation and resend links use the configured app address', opts, async () => {
  await assertInvitationLinksUnder(APP, null, PROD_PROJECT);
});

Deno.test('with the live site as request origin, links use the configured app address', opts, async () => {
  await assertInvitationLinksUnder(APP, 'https://claritypledge.com', PROD_PROJECT);
});

Deno.test('on a recognised test project with a localhost APP_URL, an exact development origin yields local links', opts, async () => {
  Deno.env.set('APP_URL', 'http://localhost:5001');
  try {
    for (const project of [TEST_STACK, 'https://203-0-113-7.sslip.io', 'https://test-server.tailnet-name.ts.net:8443']) {
      for (const origin of ['http://localhost:5001', 'http://localhost:5200', 'http://localhost:6100']) {
        await assertInvitationLinksUnder(origin, origin, project);
      }
    }
  } finally {
    Deno.env.set('APP_URL', APP);
  }
});

Deno.test('on a recognised test project whose APP_URL is not localhost, an exact development origin yields APP_URL', opts, async () => {
  await assertInvitationLinksUnder(APP, 'http://localhost:5200', TEST_STACK);
});

Deno.test('accepted and terminated notices use the dev origin on a test project with a localhost APP_URL, and APP_URL otherwise', opts, async () => {
  const DEV = 'http://localhost:5200';
  const call = async (action: string, appUrl: string, project: string, origin: string, base: string) => {
    Deno.env.set('APP_URL', appUrl);
    try {
      const ctx = setup(project);
      const res = await ctx.send(origin, action, action === 'terminated' ? ENDED : ACTIVE, { Authorization: 'Bearer partner-token' });
      assertEquals(res.status, 200, `${action} ${appUrl} ${project}`);
      assert(ctx.sent.length >= 1, `${action}: mailed`);
      for (const mail of ctx.sent) {
        assertMailLinksUnder(base, mail, action);
        assert(mail.text.includes(`${base}/agreements/${action === 'terminated' ? ENDED : ACTIVE}`), `${action}: agreement link under ${base}`);
      }
    } finally {
      Deno.env.set('APP_URL', APP);
    }
  };
  for (const action of ['accepted', 'terminated']) {
    await call(action, 'http://localhost:5001', TEST_STACK, DEV, DEV);
    await call(action, APP, TEST_STACK, DEV, APP);
    await call(action, 'http://localhost:5001', PROD_PROJECT, DEV, 'http://localhost:5001');
    await call(action, 'http://localhost:5001', TEST_STACK, 'http://localhost:6000', 'http://localhost:5001');
  }
});

Deno.test('a notice to the agreement\'s own parties links to the configured app address', opts, async () => {
  const ctx = setup(TEST_STACK);
  const res = await ctx.send('http://localhost:5001', 'accepted', ACTIVE, { Authorization: 'Bearer partner-token' });
  assertEquals(res.status, 200);
  assertEquals(ctx.sent.length, 1);
  assertEquals(ctx.sent[0].to, CREATOR_ADDRESS);
  assertMailLinksUnder(APP, ctx.sent[0], 'accepted');
  assert(ctx.sent[0].text.includes(`${APP}/agreements/${ACTIVE}`));
});

Deno.test('caller, state and send-limit checks still decide before any mail', opts, async () => {
  const ctx = setup(PROD_PROJECT);
  assertEquals((await ctx.send(null, 'invitation', TO_NEW, {})).status, 401);
  assertEquals((await ctx.send(null, 'invitation', TO_NEW, { Authorization: 'Bearer nobody' })).status, 401);
  assertEquals((await ctx.send(null, 'invitation', TO_NEW, { Authorization: 'Bearer bystander-token' })).status, 403);
  assertEquals((await ctx.send(null, 'accepted', TO_NEW)).status, 403); // pending, not active
  // The internal secret from the environment opens only the internal caller's one action.
  assertEquals((await ctx.send(null, 'invitation', TO_NEW, { 'x-internal-secret': INTERNAL_SECRET })).status, 403);
  assertEquals((await ctx.send(null, 'invitation', TO_NEW, { 'x-internal-secret': 'not-the-secret' })).status, 401);
  assertEquals(ctx.sent.length, 0);

  const limited = setup(PROD_PROJECT, { reserve_mail_rate_slot: () => 1800 });
  const refused = await limited.send(null, 'invitation', TO_NEW);
  assertEquals(refused.status, 429);
  assertEquals(refused.headers.get('Retry-After'), '1800');
  assertEquals(limited.sent.length, 0, 'a refused request sends no mail');
});

Deno.test('an internal caller holding the secret can send the one notice it is allowed', opts, async () => {
  const ctx = setup(PROD_PROJECT);
  const res = await ctx.send(null, 'accepted', ACTIVE, { 'x-internal-secret': INTERNAL_SECRET });
  assertEquals(res.status, 200);
  assertEquals(ctx.sent.map((m) => m.to), [CREATOR_ADDRESS]);
});

// ── the link host comes only from configuration or the exact development rule ──

for (const origin of NOT_DEV_ORIGINS) {
  Deno.test(`a request origin that is not an exact development origin never becomes the link host: ${origin}`, opts, async () => {
    for (const project of [PROD_PROJECT, TEST_STACK]) {
      await assertInvitationLinksUnder(APP, origin, project);
    }
  });
}

Deno.test('on the prod project, even an exact development origin yields the configured app address', opts, async () => {
  await assertInvitationLinksUnder(APP, 'http://localhost:5001', PROD_PROJECT);
});

Deno.test('on a project that is not a known test project, an exact development origin yields the configured app address', opts, async () => {
  for (const project of [OTHER_HOSTED_PROJECT, 'https://unknown-project.example.com', 'https://besjtuodziykmjidubzw.supabase.co.elsewhere.example.com']) {
    await assertInvitationLinksUnder(APP, 'http://localhost:5001', project);
  }
});
