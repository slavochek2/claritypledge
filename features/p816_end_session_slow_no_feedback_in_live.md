---
status: in-progress
type: bug
rank: 1000803.0
severity: high
workstream: live
date_reported: '2026-04-25'
created_date: '2026-04-25'
tags: [live, end-session, ux, feedback, perceived-latency]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: src/tests/p816-end-session-feedback.test.tsx
  root_cause: "LiveSessionBanner calls onExit directly with no isEnding state — button never disables, re-entry guard absent. isExiting state exists in clarity-live-page.tsx but is never threaded down to the banner."
  confidence: high
  surfaces_in_scope: [live-session-banner]
  surfaces_deferred: []
  reproduced_at: '2026-04-25'
---

# P816: End Session in /live takes >3s with no feedback, causing repeat clicks

## Summary

Clicking "End Session" inside `/live` produces no visible response for ~3+ seconds. The button has no `disabled`/loading state, so users assume the click was missed and click again multiple times in frustration before the page finally transitions.

## Root Cause

**Confirmed.** `LiveSessionBanner` (`src/app/components/partners/live-session-banner.tsx:60-68`) calls `onExit` directly via a plain `<button onClick={onExit}>` with no loading state:

- no `isEnding` state in the component
- no `disabled` attribute
- no label change ("End Session" → "Ending…")

`clarity-live-page.tsx:392` does have `isExiting` state and sets it to `true` at line 3359 when the exit starts — but this state is **never passed down** through `live-mode-view.tsx` → `LiveHeader` → `LiveSessionBanner`. The banner has no way to know the operation is in flight.

The sibling pattern at `src/app/components/session/active-session-banner.tsx:28-44` has the correct implementation: local `isEnding` state, `disabled={isEnding}`, `'Ending…'` label. `start-clarity-session-button.tsx:162-167` also has the correct pattern. Only `LiveSessionBanner` is missing it.

## Reproduction Steps

1. Sign in as verified user
2. Start or join a `/live` session with a partner (or solo if reproducible there)
3. Once on `/live`, click the "End Session" button in the top-right of the banner (`live-session-banner.tsx`)
4. Observe: no immediate visual change. Button text stays "End Session", no spinner, no opacity change.
5. After ~1–3+ seconds the page navigates away.

**Reproduction rate:** Reported by founder as consistent today (2026-04-25). To confirm rate during `/reproduce`.

## Expected Behavior

Within ~100ms of clicking End Session:
- Button is visibly disabled (opacity drop, cursor change)
- Label changes to "Ending…" or shows a spinner
- Subsequent clicks are no-ops (handler guards on `isEnding`)
- After the RPC resolves, page navigates as today

The absolute end-to-end latency (RPC + navigation) may also be reducible, but the **perceived** latency problem is the no-feedback gap.

## Actual Behavior

- Click registers but produces zero visible UI change
- Button accepts further clicks (no disable)
- User clicks 2–4 more times trying to "make it work"
- Eventually navigation occurs after the first RPC resolves
- Risk: extra clicks may fire duplicate `terminateSession` RPCs (server-side idempotency unverified — `/reproduce` to check)

## Affected Files

- `src/app/components/partners/live-session-banner.tsx:60-68` — the End Session button without feedback (primary surface)
- `src/app/pages/clarity-live-page.tsx` — defines `onExit` handler passed to the banner; runs `terminateSession` flow
- `src/app/components/session/active-session-banner.tsx:28-44, 74-82` — reference implementation with correct feedback pattern (use as template)
- `src/app/components/letters/start-clarity-session-button.tsx:167` — sibling End Session surface (verify it has correct feedback during surface audit)
- `src/hooks/use-terminate-session.ts` — terminate hook; check if it exposes a pending state already
- `src/app/data/api.ts:1130+` — `completeClaritySession` RPC path; measure duration to falsify "click is just slow" vs "feedback is missing"

## Severity

**High** — affects every `/live` session ending, which is a core flow. Multi-click behavior risks duplicate RPC calls and degrades trust in the most emotionally loaded moment of the product (ending a clarity session).

## Fix Approach

Pending `/reproduce`. Likely shape:

1. Add `isEnding` state to `LiveSessionBanner` (or accept `isEnding` as a prop and own the state in `clarity-live-page.tsx` so it can also block other exit paths).
2. Set `disabled={isEnding}`, change label to "Ending…", visually de-emphasize during pending.
3. Wrap `onExit` invocation with `if (isEnding) return; setIsEnding(true); try { await onExit() } finally { setIsEnding(false) }` — though if `onExit` always navigates away on success, the finally is just a safety net.
4. **Surface audit** during `/reproduce`: confirm `start-clarity-session-button.tsx` and `rejoin-prompt.tsx` already have correct feedback (they appear to — verify), and check whether the partner-side End Session path (if separate) needs the same treatment.
5. Falsify: is the RPC itself slower today than a week ago? Measure via DevTools and compare against any recent changes to `completeClaritySession` or its callers. If yes, that's a separate fix layer.

Prior art:
- P512 (precedent for double-click prevention on End Session)
- P769 (atomic terminate RPC)
- P735 (End Session test coverage on `start-clarity-session-button`)

## Acceptance Criteria

- [ ] Within 100ms of clicking End Session in `/live`, the button is visibly disabled (opacity, cursor) and shows pending feedback (label change or spinner)
- [ ] Repeated clicks during pending state do not fire additional `terminateSession` calls (verify in DevTools Network panel: exactly one POST to the terminate RPC per session)
- [ ] End-to-end latency from click to navigation is measured and reported in the spec; if >2s, a follow-up perf ticket is filed
- [ ] No console errors during the End Session flow on either party's screen
- [ ] Surface audit confirms the same feedback pattern exists on every End Session surface (or sibling specs filed for any laggards)
- [ ] Regression test passes: `e2e/p816-end-session-feedback.spec.ts` (asserts button disables and label changes within 100ms of click)
