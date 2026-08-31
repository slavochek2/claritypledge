---
status: in-progress
type: bug
rank: 5
workstream: events
created_date: '2026-08-31'
tags: [transcribe, mobile, speech, p1149, p1152]
pipeline_ran: [create-bug]
driver: founder
drafted_by: opus
---

# P1196: `/transcribe` live text dies on mobile — the auto-restart loop is one-shot

## Problem

**Situation:** [P1152](p1152_transcribe_physical_device_verification.md) held
four physical checks for [P1149](done/2026-06-10/p1149_live_room_transcription_chat.md).
PV-1 asked: does live text survive on phones? P1152 was closed `all-done` on 2026-08-24 with
all five Done-When boxes unchecked — the check was never run and never recorded.

**Complication:** The founder ran it on 2026-08-31 against prod. On mobile, `/transcribe`
shows no words. PV-1 outcome: **fail**.

**Question:** What in the live half breaks on phones, and what is fixable in the browser?

## Root Cause

**Confirmed by reading the code (device-independent):** the `autoRestart` loop in
`src/hooks/useSpeechToText.ts` is one-shot.

```js
recognition.onend = () => {
  if (autoRestart && !intentionalStopRef.current) {
    try { recognition.start(); }
    catch { console.warn('...'); }   // "the next onend retries." — it cannot
  }
}
```

`onend` only fires at the end of a recognition *session*. If `start()` throws, no session
begins, so no further `onend` ever fires and the restart loop is permanently dead — with
`isListening: false`, no error state, and nothing on screen saying live text stopped.

On mobile that throw is the normal case, not an edge:

- **iOS Safari** requires a user gesture for `start()`. A call made from inside `onend` is not
  one → `NotAllowedError` on the first restart. Combined with iOS ignoring `continuous`
  (recognition ends after each utterance), this kills live text after the first sentence.
- **Android Chrome** throws `InvalidStateError` on an immediate synchronous restart.

**Unconfirmed, needs a device (tracked as PV-1b below):** microphone contention.
`transcribe-room-page.tsx:116` opens `getUserMedia` and starts `MediaRecorder`, then starts
recognition on top. P1149 called this "a proven pattern, already shipping in `/chat`" — but
`/chat` is a laptop surface, so that proof never covered phones, where the mic is effectively
exclusive. If this is also true, recognition gets silence regardless of the restart fix.

The two compose: contention (or an iOS session end) kills the first session, and the one-shot
loop guarantees it never comes back.

## Fix

1. **Schedule the restart instead of calling it inline.** A `setTimeout`-based retry off a
   ref, with backoff and a bounded attempt count, so a throwing `start()` retries rather than
   ending the loop.
2. **Fail loud, not silent.** Expose a `liveTextStopped` state when retries are exhausted, and
   the last recognition error verbatim.
3. **Give the user the gesture iOS demands.** (Review round 1 found this path had its own
   dead end: `startListening` cleared the stopped state optimistically and swallowed a
   throwing `start()`, so a failed Resume tap removed the Resume button. Fixed and tested.) A visible "Resume live text" control in the room
   that calls `startListening()` from a real tap — the only thing that can restart recognition
   on iOS at all.
4. **Make the phone diagnosable.** Tagged console output for every recognition
   start/end/error, so PV-1b can be settled from a phone console in one reading.

Audio upload is untouched by all of this: chunks keep uploading and the corrected transcript
is produced regardless of whether the live half is working.

## Risks / Non-Goals

- **Non-Goal:** do not change `useSpeechToText`'s default (no-options) behavior. `/chat` and
  `TranscriptionInput` must stay byte-for-byte as they are — the P1149 DW-8 regression test
  locks this and must keep passing.
- **Non-Goal:** do not move the live half server-side in this spec. If PV-1b confirms mic
  contention, that is the product decision PV-1 already framed (laptops-open / server-side
  live / phones read-only) and belongs to the founder, not to this fix.
- **Risk:** this fix may not be sufficient. It removes a confirmed defect and makes the
  failure visible and diagnosable; it does not prove live text works on phones. Only a
  physical re-run of PV-1 decides that.

## Done-When

- [ ] `start()` throwing inside the restart path schedules another attempt — proven by a test
      whose mock `start()` throws, asserting a later attempt occurs
- [ ] Retries are bounded, and exhaustion sets `liveTextStopped` rather than failing silent
- [ ] The P1149 DW-8 regression test passes unchanged (default behavior untouched)
- [ ] `/transcribe` renders a visible stopped-state banner with a working "Resume live text"
      tap target
- [ ] PV-1 re-run on a physical Android and a physical iPhone, output pasted, outcome recorded
      here and in P1149
- [ ] PV-1b settled: phone console read, mic contention confirmed or ruled out

## References

- [P1149](done/2026-06-10/p1149_live_room_transcription_chat.md) — the feature
- [P1152](p1152_transcribe_physical_device_verification.md) — the physical
  checks; reopened by this spec, PV-1 recorded as fail
