---
status: all-done
type: bug
rank: 1000937
severity: low
workstream: C1
date_reported: '2026-06-23'
created_date: '2026-06-23'
completed_at: '2026-06-23'
tags: [mobile, pwa, safe-area, live, ios]
delivery_stage: fix
pipeline_ran: [create-bug]
---

# P961: /live RecordingIndicator overlaps top nav on notched iOS (safe-area-inset-top)

> **Resolved as part of P956.** Originally deferred from P956, this was folded back in when
> the fix was widened into a comprehensive safe-area sweep. The `RecordingIndicator` offset in
> `live-mode-view.tsx:69,77` was changed to `top-[calc(4rem+env(safe-area-inset-top))] lg:top-[calc(5rem+env(safe-area-inset-top))]`
> on the `feature/p956-safe-area-viewport` branch. No separate work remains. See P956.

## Summary

On `/live`, the `RecordingIndicator` uses `sticky top-16 lg:top-20` — it assumes a 4rem/5rem top-nav height. After P956 enabled `viewport-fit=cover`, the top nav grows by `env(safe-area-inset-top)` on notched iOS devices, so the recording indicator overlaps the nav bar by the inset amount during a live session.

## Root Cause

`src/app/components/partners/live-mode-view.tsx:69` and `:77` pin the recording indicator at `sticky top-16 lg:top-20`. P956 changed the effective nav bottom edge to `calc(4rem + env(safe-area-inset-top))` (mobile) / `calc(5rem + env(safe-area-inset-top))` (desktop). The indicator's fixed `top-16`/`top-20` no longer tracks the nav's bottom edge on notched iOS.

This is the deferred third surface from P956's code review (the first two — `full-article-page.tsx`, `ChatContextHeader.tsx` — were fixed in P956). `/live` was deferred because it carries a two-party E2E coverage requirement (`.claude/rules/live.md`) and a distinct layout context (`isLivePage` → `h-screen overflow-hidden`, no `needsTopPadding`), warranting its own verification rather than folding into the P956 fix.

## Reproduction Steps

1. On a notched iPhone, install the PWA and open a `/live` session as a participant.
2. Reach a state where the `RecordingIndicator` is shown.
3. Observe: the indicator banner overlaps the top nav by roughly the status-bar inset height.

**Reproduction rate:** notched iOS standalone PWA only; 0 on Android/desktop (inset = 0).

## Expected Behavior

The recording indicator sits flush below the top nav's bottom edge on all devices, including notched iOS.

## Actual Behavior

The indicator overlaps the nav bar by `env(safe-area-inset-top)` on notched iOS.

## Affected Files

- `src/app/components/partners/live-mode-view.tsx` — lines 69, 77 (`sticky top-16 lg:top-20`)

## Severity

**Low** — cosmetic, iOS-notched-PWA-only, narrow surface (only while the recording indicator is visible during a live session).

## Fix Approach

Replace `top-16 lg:top-20` with `top-[calc(4rem+env(safe-area-inset-top))] lg:top-[calc(5rem+env(safe-area-inset-top))]` (same pattern P956 applied to the other surfaces). Verify on `/live` with a notched-iOS context; respect the two-party E2E coverage rule.

## Acceptance Criteria

- [ ] RecordingIndicator sits flush below the top nav on notched iOS (no overlap)
- [ ] No visual change on Android/desktop (inset = 0)
- [ ] `/live` two-party flow unaffected
