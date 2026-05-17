---
status: week
type: bug
rank: 1000769.0
severity: low
workstream: letter
date_reported: '2026-05-17'
created_date: '2026-05-17'
tags: [letter, ux, chrome, footer, progress-bar]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P846: Letter chrome cleanup — footer on /letter/* + non-sticky progress bar

## Summary

Two unrelated chrome defects on the letter reading flow: (1) the global site `LegalFooter` renders at the bottom of `/letter/*` routes, redundant after letter-open ToS accept and visually breaks focused reading; (2) the `LetterProgressBar` is not sticky — it scrolls off-screen as the reader moves through the letter, removing their sense of position.

## Root Cause

**Footer:** `src/app/layouts/clarity-landing-layout.tsx:86-90` renders `<LegalFooter />` for every non-landing, non-/live route. The conditional excludes `isLivePage` but has no equivalent exclusion for `/letter/*`. The letter accepts ToS at the cover step (`letter-cover.tsx` flow), making the footer's terms/privacy/about links redundant in this context and adding distracting chrome at the bottom of the reading surface.

**Progress bar:** `src/app/components/letters/letter-flow-content.tsx:181` renders `<LetterProgressBar />` inline at the top of the flow container. The bar has no sticky positioning, so it leaves the viewport as the user scrolls the active phase content. Position awareness ("where am I in the letter") disappears at the moment it matters most — mid-story.

Both surfaces are independent and both fixes are one-line CSS/conditional changes. Separated from the broader P842 letter redesign (which handles design-judgement critiques: reveal weight, hierarchy, grouping) because these two have no design ambiguity.

## Reproduction Steps

**Footer:**
1. Open any letter URL (e.g., `https://claritypledge.com/letter/d533e728-3163-4572-ab20-78230cd7b72c`) as a logged-out recipient
2. Accept ToS at letter cover
3. Scroll to the bottom of any letter phase
4. Observe: global LegalFooter (Terms / Privacy / About / etc.) rendered below letter content

**Progress bar:**
1. Open any letter as above
2. Advance past the cover into the first anti-point screen
3. Scroll the page (if content is long enough to scroll, or on mobile widths)
4. Observe: progress bar scrolls out of view; no indication of position within the letter remains visible

**Reproduction rate:** 100%

## Expected Behavior

- No global footer on `/letter/*` routes — letter chrome is self-contained.
- Progress bar remains visible (sticky to top of the viewport) for the entire duration of the letter reading flow.

## Actual Behavior

- `LegalFooter` renders below letter content on every letter phase, with terms/privacy links the recipient has already accepted.
- `LetterProgressBar` scrolls with the page, leaving the viewport when the reader scrolls active phase content.

## Affected Files

- `src/app/layouts/clarity-landing-layout.tsx` — line 86-90, add `/letter/*` exclusion alongside existing `isLivePage` exclusion
- `src/app/components/letters/letter-flow-content.tsx` — line 181 area, add sticky positioning to the progress bar container

## Severity

**Low** — neither blocks completion of the letter flow; both are polish/chrome corrections. Bundled into one spec because they share surface (`/letter/*`), same scope (chrome corrections, no design ambiguity), and same trivial fix cost.

## Fix Approach

**Footer:** In `clarity-landing-layout.tsx`, extend the `isLivePage` exclusion pattern with a parallel `isLetterPage` check (derived from route prefix `/letter/`). Guard both `<ClarityFooter />` and `<LegalFooter />` against this case. Verify `BottomNav` is also suppressed on `/letter/*` if it isn't already.

**Progress bar:** Wrap or restyle the `LetterProgressBar` container in `letter-flow-content.tsx` with `position: sticky; top: 0; z-10` (Tailwind: `sticky top-0 z-10` plus a background so content scrolling under it remains legible). Verify mobile + desktop both render correctly.

Both fixes are independently verifiable. No data, no migrations, no tests broken — visual diff only.

## Acceptance Criteria

- [ ] On `/letter/*` routes (any phase), no `LegalFooter` or `ClarityFooter` is rendered
- [ ] On `/letter/*` routes, `LetterProgressBar` remains visible at the top of the viewport while the reader scrolls active content (sticky)
- [ ] Existing letter flow behaviour (cover → anti-point → reveal → story → point → completion) is unchanged
- [ ] Non-letter routes (`/`, `/p/:slug`, `/sessions`, etc.) still render their footer as before
- [ ] Mobile width (320px–768px) and desktop width both render the sticky progress bar without overlap glitches
- [ ] No console errors during the letter flow
