---
status: today
type: story
rank: 0.024
tags:
  - points
  - references
  - discourse
  - ux
delivery_stage: 4-tests-ready
created_date: 2026-03-15T00:00:00.000Z
prepped_date: null
flow: dev
reviews:
  ux: done
  architect: null
  alignment: null
locked_at: '2026-03-15T14:22:58.149Z'
uat_file: features/uat/p523.md
test_files:
  - src/tests/p523-point-references.test.ts
  - e2e/integration/p523-point-references-migration.spec.ts
  - e2e/p523-point-creation-responses.spec.ts
  - e2e/a11y/p523-accessibility.spec.ts
  - e2e/p523-smoke.spec.ts
---

# P523: Point-to-Point References & Standalone Point Creation

**Supersedes:** P433, P535 (absorbed as V2)
**Related:** P536 (Short IDs — separate, backlog)

---

## Design History

**V1 (Mar 15):** "Inspired By" single FK. Challenged: too restrictive.
**V2 (Mar 16):** "Suggest a different version." Challenged: still too narrow.
**V3 (Mar 17):** Generic N:N references. Challenged: no demand evidence, C1 tension.
**V4 (Mar 18):** Resolved BLOCKs, added standalone creation, clarified flows.
**V5 (Mar 18):** Full design exploration — 4 innovation agents + falsification. All major UX decisions resolved.
**V6 (Mar 18):** Consistency audit — fixed 5 inconsistencies and 3 clarity gaps.

---

## Terminology

- **"Reference"** = data model term (the `point_references` junction table row linking two points)
- **"Response"** = user-facing term (the UX calls it "Respond", section is "Responses")
- Both refer to the same concept. Use "reference" in technical/DB context, "response" in UI/user context.

---

## Problem Statement

**Current state:** Points can only be created via story-author flow. Points exist as isolated claims with no connections. When session participants reformulate, contradict, or build on points — the new point has no visible relationship to the original.

**Pain points:**
- No standalone point creation (must create story first)
- No way to say "this responds to that"
- Contradictions and evolution invisible
- Founder needs SQL to create/evolve points

**Who's affected:** Session participants, event attendees, the founder, visitors browsing discourse

---

## Business Requirements

### Standalone Point Creation
1. Verified users can create a point independently (not tied to story creation)
2. Entry point: `[+ Create ▾]` dropdown replacing current "Share a Story" button on feed and profile — dropdown offers "Story" and "Point"
3. Navigates to `/create-point` page (new route)
4. Form: statement text (1000 char hard limit) + position selection (reuses existing AddPointForm pattern — position required before submit, same as story-detail-page.tsx line 207)
5. Button: "Publish Point" (matches existing "Publish Story")
6. Point + position created atomically via Supabase RPC `create_point_with_position` — prevents orphan points with 0 positions that are invisible in feeds

### Point Responses (References)
7. Point detail page shows "Respond" button in the Responses section header
8. Clicking "Respond" navigates to `/create-point?respondTo=<pointId>` (reuses same create-point page with reference pre-filled)
9. Created point is linked to the original via `point_references` junction table
10. Response IS a point — same entity, same capabilities, same 1000 char limit
11. One reference per point in V1 (multi-reference is V2)
12. Responses can respond to responses (chains are natural: A → B → C)

### Display Rules
13. **Point detail page — "Responding to" line:** Shown above the point statement when this point responds to another. Shows the response author's position on the original point + link. Format: `Responding to: 📌 "Original text…" · Disagree →`
14. **Point detail page — "Responses" section:** Shown BELOW "Positions" section. Section header includes "Respond" button. Response cards are standard point cards with PositionButtons (differentiator from story cards).
15. **Feed cards:** Show 💬 count badge only (no "Responding to" text). Response point cards show ↩ overlay on pin icon. Click navigates to point detail.
16. **Profile Points tab:** No change — responses ARE points, appear naturally. No new tab. Response point cards show ↩ overlay on pin icon.
17. **Response point icon (all contexts):** Response points show a small ↩ reply arrow overlay (12px, `CornerDownLeft` lucide icon) at bottom-right of the pin circle. Standalone points: pin only. Arrow is `text-slate-500` on `bg-white rounded-full` backing.
18. **Flat display:** Each point shows only its DIRECT responses. No tree view. Follow chains by clicking through.
19. **Scale (200+ responses):** Progressive disclosure — first 3 chronological, "Show N more" with count.
20. **Empty state (0 responses):** Show section header + Respond button. No list area, no "No responses yet" text.

### Auth & Constraints
21. Verified users only (matches existing point creation rules)
22. Creating a response does NOT affect positions, stories, or position counts on the original point
23. Points remain immutable — responses are new points, not edits
24. Duplicate references prevented (same pair linked once)
25. Self-reference prevented (CHECK source_point_id != target_point_id)
26. Unverified user clicks Respond → redirect to auth (useVerificationGate pattern)

**Out of scope (deferred):**
- Link type labels (V2 after 10+ links)
- Multi-reference per point (V2)
- Direction indicator (V1: PositionButtons already show everything; add explicit direction if users can't infer)
- Story-to-story references (stories connect through shared points)
- Notifications when someone responds to your point
- Feed grouping by response clusters
- "False premise" as position value (handled via counter-points)
- Short IDs (P536)

---

## Design Decisions (from innovation + falsification)

### Interaction Model: Quote-Point (won over @mention, Fork, Thread, Citation, AI-suggest)
- Reference shown as single-line preview of the original point
- Context travels with the response — readers see what was responded to
- Killed: @mention (needs short IDs, power-user pattern), Fork (developer jargon), Thread (implies hierarchy), Citation `[P-1234]` (non-technical users can't), AI-suggest (trust issues)

### Scale: Progressive Disclosure (won over Adaptive UI, Featured+Overflow, Split View)
- First 3 responses chronological (dropped "position-diverse" — no diversity algorithm, define later if needed)
- "Show N more" with count
- Killed: Adaptive threshold (inconsistent UX), Featured (algorithmic favoritism), Tension/Aligned split (contradicts position-neutral design)

### Direction Display: None in V1 (won over dual labels, chips, tooltips, numbers)
- PositionButtons on response cards already show aggregate positions
- User can see their own highlighted positions on both points
- Direction inference is implicit — no explicit label needed
- Add explicit direction indicator in V2 only if users can't figure it out

### Response vs Story Differentiation: PositionButtons as differentiator (won over accordion headers, GitHub-style bar, pill links)
- Response cards have PositionButtons (stories don't)
- Section labels "Positions" and "Responses" make the distinction explicit
- Killed: Same accordion pattern with different headers (perceptually identical), pill links (too compact)

### Create Button Coexistence: Dropdown (won over two buttons, toggle, FAB, type-selector page)
- Single `[+ Create ▾]` replaces "Share a Story"
- Dropdown: "📝 Story" / "📌 Point"
- Same position, same style, minimal change to existing UI
- Profile: full-width button becomes "Share ▾" with same dropdown

### Response Point Icon: ↩ Arrow Overlay (won over icon swap, color shift, notification badge)
- Small `CornerDownLeft` overlay at bottom-right of pin circle
- Pin identity preserved, no color system created, zero vertical space
- Killed: Speech bubble icon (breaks pin metaphor), color shift (doesn't scale, colorblind), notification badge (confused with counts)

---

## User Stories

**As a facilitator:** I want to create points directly and link them to capture session discourse.
**As a participant:** I want my claim captured as a point that others can respond to.
**As a user responding to a point:** I want to create my response from the point detail page, connected to the original.
**As a visitor:** I want to see responses below positions and follow the conversation chain.

---

## Acceptance Criteria

### Standalone Point Creation
- [ ] `[+ Create ▾]` dropdown on feed replaces "Share a Story" with two options
- [ ] Profile "Share a Story" becomes "Share ▾" with same dropdown
- [ ] "📌 Point" navigates to `/create-point` (new route, lazy-loaded)
- [ ] `/create-point` page: statement textarea (1000 chars) + PositionButtons + "Publish Point" button
- [ ] Optional "Responding to" field above the textarea: pre-filled and read-only when from "Respond" button; client-side search/filter when standalone (same pattern as StorySearchPicker — load all points, filter by text match)
- [ ] Point + position created atomically via single DB operation (prevents orphan 0-position points)
- [ ] Created point appears in feed and profile Points tab

### Point Responses
- [ ] Point detail page: "Responses" section below "Positions" section
- [ ] Section header: "Responses (N)" + "Respond" button
- [ ] "Respond" navigates to `/create-point?respondTo=<pointId>` with reference pre-filled above textarea
- [ ] Response creates new point + entry in `point_references` junction table
- [ ] Reference visible from both directions: source point's Responses section lists the response; response's detail shows "Responding to" header linking back to source
- [ ] On response's detail page: "Responding to: 📌 [truncated text] · [response author's position on original] →" shown above statement
- [ ] "Responding to" NOT shown on feed cards or profile cards
- [ ] Feed cards: 💬 count badge when responses > 0 (new data requirement — response count in feed queries)
- [ ] Response point cards show ↩ reply arrow overlay on pin icon (all contexts: feed, profile, responses section)
- [ ] Response cards in Responses section: standard point cards with PositionButtons
- [ ] First 3 responses chronological, "Show N more" with count when > 3
- [ ] 0 responses: section header + Respond button visible, no empty list
- [ ] A point can respond to a response (chains allowed)
- [ ] One reference per point (V1)
- [ ] Duplicate references prevented
- [ ] Self-reference prevented (CHECK source_point_id != target_point_id)
- [ ] Unverified user clicks Respond → redirect to auth (useVerificationGate pattern)
- [ ] Creating a response does not change positions, stories, or position counts on original point
- [ ] Verified users only

---

## ASCII Wireframes

### Feed — Create Dropdown + Response Count + ↩ Overlay

```
┌────────────────────────────────────┐
│ Home                [+ Create ▾]   │
│                     ┌────────────┐ │
│                     │ 📝 Story   │ │
│                     │ 📌 Point   │ │
│                     └────────────┘ │
│ Points | Stories                   │
├────────────────────────────────────┤
│ ┌──────────────────────────────┐   │
│ │📌  "Climate policy must..." │   │  standalone (pin only)
│ │ [Dis][?][Agree]    💬3 [🔗] │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │📌↩ "Transition costs are     │   │  response (pin + ↩ overlay)
│ │     overestimated"           │   │
│ │ [Dis][?][Agree]        [🔗] │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │📌  "Remote work reduces..." │   │  standalone (no ↩)
│ │ [Dis][?][Agree]        [🔗] │   │
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

### Point Detail — Full Page

```
┌────────────────────────────────────┐
│ ← Back                            │
│                                    │
│ Responding to:                     │  ← only if this point
│ 📌 "Climate policy must…"         │     responds to another
│ · Disagree →                       │  ← response author's position
│                                    │     on original point
│ 📌 "Nuclear is the bridge         │
│    we're ignoring"                 │
│ #energy #nuclear                   │
│                                    │
│ [Dis][?][Agree]                    │
│────────────────────────────────────│
│                            [🔗]   │
│                                    │
│ ── Positions (8) ─────────────── │  ← POSITIONS FIRST
│ [All][Agree][Dis][?]               │
│ ┌──────────────────────────────┐   │
│ │ @bob  Strongly Agree         │   │
│ │ └─ Story: "I researched..."  │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │ @carol  Disagree             │   │
│ └──────────────────────────────┘   │
│                                    │
│ ── Responses (2) ─── [Respond] ── │  ← RESPONSES BELOW
│ ┌──────────────────────────────┐   │
│ │📌↩ "Nuclear waste storage    │   │  response cards show ↩
│ │     remains unsolved"        │   │
│ │ [Dis][?][Agree]        [🔗] │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │📌↩ "Thorium reactors solve   │   │
│ │     the waste problem"       │   │
│ │ [Dis][?][Agree]        [🔗] │   │
│ └──────────────────────────────┘   │
│                                    │
│ Show 44 more                       │
└────────────────────────────────────┘
```

### Point Detail — Empty Responses (0)

```
│ ── Positions (3) ─────────────── │
│ [holders...]                       │
│                                    │
│ ── Responses (0) ─── [Respond] ── │  ← header + button visible
│                                    │     no list, no empty text
```

### /create-point — From "Respond" Button

```
Click [Respond] → /create-point?respondTo=<id>

┌────────────────────────────────────┐
│ ← Back                            │
│                                    │
│ Make a Point                       │
│                                    │
│ Responding to:                     │  ← ABOVE textarea (context first)
│ 📌 "Nuclear is the bridge…"       │     read-only, pre-filled
│                                    │
│ ┌──────────────────────────────┐   │
│ │ State your claim...          │   │
│ └──────────────────────────────┘   │
│ 0/1000                             │
│                                    │
│ Your position:                     │
│ [Dis][?][Agree]                    │
│                                    │
│           [Publish Point]          │
└────────────────────────────────────┘
```

### /create-point — Standalone (from Create dropdown)

```
┌────────────────────────────────────┐
│ ← Back                            │
│                                    │
│ Make a Point                       │
│                                    │
│ Responding to: (optional)          │  ← ABOVE textarea (same position)
│ [🔍 Search points...]             │
│                                    │
│ (when selected:)                   │
│ 📌 "Climate policy…"  [✕ remove]  │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ State your claim...          │   │
│ └──────────────────────────────┘   │
│ 0/1000                             │
│                                    │
│ Your position:                     │
│ [Dis][?][Agree]                    │
│                                    │
│           [Publish Point]          │
└────────────────────────────────────┘

(Client-side search: loads all points, filters
 by statement text match. Same pattern as
 StorySearchPicker. ~20 lines of code.)
```

### Chain Example — A → B → C (Flat Display)

```
Point A: "Climate policy must account for transition costs"
  └─ Response B: "Nuclear is the bridge we're ignoring"
       └─ Response C: "Nuclear waste storage remains unsolved"

Each shows only DIRECT responses:

Point A detail → Responses: [B]
Point B detail → Responding to: A | Responses: [C]
Point C detail → Responding to: B | Responses: (none)

No tree view. Follow chains by clicking through.
```

### Profile — Points Tab + Create Dropdown

```
┌────────────────────────────────────┐
│ [Avatar] Name                      │
│ Bio text...                        │
│                                    │
│ [Share ▾                         ] │  ← dropdown: "Share a Story" /
│                                    │     "Make a Point"
│ Points (5) | Stories (3)           │
│                                    │
│ ┌──────────────────────────────┐   │
│ │📌  "Nuclear is the bridge…" │   │  standalone (pin only)
│ │ [Dis][?][Agree]    💬2 [🔗] │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │📌↩ "Transition costs are     │   │  response (pin + ↩ overlay)
│ │     overestimated"           │   │
│ │ [Dis][?][Agree]        [🔗] │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │📌  "Remote work reduces…"   │   │  standalone (no ↩)
│ │ [Dis][?][Agree]        [🔗] │   │
│ └──────────────────────────────┘   │
│                                    │
│ Responses ARE points — appear      │
│ naturally in Points tab.           │
│ ↩ overlay distinguishes responses. │
│ No "Responding to" on cards.       │
│ Click through for context.         │
└────────────────────────────────────┘
```

---

## Next Steps

1. ~~**Run `/ux`**~~ — done (see UX Design section below)
2. **Run `/architect`** — junction table, RPC function, RLS, service layer, `/create-point` route
3. **Run `/generate-tests`** → **`/spec-review`** → **`/dev`** → **`/verify`**

---

## UX Design

### 1. User Flows

#### Flow A: Standalone Point Creation (from Create dropdown)

1. **Entry:** User is on `/feed` or `/p/:slug` (own profile). Clicks `[+ Create ▾]` button (feed) or `[Share ▾]` button (profile).
2. **Dropdown opens:** Two options — "Story" and "Point". Dropdown is a simple `<div>` positioned below the button, not a portal (avoids z-index complexity).
3. **User clicks "Point":** Navigate to `/create-point`. Dropdown closes.
4. **Page loads:** Title "Make a Point". Optional "Responding to" search field (empty, with placeholder "Search points..."). Textarea with placeholder "State your claim...". Character counter shows `0/1000`. PositionButtons below (all unselected). "Publish Point" button disabled.
5. **User types statement:** Counter updates live. At 950+ chars, counter turns amber (`text-amber-600`). At 1000, input is hard-capped (same pattern as `CHAR_MAX` in `create-story-page.tsx`).
6. **User selects position:** One of Disagree/Unsure/Agree (with intensity dropdown for Disagree/Agree). "Publish Point" button becomes enabled.
7. **User clicks "Publish Point":** Button shows spinner + "Publishing..." (disabled). RPC `create_point_with_position` fires.
8. **Success:** Toast "Point published!" Navigate to `/point/<newId>` with `{ state: { justCreated: true }, replace: true }` (matches create-story-page pattern).
9. **Error:** Toast "Failed to publish. Please try again." Button re-enables. Form state preserved.

#### Flow B: Respond to a Point (from point detail)

1. **Entry:** User is on `/point/:id`. Scrolls to "Responses" section.
2. **User clicks "Respond" button** in section header.
3. **Auth check:** `useVerificationGate` fires. Unverified user redirected to `/signup?redirect=/create-point?respondTo=<id>`.
4. **Verified user:** Navigate to `/create-point?respondTo=<pointId>`.
5. **Page loads:** "Responding to" area shows loading skeleton (single `animate-pulse` bar, 48px height — same pattern as `create-story-page.tsx` line 243).
6. **Original point fetched:** "Responding to" preview renders: pin icon + truncated text (max 120 chars) + link arrow. Read-only, not dismissible. Search field hidden (reference is locked).
7. **User fills form:** Same as Flow A steps 5-6.
8. **User clicks "Publish Point":** Same submission as Flow A, but RPC also creates the `point_references` row atomically.
9. **Success:** Navigate to new point's detail page. "Responding to" line visible at top showing the original.

#### Flow C: Search and Select Reference on Standalone Create

1. **Entry:** User is on `/create-point` (no `respondTo` param). "Responding to" shows search field.
2. **User types in search field:** Client-side filter over all loaded points (same pattern as `StorySearchPicker` — load all, filter by `statement.toLowerCase().includes(query)`). Results appear in dropdown below search field.
3. **Results appear:** Max 6 results shown (matches `StorySearchPicker` limit). Each result shows pin icon + truncated statement (80 chars). Click outside closes dropdown.
4. **User selects a point:** Search field replaced by selected point preview: pin icon + truncated text + `[x remove]` button.
5. **User clicks remove:** Preview removed, search field returns. Reference is optional — form remains valid without it.
6. **User publishes:** If reference selected, same atomic creation as Flow B. If no reference, standalone point (no `point_references` row).

### 2. Edge Cases

**Network failure during create (mid-RPC):**
- "Publish Point" button already disabled + spinner showing. On network error, toast "Failed to publish. Please check your connection and try again." Button re-enables. All form state (text, position, reference) preserved. No partial data created (RPC is atomic — DB transaction rolls back).

**Original point deleted while user is writing response:**
- On publish, the RPC will fail because `target_point_id` FK constraint fails. Toast: "The original point no longer exists. Your point was not published." User can remove the reference and publish as standalone, or navigate back.
- On page load with `respondTo` param: if fetch returns null, show inline message "This point is no longer available" in the "Responding to" area (same graceful degradation as `create-story-page.tsx` line 84 — no banner). Search field appears so user can pick a different reference or proceed without one.

**Search returns 0 results:**
- Show "No points match [query]" text in dropdown (matches `StorySearchPicker` empty state). Dropdown stays open so user can modify query.

**User navigates back without publishing (unsaved work):**
- No `beforeunload` prompt. Points are short (1000 chars max) and positions are a single click — the cost of re-entry is low. This matches the existing `create-story-page.tsx` pattern which also has no unsaved-work warning.

**Same user responds to same point twice:**
- Allowed. The `point_references` junction table prevents duplicate pairs (same `source_point_id` + `target_point_id`), but a user can create multiple different response points to the same original. Each response is a distinct point with its own text and position.

**Point at max char limit (1000):**
- Counter displays `1000/1000` in red (`text-red-500`). Textarea rejects further input (same hard-cap pattern as `CHAR_MAX` in create-story-page). No error message needed — the visual counter is sufficient feedback.
- Thresholds: 0-949 = `text-muted-foreground`, 950-999 = `text-amber-600`, 1000 = `text-red-500`.

**Very long point text in "Responding to" preview:**
- Truncate at 120 characters with ellipsis. Single line, `line-clamp-2` as safety net. Full text visible by clicking the arrow link to navigate to the original point.

**User creates point then immediately wants to respond to it:**
- After publish, user lands on the new point's detail page. The Responses section is visible (with "Responses (0)" header + "Respond" button). User can immediately click "Respond" to create a response to their own point. Self-response is not prevented — only self-reference (a point referencing itself) is blocked by the DB CHECK constraint.

**Dropdown dismissal:**
- Create dropdown closes on: (a) click outside, (b) Escape key, (c) selecting an option. Same behavior as PositionButtons intensity dropdown.

**Profile button for non-own profiles:**
- The "Share" dropdown only appears on the user's own profile (matches current "Share a Story" behavior — only shown to the profile owner). Other users see no create button on someone else's profile.

### 3. Loading States

**`/create-point` page load (with `respondTo` query param):**
- Page shell renders immediately (title, back button, textarea, position buttons all visible but textarea is `disabled` and `tabIndex={-1}` until reference loads — matches `create-story-page.tsx` `pointLoading` pattern).
- "Responding to" area shows skeleton: `<div className="animate-pulse bg-muted rounded h-[48px]" />`.
- On load complete: skeleton replaced with point preview. Textarea enabled and auto-focused.
- On load failure (point not found): skeleton replaced with "This point is no longer available" message. Textarea enabled.

**Search results loading:**
- No separate loading state needed. Points are loaded eagerly on page mount (all points fetched once, filtered client-side). If the initial fetch is slow, the search field is simply empty until data arrives. The search field `placeholder` text is sufficient — no spinner needed for client-side filtering.

**Publish button during submission:**
- Button text changes: "Publish Point" to spinner icon (`Loader2Icon` with `animate-spin`) + "Publishing..." (same pattern as create-story-page line 343-348). Button is `disabled` throughout.

**Response count on feed cards:**
- The response count badge (`💬3`) loads as part of the existing feed query (requires adding `response_count` to the feed point query). No separate loading state — if the count is 0, no badge renders. The badge appears inline with the share button in the action row.

**Responses section on point detail:**
- Section header ("Responses (N)") renders immediately with the count from the point query.
- Response cards below: if responses haven't loaded yet, show 1-2 skeleton cards (same skeleton pattern as feed: `animate-pulse` rectangles). On load, replace with actual cards.
- "Show N more" button: static text, no loading state. Clicking it fetches remaining responses and replaces the button with the full list. During fetch, button text changes to "Loading..." with spinner.

### 4. Accessibility

**Create dropdown:**
- Button: `aria-haspopup="true"`, `aria-expanded={isOpen}`. Dropdown: `role="menu"`. Items: `role="menuitem"`.
- Keyboard: Enter/Space opens dropdown. Arrow keys navigate items. Escape closes. Tab moves focus out and closes.
- Screen reader: Button reads "Create, menu" (or "Share, menu" on profile). On open: "Story, menu item" / "Point, menu item".

**Search field (Responding to):**
- Input: `role="combobox"`, `aria-expanded={resultsVisible}`, `aria-controls="point-search-results"`, `aria-autocomplete="list"`.
- Results list: `role="listbox"`, `id="point-search-results"`. Each result: `role="option"`.
- Active descendant tracking: `aria-activedescendant` updates as user arrows through results.
- Screen reader: "Search points, combo box. N results available." On selection: "Selected: [truncated point text]. Press delete to remove."

**Publish button:**
- During submission: `aria-disabled="true"`, `aria-busy="true"`. Screen reader announces "Publishing" via the button text change.
- On success: toast is announced via `role="status"` (Sonner handles this).

**Reply overlay icon (↩):**
- The `CornerDownLeft` overlay is decorative (the card itself is the interactive element). Use `aria-hidden="true"` on the overlay icon.
- The card's `aria-label` should include "response" when the point has a reference: `aria-label="Response point: [truncated text]"` vs `aria-label="Point: [truncated text]"`.

**Focus management after publish:**
- On successful publish, user navigates to the new point's detail page. Focus lands on the page's `<h1>` equivalent (the point statement) or the back button — whichever is the first focusable element. This matches existing navigation behavior (React Router does not manage focus; the page's first interactive element receives focus naturally).

**Respond button (point detail):**
- Standard `<button>` element. `aria-label="Respond to this point"`. Keyboard accessible via Tab + Enter/Space.

**"Responding to" preview on point detail:**
- `role="complementary"`, `aria-label="This point responds to another point"`. The link to the original point is a standard `<a>` with descriptive text.

**Responses section:**
- Section: `role="region"`, `aria-label="Responses"`.
- "Show N more" button: `aria-label="Show N more responses"`.
- Response cards: same accessibility as existing feed point cards (already have `role="button"`, `tabIndex={0}`, keyboard handlers).

### 5. Responsive Design

**Create dropdown (320px-1024px+):**
- At 320px: the `[+ Create ▾]` button fits comfortably — it is ~120px wide (similar to the current "Share a Story" button which is ~140px). The dropdown menu items are fixed-width (`min-w-[160px]`), right-aligned to the button so they don't overflow left edge.
- On profile (full-width button): "Share ▾" replaces "Share a Story" — same full-width styling. Dropdown appears below, full-width on mobile (`w-full` below `sm:`, `w-auto` at `sm:+`).

**Position buttons at narrow widths:**
- The existing `PositionButtons` component already handles this via `ResizeObserver` + `ICON_ONLY_THRESHOLD` (270px). Below 270px container width, buttons show icons only (no labels, no counts). This works unchanged on `/create-point`.

**Search field on mobile:**
- Full-width input field. Results dropdown also full-width. Max 6 results visible — on very small screens, results may require scrolling within the dropdown (`max-h-[240px] overflow-y-auto`).

**/create-point page layout:**
- Single column, `max-w-2xl mx-auto px-4` (matches `create-story-page.tsx`). All elements stack vertically. No horizontal layout concerns at any breakpoint.
- Textarea: `min-h-[120px]` (shorter than story's `min-h-[150px]` since points are shorter). Auto-resize on content.

**"Responding to" preview truncation at narrow widths:**
- At 320px: the preview area is ~288px wide (320 - 2*16px padding). Pin icon takes 32px + 12px gap = 44px. Text area is ~244px. At this width, 120 chars of truncated text wraps to 2-3 lines — acceptable. `line-clamp-2` applied as a safety net.
- The `[x remove]` button (for standalone search selection) is positioned inline after the text, wrapping below on narrow screens. Alternative: position absolutely at top-right of the preview box.

**Feed cards with response count badge:**
- The `💬3` badge sits next to the share button in the action row. At narrow widths, the action row already uses `flex-wrap` — the badge and share button wrap to a second line if needed. The badge itself is compact (~40px including icon + number).

**Point detail — Responses section:**
- Response cards are standard feed point cards — already responsive. The "Respond" button in the section header is right-aligned via `flex justify-between`. At narrow widths, the header wraps: "Responses (N)" on line 1, "Respond" button on line 2 — achieved with `flex-wrap gap-2`.

### 6. Component Analysis

#### Reuse (no changes needed)

| Component | File | Usage |
|-----------|------|-------|
| `PositionButtons` | `src/app/components/shared/PositionButton.tsx` | Position selection on `/create-point` form — identical to existing usage in `AddPointForm`, `FeedPointCard`, `PointCardWithLinks` |
| `FocusHeader` | `src/app/components/layout/focus-header.tsx` | Back button on `/create-point` page |
| `Button` | `src/components/ui/button.tsx` | "Publish Point" submit button |
| `Textarea` | `src/components/ui/textarea.tsx` | Statement input field |
| `ShareButton` | `src/app/components/shared/share-button.tsx` (via barrel) | Share on response point cards |
| `LinkedText` | `src/app/components/shared/linked-text.tsx` | Rendering point text with URL detection in "Responding to" preview |
| `TagPills` | `src/app/components/shared/tag-pills.tsx` | Tags on response point cards |
| `ClarityLoader` | `src/components/ui/clarity-loader.tsx` | Auth loading state on `/create-point` |
| `SEO` | `src/app/components/seo.tsx` | Meta tags for `/create-point` page |
| `useVerificationGate` | `src/app/hooks/useVerificationGate.ts` | Auth gate for "Respond" button click |
| `useAuth` | `src/auth/` | Session check for create dropdown visibility |
| `toast` (Sonner) | (library) | Success/error notifications |

#### Extend (modify existing components)

| Component | File | Change |
|-----------|------|--------|
| `FeedPointCard` | `src/app/components/feed/feed-point-card.tsx` | (1) Add `💬 N` response count badge in action row next to share button. New prop: `responseCount?: number`. Badge: `MessageSquare` lucide icon (14px) + count text. Only renders when count > 0. (2) Add ↩ reply overlay on pin icon. New prop: `isResponse?: boolean`. When true, render `CornerDownLeft` (12px) absolutely positioned at bottom-right of pin circle with white backing circle. |
| `PointCardWithLinks` | `src/app/components/social/point-card-with-links.tsx` | Same ↩ overlay support via new `isResponse?: boolean` prop. Applied in profile Points tab and in Responses section on point detail. |
| `PointDetailPage` | `src/app/pages/point-detail-page.tsx` | (1) Add "Responding to" section above the point card — fetches reference data, renders preview with pin icon + truncated text + author's position badge + link arrow. (2) Add "Responses" section below "Positions" section — new region with section header, "Respond" button, response card list with progressive disclosure (first 3 + "Show N more"). |
| Feed page (`FeedPage`) | `src/app/pages/feed-page.tsx` | Replace `<Link to="/create">` button with a dropdown trigger component. "Share a Story" becomes `[+ Create ▾]` with dropdown offering "Story" (→ `/create`) and "Point" (→ `/create-point`). |
| Profile page (`ProfilePageV2`) | `src/app/pages/profile-page-v2.tsx` | Replace "Share a Story" button with `[Share ▾]` dropdown. Same two options: "Share a Story" (→ `/create`) and "Make a Point" (→ `/create-point`). |

#### New (create from scratch)

| Component | Proposed file | Description |
|-----------|---------------|-------------|
| `CreatePointPage` | `src/app/pages/create-point-page.tsx` | New page component. Route: `/create-point`. Auth-gated (same pattern as `create-story-page.tsx`). Contains: "Responding to" area (search or pre-filled), textarea, char counter, PositionButtons, "Publish Point" button. ~150-200 lines, follows `create-story-page.tsx` structure closely. |
| `PointSearchPicker` | `src/app/components/shared/point-search-picker.tsx` | Client-side search/filter for points. Modeled after `StorySearchPicker` (`src/app/components/partners/story-search-picker.tsx`). Props: `points: PointWithCounts[]`, `onSelectPoint: (pointId, preview) => void`, `disabled?: boolean`. Renders search input + dropdown results (max 6). ~80 lines. |
| `CreateDropdown` | `src/app/components/shared/create-dropdown.tsx` | Reusable dropdown with "Story" and "Point" options. Props: `variant: 'feed' | 'profile'` (controls button label: "+ Create" vs "Share"). Renders trigger button + dropdown menu. Used by both FeedPage and ProfilePageV2. ~60 lines. |
| `RespondingToPreview` | `src/app/components/shared/responding-to-preview.tsx` | Read-only preview of the referenced point. Props: `pointId: string`, `pointText: string`, `removable?: boolean`, `onRemove?: () => void`. Renders pin icon + truncated text (120 chars) + optional remove button. Used on both `/create-point` (form) and point detail page (header). ~40 lines. |
| `ResponsesSection` | `src/app/components/point-detail/responses-section.tsx` | Section for point detail page. Props: `pointId: string`, `responseCount: number`. Fetches and renders response cards with progressive disclosure. Contains "Respond" button in header. ~100 lines. |
| `ResponseCountBadge` | `src/app/components/shared/response-count-badge.tsx` | Small inline badge showing `💬 N`. Props: `count: number`. Renders only when count > 0. Used in `FeedPointCard` action row. ~15 lines. |
| `ReplyOverlayIcon` | `src/app/components/shared/reply-overlay-icon.tsx` | Absolutely positioned ↩ overlay for pin icon. Renders `CornerDownLeft` (12px) at bottom-right of pin circle on a white backing. `aria-hidden="true"`. Used by `FeedPointCard` and `PointCardWithLinks`. ~20 lines. |

---

## Technical Architecture

### 1. Technical Analysis — Current State

**Points table** (`supabase/migrations/20260204_stories_points_calibration.sql`):
- `points` table: `id UUID PK`, `statement TEXT`, `context TEXT`, `first_validator_id UUID FK→profiles`, `created_at`, `updated_at`, `tags TEXT[]`, `banner_url TEXT`
- `point_positions` table: one position per user per point (`UNIQUE(point_id, user_id)`)
- `story_points` junction: M:N between stories and points
- No `point_references` table exists — this is net-new schema

**Points service** (`src/app/data/points-service-real.ts`):
- `createPoint(statement, context?, tags[])` — inserts into `points` using `auth.getUser()`. Returns `Point` (no counts, no position). Does NOT create an initial position — caller must separately call `setPosition()`.
- `getPublicPointsFeed(limit, offset, tag?, viewerUserId?, ascending?)` — batch fetches points + creator profiles + position counts + viewer positions. Filters out zero-position points (P543).
- `getPointsForProfileDisplay(validatorId, viewerUserId?)` — queries by positions held (not created). Batch loads counts + viewer + subject positions.
- `getPointWithCounts(pointId)` — single point + aggregated position counts.
- `setPosition(pointId, userId, position, reasoning?)` — upsert on `(point_id, user_id)`.

**Key gap**: `createPoint` + `setPosition` are two separate DB operations. If the second fails, an orphan point with 0 positions exists but is invisible in feeds (P543 filter). The spec requires atomic creation via RPC.

**Feed page** (`src/app/pages/feed-page.tsx`, line 173-181):
- "Share a Story" button: `<Link to="/create">` with `PenLine` icon. Conditionally rendered when `session` exists.

**Profile page** (`src/app/pages/profile-page-v2.tsx`, line 898-902):
- "Share a Story" button: full-width `<button>` that navigates to `/create?pointId=...`. Only shown to own profile.

**Point detail page** (`src/app/pages/point-detail-page.tsx`):
- Layout: FocusHeader → Point card (pin icon, statement, tags, PositionButtons) → Footer (ShareButton) → Positions section (FilterTabs + PositionHolderCards with expandable stories).
- "Responses" section does not exist — this is net-new UI.

**Create story page** (`src/app/pages/create-story-page.tsx`):
- Pattern to follow: auth-gated, `useVerificationGate`, `useSearchParams` for `pointId`, skeleton loading for point context, `Loader2Icon` spinner on submit, `toast.success/error`, `navigate()` with `{ state: { justCreated: true }, replace: true }`.

**Story search picker** (`src/app/components/partners/story-search-picker.tsx`):
- ~100 lines. Loads all stories client-side, filters by `content.toLowerCase().includes(query)`. Max 6 results. Click-outside dismissal via `containerRef`. Same pattern needed for `PointSearchPicker`.

**Routing** (`src/App.tsx`):
- Lazy-loaded pages use `lazy(() => import(...).then(m => ({ default: m.ComponentName })))`.
- Wrapped in `<ClarityLandingLayout>` + `<LazyRoute>`.
- No `/create-point` route exists — net-new.

**Type definitions** (`src/app/types/index.ts`):
- `Point`: `{ id, statement, context?, firstValidatorId, createdAt, updatedAt, tags, bannerUrl? }`
- `PointWithCounts`: extends `PointWithCreator` with `positionCounts` + `totalPositions`
- `PointWithUserPosition`: extends `PointWithCounts` with `userPosition?` + `profileSubjectPosition?`
- No reference/response types exist — net-new.

### 2. Architecture Decisions

#### AD-1: Supabase RPC `create_point_with_position`

**Decision**: Single RPC function wrapping point INSERT + position INSERT in a transaction.

**Rationale**: Two separate client calls (`createPoint` → `setPosition`) risk orphan points if the second call fails. The spec mandates atomic creation (requirement #6). An RPC function runs server-side in one transaction — if the position insert fails, the point insert rolls back.

**Signature**:
```sql
CREATE OR REPLACE FUNCTION create_point_with_position(
  p_statement TEXT,
  p_position position_type,
  p_context TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}',
  p_target_point_id UUID DEFAULT NULL  -- for response reference
)
RETURNS UUID  -- returns new point ID
```

**Logic**:
1. Insert into `points` (statement, context, tags, `first_validator_id = auth.uid()`)
2. Insert into `point_positions` (new point ID, `auth.uid()`, position)
3. If `p_target_point_id` is not NULL, insert into `point_references` (new point → target)
4. Return new point ID

**RLS bypass**: RPC runs as `SECURITY DEFINER` with `SET search_path = public`. Caller must still be authenticated (checked via `auth.uid() IS NOT NULL` inside the function body, plus verified-user check).

#### AD-2: `point_references` Junction Table

**Decision**: New table for N:N point-to-point references with V1 constraint of one reference per source point.

**Schema**:
```sql
CREATE TABLE point_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_point_id UUID NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  target_point_id UUID NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_point_id, target_point_id),
  CHECK(source_point_id != target_point_id)
);
```

**V1 constraint**: One reference per source point enforced at application level (not DB constraint), so V2 multi-reference needs no migration.

**RLS**:
- SELECT: public (`USING (true)`)
- INSERT: via RPC only (`SECURITY DEFINER`), no direct insert policy needed
- DELETE: not needed in V1 (references are immutable after creation)

**Indexes**:
- `idx_point_refs_source ON point_references(source_point_id)` — for "get responses to this point"
- `idx_point_refs_target ON point_references(target_point_id)` — for "get what this point responds to"

#### AD-3: Response Count in Feed Queries

**Decision**: Compute response count via a LEFT JOIN subquery in the feed query, not a cached column.

**Rationale**: At current scale (~50 points), the subquery adds negligible cost. A cached `response_count` column would need a trigger and introduces staleness risk. When scale exceeds ~500 points, revisit with a materialized column.

**Implementation**: Add a second batch query in `getPublicPointsFeed` and `getPointsForProfileDisplay` — after fetching points, query `point_references` grouped by `target_point_id` to get response counts. Merge into results. Same pattern as the existing `getPositionCountsForPoints` batch.

#### AD-4: "Responding to" Data on Point Detail

**Decision**: Fetch the reference and target point text in `PointDetailPage`'s existing `loadData()`.

**Implementation**: After loading the point, query `point_references` where `source_point_id = pointId`. If a row exists, fetch the target point via `getPoint(targetPointId)`. Also fetch the current user's position on the target point (for the "Responding to: ... · Disagree →" display). All three queries can run in parallel.

#### AD-5: Routing

**Decision**: New route `/create-point` with lazy-loaded `CreatePointPage`. Follows existing pattern.

```tsx
const CreatePointPage = lazy(() => import("@/app/pages/create-point-page").then(m => ({ default: m.CreatePointPage })));

<Route
  path="/create-point"
  element={
    <ClarityLandingLayout>
      <LazyRoute>
        <CreatePointPage />
      </LazyRoute>
    </ClarityLandingLayout>
  }
/>
```

#### AD-6: Client-Side Point Search

**Decision**: Eagerly load all points on `/create-point` mount, filter client-side. Same pattern as `StorySearchPicker`.

**Rationale**: At current scale (~50 points), loading all is cheaper than building a server-side search endpoint. The `getPublicPointsFeed` with a high limit (200) provides the dataset. Filtered by `statement.toLowerCase().includes(query)`.

**When to revisit**: If point count exceeds 500, switch to server-side search (Supabase `textSearch` or `ilike`).

### 3. Security Review

**RLS on `point_references` table:**
- ✅ SELECT: `USING (true)` — public read (points are public)
- ⚠️ INSERT: Must require `source_point_id` creator == `auth.uid()`. Without this, any user could create fake response links between arbitrary points. Policy: `WITH CHECK (EXISTS (SELECT 1 FROM points WHERE id = source_point_id AND first_validator_id = auth.uid()) AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true))`
- ✅ No UPDATE/DELETE policies — references are immutable

**RLS on existing `points` table:**
- ✅ Existing INSERT policy (verified users only) is adequate
- ✅ No UPDATE/DELETE — enforces immutability at DB level

**RPC `create_point_with_position` security:**
- ⚠️ **HIGH:** Architect chose SECURITY DEFINER (for cross-table atomicity). The function body MUST include manual auth checks: (a) caller authenticated, (b) caller verified, (c) `first_validator_id = auth.uid()`, (d) position `user_id = auth.uid()`. These checks are documented in the migration SQL in AD-1.

**Input Validation:**
- ✅ UNIQUE constraint on `(source_point_id, target_point_id)` — prevents duplicates
- ✅ CHECK `source_point_id != target_point_id` — prevents self-reference
- ⚠️ **MEDIUM:** No `CHECK (char_length(statement) <= 1000)` on `points` table. Must be added in the P523 migration.
- ✅ FKs with `ON DELETE CASCADE` — cleaning up references when points are deleted

**Data Protection:**
- ✅ Points are public by design. No PII in `point_references`.
- ✅ Client-side full-point-load for search is acceptable (all point data is already public).

**Summary:** 1 HIGH (RPC auth checks — already addressed in migration SQL), 2 MEDIUM (INSERT RLS policy + statement length CHECK — must be in migration).

### 4. Implementation Approach

#### 4.1 New Files

| File | Description | ~Lines |
|------|-------------|--------|
| `supabase/migrations/YYYYMMDDHHMMSS_point_references.sql` | `point_references` table + `create_point_with_position` RPC + RLS + indexes | ~80 |
| `src/app/pages/create-point-page.tsx` | `/create-point` page — auth-gated form with optional "Responding to" | ~200 |
| `src/app/components/shared/point-search-picker.tsx` | Client-side point search (modeled on `StorySearchPicker`) | ~80 |
| `src/app/components/shared/create-dropdown.tsx` | Reusable `[+ Create ▾]` / `[Share ▾]` dropdown | ~60 |
| `src/app/components/shared/responding-to-preview.tsx` | Read-only preview of referenced point | ~40 |
| `src/app/components/point-detail/responses-section.tsx` | Responses section for point detail page | ~100 |
| `src/app/components/shared/response-count-badge.tsx` | `💬 N` inline badge for feed cards | ~15 |
| `src/app/components/shared/reply-overlay-icon.tsx` | ↩ overlay on pin icon for response points | ~20 |

#### 4.2 Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add `/create-point` route (lazy-loaded) |
| `src/app/types/index.ts` | Add `PointReference` and `DbPointReference` types; add `responseCount?` to `PointWithCounts`; add `respondingTo?` to `PointWithCounts` |
| `src/app/data/points-service.interface.ts` | Add `createPointWithPosition()`, `getResponsesForPoint()`, `getResponseCounts()`, `getReference()` methods |
| `src/app/data/points-service-real.ts` | Implement new interface methods using Supabase RPC + `point_references` queries |
| `src/app/data/points-service-mock.ts` | Implement mock versions of new methods |
| `src/app/pages/feed-page.tsx` | Replace "Share a Story" `<Link>` (line 173-181) with `<CreateDropdown variant="feed" />` |
| `src/app/pages/profile-page-v2.tsx` | Replace "Share a Story" button (line 898-902) with `<CreateDropdown variant="profile" />` |
| `src/app/pages/point-detail-page.tsx` | (1) Add "Responding to" section above point card; (2) Add `<ResponsesSection>` below Positions section |
| `src/app/components/feed/feed-point-card.tsx` | Add `responseCount?` and `isResponse?` props; render `ResponseCountBadge` + `ReplyOverlayIcon` |
| `src/app/components/social/point-card-with-links.tsx` | Add `isResponse?` prop for `ReplyOverlayIcon` |

#### 4.3 Migration SQL

```sql
-- Migration: Point references and atomic point creation
-- P523: Point-to-Point References & Standalone Point Creation

-- ============================================================================
-- SECURITY: Statement length constraint (from security review)
-- Protects against direct INSERTs bypassing the RPC
-- ============================================================================

ALTER TABLE points ADD CONSTRAINT IF NOT EXISTS chk_points_statement_length
  CHECK (char_length(statement) <= 1000);
ALTER TABLE points ADD CONSTRAINT IF NOT EXISTS chk_points_statement_not_empty
  CHECK (char_length(trim(statement)) > 0);

-- ============================================================================
-- JUNCTION TABLE: point_references
-- ============================================================================

CREATE TABLE IF NOT EXISTS point_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_point_id UUID NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  target_point_id UUID NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_point_id, target_point_id),
  CHECK(source_point_id != target_point_id)
);

CREATE INDEX IF NOT EXISTS idx_point_refs_source ON point_references(source_point_id);
CREATE INDEX IF NOT EXISTS idx_point_refs_target ON point_references(target_point_id);

-- RLS
ALTER TABLE point_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Point references are publicly readable"
  ON point_references FOR SELECT USING (true);

-- No direct INSERT policy — inserts happen via SECURITY DEFINER RPC only.
-- No UPDATE/DELETE policies in V1 — references are immutable.

-- ============================================================================
-- RPC: create_point_with_position
-- Atomic: point + position + optional reference in one transaction
-- ============================================================================

CREATE OR REPLACE FUNCTION create_point_with_position(
  p_statement TEXT,
  p_position position_type,
  p_context TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}',
  p_target_point_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_point_id UUID;
BEGIN
  -- Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verified-user check
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND is_verified = true) THEN
    RAISE EXCEPTION 'User not verified';
  END IF;

  -- Statement length check
  IF length(p_statement) > 1000 THEN
    RAISE EXCEPTION 'Statement exceeds 1000 characters';
  END IF;

  -- Create the point
  INSERT INTO points (statement, context, first_validator_id, tags)
  VALUES (p_statement, p_context, v_user_id, p_tags)
  RETURNING id INTO v_point_id;

  -- Create the initial position
  INSERT INTO point_positions (point_id, user_id, position)
  VALUES (v_point_id, v_user_id, p_position);

  -- Create reference if responding to another point
  IF p_target_point_id IS NOT NULL THEN
    INSERT INTO point_references (source_point_id, target_point_id)
    VALUES (v_point_id, p_target_point_id);
  END IF;

  RETURN v_point_id;
END;
$$;

-- Realtime (optional — enable if needed for live updates)
-- ALTER PUBLICATION supabase_realtime ADD TABLE point_references;
```

#### 4.4 Build Sequence

**Phase 1 — Database (no UI changes)**
1. Create migration file with `point_references` table + `create_point_with_position` RPC
2. Run `./scripts/migrate.sh`
3. Verify: test RPC via Supabase SQL editor

**Phase 2 — Service layer (no UI changes)**
4. Add types: `PointReference`, `DbPointReference` to `src/app/types/index.ts`
5. Add interface methods to `points-service.interface.ts`
6. Implement in `points-service-real.ts`: `createPointWithPosition()` (calls RPC), `getResponsesForPoint()`, `getResponseCounts()`, `getReference()`
7. Implement mock versions in `points-service-mock.ts`

**Phase 3 — Create Point page**
8. Create `create-point-page.tsx` (follows `create-story-page.tsx` pattern)
9. Create `point-search-picker.tsx` (follows `story-search-picker.tsx` pattern)
10. Create `responding-to-preview.tsx`
11. Add route in `App.tsx`
12. Test: standalone point creation, point creation with response

**Phase 4 — Create Dropdown**
13. Create `create-dropdown.tsx`
14. Replace "Share a Story" in `feed-page.tsx` (line 173-181)
15. Replace "Share a Story" in `profile-page-v2.tsx` (line 898-902)

**Phase 5 — Point Detail Enhancements**
16. Create `responses-section.tsx`
17. Add "Responding to" header in `point-detail-page.tsx` (above point card, inside `px-4 py-6` div)
18. Add `<ResponsesSection>` below Positions section in `point-detail-page.tsx`

**Phase 6 — Feed & Profile Card Enhancements**
19. Create `response-count-badge.tsx` and `reply-overlay-icon.tsx`
20. Add `responseCount` + `isResponse` props to `feed-point-card.tsx`
21. Add `isResponse` prop to `point-card-with-links.tsx`
22. Wire response count data into feed queries (batch fetch from `point_references`)
23. Wire `isResponse` flag into feed/profile queries (batch check `source_point_id` existence)

#### 4.5 Key Type Additions

```typescript
// In src/app/types/index.ts

export interface PointReference {
  id: string;
  sourcePointId: string;
  targetPointId: string;
  createdAt: string;
}

export interface DbPointReference {
  id: string;
  source_point_id: string;
  target_point_id: string;
  created_at: string;
}
```

Extend `PointWithCounts`:
```typescript
export interface PointWithCounts extends PointWithCreator {
  positionCounts: Record<PositionType, number>;
  totalPositions: number;
  responseCount?: number;    // P523: count of direct responses
  isResponse?: boolean;      // P523: true if this point references another
  respondingToId?: string;   // P523: target point ID (if response)
}
```

#### 4.6 Service Interface Additions

```typescript
// In points-service.interface.ts

/** P523: Create point + position + optional reference atomically */
createPointWithPosition(
  statement: string,
  position: PositionType,
  context?: string,
  tags?: string[],
  targetPointId?: string
): Promise<string | null>;  // returns new point ID

/** P523: Get direct responses to a point */
getResponsesForPoint(
  pointId: string,
  limit?: number,
  offset?: number,
  viewerUserId?: string
): Promise<PointWithUserPosition[]>;

/** P523: Get response counts for multiple points (batch) */
getResponseCounts(pointIds: string[]): Promise<Map<string, number>>;

/** P523: Get the reference for a source point (what it responds to) */
getReference(sourcePointId: string): Promise<PointReference | null>;
```

---

## Test Coverage Strategy

### Test Pyramid

```
          ┌─────────┐
          │  E2E    │  7 user flow tests + 6 smoke tests
          │ (13)    │  Covers: full user journeys, page loads
         ─┴─────────┴─
        ┌─────────────┐
        │ Integration │  9 tests (P270-mandatory for migration)
        │    (9)      │  Covers: schema, RPC, RLS, constraints, CASCADE
       ─┴─────────────┴─
      ┌─────────────────┐
      │   Unit Tests    │  15 tests
      │     (15)        │  Covers: service layer, data mapping, search
     ─┴─────────────────┴─
    ┌───────────────────────┐
    │  Accessibility (a11y) │  10 tests
    │       (10)            │  Covers: ARIA, keyboard nav, focus mgmt
    └───────────────────────┘
```

### What IS Tested

| Area | Test File | Coverage |
|------|-----------|----------|
| **DB schema** | `e2e/integration/p523-*` | `point_references` table exists, correct columns, indexes |
| **RPC function** | `e2e/integration/p523-*` | `create_point_with_position` callable, returns UUID, atomic creation |
| **RLS policies** | `e2e/integration/p523-*` | Verified user allowed, unverified blocked, public SELECT |
| **CHECK constraints** | `e2e/integration/p523-*` | Self-reference blocked, statement > 1000 chars blocked |
| **UNIQUE constraint** | `e2e/integration/p523-*` | Duplicate reference pair blocked |
| **CASCADE** | `e2e/integration/p523-*` | Deleting point cascades to references |
| **Service: RPC wrapper** | `src/tests/p523-*` | Correct params passed, error handling, all position types |
| **Service: response counts** | `src/tests/p523-*` | Batch count aggregation, empty input, error fallback |
| **Service: data mapping** | `src/tests/p523-*` | snake_case → camelCase, reference lookup, responses query |
| **Client-side search** | `src/tests/p523-*` | Case-insensitive filter, empty query, no match, max 6 limit |
| **Standalone creation** | `e2e/p523-point-creation-*` | Dropdown → /create-point → fill → publish → detail page |
| **Response creation** | `e2e/p523-point-creation-*` | Point detail → Respond → fill → publish → linked back |
| **Response chain** | `e2e/p523-point-creation-*` | A→B→C navigation via "Responding to" links |
| **Progressive disclosure** | `e2e/p523-point-creation-*` | First 3 shown, "Show N more" for overflow |
| **Empty state** | `e2e/p523-point-creation-*` | 0 responses: header + button, no empty text |
| **Page loads** | `e2e/p523-smoke` | /create-point, /create-point?respondTo, point detail, feed dropdown |
| **Graceful degradation** | `e2e/p523-smoke` | Invalid respondTo ID, unauthenticated redirect |
| **ARIA attributes** | `e2e/a11y/p523-*` | Dropdown (haspopup, expanded, menuitem), combobox, listbox, reply icon |
| **Keyboard navigation** | `e2e/a11y/p523-*` | Enter/Space/Escape on dropdown, Arrow keys, Tab order |
| **Screen reader** | `e2e/a11y/p523-*` | aria-live counter, aria-hidden overlay, aria-label on buttons |
| **Manual UAT** | `features/uat/p523.md` | 20 scenarios covering all acceptance criteria |

### What is NOT Tested (and Why)

| Area | Reason |
|------|--------|
| **Realtime subscription for new responses** | Not in V1 scope (no realtime subscription specified) |
| **Concurrent RPC calls (race conditions)** | DB transaction isolation handles this; no application-level concern |
| **Feed ordering with response count** | Feed ordering is `created_at desc` (unchanged); response count is display-only |
| **Profile "Share" dropdown on mobile** | Same component as feed dropdown; responsive CSS tested visually in UAT |
| **StorySearchPicker regression** | Existing component not modified; PointSearchPicker is net-new following same pattern |
| **Position intensity dropdown on /create-point** | Reuses existing PositionButtons component unchanged; covered by existing tests |
| **Unsplash banner on response points** | Banner generation is a separate feature (P504); not P523 scope |
| **Notifications on response creation** | Explicitly out of scope (deferred) |
| **Multi-reference per point** | V2 feature; V1 enforces single reference at application level |
| **Performance at scale (200+ responses)** | Progressive disclosure tested; load testing deferred until >500 points |

### Test Dependencies

- **Integration tests** require a running Supabase instance with the P523 migration applied
- **E2E tests** require dev server + Supabase with migration + at least one verified test user
- **Unit tests** are fully mocked — no external dependencies

---

## Implementation Tasks

**Summary:** 11 tasks, 4 parallelizable pairs (Tasks 2-3, Tasks 5-6, Tasks 7-8, Tasks 10-11), 6 sequential dependencies. Estimated: ~595 lines new code + ~100 lines modifications.

### AC Coverage Matrix

| AC | Task(s) |
|----|---------|
| Create dropdown on feed/profile | T6 |
| `/create-point` route, page, form | T4, T5 |
| Optional "Responding to" search/pre-fill | T4, T5 |
| Atomic point+position creation (RPC) | T1, T3 |
| Point appears in feed/profile | T3 (service), T9 (wiring) |
| Responses section on point detail | T7 |
| "Responding to" header on detail | T8 |
| `point_references` junction table | T1 |
| Reference visible both directions | T7, T8 |
| 💬 count badge on feed cards | T9, T10 |
| ↩ reply overlay on response cards | T9, T10, T11 |
| Progressive disclosure (3 + Show N more) | T7 |
| Verified-only, auth gate | T1 (DB), T4 (UI) |
| Self-reference/duplicate prevention | T1 |
| CASCADE on delete | T1 |

### Security Findings Addressed

| Finding | Severity | Task |
|---------|----------|------|
| RPC auth checks (SECURITY DEFINER) | HIGH | T1 — auth.uid() + is_verified checks in function body |
| INSERT RLS on point_references | MEDIUM | T1 — no direct INSERT policy; inserts via SECURITY DEFINER RPC only |
| Statement length CHECK constraint | MEDIUM | T1 — `chk_points_statement_length` added to `points` table |

---

### Task 1: Database migration — point_references table + RPC
- **Files:** `supabase/migrations/YYYYMMDDHHMMSS_point_references.sql` (create)
- **Spec refs:** "Technical Architecture > AD-1, AD-2" (lines ~636-698), "Implementation Approach > 4.3 Migration SQL" (lines ~787-886), "Security Review" (lines ~731-755)
- **Tests:** `e2e/integration/p523-point-references-migration.spec.ts`
- **Depends on:** None
- **Verify:** `./scripts/migrate.sh` succeeds; RPC callable via SQL editor returning UUID
- [ ] Complete

### Task 2: Types — PointReference, DbPointReference, PointWithCounts extensions
- **Files:** `src/app/types/index.ts` (modify)
- **Spec refs:** "Implementation Approach > 4.5 Key Type Additions" (lines ~925-953)
- **Tests:** `src/tests/p523-point-references.test.ts` (data mapping tests)
- **Depends on:** None
- **Verify:** `npm run build` — no type errors
- [ ] Complete

### Task 3: Service layer — interface + real + mock implementations
- **Files:** `src/app/data/points-service.interface.ts` (modify), `src/app/data/points-service-real.ts` (modify), `src/app/data/points-service-mock.ts` (modify)
- **Spec refs:** "Implementation Approach > 4.6 Service Interface Additions" (lines ~956-983), "Architecture Decisions > AD-3" (lines ~690-696)
- **Tests:** `src/tests/p523-point-references.test.ts` (RPC wrapper, response counts, data mapping, reference lookup)
- **Depends on:** Task 1 (migration), Task 2 (types)
- **Verify:** Unit tests pass; `npm test -- p523`
- [ ] Complete

### Task 4: Create Point page + route
- **Files:** `src/app/pages/create-point-page.tsx` (create), `src/App.tsx` (modify)
- **Spec refs:** "UX Design > Flow A" (lines ~396-406), "UX Design > Flow B" (lines ~408-419), "Architecture Decisions > AD-5 Routing" (lines ~704-721), "Component Analysis > New > CreatePointPage" (line ~579)
- **Tests:** `e2e/p523-point-creation-responses.spec.ts`, `e2e/p523-smoke.spec.ts`
- **Depends on:** Task 3 (service layer)
- **Verify:** Navigate to `/create-point`, fill form, publish — point created and redirected to detail
- [ ] Complete

### Task 5: PointSearchPicker + RespondingToPreview components
- **Files:** `src/app/components/shared/point-search-picker.tsx` (create), `src/app/components/shared/responding-to-preview.tsx` (create)
- **Spec refs:** "UX Design > Flow C" (lines ~421-427), "Architecture Decisions > AD-6 Client-Side Search" (lines ~723-729), "Component Analysis > New > PointSearchPicker" (line ~580), "Component Analysis > New > RespondingToPreview" (line ~582)
- **Tests:** `src/tests/p523-point-references.test.ts` (client-side search tests), `e2e/a11y/p523-accessibility.spec.ts` (combobox ARIA)
- **Depends on:** Task 2 (types)
- **Verify:** On `/create-point` (standalone), search field filters points, selection shows preview with remove button
- [ ] Complete

### Task 6: CreateDropdown + feed/profile wiring
- **Files:** `src/app/components/shared/create-dropdown.tsx` (create), `src/app/pages/feed-page.tsx` (modify), `src/app/pages/profile-page-v2.tsx` (modify)
- **Spec refs:** "UX Design > Flow A steps 1-3" (lines ~396-400), "Component Analysis > New > CreateDropdown" (line ~581), "Component Analysis > Extend > FeedPage" (line ~572), "Component Analysis > Extend > ProfilePageV2" (line ~573)
- **Tests:** `e2e/p523-smoke.spec.ts` (feed dropdown), `e2e/a11y/p523-accessibility.spec.ts` (dropdown ARIA, keyboard nav)
- **Depends on:** None (UI component, no service dependency)
- **Verify:** Feed and profile show dropdown with "Story" and "Point" options; both navigate correctly
- [ ] Complete

### Task 7: ResponsesSection component
- **Files:** `src/app/components/point-detail/responses-section.tsx` (create)
- **Spec refs:** "UX Design > Point Detail wireframe" (lines ~224-266), "UX Design > Empty Responses" (lines ~268-276), "Component Analysis > New > ResponsesSection" (line ~583), "Loading States > Responses section" (lines ~480-483)
- **Tests:** `e2e/p523-point-creation-responses.spec.ts` (progressive disclosure, empty state, respond button)
- **Depends on:** Task 3 (service layer — getResponsesForPoint)
- **Verify:** Point detail shows "Responses (N)" section with cards, progressive disclosure, and Respond button
- [ ] Complete

### Task 8: Point Detail — "Responding to" header + ResponsesSection wiring
- **Files:** `src/app/pages/point-detail-page.tsx` (modify)
- **Spec refs:** "UX Design > Point Detail wireframe" (lines ~224-266), "Architecture Decisions > AD-4" (lines ~698-702), "Component Analysis > Extend > PointDetailPage" (line ~571)
- **Tests:** `e2e/p523-point-creation-responses.spec.ts` (response chain navigation, "Responding to" display)
- **Depends on:** Task 3 (service layer — getReference), Task 5 (RespondingToPreview), Task 7 (ResponsesSection)
- **Verify:** Response point detail shows "Responding to" header with link to original; ResponsesSection renders below Positions
- [ ] Complete

### Task 9: ResponseCountBadge + ReplyOverlayIcon components
- **Files:** `src/app/components/shared/response-count-badge.tsx` (create), `src/app/components/shared/reply-overlay-icon.tsx` (create)
- **Spec refs:** "Component Analysis > New > ResponseCountBadge" (line ~584), "Component Analysis > New > ReplyOverlayIcon" (line ~585), "Accessibility > Reply overlay icon" (lines ~502-504)
- **Tests:** `e2e/a11y/p523-accessibility.spec.ts` (aria-hidden on overlay), `src/tests/p523-point-references.test.ts`
- **Depends on:** None
- **Verify:** Components render correctly in isolation; badge hidden when count=0; overlay has aria-hidden
- [ ] Complete

### Task 10: FeedPointCard — badge + overlay + feed query wiring
- **Files:** `src/app/components/feed/feed-point-card.tsx` (modify), `src/app/pages/feed-page.tsx` (modify — wire response counts into feed query)
- **Spec refs:** "Component Analysis > Extend > FeedPointCard" (line ~569), "Architecture Decisions > AD-3" (lines ~690-696), build sequence steps 20, 22-23 (lines ~920-923)
- **Tests:** `e2e/p523-point-creation-responses.spec.ts` (response count badge visible, ↩ overlay on response cards)
- **Depends on:** Task 3 (service — getResponseCounts), Task 9 (badge + overlay components)
- **Verify:** Feed cards show 💬N badge for points with responses; response points show ↩ overlay
- [ ] Complete

### Task 11: PointCardWithLinks — overlay + profile wiring
- **Files:** `src/app/components/social/point-card-with-links.tsx` (modify), `src/app/pages/profile-page-v2.tsx` (modify — wire isResponse flag)
- **Spec refs:** "Component Analysis > Extend > PointCardWithLinks" (line ~570), "UX Design > Profile wireframe" (lines ~349-379), build sequence step 21 (line ~921)
- **Tests:** `e2e/p523-point-creation-responses.spec.ts` (profile points tab shows ↩ overlay)
- **Depends on:** Task 3 (service), Task 9 (overlay component)
- **Verify:** Profile Points tab shows ↩ overlay on response points
- [ ] Complete

### Dependency Graph

```
T1 (DB) ──────┐
               ├──→ T3 (Service) ──→ T4 (Create Page) ──→ [wire T5 into T4]
T2 (Types) ───┤                  ──→ T7 (ResponsesSection)
               │                  ──→ T8 (Detail wiring) ←── T5, T7
               │                  ──→ T10 (Feed cards) ←── T9
               │                  ──→ T11 (Profile cards) ←── T9
T5 (Search+Preview) ←── T2
T6 (Dropdown) ──── independent
T9 (Badge+Overlay) ── independent
```

**Parallelizable pairs:**
- T1 + T2 + T6 + T9 (all independent — can run simultaneously)
- T4 + T7 (both depend on T3 only)
- T10 + T11 (both depend on T3 + T9)
