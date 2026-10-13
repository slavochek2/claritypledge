---
status: week
type: bug
rank: 33
severity: medium
workstream: live
date_reported: '2026-10-13'
created_date: '2026-10-13'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [live, mic-permission, recording, consent]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1477: Reloading a recorded /live session skips the mic gate, because the page forgets the session's recording setting

## Summary

A participant who reloads `/live` in a **recorded** session goes straight back to the live view with
no mic check. The page's `isPrivate` flag is never restored from the session, and it defaults to
private, so the gate treats every reloaded session as private.

## Root Cause

In `src/app/pages/clarity-live-page.tsx`:

- `:484` `const [isPrivate, setIsPrivate] = useState(() => searchParams.get('insights') !== 'on');`.
  This is local UI state that defaults to `true` (private), per P1307 D12 (consent must be an explicit
  opt-in).
- `isPrivate` is only ever written by the pre-creation toggle (`:4282`) and the reset to `true` on exit
  (`:3514`). Verified by `grep -n "setIsPrivate("` on 2026-10-13. **No session-restore path writes it**
  from the session's stored `isPrivate` (`api.ts:955` maps `is_private` onto `session.isPrivate`).
- `gateMicAndGoLive` (`:3896`) returns early with `setView('live')` when `isPrivate` is true
  (`:3901`, P160 Gate D). After a reload, `isPrivate` is `true` unless the reloaded URL happens to carry
  `?insights=on`, so the mic is never requested.

There are several restore paths that call `setSession(…)` and then `setPendingLiveTransition(true)`,
which runs `gateMicAndGoLive`: the reload restore at `:1018-1032`, the rejoin handler at `:3287-3320`,
and others at `:1392`, `:3464`. All of them inherit the stale flag.

**Unverified consequence:** the recording-start effect (`:910-936`) requires
`micStatus === 'granted'` and `!session.isPrivate`. With the gate skipped, `micStatus` may stay
`'unknown'`. If so, a recorded session silently **stops recording** after any participant reloads.
The P511 comment at `:3313` says `gateMicAndGoLive` is what re-acquires the stream after a reload.
Not measured.

## Invariants

- **Consent stays opt-in.** A session whose stored `isPrivate` is `true` must never start recording,
  and the pre-creation default stays private (P1307 D12). The fix may only ever make the gate run
  **more**, never make a private session record.
- **Once a session exists, its stored `isPrivate` is the source of truth** for the mic gate and the
  recording effect. The local toggle state is meaningful only before the session is created ("locked
  after session created", `:478`).
- **The recording effect's own Gate C (`!session.isPrivate`) stays.** It is the second, independent
  check and must not be removed in favour of the restored flag.

## Reproduction Steps

1. As the creator, start a `/live` session with recording on (`?insights=on` or the toggle), and let a
   joiner join, so both are in the live view.
2. On the joiner's tab, deny microphone access in the browser (or use the switchable `getUserMedia`
   mock from `e2e/p1344-live-mic-cancel.spec.ts`, `installSwitchableMic`).
3. Reload the joiner's tab.
4. Observe: the joiner lands back in the live view with no mic dialog.

**Reproduction rate:** 100%. Measured 2026-09-22 while writing P1344's E2E: a joiner reload with
getUserMedia denied went back to the live view, with no dialog.

## Expected Behavior

After a reload of a recorded session, the mic gate runs exactly as on first entry: mic granted means
straight to live (and recording resumes); mic denied means the mic dialog is shown. A private
session's reload is unchanged (no mic check).

## Actual Behavior

The gate is skipped on every reload unless the URL carries `?insights=on`.

## Affected Files

- `src/app/pages/clarity-live-page.tsx`: `isPrivate` state (`:484`), `gateMicAndGoLive` (`:3896-3922`),
  and the restore paths listed above.
- `e2e/p1344-live-mic-cancel.spec.ts`: has the `installSwitchableMic` helper to reuse.

## Severity

**Medium.** The mic consent check is bypassed on reload, and recording probably stops for the rest
of a session whose participants opted in. It does not cause unconsented recording: the failure is
toward recording less, not more.

## Fix Approach

Make the gate read the session's stored setting once a session exists. For example, compute the
effective flag as `session ? session.isPrivate : isPrivate` inside `gateMicAndGoLive` (and anywhere
else that gates on `isPrivate` after creation). The alternative is to `setIsPrivate(session.isPrivate)`
on every restore path. Prefer the single derivation point: the restore-path approach needs one edit
per path, and one missed path is this bug again. Check the creator-side `:974` mic pre-request effect
with the same lens.

## Acceptance Criteria

- [ ] E2E (new, e.g. `e2e/p1477-live-reload-mic-gate.spec.ts`): in a **recorded** session, a joiner
      whose mic is denied reloads and sees the mic dialog, not the live view. This test was seen to
      fail on main before the fix.
- [ ] Same E2E: in a **private** session, a joiner reload goes straight back to live with no mic
      request (a regression guard on consent opt-in).
- [ ] Same E2E: in a recorded session, a joiner whose mic is granted reloads and lands in the live
      view.
- [ ] The recording-resume question is answered with evidence in the fix notes: after a granted-mic
      reload in a recorded session, does recording restart? (Observable via the dev-recording flag
      `?dev-recording=1` and the chunk upload or the recording indicator.) If it does not, that is
      filed as its own follow-up, not fixed here.
- [ ] `e2e/p1344-live-mic-cancel.spec.ts` and `e2e/live-meeting-mic-permission.spec.ts` still pass.
- [ ] No console errors during the reload flow.

## Non-Goals

- Do NOT change the consent default, the toggle UI, or the `?insights=` URL contract.
- Do NOT change recording, chunk upload, or transcription logic. If recording does not resume, record
  that and file it separately.
- Do NOT refactor the restore paths beyond what the fix needs.

## Related

- P160: private session mode (Gate C / Gate D). P1307 D12: consent default off.
- P1344: the mic-cancel E2E where this was found. P511: session restore and rejoin.
- B48: the mic gate before the live view.

Promoted from the task inbox, 2026-10-13.
