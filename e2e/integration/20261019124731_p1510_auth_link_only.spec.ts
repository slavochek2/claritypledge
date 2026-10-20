/**
 * @file 20261019124731_p1510_auth_link_only.spec.ts
 * @description Migration integration test for P1510 — a password never produces a session,
 * and emailed-link sign-in always does.
 *
 * TEST keeps password sign-in for its suites (vault marker `password_signin=allowed`), so
 * every fixture here uses an address whose local part ends in `+pwoff` — the migration
 * strips those even where passwords are allowed. That is the "TEST-only toggle" the spec
 * asks for: the mechanism runs for these fixtures and for nothing else on TEST.
 *
 * Done-When rows covered (spec features/p1510_reject_password_sign_in.md):
 *   - password set later by each path is unusable: public signup, admin create, admin
 *     update, signed-in password change, recovery then set-password
 *   - the original sequence: unconfirmed account with a password, owner completes an
 *     emailed link, that password is refused
 *   - emailed links still produce a USED session: magic link and OTP code, for a new
 *     account, an existing passwordless one, and one whose password was stripped
 *   - control: a non-fixture TEST account still signs in with its password (TEST unchanged)
 *   - the one-time clear (public.p1510_clear_passwords, which the migration runs on prod):
 *     a CONFIRMED account whose password works is refused after it (red, then green), its
 *     earlier session is revoked, and link sign-in still works; clear-all is refused on TEST
 *
 * Run: npx playwright test --project=integration e2e/integration/20261019124731_p1510_auth_link_only.spec.ts
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../helpers/supabase-admin";
import {
  createTestUser,
  deleteTestUser,
  TEST_PASSWORD,
} from "../helpers/test-user";

const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const anon = () => createClient(URL_, ANON_KEY, opts);

const PW = "P1510-password-must-not-work-9!";
const created: string[] = [];
const fixture = (tag: string) =>
  `p1510-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}+pwoff@example.com`;

/** A password attempt must produce no session. */
async function expectPasswordRefused(email: string, password = PW) {
  const { data, error } = await anon().auth.signInWithPassword({
    email,
    password,
  });
  expect(data.session, `password produced a session for ${email}`).toBeNull();
  // The exact rejection the prod smoke canary (step 6) requires — proven here, not assumed.
  expect(error?.status).toBe(400);
  expect(error?.code).toBe("invalid_credentials");
}

/** The session must be usable: the auth server returns the same user for it. */
async function expectUsableSession(accessToken: string, email: string) {
  const { data, error } = await anon().auth.getUser(accessToken);
  expect(error).toBeNull();
  expect(data.user?.email).toBe(email);
}

async function generate(type: "magiclink" | "recovery", email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type,
    email,
  });
  expect(error, `generateLink ${type}: ${error?.message}`).toBeNull();
  if (data.user?.id && !created.includes(data.user.id))
    created.push(data.user.id);
  return data.properties!;
}

/** Complete the emailed MAGIC LINK the way the browser does (token_hash exchange). */
async function linkSignIn(email: string) {
  const p = await generate("magiclink", email);
  const client = anon();
  const { data, error } = await client.auth.verifyOtp({
    type: p.verification_type as "magiclink" | "signup",
    token_hash: p.hashed_token,
  });
  expect(error, `link exchange: ${error?.message}`).toBeNull();
  await expectUsableSession(data.session!.access_token, email);
  return { client, session: data.session! };
}

/** Complete the emailed OTP CODE (6 digits typed by the person). */
async function otpSignIn(email: string) {
  const p = await generate("magiclink", email);
  const { data, error } = await anon().auth.verifyOtp({
    type: "email",
    email,
    token: p.email_otp,
  });
  expect(error, `otp exchange: ${error?.message}`).toBeNull();
  await expectUsableSession(data.session!.access_token, email);
}

async function adminCreate(
  email: string,
  withPassword: boolean,
  confirmed = true,
) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: confirmed,
    ...(withPassword ? { password: PW } : {}),
  });
  expect(error, `admin create: ${error?.message}`).toBeNull();
  created.push(data.user!.id);
  return data.user!.id;
}

test.describe("P1510: password sign-in refused, link sign-in works", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test.afterAll(async () => {
    for (const id of created)
      await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
  });

  // ── Control: TEST keeps passwords for everything that is not a +pwoff fixture ──
  test("control: an ordinary TEST account still signs in with its password", async () => {
    const u = await createTestUser({ name: "P1510 Control" });
    try {
      const { data, error } = await anon().auth.signInWithPassword({
        email: u.email,
        password: TEST_PASSWORD,
      });
      expect(error).toBeNull();
      expect(data.session).not.toBeNull();
    } finally {
      await deleteTestUser(u.user.id);
    }
  });

  // ── Each path that writes a password ──────────────────────────────────────────
  test("admin create with a password: password refused", async () => {
    const email = fixture("admincreate");
    await adminCreate(email, true);
    await expectPasswordRefused(email);
  });

  test("admin update sets a password: password refused", async () => {
    const email = fixture("adminupdate");
    const id = await adminCreate(email, false);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: PW,
    });
    expect(error).toBeNull();
    await expectPasswordRefused(email);
  });

  test("public signup API with a password: password refused", async () => {
    const email = fixture("signup");
    const { data, error } = await anon().auth.signUp({ email, password: PW });
    expect(error, `signUp: ${error?.message}`).toBeNull();
    if (data.user?.id) created.push(data.user.id);
    // Confirm it so the only thing standing between the password and a session is P1510.
    await supabaseAdmin.auth.admin.updateUserById(data.user!.id, {
      email_confirm: true,
    });
    await expectPasswordRefused(email);
  });

  test("signed-in password change: password refused", async () => {
    const email = fixture("change");
    await adminCreate(email, false);
    const { client } = await linkSignIn(email);
    const { error } = await client.auth.updateUser({ password: PW });
    expect(error, `updateUser: ${error?.message}`).toBeNull();
    await expectPasswordRefused(email);
  });

  test("recovery then set-password: password refused", async () => {
    const email = fixture("recovery");
    await adminCreate(email, false);
    const p = await generate("recovery", email);
    const client = anon();
    const { data, error } = await client.auth.verifyOtp({
      type: "recovery",
      token_hash: p.hashed_token,
    });
    expect(error, `recovery exchange: ${error?.message}`).toBeNull();
    await client.auth.setSession({
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token,
    });
    const { error: upErr } = await client.auth.updateUser({ password: PW });
    expect(upErr, `updateUser after recovery: ${upErr?.message}`).toBeNull();
    await expectPasswordRefused(email);
  });

  // ── The original sequence (Problem) ──────────────────────────────────────────
  test("unconfirmed account with a password, then owner completes a link: password refused", async () => {
    const email = fixture("original");
    await adminCreate(email, true, false); // created unconfirmed, carrying a password
    await linkSignIn(email); // the real owner signs in by emailed link
    const { data } = await supabaseAdmin.auth.admin.getUserById(
      created[created.length - 1],
    );
    expect(
      data.user?.email_confirmed_at,
      "link should have confirmed the account",
    ).toBeTruthy();
    await expectPasswordRefused(email);
  });

  // ── The one-time clear (the migration's prod branch, scoped to one account) ──
  test("clear: a confirmed account whose password worked is refused after, its session revoked", async () => {
    const u = await createTestUser({ name: "P1510 Clear" }); // ordinary TEST account: password kept
    try {
      const before = await anon().auth.signInWithPassword({
        email: u.email,
        password: TEST_PASSWORD,
      });
      expect(
        before.data.session,
        "red: before the clear the password must work",
      ).not.toBeNull();

      const { data: res, error } = await supabaseAdmin.rpc(
        "p1510_clear_passwords",
        { p_user_ids: [u.user.id] },
      );
      expect(error, `clear: ${error?.message}`).toBeNull();
      expect(Number(res![0].cleared)).toBe(1);
      expect(Number(res![0].revoked)).toBeGreaterThanOrEqual(1);

      await expectPasswordRefused(u.email, TEST_PASSWORD);
      const refresh = await anon().auth.refreshSession({
        refresh_token: before.data.session!.refresh_token,
      });
      expect(
        refresh.data.session,
        "the pre-clear session must be revoked",
      ).toBeNull();
      await linkSignIn(u.email);
    } finally {
      await deleteTestUser(u.user.id);
    }
  });

  test('clear: clearing every account is refused where the marker is not "forbidden" (TEST)', async () => {
    const { error } = await supabaseAdmin.rpc("p1510_clear_passwords", {
      p_user_ids: null,
    });
    expect(error?.message).toMatch(/needs password_signin=forbidden/);
  });

  test("clear: client roles cannot run it", async () => {
    const { error } = await anon().rpc("p1510_clear_passwords", {
      p_user_ids: null,
    });
    expect(error, "anon must not reach the clear function").not.toBeNull();
  });

  // ── Link sign-in keeps working ───────────────────────────────────────────────
  test("magic link and OTP: new account", async () => {
    await linkSignIn(fixture("newlink"));
    await otpSignIn(fixture("newotp"));
  });

  test("magic link and OTP: existing passwordless account", async () => {
    const email = fixture("passwordless");
    await adminCreate(email, false);
    await linkSignIn(email);
    await otpSignIn(email);
  });

  test("magic link and OTP: account whose password was stripped", async () => {
    const email = fixture("stripped");
    await adminCreate(email, true);
    await expectPasswordRefused(email);
    await linkSignIn(email);
    await otpSignIn(email);
  });
});
