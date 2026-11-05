---
status: all-done
type: bug
rank: 96
severity: high
workstream: infra
date_reported: 2026-11-05
created_date: 2026-11-05
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [deploy, edge-functions, manifest, terms]
disclosure: public
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: scripts/test-p1620-reproduce.sh
  root_cause: "The manifest hashes only index.ts, and every deploy re-stamps all functions, so a _shared or sibling change never reports and a one-function deploy marks undeployed functions current"
  confidence: high
  surfaces_in_scope: [stamp-deploy-manifest, check-deploy-manifest, deploy-functions]
  surfaces_deferred: []
  reproduced_at: 2026-11-05
completed_at: 2026-11-05
---

# P1620: A change in `_shared` can leave prod edge functions out of date, and nothing reports it

## Summary

The drift check hashes only each function's `index.ts`, so a change in `supabase/functions/_shared` (or another file of a function) never reports `FUNCTION_STALE`, and prod keeps running old code unseen.

## Root Cause

`scripts/stamp-deploy-manifest.sh` `build_functions_json()` records `shasum` of `$dir/index.ts` only. `scripts/check-deploy-manifest.sh` reports `FUNCTION_STALE` from those hashes. A function's bundle also includes `_shared` and its sibling files.

**Second defect, found during reproduction:** `scripts/deploy-functions.sh:238` calls the stamper with no function names, and `build_functions_json()` re-hashes every function directory. Deploying one function therefore records every other function as current, so hashing more files would not be enough on its own.

**Reproduced 2026-11-05, on a throwaway copy of the real tree with its own local origin (the check reads the manifest from `origin/main`):**
- `_shared/terms-version.ts` changed only: check passes, exit 0. `mirror-reply` reaches that file through `_shared/terms-gate.ts`.
- `mirror-reply/handler.ts` changed only: check passes, exit 0.
- Control, `mirror-reply/index.ts` changed: `FUNCTION_STALE: mirror-reply`, exit 1.
- `mirror-reply` and `mirror-portrait` both changed, then the stamper run as a deploy runs it: check passes, exit 0, though nothing reached the server.

**Surface (regex tracer, not Deno's resolver):** 22 of 24 functions reach `_shared`; 10 of 24 have sibling files; no cross-function imports, dynamic imports or runtime file reads outside tests. Version pins in `supabase/functions/deno.json` and `deno.lock` also change a bundle. Only `check-deploy-manifest.sh` reads the function hashes, and only the stamper writes them.

Observed 2026-11-05: `mirror-reply` keeps one manifest hash from 2026-10-26 to today, while `_shared/terms-version.ts` moved the mirror consent list through v1.6 and v1.7. The Supabase function list showed `mirror-reply` last deployed 2026-10-28 and `mirror-portrait` 2026-10-26.

**Inference limit:** the old deployed code was not read directly (a shared-folder overwrite during the download destroyed that evidence). The chain is deploy timestamps plus git history: at the Oct 29 commit, `terms-version.ts` accepts only v1.5.

## Invariants

- Bumping a version in `_shared/terms-version.ts` must not leave any function that reads it behind without a report.
- A clean drift report must mean more than "the stamper ran" (decisions.md 2026-09-07 [technical], via the P1312 entry): the record has to reflect the code actually deployed.

## Reproduction Steps

1. On a scratch copy of the manifest state, stamp prod functions.
2. Change only a file under `supabase/functions/_shared/` that `mirror-reply` imports.
3. Run `./scripts/check-deploy-manifest.sh --env prod`.
4. Observe: no `FUNCTION_STALE` for `mirror-reply`.

**Reproduction rate:** 100%, run by `scripts/test-p1620-reproduce.sh` (3 assertions fail, exit 1).

## Expected Behavior

A change to any file a function's bundle includes reports that function as stale.

## Actual Behavior

No report. The user-facing result on prod: a signed-in person who had accepted terms v1.7 saw "Accept the updated terms to use your mirror agent." Reload could not clear it, because their account was already up to date and the old function refused v1.7.

## Affected Files

- `scripts/stamp-deploy-manifest.sh` — `build_functions_json()`, hashes `index.ts` only
- `scripts/check-deploy-manifest.sh` — `FUNCTION_STALE` comparison, ~line 162
- `supabase/functions/_shared/terms-version.ts` — the change that exposed it

## Severity

**High** — a whole class of accounts lost a live feature with no alarm, and any `_shared` change can repeat it, including a security fix that never reaches prod.

## Fix Approach

Hash each function's full input set: its directory plus what it imports from `_shared`, or all of `_shared` if import tracing proves unreliable. The first stamp after this change must not mark undeployed functions as current. Read the P1312 approach (reading what the server actually serves) first and choose between the two.

Already done, out of scope: the two hotfix deploys below, and the secret check's test-only handling of `CANVAS_DRAFT_STUB_TOKEN` (`c5e069ce6`).

## Acceptance Criteria

- [x] A `_shared`-only change reports `FUNCTION_STALE` for a function that imports it, shown failing first on the real tree
- [x] The same change does not report a function that does not import it, if hashing is per import
- [x] A freshly deployed, unchanged function reports clean
- [x] Deploying one function does not mark another changed function as current

**Moved to P1622 by founder decision, 2026-11-05:** the prod redeploy and the prod mirror-reply check, because neither can happen before this merges. This spec's prod outcome is not proven until P1622 closes.

## Resolution

Both defects fixed: `scripts/lib/function-input-hash.py`, shared by the stamper and the check, hashes each function's traced inputs plus `deno.json` and `deno.lock`. A deploy stamps only what deployed, and a stamp with no names is refused without `--assume-all-deployed`. The trace matched `deno info` on local files for all 24 functions, before the final regex-keyword lexer change.

**Chosen over reading what the server serves:** that path is unmeasured for hosted functions (P1312). So a clean report still means "the last recorded deploy used this code", not "the server was read". The manifest can still be falsified by `--assume-all-deployed`, which is explicit.

**After landing:** old hashes do not match, so every function reports `FUNCTION_STALE` and the daily drift check stays red until all are redeployed.

**Known limit:** a regex literal holding a quote directly after `)` can still desync the lexer. Existing relative imports stay covered by the raw-text pass; a fail-closed error in that file could be hidden.

**Known limit, last review:** the lexer's keyword check can misread a division after an identifier named `of`, or after a long run of spaces, as a regex. That can hide a fail-closed error on the same line; relative imports stay covered by the raw-text pass. Accepted under the one-extra-round review cap.
