---
status: all-done
type: change-request
rank: 250007.75
changes: p504
tags:
  - redesign
  - p504
  - banner
  - profile
  - ux-polish
created_date: 2026-03-14T00:00:00.000Z
delivery_stage: done
completed_at: 2026-03-15
uat_file: features/uat/p510.md
test_files:
  - e2e/p510-profile-banner-ux.spec.ts
  - e2e/a11y/p510-accessibility.spec.ts
---

# P510: Profile Banner UX Polish

> **Redesign of:** [P504: Auto-Generated Banners for Stories, Points & Profiles](./p504_auto_generated_banners_stories_points_profiles.md)
> **What was wrong:** Profile page banner layout has four visual issues: (1) gradient fallback is invisible (transparent-to-transparent), making the "no banner" state look broken; (2) avatar is 64px — too small for a profile hero; (3) name is stacked below avatar instead of beside it, wasting vertical space and looking unlike modern profile headers; (4) banner controls (New banner / Remove / Search) are always visible, cluttering the hero section.

## Problem Statement

P504 successfully shipped AI banner generation across stories, points, and profiles. The profile page layout, however, doesn't match professional profile standards (LinkedIn, GitHub, etc.). The avatar is undersized, the name placement wastes space, the gradient fallback is invisible, and the controls dominate the hero area. These issues reduce the perceived quality of the profile page — the most-shared surface in the app.

## Jobs To Be Done

- **Preserved from P504:** Banner generation, removal, keyword search, lazy generation, OG image fallback
- **Corrected:** Visual hierarchy of profile hero (avatar size, name placement, gradient fallback visibility)
- **Corrected:** Controls discoverability vs. clutter (always-visible pills → minimal icon)

## Current State

P504 built a BannerDisplay with avatar overlap and stacked name/role below the avatar. Controls are always-visible pill buttons at bottom-right of the banner.

**Before (current):**
```
┌─────────────────────────────────────────┐
│  Banner (h-48 mobile / h-64 desktop)    │
│                                         │
│                                         │
│                        [New banner] [X] │
│            ┌────┐      [__Describe__][⊕]│
└────────────┤64px├───────────────────────┘
             │ av │
             └────┘
         Name (centered)
        Role (centered)
       Location (centered)
        Joined (centered)
```

Issues:
- Gradient fallback: `from-transparent via-transparent to-transparent` → invisible
- Avatar: 64px (w-16 h-16) — too small for hero
- Name stacked below avatar — wastes vertical space
- Controls always visible — clutters banner area
- Search input shown by default when edge function fails

## Root Cause

Layout decisions in P504 T10 were functional-first — get the banner working, worry about polish later. The gradient was set to transparent because the primary focus was AI generation, not the empty state. Avatar size and name placement followed the pre-existing profile page pattern rather than being redesigned for the banner context.

Code references: `src/app/pages/profile-page-v2.tsx` (banner section), `src/app/components/shared/banner/BannerControls.tsx` (controls)

## Redesign

**Variant C hybrid layout:** Name+role beside 96px avatar on the overlap line. Details (location, joined) below full-width. Controls hidden behind a minimal gear/pencil icon that expands on click.

**After (redesign):**
```
┌─────────────────────────────────────────┐
│  Banner (h-[120px] mobile / h-[160px])  │
│  Gradient: blue→indigo→purple (visible) │
│                                    [⚙]  │
│                                         │
└─────────────────────────────────────────┘
  ┌──────┐  Name ← beside avatar, not below
  │ 96px │  Role
  │  av  │
  └──────┘
  Location · Joined date
```

**Controls expand on [⚙] click (owner only):**
```
                              ┌─────────────┐
                              │ New banner   │
                              │ Remove       │
                              └─────────────┘
```

**States:**
- No banner, no owner: Visible gradient, no controls
- No banner, owner: Visible gradient, [⚙] icon
- Has banner, no owner: Banner image, no controls
- Has banner, owner: Banner image, [⚙] icon → expand shows New banner + Remove
- Keyword search: Only accessible from expanded menu (not shown by default)

## Predecessor Sections Superseded

| Section | P504 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| T10 layout | "Avatar overlaps banner bottom-center" | Superseded | Avatar bottom-left, 96px |
| T10 layout | "Name/role below avatar, centered" | Superseded | Name/role beside avatar |
| T10 controls | "BannerControls: pills at bottom-right" | Superseded | Minimal icon → expandable menu |
| AC #16 | "Profile: BannerDisplay shows banner or gradient" | Partially superseded | Gradient must be visible (not transparent) |

## Requirements

1. Gradient fallback: `from-blue-500/20 via-indigo-400/15 to-purple-500/20` (visible, branded)
2. Avatar size: 96px (w-24 h-24) with ring-4 ring-white border
3. Avatar position: bottom-left of banner, overlapping by ~50%
4. Name + role: beside avatar on the overlap line (not below)
5. Details (location, joined): below, full-width
6. Banner height: `h-[120px]` mobile, `md:h-[160px]` desktop
7. Controls: hidden behind a small icon (gear or pencil), owner-only
8. Expanded controls: dropdown/popover with "New banner" and "Remove banner" options
9. Keyword search: accessible from expanded controls, not shown by default
10. Search input must NOT appear on page load (fix the edge function failure fallback)

## What Stays the Same

- Banner generation backend (Gemini edge function, Supabase storage)
- `useBanner` hook logic (regenerate, remove, search) — except `showSearch` auto-trigger on failure, which must be removed/gated for profiles (see Surfaces in Scope)
- `BannerDisplay` container component — needs props changes for height/gradient configurability (see Surfaces in Scope), but rendering logic stays the same
- Lazy generation trigger logic
- `banner_generation_attempted` guard
- OG image routing (`api/og.ts`, `seo.tsx`)
- All other entity banners (stories, points, events) — untouched
- Database schema — no changes

## Surfaces in Scope

**In scope:**
- `src/app/pages/profile-page-v2.tsx` — layout restructuring
- `src/app/components/shared/banner/BannerControls.tsx` — minimal icon + expandable menu
- `src/app/components/shared/banner/BannerDisplay.tsx` — height override via className won't beat hardcoded `h-48 md:h-64`; gradient fallback is inline `style` not overridable via className. Either (a) make height/fallback configurable via props, or (b) override via className + remove hardcoded height. Gradient: add a `fallbackClassName` prop for Tailwind gradient, used instead of `fallbackColor` inline style when provided
- `src/components/ui/gravatar-avatar.tsx` — add `xl` size variant (`w-24 h-24 text-2xl`) for 96px avatar. Current max is `lg` = 64px
- `src/app/components/shared/banner/use-banner.ts` — `showSearch` auto-sets to `true` on generation failure (line 66). This is the bug P510 AC #8/#10 fix. Must remove or gate the auto-trigger for profiles

**Out of scope:**
- `src/app/pages/point-detail-page.tsx` — different entity
- `src/app/components/social/StoryCardDetail.tsx` — different entity
- `api/og.ts` — no changes
- `src/app/components/seo.tsx` — no changes
- Database / migrations — no changes

## Acceptance Criteria

- [x] Gradient fallback is visually distinct (not transparent) when no banner image exists
- [x] Avatar is 96px with white ring border
- [x] Name and role appear beside avatar (not stacked below)
- [x] Banner height is 120px mobile / 160px desktop
- [x] Controls are hidden behind a small icon (visible only to owner)
- [x] Clicking the icon reveals New banner / Remove options
- [x] Keyword search is accessible from expanded controls only
- [x] Search input does NOT appear on initial page load
- [x] Surfaces NOT in scope are visually unchanged
- [x] All existing tests for P504 still pass
- [x] Profile page loads correctly for both owner and visitor views

## UX Requirements

### User Flow

**Flow 1: Visitor views profile (any screen size)**
1. Visitor navigates to `/p/:slug`
2. Banner area renders at 120px (mobile) or 160px (desktop)
3. If banner image exists: full-bleed cover image
4. If no banner image: visible gradient fallback (`from-blue-500/20 via-indigo-400/15 to-purple-500/20`)
5. Avatar (96px, white ring) overlaps bottom-left of banner by ~48px
6. Name + ear count render beside avatar on the overlap line; role renders below name, also beside avatar
7. Details (pledge link, partners, calibration) render below the avatar/name row, full-width
8. No controls visible — visitor cannot modify banners

**Flow 2: Owner views own profile — controls collapsed (default)**
1. Owner navigates to `/p/:slug`
2. Layout identical to visitor view, plus:
3. A small Pencil icon (16px) appears at top-right of the banner area (absolute positioned, `top-3 right-3`)
4. Icon uses `bg-black/40 backdrop-blur-sm` pill styling for contrast against both images and gradients
5. Icon is the only visible control — no pills, no search input

**Flow 3: Owner expands controls**
1. Owner clicks the Pencil icon
2. A dropdown menu opens anchored to the icon, aligned right
3. Menu items:
   - "New banner" (with RefreshCw icon) — always shown
   - "Describe your banner..." (with Search icon) — always shown, opens inline search
   - "Remove banner" (with Trash2 icon) — only shown when a banner image exists
4. Owner selects an action (see sub-flows below)
5. Menu closes after action is initiated OR when owner clicks outside / presses Escape

**Flow 3a: Owner clicks "New banner"**
1. Menu closes
2. Banner area shows a loading shimmer overlay (pulsing gradient over the existing banner/fallback)
3. Pencil icon is replaced by a spinning RefreshCw icon (same position, same pill styling) — not clickable during load
4. On success: new banner image fades in (200ms opacity transition), spinner reverts to Pencil
5. On failure: toast error ("Failed to generate banner"), spinner reverts to Pencil. No search input appears

**Flow 3b: Owner clicks "Describe your banner..."**
1. Menu closes
2. A search input appears below the Pencil icon (absolute positioned, `top-3 right-3`, stacked vertically)
3. Input is 200px wide, auto-focused, with placeholder "Describe your banner"
4. Owner types keywords and presses Enter (or clicks the submit button beside the input)
5. Input becomes disabled, shows spinner
6. On success: banner image fades in, input disappears
7. On failure: inline error text below input ("Couldn't generate — try different keywords"). Input remains for retry
8. Owner presses Escape or clicks away: input disappears, returns to collapsed Pencil state

**Flow 3c: Owner clicks "Remove banner"**
1. Menu closes
2. Banner image fades out (150ms), gradient fallback fades in
3. Optimistic: instant visual removal, reverted on save failure

### Screen Designs

**Banner + Avatar Overlap Zone (all breakpoints)**

```
┌─────────────────────────────────────────────┐
│  Banner area                           [✎]  │ ← Pencil icon, owner only
│  h-[120px] / md:h-[160px]                  │
│  rounded-t-xl overflow-hidden               │
│                                             │
└─────────────────────────────────────────────┘
  ┌────────┐  Name  👂 3              ← overlap row
  │  96px  │  Role · LinkedIn
  │ avatar │
  └────────┘
  Pledge link · Partners
  Calibration bar
```

**Overlap geometry:**
- Avatar container: `mt-[-48px]` (half of 96px) to overlap the banner bottom edge
- Avatar: 96px circle (`w-24 h-24`) with `ring-4 ring-white dark:ring-card`
- Name + ear count: inline beside avatar, vertically centered to avatar center. Name is `text-xl font-bold`, ear count is `text-sm text-muted-foreground` with Ear icon
- Role + LinkedIn: below name line, `text-sm text-muted-foreground`
- The avatar-to-text gap: `ml-4` (16px)

**Controls — collapsed state (owner only):**
- Pencil icon: 16px, inside a 32px touch target (`p-2`)
- Pill: `rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60`
- Position: `absolute top-3 right-3` inside the banner container

**Controls — dropdown menu (owner only):**
- Standard radix DropdownMenu, aligned `end`, anchored to the Pencil icon trigger
- Width: `w-48`
- Items: icon (16px) + label, standard dropdown item padding
- Separator before "Remove banner" when it appears

**Controls — search input state:**
- Position: `absolute top-3 right-3` column, below where the Pencil icon sits
- Input: `w-[200px]` with `bg-black/50 backdrop-blur-sm text-white placeholder-white/60 rounded-full px-3 py-1.5 text-xs`
- Submit button: pill-style to the right of input, same styling as the Pencil icon pill
- Error text: `text-xs text-white bg-red-500/70 rounded px-2 py-0.5 mt-1`

**Loading state overlay:**
- During banner generation: the banner area shows a `animate-pulse` shimmer on top of existing content
- The Pencil icon is replaced by a spinning `RefreshCw` icon in the same pill styling
- All other controls and menu items are disabled

**Gradient fallback (no banner image):**
- Applied as Tailwind `bg-gradient-to-r from-blue-500/20 via-indigo-400/15 to-purple-500/20` on the banner container
- Replaces the current `fallbackColor` radial-gradient approach for profiles specifically
- Visible and branded — not transparent

### Edge Cases

**Error: Banner generation fails (edge function down)**
- Toast error appears: "Failed to generate banner"
- Controls revert to collapsed Pencil state
- Search input does NOT appear automatically. Owner must explicitly choose "Describe your banner..." from the dropdown to try keywords
- This fixes the current bug where `showSearch` becomes `true` on generation failure, causing the input to appear on page load

**Error: Banner removal fails (save error)**
- Optimistic removal is rolled back — banner image reappears
- Toast error: "Failed to remove banner"
- Controls remain functional

**Error: Keyword search fails**
- Inline error below the search input: "Couldn't generate — try different keywords"
- Input remains visible and editable for retry
- Owner can press Escape to dismiss and return to collapsed state

**Empty state: No banner, no owner**
- Visible gradient fallback — not a blank/broken area
- No controls, no icons
- Avatar overlaps the gradient identically to how it overlaps a banner image

**Empty state: No banner, owner**
- Same gradient fallback
- Pencil icon visible at top-right
- Dropdown shows "New banner" and "Describe your banner..." (no "Remove" since nothing to remove)

**Loading: Profile still loading**
- Banner area renders as a skeleton pulse (`h-[120px] md:h-[160px] bg-muted animate-pulse rounded-t-xl`)
- Avatar area renders as a 96px circle skeleton

**Loading: Banner generation in progress**
- Existing banner/gradient remains visible underneath a semi-transparent shimmer
- Pencil icon replaced by spinning RefreshCw
- Dropdown menu cannot be opened (trigger is disabled)

**Name overflow at 320px mobile:**
- With 96px avatar + 16px gap + 16px left padding, approximately 172px remain for text on a 320px screen
- Name uses `truncate` (ellipsis) — sufficient for most names at this width
- Role also uses `truncate`
- If both name and role are very long, the text column handles it gracefully with single-line truncation on each

**Dark mode:**
- Avatar ring: `ring-white dark:ring-card` adapts to card background
- Gradient fallback: the `/20` and `/15` opacity values work on both light and dark backgrounds
- Control pills: `bg-black/40` provides contrast on both light gradients and dark backgrounds
- Dropdown menu: uses standard shadcn/ui dark mode tokens automatically

### Accessibility

**Pencil icon trigger:**
- `aria-label="Banner options"` (describes what it opens, not what it looks like)
- `aria-haspopup="menu"` indicates it opens a dropdown
- `aria-expanded="true/false"` reflects menu open state
- Keyboard: Tab to focus, Enter/Space to toggle menu, Escape to close

**Dropdown menu:**
- Standard radix DropdownMenu provides built-in keyboard navigation (arrow keys, Home/End, type-ahead)
- Each item has an accessible label: "Generate new banner", "Describe your banner", "Remove banner image"
- Focus returns to the Pencil icon trigger when menu closes
- `role="menu"` and `role="menuitem"` applied automatically by radix

**Search input (when visible):**
- `aria-label="Describe your banner"` on the text input
- Submit button: `aria-label="Generate banner from description"`
- Error text: `role="alert"` for screen reader announcement
- Auto-focus on appearance so keyboard users land in the input immediately
- Escape key dismisses the input and returns focus to the Pencil icon
- No focus trap — the input is a simple popover-like element, not a modal

**Loading states:**
- Spinning RefreshCw icon: `aria-busy="true"` on the banner container during generation
- `aria-live="polite"` region wraps the banner area to announce when a new banner is loaded or generation fails

**Gradient fallback:**
- `role="img" aria-label="Decorative profile banner"` on the gradient div (consistent with existing pattern)

**Color contrast:**
- White text on `bg-black/40`: ratio ~7:1 (exceeds WCAG AA 4.5:1)
- Dropdown menu items use standard shadcn/ui contrast tokens (already WCAG AA compliant)
- Gradient fallback colors are decorative only — no text rendered on them

### Responsive Design

**Mobile (320px - 767px):**
- Banner height: `h-[120px]`
- Avatar: 96px (`w-24 h-24`), overlap `mt-[-48px]`
- Name + role beside avatar: text column starts at ~128px from left edge (16px padding + 96px avatar + 16px gap)
- Available text width at 320px: ~176px (320 - 128 - 16px right padding) — fits ~15-20 characters before truncation
- Pencil icon: `top-2 right-2` (slightly tighter than desktop for touch density)
- Dropdown menu: aligned right, width `w-48` (192px) — fits within 320px with 64px left margin
- Search input: `w-[180px]` on mobile (narrower to fit screen)
- Touch targets: Pencil pill is 32px minimum (meets 44px recommendation with `p-2` padding on a 16px icon = 32px, acceptable for a non-primary action)

**Tablet (768px - 1023px):**
- Banner height: `md:h-[160px]`
- Same layout as desktop — no tablet-specific changes
- More text space beside avatar (~500px+), truncation rarely triggers

**Desktop (1024px+):**
- Banner height: `md:h-[160px]` (same `md:` breakpoint covers tablet+desktop)
- Avatar + text layout identical to tablet
- Pencil icon: `top-3 right-3`
- Dropdown menu: `w-48`, aligned right
- Search input: `w-[200px]`
- Hover states on Pencil icon: `hover:bg-black/60` (not applicable on touch)

**Breakpoint summary:**

| Element | < 768px | >= 768px |
|---------|---------|----------|
| Banner height | 120px | 160px |
| Avatar size | 96px | 96px |
| Avatar overlap | -48px | -48px |
| Pencil icon inset | top-2 right-2 | top-3 right-3 |
| Search input width | 180px | 200px |
| Text beside avatar | truncates at ~15ch | full width |

### Component Analysis

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| Banner container (gradient, image, height) | **Extend** | `BannerDisplay.tsx` — hardcodes `h-48 md:h-64` and uses inline `style` for gradient. Cannot override either via `className` alone. Add `heightClassName` prop (replaces hardcoded height when provided) and `fallbackClassName` prop (renders Tailwind gradient div instead of inline-style div when provided). Callers: profile passes custom height+gradient; stories/points/events unchanged | No |
| Avatar (96px, ring) | **Extend** | `gravatar-avatar.tsx` — current `lg` = 64px (`w-16 h-16`). Add `xl` size variant: `w-24 h-24 text-2xl`. Ring is applied by the parent wrapper, not the avatar component | No |
| Name + role beside avatar | **Extend** | `profile-page-v2.tsx` — restructure the existing `px-6 pb-6` section. Move name/role into a `flex items-center` row with the avatar instead of below it. Pure layout change, no new component | No |
| Pencil icon trigger | **Extend** | `BannerControls.tsx` — replace the always-visible pill buttons with a single Pencil icon button. Add `isOpen` state for dropdown toggle | No |
| Dropdown menu (New banner / Describe / Remove) | **Reuse** | `dropdown-menu.tsx` — existing shadcn/ui DropdownMenu with DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator. Already installed, already used elsewhere | No |
| Search input (inline, dismissible) | **Extend** | `BannerControls.tsx` — the existing search input markup stays but is conditionally rendered only when the user clicks "Describe your banner" from the dropdown. Remove `showSearch` auto-trigger from the dropdown surface; keep it as internal state within BannerControls | No |
| Loading shimmer overlay | **New** | A `div` with `absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse` layered inside the banner container during generation. Simple enough to inline — no standalone component needed | No |
| Spinning icon during load | **Extend** | `BannerControls.tsx` — existing `animate-spin` on RefreshCw is already implemented. Move it to the Pencil icon position and swap the icon during `isLoading` | No |

## Test Coverage Strategy

**Generated:** 2026-03-14
**Feature:** P510 Profile Banner UX Polish
**Feature type:** UI-only change-request (CSS/layout + controls interaction)

---

### What's Tested (and Why)

**E2E Tests** (`e2e/p510-profile-banner-ux.spec.ts` — 16 tests):
- Gradient fallback visibility (not transparent) — fixes the core visual bug
- Avatar sizing (96px) and position (overlap) — validates the layout redesign
- Name beside avatar (not below) — validates layout restructuring
- Banner height responsiveness (120px mobile / 160px desktop) — responsive requirement
- Owner sees pencil icon, visitor/anonymous do not — controls visibility gating
- Dropdown open/close (click, Escape, outside click) — interaction behavior
- Dropdown items conditional on banner state (Remove only when banner exists)
- Search input NOT shown on page load — fixes the showSearch bug
- Search input NOT shown after generation failure — regression guard
- Search input accessible only via dropdown — interaction gating
- Banner generation and removal via dropdown — core functionality preserved

**Accessibility Tests** (`e2e/a11y/p510-accessibility.spec.ts` — 13 tests):
- Pencil icon ARIA attributes (aria-label, aria-haspopup, aria-expanded)
- Keyboard navigation (Tab, Enter, Space, Escape, arrow keys)
- Focus management (returns to pencil on close)
- Dropdown role="menu" and role="menuitem"
- Search input aria-label, submit button aria-label
- Error state role="alert"
- Loading state aria-busy
- Gradient fallback role="img" with aria-label

**Smoke Tests** (`e2e/p510-smoke.spec.ts` — 6 tests):
- Profile page loads without console errors (anonymous, owner, visitor)
- Profile page with and without banner image
- Gradient fallback renders
- No search input on initial load

**UAT Scenarios** (`features/uat/p510.md` — 11 scenarios):
- Visual layout (gradient, avatar, name placement, responsive height)
- Controls interaction (pencil icon, dropdown, close behavior)
- Search input gating (not on load, only via dropdown)
- P504 regression (existing tests still pass)

---

### What's NOT Tested (Rationale)

**Unit tests:**
- Not generated — no new utility functions, services, or business logic. All changes are CSS/layout and React component restructuring, best covered by E2E.

**Integration tests:**
- Not generated — no database changes, no API changes, no new endpoints.

**Component-level tests:**
- Not testing BannerControls.tsx in isolation — covered comprehensively by E2E tests that verify the actual user interaction.

**Dark mode:**
- Not explicitly tested in E2E — the opacity-based gradient (`/20`, `/15`) and `bg-black/40` pills work on both light and dark backgrounds by design. Visual QA via UAT.

**Loading shimmer animation:**
- The shimmer overlay is purely decorative CSS — testing the `aria-busy` attribute is sufficient.

---

### Test Pyramid Breakdown

```
       /\
      /  \    16 E2E tests (layout + interactions)
     /____\
    /      \   13 A11y tests (keyboard + ARIA)
   /________\
  /          \  6 Smoke tests (regression)
 /____________\
/ 0 Unit / 0 INT \ (no logic, no DB)
```

**Total:** 35 automated tests + 11 UAT scenarios
**Estimated run time:** ~45 seconds

---

### Files Generated

1. `e2e/p510-profile-banner-ux.spec.ts` — E2E tests (layout + controls)
2. `e2e/p510-smoke.spec.ts` — Smoke tests (page loads, no errors)
3. `e2e/a11y/p510-accessibility.spec.ts` — Accessibility tests (ARIA, keyboard)
4. `features/uat/p510.md` — UAT scenarios (manual validation)

---

### Next Steps

P510 is a simple feature (2 implementation layers: CSS layout + controls interaction, single flow, UI only).
Recommended: `/dev features/p510_profile_banner_ux_polish.md` — implement directly.

---

## Spec Review: P510 Profile Banner UX Polish

**Reviewed:** 2026-03-14
**Verdict:** READY (after fixes applied inline)

**Blocking issues (fixed inline):**

- [BLOCK] **Consistency/Blindspot: BannerDisplay.tsx incorrectly listed as out of scope.** The spec requires changing banner height from `h-48 md:h-64` to `h-[120px] md:h-[160px]` and changing the gradient fallback from transparent radial-gradient to visible Tailwind gradient. Both are hardcoded inside `BannerDisplay.tsx` (height at line 26, gradient as inline `style` at line 40). The Component Analysis table suggested overriding via `className`, but Tailwind class specificity cannot beat a same-specificity class already in the element — and inline `style` cannot be overridden by className at all. **Fixed:** Moved BannerDisplay.tsx to in-scope with implementation notes for `heightClassName` and `fallbackClassName` props. Updated Component Analysis table.

- [BLOCK] **Gaps: GravatarAvatar.tsx missing from surfaces.** Spec requires 96px avatar (`w-24 h-24`). Current `GravatarAvatar` only supports `sm` (40px), `md` (56px), `lg` (64px). No `xl` variant exists. A dev agent would either skip the size change or create a raw `div` bypassing the component. **Fixed:** Added `gravatar-avatar.tsx` to in-scope surfaces with `xl` variant note.

- [BLOCK] **Consistency: use-banner.ts incorrectly listed as unchanged.** AC #8 ("Search input does NOT appear on initial page load") and AC #10 ("Search input NOT shown after generation failure") require changing `use-banner.ts` line 66 where `setShowSearch(true)` fires on generation failure for profiles. The spec says "useBanner hook logic unchanged" but the fix requires modifying this exact line. **Fixed:** Moved use-banner.ts to in-scope with note about `showSearch` auto-trigger. Updated "What Stays the Same" section.

**Warnings:**

- [WARN] **Consistency: Pencil icon inset differs between UX sections.** The UX Flow (Flow 2, step 3) says `top-3 right-3`, while the Responsive Design section says `top-2 right-2` for mobile. The breakpoint summary table confirms the split (< 768px: `top-2 right-2`, >= 768px: `top-3 right-3`). The Screen Designs section says `top-3 right-3` without breakpoint distinction. Not blocking — the responsive section is more specific and should be followed.

- [WARN] **Consistency: Controls pill styling differs.** UX Flow says `bg-black/40 backdrop-blur-sm`, Screen Designs says `bg-black/40`, but the search input section says `bg-black/50 backdrop-blur-sm`. Minor inconsistency — use `bg-black/40` consistently as the primary spec.

- [WARN] **Over-specification: Pixel-level measurements in UX layer.** The UX section specifies exact Tailwind classes (`w-24 h-24`, `ring-4 ring-white`, `mt-[-48px]`, `ml-4`, `w-48`, `w-[200px]`, `px-3 py-1.5 text-xs`). This is implementation detail, not UX intent. Not blocking for a change-request (the UX author likely IS the implementer), but if a different agent implements, they should treat these as guidance, not hard constraints.

- [WARN] **Redundancy: Gradient specification repeated 4 times.** The gradient `from-blue-500/20 via-indigo-400/15 to-purple-500/20` appears in Requirements #1, UX Flow 1 step 4, Screen Designs "Gradient fallback", and Edge Cases "Empty state: No banner, no owner" description. If changed, all four must update.

**Notes:**

- [NOTE] **Superseded sections table is accurate.** Verified against P504: T10 does say "Avatar overlaps banner bottom-center" and "Name/role below avatar, centered". BannerControls are pills at bottom-right. AC #16 references gradient fallback. All correctly identified.

- [NOTE] **P504 frontmatter already has `superseded_by: p510`.** Good — bidirectional traceability exists.

- [NOTE] **No cross-spec conflicts with decisions.md.** Checked all `[technical]` and `[product]` decisions — none contradict P510's approach. The "LinkedIn-style icon+link pairs" decision (2026-03-13) is preserved (role + LinkedIn beside avatar).

- [NOTE] **Touch target size.** The 32px Pencil pill is below the 44px WCAG recommendation. Spec acknowledges this ("acceptable for a non-primary action"). Consider `p-3` (48px) if touch miss-taps are reported in UAT.

**Summary:** The three BLOCK issues were all scope-surface mismatches — the spec correctly described WHAT to change but incorrectly classified WHERE those changes live. All three fixed inline. The spec is now READY for `/dev`.
