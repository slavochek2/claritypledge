---
status: week
type: bug
rank: 1000082
severity: medium
date_reported: '2026-09-09'
created_date: '2026-09-09'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [anon-position, embed, storage, test-coverage]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1291: Anonymous positions staked inside an embedded point are silently discarded, and no test covers the stake-to-sign-in round trip

## Summary

A signed-out reader who stakes positions on several embedded points loses all but one of them on sign-in wherever iframe storage is unavailable, with no message; and the round trip that would have caught this is not covered by any test, though four test files appear to cover it.

## Root Cause

Two independent defects that mask each other.

**1. Silent discard.** Anonymous positions are stashed in `localStorage` under `cp-anon-positions` (`src/app/hooks/useAnonPosition.ts`) and batch-restored on the auth callback (`src/auth/AuthCallbackPage.tsx`, the P502 restore loop). Every storage call is wrapped in `try { … } catch { }` that returns empty or no-ops. The module header documents the intent: *"Handles: corrupted JSON (returns null/empty), localStorage unavailable (Safari ITP in iframe — catches SecurityError, no-ops)."* The degradation is graceful toward the code and silent toward the reader: the position button still shows as selected, the CTA still says *"Sign up or log in to save your position"*, and nothing is saved. No user-visible signal, no telemetry.

The one position that does survive is the point whose CTA the reader clicked, because `anon-position-cta.tsx` puts `pointId` and `position` into the auth-gate URL via `buildAuthGateUrl`. That path is independent of browser storage policy. It is the robust mechanism; `localStorage` is the fragile one.

**2. The seam is untested while looking tested.** Each component is green and the composition is unverified:

- `src/tests/p502-anon-position.test.ts` — ~20 unit tests on the storage helpers, including one asserting the SecurityError path no-ops. Tests the helper, not the feature.
- `e2e/p502-anon-position-optimistic.spec.ts` — CTA rendering, auth-gate link params, embed mode, reload persistence. All anonymous-only; never signs in.
- `e2e/integration/p458-auth-callback-position.spec.ts` — named for auth-callback position save, but the test **performs the `upsert` itself with a raw authenticated client and then reads the row back**. It proves the table, its enum constraint and its RLS grants work. It never invokes `AuthCallbackPage`. It would pass with the restore loop deleted.
- `e2e/p458-anon-position-auth-gate.spec.ts` — contains a describe block named *"Position auto-save after existing user login"* whose only assertion is `expect(page.url()).toContain('/point/' + id)`. It never reads the position.

This is the `.claude/rules/epistemic.md` gate 7b shape: green bounds what was modelled. Nothing in the suite asserts *"anonymous visitor stakes a position, signs in, the row exists as theirs."*

## Invariants

- **A reader's staked position must never be discarded without a visible signal.** Silent loss of user intent is the defect; storage being unavailable is the environment.
- **The clicked point's position must continue to travel in the auth-gate URL.** It is the only path that works in every embed context regardless of browser storage policy. Any fix that moves this into storage makes the bug total instead of partial.
- **A test for this path must fail when the restore loop is removed.** The existing integration test does not, which is why this shipped.

## Reproduction Steps

1. Serve a page from any origin other than `claritypledge.com` containing:
   `<iframe src="https://claritypledge.com/point/{pointId}?embed=true&expanded=true">`
2. Open it signed out in Safari, or in Chrome with third-party storage partitioning enabled.
3. Click **Agree** on the embedded point. The button highlights and the CTA appears: *"Join ClarityPledge — Sign up or log in to save your position."*
4. Add a second embedded point to the page and stake a position on that one too.
5. From the **first** point's CTA, click Sign up and complete sign-in.
6. Observe: the first point's position is saved. The second is gone. No message at any step.

**Reproduction rate:** Steps 1–4 confirmed 2026-09-09 against production from a local third-party origin: the position was written and the CTA rendered as described. Step 6 on Safari is **UNVERIFIED** — inferred from the module's own source comment and its unit test, not yet observed. In Chromium at default settings storage was *shared*, not partitioned, and the top-level origin read the value written inside the iframe, so both positions would restore there. Confirming the Safari behaviour is the first job of `/reproduce`.

## Expected Behavior

Either every position the reader staked survives sign-in, or the reader is told plainly which ones will not before they sign in.

## Actual Behavior

Positions beyond the one carried in the CTA URL are discarded with no signal to the reader and no telemetry to us. The UI actively suggests the opposite by keeping the button selected and offering to "save your position".

## Affected Files

- `src/app/hooks/useAnonPosition.ts` — every storage call catches and no-ops; no availability probe, no signal on failure
- `src/auth/AuthCallbackPage.tsx` — the P502 batch-restore loop; reads top-level storage, which may not be the bucket the embed wrote to
- `src/app/components/shared/anon-position-cta.tsx` — builds the auth-gate URL; this is the working path and must be preserved
- `e2e/integration/p458-auth-callback-position.spec.ts` — writes the row itself, so it cannot fail on an app-path regression
- `e2e/p458-anon-position-auth-gate.spec.ts` — describe name claims auto-save; assertion only checks the URL

## Severity

**Medium** — the primary path (sign in from the point you actually care about) works in every browser because that position travels in the URL. Only additional staked positions are lost, and only where iframe storage is blocked. Raise to high if the embed becomes the main acquisition surface and multi-point staking is the asked-for behaviour.

## Fix Approach

1. **Probe storage availability when a position is staked, not silently at write time.** If unavailable, keep the optimistic UI but change the CTA to name the limit rather than promise a save it cannot deliver. Exact wording is a product call — `[FOUNDER DECISION: CTA copy when storage is blocked]`.
2. **Write the round-trip test that does not exist.** It must drive the application's own path: anonymous stake, sign in through the app, assert the row exists with the right value for that user. Per Invariant 3 and epistemic gate 7, prove it by deleting the restore loop and showing the test goes red — a green run alone does not discharge this.
3. **Consider carrying more than one point in the auth-gate URL.** Prior art supports this direction: the P840 entry in `docs/decisions.md` established that `localStorage` written in one isolated browser context is unreachable from the next, that this is OS/embedder behaviour rather than an app defect, and that the remedy is to carry the needed state in the URL. Nothing in `docs/decisions.md` rejects this approach; the P502 entries there concern analytics instrumentation, not the storage mechanism.
4. **Correct the two misleading test names** so the next reader is not told the seam is covered.

## Acceptance Criteria

- [ ] Safari behaviour is **observed and recorded**, not inferred — the current UNVERIFIED marker in Reproduction Steps is replaced with a real result
- [ ] A reader whose browser blocks iframe storage sees a CTA that does not promise a save that will not happen
- [ ] A reader who stakes N positions and signs in either gets all N saved, or is told before signing in which will not survive
- [ ] A test drives the real path end to end (anonymous stake → sign-in through the app → row exists as theirs) and **fails when the restore loop is removed**
- [ ] `e2e/integration/p458-auth-callback-position.spec.ts` either exercises `AuthCallbackPage` or is renamed to say what it actually covers
- [ ] The describe block "Position auto-save after existing user login" either asserts the position or is renamed
- [ ] No console errors during the anonymous-stake and sign-in flows
