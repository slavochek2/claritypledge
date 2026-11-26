---
status: week
type: story
rank: 359
workstream: clarify
created_date: '2026-11-26'
tags: [clarify, mirror, transcription, ux]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 0362f4ddf3582c3bd79426a1d9ee0bc5d1c592b099b42759d2a885675a7e6123
spec_review_vendors: [gemini]
---

# P1733: Clarify drafts the best point, and "Other topics" lists the rest

## Problem

**Situation:** Clarify drafts one point per press. On a recording, a thread or a whole chat it reads a window of lines, newest first, capped by size (`clarify_start_recording` / `_clarify_begin_recording`). "Another point" asks for a different point, but the owner cannot see or choose which topics exist.

**Complication:** found in P1722 founder UAT on 2026-11-26. On a long recording with several disagreements, the point was about the last one. The likely cause is the newest-first read window plus the model's recency bias. No row is marked as pressed for these scopes, so it is not the press anchor (review finding, `clarify-model.ts:56`).

> Founder, verbatim: "it remembers only the last thing. So when he drops a point, he drops it about the last thing. But what if, you know, the conversation can be long and have many things? I don't know how am I supposed to navigate."

> Founder, on scope: "it has to work not only in live transcription it has to work from anywhere I mentioned for example in a specific chat there is a big text right and I use clarify"

**Question:** how does the owner see every topic Clarify found, and turn any of them into a point?

## Appetite

- **Blast radius:** medium-high. It changes the Clarify draft call, the stored Clarify thread, and the draft card for every Clarify press.
- **Reversibility:** medium. A migration adds topic storage. Without topics, the card falls back to today's "Another point".
- **Decision density:** low after the founder's choice of option A (2026-11-26). The card layout is picked from mockups (Solution step 0).

## Solution

**Founder decisions, 2026-11-26:**

- **A: draft first.** Clarify drafts the best point straight away, as today. The topic list is one tap away and never forced.
- **Up to 5 topics at a time.** The list is flat, with related topics merged by the model. "Show 5 more" finds new ones. When none are left it says `[FOUNDER DECISION: copy, proposed "No more issues found."]`.
- **Only one topic: no list control at all.**
- **No "or type what you mean" hint.** It is a chat ("I don't think it needs extra redundancy").
- **Works anywhere Clarify works:** a single message (including one long pasted text), a thread, a whole chat, and a recording.
- **The whole card has to stay clear.** Founder: "whatever we do, it should take into consideration the whole experience". The card already carries Publish, Another point, Edit, Delete and the visibility pill.

**0. Mockups first, founder picks.** Before any backend work, build `/tree/clarify-topics` (dev-gated) with 2–3 card layouts. Each mockup shows every state: fresh draft, list open, after "Show 5 more", no more topics, a single topic (no control), a topic already drafted, and a topic whose draft was refused. Candidate layouts:
- (a) "Other topics (N)" replaces "Another point".
- (b) "Other topics (N)" is a quiet text link below the card's action row.
- (c) Topics appear as tappable chips above the draft.

`[FOUNDER DECISION: layout, picked from the mockups]`. Build the rest only after the pick.

1. **Topics come with the first draft, in the same call.** The draft call's response gains a `topics` list (up to 5, the drafted one included). Each topic carries a short label and the ids of the rows it rests on. That adds output tokens, not a call. A single-message press works the same way: a short message yields at most one topic, so no control shows. That needs no length threshold.
2. **The server owns the topic record.** It validates the cited row ids against the stored read set, and drops a topic that cites no valid row. It derives the anchor from the cited rows, not from model text:
   - a recording: the minutes since the recording started, from `spoken_at`;
   - text: a short verbatim quote the model returns with the topic. The server keeps it only if it occurs exactly in a cited row, and drops it otherwise. This lets one long pasted message, which is one row, carry several topics with different anchors.

   The label is the one model free-text field kept, which narrows D6 (`clarify-model.ts:8`). It is capped (`[FOUNDER DECISION: length, proposed 80 chars]`), stripped of hashtags, rendered as plain text, and shown only to the thread's owner. `[FOUNDER DECISION: accept this D6 exception]`.
3. **Topic storage.** Topics are stored server-side per press, as a topic set bound to that press's read set and cutoff. A later press in the same recording makes a new set with its own read set. Older sets keep theirs, and their "Show 5 more" and picks read only that stored set (decisions.md 2026-11-13). Each topic gets a server id, and once picked a `draft_id`, unique per topic. Exact tables are `/dev`'s call. Erasure removes topic sets with the thread.
4. **Picking a topic** sends the topic id, never its label. The server builds the draft request with that topic's cited rows marked pressed (today a run marks at most one row; this marks several), and for a single-row topic its verified quote as a data field, through the existing draft path, charging and caps included. A topic that already has a draft opens that draft. A double tap creates one draft.
5. **"Show 5 more"** is a new run type on the existing Clarify run path, with its own spend reservation, settle and retry like a draft run. It is one call over the same stored read set. It passes the already-shown topics' row ids and labels as quoted data. The server also drops any new topic whose cited rows and quote both equal an earlier topic's. Presses are capped per set (`[FOUNDER DECISION: cap, proposed 3, so at most 20 topics]`). An empty result shows the no-more line and removes the control.
6. **Partial reads are said.** When the read window (server) or the input trim (edge function) dropped older lines, the list says so: `[FOUNDER DECISION: copy, proposed "Read the last ~N minutes." for a recording, "Read the latest N messages." otherwise]`.
8. **Counting and refusal.** N in "Other topics (N)" counts topics that are not the drafted one, after validation. If the first call refuses to draft but returns two or more valid topics, the card shows the refusal copy with the topic list open, so the owner can pick one. With fewer than two, it shows today's refusal.
7. **"Another point"** stays where it is or is replaced, per the layout pick.

## UX Notes

States, each rendered in the mockups:
- **Loading:** the existing Clarify working state.
- **Draft with topics:** the control reads "Other topics (N)", where N excludes the drafted topic.
- **List open:** rows of label and anchor, at least 44px tall.
- **Drafting:** a picked row shows the working state.
- **Drafted:** a row shows that it has a draft (`[FOUNDER DECISION: copy]`), and tapping it opens the draft.
- **Refused:** the row shows the existing refusal copy, and the rest of the list stays usable.
- **Capped:** a 429 shows the existing capped copy, distinct from a failure. Failure shows the existing Retry.
- **More:** "Show 5 more" uses the outline (blue-bordered) variant.
- **No more:** the no-more line.
- **Erased draft:** the row returns to undrafted.

## Acceptance Criteria

- [ ] Every `[FOUNDER DECISION]` in this spec is answered and recorded here before the backend build starts.
- [ ] The founder picked a card layout from `/tree/clarify-topics`; the pick is recorded here.
- [ ] Clarify on a stub recording with three distinct disagreements drafts one point, and "Other topics" lists the other two, each with a minute anchor.
- [ ] The same works on a long pasted text in a group chat, with quote anchors.
- [ ] A short single message drafts a point and shows no topic control.
- [ ] Picking a topic drafts a point resting on that topic's rows, not on the newest lines.
- [ ] Picking an already-drafted topic opens its draft. A double tap creates one draft.
- [ ] "Show 5 more" adds only new topics, stops at the cap, and shows the no-more line when empty.
- [ ] A second press in the same recording makes a new topic set. The old set's picks still read the old read set.
- [ ] Topics are still there after a reload, and only the thread's owner can read them.

## Done-When

- [ ] The stub model gains a topics mode (a `STUB-TOPICS` marker), so integration and e2e tests can produce topic lists deterministically.
- [ ] Integration tests cover topic validation (bad row ids dropped, hashtags stripped, label capped), pick-by-id, the one-draft-per-topic guard, "Show 5 more" exclusion and cap, and the re-press read-set binding.
- [ ] e2e: stub recording → draft → Other topics → pick → second draft.
- [ ] One manual TEST press with the real model logs `costUsd` for a draft-with-topics call and a "Show 5 more" call. The numbers are checked against the budget below.

## Invariants

- The read set is decided at the press and stored with it (decisions.md 2026-11-13, P1631). Every topic operation reads only its own set's stored read set.
- A topic label or quote is data, never an instruction. When passed back to the model (for "Show 5 more" or a pick) it goes only inside a quoted data field, like `already_drafted` today. It is never sent as `owner_instruction` and never promoted into the owner's voice (`clarify-model.ts:72`).
- No system hashtags from model output (src rules).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The model lists near-duplicate topics | MITIGATE | Merge instruction; the server drops topics with identical cited rows |
| The label carries injected text from other people's lines | MITIGATE | Plain-text render, cap, owner-only, never an instruction (Invariants) |
| Oldest topics fall outside the read window | MITIGATE | Partial-read line (Solution 6) |
| Each "Show 5 more" costs a call | ACCEPT | Capped per set, and bounded by the existing Clarify caps |

**Non-Goals**
- Do NOT add grouping or nested lists.
- Do NOT add an "or type what you mean" hint.
- Do NOT change the P1631 read-set rules or the window size.
- Do NOT build the backend before the founder picks a layout.

## Cost Budget

Clarify runs on `MIRROR_MODEL` at $1.50 per million input tokens and $7.50 per million output (`_shared/mirror-limits.ts`). Its own caps are 60,000 input and 8,000 output tokens, thinking included (`clarify-draft/clarify-model.ts:21-23`). The existing per-run reservation is $0.193 against a $0.27 allowance (`clarify-model.ts:22`).

| Measure | Per press | Notes |
|---|---|---|
| Metered requests | First press: 1 call, as today, now also returning topics. +1 per "Show 5 more", capped at 3. +1 per topic picked, as "Another point" today | No new call on the first press |
| Added cost, first press | About 5 topics × 40 tokens = 200 output tokens × $7.50/M = $0.0015 | On top of today's draft call |
| "Show 5 more", typical | A 10-minute recording ≈ 2,000 tokens in × $1.50/M = $0.003, plus about 1,000 out × $7.50/M = $0.0075, so ≈ $0.01 | |
| "Show 5 more", ceiling | 60,000 × $1.50/M = $0.09, plus 8,000 × $7.50/M = $0.06, so $0.15 | Inside the existing reservation |
| Worst case per press | First call $0.15 + 3 × $0.15 = $0.60 at every cap, before picks | Picks cost as "Another point" does today |
| Test runs | Stub on non-prod, so $0. One manual real-model TEST press ≈ $0.02 | Done-When item 4 |

Rules: the existing Clarify caps and budget-capped keys apply unchanged. No polling is added, and nothing runs from a hidden tab.

## Related

- P1722: Clarify alone in the Mirror (where this was found)
- P1631: Clarify, its read set, threads and drafts
