---
status: qa
type: bug
disclosure: public
rank: 237
severity: low
workstream: infra
date_reported: '2026-08-28'
created_date: '2026-08-28'
drafted_by: sonnet
exec_model: sonnet
exec_effort: medium
tags: [sentry, network-blip, noise-reduction, p1176-sibling]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
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

- [x] All five sites gate `Sentry.captureException` behind `isNetworkBlip(err)` — via `reportUnlessBlip` (`src/lib/report-unless-blip.ts`), one copy instead of five. `src/tests/p1177-network-blip-call-sites.test.ts` asserts per file that zero bare `Sentry.captureException` calls remain and that the expected number of gated calls is present (2/2/1). Failed before the fix (3 failed).
- [x] Each site's existing error-recovery UI/state behavior is unchanged — the diff replaces only the Sentry call; every `dispatch`, `return`, `setAcceptError` and `.catch` shape around it is byte-identical. The helper's doc comment states this invariant. p745 (12), p730 (9) and p990 (9) all still pass: 30/30.
- [x] A blip-shaped rejection at each site emits a `db-error-suppressed` breadcrumb instead of an issue — asserted on the shared gate for a `Load failed` error and for the empty-message mobile-Safari signature, including the exact breadcrumb payload with the call site's `context`.
- [x] A non-blip rejection at each site still reports to Sentry with its existing tags — asserted for a tagged error (tags passed through unchanged), an untagged one (`undefined` options, matching the bare call it replaces), and a 22P02 Postgrest error whose message merely contains blip text.
- [x] Regression tests added per site (or one shared test covering all five, reviewer's call) — one shared file, 11 tests: 5 behavioural on the gate, 3 from the code review, 3 per-file wiring assertions.
- [x] No console errors during any of the five flows — no console output across the vitest runs; `npm run lint` exit 0 and `./scripts/typecheck-gate.sh` exit 0. Unit-level only; no browser check was run.

## Implementation note — one gate, not five copies

The Fix Approach left the shape open ("could be one PR or five, reviewer's call"). The gate is a
function, `reportUnlessBlip`, rather than five copies of P1176's eight lines: two of the five sites
are in the same file as each other, and the predicate now has a subtlety (primitive rejections, see
finding 2 below) that must not be reasoned about five times. It lives in `src/lib/`, not inside
`network-blip.ts`, because that module is a leaf the Sentry bootstrap itself imports and must not
depend on `@sentry/react`.

`agent-accounts-context.tsx` (the P1176 site) is deliberately left inline. Rewriting shipped code
is outside this bug's scope; it is the obvious next caller of the helper if anyone touches it.

## Code-review findings (codex, adversarial pass)

Verdict: **DO NOT SHIP** on the first pass, for three findings. Two are fixed; one is out of scope.

1. **[HIGH, fixed] The captureMessage path was still ungated.** Supabase query builders RESOLVE a
   network failure as `{ data: null, error }` rather than rejecting, so a dropped connection during
   invite enrichment reaches `useOpenLiveInvite.ts`'s `Sentry.captureMessage` warning, not the
   `.catch` this ticket named. Same tag, same file, same bug class. Now guarded by `isNetworkBlip`
   with the same breadcrumb; the `!session` case with no error still warns as before.
2. **[MEDIUM, fixed] The gate could throw while handling an error.** `isNetworkBlip` tests
   `'code' in error`, which throws on a primitive, and a rejection is `unknown`. A
   `Promise.reject('Load failed')` would have turned the catch handler into a new TypeError and
   skipped the call site's own recovery — for the initial invite fetch, the `LOADED(null)` dispatch
   would never run and the hook would stay loading. `reportUnlessBlip` now normalises a non-object
   to `null` before the predicate. Three cases cover string, number and null.
3. **[MEDIUM, NOT fixed] The terms gate fails open on a rejected consent lookup.**
   `terms-acceptance-gate.tsx:45` attaches only `.then` to `needsTermsAcceptance`; a rejection
   leaves `showDialog` false with protected children rendered. Real, but unrelated to Sentry
   reporting and untouched by this diff — it is a consent-gate correctness bug, not noise.
   [FOUNDER DECISION: this needs its own P-number. Not filed during the overnight run because
   filing a consent-gate security spec unprompted is a scope call.]
