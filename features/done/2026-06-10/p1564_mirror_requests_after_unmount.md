---
status: all-done
type: bug
rank: 91
workstream: infrastructure
created_date: '2026-10-25'
tags: [mirror, chat]
disclosure: public
pipeline_ran: [create-spec, fix]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
completed_at: 2026-10-24
---

# P1564: The mirror sends requests after it is switched off

Promoted from the task inbox, 2026-10-25.

## Problem

Found by Codex in the P1560 review; already on production before P1560. After the mirror is switched off (for example navigating to /live), two delayed callbacks in `src/app/pages/chat/mirror-provider.tsx` still reach the server: a job poll that was in flight calls `resync()` when it resolves `done`, and the "portrait painted in another tab" re-read calls `getMirrorProfile` 20 s later. Wasted requests only — no data crosses between people.

> "ok then do the 221?"

## Appetite

Low blast radius (one provider, no schema). Reversible by git revert. No founder decisions.

## Solution

Delayed re-reads go through one helper that records each timer; unmount clears them all. The poll's resolve handler checks `mounted` before acting.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| StrictMode double-mount drops a live timer | MITIGATE | cleanup clears only on real unmount; Codex re-ran the suite under StrictMode, 6/6 |

Do NOT change the mirror's request logic beyond the unmount guards.

## Done-When

- [x] A job poll in flight when the mirror is switched off asks for no resync — unit test fails on the old code, passes on the fix.
- [x] A portrait being painted elsewhere is not re-read after switch-off — unit test fails on the old code, passes on the fix.
- [x] Existing mirror and P1560 tests still pass (14/14); Codex review PASS with no findings.
