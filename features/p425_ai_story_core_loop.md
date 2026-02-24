---
status: week
type: story
rank: 8.5
workstream: C1
tags: [stories, ai-chat, filing, calibration, position]
prepped_date: '2026-02-24'
blocked_by: []
delivery_stage: prd-review
reviews:
  ux: null
  architect: null
  alignment: null
---

# P425: AI-Guided Story Creation — Core Loop (position-triggered)

## Problem Statement

**Current state:** When a user stakes a position on a point, they register a score but provide no explanation of why they hold that position. The experience ends there — a number without a voice. There is no guided path from "I took a position" to "here is my story behind it."

**Pain points:**
- A staked position is a number with no grounding — others cannot understand or calibrate on what the position holder actually means
- Users who want to articulate their "why" face a blank story-creation form with no scaffolding
- Without AI guidance, most users will either skip the story entirely or produce vague content that fails calibration
- The stories/points distinction (stories = subjective experience; points = verifiable claims) is invisible to users without guidance — they conflate the two
- There is no feedback loop: a user who files a vague story only discovers it is unclear during calibration (too late)

**Who's affected:**
- Any user who stakes a position on a point and wants their position to be understood, not just registered
- Workshop participants who need to file supporting stories during a live session with no prior training
- Slava (founder) preparing onboarding stories linked to existing points before a workshop

---

## Intention (Why This Matters)

**Strategic importance:** A position without a story is a vote. A position with a story is a calibration opportunity. The core loop converts opinions into structured, verifiable narratives — the raw material the /live mechanic needs to work. Without it, positions accumulate but the calibration flywheel does not turn.

**Why now:** The first workshop validation (C1) depends on participants being able to file stories during the session. Without an AI-guided path from "I took a position → here is why," participants either skip the story step or produce content too vague to calibrate on. Both outcomes invalidate the workshop hypothesis.

**Impact if not solved:**
- Workshop positions remain ungrounded — calibration operates on labels, not meaning
- The recognition flywheel (R1) does not activate: no stories → no points worth calibrating → no paraphrases worth verifying
- Slava continues filing stories manually (hours per story), creating a founder bottleneck that blocks content creation at scale

**Relationship to P419:** This spec is the core reusable loop. P419 extends it by adding (a) a standalone "Create Story" entry point and (b) point extraction after story confirmation. This spec has no dependency on P419 — it can ship first and P419 builds on it.

---

## Business Requirements

**Must-haves:**
- After a user stakes a position on a point, a prompt appears: "Want to explain why?"
- Accepting the prompt opens an AI chat interface pre-seeded with context (which point, what position was staked)
- User can type a brain dump — raw, messy, any length
- AI mirrors back a structured first-person story using NVC scaffolding (invisible to user): what happened, what was felt, what need is present, what is wanted
- User rates 0–10: "How well does this represent what you mean?"
- AI responds to the rating with targeted clarifications or options (per the rating band)
- Loop continues until user is satisfied or chooses to save at current rating
- After the loop, AI presents a polished version for user review before saving
- User selects visibility: Private / Shared / Public (default: Private)
- Story is saved to Supabase, linked to the point the user took a position on
- No point extraction in this flow (the point already exists — this loop files only the story)

**Rating response bands (from sifter-story logic):**
- 10: Story complete — save
- 8–9: "Almost there. What's missing?" + 3 targeted options + "Other"
- 5–7: "I'm missing something. Here's what I'm uncertain about: [X]. Which is closer?" + 3 options + "Other"
- <5: Significant misunderstanding — AI tries again with a clarifying question
- Escape hatch after 3 attempts without reaching 10: "Save at current rating, or keep refining?"

**Success conditions:**
- Story is filed with the author's explicit confirmation it represents their meaning
- Filed story is linked to the specific point the position was staked on
- User completes the flow without reading documentation or asking for help
- Stories filed via this loop are consistently structured enough to calibrate on

**Constraints:**
- V1: text input only (voice deferred)
- V1: single story per session (this loop files one story linked to one point)
- Must save to existing `stories` table and link via existing schema (no new tables if avoidable)
- Must enforce stories/points distinction: stories = subjective experience, points = verifiable claims. AI must not embed verifiable factual claims as the story body
- Build on sifter-story prompt logic (`.claude/commands/slava/content/sifter-story.md`) — do not rebuild
- ≥8 rating threshold for "confirmed" status mirrors the /live verification threshold

---

## User Stories

**As a user who just staked a position on a point:**
- I want a "want to explain why?" prompt to appear after staking, so I have a clear invitation to file a supporting story without navigating away or searching for a create form
- I want the AI chat to know which point I'm responding to, so I don't have to re-explain context
- I want to brain-dump my thoughts freely and have AI structure them for me, so I can articulate my position without worrying about format

**As a user iterating on a story draft:**
- I want to rate how well the AI understood me (0–10), so I have a concrete feedback mechanism instead of just "is this right?"
- I want the AI to offer specific correction options when my rating is 5–9, so I can guide it efficiently rather than re-explaining from scratch
- I want an escape hatch after several iterations, so I don't feel trapped in a loop if "good enough" is sufficient

**As a user confirming and saving:**
- I want to see a polished version before it saves, so I can catch anything that changed during polish
- I want to choose Private / Shared / Public visibility before saving, so I control who can see my story from the start
- I want the default to be Private, so I don't accidentally publish something I'm not ready to share

**As a workshop participant with no prior training:**
- I want the AI to guide me through what makes a good story vs. a verifiable claim, so I don't have to read documentation to participate
- I want to complete the story-filing flow during a 90-minute workshop session without external help

---

## Jobs to Be Done

**When I stake a position on someone else's point:**
- I want to be invited to explain why, so my position isn't just a score but something others can understand and calibrate on (motivation: being genuinely understood, not just registered)

**When I have a raw experience I want to articulate:**
- I want a way to turn messy thoughts into a clear story, so that what I mean is what others read (motivation: accurate representation of meaning)

**When I'm iterating with the AI:**
- I want the AI to offer concrete correction options rather than asking "what's wrong?", so I can steer the story faster without having to re-articulate everything (motivation: efficiency without losing precision)

**When I'm about to save:**
- I want to see the polished version first, so I feel in control of what gets published (motivation: ownership of my own narrative)

**When I'm a first-time workshop participant:**
- I want AI guidance so I can contribute meaningful content in real time, without prior training in NVC or the stories/points model (motivation: low barrier to participation)

---

## Outcomes (Success Metrics)

**Time to file:**
- Reduce story filing time from hours (manual) to under 15 minutes per story via the guided loop

**Story quality:**
- Author explicitly confirms ≥8/10 before the story is published (threshold mirrors /live verification)
- Reduction in calibration sessions failing due to unclear source stories

**Adoption:**
- ≥80% of users who stake a position and open the prompt complete a story (don't abandon mid-loop)
- Workshop participants file at least one story during a 90-minute session without external help

**Groundedness:**
- Positions linked to at least one filed story increase within 2 workshops of shipping this feature

---

## Acceptance Criteria

- [ ] After staking a position on a point, user sees a "Want to explain why?" prompt
- [ ] Accepting the prompt opens an AI chat pre-seeded with the point context (point text, user's staked score)
- [ ] User can type a brain dump of any length to start the loop
- [ ] AI responds with a structured first-person story (not labeled NVC components)
- [ ] User sees a 0–10 rating prompt after each AI story draft
- [ ] AI responds differently based on rating band (10 = complete; 8–9 = targeted options; 5–7 = clarification options; <5 = re-attempt)
- [ ] After 3 iterations without reaching 10, user is offered "save at current rating or keep refining"
- [ ] On loop completion, AI presents a polished version with brief change notes before saving
- [ ] User selects visibility (Private / Shared / Public) before confirming save — default is Private
- [ ] Story is saved to Supabase linked to the point the position was staked on
- [ ] No point extraction happens in this flow (point already exists)
- [ ] Stories/points distinction is maintained: AI does not file verifiable factual claims as the story body
- [ ] Flow works for any authenticated user (not Slava-only)
- [ ] Text input only in V1 (no voice)
- [ ] Declining "want to explain why?" dismisses the prompt without blocking the position stake

---

## Next Steps

This is a UI feature with Claude API integration and Supabase persistence.

1. Run `/ux features/p425_ai_story_core_loop.md` — design the chat interface, position-triggered prompt, rating UX, polish-review step, and visibility selector
2. Run `/architect features/p425_ai_story_core_loop.md` — Claude API system prompt (build on sifter-story logic), streaming, Supabase writes, story↔point link
3. Run `/generate-tests features/p425_ai_story_core_loop.md` — test automation
4. Run `/dev features/p425_ai_story_core_loop.md` — implement

**Related:**
- P419: Filing Chat V1 — extends this loop with standalone entry point + point extraction
- P420: Filing Chat V2 — open-ended multi-story conversation (builds on P419/P425)
- P424: Visibility Model Rethink — defines the Private/Shared/Public semantics used in this spec
- `.claude/commands/slava/content/sifter-story.md` — AI prompt logic to build on
