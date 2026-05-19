---
status: week
type: bug
rank: 1000766
severity: high
workstream: letter
date_reported: '2026-05-19'
created_date: '2026-05-19'
tags:
  - letter
  - regression
  - p846
  - sticky
  - progress-bar
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P848: Letter progress bar not actually sticky during scroll (P846 follow-up)

## Summary

The progress bar on `/letter/*` scrolls away with the page content instead of staying pinned. P846 added `position: sticky` to the bar's wrapper and shipped, but the sticky behavior does not engage in the actual layout — the bar moves with the rest of the page when the user scrolls through a story.

## Root Cause

**Hypothesis (to be confirmed by `/reproduce`):** The bar's sticky declaration (`sticky top-0 z-20 bg-background py-2` at `letter-flow-content.tsx:181`) names `[data-letter-scroll]` (P777's `overflow-y-auto` scaffold at `letter-reading-page.tsx:1136-1142`) as its scroll ancestor. But the outer wrapper uses `min-h-[100dvh]` rather than a bounded height, so when story content + drawer clearance pushes the page taller than the viewport, the WINDOW scrolls — not `[data-letter-scroll]`. `position: sticky` on an element whose declared scroll ancestor is not the one actually scrolling is a no-op: the element scrolls with its container at the window level.

This trap was flagged in the P777 decision text itself ("Code review flagged that `min-h-[100dvh]` lets the outer wrapper grow, so the inner `overflow-y-auto` never fires — the window scrolls instead") but the resolution chose `min-h-[100dvh]` deliberately to avoid the `h-[100dvh]` overshoot from `<main>`'s `pt-16/20`. P846 inherited the trap.

## Invariants

- The progress bar must stay pinned at a fixed viewport y-position during scroll, regardless of whether the window or `[data-letter-scroll]` is the actual scrolling element.
- The bar must sit below the fixed nav (`SimpleNavigation` is `fixed top-0 ... h-16 lg:h-20`), not overlap or hide behind it.
- Fix must not regress P777's bounded scroll scaffold (`/letter/:id` and `/letter/:id/preview` rely on drawer clearance via `pb-[calc(env(safe-area-inset-bottom)+280px)]`).
- The verification canary must measure `getBoundingClientRect().top` of the bar before and after a real scroll. A DOM check for `position: sticky | fixed` on an ancestor is insufficient — that's the gap that let P846 ship broken.

## Reproduction Steps

1. Open any sealed letter as the recipient on prod (e.g., `https://claritypledge.com/letter/<id>?token=<delivery-token>`) — must be signed-in and past the cover.
2. Land on any story phase that has enough content to overflow the viewport (`point-engage` works on mobile widths; `story-revealed` works on most widths).
3. Scroll the page down.
4. Observe: the progress bar moves UP with the rest of the content and disappears off the top of the viewport instead of staying pinned just under the nav.

**Reproduction rate:** 100% (confirmed by user on prod 2026-05-19 against the deployed `useLetterReadingState-d5QtU8G7.js` bundle which contains the `sticky top-0 z-20` class string).

## Expected Behavior

As the user scrolls a letter phase, the progress bar stays pinned at the top of the visible letter area (directly under the fixed nav). Story content slides UP behind the pinned bar. Position awareness ("where am I in this letter") remains visible the entire time.

## Actual Behavior

The progress bar scrolls UP with the rest of the page content and leaves the viewport. The user loses position awareness exactly when they need it (mid-story).

## Affected Files

- `src/app/components/letters/letter-flow-content.tsx` — line 181, sticky wrapper around `LetterProgressBar`. Wrapper currently `<div className="sticky top-0 z-20 bg-background py-2">`. Needs to either (a) switch to `position: fixed` with `top-16 lg:top-20`, or (b) be relocated outside `[data-letter-scroll]` so its scroll context is the window.
- `src/app/pages/letter-reading-page.tsx` — lines 1136-1142 and 1244-1250, the bounded-scroll scaffold from P777. If approach (b) is taken, the bar needs to move to the parent of `[data-letter-scroll]`. If approach (a) is taken, this file is untouched.
- `src/app/pages/letter-preview-page.tsx` — same scaffold as letter-reading-page; same fix must apply if approach (b) is taken.
- `e2e/p846-letter-chrome-cleanup.spec.ts` — the `p846-2` canary at lines 124-158 only checks for a sticky ancestor in the DOM (CSS property level). It passes whether or not the bar is actually pinned during scroll. P848's canary must measure `getBoundingClientRect().top` before vs after `scrollTop = N` and assert equality (within 1-2px tolerance for sub-pixel rendering).

## Severity

**High** — regression of P846's core user value. P846 was filed and shipped specifically to keep the progress bar visible during scroll. The user-visible outcome (bar disappears as you read) is exactly the state P846 was meant to fix.

## Fix Approach

Run `/reproduce` first to confirm the hypothesis and write a real-scroll canary. Then choose between two fix approaches:

**Approach A: `position: fixed` with explicit nav offset.** Simplest, smallest blast radius. Replace `sticky top-0 z-20 bg-background py-2` with `fixed top-16 lg:top-20 left-0 right-0 z-30 bg-background py-2 px-4` (plus a matching `mt-16 lg:mt-20` spacer below to reserve layout space). Escapes the scroll-container ambiguity entirely — fixed always pins to the viewport. Trade-off: requires manual nav-height coordination; if nav height ever changes, this must change too.

**Approach B: Move the bar OUT of `[data-letter-scroll]`.** Render the bar as a sibling of the scroll container, inside the same outer flex column. Then `position: sticky top-0` on the bar would use the page itself (window) as its scroll ancestor, which is what's actually scrolling. Larger blast radius (touches both letter-reading-page.tsx and letter-preview-page.tsx) but no hardcoded nav-height dependency. Also requires passing progress state (currentStoryIndex, totalStories, storyProgress) UP from LetterFlowContent to the parent, which is the data-flow inversion that argued for keeping the bar inside the component in the first place.

`/reproduce` should leave both options open in the artifact; `/fix` picks based on the actual reproduction evidence and any layout constraints the canary surfaces.

## Acceptance Criteria

- [ ] Progress bar's `getBoundingClientRect().top` is identical at `scrollTop = 0` and `scrollTop = 500` (within 2px tolerance) — measured on a real authenticated letter via Playwright
- [ ] Progress bar visibly stays under the nav while the user scrolls a story phase — verified by screenshot at scrollTop=0 AND scrollTop=500, both showing the bar at the same viewport y-position with story content visible below
- [ ] Bar sits below the fixed nav (not behind it, not below the first story card) on both desktop (1280px) and mobile (375px)
- [ ] No regression to P777's drawer clearance — rating drawer at the bottom of `story-rate` phase still reachable by scroll
- [ ] No regression to P846's footer-suppression on `/letter/*` routes
- [ ] New canary test fails BEFORE the fix and passes AFTER — measures bar position across actual scroll, not just sticky ancestor existence
- [ ] No console errors during the letter reading flow
