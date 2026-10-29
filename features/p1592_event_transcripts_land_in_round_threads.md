---
status: week
type: story
rank: 83
workstream: clarity-chat
created_date: '2026-10-29'
tags: [transcription, clarity-chat, events, rounds]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1592: Event transcripts land in the event channel, one thread per round table

## Problem

**Situation:** In the event room, the transcription bar's "Transcribe" tap starts live capture tied
to the event (`room-capture-bar.tsx:225-280`, P1337). Capture keeps running across pages (P1307).
The words appear only on the `/transcribe` room page (`transcribe_messages`). The chat stays idle
there (`chat-provider.tsx:142`), and nothing reaches the event's channel. The event room already
knows who sits at which table in which round (`event_round_seats`, P1337). Every event already has
one channel, readable by its host and its attendees (`_chat_access_since`, P1512).

**Complication:** The sales mastermind (goals.md 3a) needs what was said at each table to reach the
place where owners revise their canvas, the event channel (P1500). That place has to be ready before
session 2, and preferably live at session 1, around 2026-11-10 (decisions.md 2026-10-29 [product]).
Today an owner would have to copy text out of the room page by hand.

**Question:** How do live transcripts flow into the event channel, so that each conversation is
easy to find, reads clearly as transcription, and improves once the end-of-room transcript is
ready, without breaking anything people have already used?

> Founder, 2026-10-29, verbatim: "transcribe is somewhat independent of the table experience in the
> sense that it just does the transcription. And joining table or being in the main channel chat for
> the event just tells me where I am. And so if transcribe is working, then it's also where I'm
> being transcribed."

> Founder, 2026-10-29, on posting live: "when it arrives live line by line, it opens up the
> opportunity, for example, while I can continue speaking, and I can already use what has been done
> in the last conversation ... and create a new version of my canvas meanwhile."

> Founder, 2026-10-29, on reuse: "we also are building features that are like LEGO blocks. They can
> be reused in multiple ways."

## Appetite

**Blast radius:** medium. It touches every event that uses transcription, and it writes into the
event channel that every attendee reads. Clarity Night is affected as much as the mastermind.

**Reversibility:** medium. Additive migration plus a posting path. Turning the posting off leaves
the room page exactly as it is today. Messages already posted stay in the channel unless deleted
by hand.

**Decision density:** low. The founder settled the model in conversation on 2026-10-29 (recorded
under Decisions). One copy call remains.

## Decisions (founder, 2026-10-29)

| # | Ruling |
|---|---|
| D1 | **Transcription is one switch; your place decides where the words land.** The switch stays where it is today, the event room's transcription bar. While you are seated at a table in a running round, your words go to that table's thread. When you are not seated, they go to the event channel itself. When the host re-seats you, your next words go to the new place, without stopping or restarting capture. |
| D2 | **Rounds, not tables.** The unit people find later is one conversation: one table in one round. Each gets its own thread. A new round always means a new thread, even if the same people stay at the same table. |
| D3 | **Thread name: round and people**, e.g. "Round 2 · Anna & Ben". People remember whom they talked with better than a table number. |
| D4 | **A "My rounds" filter** in the event channel lists only the round threads I was seated in. No message search. |
| D5 | **Live, as it is spoken.** Text lands while people talk, as on the room page. It does not wait for the end. |
| D6 | **Transcription looks different from typing:** italic text under a small "Transcription" label. One message per stretch of one person's talk, as the room page shows it, not one per audio slice. |
| D7 | **No extra consent screen.** The terms and the bar's ⓘ already say what is recorded and where it goes. The person recording owns consent, and the visible lavalier is the notice (decisions.md 2026-10-02). The bar names where the words are going right now. |
| D8 | **One lavalier per person is the rule, and the host enforces it, not the app.** Only people wearing a lavalier turn transcription on. No cross-phone de-duplication is built (P1237: a phone lying on a table picks up everyone). |
| D9 | **The cleaned end-of-room transcript replaces the live text quietly.** Nothing announces it and no link is added. People keep using the thread itself (forward, clarify, canvas), so it should hold the best text. The old live text stays stored and is never shown, so the operator can check what changed. |
| D10 | **A message someone used never turns into a deleted or error message.** The swap may reword it; it never empties it. |

## Invariants

- **The server posts, never the browser.** Posting runs from the stored transcript rows, so a
  closed tab, a page change or a reconnect never loses a line and never posts one twice. Each
  stored live row records the chat message it went into. A row that already has one is never
  posted again (idempotent), including by the after-session-1 run below.
- **Where a line was posted is recorded at posting time and never recomputed.** Seating changes
  mid-round with no history (`host_set_round_seats` deletes and re-inserts seats), so nothing after
  the fact can reconstruct it. The swap follows the recorded placement, never the seating tables.
- **Words reach a channel only that channel's readers can see.** Transcription posts into an event
  channel are readable exactly by whoever `_chat_access_since` admits (the host, and attendees who
  RSVP'd before the grace window). The posting path adds no reader and widens no policy. A speaker
  who cannot read the event channel is not posted there; their words stay on the room page only.
- **The destination is the speaker's seat when the line is stored**, read from the round seating
  on the server at that moment. The client never chooses or supplies the destination thread
  (same principle as decisions.md 2026-09-08: server-assigned fields are never client-supplied).
- **The swap fails toward live text, never toward empty, and decides per message.** A message keeps
  its live text when the cleaned transcript is missing or failed, when its speaker is in
  `incomplete_member_ids` or their end-of-room job did not complete, when no cleaned sentence was
  placed in it, or when the cleaned text would pass the 4,000-character limit. The swap never
  inserts, deletes or empties a message.
- **Neither appending nor the swap marks a message edited.** `edited_at` stays as it is; it belongs
  to a person editing their own message (`edit_chat_message`).
- **Forwards and clarifies keep what they copied.** They already store a snapshot
  (`chat_messages_forward_has_snapshot`), and the swap must not touch snapshots.
- **The live rows are the stored "old version".** `transcribe_messages` already holds every live
  line. Nothing in this spec deletes a live row or changes its text. Recording a row's placement is
  the only addition.
- **The room page (`/transcribe`) behaves exactly as today.** This spec adds a destination; it
  does not change capture, consent, pause, or the room page.

## Solution

### Where words go (D1, D2)

- A transcription line belongs to the speaker's seat at the moment the line is stored. **Seated**
  means all three: they have a seat in the event's latest round; that round has not ended; and the
  host has not marked them left (`event_round_presence.left_at`) or sitting out that round. A
  seated speaker's line goes to that table's round thread. Anyone else's line goes to the event
  channel as a top-level post: before round 1, in the "Next round" pool, after being marked out,
  and after the host ends the rounds. Seats are assigned when the round starts, so the walk to the
  table already counts as the new round.
- The speaker's identity links across the two systems by profile: the transcribe member's
  `profile_id` matches the event room member's `profile_id` for the same event.
- The event channel may not exist yet, because it is created lazily (`_chat_ensure_for_user`). The
  posting path creates it if missing, using the same rule (one per event).
- A round thread is created the first time anyone at that table in that round is transcribed. It is
  not created for tables where nobody records, because twelve empty threads would bury the few that
  matter. **There is exactly one thread per round and table, enforced by the database**: two
  people's first lines can arrive in the same instant. Its root post is a system post (no
  author), titled `Round {n} · {names}` (D3). Two names: "Anna & Ben". Three: "Anna, Ben & Cleo".
- **Who belongs to a thread:** everyone seated at that table in that round when the thread is
  created, including people not recording and observers, plus anyone seated there later in the same
  round. The thread keeps this list itself, because seating has no history, and the title follows
  it. Names are first names, as the event room shows them. When two people in one title share a
  first name, `/dev` adds the shortest disambiguation the event room already uses, and says which.
- Re-seating takes effect with no action from the speaker. The next stored line goes to the new seat.

### How it looks (D6)

- Transcription messages carry a marker that the chat renders as a small "Transcription" label above
  italic text. Typed messages, voice notes and dictation are unchanged.
- **One stored message per stretch of talk**, not one per 13-second slice. A new line from the same
  speaker in the same place is appended to their latest transcription message, unless:
  - someone else posted in that place in between;
  - the pause since their last line is longer than a threshold (`/dev`'s call; start near 60 s
    and say why);
  - appending would pass the 4,000-character body limit, in which case the new line starts a new
    message. A live line is never split across two messages. A single line over the limit (a
    13-second slice is about 40 words, so this should never happen) is cut at whitespace.

  This must be stored, not only displayed. Forward and Clarify act on stored messages, and a
  forward of a 13-second fragment is useless.
- Author is the speaker, so the speaker's name and avatar show as on any message.
- The existing message menu (Reply, Forward, Clarify) works on transcription messages as on any
  other. Turning a whole round thread into a canvas update is P1500's job, not this spec's.

### Finding them (D4)

- The event channel gets a "My rounds" filter. It lists the round threads whose member list
  includes me, by name, newest round first. Opening one opens the thread. Shown only in an event
  channel that has at least one round thread.

### The bar (D7)

- While capture runs and the speaker is seated, the running bar shows where the words are going,
  e.g. "Round 2 · Anna & Ben". When not seated, it shows the event channel. It is a place name, not
  a consent sentence: the explanation stays behind the existing ⓘ (decisions.md 2026-10-02,
  "an info affordance instead of an on-bar sentence").
- [FOUNDER DECISION: copy. The idle bar's description today reads "Record audio and share transcript
  with others in the room. Transcription follows our Terms and Privacy Policy." It now also posts to
  the event channel. Draft: "Record audio and post the transcript to this event's channel, where
  attendees can read it. Transcription follows our Terms and Privacy Policy." The ⓘ text gets the
  same first sentence. Confirm or rewrite.]

### The quiet swap (D9, D10)

- The swap works **message by message, never by reseating**. Each live transcription message
  already has a speaker and a time window: from its first to its last live line. When the end-of-room
  job (`transcribe-room-batch`) writes the room's cleaned transcript, each cleaned sentence of a
  speaker goes to that speaker's live transcription message whose window contains the sentence's
  midpoint. If no window contains it, it goes to the nearest one in time. Each message's text then
  becomes its sentences joined in order, unless the per-message rule in Invariants keeps its live
  text.
- So the swap changes text inside existing messages only. Message count, order, threads, typed
  posts, and replies all stay as they are.
- Cleaned sentence times are estimates, good to a few seconds (`audio.py:157-163`), so a sentence
  near the edge of a window can land in the same speaker's neighbouring message. Next to a round
  change, that neighbour can sit in the other thread. Accepted under Risks.
- Nothing is shown to users: no "edited" mark, no "improving" notice.

### If this ships after session 1

Session 1's live lines (`transcribe_messages`) and seating (`event_round_seats`) are kept. A one-time
server-side run then posts session 1 into its threads by the same placement rule, followed by the
swap, so session 2 is never at risk (decisions.md 2026-10-29 asked for a fallback). It is one SQL
batch, never per-row calls from a script (metered-services rule 1).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Someone without a lavalier turns transcription on, so their phone picks up the whole table under their name | ACCEPT | D8: the host enforces the rule in the room. P1237 measured phone-on-table capture, and no app check can tell which microphone is in use. |
| A lavalier still picks up the partner, so a few passages appear under two names | ACCEPT | Kept visible, never deleted (the batch labels them "also heard by"). Measured in Done-When; a cross-phone de-duplication spec is filed only if the count says so. |
| The live slice path invents text at a cut (decisions.md 2026-09-11) or repeats a phrase on silence, visible live in the thread | ACCEPT | The cleaned swap replaces it after the room ends. The live text was already visible on the room page; this spec moves it, it does not create it. |
| In the mastermind, the pair reversing whose canvas they discuss is one round (the in-round speaker swap, P1337), so both canvases land in one thread | DEFER | P1529 makes each role reversal its own round. Until then the host can start the next round with the same pairs re-seated by hand (the host panel supports manual swaps, P1337; whether that is quick enough for session 1 is UNVERIFIED). |
| A cleaned sentence lands in the same speaker's neighbouring message, across a round change too | ACCEPT | Segment times are estimates good to a few seconds (`audio.py:157-163`). It moves one sentence a few seconds. The speech right after a round starts is mostly the walk to the table. |
| A forward or clarify made while someone is still talking copies only the text so far | ACCEPT | The snapshot is what the person chose at that moment. The live message keeps growing. |
| Growing one message per stretch re-sends its whole body on every append over Realtime | MITIGATE | The 4,000-character cap bounds it. See Cost Budget. |
| A speaker's live words land in a thread the other seated person cannot read (late RSVP, account without RSVP) | ACCEPT | Rare. Visibility follows the channel's existing rule, which this spec must not widen (Invariants). |
| Transcription of every event, Clarity Night included, now lands in that event's channel | ACCEPT | Intended (founder: "LEGO blocks"). The terms already say the transcript is shared with the room. |

**Non-Goals**
- Do NOT change the `/transcribe` room page, capture, pause, consent recording, or the slice pipeline.
- Do NOT add cross-phone de-duplication or any check of which microphone is in use (D8).
- Do NOT add a transcription start button in chat. The event room's bar stays the only start (D1).
- Do NOT rename tables to rounds in the host panel or change how the host runs rounds. That is P1529.
- Do NOT build thread-to-canvas. That is P1500.
- Do NOT add message search to chat.
- Do NOT widen who can read an event channel.

## Acceptance Criteria

Checked on TEST with an event that has rounds, two attendee accounts and the host account.

- [ ] Two attendees seated at table 1 in round 1, both transcribing: their words appear in a thread
      titled "Round 1 · {A} & {B}" in the event channel, while they talk, shown in italic under a
      "Transcription" label.
- [ ] One person talking for a minute without interruption reads as one message, not four or five.
- [ ] A transcribing attendee who is not seated (before round 1) appears as a top-level post in the
      event channel, not in a thread.
- [ ] The host starts round 2 with new seating. The same person's next words appear in the round 2
      thread, without them touching the bar.
- [ ] While transcribing, the bar names the current destination ("Round 2 · …" or the event channel).
- [ ] A table where nobody transcribes gets no thread. Two people at one table whose first lines
      arrive together get one thread, not two.
- [ ] The host marks a seated, transcribing attendee as left mid-round: their next words go to the
      event channel.
- [ ] Transcribing in an event whose channel nobody has opened yet still posts: the channel appears
      with the posts in it.
- [ ] A transcription message that keeps growing while someone talks shows no "edited" mark, before
      or after the swap.
- [ ] "My rounds" lists exactly the round threads the viewer was seated in.
- [ ] An account that did not RSVP to the event cannot read the threads (RLS check by query, not by UI).
- [ ] After the room ends and the end-of-room transcript completes, thread text changes to the cleaned
      version, with no notice shown. A forward and a clarify made before the swap still show their
      original text. No transcription message reads as deleted or empty. A typed reply inside the
      thread keeps its position.
- [ ] With the end-of-room job failing, or a speaker marked incomplete, the affected threads keep the
      live text and show no error.
- [ ] Typed messages, voice notes and dictation in the same channel look exactly as before.

## Done-When

- [ ] All Acceptance Criteria above are ticked, with evidence (query output and screenshots).
- [ ] The posting path is shown idempotent: replaying the same stored live rows posts nothing new.
- [ ] `transcribe_messages` row count for the test room is unchanged by the swap (old version kept).
- [ ] Duplicate passages measured on the TEST run with two lavaliers at one table: count passages that
      appear under both speakers within 30 s, by hand on the thread (the oracle), and compare with the
      end-of-room job's "also heard by" labels (the second signal). Report both numbers.
      `[post-deploy]` Repeat the same count on session 1's threads. Pre-registered reading: under 1
      per 10 minutes of a thread means the lavalier rule held; over 3 per 10 minutes means a
      cross-phone de-duplication spec is filed.
- [ ] Clarity Night regression: an event with no rounds still transcribes, and its lines land in the
      event channel as top-level posts.
- [ ] The founder copy decision above is recorded.

## Cost Budget

Assumptions for one event: 12 attendees with the channel open, 6 lavaliers transcribing, 40 minutes
of rounds. Live slices are 13 s (`room-capture-context.tsx:12`).

| Measure | Per event | Per hour of transcription | Per test run |
|---|---|---|---|
| Chat writes (insert or append) | 6 speakers x (40 x 60 / 13) slices = 6 x 185 = 1,110 | 6 x (3600 / 13) = 1,662 | 2 speakers x (5 x 60 / 13) = 2 x 23 = 46 |
| Realtime messages | 1,110 writes x 12 subscribers = 13,320 | 1,662 x 12 = 19,944 | 46 x 3 = 138 |
| Egress (Realtime bodies) | 13,320 x ~2 KB average body (half the 4 KB cap) = ~27 MB | 19,944 x 2 KB = ~40 MB | 138 x 2 KB = ~0.3 MB |
| Edge function invocations | 0 added (posting runs in the database on the stored row; `transcribe-slice` is already invoked per slice) | 0 | 0 |
| Gemini / audio minutes | 0 added (the swap reuses the end-of-room job that already runs per room) | 0 | 0 |
| Log lines | One per failed post, not per retry: at most 1,110 in the worst case | at most 1,662 | at most 46 |

1. **Fits the plan limit today?** Supabase Free row: 2 million Realtime messages and 5 GB egress a
   month. Monthly = per-event x events per month (read from the dashboard usage page). At 13,320
   messages and ~27 MB per event: fits.
2. **Fits at 10x?** 133,200 messages and ~270 MB per month: fits.
3. Not applicable; both answers are yes.

## Open Questions

1. How quickly can the host re-seat the same pairs into a new round for the mastermind's role
   reversal before P1529 exists? UNVERIFIED; check before session 1 or accept one thread per pair.
2. How long are `transcribe_messages` kept? The "old version kept" rule relies on them; retention not
   checked.

## Related

- **P1500** — canvas from event threads. This spec supplies the threads it assumes; its MITIGATE
  ("consent and visibility must be settled before any Canvas reads it") is settled here by D7 and
  the visibility invariant.
- **P1529** — host controls for a canvas event: rounds-not-tables in the host panel, and each role
  reversal as a new round. Built only if session 1 shows the need (decisions.md 2026-10-29).
- **P1337** — rounds and seats (`event_rounds`, `event_round_seats`) and the event-room transcribe bar.
- **P1307 / P1236 / P1149** — the capture, the live slice path, the room, and the end-of-room job.
- **P1237** — crosstalk measured: a phone on the table hears everyone. **P1252** — merged audio from
  several phones is not time-aligned (open). It affects only the end-of-room transcript's timing,
  bounded under Risks.
- **P1512 / P1509** — the event channel and its threads.
- decisions.md 2026-10-29 [product] · 2026-10-02 [product] (recorder owns consent) · 2026-09-11
  [technical] (a duplicate ratio is blind to invented text) · 2026-09-08 [technical] (server-assigned
  fields).
