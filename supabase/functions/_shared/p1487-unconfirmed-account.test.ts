// Deno test, LIVE against the TEST project's auth server:
//   set -a; . ./.env.test.local; set +a
//   SUPABASE_URL=$VITE_SUPABASE_URL deno test --config supabase/functions/deno.json --allow-env --allow-net supabase/functions/_shared/p1487-unconfirmed-account.test.ts
// Skips when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY are absent.
//
// P1487: resetUnconfirmedAccount is called by every function that mints a sign-in link
// (src/tests/p1487-unconfirmed-account-reset.test.ts keeps that true). These tests prove what it
// does against the real auth server: an unconfirmed account keeps nothing its creator set once
// the link is opened, and a confirmed account is left exactly as it was.
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from '@supabase/supabase-js';
import { resetUnconfirmedAccount } from './unconfirmed-account.ts';

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON = Deno.env.get('VITE_SUPABASE_ANON_KEY') ?? '';
const LIVE = !!URL_ && !!SERVICE && !!ANON;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = () => createClient(URL_, SERVICE, opts);
const anon = () => createClient(URL_, ANON, opts);
const live = { ignore: !LIVE, sanitizeOps: false, sanitizeResources: false };
const addr = (tag: string) => `p1487-reset-${tag}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}@example.com`;

async function openLink(email: string) {
  const { data } = await admin().auth.admin.generateLink({ type: 'magiclink', email });
  return anon().auth.verifyOtp({ token_hash: data!.properties!.hashed_token, type: 'magiclink' });
}

Deno.test({
  name: 'P1487: an unconfirmed account keeps no earlier password or metadata once its sign-in link is opened',
  ...live,
  fn: async () => {
    const sb = admin();
    const email = addr('unconf');
    const earlier = `Earlier-${crypto.randomUUID()}`;
    const { data } = await sb.auth.admin.createUser({
      email, password: earlier, email_confirm: false,
      user_metadata: { name: 'Earlier Name', avatar_url: 'https://elsewhere.example/a.png', role: 'x' },
    });
    const id = data.user!.id;
    try {
      assertEquals(await resetUnconfirmedAccount(sb, id, { name: 'Pat' }), 'reset');
      const { data: v } = await openLink(email);
      assert(v?.session, 'the mailbox link signs the owner in');
      const { data: old } = await anon().auth.signInWithPassword({ email, password: earlier });
      assertEquals(old?.session ?? null, null, 'the earlier password no longer signs in');
      const meta = (await sb.auth.admin.getUserById(id)).data.user?.user_metadata ?? {};
      assertEquals(meta.name, 'Pat');
      assertFalse('avatar_url' in meta);
      assertFalse('role' in meta);
    } finally {
      await sb.auth.admin.deleteUser(id);
    }
  },
});

Deno.test({
  name: 'P1487 control: a confirmed account is left exactly as it was',
  ...live,
  fn: async () => {
    const sb = admin();
    const email = addr('conf');
    const password = `Own-${crypto.randomUUID()}`;
    const { data } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Owner', avatar_url: 'https://own.example/a.png' } });
    const id = data.user!.id;
    try {
      assertEquals(await resetUnconfirmedAccount(sb, id, { name: 'Someone Else' }), 'confirmed', 'reported as confirmed, not reset');
      const { data: s } = await anon().auth.signInWithPassword({ email, password });
      assert(s?.session, 'the owner password still works');
      const meta = (await sb.auth.admin.getUserById(id)).data.user?.user_metadata ?? {};
      assertEquals(meta.name, 'Owner');
      assertEquals(meta.avatar_url, 'https://own.example/a.png');
    } finally {
      await sb.auth.admin.deleteUser(id);
    }
  },
});
