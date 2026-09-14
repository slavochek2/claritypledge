---
status: week
type: story
rank: 99
workstream: transcription
created_date: '2026-09-11'
tags: [transcribe, events, live, consent]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1307: Event transcription — starts at the ready screen, follows you across pages, lands in your sessions

**Replaces P1298, P1299 and P1305** (all three rejected in favour of this spec, 2026-09-11). Their
evidence and invariants are carried here; do not reopen them.

## Problem

> Founder framing, verbatim (2026-09-11): *"i guess we need some kind of merge between ready and
> transcribe so people can per default it's like per default they accept the terms you know and I
> would do it similarly like we do in live"* — and: *"on /ready they just go to /meet..
> transcirption runs in backgorudn and they can go to it and open the /transcribe any time and see
> whats there"*

**Situation.** Server-side room transcription (P1236) works inside `/transcribe`: each person's
phone sends short audio slices, each is transcribed by Gemini and shown to the room attributed to
the speaker, and each person's full audio is archived. Events have their own flow — event page →
`/events/:slug/room` (sign-in gate) → `/events/:slug/ready` (readiness slider + Continue) →
`/events/:slug/meet` (roster) — and **that flow never reaches transcription at all**
(`EventRoomReady.tsx:82-94` saves readiness and navigates; nothing in the events code touches a room).

**Complication.** Three failures, one outcome:

1. **Leaving the page ends your contribution.** The room page releases the microphone when it
   unmounts (`transcribe-room-page.tsx:365-380`), and nothing tells the person. At an event people
   spend their time on the meet page, their profile, a practice session — anywhere but a transcript
   page.
   > *"I have many people in the room in the event but they will leave the transcribe page and
   > today no audio will be there."*
2. **The transcript never reaches session history — and rooms rarely end at all.** A room creates
   a real session per member, but the session shows no transcript (`my-sessions-page.tsx:100`
   renders nothing without a job). Four things stand in the way, in order:
   - **A room is rarely ended.** The only end paths are one member ending it *for everyone*
     (`transcribe-service.ts:581-625`) or a slice arriving after the 180-minute cap
     (`transcribe-slice/handler.ts:141-147`). An abandoned room never ends — the code says so
     (`transcribe-slice/index.ts:107-112`) — and the server-side end creates no jobs
     (`index.ts:138-145`).
   - **Jobs are created only for the person who pressed End.** `endRoom` calls
     `createTranscriptionJob` for every member, but the RPC accepts only the caller's own session
     (`20260901230000_p1223_…sql:39-46`, "Not a participant of this session") and the client
     swallows the refusal (`api.ts:4152-4155`).
   - **That one job cannot find the audio.** The batch worker lists `sessions/{session_code}/`
     (`services/transcribe/audio.py:88`); room audio lands under the `rooms/{code}/{who}-{memberId}`
     prefix (`api.ts:3283`; observed flattened in the bucket 2026-09-11).
   - **It is the wrong engine.** That worker is Whisper + diarization; in a room the device is the
     speaker.
3. **Live text is wrong at the cuts.** Audio is cut every 4 s by the clock. A word spanning a cut
   is guessed: *"corrected"* came back as "correct" and "I correct"; *"Form a view on the four
   statements"* became *"from a view in the first statement"* — a different claim, stated
   confidently. The same 450 s of audio sent as one file had none of that (24 non-Latin invented
   characters sliced, 0 whole). And one speaker reads as a wall of name-stamped fragments:
   > *"if I'm speaking continuously... it should be a continuous text because right now it's very
   > hard to read."*

**Question.** How does a person at an event get transcribed from the moment they say yes, keep
being transcribed wherever they go in the app, stop being recorded when they or the room are done,
and find an accurate transcript in their sessions afterwards — with a consent step that is short
and true?

## Appetite

**Blast radius: high.** Moves microphone capture from a page to the app shell, adds a
server-side room lifecycle (per-person end, server-driven room end, a scheduled sweep), changes
consent on two surfaces (event ready screen, `/live`), changes privacy/terms text, adds a
whole-recording pass. **Reversibility: medium** — code and copy revert; audio captured under the
new consent cannot be un-captured. **Decision density:** product calls D1–D9 settled by the founder
on 2026-09-11; the adversarial review opened three more, all answered on 2026-09-14 (D10, D11, D12).
Two copy strings remain open.

## Decisions already made (founder, 2026-09-11) — do not re-ask

| # | Decision |
|---|---|
| D1 | Continue on the event ready screen starts transcription **if the switch is on**; the person lands on `/events/:slug/meet` exactly as today (never on `/transcribe`), transcription runs in the background, and they can open the room transcript any time. Switch off → Continue goes to `/meet` and **nothing starts**. They can go back to the ready screen and switch it on. |
| D2 | *(Default changed by D12: the switch starts **off**. Everything else in this row stands.)* A visible switch on the ready screen, **on by default**, labelled **"Transcribe for AI insights"**, with the founder's sub-line **"Record audio and share transcript with others in the room"** (says what is kept and who sees it). Below Continue, one small line: "By continuing, you agree to our Terms and Privacy Policy." Not a separate consent screen. (Whether default-on was enough, given that the privacy policy names consent as the legal basis, was F1; answered by D12.) |
| D3 | While the person is in a `/live` session, room transcription **pauses automatically** and **resumes automatically** when the `/live` session ends — only if it was running before. **No "paused" message**: in `/live` they get today's experience; after it, the transcription bar and capture simply come back. Applies to private `/live` sessions too. *Applied equally to explain-back recording in letters — the app's only other microphone user — by the one-voice invariant (review, 2026-09-11).* |
| D4 | Live text stays a **preview**; the **saved** transcript is a whole-recording pass per person after the room ends. Consecutive same-speaker rows render merged; a "…" indicator shows who is speaking. Cutting on pauses (voice activity) is **deferred**. |
| D5 | Slice length: **13 s** if it measurably reduces errors versus 4 s on real room audio (founder: *"lets do 13 sec then... i guess we can check if 13 has viwer erros - can you run it? and decide?"*). **Measured 2026-09-11: 13 s wins on both runs** — non-Latin invented letters 37 → 2, word error vs whole file 55.2% → 30.0%. See Evidence. |
| D6 | `/live`'s switch is renamed to the same label for consistency. "AI insights" is accurate: the founder produces insights from transcripts with AI tooling after sessions. |
| D7 | The persistent bar reuses the existing cross-page session bar (`ActiveSessionBanner`) rather than adding a second one. |
| D8 | Nothing new stops a forgotten, still-open page from recording: the room's existing 3-hour limit is the backstop and the always-visible bar is the reminder (founder chose this over a silence timeout, which would drop the question someone waited through a talk to ask). *Review, 2026-09-11: today the limit rejects only live slices — the archive keeps recording past it. Part 1 adds the client hard stop so the backstop is real. Per room or per person was answered on 2026-09-14 — see D11.* |
| D9 | Wherever transcription is running, the person can see it — on every page (founder: *"people get visibility everywhere they are if they are recorded"*). |
| D10 | **(2026-09-14, answering F2.)** Every attendee passes the ready screen, so everyone is offered the switch: the event gate routes to `/ready` whenever this person is not already being transcribed for this event, with their saved readiness value shown on the slider. It no longer skips to `/meet` just because readiness exists. The switch stays in one place — it is not added to `/meet`. |
| D11 | **(2026-09-14, answering F3.)** The 3-hour cap runs **per person**, from their own Continue — not from the room's creation. One room serves the whole event, so a latecomer gets their own 3 hours and the event's transcript is never split in two. |
| D12 | **(2026-09-14, answering F1; delegated by the founder.)** The switch **starts off**. Tapping it on is the consent: it is the "clear affirmative action" that the legal basis needs (Art. 6(1)(a), `privacy.md:230`). A switch that is already on, followed by Continue, has the shape the CJEU held is **not** valid consent (Planet49, C‑673/17: a pre-ticked box the user must untick to refuse; GDPR Recital 32: "silence, pre-ticked boxes or inactivity should not … constitute consent"). The line "By continuing, you agree to our Terms and Privacy Policy." is unchanged: accepting the terms rests on contract, as on `/live`, and the founder's "per default they accept the terms" survives in it. This keeps `privacy.md:111-113` ("requires you to tap a control… nothing is captured before you do") true. **Cost, accepted:** fewer attendees transcribed than with default-on. D10 limits it: everyone not yet being transcribed passes the switch on each visit. **Rejected:** (a) default-on with the same Continue: not valid consent, as above. (b) Default-on, with a Continue button whose label names the recording while the switch is on: plausibly valid, but it needs new button copy ([FOUNDER DECISION]), and one button would still carry both the readiness answer and the consent. (c) Moving room recordings off consent to legitimate interest: this is voice audio kept and used for AI/ML, which the policy puts on consent (`privacy.md:232`), and the server already records consent (`consent_given_at`). **What would reopen it:** a founder choice of (b) with copy, or legal advice that a different basis applies. `/live`'s default-on host switch has the same weakness, and `privacy.md:84-98` already discloses it. It is out of scope here (D6 renames only). |

## Solution

Seven parts. **Parts 1, 5 and 6 must go live together** — capture that starts at the ready screen
without the app-level owner stops the moment the person lands on `/meet`, and capture without the
server-side end never produces a saved transcript and never stops at the cap. **Part 4's edge and
client halves ship edge-first.**

### 1. Capture lifecycle — who starts it, who stops it, what ends the room

The load-bearing part: today the only "end" is one member ending the whole room, the cap ends
nothing but live slices, abandoned rooms never end, and jobs are created only for the ender.

- **Start.** Continue with the switch on calls the existing `enter_transcribe_room` with
  `p_event_id = event.id` — one room per event. The RPC already scopes the shared room by event
  (`20260911151200_p1236_g_…sql:105-110`), but its only caller passes no event id
  (`transcribe-room-page.tsx:310`); without it attendees land in the global `/transcribe` room with
  whoever opened it that day. The RPC records consent server-side in the same statement
  (`…g_…sql:123-129`). **The microphone prompt and both recorders start only after it returns a
  member row with `consent_given_at` set.** While it runs, Continue shows progress (the call has a
  15 s deadline, `transcribe-service.ts:148`). On failure or timeout the person still lands on
  `/meet` — with no bar, no capture, and a short message [FOUNDER DECISION: copy]. The ready screen
  today navigates even when its own write fails (`EventRoomReady.tsx:82-94`); that pattern must not
  carry over to capture.
- **Per-person end.** The bar's **End session**, switching the ready-screen switch off, and the room
  page's End while this capture runs all do one thing: stop this person's capture and record it on
  the server through an RPC (a per-member end marker — no such column exists today:
  `20260823190000_p1149_…sql:66-73`, `20260908170000_p1236_…sql:38-42`). **No client ever ends a
  room for anyone else.**
- **Room end is server-driven.** A room ends when every member has ended capture, **or** no member
  has sent a slice for N minutes, **or** the room reaches the cap. Slices are sent during silence
  too (empty slices are normal — Evidence table), so "no slice from anyone" means every device has
  stopped, not that the room went quiet; it is not the silence timeout D8 rejected. A scheduled
  server-side sweep evaluates this — nothing ends an abandoned room today. N is Open Question T2.
- **At room end, the server creates the whole-recording work for every member** (service role —
  never the ending client, whose RPC call is refused for other members' sessions).
- **The cap is per person (D11).** Each member's capture stops 3 hours after their own Continue,
  measured from their member row — today the cap is the room's age (`handler.ts:141`). The room
  itself lives as long as its members do (plus the room-end rule above), so `enter_transcribe_room`
  must stop refusing an event's room once it is 180 minutes old (`…g_…sql:77,108`), or a latecomer
  starts a second room for the same event. `countActiveRooms` reads the same room-age window to
  decide which rooms still count against the per-user ceiling (`index.ts:124-135`) and has to move
  with it — `/architect` keeps those three readings consistent by construction, as the code does now.
- **Client hard stop.** On the first `410` (room ended or too long) from the slice path, or when
  this device's capture time reaches the cap, the client releases the microphone, flushes the last
  archive chunk and clears the bar. Today neither the slice sender nor the archive stops: a failure
  only counts towards "Live text has stalled — your words are still being recorded"
  (`transcribe-room-page.tsx:229-250`), and the archive's upload signing never checks whether the
  room has ended (`gcs-signed-url/index.ts:58-78`).
- **Any auth change ends capture immediately** — sign-out, a session that expires without refresh,
  or a different user id. Nothing stops a recorder on sign-out today (`AuthContext.tsx` clears only
  `/live` keys), and a second person signing in on the same phone must never inherit a capture
  consented by someone else.
- **One capture per person per browser.** A second tab shows the bar with Open/End but does not
  capture. The join RPC upserts on `(room_id, profile_id)` (`…g_…sql:123-129`), so without this a
  second capture is silent.

### 2. Transcript in session history

The session entry for a room shows the room's transcript, attributed by speaker, in spoken order.
Before the whole-recording pass completes it shows the live rows; after, the saved version. That
needs a read path that does not exist: session → `transcribe_room_members.session_id` → room →
member-scoped `transcribe_messages` (P1207 rules); today the row renders nothing without a job
(`my-sessions-page.tsx:100`). There is **one room transcript**; `/architect` picks whether sessions
reference it or carry a copy, but nothing is readable beyond room membership
(`…p1149_…sql:146-157`; `session_transcripts` is keyed by one session, `api.ts:4116-4128`).

### 3. Whole-recording pass

Per member, the archived chunks are reassembled and transcribed **in segments, never as one
request**: Gemini with diarization off accepts a long file, bills all of it, and returns roughly
the opening five minutes with HTTP 200 and no warning (P1237 RQ5 — 58-minute file, 4-gram coverage
22% in minutes 0–5 and ~0% after; `transcribe-slice/validate.ts:7-11`). Segment length ≤ 5 min
unless re-measured; segments are stitched by timestamp and members merged into one timeline.

- **Room-specific engine:** the device is the speaker — no diarization, no voice-profile writes, not
  the Whisper batch worker. The P1237 ruling (Whisper + diarization for `/live` batch) is not touched.
- **Cross-member duplicate speech is a deliverable of this part**, not an open question: every phone
  hears everyone (P1236 measured phones-on-a-table separation at 7.1 dB median, 75% of sessions
  below the bar), so N members' passes transcribe the room N times. `/architect` picks the rule
  (de-duplicate, or keep and label as overheard); an AC below judges it.
- **Incomplete archives are reported, never presented whole.** A killed tab never runs the
  recorder's stop handler, so its last chunk is lost, and the `ml_training_sessions` row is written
  only with the last chunk (`api.ts:3311-3320`) — the pass must not depend on that row, and a
  member whose archive ends early is marked incomplete.

### 4. Slice length 13 s (D5) — every bound that touches a slice moves together

A 13 s slice plus 1 s lead-in at 16 kHz mono 16-bit is 448,044 bytes and is **refused today**, before
Gemini sees it (`validate.ts:43` bytes, `:50` duration).

| Bound | Today | Change |
|---|---|---|
| `SLICE_INTERVAL_MS` (`slice-recorder.ts:36`) | 4,000 | 13,000; ring buffer follows (`:41`) |
| `MAX_SLICE_DURATION_MS` (`validate.ts:50`) | 8,000 | ≥ 14 s plus the late-timer margin (e.g. 17,000) |
| `MAX_SLICE_BYTES` (`validate.ts:43`) | 320,000 | above 17 s × 32,000 + 44 = 544,044 (e.g. 640,000) |
| Inequality test between the two (`handler.test.ts:246-253`) | — | moves with them |
| `MAX_SLICES_PER_MEMBER` (`handler.ts:46`) | 3,000 | re-derived (~1,000), **not dropped** — it also bounds rejoin/replay (`transcribe-service.ts:460-471`) |
| Final partial slice on stop (`slice-recorder.ts:327-336`) | discarded | emitted — up to 13 s of the last utterance otherwise never reaches live text |

Keep the 1 s lead-in and the de-duplicator. The edge function deploys first and accepts both 5 s
and 14 s slices during rollout; the client follows.

### 5. Event ready screen (D1/D2)

Start per Part 1. If the person returns to the ready screen while their capture runs, the switch
shows **on**; switching it off is a per-person end.

Per D10, the gate routes to `/ready` whenever this person is not already being transcribed for this
event — it no longer skips to `/meet` on the strength of a stored readiness value alone
(`EventRoomGate.tsx:73-77`), and the slider shows the value they already set. Someone already being
transcribed goes straight to `/meet` as before. The post-freeze redirect stays
(`EventRoomReady.tsx:99-105`): the event is over by then. This changes the P1077 behaviour "return
visit with readiness already set lands on /meet, skipping readiness" — update that UAT expectation
rather than working around it.

### 6. Capture follows the person across pages

- **Mount point.** One provider, mounted **once above `<Routes>`** in `App.tsx` — inside the auth
  provider and inside the Sentry error boundary — owns the stream, both recorders, the
  consecutive-failure counter and the running-room state. Not `LiveSessionProvider` or
  `ClarityLandingLayout`: both are instantiated per route element (`clarity-landing-layout.tsx:37,48`),
  so a route change would tear capture down. A crash into the error fallback (`App.tsx:280-298`,
  no bar) unmounts the provider, and capture stops.
- **The bar (D7, D9)** is rendered by that provider wherever capture runs — a rule, not a route
  list. Today the session bar is absent on: chromeFree routes (`clarity-landing-layout.tsx:35-45` —
  `/letter/:docId/preview`, `/letter/:letterId/confirm`, `/cm`, `/explain-back/:id`), any
  `?embed=true` URL (`:28-32`), routes outside the layout (`/donate`, `/s/:code`, redirects), and
  `/transcribe` itself (`:86-87`, `:140`). On immersive letter screens the session bar is hidden
  deliberately (it collided with the letter progress bar) — `/ux` places the transcription
  indicator there without the collision, or capture pauses there; either way no route shows capture
  without an indicator. One presentational bar plus two thin wrappers (live session, room
  transcription); `ActiveSessionBanner` reads session context for its text today
  (`active-session-banner.tsx:12-23`), which lifts to props.
- **Open → `/transcribe/{code}`.** While a capture for this room runs, the page renders the room
  view directly — no consent screen, no join, no second `startCapture`, no unmount teardown — and
  its End does exactly what the bar's End does. Today its only path is consent → join →
  `startCapture` (a second microphone and recorder), its End ends the room for everyone, and its
  unmount stops capture (`transcribe-room-page.tsx:291-333, 335-362, 365-380`). `/transcribe`
  without a code while capturing shows the running room and never enters a second one.
- **The archive never overwrites itself.** Pause/resume, refresh, re-entry and tabs today restart
  the chunk counter at 0 (`transcribe-room-page.tsx:180`) under the same prefix, and the object
  name is `chunk_NNN.webm` (`gcs-signed-url/validate.ts:87`, no overwrite precondition when
  signing) — a return overwrites the first segment. Numbering is monotonic per member (server-issued
  or per-capture segment id; `/architect` picks). Failed uploads retry from a bounded queue; today
  they are only logged (`transcribe-room-page.tsx:191-195`).
- **Pause/resume (D3).** Pause when the location is `/live` or `/live/:code`, or while an
  explain-back recording runs (`letter-flow-content.tsx:951`, `story-walk.tsx:315`). Resume when the
  location has left `/live` **and** no `/live` session is still active (`cp_active_session`,
  `live-session-context.tsx:5`) — so browser Back out of a still-open session does not resume.
  "Was running before" persists in `sessionStorage` with the running room, so a reload still
  resumes. While paused, nothing from room capture is sent or archived. Practice rooms navigate
  in-tab (`PracticeRooms.tsx:70,95`). Whether the stream is held or released while paused is
  Open Question T3.
- **Stall state.** After 3 consecutive failed or dropped slices the bar changes
  [FOUNDER DECISION: copy] — the same counter the room page uses today
  (`transcribe-room-page.tsx:229-235`), moved into the provider. The concurrent-rooms ceiling
  (3, counted over rooms not ended and under the cap — `index.ts:124-135`) returns 429 for every
  slice once reached; Part 1's server-side end frees those slots, and the stall state makes the rest
  visible.
- **Screen off / backgrounded.** Where the browser keeps recording with the screen off (Android),
  the OS microphone indicator is the only signal — accepted under D8, bounded by Part 1's hard stop
  at the cap. Resume after the phone locks is Open Question T1.

### 7. Readability (D4)

Merge consecutive same-speaker rows at render time; show "…" against a person while they are
speaking. The indicator is transient client/realtime state, never a row.

Plus: `/live` label per D6, and `privacy.md` / `tos.md` updated to match what the code does
(Done-When lists the sentences).

## UI Contract

Founder-approved copy, 2026-09-11 (the `/live` strings follow D6).

| Where | String |
|---|---|
| Ready screen switch label | **Transcribe for AI insights** |
| Ready screen switch sub-line (on) | Record audio and share transcript with others in the room |
| Ready screen switch sub-line (off, the default state per D12) | Not transcribed |
| Line under Continue (both states) | By continuing, you agree to our Terms and Privacy Policy. |
| Bar | ● Transcribing for AI insights — actions **Open**, **End session** (never wraps at 320 px) |
| Bar, stall state (3 failed slices) | [FOUNDER DECISION: copy] |
| After Continue when the room could not be joined | [FOUNDER DECISION: copy] — shown on `/meet`, no bar |
| `/live` start switch | Transcribe for AI insights (was "Record for AI Insights") |
| `/live` in-session banner | Session transcribed for AI insights (was "Session recorded for AI Insights") |

Layout: the switch sits **visibly apart from the slider** — extra space above it on top of the
column's normal gap — because it answers a different question (founder review of the prototype).
Order on the ready screen: question → slider → switch → Continue → consent line. `/live`'s own
terms line reads "By starting or joining…" (`clarity-live-page.tsx:4262`) and is not changed; "By
continuing" is the ready screen's own copy.

Clickable prototype: `/tree/event-transcription` on branch `feature/p1307-event-transcription`
(dev-only). Styling reuses the event ready screen, `/live`'s switch and terms line, and the
existing session bar's classes. The meet page, the `/live` session and the transcript view in the
prototype are **labelled stand-ins** for the real, unchanged pages — founder review caught the
first version inventing a meet-page layout. The prototype keeps one URL and switches screens in
memory; the real product navigates `/events/:slug/ready` → `/events/:slug/meet`. **Founder
approved the prototype 2026-09-11.** Button colours are left as each page has them today
(dark blue on the ready screen, `/live`'s blue in the bar); app-wide colour consistency is P1308.

## Invariants

- **Never promise on a consent surface what the system does not do.** (P1236 removed a "corrected
  transcript afterwards" sentence from the room's consent screen because nothing kept it.
  `tos.md:62-63` still carries it — false today, made true only by Part 3; see Done-When.)
- **Capture never runs with no indicator on screen** (D9) — enforced as a rule over every route,
  not a list.
- **Nothing is captured before consent is recorded on the server**: the microphone prompt follows a
  member row with `consent_given_at`. Nothing is captured when the switch is off.
- **Capture stops at the cap and at room end, on the client** — the server refusing slices is not
  a stop.
- **No client ends a room for anyone else.** Per-person end is a server record; room end is
  server-driven.
- **One voice, one recording at a time.** Never a silent second recording (room + `/live`, room +
  explain-back, two tabs), never a silently dropped first one — D3's pause/resume is the only
  resolution.
- **Capture has exactly one owner**, mounted once above the routes; it survives every route change
  and ends on any auth change.
- **An archived chunk is never overwritten.**
- **Attribution comes from the server** (the member row), never from the client.
- **Interim text never reaches the database.** `transcribe_messages.is_final` admits only `true`;
  the "…" indicator is not a row.
- **Never over-strip.** The de-duplicator's bias — a surviving duplicate is visible and harmless, a
  deleted word is invisible and unrecoverable — holds at any slice length.
- **Room contents are readable only by room members** — reuse the P1207 member-scoped rules; no new
  access paths.
- **`privacy.md` and `tos.md` describe what the code does** — checked against the code, not assumed.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Rooms never end and saved transcripts never exist (no per-person end, no sweep, jobs only for the ender) | MITIGATE | Part 1 |
| A forgotten page records past the 3-hour limit (archive has no cap today) | MITIGATE | Part 1 client hard stop |
| One Gemini request per member returns ~5 minutes of a long recording, silently, billed in full | MITIGATE | Part 3 segments ≤ 5 min (P1237 RQ5) |
| Every 13 s slice refused by the ingest validator | MITIGATE | Part 4 bounds table, edge first |
| Leave-and-return overwrites the first segment of the archive | MITIGATE | Part 6 monotonic numbering |
| Phones in a shared room each hear everyone; the whole-recording pass repeats a sentence under several names | MITIGATE | Part 3 deliverable + AC |
| Edge-function request body limit at ~600 KB base64 per 14 s slice — UNVERIFIED | MITIGATE | Measure in `/verify` (Open Question T4) |
| Browser suspends the microphone when a phone locks or the app is backgrounded (iOS especially) — UNVERIFIED | MITIGATE | Part 6; measure on a real iPhone during `/verify` |
| Someone leaves the event with the page open, or the phone in a pocket with the screen off (Android), and keeps being recorded until the cap | ACCEPT | D8 — the bar (screen on) or the OS mic indicator (screen off) is the signal; Part 1's hard stop bounds it. Revisit if it happens at a real event |
| 13 s slices mean ~15 s from speech to text | ACCEPT | Founder: reading while talking is not the use case (P1236, 2026-09-04); the "…" indicator makes the delay legible |
| The whole-recording pass roughly doubles transcription spend | ACCEPT | ~€0.16 per audio-hour per person (P1237 measurement); ~€1.60 for a 10-person hour |
| `ActiveSessionBanner` only polls every 30 s outside `/live` (P743 ruling, 2026-04-17) | MITIGATE | Resume after `/live` is driven by location + `cp_active_session` in this tab (Part 6), not by that poll |
| The banner's End must respect roles (P1063 ruling, 2026-08-13) | MITIGATE | Rooms have no owner column (`…p1149_…sql:32-38`); the only End is per-person (Part 1) |
| P1236 itself is not yet on prod (main is ahead of origin) | DEFER | This ships after P1236 is pushed; see Pre-deploy Checklist |

**Non-Goals**
- Do NOT build voice-activity (pause-based) segmentation — deferred by D4.
- Do NOT change `/live`'s batch pipeline or its diarization (P1237 ruling).
- Do NOT add transcription for signed-out guests; the event gate already requires sign-in.
- Do NOT change the readiness slider's semantics or the meet page roster. The event gate changes in
  exactly one way, per D10 — where it routes a person who is not being transcribed.
- Do NOT put the transcription switch on `/meet` (D10) — one control, one place.
- Do NOT add a "paused" message for the `/live` or explain-back case (D3).
- Do NOT let any client end a room for other members.

## Acceptance Criteria

Start and consent
- [ ] The ready screen renders the switch **off** for anyone not being transcribed (D12); pressing Continue without touching it captures nothing (verified server-side: no member row with `consent_given_at`, no slice, no archive chunk).
- [ ] At an event, after tapping the switch on, pressing Continue lands the person on `/meet` with the bar showing and their speech appearing in the room transcript.
- [ ] With the switch off, Continue lands on `/meet`, no bar, nothing captured (verified server-side: no slice, no archive chunk); going back to the ready screen and switching on starts it.
- [ ] With the room RPC forced to fail, Continue lands on `/meet` with no bar and the failure message, and no microphone prompt is ever raised.
- [ ] The attendee's room carries the event's id; a visitor opening `/transcribe` without a code does not land in it.
- [ ] An attendee whose readiness was already set on an earlier visit still reaches the ready screen, with their saved value on the slider, and sees the switch (D10); someone already being transcribed goes straight to `/meet`.
- [ ] A latecomer who presses Continue 2 h 55 into a running event room is transcribed for their own 3 hours, in that same room — no second room for the event, no split transcript (D11).

Across pages
- [ ] A person who moves to their profile, the feed and back keeps contributing throughout, and can end it from any page via the bar.
- [ ] While transcribing, the bar is visible on `/letter/:docId/preview`, `/cm`, a `?embed=true` URL and the `/transcribe` lobby (screenshots).
- [ ] Opening the room from the bar shows the room view with no consent screen and no second recording; its End ends only this person's capture.
- [ ] Two tabs open while transcribing: exactly one captures.
- [ ] Signing out while transcribing turns the microphone off within 1 s and no further chunk reaches the bucket.
- [ ] Joining a `/live` session from the meet page stops room capture with no message; ending it brings the bar and capture back — and does not start anything if transcription was off before. Leaving `/live` by browser Back brings the bar back only after that session has ended.
- [ ] Recording an explain-back while transcribing pauses room capture; it resumes afterwards.
- [ ] Reproduced with two participants on two devices, one navigating away mid-room and returning: the bucket holds both segments and the saved transcript contains speech from both.

End and saved transcript
- [ ] Two members both press End on the bar without ever opening the room page: the room ends on the server and both sessions show a saved transcript.
- [ ] Nobody presses End and every tab is closed: the room ends within N minutes of the last slice and transcripts are saved.
- [ ] At the cap (injected as 1 minute in a test build): the microphone is released, the bar clears, no further archive chunks arrive.
- [ ] After the room ends, each member's session shows the transcript, attributed and in spoken order; a non-member cannot read it; a room with no speech shows an empty state.
- [ ] A 20-minute two-member room's saved transcript covers its last 5 minutes — word overlap against the live rows per 5-minute bucket, written into this spec.
- [ ] Two phones, one speaker: the merged timeline shows the sentence once, or labelled per Part 3's rule.
- [ ] The saved transcript is the whole-recording version, compared against the live text of the same room and the comparison written into this spec.

Live text
- [ ] A 13 s slice sent through the deployed `transcribe-slice` returns 200 with text.
- [ ] One person speaking continuously for 30 s reads as one continuous message, not one per slice; two people alternating stay separate.
- [ ] While someone is speaking, "…" shows against their name.
- [ ] `/live` shows the new label on the start switch and the in-session banner.

## Done-When

- [ ] D5 measurement recorded in Evidence with the slice length chosen by its pre-registered rule.
- [ ] De-duplication ratio (rows vs distinct text) stays at ~1.00 on a real room — the P1236 verdict measure does not regress.
- [ ] `privacy.md` updated and checked line by line against the code: §Transcribe rooms ("Joining requires you to tap a control that reads…" names the old control and must name the ready-screen switch too; its rule, nothing captured before you tap, stays true per D12; "Leaving the room stops your recording" is false under this spec), event rooms and cross-page continuation; §AI features ("short segments" — add the whole-recording pass); the Gemini row in the providers table; the legal-basis row for room recordings stays consent (D12) and names the ready-screen switch as a control that gives it.
- [ ] `tos.md` §Transcribe Rooms (lines 59-64) updated: joining, leaving, and the corrected-transcript sentence — which stays only if Part 3 ships in the same release, and is reworded otherwise.
- [ ] Every site carrying the old `/live` label updated (not deleted): `clarity-live-page.tsx`, `live-mode-view.tsx`, `start-clarity-session-button.tsx`, `new-live-prototype.tsx`, `privacy.md`, `tos.md`, and the tests `live-mode-view.test.tsx`, `consent-dialogs.test.tsx`, `p1300-reproduce.test.tsx` (grep again at build time).

## Pre-deploy Checklist

### Deploy order
- [ ] P1236 (server-side live transcription) is on prod first — it is on local `main` but not `origin/main` as of 2026-09-11.
- [ ] Migration for the per-person end marker (and any room-transcript table) applied to prod.
- [ ] `transcribe-slice` deployed with the Part 4 bounds **before** any client sends 13 s slices.
- [ ] The room-end sweep deployed and scheduled on prod, and any new whole-recording function deployed.
- [ ] `GEMINI_BATCH_API_KEY` present in the prod project's function secrets (the live path already requires it — confirm, do not assume).

### Post-deploy verification
- [ ] A real two-device event room on prod: bar, navigation, `/live` pause/resume, room end without anyone pressing End, session transcript.
- [ ] Sentry clean for 10 minutes after.

## Open Questions

**For the founder (raised by the 2026-09-11 adversarial review):**

- ~~F1. Default-on vs. the legal basis for recording.~~ **Answered 2026-09-14: D12. The switch starts off.**
- ~~F2. Returning attendees never see the switch.~~ **Answered 2026-09-14 — D10.**
- ~~F3. Three hours per room or per person?~~ **Answered 2026-09-14 — D11.**
- **Copy:** the bar's stall state, and the message on `/meet` when the room could not be joined
  (UI Contract).

**Technical (for `/architect` and `/verify`):**

- **T1. Resume after the phone locks.** Can capture restart without a tap on iOS Safari and Android
  Chrome? If a tap is required, the bar's resume affordance needs founder-approved copy — D3's "no
  paused message" was decided for the `/live` case, not this one.
- **T2. N for the room-end sweep** (minutes since the last slice from any member).
- **T3. Hold or release the stream while paused.** Holding avoids a gesture on resume but keeps the
  OS microphone indicator lit during a private `/live`; releasing needs a fresh `getUserMedia` on
  resume. Measure on iPhone.
- **T4. Edge-function request body limit** for a ~600 KB base64 slice.

## Adversarial review (2026-09-11)

Two reviewers, both reported (2 of 2): Fable (26 findings) and Codex (9 findings, verdict "do not
build as written"). Every finding was checked against the code before entering this spec:
Codex 5 confirmed, 4 partly confirmed; Fable 21 confirmed, 1 partly (H4 — the archive path *does*
check consent, `gcs-signed-url/handler.ts:157-164`), 4 accepted as requirements or corrections.
Two more came from the verification itself: room end does not stop other members' archives, and
explain-back is a second microphone user. The review's single most important fix is Part 1. The
reports are kept outside the repo.

## Evidence

**D5 — 4 s vs 13 s vs whole recording, 2026-09-11.** Same 450 s of real room audio as the P1298
measurement; same model (`gemini-3.5-transcribe`), the same Gemini request as `transcribe-slice`
sends, same 1 s lead-in, the production de-duplicator applied in production order. Two runs per
variant. Reference = whole-file transcript (the same model hearing full context; not a human
transcript — disagreements read by hand, below).

**Pre-registered rule:** choose 13 s if, on both runs, it has fewer non-Latin invented characters
than 4 s and a lower word error rate against the whole-file reference; otherwise stay at 4 s.

| variant | stored rows | slices (empty) | words | non-Latin letters | word error vs whole |
|---|---|---|---|---|---|
| whole file, run 1 / run 2 | — | 1 | 317 / 317 | 0 / 0 | reference / 0.0% |
| **4 s**, run 1 / run 2 | 59 / 59 | 113 (54) | 429 / 429 | **37 / 37** | **55.2% / 55.2%** |
| **13 s**, run 1 / run 2 | 17 / 17 | 35 (18) | 361 / 361 | **2 / 2** | **30.0% / 30.0%** |

**Verdict: 13 s.** It meets the pre-registered rule on both runs (both runs of every variant were
byte-identical, so "two runs" confirms determinism rather than adding a sample).

**What the errors actually are** (read by hand, not only scored):
- **4 s** emitted seven whole rows of invented Chinese and Hindi, e.g. `बचाओ, बचाओ।` ("save me, save
  me") and `बहुत ही महंगा।` ("very expensive") — none of it spoken. The 112 extra words are
  mostly boundary guesses and lead-in text the de-duplicator did not match.
- **13 s** still has three kinds of error, fewer of each: one invented token at the very start
  (`广告`, "advertisement", over the opening digits); **one invented sentence at a boundary** —
  *"This is a good one. They will save because you speak a native three languages, English,
  French, Thai."* where the whole file has only "Uh"; and **three lead-in duplicates the
  de-duplicator left in** ("do the thing in the room do the thing", "something we resolve here
  something we resolve here", "1296 1296") — its deliberate under-strip bias, now visible because
  the re-transcribed overlap differs by a word from the stored tail.
- Part of the 30% is formatting, not meaning ("/stake" vs "on/stake", dropped "um"/"uh",
  punctuation). The meaning-changing error in P1298 — *"four statements" → "first statement"* —
  is **correct** at 13 s.

**What this does not show:** one speaker, one recording, English with one room's acoustics. The
reference is the same model with full context, not a human transcript. The harness called Gemini
directly and **did not run the ingest validator**, which refuses every 13 s slice today (Part 4) —
this measures transcription quality, not whether the deployed path accepts 13 s. 13 s makes the
live preview materially better; it does not make it the record — Part 3 remains the record.

Raw outputs and the script are in the session scratchpad, not the repo (they contain the
founder's speech); the re-run recipe is: reassemble a room's archive chunks, slice with a 1 s
lead-in, send each slice as `audio/wav` in the same Gemini request `transcribe-slice` builds, apply
`dedupeSliceText` in order, and read `parts[].audioTranscription.text`.

**Carried from P1298 / P1236:** sliced 4 s had 24 Devanagari characters vs 0 whole-file
(P1298, 2026-09-11); a word straddling a cut is damaged and 1 s of lead-in recovers it (P1236
Finding 8); 2 s was rejected on quality (P1236 Finding 4); Gemini returns empty rather than
inventing filler on silent slices (P1236 Finding 6).

## Related

- P1236 — server-side room transcription this builds on.
- P1298, P1299, P1305 — rejected; superseded by this spec.
- P1237 — batch pipeline ruling (not changed here) and RQ5, the silent five-minute truncation.
- P495 / P1223 — `create_transcription_job` and its participant check.
- P511 / P743 / P1063 — the cross-page session bar and its rulings.
- P1077 / P1114 — the ready screen and its readiness distribution.
- P1207 — member-scoped room reads.
- P904 — the explain-back page (chromeFree, second microphone user).
- P1308 — button colour consistency across the app (split out of this spec on purpose).
