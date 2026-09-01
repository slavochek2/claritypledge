---
status: week
type: bug
rank: 5
workstream: events
created_date: '2026-09-01'
tags: [transcribe, mobile, speech, p1196, p1149, p1152]
delivery_stage: dev
pipeline_ran: [create-bug, inline, adversarial-review, kdd]
drafted_by: opus
driver: founder
---

# P1213: `/transcribe` on Android loops "Reconnecting microphone…" forever — the restart budget resets on every session start

## Problem

**Situation:** [P1196](done/2026-06-10/p1196_transcribe_live_text_dies_on_mobile.md) fixed the
one-shot restart loop and shipped a loud terminal state: a "Live text stopped" banner carrying
the verbatim recognition error, plus a "Resume live text" tap target. It is confirmed live in
prod — the deployed `assets/useSpeechToText-*.js` and `assets/transcribe-room-page-*.js` both
carry the new strings.

**Complication:** The founder re-ran PV-1 on a Galaxy S22 on 2026-09-01. Live text still does
not work. The room shows "Reconnecting microphone…" cycling indefinitely, with the OS mic
indicator green. The "Live text stopped" banner — and therefore the raw error string P1196
built for exactly this diagnosis — **never appears**, so the device cannot be diagnosed from
its own screen. Desktop is unaffected (verified same day: spoken digits transcribed).

**Question:** Why is the terminal state unreachable, when P1196 bounded the retries?

## Root Cause

**Confirmed by test, device-independent.** `useSpeechToText.ts` reset
`restartAttemptsRef.current = 0` inside `onstart`. P1196's bound therefore only ever bound a
`start()` that **throws** — a session that never begins. It does not bind the Android shape,
where `start()` *succeeds*, `onstart` fires, and the session then dies at once having produced
no audio. Every cycle resets the budget, so `RESTART_MAX_ATTEMPTS` is never reached,
`liveTextStopped` never becomes true, and the room dead-ends in the non-listening branch —
"Reconnecting microphone…" — with no user recovery short of a page reload.

Reproduced without a device: a mocked recognition that fires `onstart` then `onend` with no
results ran **241 restart attempts in 60 simulated seconds** where the bound is 6.

**Note on why emulation was not used:** Chrome device emulation swaps user-agent, viewport and
touch — not the Web Speech implementation, and it cannot emulate Android's mic exclusivity. The
churn loop is pure hook logic and is fully reproducible in a unit test; the *cause* of the churn
is not, and stays with P1152.

## Fix

Judge a session by its outcome in `onend`, not by the fact that it started:

- Reset the restart budget only for a **productive** session — one that produced a result
  (final or interim), or that stayed open at least `PRODUCTIVE_SESSION_MS` (1500ms, a normal
  silence timeout).
- An instant, wordless session consumes the budget like a throw does, so exhaustion is reachable
  and the stopped-state banner + verbatim error actually render on the phone.
- `onend` now logs duration, `heard`, `productive` and the attempt count, so PV-1b can be read
  off the phone in one pass.

## Risks / Non-Goals

- **This does NOT make live text work on Android.** It removes a confirmed dead-end and makes
  the failure legible on-device. Whether the churn is mic contention with `MediaRecorder`
  (PV-1b/H1) or Android ignoring `continuous` (H2) is still unsettled and still belongs to
  [P1152](p1152_transcribe_physical_device_verification.md).
- **Non-Goal:** no change to `useSpeechToText`'s default (no-options) behavior — `/chat` and
  `TranscriptionInput` untouched; the P1149 DW-8 regression test passes unchanged.
- **Non-Goal:** the product decision P1196 named (laptops-open / server-side live / phones
  read-only) is not taken here.

## Done-When

- [x] A session that starts and ends immediately with no result consumes the restart budget —
      proven by a test that fails against the pre-fix hook (241 attempts vs. a bound of 6)
- [x] A session that produced a result, or that stayed open >= 1500ms, resets the budget —
      two separate regression tests
- [x] A session that never fired `onstart` (permission denial) cannot reset the budget, and an
      interim-only session cannot either — both reproduce the original unbounded loop (241 attempts
      vs. a bound of 6) against the first cut of this fix
- [x] Exhausting on silent churn sets a `no-audio` error carrying the session duration, and a new
      session clears the previous session's error rather than misattributing it
- [x] Full unit suite green: 3485 passed / 19 skipped, 304 files; tsc, eslint and build clean
- [ ] **PV-1 re-run on the S22 with this deployed:** the "Live text stopped" banner appears
      within ~8s and its error string is recorded here — settles H1 vs H2 (founder, on device)

## Adversarial Review

Run after the first commit (`25b9cb3e`). Codex was asked first and produced no findings across two
runs (see decisions.md 2026-09-01 [process]); the review that landed was one native hostile
reviewer, **1 of 1 reported**, plus a self-review that found two of the three defects.

| # | Finding | Status |
|---|---------|--------|
| 1 | `onstart` is not guaranteed to fire; on permission denial the start timestamp stays `0`, so `Date.now() - 0` reads as productive and the budget resets forever | **Fixed** (`sessionActiveRef`), test |
| 2 | "any result" counted interim text, which never reaches the room — budget stayed alive while the chat stayed empty | **Fixed** (final only), test |
| 3 | The churn path fires no `onerror` and throws nothing, so the stopped banner rendered with no error — or a stale one from a hiccup that had self-healed, misattributing the outage | **Fixed** (`no-audio` marker + clear on `onstart`), 2 tests |
| 4 | `PRODUCTIVE_SESSION_MS` is wall-clock (`Date.now()`), so phone backgrounding / screen lock can inflate a dead session past 1500ms and credit it as healthy | **Accepted, not fixed** — see below |

**Why #4 is accepted:** the harm is bounded and self-correcting. Only the *first* post-unlock
session can carry a spurious duration; the budget resets once, and the next churn cycle exhausts
normally. Worst case is one extra cycle (~8s) before the banner appears — never an unbounded loop,
which is what this spec exists to prevent. Closing it needs visibility tracking across the session's
whole lifetime; that is a real change to the hook's surface and is not worth taking on a fix whose
own defect rate this session was three-for-three. Revisit if PV-1 shows the banner arriving late
after a screen lock.

## References

- [P1196](done/2026-06-10/p1196_transcribe_live_text_dies_on_mobile.md) — the predecessor fix
- [P1152](p1152_transcribe_physical_device_verification.md) — PV-1 / PV-1b, still open
- [P1149](done/2026-06-10/p1149_live_room_transcription_chat.md) — the feature
