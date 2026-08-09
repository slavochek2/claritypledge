---
status: week
type: bug
rank: 1000959
severity: critical
workstream: infrastructure
date_reported: '2026-08-09'
created_date: '2026-08-09'
tags: [auth, oauth, supabase, prod-incident]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1031: Google sign-in returns "Error 401: deleted_client" on prod and test

## Summary

Google sign-in is broken on both prod and test because the OAuth client Supabase Auth points at was deleted from the third-party-owned GCP project it lives in on 2026-08-06 02:46 UTC.

## Root Cause

Confirmed, not hypothesised.

ClarityPledge's Google provider is configured in the Supabase dashboard with an OAuth client that belongs to a **legacy shared GCP project inherited from a previous venture** — a project on which three accounts other than the founder's hold `roles/owner`. On **2026-08-06 02:46:44 UTC**, one of those other owners deleted both OAuth clients in the project, one second apart, using permission `clientauthconfig.clients.delete` (ADMIN_WRITE). Recorded in that project's Cloud Logging admin-activity log; the identity, IP, and project identifiers are in `.private/incidents/` — deliberately not in this public file.

Every subsequent authorisation attempt is rejected by Google before any consent screen renders. No code in this repo changed; nothing in `src/` or `supabase/` is at fault. The client ID is server-side config held in the Supabase project, which is why **prod and test broke simultaneously — both Supabase projects reference the same, now-deleted, client.**

The deeper defect is not the deletion but the **dependency**: production authentication for all users sat on a credential inside a project the founder does not solely control, where any of three other owners could remove it without notice. Recreating a client in the same project would re-arm the identical trap.

## Invariants

- **Any credential production auth depends on must live in a project the founder solely owns.** A shared or inherited cloud project is not an acceptable home for a prod auth credential regardless of how convenient it is — the failure mode is silent, total, and outside our control.
- **Prod and test must not share one OAuth client.** A single deletion took down both environments at once, removing test as a place to verify the fix.

## Reproduction Steps

1. Open `https://claritypledge.com/signup` as a signed-out visitor (any browser, any Google account).
2. Click **Continue with Google**.
3. Observe the redirect to `accounts.google.com`.
4. Bug occurs: instead of a consent screen, Google renders "Access blocked: Authorisation error" / "The OAuth client was deleted." / "Error 401: deleted_client".

**Reproduction rate:** 100%

**Reproduction without a browser or a Google session** (this is the cheapest check, and the one the canary in Fix Approach should automate):

```bash
curl -s -o /dev/null -D - \
  "https://<prod-ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fclaritypledge.com%2Fauth%2Fcallback" \
  | grep -i '^location:'
```

Healthy: `location:` points at `accounts.google.com/o/oauth2/v2/auth?...`, and following it yields a consent page.
Broken: following it yields `302 → accounts.google.com/signin/oauth/error?authError=…` (the `authError` blob base64-decodes to `deleted_client` + "The OAuth client was deleted.").

## Expected Behavior

Clicking "Continue with Google" shows the Google consent screen, then returns to `/auth/callback` with a code, and the user lands signed in.

## Actual Behavior

Google rejects the request at the authorisation endpoint with `Error 401: deleted_client` and never renders consent. The user is stranded on a Google error page with no route back into the product.

## Affected Files

None in this repo. The broken value is **external configuration**:

- Supabase dashboard → Authentication → Providers → Google → Client ID + Secret (**prod** project)
- Supabase dashboard → Authentication → Providers → Google → Client ID + Secret (**test** project — same client, also broken)
- `src/app/data/api.ts:501` — `supabase.auth.signInWithOAuth({ provider: 'google' })`, correct as written; listed only so the call site is findable
- `src/app/components/auth/google-auth-button.tsx` — the affected UI affordance; emits no analytics event, see Fix Approach

## Severity

**Critical** — login is fully blocked for the 62 production users who have a Google identity and no email identity. They have no self-service route back into their accounts.

## Impact Assessment (verified against prod, 2026-08-09)

Nothing was lost or corrupted. Deleting an OAuth client removes only the credential, never user records.

- 121 users, 69 Google identities, 35 email identities — all rows intact.
- 20 unrevoked refresh tokens across 7 users still valid; Supabase issues its own session tokens, so already-signed-in users were never logged out.
- Zero new signups in the outage window — but the last signup was 2026-07-08, a month before the break, so the outage caused no measurable signup loss.
- The only two sign-ins since the deletion both used the **email** path.
- **62 users are Google-only** (no email identity) and cannot sign in until this is fixed. None of them has attempted a sign-in since 2026-07-09, so there is no evidence any real user hit the wall.

**Known blind spot:** a bounced OAuth attempt writes nothing to the database, and the Google button fires no Mixpanel event, so failed attempts are structurally invisible. `signup_page_viewed` held flat across the break (~8/day before and after), which is evidence against a traffic cliff but cannot prove nobody clicked through and bounced.

## Fix Approach

Console work; no code change is required for the fix itself.

1. **Create a new OAuth client in a GCP project the founder solely owns** — not the inherited shared project. Web application type. Authorized redirect URIs: the `/auth/v1/callback` endpoint of the prod Supabase project and of the test Supabase project. The new project needs its own consent-screen branding (app name, support email, logo — the old brand's uploaded logo does not carry over).
2. **Update the Google provider config in both Supabase projects** with the new client ID and secret.
3. **Verify** with the curl above against both refs: `location:` must resolve to a consent screen, not `/signin/oauth/error`.
4. **Confirm identity continuity** by signing in with one pre-existing Google account and checking that it resolves to the original user row rather than creating a new one. Google's `sub` claim is documented as stable per Google account rather than per client, which predicts clean re-linking — **untested, treat as unverified until this step passes.**
5. **Add an auth canary** — `scripts/auth-canary.sh`, run on the existing weekly/daily cadence — that follows the authorize redirect for both environments and exits non-zero when it lands on `/signin/oauth/error`. This outage ran silently for 3.5 days; the canary is the only reason it would not run silently again.

Considered and rejected: recreating the client inside the shared project (fastest to execute, but leaves prod auth revocable by three third parties — the actual defect); removing Google sign-in and going email-only (strands the 62 Google-only users behind an account-recovery flow that does not exist).

## Resolution (2026-08-09, ~14h after detection)

New GCP project `claritypledge` (sole owner: the founder), new consent-screen config, one OAuth client per environment, both pasted into their matching Supabase project. Outage closed.

**Identity continuity — the untested prediction, now tested and confirmed.** The spec predicted that Google's `sub` claim is stable per Google account rather than per OAuth client, so existing users would re-link cleanly under a brand-new client. Evidence after a real sign-in through the new client:

- Counts unchanged from the pre-sign-in baseline: **121 users / 69 google identities / 104 identities total** — no duplicate row was created (`new_users_last_hour = 0`).
- The signing user resolved to their **original** `auth.users` row (created 2025-12-02), not a new one.
- The **google** identity row — created 2026-01-19 under the *old, now-deleted* client — has `updated_at` moved to the sign-in moment while `created_at` is untouched, and the sibling email identity's `updated_at` did not move. So the Google identity authenticated and was reused across a client swap. The assumption holds; it is no longer an assumption.

## Acceptance Criteria

- [x] Clicking "Continue with Google" on `claritypledge.com/signup` shows the Google consent screen — no "Access blocked" page (canary + live consent screen)
- [x] A signed-out user completes Google sign-in end to end and lands signed in on the app
- [x] A pre-existing Google user signs in and resolves to their **original** account — same profile, same content, no duplicate user row (see Resolution)
- [x] The OAuth client's GCP project lists exactly one owner: the founder (`get-iam-policy` → one `roles/owner` binding)
- [x] `scripts/auth-canary.sh` exits 0 against both environments after the fix, and has been observed exiting non-zero against a known-broken client (both paths exercised before the fix landed)
- [ ] The same flow works against the test environment — **canary green only**; no human sign-in performed against test
- [ ] No console errors during the sign-in flow — not captured

## Open follow-ups (not blocking the outage fix)

1. **`auth-canary.sh` is not yet monitored.** It exists and passes, but nothing runs it on a schedule. Correct home is a `.github/workflows/auth-canary.yml` cron alongside the five existing scheduled workflows — modelled on `prod-health-smoke.yml` (6-hourly, `continue-on-error` alert-only, find-or-append a GitHub issue). Explicitly **not** `/day` or `/weekly`: a check that runs only when a human invokes a skill is not monitoring.
2. **Consent screen shows the callback domain, not "ClarityPledge".** Google only displays app name/logo once brand verification is approved (External + Published are already satisfied). Branding fields and `claritypledge.com` were added and verification submitted; **result not yet read**. Risk: authorised domains necessarily include two `supabase.co` hosts we do not own, and Google requires Search Console ownership of authorised domains. If verification fails, the documented fix is a Supabase Custom Domain (paid add-on) so the callback becomes a domain we own. Logo (`public/icons/icon-512.png`) deliberately not uploaded yet — uploading one forces verification.
3. **Nothing monitors third-party dependency config generally.** This failure class (a provider-side credential deleted or rotated out from under us) is currently invisible for Vercel, Stripe, and Resend too.
