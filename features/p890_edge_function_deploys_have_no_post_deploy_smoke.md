---
status: backlog
type: bug
rank: 64
severity: medium
workstream: infra
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [deploy-pipeline, smoke-test, edge-functions, process]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P890: deploy-functions.sh has no post-deploy smoke — edge functions reach prod unverified

## Summary

`scripts/deploy-functions.sh` deploys Supabase edge functions to prod with a pre-deploy secrets check but zero post-deploy verification — a broken function (runtime error, bad import, wrong JWT flag) is discovered only via Sentry or a user report.

## Root Cause

No smoke coverage exists for edge functions at all: `scripts/prod-smoke-test.mjs` exercises auth, profiles, story CRUD, and anon access — it never calls an edge function. So unlike P889 (wiring an existing script into an existing watch), closing this gap requires designing new coverage first. Found during P887 `/reproduce` scenario audit (2026-06-04).

## Reproduction Steps

1. Introduce a runtime-breaking change to any edge function (e.g. an import that resolves locally but not in the Deno deploy bundle)
2. Run `./scripts/deploy-functions.sh` against prod — deploy succeeds (the bundle uploads fine; the error is at invocation time)
3. Observe: script exits 0, no verification call is made, the function 500s for every real user until Sentry or a user surfaces it

**Reproduction rate:** 100% for invocation-time failures (deploy success ≠ function health)

## Expected Behavior

After a prod deploy, each deployed function receives a canary invocation (health endpoint or representative cheap call) and the script exits non-zero with the failing function named if any canary fails.

## Actual Behavior

Deploy exits 0 on upload success; function health is never checked.

## Affected Files

- `scripts/deploy-functions.sh` — no post-deploy verification step
- `supabase/functions/*` — per-function canary strategy needs design (health route vs. representative call; auth'd functions need a token source)

## Severity

**Medium** — blast radius is one feature area (letters, transcription) rather than all of auth; edge deploys are infrequent; Sentry provides reactive coverage. But detection is reactive-only today, the same pattern class as P886/P887.

## Fix Approach

Design first (small): per-function canary table in `deploy-functions.sh` — function name → canary request (method, path, payload, expected status). Unauthenticated functions: direct curl. JWT-gated functions: reuse the smoke account token flow from `prod-smoke-test.mjs`. Then: after each successful deploy, run the canary for exactly the functions deployed; non-zero exit + named function on failure. Keep it alert-only-or-gate decision at spec-review.

## Acceptance Criteria

- [ ] Deploying a function to prod triggers a canary invocation of that function automatically
- [ ] A function that 500s at invocation time causes `deploy-functions.sh` to exit non-zero and name the failing function
- [ ] Functions not deployed in the run are not invoked (no blanket prod traffic per deploy)
- [ ] Test-project deploys behave unchanged unless explicitly opted in
