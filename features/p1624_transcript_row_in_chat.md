---
status: week
type: change-request
drafted_by: opus
exec_model: opus
exec_effort: high
rank: 98
changes: p1604
tags:
  - redesign
  - p1604
  - transcription
  - clarity-chat
created_date: '2026-11-05'
disclosure: public
delivery_stage: change-request
pipeline_ran: [change-request]
---

# P1624: A transcript in chat looks like a transcript

> **Redesign of:** [P1604: Transcription belongs to a chat](done/2026-06-10/p1604_transcription_belongs_to_a_chat.md)
> **What was wrong:** A session's thread root renders as a bold title with no author, and the only way in is "1 reply". That count is transcript text the system posted, attributed to the speaker, so it reads as a person replying to nobody and hides what the row actually is.

## Operating Mode

> This spec is an **incremental correction** to P1604, not a greenfield design.
> The predecessor spec is **read-only shipped history**.
> Implement the delta below. P1604's session rules are settled.

## Problem Statement

> Founder, verbatim: "it looks like a message from nobody, which is correct, but I don't know, like, is it fine how it appears visually"
> And on the count: "does it count number of messages? or what?"

Having no author is correct. Looking like a message whose sender is missing is not. A person should see at a glance that this is a transcript and how to open it.

## Jobs To Be Done

- **Preserved from P1604:** find a finished session in its chat; read it in the thread; discuss it there.
- **Corrected:** recognise and open a transcript without decoding a reply count.
- **New:** see whether people have replied in a transcript's thread, separately from the transcript's own text.

## Current State

```
Transcript Nov 5, 12:37 PM      <- bold, starts at the avatar edge, no icon
(o) 1 reply                     <- speaker's face + count of posted transcript text
```

## Root Cause

P1592 and P1604 reuse one layout for every system thread root, a title alone with no avatar (`src/app/pages/chat/MessageRow.tsx:174-176`), and the generic `RepliesLink` is the only way in (`RepliesLink.tsx:103-112`).

`get_thread_stats` counts every non-deleted row in the thread (`20261022160000_p1546_threads_everywhere.sql:176-182`). The cleaner inserts transcript text as thread rows authored by the speaker with `is_transcription` set (`20261103090200_p1604_transcription_belongs_to_a_chat_clean.sql:391`). So the count and the faces describe posted text, not replies.

## Redesign

Approved by the founder from a side-by-side mock-up on 2026-11-05 ("agreed lets do it").

```
(icon)  Transcript  Nov 5, 12:37 PM
        Open transcript
```

With people's replies:

```
(icon)  Transcript  Nov 5, 12:37 PM
        Open transcript
        (o) 2 replies
```

- Blue icon disc in the avatar slot, so the row lines up with message text. Use the existing artifact disc colours.
- "Transcript" in semibold, matching sender names. The date and time in muted text beside it, in the reader's time zone as today.
- "Open transcript" in the existing blue link style.
- The whole row is one target, at least 44px tall, with a hover state and a visible focus ring. It opens the existing thread.
- "Part N" and the incomplete suffix stay visible, with the muted date.

Reviews of the mock-ups: Gemini Argon and Opus saw screenshots, and Codex read the source only. All three chose this direction. They did not see hover, dark mode or long titles.

## Predecessor Sections Superseded

| Section | P1604 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Rule 6 | "Each session is one thread titled by date and start time." | Extended | The thread and its date and time stay; the row's presentation is defined here |

No P1604 acceptance criterion is superseded.

## Requirements

1. Applies to any thread root whose body parses as a session root (`parseSessionRoot`), including older ones.
2. The row opens the thread whether or not a reply count shows.
3. Reply count and faces on this row come from replies that are not transcript text.
4. Everything the row offers by pointer stays reachable by keyboard.

## Invariants

- **The count on every other thread does not change.** Round and table threads also hold `is_transcription` rows, and `RepliesLink` draws nothing at a count of 0. Filtering `reply_count` itself would remove the only way into those threads. Add a separate value, or otherwise leave `reply_count` as it is.
- `canvas-root-store` treats a change in a root's count as a signal, so `reply_count` keeps its meaning for it.
- The thread keeps counting and showing its transcript text exactly as it does now, inside the thread.

## What Stays the Same

Session rules, posting, timing, thread contents, session history, the waiting line, the "Transcript ready" toast, and message actions on other rows.

## Surfaces in Scope

**In scope:** the session-root row in the chat message list; the people-reply value in thread stats, including the live count update in `use-conversation.ts`.

**Out of scope:** round, table and "Outside rounds" place roots; the legacy "The conversation" root; the thread panel; session history.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The icon reads as a sender named "Transcript" | MITIGATE | Muted date separate from the title; check in the visual review |
| Live count drifts because realtime increments by any new row | MITIGATE | Count only non-transcript rows for the new value; cover with a test |
| The stuck-looking "Cleaning up the transcript…" banner seen on 2026-11-05 | DEFER | Separate possible bug, unverified; needs its own check of that room's job state |

**Non-Goals**
- Do NOT add a link to session history. It waits until history holds something the transcript does not (P1390).
- Do NOT build the card variant. It waits until the row holds a preview, duration or rounds.
- Do NOT change round or table thread rows.

## Open Questions

1. [FOUNDER DECISION: does a mirror agent's reply count as a reply on this row? Draft assumption: yes, only transcript text is excluded.]

## Acceptance Criteria

- [ ] A finished session shows the icon, "Transcript", the muted date and time, and "Open transcript", with no "1 reply" when only transcript text is in the thread.
- [ ] Clicking or keyboard-activating anywhere on the row opens the thread.
- [ ] After a person replies, the row shows that reply's count and face, and transcript text adds nothing to it, including live without a reload.
- [ ] "Part 2" and incomplete sessions show their suffix, with no overflow at 320px.
- [ ] Reviewed at 375px, 320px, desktop and dark mode, including hover and focus.
- [ ] Round and table thread rows still show their current count and still open.
- [ ] Surfaces not in scope are visually unchanged.
- [ ] All existing P1604 tests still pass.
- [ ] Regression: a session root with transcript text only can be opened, and shows no reply count.

## Next Steps

Scope is clear, but `get_thread_stats` is shared: run the multi-model spec review, then `/dev`.
