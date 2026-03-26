---
status: today
type: change-request
rank: 1000028.0
changes: p551
tags:
  - redesign
  - p551
  - docs
  - design-system
created_date: 2026-03-26T00:00:00.000Z
---

# P590: Clarity Docs — Design System + Visibility Model Fix

> **Redesign of:** [P551: Clarity Docs — Curated Story Collections](features/p551_clarity_docs.md)
> **What was wrong:** (1) Buttons use raw Tailwind instead of shadcn Button variants — violates design system. (2) Mutable visibility dropdown is effectively immutable once private stories exist — confusing UX. (3) Public doc flows lack visibility communication (only private gets banners). (4) In-card action buttons don't show lock/globe icons for parent context. (5) Doc privacy banner doesn't match /live session banner pattern.

## Problem Statement

P551 shipped functional Clarity Docs but with design system violations and a confusing visibility model. Users see buttons that look different from the rest of the app. The visibility dropdown in the doc header can only be changed under narrow conditions (no private stories) — making it a control that exists but almost never works. Public doc creation flows don't communicate that content will be public. The result is a feature that works but feels unpolished and unclear about privacy.

## Jobs To Be Done

- **Preserved from P551:** All three JTBDs (file stories from sessions, private therapy workspace, curate workshop content)
- **Corrected:** "I want to be certain nothing in my private doc appears on my profile" — the mutable visibility dropdown undermined this certainty
- **New:** "I want to see at a glance whether I'm creating private or public content" — lock/globe icons on every creation action

## Current State

The P551 implementation exists on branch `feature/p551-clarity-docs` (worktree w1). All 13 tasks completed, UAT gate set.

**Issues observed:**
1. Buttons are raw `<button>` or custom Tailwind — not shadcn `<Button variant="...">`. Visible on: doc list "+ New Doc", doc detail "Write a story" / "Select your story", story picker "+ Add" buttons.
2. Visibility dropdown in doc header shows "Private ▾" / "Public ▾" with an "Active" badge. Public option disables when private stories exist — but user already chose private at doc creation time. The dropdown is noise.
3. In a public doc, creating a story shows no banner indicating the story will be public. Only private creation has a banner.
4. In-card "Add a point" and "Add your story" buttons don't show lock/globe — user doesn't know if they're creating private or public content.
5. Doc privacy banner is a small inset element. /live has a full-width sticky banner for "This session is private." Inconsistent.
6. "Write a story" and "Select your story" buttons are at page bottom — should be near the top for discoverability.

## Root Cause

The `/ui` Component Strategy correctly classified components (Reuse/Extend/New) but the `/dev` subagents wrote raw Tailwind classes instead of importing `<Button>` from `src/components/ui/button.tsx`. The visibility dropdown was spec'd as mutable before the user identified it's effectively immutable. Visual QA was skipped during UAT gate (Chrome MCP not checked).

**Code references:** `src/app/pages/docs-list-page.tsx`, `src/app/pages/doc-detail-page.tsx`, `src/app/components/docs/doc-header.tsx` (all in worktree w1).

## Redesign

### 1. Doc creation: Visibility popover at creation time

Replace instant-create with a popover choice:

```
[+ New Doc] ← click
  +-------------------------------+
  | [lock] Private Doc            |
  |   Only you can see this       |
  |                               |
  | [globe] Public Doc            |
  |   Visible on your profile     |
  +-------------------------------+
```

After choosing → doc created with that visibility → navigates to `/d/:docId`. Title still defaults to "Untitled Doc", editable inline.

### 2. Remove visibility dropdown from doc header

Replace the dropdown with a static badge:

```
Before: [Therapy Notes___] [lock Private ▾] [...]
After:  [Therapy Notes___] [lock] Private   [...]
```

No dropdown. Visibility is immutable after creation. The `[lock]`/`[globe]` icon + label is display-only.

### 3. All buttons use shadcn Button variants

| Button | Variant | Icon |
|---|---|---|
| "+ New Doc" (doc list) | `outline` | — |
| "+ Create a Doc" (empty state) | `default` (blue) | — |
| "+ Write a story" | `default` (blue) | lock or globe |
| "Select your story" | `outline` | lock or globe |
| "Save Private Story" / "Save Public Story" | `default` | lock or globe |
| "Add Private Point" / "Add Public Point" | `default` | lock or globe |
| "+ Add" (story picker) | `outline`, `sm` | — |
| "Delete this Clarity Doc" | `destructive` | — |

### 4. Lock/globe icons on ALL creation action buttons

Every button that creates or adds content shows the visibility icon matching the doc context:

- Private doc: all creation buttons get `[lock]` icon
- Public doc: all creation buttons get `[globe]` icon

This includes:
- "Write a story [lock]" / "Write a story [globe]"
- "Save Private Story [lock]" / "Save Public Story [globe]"
- "Add a point [lock]" (in private story in doc) / "Add a point [globe]" (in public story in doc)
- "Add your story [lock]" / "Add your story [globe]" (if applicable)

### 5. Visibility banners on BOTH private AND public creation flows

Currently only private gets a banner. Add blue banner for public too:

- Private doc story creation: amber banner "This story will be private — only you can see it [lock]"
- Public doc story creation: blue banner "This story will be public — visible on your profile [globe]"
- Private story point creation: amber banner "This point will be private [lock]"
- Public story point creation: blue banner "This point will be public [globe]"

### 6. Doc privacy banner matches /live session banner

Check the /live "This session is private" banner component and match its pattern:
- Full-width sticky (not inset)
- Same amber color tokens
- Same icon size and text weight

### 7. Action buttons near top, not bottom

"Write a story" and "Select your story" positioned in the action row below the header/banner, above the story list. Not at page bottom.

## Predecessor Sections Superseded

| Section | P551 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| AC: Doc Detail Page | `"[lock Private ▾] / [globe Public ▾] visibility dropdown"` | Superseded | Static visibility badge (display-only) |
| AC: Doc Detail Page | `"Visibility dropdown: switching to Public blocked..."` | Superseded | No dropdown — visibility immutable at creation |
| AC: Privacy & Visibility | `"Doc visibility changeable via header dropdown"` | Superseded | Immutable after creation |
| Design Decision | `"Visibility: Header dropdown, defaults private"` | Superseded | Popover at creation, immutable after |
| UX Flow F | Full "Visibility Change" flow | Superseded | Removed entirely |
| Resolved Decision #7 | `"Dropdown is trivial, constraint enforcement handles risk"` | Superseded | Dropdown removed — simpler model |
| Visual Refinement | `"Doc banner is content-level, not chrome-level"` | Superseded | Matches /live session banner (chrome-level) |

## Requirements

1. All buttons in doc pages use shadcn `<Button>` with correct `variant` prop
2. Doc creation via `[+ New Doc]` shows popover with Private/Public choice before creating
3. Doc visibility is immutable after creation — no dropdown in header
4. Header shows static visibility badge (lock/globe + "Private"/"Public" label)
5. Every creation button shows lock/globe icon matching doc visibility context
6. Both private AND public creation flows show visibility banners (amber/blue)
7. Doc privacy banner matches /live session banner pattern (full-width sticky)
8. "Write a story" and "Select your story" buttons positioned below header, above story list

## What Stays the Same

- Database schema (clarity_docs, doc_stories) — no migration changes
- Data service API — no changes
- RLS policies and triggers — no changes
- Route structure (/docs, /d/:docId)
- Navigation changes (Docs in nav, Start Session moved)
- Story card reuse (StoryCardDetail)
- Drag-and-drop story reordering
- Story selection panel (DocStoryPicker)
- Story/point creation flow logic (only visual changes)
- All Privacy & Visibility RLS enforcement
- Inline title editing
- Doc deletion flow

## Surfaces in Scope

**In scope:**
- `src/app/pages/docs-list-page.tsx` — button variants, creation popover
- `src/app/pages/doc-detail-page.tsx` — button variants, action button position, banner update
- `src/app/components/docs/doc-header.tsx` — remove visibility dropdown, static badge
- `src/app/components/docs/doc-privacy-banner.tsx` — match /live session banner
- `src/app/pages/create-story-page.tsx` — button labels with icons, public banner
- `src/app/pages/story-detail-page.tsx` — point creation button labels with icons, public banner

**Out of scope:**
- Database/migration changes
- Data service changes
- Navigation changes
- DnD/ordering logic
- Story picker logic (only button styling)
- Test files (update after implementation)

## Acceptance Criteria

- [ ] All buttons in doc pages use shadcn `<Button>` component with appropriate `variant` prop
- [ ] `[+ New Doc]` shows popover with "Private Doc" and "Public Doc" choices before creating
- [ ] Doc header shows static visibility badge (lock/globe + label) — no dropdown
- [ ] Every creation/save button shows lock (private) or globe (public) icon matching doc context
- [ ] Story creation from private doc shows amber banner + "Save Private Story [lock]"
- [ ] Story creation from public doc shows blue banner + "Save Public Story [globe]"
- [ ] Point creation in private story shows amber banner + "Add Private Point [lock]"
- [ ] Point creation in public story shows blue banner + "Add Public Point [globe]"
- [ ] Doc privacy banner is full-width sticky, matches /live session private banner styling
- [ ] "Write a story" and "Select your story" buttons positioned below header/banner, above story list
- [ ] No "Active" badge visible anywhere
- [ ] Surfaces NOT in scope are visually unchanged
- [ ] All existing P551 tests still pass
