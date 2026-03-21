---
status: in-progress
type: story
rank: 0.75
tags:
  - points
  - stories
  - comprehension
  - architecture
  - ux
delivery_stage: 1-prd-review
created_date: 2026-03-15T00:00:00.000Z
prepped_date: null
flow: dev
reviews:
  ux: null
  architect: null
  alignment: null
locked_at: '2026-03-21T07:58:30.352Z'
---

# P523: Story-First Content Model with Optional Comprehension Assessment

**Supersedes:** P523 V1-V6 (standalone point creation + point-to-point references — dumped 2026-03-19)
**Related:** H-StoryFirst hypothesis, Clarity Canvas v4.0, Architecture Decision Record (story-first model)
**Falsification-tested:** 2026-03-19 — mandatory gate fails, optional gate with async card assessment survives

---

## Design History

**V1-V6 (Mar 15-18):** Standalone point creation + point-to-point references. Points as primary entity. Responses as new points linked to originals. Reached delivery_stage: 4-tests-ready.
**V7 (Mar 19):** Full dump. Story-first architecture emerged from validator bias conversation. Falsification-tested: mandatory gate fails (blocks adoption at 62 users), optional gate with async assessment from cards survives. Key counter-arguments that saved the design: (1) optional gate preserves casual funnel, (2) orchestrated settings make assessment = the activity not friction, (3) async card-based assessment dissolves /live bottleneck, (4) content flywheel (gap → /live → transcript → story → points → engagement) creates retention mechanism.

---

## Problem Statement

**Current state:** Points and stories exist as separate entity types but are treated interchangeably. Points can be created standalone or linked to stories. There is no mechanism to express point-to-point relationships. The `first_validator_id` field on points conflates authorship (who created the claim) with validation (who checked it). The UI hides who introduced a claim — all validators appear equal, masking entanglement.

**Pain points:**
1. **Entanglement invisible:** When a user creates a point about a personal situation ("my co-founder breaks communication under stress"), their friends validate it, but the card shows no signal that the validation set is entangled with the author
2. **No relationship between points:** Points that contradict, refine, or build on each other have no visible connection
3. **Subjective and falsifiable claims conflated:** "I felt dismissed" (subjective experience) and "Remote work is more productive" (testable claim) are both "points" — same entity, same protocol, same card
4. **No return trigger:** Users take positions and leave. Nothing prompts return or deeper engagement. The product delivers gap reveals only in Slava-facilitated sessions, not asynchronously
5. **False premise has no home:** When someone disagrees with the framing itself (not the truth value), the agree/disagree scale doesn't capture this

**Who's affected:** Session participants, workshop attendees, co-founder pairs, the facilitator (Slava), visitors browsing discourse

---

## Intention (Why This Matters)

**Strategic importance:** This is not a feature — it's the architectural implementation of ClarityPledge's core thesis: "comprehension precedes calibration." If verified understanding of a story predictably moves positions on related points, the product can deliver gap revelations asynchronously — scaling the facilitated session experience without Slava present. This is the path from "Slava is the MCP" to "the product is the MCP."

**Why now:** Three facilitated sessions run (Mar 13-16). Protocol validated. But the product can't deliver the "holy shit" moment without Slava. Story-first with comprehension assessment is the mechanism that could make the product independently valuable.

**Impact if not solved:** ClarityPledge remains a facilitator-dependent service with zero standalone product value. The facilitated session can't scale past Slava's personal capacity (7 pairs max). Distribution stays blocked because "try the tool" doesn't produce the experience that "try a session" does.

---

## Business Requirements

**Must-haves:**
1. Stories are the primary content creation entity — users always write stories first
2. Points are extracted from stories (AI-guided, author-approved) — never created standalone
3. Responding to a point means filing a story (your reasoning), which may produce new extracted points
4. Optional comprehension assessment: reader self-assesses understanding of any linked story (0-10) from the card UI. Author counter-assesses (0-10) only when reader also filed a story — position-only self-assessments are a curiosity signal but don't produce a gap (author has nothing substantive to assess from a number alone)
5. Positions on points can be taken without comprehension assessment (casual participation preserved)
6. Unassessed positions are visually distinct ("thin") from assessed ones — soft incentive to assess
7. The gap between self-assessment and author-assessment is visibly surfaced — this IS the async gap revelation
8. False premise is handled as a story without a position on the original point, optionally extracting a reframed point. No separate CTA — one "Share your perspective" button; position is optional inside the flow (story remembers what position was taken, including "no position"). The story's implicit direction (agree/disagree/maybe/no position) is visible from the linked position
9. Minimum story length: 50 characters (~1 sentence)
9. Points remain authorless on the card — parent story (and thus author) is one hop away, traceable but not displayed

**Success conditions:**
- Users file stories when prompted after engaging with a point
- Authors counter-assess at least some readers (bottleneck test)
- Comprehension gaps (self-assessed 9, author-assessed 3) produce curiosity or action (engagement test)
- The content flywheel produces new material: gap → /live → transcript → new stories → point extraction → new engagement

**Constraints:**
- Must not break existing point/story/position functionality
- Must work in orchestrated settings (workshops, facilitated sessions) as primary context
- Assessment is optional — never mandatory gate
- Must work on mobile (workshop participants on phones)

---

## User Stories

### Story Creation (Primary Flow)
- **As a session participant,** I want to write a story explaining my reasoning about a topic, so that others can verify whether they understand me
- **As a facilitator,** I want to extract falsifiable points from a participant's story, so that others can take positions on specific claims
- **As a user responding to a point,** I want to file a story (my reasoning), so that my response has context beyond just agree/disagree

### Comprehension Assessment (Optional)
- **As a reader engaging with a point,** I want to see linked stories that explain why this point exists, so I can understand the reasoning before forming an opinion
- **As a reader,** I want to self-assess how well I understood a story (0-10), so the author knows how their reasoning landed
- **As a story author,** I want to counter-assess a reader's understanding from their story response (not from position alone — a number isn't enough to judge comprehension), so we can surface where understanding breaks down
- **As a user viewing a point,** I want to see which positions are comprehension-assessed vs "thin," so I know which positions have verified understanding behind them

### False Premise
- **As a user who disagrees with a point's framing,** I want to file a story explaining why without being forced to take a position, so my "false premise" response is captured as reasoning, not a number on a scale
- **As a user filing a false premise story,** I want the system to help me extract a better-framed point from my reasoning, so the discourse evolves toward more falsifiable claims

### Point Extraction (V1: Manual)
- **As a story author,** I want to manually extract points from my story by clicking "extract a point" and typing the claim, so I control what enters the commons
- **As a story author,** I want extracted points to appear linked to my story, so readers can trace the reasoning behind each claim

*AI-assisted extraction (suggest points from story content) is a separate follow-up story — not in P523 V7 scope.*

---

## Jobs to Be Done

**When I take a position on a point:**
- I want to understand WHY this point was created (read the parent story), so I can form an informed opinion (motivation: epistemic honesty, not just quick reaction)

**When I've written a story and someone takes a position on my extracted point:**
- I want to know whether they actually understood my reasoning, so I can assess if their position is informed or drive-by (motivation: knowing who actually "gets it")

**When I see a gap between my self-assessed understanding and the author's assessment:**
- I want to explore why I was wrong about how well I understood, so I can calibrate my own metacognitive accuracy (motivation: the "holy shit" moment — discovering I was miscalibrated)

**When I disagree with how a point is framed:**
- I want to articulate WHY and propose a better frame, so the discourse improves rather than just accumulating agree/disagree votes (motivation: productive disagreement, not argument)

**When I facilitate a workshop:**
- I want participants to write stories and extract points during the session, so the workshop produces lasting artifacts for ongoing calibration (motivation: sessions that compound, not one-off events)

**When I import a real conversation (future — validates architecture):**
- I want each person's statements treated as stories so we can assess comprehension gaps asynchronously before a /live session (motivation: prepared calibration on real relationship tension, not cold-start topics). See P559.

---

## Outcomes (Success Metrics)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Story filing rate after point engagement | ≥20% of position-takers also file a story | Query: positions created → stories filed within 24h |
| Author counter-assessment rate | ≥30% of self-assessments get counter-assessed | Query: comprehension_assessments with author_score IS NOT NULL |
| Comprehension gap produces action | ≥1 user mentions the gap in follow-up (session, email, or /live) | Qualitative — facilitator observation in first 5 sessions |
| Points extracted from stories | ≥1 point extracted per story on average | Query: count(points) with parent story / count(stories) |
| Async gap revelation observed | At least one "holy shit" moment from card-based assessment (not /live) | Qualitative — first 10 users |
| Story filing in workshops | ≥50% of workshop participants file at least one story during session | Observation + query |

---

## Acceptance Criteria

### Story-First Creation
- [ ] Users can create stories from feed, profile, and point detail pages
- [ ] Minimum story length: 50 characters (enforced in UI + DB constraint)
- [ ] Author can manually extract points from their story ("Extract a point" button on story detail)
- [ ] Extracted points appear linked to their parent story
- [ ] Points cannot be created without a parent story (standalone creation removed)
- [ ] Existing standalone points in prod remain accessible (backward compatible — no parent story link shown, treated as legacy)

### Responding to Points via Stories
- [ ] Point detail page shows "Share your perspective" (or similar) that navigates to story creation with point context pre-filled
- [ ] The response story links back to the original point
- [ ] Author can optionally take a position on the original point alongside their story
- [ ] Author can decline to take position (false premise path) — story filed without position, implicit direction visible from linked position state
- [ ] Author can manually extract points from response stories (same "Extract a point" as primary creation)

### Comprehension Assessment (Optional)
- [ ] When engaging with a point, reader can see linked stories (reader chooses which to read — no system selection)
- [ ] Reader can self-assess comprehension of any linked story's author (0-10) from the card/detail UI
- [ ] Reader can assess multiple stories on the same point (one assessment per story per reader)
- [ ] Self-assessment is optional — position-taking works without it
- [ ] Author counter-assessment only enabled when reader has filed a story (position-only = self-assessment recorded but no gap produced)
- [ ] Author can counter-assess (0-10) from their story's detail page
- [ ] The gap between self-assessment and author-assessment is visibly displayed when both exist
- [ ] When only self-assessment exists (no counter): show self-assessment with "pending author review" state
- [ ] Positions show verification status: "assessed" (has comprehension scores) vs "thin" (no assessment)
- [ ] Users cannot self-assess their own stories (blocked in UI)
- [ ] Notifications for assessments: OUT OF SCOPE for P523 — will be filed as separate story

### Display & Navigation
- [ ] Point cards show parent story link (subtle, not dominant)
- [ ] Point cards show assessment summary (e.g., "4 assessed, 6 thin" or similar)
- [ ] Story detail shows extracted points with position counts
- [ ] Response stories appear on point detail page (below positions, replacing P523 V1 "Responses" section)
- [ ] Works on mobile (workshop context — participants on phones)

---

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Story creation CTA (from point) | "Share your perspective" | Point detail page, single CTA (replaces existing "Add your story" link) |
| Story creation CTA (from feed) | "Share a Story" | Feed page (existing, unchanged) |
| Point extraction CTA | "Extract a point" | Story detail page, manual extraction button |
| Self-assessment prompt | "How well do you understand [Author]'s reasoning?" | Story card or detail, with 0-10 slider |
| Author counter-assessment prompt | "[Reader] thinks they understand you at [X]/10. What's your read?" | Story detail page (no notification in P523 scope) |
| Gap display | "You: 8 · Author: 3 · Gap: 5" | On assessment card, only when both scores exist |
| Pending assessment display | "You: 8 · Pending author review" | When only self-assessment exists |
| Thin position indicator | Muted styling / no badge | Position without comprehension assessment |
| Assessed position indicator | Small check or badge | Position with comprehension scores |
| Minimum story length error | "Stories need at least 50 characters" | Inline validation on story creation |

---

## Resolved Decisions (from consistency review 2026-03-19)

| # | Decision | Resolution |
|---|----------|------------|
| D1 | What can author assess when reader files no story? | Self-assessment always available (curiosity signal). Author counter-assessment only enabled when reader also filed a story. Position-only = no gap produced. |
| D2 | Multiple stories per point — which does reader assess? | Reader chooses. Can assess any/multiple linked stories. No system selection. |
| D3 | Two CTAs ("Share perspective" + "Challenge framing")? | One CTA: "Share your perspective." Position is optional inside the flow. Story implicitly captures direction (agree/disagree/maybe/no position) from linked position state. |
| D4 | AI extraction scope? | V1: manual extraction only. AI-assisted extraction is a separate follow-up story. |
| D5 | How are authors notified of assessments? | OUT OF SCOPE for P523. Separate story to be filed for notifications. V1: authors check their story detail page. |
| D6 | Minimum story length? | 50 characters (~1 sentence). |

## Open Questions (remaining)

1. **Author bottleneck at scale:** Prolific author with 50 stories → 50 assessment queues. Mitigate: author only assesses when strong positions taken or self-assessment seems implausibly high?
2. **Gaming the gate:** Reader skims, self-assesses 8, takes position. Low cost for reader, creates work for author. Is this a problem at 62 users or only at scale?
3. **Quick agreement path:** "Earth orbits sun" — do I need a story to agree? Perhaps truly uncontroversial points don't attract stories because no one has difficulty understanding them.
4. **Point clustering:** Many stories producing similar points → need convergence signal. AI can help but clustering logic is non-trivial.
5. **Legacy standalone points:** Verify how many exist in prod. Define display behavior (no parent story link, no assessment possible — treated as legacy).

---

## Epic Decomposition

P523 is the vision spec. Implementation is decomposed into incremental specs tagged `epic-story-first`:

| # | Spec | What | Status | Priority |
|---|------|------|--------|----------|
| 1 | P560 | Story filing on any point (no position required) | today | Must-have for workshop |
| 2 | P561 | Comprehension slider on story cards (screening) | today | Core async mechanism |
| 3 | P562 | /live simplification — strip to orchestration | week | Responds to "too clunky" feedback |
| 4 | P563 | Position provenance — engagement depth visibility | week | Entanglement transparency |
| 5 | P564 | Point-to-story attribution — prevent orphan points | week | Story-first at data level |
| 6 | P565 | Response evolution — stories bridging points | week | Discourse evolution |
| — | TBD | AI-assisted point extraction | backlog | Uses existing Gemini /chat |
| — | TBD | Assessment notifications (email) | backlog | Uses existing SMTP |

**Build order:** P560 → P561 → P562 (parallel with P563) → P564 → P565

**Challenge-PRD outcome (2026-03-21):** Initial BLOCK on strategic fit dissolved — P523 serves workshops (distribution channel), not product-instead-of-distribution. Core mechanism reframed as screening (not verification). /live simplification responds to real user feedback ("too clunky"). Remaining concerns: author counter-assessment without notifications (accept low rate in V1), 0-10 self-report framed as screening not verification.

## Next Steps

P560 is ready for `/dev` (scope is 1-2 hours, single concern).
P561 needs `/ux` then `/architect` (new UI component + new DB table).
P562 needs `/ux` exploration (how much of /live to keep vs strip).
P563-P565 need `/ux` after P561 ships.
