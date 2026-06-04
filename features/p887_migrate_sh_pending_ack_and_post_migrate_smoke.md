---
status: qa
type: bug
rank: 1000777.0
severity: high
workstream: infra
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [deploy-pipeline, migrate, smoke-test, process, incident]
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p887-reproduce.test.ts
  root_cause: "migrate.sh prod path (Management API loop) applies every pending migration with no upfront list, no ack prompt, no --yes flag, and never invokes prod-smoke-test.mjs after apply; the only smoke enforcement is wired to the push path (/ship step 6), which a DB-only deploy never reaches"
  confidence: high
  surfaces_in_scope: [migrate.sh-prod-ack, migrate.sh-post-migrate-smoke, ship.md-doc-sync]
  surfaces_deferred: [P889, P890]
  reproduced_at: 2026-06-04
date_resolved: '2026-06-04'
root_cause: "migrate.sh prod path had no pending-list ack, no frontend-coupling gate, and no post-migrate smoke; the only smoke enforcement was wired to the push path, which DB-only deploys never reach"
resolution: "three prod gates in migrate.sh (pending-list ack via y/N or --yes; requires-frontend coupling hard-block; mandatory post-migrate smoke with loud non-zero failure) + pre-commit annotation gate for client-breaking migrations (check-migration-client-safety.sh) + migrate.sh canary wired into pre-commit + ship.md doc sync"
---

# P887: migrate.sh silently sweeps pending migrations and prod migrate has no smoke gate

## Summary

The 2026-06-04 auth outage (see P886) was caused by two pipeline gaps acting together:

1. **`migrate.sh --env prod` applies ALL pending migrations silently.** A P858 backend ship swept in P877's client-breaking grants migration that had been deliberately held back waiting for its frontend. The operator never saw an upfront list of what was about to be applied — only per-file "✓ applied" lines as they landed. The /ship ASK gate ("Migrate prod now? y/n") doesn't enumerate pending migrations either.
2. **The prod smoke test is wired to the push path only.** `/ship` step 6 (P866 prod-health watch) triggers smoke after a confirmed `git push`. A DB-only deploy — exactly where old-client-vs-new-schema breakage appears — never triggers it. `prod-smoke-test.mjs`'s own doc says "run after any deployment touching stories, auth, or RLS", and decisions.md (2026-xx P-smoke entry) mandates the same, but it's prose, not enforcement.

`prod-smoke-test.mjs` step 2 (`GET /rest/v1/profiles?id=eq.<uid>`, implicit `select=*`) would have returned the exact 403 within seconds of the migrate. It never ran. Outage lasted ~1.5h and was detected by an end user.

## Root Cause

**CONFIRMED via /reproduce (hermetic sandbox replay, 100% reproduction).** Smoke enforcement is attached to the wrong trigger (push, not prod mutation), and prod migrate gives no pre-apply visibility of what's pending. Both are `migrate.sh` design gaps, not operator error — the 19:46 session followed the documented flow.

**Evidence:** Static — `migrate.sh` contains zero ack/confirm/`--yes`/smoke tokens (the only "ack" greps are the substring of "Fallback" in comments); repo-wide, `prod-smoke-test.mjs` is invoked only by the manual `/day` checklist. Dynamic — a sandboxed run of the real script (`--env prod`, stubbed curl/security on PATH, one pending migration simulating the held-back P877 gate, stdin closed) applied the pending file silently and exited 0; the smoke stub never executed.

**Canary (resolved):** `src/tests/p887-reproduce.test.ts` — 7 scenarios, all plain `it()` regression guards since the fix: A (no-ack refusal + upfront pending list, computed from remote state), B (`--yes`, reversed flag order → apply → auto-smoke), C (smoke failure → non-zero exit + loud banner), D (test-env unchanged), E (zero pending → no ack, smoke still runs), F (`-- requires-frontend:` sha undeployed → hard-block, `--yes` does not bypass), G (sha deployed → coupling OK, applies + smoke). Hermetic tmpdir sandbox with stub `curl`/`git`/`security`/`npx`. Wired into pre-commit (section 4.7c) whenever `migrate.sh`, the canary, or `check-migration-client-safety.sh` is staged. Originally written by `/reproduce` with A–C under `it.fails` (suite stayed green while the bug was open); `/fix` converted them after both gates landed.

**Scenario audit (prod-mutation paths):** in scope here — `migrate.sh` prod path only. Deferred with tickets: P889 (push-path watch never runs the authenticated smoke), P890 (edge-function deploys have no post-deploy smoke). Accepted as process: ad-hoc Management API SQL (ungateable by script; compensating controls are `/day` + this fix).

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
4. **Coupling marker (REQUIRED — this is the actual prevention, items 1–2 are visibility + detection):** a `-- requires-frontend: <commit-sha>` header for client-breaking migrations. `migrate.sh --env prod` greps each pending file and **hard-blocks** (not warns) when the referenced commit is not an ancestor of `origin/main` — i.e., the coupled frontend is not deployed. Replaying P886's scenario: the P877 migration would have carried `-- requires-frontend: 529544d8` and the P858 migrate would have refused to apply it.
5. **Pre-commit gate so the marker can't be forgotten:** a check (existing canary pattern) that flags newly staged migrations containing client-breaking shapes — `REVOKE … FROM anon|authenticated`, `DROP POLICY`, `ALTER TABLE … DROP COLUMN`, column type changes — and requires either a `-- requires-frontend:` marker or an explicit `-- client-safe: <reason>` annotation. Keyword list is best-effort, not exhaustive (e.g., a column rename is client-breaking but looks innocuous) — the post-migrate smoke (item 2) remains the backstop for the unenumerable cases.

## Execution Routing (decided 2026-06-04)

- **Skill:** `/fix p887` — root cause is incident-confirmed (see P886 timeline + this spec's Root Cause); `/reproduce` is redundant, skip it.
- **Model:** Opus — `migrate.sh` has a history of subtle traps (keychain-first PAT shadowing, HTTP 201 pre-flight, P417 200-with-error-body); a wrong gate recreates outages.
- **Order:** run BEFORE P886, in its own session. P886's gate migration then becomes the first live validation of this gate. Sequential also avoids a `prod-smoke-test.mjs` collision (this spec adds the auto-run hook; P886 rewrites step 2 + adds the 403 canary).
- **Regression artifact:** script canary in pre-commit (existing pattern: worktree-setup/git-ops/typecheck-gate canaries) asserting pending-list ack + post-migrate smoke hook.

## Acceptance Criteria

- [x] `migrate.sh --env prod` prints the full pending-migration list and refuses to proceed without explicit ack (interactive y/N or `--yes`) — canary scenario A
- [x] Successful prod migrate auto-runs `prod-smoke-test.mjs`; failure exits non-zero with actionable message — canary scenarios B + C ("PROD SMOKE FAILED AFTER MIGRATE" banner)
- [x] Replay of the P886 scenario (pending grants migration + backend-only migrate) is caught: operator sees `20260602160000_p877_…` named in the list before apply, and smoke fails loudly if applied anyway — canary A names exactly that fixture; C proves the loud failure
- [x] A pending migration with `-- requires-frontend: <sha>` whose sha is NOT on `origin/main` hard-blocks the prod apply (mechanical prevention — the P886 replay refuses before any SQL runs) — canary scenario F (`--yes` does not bypass); G covers the deployed-sha pass-through
- [x] Pre-commit flags a staged migration containing client-breaking shapes without a `requires-frontend` or `client-safe` annotation — `scripts/check-migration-client-safety.sh` + pre-commit section 14.9; verified against violating/annotated/benign fixtures
- [x] `ship.md` documents all gates — committed on main (`fb9ca30a`, `5f4a0295`; skill files must live on main per `.claude/rules/skills.md`)
- [x] Test-env (`migrate.sh` without `--env prod`) behavior unchanged — canary scenario D

## Resolution

**Fixed:** three runtime gates in `scripts/migrate.sh` prod path + one authoring-time gate in pre-commit.

**Files changed (feature branch `feature/p887-migrate-ack-smoke`):**
- `scripts/migrate.sh` — while/case arg parsing (`--yes`, order-independent); prod gate 1: pending-list enumeration + ack (interactive y/N, `--yes` non-interactive, refuse with exit 1 otherwise); prod gate 2: `-- requires-frontend: <sha>` coupling hard-block via `git merge-base --is-ancestor <sha> origin/main` (fail-safe: malformed marker or git failure blocks; `--yes` does not bypass); prod gate 3: mandatory `node scripts/prod-smoke-test.mjs` after manifest stamp, loud banner + exit 1 on failure
- `scripts/check-migration-client-safety.sh` — NEW: standalone checker for client-breaking SQL shapes lacking `requires-frontend`/`client-safe` annotations
- `scripts/pre-commit-checks.sh` — section 14.9 (annotation gate on newly staged migrations) + section 4.7c (runs the P887 canary when migrate.sh/checker/canary staged)
- `src/tests/p887-reproduce.test.ts` — 7-scenario hermetic regression canary (see Root Cause)

**On main already:** `.claude/commands/slava/build/ship.md` (`fb9ca30a`, `5f4a0295`) — documents all gates; doc intentionally landed ahead of behavior (skill-file branch guard), reconciled when this branch ships.

**Regression test:** `src/tests/p887-reproduce.test.ts` (runs in `npm test` and via pre-commit 4.7c).
