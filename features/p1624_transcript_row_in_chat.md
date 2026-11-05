---
status: qa
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
delivery_stage: ship
pipeline_ran: [change-request, dev, ship]
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

1. Applies to every session root, including older ones. `body` has already been turned into a formatted title by the time a message reaches the row (`chat-mappers.ts:272`, `chat-snapshot.ts:56,69`), so `parseSessionRoot` cannot detect it there. Carry structured session fields (start, part, incomplete) through mapping as a separate value. `body` stays the formatted title, so the thread panel, chat list and search keep working.
2. The row opens the thread whether or not a reply count shows.
3. Reply count and faces on this row both come from replies that are not transcript text. Replies from a mirror agent count (see Resolved Decisions).
4. Everything the row offers by pointer stays reachable by keyboard.
5. The row's existing message actions stay, including whole-session Clarify. "Whole row" means the row's content area is one open-thread target. The toolbar and the replies link stay separate targets beside it, never nested inside it, and both are matched by `INTERACTIVE` (`MessageRow.tsx:35`) so a tap on them does not also open the thread. On touch, tapping the content area opens the thread; long press still opens the actions.

## Invariants

- **The count on every other thread does not change.** Round and table threads also hold `is_transcription` rows, and `RepliesLink` draws nothing at a count of 0. Filtering `reply_count` itself would remove the only way into those threads. Leave `reply_count` and `recent_author_ids` exactly as they are, and return separate values for people's replies and their faces. Adding output columns means dropping and recreating `get_thread_stats` with its grants restored, since `CREATE OR REPLACE` cannot change the return type.
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
| A stats read overlapping a realtime insert double-counts or loses a reply (`use-conversation.ts`; reported by a reviewer, not reproduced) | MITIGATE | Test the overlap for the new value. If the existing count has the same flaw, report it and do not widen this work |
| The stuck-looking "Cleaning up the transcript…" banner seen on 2026-11-05 | DEFER | Separate possible bug, unverified; needs its own check of that room's job state |

**Non-Goals**
- Do NOT add a link to session history. It waits until history holds something the transcript does not (P1390).
- Do NOT build the card variant. It waits until the row holds a preview, duration or rounds.
- Do NOT change round or table thread rows.

## Cost Budget

Runtime: no new write, table or background job. Each person's reply in a session thread adds one `get_thread_stats` read per viewer with the chat visible; hidden tabs add none, and transcript text adds none. A jump to an older page that holds a session root adds one read. At 10× the replies this is 10× a small indexed read per viewer, on the existing per-request database plan, with no per-call fee. Tests: one run of `e2e/p1624-transcript-row.spec.ts` creates and deletes 2 test users and 1 organisation, with about 5 page loads, on self-hosted TEST (fixed-price VM). No model call. Run by hand, not scheduled.

## Resolved Decisions

1. A mirror agent's reply counts as a reply on this row; only transcript text is excluded. Agent's default, 2026-11-05, open to founder veto. Its stored author may be empty, so the count must not depend on `author_id`, and a face shows only where there is an author.
2. Spec review 2026-11-05: Gemini Argon and Codex (2 of 2 external reports), plus the drafting agent's own check. No independent Opus review of the spec. Findings on detection, row actions, faces and the function's return type are folded in above.

## Acceptance Criteria

- [x] A finished session shows the icon, "Transcript", the muted date and time, and "Open transcript", with no "1 reply" when only transcript text is in the thread.
- [x] Clicking or keyboard-activating the row's content area opens the thread, and Reply, Forward, Thread and Clarify are still available on it.
- [x] The thread panel, chat list preview and search still show the same transcript title as before.
- [x] After a person replies, the row shows that reply's count and face, and transcript text adds nothing to it, including live without a reload.
- [x] "Part 2" and incomplete sessions show their suffix, with no overflow at 320px.
- [x] Reviewed at 375px, 320px, desktop and dark mode, including hover and focus.
- [x] Round and table thread rows still show their current count and still open.
- [x] Surfaces not in scope are visually unchanged.
- [x] All existing P1604 tests still pass.
- [x] Regression: a session root with transcript text only can be opened, and shows no reply count.

## Next Steps

Built. Dark mode was checked by forcing the class on the root: no setting in the app turns it on, and chat has no dark styles, so it is not a state a person can reach today. Run `/ship p1624`.
