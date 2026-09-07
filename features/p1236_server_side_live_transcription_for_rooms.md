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
3. Does the 30-minute Gemini cap apply when diarization is OFF? The cap is documented as tied to
   diarization/word-timestamps; unverified for plain transcription. Untouched by this measurement,
   which exercised the Whisper path only.
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
