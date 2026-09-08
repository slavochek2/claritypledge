---
status: in-progress
type: task
disclosure: public
rank: 1000066
workstream: transcription
created_date: '2026-09-03'
tags: [transcribe, transcription, mobile, gpu, cost]
feature_type: backend
delivery_stage: dev
pipeline_ran: [create-spec, architect, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1236: Server-side live transcription for `/transcribe` rooms

## Problem

**Situation:** `/transcribe` runs browser speech recognition and a `MediaRecorder` on the same
microphone. On 2026-09-01 the founder ran the physical check on a Galaxy S22 over an adb-forwarded
DevTools console — the first time the room's own logs have been read off a real phone.

**Complication:** With the recorder running, recognition opened, received no audio, and ended at
~5.3s with `heard=false` and **no error of any kind**, fourteen consecutive times. Because a
5.3s session clears the `PRODUCTIVE_SESSION_MS` (1500ms) bar, each one reset the restart budget —
so `liveTextStopped` is unreachable and the room reconnects forever while showing nothing. An
isolated A/B on the same device, same page, 25 seconds apart, settled the cause:

```
MODE A (speech only)         FINAL: "windows for you 1 2 3"     heard=true
MODE B (speech + recorder)   chunk 60518B captured               heard=false, ended 5205ms
```

This settles the verdict [decisions.md](../docs/decisions.md) 2026-09-01 left open — *"H1 (mic
contention with `MediaRecorder`) vs H2 (Android ignoring `continuous`) remains P1152's verdict"*.
**H1 is confirmed; H2 is not implicated.**

**Question:** Where should live transcription run, given that the browser cannot record and
recognise on the same phone at once — and given that a fix must cost nothing outside GCP credits?

> Founder framing, verbatim: *"how do we close the loop? Because before we had working, no?"* and
> *"is it because we are both transcribing and recording session? Could that be the problem?"* —
> the hypothesis was correct.

> Founder constraint, verbatim: *"i dont want to pay for anyhting on this - only using google
> serives we can spend credits on please"*

## Appetite

**Blast radius:** High — introduces a runtime service in the live path of every room, and changes
what a live session costs while it runs. **Reversibility:** Medium — the browser path can be
restored by a flag, but audio-capture changes touch consent. **Decision density:** Two real founder
calls (co-location premise; latency-vs-iteration), both marked below.

## Invariants

- Interim (non-final) recognition text MUST NOT leave the participant's browser or reach another
  participant. Inherited from [P1149](done/2026-06-10/p1149_live_room_transcription_chat.md) DW-4.
- Each person consents for their own voice on their own screen; any path reaching audio capture
  MUST fail closed when consent is absent. Inherited from P1149.
- Idle cost MUST remain ≈ €0. [P858](done/2026-04-22/p858_event_driven_transcription.md) eliminated
  a ~€659/mo warm-GPU leak; live transcription structurally re-introduces warm-GPU time, so the
  shutdown path is load-bearing, not incidental.
- Vertex AI (`aiplatform.googleapis.com`) stays DISABLED on this project. Ruling recorded in
  `pp/docs/infra/vertex-ai.md` — Anthropic-on-Vertex receives €0 of Startups credits. Any Gemini
  use goes through `generativelanguage.googleapis.com`.

## Approach

**Step 1 was a measurement, not a build.** It has been run — see the results below. Before choosing
an architecture, it measured how fast the existing GPU service transcribes short chunks **with
diarization removed**. Every throughput number discussed before it (3-5 concurrent speakers per L4)
was extrapolated from P858's batch figure of 5-15 GPU-minutes per 60 audio-minutes and was
UNVERIFIED.

The two shapes the measurement had to distinguish:

- **Chunked** — transcribe each chunk on arrival. Estimated 5-7s behind speech. One design, few
  unknowns. **Correction: "reuse the existing chunk upload path" is not available as written.**
  `use-audio-recorder.ts:174` starts one continuous `MediaRecorder` and flushes accumulated blobs on
  a timer, so only `chunk_000` carries a WebM/EBML header — `audio.py`'s module docstring already
  says so, and it was re-confirmed on real session audio (`chunk_001` alone: *"EBML header parsing
  failed"*; the two catted together decode to the full 59.52s). A chunk cannot be decoded on arrival
  unless the capture side is changed to emit standalone units or the server keeps a per-stream
  decoder open.
- **Streaming** — continuous audio, partial hypotheses. Estimated 1-2s behind. Carries the known
  iterative surface: duplicate words at chunk boundaries, partial-to-final promotion, reconnection
  on a dropped radio.

`[FOUNDER DECISION — ANSWERED 2026-09-04: 4-second slices.]` Founder's reasoning, verbatim: the
surface is login-only and rarely used — *"maximum once per week or so, and then maximum 10 people"* —
so credit cost is not a deciding factor, and *"read while talking is not really the case at all."*
Every named use case (letter generation, points in the feed, who-said-what recall, a question asked
of the transcript) acts **after** a trigger and does not feel the delay. Two do not exist yet and
would: live translation, and a proactive clarity signal mid-conversation.

2 seconds was considered and **rejected on measured quality, not cost** — see Finding 4. A
flush-on-trigger path covers the "letter now" case without shortening the slice.

`[FOUNDER DECISION — ANSWERED 2026-09-04: Gemini 3.5 Transcribe for the live path.]` Chosen on
Findings 6 and 7 — better text with no gate, an identical word count across all 12 runs, flat
latency to 20 concurrent streams, and the deletion of the GPU, the pyannote dependency and per-card
capacity planning. Accepted cost: ~1.3s more per slice, and a dependency on an API rather than a
container we run. Whisper remains the batch engine and the fallback; it is not removed.

**This decision does NOT extend to `/live`'s batch pipeline, and [P1237](p1237_batch_pipeline_gemini_vs_six_steps.md)
is why.** Measured the same day on the same corpus: Gemini's **diarization** ties the current
pipeline digit for digit (73.7% overall, **0/10 on the minority speaker**) — which is also exactly
what answering "the dominant speaker" every time scores. P1237's pre-registered decision is *keep
the current pipeline, adopt neither replacement*. Gemini is better at **transcribing one voice** and
no better at **deciding who spoke**. The live path only ever needs the first, because device
ownership supplies the second.

### Step-1 measurement — RESULT (2026-09-03, revised 2026-09-04 after review)

**Read the strength label on each finding.** A Codex review of the harness and of the first
write-up returned REJECT on the architecture conclusions as originally stated, and it was right on
seven of ten points. The numbers below are the corrected ones; what each does and does not support
is named inline. Harness: `services/transcribe/measurement/`; raw per-chunk JSON in
`gs://claritypledge-ml-training/p1236-measurement/`.

**Method.** A throwaway Cloud Run service built `FROM` the exact production image, one nvidia-L4,
`concurrency=1`, `WHISPER_MODEL=large-v3-turbo`. Input: 168.24s of real `/transcribe` room audio
from five sessions, catted and decoded the way `audio.py` does it. Diarization never invoked. One
run per configuration.

#### Whisper on the L4

Cost columns are per chunk over the steady-state population (chunk 0 excluded); `chunk0` is shown
separately because it was previously folded into the "worst" column and dominated the 30s rows.

| chunk | gate | n | steady n | gated | p50 | p95 | worst (steady) | chunk0 | mean | seq. ceiling | words |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2s | off | 85 | 84 | – | 0.46s | 1.37s | 4.26s | 0.50s | 0.68s | 2.9 | 237 |
| 4s | off | 43 | 42 | – | 0.47s | 3.21s | 6.83s | 0.48s | 0.91s | 4.4 | 205 |
| 8s | off | 22 | 21 | – | 0.55s | 3.12s | 3.38s | 0.56s | 1.07s | 7.5 | 173 |
| 15s | off | 12 | 11 | – | 0.70s | 2.66s | 2.66s | 0.85s | 0.97s | 15.4 | 161 |
| 30s | off | 6 | 5 | – | 1.09s | 1.83s | 1.83s | **5.15s** | 1.06s | 28.4 | 129 |
| 2s | on | 85 | 84 | 40 | 0.57s | 1.30s | 4.46s | 0.14s | 0.53s | 3.8 | 159 |
| **4s** | **on** | 43 | 42 | 12 | **0.67s** | **1.29s** | **7.19s** | 0.70s | 0.77s | **5.2** | 139 |
| 8s | on | 22 | 21 | 3 | 0.84s | 2.11s | 5.22s | 0.86s | 1.17s | 6.8 | 115 |
| 15s | on | 12 | 11 | 2 | 0.99s | 4.67s | 4.67s | 1.19s | 1.42s | 10.6 | 130 |
| 30s | on | 6 | 5 | 0 | 1.98s | 3.18s | 3.18s | 3.81s | 1.98s | 15.2 | 116 |

Two labels that matter, both corrected after review:

- **"seq. ceiling" is NOT a sustainable stream count.** It is `chunk_seconds / mean`, the sequential
  service-rate ceiling at **100% utilization** — the point where queue delay grows without bound. No
  concurrent load test was ever run against the GPU: no contention, no synchronized arrivals, no
  queueing, no HTTP overhead. Five streams at 4s implies 96% utilization against a population whose
  worst sample took 7.19s, longer than one arrival period. **Treat this column as an upper bound
  that cannot be reached, not as capacity.**
- **The "on" gate is NOT `vad.py`.** Production loads `pyannote/voice-activity-detection` and builds
  a new WAV holding only detected speech regions. The harness loads `segmentation-3.0` (the only one
  this token can fetch — see Finding 5) and makes a binary keep-or-drop decision on the whole chunk,
  so kept chunks retain their internal silence. The gated counts and word counts describe that gate.

`p95` at n=5 and n=11 is the slowest one or two samples, not a distribution. Whole-file batch over
the same audio: 10.2-14.9s for 168s, **117-149 words across five runs** — Whisper is not
deterministic here, and that 32-word spread is wider than most differences in the table.

**Finding 1 — the 3-5-speakers-per-L4 estimate is neither confirmed nor replaced.** What is measured
is a service rate: ~1.3 four-second chunks per GPU-second on this trace. Converting that to a stream
count needs a concurrent load test and a tail budget, and neither exists. `[UNRESOLVED: the capacity
number Done-When #1 asks for. What replaced the guess is a measured service rate plus an explicit
admission that the stream count does not follow from it.]`

**Finding 2 — Whisper's per-call cost is largely fixed, so cost scales far slower than audio
length.** 15x more audio per call costs between 1.6x and 3.7x more time depending on which statistic
and which gate — sublinear on every reading, which is the load-bearing part. The earlier "~2.4x"
picked the no-VAD p50 while the capacity column used the mean; that was cherry-picking and is
withdrawn. **"No sweet spot in the curve" is withdrawn entirely** — five points, one run each,
cannot support it.

**Finding 3 — the tail is real at 4 seconds and is the binding constraint.** p50 0.67s but one
steady-state chunk (index 5, not the excluded warm-up) took **7.19s**, longer than the audio it
covered. Verified against the raw trace after review raised the possibility it was chunk 0; it is
not. No queue-depth, deadline-miss or backlog-recovery figure was measured, so the drop/skip policy
this implies is unsized.

**Finding 4 — short chunks hallucinate, on direct reading of the output.** The word counts alone
cannot carry this (n=1, and batch's own spread is 32 words). What can: reading the transcripts. At
4s without any gate, Whisper emitted `"Thank you."` ten times over silence, tokens in other scripts,
and one wholly fabricated sentence — *"And now this time is coming in for space like this. OK, it's
wide a higher authority, so the creator's taste."* At 2s it mangled a proper noun the other
configurations got right (`Galaxy S22` → `GOером XES 22`) and spliced a hallucinated `"Thank you."`
into the middle of a real sentence. **That specific output hallucinated; a general rate is not
established.** This is the signature `vad.py` exists for — its docstring names *P546: Added to fix
hallucinations ("Thank you" x53)*. The lavalier-per-phone design makes a silence gate load-bearing
regardless: each channel is silent whenever its wearer is not talking.

**Finding 5 — VAD would fail open under the reproduced production configuration.** `vad.py:92` loads
`pyannote/voice-activity-detection`, whose weights sit behind `pyannote/segmentation`. The deployed
`hf-token` returns **403 on both** (checked directly against the HF API), so
`Pipeline.from_pretrained` returns `None`, `.to()` raises, and `pipeline.py::_apply_vad` catches it
and falls back to un-stripped audio. `segmentation-3.0`, `speaker-diarization-3.1`, `embedding` and
`wespeaker-voxceleb-resnet34-LM` all return 200 with the same token — which is why diarization works
and VAD does not. **Reproduced on the exact production image, secret and env; NOT observed in a
production run.** No session has been transcribed inside the retained log window, so "has been
broken in production" overstates it — what is established is that the shipped configuration fails
open when the path executes. Filed as P1242.

#### Gemini 3.5 Transcribe on the same audio — measured 2026-09-04

The spec named two credit-eligible paths and the first pass measured one. Same 168.24s, same
4-second slices, **no gate and no normalization on either side** — the fairest comparison available,
and it handicaps Gemini, which gets no preprocessing at all.

Run from Cloud Run in `us-east4` (a laptop run first showed ~5.2s per slice; that was home-network
round trip, and in-region it is not). 43 slices x 4 concurrency levels x 3 repeats = **516 requests,
0 errors**:

| concurrent streams | p50 | p95 | worst | wall for 43 slices | errors | words | empty slices |
|---|---|---|---|---|---|---|---|
| 1 | 1.88-1.93s | 2.32-2.40s | 3.65s | 84-88s | 0 | 132 | 16 |
| 5 | 1.91-1.99s | 2.30-2.40s | 3.39s | 17.8s | 0 | 132 | 16 |
| 10 | 1.84-1.94s | 2.20-2.41s | 3.57s | 9.0-9.6s | 0 | 132 | 16 |
| 20 | 1.92-2.01s | 2.36-2.75s | 3.70s | 5.4-6.1s | 0 | 132 | 16 |

Against Whisper-at-4s (0.67s p50 / 1.29s p95 with the approximated gate, 0.47s / 3.21s without):

| | Whisper on L4 | Gemini |
|---|---|---|
| Words, no gate | 205 | **132** |
| Whole-file reference | 134 | — |
| `"Thank you."` fabrications | 10 | **0** |
| Silent slices left empty | 0 | **16 of 43** |
| Determinism across runs | 117-149 words (5 runs) | **132 words, all 12 runs** |
| Per-slice p50 | 0.67s | 1.9s |
| Scaling | GPU instances, untested concurrently | flat to 20 streams, 0 errors |

**Finding 6 — Gemini does not hallucinate on 4-second fragments, and Whisper does.** It returned
**empty** on 16 of 43 slices rather than inventing filler, and transcribed the one real sentence
with the product name and phone model intact — *"Transcribe and on my Galaxy S22 and still"* —
where Whisper-4s produced *"I tried fixing the loop"* and Whisper-2s produced *"GOером XES 22"*.
132 words against a whole-file reference of 134, **with no gate at all**, where Whisper needed one
and still scored 139. Unlike every Whisper row, this is not n=1: 12 runs returned an identical word
count and identical empty-slice count.

**Finding 7 — Gemini's capacity question does not exist in the form Whisper's does.** p50 is flat
from 1 to 20 concurrent streams (1.93s → 1.93s) with zero errors across 516 requests. Whisper's
stream count needed a load test that was never run; Gemini's was run and shows no degradation at the
sizes this product will see. **Untested above 20; rate limits and their behaviour under sustained
multi-session load are unknown.**

**End-to-end lag**, the number that actually matters and that neither engine's per-slice figure is
on its own: 4s to fill a slice, plus transcription. Whisper ≈ 4.7s, Gemini ≈ 6s. Neither includes
upload, queueing or render — **still not an end-to-end measurement.**

**What Gemini removes from the design:** the GPU (warm-instance cost, the scale-to-zero path, the
P858 failure shape, the unverified multi-card allowance), the pyannote dependency and its gated-model
breakage, and per-card capacity planning. **What it adds:** ~1.3s more latency per slice and a
dependency on an API rather than a container we control.

**Finding 8 — a word straddling a slice boundary IS damaged, and one second of overlap recovers
it.** Measured 2026-09-04 on the same audio, three cuttings of the same sentence
(*"I tried fixing the transcribe and on my Galaxy S22 and it still doesn't work"*):

| cutting | what came back |
|---|---|
| 4s, no overlap | `"Try fixing the"` / `"Transcribe and on my Galaxy S22 and still"` / **`"that work."`** |
| 4s, 1s lead-in overlap | `"tried fixing the"` / `"Transcribe and on my Galaxy S22 and"` / **`"23 and still doesn't work."`** |
| 15s windows | `"Try fixing the transcribe."` / `"and on my Galaxy S22 and still doesn't work."` |

At a clean 4-second cut **`"doesn't"` came back as `"that"`** — the word spanning the boundary is
the one that breaks. With 1s of lead-in, `"doesn't work"` is recovered intact; the cost is that the
overlapped second is transcribed twice (`S22` also re-emerges as a stray `23`), so total words go
132 → 155 and a de-duplication step becomes mandatory rather than optional.

**This corrects the spec's own framing above.** The Approach section attributed
"duplicate words at chunk boundaries, partial-to-final promotion" to the **streaming** option alone.
The chunked option has the same surface — less of it, but it is not absent, and a chunked design
with no overlap silently corrupts roughly one word per boundary instead. **The live path needs
overlapping slices plus de-duplication.** Not optional, and not free.

**Limits on all of the above.** One 168-second recording, one speaker, English, speech-sparse with
long silences — which is the worst case for hallucination and also, per the lavalier design, the
normal case for a per-person channel. Real conversational density is untested for both engines. No
end-to-end latency measurement for either. No cost figure for Gemini at session scale.

### Credit-eligible execution paths

Both are Google services on billing account `010089-354936-77CD27`:

| Path | Credit status | Note |
|---|---|---|
| Cloud Run L4 GPU (existing `transcribe-session`) | **Proven** — the €659/mo leak was credit-masked to ~€12 net | Warm during sessions; cold start ~30s |
| Gemini Developer API (`generativelanguage.googleapis.com`) | **Re-verified 2026-09-03 — holds** | No GPU to keep warm; hard spend caps proven on this exact service (pp `docs/infra/gcp-spend-caps.md`: €0.50 cap tripped in 469s, ~zero overshoot) |

**Credit coverage re-verified 2026-09-03** from the BigQuery billing export
(`billing_export.gcp_billing_export_resource_v1_010089_354936_77CD27`), replacing the Apr 2026
figure the earlier draft flagged as five months old:

| Month | Gemini API gross / credits / net | Cloud Run gross / credits / net |
|---|---|---|
| 2026-07 | €26.07 / −€25.89 / **€0.18** | €31.25 / −€29.56 / **€1.69** |
| 2026-08 | €47.42 / −€47.12 / **€0.30** | €31.06 / −€30.08 / **€0.97** |
| 2026-09 (to the 3rd) | €0.45 / −€0.44 / **€0.01** | €2.06 / −€1.98 / **€0.08** |

Coverage holds at 97-99% on both paths, at ten times April's volume. Two caveats the numbers carry:

- **The pool is finite and its remaining balance is not visible from the CLI** — only consumption
  is exported. A single `PROMOTION` credit does all the work, and its burn is compounding:
  €0.37 (Jun) → €78.70 (Jul) → €185.39 (Aug). Check the console balance before committing to a
  design that structurally increases GPU-hours.
- **A spend cap would not be softened by any of this.** Caps count gross cost with credits excluded
  (pp `docs/infra/gcp-spend-caps.md`), so a cap set as a backstop fires on the €47, not the €0.30.

Cold start must be hidden by waking the transcription path when a participant **joins** the room,
not when the first word is spoken — the consent and join screens supply the cover.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Live sessions re-introduce warm-GPU cost, the P858 failure shape | MITIGATE | Wake on join, shut down on last-member-leave; verify scale-to-zero via billing, not assumption |
| Lavalier dominance is weaker than assumed → per-channel transcription picks up neighbours | MITIGATE | Measure it before building: P1237 RQ2, 10dB bar. Co-located-with-lavs is answered; the dB margin is not |
| 4s fragments transcribe worse than whole files (no surrounding context) | MEASURED (Whisper) / REFUTED (Gemini) | Whisper fabricates whole sentences on un-gated 4s fragments and needs a silence gate. Gemini returns empty on silence and matches the whole-file reference with no gate at all. Findings 4 and 6 |
| VAD fails open under the reproduced production configuration | MITIGATE | Finding 5: `hf-token` is 403 on the two gated repos `vad.py` needs; `_apply_vad` swallows the error. Reproduced on the exact image/secret/env, NOT observed in a prod run. Filed as P1242. **Moot on the Gemini path** — Finding 6 shows it needs no gate |
| Only `chunk_000` carries a WebM header, so chunks are not independently decodable | MITIGATE | Confirmed on real session audio. Either the capture side emits standalone units or the server holds a per-stream decoder; "reuse the existing chunk upload path" is not a drop-in |
| Gemini credit coverage has changed since Apr 2026 | MITIGATE | Re-verify before committing; Cloud Run GPU is the proven fallback |
| Live text becomes slower than the browser path | ACCEPT | The browser path does not work on Android at all; slower and working beats instant and absent |
| Gemini silently truncates long audio when diarization is off | MITIGATE | P1237 RQ5: a 58-minute file with diarization OFF returned HTTP 200, billed all 87,020 audio tokens, and returned a transcript covering roughly the first five minutes — **no warning of any kind**. Harmless for 4s slices (43/43 returned correct text, 12 runs), fatal for any "re-transcribe the whole session on trigger" path. The flush-on-trigger design must transcribe the outstanding tail as slices, never the session as one call |
| Gemini transcription mis-renders proper nouns | ACCEPT | Documented in `/slava:util:diarize` — same name spelled two ways across runs. Names are not evidence of who spoke; attribution comes from stream identity, never from the text |

**Non-Goals**
- Do NOT build `/record` as a separate surface. Server-side capture makes recording a by-product of
  the same single stream — the mic conflict that motivated a split disappears.
- Do NOT re-enable Vertex AI.
- Do NOT change `/live`'s existing batch pipeline in this spec. Replacing Whisper + pyannote with
  Gemini 3.5 Transcribe is separate work, and it only applies where ONE mic captures several people.
- Do NOT modify `useSpeechToText`'s default (non-autoRestart) behaviour — `/chat` depends on it.
- Do NOT remove the `RECORD_AUDIO_WHILE_LIVE` flag until this ships; it is the current mitigation.

## Done-When

- [x] Chunk-transcription throughput with diarization removed is measured and recorded in this spec
      (2026-09-03, corrected 2026-09-04). **The 3-5-speakers-per-L4 estimate is retired but not
      replaced by a GPU stream count** — what is measured is a service rate (~1.3 four-second chunks
      per GPU-second, p50 0.67s / p95 1.29s per chunk) plus an explicit finding that converting it to
      a sustainable stream count needs a concurrent load test that was never run. **For the Gemini
      path the equivalent question IS answered**: flat p50 from 1 to 20 concurrent streams, 0 errors
      in 516 requests
- [x] Co-location and device-routing premises answered and recorded (2026-09-03: one room,
      lavalier per person, each into its owner's phone)
- [x] The remaining founder decision (latency vs iteration) is answered here, after the measurement
      (2026-09-04: 4-second slices; engine answered separately as Gemini 3.5 Transcribe)
- [ ] A spend cap exists on `generativelanguage.googleapis.com` before the Gemini path carries real
      sessions — P1237 criterion 3 found both budgets on the billing account are alert-only and
      neither is scoped to that service. Caps count gross cost with credits excluded, so this is the
      only mechanism that actually stops a runaway
- [ ] A person speaking on a physical Android phone sees their words in the room, verified over the
      adb DevTools console with the log pasted into this spec — the same instrument that produced
      the A/B above
- [ ] Two participants on two physical devices each see the other's words attributed correctly
- [ ] A room that has ended leaves no GPU instance allocated — verified from billing, not inferred
- [x] Current Gemini credit coverage re-verified against billing before any Gemini path is committed
      (2026-09-03, from the BigQuery billing export, superseding the Apr 2026 figure — see
      "Credit-eligible execution paths")
- [ ] Slice boundaries do not corrupt words: overlapping slices with de-duplication, verified by
      reconstructing a known sentence across boundaries and comparing to a whole-file transcript
      (Finding 8 — without overlap, `"doesn't"` became `"that"`). **Partly discharged 2026-09-08 and
      deliberately left unticked.** The de-duplicator exists, is measured over all 43 real slices,
      and `dedup.test.ts` asserts the reconstruction end to end: the no-overlap cut renders
      *"…Galaxy S22 and still that work."* and overlap + de-dup recovers *"…still doesn't work."*
      Two things this criterion asks for are still missing, and neither is cosmetic: (a) the
      comparison is against the whole-file **word count** (134), because no whole-file transcript
      TEXT was ever archived — only the count reached the spec; (b) nothing yet **produces**
      overlapping slices, since the capture side is Stage F. This ticks when a real client emits
      them and the sentence survives that path, not this one
- [ ] `/transcribe` produces a stored recording again (by-product of the server-side stream),
      restoring what the `RECORD_AUDIO_WHILE_LIVE=false` mitigation currently gives up

## Open Questions

1. What is the measured dB margin between wearer and neighbours on a lavalier channel in this room?
   **Still unmeasured — and P1237 has handed it back rather than answered it.** RQ2 ran over 44
   archived sessions and found the median dominance margin is **7.1 dB, with 15 of 20 measurable
   sessions below the 10 dB bar** — but every one of those sessions is *phones on a table*, not
   lavaliers. P1237's own consequence 1 records P552's premise as *"untested, not refuted, for
   P1236's answered setup"* and says the bar must be re-measured on the first lavalier session.
   Reusable instrument: `scripts/p1237-crosstalk-scan.py`.

   **Upper bound measured 2026-09-05 from public data, while the real test is pending.** The AMI
   meeting corpus records each participant in one room on their own close microphone. On
   `ES2002a`, two headset channels, 10 minutes, scored with P1237's own
   `scripts/p1237-crosstalk-scan.py`: **min-of-pair margin 16.5 dB, 96% of speech frames
   physically unambiguous** (157s of scored speech). Against the same instrument, phones-on-a-table
   read a 7.1 dB median with 75% of sessions below the bar. **Close-miking in a shared room clears
   the bar; phones on a table do not.**

   **Strength: upper bound, not a prediction.** An AMI headset sits 2-5 cm from the mouth; a
   lavalier sits ~20 cm on the chest, and level falls with distance, so a lav reads lower than
   16.5 dB by an unmeasured amount. Instrument check: fed two identical channels — true zero
   separation — the script reported *nothing* rather than a margin, so it does not manufacture
   separation from nothing. Its known-good end is validated by P1237's own control run
   (19.0/19.2 dB), not by this one. What this establishes is that the approach is not doomed,
   which was open before; it does not retire the question.

   **What poor separation would cost the live path, sharpened by P1237's numbers:** attribution is
   safe regardless (it comes from device ownership, never from audio). The damage is duplication —
   on R8FUEQ, at the shared-mic floor, **36 of 38 labelled points were transcribed by BOTH
   channels**. Rendered live, that is two people's names against the same sentence on screen. The
   first lavalier session is the cheapest possible test and nobody has recorded one.
2. ~~Does chunked transcription quality hold on 4-second fragments?~~ **ANSWERED 2026-09-03: yes,
   but only with VAD in front of it.** Un-gated 4s fragments fabricate whole sentences; VAD-gated 4s
   output matches the batch transcript (139 vs 134 words on identical audio). Finding 4 above.
   Caveat on the evidence: the test audio is speech-sparse ("test test", counting) with long
   silences, which is the worst case for Whisper hallucination — and also, per the lavalier design,
   the normal case for a per-person channel. Not yet re-run on dense conversational speech.
3. *(Retired 2026-09-08 — answered by [P1237](p1237_batch_pipeline_gemini_vs_six_steps.md)
   RQ5, and the answer is a hard design constraint rather than a clearance. With diarization OFF the
   30-minute cap does not reject: the request is accepted, the whole file is billed, and a transcript
   covering roughly the opening five minutes is returned with no warning. Carried into
   `### Technical Analysis` and Decision 8 — no path may send a whole session or any long
   concatenation to Gemini.)*
4. Does the chunk-length/throughput curve hold for dense conversational speech? Findings 1-3 rest on
   168s of sparse test audio from one speaker. The fixed-per-call-cost mechanism (Finding 2) should
   be speech-independent, but the VAD gating rate (28% at 4s) certainly is not.

## Security Review

*Carried over 2026-09-07 from a parallel `/architect` pass that ran on the main checkout's stale
copy of this spec. **Only this section is carried** — that pass's architecture decisions are
superseded by this branch's L4 measurement, the Gemini engine decision, and Finding 8, and were
discarded rather than merged. The findings below are independent of engine choice: they concern
consent, attribution, storage and abuse bounds, which bind whether the live path runs on Whisper
or Gemini.*

Scope note: P1236 is a research/measurement spec — the server-side live path (chunk/stream ingest → transcription worker → `transcribe_messages` insert) does not exist in code yet. This review grounds every finding in the CURRENT schema/RLS/edge-function code that the new path will sit on top of, and flags every gap that the build sequence must close. Files read: `supabase/migrations/20260823190000_p1149_transcribe_room_tables.sql`, `20260826063353_fix_transcribe_room_member_anon_grant.sql`, `20260901160000_p1207_transcribe_rooms_code_enumeration.sql`, `20260225120000_p425_ai_rate_limits.sql`, `20260404120000_security_backlog_rls.sql`, `supabase/functions/gcs-signed-url/{index.ts,handler.ts,validate.ts}`, `supabase/functions/enqueue-transcription/index.ts`, `supabase/functions/generate-banner/index.ts`, `cloud-functions/gcs-signed-url/index.js`, `services/transcribe/{main.py,config.py}`, `src/app/pages/transcribe-room-page.tsx`, `src/app/data/transcribe-service.ts` (relevant fns), `src/app/data/api.ts:3288-3320`, `src/app/content/privacy.md`, `features/p1162_cap_claritypledge_gemini_spend.md`, `docs/technical/infrastructure.md:59`.

**RLS Policies:**
- ✅ `transcribe_messages.is_final BOOLEAN NOT NULL DEFAULT true CHECK (is_final = true)` (`20260823190000...sql:138`) — a non-final row is structurally uninsertable, not merely "usually isn't sent." Any future server-side writer (worker, edge function using the anon/authenticated client) that tries to persist a partial hypothesis is rejected at the DB level regardless of what the client or the transcription pipeline believes. This is the strongest single control for Invariant #1, **conditional** on the new path continuing to write finals through this table (see ⚠️ below for the case where it doesn't).
- ✅ `transcribe_messages` INSERT policy (`...sql:161-171`) binds `member_id` to `auth.uid()` via `EXISTS (... m.id = transcribe_messages.member_id AND m.profile_id = auth.uid())` — a caller cannot attribute a message to another member's `member_id` even though the client (`sendFinalMessage`, `transcribe-service.ts:226-233`) passes `memberId` as a plain function argument with no server-side re-derivation. The RLS `WITH CHECK` is what actually enforces this, not client discipline.
- ✅ `transcribe_messages` SELECT policy (`...sql:149-157`) requires room membership — confirmed a non-member's `getRoomMessages()` (`transcribe-service.ts:211-220`) returns nothing, because it goes through the same anon-key + user-JWT `supabase` client used everywhere else, not a service-role client.
- ✅ P1207 fix (`20260901160000...sql`) closed room-code enumeration: `transcribe_rooms` SELECT is now membership-scoped, and code resolution goes through `get_transcribe_room_by_code()` (SECURITY DEFINER, exact-match only, no LIKE/prefix/paging) so the code stays a bearer credential, not a listable one.
- ✅ `gcs-signed-url` (`handler.ts`) binds the room-audio-chunk upload to the caller: `getRoomMembership(memberId)` then `m.profileId === userId && m.roomCode === target.code` (`handler.ts` "Bind the caller to the target" block) before forwarding to the signing Cloud Function. Object naming is also constrained (`ROOM_FILE_NAME_RE` only permits `chunk_NNN.webm`), so a member cannot write into another member's prefix or invent arbitrary object names.
- ⚠️ **`transcribe_room_members.display_name`** (`...sql:70`) has only a length CHECK (`1-100` chars) — no format or character restriction — and its value is a plain client-supplied argument to `joinRoom(roomId, profileId, displayName)` (`transcribe-service.ts:167`), not server-derived from `profiles.name`. A modified client can set an arbitrary 100-char string as its own `display_name`. **Required handling:** treat `display_name` as untrusted free text everywhere it is consumed downstream (transcript rendering already does this safely — plain text interpolation — but a Gemini-path prompt must not, see AI Prompt Security table below).
- ⚠️ `ml_training_sessions_insert_authenticated` (`20260404120000...sql:30-33`) is `WITH CHECK (true)` — any authenticated user can insert a row for ANY `session_code`/`user_name`, not just their own. This is pre-existing (not introduced by P1236) but the new server-side pipeline must not add write-path trust based on rows in this table (e.g. trusting `ml_training_sessions.user_name` as a speaker identity) since it is not row-owner-scoped.

**Authentication:**
- ✅ `gcs-signed-url/handler.ts` requires a Bearer JWT resolved via `getUserId()` (Supabase `auth.getUser(token)`) before any other check runs — unauthenticated requests get 401 before touching the DB.
- ✅ `transcribe_room_members` INSERT policy requires `profile_id = auth.uid()` (self-insert only) — a caller cannot join a room as someone else's profile.
- ⚠️ **UNVERIFIED — no server-side authentication artifact exists yet for whatever new ingest endpoint P1236 introduces** (a chunked-upload trigger, or a streaming websocket/gRPC endpoint to Cloud Run or Gemini). Everything audited above authenticates the *existing* chunk-upload path (`gcs-signed-url` → GCS). If the chosen architecture adds a NEW endpoint (e.g., a direct client→Cloud-Run stream, bypassing the signed-URL indirection for latency), that endpoint does not exist in this repo and its auth model is unverified by definition — flag explicitly in the architecture doc, don't assume it inherits `gcs-signed-url`'s guarantees.

**Authorization:**
- ✅ Realtime delivery is defense-in-depth-safe regardless of whether Supabase's RLS-gated `postgres_changes` guarantee holds: `subscribeToRoomMessages`/`subscribeToRoomMembers` (`transcribe-service.ts:242-289`) treat every realtime event as a bare "something changed" signal and always re-fetch via `getRoomMessages()`/`getRoomMembers()` — both RLS-scoped selects through the anon-key client. Even in the worst case (a realtime CDC payload delivered to a non-member — the exact class of vendor-trust gap this repo's own decisions.md 2026-08-12 entry warns against relying on blindly for a *different* table), the client never renders that payload directly; it only triggers a re-query that RLS will deny. **This is the answer to the spec's own "who can subscribe / can a non-member receive another participant's transcript" question: no, by construction of the reload-not-render pattern, independent of the realtime layer's own guarantees.**
- ✅ Ending a room requires membership (`"room members can end the room"` UPDATE policy, `...sql:114-122`).
- ⚠️ **Invariant #3, the spec's own highest-risk item — no code path for it exists yet, and the precedent in this repo shows the correct shape.** The new transcription worker (whatever executes it — Cloud Run `transcribe-session` extension, or a Gemini-calling function) must derive `member_id`/`speaker_id` **only** from the authenticated, already-validated GCS object path prefix (`rooms/<code>/<who>-<memberId>` — parsed today by `parseUploadTarget`/`ROOM_PREFIX_RE` in `validate.ts` and re-validated against `getRoomMembership` at upload time) — **never** from a field inside the transcription job's own trigger/webhook payload. This mirrors the exact mitigation this codebase already applies for P858: `enqueue-transcription/index.ts`'s docstring states "the task body carries job_id ONLY. Session fields always come from the DB via the atomic claim's RETURNING" — the new pipeline must apply the identical pattern to speaker attribution. Concretely: whatever inserts into `transcribe_messages` on the server side needs to (a) run as a caller whose `auth.uid()` matches the member (reusing RLS as today), OR (b) if it runs as service-role (bypassing RLS, which a Cloud Run worker likely will), it MUST re-derive `member_id` from the GCS object key the audio was read from and independently re-verify `room_id`/`member_id` consistency against `transcribe_room_members` before writing — service-role bypasses RLS, so the WITH CHECK in the migration does **not** protect this path once a service key is introduced. **Name this explicitly in the the build sequence**: "Speaker/member attribution for server-side transcript writes MUST be derived from the validated upload path server-side, never accepted as a field in any job payload, trigger body, or client-supplied request — service-role writes bypass the RLS binding that currently protects `sendFinalMessage`."

**Input Validation:**
- ✅ `gcs-signed-url/validate.ts` is thorough for the existing chunk-upload surface: `SESSION_CODE_RE`/`ROOM_PREFIX_RE` bound the shape of `sessionCode`, `FILE_NAME_RE` + `ROOM_FILE_NAME_RE` bound file names to `chunk_NNN.webm` only, `CONTENT_TYPE_RE` bounds the codecs parameter, and `isConsistentFileType` binds extension↔content-type (closing a real found-and-fixed class: JSON stored under a `.webm` key or vice versa).
- ⚠️ UNVERIFIED — no equivalent validation exists yet for whatever payload shape a Gemini or Cloud-Run streaming call would take (chunk size limits, max chunk count per room, audio duration bounds). Must be specified before any the build sequence step that adds a new ingest surface.

**Data Protection:**
- ⚠️ **Retention / bucket ACL — UNVERIFIED, not inferable from this repo.** The actual signed-URL-minting Cloud Function (`cloud-functions/gcs-signed-url/index.js`) only mints a 15-minute **write** URL (`index.js:84-90`) and sanitizes path segments; it says nothing about the bucket's IAM bindings, uniform bucket-level access, public-access-prevention, or a lifecycle/retention rule. No `lifecycle.json`, no `gsutil lifecycle set`, no retention doc for `gs://claritypledge-ml-training` exists anywhere in this repo (`grep -rn "lifecycle\|retention" docs/ scripts/` — zero hits for this bucket). Given transcribe-room audio is explicitly described in `privacy.md:104-106` as pseudonymous (voice can re-identify), **do not mark this ✅ — verify via `gsutil iam get gs://claritypledge-ml-training` and `gsutil lifecycle get gs://claritypledge-ml-training` before shipping**, and record a retention period in the Pre-deploy Checklist per `.claude/rules/features.md`'s Secrets & External Services trigger (this introduces a new external-data-flow surface even without a new key).
- ⚠️ **Consent is client-side state only — the documented "nothing is captured before you do [consent]" promise (`privacy.md:111-112`) is currently satisfied ONLY because `RECORD_AUDIO_WHILE_LIVE = false` disables the entire capture branch as dead code** (`transcribe-room-page.tsx:54,133-166`). `consentGiven` is a React `useState` boolean (`transcribe-room-page.tsx:63`), never sent to the server, never persisted — `joinRoom(roomId, profileId, displayName)` (`transcribe-service.ts:167`) has no consent parameter, and `transcribe_room_members` has no `consent_given_at` column (grepped: zero hits). The `gcs-signed-url` handler's authorization check is membership-only (`isMember = m.profileId === userId && m.roomCode === target.code`) — it has no way to know or check whether consent was given, because the server has no record of it. **The moment this spec flips `RECORD_AUDIO_WHILE_LIVE` to true (its explicit Done-When goal), fail-closed stops being true by construction and becomes true only by client cooperation.** Required handling: add a server-persisted consent flag (e.g. `transcribe_room_members.consent_given_at TIMESTAMPTZ`, set only via the join RPC/insert itself, i.e. consent and join become the same atomic server-side event) and gate the `gcs-signed-url` room-membership check (and/or a corresponding gate on whatever new ingest endpoint is added) on `consent_given_at IS NOT NULL` — not on trusting that the client only calls `startCapture` after the checkbox was toggled. A replayed or scripted request with a valid JWT for a genuine room member, sent without ever rendering the consent screen, currently would not be distinguishable server-side from a consented one, once capture is enabled.
- ⚠️ **Third-party AI disclosure gap if the Gemini path is chosen.** `privacy.md:108-115` (`### Transcribe rooms`) currently discloses only: audio → "our Google Cloud Storage bucket" → "a corrected transcript is produced afterward" — worded to describe the existing self-run Whisper/pyannote Cloud Run pipeline (matches the `/live` paragraph immediately above it, `privacy.md:78-80`: "our own transcription service — software we run on Google Cloud"). The separate Gemini disclosure block (`privacy.md:150-163`) lists only `/chat` and banner/image generation as going to `generativelanguage.googleapis.com` — **transcription is not listed**. If P1236 routes room audio (voice — biometric-adjacent per the spec's own framing) through the Gemini Developer API, the current privacy policy does not disclose that flow, and the DPA table (`privacy.md:261-263`, "Google Gemini API" row) does not list transcript/audio content either. **Required before shipping the Gemini path**: update `privacy.md`'s Transcribe rooms section and the Gemini API disclosure row to name audio/transcript content, and confirm this doesn't need a fresh consent capture (the existing consent copy — "Recorded and visible to everyone in this room" — makes no mention of a third party at all).
- ✅ No participant email/name is embedded in the GCS **object path** beyond the already-sanitized display name (`sanitizeParticipantName`) and the room member UUID — the object key itself doesn't leak more PII than P1223 already reviewed for the `/live` path.

**AI Prompt Security (Gemini path):**

The spec does not yet specify what, if anything, is sent to Gemini besides raw audio bytes (e.g., a system prompt with vocabulary hints, participant names for spelling assistance, or diarization-adjacent instructions). Classify every candidate variable before any prompt is written, using this repo's own precedent (`generate-banner/index.ts:227-231` already interpolates DB-sourced `profiles.name` into a Gemini prompt via `buildProfilePrompt`) as the pattern NOT to repeat unexamined:

| Variable | Origin | Classification | Required handling |
|---|---|---|---|
| Raw audio bytes | Participant's own lavalier/phone mic, via `getUserMedia` | Sensitive (biometric-adjacent voice data), but not a text-injection vector to the model itself | Send only after server-side consent + membership check (see Data Protection ⚠️ above); do not additionally forward to any prompt field as base64-in-text if a multimodal API path exists — use the API's native audio content part, never string-embed it |
| `transcribe_room_members.display_name` | **Client-supplied at join** (`joinRoom` argument), not server-derived from `profiles.name` — length-checked only, no content filter | **Untrusted**, despite living in "our DB" | If used as a vocabulary/spelling hint in a Gemini prompt (to reduce the "mis-renders proper nouns" risk the spec already accepts), treat as untrusted user input: never place inside a system-instruction string unescaped; if passed as a "known names" list, pass as a structured/typed field the model is instructed to treat as data, and truncate/strip control characters and instruction-like phrases. Do not assume the 1-100 char length CHECK bounds content — it does not |
| `transcribe_rooms.code` | Server-generated (`generateTranscribeRoomCode()`), not user-typed at generation time | Trusted identifier, but a bearer credential (P1207) | Fine to reference in a prompt as an opaque id; never log/echo it back to a client in a way that re-exposes it beyond current membership scoping |
| `transcribe_room_members.id` (member/speaker UUID) | Server-generated | Trusted | Safe to use as the sole attribution key server-side (per Invariant #3 handling above); never let the model's output text substitute for this — spec already accepts "Gemini transcription mis-renders proper nouns... attribution comes from stream identity, never from the text" |
| Any prior room chat text (`transcribe_messages.text`) | Written by OTHER participants' finalized speech, free text, no content filter beyond non-empty | **Untrusted** — this is user-generated content from potentially any room member | If future context-window design ever feeds prior transcript lines back into a Gemini call (e.g., for context continuity across chunks), treat as untrusted; a participant could speak an injection-style phrase ("ignore prior instructions and...") that becomes stored text and later gets fed back as trusted context |

**Checklist:**
- [ ] Confirm whether the chosen Gemini call is pure audio-transcription (no text prompt beyond a fixed system instruction) or includes any DB-sourced text — if the former, most of the above table is moot and should be noted as N/A in the architecture doc, not silently dropped
- [ ] If a system instruction is used, keep it a fixed string with no interpolated variables at all where possible — the safest posture given the table above
- [ ] Re-verify Gemini credit coverage before committing (spec Done-When item, unrelated to injection but gating the whole path)

**Cost / Abuse Controls:**
- ⚠️ **No rate limit exists for this surface today.** `ai_rate_limits` (`20260225120000_p425...sql`) is a reusable per-user burst/sustained pattern (10/5min, 30/60min) but its only historical consumer, `story-guide-chat`, was retired by P803 — it is not wired to `/transcribe` at all. There is no per-user or per-room cap on: rooms created, chunks uploaded per room, or room duration. **Required limit** (name it concretely so a the build sequence step can implement it): a server-enforced **maximum room duration** (e.g., hard-stop and `endRoom()`-equivalent server-side after N minutes, not just a client-side clock — a client can stay joined indefinitely since `endRoom` is caller-initiated only, `transcribe-service.ts:300-308`) plus a **per-user concurrent-room limit** (currently unbounded — nothing stops one profile from creating N rooms and streaming audio into all of them simultaneously) reusing or extending the `ai_rate_limits` pattern, scoped to whichever billed call (GPU invocation or Gemini call) is chosen.
- ✅ **CORRECTED 2026-09-07 — this item was false when written, and the way it was produced is the
  finding.** It originally read *"Gemini spend cap does not exist and the key is currently dead in
  prod"*, sourced from P1162's own **Measured** section — which had read the **test** environment
  and reported it as production. The claim then travelled: a security subagent read the spec, the
  parent merged it here unverified, and it reached three places in this file. Gate 9 exists for
  exactly this and did not fire. **Current state (P1162, closed 2026-09-07):** both spend caps are
  reported live and `Configured` on their own projects, scoped to
  `generativelanguage.googleapis.com` — EUR 50 prod-interactive (`aikey-cp-prod-inte-81368`),
  EUR 75 batch (`aikey-cp-batch-81413`); the prod `GEMINI_API_KEY` was migrated onto the capped
  key and exercised against prod; the dead 39-character key is retired from test Supabase and
  Secret Manager.
  **Epistemic caveat, load-bearing given how this item was born:** spend caps are **console-only
  and invisible to every script** — `gcloud billing budgets list` does not return them, so *a cap
  that exists is indistinguishable from one never set* (pp `docs/infra/gcp-spend-caps.md`, verified
  2026-08-24). I confirmed by command only what is confirmable: P1162 is closed and on origin, and
  both named projects exist on billing account `010089-354936-77CD27`. **The cap amounts and their
  Configured status rest on a console observation reported by another session, not on any check I
  or any script can run.** Recorded as reported-verified, not self-verified.
- ⚠️ No abuse control on `gcs-signed-url` request volume itself — the handler validates identity/ownership per request but does not rate-limit how many signed-URL requests (hence GCS PUT operations, hence downstream transcription triggers) one member can issue per minute. Continuous audio streaming from N participants × unbounded chunk frequency is the direct cost driver named in the spec's own Risk #7.

**Denial-of-wallet (P858 shape):**
- ✅ The EXISTING batch pipeline (`services/transcribe/main.py`, `docs/technical/infrastructure.md:59`) is architected correctly against the P858 leak: `min-instances: 0` (scale-to-zero), `--concurrency=1`, event-driven `/transcribe-async` triggered per-job via Cloud Tasks with an atomic claim (`storage.py: claim_pending_job`), and a `/sweep` janitor that "cannot keep the GPU warm (it is NOT a 5-min work-poll)" (`main.py:158` comment). This is a real, shipped, previously-broken-then-fixed mechanism — not a hoped-for scale-to-zero.
- ⚠️ **That mechanism does not yet extend to a LIVE session.** The existing pattern's safety comes from each unit of work being short and bounded (one batch job, then the instance can scale down). A live room is, by definition, long-lived and continuous for the duration of the conversation — the spec's own Invariant ("Idle cost MUST remain ≈ €0... live transcription structurally re-introduces warm-GPU time, so the shutdown path is load-bearing, not incidental") is asserted but **no shutdown mechanism for the live case exists in code yet**. Concretely unresolved and required before ship: (1) what triggers the GPU/Gemini path to stop when a room ends normally (`endRoom()` exists but nothing currently calls back into the transcription infra — `endRoom` only sets `ended_at` and calls `createTranscriptionJob('', m.sessionId)` for the OLD batch flow, `transcribe-service.ts:300-308`); (2) what happens on **abnormal** termination — a participant's browser crashes or loses network mid-room without calling `endRoom` — is there a server-side idle/heartbeat timeout that tears down the GPU instance or Gemini session, or does it wait for `ended_at` that may never be set? This must be answered and verified against **billing**, per the spec's own Done-When item, not inferred from the batch pipeline's unrelated (and correct) scale-to-zero design.

### Addendum — engine-specific (2026-09-08)

*Covers only what the engine-independent Security Review (line 411 of the w5 spec, carried over 2026-09-07 — consent/attribution/storage/abuse-bounds findings) does not reach, now that both founder decisions are answered: **4-second slices, no streaming**, and **Gemini 3.5 Transcribe** as the live engine. The findings in that section still stand unchanged and are not repeated here.*

**Data Protection (third-party disclosure — a confirmed gap, not a conditional one):**
- ⚠️ Confirmed by reading `src/app/content/privacy.md`: the "Transcribe rooms" section (`privacy.md:104-115`) describes audio going to "our Google Cloud Storage bucket" and a transcript "produced afterward" — worded for the self-run Whisper/pyannote pipeline. The Gemini disclosure block (`privacy.md:150-163`) and the DPA table row for "Google Gemini API" (`privacy.md:261-263`) list `/chat` and banner/image generation as Gemini consumers; neither lists transcription. **Required handling: update `privacy.md`'s Transcribe rooms section, the Gemini disclosure block, and the DPA row to name room audio/transcript content before this ships — this is no longer a conditional "if Gemini is chosen" risk, since it is chosen.** The in-room consent copy ("Recorded and visible to everyone in this room") also names no third party and needs the same update.
- UNVERIFIED: whether Gemini API audio submitted via `generativelanguage.googleapis.com` is used for model training or retained beyond the request, at this product's tier/terms. **Required handling: confirm before shipping — determines whether the privacy-copy fix above is sufficient or a DPA/terms escalation is also needed.**
- Billing/project: per the w5 spec's "Credit-eligible execution paths" section, Gemini calls run on billing account `010089-354936-77CD27`; per P1162 (below), the isolated project for this consumer is `aikey-cp-batch-81413`.

**API Key Handling:**
- ✅ Confirmed by grep: `GEMINI_API_KEY` is held server-side only. `.env.local:88` holds the value; `.env.local:71-78` documents deploying it via `npx supabase secrets set GEMINI_API_KEY=...` — i.e. a Supabase Edge Function secret, not a client-bundled variable. `grep -rn "VITE_.*GEMINI\|VITE_.*GOOGLE" src/ .env*` returned **zero hits** — no `VITE_`-prefixed Gemini/Google key exists in client-reachable code. `services/transcribe/*.py` (the Cloud Run measurement harness) has no `GEMINI`/`api_key` reference at all — it is Whisper-only; the Gemini measurement in Findings 6-8 ran from a separate script whose own key handling was not located in this pass (UNVERIFIED). **Required handling: whichever service ends up making the live Gemini calls (new edge function or Cloud Run job) must pull the key from a Supabase/GCP secret at deploy time — never inline it in `services/transcribe` config or any client-reachable code — and must be registered in `.private/docs/edge-function-secrets.md` per the P834/`check-edge-function-secrets.sh` gate P1162 treats as authoritative.**

**Spend and Rate Limiting on a Continuously-Billing Live Path:**
- ⚠️ P1162 (`features/done/2026-06-10/p1162_cap_claritypledge_gemini_spend.md`, all-done 2026-09-07) is the only spend cap that currently applies to this engine. It provisioned two isolated GCP projects with per-project caps on `generativelanguage.googleapis.com`: `aikey-cp-prod-inte-81368` (€50/mo, the two banner functions) and **`aikey-cp-batch-81413` (€75/mo)** — P1162's own text names consumers as *"P1237 batch transcription, P1236 if it lands, agent tooling"* and separately warns: *"P1236, if it lands, puts Gemini in the live path of every room — restoring a genuinely user-facing blast radius."* The €75 figure is sized from **batch** unit costs (EUR 0.158/audio-hour), not a live, per-room, continuously-billing workload, and it is shared project-wide across three unrelated consumers — no per-room or per-member dimension exists.
- ⚠️ `ai_rate_limits` (`supabase/migrations/20260225120000_p425_ai_rate_limits.sql`) is a generic `(user_id, called_at)` burst/sustained limiter (RLS: `SELECT`-own only, service-role insert), scoped by its own header comment to `story-guide-chat`, which P803 retired (per P1162: *"the deployed copy is retired"*). UNVERIFIED whether anything still inserts into it. Even if reused, it caps a **user's call rate**, not a **room's session duration or GPU/API-minutes** — a different shape than P1236's continuous per-room billing.
- **Required handling, as imperatives for the Build Sequence:**
  1. Do not rely on the €75/mo `aikey-cp-batch-81413` cap alone as the abuse bound for the live path — it is a monthly backstop shared with an unrelated batch consumer and agent tooling, sized from batch economics, and (per P1162's own overshoot note) can take minutes of burn to trip. It is the right *fuse*, not a *rate limit*.
  2. Add a per-room and/or per-member bound before shipping live: cap concurrent live rooms per profile, and enforce a hard maximum live-session duration per room server-side (the same control the engine-independent review already requires for GPU-wake abuse — it applies identically to Gemini, since both bill per wall-clock time the room stays open). Extend `ai_rate_limits` or a new room-scoped table; do not leave the monthly project cap as the sole backstop.
  3. Verify, before shipping, that `aikey-cp-batch-81413`'s €75 cap is not silently exhausted to zero headroom by concurrent P1237 batch runs sharing the same project — P1162 only mitigated this class of risk for prod-interactive-vs-batch (separate projects); batch-vs-live-P1236 sharing ONE project is not similarly mitigated by anything read in either pass.

**P1237 RQ5 — the silent 30-minute-cap non-refusal, as a live-path finding:**
- ⚠️ P1237 (`features/done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md:281-299`, "RQ5") measured that with diarization OFF — the mode P1236's live path uses, per Findings 6-8 (no diarization anywhere in the Gemini path) — Gemini's documented 30-minute cap does not refuse: a 58-minute file returned **HTTP 200**, billed the **full 87,020 input audio tokens**, and returned a transcript covering only roughly the first five minutes, with **no error, warning, or partial-response signal of any kind**. The w5 spec's own Risk table already names this ("Gemini silently truncates long audio when diarization is off") and states the mitigation as design intent: slices only, never a whole-session call. That is correct in shape but not yet an enforced guarantee — no code exists yet (P1236 is still pre-implementation).
- **Required handling:** enforce a hard per-Gemini-request audio-duration ceiling in whatever code calls `generativelanguage.googleapis.com`, well under 30 minutes. The 4-second-slice design satisfies this by construction today, but any future code path that batches multiple slices into one call, retries a failed slice by resending a wider window, or implements a "re-transcribe from session start" recovery must be bounded by an explicit assertion/guard — not by design intent alone. Treat any path that could construct a large single request as BOTH a denial-of-wallet surface (full-file token billing with no refusal) AND a correctness surface (silent partial transcript, no signal to the caller) — both fire from the same root cause.

**Finding 8's overlap/de-dup merge — integrity surface:**
- ⚠️ `transcribe_messages` has no sequence-number or slice-index column (per the engine-independent review's own read of `20260823190000_p1149_transcribe_room_tables.sql`: only `id`, `room_id`, `member_id`, `text`, `spoken_at`, `is_final`, `created_at`). The overlap/de-dup merge step (new code, not yet written) needs to order and de-duplicate overlapping slice text before insert. If ordering is inferred from client-controlled upload timing, a client could reorder or replay slice uploads to make the merge emit wrong or duplicated text. **Required handling: the merge step must key slices by a server-assigned monotonic index (assigned on receipt, e.g. from the GCS object's server-observed upload sequence or an explicit counter the ingest endpoint stamps) — never a client-supplied sequence field.** This is the same "never trust client-supplied ordering" principle the engine-independent review applies to attribution, applied here to sequencing.
- ⚠️ The merge necessarily produces an intermediate, pre-dedup candidate text (the overlapping raw slice outputs) before the final deduplicated text is known. **Required handling: never write this intermediate/candidate state to `transcribe_messages`, even transiently — no insert-then-fix-up pattern. Perform the merge in the worker's own memory/private staging structure and INSERT only the final, deduplicated, `is_final = true` row.** This closes a slicing-design-specific way the interim-broadcast invariant (engine-independent review, Data Protection) could otherwise be violated: not browser-interim leaking, but merge-step working-state leaking. The existing `is_final = true` CHECK constraint on the table does not by itself prevent a premature/partial insert — it only prevents a `false` value, so this must be enforced by never attempting such an insert in the first place, not by the CHECK catching it.

**Finding 5's fail-open VAD — moot for this engine, stated explicitly:**
- ✅ Finding 5 (VAD fails open under the reproduced production `hf-token` config: `pyannote/voice-activity-detection` returns 403, `_apply_vad` swallows the error, audio passes through un-gated — filed as P1242) is real but **moot for P1236 as scoped**, because Findings 6-7 establish Gemini needs no VAD gate (empty output on silent slices, no hallucination across 12 runs) — the w5 spec's own Risk table already marks this "Moot on the Gemini path." Confirmed by reading Findings 5-7 together: nothing in the live path as scoped (4s slices → Gemini, no diarization, no VAD) calls the code path that fails open.
- **What failing open would mean for cost and consent, if it applied:** a VAD gate that fails open (passes all audio through un-gated on dependency failure, as Finding 5 reproduces) is a cost problem (every silent slice still gets billed as if it were speech, removing the gate's entire cost-saving rationale) AND a scope/consent problem (audio is processed regardless of whether voice activity was actually present — the gate's purpose is partly to bound *what* gets sent onward, and failing open means that bound silently disappears whenever the dependency is unavailable, with no signal to the caller or to consent tracking that a wider-than-intended slice of audio was processed). Neither applies to P1236's current Gemini-only scope. **Required handling: none for this spec as scoped — but the Build Sequence must not silently reintroduce a VAD dependency (e.g., a future cost-optimization that routes some slices back to Whisper) without first re-closing P1242, since that would reopen exactly this fail-open exposure.**

## Related

- [P1152](p1152_transcribe_physical_device_verification.md) — holds PV-1, whose outcome this
  session's measurement supplies. PV-1's cause is now known; the check itself still needs re-running
  post-fix.
- [P1149](done/2026-06-10/p1149_live_room_transcription_chat.md) — the room this changes.
- [P1196](done/2026-06-10/p1196_transcribe_live_text_dies_on_mobile.md),
  [P1213](p1213_transcribe_reconnect_loop_never_terminates.md) — two prior fixes to the restart
  loop. Both were correct and neither could work, because the recognizer was never receiving audio.
- [P858](done/2026-04-22/p858_event_driven_transcription.md) — the batch pipeline and the warm-GPU
  cost lesson this must not repeat.
- P556 / P568 / P569 — speaker attribution via cross-phone energy. Retired only if the co-location
  question resolves to "acoustically separate".

## Technical Architecture

*Written 2026-09-08 against this branch's copy of the spec. A previous `/architect` pass ran on the
main checkout's stale copy and its decisions were discarded (see the note at the head of
`## Security Review`); this pass reads the Step-1 measurement, both answered founder decisions, and
Findings 1-8 as its inputs, which that pass could not.*

### Technical Analysis

#### What is already decided, and what this section is therefore not allowed to reopen

Two `[FOUNDER DECISION]` markers in `## Approach` are **answered** (2026-09-04): **4-second slices**
and **Gemini 3.5 Transcribe** for the live path. The chunked-vs-streaming fork is closed. Every
decision below is downstream of those two and does not re-litigate either. Nothing here re-opens
them; where analysis touched a reason the founder might want to revisit one, it is written as a
flagged risk in this section rather than as an alternative design.

#### The measured numbers, carried forward — not re-derived

Source: the Step-1 harness at `services/transcribe/measurement/` (commit `dd620ab2c`, corrected in
`a527faf3f` after the Codex review), raw per-chunk JSON in
`gs://claritypledge-ml-training/p1236-measurement/`. Full tables in
`### Step-1 measurement — RESULT` above. The three figures the architecture actually rests on:

| Quantity | Measured value | What it does and does not license |
|---|---|---|
| Gemini per-slice latency, 4 s slices, in-region | **p50 1.88-2.01 s, p95 2.20-2.75 s, worst 3.70 s** | Flat from 1 to 20 concurrent streams; 0 errors in 516 requests (43 slices × 4 levels × 3 repeats). This IS a concurrency answer at the sizes this product will see. **Untested above 20**, and sustained-load rate-limit behaviour is unknown |
| End-to-end lag | **≈6 s** (4 s to fill the slice + ~2 s transcription) | Excludes upload, queueing and render. **Still not an end-to-end measurement** — no step below may be sized against it as if it were |
| Whisper on the L4, 4 s chunks | p50 0.67 s, p95 1.29 s, `seq. ceiling` 5.2 | **The ceiling column is NOT a stream count.** It is `chunk_seconds / mean` at 100% utilization, against a population whose worst steady-state sample was 7.19 s — longer than one arrival period. Finding 1 leaves the GPU capacity number `[UNRESOLVED]`, and this section does not resolve it |

That last row is carried forward deliberately rather than dropped. `docs/decisions.md` 2026-09-05
records that this exact quantity, when it was named `sustainable_streams_per_gpu`, propagated a
capacity claim into a table header, prose, a Done-When and a founder summary that the expression
never contained. **The number is retained; the conclusion it looks like it licenses is not.** It
does not appear in any decision below, because Decision 3 removes the GPU from the live path
entirely — Whisper on the L4 remains the batch engine and the documented fallback.

#### Reuse inventory

Verified by reading each file on this branch (`git rev-parse --show-toplevel` →
`.claude/worktrees/w5`). Paths are repo-relative.

**Client — the room surface**

| Artifact | What it does today | Disposition |
|---|---|---|
| `src/app/pages/transcribe-room-page.tsx` (494 lines) | The whole room: auth gate, consent screen, join, capture, roster + chat subscriptions, end-session. `RECORD_AUDIO_WHILE_LIVE = false` at line 54 makes the entire `MediaRecorder` branch (lines 133-166) dead code | **Modify heavily.** Decisions 1, 5, 7 |
| `src/hooks/useSpeechToText.ts` (354 lines) | Web Speech API wrapper; `{ autoRestart: true }` on this page only | **Removed from this page.** Hook itself untouched — `/chat` depends on its default non-autoRestart behaviour (Non-Goal) |
| `src/hooks/use-audio-recorder.ts` (304 lines) | `/live`'s recorder. `mediaRecorder.start(1000)` then periodic `flushAndUploadChunk` — **this is the mechanism that produces header-less `chunk_001+`** | **Not reused.** Its chunking model is the one Finding 8 and the EBML finding rule out for slices |
| `src/hooks/use-session-heartbeat.ts` | 30s `updateSessionLastActivity` for `/live` creators | **Pattern reused** for room liveness (Decision 6); the hook itself is session-scoped, not room-scoped |
| `src/app/data/transcribe-service.ts` (308 lines) | `createRoom` / `getRoomByCode` (via `get_transcribe_room_by_code` RPC) / `joinRoom` / `sendFinalMessage` / `subscribeToRoom{Members,Messages}` / `endRoom` | **Modify.** `joinRoom` becomes an RPC (Decision 5); `sendFinalMessage` stays for nothing on the live path but is not deleted (see note below) |
| `src/app/data/api.ts` `uploadRoomAudioChunk` (:3277) + `buildRoomAudioPathSegments` (:3257) + `getSignedUploadUrl` (:3021) + `uploadToGCS` (:3068) | Room archival upload to `rooms/{code}/{name}-{memberId}/chunk_NNN.webm` | **Reused unchanged.** This is how the stored recording comes back (Decision 7) |

**Server — edge functions**

| Artifact | What it does today | Disposition |
|---|---|---|
| `supabase/functions/gcs-signed-url/{index,handler,validate}.ts` + `handler.test.ts` | Mints 15-min write URLs. P1223 binds caller→prefix: `getRoomMembership(memberId)` then `m.profileId === userId && m.roomCode === target.code`; `ROOM_PREFIX_RE`, `ROOM_FILE_NAME_RE = /^(?:_dev_)?chunk_\d{3}\.webm$/`, `CONTENT_TYPE_RE`, `isConsistentFileType` | **Reused for archival upload; modified to add the consent gate** (Decision 5). Its index/handler/validate/test split is the **structural template** for the new function |
| `supabase/functions/enqueue-transcription/index.ts` (97 lines) | P902 trigger bridge. Its docstring states the rule this design must copy: *"the task body carries job_id ONLY. Session fields always come from the DB"* | **Not on the live path.** Cited as the attribution precedent (Decision 2) |
| `supabase/functions/generate-banner/index.ts` | The only `generativelanguage.googleapis.com` caller in the repo: `GEMINI_API_KEY` from env, URL built at :240, models at :13-14 | **Call shape reused.** Its `buildProfilePrompt` interpolating DB-sourced `profiles.name` into a prompt is the pattern the Security Review names as *not* to repeat — Decision 8 |
| `supabase/functions/_shared/{cors,participant-name}.ts` | `buildCorsHeaders`, `sanitizeParticipantName` | Reused |
| `scripts/deploy-functions.sh` | Per-function deploy + P834 secret hygiene pre-check + manifest stamp | Reused |

**Server — GPU pipeline (batch, stays)**

| Artifact | Disposition |
|---|---|
| `services/transcribe/main.py` (`/transcribe-async` atomic claim → 202 → background; `/sweep`; deprecated `/poll`) | **Untouched.** Still the batch path fired by `endRoom()` |
| `services/transcribe/{pipeline,audio,transcriber,diarizer,merger,speaker_map,vad,storage}.py` | **Untouched.** Non-Goal: do not change `/live`'s batch pipeline |
| `services/transcribe/measurement/{measure_chunks.py,measure_server.py,Dockerfile}` | The Step-1 harness. **Already run.** Retained as the reproducer for the Whisper half of the measurement |
| `audio.py:88` `prefix = f"sessions/{session_code}/"` | **A live defect, out of scope but recorded:** the batch downloader only looks under `sessions/`, while room chunks land under `rooms/`. See "Pre-existing defects" below |

**Database**

| Artifact | Relevant shape |
|---|---|
| `supabase/migrations/20260823190000_p1149_transcribe_room_tables.sql` | `transcribe_rooms(id, code UNIQUE, event_id, created_at, ended_at)`; `transcribe_room_members(id, room_id, profile_id, display_name CHECK 1-100, session_id, joined_at)` + unique `(room_id, profile_id)`; `transcribe_messages(id, room_id, member_id, text CHECK non-empty, spoken_at, is_final DEFAULT true CHECK (is_final = true))`, index `(room_id, spoken_at)` |
| `20260901160000_p1207_transcribe_rooms_code_enumeration.sql` | `get_transcribe_room_by_code()` SECURITY DEFINER, exact match only |
| `20260225120000_p425_ai_rate_limits.sql` | `ai_rate_limits(user_id, called_at)` — **one row per call**. Pattern reused, table not (Decision 6) |

**Measurement scripts**

`scripts/p1237-crosstalk-scan.py` (the lavalier dB instrument, Open Question 1),
`scripts/p1237-paths-compare.py`, `scripts/p1237-highsep-crosscheck.py`.

#### The Gemini harness is not in the repo — Findings 6, 7 and 8 are currently unreproducible

`git show --stat` over the four documentation commits on this branch (`a9b6091df`, `06cd5b812`,
`22811320d`, `ca9b09f18`) shows **one file changed in each: the spec**. The Whisper half of the
measurement shipped its harness (`services/transcribe/measurement/`, commit `dd620ab2c`) and P1237
shipped three scripts; the Gemini half — 516 requests, 4 concurrency levels, the three cuttings of
Finding 8 — shipped only prose. That asymmetry matters because Finding 8 is the *only* evidence
behind the de-duplication requirement, which is the highest-risk component of this design, and the
de-dup implementation needs that exact audio as a fixture. Committing the harness is a build step,
not a nicety.

#### Open Question 3 is answered by P1237 RQ5 — and the answer is a hard constraint, not a clearance

The question asked whether the 30-minute Gemini cap applies with diarization off. P1237 measured it
directly on a 58-minute file, two calls differing only in the diarization keys:

- **diarization ON** → hard refusal, `Invalid input received.` The cap rejects; it does not truncate.
- **diarization OFF** → **HTTP 200. 87,020 audio input tokens billed** (the full 3,481 s), 8,834
  characters returned, no timestamps, **no warning of any kind**. 4-gram overlap against a local
  Whisper transcript: 22% in minutes 0-5, **0% or 1% in every bucket after**. The hypothesis
  *"it is an output-token limit"* was tested and refused — an identical request with
  `max_output_tokens=65536` returned byte-identical text.

So the answer is not "the cap doesn't apply". With diarization off the request is **accepted, billed
in full, and silently returns a transcript of roughly the opening five minutes.** The design
consequence is absolute and is written into Decision 8: **no path in this system may ever send a
whole session, or any long concatenation, to Gemini** — not a "re-transcribe the room" convenience,
not a flush-on-trigger that concatenates pending slices. Slices only, always. Question 3 is removed
from `## Open Questions` on the strength of this.

#### Pre-existing defects this design sits next to (recorded, not fixed here)

1. **`audio.py:88` looks only under `sessions/`.** Room audio is written to `rooms/{code}/...`
   (`buildRoomAudioPathSegments`, `api.ts:3267`), so `endRoom()`'s per-member
   `createTranscriptionJob` produces a job whose downloader cannot find its audio. Combined with
   `RECORD_AUDIO_WHILE_LIVE = false` this is currently masked — P1251's spec records that *every*
   transcription job since 2026-08-29 failed with *"No files found"*. Restoring recording (Decision
   7) **un-masks it**: jobs will start finding nothing under `sessions/` instead of finding nothing
   because nothing was uploaded. Not this spec's to fix, but the build sequence must not report
   "recording restored" while the batch job still fails.
2. **`endRoom()` calls `createTranscriptionJob('', m.sessionId)`** (`transcribe-service.ts`) — an
   empty session code. The RPC takes only `p_session_id`, so the empty string is discarded, but the
   call site reads as if a code were being passed.
3. **`ml_training_sessions_insert_authenticated` is `WITH CHECK (true)`** — any authenticated user
   can insert a row for any `session_code`/`user_name`. Pre-existing; the constraint it places on
   this design is that nothing server-side may treat `ml_training_sessions.user_name` as a speaker
   identity.

### Architecture Decisions

#### Decision 1: Slices are produced from a Web Audio PCM ring buffer and sent as WAV — `MediaRecorder` cannot produce the required unit

**Chosen:** `getUserMedia({audio:true})` → `AudioContext` → `AudioWorkletNode` tap → a Float32 ring
buffer holding the last ~6 seconds. Every 4 seconds, encode the last **5 seconds** (4s of new audio
+ 1s of lead-in overlap) as 16 kHz mono 16-bit PCM WAV and POST it.

**Rationale (correctness):** two measured facts in this spec make `MediaRecorder` structurally
unable to emit this unit.

- Only `chunk_000` carries the WebM/EBML header — stated in `audio.py`'s module docstring and
  re-confirmed on real session audio (`chunk_001` alone: *"EBML header parsing failed"*; the two
  catted together decode to the full 59.52 s). A `MediaRecorder` chunk is not independently
  decodable, so it is not independently transcribable.
- Finding 8 requires **lead-in** overlap: slice N must contain audio that was already emitted in
  slice N-1. A forward-streaming encoder cannot re-emit past audio at all. A raw sample buffer can,
  trivially, by moving one read pointer.

16 kHz mono is also exactly what `audio.py` decodes to before Whisper, so the sample format matches
the rest of the system rather than introducing a third one.

**Trade-off:** genuinely new client surface. Grepped `src/`: **zero** hits for `AudioWorklet`,
`AudioContext`, `createMediaStreamSource` or `createScriptProcessor` — there is no precedent in this
codebase to copy. A worklet must be served as its own URL-addressable module, which adds a
`public/` asset to a repo that currently has no such thing for JS.

**Alternative rejected — stop/start a `MediaRecorder` every 4 seconds.** Each restart does produce a
complete, header-carrying WebM. Rejected on two counts: it drops audio in the restart gap by an
amount that is device-dependent and unmeasured (and this spec exists because a device-dependent
audio behaviour was assumed and was wrong), and it cannot produce lead-in overlap at all, so
Finding 8's corruption stands.

**Alternative rejected — keep a per-stream decoder open server-side** and feed it the header-less
chunk sequence. This works, but it puts long-lived per-connection state into the ingest layer, which
is precisely the allocated-while-idle shape the idle-cost invariant exists to prevent.

#### Decision 2: Ingest is a new Supabase edge function `transcribe-slice`, not the GCS signed-URL path

**Chosen:** the client POSTs each slice with its Supabase user JWT to
`supabase/functions/transcribe-slice/`. The function: authenticates the JWT → resolves the caller's
membership **and consent** for the named room with a service-role client → calls Gemini with the
audio → de-duplicates against the previous slice → inserts one `transcribe_messages` row using a
**server-derived** `member_id`.

**Rationale (security first, then correctness).** The Security Review's ⚠️ on Invariant #3 requires
that speaker attribution be derived server-side and never accepted as a payload field, and it names
`enqueue-transcription`'s *"the task body carries job_id ONLY"* as the pattern to copy. An edge
function holding the caller's JWT can do something strictly stronger than that precedent: derive
`member_id` from `(room_id, auth.uid())` against `transcribe_room_members` directly, so the client
never names a member at all. The GCS route would instead have the worker parse `member_id` out of an
object key — correct, but a longer trust chain for no gain.

Correctness second: the signed-URL route is mint → PUT → DB trigger → Cloud Tasks → worker. That is
four hops before the first byte reaches a transcriber, against an end-to-end budget the spec
measures at ≈6 s of which ~2 s is already Gemini. It also means ~900 signed-URL mints per member-hour
against a function whose current call rate on this surface is one per 30 seconds.

**Trade-off:** the audio traverses Supabase's edge runtime rather than going straight to GCS. A 5 s
slice at 16 kHz/16-bit mono is ~160 KB raw, ~213 KB base64 — comfortably inside edge request limits,
but it is a real second copy of voice data in a second place, and the privacy policy must say so
(Decision 8, and the Security Review's third-party-disclosure ⚠️).

**Alternative rejected — client → GCS → trigger → Cloud Tasks → Cloud Run worker** (the P858 shape).
Rejected on latency as above, and because it re-introduces a Cloud Run service with an idle-shutdown
path for a workload that, after the engine decision, needs no GPU at all. Re-creating the
allocated-resource shape in order to then defend against it is the wrong trade when the alternative
allocates nothing.

**Alternative rejected — client calls Gemini directly.** Ships the API key to the browser, and makes
consent and attribution unenforceable by construction.

#### Decision 3: The idle-cost invariant is satisfied by allocating nothing — which dissolves two of this spec's own requirements rather than solving them

**Chosen:** no long-lived compute in the live path. The Gemini Developer API bills per request;
Supabase edge functions bill per invocation. Between slices, and between rooms, **nothing is
allocated.**

This is the largest consequence of the founder's engine decision, and it changes two requirements
written when the GPU was still assumed:

- **"Cold start must be hidden by waking the transcription path when a participant joins."** There is
  no ~30 s L4 cold start to hide. What remains is an edge-function cold start (sub-second). The
  wake-on-join hook is **kept anyway** — Decision 6 places it in `handleJoin`, immediately after
  `joinRoom` resolves and before `startCapture` — because it costs one request and takes the first
  real slice off the cold path. It is now an optimisation, not a load-bearing mitigation, and it
  should not be described as one.
- **"Scale to zero on last-member-leave."** Nothing is allocated while a room is open, so there is
  nothing to tear down when it closes. Normal leave and abnormal termination (browser crash, dead
  radio) become the same case: the client stops POSTing, and cost stops. The Security Review's
  question *"what happens on abnormal termination — is there a heartbeat that tears down the GPU?"*
  has no work to do on this design.

**What replaces it.** The risk migrates from *denial-of-wallet by allocation* (P858: paying €659/mo
for an idle GPU) to *denial-of-wallet by call volume* (paying for slices nobody asked for). That is a
different control and it is Decision 6.

**Verification changes with it, and the Done-When wording should follow.** The item *"A room that has
ended leaves no GPU instance allocated — verified from billing"* is trivially true on this design and
therefore proves nothing. The assertion that actually carries the invariant is: **after `ended_at`
is set, zero further Gemini requests are attributable to that room** — checked from the request count
on the capped batch project over the window after `ended_at`, plus `SELECT count(*) FROM
transcribe_messages WHERE room_id = $1 AND spoken_at > ended_at` returning 0. I am flagging this as a
Done-When rewording for the founder rather than editing the Done-When myself.

**The GPU is not removed from the product.** `endRoom()` still creates a batch `transcription_jobs`
row per member, which still wakes `transcribe-session` through the unchanged P858 path. That path's
scale-to-zero remains real and remains what the existing billing check covers — see the
pre-existing-defect note about `audio.py:88` before expecting those jobs to succeed.

#### Decision 4: Overlap de-duplication runs server-side, keyed on the same member's previous message

**Chosen:** before inserting, read that member's most recent `transcribe_messages` row
(`WHERE member_id = $1 ORDER BY spoken_at DESC LIMIT 1` — covered by the existing
`(room_id, spoken_at)` index plus a new `(member_id, spoken_at)` one) and strip the longest
overlapping word-sequence prefix from the new slice's text, bounded to the overlap window.

**Rationale:** it is the only place that has both texts and trusts neither client. No new state is
introduced — the previous text is already in the table the new row is going into.

**Trade-off, and the risk stated plainly.** Finding 8 measured that the overlapped second is **not
transcribed identically twice**: `S22` re-emerged as a stray `23`, and total words went 132 → 155
rather than 132 → 132 + a clean duplicate. So exact token matching will miss real duplicates, and a
naive fuzzy match will delete real words. **This is the highest-risk unproven component in the
design.**

**BUILT AND MEASURED 2026-09-08 — the `[UNVERIFIED]` above is discharged, and the answer changed one
of this spec's own acceptance criteria.** `supabase/functions/transcribe-slice/dedup.ts` +
`dedup.test.ts` (17 tests, all passing), built against the 43 real slice pairs now committed as
`__fixtures__/p1236-boundary-slices.json`. The fixture reproduces this spec's own figures exactly
(132 words plain, 155 raw overlapped), which is what establishes it is the same data.

*The duplication shape, which was uncharacterised.* Of the 42 slice boundaries, 24 have speech on
both sides. **Half of those repeat exactly** after normalisation (case, punctuation, spoken-number
words, and runs of digits — Gemini renders the same spoken digits both ways across consecutive
slices, `"Test three two four."` immediately followed by `"3 2 4 3 2 4 3 2 4"`, and once as the
single token `"341113"`). The other half do not repeat exactly and are not recoverable by matching.

*The selection rule, and why the obvious one is wrong.* Strip the longest prefix of the new slice
matching a suffix of the previous — the natural reading of "strip the longest overlapping
word-sequence prefix" above — **deletes real speech**. Repeated content lets the match run far past
what one second can physically hold. Replayed over the whole corpus (whole-file reference 134 words;
same audio at 4 s with no overlap 132; raw overlapped 155):

| strip window | words out | reading |
|---|---|---|
| none (de-dup disabled) | 155 | 21 duplicated |
| 2 words per overlap second | 138 | duplicates survive |
| **3 — implemented** | **129** | every strip verified by eye as a genuine repeat |
| 4 / 5 / 6 | 127 | starts eating the ambiguous repeated-word region |
| unbounded (longest match) | 122 | **7 more words gone** |

The bound therefore comes from the **overlap duration**, not from how long a match can be found;
3 words is one second of conversational English (~2.5-3 words/s) and is derived from speech rate,
not fitted to this curve. Bias throughout is **under-strip**: a surviving duplicate is visible and
harmless, a deleted word is invisible and unrecoverable, and no per-slice audio is retained to
recover it from.

*This spec's Stage D criterion cannot be met as written, and that is a measurement not an excuse.*
Step 6 below asks that de-dup reconstruct the Finding-8 sentence *"without the stray `23` and
without deleting a real word."* **Those two halves are in direct conflict.** `S22` and `23` do not
match under any exact rule, so removing the stray needs fuzzy matching, and both candidate fuzzy
rules were built and replayed over the corpus before being rejected:

| rule | words out (ref 134) | stray `23` |
|---|---|---|
| exact, windowed — implemented | 129 | survives |
| fuzzy, ≤1 mismatch, anchored | 124 | **still survives** |
| anchor on the previous slice's final token | 117 | removed |

Removing the stray costs 12 real words. The criterion is amended below to the half that is
achievable, with the other half recorded as a known limit rather than quietly dropped. **What the
overlap does deliver is the thing it was added for**, asserted end-to-end in the test file: the
no-overlap cut renders the sentence *"…Galaxy S22 and still that work."*, and overlap + de-dup
recovers *"…still doesn't work."*

**Alternative rejected — de-duplicate on the client.** The client is untrusted, and it does not know
what the previous slice's *transcript* said, only what audio it sent.

**Alternative rejected — no overlap.** Finding 8: `"doesn't"` came back as `"that"` at a clean 4 s
cut. One corrupted word per boundary is one every four seconds.

#### Decision 5: Consent becomes server state, written atomically with the join

**Chosen:** add `transcribe_room_members.consent_given_at TIMESTAMPTZ`, writable only through a new
`SECURITY DEFINER` join RPC that takes consent as a required argument, so a member row cannot exist
without one. `transcribe-slice` refuses when it is NULL; `gcs-signed-url`'s room branch gains the
same check.

**Rationale:** the Security Review established that `consentGiven` is a React `useState` boolean
(`transcribe-room-page.tsx:63`), never sent to the server, never persisted; that
`transcribe_room_members` has no consent column; and that the `privacy.md` promise *"nothing is
captured before you do"* currently holds **only because `RECORD_AUDIO_WHILE_LIVE = false` makes the
capture branch dead code.** This spec's own Done-When turns capture back on. At that moment a valid
member JWT replayed without ever rendering the consent screen becomes indistinguishable server-side
from a consented one — the invariant *"any path reaching audio capture MUST fail closed when consent
is absent"* would hold by client cooperation only, which is not failing closed.

**Trade-off:** `joinRoom`'s current deliberate two-statement insert-then-read moves into the RPC. That
split exists for a documented reason — `INSERT … RETURNING` is evaluated under the SELECT policy,
which calls `is_transcribe_room_member()`, which cannot see the row its own INSERT is still writing
(the comment in `transcribe-service.ts` records this was reproduced directly in SQL). A
`SECURITY DEFINER` function sidesteps it, but the reasoning must move with the code rather than be
lost.

**Alternative rejected — a separate `POST /consent` after join.** Leaves a window in which a member
row exists without consent, which is exactly the state this decision makes unrepresentable.

#### Decision 6: Cost is bounded by server-enforced ceilings on the room, not by a resource lifecycle

**Chosen:** three ceilings, all server-side, none visible or settable by the client.

1. **Room hard-stop.** A maximum room duration enforced in `transcribe-slice`: past
   `created_at + N minutes` the function sets `ended_at` and refuses. The client cannot be the clock
   — `endRoom` is caller-initiated only, so a joined member can stay indefinitely today.
2. **Per-member slice ceiling.** A counter column on `transcribe_room_members`, incremented by the
   service-role write in the same statement as the message insert.
3. **Per-user concurrent-room limit.** Nothing currently stops one profile creating N rooms and
   streaming into all of them.

Wake-on-join lives here too: `handleJoin` issues one no-audio pre-warm POST after `joinRoom` resolves
and before `startCapture`.

**Rationale:** with nothing allocated, call volume is the only cost variable. Ten people at 4 s
slices is 2.5 requests/second sustained, and the cap that would stop a runaway fires on **gross**
cost with credits excluded (pp `docs/infra/gcp-spend-caps.md`), so the €75 batch cap is reached at
roughly 47× the current monthly Gemini gross — not a comfortable margin against an unbounded room.

**`ai_rate_limits` is deliberately NOT reused as a table.** It is one row per call
(`20260225120000_p425...sql`), and this path issues ~900 calls per member-hour. Reuse its *pattern* —
service-role written, server-enforced, client-invisible — not its schema.

**Trade-off:** the room hard-stop is a user-visible truncation of a real conversation.
`[FOUNDER DECISION — ANSWERED 2026-09-08: N = 180 minutes (3 hours).]` Chosen as the generous end of
the range on the founder's reasoning that a cap which interrupts a real conversation is the worse
error: truncation is loud and gets reported, whereas a room left running is silent. Three hours is
well beyond any session length described for this format ("maximum once per week or so, and then
maximum 10 people"), so the cap should never fire on legitimate use — it exists for the forgotten
room, not the long one.

**What 180 minutes costs if a room is abandoned**, so the number is not adopted blind: ten members
at one 4-second slice each gives 2.5 requests/second sustained, and Decision 6's own sizing puts the
EUR 75 batch fuse at roughly 47x current monthly Gemini gross for rooms alone. A single forgotten
3-hour room is therefore nowhere near the fuse; the risk the cap addresses is many such rooms, not
one. **UNVERIFIED:** no abandoned-room cost has been measured end to end — Build Sequence step 13's
billing check is where this number gets its first real test, and 180 is cheap to lower afterwards.

#### Decision 7: Recording is restored by teeing one `getUserMedia` stream; `RECORD_AUDIO_WHILE_LIVE` is deleted

**Chosen:** one `getUserMedia` call per participant. Its `MediaStream` feeds **both** the Web Audio
graph (Decision 1, live slices) **and** a `MediaRecorder` producing 30 s archival chunks on the
existing `uploadRoomAudioChunk` path, unchanged. `useSpeechToText` is removed from this page
entirely.

**Rationale:** H1 was contention between `MediaRecorder` and `SpeechRecognition`, and
`SpeechRecognition` is the half that cannot share a stream — the Web Speech API opens its own capture
and takes no `MediaStream` argument. Deleting it removes the contention **by construction** rather
than by scheduling the two. The archival path then needs no change at all, which is why
`chunk_NNN.webm`, `ROOM_FILE_NAME_RE` and the batch pipeline's expectations all keep working. This is
what makes the stored recording a by-product of the same single stream, as the spec's Non-Goal
("do NOT build `/record` as a separate surface") requires.

**`[VERIFIED ON HARDWARE 2026-09-08 — the claim holds, and the WAV fallback is not needed.]`**
Measured on the same physical Galaxy S22 (SM-S908B, Android, Chrome 152) that produced this spec's
original A/B, over the adb tunnel. Probe: `scripts/p1236-stagea-probe/`.

The probe is a **within-run A/B**, and that shape is what makes the result readable: seconds 1-8 run
the Web Audio tap ALONE (the control), then at second 8 a `MediaRecorder` attaches to the *same*
`MediaStream`. Without the control phase a silent tap would be ambiguous between "the tap never
worked" and "the recorder starved it" — which is the exact ambiguity the original 14-failure A/B had
to resolve.

```
t= 7s TAP tapFrames=288128 peak=0.8551 rms=-24.4dBFS recChunks=0 recBytes=0      trackState=live
t= 8s TAP tapFrames=336128 peak=0.0130 rms=-63.0dBFS recChunks=0 recBytes=0      trackState=live
--- starting MediaRecorder on the SAME stream, mime=audio/webm;codecs=opus ---
t= 9s REC tapFrames=384128 peak=0.5960 rms=-26.3dBFS recChunks=0  recBytes=0     trackState=live
t=10s REC tapFrames=432128 peak=0.5653 rms=-30.6dBFS recChunks=1  recBytes=15618 trackState=live
t=20s REC tapFrames=912128 peak=0.3829 rms=-27.9dBFS recChunks=11 recBytes=179998 trackState=live
=== VERDICT INPUTS ===
recorder chunks=12 totalBytes=192571
final track state=live muted=false
```

**The decisive number is the frame rate, not the levels.** The tap delivered **exactly 48000
frames/second in every second of both phases, including the second spanning the transition** — the
set of per-second deltas is `{48000}` across the whole run. Audio remained non-silent under the
recorder (peaks 0.38-0.60), and the recorder itself produced 12 chunks totalling 192571 bytes at a
steady 16438 B/s. The track stayed `live` and `muted=false` throughout.

Levels are deliberately NOT the evidence: the quiet seconds (t=8 peak 0.013 in the control phase;
t=11, t=17-19 under the recorder) appear in **both** phases, so they track when the speaker paused,
not what the recorder did. Frame count is speech-independent and is what a starved tap would show.

Contrast with the failure this spec exists for: `SpeechRecognition` + `MediaRecorder` ended at ~5.3 s
with `heard=false`, fourteen consecutive times. `MediaStreamAudioSourceNode` + `MediaRecorder` on one
stream shows no degradation at all — consistent with Decision 7's rationale that `SpeechRecognition`
is the half that cannot share a stream, because it opens its own capture and takes no `MediaStream`.

The fallback below is therefore **not** being taken. Recorded for the record: had it failed, it was
to drop `MediaRecorder` and encode the archival WAV from the same ring buffer (~1.9 MB/min at 16 kHz
16-bit mono against ~120 KB/min for WebM, and `audio.py` would need to accept `.wav` under the room
prefix). **Not tested here:** that only `chunk_000` carries the EBML header — a known property of the
existing recorder path, unchanged by this design and not Stage A's question.

**Trade-off:** live text loses the browser recognizer's sub-second latency and lands at ≈6 s. The
spec already accepts this (Risk: *"slower and working beats instant and absent"*), and the founder's
answer — *"read while talking is not really the case at all"* — is what makes it acceptable.

**Non-Goal respected:** `useSpeechToText`'s default (non-`autoRestart`) behaviour is not touched;
`/chat` is unaffected. The hook is not deleted.

#### Decision 8: Gemini is called on the capped **batch** key project, with a fixed system instruction and zero interpolated variables

**Chosen:** `generativelanguage.googleapis.com` only — Vertex AI (`aiplatform.googleapis.com`) stays
disabled (Invariant 4). The key is the **batch** project (`aikey-cp-batch-81413`, EUR 75 cap), not
prod-interactive (`aikey-cp-prod-inte-81368`, EUR 50), per the Security Review's record of P1162.

**Rationale:** P1162 split the projects precisely so a background workload cannot fuse the
user-facing one. A runaway room must not take `/chat` and banner generation down with it. This is a
per-room, per-member background stream — it belongs on the batch fuse.

Audio is sent as the API's **native audio content part**, never base64-embedded into a text prompt
(Security Review, AI Prompt Security table). The system instruction is a fixed string with **no
interpolated variables at all**: no `display_name`, no prior `transcribe_messages.text`, no room
code. That is the review's own "safest posture" line, and it makes the majority of its variable table
**N/A** — which the review asks be *recorded as N/A in the architecture doc, not silently dropped*.
Recorded here: `display_name` (untrusted, client-supplied, length-checked only), `transcribe_messages.text`
(untrusted, other participants' speech) and `transcribe_rooms.code` (bearer credential) are **not
sent to Gemini on this design**. `transcribe_room_members.id` is used as the sole attribution key and
never appears in a prompt.

**Hard constraint carried from P1237 RQ5:** with diarization off Gemini does not reject long audio —
it accepts, bills in full, and silently returns roughly the opening five minutes. **No code path may
send a whole session or a long concatenation.** Slices only. A "re-transcribe the whole room" or
"flush everything pending as one call" convenience is therefore forbidden by design, and a test
should assert the request builder cannot be handed more than one slice.

**Fallback, not removal:** Whisper on the existing L4 remains the batch engine and the documented
fallback for the live path. The GPU service is not decommissioned by this spec.

**Trade-off:** a dependency on an API rather than a container we run, and ~1.3 s more per slice than
Whisper. Both were weighed in the founder's answered engine decision and are not reopened here.

### Security Review

**This subsection is a cross-reference. The security review for P1236 lives in the level-2
`## Security Review` section above** (carried over 2026-09-07) — RLS, authentication, authorization,
input validation, data protection, AI prompt security, cost/abuse controls and the denial-of-wallet
analysis, all grounded in the current schema. It is not duplicated, summarised or superseded here.

That review states its own findings are **engine-independent** — consent, attribution, storage and
abuse bounds bind whether the live path runs on Whisper or Gemini. The engine-specific surface the
founder's 2026-09-04 decision opened is therefore its gap, and a separate pass is appending an
`### Addendum — engine-specific (2026-09-08)` inside that same section covering: voice audio leaving
to a third-party API, API-key handling, per-request spend and rate limiting on the live path,
P1237 RQ5's silent-truncation-while-billing behaviour, Finding 5's fail-open VAD, and the Finding 8
overlap/de-duplication path.

Architecture decisions written directly against that review's ⚠️ items: **Decision 2** (server-derived
attribution, Invariant #3), **Decision 5** (consent as server state), **Decision 6** (rate and
duration ceilings), **Decision 8** (Gemini key selection and a prompt with no interpolated
variables). Every ⚠️ item is mapped to a named Build Sequence step in
`#### Security findings → build steps` below — including the ones no decision above closes.

### Implementation Approach

**Worktree recommended:** already in one — `feature/p1236-server-side-live-transcription` (w5). The
change spans `src/`, `supabase/functions/`, `supabase/migrations/`, `public/`, `scripts/` and `docs/`
across ~15 files, and it modifies a shared edge function (`gcs-signed-url`) that other paths depend
on.

#### Build Sequence

**There is no measurement stage.** Step 1 of `## Approach` has run (`services/transcribe/measurement/`,
2026-09-03, corrected 2026-09-04); its numbers are carried forward in Technical Analysis and are not
re-derived here. This sequence builds the live path.

**Stage A — the hardware precondition. Nothing below is worth building until this passes.**

1. ~~On the physical Galaxy S22, over the adb-forwarded DevTools console, confirm that one
   `getUserMedia` stream simultaneously drives a `MediaStreamAudioSourceNode` (samples arriving,
   non-silent) **and** a `MediaRecorder` (chunks with non-zero size).~~ **PASSED 2026-09-08 — log
   and analysis in Decision 7 above; probe committed at `scripts/p1236-stagea-probe/`.** The tap
   held exactly 48000 frames/second across the phase boundary with the recorder running, and the
   recorder produced 12 non-empty chunks. **Stages C-F are unblocked and the WAV-archival fallback
   is not taken**, so the object format, the migration and `audio.py`'s expectations all stand as
   written.

   One deviation from the step as specified: the log was read by having the page **POST each line
   back over the same adb tunnel**, not off the DevTools console. Android Chrome's CDP would not
   attach — `Target.getTargets` reported 2 live page targets against 62 in the HTTP list, and
   `Target.attachToTarget` hung. The bytes still originate on the physical device over the same
   `adb reverse` tunnel; only the readout path differs.

**Stage B — make the evidence reproducible and the fixture available.**

2. ~~Commit the Gemini measurement harness that produced Findings 6, 7 and 8 (currently prose-only)
   as `scripts/p1236-gemini-slice-bench.py`, together with the Finding-8 audio as a committed
   fixture.~~ **DONE 2026-09-08, with one deliberate change: the AUDIO IS NOT COMMITTED.** It is
   168 s of real `/transcribe` room audio from five sessions, and this repository is public — that
   is participant voice data, and `CLAUDE.md`'s private-vs-public rule puts it out of the repo
   regardless of how convenient a fixture it would make. What de-duplication actually needs is the
   **transcripts**, which carry no personal content: committed as
   `supabase/functions/transcribe-slice/__fixtures__/p1236-boundary-slices.json` (all 43 slices of
   both cuttings, reproducing this spec's 132/155 figures). The WAV stays at
   `gs://claritypledge-ml-training/p1236-measurement/input.wav` and the harness regenerates the
   fixture from it with `--mode boundary`.

   **What is verified about the harness, and what is not.** Its slicer was run against that exact
   WAV and reproduces all three archived cuttings — 43 / 43 / 12 slices, 168.24 s, and the 1 s
   lead-in visible as 4 s for slice 0 then 5 s thereafter. Every guard was exercised on its failure
   path and exits non-zero — missing key; a request over the 30 s RQ5 ceiling; `--fixture` without
   `--mode boundary`; and a run in which every request failed — each against a known-good control
   that passes, so the probe is not blind. `--mode boundary --fixture` was checked to emit the
   committed fixture's exact key shape, so the file's own regeneration instruction is literally
   executable rather than approximately true.

   **The Gemini call is verified only as far as the wire.** With a deliberately invalid key the
   request reaches `generativelanguage.googleapis.com` and is rejected on auth, so transport and
   request construction are exercised. **Response parsing and the findings themselves are still
   UNVERIFIED** — no valid `GEMINI_API_KEY` was available this session, so Findings 6 and 7 are
   re-runnable but have not been re-run.

**Stage C — server state and the consent gate (no behaviour change yet).**

3. ~~Migration: `consent_given_at TIMESTAMPTZ` and the slice counter on `transcribe_room_members`;
   the room-duration column or constant; index `(member_id, spoken_at)` on `transcribe_messages`;
   the `SECURITY DEFINER` join RPC carrying the RLS-vs-`RETURNING` reasoning in a comment.~~
   **DONE 2026-09-08**, as FOUR migrations rather than one, each split for a stated reason:
   - `20260908170000` (expand) — the columns, the index, `join_transcribe_room()`.
   - `20260908170100_b` (contract) — drops the direct member INSERT policy. **NOT APPLIED, NOT
     COMMITTED**: it is a `DROP POLICY`, and CLAUDE.md's ALWAYS-ASK covers DROP on any DB in any
     environment. Carries `requires-frontend: 26be25831`.
   - `20260908170200_c` — `record_transcribe_slice()`, service_role only, so the message row and the
     slice counter move in ONE transaction. Two PostgREST calls could not be that, and an
     under-counting spend ceiling is not a ceiling.
   - `20260908170300_d` — revokes the `anon` EXECUTE grant the first migration did not actually
     remove. See "Two findings this stage produced" below.

   **The room duration is a CONSTANT, not a column** (`ROOM_MAX_DURATION_MINUTES` in
   `transcribe-slice/handler.ts`). The spec allowed either. A column implies per-room variability
   nothing sets, and the first thing anyone would ask of it is an UPDATE policy — which is exactly
   what Decision 6 exists to prevent. The migration records this so the decision is discoverable
   from the schema.
4. ~~`transcribe-service.ts`: `joinRoom` → the RPC, consent passed as a required argument.~~
   **DONE.** `profileId` stays in the TypeScript signature (`createClaritySession` needs it) but is
   NOT passed to the RPC — the RPC derives identity from `auth.uid()`, because a `SECURITY DEFINER`
   function that accepts the identity it is about to write is an impersonation primitive. The RPC
   also refuses a `clarity_sessions` row the caller does not own; the policy it replaces checked
   only `profile_id = auth.uid()` and never looked at `session_id`, so attaching another user's
   recording session to your own seat was reachable before this.
5. ~~`gcs-signed-url/handler.ts`: extend the room branch's membership check with
   `consent_given_at IS NOT NULL`. Exercise the **refusal** path ... (gate 7c).~~ **DONE — 24/24,
   both gates discharged with pasted exit codes.** Gate 7: deleting the consent line makes the
   suite exit 1; hoisting the check ABOVE the membership check also exits 1 (the ordering is
   load-bearing — a non-member must not learn from the error whether the seat they guessed has
   consented). Gate 7c: the archival upload the shipped client already performs, consecutive
   chunks and the P809 `_dev_` prefix included, runs through the new gate unchanged, and the
   `/live` session branch is asserted untouched.

**Stage D — de-duplication, test-first, in isolation.**

6. ~~`supabase/functions/transcribe-slice/dedup.ts` + `dedup.test.ts`, built against the Stage B
   fixture.~~ **DONE 2026-09-08 — 17 tests, all passing.** The criterion is **amended**, on
   measurement recorded under Decision 4: *1 s overlap must reconstruct
   "…on my Galaxy S22 and it still doesn't work" **without deleting a real word**, and the corpus
   replay must not fall below the whole-file reference by more than the ambiguous repeated-word
   region accounts for.* The original *"without the stray `23`"* half is **withdrawn as
   unachievable** — every rule that strips it deletes 5-12 real words elsewhere, and both were
   built and replayed before being rejected. The stray is pinned by a test so a future
   "improvement" has to answer for the corpus regression it causes. The negative case (two
   genuinely different consecutive sentences must not be merged) is included and passes, along with
   an under-strip case, surface-form preservation, and the partial-digit-run case.

   The load-bearing test is the **corpus replay**, not the single boundaries: every per-boundary
   assertion above can be satisfied by an algorithm that quietly deletes speech somewhere else, and
   the replay is what refuted the two rejected rules.

**Stage E — the ingest function.**

7. ~~`transcribe-slice/{index,handler,validate}.ts` + `handler.test.ts` ... `handler.ts` order:
   JWT → membership → **consent** → ceilings → Gemini → dedup → service-role insert with
   server-derived `member_id`; the pre-dedup candidate held in worker memory only.~~
   **DONE 2026-09-08 — 52/52 deno tests (34 handler + 18 dedup), three mutations each exit 1**
   (consent gate removed; RQ5 duration bound removed; payload allow-list disabled).

   Three things ended up STRUCTURAL rather than checked, which is stronger than the step asked for:
   - **The payload is an ALLOW-list**, so `spoken_at`, `memberId` and `text` are not readable even
     by accident, and are REFUSED rather than ignored. The step said "rejected or ignored"; ignoring
     lets a client believe it was honoured. A deny-list has to be remembered every time the payload
     grows, and the once it isn't is the once that ships.
   - **`transcribe(audio: Uint8Array)` takes ONE slice.** Decision 8's "a test should assert the
     request builder cannot be handed more than one slice" is satisfied by the type: a
     flush-everything-pending convenience cannot be added without changing it. A test pins the call
     count and the byte identity as well.
   - **Duration is DERIVED from the WAV header**, not declared — there is no declared-duration field
     to disagree with. `parseWavHeader` walks the chunk list rather than assuming `data` sits at
     offset 36, and takes the MIN of the declared and actual data size, so an over-declared header
     reads as truncation rather than as long audio.

   **The tests found a dead guard before it shipped.** At `MAX_SLICE_BYTES = 262144` the byte cap
   already capped duration at 8.19 s, so the 8 s RQ5 duration bound could only ever fire in a 0.19 s
   band — for every well-formed 16 kHz mono slice it was unreachable code that read as a working
   check. The cap was raised to 320000 so both bounds are live, and an assertion now pins the
   inequality so changing either constant alone fails loudly.

8. Deploy to **test** first: `./scripts/deploy-functions.sh transcribe-slice`. Set `GEMINI_API_KEY`
   from the batch project and record it in `.private/docs/edge-function-secrets.md` in the same step
   (P834 invariant; `check-edge-function-secrets.sh` is the deploy-time guard).

**Stage F — the client.**

9. ~~`public/audio/pcm-tap-worklet.js` + `src/lib/audio/slice-recorder.ts`: ring buffer, 4 s cadence,
   1 s lead-in, WAV encode.~~ **DONE 2026-09-08 — 14 unit tests on the pure half.**
   The load-bearing one round-trips the encoder's output through the INGEST FUNCTION'S OWN
   `parseWavHeader`: the two sit on opposite sides of a network boundary in different runtimes, so
   asserting the encoder against its own idea of a WAV would prove nothing about what the server
   accepts. Downsampling is a box average, not decimation — dropping every third sample of 48 kHz
   audio folds everything above 8 kHz back into the speech band and hands a transcriber alias noise
   as if it were speech. The context asks for 16 kHz directly so the browser resamples where it can.

   **The tests found a ring-buffer bug**: the oversized-chunk path wrote the tail at offset 0 while
   advancing the write pointer by the full chunk length, so `readLast` unwrapped from the wrong
   place — right samples, right count, two halves of the slice swapped, and silent.

   **`createSliceRecorder` itself is NOT tested and must not be reported as verified.** It needs
   `AudioContext`, `audioWorklet.addModule` and a real microphone, none of which jsdom has. Its
   shape is the one Stage A measured on the physical S22; two-device confirmation is step 11.
10. ~~`transcribe-room-page.tsx`: remove `useSpeechToText` and the `liveTextStopped` UI; delete
   `RECORD_AUDIO_WHILE_LIVE` and un-dead the `MediaRecorder` branch; wire the slice loop; pre-warm
   POST in `handleJoin`.~~ **DONE.** The flag is deleted rather than flipped — a boolean guarding a
   hazard that no longer exists is an invitation to re-litigate it. The three recognizer states
   collapse into one status line: "Live text stopped — tap to resume" existed because the recognizer
   could die silently and on iOS could only be revived by a user gesture, and a control promising to
   revive something that no longer exists is a lie in the shape of a button.

   Invariant 1 is now true by construction. `p1149-interim-never-persists.test.ts` was **updated,
   not deleted** — its page-layer assertions checked that a specific effect body did not mention
   `interimTranscript`, and that effect is gone, so they could only pass vacuously. The replacement
   is stronger: the page neither imports nor calls the hook, and the service has ZERO inserts onto
   `transcribe_messages` (was 1). `sendFinalMessage` is removed rather than left unused — an
   exported writer with no callers is an invitation. Layer 1, the `is_final` CHECK, is untouched.
   **Not closed by this:** `transcribe_messages` still carries P1149's "room members can send their
   own messages" INSERT policy, so a client could still write a row attributed to its own seat via
   PostgREST. That predates P1236; deleting our own wrapper does not close a policy.

**Two findings this stage produced, neither of which the spec anticipated.**

- **`join_transcribe_room` was `anon`-EXECUTABLE after its own migration ran.** The migration
  carried `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated`, which reads as a
  lockdown and is not one: Supabase's `ALTER DEFAULT PRIVILEGES` grants EXECUTE on every NEW
  function to `anon` **role-directly**, and revoking from PUBLIC does not touch that. This is the
  trap `docs/technical/database.md` §P1065 already documents, and the fifth instance here after
  P1063's four. Caught only because the grant was read back from the live catalog rather than from
  the migration text. **Not an incident** — the function refuses an anonymous caller on its first
  line, verified live (`SET LOCAL ROLE anon` in a rolled-back transaction returned
  `REFUSED: not authenticated`, against a control in the same probe that returned `PERMITTED`, so
  the probe was not blind). Closed by migration D with a canary that distinguishes a grant refusal
  from a body refusal — the obvious assertion would have passed against the unfixed grant.
- **`get_transcribe_room_by_code` (P1207) is also `anon`-executable and unlisted** in
  `scripts/anon-execute-allowlist.txt`. Recorded in `.private/docs/security-log.md`, deliberately
  NOT touched: out of this spec's scope, and "revoking it looks free" is a claim about call sites
  this session did not trace. **Needs a founder decision** — revoke, or allowlist with a reason.

**Stage G — verify, in this order.**

11. Two physical devices, two members, adb console: each sees the other's words, attributed
    correctly (Done-When items 5 and 6). Paste the logs.
12. Confirm a stored recording lands under `rooms/{code}/{member}/chunk_NNN.webm` (Done-When 9) —
    and **separately** confirm whether the resulting batch job succeeds, given the `audio.py:88`
    `sessions/`-only prefix defect. Do not report "recording restored" as "transcription restored".
13. **Cost, verified from billing rather than assumed — both halves, because there are two.**
    - *Live path (Gemini).* After `ended_at` is set, assert **zero further Gemini requests
      attributable to the room**: query the BigQuery billing export
      (`billing_export.gcp_billing_export_resource_v1_010089_354936_77CD27`, the same source that
      produced the credit-coverage table in `### Credit-eligible execution paths`) for
      `generativelanguage.googleapis.com` usage on the batch project over the window after
      `ended_at`, and separately assert
      `SELECT count(*) FROM transcribe_messages WHERE room_id = $1 AND spoken_at > ended_at` returns
      0. This is Decision 3's reworded assertion and it is the one that carries the idle-cost
      invariant on this design. **Note the export lags** — it is not a same-minute check; run it the
      following day, not immediately after the session.
    - *Batch path (GPU), unchanged by this spec but still triggered by `endRoom()`.* Confirm
      `transcribe-session` returns to zero instances after the per-member jobs finish. Per
      `docs/decisions.md` 2026-06-04, use the **Cloud Run shutdown log**
      (`gcloud logging read … "Application shutdown complete"`), **not**
      `gcloud monitoring time-series list` for `container/instance_count` — that CLI returned no
      parseable data 3× and is recorded as unreliable for exactly this check. Measured idle-shutdown
      there was ~5 min, not the ~15 min the P858 prose assumes; do not treat 15 as fixed.
14. **Bucket posture — `gs://claritypledge-ml-training`.** Run `gsutil iam get` and
    `gsutil lifecycle get` on it and record both. The Security Review flags this ⚠️ as UNVERIFIED and
    not inferable from the repo (`grep -rn "lifecycle\|retention" docs/ scripts/` returns zero hits
    for this bucket), and restoring recording resumes writing pseudonymous voice data into it. Record
    the retention period in `## Pre-deploy Checklist`; if no lifecycle rule exists, that is the
    finding — say so rather than leaving the item ticked.
15. `privacy.md`: add the third-party transcription flow to **all three** places the addendum
    names, not two — `### Transcribe rooms` (`privacy.md:104-115`, which today says audio goes to
    "our Google Cloud Storage bucket" with a transcript "produced afterward", wording written for
    the self-run Whisper pipeline), the Gemini disclosure block (`privacy.md:150-163`, which lists
    `/chat` and banner generation as the only Gemini consumers), and the DPA row
    (`privacy.md:261-263`, whose Gemini row reads "`/chat` replies; generated banners"). **Also
    update the in-room consent copy**, which names no third party at all — consent to be recorded
    is not consent to be sent to Google. **This gates prod, not test.**

**Stage H — abuse bounds no decision above closes. Both must land before prod.**

16. `gcs-signed-url/handler.ts`: add a per-member request-volume ceiling to the room branch. The
    level-2 review's ⚠️ is that the handler validates identity and ownership per request but never
    bounds how many signed URLs one member can mint per minute — hence GCS PUTs, hence archival
    volume. Decision 6's ceilings live in `transcribe-slice` and do not cover this function, which
    stays on the live path for archival chunks under Decision 7. Exercise the refusal path and
    confirm a non-zero result (`epistemic.md` gate 7), then run the existing archival happy path
    through it unchanged (gate 7c).
17. Confirm the batch project's cap has real headroom for a live workload before enabling prod.
    P1162 sized `aikey-cp-batch-81413` (EUR 75) from batch unit economics and shares it across
    P1237 batch transcription, agent tooling and now P1236; its project split mitigated
    prod-interactive-vs-batch, never batch-vs-live. Decision 6 computes the cap at roughly 47x
    current monthly Gemini gross for rooms alone — that margin is not the shared margin. Record the
    measured headroom with a concurrent P1237 run in flight, not the headroom for rooms in
    isolation.

#### Security findings → build steps

Every ⚠️ in `## Security Review` — both the engine-independent findings and the
`### Addendum — engine-specific (2026-09-08)` — mapped to the step that closes it. A finding with no
step is a finding nobody builds.

**Coverage: 17 ⚠️ findings in `## Security Review` → 17 rows, plus 1 row for the ✅ fail-open-VAD
item so a resolved finding is recorded rather than silently dropped. 18 rows total.** Re-count both
sides whenever either changes:
`grep -c "^- ⚠️"` over the Security Review section, against the row count here. This table shipped
once with two findings unmapped, and the gap was caught by luck rather than by anyone checking.

| ⚠️ Finding | Source | Closed by |
|---|---|---|
| Server-side writer cannot satisfy the participant-JWT INSERT policy; must use service-role and re-derive `member_id` from the validated upload path, never a job payload | Engine-independent, RLS + Authorization | Decision 2; step 7 (`handler.ts` order ends in service-role insert with server-derived `member_id`) |
| `display_name` is client-supplied and length-checked only — untrusted wherever consumed | Engine-independent, RLS | Decision 8 (no interpolated variables reach Gemini at all; recorded N/A) |
| Consent is client-side state only; any path reaching capture must fail closed | Engine-independent, Data Protection | Decision 5; steps 3, 4, 5 (consent as server state, gate exercised on its refusal path) |
| Wake-on-join must be gated on the authenticated join check, not a client-callable "start" endpoint | Engine-independent, Authentication | Decision 6 (pre-warm POST issued in `handleJoin` after `joinRoom` resolves) |
| Transcript text now originates from a third party and has no server-side length cap before insert | Engine-independent, Input Validation | Step 7 (`validate.ts` payload bounds) |
| No shutdown mechanism for the live case; normal vs abnormal room termination both unresolved | Engine-independent, Denial-of-wallet | Decision 3 (nothing is allocated, so both cases collapse); Decision 6 room hard-stop; step 13 |
| No abuse control on `gcs-signed-url` request volume per member | Engine-independent, Denial-of-wallet | **Step 16** — nothing above closed this |
| `privacy.md` does not disclose room audio or transcripts as a Gemini destination; consent copy names no third party | Addendum, Data Protection | **Step 15**, gating prod |
| Gemini's training/retention terms for submitted audio are UNVERIFIED at this tier | Addendum, Data Protection | Pre-deploy checklist — confirm before prod; no code closes it |
| Live Gemini caller must pull the key from a secret store and register it per P834 | Addendum, API Key Handling | Step 8 |
| Bucket ACL / retention for `gs://claritypledge-ml-training` unverified — no lifecycle or retention rule exists anywhere in the repo, and room audio is pseudonymous, not anonymous | Engine-independent, Data Protection | **Step 14** — `gsutil iam get` + `gsutil lifecycle get`, with the retention period recorded in the Pre-deploy Checklist |
| No server-side authentication artifact exists yet for the new ingest endpoint | Engine-independent, Authentication | Step 7 — `handler.ts` opens JWT → membership → consent; refusals asserted in `handler.test.ts` |
| The EUR 75 monthly cap is a shared fuse, not a rate limit; no per-room or per-member bound exists | Addendum, Spend | Decision 6's three ceilings (room hard-stop, per-member slice counter, per-user concurrent rooms) |
| Batch cap headroom is unmeasured against concurrent P1237 runs sharing the project | Addendum, Spend | **Step 17** — nothing above closed this |
| RQ5: with diarization off Gemini accepts long audio, bills in full, returns ~5 minutes silently | Addendum, RQ5 | Decision 8's hard constraint; step 7 (`validate.ts` max duration) + the assertion that the request builder cannot be handed more than one slice |
| De-dup ordering must key on a server-assigned index, never a client-supplied one | Addendum, Finding 8 integrity | **Step 7** — `spoken_at` is DB-assigned and structurally unreadable from the payload (allow-list). **The "sequence bounds and rejects replays" half of this row was WRONG and is corrected**: `sequence` is range-checked and nothing more — no seen-set, no monotonicity check exists. See "Replay is bounded, not rejected" below |
| The pre-dedup candidate text must never be persisted, even transiently | Addendum, Finding 8 integrity | **Step 7** — merge held in worker memory; insert is the deduplicated row only |
| Fail-open VAD (P1242) | Addendum, Finding 5 | Moot on this engine — Finding 6 measured Gemini needing no gate. Reopens if a VAD dependency returns |

#### Replay is bounded, not rejected — a claim this spec made and the code never implemented

Found by the Stage C/E/F code review (2026-09-08) and verified by `grep -n "sequence"
supabase/functions/transcribe-slice/*.ts`: `sequence` is parsed and range-checked in
`validate.ts` and is never compared against anything. There is no per-member seen-sequence set
and no monotonicity check. **A replayed slice is transcribed, billed to Gemini and inserted**,
de-duplicated only by the text-overlap window — which catches an immediate repeat and not a
replay minutes later.

What actually bounds it: the per-member slice ceiling (3000) and the room hard stop
(180 minutes). Both are cost bounds, and they are the same bounds that apply to a legitimate
speaker, so a replaying client gets no more budget than an honest one. That is why this is
recorded rather than treated as a hole.

**A monotonic check was designed and rejected here rather than built at the end of a stage.**
`sequence <= last_seen → reject` needs one column and one comparison, but the client's counter
restarts at 0 on every `createSliceRecorder`, and a page refresh or a rejoin re-enters
`startCapture` against the *same* member row. A strict check would then refuse every slice for
the rest of that room — a gate whose false-positive case is "the user reloaded the page", which
is exactly the failure `epistemic.md` gate 7c exists to catch. Making it correct needs a reset
signal the server can trust (the pre-warm POST is the natural carrier), and that is a mechanism,
not a one-liner.

**[FOUNDER DECISION: implement the reset-plus-monotonic check, or leave replay bounded by the
ceilings and delete the sequence field entirely?]** Keeping a field that looks like a defence and
is not is the one option with no argument for it.

#### Files to Create

| Path | Purpose |
|---|---|
| `supabase/functions/transcribe-slice/index.ts` | Entry point: env, clients, `Deno.serve` — mirrors `gcs-signed-url/index.ts` |
| `supabase/functions/transcribe-slice/handler.ts` | Testable core: JWT → membership → consent → ceilings → Gemini → dedup → insert |
| `supabase/functions/transcribe-slice/validate.ts` | Payload bounds (bytes, sample rate, duration, sequence) |
| `supabase/functions/transcribe-slice/dedup.ts` | Overlap de-duplication (Decision 4) |
| `supabase/functions/transcribe-slice/handler.test.ts` | Auth/consent/ceiling refusals + happy path |
| `supabase/functions/transcribe-slice/dedup.test.ts` | Finding-8 fixture assertions |
| `supabase/migrations/<ts>_p1236_transcribe_consent_and_limits.sql` | `consent_given_at`, slice counter, `(member_id, spoken_at)` index, join RPC |
| `public/audio/pcm-tap-worklet.js` | `AudioWorkletProcessor` — must be URL-addressable |
| `src/lib/audio/slice-recorder.ts` | Ring buffer, 4 s cadence, 1 s lead-in, WAV encode |
| `scripts/p1236-gemini-slice-bench.py` | The Findings 6/7/8 harness, currently unshipped |

#### Files to Modify

| Path | Change |
|---|---|
| `src/app/pages/transcribe-room-page.tsx` | Remove `useSpeechToText` + `liveTextStopped` UI + interim render; delete `RECORD_AUDIO_WHILE_LIVE`; wire slice loop; pre-warm in `handleJoin` |
| `src/app/data/transcribe-service.ts` | `joinRoom` → consent RPC; add the slice POST client |
| `supabase/functions/gcs-signed-url/handler.ts` | Consent gate on the room branch |
| `supabase/functions/gcs-signed-url/handler.test.ts` | Refusal case for the new gate + unchanged happy path |
| `src/app/content/privacy.md` | `### Transcribe rooms` + Gemini DPA row must name audio/transcript content |
| `docs/technical/infrastructure.md` | New live path alongside the `## Cloud Run: transcribe-session` section; state explicitly that the live path allocates nothing |
| `docs/technical/database.md` | New columns + RPC |
| `.private/docs/edge-function-secrets.md` | `transcribe-slice` → batch `GEMINI_API_KEY` (P834) |
| `supabase/deploy-manifest.json` | Stamped by `deploy-functions.sh` |

## Pre-deploy Checklist

Triggered by `.claude/rules/features.md` — a new edge function calling an external API.

### The contract migration is held back deliberately — apply it LAST

`supabase/migrations/20260908170100_p1236_b_drop_direct_member_insert.sql` exists in the `w5`
worktree, **uncommitted and unapplied to any database**, and that is the correct state until deploy.
It is the contract half of an expand/contract pair: it removes the `authenticated users can join as
themselves` INSERT policy, which is what still lets a member row be created without consent.

**Why not now.** `main`'s `transcribe-service.ts:180` still performs that direct insert (verified
2026-09-08). The test database is shared, so applying this migration today breaks "Join room" for
every session running `main` — including `e2e/p1149-chat-render.spec.ts`, which joins through the
browser as a real user rather than seeding with the service role. That is not a hypothetical
co-tenant inconvenience; it is a test in this repo that would start failing for a reason nobody
touching it would recognise.

**Why there is no exposure while it waits.** On prod, `/transcribe` still runs `main`'s code with
`RECORD_AUDIO_WHILE_LIVE = false`, so the capture branch is dead and `privacy.md`'s "nothing is
captured before you do" holds by construction today. The window this migration closes does not open
until the client change deploys — and this migration deploys with it.

- [ ] Apply `20260908170100_b` **after** the client cutover is on `main`, then commit it (the P270
      pre-commit gate requires it applied to test first, which is why it is untracked until now).
- [ ] Re-resolve its `requires-frontend: 26be25831` marker against `main` after `/ship` —
      cherry-picking rewrites the sha, and P1053 records this exact marker blocking forever on a
      commit its own pipeline had destroyed, stranding six unrelated migrations with it.

### Secrets to provision
- [ ] `GEMINI_BATCH_API_KEY` for `transcribe-slice` — a **distinct variable name** holding the
      existing batch key (`aikey-cp-batch-81413`, EUR 75 cap). Supabase edge-function secrets are
      scoped to the PROJECT, not the function, and prod's `GEMINI_API_KEY` is already the
      prod-interactive key that `generate-banner` reads; reusing that name would put every live
      transcription slice on the user-facing fuse. Record in `.private/docs/edge-function-secrets.md`
      in the same step.
      `npx supabase secrets set GEMINI_BATCH_API_KEY="$(~/.agents/bin/ai-keys --key-string --name cp-batch)" --project-ref <ref>`

### Deploy commands
- [ ] `./scripts/deploy-functions.sh transcribe-slice` (test), then `--env prod`
- [ ] `./scripts/deploy-functions.sh gcs-signed-url` — the consent gate ships with it
- [ ] Migration via `scripts/migrate.sh`; no `VITE_*` var is added, so no rebuild is forced by
      secrets — but the client change itself needs a Vercel deploy

### Post-deploy verification
- [ ] Unauthenticated `curl` to `transcribe-slice` → 401; authenticated non-member → 403;
      member without `consent_given_at` → 403. All three observed, not inferred
- [ ] Smoke a single slice on prod and confirm one `transcribe_messages` row with the correct
      `member_id`
- [ ] Sentry for new errors in the first 10 minutes
- [ ] Confirm the batch project's spend cap is still `Configured` in the console — it is
      **console-only and invisible to every script** (`gcloud billing budgets list` does not return
      it), so a cap that was never set looks identical to one that works
