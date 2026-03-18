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
**V5 (Mar 18):** Full design exploration — 4 innovation agents + falsification. Resolved all major UX decisions through adversarial testing.

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
3. Navigates to `/create-point` page
4. Form: statement text (1000 char hard limit) + position selection (matches AddPointForm)
5. Button: "Publish Point" (matches existing "Publish Story")

### Point Responses (References)
6. Point detail page shows "Respond" button in the Responses section header
7. Clicking "Respond" navigates to `/create-point?respondTo=<pointId>` (reuses same create-point page with reference pre-filled)
8. Created point is linked to the original via `point_references` junction table
9. Response IS a point — same entity, same capabilities, same 1000 char limit
10. One reference per point in V1 (multi-reference is V2)
11. Responses can respond to responses (chains are natural: A → B → C)

### Display Rules
12. **Point detail page:** "Responding to" line shown above the point statement (author's position on original + link). Format: `Responding to: 📌 "Original text…" · Disagree →`
13. **Point detail page:** "Responses" section shown BELOW "Positions" section. Section header includes "Respond" button. Response cards are standard point cards with PositionButtons (differentiator from story cards).
14. **Feed cards:** Show 💬 count badge only (no "Responding to" text). Click navigates to point detail.
15. **Profile Points tab:** No change — responses ARE points, appear naturally. No new tab.
16. **Flat display:** Each point shows only its DIRECT responses. No tree view. Follow chains by clicking through.
17. **Scale (200+ responses):** Progressive disclosure — first 3 position-diverse (not chronological), "Show N more" with position breakdown.
18. **Empty state (0 responses):** Show section header + Respond button. No list area, no "No responses yet" text.

### Auth & Constraints
19. Verified users only (matches existing point creation rules)
20. Creating a response does NOT affect positions/stories on either point
21. Points remain immutable — responses are new points, not edits
22. Duplicate references prevented (same pair linked once)

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
- First 3 responses position-diverse (one agree, one disagree, one nuanced)
- "Show N more" with breakdown: "(12 agree, 8 disagree, 24 unsure)"
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
- [ ] "📌 Point" navigates to `/create-point`
- [ ] `/create-point` page: statement textarea (1000 chars) + PositionButtons + "Publish Point" button
- [ ] Optional "Responding to" search field (empty when standalone, pre-filled when from Respond)
- [ ] Created point appears in feed and profile Points tab

### Point Responses
- [ ] Point detail page: "Responses" section below "Positions" section
- [ ] Section header: "Responses (N)" + "Respond" button
- [ ] "Respond" navigates to `/create-point?respondTo=<pointId>` with reference pre-filled
- [ ] Response creates new point + entry in `point_references` junction table
- [ ] Both source and target point detail pages show the reference
- [ ] On response's detail page: "Responding to: 📌 [text] · [author position] →" shown above statement
- [ ] "Responding to" NOT shown on feed cards or profile cards
- [ ] Feed cards: 💬 count badge when responses > 0
- [ ] Response cards in Responses section: standard point cards with PositionButtons
- [ ] First 3 responses position-diverse, "Show N more" with breakdown when > 3
- [ ] 0 responses: section header + Respond button visible, no empty list
- [ ] A point can respond to a response (chains allowed)
- [ ] One reference per point (V1)
- [ ] Duplicate references prevented
- [ ] Verified users only

---

## ASCII Design Reference

See conversation history for full ASCII wireframes. Key screens:

1. **Feed** — `[+ Create ▾]` dropdown, 💬N badge on point cards
2. **Point Detail** — "Responding to" header, Positions section, Responses section with Respond button
3. **Respond Flow** — navigates to `/create-point?respondTo=id`, reference pre-filled
4. **/create-point** — standalone page, optional reference search
5. **Chain** — A→B→C, flat display, each shows direct responses only

---

## Next Steps

1. **Run `/ux`** — formalize flows, edge cases, accessibility, responsive, component analysis
2. **Run `/architect`** — junction table, RLS, service layer, create-point route
3. **Run `/generate-tests`** → **`/spec-review`** → **`/dev`** → **`/verify`**

## ASCII Wireframes

### Feed — Create Dropdown + Response Count

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
│ │📌 "Climate policy must..."  │   │
│ │ [Dis][?][Agree]    💬3 [🔗] │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │📌 "Remote work reduces..."  │   │
│ │ [Dis][?][Agree]        [🔗] │   │
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

### Point Detail — Full Page (Corrected Order)

```
┌────────────────────────────────────┐
│ ← Back                            │
│                                    │
│ Responding to:                     │  ← only if this point
│ 📌 "Climate policy must…"         │     responds to another
│ · Disagree →                       │  ← author's position on original
│                                    │
│ 📌 "Nuclear is the bridge         │
│    we're ignoring"                 │
│ #energy #nuclear                   │
│                                    │
│ [Dis][?][Agree]                    │
│────────────────────────────────────│
│                            [🔗]   │  ← share only in footer
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
│ │📌 "Nuclear waste storage     │   │
│ │    remains unsolved"         │   │  standard point card
│ │ [Dis][?][Agree]        [🔗] │   │  with PositionButtons
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │📌 "Thorium reactors solve    │   │
│ │    the waste problem"        │   │
│ │ [Dis][?][Agree]        [🔗] │   │
│ └──────────────────────────────┘   │
│                                    │
│ Show 44 more                       │
│ (12 agree, 8 disagree, 24 unsure) │
└────────────────────────────────────┘
```

### Point Detail — Empty Responses (0)

```
│ ── Positions (3) ─────────────── │
│ [holders...]                       │
│                                    │
│ ── Responses (0) ─── [Respond] ── │  ← header + button visible
│                                    │     no list, no empty text
│                                    │
```

### Respond Flow — Navigate to /create-point

```
Click [Respond] → /create-point?respondTo=<id>

┌────────────────────────────────────┐
│ ← Back                            │
│                                    │
│ Make a Point                       │
│                                    │
│ Responding to:                     │
│ 📌 "Nuclear is the bridge…"       │  ← read-only, pre-filled
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
│ ┌──────────────────────────────┐   │
│ │ State your claim...          │   │
│ └──────────────────────────────┘   │
│ 0/1000                             │
│                                    │
│ Your position:                     │
│ [Dis][?][Agree]                    │
│                                    │
│ Responding to: (optional)          │
│ [🔍 Search points...]             │
│                                    │
│ (when selected:)                   │
│ 📌 "Climate policy…"  [✕ remove]  │
│                                    │
│           [Publish Point]          │
└────────────────────────────────────┘
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

### Profile — Points Tab (No Change)

```
│ Points (5) | Stories (3)           │
│                                    │
│ ┌──────────────────────────────┐   │
│ │📌 "Nuclear is the bridge…"  │   │
│ │ [Dis][?][Agree]    💬2 [🔗] │   │  response count visible
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │📌 "Remote work reduces…"    │   │
│ │ [Dis][?][Agree]        [🔗] │   │  no 💬 = no responses
│ └──────────────────────────────┘   │

Responses ARE points — appear naturally in Points tab.
No "Responding to" shown on profile cards.
No new tab needed.
```
