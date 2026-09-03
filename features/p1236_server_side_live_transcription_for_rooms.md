---
status: week
type: task
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

**Step 1 is a measurement, not a build.** Before choosing an architecture, measure how fast the
existing GPU service transcribes 4-second chunks **with diarization removed**. Every throughput
number discussed so far (3-5 concurrent speakers per L4) was extrapolated from P858's batch figure
of 5-15 GPU-minutes per 60 audio-minutes and is UNVERIFIED.

Then choose between two shapes the measurement can distinguish:

- **Chunked** — reuse the existing chunk upload path; transcribe each chunk on arrival. Estimated
  5-7s behind speech. One design, few unknowns.
- **Streaming** — continuous audio, partial hypotheses. Estimated 1-2s behind. Carries the known
  iterative surface: duplicate words at chunk boundaries, partial-to-final promotion, reconnection
  on a dropped radio.

`[FOUNDER DECISION: latency vs iteration. 5-7s makes live text a record that lands after the moment;
1-2s makes it usable in the room. The cost of 1-2s is several rounds of correction on text that
duplicates and rewrites itself. Not decidable from code.]`

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

`[FOUNDER DECISION: are `/transcribe` rooms co-located (people in one physical room, each on their
own phone) or acoustically separate (remote participants, or headsets)? P1149 does not state it.
Co-located → cross-talk is real and diarization or per-stream gating is still required. Separate →
diarization can be dropped entirely and attribution becomes exact.]`

### Credit-eligible execution paths

Both are Google services on billing account `010089-354936-77CD27`:

| Path | Credit status | Note |
|---|---|---|
| Cloud Run L4 GPU (existing `transcribe-session`) | **Proven** — the €659/mo leak was credit-masked to ~€12 net | Warm during sessions; cold start ~30s |
| Gemini Developer API (`generativelanguage.googleapis.com`) | **Documented, needs re-verification** — Apr 2026 billing shows €4.71 gross / €4.68 credited / €0.02 net | No GPU to keep warm; hard spend caps proven on this exact service (pp `docs/infra/gcp-spend-caps.md`: €0.50 cap tripped in 469s, ~zero overshoot) |

The Apr 2026 credit figure is five months old. Re-verify current coverage before committing.

Cold start must be hidden by waking the transcription path when a participant **joins** the room,
not when the first word is spoken — the consent and join screens supply the cover.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Live sessions re-introduce warm-GPU cost, the P858 failure shape | MITIGATE | Wake on join, shut down on last-member-leave; verify scale-to-zero via billing, not assumption |
| Co-location premise is wrong → attribution regresses vs today | MITIGATE | Blocked on the founder decision above; do not build the no-diarization path until answered |
| 4s fragments transcribe worse than whole files (no surrounding context) | MITIGATE | Part of the Step-1 measurement — compare chunked output against a batch run of the same audio |
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

- [ ] Chunk-transcription throughput with diarization removed is measured and recorded in this spec
      as a number, replacing the UNVERIFIED 3-5-speakers-per-L4 estimate
- [ ] Both founder decisions above are answered and recorded here
- [ ] A person speaking on a physical Android phone sees their words in the room, verified over the
      adb DevTools console with the log pasted into this spec — the same instrument that produced
      the A/B above
- [ ] Two participants on two physical devices each see the other's words attributed correctly
- [ ] A room that has ended leaves no GPU instance allocated — verified from billing, not inferred
- [ ] Current Gemini credit coverage re-verified against billing before any Gemini path is committed
- [ ] `/transcribe` produces a stored recording again (by-product of the server-side stream),
      restoring what the `RECORD_AUDIO_WHILE_LIVE=false` mitigation currently gives up

## Open Questions

1. Are `/transcribe` rooms co-located or acoustically separate? (Founder decision above — gates the
   whole no-diarization premise.)
2. Does chunked transcription quality hold on 4-second fragments? Unmeasured.
3. Does the 30-minute Gemini cap apply when diarization is OFF? The cap is documented as tied to
   diarization/word-timestamps; unverified for plain transcription.

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
