---
status: backlog
type: bug
rank: 0
severity: low
workstream: letters
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags:
  - letters
  - responsive
  - visual-polish
  - mobile
delivery_stage: create-bug
pipeline_ran:
  - create-bug
---

# P894: Letter results/overview responsive + hierarchy polish (P888 visual QA findings)

## Summary

Three pre-existing presentation defects on `/letter/:id/results` and `/letter/:id/overview`, surfaced by P888's multi-viewport visual QA: confidence-card text wraps at 320px, the overview "You → Them" column header misaligns/fragments at narrow widths, and the results identity row falls back to "Public link letter" with ambiguous hierarchy — possibly even for letters that DO have a delivery.

## Root Cause

Under investigation per item:

1. **Confidence card wrap (results, 320px):** the two-column row inside the story-walk confidence card has no narrow-viewport adaptation — "Not yet rated" breaks to two lines ("Not yet / rated").
2. **Overview collapsed table (375/320px):** the "You → Them" column header right-aligns while its collapsed data rows left-align (375px); at 320px the header itself breaks mid-phrase ("You →" / "Them"), fragmenting the directional-arrow notation that is product vocabulary.
3. **"Public link letter" fallback (results):** `letter-results-page.tsx` renders the fallback when `otherParty` is null (P725 identity row). During P888 visual QA the fallback appeared for a test letter created WITH a delivery to a registered receiver — either the `receiverProfile` resolution silently failed for that data shape, or the fallback is correct and only the visual hierarchy is the issue (label reads as incidental UI text between the back-button row and "Story 1 of 2"). Verify which before fixing.

## Reproduction Steps

1. Log in as a sender with a sealed multi-story letter
2. Open `/letter/{id}/results` at a 320px-wide viewport
3. Observe: "Not yet rated" wraps to two lines in the confidence card (item 1)
4. Open `/letter/{id}/overview` at 375px, then 320px
5. Observe: "You → Them" header/data alignment inconsistency at 375px; header breaks across lines at 320px (item 2)
6. On `/letter/{id}/results` (desktop), observe the identity row area between "Back to Letters" and "Story 1 of 2" (item 3)

**Reproduction rate:** 100% at the stated viewports (evidence screenshots from P888 QA: `~/Screenshots/p888-results-mobile-320.png`, `p888-overview-mobile-375.png`, `p888-overview-mobile-320.png`, `p888-results-desktop-1280.png`)

## Expected Behavior

1. Confidence-card labels render on one line at 320px (or adapt with an intentional stacked layout)
2. "You → Them" stays a single unbroken token at all supported widths; header and data share alignment
3. Letters with a delivery show the recipient identity row ("Letter to {Name}"); the public-link fallback renders only for true public-link letters, with clear visual hierarchy

## Actual Behavior

1. "Not yet rated" wraps to two lines at 320px
2. Header/data alignment diverges at 375px; "You →" / "Them" splits across lines at 320px
3. "Public link letter" rendered for a delivery-backed test letter, styled as incidental small text

## Affected Files

- `src/app/pages/letter-results-page.tsx` — identity row + `otherParty` fallback (item 3; verify `receiverProfile` resolution in `getLetterResults` for sealed letters with deliveries)
- `src/app/components/letters/story-walk.tsx` (or its confidence-card child component) — two-column row layout (item 1)
- `src/app/pages/letter-overview-page.tsx` — collapsed table header alignment (item 2)

## Severity

**Low** — cosmetic/presentation defects with no interaction-flow impact; item 3 needs a quick logic check before being confirmed cosmetic.

## Fix Approach

1. Add narrow-viewport handling to the confidence-card row (e.g., `whitespace-nowrap` with reduced font, or stack label/value below a width threshold)
2. Make "You → Them" non-breaking (`whitespace-nowrap` or `&nbsp;`-joined) and align header with its collapsed data rows; consider dropping the header at 320px
3. First verify `getLetterResults` returns `receiverProfile` for sealed delivery-backed letters; fix the resolution if broken, otherwise promote the fallback's visual hierarchy (group with letter title context)

## Acceptance Criteria

- [ ] At 320px, confidence-card labels ("Not yet rated", "Recipient's confidence") do not wrap mid-phrase
- [ ] "You → Them" renders as one unbroken token at 375px and 320px, aligned consistently with its data rows
- [ ] A sealed letter with a delivery shows the recipient identity row on results, not "Public link letter"
- [ ] True public-link letters still show a clearly-styled public-link indicator
- [ ] No console errors during the affected flows
