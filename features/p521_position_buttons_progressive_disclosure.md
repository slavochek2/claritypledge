---
status: week
type: change-request
rank: 250009.75
changes: none
tags:
  - redesign
  - ux
  - position-buttons
created_date: 2026-03-15
delivery_stage: 4-tests-ready
uat_file: features/uat/p521.md
test_files:
  - src/tests/p521-position-buttons-progressive.test.tsx
  - e2e/p521-position-buttons-progressive.spec.ts
  - e2e/a11y/p521-accessibility.spec.ts
  - e2e/p521-smoke.spec.ts
---

# P521: Position Buttons — Two-Step Progressive Disclosure

> **Redesign of:** `src/app/components/shared/PositionButton.tsx` (no predecessor P-number — evolved through multiple PRs)
> **What was wrong:** The intensity selection mechanism (tiny ChevronDown arrows on Disagree/Agree segments) is undiscoverable — users don't find them. Responsive degradation produces ugly truncated labels ("Dis...", "Ag", "Di") that communicate nothing. Position counts "(0)" add visual noise when zero.

## Problem Statement

Position buttons are the primary interaction surface for expressing agreement/disagreement on points. The current design hides the 7-point intensity system behind a 3x3px dropdown chevron that no user has discovered organically. On narrow screens, progressive label truncation creates cryptic abbreviations. Zero-counts add clutter without information value.

The core 3-group segmented control structure is sound — the interaction pattern layered on top of it is the problem.

## Jobs To Be Done

- **Preserved:** Express agreement/disagreement/uncertainty on a point (core JTBD)
- **Preserved:** See how many others hold each position (social proof)
- **Corrected:** Select intensity of position — currently hidden behind undiscoverable dropdown chevrons
- **Corrected:** Read button labels at any viewport width — currently degrades to meaningless abbreviations
- **New:** Cancel/back out of intensity selection without committing

## Current State

Three-segment control: `[✗ Disagree(0) ▾] [◇ Unsure(0)] [✓ Agree(1) ▾]`

- Clicking a segment selects the default intensity (e.g., Agree → `agree/+2`)
- Tiny `ChevronDown` arrows on Disagree and Agree open dropdown menus with full intensity options
- Counts always shown, even when 0
- Progressive label truncation at 4 breakpoints: full → "Dis..." → "Di" → icon-only

**Before (current — 500px):**
```
┌──────────────┬──────────────┬──────────────────────┐
│ ✗ Disagree(0)│◇ Unsure(0)  │ ✓ Agree(1)     ▾    │
└──────────────┴──────────────┴──────────────────────┘
```

**Before (current — 320px):**
```
┌──────────────────────────────┐
│ ✗(0)  ▾ │ ◇(0) │ ✓(1)  ▾  │  ← cryptic, ugly
└──────────────────────────────┘
```

**Interaction:** Click chevron → dropdown menu appears below with "Strongly Disagree / Disagree / Somewhat Disagree" options.

## Root Cause

1. **Undiscoverable control:** `ChevronDown` is 3x3px (`h-3 w-3`), positioned as a separate `<button>` with `pl-0.5 pr-1.5` padding — visually indistinguishable from button padding. No tooltip or visual hint that it's interactive. Users click the main button area and get default intensity with no indication that finer control exists.

2. **Truncation strategy assumes labels are dispensable:** The progressive truncation system (`POSITION_SHORT_LABELS`, 4-breakpoint CSS) treats "Disagree" → "Dis..." → "Di" → icon as acceptable degradation. In practice, truncated labels are worse than no labels — they look broken.

3. **Zero counts are noise:** `(0)` next to each unused group consumes ~15px per button — space that could hold the actual label on narrow screens.

Code references:
- Chevron: `PositionButton.tsx:314-321` (3x3px ChevronDown button)
- Truncation: `PositionButton.tsx:59-64` (4-level progressive labels)
- Counts: `PositionButton.tsx:229-231` (always shown unless compact)

## Redesign

**Option A: Auto-dropdown with pre-selection.** Validated in prototype at `/tree/position-buttons`.

**Implementation reference:** `src/app/pages/position-buttons-prototype.tsx` — the `ProposedPositionButtons` component contains the working v2 logic. `/dev` should extract this into the real `PositionButton.tsx`, NOT rewrite from scratch.

**Click Agree/Disagree → selects default immediately + auto-opens intensity dropdown:**
```
Step 1: Click Agree
┌──────────────┬──────────────┬══════════════╗
│   Disagree   │    Unsure    ║    Agree     ║ ← highlights immediately
└──────────────┴──────────────╠──────────────╣
                              │ Somewhat     │
                              │ ● Agree  ✓   │ ← pre-selected
                              │ Strongly     │
                              └──────────────┘
                                auto-opens

User can:
• Click away → accepts "Agree" (default)     ← zero extra clicks
• Pick "Strongly" → saves "Strongly Agree"   ← one extra click
• Pick "Somewhat" → saves "Somewhat Agree"   ← one extra click
```

**Confirmed state — shows intensity in button label:**
```
┌──────────────┬──────────────┬══════════════╗
│   Disagree   │    Unsure    ║ ✓ Agree+ 3  ║
└──────────────┴──────────────┴═════════════╝
```
- `Agree+` = Strongly, `Agree−` = Somewhat, `Agree` = default (same for Disagree)
- Active segment: brand blue (bg-blue-600)
- Count as badge, only when > 0
- Tap active segment → dropdown re-opens with current intensity marked

**Responsive — two modes only, no truncation:**
```
≥ 270px available:          < 270px available:
┌─────────┬────────┬───────┐  ┌────┬────┬────┐
│Disagree │ Unsure │ Agree │  │ ✗  │ ◇  │ ✓  │
└─────────┴────────┴───────┘  └────┴────┴────┘
  full text + badges            icon-only, no badges
```
No intermediate "Dis...", "Ag" states. Either full text or icon-only.

**Width measurement:** Component uses `ResizeObserver` internally to measure its own container width. No consumer changes needed — the `PositionButtonsProps` interface stays identical.

**Unsure:** Selects immediately, no dropdown (single option).

**Removal:** Unchanged — `onPositionClick(samePosition)` fires, consumer handles via `useRemovePositionGuard`.

**Responsive behavior:**
- Labels: full text (≥320px) or icon-only (<320px). No intermediate truncation states.
- Intensity picker: "Somewhat / [Group] / Strongly" fits at all widths (3 short words)
- Touch targets: min 40px height (mobile), 44px (desktop) — same as current

## Predecessor Sections Superseded

No formal predecessor spec. The following code patterns in `PositionButton.tsx` are superseded:

| Code Pattern | Current Behavior | Status | Replaced by |
|---|---|---|---|
| `ChevronDown` dropdown trigger | Tiny arrow opens intensity menu | Superseded | Auto-dropdown on group click |
| Separate dropdown trigger button | Click chevron to open, click button for default | Superseded | Whole button opens dropdown + selects default |
| `POSITION_SHORT_LABELS` + 4-breakpoint CSS | "Dis..." / "Di" / icon progressive truncation | Superseded | Full text or icon-only (2 modes, 270px threshold) |
| Count display `({count})` always shown | Zero counts visible | Superseded | Badge pill, only when > 0; hidden in icon-only mode |
| `showDropdown = config.positions.length > 1` | Controls chevron visibility | Superseded | Controls whether auto-dropdown opens |
| `ButtonGroupConfig.labels` (progressive truncation) | 4-level label shortening | Superseded | `shortLabels` with +/− notation (Agree+, Agree−) |

## Requirements

1. Clicking Agree/Disagree selects default intensity immediately AND auto-opens intensity dropdown below the button
2. Clicking "Unsure" selects immediately — no dropdown (single option)
3. Click outside dropdown or press Escape → dropdown closes, default selection stays
4. Active button shows intensity: `Agree+` (strongly), `Agree−` (somewhat), `Agree` (default)
5. Counts shown as badge pill, only when count > 0; hidden in icon-only mode
6. Two responsive modes only: full text (≥270px container) or icon-only (<270px). No truncation.
7. Component measures its own width via `ResizeObserver` — no consumer changes needed
8. All 10 consumer surfaces continue to work without API changes (`userPosition`, `counts`, `onPositionClick`, `compact`, `narrow`)
9. `compact` mode hides badges (same as current)
10. `narrow` mode removes desktop min-width (same as current)

## What Stays the Same

- **Data model:** `PositionType`, `SevenPointCounts`, `PositionButtonGroup` types unchanged
- **API surface:** `PositionButtonsProps` interface unchanged — `userPosition`, `counts`, `onPositionClick`, `compact`, `narrow`
- **Group structure:** 3 groups (Disagree/Unsure/Agree) with same intensity mappings
- **Count aggregation:** `getGroupCount()` logic unchanged
- **`PositionButton` (singular):** Legacy single-button export preserved for backwards compatibility
- **All consumer components:** No changes to story-detail-page, feed-point-card, point-card-with-links, etc.
- **Tooltip integration:** `TooltipProvider` + context-aware text preserved

## Surfaces in Scope

**In scope:**
- `src/app/components/shared/PositionButton.tsx` — main component refactor
- `src/app/pages/position-buttons-prototype.tsx` — update prototype to use refactored component

**Out of scope:**
- All 10 consumer components (story-detail-page, feed-point-card, point-card-with-links, story-card-with-links, StoryCardDetail, live-story-card-expanded, demo-level-view, profile-page-v2, point-detail-page, clarity-chat-page) — they import `PositionButtons` and pass the same props
- `src/app/utils/position-helpers.ts` — utility functions unchanged
- `src/app/components/partners/position-buttons.tsx` — separate live session component, not in scope
- Test files — will be generated by `/generate-tests`

## Acceptance Criteria

- [ ] Clicking Agree/Disagree selects default AND auto-opens intensity dropdown
- [ ] Clicking Unsure selects immediately, no dropdown
- [ ] Click outside or Escape closes dropdown, keeps selection
- [ ] Active button shows `Agree+` / `Agree−` / `Agree` (intensity in label)
- [ ] Counts as badge pill, only when > 0; hidden in icon-only mode
- [ ] No "(0)" counts visible
- [ ] No truncated labels ("Dis...", "Di", "Ag") at any viewport width
- [ ] Two responsive modes: full text (≥270px) or icon-only (<270px). No intermediate states.
- [ ] `ResizeObserver` measures container width — no consumer API changes
- [ ] All existing consumer components render without changes
- [ ] `compact` and `narrow` props still work as documented
- [ ] Touch targets are ≥40px height on mobile
- [ ] Dropdown positions correctly and doesn't clip at narrow widths
- [ ] Existing position-buttons tests updated: `position-buttons-dropdown.test.tsx` (remove chevron assertions) and `position-buttons-7point.test.tsx` (remove truncated label assertions, update count format from `(N)` to badge)

## UX Requirements

### User Flow

**Flow 1: First-time position (Agree/Disagree — two-step)**
1. User views a point → sees 3-segment control: `[Disagree] [Unsure] [Agree]`
2. User taps "Agree" → row transforms to intensity picker: `[Somewhat] [Agree] [Strongly]`
3. User taps intensity (e.g. "Strongly") → position saved, row returns to group view with active highlight
4. Active segment shows: `[✓ Agree •3]` (icon + label + badge if count > 0)

**Flow 2: First-time position (Unsure — one-step)**
1. User taps "Unsure" → position saved immediately (no intensity step)
2. Segment highlights: `[◇ Unsure •2]`

**Flow 3: Cancel intensity selection**
1. User taps "Disagree" → intensity picker appears
2. User taps "← Back" above picker → returns to group view, no position set
3. Alternative: user taps outside the component → returns to group view (same as back)

**Flow 4: Change existing position**
1. User has "Agree" selected → taps "Agree" again → intensity picker opens (to refine)
2. User taps different group (e.g. "Disagree") → intensity picker for Disagree opens
3. After selecting new intensity → old position removed, new position saved, counts updated

**Flow 5: Remove position (consumer-side — unchanged)**
1. User taps their active segment → intensity picker opens
2. In intensity picker, the currently selected intensity is highlighted
3. Tapping the already-selected intensity → `onPositionClick(samePosition)` fires
4. The **consumer** (not `PositionButton.tsx`) detects re-selection of same position and triggers `RemovePositionDialog` via `useRemovePositionGuard` hook. This is existing consumer behavior — `PositionButton.tsx` does NOT handle removal logic.
5. Dialog flow unchanged — this redesign does not modify removal behavior

**Flow 6: Anonymous user**
1. Anonymous user taps group → intensity picker appears (same visual flow)
2. After selecting intensity → position stored locally (localStorage), `AnonPositionCTA` appears
3. No server save — existing anonymous behavior preserved

**Flow 7: Guest in live session**
1. Guest taps group → intensity picker appears
2. After selecting → local highlight only, "sign up to save" hint shown
3. Existing `isGuest` behavior in `live-story-card-expanded` preserved

### Screen Designs

**State 1 — Default (no position)**
```
Wide (≥400px):
┌──────────────┬──────────────┬──────────────┐
│   Disagree   │    Unsure    │    Agree     │
└──────────────┴──────────────┴──────────────┘
  40px height mobile / 44px desktop
  Equal flex-1 segments, border-gray-200
  White bg, gray-700 text, hover:bg-gray-50

Narrow (<320px):
┌────────┬────────┬────────┐
│   ✗    │   ◇    │   ✓    │
└────────┴────────┴────────┘
  Icons only, same touch targets
  Icon opacity-60 (muted when inactive)
```

**State 2 — Intensity picker (replaces row inline)**
```
← Back                          ← 12px text, gray-500, hover:gray-700
┌────────────┬────────────┬────────────┐
│  Somewhat  │  Disagree  │  Strongly  │
└────────────┴────────────┴────────────┘
  How strongly do you disagree?  ← 11px helper, gray-400

  Same container width as State 1
  Same border-gray-200 segmented control
  "← Back" uses ArrowLeft icon (h-3 w-3) + text
  Helper text centered below

Narrow (<320px):
← Back
┌──────────┬──────────┬──────────┐
│ Somewhat │ Disagree │ Strongly │
└──────────┴──────────┴──────────┘
  3 short words fit at all widths — no icon-only needed
```

**State 3 — Confirmed (position selected)**
```
Wide (≥400px), count > 0:
┌──────────────┬──────────────┬══════════════════╗
│   Disagree   │    Unsure    ║ ✓ Agree      3  ║
└──────────────┴──────────────┴═════════════════╝
  Active: bg-blue-600, text-white
  Badge: bg-white/30, min-w-[16px], rounded-full, text-[10px]
  Inactive segments: unchanged (white bg, gray text)

Wide (≥400px), count = 0:
┌──────────────┬──────────────┬══════════════════╗
│   Disagree   │    Unsure    ║ ✓ Agree         ║
└──────────────┴──────────────┴═════════════════╝
  No badge — just icon + label

Narrow (<320px), confirmed:
┌────────┬────────┬═══════════╗
│   ✗    │   ◇    ║  ✓    3  ║
└────────┴────────┴══════════╝
  Icon-only for labels, badge still visible
```

**State 4 — Compact mode (QuotedPoint, live-story-card-expanded)**
```
Compact + narrow:
┌──────────┬──────────┬══════════╗
│ Disagree │  Unsure  ║ ✓ Agree ║
└──────────┴──────────┴═════════╝
  No badges (compact hides counts — same as current)
  Narrower padding: px-2 instead of px-3

Compact intensity picker:
← Back
┌──────────┬──────────┬──────────┐
│ Somewhat │  Agree   │ Strongly │
└──────────┴──────────┴──────────┘
  No helper text in compact mode (save vertical space)
  "← Back" still shown (essential for cancellation)
```

### Edge Cases

**Loading during position save:**
- No change — current behavior has no loading indicator (optimistic update)
- Intensity picker dismisses immediately on selection → group view with active highlight
- If save fails, consumer's existing revert logic handles it (no new error surface needed)

**Error on save failure:**
- No change to error handling — consumers already revert optimistically on failure
- The intensity picker is already dismissed by the time failure occurs
- Future improvement: add error toast at consumer level (out of scope for P521)

**Rapid double-tap:**
- User taps "Agree" → intensity picker → user taps "Somewhat" twice quickly
- Guard: debounce or ignore second click while `onPositionClick` callback is executing
- Prevent intensity picker from re-opening after selection is committed

**Intensity picker open + parent scroll:**
- Intensity picker is inline (not overlay) — scrolls naturally with content
- No z-index or positioning issues (unlike current dropdown which uses portals)

**Intensity picker in tight containers (compact + narrow):**
- "Somewhat / [Group] / Strongly" — 3 words, max ~26 characters
- Fits comfortably at 280px (ultra narrow) — verified: 3 equal segments of ~93px each
- No label truncation needed for intensity picker at any viewport

**Click outside component while intensity picker is open:**
- Dismiss intensity picker → return to group view (no position set)
- Implement via `onBlur` on the container with `tabIndex={-1}` for focusability

**Multiple PositionButtons visible on screen (feed, story detail):**
- Each instance manages its own `intensityFor` state independently
- Opening intensity picker in one does NOT affect others (internal state, not lifted)

**Keyboard interaction during intensity picker:**
- Tab through intensity options, Enter to select, Escape to cancel
- Focus trapped within intensity picker while open
- On cancel (Escape / Back), focus returns to the group button that opened it

### Accessibility

**Screen reader announcements:**
- Group buttons: `aria-label="Disagree"` / `"Unsure"` / `"Agree"` (same as current)
- Active button: `aria-pressed="true"` (same as current)
- Intensity picker: announce "Choose intensity" via `aria-label` on container
- Each intensity option: `aria-label="Somewhat disagree"` / `"Disagree"` / `"Strongly disagree"`
- Back button: `aria-label="Cancel position selection"`
- Count badge: `aria-label="3 positions"` (sr-only, badge is decorative)

**Keyboard navigation:**
- Tab order: Disagree → Unsure → Agree (group view) or Somewhat → Default → Strongly (intensity view)
- Enter/Space: select group → opens intensity picker (or selects Unsure directly)
- Escape: cancel intensity picker → return to group view
- Arrow Left/Right: move between segments within the same row (optional enhancement)

**Focus management:**
- Opening intensity picker: focus moves to first intensity option ("Somewhat")
- Closing intensity picker (Back / Escape): focus returns to the group button that opened it
- Tab past last intensity option: wraps to "← Back" link

**Color contrast:**
- Active state (blue-600 bg, white text): 8.59:1 ratio — passes WCAG AAA
- Inactive state (white bg, gray-700 text): 4.81:1 ratio — passes WCAG AA
- Badge (white/30 on blue-600): decorative, not critical text — acceptable
- All existing contrast ratios preserved

### Responsive Design

**Mobile (320px–767px):**
- Full-width segmented control (`w-full`)
- ≥320px: full text labels ("Disagree", "Unsure", "Agree")
- <320px: icon-only (✗, ◇, ✓) — clean two-state switch, no intermediate truncation
- Touch targets: min-h-[40px] (≥44px recommended, 40px acceptable per spec)
- Intensity picker: full-width, same container — "Somewhat / [Group] / Strongly" fits all widths
- "← Back" link above picker: small touch target (text link) — acceptable for cancel action
- Helper text below: 11px, centered

**Tablet (768px–1023px):**
- Same as mobile layout — segmented control is inherently tablet-friendly
- No special tablet adaptations needed

**Desktop (1024px+):**
- Auto-width (`sm:w-auto`) — buttons sized to content
- Desktop min-width per segment: sm:min-w-[90px] (unless `narrow` prop)
- min-h-[44px] touch targets
- Hover states on all segments (hover:bg-gray-50 inactive, hover:opacity-80 active)
- Tooltip on hover (existing behavior preserved)
- Intensity picker: same inline replacement, auto-width

**Breakpoint summary:**
| Width | Labels | Counts | Intensity picker |
|-------|--------|--------|------------------|
| ≥400px | Full text | Badge when >0 | Full text |
| 320–399px | Full text | Badge when >0 | Full text |
| <320px | Icon only | Badge when >0 | Full text (still fits) |

### Transitions

- Group → intensity picker: CSS opacity cross-fade, 150ms ease-out
- Intensity picker → confirmed group: opacity cross-fade, 150ms ease-out
- Badge appearance: scale-in from 0.8, 200ms ease-out
- No layout shift — intensity picker occupies same container height/width as group view
- If height differs slightly (helper text below), use `max-height` transition to avoid jump

### Component Analysis

| Element | Classification | Notes |
|---------|---------------|-------|
| Segmented control container | **Extend** | Same `rounded-lg border border-gray-200` wrapper — remove `overflow-hidden` workaround, simplify responsive classes |
| Group segment button | **Extend** | Simplify from `SegmentButtonContent` — remove dropdown chevron, remove 4-level progressive labels, keep icon + full label + badge |
| Intensity picker row | **New** | New internal sub-component — 3-button row that replaces group row inline. Uses same segment styling. Internal to `PositionButton.tsx`, not exported. |
| "← Back" cancel link | **New** | Small text link with ArrowLeft icon. Internal to `PositionButton.tsx`. |
| Count badge | **New** | Replaces inline `(count)` text. `min-w-[16px] h-4 rounded-full` pill. Internal styling only. |
| Tooltip integration | **Reuse** | `TooltipProvider` + `Tooltip` + `TooltipContent` unchanged |
| `PositionButton` (singular export) | **Reuse** | Legacy backwards-compatible export — no changes |
| `getGroupCount()` | **Reuse** | Counting logic unchanged |
| `getPositionGroup()` | **Reuse** | Group resolution from position-helpers.ts unchanged |
| `BUTTON_GROUPS` config | **Extend** | Remove `labels` (progressive truncation) object. Keep `label`, `icon`, `defaultPosition`, `positions`, `activeClass`, `inactiveClass`. |
| `POSITION_SHORT_LABELS` | **Remove** | No longer needed — no intermediate truncation states |
| `ButtonGroupConfig.labels` | **Remove** | Progressive truncation config removed |
| `SegmentButtonContent` | **Remove** | Replaced by simpler segment rendering without dropdown awareness |

**Decisions already resolved:**
- Semantic colors (rose/amber) rejected — keep brand blue for active state (design system consistency)
- Intensity picker is internal to component — not a separate exported component
- "← Back" is a text link, not a button — lower visual weight for cancel action

## Test Coverage Strategy

**Files created:**
- Unit tests: `src/tests/p521-position-buttons-progressive.test.tsx` (18 tests)
- E2E tests: `e2e/p521-position-buttons-progressive.spec.ts` (7 tests)
- Accessibility tests: `e2e/a11y/p521-accessibility.spec.ts` (5 tests)
- Smoke tests: `e2e/p521-smoke.spec.ts` (2 tests)
- UAT scenarios: `features/uat/p521.md` (11 scenarios)

**Test pyramid:**
```
       /\
      /  \    7 E2E + 5 a11y
     /____\
    /      \
   / 18 UNIT \
  /____________\
```

**What's tested:**
- Two-step flow (group → intensity → confirm) for Agree and Disagree
- One-step flow for Unsure (immediate selection)
- Cancel via Back button (returns to group view, no position set)
- Change existing position (re-open intensity picker)
- Switch between groups
- Count badge visibility (hidden at 0, shown at >0)
- Compact mode (no badges, no helper text)
- Narrow mode (prop compatibility)
- No truncated labels at any viewport
- API compatibility (all 7 position types, compact, narrow props)
- Keyboard navigation (Enter, Escape)
- ARIA attributes (aria-pressed, aria-label)
- Touch target minimum size (40px)

**What's NOT tested (rationale):**
- Integration tests — no API/DB changes (component-only redesign)
- Click-outside dismiss — implementation detail, covered by unit test for Back button
- CSS transitions — visual, not testable in JSDOM or headless Playwright
- Tooltip content — existing behavior, not changing

**Total:** 32 automated tests + 11 UAT scenarios

## Next Steps

Spec review complete — **READY**. No blocking issues. WARNs fixed inline (removal flow clarified, color contradiction resolved, test update scope specified).

Skipped: /architect — component-internal refactor, no DB/auth/API/route changes.

Run `/dev features/p521_position_buttons_progressive_disclosure.md` in worktree.
