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

Blast radius: medium. Every admin surface depends on `assert_admin()`; a wrong check locks the founder out of all of them (never other users, who never pass the gate anyway). Reversibility: high. One function body, revertible by migration, and the founder keeps service-role DB access as the break-glass path. Decision density: three founder calls (below).

## Invariants

- The second-factor check lives **inside `assert_admin()`**, on the session's `aal` claim, never in the client. The repo is public; a client-side check is decoration (decisions.md 2026-10-01, P1381).
- It **fails closed**: a missing or unreadable `aal` claim means not admin.
- `assert_admin()` keeps its contract: first statement of every admin RPC, RAISE `42501` with a generic message, not client-executable (P1381 migration `20261001153000`).
- Non-admin users see no change at all: no prompt, no enrollment, no new step in their sign-in.
- `is_admin` stays unreadable by clients. An MFA prompt must not reveal to a non-admin that an admin surface exists (decisions.md 2026-08-18 on the P877 grant list; P1381 renders NotFound on any error).

## Solution

1. `assert_admin()` additionally requires the caller's JWT `aal` claim to equal `aal2`. Same RAISE, same code.
2. Second-factor enrollment and verification for the admin, using Supabase Auth MFA. [FOUNDER DECISION: factor type. TOTP authenticator app (simplest, offline), or passkey/WebAuthn (phishing-resistant, newer in Supabase Auth). Surface both, do not default silently.]
3. `/admin/*` pages: when the admin RPC fails AND the signed-in session is aal1 with an enrolled factor, show the verify-code step instead of NotFound; after verifying, retry. Everyone else still gets NotFound, so non-admins learn nothing. [FOUNDER DECISION: where enrollment lives. A hidden `/admin/security` page, or a one-time setup done by script/dashboard with no UI.]
4. Recovery path if the factor is lost. [FOUNDER DECISION: backup codes, a second enrolled factor, or service-role reset by hand only.]

Before building: confirm MFA (TOTP and/or WebAuthn) is enabled on the **hosted** test and prod projects and available on the current plan. Local `supabase/config.toml` has `[auth.mfa.totp] enroll_enabled = false`, and its comment says MFA needs the Pro plan; both UNVERIFIED for hosted.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Founder locked out of admin surfaces (factor lost, bad check) | MITIGATE | Recovery path decided up front (Solution 4); service-role SQL stays the break-glass |
| An MFA prompt on `/admin/*` tells a non-admin the route is special | MITIGATE | Prompt only when the session already has an enrolled factor; everyone else gets NotFound (Invariants) |
| `aal` claim read wrongly (e.g. from a stale JWT after verifying) | MITIGATE | Integration test: aal1 session refused, aal2 session served, on test |
| Plan/feature not available on hosted Supabase | DEFER | Unblocked by the pre-build check in Solution |
| Session theft AFTER MFA (an aal2 token is stolen) | ACCEPT | Out of scope; AAL2 stops credential theft, not live-session theft. Token lifetime is a separate decision |

**Non-Goals**
- Do NOT require MFA for non-admin users or add it to normal sign-in.
- Do NOT change `/admin/users` features, columns or layout.
- Do NOT relax `unique_admin` or add more admins here.
- Do NOT move the gate out of `assert_admin()` into per-RPC checks.

## Alternatives Considered

- **Client-side MFA prompt only.** Rejected: bypassable by calling the RPC directly with a single-factor token.
- **IP allowlist for admin RPCs.** Rejected: the founder travels; a VPN/residential IP changes constantly, and Postgres functions don't see the client IP reliably through PostgREST.
- **Do nothing; rely on Google account 2FA.** Rejected as sufficient on its own: magic-link sign-in bypasses Google entirely, so Google's 2FA protects only one of the two sign-in paths.

## Rollback Strategy

Re-apply the P1381 body of `assert_admin()` (no `aal` check) via a migration. Service-role SQL access is unaffected by either version, so the founder can always reach data while rolling back.

## Done-When

- [ ] Founder decisions recorded: factor type, enrollment location, recovery path
- [ ] MFA availability confirmed on hosted test and prod projects (setting + plan), recorded here
- [ ] On **test**: an admin session at aal1 calling `admin_list_users` gets `42501` and no rows; the same admin at aal2 gets the list. Integration test in `src/tests/integration/`. `[post-deploy]` re-verify on prod.
- [ ] On **test**: a non-admin at aal2 still gets `42501` (MFA does not grant admin)
- [ ] A non-admin visiting `/admin/users` sees NotFound and no MFA prompt (E2E)
- [ ] The founder enrolls a factor, signs in, verifies, and reaches `/admin/users`; the recovery path is exercised once on test
- [ ] `docs/technical/database.md` § Admin-only RPCs states the AAL2 requirement

## Related

- [P1381](done/2026-06-10/p1381_admin_users_lookup.md): `assert_admin()` and `/admin/users`
- decisions.md 2026-10-01 [technical] "Admin-only surfaces are gated by one DB function" (this is its proposed follow-up)
- decisions.md 2026-08-18 [technical]: `is_admin` is deliberately outside the P877 client read grants
