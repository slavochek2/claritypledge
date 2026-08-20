---
status: in-progress
type: task
rank: 53
workstream: analytics
created_date: '2026-08-20'
tags: [analytics, mixpanel, instrumentation]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
driver: anomaly
---

# P1133: Internal accounts pollute Mixpanel funnel numbers

## Problem

**Situation:** In a 30-day analytics review, `login_complete` showed 14 events and looked like
real signup-funnel activity worth investigating further.

**Complication:** Breaking that number down by `$distinct_id` showed all 14 events traced to one
account — the founder's own personal login — not 14 distinct returning users.
Cross-checking `auth.users` for all sign-in/signup activity in the same 30-day window found
exactly three accounts touched the site at all: the founder's own account, the automated e2e test
account (`test-agent@claritypledge.com`, `profiles.is_test_account = true`), and an internal
ops/agent service account (`ops@claritypledge.com`, slug `clarity-agent`, created 2026-08-10, not
flagged `is_test_account`). Zero real external customers signed up or logged in in that window,
despite 252 unique visitors viewing `/signup`. None of this was visible from the Mixpanel
aggregate — it required a DB cross-check to catch, and it already produced one wrong conclusion
mid-analysis this session ("1 new customer, 0.4% conversion") that had to be corrected after the
fact.

**Question:** How do we make Mixpanel funnel numbers (signup, login, pledge) exclude known
non-customer accounts by default, so this doesn't require a manual DB cross-check every time
someone reads the funnel?

## Appetite

**Blast radius:** low — adds a Mixpanel user property at `analytics.identify()` time; does not
change any user-facing behavior, auth flow, or database schema. Read-only with respect to existing
tables (`is_test_account` already exists; this reads it, doesn't add a column for it).

**Reversibility:** partial, not full — corrected after adversarial review. `is_internal` is written
via `people.set`, which is a Mixpanel **People** (user-profile) property: persistent current-state,
not per-event. Removing the code stops *new* writes but does not undo values already written —
Mixpanel evaluates People properties at query time, so an already-set `is_internal` keeps affecting
how *historical* events for that user are bucketed, the opposite of the original "historical events
are unaffected either way" claim. A real rollback (if ever needed) requires a bulk `$unset` sweep
via Mixpanel's Engage API across affected People profiles — not just a code revert.

**Decision density:** one open decision — see Non-Goals: whether `ops@claritypledge.com` gets a
durable schema flag (a real `is_internal`-style column) or a hardcoded allowlist by email/id in the
analytics code. Recommend the latter for this pass (see Solution) since it's the account we know
about today; a schema-level flag is a larger, separate decision if more internal/service accounts
accumulate. **Note:** `ops@claritypledge.com` may be a legitimate system/agent-operator account
(see `features/p1124_agent_operator_is_a_real_profile.md` for related agent-account
infrastructure) rather than disposable test data — this spec does not judge whether the account
should exist, only that its activity should not count as customer funnel activity.

## Solution

At `analytics.identify()` in `src/auth/AuthCallbackPage.tsx` (the auth-callback path — the only
call site; see "Revised after adversarial review" below for why the session-restore path in
`AuthContext.tsx` does NOT also write this), also call `analytics.setUserProperties()` with a
boolean `is_internal` property, computed by a new async `isInternalAccount(email, isTestAccount)`
helper in `src/lib/mixpanel.ts`:
`isTestAccount === true` (existing DB flag, plumbed through — see below) **OR** the email's domain
is `@claritypledge.com` (covers `ops@claritypledge.com` and any future internal service account
without a code change) **OR** the SHA-256 hash of the (gmail-family-canonicalized) email is in a
comma-separated `VITE_INTERNAL_ACCOUNT_EMAIL_HASHES` env var (covers the founder's own personal
login).

**Revised twice, both times after adversarial review:**

1. **First revision (before implementation):** a hardcoded email allowlist in source was the
   original idea, rejected because this is a public AGPL-3.0 repo and CLAUDE.md forbids putting the
   founder's personal email address in a public repo file — moved to an env var instead.

2. **Second revision (after adversarial review, 3 independent Opus reviewers, all three
   converging on the same finding):** the env var *itself* was still wrong. `VITE_*` variables are
   inlined verbatim into the public production JS bundle at build time — Vite convention, and
   confirmed empirically against this repo's own `dist/` output. Following the original Pre-deploy
   Checklist (`vercel env add VITE_INTERNAL_ACCOUNT_EMAILS production`) would have published the
   founder's personal email to every visitor of claritypledge.com, unauthenticated, forever — a
   strictly worse leak than the git-repo leak the first revision was written to prevent. **Fix:**
   the env var now holds a SHA-256 hex digest of the (lowercased, gmail-family-canonicized) email,
   never the plaintext address; `isInternalAccount()` hashes the incoming email and compares
   digests. The bundle now contains only an unreversible hash.

   The same review round also found: (a) `AuthContext.tsx`'s session-restore path trusted
   `profiles.email`, a column any authenticated user can rewrite via `upsert_my_profile` with no
   verification against their real `auth.users` email — a self-tagging vector. Fixed by removing
   that call site entirely: `is_internal` is a **People** property (see corrected Appetite above),
   so it persists once set at login — re-setting it on every page load was both the security hole
   and unnecessary. (b) gmail.com/googlemail.com aliasing (`+tag`, dots, domain variants) would
   silently defeat an exact-hash match for the exact account this spec exists to catch — added
   canonicalization before hashing. (c) An unprovisioned env var failed completely silently — added
   a `console.warn` in production. (d) A misclassified real customer (a design partner/certifier/
   future employee given a `@claritypledge.com` address) would be silently and permanently excluded
   from every funnel — added a `console.warn` specifically on the domain-match branch, and a
   caveat in `docs/technical/analytics.md`. (e) The `/live` account-migration path
   (`AuthCallbackPage.tsx`'s `existingProfile` reconstruction) dropped `is_test_account` entirely —
   fixed. (f) The new analytics block is now wrapped in a fire-and-forget, try/caught async IIFE so
   a failure here can never strand a user mid-authentication — this file is the only writer of new
   profiles and carries its own "DO NOT MODIFY WITHOUT E2E TEST APPROVAL" warning for exactly that
   reason.

**Plumbing note:** `profiles.is_test_account` exists in the DB and in `DbProfile` (`src/app/types/
index.ts`), but the app-facing `Profile` type and `mapProfileFromDb()` (`src/app/data/api.ts`)
currently drop it — verified by reading both, not assumed. This spec adds `isTestAccount?: boolean`
to `Profile` and maps it through, so `existingProfile?.isTestAccount` is actually readable at the
call site above (including the `/live` migration path — see fix (e) above).

Future Mixpanel queries filter `is_internal != true` to see customer-only activity — see the three
coverage-gap caveats now in `docs/technical/analytics.md` (People-property semantics mean this is
neither purely forward-only nor purely reversible; anonymous/pre-login events are structurally
untaggable regardless of time window).

## Risks / Non-Goals

### Risks
- **[ACCEPT] Historical events (including the 14 `login_complete` already recorded) stay
  untagged**, and — per the corrected Appetite — an already-signed-in user's People profile only
  picks up `is_internal` at their *next fresh login*, not on ordinary persisted-session page loads.
  Acceptable — the goal is to stop the problem recurring, not rewrite history, and the founder will
  naturally re-authenticate periodically.
- **[MITIGATE] A misclassified real customer (a `@claritypledge.com` address given to a design
  partner, certifier, or future employee) is silently and permanently excluded from every funnel.**
  Mitigation: `isInternalAccount()` logs a production console warning specifically when the domain
  branch (not `is_test_account`) is what matched, and `docs/technical/analytics.md` carries an
  explicit caveat — but there is no automated alert, only a discoverable log line.
- **[MITIGATE] An unprovisioned or un-redeployed `VITE_INTERNAL_ACCOUNT_EMAIL_HASHES` fails
  completely silently otherwise** (ships green, tags nothing for non-domain accounts, forever).
  Mitigation: a production console warning when the var is unset; the Pre-deploy Checklist's
  post-deploy verification step is the only check that closes this for real.
- **[ACCEPT] Anonymous/pre-login events (the actual widest part of the funnel — e.g. the 252
  `/signup` pageviews in this spec's own Problem section) can never carry `is_internal`,** in any
  time window, because it's a People property requiring `identify()` first. This spec narrows the
  *post-login* signal only; it does not and cannot make the top of the funnel attributable.
- **[ACCEPT] This does not fix or investigate why zero real customers converted** — that's a
  separate, larger question (tracked elsewhere in this session's conversation, not this spec).
  This spec only stops internal activity from masquerading as customer activity in the numbers.

### Non-Goals
- Do NOT add a new database column (e.g. `profiles.is_internal`) — use the existing
  `is_test_account` flag, a `@claritypledge.com` domain check, and a hashed-email allowlist for
  non-domain internal accounts (the founder's own login). A schema-level flag is future work if
  more accounts accumulate.
- Do NOT put any plaintext personal email address in source, in a committed file, OR in a `VITE_*`
  env var (the last one ships to the public bundle — this is the corrected version of the original
  constraint, see Solution). Hash it, or use the domain check.
- Do NOT re-add a `setUserProperties({ is_internal })` call in `AuthContext.tsx`'s session-restore
  path — removed deliberately (untrusted `profiles.email` input + redundant given People-property
  persistence). If a future spec needs it back, it must read the session's authenticated email, not
  the profile row's.
- Do NOT change any auth flow, RLS policy, or other user-facing behavior.
- Do NOT attempt to retroactively tag or delete historical Mixpanel events.
- Do NOT investigate or fix the underlying signup-conversion problem (why 252→11→0) — that is
  separate, ongoing work.
- Do NOT touch `features/p1124_agent_operator_is_a_real_profile.md` or any P1104 agent-account
  code — this spec is about analytics tagging only, unrelated to that schema work.

## Pre-deploy Checklist

### Secrets to provision
- [ ] `VITE_INTERNAL_ACCOUNT_EMAIL_HASHES` — comma-separated SHA-256 hex digests (lowercase,
      gmail-family-canonicalized) of non-`@claritypledge.com` internal emails. Generate with
      `echo -n "someone@example.com" | shasum -a 256`. **Never the plaintext address** — this var
      ships to the public bundle. `vercel env add VITE_INTERNAL_ACCOUNT_EMAIL_HASHES production`

### Deploy commands
- [ ] Trigger Vercel redeploy (VITE_* vars baked at build time — redeploy required)

### Post-deploy verification
- [ ] Smoke test: log in with the founder's own account in prod (a fresh magic-link/OAuth
      completion, not just an already-persisted session), confirm `is_internal: true` on the
      Mixpanel People profile
- [ ] Confirm no `[P1133] VITE_INTERNAL_ACCOUNT_EMAIL_HASHES is unset` warning appears in the
      browser console on that login
- [ ] `curl` the deployed bundle and confirm the digest, not any plaintext email, is what's present:
      `curl -s https://claritypledge.com/assets/index-*.js | grep -c "@"` should show no email-shaped
      string beyond `@claritypledge.com`

### Alternatives Considered
- **Filter internal accounts inside Mixpanel dashboards/saved reports instead of at the
  instrumentation layer.** Rejected as the sole fix: it only protects reports someone remembers to
  add the filter to — the exact failure mode that caused this session's wrong conclusion (an
  ad-hoc query with no filter). Tagging at write time makes the correct default the easy path.
- **New `profiles.is_internal` database column.** Rejected for this pass — one known non-test
  account doesn't justify a migration; revisit if a second or third internal/service account shows
  up.

## Done-When

- [x] `analytics.setUserProperties()` includes `is_internal: true|false` for every identified user
      at `AuthCallbackPage.tsx`, computed from `isTestAccount` OR `@claritypledge.com` domain OR a
      hashed match in `VITE_INTERNAL_ACCOUNT_EMAIL_HASHES` — NOT re-set at session restore
      (`AuthContext.tsx`), deliberately (see Solution)
- [x] `VITE_INTERNAL_ACCOUNT_EMAIL_HASHES` holds hashes, never plaintext emails — confirmed no
      plaintext email exists in any source file, test fixture, or `.env.example`
- [x] gmail.com/googlemail.com aliases (`+tag`, dots, domain variant) canonicalize to the same hash
      before comparison — covered by a unit test
- [x] `Profile.isTestAccount` is plumbed through from `DbProfile.is_test_account` via
      `mapProfileFromDb()` — verified with a unit test, not just read — including on the `/live`
      account-migration path in `AuthCallbackPage.tsx`
- [x] `isInternalAccount()` is a single named, exported, async helper in `src/lib/mixpanel.ts` with
      a comment pointing future internal/service-account creators to the domain check or the hashed
      env var
- [x] A production console warning fires when `VITE_INTERNAL_ACCOUNT_EMAIL_HASHES` is unset, and a
      separate one when the domain branch (not `is_test_account`) is what classified an account
      internal
- [x] The new analytics block cannot block or strand the calling auth flow on any failure — wrapped
      in a detached, try/caught async IIFE
- [ ] Verified in Mixpanel live view: a fresh login (not a persisted-session page load) from the
      founder's own account shows `is_internal: true` on the People profile
- [ ] Verified: `curl`-ing the deployed prod bundle does not contain the founder's plaintext email
- [x] `docs/technical/analytics.md` notes the `is_internal` property and its three coverage gaps
      (anonymous events untaggable, People-property persistence/non-reversibility, silent
      domain-branch misclassification risk)
