---
status: done
type: bug
rank: 1000779.0
severity: medium
workstream: infra
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [deploy-pipeline, smoke-test, ship, process]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
date_resolved: '2026-06-05'
resolution: "ship.md step 6c now runs scripts/prod-smoke-test.mjs after the public smoke on every confirmed push; any non-zero exit routes to step d (rollback/fix-forward/triage); failure path verified live (bad password → exit 1), pass path verified 8/8; public-smoke-only outer fallback unchanged"
completed_at: '2026-06-05'
---

# P889: Push-path prod watch never runs the authenticated smoke — auth regressions ship undetected

## Summary

`/ship` step 6 (P866 post-push prod-health watch) runs only `e2e/prod-health-smoke.spec.ts`, which is public-routes-only by design (its own header: "auth/token-gated out of scope"). The authenticated DB smoke `scripts/prod-smoke-test.mjs` (login → profile read → story INSERT/SELECT/DELETE → anon access) has no automated trigger on the push path — a prod-config-specific auth regression in a frontend deploy ships undetected.

## Root Cause

P866 wired the push-path watch to the public smoke; the authenticated smoke predates it and is invoked only by the manual `/day` checklist. decisions.md mandates "run after any deployment touching stories, auth, or RLS" — but that is prose, not enforcement (same gap class as P887). Found during P887 `/reproduce` scenario audit (2026-06-04).

## Reproduction Steps

1. Introduce an auth-affecting prod-config regression that pre-merge e2e cannot see — e.g. a stale/rotated `VITE_SUPABASE_*` value in Vercel prod env (VITE vars are baked at build time), or client code reading a column/RPC present on test but not prod
2. Run `/ship` and confirm the push; the watch waits for the deploy to be READY
3. `npm run smoke:prod` passes — it only loads public routes and never signs in
4. Observe: every authenticated flow on prod is broken; nothing automated notices until the next manual `/day` run or an end-user report

**Reproduction rate:** 100% for this failure class (structural — the auth path is simply never exercised)

## Expected Behavior

After a confirmed push and READY deploy, the watch runs BOTH smokes: `npm run smoke:prod` (public routes) and `node scripts/prod-smoke-test.mjs` (authenticated DB path). A failure of either surfaces the same rollback / fix-forward / triage options.

## Actual Behavior

Only the public-routes smoke runs. The authenticated path is verified manually at best (next `/day`), reactively at worst (user report — the P886 detection mode).

## Affected Files

- `.claude/commands/slava/build/ship.md` — step 6 post-push watch: add authenticated smoke after the public smoke
- `scripts/prod-smoke-test.mjs` — must be green under the post-P877 column gate first (P886 step 3 is the prerequisite)
- `e2e/prod-health-smoke.spec.ts` — header documents the public-only scope this spec closes the gap around

## Severity

**Medium** — latent detection gap, not an active breakage. Blast radius when triggered is high (auth down for all users), but the trigger class is rarer than P887's: compensating controls are pre-merge e2e (catches code regressions) and the daily `/day` smoke (bounds detection to ~24h).

## Fix Approach

Add `node scripts/prod-smoke-test.mjs` to `/ship` step 6, immediately after the public smoke passes, with the same on-fail option set (rollback / fix-forward / triage). Note: the script writes and deletes a test story on prod per run via the persistent smoke account — accepted, it already runs daily via `/day`. Blocked by P886 step 3 (smoke must stay green under the column gate).

## Acceptance Criteria

- [x] `/ship` step 6 runs `node scripts/prod-smoke-test.mjs` after the public smoke on every confirmed push
- [x] A simulated auth failure (e.g. invalid smoke-account password) during the watch surfaces the rollback / fix-forward / triage options — not a silent pass (verified 2026-06-05: `PROD_TEST_AGENT_PASSWORD=wrong` → exit 1 → step d options per ship.md step 6c)
- [x] `ship.md` documents the second smoke as part of the watch
- [x] Public-smoke-only fallback behavior (older checkouts, missing spec file) is unchanged
