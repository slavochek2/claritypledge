---
status: qa
type: story
rank: 88
workstream: transcription
created_date: '2026-11-03'
tags: [transcription, clarity-chat, events]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1604: Transcription belongs to a chat

## Problem

**Situation:** Transcription can reach a chat only when started from an event room. Plain `/transcribe` in Tools saves to session history and gets the older per-person text, without cross-mic cleaning.

**Complication:** Event rooms pay for transcription twice: the older per-person pass and the clean pass both run. Session history shows the older text while chat shows the clean text. An event with no rounds puts every session, even days apart, into one thread.

**Question:** How does one transcription system serve events, chats and the plain tool?

> Founder, 2026-11-03: "transcribe belongs to channel, it just can be started from the event room, and if a given channel happens to have an event or event room associated with it, then the host can move tables and stuff like that."

## Appetite

Blast radius: all transcription. Reversibility: medium. Decision density: a few, listed. Founder, 2026-11-03: build now, without waiting for the friends test. Only retiring the older per-person pass waits for that test, and the older pass stays as the fallback until then.

## Solution

**Where it starts.** From a chat's three-dot menu, from an event room, or from `/transcribe` in Tools. An event's chat and its event room are the same place: starting from either is the same session.

**Plain `/transcribe` stays** as a room with a code, attached to no chat, because anyone can be in that room and no chat fits them. Its text goes to session history only. It gets the same cross-mic cleaning.

**Session history is everyone's personal archive.** Everyone who recorded in any session has it there, with the clean text and the copy button. Chat is where a session is shared. The older per-person pass keeps running as the fallback: history shows clean text when it exists and the older text when it does not. Retiring it waits for the friends test and is not part of this build.

**Joining.** A live session shows in the chat ("{name} is transcribing, join"). One person alone still works. Text from one mic follows P1601.

## Session rules (challenged by Gemini 4 Argon, 2026-11-03)

1. A chat has at most one live session. Tapping Transcribe while one is live joins it.
2. A session lasts while at least one person is recording. People coming and going, in any order, never split it.
3. When everyone has pressed Stop, the session is over. Starting again afterwards is a new session and a new thread. No grace period: a grace merged a stray tap, or an unrelated later group, into a finished thread.
4. If someone vanished without pressing Stop, the session waits up to 10 minutes for them, so their last audio is not lost. If they come back in time, it continues.
5. If everyone left recording is paused, the session waits up to 10 minutes, then ends. A short break does not split a thread, and a phone paused in a pocket cannot hold a session for hours. [FOUNDER DECISION: 10 minutes. Gemini proposed 1; that would split a thread on a coffee break.]
6. Each session is one thread titled by date and start time. Text posts once, about 2 minutes after the session ends. Live text stays on the room page.
7. Starting in another chat stops your recording here and says so, rather than refusing. A refusal could lock someone out after a dropped connection.
8. A session running 3 hours is saved and posted as is, and carries on as "Part 2" in a new thread. Today a 3-hour stretch fails and each person's own limit ends at a different time.
9. With rounds, time inside a round goes to table threads and time outside goes to the before-round and after-last-round threads, as shipped in P1596. Gemini's concern about one thread with a hole in it does not apply to those.

**Worked example.** I start; 10 minutes in B joins; B leaves; C joins; C leaves; I stop. One thread. If they then start 3 minutes later, nobody was recording, so that is a second thread. If B is still recording when I stop, and I rejoin, it stays one thread.

## Resolved Decisions (spec review, 2026-11-03)

Gemini 4 Argon, Codex and Opus reviewed; 3 of 3 reported. Each item below was checked against the code by command unless marked as a choice.

1. **Which room.** `transcribe_rooms` gains `conversation_id`, `part_no` and `continues_room_id`. A partial unique index allows one open room per conversation. An event's chat maps server-side to its event room while the event is inside its transcription window and is not a hike; otherwise it gets a conversation room with no event, so a hike's or a past event's chat works like any other. Enter must also match on conversation: today's `event_id IS NOT DISTINCT FROM NULL` selection would put a stranger's plain `/transcribe` into a chat's room.
2. **Who may join.** Enter, join and create all require chat access for a chat's room, including by code. Today `assert_transcribe_event_access` returns at once when there is no event.
3. **Plain `/transcribe` gets its own room per start (choice; reverses P1236(f)'s one shared no-code room).** Others join by code. Cleaning compares every mic in a room, so unrelated people in one shared room would mask each other's audio.
4. **Stop.** The End call goes to the server at once and the last Stop closes the room in the same transaction, under a lock on the room row that enter, join, end and the sweep all take. Audio recorded before Stop may still upload for 2 minutes after it; this admits bytes and never reopens a session. The cleaning job waits for those 2 minutes, which is the "about 2 minutes" of rule 6. Audio that arrives later than that is lost and the text is marked incomplete; a phone away past the 10-minute wait loses what it had not uploaded.
5. **Pause.** A `paused_since` column is set by the paused heartbeat and cleared by any slice. The sweep ends a room whose open members have all been paused for 10 minutes. The heartbeat returns the room's state, so a paused phone learns the room ended. Automatic pauses (`/live`, explain-back) count too (choice); resuming after the end starts a new session and says so.
6. **Rule 6 applies to sessions outside rounds.** Round tables keep posting after each round, as P1596 shipped. With no rounds, each room gets its own thread root instead of the shared "The conversation" row, which is what merged sessions days apart. Older threads stay as they are. The title is the session's start, shown in the reader's time zone.
7. **History.** Clean text goes to a new per-job table, separate from `transcribe_room_transcripts`, so the two passes cannot overwrite each other in either order. A reader sees only the jobs they were part of, so history never shows another table's words. History shows clean text when any exists and the older text otherwise.
8. **Part 2.** The room's 3-hour clock replaces the per-person clock in all four places (sweep, `transcribe-slice`, `gcs-signed-url`, client timer). The sweep rolls a room at 176 minutes, so it ends before the cleaner's 3-hour limit even with a 2-minute sweep. The next room is seated with the people recording, consent copied and marked as carried from the earlier room, with no false tap recorded. The slice response and heartbeat tell a client where it moved. Someone paused at the roll moves too.
9. **Moving between chats.** The client compares room or conversation identity, not `eventId`, which is null for every plain chat. A start during a Stop waits for that Stop, and a join finishing after its phase changed releases the mic. The server ends the caller's other open captures on enter, so a dropped connection cannot hold the old session.
10. **Publication time** is when the job becomes eligible. A long session takes longer to process: a 3-hour session with one mic is about 180 calls. The job's stale-claim limit must exceed the longest run, or a re-send repeats the spend.

## Known Limitations

- The founder's live test on TEST passed for starting from a chat, live text, the thread and history. The last batch (Stop in place, one frame) passed tests only; it was not looked at in a browser. Round sessions and several people at once have tests and no live run.
- TEST has no scheduled job for the clean worker, so clean text on TEST needs its sweep run by hand.
- A stale flush report can count if a later capture of the same seat has also ended; it needs two tabs and only shortens the wait.

- A mirror reply about a transcript is still cut at 4,000 characters, the limit on every chat message; longer answers wait for the mirror memory design.
- A session of several mics near 3 hours has not been run through the worker; only the arithmetic is known.
- Final Gemini review, open and left for the founder's test: reloading after a manual pause resumes recording; a second tab watching a capture can show "not recording" after Part 2; an event room with no chat row yet carries seats to Part 2 without an access recheck.
- Codex reviewed the spec only; its code reviews failed on its usage limit. Opus and Gemini reviewed the code.
- `p1275-create-transcribe-room-rpc` fails on main too: it calls the function without `p_consent`.
- The older pass's transcripts appear to keep a deleted person's text and name; this predates P1604.
- With rounds, a person who stops during a round still gets that round's text when the round ends, not at their Stop.

## Decision Criteria

Retire the older pass only after the friends test passes. If cleaning misattributes at real tables, this design changes.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Channel members who were not there can read the thread | MITIGATE | [FOUNDER DECISION: consent wording], shown before anyone records in a chat |
| People do not notice the three-dot entry | ACCEPT | Watch use first; a header button is a small later change |
| A live session in a large channel invites strangers to join | DEFER | Decide with the first real channel use |
| Audio uploaded late by a phone that returns after the wait | MITIGATE | Cleaning waits for open captures and the existing ready deadline; test it |

**Non-Goals**
- Do NOT create new chats from `/transcribe`.
- Do NOT add speaker splitting; that is P1601.
- Do NOT add transcription to hike event rooms; a hike's chat gets it through the three-dot menu like any other chat.

## Cost Budget

Fill before /dev, from the P1596 budget. Expected direction: removing the older pass lowers Gemini calls per session, and channels raise the number of sessions. The clean pass itself is priced in P1596's table and is unchanged here; this section adds the one new cost this spec introduces.

**Clarify of a whole session thread (founder-approved interim).** A Clarified session thread carries the whole transcript to the mirror agent. Every other chat keeps today's numbers.

| Measure | Standard reply | Reply that carries a session thread |
|---|---|---|
| Request budget (input) | 50,000 tokens | 100,000 tokens |
| Copied item cap | 10,000 tokens (20% of the budget) | 60,000 tokens |
| Output cap | 1,200 tokens | 4,000 tokens |
| Rows offered from the thread | newest 100 | root + newest 720 |
| Reserved before the call | (50,000 x $1.50 + 1,200 x $7.50) / 1e6 x 1.25 = $0.105 | (100,000 x $1.50 + 4,000 x $7.50) / 1e6 x 1.25 = (150,000 + 30,000) / 1e6 x 1.25 = $0.225 |

- Rows: a chunk is one minute and every speaker has a block per minute, so a 3-hour session at 4 speakers is 4 x 180 = 720 blocks, plus the root.
- Tokens: the estimate charges 1 token per 3 letters or digits and 1 per other character. A minute of one speaker at about 25 words is roughly 85 tokens as a quoted line, and speakers take turns, so 720 blocks is at most 60,000 tokens, which is why the item cap is 60,000. If it is still cut, the oldest lines go first and the agent is told "showing the last N of M replies".
- The reservation is the bound: the request is refused, never sent, past its budget, and what is charged is the model's reported usage, never more than the reservation. Code and SQL hold the same numbers (`mirror-agent.ts` SESSION_*, `_mirror_limits().reply_session_max_usd`), and a test fails if they drift.
- Per-person daily reply allowance (the figure is kept private, in `_mirror_limits`): a reply counts its reservation until it settles, then its actual cost. A session reply therefore holds its larger reservation while it runs, so several running at once can reach the allowance sooner and the next is refused as capped until one settles.
- Waiting for a transcript costs reads, not Gemini calls. Every repeating read (the chat's waiting line, a session view that is processing, the "Transcript ready" watcher) runs every 15 s and only while its tab is visible: 3,600 s / 15 s = 240 reads per hour per visible tab, and 0 per hidden tab (one read the moment the tab is visible again). Before the visibility rule a forgotten hidden tab made the same 240 an hour for as long as it stayed open. The watcher reads only while a room is on its list, and a room leaves the list after it is told or after 4 hours.
- Forward carries one message and is unchanged.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Gemini, clean pass | from P1596's table | from P1596's table | 0 |
| Gemini, session Clarify | at most $0.225 reserved per reply (see above) | n/a | 0 |

## Acceptance Criteria

- [x] From a chat's three-dot menu, a person starts transcription, the banner follows them, Open goes to live text, and after Stop a thread appears in that chat.
- [x] Each session rule above has a test that walks its sequence.
- [x] Plain `/transcribe` still works with no chat, and its clean text is in session history with Copy.
- [x] A session started from an event room shows the same clean text in chat and in history.
- [x] The older per-person pass still runs as the fallback, and history shows clean text when it exists and the older text when it does not. Retiring it is a later step, after the friends test.

## Related

- [P1596](done/2026-06-10/p1596_event_transcripts_one_speaker_per_sentence.md), [P1592](done/2026-06-10/p1592_event_transcripts_land_in_round_threads.md), [P1601](p1601_one_phone_several_speakers.md), [P1461](p1461_clarity_chat_channel_members_settings.md)
