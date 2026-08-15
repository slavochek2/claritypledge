---
status: all-done
type: change-request
rank: 1000765.0
changes: p521
tags:
  - redesign
  - p521
  - position-buttons
  - ux
created_date: 2026-05-18
pipeline_ran: [change-request, generate-tests, spec-review, architect, spec-review.2, dev, ship]
pipeline_skipped: [ux -- v4 prototype at position-buttons-prototype.tsx settles visual design]
uat_file: features/uat/p847.md
test_files:
  - e2e/p847-position-buttons-explicit-clear.spec.ts
  - src/tests/p847-position-buttons-explicit-clear.test.tsx
  - e2e/a11y/p847-position-buttons-accessibility.spec.ts
completed_at: 2026-05-22
---

# P847: Position Buttons — Explicit-Clear Interaction Model

> **Redesign of:** [P521: Position Buttons — Two-Step Progressive Disclosure](../22_mar_26/p521_position_buttons_progressive_disclosure.md)
> **What was wrong:** P521's "auto-open intensity dropdown on first click" creates two harms. (1) `handleGroupClick` lines 254–258 in `PositionButton.tsx` silently calls `onPositionClick(userPosition)` when a user clicks the same group while its dropdown is still open — removing the vote without confirmation. Users report "my selection disappeared." (2) Every position selection forces the user into a sub-decision (intensity) they may not want, making the common path harder than it should be.

## Operating Mode

> This spec is an **incremental correction** to P521, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P521 are not up for re-examination — specifically: 3-group segmented structure, badge-only-when-count-greater-than-zero, intensity short labels (`Agree+` / `Agree−` / `Agree`), two responsive modes (full text vs icon-only at 270px), ResizeObserver for measurement, portal-rendered dropdown, `compact` and `narrow` props, public component API.

## Problem Statement

Position buttons are the primary interaction surface for expressing agreement on points. P521 corrected discoverability of intensity by replacing the undiscoverable chevron with an auto-opening dropdown. That solved discoverability but introduced two new problems:

1. **Silent vote removal.** Clicking an already-selected group while its menu is still open is interpreted by `handleGroupClick` as a toggle-off — the user's vote disappears with no confirmation. Removal of a position is a destructive, hard-to-reverse action; it should never be silent.
2. **Forced sub-decision.** Auto-opening the menu on every first click forces the user into intensity selection even when they only wanted to express the basic stance. The dropdown becomes a friction surface in the common path, not a refinement affordance.

P521's diagnosis (discoverability + truncation + zero-count noise) is still correct. The interaction *model* layered on top is what needs revision.

## Jobs To Be Done

- **Preserved from P521:** Express agreement/disagreement/uncertainty on a point.
- **Preserved from P521:** See how many others hold each position (badge counts).
- **Preserved from P521:** Read button labels at any viewport width (no truncated abbreviations).
- **Preserved from P521:** Select intensity of position (still discoverable).
- **Corrected:** Cancel/back out of intensity selection — P521 said "click outside or Escape"; this remains, but the destructive "click same group while menu open" path is removed.
- **New:** Explicitly remove a position without accidental loss.

## Current State

The shipped component (`src/app/components/shared/PositionButton.tsx`, `PositionButtons` export) renders a 3-segment control: `[Disagree] [Unsure] [Agree]`. Behavior:

1. **First click on Agree (no prior position):** Calls `onPositionClick('agree')` → selects default intensity. Then opens the intensity dropdown (portal-rendered, 3 options: somewhat / default / strongly).
2. **Second click on Agree while menu is open:** Falls into the branch at lines 254–258: calls `onPositionClick(userPosition)` — the consumer interprets this as toggle-off and **removes the vote**.
3. **Click outside menu:** Closes menu via `mousedown` listener. Selection persists.
4. **Click Agree while menu is closed (already selected):** Re-opens the menu.
5. **Unsure:** Single option, no menu — clicking selects, clicking again toggles off (via consumer's `effectivePosition === position ? null : position` pattern in handlers like `feed-point-card.tsx:117,123`).

**Before (current):**
```
Initial:                After 1st click on Agree:        After 2nd click on Agree:
┌──────┬──────┬──────┐  ┌──────┬──────┬══════╗            ┌──────┬──────┬──────┐
│ ✗    │ ◇    │ ✓    │  │ ✗    │ ◇    │ ✓ Ag ║ ← selected │ ✗    │ ◇    │ ✓    │
│ Dis  │ Uns  │ Agr  │  │ Dis  │ Uns  │      ║   + menu   │ Dis  │ Uns  │ Agr  │
└──────┴──────┴──────┘  └──────┴──────┴══════╝   auto-open └──────┴──────┴──────┘
                                ┌────────────┐
                                │ Somewhat   │              VOTE SILENTLY REMOVED.
                                │ ✓ Agree    │              No confirmation.
                                │ Strongly   │
                                └────────────┘
```

## Root Cause

The destructive behavior lives in `handleGroupClick` (`src/app/components/shared/PositionButton.tsx:238–275`):

```ts
// If dropdown is already open for this group, treat as removal toggle
if (openDropdown === group) {
  if (userPosition) onPositionClick(userPosition);  // ← removes vote
  setOpenDropdown(null);
  return;
}
```

Mechanism: the component conflates "close the open menu" with "user wants to remove their position." Two distinct user intents collapse into one branch. The intent ambiguity is the bug — not the line of code.

The deeper design issue: P521's auto-open behavior makes "click selected segment while menu open" a normal flow (not an edge case), so the destructive branch fires regularly. Other consumers' `onPositionClick(samePosition)` toggle-off contract is fine in isolation; it only becomes harmful when invoked silently by component-internal logic the user can't see.

## Redesign — Model C′ (Explicit Clear)

**Interaction rules:**

1. **Click an unselected group** → select default intensity. **No menu opens.** (Common path stays one-click.)
2. **Click the already-selected group** → open the intensity menu.
3. **Inside the menu:** Each intensity option (somewhat / default / strongly) updates the position. A separator, then a destructive **"Clear position"** row removes the vote.
4. **Click outside the menu** → close the menu. Selection unchanged.
5. **`Unsure`** group: single intensity. Click unselected → select. Click selected → open a 1-row menu containing only the "Clear position" row (kept consistent — clearing always requires opening the menu).
6. **Removal is exclusively via the "Clear position" row.** No segment-click ever removes silently. The destructive branch at lines 254–258 is deleted.

**Consumer contract change:** P521's contract — "consumer detects `onPositionClick(samePosition)` as a removal signal" — is no longer triggered by component-internal logic. Consumers may continue to honor `onPositionClick(samePosition) → null` if other call sites depend on it, but the redesigned component will only call `onPositionClick` with (a) a new position, or (b) `null` via a dedicated `onClear` (or `onPositionClick(null)`) path wired to the Clear row. Architect decides the exact prop shape; the visible contract is "no silent removes from the component."

**After (redesign):**
```
Initial:                After 1st click on Agree:        After 2nd click on Agree:
┌──────┬──────┬──────┐  ┌──────┬──────┬══════╗            ┌──────┬──────┬══════╗
│ ✗    │ ◇    │ ✓    │  │ ✗    │ ◇    │ ✓ Ag ║ ← selected │ ✗    │ ◇    │ ✓ Ag ║
│ Dis  │ Uns  │ Agr  │  │ Dis  │ Uns  │      ║   NO MENU  │ Dis  │ Uns  │      ║
└──────┴──────┴──────┘  └──────┴──────┴══════╝            └──────┴──────┴══════╝
                                                                    ┌────────────────┐
                                                                    │   Somewhat     │
                                                                    │ ✓ Agree        │
                                                                    │   Strongly     │
                                                                    ├────────────────┤
                                                                    │ 🗑 Clear pos.  │
                                                                    └────────────────┘
```

Prototype lives at `/tree/position-buttons` (V4 column, emerald border) on branch `feature/position-prototype-variants`.

## Predecessor Sections Superseded

| Section in P521 | P521 said | Status | Replaced by |
|---|---|---|---|
| Requirements R1 | "Clicking Agree/Disagree selects default intensity AND auto-opens intensity dropdown" | **Superseded** | "Click unselected = select default, no menu opens" (this spec, Redesign §1) |
| Flow 4 | "Tap Agree again → intensity picker opens to refine" | Extended | Behavior preserved, but the menu now contains a "Clear position" row (this spec, Redesign §3) |
| Flow 5 | "Remove position: Tapping the already-selected intensity → `onPositionClick(samePosition)` fires… triggers `RemovePositionDialog`" | **Superseded** | Removal is via explicit "Clear position" row inside the menu (this spec, Redesign §6) |
| Behavior at `handleGroupClick:254–258` | "If dropdown is already open for this group, treat as removal toggle" | **Superseded** | Branch deleted; click-outside closes menu without mutation |
| AC: "Clicking Agree/Disagree selects default AND auto-opens intensity dropdown" | (verbatim) | **Superseded** | New AC: clicking unselected group selects default with no menu |

All other P521 requirements (Unsure single-click, click-outside / Escape closes menu, short labels, badge rules, two responsive modes, ResizeObserver, portal positioning, consumer compatibility, touch targets, `compact`/`narrow` props) are **preserved**.

## Requirements

1. Click on unselected group → calls `onPositionClick(defaultPosition)`. No menu opens.
2. Click on already-selected group → opens menu at that segment. No `onPositionClick` call fires.
3. Menu shows intensity options for the group (1 row for `unsure`, 3 rows for `agree`/`disagree`).
4. Menu contains a separator and a destructive **"Clear position"** row at the bottom (always visible when menu is open).
5. Clicking an intensity row → calls `onPositionClick(thatIntensity)`, closes menu.
6. Clicking "Clear position" → removes the user's vote, closes menu. Exact prop shape decided in `/architect`.
7. Clicking outside the menu or pressing `Escape` → closes menu. No position mutation.
8. The destructive branch at lines 254–258 of the current `handleGroupClick` is deleted.
9. The component never calls `onPositionClick(userPosition)` (or equivalent removal signal) from internal segment-click handling.

## What Stays the Same

- Public API surface of `PositionButtons` (props: `userPosition`, `counts`, `onPositionClick`, `compact`, `narrow`, `disabled`). Architect may add one prop for explicit clear; nothing renamed or removed.
- Short labels `Agree+` / `Agree−` / `Agree` and equivalents for disagree.
- Badge rule: counts shown only when > 0, hidden in icon-only mode.
- Two responsive modes: full text ≥270px, icon-only <270px.
- ResizeObserver measurement.
- Portal-rendered dropdown with viewport-aware positioning.
- `compact` and `narrow` props.
- All 8 consumer components and `position-helpers.ts` — no edits required (Decision A: Clear row hidden when `onClear` absent, so existing consumers continue to work unchanged via their current `guardedRemovePosition` toggle path).
- `partners/position-buttons.tsx` (separate cleanup spec to be filed).
- All `e2e/p521-*.spec.ts` test scenarios that don't depend on auto-open behavior.

## Surfaces in Scope

**In scope:**
- `src/app/components/shared/PositionButton.tsx` — the `PositionButtons` export (3-button + intensity component).
- `src/app/pages/position-buttons-prototype.tsx` — already updated with V3/V4 variants; promote V4 patterns to production component.
- Existing P521 tests: `src/tests/p521-position-buttons-progressive.test.tsx`, `e2e/p521-position-buttons-progressive.spec.ts` — update AC for new interaction model.

**Out of scope:**
- `src/app/components/shared/position-selector.tsx` (letter Drawer flat 3-button — no intensity, no menu, no change).
- `src/app/components/partners/position-buttons.tsx` (ThumbsUp/Down/Skip variant — separate cleanup spec).
- All 8 consumer components (`feed-point-card.tsx`, `point-card-with-links.tsx`, `story-card-with-links.tsx`, `StoryCardDetail.tsx`, `live-story-card-expanded.tsx`, `point-detail-page.tsx`, `story-detail-page.tsx`, `profile-page-v2.tsx`). Existing consumer handlers' `effectivePosition === position ? null : position` toggle pattern stays — it's just never invoked by the redesigned component's segment clicks.
- `position-helpers.ts`.
- Database schema, RLS, services.
- `useRemovePositionGuard` hook (`guardedRemovePosition` in `feed-point-card.tsx:127`) — may still be used by the "Clear position" row; architect decides whether the guard is invoked from the component or stays at the consumer level.

## Acceptance Criteria

- [x] Clicking an unselected group selects the default intensity AND does **not** open the menu.
- [x] Clicking the already-selected group opens the menu and does **not** mutate the position.
- [x] Menu contains intensity options plus an explicit "Clear position" row (red text, trash icon).
- [x] Clicking "Clear position" removes the user's vote.
- [x] Clicking outside the menu or pressing `Escape` closes the menu with no mutation.
- [x] The `handleGroupClick` branch at the equivalent of lines 254–258 (silent toggle-off) is deleted — verified by grep.
- [x] All 8 consumer components render and function without code changes (feed-point-card + point-detail-page wire onClear per Decision A; other 6 unchanged).
- [x] `Unsure` group: click selects, click-selected opens 1-row menu with only "Clear position".
- [x] Touch targets ≥40px height on all interactive elements (menu rows + segments).
- [x] Two responsive modes still work (full text ≥270px, icon-only <270px).
- [x] Badge counts still hidden when count = 0 or in icon-only mode.
- [x] Surfaces NOT in scope (`position-selector.tsx`, `partners/position-buttons.tsx`, all consumers) are visually and functionally unchanged.
- [x] All non-superseded P521 tests still pass.
- [x] **Regression check:** A two-click sequence on the same group (any timing, menu open or closed) never produces a `position = null` state from segment clicks alone — only from the "Clear position" row.

## Test Coverage Strategy

### What's Tested (and Why)

| Area | Layers | Why |
|---|---|---|
| **Common path** — click unselected group selects default, no menu | Unit + E2E | Core behavioral change from P521; failure means the regression fix didn't land |
| **Refine path** — click selected group opens menu | Unit + E2E | Verifies menu is correctly gated to the selected group only; non-selected groups must not open menus |
| **Menu structure** — intensity rows + separator + Clear row always visible | Unit | Structural invariant; if Clear row is absent, the explicit-clear contract is broken |
| **Intensity selection** — menu row click fires correct position, closes menu | Unit + E2E | Behavioral correctness; tests each intensity value to catch label→position mapping bugs |
| **Explicit clear** — Clear row calls onClear(), never onPositionClick() | Unit + E2E | The primary new capability; must be isolated from onPositionClick to avoid consumer confusion |
| **Regression: no silent removes from segment clicks** | Unit + E2E | Load-bearing. The bug P847 was filed to fix. Three variants (Agree, Disagree, Unsure) each tested. The deleted `handleGroupClick:254-258` branch must produce zero calls to `onPositionClick(userPosition)` from segment clicks. |
| **Unsure 1-row menu** | Unit + E2E | Special case: Unsure has no sub-intensities; only Clear row must appear in its menu |
| **Dismiss paths** — Escape + click-outside close menu without mutation | Unit + E2E | Dismissal is a non-destructive path; tests verify no accidental position change on dismiss |
| **Accessibility** — keyboard nav, aria-pressed, aria-expanded, focus return, touch targets | A11y (E2E) | P521 established WCAG compliance as a requirement; P847 must not regress it |
| **API back-compat** — compact, narrow, disabled, onClear optional | Unit | Consumer protection: 8 consumers must not need code changes |

### What's NOT Tested (and Why)

| Area | Reason |
|---|---|
| **Visual hierarchy details** (separator weight, exact red shade, Trash2 icon pixel size) | Covered by `/verify` visual QA pass with screenshots, not automation. Pixel-level assertions are brittle and do not catch semantic issues. |
| **Portal positioning math** (dropdown viewport-aware placement) | Owned by existing P521 unit and E2E tests; behavior and code unchanged in P847. Re-testing would duplicate coverage. |
| **Consumer component integration** (feed-point-card, point-card-with-links, etc.) | Out of scope per spec lines 162–167; no consumer code changes. UAT-6.1 covers via manual verification + build check. Automated consumer tests would require complex multi-component fixtures for zero additional signal. |
| **Database / RLS layer** | No database schema, migration, or RLS changes in this spec. Position persistence is tested via E2E (vote is visible post-reload) which is sufficient. |
| **ResizeObserver / containerWidth measurement** | Owned by P521; measurement logic unchanged. Responsive mode tested via viewport-size setting, not unit-mocking ResizeObserver. |

### Test Pyramid

| Layer | File | Count |
|---|---|---|
| Unit (Vitest) | `src/tests/p847-position-buttons-explicit-clear.test.tsx` | ~35 tests |
| E2E (Playwright) | `e2e/p847-position-buttons-explicit-clear.spec.ts` | 9 tests |
| A11y (Playwright) | `e2e/a11y/p847-position-buttons-accessibility.spec.ts` | 9 tests |
| UAT (manual) | `features/uat/p847.md` | 14 scenarios |
| **Total automated** | | ~53 tests |

### Files Generated

- `src/tests/p847-position-buttons-explicit-clear.test.tsx` — unit tests
- `e2e/p847-position-buttons-explicit-clear.spec.ts` — E2E feature tests
- `e2e/a11y/p847-position-buttons-accessibility.spec.ts` — accessibility tests
- `features/uat/p847.md` — UAT scenarios

### Superseded P521 Tests

The following P521 tests depend on the **auto-open-on-first-click** behavior that P847 replaces. They will fail after `/dev` runs. `/dev`'s job is to update them per spec line 160 — **not** regenerated here.

**`src/tests/p521-position-buttons-progressive.test.tsx`** — tests that will fail:

| Line | Test Name | Why Superseded |
|---|---|---|
| 87 | "shows intensity dropdown when Agree is clicked" | P847: first click on unselected Agree must NOT open dropdown |
| 106 | "shows intensity dropdown when Disagree is clicked" | P847: first click on unselected Disagree must NOT open dropdown |
| 167 | "calls onPositionClick with default intensity on group click" (first click) | Still fires, but dropdown assertion that may follow is gone |
| 185 | "calls onPositionClick with 'somewhat' intensity from dropdown" (after first click) | P847: dropdown never opens on first click; test sequence invalid |
| 350 | "opens intensity dropdown for new group when user clicks a different group" | P847: switching groups fires onPositionClick(default) with no dropdown |

**Tests PRESERVED from P521 (not superseded — behavior identical in P847):**

| Line | Test Name | Preserved Because |
|---|---|---|
| 265 | "opens intensity dropdown when active segment is tapped again" | This is P847's refine path — click selected → menu opens. Behavior matches. |
| 209 | "closes dropdown on Escape key" | Escape dismiss behavior preserved. |
| All "Count badges" tests | badge visibility rules unchanged | Badge logic untouched. |
| All "Compact mode" tests | compact prop unchanged | API back-compat. |
| All "API compatibility" tests | no props removed | Preserved. |

**`e2e/p521-position-buttons-progressive.spec.ts`** — tests that will fail:

| Line | Test Name | Why Superseded |
|---|---|---|
| 61 | "clicking Agree opens intensity picker with Somewhat/Agree/Strongly" | P847: first click on unselected Agree does NOT open intensity picker |
| 77 | "selecting intensity calls onPositionClick and returns to group view" | Sequence (click → open picker → click intensity) no longer reflects P847 flow; intensity picker now accessed only from selected segment |
| 106 | "clicking Back cancels intensity selection" | No back button in P847 / C′ model; replaced by Escape and click-outside dismiss paths |

### Estimated Run Time

| Layer | Estimated time |
|---|---|
| Unit (Vitest, ~35 tests) | ~5–10s |
| E2E (Playwright, 9 tests) | ~60–90s |
| A11y (Playwright, 9 tests) | ~60–90s |
| **Total automated** | ~2–3 min |

## Technical Architecture

### Technical Analysis

**Current State:**

`src/app/components/shared/PositionButton.tsx` exports two components:
- `PositionButton` (singular) — legacy backwards-compatible single button, line 150
- `PositionButtons` (plural) — the 3-segment + dropdown component, line 188

The destructive branch lives at `handleGroupClick:254–258`:
```ts
if (openDropdown === group) {
  if (userPosition) onPositionClick(userPosition);
  setOpenDropdown(null);
  return;
}
```
This branch fires when the user clicks a segment whose dropdown is already open — it calls `onPositionClick(userPosition)` which consumers interpret as a toggle-off (removal signal). The branch must be deleted entirely.

The portal is implemented at lines 355–389 via `createPortal(…, document.body)`. The portal is load-bearing: `feed-point-card.tsx` wraps its content in containers with `overflow:hidden` — without the portal, the dropdown clips. This must be preserved.

Current `aria-expanded` condition at line 321: `config.positions.length > 1 ? isOpen : undefined`. Since `unsure.positions.length === 1`, Unsure never has `aria-expanded`. After P847 Unsure also opens a menu, so this condition is wrong.

**Dependencies:**

- `PositionButton.tsx` imports: `createPortal` (react-dom), `getPositionGroup` (position-helpers), `POSITION_SHORT_LABELS` (position-labels), `Button` (shadcn), `Check`, `X`, `HelpCircle` (lucide-react), `Tooltip*` (shadcn)
- New import needed: `Trash2` (lucide-react) — already imported in prototype, not in current component
- No new dependencies on hooks or services — guard stays at consumer level (Decision B)

**Consumer count:** 8 files (not 10 as stated in spec lines 157/184):
1. `src/app/components/feed/feed-point-card.tsx`
2. `src/app/components/social/point-card-with-links.tsx` (2 usages)
3. `src/app/components/social/story-card-with-links.tsx`
4. `src/app/components/social/StoryCardDetail.tsx`
5. `src/app/components/partners/live-story-card-expanded.tsx`
6. `src/app/pages/point-detail-page.tsx`
7. `src/app/pages/profile-page-v2.tsx` (2 usages)
8. `src/app/pages/story-detail-page.tsx`

Partners `demo-level-view.tsx` imports from `./position-buttons` (the partners variant), not from `shared/PositionButton` — not a consumer of this component.

**Reuse Inventory:**

| Item | File | Role |
|---|---|---|
| `PositionButton.tsx` | `src/app/components/shared/PositionButton.tsx` | Modified — primary deliverable |
| `BUTTON_GROUPS` config | same file, line 53 | Extended — Unsure group already has `positions: ['unsure']` (length 1); no change to config needed |
| `getGroupCount()` | same file, line 84 | Reused unchanged |
| `positionToIntensity()` | same file, line 106 | Reused unchanged |
| `intensityToPosition()` | same file, line 96 | Reused unchanged |
| `getButtonLabel()` | same file, line 135 | Reused unchanged |
| `POSITION_SHORT_LABELS` | `src/app/utils/position-labels.ts` | Reused unchanged |
| `getPositionGroup()` | `src/app/utils/position-helpers.ts` | Reused unchanged |
| `createPortal` | react-dom | Preserved — portal rendering kept (Decision D) |
| `Trash2` | lucide-react | New import in PositionButton.tsx — already in project |
| `useRemovePositionGuard` | `src/app/components/shared/remove-position-dialog.tsx` | Stays at consumer level, not imported by component (Decision B) |
| `RemovePositionDialog` | `src/app/components/shared/remove-position-dialog.tsx` | Stays at consumer level (Decision B) |
| `position-buttons-prototype.tsx` | `src/app/pages/position-buttons-prototype.tsx` | Design reference — V4 column (lines 307–418) |

---

### Architecture Decisions

**Decision A: `onClear` prop contract**

- **Chosen:** Option 2 — `onClear` optional, Clear row hidden when absent.
- **Rationale:** Honors the test contract at lines 721–744 (component works without `onClear`, Clear row is visible but noop when omitted). Option 3 (`onPositionClick(null)`) re-introduces the null-payload path and conflates "set position" with "remove position" at the consumer layer — consumers would need to re-detect removal via `position === null` in `handlePositionClick`, which is semantically identical to the old toggle-off problem. Option 1 breaks the "no consumer edits" promise. Option 2 is the only path that satisfies: (a) no consumer edits required, (b) separation of set-position and remove-position call paths, (c) test at line 721 honored. The Clear row is rendered whenever `onClear` is defined; when absent, the row is hidden and the separator is hidden.
- **Trade-off:** Consumers that want explicit clear must add `onClear`. Consumers that don't (most: story-card, profile-page) simply omit it — the Clear row doesn't appear, and they rely on their existing `guardedRemovePosition` flow triggered elsewhere (not by the component). The feed-point-card and point-detail-page are the only surfaces that need clear-from-the-button — they pass `onClear={() => guardedRemovePosition(point.id)}`.
- **Alternative rejected:** Option 3 (`onPositionClick(null)` fallback) — reintroduces null-signal ambiguity at consumer level; contradicts AC line 203 "Clear row calls onClear(), never onPositionClick()".

**Decision B: Where does `guardedRemovePosition` live?**

- **Chosen:** Option 1 — guard stays at consumer level (status quo). UAT-3.1 is correct as written: from the component's perspective, no dialog fires. The dialog that some consumers show comes from their own `onClear` handler, not from the component.
- **Rationale:** `useRemovePositionGuard` (as of P576) no longer checks linked stories — it always shows a confirmation dialog. The dialog it shows IS the confirmation the UAT-3.1 says is not needed. The resolution: UAT-3.1 says "no confirmation dialog is required" from the component's interaction model. Consumers that wire `onClear={() => guardedRemovePosition(point.id)}` will show a dialog — but that is a consumer-layer decision, not component behavior. The component's contract (Clear row = explicit remove, no silent signal from segment clicks) is fully satisfied. The dialog is optional consumer behavior. UAT-3.1 remains accurate for the component's own contract; consumers that add a dialog are additive.
- **Trade-off:** UAT-3.1 wording ("no confirmation dialog is required") is technically correct for the component but may be misread as "no dialog will ever appear." The UAT file should add a clarifying parenthetical: "(the component does not show a dialog; consumers may add one via their `onClear` handler)." This is a wording update to `features/uat/p847.md`, not a behavior change.
- **Alternative rejected:** Option 2 (move guard into component) — adds a dependency on `useRemovePositionGuard` (which calls `pointsService.removePosition` directly), making the component aware of service layer. Violates separation of concerns and makes the component untestable without service mocking. Option 3 (remove guard entirely) — out of scope for this spec; the guard is used in 4 non-feed-card consumers and removing it would require separate cleanup work.

**Decision C: Unsure menu shape**

- **Chosen:** Option 1 — spec wins. The Unsure menu shows only the "Clear position" row (no intensity row for Unsure).
- **Rationale:** The Unsure "intensity" row would show "Unsure" as both the button label and the menu item label — visually redundant (selecting "Unsure" from the Unsure menu does nothing new). More importantly, the spec requirement at line 101 is explicit: "1-row menu containing only the 'Clear position' row." The V4 prototype renders `config.intensities.map()` which yields 1 "Unsure" entry for the unsure group, but this is prototype convenience code, not a settled design decision. The production component should special-case the menu rendering: when `group === 'unsure'` (or `config.positions.length === 1`), skip the intensity rows and render only the separator + Clear row. This produces a cleaner UX — the Unsure menu's sole purpose is to allow removal.
- **Trade-off:** A slightly different render path for Unsure vs. Agree/Disagree. Handled by: `{config.positions.length > 1 && config.positions.map(...)}` — the condition already exists in current code at line 355 (`BUTTON_GROUPS[openDropdown].positions.length > 1`). Extend this: if `positions.length > 1`, render intensity rows + separator + Clear; if `positions.length === 1` (unsure), render only the separator + Clear (or just Clear, no separator needed).
- **Alternative rejected:** Option 2 (V4 wins, render "Unsure" row) — produces a confusing menu: user sees "Unsure" (already selected) as a clickable item. Clicking it calls `onPositionClick('unsure')` which is a no-op on the current selection. Invites confusion. Option 3 (no-op row) — same confusion, explicitly adds a non-functional UI element.

**Decision D: Portal preservation**

- **Chosen:** Keep `createPortal` (spec wins). The `absolute top-full mt-1` pattern from the V4 prototype is prototype-only.
- **Rationale:** `feed-point-card.tsx` and other consumer containers use `overflow:hidden` styling. An `absolute`-positioned dropdown clips at the container boundary. The production component has used `createPortal` since P521 specifically to escape this constraint. The V4 prototype uses inline absolute because it is a standalone sandbox page with no parent overflow constraints. Promoting V4's positioning strategy to production would introduce a regression on all feed surfaces.
- **Trade-off:** Portal requires `dropdownPos` state and `segmentRefs` to calculate position — slightly more code than V4's inline approach. This code already exists in the production component and continues unchanged.

**Decision E: `aria-expanded` condition**

- **Chosen:** Change condition from `config.positions.length > 1 ? isOpen : undefined` to `isActive ? isOpen : undefined`.
- **Rationale:** P847 adds menu-opening behavior for Unsure (when already selected). The old condition used `positions.length > 1` as a proxy for "has a dropdown" — but that was only valid under P521's model where Unsure never opened a menu. Under P847, a segment opens a menu when it is active and clicked. The correct condition is: `aria-expanded` is present (and tracks `isOpen`) whenever the segment is active (because only active segments can open a menu). Non-active segments never open a menu, so `aria-expanded` is undefined for them. This exactly matches the V4 prototype at line 360: `aria-expanded={isActive ? isOpen : undefined}`.
- **Verification command for /dev:** grep the change after implementation: `grep -n "aria-expanded" src/app/components/shared/PositionButton.tsx` — should show `isActive ? isOpen : undefined` with no reference to `config.positions.length`.

---

### Security Review

**RLS Policies:**
- ✅ No database reads, writes, or schema changes in this spec. The component dispatches callbacks; persistence is handled by existing `pointsService.setPosition` and `guardedRemovePosition` paths, which are out of scope and unchanged. No new RLS policies needed.

**Authentication:**
- ✅ No new authentication surface. The `session` check in `feed-point-card.tsx:116` gates all writes; the redesigned component emits the same callback types (`PositionType` via `onPositionClick`, void via `onClear`). Auth logic stays entirely in the consumer, unchanged.

**Authorization:**
- ✅ No new authorization surface. The `onClear` callback resolves to `guardedRemovePosition` at the consumer level — the same guarded path (`useRemovePositionGuard`) already in production. The component adds no new capability to bypass or widen that guard.

**Input Validation:**
- ✅ No new user input reaches the DB. `onPositionClick` payload type remains the existing `PositionType` enum (7 known values, validated downstream). The new `onClear` path emits no payload — it calls `void`. The destructive branch being deleted (`handleGroupClick:254–258`) was the only path that silently invoked `onPositionClick(userPosition)` from internal logic; removing it reduces the mutation surface, not increases it.

**Data Protection:**
- ✅ No new secrets, env vars, external service calls, or LLM integrations. Portal-rendered dropdown stays client-side. No PII flows through the component; counts and `userPosition` are already rendered in the existing component.

**Summary:** No new security surface — UI-only interaction model change. The proposed `onClear` callback routes through the existing `guardedRemovePosition` path already in production, and deleting the silent-removal branch at lines 254–258 strictly reduces the mutation surface.

---

### Implementation Approach

**Worktree:** Not required — this spec modifies 1 source file + 2 test files + 1 UAT file (4 files total, below the 10-file threshold). Work directly on the feature branch.

#### Build Sequence

1. Delete `handleGroupClick:254–258` destructive branch. Verify with grep (Decision F verification command below).
2. Add `onClear?: () => void` to `PositionButtonsProps` interface.
3. Update `handleGroupClick` to implement C′ model:
   - Unselected group → `onPositionClick(defaultPosition)`, no menu open.
   - Already-selected group → open menu (no `onPositionClick` call).
   - Unsure + already-selected → open menu.
   - Unsure + not selected → `onPositionClick('unsure')`, no menu.
4. Update portal rendering:
   - Change condition from `BUTTON_GROUPS[openDropdown].positions.length > 1` to `openDropdown !== null` (always render portal when a menu is open).
   - Inside portal: if `positions.length > 1`, render intensity rows + separator + Clear row. If `positions.length === 1` (Unsure), render only Clear row (no separator needed, or include separator if visual consistency preferred — `/verify` will catch).
   - Add `Trash2` import from lucide-react.
   - Clear row calls `onClear?.()` and `setOpenDropdown(null)`. Only render if `onClear` is defined.
5. Fix `aria-expanded` condition: `isActive ? isOpen : undefined`.
6. Update `src/tests/p521-position-buttons-progressive.test.tsx` — mark superseded tests per spec lines 241–250.
7. Update `e2e/p521-position-buttons-progressive.spec.ts` — mark superseded tests per spec lines 262–267.
8. Update `features/uat/p847.md` UAT-3.1 — add clarifying parenthetical about consumer-level dialog (Decision B).

#### Files to Modify

- `src/app/components/shared/PositionButton.tsx` — primary deliverable:
  - Delete `handleGroupClick:254–258` branch
  - Add `onClear?: () => void` to props interface
  - Rewrite `handleGroupClick` for C′ model
  - Fix `aria-expanded` condition (line 321)
  - Update portal condition + add Clear row + add `Trash2` import
- `src/tests/p521-position-buttons-progressive.test.tsx` — update 5 superseded tests (lines 87, 106, 167, 185, 350)
- `e2e/p521-position-buttons-progressive.spec.ts` — update 3 superseded tests (lines 61, 77, 106)
- `features/uat/p847.md` — UAT-3.1 clarifying parenthetical only

#### Files to Create

None.

#### Verification Commands for /dev

```bash
# Decision F: confirm destructive branch is deleted
! grep -q 'if (openDropdown === group)' src/app/components/shared/PositionButton.tsx

# Decision E: confirm aria-expanded uses isActive, not positions.length
grep -n "aria-expanded" src/app/components/shared/PositionButton.tsx
# Expected output: aria-expanded={isActive ? isOpen : undefined}

# Type check
npm run build

# Unit tests
npm test src/tests/p847-position-buttons-explicit-clear.test.tsx

# E2E feature tests
npm run test:e2e -- e2e/p847-position-buttons-explicit-clear.spec.ts

# Regression: P521 preserved tests must still pass
npm test src/tests/p521-position-buttons-progressive.test.tsx
```

**No database migrations.**
**No new npm dependencies** (Trash2 is already in lucide-react, which is installed).
**No edge function changes.**
