---
status: backlog
type: story
rank: 90
workstream: clarity-chat
created_date: '2026-10-16'
tags: [clarity-chat, follow-up, stories]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: heuristic
---

# P1504: Story versions in chat: what was rated stays visible while the story moves on

## Problem

> Founder, 2026-10-16: "if it is a public story and she rates it, he still can change his story and then get to a newer version of the story. But she has rated in the logs and in the session history and in chat in this case, it is snapshotted."

In Clarity Chat v11 (P1503) a story's text can no longer be edited once the other person has rated it (its visibility never changes), so a rating always refers to the text
that was read. That stops Bob improving a story after seeing it missed. The database already keeps an immutable
version of every story edit (`story_versions`), but no screen shows a version, and nothing says whether a story in a
chat is a snapshot or the latest text.

## Appetite

Placeholder; scoped when picked up.

## Solution (direction, not design)

- Critically examine whether snapshots help at all, before designing: a rated story could stay uneditable (v11), or the
  chat could keep the rated version as a snapshot while the author edits a newer live version.
- If snapshots: a story in a chat shows which version it is, a rating stays attached to the version rated, and the
  newer version is reachable from it. Points already have a superseded-point precedent; stories have none.
- Consult other models (Codex, Gemini 4 Argon) on the snapshot-vs-no-edit question when this is picked up.

## Risks / Non-Goals

- Risk: two texts of one story confuse readers more than a no-edit rule frustrates authors. Decide only after v11 testers
  run into it.
- Non-goal: changing how letters snapshot (letters are already immutable at send time).

## Done-When

- [ ] Snapshot vs no-edit decided, with the reason recorded.
- [ ] If snapshots: what a reader sees for a rated-then-edited story is designed for chat and Details (P1496).

## Related

P1503 (Clarity Chat v11, F4) · P1496 (history in Details) · P1497 (their story)
