---
status: all-done
type: change-request
rank: 250006.0
workstream: E1
flow: dev
completed_at: "2026-03-24"
changes: p501
created_date: 2026-03-24
tags:
  - redesign
  - p501
uat_file: features/uat/p585.md
test_files:
  - src/tests/understood-badge.test.tsx
  - e2e/p585-understood-badge.spec.ts
---

# P585: Extract shared `<UnderstoodBadge>` component + add ear icon and tooltip

## Problem

The "X understood" pill is copy-pasted across 4 components with inconsistencies:
- **No tooltip** on 2 of 4 surfaces — users see "0 understood" with no explanation of what it means
- **Inconsistent styling** — different color tokens (`text-muted-foreground` vs `text-gray-600`), different sizes (`text-xs` vs `text-sm`), different backgrounds
- **No visual connection** to EarBadge — the per-story `understood_count` and profile-level `ears_count` both track verification events but look unrelated

## Predecessor: P501

P501 unified field name (`verificationCount` → `understoodCount`) and standardized always-show behavior. This change request preserves P501's decisions (always show, even at zero) and addresses the remaining problems (no shared component, missing tooltips, no icon).

### What P501 got right (preserved)
- Unified field name `understoodCount` everywhere
- Always visible, even at zero (documented decision 2026-03-13: "0 is informative, invites action")
- DB column `understood_count` unchanged
- Trigger logic unchanged

## /challenge-prd Resolution

Original P585 scope included hide-at-zero and relabel to "verified." Both were blocked:
- **Hide-at-zero** contradicts two documented decisions (P501 2026-03-13, P269 2026-02-18: "empty state over hidden")
- **Relabel "verified"** splits terminology — entire product says "understood" (DB column, EarBadge, profile, share copy)

**Scoped to option A:** Extract + ear icon + tooltip. No visibility or label changes. This achieves 80% of the value (dedup, clarity via tooltip) at 20% of the risk.

## Current State (4 duplicate pills + 1 inline)

| File | Line | Tooltip | Color | Size |
|---|---|---|---|---|
| `feed-story-card.tsx` | 110 | none | `text-muted-foreground` | `text-xs` |
| `StoryCardDetail.tsx` | 264 | yes | `text-muted-foreground` | `text-sm` |
| `story-card-with-links.tsx` | 313 | yes | `text-gray-600` | `text-sm` |
| `profile-page-v2.tsx` | 1325 | none | `bg-muted` | `text-sm` |
| `live-content-cards.tsx` | 91 | none | inline text | `text-xs` |

## Target State

### New shared component: `<UnderstoodBadge>`

Location: `src/components/ui/understood-badge.tsx`

```tsx
// Always visible (including count=0)
// Shows: 👂 N understood (with tooltip explaining the metric)
<UnderstoodBadge count={story.understoodCount} />
```

Props:
- `count: number` — the `understoodCount` value
- `className?: string` — for spacing overrides
- `size?: 'xs' | 'sm'` — text size variant (default: `sm`)

Tooltip text:
- When count = 0: "No one has verified understanding of this story yet"
- When count > 0: "N person/people verified their understanding in a live session"

### Per-location changes

| Location | Before | After |
|---|---|---|
| **Feed card** (`feed-story-card.tsx`) | Bare pill, no tooltip, `text-xs` | `<UnderstoodBadge size="xs">` with tooltip |
| **Profile stories** (`profile-page-v2.tsx`) | Bare pill, no tooltip, `bg-muted` | `<UnderstoodBadge>` with tooltip |
| **Story detail** (`StoryCardDetail.tsx`) | Pill with tooltip, `text-muted-foreground` | `<UnderstoodBadge>` (tooltip wording unified) |
| **Story card w/ links** (`story-card-with-links.tsx`) | Pill with tooltip, `text-gray-600` | `<UnderstoodBadge>` (tooltip wording unified) |
| **Live content cards** (`live-content-cards.tsx`) | Inline text "N understood" | `<UnderstoodBadge size="xs">` |

### Out of scope
- **VerifyButton** — different interaction pattern (interactive toggle), leave as-is
- **Hide at zero** — contradicts documented "empty state over hidden" principle
- **Relabel to "verified"** — splits terminology from DB column and all other surfaces
- **Footer relocation in feed card** — keep current position

## Build Sequence

1. Create `src/components/ui/understood-badge.tsx` with ear icon, tooltip, size variants
2. Replace pill in `feed-story-card.tsx`
3. Replace pill in `StoryCardDetail.tsx`
4. Replace pill in `story-card-with-links.tsx`
5. Replace pill in `profile-page-v2.tsx`
6. Replace inline text in `live-content-cards.tsx`
7. Update E2E tests (`e2e/p501-understood-pill.spec.ts`) — adjust selectors for new component structure
8. Delete any unused imports/code from old pill pattern

## Acceptance Criteria

- [x] New `<UnderstoodBadge>` component exists with ear icon, "N understood" label, MobileTooltip
- [x] All 4 pill locations replaced with `<UnderstoodBadge>`
- [x] Live content cards uses `<UnderstoodBadge>`
- [x] "0 understood" still visible (with tooltip explaining "No one has verified understanding yet")
- [x] Ear icon (👂) appears on all surfaces, visually linking to profile-level EarBadge
- [x] Consistent styling across all surfaces (same color tokens, same structure)
- [x] Tooltip present on ALL surfaces (was missing on feed card and profile)
- [x] No TypeScript errors (`npm run build`)
- [x] All tests pass (`npm test`)
- [x] E2E tests updated for new component structure

## No DB or Auth Changes

Pure frontend refactor. `understood_count` column, trigger, and service layer unchanged.

## Test Coverage Strategy

**What's Tested:**
- Unit: `UnderstoodBadge` component renders correctly for count=0, positive count, size variants, className, ear icon presence (7 tests)
- E2E: Badge visible with ear icon + tooltip on feed, profile, story detail — both zero and positive counts (5 tests)
- UAT: Visual consistency across surfaces, old pill markup removed, live content cards (5 scenarios)

**What's NOT Tested (rationale):**
- No integration tests — no DB/API changes
- No smoke tests — existing P501 smoke covers page loads, no new routes
- No accessibility tests — tooltip uses existing MobileTooltip pattern (already accessible)
- VerifyButton — out of scope (different interaction pattern)

**Test Pyramid:**
```
     /\
    /  \   5 E2E tests
   /    \
  /______\
 / 7 UNIT \

```

**Total:** 12 automated tests + 5 UAT scenarios
**Estimated run time:** ~20 seconds (unit) + ~45 seconds (E2E)

## Component Strategy

### Component Inventory (relevant subset)

**Design system (`src/components/ui/`):**
- `ear-badge.tsx` — Profile-level ear count badge. Uses `Ear` icon + `MobileTooltip`. Blue pill styling.
- `tooltip.tsx` — shadcn/ui Radix tooltip primitives
- `button.tsx` — Standard button with CVA variants

**Shared (`src/app/components/shared/`):**
- `mobile-tooltip.tsx` — Desktop hover + mobile long-press tooltip. Used by `EarBadge` and 2 of the current pills.
- `VerifyButton.tsx` — Interactive toggle for verification panel. Uses `understoodCount` but different purpose (out of scope).
- `tag-pills.tsx` — Inline pill badges for tags. Similar visual pattern to understood pills.

### Component Map

| Element | Classification | File / Notes |
|---------|---------------|--------------|
| `<UnderstoodBadge>` | **New** — modeled on `EarBadge` | `src/components/ui/understood-badge.tsx` |
| `<MobileTooltip>` | **Reuse** as-is | `src/app/components/shared/mobile-tooltip.tsx` |
| `Ear` icon (lucide) | **Reuse** as-is | Same `Ear` icon used by `EarBadge` |
| Old inline pill (feed-story-card) | **Delete** — replaced by `<UnderstoodBadge>` | `src/app/components/feed/feed-story-card.tsx:108-111` |
| Old pill + tooltip (StoryCardDetail) | **Delete** — replaced by `<UnderstoodBadge>` | `src/app/components/social/StoryCardDetail.tsx:261-266` |
| Old pill + tooltip (story-card-with-links) | **Delete** — replaced by `<UnderstoodBadge>` | `src/app/components/social/story-card-with-links.tsx:307-315` |
| Old pill (profile-page-v2) | **Delete** — replaced by `<UnderstoodBadge>` | `src/app/pages/profile-page-v2.tsx:1323-1326` |
| Old inline text (live-content-cards) | **Delete** — replaced by `<UnderstoodBadge>` | `src/app/components/partners/live-content-cards.tsx:91` |

**Why New (not Extend EarBadge):** `EarBadge` is profile-level (requires `name` prop for personalized tooltip, shows count-only text). `UnderstoodBadge` is per-story (no author name needed, shows "N understood" text, has `size` variant). Different semantic meaning, different props. Sharing the parent component would force awkward conditional logic. Better as a sibling component following the same pattern (Ear icon + MobileTooltip + pill styling).

### Composition Tree

```
<!-- Feed card (feed-story-card.tsx) -->
<div className="mt-2 flex items-center gap-2">
  <UnderstoodBadge count={story.understoodCount} size="xs" />
  <div className="flex-1" />
  <button>Share</button>
</div>

<!-- Story detail (StoryCardDetail.tsx) / story-card-with-links.tsx -->
<div className="flex items-center gap-1 text-sm">
  <UnderstoodBadge count={story.understoodCount} />
</div>

<!-- Profile stories (profile-page-v2.tsx) -->
<div className="flex items-center gap-1 mt-3 text-sm text-muted-foreground">
  <UnderstoodBadge count={story.understoodCount} />
</div>

<!-- Live content cards (live-content-cards.tsx) -->
<p className="text-xs text-muted-foreground mb-3">
  {linkedPointsCount} points linked · <UnderstoodBadge count={story.understoodCount} size="xs" />
</p>
```

### Visual Refinements

**Styling mirrors `EarBadge` pattern** — ensuring visual kinship between the two badges:

| Aspect | EarBadge (profile) | UnderstoodBadge (story) |
|--------|-------------------|------------------------|
| Icon | `Ear` size=12 | `Ear` size=12 (sm) / size=10 (xs) |
| Text | `{count}` | `{count} understood` |
| Colors | `text-blue-700 bg-blue-50 border-blue-200` | `text-blue-700 bg-blue-50 border-blue-200` |
| Shape | `rounded-full px-1.5 py-0.5` | `rounded-full px-1.5 py-0.5` (sm) / `px-1 py-0.5` (xs) |
| Font | `text-xs font-medium` | `text-sm font-medium` (sm) / `text-xs font-medium` (xs) |
| Tooltip | Personalized with author name | Generic per-story explanation |

**Key difference from current pills:** Current pills use gray (`bg-gray-100`, `bg-muted`, `text-gray-600`) — the new badge uses the same blue as `EarBadge`. This creates visual consistency: blue + ear icon = verification metric, regardless of scope (profile or story).

### Extraction Plan

This IS the extraction. The 4 duplicate pills + 1 inline text are consolidated into `<UnderstoodBadge>`:

1. **Create** `src/components/ui/understood-badge.tsx` (new shared component)
2. **Replace** 5 inline pill/text implementations with `<UnderstoodBadge>`
3. **Delete** unused MobileTooltip imports from `feed-story-card.tsx` and `profile-page-v2.tsx` (they didn't have tooltips before — no import to remove; but `StoryCardDetail.tsx` and `story-card-with-links.tsx` had inline MobileTooltip usage that gets replaced)

No other duplications in scope.

### Challenge Notes

> **`/ui` challenges spec (Section: Visual Refinements)**
> The current pills use gray tokens (`bg-gray-100`, `bg-muted`, `text-gray-600`). The spec proposes matching EarBadge's blue styling (`bg-blue-50`, `text-blue-700`). This is a visual change — stories that previously had a muted gray pill will now show a blue-tinted badge.
>
> **Options:**
> A. Use blue styling (match EarBadge) — creates visual kinship between verification metrics
> B. Keep gray styling (match current) — no visual change, just structural extraction
> C. Use muted tokens (`bg-muted`, `text-muted-foreground`) — semantic, adapts to theme
>
> **Recommendation:** A — the whole point of adding the ear icon is visual consistency with EarBadge. Using the same color family reinforces that connection. Gray is what we're replacing.
> **Blocking:** No — proceeding with A unless user prefers otherwise.
