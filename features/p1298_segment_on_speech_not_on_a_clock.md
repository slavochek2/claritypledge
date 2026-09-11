---
status: week
type: story
rank: 93
severity: medium
workstream: transcription
date_reported: '2026-09-10'
created_date: '2026-09-10'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [transcribe, transcription-quality, ux, audio]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1298: segment on speech, not on a clock

## Evidence — measured 2026-09-11, no longer a hypothesis

The same 450 seconds of real room audio, transcribed two ways: as the 49 four-second slices
the live path actually produced, and as one whole file in a single request to the same model.

| | sliced (what participants saw) | whole file, one request |
|---|---|---|
| words | 390 | 315 |
| Devanagari characters | **24** | **0** |

**A sentence that did not survive the boundary:**

> whole: *"A reader of the current from the event has one job. **Form a view on the four
> statements.**"*
> sliced: *"A reader preparing for the event has one job." / "**from a view in the first
> statement.** I'm not sure I can support"*

*Form a view on the four statements* became *from a view in the first statement*. Not garbled —
a different claim, stated confidently, in a product whose whole purpose is that people can see
what was actually said.

**The invented words are the same defect, not a second one.** The sliced path emitted
`बताओ कौन सा?`, `औरत इनका` and `और` as whole messages. The whole-file pass of the identical
audio contains no Devanagari at all. A four-second cut that begins or ends mid-word leaves the
model too little to anchor on, so it guesses — sometimes in another language.

Both of the founder's complaints therefore have one cause, which is why this spec covers both:

> *"it is weird i didnt say 'spezifischniy novosity' - it ssems it halluncinates words!?"*
> *"if I'm speaking continuously... it should be a continuous text because right now it's very
> hard to read."*

**Overlap and de-duplication were both active for this measurement.** They are not the fix and
were never going to be: the de-duplicator removes repeated text, and this is invented text. The
row-vs-distinct ratio was 1.00 the whole time — a clean score on a measure that cannot see this.

**What this rules out before the work starts:** widening the overlap, tuning the de-duplicator,
or changing models. None of them address a cut placed by a clock rather than by the speech.

**Re-running it:** reassemble a room's archival chunks (they are byte-concatenable; ffmpeg reads
the result), send the whole file in ONE request, and compare against that room's stored rows.
Note the response shape — `gemini-3.5-transcribe` returns `parts[].audioTranscription.text`, NOT
`parts[].text`; reading the wrong field returns an empty string and looks exactly like "the
model heard nothing", which cost an hour on 2026-09-11.

## Problem

The room cuts audio every 4 seconds by the clock and sends each piece to be transcribed
independently. That single choice causes **two separate complaints**, and they turn out to be
the same defect seen from two ends.

**The founder, on reading a room back (2026-09-10):**

> "if there is one person and he's continuously speaking, I'm not sure it's the best UX to
> show multiple times... it should be a continuous text because right now it's very hard to
> read. My name is always in between, but I was actually speaking continuously, right?"

and, separately, on invented words:

> "it is weird i didnt say 'spezifischniy novosity' - it seems it halluncinates words!? ...
> if we transcribe full audio and not in chunks does it get better? because if it does
> somehting is wrong and we need to reason"

He was right, and it is measured. **Same 49 seconds of his own speech, captured off the wire
and replayed two ways** (2026-09-10):

| | result |
|---|---|
| **Whole, one call** | *"and chunks can be reassembled into one file. That also what the room means by corrected transcript is a product afterward which makes your hallucination and sticks even more actionable. The live text and the right audio are independent."* |
| **Per 4-second slice** | *"…the room means by correct"* / *"I correct transcript the product afterward…"* / *"independent"* alone |

The word **"corrected" was cut in half at a slice boundary and the model guessed twice** — once
as "correct", once as "I correct". That is the mechanism behind the invented words: a fragment
with no surrounding context, and a model that produces something plausible rather than nothing.

So a clock-driven cut produces (a) an unreadable wall of same-speaker fragments each stamped
with the speaker's name, and (b) mangled words at every boundary that lands mid-syllable.

## Approach

**Segment on speech, not on time.** Detect voice activity on the device and cut at a natural
pause rather than at 4.000 seconds. One utterance becomes one request and one stored row.

This is deliberately ONE spec rather than two, because a single change answers both
complaints: an utterance-shaped segment has no mid-word boundary to mangle, AND it is exactly
the unit the founder wants rendered as one message.

**This is a solved problem elsewhere and the prior art should be read before designing.** The
founder's instinct is correct — *"other people surely fixed this many times over"*. Real-time
transcription systems universally segment on voice activity with an end-of-utterance timeout,
rather than on a fixed clock. Investigate before building:

- Voice-activity detection in the browser (WebRTC VAD, Silero VAD via WASM, or an energy +
  zero-crossing heuristic on the existing PCM tap — the tap already delivers the samples).
- What the transcription API itself offers. **Check whether the model supports streaming or a
  long-audio mode**; if the whole recording can be sent in one call at the end, the live text
  and the accurate text can be produced by two different mechanisms, which is the shape the
  next spec (session-history transcript) assumes anyway.
- End-of-utterance timeout values used in practice, and the latency they cost.

`[FOUNDER DECISION: pause length]` — how long a silence ends a message. The founder suggested
"like, I don't know, five seconds break". Five seconds is long for conversation; the research
above should return a recommendation and he decides.

**Grouping is a fallback, not the goal.** If VAD proves impractical, consecutive rows from the
same speaker inside a short window can be merged at render time. That fixes the reading
experience and does nothing for the mangled boundaries — so it is second-best, and should be
labelled as such rather than presented as the fix.

**Live typing indicator.** While someone is mid-utterance, show a "…" against their name
instead of nothing. The founder asked for this directly and it makes the ~6s latency legible
rather than looking broken.

## Invariants

- **Never over-strip.** The existing de-duplication is deliberately biased toward leaving a
  duplicate rather than deleting real speech, because "a surviving duplicate is visible on
  screen and harmless; a deleted word is invisible and unrecoverable". Any new segmentation
  inherits that bias.
- Interim text must never reach the database. `transcribe_messages.is_final` carries a CHECK
  that admits only `true`, and the P1236 room has no interim text anywhere by construction.
  A typing indicator is client-only state; it is not a row.
- One utterance = one row = one attributed speaker. Attribution comes from the server, never
  from the client.

## Acceptance Criteria

- [ ] A person speaking continuously for 30 seconds produces text that reads as continuous —
      not one stamped message per 4 seconds.
- [ ] Two people alternating produce separate messages, correctly attributed, without merging
      across speakers.
- [ ] A word spoken across what would have been a 4-second boundary is transcribed once and
      correctly — the "corrected" → "correct" / "I correct" failure above does not reproduce.
- [ ] Measured on a real device: whole-audio transcription and live transcription of the same
      recording no longer diverge the way the table above records.
- [ ] Duplication ratio (rows vs distinct text) stays at ~1.00 — the P1236 verdict measure must
      not regress.
- [ ] While a person is speaking, the room shows an in-progress indicator against their name.
- [ ] The research findings are written into this spec before implementation starts, including
      the recommended pause length and whether a streaming/long-audio API mode exists.

## Key Files

- `src/lib/audio/slice-recorder.ts` — the clock (`SLICE_INTERVAL_MS = 4000`), the ring buffer,
  and the 1-second lead-in that exists solely to survive the clock cut.
- `supabase/functions/transcribe-slice/dedup.ts` — the overlap de-duplication, which exists
  solely because of the lead-in. If segmentation removes the overlap, read this file's measured
  table before deleting it.
- `src/app/pages/transcribe-room-page.tsx` — message rendering and speaker stamping.

## Related

- P1236 — the server-side transcription this builds on. Its 4-second cadence and 1-second
  lead-in are the mechanism this spec revisits, and its `dedup.ts` header records the measured
  cost of every alternative window that was tried.
- P1299 — the room's transcript reaching session history, which is where the accurate
  whole-audio pass would surface.
