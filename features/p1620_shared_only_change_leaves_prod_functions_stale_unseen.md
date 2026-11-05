---
status: week
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
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1620: A change in `_shared` can leave prod edge functions out of date, and nothing reports it

## Summary

The drift check hashes only each function's `index.ts`, so a change in `supabase/functions/_shared` (or another file of a function) never reports `FUNCTION_STALE`, and prod keeps running old code unseen.

## Root Cause

`scripts/stamp-deploy-manifest.sh` `build_functions_json()` records `shasum` of `$dir/index.ts` only. `scripts/check-deploy-manifest.sh` reports `FUNCTION_STALE` from those hashes. A function's bundle also includes `_shared` and its sibling files.

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

**Reproduction rate:** 100% by reading the hash code; not yet run. `/reproduce` should run it.

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

- [ ] A `_shared`-only change reports `FUNCTION_STALE` for a function that imports it, shown failing first on the real tree
- [ ] The same change does not report a function that does not import it, if hashing is per import
- [ ] A freshly deployed, unchanged function reports clean
- [ ] Every function found stale on prod is listed, and redeployed with founder approval
- [ ] A person on the current terms gets a mirror reply on prod with no terms message
