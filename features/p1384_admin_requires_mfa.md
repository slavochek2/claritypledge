---
status: week
type: task
rank: 15
workstream: infrastructure
created_date: '2026-10-01'
tags: [admin, auth, mfa, security]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1384: Admin access requires a second factor (MFA, AAL2)

## Problem

**Situation:** Every admin-only RPC calls `public.assert_admin()` (P1381), which checks `profiles.is_admin` for `auth.uid()`. The first consumer, `/admin/users`, returns every user's login email, LinkedIn and last-login time. Sign-in is a single factor: a magic link or Google.
**Complication:** One leaked sign-in link, a stolen session token, or a compromised Google account gives full admin read access, and every future admin feature inherits the same single gate. The P1381 adversarial review flagged it (Opus, MEDIUM), and decisions.md 2026-10-01 records it as the open follow-up.
**Question:** Require the admin's session to be AAL2 (password-less first factor plus a verified second factor) inside `assert_admin()`, so a single stolen credential is no longer enough.

> Founder framing, verbatim (P1381 session): "make sure i am the only one accesisng despite obviosuly our code being open source", "relating to this feature but also to future features that will be reserved only to me or some users with admin privilages".

## Appetite

Blast radius: medium. Every admin surface depends on `assert_admin()`; a wrong check locks the founder out of all of them (never other users, who never pass the gate anyway). Reversibility: high. One function body, revertible by migration, and the founder keeps service-role DB access as the break-glass path. Decision density: five founder calls (below): factor type, enrollment location, recovery path, re-verify interval, and how the verify step is reached.

## Invariants

- The second-factor check lives **inside `assert_admin()`**, on the session's `aal` claim, never in the client. The repo is public; a client-side check is decoration (decisions.md 2026-10-01, P1381).
- It **fails closed**: a missing or unreadable `aal` claim means not admin.
- `assert_admin()` keeps its contract: first statement of every admin RPC, RAISE `42501` with a generic message, not client-executable (P1381 migration `20261001153000`).
- Non-admin **sign-in** is unchanged: no prompt and no new step. (Enabling MFA on the project makes factor enrollment reachable by any signed-in user through the Auth API; that is acceptable only because an enrolled factor grants nothing without `is_admin`.)
- **The admin's factor is pinned.** `assert_admin()` accepts aal2 only from the factor id(s) recorded for the admin in a row only service-role can write, never from "any verified factor". Otherwise a stolen first factor could enroll an attacker's own authenticator and reach aal2 (P1384 review F1).
- Fail-closed has one consequence by design: service-role scripts and cron cannot call admin RPCs (they carry no `aal`). Break-glass access is direct SQL as service role, never an RPC. No such callers exist today (grep of `scripts/`, `supabase/functions` for `admin_list_users`, 2026-10-01).
- `is_admin` stays unreadable by clients. An MFA prompt must not reveal to a non-admin that an admin surface exists (decisions.md 2026-08-18 on the P877 grant list; P1381 renders NotFound on any error).

## Solution

1. `assert_admin()` additionally requires the caller's JWT `aal` claim to equal `aal2`, satisfied by the **pinned** admin factor (Invariants), and a **recent** second-factor verification: the MFA entry in the JWT `amr` claim is younger than N hours. Not `iat`, which resets on every token refresh. Same RAISE, same code. [FOUNDER DECISION: N, how often the admin re-verifies the code; e.g. 12h.] This bounds a stolen aal2 refresh token, which otherwise mints aal2 access tokens until sign-out (refresh-token rotation is on, `config.toml:165`; no session timebox is set, `:256-260`). A hosted session timebox is an acceptable substitute if the `amr` check proves unworkable.
2. Second-factor enrollment and verification for the admin, using Supabase Auth MFA. **The founder's factor is enrolled and its id pinned BEFORE the gate migration applies on each environment** (test first, then prod), so there is never a window where the gate is live and no admin factor exists, and no window where an attacker could enroll first. [FOUNDER DECISION: factor type. TOTP authenticator app (simplest, offline), or passkey/WebAuthn (phishing-resistant, newer in Supabase Auth). Surface both, do not default silently.]
3. `/admin/*` pages: the verify-code step must not depend on "this session has an enrolled factor", because any user can enroll one (Invariants). Either a server-side check returns "admin, needs aal2" only to the admin, or there is a fixed verify route the founder opens directly and `/admin/*` keeps rendering NotFound for every error. Non-admins must learn nothing either way. [FOUNDER DECISION: server-side "needs aal2" signal, or a fixed verify route.] [FOUNDER DECISION: where enrollment lives. A hidden `/admin/security` page, or a one-time setup done by script/dashboard with no UI.]
4. Recovery path if the factor is lost. [FOUNDER DECISION: backup codes, a second enrolled factor, or service-role reset by hand only.]

Before building: confirm MFA (TOTP and/or WebAuthn) is enabled on the **hosted** test and prod projects and available on the current plan. Local `supabase/config.toml` has `[auth.mfa.totp] enroll_enabled = false`, and its comment says MFA needs the Pro plan; both UNVERIFIED for hosted.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Founder locked out of admin surfaces (factor lost, bad check) | MITIGATE | Recovery path decided up front (Solution 4); service-role SQL stays the break-glass |
| An MFA prompt on `/admin/*` tells a non-admin the route is special | MITIGATE | Prompt only when the session already has an enrolled factor; everyone else gets NotFound (Invariants) |
| `aal` claim read wrongly (e.g. from a stale JWT after verifying) | MITIGATE | Integration test: aal1 session refused, aal2 session served, on test |
| Plan/feature not available on hosted Supabase | DEFER | Unblocked by the pre-build check in Solution |
| A stolen aal2 refresh token keeps minting aal2 tokens until sign-out | MITIGATE | Recency check on the `amr` MFA time (Solution 1). Without it this spec would NOT close the session-theft path its Problem names |
| A stolen first factor enrolls the attacker's own factor and reaches aal2 | MITIGATE | Pinned factor id + enroll-before-gate ordering (Invariants, Solution 2) |
| Gate reaches prod before the founder's prod factor exists: lockout | MITIGATE | Done-When ordering box; `migrate.sh --env prod` runs only after it is ticked |
| GoTrue behaviour assumed above (aal1 may enroll a first factor; aal1 cannot add a second; `amr` carries the MFA time; aal survives refresh) | MITIGATE | UNVERIFIED in-repo. From the review's knowledge of Supabase Auth, not a test. First implementation task: verify each on test and record the result here |

**Non-Goals**
- Do NOT require MFA for non-admin users or add it to normal sign-in.
- Do NOT change `/admin/users` features, columns or layout.
- Do NOT relax `unique_admin` or add more admins here.
- Do NOT move the gate out of `assert_admin()` into per-RPC checks.

## Alternatives Considered

- **Client-side MFA prompt only.** Rejected: bypassable by calling the RPC directly with a single-factor token.
- **IP allowlist for admin RPCs.** Rejected: the founder travels; a VPN/residential IP changes constantly, and Postgres functions don't see the client IP reliably through PostgREST.
- **Session timebox / re-auth recency alone, no second factor.** Cheaper, and it bounds a stolen session, but it does nothing against a stolen magic link used within the window. Kept as a component (Solution 1), not a replacement.
- **Do nothing; rely on Google account 2FA.** Rejected as sufficient on its own: magic-link sign-in bypasses Google entirely, so Google's 2FA protects only one of the two sign-in paths.

## Rollback Strategy

Re-apply the P1381 body of `assert_admin()` (no `aal` check) via a migration. Service-role SQL access is unaffected by either version, so the founder can always reach data while rolling back.

## Done-When

- [ ] Founder decisions recorded: factor type, enrollment location, recovery path
- [ ] MFA availability confirmed on hosted test and prod projects (setting + plan), recorded here
- [ ] Each assumed GoTrue behaviour (Risks, last row) verified on test, with the command and its output recorded here
- [ ] The admin has exactly the expected pinned, verified factor(s) on test, shown by a query. The same holds on prod **before** the gate migration is applied there, recorded with its query output; the prod apply is ordered after this box
- [ ] On **test**: an admin session at aal1 calling `admin_list_users` gets `42501` and no rows; the same admin at aal2 (pinned factor, recent verification) gets the list; an aal2 session whose MFA verification is older than N gets `42501`. Integration test in `src/tests/integration/`. `[post-deploy]` re-verify on prod.
- [ ] On **test**: an aal1 session cannot enroll an additional factor for the admin, and a factor that is not the pinned one never satisfies the gate (integration test)
- [ ] On **test**: a non-admin at aal2 still gets `42501` (MFA does not grant admin)
- [ ] A non-admin visiting `/admin/users` sees NotFound and no MFA prompt, **including a non-admin who has enrolled a factor of their own** (E2E)
- [ ] The founder enrolls a factor, signs in, verifies, and reaches `/admin/users` on test
- [ ] The recovery path is exercised once on test, with the exact commands and their output recorded here
- [ ] `docs/technical/database.md` § Admin-only RPCs states the AAL2 requirement

## Related

- [P1381](done/2026-06-10/p1381_admin_users_lookup.md): `assert_admin()` and `/admin/users`
- decisions.md 2026-10-01 [technical] "Admin-only surfaces are gated by one DB function" (this is its proposed follow-up)
- decisions.md 2026-08-18 [technical]: `is_admin` is deliberately outside the P877 client read grants
