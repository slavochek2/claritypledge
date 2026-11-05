---
status: qa
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
delivery_stage: fix
pipeline_ran: [create-bug, fix]
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

- [x] Every function found stale on prod is listed, and redeployed with founder approval
- [x] A person on the current terms gets a mirror reply on prod with no terms message

## Resolution

All 24 functions were redeployed to prod at 2026-11-05T06:47Z and stamped in `a8527dfa6`, after the founder asked for anything undeployed to be deployed. **Stale list:** all 24 reported stale, because P1620 changed the hash format, so the old hashes cannot show which were truly behind.

**Evidence:** on prod, in the founder's own mirror chat, a message at 1:54 PM local time (06:54Z) got a mirror reply with no terms message, read in the browser. The check is one account, and the deploy time comes from the manifest; the platform's deploy list was not read, since it needs a locked credential.
