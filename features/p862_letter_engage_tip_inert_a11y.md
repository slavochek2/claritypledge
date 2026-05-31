---
status: qa
type: bug
rank: 1000767
severity: low
workstream: letters
delivery_stage: ship
date_reported: '2026-05-31'
created_date: '2026-05-31'
date_resolved: '2026-05-31'
tags: [letters, accessibility, a11y, regression]
pipeline_ran: [fix, ship]
root_cause: "letter-flow-content.tsx gated the post-selection intensity tip row with `aria-hidden={selectedPosition === null}`. The row contains a focusable replay button (\"Show the intensity tutorial again\"). When the row was hidden while that button still held focus, Chrome blocked the aria-hidden and warned: 'Blocked aria-hidden on an element because its descendant retained focus.' Two surfaces had the identical pattern: point-engage (line 514) and remaining-point-engage (line 712)."
resolution: "Replaced `aria-hidden` with the `inert` attribute on both rows. `inert` hides the subtree from assistive technology AND removes its descendants from the focus order, so a focused button never sits inside an aria-hidden ancestor — eliminating the warning without the focus conflict. React 19 renders `inert={false}` as no attribute, so the row stays interactive once a position is selected."
---

# P862: Letter engage tip row triggers aria-hidden focus warning

## Bug Description

**Reported:** 2026-05-31
**Severity:** Low — non-blocking console warning, no user-facing breakage. Accessibility hygiene.

**Symptoms:**
- Chrome DevTools console logs `Blocked aria-hidden on an element because its descendant retained focus. The focus must not be hidden from assistive technology users.` while reading a Clarity Letter in an engage phase.
- Observed on the "Tap your selection twice to adjust intensity" tip row.

**Surface:** `src/app/components/letters/letter-flow-content.tsx`, two engage phases:
- `point-engage` (the tip row at the first point selection)
- `remaining-point-engage` (the same row on subsequent points)

Both wrap the focusable replay `<button>` in a `<div aria-hidden={selectedPosition === null}>`.

**Out of scope (false positive):** `letter-redesign-preview-page.tsx:781` uses `aria-hidden` on a `<p>` text node with no focusable child, and is behind `import.meta.env.DEV` (`/_preview/letter-redesign`, never in production). It cannot trigger the warning and was intentionally excluded.

---

## Acceptance Criteria

- [x] `point-engage` tip row gates with `inert`, not `aria-hidden`, when no position is selected
- [x] `remaining-point-engage` tip row gates with `inert`, not `aria-hidden` (second surface)
- [x] When a position IS selected, neither `inert` nor `aria-hidden` is present (row interactive)
- [x] Regression test asserts both surfaces in both states (RED on `aria-hidden`, GREEN on `inert`)
- [x] No new TypeScript error introduced by the change (`inert` accepted by React 19 div types)
- [x] Existing letter-flow regression tests still pass (p712, p777, p778)

---

## Resolution

**Fixed:** 2026-05-31

**Files changed:**
- `src/app/components/letters/letter-flow-content.tsx` — `aria-hidden={selectedPosition === null}` → `inert={selectedPosition === null}` at both engage surfaces; comment updated to reflect `inert` semantics.
- `src/tests/p862-engage-tip-inert.test.tsx` — new regression test (2 cases, both surfaces, both hidden + selected states).

**Regression test:** `src/tests/p862-engage-tip-inert.test.tsx`
- Verified RED before fix (both surfaces failed `toHaveAttribute('inert')` / had `aria-hidden`), GREEN after.

**Notes:**
- `/reproduce` skipped — root cause self-evident from code and the browser message named the fix; user approved the skip (light path).
- The replay button keeps `disabled={selectedPosition === null}` as a redundant safety layer; `inert` on the parent is the primary gate.
