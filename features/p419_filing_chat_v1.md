---
status: backlog
type: story
rank: 34
workstream: C1
tags:
  - filing
  - stories
  - points
  - ai-chat
  - calibration
prepped_date: '2026-02-24'
delivery_stage: challenge-prd
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-02-24T00:00:00.000Z
---

# P419: Filing Chat V1 — AI-Guided Single Story Creation

## Problem Statement

**Current state:** Creating a well-structured story on ClarityPledge requires manually writing a narrative that clearly separates subjective experience from verifiable claims. Filing one story with linked points currently takes hours of careful work for the founder, and is practically impossible for workshop participants without guidance.

**Pain points:**
- Filing a story manually is slow (hours per story) — blocks content creation, event prep, and workshop execution
- Workshop participants conflate understanding with agreement, write vague stories, and miss the stories/points distinction without real-time guidance
- Garbage-in → calibration fails → the workshop proves nothing
- There's no feedback loop during creation: a person files something unclear and only discovers the problem during calibration (too late)
- Current "Create Story" flow is a blank form — provides no scaffolding

**Who's affected:**
- **Slava (founder)**: needs to file 3-5 core onboarding stories before first workshop
- **Workshop participants**: need to file their own stories during the event with no prior training
- **Any user taking a position on a point**: prompted to file a supporting story, currently has no guided way to do so

---

## Intention (Why This Matters)

**Strategic importance:** Filing quality IS calibration quality. Without well-structured stories, the /live calibration session has nothing meaningful to work with. The AI filing assistant isn't a speed optimization — it's quality control and the minimum viable workshop experience.

**Why now:** The first workshop is the core validation event for the C1 workstream. Deferring the filing tool means either (a) running a workshop with content too sloppy to calibrate, invalidating the learning, or (b) Slava spending days manually filing for every participant. Neither is acceptable.

**Impact if not solved:**
- Can't run workshops at meaningful quality
- Can't validate whether the calibration mechanic resonates with real participants
- Founder bottleneck on content creation blocks the recognition flywheel (R1)

**Strategic fit:** Every conversation with the AI produces publishable content (stories, points, blog material). This creates a content flywheel where the filing session itself generates workshop material.

---

## Business Requirements

**Entry points (V1):**
1. **"Create Story" button** — standalone entry from own profile / stories section. Blank start, no pre-seeded context. Leads to full AI loop + point extraction.
2. **Position → story prompt** — fires after staking a position on any point (the P425 `StoryGuideChat` core loop handles this). P419 adds the point extraction step after loop completion. The point context is pre-seeded; no separate entry mechanic needed.

**Explicitly out of scope for V1:**
- /live session context — strong-disagreement filing during a paraphrasing round is a separate UX problem (captured in `features/drafts/p428_live_position_story_filing.md`).

**Must-haves:**
- Any authenticated user can start a guided story-filing session from "Create Story"
- User can paste or type a brain dump — raw, messy, unstructured
- AI mirrors back a structured story (reuses `StoryGuideChat` from P425 via `onStoryConfirmed` callback)
- User rates 0–10 how understood they feel; gives corrections if <10
- Loop continues until user is satisfied (same principle as /live verification threshold)
- AI extracts points from the approved story and presents them for review
- User approves, removes, or edits extracted points
- On confirmation: story and linked points are saved to Supabase
- When a user takes a position on someone else's point, they are prompted to file a supporting story via this same flow
- User must have staked a position on a point before filing a story linked to it (no position = no link, but story can still be filed standalone)
- Removing a position removes the story↔point link but does NOT delete the story

**Success conditions:**
- Filing a story goes from hours → under 15 minutes
- Filed stories are consistently clear enough to calibrate on (author-verified)
- Workshop participants can file without prior training
- Every filed story has the author's explicit confirmation that it represents their meaning

**Constraints:**
- V1: single story per session (not multi-story open chat — that is V2)
- V1: text input only (voice deferred)
- Must save to existing stories + story_points schema (no new tables if avoidable)
- Must enforce the stories/points distinction (stories = subjective experience; points = verifiable claims)
- Existing sifter-story and sifter-point skills contain the prompt logic — build on those, don't rebuild

---

## User Stories

**As Slava preparing for a workshop:**
- I want to paste a raw brain dump and have AI mirror it back as a structured story, so I can file my core onboarding stories without hours of manual work
- I want to confirm the AI understood me (0–10 rating), so the story I publish actually represents what I meant
- I want AI to extract the verifiable claims embedded in my story as points, so each story comes with calibration targets

**As a workshop participant:**
- I want guided help structuring my personal story, so I can file content good enough to calibrate on without prior training
- I want the AI to ask me clarifying questions when my input is vague, so I produce something meaningful rather than something that will fail calibration

**As a user who just took a position on a point:**
- I want to be prompted to file a story explaining why I hold this position, so my position is grounded in something calibratable, not just a vote

**As any user creating a story:**
- I want to see a conversational chat interface (not a blank form), so the creation process feels natural rather than effortful
- I want to review and edit extracted points before publishing, so I have control over what gets filed

---

## Jobs to Be Done

**When I have a raw experience or belief I want to communicate:**
- I want a way to turn messy thoughts into a clear, structured story, so that others can understand what I actually mean (motivation: being understood accurately)

**When I'm preparing workshop content:**
- I want to file stories quickly without quality degrading, so I can focus on facilitation not content production (motivation: leverage — one effort, many calibrations)

**When I take a position on someone else's point:**
- I want to be invited to explain my "why" as a story, so my position isn't just a score but something others can understand and calibrate on (motivation: my position being genuinely understood, not just registered)

**When I'm a workshop participant with no experience:**
- I want AI to guide me through what a story is vs. what a point is, so I don't have to read documentation before I can participate (motivation: low barrier to contribution)

---

## Outcomes (Success Metrics)

**Time savings:**
- Reduce story filing time from hours → under 15 minutes per story

**Quality:**
- Author explicitly confirms "this represents what I meant" before publishing (0-10 rating, threshold TBD — likely ≥8 mirrors /live)
- Reduction in calibration failures attributed to unclear source stories

**Adoption:**
- Workshop participants can file at least one story during a 90-min event without external help
- Position → story prompt generates at least 1 story per workshop from participants (new content type trigger)

**Flywheel:**
- Every chat session produces ≥1 publishable story + ≥1 linked point

---

## Acceptance Criteria

- [ ] "Create Story" entry point opens a chat-style interface (not a blank form)
- [ ] User can paste or type any raw input to start the session
- [ ] AI responds with a structured story mirroring the user's input
- [ ] User can rate understanding 0–10 and provide corrections
- [ ] Conversation loops until user confirms satisfaction
- [ ] AI presents extracted points for user review after story is approved
- [ ] If AI extracts zero points, story saves standalone — user sees "no points found" message and is not blocked
- [ ] User can edit, remove, or approve each extracted point
- [ ] On confirmation, story is saved to Supabase with status = private (draft) or published per user choice
- [ ] Extracted points are saved and linked to the story
- [ ] After a user stakes a position on a point, they see a prompt to file a supporting story (same flow)
- [ ] Stories/points distinction is maintained: AI does not file subjective experiences as points or verifiable claims as stories
- [ ] Flow works for any authenticated user (not Slava-only)
- [ ] No voice input required in V1

---

## Next Steps

This is a UI feature with backend persistence.

1. Run `/ux features/p419_filing_chat_v1.md` — design the chat interface, entry points, and conversation flow
2. Run `/architect features/p419_filing_chat_v1.md` — technical implementation (Claude API integration, system prompt, tool definitions, Supabase writes)
3. Run `/generate-tests features/p419_filing_chat_v1.md` — test automation
4. Run `/dev features/p419_filing_chat_v1.md` — implement

**Related:**
- `features/drafts/p420_filing_chat_v2.md` — multi-story V2 (parked)
- `features/drafts/p421_presession_safety_check.md` — pre-session safety check (parked)
- `features/drafts/p428_live_position_story_filing.md` — /live filing context (parked)

**Sequencing note:** Run `/ux` only after P425 architect completes. The P425 architect defines `StoryGuideChat`'s props interface (`onStoryConfirmed` callback) — P419's UX depends on knowing how point extraction hooks in.
