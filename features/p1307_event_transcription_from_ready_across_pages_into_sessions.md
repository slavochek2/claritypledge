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
`/events/:slug/meet` (roster) — and **that flow never reaches transcription at all**.

**Complication.** Three failures, one outcome:

1. **Leaving the page ends your contribution.** The room page releases the microphone when it
   unmounts, and nothing tells the person. At an event people spend their time on the meet page,
   their profile, a practice session — anywhere but a transcript page.
   > *"I have many people in the room in the event but they will leave the transcribe page and
   > today no audio will be there."*
2. **The transcript never reaches session history.** A room creates a real session per member,
   but the session shows no transcript. Room end already calls `createTranscriptionJob` per
   member (`transcribe-service.ts:581-625`) — **but that job cannot find the audio**: the batch
   worker lists `sessions/{session_code}/` (`services/transcribe/audio.py:88`), while room audio
   lands under `sessions/rooms{ROOMCODE}{participant}-{memberId}/` (observed in the bucket
   2026-09-11 — the `rooms/{code}/{who}` prefix built at `api.ts:3283` arrives flattened). And
   that worker is the Whisper + diarization pipeline, the wrong engine for rooms (device = speaker).
3. **Live text is wrong at the cuts.** Audio is cut every 4 s by the clock. A word spanning a cut
   is guessed: *"corrected"* came back as "correct" and "I correct"; *"Form a view on the four
   statements"* became *"from a view in the first statement"* — a different claim, stated
   confidently. The same 450 s of audio sent as one file had none of that (24 non-Latin invented
   characters sliced, 0 whole). And one speaker reads as a wall of name-stamped fragments:
   > *"if I'm speaking continuously... it should be a continuous text because right now it's very
   > hard to read."*

**Question.** How does a person at an event get transcribed from the moment they say yes, keep
being transcribed wherever they go in the app, and find an accurate transcript in their sessions
afterwards — with a consent step that is short and true?

## Appetite

**Blast radius: high.** Moves microphone capture from a page to the app shell, changes consent on
two surfaces (event ready screen, `/live`), changes privacy/terms text, adds a server-side
whole-recording pass. **Reversibility: medium** — code and copy revert; audio captured under the
new consent cannot be un-captured. **Decision density: settled** — all product calls were made by
the founder on 2026-09-11 (below); remaining founder input is final copy wording only.

## Decisions already made (founder, 2026-09-11) — do not re-ask

| # | Decision |
|---|---|
| D1 | Continue on the event ready screen starts transcription **if the switch is on**; the person lands on `/meet` as today, transcription runs in the background, and they can open the room transcript any time. Switch off → Continue goes to `/meet` and **nothing starts**. They can go back to the ready screen and switch it on. |
| D2 | A visible switch on the ready screen, **on by default**, labelled **"Transcribe for AI insights"**, with the founder's sub-line **"Record audio and share transcript with others in the room"** (says what is kept and who sees it). Below Continue, one small line — the `/live` pattern: "By continuing, you agree to our Terms and Privacy Policy." Not a separate consent screen. |
| D8 | Nothing new stops a forgotten, still-open page from recording: the room's existing 3-hour limit is the backstop and the always-visible bar is the reminder (founder chose this over a silence timeout, which would drop the question someone waited through a talk to ask). |
| D9 | Wherever transcription is running, the person can see it — on every page (founder: *"people get visibility everywhere they are if they are recorded"*). |
| D3 | While the person is in a `/live` session, room transcription **pauses automatically** and **resumes automatically** when the `/live` session ends — only if it was running before. **No "paused" message**: in `/live` they get today's experience; after it, the transcription bar and capture simply come back. Applies to private `/live` sessions too. |
| D4 | Live text stays a **preview**; the **saved** transcript is a whole-recording pass per person after the room ends. Consecutive same-speaker rows render merged; a "…" indicator shows who is speaking. Cutting on pauses (voice activity) is **deferred**. |
| D5 | Slice length: **13 s** if it measurably reduces errors versus 4 s on real room audio (founder: *"lets do 13 sec then... i guess we can check if 13 has viwer erros - can you run it? and decide?"*). **Measured 2026-09-11: 13 s wins on both runs** — non-Latin invented letters 37 → 2, word error vs whole file 55.2% → 30.0%. See Evidence. |
| D6 | `/live`'s switch is renamed to the same label for consistency. "AI insights" is accurate: the founder produces insights from transcripts with AI tooling after sessions. |
| D7 | The persistent bar reuses the existing cross-page session bar (`ActiveSessionBanner`) rather than adding a second one. |

## Solution

Six parts. **Parts 4 and 5 must go live together** — starting capture at the ready screen without
cross-page capture would stop it the moment the person lands on `/meet`.

1. **Transcript in session history.** The session entry for a room shows its transcript,
   attributed by speaker, in spoken order. Before the whole-recording pass completes it shows the
   live rows (`transcribe_messages`); after, the saved version. Room end is the trigger (explicit
   End, last member ending, or the server's duration cap) — never "a person left a page".
2. **Whole-recording pass.** At room end, each member's archived chunks are reassembled and sent
   to Gemini as one recording; the result becomes that member's saved transcript, merged into one
   timeline by timestamp. Fix or replace the existing room-end job so it can find the audio and
   uses the right engine — `/architect` decides which; the P1237 ruling (keep Whisper + diarization
   for `/live` batch) is not touched.
3. **Slice length** per D5, keeping the 1 s lead-in and the de-duplicator. Re-derive the
   per-member slice ceiling (`MAX_SLICES_PER_MEMBER = 3_000` was sized for 4 s slices; at 13 s the
   180-minute duration cap binds first and the ceiling stops meaning anything).
4. **Event ready screen** per D1/D2. Consent is recorded on the server at Continue, exactly as the
   room's consent is today — the switch alone records nothing. If the person returns to the ready
   screen while transcription is running, the switch shows **on**; switching it off there ends
   their transcription exactly as the bar's End does.
5. **Capture follows the person across pages.** The recorder moves out of the room page to app
   level. One bar (D7) shows *"● Transcribing for AI insights"* with **Open** (→ the existing
   `/transcribe/{code}` room page — no new transcript screen) and **End session**. Auto-pause/resume
   around `/live` per D3. The bar is hidden today on `/live` itself (paused there — D3), on the
   immersive letter screens (`/letter/:id`, `/letter/:id/compose` — hidden deliberately, it
   collided with the letter progress bar) and on `/donate` (outside the page frame). D9 applies:
   on those last two, either show an indicator or pause capture — `/architect` picks, but capture
   never runs with no indicator on screen. When the page returns from
   the background (phone locked, app switched), capture resumes on its own if the browser allows;
   if the browser requires a tap, the bar offers one — see Open Questions.
6. **Readability** per D4: merge consecutive same-speaker rows at render time; show "…" against
   a person while they are speaking. The indicator is transient client/realtime state, never a row.

Plus: `/live` label per D6, and `privacy.md` / `tos.md` updated to match what the code does.

## UI Contract

Founder-approved copy, 2026-09-11 (the `/live` strings in the last two rows follow D6).

| Where | String |
|---|---|
| Ready screen switch label | **Transcribe for AI insights** |
| Ready screen switch sub-line (on) | Record audio and share transcript with others in the room |
| Ready screen switch sub-line (off) | Not transcribed |
| Line under Continue (both states) | By continuing, you agree to our Terms and Privacy Policy. |
| Bar | ● Transcribing for AI insights — actions **Open**, **End session** |
| `/live` start switch | Transcribe for AI insights (was "Record for AI Insights") |
| `/live` in-session banner | Session transcribed for AI insights (was "Session recorded for AI Insights") |

Clickable prototype: `/tree/event-transcription` on branch `feature/p1307-event-transcription`
(dev-only). Styling reuses the event ready screen, `/live`'s switch and terms line, and the
existing session bar's classes. The meet page, the `/live` session and the transcript view in the
prototype are **labelled stand-ins** for the real, unchanged pages — founder review caught the
first version inventing a meet-page layout. Button colours are left as each page has them today
(dark blue on the ready screen, `/live`'s blue in the bar); app-wide colour consistency is P1308. The prototype showed that `ActiveSessionBanner`'s markup has no
session-context dependency — only its click handlers do — so D7 is a split into one presentational
bar plus two thin wrappers (live session, room transcription), not a second bar.

## Invariants

- **Never promise on a consent surface what the system does not do.** (P1236 removed a "corrected
  transcript afterwards" sentence because nothing kept it.) The approved copy promises nothing
  beyond what the live path already does; keep it that way.
- **Capture never runs with no indicator on screen** (D9).
- **Nothing is captured before consent is recorded on the server**, and nothing is captured when the
  switch is off.
- **One voice, one recording at a time.** Never a silent second recording (room + `/live`), never a
  silently dropped first one — D3 is the only resolution.
- **Attribution comes from the server** (the member row), never from the client.
- **Interim text never reaches the database.** `transcribe_messages.is_final` admits only `true`;
  the "…" indicator is not a row.
- **Never over-strip.** The de-duplicator's bias — a surviving duplicate is visible and harmless, a
  deleted word is invisible and unrecoverable — holds at any slice length.
- **Room contents are readable only by room members** — reuse the P1207 member-scoped rules; no new
  access paths.
- **`privacy.md` and `tos.md` describe what the code does** — checked against the code, not assumed.
  Today they say joining "requires you to tap a control" and "leaving the room stops your
  recording"; both become false under this spec.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Phones in a shared room each hear everyone; the whole-recording pass repeats a sentence under several names | MITIGATE | P1236 measured phones-on-a-table separation poorly (7.1 dB median, 75% of sessions below the bar). `/architect` must pick a cross-member de-dup or accept-and-label rule before part 2 builds |
| Browser suspends the microphone when a phone locks or the app is backgrounded (iOS especially) — UNVERIFIED this session | MITIGATE | Part 5's resume path; measure on a real iPhone during `/verify` |
| A 3-hour recording exceeds a single inline Gemini request | MITIGATE | `/architect` sizes it (file upload API or segment-and-stitch on long silences) |
| Someone leaves the event with the page open (e.g. Android, screen on) and keeps being recorded until the 3-hour limit | ACCEPT | D8 — founder's call; the bar is visible on every page. Revisit if it happens at a real event |
| 13 s slices mean ~15 s from speech to text | ACCEPT | Founder: reading while talking is not the use case (P1236, 2026-09-04); the "…" indicator makes the delay legible |
| The whole-recording pass roughly doubles transcription spend | ACCEPT | ~€0.16 per audio-hour per person (P1237 measurement); ~€1.60 for a 10-person hour |
| `ActiveSessionBanner` only polls every 30 s outside `/live` (P743 ruling, 2026-04-17) | MITIGATE | Resume after `/live` must be driven by the session ending in this tab, not by that poll |
| The banner's End must respect roles (P1063 ruling, 2026-08-13) | MITIGATE | Ending transcription from the bar ends only this person's capture, never the room for others |
| P1236 itself is not yet on prod (main is ahead of origin) | DEFER | This ships after P1236 is pushed; see Pre-deploy Checklist |

**Non-Goals**
- Do NOT build voice-activity (pause-based) segmentation — deferred by D4.
- Do NOT change `/live`'s batch pipeline or its diarization (P1237 ruling).
- Do NOT add transcription for signed-out guests; the event gate already requires sign-in.
- Do NOT change the event gate, the readiness slider's semantics, or the meet page roster.
- Do NOT add a "paused" message for the `/live` case (D3).

## Acceptance Criteria

- [ ] At an event, with the switch left on, pressing Continue lands the person on `/meet` with the bar showing and their speech appearing in the room transcript.
- [ ] With the switch off, Continue lands on `/meet`, no bar, nothing captured (verified server-side: no slice, no archive chunk); going back to the ready screen and switching on starts it.
- [ ] A person who moves to their profile, the feed and back keeps contributing throughout, and can end it from any page via the bar.
- [ ] Joining a `/live` session from the meet page stops room capture with no message; ending it brings the bar and capture back — and does not start anything if transcription was off before.
- [ ] Reproduced with two participants on two devices, one navigating away mid-room and returning.
- [ ] After the room ends, each member's session shows the transcript, attributed and in spoken order; a non-member cannot read it; a room with no speech shows an empty state.
- [ ] The saved transcript is the whole-recording version, compared against the live text of the same room and the comparison written into this spec.
- [ ] One person speaking continuously for 30 s reads as one continuous message, not one per slice; two people alternating stay separate.
- [ ] While someone is speaking, "…" shows against their name.
- [ ] `/live` shows the new label on the start switch and the in-session banner.

## Done-When

- [ ] D5 measurement recorded in Evidence with the slice length chosen by its pre-registered rule.
- [ ] De-duplication ratio (rows vs distinct text) stays at ~1.00 on a real room — the P1236 verdict measure does not regress.
- [ ] `privacy.md` §Live sessions, §Transcribe rooms and §AI features, and `tos.md`, updated and checked line by line against the code.
- [ ] Existing tests that assert the old `/live` label updated to the new one (not deleted).

## Pre-deploy Checklist

### Deploy order
- [ ] P1236 (server-side live transcription) is on prod first — it is on local `main` but not `origin/main` as of 2026-09-11.
- [ ] Edge functions changed by this spec deployed (at least `transcribe-slice` for the slice ceiling; any new whole-recording function).
- [ ] `GEMINI_BATCH_API_KEY` present in the prod project's function secrets (the live path already requires it — confirm, do not assume).

### Post-deploy verification
- [ ] A real two-device event room on prod: bar, navigation, `/live` pause/resume, session transcript.
- [ ] Sentry clean for 10 minutes after.

## Open Questions

1. **Resume after the phone locks.** Can capture restart without a tap on iOS Safari and Android Chrome? If a tap is required, the bar's resume affordance needs founder-approved copy — D3's "no paused message" was decided for the `/live` case, not this one.
2. **Cross-member duplicate speech** in the whole-recording pass (Risks, row 1).
3. **Long recordings** — single-request limit for the whole-recording pass (Risks, row 3).

## Evidence

**D5 — 4 s vs 13 s vs whole recording, 2026-09-11.** Same 450 s of real room audio as the P1298
measurement; same model (`gemini-3.5-transcribe`), same request shape as `transcribe-slice`, same
1 s lead-in, the production de-duplicator applied in production order. Two runs per variant.
Reference = whole-file transcript (the same model hearing full context; not a human transcript —
disagreements read by hand, below).

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
reference is the same model with full context, not a human transcript. 13 s makes the live
preview materially better; it does not make it the record — part 2 remains the record.

Raw outputs and the script are in the session scratchpad, not the repo (they contain the
founder's speech); the re-run recipe is: reassemble a room's archive chunks, slice with a 1 s
lead-in, send each slice as `audio/wav` exactly as `transcribe-slice` does, apply
`dedupeSliceText` in order, and read `parts[].audioTranscription.text`.

**Carried from P1298 / P1236:** sliced 4 s had 24 Devanagari characters vs 0 whole-file
(P1298, 2026-09-11); a word straddling a cut is damaged and 1 s of lead-in recovers it (P1236
Finding 8); 2 s was rejected on quality (P1236 Finding 4); Gemini returns empty rather than
inventing filler on silent slices (P1236 Finding 6).

## Related

- P1236 — server-side room transcription this builds on.
- P1298, P1299, P1305 — rejected; superseded by this spec.
- P1237 — batch pipeline ruling (not changed here).
- P511 / P743 / P1063 — the cross-page session bar and its rulings.
- P1077 / P1114 — the ready screen and its readiness distribution.
- P1207 — member-scoped room reads.
- P1308 — button colour consistency across the app (split out of this spec on purpose).
