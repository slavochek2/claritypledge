---
status: backlog
type: bug
rank: 237
severity: low
workstream: infra
date_reported: '2026-08-28'
created_date: '2026-08-28'
drafted_by: sonnet
exec_model: sonnet
exec_effort: medium
tags: [sentry, network-blip, noise-reduction, p1176-sibling]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1177: Five call sites report network blips to Sentry unconditionally, same pattern as P1176

## Summary

Five call sites report `Sentry.captureException` on an async rejection unconditionally, without consulting `isNetworkBlip()` from `src/lib/network-blip.ts` — the identical bug class fixed in P1176 for `agent-accounts-context.tsx`.

## Root Cause

Filed as a Tier-1 same-class-sibling finding during P1176's code review (`/fix` Phase 4, code-review subagent). None of these files import `network-blip.ts`:

- `src/app/hooks/useOpenLiveInvite.ts:108` — `.catch` on the initial fetch, `Sentry.captureException(err, { tags: { source: 'useOpenLiveInvite.initialFetch' } })`
- `src/app/hooks/useOpenLiveInvite.ts:206` — `.catch` on an enrichment fetch, `Sentry.captureException(err, { tags: { source: 'useOpenLiveInvite.enrichment' } })`
- `src/app/pages/letter-reading-page.tsx:376` — `Sentry.captureException(err)` on a rejection
- `src/app/pages/letter-reading-page.tsx:470` — `claimLetterDelivery(token).catch((err) => Sentry.captureException(err))`
- `src/app/components/auth/terms-acceptance-gate.tsx:70` — `Sentry.captureException(err, { tags: { area: 'terms-acceptance-gate' } })` on `recordTermsAcceptance` rejection (a write path, but still network-reachable — a "Load failed"/"Failed to fetch" mid-flight is exactly as possible here as on any other fetch)

Each is a plausible transient-network-blip source. Not confirmed against a live Sentry event the way P1176 was (that one had a concrete `JAVASCRIPT-REACT-2W` event to point at) — this ticket is filed on pattern-match alone. **Reviewer's own confidence note:** `src/app/data/api.ts` and `stories-service-real.ts` were checked and are lower-confidence siblings (some already partially guard via error codes) — not included here, worth a second pass if this ticket is picked up.

## Invariants

Whatever fix lands here must not change what state is set on a rejection — only whether the rejection is *reported to Sentry*. Each site's existing error-recovery behavior (toast, retry, fallback UI) must be preserved exactly; `isNetworkBlip()` gates the Sentry report only, never the app's response to the failure.

## Reproduction Steps

1. For any of the five sites: simulate the underlying call rejecting with an `Error` whose `message` matches a `network-blip.ts` `BLIP_MESSAGE_FRAGMENTS` entry (e.g. `"Load failed"`) and no `code`.
2. Observe: `Sentry.captureException` is called — an issue is created for a transient blip.

**Reproduction rate:** 100% for any blip-shaped rejection, per site.

## Expected Behavior

Each site should gate its `Sentry.captureException` call behind `isNetworkBlip(err)`, matching the P1176 pattern: on a blip, emit `Sentry.addBreadcrumb({ category: 'db-error-suppressed', ... })` and skip `captureException`; on a real error, report exactly as today.

## Actual Behavior

All five sites report every rejection to Sentry unconditionally, including transient network blips.

## Affected Files

- `src/app/hooks/useOpenLiveInvite.ts:108,206`
- `src/app/pages/letter-reading-page.tsx:376,470`
- `src/app/components/auth/terms-acceptance-gate.tsx:70`

## Severity

**Low** — same class as P1176: Sentry signal-to-noise only, no confirmed user-facing impact. Lower confidence than P1176 since none of these five is yet confirmed against a live Sentry event.

## Fix Approach

For each site, import `isNetworkBlip` from `@/lib/network-blip` and apply the same gate P1176 added to `agent-accounts-context.tsx`. Five small, independent edits — could be one PR or five, reviewer's call. Confirm each site's existing non-Sentry error handling (toast/retry/fallback) is unaffected.

## Acceptance Criteria

- [ ] All five sites gate `Sentry.captureException` behind `isNetworkBlip(err)`
- [ ] Each site's existing error-recovery UI/state behavior is unchanged
- [ ] A blip-shaped rejection at each site emits a `db-error-suppressed` breadcrumb instead of an issue
- [ ] A non-blip rejection at each site still reports to Sentry with its existing tags
- [ ] Regression tests added per site (or one shared test covering all five, reviewer's call)
- [ ] No console errors during any of the five flows
