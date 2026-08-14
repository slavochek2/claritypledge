---
status: week
type: bug
rank: 34
severity: medium
workstream: testing
date_reported: '2026-08-14'
created_date: '2026-08-14'
tags: [e2e, auth, magic-link, pkce, test-infrastructure]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1086: E2E magic-link tests time out — AuthCallbackPage lacks the PKCE hash-token fallback that letter-reading-page.tsx already has

## Summary

Any Playwright E2E test that simulates "click the magic link in your email" by generating a link server-side (`supabaseAdmin.auth.admin.generateLink({ type: 'magiclink' })`) and navigating directly to it times out on `page.waitForURL` after landing on `/auth/callback`. Reproduced on two unrelated features: `e2e/p1076-org-invite-link.spec.ts` ("auto-join: signed-out visitor completes signup via magic link...") and `e2e/integration/p458-auth-callback-position.spec.ts` ("Full magic-link round-trip").

## Root Cause

Found, not unknown. `src/lib/supabase.ts:15` configures the client with `flowType: 'pkce'`. Per an existing project decision (`docs/decisions.md` 2026-04-15 [technical], filed for P710): an admin-generated magic link (`generateLink` type `magiclink`) redirects with `#access_token=...&type=magiclink` in the URL **hash** (implicit-flow tokens) — the PKCE client's `detectSessionInUrl` only processes `?code=...` query params and ignores hash tokens entirely. Any page that may be reached this way must implement "Pattern B": detect the hash synchronously, call `supabase.auth.setSession({ access_token, refresh_token })` from a run-once effect, and gate data loading on that.

`src/app/pages/letter-reading-page.tsx` already implements Pattern B (confirmed: `magicLinkProcessing` state + explicit `setSession()` call, lines ~128-160) — it was built for P710, which genuinely reaches its page via admin-generated links in production (the letter/agreement edge functions call `generateLink`).

`src/auth/AuthCallbackPage.tsx` — the page both `e2e/p1076-org-invite-link.spec.ts` and `e2e/integration/p458-auth-callback-position.spec.ts` land on — has **no** such handling: no hash-token parsing, no `setSession()` call, no `magicLinkProcessing` gate. It waits on `session`/`user`/`sessionChecked` from `useAuth()`, which never populate for a hash-token-only redirect under a PKCE client. The test's `page.waitForURL` therefore waits forever.

**This is very likely test-infrastructure-only, not a production bug.** Grepped every `generateLink` call site outside `e2e/`: it's used by the letter/agreement edge functions (`send-letter-emails`, `create-and-open-letter`, `send-agreement-emails`, `create-and-sign`, `request-letter-response-signin`) — none of which redirect to `/auth/callback`. Real self-service signup (`src/app/pages/signup-page.tsx`) does not call `generateLink` — it uses standard `supabase.auth.signUp()`, whose confirmation link is a browser-initiated PKCE flow (`?code=...`), which `detectSessionInUrl` handles natively. That's consistent with the founder's own direct test: real email signup worked. Only the E2E test helper's simulation method (`e2e/helpers/test-user.ts` → `generateMagicLinkUrl()`) produces the implicit-flow link type that `AuthCallbackPage` can't process — it doesn't accurately simulate how a real signup confirmation link behaves.

## Reproduction Steps

1. `cd .claude/worktrees/w2` (or any checkout with a running dev server)
2. `npx playwright test e2e/integration/p458-auth-callback-position.spec.ts -g "Full magic-link round-trip" --reporter=line --workers=1`
3. Observe: `TimeoutError: page.waitForURL: Timeout 30000ms exceeded` after `page.goto(magicLinkUrl)`, where `magicLinkUrl` comes from `generateMagicLinkUrl()` (admin API, hash-token redirect)
4. Same result on `e2e/p1076-org-invite-link.spec.ts`, test "auto-join: signed-out visitor completes signup via magic link and is already a member, no second tap"

**Reproduction rate:** 100%, confirmed independently across two unrelated features in one session.

## Expected Behavior

The test's simulated magic-link click establishes a session (via whatever mechanism — either the test helper matching real signup's PKCE flow, or `AuthCallbackPage` gaining a hash-token fallback) and the page navigates to the expected post-auth URL within the timeout.

## Actual Behavior

The page never navigates away from the magic-link redirect target. No session is established. Test hangs 30s then fails with a `waitForURL` timeout, on both attempts (no flakiness — deterministic).

## Affected Files

- `e2e/helpers/test-user.ts` — `generateMagicLinkUrl()` (~line 286) produces an admin-generated implicit-flow link, not equivalent to a real self-service PKCE signup confirmation link
- `src/auth/AuthCallbackPage.tsx` — no Pattern B hash-token handling (contrast with `letter-reading-page.tsx`); file carries a "CRITICAL - DO NOT MODIFY WITHOUT E2E TEST APPROVAL" header
- `src/app/pages/letter-reading-page.tsx` (~lines 128-160) — reference implementation of Pattern B, for comparison
- `src/lib/supabase.ts:15` — `flowType: 'pkce'` client config, the reason implicit hash tokens aren't auto-detected
- `docs/decisions.md` 2026-04-15 [technical] — the original P710 decision this bug's root cause traces to

## Severity

**Medium** — blocks automated verification of any "signed-out visitor completes signup via magic link" scenario (currently just p1076's auto-join AC and p458's regression test). No confirmed production user impact: real self-service signup uses a different, working code path. Workaround exists: manual/phone testing of the real flow.

## Fix Approach

Two directions, not yet decided between:

1. **Fix the test helper** — change `generateMagicLinkUrl()` (or add a new helper) to simulate a real self-service signup confirmation link instead of an admin-generated implicit-flow one, so the test exercises the actual code path real users hit. Lower blast radius (test-only change).
2. **Add Pattern B to `AuthCallbackPage.tsx`** — mirror `letter-reading-page.tsx`'s hash-token `setSession()` gate, making the page robust to both PKCE-code and implicit-hash redirects. Matches the general rule in the P710 decision ("any new page that may be reached via admin magic link... must implement Pattern B") and would make the existing tests pass as originally written. Higher blast radius — the file's own header requires E2E test approval before modification.

Recommend starting with option 1 and running `/reproduce` to confirm which one actually closes the gap before committing to a direction.

## Acceptance Criteria

- [ ] `e2e/integration/p458-auth-callback-position.spec.ts` "Full magic-link round-trip" passes
- [ ] `e2e/p1076-org-invite-link.spec.ts` "auto-join: signed-out visitor completes signup via magic link..." passes
- [ ] No change to `signup-page.tsx` or any real-user-facing signup behavior (confirmed by the existing p1010/p1076 regression suites staying green)
- [ ] If `AuthCallbackPage.tsx` is modified: re-run `/finish` review per its file-header requirement
