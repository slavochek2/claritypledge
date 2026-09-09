---
status: all-done
type: bug
disclosure: public
rank: 202
severity: low
date_reported: '2026-07-31'
created_date: '2026-07-31'
tags: [chiang-mai, events, calendar, iframe, loading-state]
pipeline_ran: [create-bug, reproduce, fix]
completed_at: 2026-09-09
---

# P1019: Chiang Mai events calendar shows a blank box while the embed loads

> **Demotion reversed 2026-08-07, same day** — same error as P1028. The event-led funnel is
> **applied** ([goals.md](../../../docs/goals.md)), not frozen; `lean-canvas.md` §active-channel is
> stale. `/chiang-mai` is an event surface on the active channel. Ranked below the funnel
> and consent work because it is a polish defect on one landing, not a leak.





## Summary

`/chiang-mai` renders its cross-origin Google Calendar embed with no loading state, so the calendar area is blank from route commit until Google's embed paints.

## Root Cause

Same pattern as P1017: `chiang-mai-page.tsx:61` renders an `<iframe>` at `h-[calc(100dvh-2.5rem)] min-h-[480px]` with no placeholder. The Suspense fallback in `LazyRoute` (`src/App.tsx:233-242`) covers the lazy chunk fetch only and unmounts before the iframe's own request starts. Nobody owns the window between the two.

Surfaced by P1017's surface audit, not by a user report.

## Reproduction Steps

1. Open a fresh profile or hard-reload with cache disabled — the embed must be cold.
2. Throttle to Fast 3G.
3. Navigate to `/chiang-mai`.
4. Observe the region below the header row.

**Reproduction rate:** 100% on a cold embed.

## Expected Behavior

A centered loader occupies the calendar box until the embed paints, then clears with no layout shift.

## Actual Behavior

The calendar box is blank. Unlike `/intro`, the page does not read as broken — the header row above it carries the logo and a visible "Add this calendar to yours" link, so there is first-party content on screen throughout. Only the embed region is empty.

## Affected Files

- `src/app/pages/chiang-mai-page.tsx:61` — the iframe, no load state

## Severity

**Low** — the page has visible first-party content the whole time, so a visitor sees a working page with one region still filling in. Not a conversion-critical route. Contrast P1017, where the identical defect leaves the entire content area empty on the primary CTA destination.

## Fix Approach

Apply whatever pattern P1017 lands on: overlay a `ClarityLoader` inside a `relative` wrapper, cleared on the iframe's `onLoad`. **Wait for P1017 to ship first** — if the pattern is worth sharing, extract it there and reuse it here rather than writing a second copy.

Do NOT touch the `h-10` header row / `calc(100dvh-2.5rem)` height pairing — the comment at line 60 marks it as deliberately in sync.

## Acceptance Criteria

- [x] A loader is visible in the calendar region from route commit until the embed paints — `src/tests/p1019-chiang-mai-embed-loading.test.tsx` asserts the overlay exists on first render, opaque (`opacity-100`), with `role="status"` and `aria-live="polite"`. It failed before the fix because no overlay existed. A second case covers the breakpoint swap re-covering the overlay (see finding round 1 below); a sixth case (added by the overnight resumption) covers the reverse-transition edge found in round 3.
- [x] Loader clears on load with no layout shift — the overlay is `absolute inset-0` inside a wrapper carrying no sizing of its own, so nothing reflows when it leaves; two vitest cases assert it goes `pointer-events-none opacity-0` on the load event and is removed after the fade backstop. **The `/intro` half of this criterion is now real-browser-verified**: `e2e/p1017-reproduce.spec.ts` (8/8 passing, chromium) directly measures `boundingBox()` before/after the loader clears and asserts `y`/`height` match. **The `/chiang-mai` half is still NOT verified** — no browser check and no 320/375/desktop screenshots of `/chiang-mai` were taken. See the note below.
- [x] The header row and the `calc(100dvh-2.5rem)` height pairing are unchanged — asserted directly: the iframe still carries `h-[calc(100dvh-2.5rem)]` and `min-h-[480px]`, the header still carries `h-10`, and both the home link and the subscribe link still render. The only structural change is the `relative` wrapper the overlay needs. Re-confirmed by codex round 4.
- [x] No console errors during the flow — no console output in the vitest run (6/6) or the e2e run (8/8). `npm run lint` exit 0, `./scripts/typecheck-gate.sh` exit 0.

**Verification note:** capture `/chiang-mai` **per-viewport, never `fullPage`** — `fullPage` capture blanks cross-origin iframes and produces a false "renders nothing" finding (decisions.md, P987 visual-QA capture entry).

## Implementation note — the pattern is extracted, not copied

The Fix Approach said to wait for P1017 and, if the pattern was worth sharing, to extract it there
rather than write a second copy. P1017 shipped inline, so this fix does the extraction:
`src/components/ui/iframe-load-overlay.tsx` now owns the overlay, the fade timing and every
measurement behind it, and both `/intro` and `/chiang-mai` call `useIframeLoadOverlay`.

`intro-page.tsx` is refactored onto it rather than left as a second copy. Its `data-testid`, DOM
shape, class names and timing constants are unchanged, so `e2e/p1017-reproduce.spec.ts` still
targets the same element — but see below.

## Verification still owed before ship

- **`e2e/p1017-reproduce.spec.ts` now RUN and PASSING (8/8, chromium, worktree port 7100).**
  Correction to an earlier draft of this section: the claim that this spec "needs a cold fetch of
  the live Google embed" was inaccurate — every test uses `page.route()` to intercept and hold the
  `calendar.google.com` request itself, so no live network call to Google ever happens; it needs
  only a local dev server, which Playwright's own `webServer` config starts per-worktree
  (`getWorktreePort()`, no collision risk with other concurrent worktrees). This is real-browser
  confirmation that the `/intro` extraction preserved P1017's shipped visible/hidden transitions,
  the no-layout-shift box-geometry check, and the viewport-visibility check at 320×{568,700,900} —
  not just reasoning from an unchanged testId.
- **No browser check and no per-viewport screenshots of `/chiang-mai` were taken** — this is a
  visual change and an overnight worker without a way to independently judge rendered appearance
  cannot tick this. A human (or a session with screenshot/visual-QA tooling) must still capture
  `/chiang-mai` per-viewport (375px, 320px, desktop) before ship, per the Visual QA checklist in
  `.claude/rules/visual-qa.md`. **Never `fullPage`** — see the verification note above.

## Code-review findings (codex, adversarial pass — 3 rounds)

An overnight worker resumed this spec from uncommitted work and ran codex independently three
times, fixing what each round found until a clean pass. All three ran via
`~/.agents/bin/codex-review` against the real diff, not against a description of it.

**Round 1 — verdict REJECT, 2 findings.** One fixed, one recorded as a founder decision (unchanged
from the entry below, kept for continuity):

1. **[NOT fixed — pre-existing P1017 behaviour, and a founder call] There is no timeout BEFORE
   `onLoad`.** If Google never completes the navigation, `embedLoaded` stays false and the opaque
   overlay stays up forever; `FADE_MAX_MS` only bounds the post-load cover. The visitor sees a
   permanent spinner instead of the iframe's own browser error state. This is exactly how P1017
   shipped, and it is a real trade rather than an oversight: a pre-load cap would clear the overlay
   on a slow-but-working embed and hand the visitor back the blank box this whole line of work
   exists to remove.
   [FOUNDER DECISION: on a stalled embed, is a permanent spinner or an early-cleared blank box the
   better failure? Changing it alters shipped `/intro` behaviour, so it is not decided here.]
2. **[Fixed, round 1] The breakpoint swap reloaded the embed with the overlay already gone.**
   `/chiang-mai` swaps WEEK for AGENDA at 768px while the page is open, which points the iframe at
   a new url and starts a fresh navigation — a desktop resize or a phone rotation recreated the
   exact blank interval. This one is introduced by this fix, not inherited: `/intro`'s src never
   changes. The hook took an optional `resetKey`; `/chiang-mai` passes `isDesktop`.

**Round 2 — verdict CHANGES REQUESTED, 1 new HIGH finding.** Round 1's `resetKey` fix used a
passive `useEffect`, which fires only after the browser paints — so the DOM commit carrying the new
(blank) iframe `src` could paint one frame before the effect reset the overlay back to opaque.
**Fixed:** the effect is now `useLayoutEffect`, whose `setState` flushes synchronously before the
browser paints, in the same commit as the new `src`. Round 2 confirmed this closed the round-1
race (`iframe-load-overlay.tsx` `resetKey` effect).

**Round 3 — verdict CHANGES REQUESTED (mis-triggered by the reviewer, real finding underneath),
1 new HIGH finding, since fixed.** `onTransitionEnd` fired unconditionally. The overlay's own
`transition-opacity` runs both directions — forward (100→0) when the embed loads, and in
**reverse** (0→100) when `resetKey` re-covers it mid-fade for a breakpoint swap. The reverse
transition completing also raises `transitionend`, and the unconditional handler read that as "the
fade-out finished" and unmounted the overlay it had just put back up — exposing the new,
still-loading iframe again. **Fixed:** the handler now only dismisses when `embedLoaded` is true
(forward fade only) and checks `e.target === e.currentTarget` to ignore any bubbled event. A new
regression test (`does not dismiss the re-covered overlay on the reverse fade-in transition`)
reproduces the exact sequence; confirmed to FAIL on the unguarded handler (1 failed) and PASS with
the guard (6 passed) — epistemic.md gate 7.

**Round 4 (re-verification of round 3's fix) — verdict PASS, no remaining defect.** Confirmed the
`onTransitionEnd` guard is correct given the actual JSX (no child has its own opacity transition to
bubble), found no further ordering/leak/loop issue under repeated rapid breakpoint crossing, and
confirmed the `h-10` / `calc(100dvh-2.5rem)` pairing is still untouched. **Wrapper note:** the
wrapper script exited 126 ("PASS-type verdict with NO test evidence") on this run, but that is a
false positive in the wrapper's own text scan — it grepped `TEST EVIDENCE: NONE` and matched that
literal string inside the wrapper's OWN appended prompt-discipline instructions (the template line
`TEST EVIDENCE: NONE - <why you could not run anything>`), not the model's actual answer. The
model's real last two lines were `TEST EVIDENCE: `node_modules/.bin/vitest ...` -> 6/6 passed` and
`VERDICT: PASS` — a genuine evidenced pass. Independently confirmed by re-running the same three
checks directly in this worktree: `npx vitest run src/tests/p1019-chiang-mai-embed-loading.test.tsx`
(6/6 passed), `npm run lint` (exit 0), `./scripts/typecheck-gate.sh` (exit 0). Not fixing the
wrapper here — it lives outside this repo (`~/.agents/bin/codex-review`) and is shared
infrastructure, out of this spec's scope.
