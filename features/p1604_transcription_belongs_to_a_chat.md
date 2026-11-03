---
status: week
type: story
rank: 88
workstream: transcription
created_date: '2026-11-03'
tags: [transcription, clarity-chat, events]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

Blast radius: all transcription. Reversibility: medium. Decision density: a few, listed. **Start only after the friends test proves the clean path with real people.**

## Solution

**Where it starts.** From a chat's three-dot menu, from an event room, or from `/transcribe` in Tools. An event's chat and its event room are the same place: starting from either is the same session.

**Plain `/transcribe` stays** as a room with a code, attached to no chat, because anyone can be in that room and no chat fits them. Its text goes to session history only. It gets the same cross-mic cleaning.

**Session history is everyone's personal archive.** Everyone who recorded in any session has it there, with the clean text and the copy button. Chat is where a session is shared. The older per-person pass is retired only once clean text reaches history.

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

## Decision Criteria

Do not start before the friends test passes. If cleaning misattributes at real tables, this design changes.

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

Fill before /dev, from the P1596 budget. Expected direction: removing the older pass lowers Gemini calls per session, and channels raise the number of sessions. Unknown today.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Gemini | unknown until filled from P1596's table | unknown | 0 |

## Acceptance Criteria

- [ ] From a chat's three-dot menu, a person starts transcription, the banner follows them, Open goes to live text, and after Stop a thread appears in that chat.
- [ ] Each session rule above has a test that walks its sequence.
- [ ] Plain `/transcribe` still works with no chat, and its clean text is in session history with Copy.
- [ ] A session started from an event room shows the same clean text in chat and in history.
- [ ] The older per-person pass no longer runs, measured by no such jobs after a session.

## Related

- [P1596](done/2026-06-10/p1596_event_transcripts_one_speaker_per_sentence.md), [P1592](done/2026-06-10/p1592_event_transcripts_land_in_round_threads.md), [P1601](p1601_one_phone_several_speakers.md), [P1461](p1461_clarity_chat_channel_members_settings.md)
