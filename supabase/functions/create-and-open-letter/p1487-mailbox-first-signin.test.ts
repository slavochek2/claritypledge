// Deno test, LIVE against the TEST project (the sign-in email is captured, never sent):
//   set -a; . ./.env.test.local; set +a
//   SUPABASE_URL=$VITE_SUPABASE_URL \
//     deno test --allow-env --allow-net supabase/functions/create-and-open-letter/p1487-mailbox-first-signin.test.ts
// Skips when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY are absent.
//
// P1487: holding an invitation token must never be enough to get a session or a confirmed
// account. The first sign-in for an invited recipient goes to the recipient's own mailbox.
// Runs the real handler against the real database and the real auth server; only the mail
// transport is replaced, so the test can read the link the recipient would receive.
// Every fixture is created here under a unique address and removed afterwards.
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHandler, type SignInEmail } from './handler.ts';

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? '';
const LIVE = !!URL_ && !!SERVICE && !!ANON;
const APP = 'https://app.p1487.test';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = (): SupabaseClient => createClient(URL_, SERVICE, opts);
const anon = (): SupabaseClient => createClient(URL_, ANON, opts);
const uniq = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

/** Anything in a response that could sign its holder in. */
const CREDENTIAL_KEYS = ['hashedToken', 'hashed_token', 'token_hash', 'access_token', 'refresh_token', 'action_link', 'session'];

interface Fixture {
  sb: SupabaseClient;
  senderId: string;
  docId: string;
  letterId: string;
  cleanupUsers: string[];
  cleanupDeliveries: string[];
}

async function makeUser(sb: SupabaseClient, email: string, opts: { confirmed: boolean; profile: boolean; name?: string }): Promise<string> {
  const { data, error } = await sb.auth.admin.createUser({ email, email_confirm: opts.confirmed });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  if (opts.profile) {
    const { error: pErr } = await sb.from('profiles').insert({
      id: data.user.id, email, name: opts.name ?? 'P1487 Fixture', slug: `p1487-${uniq()}`, avatar_color: '#0044CC',
      is_verified: opts.confirmed, has_pledged: false, pledge_version: 2, accepted_terms_version: 'v1.4',
    });
    if (pErr) throw new Error(`profile insert: ${pErr.message}`);
  }
  return data.user.id;
}

async function setup(): Promise<Fixture> {
  const sb = admin();
  const senderId = await makeUser(sb, `p1487-sender-${uniq()}@example.com`, { confirmed: true, profile: true, name: 'P1487 Sender' });
  const { data: doc, error: dErr } = await sb.from('clarity_docs').insert({ owner_id: senderId, title: 'P1487 doc' }).select('id').single();
  if (dErr || !doc) throw new Error(`doc: ${dErr?.message}`);
  const { data: letter, error: lErr } = await sb.from('clarity_letters')
    .insert({ source_doc_id: doc.id, sender_id: senderId, mode: 'one-to-one', status: 'draft' }).select('id').single();
  if (lErr || !letter) throw new Error(`letter: ${lErr?.message}`);
  const { error: sErr } = await sb.from('clarity_letters').update({ status: 'sealed', sealed_at: new Date().toISOString() }).eq('id', letter.id);
  if (sErr) throw new Error(`seal: ${sErr.message}`);
  return { sb, senderId, docId: doc.id, letterId: letter.id, cleanupUsers: [senderId], cleanupDeliveries: [] };
}

async function teardown(f: Fixture) {
  const { sb } = f;
  if (f.cleanupDeliveries.length) await sb.from('letter_deliveries').delete().in('id', f.cleanupDeliveries);
  await sb.from('clarity_letters').delete().eq('id', f.letterId);
  await sb.from('clarity_docs').delete().eq('id', f.docId);
  for (const id of f.cleanupUsers) {
    await sb.from('terms_acceptances').delete().eq('user_id', id);
    await sb.from('profiles').delete().eq('id', id);
    await sb.auth.admin.deleteUser(id);
  }
}

async function addDelivery(f: Fixture, receiverEmail: string): Promise<{ id: string; token: string }> {
  const { data, error } = await f.sb.from('letter_deliveries')
    .insert({ letter_id: f.letterId, receiver_email: receiverEmail, receiver_name: 'Pat Recipient', status: 'sent' })
    .select('id, invitation_token').single();
  if (error || !data) throw new Error(`delivery: ${error?.message}`);
  f.cleanupDeliveries.push(data.id);
  return { id: data.id, token: data.invitation_token };
}

async function authUserByEmail(sb: SupabaseClient, email: string) {
  const { data } = await sb.rpc('get_auth_user_by_email', { p_email: email });
  const row = (data as Array<{ id: string }> | null)?.[0];
  if (!row) return null;
  const { data: u } = await sb.auth.admin.getUserById(row.id);
  return u?.user ?? null;
}

/** A random caller address, so each test has its own IP bucket. */
const randomIp = () => `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250) + 1).join('.')}`;

function openLetter(handler: (r: Request) => Promise<Response>, token: string, ip = randomIp()) {
  return handler(new Request('http://x/create-and-open-letter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': 'p1487-test', 'x-forwarded-for': ip },
    body: JSON.stringify({ token, termsAccepted: true, termsVersion: 'v1.4' }),
  }));
}

/** Each harness salts the limiter keys with a fresh secret, so no test shares a bucket. */
function harness(sb: SupabaseClient) {
  const sent: SignInEmail[] = [];
  const handler = createHandler({
    supabase: sb, appUrl: APP, ipHashSecret: `p1487-${crypto.randomUUID()}`,
    sendSignInEmail: (e) => { sent.push(e); return Promise.resolve(); },
  });
  return { handler, sent };
}

function assertNoCredential(body: Record<string, unknown>, raw: string) {
  for (const k of CREDENTIAL_KEYS) assertFalse(k in body, `response carries "${k}"`);
  assertFalse(/eyJ[A-Za-z0-9_-]{10,}/.test(raw), 'response carries a JWT-shaped string'); // gitleaks:allow
}

const live = { ignore: !LIVE, sanitizeOps: false, sanitizeResources: false };

Deno.test({
  name: 'P1487: a token holder gets no credential and no confirmed account for a new recipient',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-new-${uniq()}@example.com`;
      const d = await addDelivery(f, email);
      const { handler } = harness(f.sb);

      const res = await openLetter(handler, d.token);
      const raw = await res.text();
      const body = JSON.parse(raw);
      const user = await authUserByEmail(f.sb, email);
      if (user) f.cleanupUsers.push(user.id);

      assertEquals(res.status, 200, raw);
      assertNoCredential(body, raw);
      assert(user, 'an account exists for the recipient address');
      assertEquals(user.email_confirmed_at ?? null, null, 'the account must stay unconfirmed until the mailbox link is opened');
      const { data: profile } = await f.sb.from('profiles').select('id').eq('id', user.id).maybeSingle();
      assertEquals(profile, null, 'no profile before the mailbox link is opened');
      const { data: del } = await f.sb.from('letter_deliveries').select('receiver_profile_id').eq('id', d.id).single();
      assertEquals(del?.receiver_profile_id, null, 'delivery is not claimed before the mailbox link is opened');
    } finally {
      await teardown(f);
    }
  },
});

Deno.test({
  name: 'P1487: the sign-in link goes only to the recipient address, and opening it yields the account and the letter',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-mailbox-${uniq()}@example.com`;
      const d = await addDelivery(f, email);
      const { handler, sent } = harness(f.sb);

      // Control: the letter is readable by token alone, before any account exists.
      const before = await anon().rpc('get_letter_for_reading', { p_token: d.token });
      assert(before.data, `token-only read before open failed: ${before.error?.message}`);

      const res = await openLetter(handler, d.token);
      const raw = await res.text();
      const user = await authUserByEmail(f.sb, email);
      if (user) f.cleanupUsers.push(user.id);
      assertEquals(res.status, 200, raw);
      assertEquals(JSON.parse(raw).checkEmail, true);
      assert(user);

      assertEquals(sent.length, 1, 'exactly one sign-in email');
      assertEquals(sent[0].to, email, 'sent to the recipient address on the delivery, nowhere else');
      const link = new URL(sent[0].link);
      assertEquals(`${link.origin}${link.pathname}`, `${APP}/auth/verify`);
      const tokenHash = link.searchParams.get('token_hash') ?? '';
      assert(tokenHash.length > 0);
      assertFalse(raw.includes(tokenHash), 'the response never carries the emailed link');
      assertEquals(link.searchParams.get('redirect'), `/letter/${d.id}?token=${d.token}&terms=v1.4`, 'lands on the letter it was opened from, carrying the accepted terms version');

      // Control: token-only reading still works after the click.
      const after = await anon().rpc('get_letter_for_reading', { p_token: d.token });
      assert(after.data, `token-only read after open failed: ${after.error?.message}`);

      // The recipient opens the emailed link (what /auth/verify does) → session + confirmed account.
      const client = anon();
      const { data: verified, error: vErr } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
      assert(verified?.session, `mailbox link did not sign in: ${vErr?.message}`);
      assertEquals(verified.session.user.id, user.id);
      const confirmed = await authUserByEmail(f.sb, email);
      assert(confirmed?.email_confirmed_at, 'opening the mailbox link confirms the account');

      // /auth/callback writes the profile (upsert_my_profile), then the letter page claims the delivery.
      const { error: upErr } = await client.rpc('upsert_my_profile', {
        p_data: { name: 'Pat Recipient', slug: `p1487-pat-${uniq()}`, avatar_color: '#0044CC', accepted_terms_version: 'v1.4' },
      });
      assertEquals(upErr, null, `profile write: ${upErr?.message}`);
      const { data: claim, error: cErr } = await client.rpc('claim_letter_delivery', { p_token: d.token });
      assertEquals(cErr, null, `claim: ${cErr?.message}`);
      assertEquals((claim as { claimed?: boolean })?.claimed, true);
      const { data: del } = await f.sb.from('letter_deliveries').select('receiver_profile_id').eq('id', d.id).single();
      assertEquals(del?.receiver_profile_id, user.id);
    } finally {
      await teardown(f);
    }
  },
});

Deno.test({
  name: 'P1487: opening again before the mailbox link is used re-sends the link and still confirms nothing',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-again-${uniq()}@example.com`;
      const d = await addDelivery(f, email);
      const { handler, sent } = harness(f.sb);

      const first = await openLetter(handler, d.token);
      await first.body?.cancel();
      const user = await authUserByEmail(f.sb, email);
      if (user) f.cleanupUsers.push(user.id);
      assert(user);

      const res = await openLetter(handler, d.token);
      const raw = await res.text();
      assertEquals(res.status, 200, raw);
      assertNoCredential(JSON.parse(raw), raw);
      assertEquals(JSON.parse(raw).checkEmail, true);
      assertEquals(sent.length, 2);
      assertEquals(sent[1].to, email);
      const again = await authUserByEmail(f.sb, email);
      assertEquals(again?.id, user.id, 'no second account');
      assertEquals(again?.email_confirmed_at ?? null, null);
      const { data: profile } = await f.sb.from('profiles').select('id').eq('id', user.id).maybeSingle();
      assertEquals(profile, null);
    } finally {
      await teardown(f);
    }
  },
});

Deno.test({
  name: 'P1487 control: a recipient who already has an account is sent to sign in, as before',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-existing-${uniq()}@example.com`;
      const existingId = await makeUser(f.sb, email, { confirmed: true, profile: true, name: 'Pat Existing' });
      f.cleanupUsers.push(existingId);
      const d = await addDelivery(f, email);
      const { handler, sent } = harness(f.sb);

      const res = await openLetter(handler, d.token);
      const raw = await res.text();
      const body = JSON.parse(raw);
      assertEquals(res.status, 200, raw);
      assertNoCredential(body, raw);
      assertEquals(body.signInRequired, true);
      assertEquals(body.redirectTo, `/letter/${d.id}`);
      assertEquals(sent.length, 0, 'no mailbox link for an existing account (it signs in the normal way)');
      const { data: del } = await f.sb.from('letter_deliveries').select('receiver_profile_id').eq('id', d.id).single();
      assertEquals(del?.receiver_profile_id, existingId);
    } finally {
      await teardown(f);
    }
  },
});

Deno.test({
  name: 'P1487 control: a confirmed account with no profile is recovered and sent to sign in, as before',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-orphan-${uniq()}@example.com`;
      const orphanId = await makeUser(f.sb, email, { confirmed: true, profile: false });
      f.cleanupUsers.push(orphanId);
      const d = await addDelivery(f, email);
      const { handler, sent } = harness(f.sb);

      const res = await openLetter(handler, d.token);
      const raw = await res.text();
      const body = JSON.parse(raw);
      assertEquals(res.status, 200, raw);
      assertNoCredential(body, raw);
      assertEquals(body.signInRequired, true);
      assertEquals(sent.length, 0);
      const { data: profile } = await f.sb.from('profiles').select('id').eq('id', orphanId).maybeSingle();
      assertEquals(profile?.id, orphanId);
    } finally {
      await teardown(f);
    }
  },
});

// ── Rate limit (P1225 limiter) — every sign-in mail, including re-sends, spends the allowance ──

Deno.test({
  name: 'P1487 limiter: the recipient address gets 3 sign-in emails per hour; the 4th is refused before anything is created or sent',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-target-${uniq()}@example.com`;
      const d = await addDelivery(f, email);
      const { handler, sent } = harness(f.sb);

      for (let i = 1; i <= 3; i++) {
        const ok = await openLetter(handler, d.token, randomIp());
        const raw = await ok.text();
        assertEquals(ok.status, 200, `request ${i}: ${raw}`);
        assertEquals(JSON.parse(raw).checkEmail, true);
        if (i === 1) {
          const u = await authUserByEmail(f.sb, email);
          if (u) f.cleanupUsers.push(u.id);
        }
      }
      assertEquals(sent.length, 3, 'the first three requests each send');

      const refused = await openLetter(handler, d.token, randomIp());
      const raw = await refused.text();
      assertEquals(refused.status, 429, raw);
      assert(Number(refused.headers.get('Retry-After')) > 0, 'Retry-After is set');
      assertNoCredential(JSON.parse(raw), raw);
      assertEquals(sent.length, 3, 'no 4th email');
    } finally {
      await teardown(f);
    }
  },
});

Deno.test({
  name: 'P1487 limiter: one caller gets 5 opens per 10 minutes; the 6th is refused before the invitation is even read',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const existingEmail = `p1487-ipx-${uniq()}@example.com`;
      const existingId = await makeUser(f.sb, existingEmail, { confirmed: true, profile: true, name: 'Pat Existing' });
      f.cleanupUsers.push(existingId);
      const linked = await addDelivery(f, existingEmail);
      const newEmail = `p1487-ipn-${uniq()}@example.com`;
      const fresh = await addDelivery(f, newEmail);
      const { handler, sent } = harness(f.sb);
      const ip = randomIp();

      // The IP bucket counts every well-formed request, whatever it turns out to be (the first
      // links the existing account and spends the invitation, so 2-5 answer 403 — still counted).
      for (let i = 1; i <= 5; i++) {
        const r = await openLetter(handler, linked.token, ip);
        await r.body?.cancel();
        assert(r.status !== 429, `request ${i} was rate-limited`);
      }
      const refused = await openLetter(handler, fresh.token, ip);
      const raw = await refused.text();
      const leaked = await authUserByEmail(f.sb, newEmail);
      if (leaked) f.cleanupUsers.push(leaked.id);
      assertEquals(refused.status, 429, raw);
      assertEquals(sent.length, 0, 'nothing mailed');
      assertEquals(leaked, null, 'no account created for the refused request');

      // Control: another caller is unaffected and still gets the first email.
      const other = await openLetter(handler, fresh.token, randomIp());
      const otherRaw = await other.text();
      const u = await authUserByEmail(f.sb, newEmail);
      if (u) f.cleanupUsers.push(u.id);
      assertEquals(other.status, 200, otherRaw);
      assertEquals(sent.length, 1);
    } finally {
      await teardown(f);
    }
  },
});

Deno.test({
  name: 'P1487 limiter: when the limiter cannot decide, the request fails closed (500) and nothing is sent',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-unavail-${uniq()}@example.com`;
      const d = await addDelivery(f, email);
      const broken = new Proxy(f.sb, {
        get(target, prop, receiver) {
          if (prop !== 'rpc') return Reflect.get(target, prop, receiver);
          return (fn: string, args: Record<string, unknown>) =>
            fn === 'reserve_mail_rate_slot'
              ? Promise.resolve({ data: null, error: { code: 'P0001', message: 'simulated' } })
              : target.rpc(fn, args);
        },
      });
      const sent: SignInEmail[] = [];
      const handler = createHandler({
        supabase: broken, appUrl: APP, ipHashSecret: `p1487-${crypto.randomUUID()}`,
        sendSignInEmail: (e) => { sent.push(e); return Promise.resolve(); },
      });

      const res = await openLetter(handler, d.token);
      const raw = await res.text();
      const leaked = await authUserByEmail(f.sb, email);
      if (leaked) f.cleanupUsers.push(leaked.id);
      assertEquals(res.status, 500, raw);
      assertNoCredential(JSON.parse(raw), raw);
      assertEquals(sent.length, 0);
      assertEquals(leaked, null);
    } finally {
      await teardown(f);
    }
  },
});

// ── An unconfirmed account that already exists at the address is reset before it is used ──

Deno.test({
  name: 'P1487: an existing unconfirmed account at the recipient address keeps none of its earlier credentials once the recipient signs in',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-preexisting-${uniq()}@example.com`;
      const earlierPassword = `Earlier-${crypto.randomUUID()}`;
      // Stand-in for a self-service sign-up at this address that was never confirmed.
      const { data: pre, error: preErr } = await f.sb.auth.admin.createUser({
        email, password: earlierPassword, email_confirm: false,
        user_metadata: { name: 'Earlier Name', avatar_url: 'https://elsewhere.example/a.png' },
      });
      assert(pre?.user, preErr?.message);
      f.cleanupUsers.push(pre.user.id);
      const d = await addDelivery(f, email);
      const { handler, sent } = harness(f.sb);

      const res = await openLetter(handler, d.token);
      const raw = await res.text();
      assertEquals(res.status, 200, raw);
      assertEquals(sent.length, 1);

      const tokenHash = new URL(sent[0].link).searchParams.get('token_hash')!;
      const { data: v } = await anon().auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
      assert(v?.session, 'recipient signs in through the mailbox link');
      assertEquals(v.session.user.id, pre.user.id, 'same account, now confirmed');

      const { data: old } = await anon().auth.signInWithPassword({ email, password: earlierPassword });
      assertEquals(old?.session ?? null, null, 'the earlier password must not sign in after the recipient confirms');
      const meta = (await f.sb.auth.admin.getUserById(pre.user.id)).data.user?.user_metadata ?? {};
      assertEquals(meta.name, 'Pat Recipient', 'profile name comes from the invitation, not the earlier sign-up');
      assertFalse('avatar_url' in meta, 'metadata from the earlier sign-up is cleared');
    } finally {
      await teardown(f);
    }
  },
});
