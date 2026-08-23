---
status: week
type: story
rank: 64
workstream: events
created_date: '2026-08-21'
tags: [transcribe, room, live-transcription, chat, ml-training]
delivery_stage: architect
pipeline_ran: [create-spec, architect]
driver: heuristic
drafted_by: opus
---

# P1149: `/transcribe` — the live room transcription chat

## Problem

**Situation:** Transcription in this product is post-hoc and one-pair-at-a-time. `/live`
records a session, uploads chunked audio to `gs://claritypledge-ml-training/sessions/{code}/`
([api.ts](../src/app/data/api.ts):3139 `uploadAudioChunk`), and the GPU service transcribes it
after the fact. Separately, `/chat` renders live words from the browser speech API while
recording ([clarity-chat-page.tsx](../src/app/pages/clarity-chat-page.tsx):544-580). Neither
serves a **room**: `/live` is structurally 1-on-1, and `/chat` is one person alone.

**Complication:** An event puts eight people and eight microphones in one space. They cannot
all be in a 1-on-1 `/live`, so today the room's speech is captured by nothing — no live text,
no attributed record, no corpus. The pieces to fix that already exist and are not assembled:
chunked audio upload, browser live transcription, Supabase Realtime sync
([clarity-live-page.tsx](../src/app/pages/clarity-live-page.tsx)), and the GPU transcription
job chain.

**Question:** Can a room of people each transcribe from their own device into one shared,
attributed, timestamped chat — while their audio simultaneously lands in the ML bucket for the
good transcript to be produced later?

## Why the device boundary is the architecture

One structural fact drives every decision below: **eight people on eight devices is not one
hard transcription problem, it is eight easy ones.** Each device produces a single-speaker
stream. That yields, for free, three things the GPU pipeline currently works to obtain:

| Problem | How the device boundary solves it |
|---|---|
| Who said what | One device = one speaker. No diarization. |
| Consent | Each person consents for their own voice, on their own screen. |
| Attribution | The signed-in account owning the device owns the words. |

A room is therefore **not** "a recording of a room." It is N personal transcription sessions
sharing a room identifier.

## Appetite

**Blast radius:** Medium. A new page and a new table; no existing flow changes. It reads the
same GCS bucket and job chain `/live` uses, so a mistake in the upload path could affect the
shared corpus layout — mitigated by writing under a distinct prefix (see Solution).

**Reversibility:** High for the code (new route, feature-flaggable, deletable). Low for the
data — audio and transcripts of real people's speech at a real event cannot be un-collected.
The consent gate is the load-bearing control, not the code.

**Decision density:** Low-medium. The founder has decided: room-visible transcripts, chat
rendering, dual capture, signed-in only. Open items are marked `[FOUNDER DECISION]` below and
are copy and join-model questions, not architecture.

## Gate 0 — the device check runs FIRST

**No other work in this spec starts until this gate reports.** The whole product shape depends
on it, and it is cheap to run.

Browser speech recognition is strongest exactly where this feature is weakest — desktop — and
weakest exactly where the room lives: phones.

- Android Chrome has a known continuous-recognition gap
  ([crbug 40324711](https://issues.chromium.org/issues/40324711)); `useSpeechToText` sets
  `continuous = true` ([useSpeechToText.ts](../src/hooks/useSpeechToText.ts):79).
- iOS forces every browser onto WebKit, whose `SpeechRecognition` support is inconsistent
  across versions — Chrome-on-iPhone is Safari wearing a different icon.
- **Verified defect, independent of platform:** `recognition.onend` only sets
  `isListening = false` ([useSpeechToText.ts](../src/hooks/useSpeechToText.ts):125). There is
  **no auto-restart.** When recognition ends for any reason — mobile timeout, silence, network
  blip — the live transcript dies silently while the person keeps talking. The hook was built
  for short prompts, not for twenty minutes of sustained room speech.

**Gate deliverable:** on one physical Android phone and one physical iPhone, with the
auto-restart fix in place, report: does live text survive 10 continuous minutes of speech with
natural pauses? Paste the observed output, not an inference.

**Gate outcomes:**
- **Pass** — build as specced.
- **Partial** (works with restart, drops words at restart boundaries) — build as specced,
  record the loss in UX Notes as a known limitation, and rely on the GPU transcript as the
  accurate record.
- **Fail on phones** — **stop and re-decide with the founder.** The room becomes a
  laptops-open surface, or the live half moves server-side (see Alternatives Considered). This
  is a product decision, not a bug to work around.

## Solution

A new authenticated route `/transcribe`.

**1. Consent gate.** Before the mic is touched. Reuses the framing already shipped on
[start-clarity-session-button.tsx](../src/app/components/letters/start-clarity-session-button.tsx):184-190
("Session recorded for AI Insights" / "Private session"), adapted: recorded **and visible to
everyone in this room**, plus agreement to terms and privacy policy. Entering the room is the
consent act; there is no way past this screen without it.

**2. Dual capture from one microphone.** Proven pattern, already shipping in `/chat`: open the
stream once, start `MediaRecorder`, then start speech recognition on top of it.
- **Audio half:** chunks upload via the existing `uploadAudioChunk` /
  `recordChunkUploadComplete` path to `gs://claritypledge-ml-training/`, under a room-scoped
  prefix distinct from `sessions/` so the `/live` corpus layout is untouched. On session end,
  a `transcription_jobs` row is created per participant via the existing
  `createTranscriptionJob` — one single-speaker job each, so **diarization is not needed and
  must not be enabled** for these jobs.
- **Live half:** browser speech recognition emits finalized utterances, each written as a row
  and broadcast to the room over Supabase Realtime.

**3. The chat.** The room's shared surface. Every finalized utterance appears as a message
with speaker name and timestamp — your own words and everyone else's, in the order they were
said. A filter switches between everyone and just-me. Interim (not-yet-final) words show only
to the speaker, in a distinct visual state, and are never broadcast.

**4. Two transcripts, on purpose.** The live chat text is the *display* record: fast, rough,
no reliable punctuation. The GPU transcript produced afterwards is the *authoritative* record
and the ML corpus. They are stored separately and never conflated. Downstream features read
the authoritative one.

**5. Two doors into one room concept.** A standing ad-hoc room, and a room per event —
the same object, with the event as an optional attachment. Built on P1114's
`event_room_members` roster rather than a parallel membership model.

**6. The room field exists from day one**, even for a single participant. Going from one
person to eight must be a UI change, never a migration.

## The ladder this builds toward

Named so it is **not** smuggled into this spec's scope. Layers 2-4 are separate specs.

| Layer | What | Status |
|---|---|---|
| **0+1** | Consent, dual capture, room-visible attributed chat | **This spec** |
| 2 | "Go" → points and stories generated on behalf of the speaker's agent | Later spec |
| 3 | Trigger verification with a chosen person in the room | Later spec |
| 4 | Agents conversing about the room's content faster than the humans | Separate bet |

**Layer 4 is not reachable by climbing 0-3.** Transcription yields text; agents-in-conversation
needs agents holding each person's positions and generating dialogue against each other.
Layers 0-3 must justify themselves on their own — attributed text, points, verification —
whether or not layer 4 ever works.

## Risks / Non-Goals

### Risks

- **Phones cannot sustain live recognition.** The single largest risk; owns Gate 0 above.
  Mitigation: gate runs first, on real hardware, with a named stop-and-re-decide outcome.
- **The live transcript dies silently mid-session.** Verified defect (no `onend` restart).
  Mitigation: auto-restart while the session is active, plus a **visible** listening indicator
  so a dead recognizer is obvious to the speaker rather than silent.
- **Someone reads the rough live text as the record.** Punctuation and accuracy are poor.
  Mitigation: the chat states that a corrected transcript follows; downstream features never
  read the live text.
- **A person joins a room and does not realize others see their words.** Mitigation: the
  consent screen says it in plain language, and the room shows a live participant list so the
  audience is never invisible.
- **Room-scoped writes corrupt the `/live` ML corpus layout.** Mitigation: distinct GCS prefix;
  verify by listing the bucket after the first real room and confirming `sessions/` is
  unchanged.
- **Eight simultaneous participants each create a transcription job.** GPU quota is 5
  concurrent; Cloud Tasks holds the rest rather than dropping them
  ([infrastructure.md](../docs/technical/infrastructure.md)). Verify the 6th-through-8th jobs
  complete rather than assuming the queue behaves.

### Non-Goals

- Do NOT enable diarization on these jobs — one device is one speaker; it would add cost and
  error for nothing.
- Do NOT chunk audio to a server for live transcription. The browser does the live half.
- Do NOT build the "Go → points and stories" button. That is layer 2.
- Do NOT build verification-with-a-room-member. That is layer 3.
- Do NOT modify `/live`, `/chat`, or their shared hooks' existing behavior — if
  `useSpeechToText` needs the restart fix, add it behind an opt-in option so current callers
  are unchanged.
- Do NOT change the GPU service, the job chain, or the `transcribe-session` deployment.
- Do NOT support unauthenticated participants in this spec.
- Do NOT retrofit rooms onto existing `/live` sessions.
- Do NOT modify `event_room_members`, its RPCs, or its policies (see A1 — a separate room
  table is the decision, reversing this spec's first draft).
- Do NOT build a download-the-transcript flow; session history is the delivery surface.

### Alternatives Considered

- **Server-side chunked transcription (CPU or GPU) for the live half.** Rejected for now: the
  browser does it at zero marginal cost and lower latency, and a 30-second server chunk
  reintroduces the warm-instance cost shape removed in P858
  ([decisions.md](../docs/decisions.md) 2026-05-31). Held in reserve as the answer if Gate 0
  fails on phones — it is the privacy-clean option and the only one that works on any device.
- **Retiring the GPU service and moving batch transcription to CPU.** Rejected on measured
  pricing: an L4-attached Cloud Run instance costs roughly 1.8× the equivalent CPU-only
  instance per hour while transcribing far faster, so the GPU is *cheaper* per hour of audio.
  The historic cost incident was a five-minute scheduler holding the instance warm, not the
  GPU itself.
- **One shared room microphone with diarization.** Rejected: reintroduces the exact problem the
  device boundary eliminates, and makes per-person consent impossible.

## UX Notes

**States to design:** pre-consent · consent · requesting mic permission · mic denied ·
listening (words flowing) · recognition dropped and restarting · speech API unsupported on this
browser · empty room (you are first) · populated room · session ended, corrected transcript
pending · corrected transcript ready.

- The **listening indicator must be unmissable.** A silently dead recognizer is the failure
  mode most likely to waste a real event.
- On an unsupported browser, the person must still be able to join and have their **audio**
  recorded — they lose live text, not participation. The corrected transcript arrives for them
  the same as everyone else.
- Mobile-narrow (320px) is the primary viewport, not desktop. The room is phones.

## Acceptance Criteria

- [ ] A signed-in person cannot reach the recorder without passing the consent screen
- [ ] A person's spoken words appear in the room chat, attributed to them, with a timestamp
- [ ] Every participant sees every other participant's messages, live
- [ ] A person can filter the chat to just their own messages and back
- [ ] Audio from each participant lands in the ML bucket under the room prefix
- [ ] A corrected transcript is produced for each participant after the session ends
- [ ] Live recognition survives a sustained multi-minute session without silently dying
- [ ] A participant on an unsupported browser can still join and have audio recorded

## Done-When

- [ ] Gate 0 has run on one physical Android phone and one physical iPhone, with pasted
      observed output, and the outcome (pass / partial / fail) is recorded in this spec
- [ ] `/transcribe` is reachable only when signed in; signed-out visitors are redirected
- [ ] Consent screen blocks mic access until accepted; declining leaves the room
- [ ] Two people in the same room on two devices each see the other's words appear live
- [ ] Each message shows speaker name and timestamp; the filter toggles me/everyone
- [ ] Interim words are visible only to the speaker and never appear in anyone else's chat
- [ ] Bucket listing after a real room shows audio under the room prefix and `sessions/`
      unchanged
- [ ] Transcription jobs for the room complete with diarization off
- [ ] Eight simultaneous participants complete transcription (verifies the queue holds jobs
      6-8 rather than dropping them)
- [ ] Killing recognition mid-session (airplane mode toggle) shows a visible dropped state and
      recovers when restored
- [ ] Screenshots at 320px, 375px, and desktop
- [ ] Existing `/live` and `/chat` speech behavior verified unchanged

## Architecture (narrow pass, 2026-08-21)

Four integration decisions. Everything else follows from existing code.

### A1 — The room is its own table, NOT an extension of `event_room_members`

**This reverses the non-goal written in the first draft of this spec.** The reason is a hard
constraint found in the migration: `event_room_members.event_id` is
`UUID NOT NULL REFERENCES public.events(id)`
(`20260819160000_p1114_event_room_tables.sql`:31). An ad-hoc room has no event, so that table
structurally cannot hold one without a schema change — and the change would land on a table
whose migrations are already committed to `main` — a settled table, not a scratch one.

It also carries semantics that do not belong here: `opted_in` (three-state Clarity Meeting
Principle answer), `client_secret` for walk-in bearer edits, and a comprehension rating. Those
are P1114's model, not transcription's.

**Decision:** new `transcribe_rooms` (with a **nullable** `event_id`) and
`transcribe_room_members`. An event room is the same object with the event attached — one
implementation, two doors, exactly as decided. Where an event room exists, the two membership
records coexist and answer different questions: P1114's says *did you accept the meeting
principle*, this one says *are you transcribing*.

**Do NOT** modify `event_room_members`, its RPCs, or its policies.

### A2 — Each participant's stream is one `clarity_sessions` row

The entire transcription chain is hard-bound to it: `transcription_jobs.session_id` and
`session_transcripts.session_id` are both `NOT NULL REFERENCES clarity_sessions(id)`
(`20260313120000_p495_transcription_tables.sql`:15,34). Widening that would touch the live prod
pipeline for a feature that does not need to.

**Decision:** on joining a room, mint one `clarity_sessions` row per participant —
`creator_name` = that participant, `joiner_name` NULL. It is literally what the row means: one
person's recording. `transcribe_room_members` holds the FK to it.

Three things fall out for free: chunk upload (`uploadAudioChunk` keys on session code), job
creation (`createTranscriptionJob`), and **session history** — `my-sessions-page` already reads
`clarity_sessions`, which is why "appears in session history for all participants" needs no new
surface.

**Known wart, accepted:** `clarity_sessions` is 1-on-1 shaped and its RLS is legacy-open
(`SELECT USING (true)`, `20250101_initial_schema.sql`:156). This spec does not fix that. It
matters only that no room content is readable through it — see A4.

### A3 — GCS prefix: `rooms/{room_code}/{participant}/`

`/live` writes `gs://claritypledge-ml-training/sessions/{session_code}/`. Room audio goes under
a sibling `rooms/` prefix, never inside `sessions/`, so the existing corpus layout and anything
reading it are untouched. Verify by listing the bucket after the first real room and confirming
`sessions/` is unchanged.

### A4 — Live text is its own table, room-scoped RLS

`transcribe_messages`: room id, member id, text, `spoken_at`, `is_final`. Broadcast over
Supabase Realtime `postgres_changes`, the pattern already used in `clarity-live-page`.

- **Only finalized utterances are ever written.** Interim text stays in browser state and
  reaches no server, which is what makes "only you see this" true rather than a UI convention.
- **RLS: read requires membership of that room** — not `USING (true)`. This is the one place
  the legacy-open posture must not be copied.
- Read access **persists after the session ends** for people who were in the room, matching the
  roster's own rule that the record of who was there is never deleted.
- These rows are the *display* record and are never read by downstream features.
  `session_transcripts` remains authoritative.

### Build order

1. Tables + RLS (A1, A2, A4) — with the membership-read policy tested from a non-member.
2. Join + consent gate, reusing the `/live` copy pattern.
3. Dual capture, wiring the existing `uploadAudioChunk` path to the `rooms/` prefix.
4. `onend` auto-restart in `useSpeechToText`, behind an opt-in option so `/chat` and the partner
   input are unchanged.
5. Chat + roster rendering.
6. Session end → `createTranscriptionJob` per participant, diarization off.

**Gate 0 runs before step 3** — it decides whether steps 4 and 5 are worth building at all.

## Founder Decisions — resolved 2026-08-21

**Room model — two doors, one room concept.** Mirrors the `/meet` pattern: one standing
**ad-hoc room** anyone can send five people to ("everyone go to /transcribe"), plus a
**room per event**. An event room is the same object with an event attached, so the event
case is a parameter, not a second implementation.

**Consent — KISS, matching `/live`.** "By joining you accept the terms and privacy policy",
plus the existing record-for-AI-insights flip. The join button stays disabled until the flip
is set. No new consent surface is designed for this feature.

**After the session — session history, for every participant.** The corrected transcript
appears in each participant's own session history. Not a download-or-lose-it moment: a
download that is never taken is a transcript that is lost, and the whole point is a corpus
that survives.

**Presence — everyone in the room is visible by name.** Nobody is listening unseen. This is
already the shipped position for event rooms: P1114's `event_room_members` roster was made
public by name on 2026-08-21 (`20260821120000_p1114_public_roster_reversal.sql`), reversing
its original opted-in-only visibility, on the founder's facilitation argument. `/transcribe`
inherits that rule rather than inventing a second visibility model.

**Note on P1114's state (re-checked 2026-08-23):** its **ship is stranded half-done.** The spec
file has been moved on disk into `features/done/2026-06-10/` but never committed — the
destination is untracked and the deletion from `features/` is unstaged. Its six migrations
(through `20260821180000_p1114_scope_readiness_distribution_to_members.sql`) ARE committed, so
the schema this spec depends on is real and settled even though the spec's own closure is not.

Two earlier notes in this spec were wrong and are corrected here: "in flight, 29 commits in w2"
(true on 2026-08-21, stale after) and "it has shipped" (asserted from the file's location on
disk, which `git ls-files` contradicts). **The filesystem is not the ship record** — the schema
being committed is what makes A1 safe, not where the markdown sits.

## References

- **P1114** `features/done/2026-06-10/p1114_event_room_presence_and_cmp_opt_in.md` — event room
  presence and opt-in. Deliberately not a markdown link: as of 2026-08-23 that file is moved on
  disk but **untracked**, so a link to it would be dead. Its `event_room_members` table is the
  dependency A1 leaves alone.
- [P1140](done/2026-06-10/p1140_transcript_retention_for_quote_reverification.md) — transcript retention for
  quote re-verification
- [infrastructure.md](../docs/technical/infrastructure.md) — `transcribe-session` Cloud Run,
  job chain, GPU quota
- [decisions.md](../docs/decisions.md) 2026-05-31 — the GPU idle-cost leak; why no timer may
  poke the service
