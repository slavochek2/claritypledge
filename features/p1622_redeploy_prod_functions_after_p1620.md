---
status: week
type: bug
rank: 96
severity: high
workstream: infra
date_reported: 2026-11-05
created_date: 2026-11-05
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [deploy, edge-functions, manifest]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1622: Prod functions need one redeploy after P1620 lands

## Summary

After P1620 reaches main, every prod edge function reports `FUNCTION_STALE` until it is redeployed once, so the two post-deploy checks moved from P1620 live here.

## Root Cause

P1620 changed what a function's manifest hash covers, so all 24 hashes recorded under the old index.ts-only rule stop matching. Which functions were really behind prod cannot be told from the old hashes; `mirror-reply` and `mirror-portrait` got hotfixes on 2026-11-05.

## Reproduction Steps

1. With P1620 on main, run `./scripts/check-deploy-manifest.sh --env prod`.
2. Observe: `FUNCTION_STALE` for all 24 functions (measured on the P1620 branch).

**Reproduction rate:** 100% until the redeploy.

## Expected Behavior

The check is clean, and that reflects a real deploy of current code.

## Actual Behavior

The daily drift check fails and any other `/ship` stops at its deploy-drift step.

## Affected Files

- `supabase/deploy-manifest.json` — prod function hashes
- `scripts/deploy-functions.sh` — the redeploy, which stamps what it deployed

## Severity

**High** — it blocks other ships and keeps the drift alarm red until done.

## Fix Approach

Founder approves the deploy, then run `./scripts/deploy-functions.sh --env prod` from the main checkout after P1620 is pushed. Do not use `--assume-all-deployed` in place of a deploy.

## Acceptance Criteria

- [ ] Every function found stale on prod is listed, and redeployed with founder approval
- [ ] A person on the current terms gets a mirror reply on prod with no terms message
