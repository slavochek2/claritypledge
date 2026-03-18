---
status: today
type: story
rank: 0.024
tags:
  - points
  - references
  - discourse
  - ux
delivery_stage: 1-prd-review
created_date: 2026-03-15T00:00:00.000Z
prepped_date: null
flow: dev
reviews:
  ux: null
  architect: null
  alignment: null
locked_at: '2026-03-15T14:22:58.149Z'
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

1. **Run `/ux`** — formalize flows, edge cases, accessibility, responsive, component analysis (read and REFINE existing ASCII wireframes, don't duplicate)
2. **Run `/architect`** — junction table, RPC function, RLS, service layer, `/create-point` route
3. **Run `/generate-tests`** → **`/spec-review`** → **`/dev`** → **`/verify`**
