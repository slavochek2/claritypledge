---
status: week
type: bug
rank: 1000777.0
severity: high
workstream: infra
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [deploy-pipeline, migrate, smoke-test, process, incident]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P887: migrate.sh silently sweeps pending migrations and prod migrate has no smoke gate

## Summary

The 2026-06-04 auth outage (see P886) was caused by two pipeline gaps acting together:

1. **`migrate.sh --env prod` applies ALL pending migrations silently.** A P858 backend ship swept in P877's client-breaking grants migration that had been deliberately held back waiting for its frontend. The operator never saw an upfront list of what was about to be applied — only per-file "✓ applied" lines as they landed. The /ship ASK gate ("Migrate prod now? y/n") doesn't enumerate pending migrations either.
2. **The prod smoke test is wired to the push path only.** `/ship` step 6 (P866 prod-health watch) triggers smoke after a confirmed `git push`. A DB-only deploy — exactly where old-client-vs-new-schema breakage appears — never triggers it. `prod-smoke-test.mjs`'s own doc says "run after any deployment touching stories, auth, or RLS", and decisions.md (2026-xx P-smoke entry) mandates the same, but it's prose, not enforcement.

`prod-smoke-test.mjs` step 2 (`GET /rest/v1/profiles?id=eq.<uid>`, implicit `select=*`) would have returned the exact 403 within seconds of the migrate. It never ran. Outage lasted ~1.5h and was detected by an end user.

## Root Cause

Smoke enforcement is attached to the wrong trigger (push, not prod mutation), and prod migrate gives no pre-apply visibility of what's pending. Both are `migrate.sh` design gaps, not operator error — the 19:46 session followed the documented flow.

## Reproduction Steps

1. Have a client-breaking migration in `supabase/migrations/` applied to TEST but not prod (waiting for its frontend)
2. Ship an unrelated backend feature: run `./scripts/migrate.sh --env prod`
3. Observe: the held-back migration applies with no upfront listing, no ack naming it, and no post-migrate smoke run

**Reproduction rate:** 100% whenever a pending client-breaking migration exists

## Expected Behavior

- Before applying to prod, `migrate.sh` lists every pending migration by filename and requires explicit acknowledgment of that list.
- After any successful prod migrate, the prod smoke test runs automatically and a failure is loud (non-zero exit, clear message, pointer to rollback options).

## Actual Behavior

Pending migrations apply silently in bulk; no smoke verification after DB-only deploys.

## Affected Files

- `scripts/migrate.sh` — prod path (Management API fallback loop): no pending-list ack, no post-migrate smoke hook
- `scripts/prod-smoke-test.mjs` — must stay green under the post-P877 column gate (step 2 `select=*` → whitelist columns; handled in P886 step 3, prerequisite for the auto-run here)
- `.claude/commands/slava/build/ship.md` — "Prod migrate is NOT pre-approved" gate should require the enumerated pending list in the ASK, and document the post-migrate smoke as mandatory

## Severity

**High** — this gap produced a full prod auth outage (P886) and recurs for any future client-breaking migration.

## Fix Approach

1. **Pre-apply ack:** in `migrate.sh --env prod`, after computing pending = local files minus `schema_migrations` versions, print the list and require interactive confirmation (`Apply these N migrations to PROD? [y/N]`). Non-interactive runs require `--yes` (the calling skill must paste the list into its ASK gate).
2. **Post-migrate smoke:** on successful prod apply, run `node scripts/prod-smoke-test.mjs`; on failure exit non-zero with a loud banner ("PROD SMOKE FAILED AFTER MIGRATE — schema may be ahead of deployed clients; consider grant/migration rollback"). Test-env runs skip this.
3. **Doc sync:** update `ship.md` step 3.7 / "After shipping" to reflect both behaviors.
4. **(Optional, discuss at spec-review):** a `-- requires-frontend: <commit-or-pN>` header convention for client-breaking migrations that `migrate.sh` greps and warns on when the referenced commit is not on `origin/main`. Keep out of MVP if it adds friction.

## Acceptance Criteria

- [ ] `migrate.sh --env prod` prints the full pending-migration list and refuses to proceed without explicit ack (interactive y/N or `--yes`)
- [ ] Successful prod migrate auto-runs `prod-smoke-test.mjs`; failure exits non-zero with actionable message
- [ ] Replay of the P886 scenario (pending grants migration + backend-only migrate) is caught: operator sees `20260602160000_p877_…` named in the list before apply, and smoke fails loudly if applied anyway
- [ ] `ship.md` documents both gates
- [ ] Test-env (`migrate.sh` without `--env prod`) behavior unchanged
