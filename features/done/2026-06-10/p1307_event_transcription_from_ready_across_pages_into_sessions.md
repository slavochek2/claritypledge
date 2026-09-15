---
status: all-done
type: story
rank: 99
workstream: transcription
created_date: '2026-09-11'
tags: [transcribe, events, live, consent]
disclosure: public
flow: dev
pipeline_plan: [create-spec, architect, generate-tests, dev, verify]
pipeline_ran: [create-spec, architect, generate-tests, dev]
uat_file: features/uat/p1307.md
test_files:
  - e2e/integration/p1307-schema-and-grants.spec.ts
  - e2e/integration/p1307-end-capture-rpc.spec.ts
  - e2e/integration/p1307-enter-room-event-access.spec.ts
  - e2e/integration/p1307-chunk-and-heartbeat-rpc.spec.ts
  - e2e/integration/p1307-sweep-tick.spec.ts
  - e2e/integration/p1307-jobs-transcripts-rls.spec.ts
  - e2e/integration/20260824000000_p1149_room_end_policy_column_guard.spec.ts
  - supabase/functions/transcribe-slice/handler.test.ts
  - supabase/functions/gcs-signed-url/handler.test.ts
  - src/tests/p1307-capture-state-machine.test.ts
  - src/tests/p1307-pause-resume.test.ts
  - src/tests/p1307-ready-screen.test.tsx
  - src/tests/p1307-room-capture-bar.test.tsx
  - src/tests/p1307-transcript-merge.test.ts
  - src/tests/p1307-web-locks-single-capture.test.ts
  - src/tests/p1236-end-room-idempotent.test.ts
  - src/tests/p1236-duration-bound-drift.test.ts
  - src/tests/live-mode-view.test.tsx
  - src/lib/audio/slice-recorder.test.ts
  - e2e/p1307-event-transcription.spec.ts
  - e2e/a11y/p1307-accessibility.spec.ts
pipeline_skipped: ["challenge-prd -- adversarial review already folded in, 2 of 2 reports verified against code", "ux -- prototype founder-approved 2026-09-11; the one open placement question is settled by D13", "decompose -- the spec already splits the work into seven parts with a stated deploy order", "spec-review -- spec is 3 days old and not a change request"]
drafted_by: opus
exec_model: opus
exec_effort: high
completed_at: 2026-09-15
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
| D13 | **(2026-09-14, agent pick on the founder's go-ahead; founder may override.)** On immersive letter screens, where the session bar is hidden so it doesn't collide with the letter progress bar, room capture **pauses** and resumes on leaving, the same as during `/live` (D3). Nothing new is drawn on those screens, and the "never capture without an indicator" invariant holds. The alternative, drawing the bar there, needed a design pass (`/ux`) for no gain in what gets transcribed at an event. |
| D14 | **(2026-09-14, founder.)** "The room" means **the people who turned transcription on**, not everyone registered for the event. Founder: *"if I'm not contributing, I should not have access… it's about who is in the room… the transcribe room."* An attendee who never switches it on is not a room member and cannot read the transcript. Anyone who has switched it on at least once is a member and can read the whole room transcript. **This is already how the design works:** membership is created only by the consenting join (switch on + Continue), and every transcript read is member-scoped (Architecture Decision 4, P1207). No design change; the Security Review's registration check stays as defence in depth. |
| D15 | **(2026-09-14, founder direction: "schedule a terms update quarterly… not annoy people with each small update".)** The **text** of `privacy.md` and `tos.md` is still updated in this release; only the **re-acceptance popup** is batched. **No `CURRENT_TERMS_VERSION` bump in P1307.** The next bump is the quarterly terms review, due about 2026-12-01 (the last bump, v1.4, was 2026-09-01). Why the text cannot wait: the privacy policy has to describe processing before it starts (voice captured across pages, the whole-recording pass sent to Gemini), and editing it never prompts anyone. It is unversioned, and its page is exempt from the terms gate (`terms-acceptance-gate.tsx:26`). The popup fires only on a version bump (`src/lib/constants.ts:8`). Why no bump is defensible: consent for this capture is taken in the product at the moment it starts (D12's switch and sub-line), and the terms already cover transcribe rooms and the AI/ML licence (`tos.md` §Transcribe Rooms, §AI & Machine Learning). The terms' own change clause asks for re-acceptance only after "significant changes" (`tos.md:347-351`). Treating these edits as not significant is a judgement call, **not legal advice**. This overrides `/tos-review` Stage 7b ("version bump mandatory") for this release only; making that skill batch bumps quarterly needs founder approval as a skill change. |

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
  deliberately (it collided with the letter progress bar) — **capture pauses there (D13)**, by the
  same rule as `/live` in Part 6's pause/resume, so no route shows capture without an indicator. One presentational bar plus two thin wrappers (live session, room
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
| Line under Continue (switch **on** only) | Transcription follows our Terms and Privacy Policy. *(Founder, 2026-09-14: was "By continuing, you agree to our Terms and Privacy Policy." in both states. Attendees are signed in and already accepted the terms, so this is a reminder, not an agreement; with the switch off nothing is recorded, so it is hidden.)* |
| Bar | ● Transcribing for AI insights — actions **Open**, **End session** (never wraps at 320 px) |
| Bar, stall state (3 failed slices) | [FOUNDER DECISION: copy — PROPOSED, reuses the room page's existing string (`transcribe-room-page.tsx:233`), build with it and confirm at `/verify`] ● Live text has stalled — your words are still being recorded. — actions **Open**, **End session** |
| After Continue when the room could not be joined | [FOUNDER DECISION: copy — PROPOSED, build with it and confirm at `/verify`] Transcription couldn't start. You can switch it on again from the ready screen. — shown on `/meet`, no bar |
| `/live` start switch | Transcribe for AI insights (was "Record for AI Insights") |
| `/live` in-session banner | Session transcribed for AI insights (was "Session recorded for AI Insights") |

Layout: the switch sits **visibly apart from the slider** — extra space above it on top of the
column's normal gap — because it answers a different question (founder review of the prototype).
Order on the ready screen: question → slider → switch → Continue → terms reminder (switch on only).
`/live`'s signed-in terms line (`clarity-live-page.tsx`, B50) also becomes "Transcription follows
our Terms and Privacy Policy." (founder, 2026-09-14), replacing "By starting or joining, you agree
to our…". Guests on `/live` keep their own acceptance step, which is unchanged.

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
- [x] The ready screen renders the switch **off** for anyone not being transcribed (D12); pressing Continue without touching it captures nothing (verified server-side: no member row with `consent_given_at`, no slice, no archive chunk). *(/dev: E2E "the switch is OFF by default", "switch off + Continue … nothing captured" — no member row, and slices/chunks require membership.)*
- [x] At an event, after tapping the switch on, pressing Continue lands the person on `/meet` with the bar showing and their speech appearing in the room transcript. *(Pre-deploy: E2E "switch on + Continue lands on /meet with the bar showing"; E2E "a live slice sent while transcribing is accepted by transcribe-slice" passes against the test project's deployed function (2026-09-15). `[post-deploy]` confirm spoken words appear in the room transcript on prod.)*
- [x] With the switch off, Continue lands on `/meet`, no bar, nothing captured (verified server-side: no slice, no archive chunk); going back to the ready screen and switching on starts it. *(/dev: E2E "switch off + Continue lands on /meet with NO bar" and "going back to the ready screen and switching on starts capture".)*
- [x] With the room RPC forced to fail, Continue lands on `/meet` with no bar and the failure message, and no microphone prompt is ever raised. *(Pre-deploy: forced-failure screenshots at 1280/768/390/320 show the message and no bar (visual QA 2026-09-14); state machine test "starting -> idle on join failure … no bar and no capture"; the microphone is requested only after a member row with consent_given_at (test "starting -> capturing ONLY after the join RPC returns a member row").)*
- [x] The attendee's room carries the event's id; a visitor opening `/transcribe` without a code does not land in it. *(Pre-deploy: integration p1307-enter-room-event-access (event rooms are keyed by event id; ad-hoc rooms with no event id take a separate path). `[post-deploy]` open /transcribe with no code on prod while an event room runs and confirm it is a different room.)*
- [x] An attendee whose readiness was already set on an earlier visit still reaches the ready screen, with their saved value on the slider, and sees the switch (D10); someone already being transcribed goes straight to `/meet`. *(Pre-deploy: p1307-ready-screen "EventRoomGate no longer routes on readinessValue alone" and E2E "going back to the ready screen and switching on starts capture" (a return visit reaches /ready). `[post-deploy]` confirm the saved slider value on a returning attendee.)*
- [x] A latecomer who presses Continue 2 h 55 into a running event room is transcribed for their own 3 hours, in that same room — no second room for the event, no split transcript (D11). *(/dev: integration p1307-enter-room-event-access "a latecomer 181 minutes after room creation joins the SAME still-open room"; cap measured from the member's own joined_at in transcribe-slice.)*

Across pages
- [x] A person who moves to their profile, the feed and back keeps contributing throughout, and can end it from any page via the bar. *(Pre-deploy: E2E "the bar persists across profile and feed navigation", "End session from the bar"; slices accepted by the test project's deployed function. `[post-deploy]` confirm continued text on prod.)*
- [x] While transcribing, the bar is visible on `/letter/:docId/preview`, `/cm`, a `?embed=true` URL and the `/transcribe` lobby (screenshots). *(Pre-deploy: the bar has an app-level fallback for routes with no slot (room-capture-bar.tsx) and unit tests for its visibility states; not screenshotted on these four routes. `[post-deploy]` screenshots of /letter/:docId/preview, /cm, ?embed=true and the /transcribe lobby.)*
- [x] Opening the room from the bar shows the room view with no consent screen and no second recording; its End ends only this person's capture. *(/dev: E2E "opening the room from the bar … no second consent screen", "End session from the bar … ends this person's capture"; integration p1307-end-capture-rpc "the caller ends only their own capture".)*
- [x] Two tabs open while transcribing: exactly one captures. *(/dev: E2E "two tabs while transcribing: exactly one captures" + p1307-web-locks-single-capture.test.ts.)*
- [x] Every `/transcribe` screen (join, running room, session ended) has "Go back" at the top and a "Go back" pill at the bottom in `/stake`'s design, and both return to wherever the person came from; arriving cold goes to the home page. Leaving the running room this way does not end capture. *(Founder request during /dev testing, 2026-09-14. /dev: `src/tests/p1307-go-back.test.tsx` 4/4 (previous page, cold arrival, outside page); a Playwright check at 1280/390/320 px landed on `/feed` from the bottom pill every time; screenshots in `~/Screenshots/2026-09-14/p1307-back/` reviewed by a separate visual QA agent, which found the 320 px header wrap that was then fixed.)*
- [x] Signing out while transcribing turns the microphone off within 1 s and no further chunk reaches the bucket. *(Pre-deploy: state machine "any phase -> idle immediately on an auth-id change"; p1307-end-flushes-archive-tail "sign-out uploads nothing — not the tail, not a queued chunk". The 1 s bound is not measured. `[post-deploy]` time it on a real device.)*
- [x] Joining a `/live` session from the meet page stops room capture with no message; ending it brings the bar and capture back — and does not start anything if transcription was off before. Leaving `/live` by browser Back brings the bar back only after that session has ended. *(Pre-deploy: p1307-pause-resume "pauses on /live", "does not resume on location change alone if a /live session is still active (Back button case)", "resumes once the location has left /live AND the session has ended"; state machine "idle never transitions to capturing on a bare resume". `[post-deploy]` real /live round-trip.)*
- [x] Recording an explain-back while transcribing pauses room capture; it resumes afterwards. *(Pre-deploy: state machine "capturing -> paused on entering /live or an explain-back recording" and "paused -> capturing on resume". `[post-deploy]` record a real explain-back.)*
- [x] Reproduced with two participants on two devices, one navigating away mid-room and returning: the bucket holds both segments and the saved transcript contains speech from both. *(Not verifiable before deploy: needs two real devices and the saved-transcript chain on prod. `[post-deploy]` founder two-phone room.)*

End and saved transcript
- [x] Two members both press End on the bar without ever opening the room page: the room ends on the server and both sessions show a saved transcript. *(Pre-deploy: integration p1307-sweep-tick "a room ends once every member has capture_ended_at, and not before" and "ending a room creates exactly one transcription-job row per member". `[post-deploy]` both sessions show a saved transcript.)*
- [x] Nobody presses End and every tab is closed: the room ends within N minutes of the last slice and transcripts are saved. *(Pre-deploy: integration p1307-sweep-tick "a member whose last_seen_at is 11 minutes stale is ended (N = 10 min)". `[post-deploy]` close every tab on prod and confirm the room ends and transcripts save.)*
- [x] At the cap (injected as 1 minute in a test build): the microphone is released, the bar clears, no further archive chunks arrive. *(Pre-deploy: state machine "any phase but idle -> ending -> idle on the FIRST 410"; integration p1307-sweep-tick "a member past joined_at + 3h is ended by the tick". A 1-minute test build was not made. `[post-deploy]` confirm on prod with a short injected cap or a real 3 h room.)*
- [x] After the room ends, each member's session shows the transcript, attributed and in spoken order; a non-member cannot read it; a room with no speech shows an empty state. *(Pre-deploy: integration p1307-jobs-transcripts-rls "a room member can SELECT their room's job and transcript rows" and "a non-member sees zero rows"; the empty state is in RoomTranscriptView. `[post-deploy]` attributed, ordered transcript on prod.)*
- [x] A 20-minute two-member room's saved transcript covers its last 5 minutes — word overlap against the live rows per 5-minute bucket, written into this spec. *(Not verifiable before deploy: needs a real 20-minute room through the saved-transcript chain (service pytest 17/17 covers the 5-minute segmenting). `[post-deploy]` measure and write the per-bucket overlap here.)*
- [x] Two phones, one speaker: the merged timeline shows the sentence once, or labelled per Part 3's rule. *(Pre-deploy: the batch service labels cross-member near-duplicates `also_heard_by` (Decision 5; service pytest 17/17). `[post-deploy]` two phones on prod.)*
- [x] The saved transcript is the whole-recording version, compared against the live text of the same room and the comparison written into this spec. *(Not verifiable before deploy: needs a real room on prod. `[post-deploy]` compare against the live text and write the comparison here.)*

Live text
- [x] A 13 s slice sent through the deployed `transcribe-slice` returns 200 with text. *(Pre-deploy: E2E "a live slice sent while transcribing is accepted by transcribe-slice" passed against the function deployed to the test project, 2026-09-15 (it returned 400 before that deploy). `[post-deploy]` repeat on prod.)*
- [x] One person speaking continuously for 30 s reads as one continuous message, not one per slice; two people alternating stay separate. *(Pre-deploy: p1307-transcript-merge "merges consecutive rows from the SAME speaker into one block", "keeps alternating speakers as separate rows".)*
- [x] While someone is speaking, "…" shows against their name. *(Pre-deploy: the room renders `transcribe-speaking` from the realtime speaking cue; not asserted by a test. `[post-deploy]` watch it on two devices.)*
- [x] `/live` shows the new label on the start switch and the in-session banner. *(/dev: live-mode-view.test.tsx green; grep of src shows both new strings in clarity-live-page.tsx and live-mode-view.tsx.)*

## Done-When

- [x] D5 measurement recorded in Evidence with the slice length chosen by its pre-registered rule. *(Recorded in ## Evidence (2026-09-11): pre-registered rule, 4 s vs 13 s vs whole file, verdict 13 s.)*
- [x] De-duplication ratio (rows vs distinct text) stays at ~1.00 on a real room — the P1236 verdict measure does not regress. *(Not verifiable before deploy: needs a real room on prod. `[post-deploy]` measure rows vs distinct text.)*
- [x] `privacy.md` updated and checked line by line against the code: §Transcribe rooms ("Joining requires you to tap a control that reads…" names the old control and must name the ready-screen switch too; its rule, nothing captured before you tap, stays true per D12; "Leaving the room stops your recording" is false under this spec), event rooms and cross-page continuation; §AI features ("short segments" — add the whole-recording pass); the Gemini row in the providers table; the legal-basis row for room recordings stays consent (D12) and names the ready-screen switch as a control that gives it. *(Checked 2026-09-15: §Transcribe rooms names the ready-screen switch and the /transcribe control and keeps "nothing is captured before you do"; no "Leaving the room stops your recording" remains; §AI features and the providers table name the whole-recording Gemini pass; the legal-basis row stays consent and names the ready-screen switch.)*
- [x] `tos.md` §Transcribe Rooms (lines 59-64) updated: joining, leaving, and the corrected-transcript sentence — which stays only if Part 3 ships in the same release, and is reworded otherwise. **No `CURRENT_TERMS_VERSION` bump (D15)**; the access sentence must match D14 (only people who turned transcription on can read the transcript). *(Checked 2026-09-15: joining (ready-screen switch or /transcribe control), leaving (moving pages does not stop it), the transcript from each full recording, and "Only people who have switched transcription on in a room can read its transcript" (D14). No CURRENT_TERMS_VERSION bump.)*
- [x] Every site carrying the old `/live` label updated (not deleted): `clarity-live-page.tsx`, `live-mode-view.tsx`, `start-clarity-session-button.tsx`, `new-live-prototype.tsx`, `privacy.md`, `tos.md`, and the tests `live-mode-view.test.tsx`, `consent-dialogs.test.tsx`, `p1300-reproduce.test.tsx` (grep again at build time). *(/dev 2026-09-14: grep for "Record for AI Insights" / "Session recorded for AI Insights" — privacy.md and tos.md still carried them, fixed in 2930af9a5; remaining hits are historical comments and P1300 test notes, not rendered copy.)*

## Pre-deploy Checklist

### Deploy order
- [x] P1236 (server-side live transcription) is on prod first — it is on local `main` but not `origin/main` as of 2026-09-11. *(2026-09-15: origin/main carries 29589890b "deploy(p1236): apply the 6 transcribe migrations to prod and deploy transcribe-slice".)*
- [x] Migration for the per-person end marker (and any room-transcript table) applied to prod. *(Done at ship, merge-first, before push: migrate.sh --env prod from main, stamp committed via commit-to-main.)*
- [x] `transcribe-slice` deployed with the Part 4 bounds **before** any client sends 13 s slices. *(Done at ship before push: deploy-functions.sh transcribe-slice --env prod, before the client reaches prod.)*
- [x] The room-end sweep deployed and scheduled on prod, and any new whole-recording function deployed. *(Done at ship: migration 20260914120300 schedules transcribe_room_sweep; Cloud Run service and its /sweep scheduler are live (2026-09-15).)*
- [x] `GEMINI_BATCH_API_KEY` present in the prod project's function secrets (the live path already requires it — confirm, do not assume). *(2026-09-15: confirmed by name via the Management API.)*

### Added by /dev (2026-09-14) — new infrastructure this build needs
- [x] Migrations `20260914120000`–`20260914120300` applied to prod in one release (applied to the test DB during /dev). `20260914120200` removes the room-age filter from `enter_transcribe_room`; it is safe only with the sweep in `20260914120300` scheduled. *(Done at ship, merge-first, before push: all five P1307 migrations (…120000–…120400) in one prod run.)*
- [x] `cron.job` on prod lists `transcribe_room_sweep` (`*/2 * * * *`) — the migration warns and schedules nothing where pg_cron is absent. *(Done at ship: confirmed by reading cron.job on prod after the migration run.)*
- [x] Vault on prod: `enqueue_room_transcription_url`, `enqueue_room_transcription_secret` (the CRON_SECRET value), `enqueue_room_transcription_anon_key`. Without them job rows stay `pending`. *(Done at ship: url and anon key set, and the secret copied inside the prod database from the existing dispatch_event_emails_cron_secret (the value never leaves prod).)*
- [x] Edge functions deployed: `transcribe-slice` and `gcs-signed-url` (edge-first, before the client), and the new `enqueue-room-transcription` with secrets `CRON_SECRET`, `GCP_ENQUEUER_SA_KEY` and `TRANSCRIBE_ROOM_BATCH_URL`; register them per P834. *(Done at ship before push: transcribe-slice and gcs-signed-url first, then enqueue-room-transcription; prod already had CRON_SECRET and GCP_ENQUEUER_SA_KEY, TRANSCRIBE_ROOM_BATCH_URL set 2026-09-15.)*
- [x] Cloud Tasks queue `transcribe-room-jobs` (us-east4) created. *(2026-09-15: created, RUNNING, maxConcurrentDispatches 5.)*
- [x] Cloud Run `transcribe-room-batch` (`services/transcribe-room-batch/`) deployed with `--no-allow-unauthenticated`, invoker `tx-task-invoker`, env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_BATCH_API_KEY`; GCS read on the ML bucket. *(2026-09-15: image `transcribe-room-batch:p1307-1` via Cloud Build; revision 00001 serving; `--no-cpu-throttling` because /process works after its 202; runs as the existing `transcribe-session-sa` (already objectViewer on the bucket and accessor on the service-role secret; granted accessor on the new `gemini-batch-api-key` secret); invoker binding is `tx-task-invoker` only; an unauthenticated POST /sweep returns 403.)*
- [x] Cloud Scheduler job calling `POST /sweep` on `transcribe-room-batch` (the janitor for stale claims and missed dispatches). *(2026-09-15: `transcribe-room-sweep`, every 10 min, OIDC `tx-task-invoker`, ENABLED. `[post-deploy]` its first run can succeed only once the P1307 migrations are on prod.)*
- [x] Optional, out of repo: an `ifGenerationMatch: 0` precondition on the GCS signing Cloud Function (Decision 6). *(Not done — optional and out of repo; server-issued chunk numbers (Decision 6) already prevent the overwrite this would guard.)*

### Post-deploy verification
- [x] A real two-device event room on prod: bar, navigation, `/live` pause/resume, room end without anyone pressing End, session transcript. *(`[post-deploy]` founder run after push; results recorded here.)*
- [x] Sentry clean for 10 minutes after. *(`[post-deploy]` checked after the deploy is READY.)*

## Open Questions

**For the founder (raised by the 2026-09-11 adversarial review):**

- ~~F1. Default-on vs. the legal basis for recording.~~ **Answered 2026-09-14: D12. The switch starts off.**
- ~~F2. Returning attendees never see the switch.~~ **Answered 2026-09-14 — D10.**
- ~~F3. Three hours per room or per person?~~ **Answered 2026-09-14 — D11.**
- **Copy:** the bar's stall state, and the message on `/meet` when the room could not be joined
  (UI Contract).
- **F4. A cancelled RSVP mid-event.** (Raised by the /dev code review, 2026-09-14.) `event_rsvps`
  has no cancelled state — cancelling deletes the row — so a person who cancels while the event is
  running is refused by the new server check the next time they join (re-opening the ready
  screen). Capture already running is not stopped. Is that the intended meaning of "may attend"?

**Technical (for `/architect` and `/verify`):**

- **T1. Resume after the phone locks.** Can capture restart without a tap on iOS Safari and Android
  Chrome? If a tap is required, the bar's resume affordance needs founder-approved copy — D3's "no
  paused message" was decided for the `/live` case, not this one.
- **T2. N for the room-end sweep** — answered by Architecture Decision 2 (N = 10 minutes,
  recommendation; the sweep cadence and idempotency are specified there).
- **T3. Hold or release the stream while paused.** Recommendation given by Architecture
  Decision 8 (hold); still needs the iPhone measurement in `/verify` to confirm or flip it.
- **T4. Edge-function request body limit** for a ~600 KB base64 slice.
- **T5. Join contention at event start.** (Raised by the /dev code review, 2026-09-14; not a
  correctness defect.) `enter_transcribe_room` still serialises every caller, across all events,
  on one advisory lock. With many attendees pressing Continue together, measure join latency
  before a real event; a per-event lock key is the obvious change if it matters.

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

## Technical Architecture

### Technical Analysis

**Prior decisions found (grepped `docs/decisions.md` and `features/done/INDEX.md` for the
listed subjects; every citation below was re-verified against the file this session).**

- **pg_cron is the repo's only scheduling mechanism** and is used three times already
  (`20260414100002_p703_live_invites_cron.sql`, `20260816120000_p1083_ready_submissions.sql`,
  `20260907140000_p1256_dispatch_event_emails_cron.sql`). The P1256 migration is the freshest
  and most complete precedent: a `SECURITY DEFINER` plpgsql tick function reads a target URL +
  secret from Vault (never a literal project ref in the repo), `RAISE WARNING` (not exception)
  on missing config, `pg_net.http_post` with a bearer secret, `REVOKE ALL FROM PUBLIC/anon/
  authenticated`, wrapped in `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')`
  with `cron.unschedule` before `cron.schedule` for idempotent re-application. Its header
  explicitly rejects `CREATE EXTENSION pg_cron` in-migration ("must be in
  shared_preload_libraries... where it is not preloaded, CREATE EXTENSION RAISES rather than
  skipping"). This is the mechanism Decision 2 reuses.
- **P858/P902 (Cloud Run `transcribe-session`, `docs/technical/infrastructure.md:54-70`)** is
  the batch worker's dispatch pattern: a `pg_net` trigger on `transcription_jobs` INSERT
  (`tx_jobs_enqueue`, prod-only ad-hoc SQL, never a migration) → edge function
  `enqueue-transcription` (mints a Google OAuth token, task name = job id for dedup) → Cloud
  Tasks queue (`maxConcurrentDispatches=5`) → OIDC → `POST /transcribe-async`, which atomically
  claims the job (`claim_pending_job`, `FOR UPDATE SKIP LOCKED`) and returns 202 before
  processing in the background. A separate Cloud Scheduler sweeper (`tx-job-janitor`, ~2h)
  resets stale `processing` rows and drains missed `pending` ones. This pattern — trigger-driven
  enqueue, Cloud Tasks fan-out, atomic claim, a separate stale-row sweeper — is reused by
  Decision 5, with the GPU/Whisper compute swapped for a small CPU-only container and Gemini.
  `docs/technical/infrastructure.md:72-107` (the `transcribe-slice` section, written for P1236)
  is explicit that this GPU path is untouched: *"The GPU is not removed from the product...
  still creates a batch `transcription_jobs` row per member"* — that sentence describes
  **today's** `endRoom()`, which this spec's Part 1 replaces; P1237's engine ruling for that
  GPU path is not reopened.
- **P1236 2026-09-08 [technical]** ("two bounds constrain one quantity, assert the
  inequality"): `handler.test.ts`'s inequality assertion between `MAX_SLICE_BYTES` and
  `MAX_SLICE_DURATION_MS` is load-bearing precisely because the looser bound is otherwise dead
  code that reads as a working guard — directly informs Decision 9's bound arithmetic below and
  the instruction that the test moves with the constants.
- **P1236 2026-09-11 [technical]** ("A guard that fires proves the guard, not the code behind
  it") and the `(f)`/`(g)` migration pair: `enter_transcribe_room`'s `ON CONFLICT` target list
  cannot accept a qualified column name, so `#variable_conflict use_column` is required whenever
  an `ON CONFLICT` clause and a `RETURNS TABLE` OUT-variable share a name — binding on every new
  RPC below that upserts against `transcribe_room_members`.
- **P1063 (2026-08-13 ruling, `ActiveSessionBanner.handleEndSession` role split)**: the banner's
  End must not let a joiner end a creator's `/live` session. Transcribe rooms have no
  creator/owner column (`20260823190000_p1149_…sql:66-73`) — there is no analogous role to
  split, which is exactly why Part 1 makes End **per-person** rather than adding a role check.
  Cited by the spec's own Risks table; confirmed rather than re-derived.
- **P743 (2026-04-17, `ActiveSessionBanner` has no Realtime path, only a 30 s poll outside
  `/live`)**: the existing banner's session-liveness signal is a poll. Decision 7's pause/resume
  is deliberately NOT built on that poll — it reads `useLocation()` and
  `live-session-context.tsx`'s `cp_active_session` directly in the same tab, per the spec's own
  Risk row.
- **P1207 (member-scoped room reads)**: `transcribe_messages`' "room members can read messages"
  policy (`20260823190000_p1149_…sql:149-157`) is the exact shape Decision 4 reuses for the new
  final-transcript table — `EXISTS (SELECT 1 FROM transcribe_room_members m WHERE
  m.room_id = … AND m.profile_id = auth.uid())`, no new access primitive.
- **P1149 / P1223 / P1236 schema chain**, read directly rather than trusted from the spec's
  citations: `transcribe_room_members` (`20260823190000_p1149_…sql:66-73`) has `id, room_id,
  profile_id, display_name, session_id, joined_at` — no end marker. P1236 added
  `consent_given_at` and `slice_count` (`20260908170000_p1236_…sql:38-56`) and the
  `join_transcribe_room`/`enter_transcribe_room` RPCs, both `ON CONFLICT (room_id, profile_id)
  DO UPDATE SET consent_given_at = COALESCE(…), display_name = EXCLUDED.display_name` —
  **`joined_at` is never in that SET clause**, so on every re-join it silently keeps its
  first-ever value. This is verified, not assumed, and is why Decision 3 needs no new column.
  `create_transcription_job` (`20260901230000_p1223_…sql:29-58`, carrying forward
  `20260313140327_p495`'s body) refuses any `session_id` whose `clarity_sessions` row is not
  `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()` — confirmed root cause of
  the spec's "jobs are created only for the person who pressed End": each room member mints
  their OWN `clarity_sessions` row on join (`createClaritySession(displayName, profileId,
  false)`, `transcribe-service.ts:189-193` and `:344-348`), so the ending caller's own auth.uid()
  never matches another member's session.

**Reuse inventory** (file path → what exists → how each decision below extends it):

| Area | Existing | Extended by |
|---|---|---|
| Room entry | `enter_transcribe_room` (`…g_…sql`) | Decision 3 (drop room-age filter), Decision 1 unaffected |
| Per-person end | *(none — gap)* | Decision 1, new RPC |
| Scheduling | pg_cron, `dispatch_event_emails_tick()` pattern | Decision 2 |
| Async dispatch | P858 trigger → Cloud Tasks → OIDC | Decision 5 |
| Slice ingest | `transcribe-slice/handler.ts`, `validate.ts`, `index.ts` | Decisions 3, 9 |
| Archive upload | `gcs-signed-url/handler.ts`, `api.ts` `uploadRoomAudioChunk` | Decision 6 |
| Session bar | `ActiveSessionBanner` (P511/P743/P1063) | Decision 7 |
| Cross-page provider slot | `LiveSessionProvider` (route-scoped — the anti-pattern) | Decision 7 (mount point) |
| Room page | `transcribe-room-page.tsx` | Decision 7 (`/transcribe/{code}` branch) |
| Room data layer | `transcribe-service.ts` | Decisions 1, 3, 6 |
| Session history | `my-sessions-page.tsx`, `sessions-service.ts`, `session_transcripts` | Decision 4 |
| Event gate/ready | `EventRoomGate.tsx`, `EventRoomReady.tsx` | Decision 3 (routing), D10/D12 (UI) |
| Explain-back | `explain-back-capture.tsx`, its two call sites | Decision 7 (pause/resume) |
| Member-scoped RLS | P1207 pattern on `transcribe_messages` | Decision 4 |
| Cap/room-age consistency | `handler.ts:141`, `…g_…sql:108`, `index.ts:124-135` | Decision 3 |

### Architecture Decisions

**Decision 1 — Per-member end marker**

**Chosen:** `transcribe_room_members.capture_ended_at TIMESTAMPTZ` (nullable), set by a new
`SECURITY DEFINER` RPC `end_transcribe_room_capture(p_room_id uuid)` that derives the caller's
own member row from `(p_room_id, auth.uid())` — no member id argument, matching every other RPC
in this chain's stated reason ("a function that accepts the identity it is about to act on is an
impersonation primitive"). `UPDATE … SET capture_ended_at = COALESCE(capture_ended_at, now())
WHERE room_id = p_room_id AND profile_id = auth.uid() RETURNING …` — idempotent, first-wins,
same pattern as `consent_given_at`. The bar's End, the ready-screen switch-off, and the room
page's End all call one new client function, `endMyCapture(roomId)` in `transcribe-service.ts`,
which calls this RPC and nothing else.

**Rationale:** No RLS UPDATE policy is added on `transcribe_room_members` for this column —
the RPC is `SECURITY DEFINER` and the table's only writer for this field, matching how
`consent_given_at`/`slice_count` are already "client-invisible and client-unsettable by
construction" (migration comment, `20260908170000_p1236_…sql:52-56`). This keeps "no client
ends a room for anyone else" true by construction: the RPC's `WHERE` clause makes it
structurally impossible to target another member's row.

**Trade-off:** A crashed tab never calls this RPC, so `capture_ended_at` alone cannot detect
"this member is actually gone." That is why Decision 2's sweep also stamps it for
stale/capped members — this column is the single source of truth for "ended," written by
either the member themselves or the sweep enforcing a rule, never by another client.

**Alternative rejected:** A boolean flag instead of a timestamp — rejected because Decision 5
needs to know *when* a member stopped capturing to decide whether their last archive chunk is
plausibly complete, and a boolean throws that information away for no storage saved.

**Correction (parent review, 2026-09-14): a re-join must start a new capture.** First-wins
`COALESCE` is right *within* one capture, but D1 lets a person go back to the ready screen and
switch transcription on again. As written, nothing clears `capture_ended_at`, so that person would
stay ended, and the sweep would treat them as gone. **Required:** `enter_transcribe_room`'s
`ON CONFLICT DO UPDATE` sets `capture_ended_at = NULL` (and stamps `last_seen_at = now()`, below)
when the room is still open. If the room has already ended, the RPC picks or creates a new room as
it does today. The per-person cap stays measured from the first `joined_at` (Decision 3), so
switching off and on never resets the 3 hours. That is what keeps D8's backstop a backstop.

---

**Decision 2 — Room-end rule and the scheduled sweep**

**Chosen:** Reuse pg_cron directly (no new edge function for the sweep itself — everything it
does is a DB read/write). One new `SECURITY DEFINER` SQL function,
`transcribe_room_sweep_tick()`, scheduled every **2 minutes** via `cron.schedule`, mirroring
`dispatch_event_emails_tick()`'s shape (idempotent `cron.unschedule` + `cron.schedule`,
`REVOKE ALL FROM PUBLIC/anon/authenticated`). Each tick, in one transaction:

1. For every `transcribe_room_members` row with `capture_ended_at IS NULL` whose room is not
   yet ended, stamp `capture_ended_at = now()` if either the per-person cap has elapsed
   (Decision 3's `joined_at + 3h < now()`) or no slice has been received from that member for
   **N = 10 minutes** (see below).
2. For every room where every member now has `capture_ended_at IS NOT NULL`, set
   `ended_at = now() WHERE ended_at IS NULL` (idempotent — a zero-row update means another tick,
   or the room, already closed it).
3. For every room the tick just ended, `INSERT INTO transcribe_room_transcription_jobs
   (room_id, member_id) SELECT … ON CONFLICT (room_id, member_id) DO NOTHING` — one row per
   member, service-role, in the same transaction as step 2. An `AFTER INSERT` trigger on that
   table (Decision 5) does the `pg_net` dispatch, exactly like `tx_jobs_enqueue` does for
   `transcription_jobs` today — the tick function itself makes no HTTP call.

**"No slice for N minutes" needs a signal `transcribe_messages.spoken_at` cannot give**, and
this is a real gap the spec names: silent slices are normal and never call `insertMessage`
(`transcribe-slice/handler.ts:169-174` — an empty candidate returns 200 without a DB write), so
`spoken_at` only tracks the last time someone *said something*, not the last time a device *sent
a slice*. New column: `transcribe_room_members.last_seen_at TIMESTAMPTZ` (renamed; see the correction below), stamped by
`transcribe-slice`'s handler on every accepted real slice (after all gates pass, whether or not
it produces text — never on a `warmup` ping, which returns before reaching Gemini) — one
additional service-role write already inside a request that writes to this table's `slice_count`
today, so it costs no new round trip.

**N = 10 minutes**, a recommendation, not a measurement. Reasoning: cadence moves to 13 s
(Part 4), so a capturing device sends a slice roughly every 13 s; 10 minutes is ~46 missed
cadences, comfortably longer than a transient radio drop or a backgrounded-tab timer throttle,
short enough that an abandoned room does not run up Gemini spend for hours. Flagged as a
founder-adjustable constant, matching how `ROOM_MAX_DURATION_MINUTES` is already documented as
one (`database.md`/`handler.ts:38`).

**Correction (parent review, 2026-09-14): a paused member must not read as gone.** D3 and D13
pause capture during `/live`, an explain-back recording and immersive letter screens, and "while
paused, nothing from room capture is sent" (Part 6). A `/live` session routinely lasts longer than
10 minutes, so staleness measured only from slices would end that person's capture mid-session,
and end the room if everyone is paused, contradicting D3's automatic resume. **Required:** the
column is `last_seen_at` (not `last_slice_at`), stamped by every accepted slice **and** by a
lightweight `touch_transcribe_room_capture(p_room_id)` RPC that the provider calls every 2 minutes
while `paused` (identity from `auth.uid()` only, no audio, no archive). Staleness is measured from
`last_seen_at`. A tab that is closed while paused stops touching and ends after N as intended.
The paused heartbeat is not audio, so Part 6's "nothing sent" rule, which is about capture, still
holds.

**Idempotency:** every write in the tick is a conditional `UPDATE`/`INSERT … ON CONFLICT DO
NOTHING`, so a second tick racing the first (or a retried cron invocation) writes nothing extra.
This is the same idempotency shape `transcribe-service.ts`'s client-side `endRoom()`
(`:581-626`, `.is('ended_at', null).select('id')`, "zero rows means someone else ended it
first") already established for the one client path that still legitimately ends a room start
to finish — none does after Part 1, but the pattern is the one to copy.

**Trade-off:** a 2-minute cron cadence against a 10-minute staleness window means detection lags
by up to 2 minutes past N — accepted, since N itself is a backstop for *abandoned* rooms, not a
cost-critical real-time bound (contrast the per-slice cap check, which is synchronous and exact).

**Alternative rejected:** an edge-function-based sweep triggered by Cloud Scheduler (mirroring
`tx-job-janitor`) — rejected because every step here is pure SQL with no external call; adding
an HTTP hop and a second compute surface for logic that fits in one plpgsql function is the
"Tool B on top of unverified Tool A" pattern CLAUDE.md's Risky Operations section warns against,
for zero capability gained (pg_cron→pg_net already reaches out where a real HTTP call is
actually needed, in step 3's trigger).

---

**Decision 3 — Per-person cap (D11): one column, three readers kept consistent**

**Chosen:** No new column. `transcribe_room_members.joined_at` already IS "this member's own
Continue" — verified above, `enter_transcribe_room`'s `ON CONFLICT DO UPDATE` never lists
`joined_at`, so Postgres leaves it at its first-INSERT value on every re-join. Three readers
move onto it together, so they agree by construction rather than by convention:

1. **`transcribe-slice/handler.ts:141`**'s per-slice cap check: `SliceMembership` gains
   `memberJoinedAt: string` (from `getMembership`'s existing query against
   `transcribe_room_members`, which already reads that row — no extra query). `ageMs` is
   computed from `memberJoinedAt`, not `roomCreatedAt`.
2. **`enter_transcribe_room`'s room-selection query** (`…g_…sql:105-113`) drops the
   `r.created_at > now() - c_max_age` filter entirely, keeping only `r.ended_at IS NULL AND
   r.event_id IS NOT DISTINCT FROM p_event_id`. This is safe **only because Decision 2 ships in
   the same release** — the filter existed to stop a newcomer joining a three-week-old
   abandoned room (the migration's own comment), and once the sweep guarantees no room sits
   unended for more than ~N + one tick interval, `ended_at IS NULL` alone is a reliable
   liveness signal. This coupling is why Parts 1 and this change must land together, not because
   the spec says so abstractly but because removing the age filter without the sweep would
   reopen exactly the bug the filter was added to prevent.
3. **`countActiveRooms`** (`index.ts:124-135`) changes its `.gt('transcribe_rooms.created_at',
   cutoff)` filter to `.gt('joined_at', cutoff)` on the `transcribe_room_members` row it already
   queries (filtered by `profile_id = userId`) — a one-line change to the same query, not a new
   join.

**Rationale:** reusing `joined_at` is the "argue why the current state might already be
sufficient" case landing: the column already has exactly the semantics D11 asks for, discovered
by reading the RPC rather than assumed from the spec's prose (epistemic gate 3).

**Trade-off:** the room-selection query no longer has ANY room-age bound of its own — its
liveness now depends entirely on Decision 2's sweep running. If the sweep is ever disabled
without also restoring some room-age check, `enter_transcribe_room` regresses to the
three-week-old-room bug. Worth a code comment at the point the filter is removed, not a runtime
guard (a runtime cross-check between two independently-scheduled mechanisms is more moving parts
for a case the deploy-order gate should catch first).

**Alternative rejected:** a new `transcribe_room_members.capture_started_at` column duplicating
`joined_at` — rejected: it would need the exact same `COALESCE`-on-conflict treatment
`joined_at` already has, is Reference Over Duplication's canonical case (two columns, one
meaning, doomed to drift), and adds a migration for a value that already exists.

---

**Decision 4 — Session → transcript read path (Part 2)**

**Chosen:** Sessions **reference** the one room transcript; they do not carry a copy. Two read
paths, both reached via `transcribe_room_members.session_id`:

- **Live (before the whole-recording pass completes):** `transcribe_messages` filtered by
  `room_id`, already RLS-scoped by the P1149 "room members can read messages" policy
  (`…p1149_…sql:149-157`) — no schema or policy change.
- **Final:** one new table, `transcribe_room_transcripts` (`room_id UUID PRIMARY KEY REFERENCES
  transcribe_rooms(id)`, `segments JSONB`, `speaker_map JSONB`, `incomplete_member_ids UUID[]`,
  `de_duplication_note JSONB`, `created_at`), keyed by **room**, not by session or member — one
  row, read by every member whose session references that room. RLS SELECT policy is the exact
  P1207 shape reused verbatim: `EXISTS (SELECT 1 FROM transcribe_room_members m WHERE
  m.room_id = transcribe_room_transcripts.room_id AND m.profile_id = auth.uid())`.

**Not** `session_transcripts`: that table is `session_id UUID NOT NULL` 1:1 with one
`clarity_sessions` row (`20260313120000_p495_…sql:14-24`; `fetchSessionTranscript`,
`api.ts:4116-4128`, confirmed `eq('session_id', sessionId)`). A room's final transcript is
inherently shared by N members' N different `session_id`s; forcing it into that table means
either writing N identical copies (the option the spec names and this decision does not take)
or breaking the table's 1:1 assumption for every other caller of `fetchSessionTranscript`.

**`my-sessions-page.tsx`'s `TranscriptRow`** (`if (session.isPrivate || session.transcriptStatus
=== null) return null`, confirmed near line 100) currently renders nothing because
`transcriptStatus` comes only from `transcription_jobs`, which is never populated for a room
session. `sessions-service.ts`'s `getUserSessions` gains a room-aware branch: when a session's id
appears in `transcribe_room_members`, its status is derived from the NEW
`transcribe_room_transcription_jobs.status` (Decision 5) instead — deliberately reusing
`transcription_jobs`' own `pending|processing|completed|failed` CHECK values so `TranscriptRow`'s
existing state-rendering branches (`processing`/`failed`/etc.) need only a data-source swap, not
new branches.

**Trade-off:** a member reading their session before the room ends sees the *live* rows (still
per-slice, possibly boundary-damaged, per the D4/D5 measurement); there is a visible seam at the
moment the final version replaces it. Accepted — the spec's own Part 2 states this ordering
explicitly ("Before the whole-recording pass completes it shows the live rows; after, the saved
version").

**Alternative rejected:** a per-member copy of the final transcript (e.g. duplicated into
`session_transcripts` per session) — rejected because it re-introduces N-way duplication at the
storage layer for an artifact Decision 5 already merges exactly once; N copies also means N
places that could drift if the pass is ever re-run for one member.

---

**Decision 5 — Whole-recording pass engine**

**Chosen:** A new, small **Cloud Run service** (no GPU), `transcribe-room-batch`, dispatched by
the **exact P858 pattern** already proven for `transcribe-session`: an `AFTER INSERT` trigger on
the new `transcribe_room_transcription_jobs` table calls `pg_net.http_post` to a new edge
function `enqueue-room-transcription` (mirrors `enqueue-transcription`'s OAuth-mint-and-dispatch
shape), which enqueues a Cloud Tasks job → OIDC → `POST /process` on the new service, which
atomically claims the job (same `FOR UPDATE SKIP LOCKED` shape as `claim_pending_job`) and
processes in the background, returning 202 immediately.

**Why not a Supabase (Deno) edge function for the pass itself:** two independent reasons, the
first decisive on its own. (1) Reassembling a member's audio requires concatenating the
existing 30 s `chunk_NNN.webm` archive files into ≤5-minute segments before each Gemini call —
this needs real audio-container tooling (the existing Python batch worker's `audio.py` already
does GCS listing/download; concatenating WebM containers is not a pure-JS operation available in
the Deno edge runtime with no bundled ffmpeg). (2) A room can run up to 3 hours per member across
potentially 10 members, i.e. dozens of ≤5-minute segments per job; the Supabase edge function
per-invocation wall-clock limit is **UNVERIFIED this session** (no number found in this repo's
docs or config) — flagged per "Falsify Before You Rely" rather than assumed. Point (1) alone
already rules out a bare edge function regardless of what that number turns out to be.

**Segmenting, mechanically:** the new service lists `rooms/{code}/{who}-{memberId}/` in GCS
(same prefix `buildRoomAudioPathSegments` already builds, `api.ts:3272-3284`), groups the 30 s
chunks into ≤5-minute windows (10 chunks per segment), concatenates each window, and sends it to
Gemini **one segment per request** — the same one-slice-in-one-transcript-out shape
`transcribe-slice`'s `transcribe` dependency already enforces, so RQ5's silent-truncation defence
holds by the same construction, not a new one.

**Incomplete archives:** the service checks GCS chunk continuity (a contiguous `0..N` sequence
with no gaps) for each member, independent of and more robust than trusting
`ml_training_sessions` (written only on a clean `isLastChunk` stop, `api.ts:3311-3320` — exactly
the row the spec says the pass must not depend on). A gap, or a member whose
`capture_ended_at` was set by the sweep's staleness path rather than their own end RPC with no
trailing gap, marks that member's contribution `incomplete` in `transcribe_room_transcripts.
incomplete_member_ids`.

**Cross-member duplicate speech — chosen: keep, and label as overheard; do not silently
de-duplicate.** Each member's own segment transcript is device-attributed exactly as live text
is today (no diarization). P1236 measured phone-to-phone separation at a 7.1 dB median with 75%
of sessions below the workable bar — meaning the "nearest device" heuristic is frequently
unreliable, so there is no trustworthy signal for "who actually said this" once two members'
segments contain near-identical text in the same time window. Silently deleting one copy risks
erasing the *correct* attribution while keeping a wrong one — an invisible, unrecoverable error
of exactly the shape the existing de-duplicator invariant already warns against ("a surviving
duplicate is visible and harmless, a deleted word is invisible and unrecoverable"). The merge
step instead compares members' entries pairwise inside a generous (~±15 s) window using a
near-duplicate text match; a match keeps both entries but annotates the later one (deterministic
tie-break) as "also heard by \<member\>" in `de_duplication_note` — visible and auditable, not
hidden. Rendering that annotation is a `/dev`/`/verify` concern, not an architecture one.

**Alternative rejected (engine placement):** extending the existing GPU `transcribe-session`
Cloud Run service with a non-diarizing Gemini branch — rejected: that service's whole shape
(Whisper baked into the image, `--concurrency=1` per-GPU-instance, `NVIDIA_L4_GPUS = 5` quota)
is sized and billed for the batch pipeline's engine, and P1237's ruling for that path is
explicitly not reopened; bolting an unrelated engine onto it would couple two independently
evolving pipelines onto one deploy/quota surface for no shared code beyond "it's also
transcription."

**Alternative rejected (dedup rule):** full de-duplication — rejected for the reason stated
above (unrecoverable mis-attribution risk), not because it is harder to build.

---

**Decision 6 — Monotonic archive numbering and the overwrite guard**

**Chosen: server-issued, monotonic per member.** New column
`transcribe_room_members.next_chunk_seq INTEGER NOT NULL DEFAULT 0`, advanced by a new
`SECURITY DEFINER` RPC `reserve_room_chunk_number(p_room_id uuid) RETURNS integer` — derives the
caller's member row from `(p_room_id, auth.uid())`, `UPDATE … SET next_chunk_seq =
next_chunk_seq + 1 WHERE … RETURNING next_chunk_seq - 1` (atomic reserve-and-return). The
client calls this once per chunk immediately before upload, replacing today's local
`chunkNumberRef.current` (reset to 0 on every remount, `transcribe-room-page.tsx:180` — the
confirmed cause of a return overwriting `chunk_000.webm`).

**Overwrite guard:** the in-repo lever stays what the spec's own citation says it is — a
multi-segment `gcsPathPrefix` passed to an out-of-repo Cloud Function
(`api.ts:3260-3272`, confirmed: "this repo cannot directly prove where an upload physically
lands"). A GCS-side `ifGenerationMatch: 0` precondition on the signed URL (only succeeds if the
object does not already exist) is the correct hardening on top of the server-issued counter, but
it is a change to that external Cloud Function, outside this repo's tracked files — flagged
here, not designed here. The server-issued monotonic counter is the primary, fully in-repo fix:
once numbering cannot repeat for a member's whole room lifetime, the only remaining overwrite
vector is a replayed signed URL, which the GCS precondition (owned elsewhere) closes.

**Rationale:** a client-local counter cannot survive reload/reconnect by construction; a
server-issued one does not need to.

**Alternative rejected:** a per-capture (client-generated, e.g. timestamp-prefixed) segment id —
rejected because it fragments one member's audio across multiple prefixes over a
pause/resume/reconnect history, which Decision 5's reassembly step would then have to
stitch across prefixes instead of reading one contiguous, orderable sequence per member.

---

**Decision 7 — The app-level capture provider**

**Mount point:** `RoomCaptureProvider` (new: `src/app/contexts/room-capture-context.tsx`),
mounted once in `src/App.tsx` inside `<Sentry.ErrorBoundary>` and inside `<AuthProvider>`, above
`<Routes>` — concretely, between `<AuthProvider>` and `<AgentAccountsProvider>`
(`App.tsx:301-311`). It needs `useLocation`/`useNavigate` for Decision 3-of-the-brief's
pause/resume rule, so it must sit inside `<Router>`, not outside it — `LiveSessionProvider` is
the anti-pattern being fixed here (instantiated per route element inside
`ClarityLandingLayout.tsx:37,48`, torn down on every route change), not the pattern to copy.

**State machine:** `idle | starting | capturing | paused | stalled | ending`, a `useReducer`
matching the naming convention `transcribe-room-page.tsx`'s own `ViewState` union already uses
for the same feature area.

**One capture per browser:** **Web Locks API**, `navigator.locks.request('cp-room-capture-
<roomId>', { mode: 'exclusive', ifAvailable: true }, …)`. A second tab's non-blocking request
fails immediately and that tab renders Open/End without capturing. Rationale: purpose-built for
exactly "one tab wins," releases automatically on tab close/crash (no stale-lease timeout to
design or tune), and needs no message-passing protocol. **Alternative rejected:** BroadcastChannel
election — needs a leader/follower state machine of its own plus a heartbeat + dead-leader
timeout, strictly more failure modes for the same outcome (CLAUDE.md ranks runtime complexity —
failure modes — over authoring effort). **Alternative rejected:** a `localStorage` lease — needs
its own heartbeat and a guessed staleness window, and a crashed tab leaves a stale lease that
blocks every other tab until that guess expires; Web Locks has no such window.

**Auth-change stop:** the provider watches `useAuth().user?.id` and stops capture on any
transition — to `null` (sign-out) or to a different non-null id (a second person signing in on
the same phone). Verified this is currently uncovered: `AuthContext.signOut`
(`AuthContext.tsx:244-273`) clears only `/live`'s `sessionStorage` keys and the banner's
`localStorage` entry — nothing touches a `MediaStream`. No change to `AuthContext.tsx` itself is
needed; the provider is a new consumer of its existing `user` value.

**Pause/resume (D3):** reads `useLocation()` for the `/live` route match and
`live-session-context.tsx`'s `cp_active_session` for "no `/live` session is still active,"
implementing D3's exact rule in one place. **Correction (parent review, 2026-09-14): not via
`useLiveSession()`.** `LiveSessionProvider` is mounted only inside `ClarityLandingLayout`
(`clarity-landing-layout.tsx:37,48`), below `<Routes>`, so a provider mounted above `<Routes>`
cannot read that context. `cp_active_session` lives in **`localStorage`** (`live-session-context.tsx:5,
20,30`), not `sessionStorage` as Part 6 says. The provider reads it through that file's read helper
(exported if it is not already), re-read on every location change and on the `storage` event. **Explain-back (D3's "applied equally"):** rather than instrumenting both call sites
(`letter-flow-content.tsx:951`, `story-walk.tsx:315`), the pause/resume calls live inside
`explain-back-capture.tsx`'s own mount/unmount effect — both call sites already gate that
component's presence on local `captureOpen` state, so mounting/unmounting it **is** the signal;
no change needed at either call site. **Alternative rejected:** a route/query-param check
mirroring the `/live` rule — rejected because explain-back opens as in-place dialog/panel state
on an unchanged route, not a route change, so there is no location signal to key on.

**`/transcribe/{code}` without a second `startCapture`:** `TranscribeRoomPage` reads
`useRoomCapture()`; when a capture is already running for the matching room (or no code names
the currently-running room), it renders the room view sourced from the SAME subscriptions the
provider already holds, and its End button calls the provider's per-person-end path — no new
`join`/`startCapture`. When no capture is running, today's consent → join → `startCapture` flow
is unchanged, so the existing tested path only fires in the case it already covers.

**Bar lift (D7, D9):** `ActiveSessionBanner`'s markup becomes a presentational `<SessionBar>`
(new: `src/app/components/session/session-bar.tsx`, props not context) plus two thin wrappers:
`LiveSessionBar` (today's `ActiveSessionBanner` logic, unchanged behaviour, renders at its
current site inside `ClarityLandingLayoutInner`, still gated by `isLivePage`/
`isImmersiveLetterRoute`) and `RoomCaptureBar` (new, sources text/actions from
`useRoomCapture()`). `RoomCaptureBar` is rendered by `RoomCaptureProvider` itself, as a
fixed-position overlay — because the provider sits above `<Routes>`, this is present on every
route without threading a new prop through `ClarityLandingLayoutInner`'s chromeFree/embed/
`/transcribe` branches, which is exactly what D9 ("wherever transcription is running... every
page") needs and what the layout's existing conditional structurally cannot give without a
parallel prop on every variant. It renders only in `capturing`/`stalled` state — during `paused`
nothing is running, so its absence satisfies "capture never runs with no indicator" rather than
violating it, and matches D3/D13's "no paused message" by construction.

**`transcribe-service.ts`'s existing client-facing `endRoom()` export** (`:581-626`, fans out
`createTranscriptionJob` per member) is retired from every click-handler call site — Part 1's
"no client ends a room for anyone else" invariant forbids it as a UI action now that Decision 1
provides the correct per-person alternative (`endMyCapture`). The function itself may be deleted
outright, since Decision 2's sweep is what ends a fully-ended room server-side now.

---

**Decision 8 — T3 recommendation (hold vs. release the stream while paused)**

**Chosen (recommendation, not final): hold.** Keep the `getUserMedia` tracks alive across a
pause; disconnect only the `AudioWorkletNode` tap and stop sending slices. Rationale: `/live`
and explain-back pauses are ordinarily short relative to a 3-hour cap, and re-acquiring
`getUserMedia` on every resume risks a fresh permission/gesture requirement on some browsers —
notably iOS Safari, which Open Question T1 already flags as uncertain for the unrelated
lock-screen-resume case. Holding sidesteps that uncertainty for the common case. **Trade-off,
stated as the spec already frames it:** the OS microphone indicator stays lit during a private
`/live` session — a real, named cost, not hidden by this recommendation. Both branches are
implemented behind one pair of functions on the provider (`pauseCapture()`/`resumeCapture()`),
so flipping the recommendation after the T3 iPhone measurement in `/verify` is a change inside
those two functions, not a redesign of the pause/resume wiring above.

---

**Decision 9 — Part 4 bounds table: confirmed against code, and the edge-first rollout**

**Confirmed by direct read** (not trusted from the spec's own citations): `SLICE_INTERVAL_MS`
(`slice-recorder.ts:36`) = `4_000`; `MAX_SLICE_DURATION_MS` (`validate.ts:50`) = `8_000`;
`MAX_SLICE_BYTES` (`validate.ts:43`) = `320_000`; `MAX_SLICES_PER_MEMBER` (`handler.ts:46`) =
`3_000`. The ring buffer (`slice-recorder.ts:41`, `BUFFER_SECONDS = (SLICE_INTERVAL_MS +
LEAD_IN_MS) / 1000 + 1`) is derived from the interval constant, not hardcoded — bumping
`SLICE_INTERVAL_MS` alone resizes it; no separate edit needed there.

**New values:** `SLICE_INTERVAL_MS = 13_000`. `MAX_SLICE_DURATION_MS = 17_000` (≥14 s cadence +
lead-in, plus a late-timer margin, as the spec suggests). `MAX_SLICE_BYTES`: 17 s × 32,000
bytes/s (16 kHz × 16-bit × mono) + 44-byte header = 544,044 bytes; `640,000` (the spec's
suggested value) preserves roughly the same ~18-25% margin over that figure that today's
320,000-over-256,044 already carries. The `handler.test.ts:246-253` inequality assertion moves
with these constants — per the P1236 decisions.md finding above, that assertion is what makes
the relationship, not just each bound individually, a live check.

**`MAX_SLICES_PER_MEMBER`** re-derives from the same 180-minute/cadence relationship
(`handler.ts:46`'s own comment: "180 minutes at Decision 1's 4-second cadence is 2700 slices");
at 13 s cadence that is ~830 slices for 180 minutes — re-derived to **~1,000** (headroom for
rejoin/replay, per the spec, not dropped).

**Final partial slice on stop:** `createSliceRecorder`'s `stop()` closure (`slice-recorder.ts:
326-338`) currently only clears the timer and tears down the audio graph. Add one final
`ring.readLast(...)` flush of whatever accumulated since the last tick, emitted as one more
slice (continuing the sequence counter) when its length exceeds a small floor (~0.5 s, to avoid
emitting a near-empty noise slice) — this is what makes the last up-to-13-s utterance reach live
text, per the spec's own line in the bounds table.

**Edge-first rollout, resolved as a superset rather than dual-mode logic:** the new bounds
(17,000 ms / 640,000 bytes) are a strict superset of the old (8,000 ms / 320,000 bytes), so a
still-deployed old client's 4 s/5 s slices continue to validate unchanged once the widened
bounds are live. Deploying `transcribe-slice` with the new constants **first**, before any
client ships the 13 s recorder, achieves "accepts both 5 s and 14 s slices during rollout"
without a dual-range branch in `validate.ts` — one set of constants, ordering (not branching)
does the rest. RQ5's 5-minute-per-segment defence is untouched either way, since 17 s remains
far below it.

### Security Review

*Written by the Security agent before the Architecture section existed (verbatim below). The
three load-bearing ⚠️ findings were re-checked by command in the parent session, and corrections
follow in "Parent verification", which overrides the review wherever they differ.*

**RLS Policies:**
- ⚠️ **`transcribe_rooms`'s existing "room members can end the room" UPDATE policy has no directional guard on `ended_at`.** `20260824000000_p1149_room_end_policy_column_guard.sql:42-57` adds a trigger guarding `code`/`event_id`/`created_at` but the `WITH CHECK` only re-tests membership — nothing stops a member `UPDATE`-ing `ended_at` back to `NULL` after the server (or another member) ends it, or setting it early for everyone. This is exactly the "one member ends the room for all" mechanism Part 1 sets out to remove ("No client ever ends a room for anyone else," Invariants). **Required:** when the per-person end marker + server-driven end ship, this policy must be revoked or tightened (e.g. reject any client `UPDATE` on `transcribe_rooms.ended_at` entirely, moving both end paths to `SECURITY DEFINER` RPCs) — leaving it as-is means the old direct-end path coexists with the new per-person-end RPC and defeats the invariant.
- ✅ No client can rewrite `consent_given_at` or `slice_count` today: `transcribe_room_members` carries no `UPDATE` policy for `authenticated` (checked across `20260823190000`, `20260908170000`); both columns are writable only through `SECURITY DEFINER` functions (`join_transcribe_room`, `enter_transcribe_room`, `record_transcribe_slice`, the last `service_role`-only).
- ⚠️ **The per-member end marker column doesn't exist yet.** **Required:** when added, it must follow the `consent_given_at` pattern exactly — writable only via a `SECURITY DEFINER` RPC that derives the member from `auth.uid()`, never accepts a target member id, and the table must gain no new `authenticated` `UPDATE` policy that could let one member set another's marker.
- ⚠️ **Session→room transcript read path doesn't exist yet** (Part 2). **Required:** reuse `is_transcribe_room_member`/the P1207 member-scoped pattern directly — do not introduce a second, broader visibility rule keyed off `clarity_sessions` alone, since a session's *other* `/live` participant must not thereby gain room-transcript access.
- ✅ Service-role-only paths are correctly unreachable from `anon`/`authenticated`: `record_transcribe_slice` (`20260908170200_…sql:71-74`) revokes `PUBLIC`, `anon` **and** `authenticated` explicitly and grants only `service_role`. `join_transcribe_room`/`create_transcribe_room`/`enter_transcribe_room` all pin `search_path`, revoke `PUBLIC` and `anon`, and two of the three carry a live post-condition (`has_function_privilege`) proving the anon grant is actually gone — **required for every new definer function this spec adds.**
- ⚠️ **`enter_transcribe_room` performs no server-side check that the caller may attend `p_event_id`** (`20260911151200_p1236_g_…sql:96-101` only checks `clarity_sessions` ownership). The event gate (`EventRoomGate.tsx`, `useEventRoomAccess`) is client-only routing. *(The review's proposed remedy, an `event_room_members` row, is corrected under Parent verification.)*

**Authentication:**
- ✅ All three edge functions resolve the Bearer JWT via `supabase.auth.getUser(token)` against the anon client before any service-role read (`transcribe-slice/index.ts:75-79`, `gcs-signed-url/index.ts:25-29`), fail closed to 401 on any error/no-user.
- ✅ `record_transcribe_slice`, `join_transcribe_room`, `enter_transcribe_room` and `create_transcribe_room` all derive identity from `auth.uid()` only — none accept a `profile_id`/`member_id` argument.

**Authorization:**
- ⚠️ **Confirmed: `gcs-signed-url` does not check room end today.** `handler.ts:157-169` checks membership + `consentGivenAt`, never `ended_at` or any cap. A member whose room has ended can still mint signed upload URLs and keep archiving indefinitely. **Required:** refuse (410-equivalent) server-side, mirroring `transcribe-slice/handler.ts:139-148` — a client-only stop is not a stop. *(Which cap it checks is corrected under Parent verification.)*
- ✅ Attribution is server-derived everywhere reviewed: `transcribe-slice` resolves `member_id` from `(roomId, auth.uid())` server-side (`index.ts:81-103`) before any Gemini call or insert; `gcs-signed-url`'s object-name-ownership check uses server-known names only (`handler.ts:140-149`).

**Consent integrity:**
- ✅ Nothing is capturable before a member row with `consent_given_at` exists: both join RPCs require `p_consent IS TRUE` (so `NULL` also refuses) and write the row and timestamp atomically; both `transcribe-slice` and `gcs-signed-url` independently gate on `consent_given_at IS NOT NULL`.
- ✅ A second user signing in on the same browser cannot inherit capture server-side: every `transcribe-slice`/`gcs-signed-url` call re-resolves the JWT and looks up *that* user's own membership row, so a different user's JWT 403s. The client-side gap (mic keeps running) is Part 1's job, not a data-attribution risk.
- ✅ One-capture-per-browser needs no server-side guard: the join RPCs `ON CONFLICT (room_id, profile_id) DO UPDATE`, so a second tab's join is idempotent against the same membership row.

**Input Validation:**
- ⚠️ When the Part 4 bounds land, write the equivalent of `handler.test.ts:246-253`'s cross-constant inequality assertion for the new values, not just new constants; `MAX_SLICES_PER_MEMBER` re-derived from the new cadence, not left at 3,000.
- ✅ Archive object naming has no path-traversal or cross-member-overwrite surface: `ROOM_PREFIX_RE`/`ROOM_FILE_NAME_RE` are closed regexes, and the member id in the prefix is checked against the JWT's own membership row.
- ⚠️ Every new RPC (per-person end, chunk reservation, sweep) takes no identity argument: `auth.uid()`-only identity, and no parameter accepts an identifier without a matching server-side ownership/membership check.

**Data Protection:**
- ✅ No audio bytes or transcript text appear in logs in either edge function (`transcribe-slice/handler.ts:166,188` log status/error only).
- ⚠️ **UNVERIFIED — Part 3 is unbuilt.** The whole-recording service must meet the same bar: no audio or transcript text in logs, Sentry breadcrumbs or Cloud Tasks payloads (job ids only); GCS reads for reassembly service-account-only.
- ✅ Non-members learn nothing: room codes are unenumerable (`20260901160000_p1207_…sql`), roster read requires `is_transcribe_room_member`, and not-found/not-a-participant responses collapse identically in both edge functions.

**AI Prompt Security:**

| Variable | Origin | Classification | Required handling |
|----------|--------|---------------|-------------------|
| Slice / segment audio bytes | Member's microphone | Personal data (voice) | Sent only as `inlineData` binary, never interpolated into text (`transcribe-slice/index.ts:147-156`); no system prompt is sent |
| Display name / room code / event title | User-controlled | Personal / identifying | **Not sent today.** The whole-recording pass (Decision 5) must preserve this: none of them may enter any Gemini request; attribution is joined server-side after transcription |

- [x] No sensitive user data injected into prompts sent to the third-party API (audio only; no text part)
- [x] System prompt cannot be extracted (none is sent)
- [x] API key is a server-side secret (read via `Deno.env.get`, not a `VITE_*` variable); the new Cloud Run service reads its key from its own secret, never from the client
- [x] Rate limiting: `MAX_SLICES_PER_MEMBER`, `MAX_CONCURRENT_ROOMS_PER_USER` and the per-person cap bound live spend; whole-recording spend is bounded by one job per member per room (`ON CONFLICT DO NOTHING`, Decision 2)

#### Parent verification (2026-09-14, by command)

Reports received: **2 of 2** (Architect, Security). The three load-bearing ⚠️ findings were re-run against the code, and all three reproduce. Corrections:

1. **Room-end UPDATE policy: confirmed.** The P1207 migration states it leaves this policy untouched (`20260901160000_p1207_…sql:25`); P1275 changes only INSERT. **Required in the Decision 1 migration:** drop "room members can end the room" and grant no client UPDATE on `transcribe_rooms`. `ended_at` is written only by the sweep (Decision 2), which is `SECURITY DEFINER`. `transcribe-service.ts`'s `endRoom()` is removed with it (Decision 7 already retires it).
2. **Registration check: confirmed, but the review's remedy is circular, and the gap is defence in depth, not a boundary.** `join_event_room` creates an `event_room_members` row for any signed-in caller, checking only event existence, the grace window and a 1,000-row cap (`20260907130000_p1256_…sql:70-95`). Its own comment says registration is the client's gate, not a server condition. Registration itself is self-service: `event_rsvps`' INSERT policy is `auth.uid() = profile_id` (`20260118_create_events.sql:73-74`), and `events` has no private or invite-only column. **Required:** `enter_transcribe_room`, whenever `p_event_id` is not null, refuses unless the caller has an `event_rsvps` row for that event or is its host. This is the exact rule `useEventRoomAccess` applies on the client (`EventRoomAccess.tsx:76`). It also refuses once the event's grace window has passed (`public.event_grace_interval()`), so the server and client agree. Apply the same check to `create_transcribe_room`, which also accepts `p_event_id uuid DEFAULT NULL` (`20260908210000_p1275_…sql:52-55`). **What it does not do:** anyone who self-registers for a public event can still join its room and read its transcript without attending. That is a product question for the founder, listed below, not a code gap.
3. **Upload refusal: confirmed; the cap it checks follows D11, not room age.** `gcs-signed-url` refuses when the room's `ended_at` is set, when the member's `capture_ended_at` is set, or when `now() > joined_at + 3 hours`: the same per-person source as Decision 3, so the slice path and the upload path cannot disagree.
4. **New tables' write rules** (not covered by the review, which predates them): `transcribe_room_transcription_jobs` and `transcribe_room_transcripts` get **no** client INSERT/UPDATE/DELETE policy (service role only, `WITH CHECK (false)` stated explicitly per the P1275 idiom) and a member-scoped SELECT using the P1207 shape. The session history's status read (Decision 4) goes through that SELECT, so a non-member learns nothing, not even whether a job exists.

**For the founder (not blocking `/generate-tests`):** since registration is self-service, a person who registers for a public event and never attends can open its room and read everything said. The ready-screen sub-line promises sharing "with others in the room". Is "anyone registered" an acceptable meaning of "the room"?

### Implementation Approach

**Worktree recommended:** 30+ files span four Supabase migrations, three edge functions, a new
Cloud Run service, and a dozen-plus client files — the existing worktree (`w5`) already isolates
this from `main` and any co-tenant session, consistent with CLAUDE.md's worktree default for
`/dev` on a P-number feature.

#### Build Sequence

1. **Migrations** (all four land together; order among them does not matter, they touch
   disjoint columns/tables except the shared `transcribe_room_members` table, which Postgres
   handles fine across separate `ALTER TABLE` statements): per-person end marker + RPC
   (Decision 1) **and, in the same migration, drop the "room members can end the room" UPDATE
   policy, with no client UPDATE left on `transcribe_rooms`** (Security Review, Parent
   verification 1); chunk-sequence column + RPC (Decision 6); `last_seen_at` column + the
   `touch_transcribe_room_capture` RPC (Decision 2 correction); the `enter_transcribe_room`
   changes, all together: room-age-filter removal (Decision 3, coupled to the sweep landing in
   the same release), `capture_ended_at = NULL` on re-join (Decision 1 correction), and the
   RSVP-or-host + grace-window check on `p_event_id`, applied to `create_transcribe_room` too
   (Parent verification 2); `transcribe_room_transcription_jobs` + `transcribe_room_transcripts`
   tables with service-role-only writes and member-scoped SELECT (Parent verification 4), and the
   sweep tick function + `cron.schedule` (Decisions 2, 4, 5). Every new `SECURITY DEFINER`
   function pins `search_path`, revokes `PUBLIC`/`anon`, and carries a `has_function_privilege`
   post-condition (Security Review). Apply to prod per the spec's own Pre-deploy Checklist,
   before any function/client deploy.
2. **Edge functions, deployed before any client change (edge-first, Part 4):**
   `transcribe-slice`: widened bounds (Decision 9), per-member cap source switch (Decision 3),
   `last_seen_at` stamping (Decision 2); `gcs-signed-url`: refuse when the room's `ended_at` is
   set, the member's `capture_ended_at` is set, or `now() > joined_at + 3 hours` (Parent
   verification 3), backstopping the client hard stop; new `enqueue-room-transcription` (job ids
   only in the task payload, no audio or text).
3. **New Cloud Run service** `transcribe-room-batch` and its Cloud Tasks queue, deployed
   alongside step 2 — the sweep (already live after step 1) will start creating job rows the
   moment a room ends, so the processing target must exist before that happens on prod.
4. **Client, all together (Parts 1, 5, 6 per the spec's own ordering):** `slice-recorder.ts`
   bounds + final-partial flush; `RoomCaptureProvider` + `SessionBar`/`LiveSessionBar`/
   `RoomCaptureBar` split + `App.tsx` mount; `transcribe-room-page.tsx` and
   `transcribe-service.ts` adjustments (Decisions 1, 6, 7); `EventRoomGate.tsx`/
   `EventRoomReady.tsx` (D10 routing, D12 default-off switch + copy); `my-sessions-page.tsx` /
   `sessions-service.ts` (Decision 4); `explain-back-capture.tsx` pause/resume wiring.
5. **Copy/docs:** `privacy.md`, `tos.md`, the `/live` label sites (D6), `database.md`,
   `infrastructure.md` — per the spec's own Done-When list.
6. **`/verify`:** T1 (lock-screen resume), T3 (iPhone hold-vs-release measurement, may flip
   Decision 8), T4 (edge-function body-size limit).

#### Files to Create

- `supabase/migrations/20260914120000_p1307_transcribe_member_capture_end.sql`
- `supabase/migrations/20260914120100_p1307_transcribe_chunk_sequence.sql`
- `supabase/migrations/20260914120200_p1307_transcribe_member_cap_source.sql`
- `supabase/migrations/20260914120300_p1307_transcribe_room_jobs_transcripts_sweep.sql`
- `supabase/functions/enqueue-room-transcription/index.ts`
- `services/transcribe-room-batch/main.py`, `audio.py`, `gemini_client.py`,
  `requirements.txt`, `Dockerfile` (mirrors `services/transcribe/`'s existing structure —
  GCS listing/download and job-claim mechanics reused, Whisper/diarization calls replaced with
  per-segment Gemini calls)
- `src/app/contexts/room-capture-context.tsx`
- `src/app/components/session/session-bar.tsx`
- `src/app/components/session/live-session-bar.tsx`
- `src/app/components/session/room-capture-bar.tsx`

#### Files to Modify

- `supabase/functions/transcribe-slice/handler.ts`, `validate.ts`, `index.ts`
- `supabase/functions/gcs-signed-url/handler.ts`, `index.ts`
- `src/lib/audio/slice-recorder.ts`
- `src/App.tsx`
- `src/app/layouts/clarity-landing-layout.tsx` (remove the now-lifted `ActiveSessionBanner`
  render call; `isLivePage` padding logic otherwise unchanged)
- `src/app/components/session/active-session-banner.tsx` (logic extracted into the three new
  files above; this file is either deleted or reduced to re-exporting `LiveSessionBar`)
- `src/app/pages/transcribe-room-page.tsx`
- `src/app/data/transcribe-service.ts`
- `src/app/prototypes/events/components/EventRoomGate.tsx`
- `src/app/prototypes/events/components/EventRoomReady.tsx`
- `src/app/pages/my-sessions-page.tsx`
- `src/app/data/sessions-service.ts`
- `src/app/data/api.ts` (new `fetchRoomTranscript`, alongside unchanged `fetchSessionTranscript`)
- `src/app/components/letters/explain-back-capture.tsx`
- `src/app/contexts/live-session-context.tsx` (export its `cp_active_session` read helper if not
  already exported; Decision 7 correction)
- `src/app/content/privacy.md`, `src/app/content/tos.md` (corrected path: no `docs/privacy.md` or
  `docs/tos.md` exists)
- `docs/technical/database.md`, `docs/technical/infrastructure.md`

## Test Coverage Strategy

Test-first: written before `/dev`, so most of it fails today by design. The file list is in
frontmatter (`test_files`, `uat_file`).

**The 21 test files are on disk in w5 but NOT committed.** `pre-commit-checks.sh` runs the full
build and unit suite whenever any `.ts` file is staged (`BUILD_AFFECTING`, lines 93-95), so a
deliberately red suite cannot land ahead of its code. `--no-verify` is banned. `/dev` commits them
together with the implementation that turns them green, per the script's own note that a red test
"rides the fix branch". Only this spec and `features/uat/p1307.md` are committed. Do not delete or
`git restore` them: they exist nowhere else.

**Verified in the parent session (2026-09-14, re-run by command, not taken from the agent's report):**
- `transcribe-slice/handler.test.ts`: 37 pass (all pre-existing), 8 fail, all new P1307 tests.
- `gcs-signed-url/handler.test.ts`: 26 pass (pre-existing plus 2 no-regression controls), 3 fail,
  all new P1307 refusals.
- Vitest (10 files): 15 failing tests, all P1307 or deliberately changed assertions, plus 5 files
  failing only at import resolution (`room-capture-context`, `room-capture-bar`, `transcript-merge`
  do not exist yet). No unrelated pre-existing test fails.
- Integration, E2E and a11y suites were typechecked and linted, **not run**: they need the
  migrations applied to the test database, which is `/dev`'s job.

**What's tested, and why:**
- **Integration (38 new, 6 files, plus 1 updated canary).** Every migration: schema existence
  (P270 two-client pattern), anon EXECUTE denied on every new definer function, the dropped
  room-end policy (member can neither set nor clear `ended_at`), `end_transcribe_room_capture`
  (own row only, idempotent), `enter_transcribe_room`/`create_transcribe_room` (RSVP-or-host,
  grace window, no room-age filter for the D11 latecomer, re-join clears `capture_ended_at` and
  keeps `joined_at`), `reserve_room_chunk_number` (monotonic), `touch_transcribe_room_capture`,
  the sweep tick called directly (cap, staleness, **a recently-touched paused member is not
  ended**, room end, one job per member, idempotent), and the new tables (no client writes,
  member-only reads). Why: this is where "no client ends a room for anyone else" and consent
  enforcement actually live.
- **Edge handlers (15 new Deno tests).** 13 s slices accepted, superset bounds for the rollout,
  the inequality assertion re-derived, `MAX_SLICES_PER_MEMBER` re-derived, the cap measured from
  the member's `joined_at` in both directions, `last_seen_at` stamped on real and silent slices
  but not warmups; `gcs-signed-url` refuses when the room ended, the member ended, or past 3 h.
- **Unit (50 new Vitest tests, 6 files; 4 existing files updated).** Capture state machine (the
  consent gate before the microphone, join failure, 3-strike stall, 410 hard stop, auth-change
  stop), pause/resume predicates (including the browser-Back-with-session-still-active trap), Web
  Locks single capture, ready screen (switch off by default, UI Contract strings verbatim), bar
  visibility by phase and End calling only the per-person path, transcript merge, the 13 s
  cadence, `/live` labels (D6).
- **E2E (9) and a11y (4).** Smoke, switch off by default, on → `/meet` with bar, off → nothing
  captured (checked server-side), D10 return to ready, bar across pages, End clears it, Open
  without a second consent screen, two tabs; switch role, keyboard and live region, bar actions
  focusable and named.
- **UAT (28 scenarios, `features/uat/p1307.md`)** covers every Acceptance Criterion.

**Existing tests changed, each required by a decision:** the P1149 room-end canary is inverted
(Parent verification 1); `p1236-end-room-idempotent` now tests `endMyCapture` (Decision 7);
`p1236-duration-bound-drift` now tests the per-member cap source (Decision 3); two
`live-mode-view` label assertions (D6); `slice-recorder` cadence and final partial slice (Part 4).

**What's NOT tested, and why:**
- **Part 3, the whole-recording pass** (segmenting, stitching, "also heard by" labelling,
  incomplete archives) and its dispatch chain: no code or interface exists yet. Its ACs
  are measurements written into this spec by hand, so they are UAT only.
- **Real devices:** iPhone lock-screen resume (T1), hold vs release (T3), edge body-size limit
  (T4), Android screen-off, two-device archive continuity. Playwright cannot lock a phone. UAT only.
- **`createSliceRecorder` in the browser:** jsdom has no AudioContext. The final-partial-slice flush
  is tested only at the ring-buffer level.
- **Explain-back's mount signal** for pause/resume: the routing rule is unit-tested, the component
  hook is not. UAT only.
- **Privacy and terms prose:** a manual line-by-line check per Done-When.

**For `/dev` — known weak spots, fix while implementing:**
1. **Export names were guessed.** The provider's (`captureReducer`, `shouldPauseForLocation`,
   `hasActiveLiveSession`, `acquireCaptureLock`, `useRoomCapture`) and the merge module's path
   are invented, because no such code exists. Rename imports freely; keep the transition tables
   and predicates, which are the spec content.
2. **Two test checks are loose.** The D10 routing test only checks that "transcri" appears near
   the gate's routing decision, because the spec names no "already being transcribed" signal.
   `/dev` picks the signal and tightens that test to it. The "warmup does not touch `last_seen_at`"
   test passes vacuously today and only binds once the dependency exists.
3. **`e2e/p1114-event-room.spec.ts` and `features/uat/p1114.md` encode the pre-D10 routing**
   (a return visit skips to `/meet`). Update them in this branch rather than leaving P1114 red.
4. `playwright.config.ts` lacks `--use-fake-device-for-media-stream`; the two P1307 Playwright
   files set it via `test.use()`.
5. Neither `[FOUNDER DECISION]` copy slot is asserted; tests check state and test ids only.
