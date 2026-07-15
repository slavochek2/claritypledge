---
status: qa
type: bug
date_resolved: '2026-07-15'
root_cause: "No ignoreErrors pattern matched host-browser-injected throws (Telegram Mini Apps SDK, a browser extension); isChunkError lacked Vite's 'Unable to preload CSS for' string."
resolution: "Added 3 anchored/specific ignore patterns + the Vite CSS-preload string, behind two pure predicates extracted to src/lib/ for testability."
rank: 1000943.0
severity: low
workstream: observability
date_reported: '2026-07-15'
created_date: '2026-07-15'
tags: [sentry, observability, noise-filter, stale-deploy, chunk-error]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p988-reproduce.test.ts
  root_cause: "Gap 1: no ignoreErrors pattern matches the injected Telegram-SDK/extension messages. Gap 2: isChunkErrorMessage lacks Vite's 'Unable to preload CSS for' string."
  confidence: high
  surfaces_in_scope: [sentry-ignore-patterns, chunk-error-boundary]
  surfaces_deferred: []
  reproduced_at: 2026-07-15
---

# P988: Injected third-party errors reach Sentry; CSS preload failure misses the chunk-error path

## Summary

Two independent gaps found during a Sentry backlog triage: (1) errors thrown by third-party code injected into our page (Telegram in-app browser SDK, a browser extension) are reported to Sentry even though no application frame is involved; (2) `ChunkErrorBoundary` does not recognize Vite's `Unable to preload CSS for` message, so a stale-deploy CSS preload failure renders a generic error screen instead of the "New version available" reload prompt.

Prior art on the same subsystem: **P882** added `beforeSend` frame-based filtering for service-worker registration noise (`src/lib/sentry-filters.ts`); **P913** added an expired-token filter in `db-error-logger.ts`. Both established the pattern this spec follows. What they missed: neither covers errors from scripts injected by a host browser, and neither touches the chunk-error boundary.

## Root Cause

**Confirmed** (`/reproduce`, high confidence). Both hypotheses survived a deterministic disproof: replaying every current `ignoreErrors` pattern against the three injected messages yields `NOT CAUGHT` for all three, and replaying the four `isChunkError` fragments against `Unable to preload CSS for /assets/katex-Ceawqfpt.css` yields no match. Canary `src/tests/p988-reproduce.test.ts` fails 4/9 on exactly these four symptoms.

**Testability seams (added during `/reproduce`, behavior-preserving — no fix yet).**
Neither gap was reachable from a test: the `ignoreErrors` array was inline in `main.tsx` (an entry point with side effects) and `ChunkErrorBoundary` is not exported from `App.tsx` (which pulls the whole route tree on import). Two pure predicates were extracted, mirroring the P882 precedent of testable filters in `src/lib/`:
- `IGNORED_ERROR_PATTERNS` + `isIgnoredMessage()` → `src/lib/sentry-filters.ts`; `main.tsx` now passes the imported list to `Sentry.init`.
- `isChunkErrorMessage()` → `src/lib/chunk-error.ts`; `ChunkErrorBoundary.getDerivedStateFromError` now delegates to it.

Extraction verified behavior-preserving: `tsc --noEmit` clean, P882's 7 tests still pass, and the canary's 5 no-regression/false-positive guards pass unchanged.

**Gap 1 — injected third-party noise.**
`Sentry.init` in `src/main.tsx` filters known noise via `ignoreErrors`, but has no pattern for two injected sources observed in production:

- **Telegram Mini Apps SDK** — when a user opens a `/events/*` link from a Telegram chat, Telegram's in-app browser injects its SDK, which throws `Error invoking postEvent: Method not found` and bare `Error: Method not found`. Confirmed not ours: `postEvent` appears nowhere in `src/`, and no Telegram package is in `package.json`.
- **A browser extension** — throws `Invalid call to runtime.sendMessage(). Tab not found.` (`runtime.sendMessage` is a WebExtension API, unavailable to page scripts).

The stack traces are the evidence. Every affected event has **zero application frames** — the only entries are Sentry's own instrumentation wrappers plus a single `<anonymous>:233:41` frame, with `mechanism: auto.browser.browserapierrors.setTimeout` (Sentry's `setTimeout` instrumentation catching a throw from an injected script's timer). Two issues 17 days apart (JAVASCRIPT-REACT-2C, -2M) share the identical `<anonymous>:233:41` location, confirming a single injected script rather than our code.

**Gap 2 — CSS preload not treated as a chunk error.**
`ChunkErrorBoundary.getDerivedStateFromError` (`src/App.tsx:185-188`) matches four stale-deploy messages:

```
'Failed to fetch dynamically imported module'
'Loading chunk'
'Loading CSS chunk'
'Importing a module script failed'
```

Vite's module-preload helper emits a different string — `Unable to preload CSS for /assets/<name>.css` — which matches none of them. The error therefore falls through as a generic error: the user gets a generic failure screen instead of the reload prompt, and the event is reported to Sentry as a bug rather than being handled as an expected post-deploy cache miss.

## Reproduction Steps

**Gap 1 (injected noise):**
1. Open `https://claritypledge.com/events/<any-event-slug>` from inside a Telegram chat (Telegram's in-app browser, Android).
2. Let the page settle.
3. Observe: Sentry receives `Error: Method not found` with zero application frames.

**Reproduction rate:** intermittent — depends on the host browser/extension; 5 events across ~1 month.

**Gap 2 (CSS preload):**
1. Load `/manifesto` (a route whose chunk preloads `katex-*.css`).
2. Deploy a new build so the referenced CSS asset hash no longer exists.
3. With the stale `index.html` still open, navigate so the route lazy-loads.
4. Observe: generic error screen, not the "New version available" reload prompt.

**Reproduction rate:** 100% given a stale tab across a deploy; rare in the wild (1 event).

## Expected Behavior

- **Gap 1:** Errors with no application frame, originating from injected third-party code we cannot fix, are dropped before reaching Sentry. Genuine application errors are unaffected.
- **Gap 2:** A CSS preload failure is recognized as a stale-deploy chunk error and shows the "New version available" reload prompt, consistent with the other four chunk-error messages.

## Actual Behavior

- **Gap 1:** Five Sentry issues (`JAVASCRIPT-REACT-2N`, `-2M`, `-2K`, `-2C`, `-2B`) reporting third-party throws as application errors. Low volume individually, but they dilute the signal in an otherwise-quiet backlog.
- **Gap 2:** `JAVASCRIPT-REACT-2G` — `Error: Unable to preload CSS for /assets/katex-Ceawqfpt.css` on `/manifesto`, reported as a generic error; user sees a generic failure screen with no reload affordance.

## Affected Files

- `src/main.tsx` — lines 36-52, `ignoreErrors` array — no pattern for injected-SDK/extension throws
- `src/App.tsx` — lines 185-188, `ChunkErrorBoundary.getDerivedStateFromError` — missing the Vite CSS-preload message
- `src/lib/sentry-filters.ts` — existing P882 `beforeSend` filter; the reference pattern if frame-based filtering is preferred over message-based

## Severity

**Low** — 0 users impacted across all 6 issues, and each has 1 event. Neither gap breaks a user flow: Gap 1 is reporting hygiene only, and Gap 2 degrades an already-rare stale-deploy path from a good error screen to a mediocre one. Filed because the noise erodes the signal value of a backlog that is otherwise clean enough to read at a glance.

## Fix Approach

**Gap 1** — add message-based patterns to `IGNORED_ERROR_PATTERNS` in `src/lib/sentry-filters.ts`. Message-based is sufficient and safer to reason about than frame-matching here, because each string is verifiably absent from our source:

- `/Error invoking postEvent/i` — Telegram SDK-specific.
- `/Invalid call to runtime\.sendMessage/i` — WebExtension-specific.
- `/^Method not found$/` — anchored. `grep -rn "Method not found" src/ supabase/` returns no hits, so this string cannot originate from our code today. Anchoring prevents it from swallowing a future `...: Method not found` from a real dependency. This is the one pattern with genuine (if small) false-positive risk; the anchor plus a comment naming the risk is the mitigation.

**Gap 2** — add `'Unable to preload CSS for'` to `CHUNK_ERROR_MESSAGES` in `src/lib/chunk-error.ts`. Vite emits this from its module-preload helper; it belongs with the four existing stale-deploy strings.

Follow the P882 precedent of a unit test asserting both directions: noise is dropped, real errors pass through.

## Acceptance Criteria

- [x] A Sentry event with message `Error invoking postEvent: Method not found` is dropped and does not reach Sentry
- [x] A Sentry event with message `Invalid call to runtime.sendMessage(). Tab not found.` is dropped
- [x] A Sentry event with message exactly `Method not found` is dropped
- [x] An application error whose message merely *contains* "Method not found" as a suffix (e.g. `DB error in getFoo: Method not found`) still reaches Sentry — the anchor holds
- [x] An unrelated real application error (e.g. `DB error in getInboxItems: JWT expired`) still reaches Sentry unchanged
- [x] An error with message `Unable to preload CSS for /assets/katex-abc123.css` renders the "New version available" reload prompt, not the generic error screen
- [x] The four pre-existing chunk-error messages still render the reload prompt (no regression)
- [x] Regression tests pass: `src/tests/p988-reproduce.test.ts` (9/9)
- [x] No console errors during the affected flows

## Evidence

- **Canary proven non-vacuous** (not just green): with the P988 pattern lines removed, `src/tests/p988-reproduce.test.ts` reports `4 failed | 5 passed` — one failure per symptom; restored, `9 passed`. The 5 guards hold in both states, so they are not load-bearing on the fix.
- **No regressions:** full suite `234 files passed, 2671 tests passed` (2 files / 19 tests skipped, pre-existing); `tsc --noEmit` clean; P882's 7 filter tests still pass, confirming the `sentry-filters.ts` extraction preserved behavior.
- **Anchor verified against the SDK, not inferred** (code review): Sentry's `eventFilters` integration builds candidates via `getPossibleEventMessages` → `event.message`, `exception.value`, and `"${type}: ${value}"` as **three separate strings**, each tested independently (`.some`). For the bare throw, `exception.value` is exactly `Method not found`, so `/^Method not found$/` matches in production. The anchor rejects only the `DB error in …: Method not found` suffix shape, which is the intent.
- **Render-path ACs** (the two "renders the reload prompt" items) are verified at the predicate level, not by a browser check. Justification: `ChunkErrorBoundary`'s render branch (`hasError && isChunkError` → reload prompt) is **pre-existing and untouched by this diff** — the four legacy messages already route through it in production today. This change only adds a fifth message to the predicate feeding that same branch. Reproducing the render live would require a real deploy plus a stale tab. Code review: 0 HIGH, 0 MEDIUM.
