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

`[FOUNDER DECISION: latency vs iteration. Now priced. Finding 2 below shows the two trade almost
1:1 — 4s chunks cost ~5 streams per L4 and land ~4-5s behind speech; 15s chunks cost ~10.6 streams
and land ~15s behind. What the measurement does NOT settle is whether 5s-late text is worth having
in a room, or whether the duplicate-and-rewrite surface of true streaming is worth paying for. Still
not decidable from code.]`

### Step-1 measurement — RESULT (2026-09-03)

Measured on the real thing: a throwaway Cloud Run service (`p1236-measure`, deleted after the run)
built `FROM` the exact production image, one nvidia-L4, `concurrency=1`, same
`WHISPER_MODEL=large-v3-turbo`. Input: 168.24s of real `/transcribe` room audio pulled from GCS
(five sessions, founder's own voice), catted and decoded the way `audio.py` does it. Diarization was
never invoked. Harness: `services/transcribe/measurement/`; raw per-chunk JSON archived to
`gs://claritypledge-ml-training/p1236-measurement/`.

Each row is one pass over the same 168.24s, sliced at that chunk length. **streams/L4** is
`chunk_seconds / mean chunk cost`: one live stream emits one chunk every `chunk_seconds`, and a GPU
container serves one chunk at a time. Cost columns are per chunk, steady state (chunk 0 excluded).

| chunk | VAD | chunks | VAD-gated | p50 | p95 | worst | **streams/L4** | GPU-s per audio-min | words |
|---|---|---|---|---|---|---|---|---|---|
| 2s | off | 85 | – | 0.46s | 1.24s | 4.26s | 2.9 | 20.7 | 237 |
| 4s | off | 43 | – | 0.48s | 1.81s | 6.83s | 4.4 | 13.9 | 205 |
| 8s | off | 22 | – | 0.55s | 3.12s | 3.38s | 7.5 | 8.2 | 173 |
| 15s | off | 12 | – | 0.70s | 1.87s | 2.66s | 15.4 | 4.1 | 161 |
| 30s | off | 6 | – | 1.09s | 1.16s | 5.15s | 28.4 | 3.7 | 129 |
| **2s** | **on** | 85 | 40 (47%) | 0.57s | 1.22s | 4.46s | **3.8** | 16.0 | 159 |
| **4s** | **on** | 43 | 12 (28%) | 0.67s | 1.26s | 7.19s | **5.2** | 11.8 | 139 |
| **8s** | **on** | 22 | 3 (14%) | 0.84s | 2.11s | 5.22s | **6.8** | 9.1 | 115 |
| **15s** | **on** | 12 | 2 (17%) | 0.99s | 3.03s | 4.67s | **10.6** | 6.0 | 130 |
| **30s** | **on** | 6 | 0 | 1.98s | 2.01s | 3.81s | **15.2** | 4.9 | 116 |

Whole-file batch over the identical audio, for reference: 10.2-14.9s wall for 168s of audio
(RTF ~0.07), 117-149 words. Word counts vary run to run on identical input — Whisper is not
deterministic here, so word count is a signal about hallucination volume, never a quality score.

**Finding 1 — the 3-5-speakers-per-L4 estimate was right for 4s and wrong as a constant.** It is a
function of chunk length, not a property of the GPU: 3.8 streams at 2s, 5.2 at 4s, 6.8 at 8s, 10.6
at 15s, 15.2 at 30s. The number to carry forward is **~5 concurrent live streams per L4 at
4-second chunks, VAD on**.

**Finding 2 — Whisper's cost is dominated by a fixed per-call floor, so latency and throughput
trade almost 1:1.** Transcribing 15x more audio per call (2s -> 30s) costs only ~2.4x more time.
Every second of latency conceded buys roughly proportional throughput, with no sweet spot hiding in
the curve. This is the shape of the founder decision, now measured rather than argued.

**Finding 3 — below ~8s the tail is the constraint, not the mean.** At 4s the p50 is 0.67s but the
worst chunk took 7.19s, longer than the audio it covered. A live path needs a queue-depth and
drop/skip policy, not just a throughput budget; a speaker in a dense stretch can otherwise fall
permanently behind.

**Finding 4 — short chunks hallucinate badly, and the existing VAD is what stops it.** Without VAD,
4-second chunks produced 205 words against batch's ~120 for the same audio: `"Thank you."` emitted
ten times over silence, stray tokens in other scripts, and one entirely fabricated sentence
(*"And now this time is coming in for space like this. OK, it's wide a higher authority, so the
creator's taste."*). This is the exact signature `vad.py` was written for — its docstring names
*P546: Added to fix hallucinations ("Thank you" x53)*. With VAD on, 4s output drops to 139 words
against batch's 134 and reads like the batch transcript. **The lavalier-per-phone design makes this
load-bearing rather than incidental:** each channel is silent whenever its wearer is not talking, so
most chunks on most streams are silence. VAD gated 28% of 4s chunks here, and it pays for itself —
throughput at 4s is *higher* with VAD on (5.2 streams) than off (4.4), because gated chunks skip
Whisper entirely.

**Finding 5 — the VAD the pipeline actually calls is broken in production.** `vad.py:91` loads
`pyannote/voice-activity-detection`, whose weights sit behind `pyannote/segmentation`. The deployed
`hf-token` secret returns **403 on both** (checked directly against the HF API), so
`Pipeline.from_pretrained` returns `None`, `.to()` raises `AttributeError`, and
`pipeline.py::_apply_vad` catches it and silently falls back to un-stripped audio. `pyannote/
segmentation-3.0` and `speaker-diarization-3.1` return 200 with the same token — which is why
diarization works and VAD does not. The measurement above used a `segmentation-3.0`-backed VAD for
that reason. **Not confirmed from a production log line:** no session has been transcribed inside
the retained log window, so there is no prod run showing the warning. Filed separately.

**Cost.** At 4s chunks with VAD, one live stream costs ~11.8 GPU-seconds per audio-minute; a
five-person room saturates one L4. Idle cost is unchanged only if the shutdown path holds — see the
P858 risk row below.

### The co-location premise — load-bearing and NOT established

The design under discussion assumes one person per audio stream, which would make speaker
attribution exact by construction and remove diarization entirely. `/slava:util:diarize`'s own
verified note supports it: *"If you control the recording, record a separate channel per person and
skip diarization entirely — device identity beats any model."*

**But this repo has already measured the opposite case.** [decisions.md](../docs/decisions.md)
2026-03-22 (P569) reports an energy scan of **17 multi-phone sessions** where each participant had
their own phone and every phone still captured every voice — *"Slava's phone is consistently louder
in all sessions"* — which is precisely why cross-phone energy comparison and LLM merge were built.
A phone on a table in a shared room is not a per-speaker channel.

So the premise holds only when participants are **acoustically separated** — remote, or on
close-talking mics — and fails when they are seated together.

**ANSWERED 2026-09-03 (founder):** rooms are **co-located — one physical room — but every
participant wears a lavalier microphone.** Verbatim: *"yes peopel for 1236 will be in one phsyical
room - but they will have livalier micorphone on them.. so ohpuflyl it recornds mostly them alone"*

This changes the premise from *contested* to *plausible but unmeasured*. A lavalier sits ~20cm from
its wearer's mouth while other speakers are 1-3m away, and level falls with distance — so the
wearer should dominate their own channel by a wide margin, unlike P569's phones-on-a-table scan.
"Should" is the operative word: **nobody has measured it on this setup**, and the margin depends on
lav pattern (omni vs cardioid), placement, room size and reverb, and how often people talk over each
other. P1237's research question 2 measures exactly this, and its 10dB criterion is the bar.

**ANSWERED 2026-09-03 (founder): each lavalier plugs into its wearer's own phone.**

That closes the premise. Every stream now carries one authenticated participant, so:

- **Attribution is exact by construction** — speaker identity is the room member who owns the
  device, never inferred from audio. Diarization has nothing to do on this path.
- **P1149's consent invariant holds unchanged** — each person consents for their own voice on their
  own screen, because each person still owns exactly one capture device.
- **The mic-contention defect is fully resolved rather than moved.** The browser opens one
  `getUserMedia` stream per phone; it is uploaded and transcribed server-side, so nothing competes
  for the microphone and the recording is a by-product of the same stream.

The only thing still unmeasured is **how much of a neighbour a lavalier picks up** — P1237 RQ2, 10dB
bar. That governs transcript cleanliness (stray words from the person next to you), not attribution,
which is now settled by device ownership regardless of what the audio contains.

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
| 4s fragments transcribe worse than whole files (no surrounding context) | MEASURED | Real without VAD (fabricated sentences), gone with it. Finding 4. The live path MUST gate on voice activity — it is not an optimization |
| The VAD the pipeline calls has been failing open in production | MITIGATE | Finding 5: `hf-token` is 403 on the two gated repos `vad.py` needs; `_apply_vad` swallows the error. Filed separately — the live path cannot be built on top of it until it loads |
| Only `chunk_000` carries a WebM header, so chunks are not independently decodable | MITIGATE | Confirmed on real session audio. Either the capture side emits standalone units or the server holds a per-stream decoder; "reuse the existing chunk upload path" is not a drop-in |
| Gemini credit coverage has changed since Apr 2026 | MITIGATE | Re-verify before committing; Cloud Run GPU is the proven fallback |
| Live text becomes slower than the browser path | ACCEPT | The browser path does not work on Android at all; slower and working beats instant and absent |
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
      as a number, replacing the UNVERIFIED 3-5-speakers-per-L4 estimate (2026-09-03: **~5 concurrent
      streams per L4 at 4s chunks with VAD**, p50 0.67s / p95 1.26s per chunk; full curve and method
      under "Step-1 measurement — RESULT")
- [x] Co-location and device-routing premises answered and recorded (2026-09-03: one room,
      lavalier per person, each into its owner's phone)
- [ ] The remaining founder decision (latency vs iteration) is answered here, after the measurement
- [ ] A person speaking on a physical Android phone sees their words in the room, verified over the
      adb DevTools console with the log pasted into this spec — the same instrument that produced
      the A/B above
- [ ] Two participants on two physical devices each see the other's words attributed correctly
- [ ] A room that has ended leaves no GPU instance allocated — verified from billing, not inferred
- [x] Current Gemini credit coverage re-verified against billing before any Gemini path is committed
      (2026-09-03, from the BigQuery billing export, superseding the Apr 2026 figure — see
      "Credit-eligible execution paths")
- [ ] `/transcribe` produces a stored recording again (by-product of the server-side stream),
      restoring what the `RECORD_AUDIO_WHILE_LIVE=false` mitigation currently gives up

## Open Questions

1. What is the measured dB margin between wearer and neighbours on a lavalier channel in this room?
   Unmeasured; P1237 RQ2 owns it.
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
