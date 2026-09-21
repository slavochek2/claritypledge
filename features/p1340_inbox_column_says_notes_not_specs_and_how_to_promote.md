---
status: week
type: story
rank: 10
workstream: kanban
created_date: '2026-09-21'
tags: [kanban, inbox, ux]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
related: [p1317]
---

# P1340: The Inbox column says its cards are notes, not specs, and shows how to promote one

## Problem

The kanban's Inbox column (P1317) shows quick notes from the two deferred-work stores. Unlike every
other card on the board, they cannot be dragged, which is deliberate: P1317 made `/create-spec <ID>` the
only way a note becomes tracked work, so nothing is tracked twice. The board does not say any of this,
so the column reads as broken, and the founder took it for a private-only list.

> Founder, 2026-09-21: *"inbox is weird … why would it be a separate status inbox that doesn't move"* —
> then chose to keep the design and add the explanation (option A).

## Appetite

Blast radius: the Inbox column's display only. Reversibility: git revert. Decision density: none beyond
the wording below.

## Solution

- The column header states that these are notes, not specs, and that both stores (public and private)
  appear here.
- Each card with an ID shows how to promote it: `/create-spec <ID>`.
- Wording: *"Notes, not specs. Promote one with /create-spec INBOX-n."* `[FOUNDER DECISION: final
  wording — this is the agent's draft]`

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Private-store IDs or titles leak beyond React state | MITIGATE | Keep P1317's privacy rule: nothing new is written or logged |

**Non-Goals**
- Do NOT make inbox cards draggable or give them statuses (P1317 non-goal, kept by founder choice).
- Do NOT change the inbox stores or the CLI.

## Acceptance Criteria

- [ ] The Inbox column header says the cards are notes, not specs, and names both stores
- [ ] A card with an ID shows the promote command with that ID
- [ ] The existing inbox tests pass and a test covers the new text
