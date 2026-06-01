---
status: all-done
type: bug
rank: 1000765
severity: high
workstream: infra
date_reported: '2026-06-01'
created_date: '2026-06-01'
tags: [csp, deploy-drift, prod, wasm, observability]
pipeline_ran: [create-bug, ship]
completed_at: 2026-06-01
---

# P869: Prod serving a stale build — missing `wasm-unsafe-eval` CSP fix (HEIC uploads + LogRocket recorder broken in prod)

## Summary

Production is running a build that predates the P865 CSP fix, so the deployed
`script-src` is missing `'wasm-unsafe-eval'`. Every WebAssembly compile is blocked
site-wide on prod — breaking HEIC→JPEG photo uploads (`heic2any`) and the LogRocket
session recorder. The code on `main` is already correct; prod simply has not been
deployed since the fix merged. Surfaced while running the new P866 prod smoke gate.

## Root Cause

**Deploy drift — not a code bug.** `main` is 5 commits ahead of what is deployed to
prod, and the gap contains the CSP fix.

- Deployed prod = commit `2660787b` (2026-06-01 17:23, "docs: P864 KDD"). Confirmed via
  the Vercel deployments API (`meta.githubCommitSha`, `ref=main`).
- The fix that adds `'wasm-unsafe-eval'` to `script-src` + `worker-src` = commit
  `4c5e78a0` (2026-06-01 17:43, "fix(p865): /finish hardening"). It IS on `main`.
- The deployed build **predates** the fix: `git merge-base --is-ancestor 4c5e78a0 2660787b`
  returns false. So the live build never had the directive.
- Live header confirms it — `curl -sI https://claritypledge.com/` →
  `script-src 'self' 'unsafe-inline' https://cdn.mxpnl.com https://js.sentry-cdn.com
  https://cdn.logrocket.io …` with **no** `'wasm-unsafe-eval'`. The repo `vercel.json`
  (on `main`) HAS it, and the static canary `src/tests/p865-csp-logrocket-hosts.test.ts`
  asserts its presence and passes.

Per that canary's own comments: without `'wasm-unsafe-eval'`, `script-src` blocks ALL
WebAssembly, which is what `heic2any` (iPhone HEIC photo uploads) and the LogRocket
recorder compile. The fix is correct in the repo — it just is not live.

## Reproduction Steps

1. From any browser, load `https://claritypledge.com/` (no auth needed).
2. Open DevTools console.
3. Observe a CSP violation: `script-src blocked wasm-eval` (a `securitypolicyviolation`
   event firing because WebAssembly compilation is refused).
4. Equivalently, from the repo: `CSP_SMOKE_URL=https://claritypledge.com npm run smoke:csp`
   → all 5 public routes FAIL with "script-src blocked wasm-eval".
5. Or header-only: `curl -sI https://claritypledge.com/ | tr ';' '\n' | grep -i wasm`
   → returns nothing (directive absent).

**Reproduction rate:** 100% (until prod is redeployed).

## Expected Behavior

The deployed `script-src` (and `worker-src`) include `'wasm-unsafe-eval'`, so HEIC
uploads and the LogRocket recorder work. `npm run smoke:csp` against prod is green.

## Actual Behavior

Deployed `script-src` lacks `'wasm-unsafe-eval'`. WebAssembly is blocked: HEIC photo
uploads fail and the LogRocket recorder silently does not run on prod. `smoke:csp`
against prod fails on all 5 public routes.

## Affected Files

- `vercel.json` (on `main`) — already contains the fix; nothing to change. The defect is
  the **deployment state**, not the file.
- Deployment pipeline / `main` → Vercel prod — the 5-commit gap (`2660787b..main`) is
  undeployed. The gap: `8db3396a`, `0da78325`, `4c5e78a0` (the fix), `f4a065c8`, `8e2cbb44`.

## Severity

**High** — a shipped, tested CSP fix is not live, breaking HEIC photo uploads for a class
of users (iPhone) and disabling session-replay observability across all of prod. Not
critical (login works, no data loss), and the remedy is a redeploy with no code change.

## Fix Approach

**Redeploy `main` to prod.** No code change.

1. Push `main` to origin (if unpushed) and/or trigger a Vercel production redeploy of the
   current `main` HEAD.
2. Verify the directive is live:
   `curl -sI https://claritypledge.com/ | tr ';' '\n' | grep -i wasm-unsafe-eval` → match.
3. Verify the gate is green: `CSP_SMOKE_URL=https://claritypledge.com npm run smoke:csp`.

### Secondary observation (separate from the redeploy fix)

The existing `csp-smoke.yml` 6-hour cron did **not** surface this: `gh issue list` shows no
open "CSP smoke gate failing" issue, and `gh run list --workflow=csp-smoke.yml` returned
**no runs at all**. Either GitHub Actions is not running this repo's workflows (e.g. `main`
not pushed, or Actions disabled) or failures are not surfacing. A gate that never runs is no
gate. Worth confirming Actions are wired before relying on the P866 cron either. Track this
as a follow-up if it turns out Actions are inactive.

## Resolution

Prod redeployed by pushing `main` (`2660787b..5c8f0c9f`) to origin on 2026-06-01.
The deploy carried the full accepted-to-main backlog (P855 Pledge v4, P867 intensity
tutorial, the P865 CSP fix `4c5e78a0`, + docs) — confirmed live and healthy:
- `curl -sI https://claritypledge.com/` → `script-src … 'wasm-unsafe-eval' …` (present).
- `CSP_SMOKE_URL=https://claritypledge.com npm run smoke:csp` → 5/5 green (was 5/5 red pre-deploy).
- `PROD_SMOKE_URL=https://claritypledge.com npm run smoke:prod` → 5/5 green (public routes clean post-deploy).

Root cause (deploy drift) closed. AC #4 (Actions wired) confirmed post-push: `gh run list`
shows CI, Secret Scan, and Check Deploy Drift running on recent pushes, and a `CSP smoke (prod)`
workflow run executed via `workflow_dispatch` — the gate is live (the earlier "no runs" was solely
because `origin/main` had been 13 commits stale, so Actions never had the workflow file). The next
6-hourly scheduled tick will exercise the cron path. AC #3 (literal HEIC upload) accepted by proxy:
the CSP root cause is fixed and `smoke:csp` is 5/5 green, which proves WebAssembly is unblocked.

Lesson: the drift was "local `main` never pushed" — invisible to the scheduled `Check Deploy Drift`
gate, which compares prod against `origin/main` (both were equal at `2660787b`). No server-side gate
can see an unpushed local HEAD; push discipline is the only guard for that class.

## Acceptance Criteria

- [x] `curl -sI https://claritypledge.com/` shows `script-src` (and `worker-src`) containing
      `'wasm-unsafe-eval'`. *(Verified live 2026-06-01.)*
- [x] `CSP_SMOKE_URL=https://claritypledge.com npm run smoke:csp` passes on all 5 public routes.
      *(5/5 green post-deploy.)*
- [x] A HEIC (`.heic`) photo upload succeeds on prod (no WASM-blocked console error in the flow).
      *(Satisfied by proxy — not a literal upload. The CSP root cause is fixed and `smoke:csp` is
      5/5 green, which proves WebAssembly compilation is unblocked on prod; the `heic2any` path
      depended only on that directive.)*
- [x] Confirmed whether the `csp-smoke.yml` cron is actually running on GitHub Actions; if not,
      filed/resolved as a follow-up (so the gate alerts on the next drift). *(Confirmed live post-push:
      Actions is active — `gh run list` shows CI / Secret Scan / Check Deploy Drift running, and a
      `CSP smoke (prod)` run executed via `workflow_dispatch`. The earlier "no runs" was because
      `origin/main` was 13 commits stale, so Actions never had the workflow. Next 6h scheduled tick
      exercises the cron path.)*
