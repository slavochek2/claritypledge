---
status: week
type: story
rank: 102
workstream: clarity-chat
created_date: '2026-11-05'
tags: [clarity-chat, mirror-agent, stories, drafting]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: heuristic
---

# P1632: Mirror Agent drafts the owner's stories and links them to reviewed points

## Problem

> Founder, 2026-11-06: "Soon we'll be able to create stories and link them to points. Maybe in one generation we can create both a point and link them to a story."

A position on a point says what someone thinks. A letter needs the reason the sender wants another person to understand. P1631 supplies reviewed point candidates, but the owner still has to write that reason and connect it to the relevant point or points. P1431 previously combined this work with point extraction and letter delivery, obscuring the review boundary where an agent must not make up or misattribute a person's reason.

## Appetite

Blast radius: high, because a private draft may later become a sent story snapshot. Reversibility: medium after send. Decision density: moderate; the central rule is that the owner, not the agent, approves their first-person account.

## Invariants

- Draft only the owner's reason from material they supplied or words they actually said. Another attendee's words may guide the owner to a question but do not become the owner's first-person testimony (P1484 D13; P1431).
- The owner sees which source supports a proposed story and which reviewed points it links to. They can correct text and links before any send or publication.
- Drafts are private until explicit owner action (P1503 D17). A story attributed to another person requires that person's own approval; this spec does not impersonate them.
- A story can link to one or more relevant reviewed points, but a link is not proof that another person agrees with either.
- If a source does not contain enough of the owner's reason, the agent asks for it rather than inventing one.

## Solution

From a reviewed point set (P1631), the owner can ask the Mirror Agent to draft their reason. The agent may propose one story linked to several points, several stories for distinct reasons, or an explanation that the material is insufficient. The owner reviews each proposed story, edits or rejects it, supplies missing reason in text or speech, and adjusts its point links. The review surface shows source context without exposing other attendees' private words in the saved first-person story.

The owner can save a private reviewed story and stop, or pass selected reviewed stories and their point links into P1431 for letter assembly. Corrections must update the draft relationship before assembly; the letter must use the selected reviewed versions rather than asking the model to re-extract the transcript. Reuse existing point/story card behavior where it fits, while checking draft visibility and story-point link rules against migrations and production code before implementation.

This is the owner's story. P1497's “their story” is a separate, later explain-back: the owner writes their model of another person after guessing that person's position, and the other person has not confirmed it. P1574's request to confirm why someone else's canvas box changed is also separate.

## Risks / Non-Goals

| Risk | Label | Response |
|---|---|---|
| Agent invents a plausible but unspoken reason | MITIGATE | Require source evidence or an owner-supplied addition; owner confirms the final wording |
| Another speaker's words appear as the owner's testimony | MITIGATE | Check attribution at draft and before assembly; use source context rather than copying it into the owner's story |
| A stale link survives a point revision | MITIGATE | Show link status and require re-review when a linked point changes materially |
| Saved draft is mistaken for a published story | MITIGATE | Keep draft visibility and status explicit in the surface and storage |

**Non-Goals:** writing another person's story, partner confirmation, letter sending, automatic publication, and the visual layouts of P1484/P1503.

## Acceptance Criteria

- [ ] From a reviewed point set, the owner can request a story draft without recreating the points.
- [ ] Every proposed story shows its supporting owner material or asks for missing reason; it is linked to the relevant reviewed point or points.
- [ ] The owner can edit, reject, and add reason, change links, and save a private reviewed story.
- [ ] Another speaker's words are not presented as the owner's first-person account.
- [ ] A changed linked point prompts review of the relationship before the story is used in a letter.
- [ ] Selected reviewed stories and links flow into P1431 without re-entry or automatic sending.

## Related

- [P1631](p1631_mirror_drafts_reviewable_point_set.md) — reviewed points are the input.
- [P1431](p1431_mirror_agent_letter_chat.md) — letter assembly and send use the reviewed stories.
- [P1497](p1497_clarity_chat_their_story.md) — a person's model of somebody else's reason, later.
- [P1574](p1574_canvas_partner_story_requests.md) — partner confirmation for canvas changes, later.
- [P1536](done/2026-06-10/p1536_canvas_first_draft_from_owner_material.md) — owner-review drafting pattern.

## Open Questions

1. What is the existing persistence boundary between an owner-only story draft and a sent story snapshot? Verify schema, RLS, and letter snapshot behavior during implementation.

## Cost Budget

Measure tokens and calls for source reading, story drafts, and owner corrections on representative material. Calculate per-story cost from measured usage and verified provider prices; include revision cycles in the budget.
