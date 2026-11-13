---
status: week
type: bug
rank: 106
severity: low
workstream: infrastructure
date_reported: '2026-11-05'
created_date: '2026-11-05'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [review-gate, stop-hook, finish]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1636: The review-gate stop check keeps blocking while background reviewers are still running

## Summary

During a P1630 build the P1505 stop check blocked about seven times with "you announced completion" while the review it demanded was already running.

## Root Cause

Hypothesis from reading the code, not yet reproduced against the transcript: `announces_completion` scans assistant text back to the founder's last message, and task notifications do not reset that window. One earlier "committed" therefore latches every later stop. This path has no retry budget and no check for outstanding background work.

## Invariants

- A completion announced before a final tool call still counts. Scoring only the last message is not the fix (the deliberate rule in `verify-before-stop.py`).
- Gate 1, edits with no review at all, stays unsuppressed.
- A lost notification must not silence the gate for good, so any stand-down has an age cap.

## Reproduction Steps

1. Edit a reviewable file, and write "committed" in an assistant message.
2. Start a background reviewer, and end the turn with a short status message.
3. Observe the block, then the same block on each later stop until the receipt exists.

**Reproduction rate:** expected 100% on this shape; to be confirmed by `/reproduce`.

## Expected Behavior

While background work this session started is outstanding, the check stands down, and it fires again if the work finishes without a receipt or the age cap passes.

## Actual Behavior

It blocks on each stop, and the status messages only add noise.

## Affected Files

- `.claude/hooks/verify-before-stop.py` — gate 3 path and its scanned window
- `~/.claude/hooks/day-pass-guard.py` — existing stand-down to port
- `scripts/test-p1505-review-gate.sh` — canary

## Severity

**Low** — no work is lost; it costs noise and quota on most builds that use background reviewers.

## Fix Approach

Port the age-capped stand-down from `day-pass-guard.py` to gate 3 only. See docs/decisions.md 2026-11-05 "Review-gate stop check should stand down while background reviewers run".

Also reword the gate's own block message (`verify-before-stop.py` ~line 883). It asks for every finding "as FIXED", and `fixed` is in `DONE_RE` (~line 77), so the reply to a block re-arms the gate. A stand-down alone does not cover that. Use a word outside the completion regexes and check it through `announces_completion`.

**Second occurrence (2026-11-13, P1677):** 3 fires in one session while `/finish` reviewers ran in the background, same latch shape. Severity stays low (no work lost); the recurrence argues for rank, not severity.

## Acceptance Criteria

- [ ] With a background reviewer outstanding, a status message after an earlier "committed" is not blocked
- [ ] Once that work finishes with no receipt, the block fires
- [ ] Past the age cap with no notification, the block fires
- [ ] Edits with no review and no running reviewer still block, and the existing canary passes
- [ ] A reply that follows the gate's own block message, as written, does not by itself announce completion (a canary case through `announces_completion`)
