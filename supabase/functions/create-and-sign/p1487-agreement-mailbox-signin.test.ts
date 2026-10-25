// Deno test, LIVE against the TEST project (the sign-in email is captured, never sent):
//   set -a; . ./.env.test.local; set +a
//   SUPABASE_URL=$VITE_SUPABASE_URL deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/create-and-sign/p1487-agreement-mailbox-signin.test.ts
// Skips when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY are absent.
//
// P1487: an agreement invitee's first sign-in goes to the invited mailbox. Runs the real handler
// against the real database and auth server; only the mail transport is replaced so the test can
// open the link the invitee would receive. Every fixture is created here and removed afterwards.
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHandler, type AgreementSignInEmail } from './handler.ts';
import { SERVER_CURRENT_TERMS_VERSION } from '../_shared/terms-version.ts';

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? '';
const LIVE = !!URL_ && !!SERVICE && !!ANON;
const APP = 'https://app.p1487.test';
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = (): SupabaseClient => createClient(URL_, SERVICE, opts);
const anon = (): SupabaseClient => createClient(URL_, ANON, opts);
const uniq = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const randomIp = () => `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250) + 1).join('.')}`;
const live = { ignore: !LIVE, sanitizeOps: false, sanitizeResources: false };
const CREDENTIAL_KEYS = ['hashedToken', 'hashed_token', 'token_hash', 'access_token', 'refresh_token', 'action_link', 'session'];

interface Fixture { sb: SupabaseClient; creatorId: string; users: string[]; agreements: string[] }

async function setup(): Promise<Fixture> {
  const sb = admin();
  const email = `p1487-ag-creator-${uniq()}@example.com`;
  const { data } = await sb.auth.admin.createUser({ email, email_confirm: true });
  const creatorId = data.user!.id;
  const { error } = await sb.from('profiles').insert({
    id: creatorId, email, name: 'Casey Creator', slug: `p1487-ag-${uniq()}`, avatar_color: '#0044CC',
    is_verified: true, has_pledged: false, pledge_version: 2, accepted_terms_version: SERVER_CURRENT_TERMS_VERSION,
  });
  if (error) throw new Error(error.message);
  return { sb, creatorId, users: [creatorId], agreements: [] };
}

async function teardown(f: Fixture) {
  if (f.agreements.length) await f.sb.from('clarity_agreements').delete().in('id', f.agreements);
  for (const id of f.users) {
    await f.sb.from('terms_acceptances').delete().eq('user_id', id);
    await f.sb.from('profiles').delete().eq('id', id);
    await f.sb.auth.admin.deleteUser(id);
  }
}

async function invite(f: Fixture, partnerEmail: string) {
  const { data, error } = await f.sb.from('clarity_agreements').insert({
    creator_profile_id: f.creatorId, partner_email: partnerEmail, status: 'pending', visibility: 'private',
    terms_text: 'We commit to at least one /live session per month.',
  }).select('id, invitation_token').single();
  if (error || !data) throw new Error(error?.message);
  f.agreements.push(data.id);
  return { id: data.id as string, token: data.invitation_token as string };
}

async function accountOf(sb: SupabaseClient, email: string) {
  const { data } = await sb.rpc('get_auth_user_by_email', { p_email: email });
  const id = (data as Array<{ id: string }> | null)?.[0]?.id;
  if (!id) return null;
  return (await sb.auth.admin.getUserById(id)).data.user ?? null;
}

function harness(sb: SupabaseClient) {
  const sent: AgreementSignInEmail[] = [];
  const handler = createHandler({
    supabase: sb, appUrl: APP, ipHashSecret: `p1487-${crypto.randomUUID()}`,
    sendSignInEmail: (e) => { sent.push(e); return Promise.resolve(); },
  });
  return { handler, sent };
}

function sign(handler: (r: Request) => Promise<Response>, body: Record<string, unknown>, ip = randomIp()) {
  return handler(new Request('http://x/create-and-sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ partnerName: 'Pat Partner', termsVersion: SERVER_CURRENT_TERMS_VERSION, ...body }),
  }));
}

function assertNoCredential(raw: string) {
  const body = JSON.parse(raw);
  for (const k of CREDENTIAL_KEYS) assertFalse(k in body, `response carries "${k}"`);
}

Deno.test({
  name: 'P1487 agreement: an existing unconfirmed account at the invited address keeps none of its earlier credentials once the partner signs in',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-ag-pre-${uniq()}@example.com`;
      const earlier = `Earlier-${crypto.randomUUID()}`;
      const { data: pre } = await f.sb.auth.admin.createUser({
        email, password: earlier, email_confirm: false, user_metadata: { name: 'Earlier Name', avatar_url: 'https://elsewhere.example/a.png' },
      });
      f.users.push(pre.user!.id);
      const ag = await invite(f, email);
      const { handler, sent } = harness(f.sb);

      const res = await sign(handler, { agreementId: ag.id, token: ag.token });
      const raw = await res.text();
      assertEquals(res.status, 200, raw);
      assertNoCredential(raw);
      assertEquals(sent.length, 1);
      assertEquals(sent[0].to, email);

      const link = new URL(sent[0].link);
      assertEquals(link.searchParams.get('redirect'), `/agreements/${ag.id}/accept?token=${ag.token}`);
      const client = anon();
      const { data: v } = await client.auth.verifyOtp({ token_hash: link.searchParams.get('token_hash')!, type: 'magiclink' });
      assertEquals(v?.session?.user.id, pre.user!.id, 'the partner signs in to that account through the mailbox');

      const { data: old } = await anon().auth.signInWithPassword({ email, password: earlier });
      assertEquals(old?.session ?? null, null, 'the earlier password must not sign in');
      const meta = (await f.sb.auth.admin.getUserById(pre.user!.id)).data.user?.user_metadata ?? {};
      assertFalse('name' in meta, 'no name typed before sign-in is written to the account');
      assertFalse('avatar_url' in meta);

      // The terms version is recorded once, after sign-in, by the nonce this link carried.
      const nonce = link.searchParams.get('terms_nonce');
      assert(nonce, 'the link carries the terms nonce');
      const { data: recorded } = await client.rpc('consume_pending_terms_acceptance', { p_nonce: nonce });
      assertEquals(recorded, SERVER_CURRENT_TERMS_VERSION);
      const { data: again } = await client.rpc('consume_pending_terms_acceptance', { p_nonce: nonce });
      assertEquals(again, null);
    } finally {
      await teardown(f);
    }
  },
});

Deno.test({
  name: 'P1487 agreement: a new invitee gets an unconfirmed account and a mailbox link; nothing is signed or confirmed',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-ag-new-${uniq()}@example.com`;
      const ag = await invite(f, email);
      const { handler, sent } = harness(f.sb);

      const res = await sign(handler, { agreementId: ag.id, token: ag.token });
      const raw = await res.text();
      const user = await accountOf(f.sb, email);
      if (user) f.users.push(user.id);
      assertEquals(res.status, 200, raw);
      assertNoCredential(raw);
      assertEquals(JSON.parse(raw), { ok: true, checkEmail: true });
      assert(user, 'an account exists for the invited address');
      assertEquals(user.email_confirmed_at ?? null, null, 'unconfirmed until the mailbox link is opened');
      const pending = user.app_metadata?.pending_terms as { version?: string; nonce?: string; issued_at?: string } | undefined;
      assertEquals(pending?.version, SERVER_CURRENT_TERMS_VERSION, 'the HANDLER kept the submitted (current) version');
      assert(pending?.nonce && pending.nonce.length >= 32, 'with a nonce');
      assertEquals(new URL(sent[0].link).searchParams.get('terms_nonce'), pending.nonce, 'the same nonce travels only in the emailed link');
      assertFalse(raw.includes(pending.nonce), 'never in the response');
      assertFalse('name' in (user.user_metadata ?? {}), 'no name typed before sign-in is written to the account');
      const { data: agRow } = await f.sb.from('clarity_agreements').select('status, partner_profile_id').eq('id', ag.id).single();
      assertEquals(agRow, { status: 'pending', partner_profile_id: null });
      assertEquals(sent.map((s) => s.to), [email]);
    } finally {
      await teardown(f);
    }
  },
});

Deno.test({
  name: 'P1487 agreement control: a confirmed account is left as it is and gets the same answer',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-ag-conf-${uniq()}@example.com`;
      const password = `Own-${crypto.randomUUID()}`;
      const { data: owner } = await f.sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Owner Name' } });
      f.users.push(owner.user!.id);
      const ag = await invite(f, email);
      const { handler, sent } = harness(f.sb);

      const res = await sign(handler, { agreementId: ag.id, token: ag.token });
      const raw = await res.text();
      assertEquals(res.status, 200, raw);
      assertEquals(JSON.parse(raw), { ok: true, checkEmail: true }, 'same answer as for a new invitee');
      assertEquals(sent.length, 1);
      const { data: s } = await anon().auth.signInWithPassword({ email, password });
      assert(s?.session, "the owner's own password still works");
      const after = (await f.sb.auth.admin.getUserById(owner.user!.id)).data.user;
      assertEquals(after?.user_metadata?.name, 'Owner Name');
      assertEquals(after?.app_metadata?.pending_terms, undefined, 'no terms intent is stored on a confirmed account');
      assertEquals(new URL(sent[0].link).searchParams.get('terms_nonce'), null, 'and the link carries none');

      // The owner later signs in by another route: nothing is recorded on their behalf.
      const ownerClient = anon();
      await ownerClient.auth.signInWithPassword({ email, password });
      for (const p_nonce of [null, 'c'.repeat(48)]) {
        const { data: rec } = await ownerClient.rpc('consume_pending_terms_acceptance', { p_nonce });
        assertEquals(rec, null);
      }
      const { data: auditRows } = await f.sb.from('terms_acceptances').select('id').eq('user_id', owner.user!.id);
      assertEquals(auditRows ?? [], []);
    } finally {
      await teardown(f);
    }
  },
});

Deno.test({
  name: 'P1487 agreement control: a wrong token or a non-pending agreement creates and sends nothing',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-ag-bad-${uniq()}@example.com`;
      const ag = await invite(f, email);
      const { handler, sent } = harness(f.sb);

      const wrong = await sign(handler, { agreementId: ag.id, token: crypto.randomUUID() });
      assertEquals(wrong.status, 403, await wrong.text());
      await f.sb.from('clarity_agreements').update({ status: 'declined' }).eq('id', ag.id);
      const done = await sign(handler, { agreementId: ag.id, token: ag.token });
      assertEquals(done.status, 409, await done.text());
      assertEquals(sent.length, 0);
      assertEquals(await accountOf(f.sb, email), null);
    } finally {
      await teardown(f);
    }
  },
});

Deno.test({
  name: 'P1487 agreement limiter: the invited address gets 3 sign-in emails per hour; the 4th is refused before anything changes',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-ag-lim-${uniq()}@example.com`;
      const ag = await invite(f, email);
      const { handler, sent } = harness(f.sb);
      for (let i = 1; i <= 3; i++) {
        const ok = await sign(handler, { agreementId: ag.id, token: ag.token });
        const raw = await ok.text();
        if (i === 1) { const u = await accountOf(f.sb, email); if (u) f.users.push(u.id); }
        assertEquals(ok.status, 200, `request ${i}: ${raw}`);
      }
      const refused = await sign(handler, { agreementId: ag.id, token: ag.token });
      const raw = await refused.text();
      assertEquals(refused.status, 429, raw);
      assert(Number(refused.headers.get('Retry-After')) > 0);
      assertEquals(sent.length, 3);
    } finally {
      await teardown(f);
    }
  },
});

Deno.test({
  name: 'P1487 agreement: only the current terms version is accepted',
  ...live,
  fn: async () => {
    const f = await setup();
    try {
      const email = `p1487-ag-ver-${uniq()}@example.com`;
      const ag = await invite(f, email);
      const { handler, sent } = harness(f.sb);
      const res = await sign(handler, { agreementId: ag.id, token: ag.token, termsVersion: 'v1.3' });
      const raw = await res.text();
      const leaked = await accountOf(f.sb, email);
      if (leaked) f.users.push(leaked.id);
      assertEquals(res.status, 400, raw);
      assertEquals(JSON.parse(raw).error, 'INVALID_TERMS_VERSION');
      assertEquals(sent.length, 0);
      assertEquals(leaked, null);
    } finally {
      await teardown(f);
    }
  },
});
