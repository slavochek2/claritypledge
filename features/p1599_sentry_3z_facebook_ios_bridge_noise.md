---
status: qa
type: bug
rank: 86
severity: low
date_reported: 2026-11-02
created_date: 2026-11-02
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [sentry, observability, noise, in-app-browser]
disclosure: public
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P1599: Facebook iOS in-app browser bridge throw reports to Sentry as our error

## Summary

Sentry issue JAVASCRIPT-REACT-3Z records a TypeError thrown by code Facebook's iOS in-app browser injects into the page, so it appears as an application error on the Sentry list and the `/day` board. Sibling of JAVASCRIPT-REACT-3W, the Android form of this noise class (commit `59cb9273c`).

## Root Cause

The event's frames are `sendDataToNative` called from `processLargestContentfulPaintEvent`, inline in the page document. Both names, and `window.webkit.messageHandlers`, are absent from our source (grep of `src/`, `supabase/`, `index.html`, `public/`; `node_modules` was not scanned). The event is tagged browser Facebook 567 on iOS, mechanism `auto.browser.global_handlers.onerror`. That the injected code is Facebook's is inferred from those tags and frames, not from Facebook documentation.

## Reproduction Steps

1. Open an event page inside the Facebook iOS app's in-app browser.
2. Facebook's injected performance code reads `window.webkit.messageHandlers` where it is absent.
3. Observe: a TypeError reaches Sentry.

**Reproduction rate:** rare, 1 event ever (2026-10-25), 0 users counted. Not reproduced on a device; the evidence is the recorded event.

## Expected Behavior

This exact host-browser throw is dropped before it reaches Sentry. An application error that wraps the same text still reports.

## Actual Behavior

Sentry records `TypeError: undefined is not an object (evaluating 'window.webkit.messageHandlers')`.

## Affected Files

- `src/lib/sentry-filters.ts` — `IGNORED_ERROR_PATTERNS`, passed to `ignoreErrors` in `src/main.tsx`
- `src/tests/p988-reproduce.test.ts` — pattern tests

## Severity

**Low** — no user-visible effect; it is one false alarm for the operator.

## Fix Approach

Add an anchored `ignoreErrors` pattern, as P988's decision allows for host-injected errors (`docs/decisions.md`, P988 [technical]). Sentry tests the bare value and `Type: value` separately, so both forms are pinned in tests. Longer property paths on the same bridge are deliberately not matched: none has been observed, and missing one fails toward reporting.

The fix was built before this spec existed; its branch was renamed to `fix/p1599-sentry-3z-fb-ios-bridge`.

## Acceptance Criteria

- [x] The exact 3Z message, bare and with the `TypeError: ` prefix, is dropped
- [x] An application error wrapping that message still reports
- [x] A different undefined access still reports
- [x] The test for the 3Z message fails when the pattern is removed
