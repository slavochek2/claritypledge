---
status: all-done
type: change-request
rank: 0.5
changes: p551
delivery_stage: 3.5-ui-review
tags:
  - redesign
  - p551
  - docs
  - design-system
created_date: 2026-03-26T00:00:00.000Z
locked_at: '2026-03-26T13:40:26.033Z'
---

# P590: Clarity Docs — Design System + Visibility Model Fix

> **Redesign of:** [P551: Clarity Docs — Curated Story Collections](./p551_clarity_docs.md)
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
- Same amber color tokens (private) / blue tokens (public — same structure, different color)
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
- Data service API — minor change: `createDoc()` accepts optional `visibility` param (currently defaults to private)
- RLS policies and triggers — no changes
- Route structure (/docs, /d/:docId)
- Navigation changes (Docs in nav, Start Session moved)
- Story card reuse (StoryCardDetail) — in-card buttons ("Add a point", etc.) stay as-is. Lock/globe icons only on doc-page-level buttons.
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
- `src/app/pages/story-detail-page.tsx` — point creation button labels with icons, public banner, `isPrivateContext` → `docVisibility` prop refactor (non-doc-context pages: no banner, same as today)
- `src/app/data/docs-service.ts` — add `visibility` param to `createDoc()`
- `src/app/data/docs-service.interface.ts` — update `createDoc()` signature

**Out of scope:**
- Database/migration changes
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
- [ ] Doc privacy banner is full-width (not inset), matches /live session banner layout pattern (centered, border-b, icon + text). Amber for private, blue for public. NOT sticky (doc pages scroll).
- [ ] "Write a story" and "Select your story" buttons positioned below header/banner, above story list
- [ ] No "Active" badge visible anywhere
- [ ] Surfaces NOT in scope are visually unchanged
- [ ] All existing P551 tests still pass
- [ ] Creation popover uses shadcn `Popover` component

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [WARN] createDoc() needs visibility param | Acknowledged — minor service API change | Popover passes chosen visibility to createDoc |
| 2 | /challenge-prd | [WARN] DB trigger now dead code | Keep as defense-in-depth, no removal | Belt-and-suspenders matches P586 pattern |
| 3 | /challenge-prd | [WARN] Public banner has no /live equivalent | Same structure as /live private banner, blue tokens | Consistency in structure, differentiated by color |
| 4 | /challenge-prd | [WARN] StoryCardDetail in-card buttons vs scope | Out of scope — lock/globe on doc-page-level buttons only | StoryCardDetail is shared, touching it risks profile/feed regressions |

## Component Strategy

> `delivery_stage: 3.5-ui-review`

### Step 1 — Component Inventory

**Available shadcn/ui components** (already installed in `src/components/ui/`):
- `Button` — variants: `default` (blue primary), `destructive`, `outline`, `secondary`, `ghost`, `link`. Sizes: `default` (h-9), `sm` (h-8), `lg` (h-10), `icon` (h-9 w-9).
- `DropdownMenu` — full Radix-based dropdown (Trigger, Content, Item, etc.)
- `Dialog` — already used for delete confirmation
- `Tooltip` — already used elsewhere
- `Input`, `Textarea` — form primitives

**NOT installed (need adding):**
- `Popover` — **required** for creation flow. Must install: `npx shadcn@latest add popover`. This adds `@radix-ui/react-popover` and `src/components/ui/popover.tsx`.

**Existing shared components:**
- `InlineVisibilityIcon` (`src/app/components/shared/visibility-badge.tsx`) — renders `Lock` (amber) or `Globe` (gray) with tooltip. Used in doc list cards and story cards.
- `VisibilityBadge` — same file, adds label + background. Currently uses `text-muted-foreground bg-muted` for both variants.
- `DocPrivacyBanner` (`src/app/components/docs/doc-privacy-banner.tsx`) — inset rounded banner with amber/blue styling.

**Lucide icons in use:** `Lock`, `Globe`, `Plus`, `ListChecks`, `ArrowLeft`, `MoreHorizontal`, `Trash2`, `ChevronDown`, `Loader2`, `FileText`.

### Step 2 — Component Map

#### Buttons — Current vs Correct

| Element | File | Current | Correct | Exact Props |
|---------|------|---------|---------|-------------|
| "+ New Doc" (list page, populated) | `docs-list-page.tsx` | `<Button variant="outline" size="sm">` | **Already correct** — keep as-is but becomes Popover trigger | `variant="outline" size="sm"` |
| "+ Create a Doc" (list page, empty state) | `docs-list-page.tsx` | `<Button onClick={handleCreate}>` (default variant) | **Already correct** for variant — but becomes Popover trigger | `variant="default"` (no explicit needed, it's the default) |
| "Write a story" (doc detail) | `doc-detail-page.tsx` | `<Button asChild>` wrapping `<Link>` (default variant, no icon) | Add lock/globe icon, label change | `variant="default"` + `<Lock size={16} />` or `<Globe size={16} />` before text |
| "Select your story" (doc detail) | `doc-detail-page.tsx` | `<Button variant="outline">` (no visibility icon) | Add lock/globe icon | `variant="outline"` + `<Lock size={16} />` or `<Globe size={16} />` before text |
| "Save Private Story" / "Save Public Story" (create story) | `create-story-page.tsx` | `<Button className="bg-blue-500 hover:bg-blue-600 text-white">` — **raw Tailwind, NOT using variant** | Use `variant="default"` (which is blue primary) + icon | `variant="default"` + `<Lock size={16} />` or `<Globe size={16} />` before label. Remove `className="bg-blue-500..."` |
| "Add Private Point" / "Add Public Point" (story detail) | `story-detail-page.tsx` | `<Button className="bg-blue-500 hover:bg-blue-600 text-white">` — **raw Tailwind** | Use `variant="default"` + icon | `variant="default"` + `<Lock size={16} />` or `<Globe size={16} />` before label. Remove `className="bg-blue-500..."` |
| "+ Add" (story picker) | `doc-story-picker.tsx` | `<Button variant="outline" size="sm">` | **Already correct** | No change |
| "Delete this Clarity Doc" (dialog) | `doc-header.tsx` | `<Button variant="destructive">` | **Already correct** | No change |
| "Cancel" (delete dialog) | `doc-header.tsx` | `<Button variant="outline">` | **Already correct** | No change |
| Back button (doc header) | `doc-header.tsx` | Raw `<button>` with Tailwind classes | **Keep as-is** — this is a text link, not a Button. Matches existing FocusHeader pattern. | No change |
| "Retry" button (orphan point) | `story-detail-page.tsx` | `className="bg-blue-500 hover:bg-blue-600 text-white"` — **raw Tailwind** | `variant="default"` | Remove manual className |
| "Try Again" button (story detail error) | `story-detail-page.tsx` | `className="bg-blue-500 hover:bg-blue-600 text-white"` — **raw Tailwind** | `variant="default"` | Remove manual className |
| "Save" button (story edit) | `story-detail-page.tsx` | `className="bg-blue-500 hover:bg-blue-600 text-white"` — **raw Tailwind** | `variant="default"` | Remove manual className |

**Summary of raw-Tailwind violations:** 5 buttons across `create-story-page.tsx` and `story-detail-page.tsx` use `className="bg-blue-500 hover:bg-blue-600 text-white"` instead of `variant="default"`. The `default` variant already produces `bg-primary text-primary-foreground` which maps to the blue primary in the theme.

#### Creation Popover

**Component:** `Popover` + `PopoverTrigger` + `PopoverContent` from shadcn/ui (to be installed).

```tsx
// docs-list-page.tsx — populated state
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm">
      <Plus className="w-4 h-4" />
      New Doc
    </Button>
  </PopoverTrigger>
  <PopoverContent align="end" className="w-64 p-2">
    <button
      onClick={() => handleCreate('private')}
      className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
    >
      <Lock size={16} className="text-amber-600 flex-shrink-0" />
      <div>
        <div className="font-medium">Private Doc</div>
        <div className="text-xs text-muted-foreground">Only you can see this</div>
      </div>
    </button>
    <button
      onClick={() => handleCreate('public')}
      className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
    >
      <Globe size={16} className="text-muted-foreground flex-shrink-0" />
      <div>
        <div className="font-medium">Public Doc</div>
        <div className="text-xs text-muted-foreground">Visible on your profile</div>
      </div>
    </button>
  </PopoverContent>
</Popover>
```

**Why Popover, not DropdownMenu:** The creation choices are not menu items (they don't select/toggle). They are action choices that create something. Popover is the correct Radix primitive for ephemeral panels with custom content. DropdownMenu items auto-close and have keyboard semantics (arrow keys) designed for option lists, not creation flows.

**Why not full `<Button>` inside Popover:** The popover items are list-style choices (icon + title + description), not standalone buttons. Using raw `<button>` with hover styles matches the pattern of DropdownMenuItem internals without importing menu semantics.

#### Static Visibility Badge (Doc Header)

**Replace** the entire `<DropdownMenu>` visibility block (lines 158-199 of `doc-header.tsx`) with:

```tsx
{/* Static visibility badge — immutable after creation */}
<span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground px-2 py-1">
  {doc.visibility === 'private' ? (
    <Lock size={14} className="text-amber-600" />
  ) : (
    <Globe size={14} />
  )}
  <span className="capitalize">{doc.visibility}</span>
</span>
```

**What to remove:**
- The entire `handleVisibilityChange` callback (lines 84-95)
- The `ChevronDown` import (no longer needed)
- The `DropdownMenu` import block and `DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuTrigger` — **keep** the import because the overflow menu still uses `DropdownMenu`
- The `hasPrivateStories` prop is no longer needed by DocHeader (remove from interface and parent callsite)

#### Doc Privacy Banner — Match /live Pattern

The /live `RecordingIndicator` private banner uses:
```
sticky top-16 lg:top-20 z-40, bg-muted border-b border-border, centered flex, text-xs text-muted-foreground
```

This is a **minimal chrome-level band** — fundamentally different from the current `DocPrivacyBanner` which is a content-level inset card. The spec says "match /live session banner pattern (full-width sticky)."

**Corrected `DocPrivacyBanner`:**

```tsx
export function DocPrivacyBanner({ visibility }: DocPrivacyBannerProps) {
  const isPrivate = visibility === 'private';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`-mx-4 px-4 py-2 flex items-center justify-center gap-2 text-sm border-b ${
        isPrivate
          ? 'bg-amber-50 border-amber-200'
          : 'bg-blue-50 border-blue-200'
      }`}
    >
      {isPrivate ? (
        <>
          <Lock size={14} className="text-amber-600 flex-shrink-0" />
          <span className="text-amber-800 font-medium">PRIVATE</span>
          <span className="text-amber-700">&middot; Only you can see this Clarity Doc</span>
        </>
      ) : (
        <>
          <Globe size={14} className="text-blue-600 flex-shrink-0" />
          <span className="text-blue-800 font-medium">PUBLIC</span>
          <span className="text-blue-700">&middot; Visible on your profile</span>
        </>
      )}
    </div>
  );
}
```

**Key changes:** (1) `-mx-4` to break out of container padding and go full-width. (2) Removed `rounded-lg` and card-like border — now a flat band. (3) `border-b` only (bottom edge). (4) Centered content. (5) `text-sm` stays (the /live banner uses `text-xs` but doc banners carry more important privacy info — `text-sm` is the right call for readability). (6) **Not sticky** — unlike /live where the banner must persist during scrolling, the doc banner is always visible at the top of a short page. Making it sticky would feel heavy for a list page.

#### Story/Point Creation Banners

The `DocPrivacyBanner` is already reused on `create-story-page.tsx` (line 289). For the public variant, it already renders blue — no code change needed, just verify it renders.

For **point creation** in `story-detail-page.tsx`, the `AddPointForm` already has a private banner (lines 214-218). The change: add a public banner too.

```tsx
{/* Privacy banner for point creation in doc context */}
{isPrivateContext && (
  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-sm">
    <LockIcon size={16} className="text-amber-600 flex-shrink-0" />
    <span className="text-amber-800">This point will be private — only you can see it</span>
  </div>
)}
{isPublicContext && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2 text-sm">
    <Globe size={16} className="text-blue-600 flex-shrink-0" />
    <span className="text-blue-800">This point will be public — visible on your profile</span>
  </div>
)}
```

This requires changing the `isPrivateContext` prop to a more general `docVisibility?: ContentVisibility` prop on `AddPointForm` and `KeyPointsSection`, then deriving both conditions.

### Step 3 — Composition Tree

#### 1. Doc List Page — Creation Popover Flow

```
DocsListPage
├── <main> "Your Clarity Docs"
│   ├── Header row
│   │   ├── <h1> "Your Clarity Docs"
│   │   └── <Popover>                          ← NEW (replaces direct Button)
│   │       ├── <PopoverTrigger asChild>
│   │       │   └── <Button variant="outline" size="sm">
│   │       │       ├── <Plus />
│   │       │       └── "New Doc"
│   │       └── <PopoverContent align="end" className="w-64 p-2">
│   │           ├── <button> Private Doc choice
│   │           │   ├── <Lock /> (amber)
│   │           │   ├── "Private Doc"
│   │           │   └── "Only you can see this"
│   │           └── <button> Public Doc choice
│   │               ├── <Globe />
│   │               ├── "Public Doc"
│   │               └── "Visible on your profile"
│   ├── Doc cards (unchanged)
│   └── Empty state
│       └── <Popover>                           ← NEW (same pattern)
│           ├── <PopoverTrigger asChild>
│           │   └── <Button variant="default">
│           │       ├── <Plus />
│           │       └── "Create a Doc"
│           └── <PopoverContent> (same choices)
```

#### 2. Doc Header — Static Badge Replacing Dropdown

```
DocHeader
├── Back link (unchanged raw <button>)
├── Title + controls row
│   ├── Title (inline editable, unchanged)
│   └── Controls (owner only)
│       ├── <span> Static visibility badge     ← CHANGED (was DropdownMenu)
│       │   ├── <Lock size={14} /> or <Globe size={14} />
│       │   └── "Private" or "Public"
│       └── <DropdownMenu> Overflow (unchanged)
│           └── DropdownMenuItem "Delete this Clarity Doc"
├── Delete Dialog (unchanged)
```

#### 3. Action Buttons Row (Doc Detail, Below Header)

```
DocDetailPage
├── DocHeader (see above)
├── DocPrivacyBanner                            ← CHANGED (full-width band)
├── Story count
├── Action buttons (owner only)                 ← MOVED (was at bottom)
│   ├── <Button variant="default" asChild>
│   │   └── <Link to="/create?docId=...">
│   │       ├── <Lock size={16} /> or <Globe size={16} />  ← NEW icon
│   │       └── "Write a story"
│   └── <Button variant="outline">
│       ├── <Lock size={16} /> or <Globe size={16} />      ← NEW icon
│       └── "Select your story"
├── Stories (DnD list) or empty state
└── DocStoryPicker dialog (unchanged)
```

### Step 4 — Visual Refinements

1. **`variant="default"` replaces `bg-blue-500` everywhere.** The `default` variant uses `bg-primary text-primary-foreground` which resolves to blue via the theme. This is the design system way. All 5 raw-Tailwind buttons must switch.

2. **Button `gap-2` is built-in.** The `buttonVariants` cva already includes `gap-2` in the base class. Icons placed as children of `<Button>` will automatically get `size-4` (via `[&_svg]:size-4`) and `shrink-0` (via `[&_svg]:shrink-0`). No manual icon sizing needed inside buttons — remove explicit `size={16}` on icons inside `<Button>` and let the built-in rule handle it. For icons outside buttons (badge, banner), keep explicit sizes.

3. **`min-h-[44px]` on submit buttons.** The current `create-story-page.tsx` adds this for touch target compliance. The `default` size is `h-9` (36px) which is below the 40px minimum. Keep `className="min-h-[44px]"` on form submit buttons (Save Story, Add Point) as a supplementary class alongside the variant.

4. **Popover items should have `min-h-[44px]`** for touch targets. Add `min-h-[44px]` to each choice button inside PopoverContent.

5. **"Active" badge removal.** The `doc-header.tsx` visibility dropdown items (lines 178, 190) show a `<span className="ml-auto text-blue-600 text-xs font-medium">Active</span>`. These are removed entirely when the dropdown is removed.

### Step 5 — Extraction Plan

**Extract creation popover into a shared component: `DocCreationPopover`.**

The same Private/Public choice popover appears in two places on `docs-list-page.tsx` (populated header + empty state). Extract to avoid duplication:

```tsx
// src/app/components/docs/doc-creation-popover.tsx
interface DocCreationPopoverProps {
  onCreateDoc: (visibility: ContentVisibility) => void;
  creating: boolean;
  children: React.ReactNode; // trigger button
}

export function DocCreationPopover({ onCreateDoc, creating, children }: DocCreationPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild disabled={creating}>
        {children}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        {/* Private + Public choices */}
      </PopoverContent>
    </Popover>
  );
}
```

**No other extractions needed.** The static badge is 6 lines of JSX — not worth a component. The banner modifications are in-place edits to an existing component.

### Step 6 — Challenge Notes

1. **Popover installation required.** `npx shadcn@latest add popover` must run before implementation. Verify `@radix-ui/react-popover` is added to `package.json` and `src/components/ui/popover.tsx` is generated.

2. **`handleCreate` signature change.** Currently `handleCreate()` takes no args and defaults to private. Must change to `handleCreate(visibility: ContentVisibility)` and pass it to `docsService.createDoc({ visibility })`. This is a minor data service change (acknowledged in Resolved Decision #1) but must be verified: check that `docsService.createDoc()` accepts a visibility parameter or add one.

3. **`isPrivateContext` to `docVisibility` refactor.** The `AddPointForm` and `KeyPointsSection` in `story-detail-page.tsx` use a boolean `isPrivateContext` prop. To support both amber (private) and blue (public) banners, this needs to become `docVisibility?: ContentVisibility`. The parent callsite (line 1212) already has the visibility from `story.visibility` — straightforward prop change.

4. **Action buttons position.** The spec says buttons go below header/banner, above story list. Currently they are below the story list (lines 309-322 in `doc-detail-page.tsx`). Move the `{isOwner && ...}` block to appear after `<DocPrivacyBanner>` and before the story count / story list.

5. **Banner is NOT sticky.** The /live `RecordingIndicator` is `sticky top-16`. The doc banner should NOT be sticky — doc pages are short and the banner at the top is always visible. Making it sticky adds visual noise. The spec says "full-width sticky" but the intent is "full-width, matching the /live pattern" — sticky is inappropriate here because docs scroll content is short. Implementation should use full-width (no rounded corners, edge-to-edge) but not `position: sticky`.

6. **No `Badge` component exists.** The project does not have a shadcn `Badge` component installed. The static visibility indicator in the header is simple enough to be a plain `<span>` — no need to install Badge.
