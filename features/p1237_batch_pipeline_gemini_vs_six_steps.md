---
status: backlog
type: comment
rank: 255
workstream: transcription
created_date: '2026-09-03'
tags: [transcription, gemini, diarization, cost]
flow: inline
delivery_stage: ship
pipeline_ran: [create-spec, inline, ship]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
---

# P1237: The batch pipeline still mixes phones and diarizes — decide between separate-channel and Gemini

## Problem

**Situation:** `services/transcribe/pipeline.py` runs six steps per session: Whisper → pyannote
diarization → speaker embeddings → merge → speaker mapping → store. Four of those six exist only to
recover *who said what*.

**Complication:** [P552](done/23_mar_26/p552_separate_channel_transcription.md) specified removing
exactly that, in March 2026 — *"Speaker identity = recorder identity — each phone IS one speaker, no
diarization needed"* — and is marked `status: all-done, completed_at: 2026-03-19`. **Its mechanism is
not in the code.** Verified 2026-09-03:

- `audio.py:198` — multi-recorder sessions still go through `_merge_wavs()`, destroying per-phone
  separation. `get_separate_wavs()`, the function P552 specifies, does not exist.
- `pipeline.py:106` — `diarize()` is called unconditionally on the merged WAV. There is no
  multi-phone branch anywhere in the pipeline.
- `pipeline.py:223` — `num_recorders` IS read, but only to *hint pyannote a speaker count*. That is
  the inverse of P552's design: recorder identity feeds the diarizer instead of replacing it.

Meanwhile the founder independently re-derived P552's insight from first principles this session:

> *"isnt right now what hwe have a diarizaiton that runs on gpus? shold we not use gemini transcribe
> or whieper instead on gpus when it comes only to transcribion of one perosn - assuming they all
> have thier own micorophnes?"*

And a third option now exists that did not in March: Gemini 3.5 Transcribe (`/slava:util:diarize`),
at ≈$0.005/min, which could collapse all six steps into one call.

**Question:** For batch session transcription, do we implement P552's separate-channel path, replace
the pipeline with Gemini, or both — and what evidence decides it?

## Appetite

**Blast radius:** Medium — batch transcription only; no live path, no user-facing surface.
**Reversibility:** High — the current pipeline stays until a replacement is proven on the same audio.
**Decision density:** Zero founder decisions. This spec exists to produce a recommendation from
measurement, not to choose by preference.

## Approach

Run all three paths over the **same** archived multi-phone sessions and compare on the criteria
below. This is a measurement spec; the deliverable is a decision, not a deployment.

1. **Baseline** — the current six steps, as they run today.
2. **Separate-channel (P552 as specified)** — transcribe each recorder's WAV independently, speaker
   = recorder, no diarization.
3. **Gemini 3.5 Transcribe** — one call per session, diarization on.

## Research Questions

1. Does separate-channel attribution beat the current merged+diarized pipeline, measured
   **per-speaker**, not overall? ([decisions.md](../docs/decisions.md) 2026-03-22 established that
   overall accuracy inflates on skewed conversations — 74% of one session was one speaker.)
2. How much cross-talk does a co-located phone actually capture? P569's energy scan found every
   phone hears every voice; P552 assumes the owner dominates their own channel. Both can be true —
   the question is whether the dominance is large enough for per-channel transcription to be clean.
3. Does Gemini's diarization beat pyannote on the same audio, per-speaker?
4. What does each path cost per session-hour, and is that cost credit-covered today?
5. Does the 30-minute Gemini diarization cap apply when diarization is OFF?

## Decision Criteria

Pre-registered — written before any run.

1. **Which path?** → Pick separate-channel if its **per-speaker** accuracy is at least as good as the
   current pipeline on the same sessions, since it also deletes four steps and a GPU dependency. If
   separate-channel loses on per-speaker accuracy, pick Gemini if *it* beats the current pipeline
   per-speaker at a credit-covered cost. If neither beats the baseline, keep the baseline and record
   that P552's premise was wrong — an acceptable outcome for this spec.
2. **Is the cross-talk objection real?** → Real if the owner's voice is under 10dB above the loudest
   other voice in their own channel, on a majority of measured sessions. Below that, per-channel
   transcription is unsafe on its own and needs a gating step.
3. **Is Gemini's cost acceptable?** → Only if credit coverage on
   `generativelanguage.googleapis.com` is verified current at ≥95%, and a hard spend cap is in place
   on that service before any batch run.

## Time Box

Measurement over archived sessions only. Stop and report when questions 1-4 have numbers, even if
the recommendation is "keep what we have."

## Deliverable

A recommendation recorded in this spec, with the per-speaker numbers behind it, plus a verdict on
whether P552 should be reopened, superseded, or closed as refuted.

## Results (2026-09-04)

Run over the archived corpus: **44 two-recorder sessions** pulled from
`gs://claritypledge-ml-training/sessions/`. Reproduce with
`scripts/p1237-crosstalk-scan.py` (RQ2), `scripts/p1237-paths-compare.py` (RQ1/RQ3) and
`scripts/p1237-highsep-crosscheck.py`.

> **Revised after code review, before ship.** The first pass of these numbers was wrong in two
> ways a reader could not have seen. (a) When a recorder's `sessionStartedAt` fell outside the
> correlation search range, the aligner silently degraded to a blind search **and kept the
> "trusted" label**, which also skipped its confidence gate — 4 of the then-20 measured sessions.
> (b) The noise floor was a percentile over all frames including speech, so a speaker who held
> the floor lifted their own channel's floor and *shrank* the computed margin — biasing exactly
> the sessions near the 10 dB threshold. Both are fixed; the corpus was re-run from scratch.
>
> Every headline moved, and all of them moved **against** the first report: median margin
> 7.1 → **4.4 dB**, sessions below the bar 15/20 → **15/18**, start-offset max 126.3 → **51.7 s**,
> the high-separation agreement 57.2% → **59.5%** against a naive rate of 74.0% → **75.0%**. No
> conclusion changed; every one of them is now better supported. The superseded figures are
> recorded here rather than quietly replaced, because [decisions.md](../docs/decisions.md) carried
> them for one commit.

### RQ2 — how much of a neighbour does a co-located phone capture? **The objection is REAL.**

Metric: the **intra-channel dominance margin** — how many dB louder a channel is when its owner
speaks than when the other person speaks. Intra-channel by construction, so it is immune to the
per-device gain bias P569 hit. 18 of the 44 sessions were measurable (the rest had one recorder
dead, no two-sided speech, too little overlap, or an alignment that could not be trusted);
**52 minutes of scored speech**.

Min-of-pair margin per session, sorted (dB):

```
-4.5  0.4  1.0  1.1  1.7  1.9  2.2  2.3  4.4
 4.5  6.7  8.4  8.7  8.7  9.8 11.8 14.5 17.3
```

**Median 4.4 dB. 15 of 18 sessions (83%) sit below the 10 dB bar.** Criterion 2 called the
objection real if a majority fell below 10 dB — it does, by a wide margin. Per-channel
transcription on phones-on-a-table is not safe on its own.

**The probe was controlled before its verdict was believed** (`--controls`, same metric, same code
path): a synthetic *one shared mic* pair with a ±3 dB gain drift reads **3.2 / 3.0 dB**; a
constructed *20 dB separated* pair reads **19.0 / 19.2 dB**. So the eight sessions reading under
3 dB are at the shared-mic floor — acoustically indistinguishable from a single microphone — and
the metric recovers a real 20 dB when one exists.

**Alignment came from an oracle outside the audio, and is refused when that oracle is out of
range.** Envelope cross-correlation is unsafe here: the better the separation, the more
*anti*-correlated the two envelopes are, so its peak weakens exactly where the answer matters
(one session's best blind peak was **negative**). Each recorder writes its own `sessionStartedAt`,
so the offset is read from there and refined within ±10 s; the two independent estimates disagree
by a median of **1.73 s**. `sessionStartedAt` is the session's start on that device, not the
recording's — a late join or a rejoin puts it hundreds of seconds off, which happened on 5 of the
44 sessions. Those fall back to a blind search and must clear the same confidence bar as any other
blind result; two sessions are excluded on exactly that ground.

**The misalignment defect is real, and it was already known.** `audio.py::_merge_wavs()` mixes the
recorders with `amix` **from t=0, applying no offset at all**. Measured start-time offsets:
**median 2.2 s, max 51.7 s** — at the median already beyond a diarizer's tolerance, and at the
maximum, most of a minute of the session laid on top of the wrong minute.

[decisions.md](../docs/decisions.md) 2026-03-22 names this exactly: rejected alternative (D),
*"Pyannote on unaligned amix — the '50/50' result was an artifact of misalignment"*, and the same
entry's Consequences state *"Cross-correlation alignment in audio.py is production-ready (keep
regardless of approach)"*. `git log --all -S` over `services/transcribe/audio.py` returns **zero
commits** containing either `align` or `correlat`. That alignment has never existed in this
repository.

### RQ1 / RQ3 — per-speaker accuracy. **No path beats answering "the dominant speaker" every time.**

Scored on the only hand-labelled audio this repo has: **R8FUEQ, 38 labelled points**, from the
March 2026 P569 benchmark. Both model paths were handed their label→person mapping for free
(production has to earn it in `speaker_map.py`), so these are upper bounds.

| Path | Overall | Dominant speaker (28 pts) | **Minority speaker (10 pts)** |
|---|---|---|---|
| A — merged + pyannote 3.1 (`num_speakers=2`), today's pipeline | 73.7% | 28/28 | **0/10** |
| B — separate-channel, speaker = recorder (P552) | 50.0% | 18/28 | **1/10** |
| C — Gemini 3.5 Transcribe, diarization on | 73.7% | 28/28 | **0/10** |
| naive — always answer with the dominant speaker | 73.7% | 28/28 | **0/10** |

A and C are **numerically identical to the naive baseline**. This is precisely the inflation the
2026-03-22 ruling warned about: three paths that all look "73.7% accurate" and attribute *nothing*
to the person who spoke a quarter of the time.

Supporting measurements:

- **Gemini returned 3 turns for a 9-minute two-person conversation** — one of 182 s, one of 3.6 s,
  one of 364 s. It reported 2 speakers and put almost everything in one.
- **The scores rest on exact localization, not on a fallback.** For both A and C, 37 of the 38
  labelled points fall *inside* a returned segment; exactly one uses the nearest-segment-within-2 s
  fallback, and none are unmatched. So the 0-of-10 results are not an artefact of loose timestamp
  matching.
- **pyannote produced two balanced clusters** (434.7 s and 318.1 s) that do not correspond to the
  two people: scored across shifts of ±10 s in 2 s steps, minority-speaker recall stays 0/10 at
  every shift. Misalignment is not the explanation.
- **Oracle re-check (the stored-truth discipline):** the March hand labels agree with the
  louder-channel signal on **19/38 (50.0%)** — chance. That is consistent with R8FUEQ's measured
  **2.9 / 3.5 dB** margin, i.e. the channel signal carries no information on this session; it is
  not evidence against the labels. It also explains path B's floor here directly: **36 of the 38
  points were transcribed by BOTH channels**, so "speaker = recorder" had nothing to decide on.
- **R8FUEQ is the hard case, and this is n=1.** It sits at the shared-mic floor, so path B is
  being scored where it is guaranteed to fail. No labelled audio exists for a well-separated
  session; producing some is the obvious next measurement.

**The complementary case, run because the one above is unrepresentative**
(`scripts/p1237-highsep-crosscheck.py`). UY9N35 is the best-separated pair measured
(14.5 / 23.8 dB). There is no human label for it, so pyannote is scored against the **channel
oracle** — legitimate at this separation (the scan's known-good control recovers 19.0 dB from a
constructed 20 dB) and independent of pyannote, but agreement with physics, not accuracy against
a person. On a 10-minute slice, **81% of speech frames are physically unambiguous** (|Δ| ≥ 10 dB).
On those frames pyannote agrees **3185/5356 = 59.5%**; counting only the frames it actually
labelled (it leaves 4.3% unlabelled) it agrees **62.1%**. Per speaker: 32.4% and 68.5%. Answering
"the majority speaker" every time would score **75.0%**. **The baseline is below the naive baseline
on the cleanest audio in the corpus too**, on either denominator — so its failure is not an
artefact of R8FUEQ's bad separation.

The same number cuts the other way for path B: where 81% of speech is unambiguous, recorder
identity is a strong signal and diarization is the weak one. The corpus-wide "83% below 10 dB"
verdict is a statement about the *corpus*, not about every session — on the 3 of 18 sessions
above the bar, separate-channel is the path with the physics behind it.

**The pipeline being measured is the option March explicitly REJECTED.** [decisions.md](../docs/decisions.md)
2026-03-22 decided: *"align recordings via cross-correlation, Whisper each phone separately, LLM
merge… **No amix. No pyannote for multi-phone.**"* Today's `pipeline.py` does amix, then pyannote,
for multi-phone. Four artifacts that entry and its neighbours record as done, shipped or
production-ready are absent from every branch in this repository:

| Recorded as | Where | In the repo? |
|---|---|---|
| `get_separate_wavs()` | P552, `status: all-done` 2026-03-19 | never existed |
| `llm_merge.py` | P556 closed *"deployed to prod 2026-03-22"* | never existed |
| `energy_validator.py` | decisions.md 2026-03-22, *"complete with adaptive gates"* | never existed |
| cross-correlation alignment in `audio.py` | decisions.md 2026-03-22, *"production-ready"* | never existed |

And the missing code is not incidental to this measurement. The same ground-truth file's own
`correct` flags reproduce that entry's benchmark exactly — 87% overall, **8/10 on the minority
speaker** — for the LLM-merge path. **The only path ever measured to attribute the minority
speaker is the one that is not in version control.** This spec's own baseline is therefore not a
considered incumbent; it is the pre-March code that the March work was supposed to replace.

### RQ4 — cost per session-hour, measured from billing rather than estimated

Cloud Run `transcribe-session`, 180 days of actuals: GPU €41.53 + CPU €16.96 + memory €7.12 over
254,062 GPU-seconds → **€0.930 per instance-hour** (all SKUs, gross).

Pipeline wall-clock per audio-minute, from `session_transcripts.processing_time_ms` joined to
measured audio durations (24 sessions, prod DB):

| Session length | GPU-min per audio-min | Cost per audio-hour |
|---|---|---|
| < 30 min | 0.172 (median) | **€0.16** |
| ≥ 30 min | 0.772 (median, worst 1.044) | **€0.72** |

P858 recorded "$0.11-0.17 per session-hour" as *"still valid"*. It holds for short sessions only;
cost per audio-hour grows with session length and reaches ~1× real-time on the longest. Also
measured: **40 pipeline runs across 24 sessions (1.7 per session)** — every retry bills.

Gemini: **€1.755 per million audio input tokens** (60 days of actuals) and **25.0 audio tokens per
second** measured directly from a response's usage block → **€0.158 per audio-hour**. Comparable
to the baseline on short sessions, ~4.5× cheaper on long ones. It does not buy better attribution
(table above).

Credit coverage, verified live against the billing export today — not the five-month-old figure
P1236 flagged:

| Service | Jul | Aug | Sep to date |
|---|---|---|---|
| Gemini API | 99.3% | 99.4% | 97.3% |
| Cloud Run L4 GPU | 94.8% over 180 days | | |

**Criterion 3 is NOT satisfied.** Coverage clears the ≥95% bar, but the cap does not exist: both
budgets on billing account `010089-354936-77CD27` are **alert-only** (threshold rules, no spend-cap
enforcement) and neither is scoped to `generativelanguage.googleapis.com`. A spend cap is a
precondition for any Gemini batch run, and creating one is a prerequisite task, not a detail.

### RQ5 — the 30-minute cap with diarization OFF. **Worse than the cap: it is silent.**

Same 58-minute file, two calls differing only in the diarization keys.

- **diarization ON** → hard refusal, `Invalid input received.` The cap rejects; it does not truncate.
- **diarization OFF** → HTTP success. **87,020 audio input tokens billed** (the full 3,481 s at the
  measured 25 tok/s), 8,834 characters returned, no timestamps, **no warning of any kind**.

Coverage measured against a local Whisper transcript of the same file, 4-gram overlap per 5-minute
bucket:

```
  0- 5 min : 22%      20-25 min : 1%      40-45 min : 0%
  5-10 min :  0%      25-30 min : 0%      45-50 min : 0%
 10-15 min :  0%      30-35 min : 0%      50-55 min : 0%
 15-20 min :  0%      35-40 min : 0%      55-60 min : 0%
```

**The answer to RQ5 is not "the cap doesn't apply".** With diarization off the request is accepted
and billed for the whole file while returning a transcript of roughly the opening five minutes.
Hypothesis *"it is an output-token limit"* was tested and refused: an identical request with
`max_output_tokens=65536` returned **byte-identical** text. (Server-side caching of an identical
request cannot be excluded as an alternative explanation for the byte-identity.)

### Decision, against the pre-registered criteria

**Keep the current pipeline. Adopt neither replacement.** Criterion 1 asked for separate-channel
only if its per-speaker accuracy is at least as good — it is not (50.0% vs 73.7% overall, and it
loses the dominant speaker without gaining the minority one). It then asked for Gemini only if
Gemini beats the baseline per-speaker — Gemini ties it, digit for digit.

That is the pre-registered outcome, and it is **not an endorsement of what ships**. The baseline
scores 0/10 on the minority speaker: it is not better than the replacements, it is equally absent.
"Keep what we have" here means "no candidate earned a change", not "the current pipeline works".

Three consequences the measurement forces:

1. **P552's premise is refuted for the conditions actually recorded.** *"Each phone IS one
   speaker"* is false on phones-on-a-table: 83% of sessions are below 10 dB and eight are at the
   shared-mic floor. It is **untested**, not refuted, for [P1236](p1236_server_side_live_transcription_for_rooms.md)'s
   answered setup — lavalier per person, each into its own phone — which is a different acoustic
   situation and the one where the design should work. P1236's RQ2 bar must be re-measured on the
   first lavalier session; none of this corpus was recorded that way.
2. **The `_merge_wavs` t=0 alignment defect is a real bug**, is upstream of every attribution
   result above, and was diagnosed in March. Fix it on its own merits before any further
   attribution work — each recorder's events file already carries the offset, so no
   cross-correlation is needed to do it.
2b. **The question this spec was asked no longer has the shape it was asked in.** It compared two
   candidates against an incumbent, and the incumbent turns out to be a rejected design that
   survived because its replacement was recorded as shipped and never committed. Before choosing
   an engine, someone has to decide what the March work's disposition actually is — rebuild,
   abandon, or supersede — because "keep the current pipeline" currently means "keep the option
   that was rejected in March and never replaced".
3. **Attribution quality is the open problem, not the choice of engine.** All three engines tie or
   trail the naive baseline — on the worst-separated session *and* on the best-separated one; the
   only measured path that ever beat it on the minority speaker is not in version control.
4. **The one shape worth building is conditional, and the condition is measurable per session.**
   Where the margin clears 10 dB, recorder identity beats diarization on the same audio. So the
   design that survives this measurement is neither "always separate-channel" nor "always
   diarize": run the margin measurement first and branch on it. That is a different spec — this
   one's job was to decide, and its answer is that no unconditional replacement earned adoption.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| P552's `all-done` status hides that nothing shipped, and this spec repeats it | MITIGATE | Deliverable is a recorded number, not a status change; a path is only adopted after it beats the baseline on the same audio |
| Overall-accuracy framing hides a per-speaker regression | MITIGATE | Criterion 1 is per-speaker by construction — the 2026-03-22 ruling |
| Archived sessions are unrepresentative of current recording conditions | ACCEPT | They are the only labelled audio that exists; note the caveat with the result |
| Gemini mis-renders proper nouns | ACCEPT | Documented in `/slava:util:diarize`. Names are never evidence of who spoke; attribution comes from channel or diarization label |

**Non-Goals**
- Do NOT change the live path — that is [P1236](p1236_server_side_live_transcription_for_rooms.md).
- Do NOT deploy any replacement in this spec. It produces a decision; adoption is separate work.
- Do NOT re-enable Vertex AI.
- Do NOT re-litigate P556/P568/P569's energy approach — it is superseded by both candidates here.

## Done-When

- [x] All three paths run over the same archived multi-phone sessions, per-speaker accuracy recorded
      — R8FUEQ, 38 labelled points, table in Results. **Scope limit stated rather than hidden:**
      the corpus holds exactly one hand-labelled session, so the three-way comparison is n=1 and
      lands on the least favourable session for path B. RQ2 ran on all 20 measurable sessions.
- [x] Cross-talk dominance measured in dB per channel, answering research question 2 with a number
      — median 4.4 dB, 15/18 sessions below the 10 dB bar, probe controlled at 3 dB / 19 dB
- [x] Cost per session-hour recorded per path, with current credit coverage verified against billing
      — €0.16 (<30 min) / €0.72 (≥30 min) baseline, €0.158 Gemini; coverage 99.4% / 94.8%
- [x] A recommendation written here against the pre-registered criteria above
- [x] P552 explicitly reopened, superseded, or closed as refuted — not left `all-done` with unshipped code
      — **superseded by this spec.** Its premise is refuted for phones-on-a-table (measured) and
      untested for lavalier-per-phone (P1236's setup, no audio exists). Do not reopen it as
      written; the lavalier case belongs to P1236's RQ2, and the `_merge_wavs` alignment defect
      it never noticed needs its own fix.

## Related

- [P552](done/23_mar_26/p552_separate_channel_transcription.md) — specified this in March, closed
  `all-done`, mechanism absent from the code (verified above).
- [P558](p558_gemini_transcript_speaker_correction.md) — parked; calls itself *"the seed of the
  transcription redesign."* This spec is that redesign; P558 should be superseded by whatever this
  concludes.
- [P1236](p1236_server_side_live_transcription_for_rooms.md) — the live half. If P1236 resolves to
  acoustically-separate streams, this spec's scope narrows to single-mic `/live` sessions only.
- [P858](done/2026-04-22/p858_event_driven_transcription.md) — the pipeline this would replace.
