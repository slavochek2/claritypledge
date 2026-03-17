---
status: today
type: story
rank: 0.75
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

# P523: Point-to-Point References

**Supersedes:** P433 (Correct a Point — draft), P535 (Point Link Types — absorbed, deferred as V2)
**Related:** P536 (Short IDs — separate, backlog)

---

## Design History

**V1 (2026-03-15):** "Standalone Point Creation & Inspired By" — single nullable FK (`inspired_by_point_id`), parent-child versioning model. PRD + UX + Architecture completed.

**Challenge (2026-03-16):** `/challenge-prd` returned CHALLENGE with 4 BLOCKs (strategic misalignment with C1, zero external demand, problem misidentification, core UX undefined). Narrowed to "Suggest a different version" button on point detail page.

**Pivot (2026-03-17):** ASCII wireframe review revealed the parent-child model is too restrictive. Real use cases include contradictions, responses, and multi-point references — not just versioning. Pivoted to generic point-to-point references with junction table. Key decisions from discovery conversation:
1. Response format: a new point (not a comment — every response is a claim people can agree/disagree with)
2. References are bi-directional and passive ("N related points")
3. Unlabeled links first — no type taxonomy until 10+ links show clustering
4. Point-to-point only (stories already link to points via `story_points`)
5. Any authenticated user can reference any point

---

## Problem Statement

**Current state:** Points exist as isolated claims. Users take positions on them, stories explain their reasoning. But there's no way to connect points to each other. When a workshop participant reformulates a point, contradicts it, or builds on it — the new point has no visible relationship to the original. The discourse is fragmented.

**Pain points:**
- **No way to say "this responds to that."** A co-founder in a /live session formulates a better version of a point — the new point floats in the feed with no link to the original. Visitors see two similar points with no context for why both exist.
- **Contradictions are invisible.** Two opposing points on the same topic look unrelated. The discourse that produced them is lost.
- **Evolution is invisible.** When thinking evolves through conversation (the core ClarityPledge loop), the product doesn't capture the evolution — only the snapshots.
- **The founder needs SQL to evolve points.** No UI path exists to create a point in response to another.

**Who's affected:**
- **Event/workshop participants** — they self-serve and encounter points they'd respond to (reformulate, contradict, build on)
- **Co-founders in /live sessions** — better formulations and opposing views emerge through conversation
- **The founder** — needs to capture discourse relationships without SQL
- **Visitors browsing points** — they see isolated claims without the discourse context that makes them meaningful

---

## Intention (Why This Matters)

**Strategic importance:** ClarityPledge's philosophy says points closest to truth exhibit asymmetric conversion — opponents convert after understanding the supporting stories. But for that to work, opposing and related points must be *visibly connected*. Currently the product shows individual claims but not the discourse between them. Point references make the discourse structure visible.

**Why now:** Event participants already self-serve and create points. The need to connect points has been observed in events and sessions. The founder's own points have evolved through session conversations and required SQL to capture. As more users engage, disconnected points will fragment the discourse that's supposed to be ClarityPledge's core value.

**Impact if not solved:** Points remain isolated snapshots. The platform looks like a bulletin board of disconnected claims rather than a living discourse. The asymmetric conversion hypothesis can't be observed because related points aren't connected.

---

## Business Requirements

**Must-haves:**
1. Any authenticated user can create a reference between two points (from the point detail page)
2. References are bi-directional — both points show the connection
3. Creating a reference does NOT affect positions or stories on either point
4. Both referenced and referencing points show "N related points" with navigation
5. When creating a new point, user can optionally reference an existing point as context
6. References are unlabeled (no type taxonomy in V1)
7. A point can have multiple references (N:N relationship)
8. Users can reference points they didn't create

**Out of scope (deferred):**
- Link types / labels (refines, contradicts, extends) — V2 after observing what relationships emerge (P535 absorbed)
- Story-to-story or story-to-point references (stories already link to points via `story_points`)
- Standalone point creation page (entry point remains point detail page)
- Notifications when someone references your point
- Feed grouping by reference clusters
- Short IDs for points (P536, separate)

**Success conditions:**
- User can go from "this point relates to that point" to "reference created" in under 30 seconds
- Both points show the reference (bi-directional, passive)
- The discourse structure is browsable — visitors can follow reference chains

**Constraints:**
- Entry point: point detail page (reference from point A while viewing it)
- Points remain immutable — references are metadata alongside, not modifications
- No forced position changes on either point

---

## User Stories

**As a user who wants to respond to a point:**
- I want to create a new point that references an existing one, so my response is visibly connected to what I'm responding to

**As a user who sees two related points:**
- I want to link them, so visitors can see the relationship

**As a user viewing a point with references:**
- I want to see how many related points exist and navigate to them, so I can explore the discourse

**As a visitor viewing a referenced point:**
- I want to see "N related points" and browse them, so I understand the broader conversation around this claim

**As a workshop participant reformulating a point:**
- I want to create my version and link it to the original, so both formulations are visible and connected

**As a co-founder who disagrees with a point's framing:**
- I want to create a counter-point and reference the original, so the disagreement is explicit and explorable

---

## Jobs to Be Done

**When I see a point I'd word differently:**
- I want to create my version and link it, so others can see both formulations and choose which resonates (motivation: contributing without overwriting)

**When a /live session surfaces a contradiction:**
- I want to capture both sides as linked points, so the disagreement is visible and falsifiable (motivation: making discourse honest)

**When I want to build on someone's claim:**
- I want to create a supporting point and reference the original, so the argument chain is explorable (motivation: strengthening discourse)

**When I'm exploring a topic and find related points:**
- I want to link them together, so future visitors can follow the thread (motivation: curating discourse)

---

## Outcomes (Success Metrics)

**Unblock metric:**
- Users can create and browse point references from the UI — binary pass/fail

**Usage metrics (observe, no targets):**
- How many references are created?
- Are references bi-directional in practice? (Do users reference in both directions?)
- Do visitors follow reference links? (click-through rate on "N related points")
- What types of relationships emerge? (for V2 type taxonomy decision)

**Quality signals:**
- References are meaningful (not spam linking unrelated points)
- Reference chains stay shallow (1-2 hops between related points)

---

## Acceptance Criteria

- [ ] Authenticated user can create a reference from one point to another via the point detail page
- [ ] When creating a new point, user can optionally select an existing point to reference
- [ ] Both the source and target point detail pages show the reference ("N related points")
- [ ] "N related points" is clickable and shows a list of linked points with truncated statements
- [ ] Each linked point in the list is navigable (click → go to that point's detail page)
- [ ] Creating a reference does not affect positions, stories, or any data on either point
- [ ] A point can have multiple references (both as source and as target)
- [ ] Any authenticated user can create a reference (not limited to point authors)
- [ ] References are unlabeled — no type selection required
- [ ] Duplicate references are prevented (same pair cannot be linked twice)
- [ ] References work for any authenticated user, not just verified users (existing point creation requires verified — clarify if references follow same rule)

---

## Next Steps

1. **Run `/challenge-prd`** — stress-test the pivoted requirements
2. **Run `/ux`** — design reference creation flow, "N related points" display, new-point-with-reference flow
3. **Run `/architect`** — design `point_references` junction table, RLS, service changes
4. **Run `/generate-tests`** → **`/spec-review`** → **`/dev`** → **`/verify`**
