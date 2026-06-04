---
status: all-done
type: bug
rank: 1000776.0
severity: high
workstream: infra
date_reported: '2026-06-04'
created_date: '2026-06-04'
completed_at: '2026-06-05'
tags: [auth, rls, grants, deploy, p877, incident]
pipeline_ran: [create-bug, reproduce, fix]
date_resolved: '2026-06-05'
resolution: "Coordinated rollout executed main-direct in one session: pushed main (P877 RPC frontend deployed + verified), updated prod-smoke-test.mjs (column whitelist + 403 canary), re-applied the gate as new migration 20260605002428 (section 3 of P877 + requires-frontend marker — first live pass of the P887 gates), prod smoke 8/8, canary S1–S6 green, grants drift-free"
reproduce_artifact:
  test_file: e2e/p886-reproduce.spec.ts
  root_cause: "Emergency mitigation re-granted table-level SELECT on profiles to anon+authenticated (untracked drift); migration 20260602160000 is already recorded in prod schema_migrations so the P877 gate never re-applies by itself; P877 sections 1-2 (RPC accessors + EXECUTE grants) remain LIVE on prod — only section 3 (REVOKE + column GRANT) needs re-applying as a NEW migration, after the unpushed RPC frontend (529544d8) deploys"
  confidence: high
  surfaces_in_scope: [prod-column-gate-new-migration, prod-smoke-test-select-star-whitelist, prod-smoke-test-403-canary, frontend-push-529544d8]
  surfaces_deferred: []
  reproduced_at: 2026-06-05
---

# P886: Re-apply P877 profiles column gate after coordinated frontend deploy (incident follow-up)

## Summary

On 2026-06-04 19:46 (+07), a backend-only P858 ship ran `./scripts/migrate.sh --env prod`, which swept in the **pending** P877 migration (`20260602160000_p877_profiles_pii_column_grants.sql`). That migration revokes table-level SELECT on `profiles` from `anon`/`authenticated` and is **client-breaking**: it requires the P877 RPC-based frontend (`529544d8`), which was committed locally but never pushed. Prod ran old bundle + new grants → every login/signup/profile read returned **403 "permission denied for table profiles"** for ~1.5h (first user hit 20:03; emergency mitigation ~21:15).

Emergency mitigation re-granted table-level SELECT (`GRANT SELECT ON public.profiles TO anon, authenticated;` via Management API). Auth is restored, but:

1. **The P877 PII exposure is re-open** — `email`, `linkedin_url`, `reason` are again bulk-readable via the public anon key (the pre-P877 state).
2. **Prod DB is in untracked drift** — the manual GRANT is not represented in any migration file, and version `20260602160000` is already recorded in `supabase_migrations.schema_migrations`, so the gate will **never re-apply by itself**.
3. The P877 frontend is still unpushed (local main is ~26 commits ahead of origin/main).

This spec is the coordinated rollout that closes all three.

## Incident timeline (2026-06-04, +07)

| Time | Event |
|---|---|
| Jun 2 | P877 closed: migration applied to TEST, client code committed locally, prod rollout deliberately deferred (migration + frontend must ship together) |
| 19:46 | P858 ship runs `migrate.sh --env prod` → applies P858 migrations **+ pending P877 grants** (stamp commit `88d14a48`, "synced p877 grants") |
| 19:46–21:15 | All prod logins/signups/profile reads 403. No smoke test ran (see P887) |
| 20:03 | First user impact: letter recipient completes response flow (data saved fine), hits "Error creating profile" on the post-submit login step |
| 20:58 | Reproduced on founder login; console: `permission denied for table profiles` |
| ~21:15 | Mitigation: table-level `GRANT SELECT` restored via Management API; direct REST select with anon key verified HTTP 200 |

## Root Cause

Client-breaking DB migration deployed without its coupled frontend. `migrate.sh` applies ALL pending migrations; P877's migration sat pending-on-prod as a landmine for the next backend ship. Pipeline gaps are filed separately as **P887** (shipped 2026-06-05 — prod migrate now gated by pending-ack + coupling block + mandatory smoke).

**Confirmed by /reproduce (2026-06-05, all probes read-only against prod):**

- anon `select=email|linkedin_url|reason` → HTTP 200, **all 59 profile rows** exposed (`content-range: 0-58/59`)
- The authenticated role is equally exposed: prod test agent read another user's `email` → HTTP 200
- P877 RPC accessors (migration sections 1–2) are **LIVE on prod** (`get_featured_profiles`, `email_exists` → 200) — only section 3 (REVOKE + column GRANT) was rolled back by the mitigation, so the new migration needs section 3 only
- `20260602160000` is the last entry in the prod deploy manifest, and P887's zero-pending gate-validation migrate (`5a3e71ec`) confirms nothing is pending — the gate cannot return without a NEW migration file
- Canary: `e2e/p886-reproduce.spec.ts` (`VERIFY_PROD=1`-gated; skips in CI/pre-commit). S1–S4 FAIL now; S5 (over-revoke guard) + S6 (RPC-live guard) pass and must keep passing after the fix
- **Sequencing constraint for /fix:** do NOT add the 403 canary to `prod-smoke-test.mjs` before the gate is live — P887 auto-runs that smoke after every prod migrate, so a premature canary would fail co-tenant migrations. Update the smoke test in the same session, between frontend deploy and gate migration, exactly as Fix Approach steps 3–4 order it.

## Expected Behavior

PII column gate active on prod (`email`/`linkedin_url`/`reason` not directly readable via anon/authenticated keys) AND all auth/profile flows working, because the deployed frontend reads via the P877 SECURITY DEFINER RPCs.

## Actual Behavior

Gate rolled back (mitigation); PII directly readable again; frontend with RPC accessors not yet deployed.

## Affected Files

- `supabase/migrations/20260602160000_p877_profiles_pii_column_grants.sql` — section 3 (REVOKE + column GRANT) is the part that was rolled back
- `scripts/prod-smoke-test.mjs` — step 2 queries `profiles` with implicit `select=*`; will 403 once the gate is re-applied (must move to whitelisted columns or the RPC)
- `src/auth/AuthCallbackPage.tsx`, `src/app/data/api.ts` (P877 client changes, commit `529544d8`) — unpushed

## Fix Approach

**Ship note: execute steps 1–6 in ONE session.** This spec (and the repo) is public from the moment of the push in step 1; the gate-off window between push and step 5 must stay minutes wide, not days.

Ordered rollout — each step gates the next:

1. **Push local main** → Vercel deploys the RPC-based frontend (explicit user push, per ship rules).
2. **Verify prod on the new bundle**: login (Google + magic link), signup, public wall, letter response flow; run `node scripts/prod-smoke-test.mjs`.
3. **Update `prod-smoke-test.mjs` for the post-P877 contract**: step 2 selects only whitelisted columns (or calls `get_profile_by_id`); ADD a canary assertion that `select=email` via anon key returns 403 once the gate is live (mirror of `e2e/integration/p877-reproduce.spec.ts`).
4. **Re-apply the gate as a NEW migration** `p886_reapply_p877_column_gate.sql` containing only section 3 of the P877 migration (`REVOKE SELECT ON public.profiles FROM anon, authenticated;` + column-level `GRANT SELECT (…)`). New file because `20260602160000` is already in `schema_migrations`.
5. Apply via `migrate.sh --env prod` (ideally after P887's gate lands), stamp manifest.
6. **Post-migrate verification**: prod smoke test passes; direct `select=email` via anon AND authenticated keys returns 403; login/signup still work end-to-end.

## Execution Routing (decided 2026-06-04)

- **Skill:** `/fix p886` — root cause incident-confirmed; the regression artifact is the smoke-test 403 canary (step 3), which proves the bug class can't silently return.
- **Model:** Opus — live prod mutations, security gate, public-repo timing, single-session constraint.
- **Order:** run AFTER P887 lands, in a dedicated session with the user present (push confirmation + prod-migrate ask are user-gated). P887's new ack + auto-smoke then gate this spec's migration — its first live validation.

## Resolution

**Fixed:** 2026-06-05 (single session, gate-off window: minutes — push → verify → migrate → verify)

**What shipped:**
- `supabase/migrations/20260605002428_p886_reapply_p877_column_gate.sql` — section 3 of P877 only (REVOKE table SELECT + 20-column GRANT), carries `-- requires-frontend: 529544d8`. Applied to test (idempotent, gate was already on) and prod.
- `scripts/prod-smoke-test.mjs` — step 2 whitelisted columns; new step 5 asserts anon `select=email` is denied (the incident-class canary, auto-runs after every prod migrate via P887 gate 3).
- `e2e/integration/20260605002428_p886_reapply_p877_column_gate.spec.ts` — anon + authenticated denial per PII column, over-revoke guard, accessor guard (17 tests green with P877 sibling).
- `e2e/verify-prod-p886-auth.spec.ts` — prod session restore (positive "Log Out" menu assertion) + auth-callback upsert path.

**P887 gates, first live validation:** pending-list enumeration named exactly 1 migration; coupling hard-block verified `529544d8` on origin/main before allowing apply; mandatory post-migrate smoke ran the new canary (8/8).

**Commits (main-direct, user-approved):** `83c9cab2` fix batch · `5c43fdf8` prod manifest stamp · `c7cb5e72` prod auth verification · `6ba7ba11` review fixes (0 HIGH / 4 MEDIUM, all applied).

## Acceptance Criteria

- [x] P877 frontend deployed to prod (origin/main includes `529544d8`) — pushed; Vercel READY on `41ab2875`; all 7 P877 accessors confirmed in the deployed bundle (main + lazy agreements chunk)
- [x] New tracked migration re-applies the column gate; prod `information_schema.role_table_grants` shows NO table-level SELECT on `profiles` for anon/authenticated — `20260605002428` applied; introspection query returned `[]`
- [x] Direct `GET /rest/v1/profiles?select=email` with anon key → 403 (canary in smoke test) — smoke step 5 passing; prod canary S1–S4 flipped to green
- [x] `node scripts/prod-smoke-test.mjs` passes against prod with the gate active — 8/8 via the P887 post-migrate gate
- [x] Login (Google + magic link), signup, and letter response flows verified working on prod — machine-verified: password login, session restore + authenticated menu (`e2e/verify-prod-p886-auth.spec.ts` A), auth-callback profile upsert/read (the incident's "Error creating profile" step, test B), and signup's DB path (same `upsert_my_profile` RPC, always-upsert). Founder-verified live (2026-06-05): fresh Google OAuth login ✓, magic-link login from email ✓
- [x] No untracked grant drift: prod grants state reproducible from migration files alone — column grants exactly match the migration whitelist (20 columns × anon/authenticated; email/linkedin_url/reason absent)
