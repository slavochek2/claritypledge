---
status: week
type: story
rank: 22
workstream: clarity-chat
created_date: '2026-10-06'
tags: [mirror-agent, letters, chat, navigation]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1431: Assemble and send a letter from reviewed points and linked stories

> **Scope revised 2026-11-05.** This spec now owns letter assembly, preview, explicit send, and the answer/reveal handoff. [P1631](p1631_mirror_drafts_reviewable_point_set.md) owns proposing and reviewing a point set; [P1632](p1632_mirror_drafts_linked_owner_stories.md) owns the sender's story drafts and links. The former all-in-one spec is in git history. Its 2026-10-06 prototype decisions are historical design input, not approval of the P1484/P1503 visual layouts that the founder rejected after review.

## Problem

The Mirror Agent can receive conversation material, but a person still cannot take reviewed points and their own reviewed reasons and make a sendable Clarity Letter without reconstructing the material by hand. A letter is useful when the sender wants recipients to show whether they understood *why* the sender holds a position. It may start from “help me write a letter,” but the draft must be grounded in reviewed points and stories before it is sent.

## Appetite

Blast radius: high, because the path crosses draft privacy, letter snapshots, delivery, recipient preparation, response and reveal. Reversibility: medium; a sent letter cannot be unsent. Decision density: high around the recipient audience and whether the existing letter model supports the intended group experience.

## Invariants

- The owner chooses the intended audience and explicitly approves sending. Nothing sends, publishes, or exposes a draft because the agent proposed it (P1503 D17).
- The letter uses selected, reviewed points and owner-approved linked stories from P1631/P1632. It does not rerun extraction from the source and silently replace the approved meaning.
- A point checks agreement; a letter checks understanding of the sender's reason (2026-11-02 product decision). A letter requires at least one story (P1089 and current letter model).
- Another person's words never become the sender's first-person reason without the sender affirming that reason; another person's story requires that person's own approval (P1484 D13).
- The recipient answers on the existing letter page, where the sealed answer and reveal rules apply. The agent chat prepares and helps the sender review; it is not the recipient's answering surface (P1484 decision 20; 2026-10-29 product decision).
- Do not expose one recipient's response to another without a separate product decision and consent.

## Solution

The owner may ask the Mirror Agent for a letter directly, or continue from a reviewed point set and linked stories. A direct request guides them through P1631 then P1632 inside one continuous drafting experience. They can stop after points or stories. When they continue, the agent assembles a letter draft from selected reviewed material, retaining each point/story link and the owner's positions. The owner reviews the complete letter, its intended audience and what the recipient will see, corrects it, previews it through the existing letter preview where possible, and explicitly sends it.

Use existing letter delivery, answer and reveal behavior rather than making a parallel response system. Verify the current recipient modes and multi-recipient semantics in code before choosing the first audience. A shared group letter may use one sender prediction and individual recipient answers if the current model supports that safely; the implementation must not claim the whole group's reveal is public. The sender can find each completed response and decide what to discuss next. A letter back or recipient-authored follow-up is separate work (P948).

The Mirror Agent's current chat is the entry point. Reuse P1536's review interaction where it applies, but do not assume canvas storage or the rejected prototype screen layouts are the letter workspace. Determine the production surface that keeps source, drafts, preview and approval understandable on phone and desktop. The old decision to move every app page to one left sidebar is not a dependency of this letter capability; inspect current Clarity Chat navigation before any navigation change is proposed.

## Risks / Non-Goals

| Risk | Label | Response |
|---|---|---|
| Approved material changes during assembly | MITIGATE | Assemble from selected reviewed versions and show the exact final content before send |
| Recipient answers are mistaken for a public group reveal | MITIGATE | Show per-recipient visibility before send and verify it in recipient and sender views |
| Existing letter model does not cover the intended team audience | MITIGATE | Verify schema, RLS, snapshot and delivery behavior before committing to an audience; state any limit in the UI |
| A transcript contains no sufficient owner reason for a truthful letter | MITIGATE | P1632 asks for the missing reason; do not auto-fill one |
| Preparation is missing for a first-time recipient | MITIGATE | Verify the existing `/prepare` path and attach the correct entry for the selected recipient mode |

**Non-Goals:** point extraction, story drafting, group ledger, partner confirmation, agent-to-agent conversation, automatic Zoom/Meet import, a global navigation redesign, and the P1484/P1503 prototype layouts.

## Acceptance Criteria

- [ ] A person asking the Mirror Agent for a letter can review points and linked owner stories through P1631/P1632 without choosing a technical artifact mode.
- [ ] Selected reviewed points, stories, links and the sender's positions appear in one editable letter draft without re-entry.
- [ ] The sender can see the intended audience and recipient view before an explicit Send action; no draft is delivered during agent drafting.
- [ ] Sending creates a letter readable through the supported recipient flow, including preparation for a first-time recipient where required.
- [ ] A recipient can answer the delivered letter and see the existing reveal; the sender can find that recipient's response.
- [ ] A multi-recipient letter keeps answers private to the authorized people; one recipient cannot read another recipient's answer by default.
- [ ] The whole path is demonstrated with the recipient mode intended for the team trial, on phone and desktop.

## Open Questions

1. [FOUNDER DECISION: first release recipient mode] One named recipient, several named recipients, or a private event/team audience? Choose from verified supported modes; the change-lead acquisition event needs several individual answers.
2. [FOUNDER DECISION: letter workspace layout and creation menu copy] The current product entry and P1536 interaction are references, not an approved mockup.
3. Which current letter parts permit editing before send, and which are immutable snapshots? Verify code and migrations before architecture work.

## Related

- [P1631](p1631_mirror_drafts_reviewable_point_set.md) — reviewed point set.
- [P1632](p1632_mirror_drafts_linked_owner_stories.md) — reviewed owner stories and links.
- [P1536](done/2026-06-10/p1536_canvas_first_draft_from_owner_material.md) — owner-review interaction and chat creation entry.
- [P1484](p1484_clarity_chat_letter_loop_v7.md) and [P1503](p1503_clarity_chat_v11_whole_vision_prototype.md) — behavioral rulings and rejected visual prototypes, not implementation templates.
- [P948](p948_answer_letter_from_responses.md) — letter back, later.
- [P1089](p1089_audience_scoped_point_list.md) — private group point-set audience, separate.

## Cost Budget

Measure assembly and correction calls on representative reviewed material. Calculate per-letter cost from measured token usage and verified provider prices, then add the measured P1631 and P1632 drafting costs for the full journey. Do not infer this from P1536's canvas budget.
