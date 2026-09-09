---
status: all-done
type: bug
disclosure: public
rank: 64
severity: medium
workstream: infra
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [deploy-pipeline, smoke-test, edge-functions, process]
pipeline_ran: [create-bug, fix]
completed_at: 2026-09-09
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

- [x] Deploying a function to prod triggers a canary invocation of that function automatically — `deploy-functions.sh` runs `edge-function-smoke.mjs --only "<just deployed>"` after a successful upload, prod by default, `EDGE_SMOKE=1` to opt a test deploy in. Exercised end to end by `scripts/test-p890-deploy-smoke.sh` against a PATH-stubbed Supabase CLI: `deploy-functions.sh --env prod` exits 0 and the smoke receives `--only alpha-fn,create-and-sign`
- [x] A function that 500s at invocation time causes `deploy-functions.sh` to exit non-zero and name the failing function — two independent proofs. Against real prod, pointing the smoke at a bogus base URL: `boot probe: OPTIONS returned 404, expected 200`, exit 1, both functions named. In the canary, a red smoke makes the deploy exit 1 with `post-deploy smoke failed` (epistemic gate 7)
- [x] Functions not deployed in the run are not invoked (no blanket prod traffic per deploy) — `--only` takes the joined `DEPLOYED` array, from which `_shared` is now excluded; asserted by the canary and by a two-function subset run against prod (`Functions: 2`)
- [x] Test-project deploys behave unchanged unless explicitly opted in — the smoke block runs only when `ENV_NAME=prod` or `EDGE_SMOKE=1`. Canary asserts all three arms: a local deploy runs no smoke and survives a red one, `EDGE_SMOKE=1` opts in, `EDGE_SMOKE=0` skips on prod and warns

## What was built

`scripts/edge-function-smoke.mjs` (`npm run smoke:edge`) probes all 14 functions on two
credential-free paths and exits 0 / 1 (a function is unhealthy) / 2 (the smoke is
misconfigured), so "the smoke broke" never reads as "prod broke".

- **OPTIONS, no credentials — the boot proof.** Measured on prod: the Supabase gateway
  does not require a JWT for preflight, so the request reaches the function's own
  handler and a matching reply proves the module loaded. Undeployed answers 404, a boot
  failure 5xx.
- **POST `{}`, no credentials — the caller-gate proof (P1207), NOT a boot proof.** For
  the 13 functions deployed with gateway JWT verification this 401 comes from the
  gateway, before any function code runs. Stated in the file header so a green run is
  not read as more than it is (epistemic gate 7b).

No probe can send an email, move a payment or write a row: every one lands on a
documented refusal path, and a unit test asserts every deny status stays 4xx so a later
table edit cannot quietly turn a probe into a real invocation.

A completeness check fails **exit 2** when a function directory has no expectation row —
without it a newly added function would be silently unsmoked and the run would stay
green. Proven by creating an empty `supabase/functions/ztest-drift/`: `no expectation row
for: ztest-drift`, exit 2.

`.github/workflows/edge-smoke.yml` runs it every 6 hours, alert-only, opening/appending
**and closing on recovery** one GitHub issue via the same author-bound exact-title lookup
the other producers use; registered in `.github/alert-registry.json` as a
`github-issue-age` check plus a producer-freshness row, and added to
`scripts/test-producer-author-bind.sh` so the repo's own producer canary covers it. The
issue body names which failure it is, because exit 1 (a function is unhealthy) and exit 2
(the smoke is misconfigured, so something is now unsmoked) send the operator to different
places — one to prod, one to this repo.

### Three defects in `deploy-functions.sh` found and fixed while wiring the smoke in

Each was invisible, and each would have made the smoke useless on the path it covers.

1. **A failed upload was reported as a successful deploy.** `supabase functions deploy … |
   tail -1` returns *tail's* status, so every failure was recorded as DEPLOYED and the
   manifest stamped. It also defeated the smoke: the previous, still-working function
   answers the probe. Now the output is captured to a temp file and the deploy's own exit
   code is tested.
2. **Reading that exit code honestly then broke the deploy-all workflow** — the reason
   this is one change and not two. `supabase functions deploy _shared` fails its own name
   validation (`Invalid Function name … ^[A-Za-z][A-Za-z0-9_-]*$`, measured exit 1 on CLI
   2.106.0), and `_shared` was in the deploy list because the loop globbed every
   directory. Masked, it was harmless; unmasked, `./scripts/deploy-functions.sh --env
   prod` aborts with `1 function(s) failed to deploy: _shared` before reaching the smoke
   or the manifest. Underscore-prefixed directories are now skipped, matching the smoke's
   own `discoverFunctionDirs`. `stamp-deploy-manifest.sh` walks the directory itself, so
   the manifest still records `_shared` and drift checks are unaffected (epistemic gate
   7c).
3. **A worktree deploy uploaded to prod and skipped the smoke entirely.**
   `stamp-deploy-manifest.sh` exits 1 by design from inside a worktree, and
   `deploy-functions.sh` is explicitly built to run from one. Under `set -e` that abort
   killed the run at the stamp. The stamp now runs before the smoke (so the manifest
   records what really landed, rather than leaving drift checks to report a false
   FUNCTION_STALE for functions that did deploy), its failure is recorded rather than
   fatal, the smoke runs regardless, and the script exits non-zero at the end. Found by
   the Codex review.

A missing `edge-function-smoke.mjs` now **fails a prod deploy** rather than warning and
exiting 0 — otherwise a partial checkout deploys prod with no verification at all and
reports success, which is the state this spec exists to end. Also found by the review.

`scripts/test-p890-deploy-smoke.sh` is the canary for all of it: a throwaway git repo, a
PATH-stubbed Supabase CLI that reproduces the real name validation rather than waving
everything through, and 16 checks covering both directions — the workflows that must
still pass and the failures that must still fail. Wired into `pre-commit-checks.sh`
(check 4.6.6) so editing the deploy script or the smoke re-runs it.

### Probe-safety audit — every function's source read, 2026-09-09

The claim "no probe can fire a real send" is only worth as much as the read behind it, so
all 14 handlers were read rather than inferred from the table.

- **12 functions** return from an `OPTIONS` branch on the first statement of the handler,
  before any env read, client construction or I/O. Confirmed by reading each branch:
  `confirm-letter-response`, `create-and-open-letter`, `create-and-sign`,
  `explain-back-signed-url`, `gcs-signed-url` (the branch is in `handler.ts`, not
  `index.ts`), `generate-banner`, `generate-event-banner`, `generate-story-image-url`,
  `request-letter-response-signin`, `send-agreement-emails`, `send-event-emails`,
  `send-letter-emails`.
- **`dispatch-event-emails`** has no OPTIONS branch. Its `CRON_SECRET` check is the first
  thing in the handler and answers `401`, so the probe lands on an auth refusal.
- **`enqueue-transcription`** has no OPTIONS branch either. Its method guard is the
  handler's first line and answers `405`.
- **The `POST {}` probe reaches handler code in exactly one function.** For the other 13
  the gateway refuses it. `create-and-sign` is deployed `--no-verify-jwt`, and its handler
  parses `{}`, finds `agreementId`/`token`/`partnerName` all undefined, and returns `400
  INVALID_INPUT` — before the first database read, let alone a write or a send.

A unit test asserts every deny status in the table stays 4xx, so a later table edit cannot
quietly turn a probe into a real invocation.

## Founder decisions needed (found by the adversarial review, NOT introduced here)

1. **`enqueue-transcription` looks unreachable by its own caller.** Its caller is the
   `tx_jobs_enqueue` AFTER INSERT trigger, which sends `x-webhook-secret` and **no**
   `Authorization` header (`20260813120000_p1064_tx_jobs_enqueue_from_vault.sql`). The
   function is deployed **with** gateway JWT verification (`deploy-functions.sh` gives
   `--no-verify-jwt` to `create-and-sign` alone), and prod answered a credential-free
   POST with the gateway's `UNAUTHORIZED_NO_AUTH_HEADER` — measured 2026-09-08. If that
   is right, transcription jobs are inserted and never enqueued, which is the P1256 shape
   exactly. **Re-verified independently against prod on 2026-09-09, and the evidence is
   now conclusive on the mechanism.** The handler's own refusal is the plain string
   `unauthorized` (`index.ts:57`); prod answers a credential-free POST with the
   *gateway's* JSON `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` instead, so the request is
   stopped before any function code runs. The same function answers `OPTIONS` with `405`
   from its own method guard, which proves it is deployed and booting — it is simply
   unreachable by its caller. The migration was re-read to confirm the header set
   (`Content-Type` and `x-webhook-secret`, no `Authorization`), and no later migration
   changes it. **Still not confirmed against live traffic:** `net._http_response` retains
   roughly six hours and held no transcription rows in that window, only cron dispatches.
   The remedy is a security call — `--no-verify-jwt` for this function, or sending the
   anon key from the trigger the way P1256's dispatcher does.
2. **Should the piped-exit-status audit be applied repo-wide?** The masked-deploy defect
   fixed above (`cmd … | tail -1` returning *tail's* status) is a shape, not a one-off,
   and `pre-commit-checks.sh` check 18c already warns on newly-added pipeline shapes of a
   related family. Whether to sweep the existing call sites is a scope call, not something
   to fold into this spec.
