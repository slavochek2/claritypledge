---
status: week
type: bug
severity: high
rank: 1000094
workstream: transcription
created_date: '2026-09-10'
tags: [transcribe, transcription, mobile, android, investigation]
feature_type: frontend
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: anomaly
disclosure: public
---

# P1295: browser speech recognition is unfit for room transcription — three symptoms, one suspect

## Problem

**Situation:** P1275 restored `/transcribe` room creation on 2026-09-09. The first real
sessions on a physical Galaxy S22 against prod produced a room the founder could not use.

**Complication:** Three symptoms, reported together, on a normal Chrome install:

| symptom | measured |
|---|---|
| every line written about twice | 4 rooms, ratios 1.80 / 1.92 / 2.14 / 1.92 — including one in **incognito**, so not a cached bundle |
| words nobody said | founder: *"it also halucinates hugely.. i was not speaking about alhocol"* and *"a kit if kate bugtgs"* for ordinary speech |
| "Reconnecting microphone…" blinking | founder: *"blicking independently if i talk or not"* — and it renders in the **headless fixture** too, with a stubbed `getUserMedia` |

**Two fixes were attempted and both failed.** They are recorded because the pattern matters
more than either attempt:

1. **P1236's diagnosis — `MediaRecorder` contention.** Disproved: `RECORD_AUDIO_WHILE_LIVE`
   is `false` on prod and both `getUserMedia` and `MediaRecorder` sit inside that flag
   (`transcribe-room-page.tsx:133-166`), so nothing contends for the microphone, and the
   churn happened anyway.
2. **P1288's fix — duplicate `onresult` delivery at the same result index.** Shipped, then
   disproved by the incognito run at 1.92. The hook is now idempotent per result index; that
   is simply not where the duplication comes from. **The change is inert, not wrong.**

**Question:** is the browser's own speech recognition capable of this job at all, or is every
fix here a patch on a component that is about to be deleted?

> Founder, verbatim: *"how do we know it's a solvable problem? And how do we make sure that
> it's solved? Because I also don't want to be involved so much."*

## Why these are ONE bug and not three

Filed together deliberately. Splitting them invites three separate patches on three separate
hypotheses, which is exactly the loop that produced two failed fixes in one evening.

All three are consistent with a single suspect: **Chrome's Web Speech API on Android is a
short-utterance service being driven as continuous long-form dictation.** It ends sessions on
its own, re-delivers results across those boundaries, and degrades its language model badly
outside its design envelope. The duplication, the invented words and the restart churn are
three faces of the same mismatch.

**That is a hypothesis, not a finding.** It has not been instrumented. Do not act on it.

## The disproof — and it must run before ANY further fix

This has cost two wrong fixes. The next change waits for evidence.

On the physical device, over `adb`, log per `onresult`: `event.resultIndex`,
`event.results.length`, `isFinal` per entry, and a session counter incremented in `onstart`.
Then one 60-second session of ordinary speech.

- **Indices repeat within one session** → re-delivery inside a session. P1288's fix should
  already have caught it; if it did not, its reset logic is wrong.
- **Indices never repeat, but text repeats across a session boundary** → cross-session
  re-delivery. P1288's marker is session-scoped by design and structurally cannot catch this.
  This is the leading candidate and nothing has tested it.
- **Neither** → the duplication is not in the hook at all; look at the page's diff-and-send
  effect (`transcribe-room-page.tsx:122-129`) or at double component mounting.

Duplicate pairs land **0.01–1.43 s apart** (room `A4U9JD`), some effectively simultaneous —
which argues against a restart boundary and has not been reconciled with the founder's report
that restarts are frequent. That contradiction is the sharpest open thread in this spec.

## Acceptance Criteria

- [ ] The instrumented run above is performed and its raw output recorded here
- [ ] The duplication is attributed to a named layer, with the log line that proves it
- [ ] A decision is recorded: repair this path, or delete it (see below) — with the reason
- [ ] Whatever is chosen, a 60-second physical-device session produces a rows-to-distinct
      ratio of ~1.0 and a transcript the founder recognises as what they said

## The alternative to fixing it

**P1236 deletes this path.** It removes browser speech recognition entirely and sends audio to
a server. If the hypothesis above is right, that removes all three symptoms at once, because
there is no browser recogniser left to duplicate, restart or hallucinate.

P1236 is blocked on: a Gemini spend cap, two physical devices, and a prod deploy — **not** on
engineering. So the honest comparison is not "fix vs build"; it is "keep patching a component
that is scheduled for deletion, or finish the thing that deletes it."

**Recommendation: do the instrumented run, because it is cheap and it also tells us whether
P1236's server-side path will actually be better. Then finish P1236 rather than repairing
this one.** Recorded as a recommendation, not a decision — [FOUNDER DECISION: repair the
browser path, or go straight to P1236?]

## Why the founder is currently in the loop, and how to remove them

Every measurement so far needed the founder to hold a phone, because **this Mac cannot reach
the device**: `adb devices` lists nothing and no Samsung appears on the USB bus (checked
2026-09-10). So each iteration costs a human round-trip, which is why two failed fixes felt
like an evening lost.

This is a one-time setup, not a per-test cost. With USB debugging enabled and this machine
authorised on the phone, an agent can `adb reverse` the dev server to the device, attach to
the page over the DevTools protocol, read the console, inject the instrumentation above, and
iterate without anyone holding anything. The 2026-09-01 A/B in P1236 was run exactly this way,
so the setup has existed before and has since lapsed.

**Do this before the next attempt.** It converts the founder from a participant into a
recipient of results.

## Notes

- Rooms `RG7YQF`, `9XU2YJ`, `A4U9JD`, `X34TCD` are open on prod and hold real founder speech.
  Content is deliberately not quoted here (public repo) — every figure above is a count, a
  ratio or a timestamp. Deleting them is the founder's call.
- P1288 stays shipped. It is inert against this bug but it is not wrong: it makes the hook
  idempotent per result index and it closed a real speech-dropping hazard found in review.
