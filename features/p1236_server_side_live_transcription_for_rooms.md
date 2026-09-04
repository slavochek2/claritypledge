---
status: week
type: task
disclosure: public
rank: 1000066
workstream: transcription
created_date: '2026-09-03'
tags: [transcribe, transcription, mobile, gpu, cost]
delivery_stage: create-spec
pipeline_ran: [create-spec]
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
      (Finding 8 — without overlap, `"doesn't"` became `"that"`)
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
3. Does the 30-minute Gemini cap apply when diarization is OFF? The cap is documented as tied to
   diarization/word-timestamps; unverified for plain transcription. Untouched by this measurement,
   which exercised the Whisper path only.
4. Does the chunk-length/throughput curve hold for dense conversational speech? Findings 1-3 rest on
   168s of sparse test audio from one speaker. The fixed-per-call-cost mechanism (Finding 2) should
   be speech-independent, but the VAD gating rate (28% at 4s) certainly is not.

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
