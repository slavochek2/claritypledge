---
status: backlog
type: story
rank: 1
workstream: X1
created_date: 2026-03-27T00:00:00.000Z
tags:
  - transcript
  - sifter
  - mirror-agent
  - clarity-letter
---

# P593: Post-Session Clarity Pipeline

> **HELD 2026-08-14 — do not archive yet.** Adversarial review refuted the original archive rationale. P1074 delivers **none** of this spec's mechanics: sifter extraction, a `draft` privacy level (confirmed absent — `story_visibility` is `public|shared|private` only), or the refine/approve/publish flow. It is also a **live dependency**: `p981_story_point_splitter.md` cites it three times, incl. *"Do NOT assume net-new infrastructure before auditing... p572, p593."* Revisit only after P1074's Stage 1 records a yes/no.

## Problem Statement

After a /live session, participants leave with memories but no artifacts. The session transcript contains extractable stories and points, but today nobody processes them. We want to turn session transcripts into draft clarity docs that participants can refine and publish — guided by a "clarity letter" from a mirror agent that frames what was observed.

## Concept

**Pipeline:** Session ends → sifter-point + sifter-story run on transcript → draft stories/points created (new "draft" privacy level) → mirror agent composes a clarity letter → participant receives letter via email → letter guides them to their draft clarity doc → they refine, approve, publish individual stories/points.

**Key design ideas from conversation:**

1. **Sifter extraction:** Use existing sifter-point and sifter-story skills to extract draft story/point pairs from the session transcript
2. **Draft privacy level:** New visibility state for stories/points — visible only to owner, not yet on public clarity doc
3. **Mirror agent:** AI writes a "clarity letter" as if from the other participant's perspective — what they observed, what landed, what might need refinement
4. **Discovery mechanic:** Participant receives clarity letter first (email via Mailgun). After engaging with the letter, they discover/unlock their draft clarity doc
5. **Refinement flow:** Participant can edit stories, refine points, add new points, approve/publish individual items to their public clarity doc

## Open Decisions

1. **Trigger:** Auto after session end, or facilitator-triggered?
2. **Mirror agent identity:** New actor concept, or prompt framing of Gemini?
3. **Clarity letter channel:** Email only? In-app? Both?
4. **Draft visibility:** Owner-only, or both session participants?
5. **Unlock mechanic:** Functional gate (must read letter) or narrative flow (letter links to doc)?
6. **Editing UI:** Existing clarity doc editor, or new "review drafts" interface?
7. **Quality benchmark:** Run sifter on real transcripts first to validate extraction quality

## Validation Plan

Before any code: take 1-3 real session transcripts → run sifter-point + sifter-story manually → evaluate if extracted stories/points are recognizable and refinable by a participant. If output is generic or wrong, pipeline won't work regardless of UX.

## Technical Architecture

_Implementation details, architecture decisions._

## Acceptance Criteria

- [ ] _Criteria 1_
- [ ] _Criteria 2_

## Test Coverage Strategy

_How to verify this works._
