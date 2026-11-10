---
status: week
type: task
rank: 118
workstream: infrastructure
created_date: '2026-11-10'
tags: [push, push-flag, git-ops, reliability]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1654: The push flag is deleted early by an earlier grant's timer

## Problem

> Founder framing, verbatim: *"I think there are a couple of things that went wrong so maybe you
> analyze it and then see if we need any improvement"* (on the last pushes, 2026-11-10)

**Situation:** `push-on N` (founder's shell function in `~/.zshrc`, lines 501-523) writes an expiry
into the push flag and starts a detached `( sleep N*60; rm -f <flag> ) &!` timer (line 521).
**Complication:** Nothing cancels an earlier timer. When the founder runs `push-on` a second time
(the normal recovery after a lapse), the first grant's timer still fires on its original schedule
and deletes the new flag. Reproduced in scratch on 2026-11-10: a flag re-armed for 10s was deleted
at t≈3s by the first 3s timer. It hit both of the last two `/push` runs:

- 2026-11-09 10:38Z, promote of `67040daab`: the preflight said "57 min left (expires 11:18Z)".
  About 18 minutes later the promote failed with `/dev/tty: Device not configured` because the flag
  was gone, and `push-status` then said "Push disabled".
- 2026-11-10 02:43Z, promote of `4bcca00f6`: the same failure, "Push cancelled", although the
  preflight at 02:26 had reported 59 min left.

Each incident cost the founder a round trip to re-arm, plus a repeated 13-16 minute staging CI
wait. The session at the time recorded "I don't know why the file vanished". Nothing gets past a
gate: the failure is closed, and it costs time and attention.

**Second, smaller defect:** a missing flag at the promote step falls through to the TTY confirm.
In an agent shell that surfaces as `/dev/tty: Device not configured`, which does not say the flag
is gone or what to do.

**Question:** How do we make a re-armed grant last its full stated window, and make a missing flag
at the promote step say so?

## Appetite

Blast radius: medium. It touches the founder's push authorisation path, but only the flag's
lifetime, never what the flag permits. Reversibility: high, a single revert of each edit. Decision
density: one founder call, listed below.

## Invariants

- The flag stays human-controlled. No agent creates, extends or re-arms it (global CLAUDE.md;
  hook `block-prod-deploy.sh`; decisions.md 2026-09-11 "The push flag authorizes the session the
  founder is watching").
- Expiry enforcement is unchanged. Both consumers read line 1 (`pre-push-checks.sh:340`,
  `block-prod-deploy.sh:93` `head -1`) and fail closed on an ambiguous value. Line 1 keeps exactly
  its current format.
- `ship-to-prod` still always asks y/N on the TTY (decisions D1, "Push-enable waives nothing here").
- Failure stays closed: a fix may not turn a missing or expired flag into an allowed push.

## Solution

**A. One live timer per grant (`~/.zshrc` `push-on`).** Each arm writes a unique nonce on line 2
of the flag. Its timer deletes the file only if line 2 still holds that nonce. A re-arm therefore
makes every earlier timer a no-op, and the newest timer expires the flag on schedule. `push-off`
is unchanged and still deletes immediately.

- The nonce comes from `uuidgen`. If it comes back empty, `push-on` stops and leaves any existing
  flag untouched. **Not `$RANDOM`**: a scratch control built that way failed, with both arms
  comparing equal.
- Founder decision 2026-11-10: the agent applies the edit ("I'm asking you if you can fix it").
  The agent never runs `push-on`. Tests use the real function's text, extracted and pointed at a
  scratch file, with seconds in place of minutes.
- **Why the timer stays (review round 1):** Gemini proposed dropping it, because both consumers
  already reject an expired flag. But `~/.claude/scripts/guard-drift-check.sh:28` reports the
  push window from the file's presence alone, so an expired file left on disk would show "open"
  in the day report.

**B. Clear refusal when there is no terminal (`scripts/pre-push-checks.sh`, Layer 3).** Codex's
review found that the `/dev/tty` error comes from the pre-push hook's Layer 3, not from
`git-ops.sh`, which already refuses non-TTY stdin cleanly. Layer 3 now probes `/dev/tty` before it
reads from it. When the probe fails, the hook exits 1 with three lines: the push was refused, the
usual cause (the window lapsed or was removed), and the recovery. The flag predicate, the TTY
confirm and the refusal itself are all unchanged; only the message is new.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A consumer reads the whole file and chokes on line 2 | MITIGATE | Both known consumers use `head -1` (verified 2026-11-10). `/dev` greps for any other reader before shipping. |
| Old timers still running from before the change delete a new-format flag | ACCEPT | Old timers die within one grant, at most 2h, of the edit landing. The founder is told, so a repeat inside that window is not misread as a new bug. |
| Check-then-delete race: an old timer reads its nonce, a re-arm replaces the file, then the old timer deletes the new grant (Codex and Gemini) | ACCEPT | The window is the microseconds between `sed` and `rm`, and it can only open when a re-arm lands at the exact second an old grant ends. The failure is closed, and the cost is the same re-arm that happens every time today. |
| Nonce collision | MITIGATE | `uuidgen`, with an abort when it is empty. |
| The B probe is wrong in a PTY-wrapped shell (Gemini) | MITIGATE | The probe opens `/dev/tty` exactly as the read that follows does, so the two cannot disagree. Tested both ways. |

**Non-Goals**
- Do NOT change what the flag authorises, its TTL cap, or the 20-minute preflight threshold.
- Do NOT let any agent arm, extend or touch the flag.
- Do NOT address the other findings from the same investigation (filed as task-inbox notes): the
  cost figures in the P1653 spec caught only at push time, the Keychain dialog stalling the prod
  migrate for about 28 minutes, the undiagnosed non-required CI `test` failure on run 42744917006,
  and `deploy-drift.sh` exiting 1 after the push (see the self-hosted TEST note filed 2026-11-10).

## Done-When

- [x] The real `push-on` text (extracted, scratch path, seconds) arms 3s then re-arms 6s. The flag
      is still present at t=4: "PASS: re-armed flag alive at t=4". The known-bad control, the old
      logic, lost it at t≈3: "BUG REPRODUCED".
- [x] The second grant's own timer removes it: "PASS: second timer expired it at t~7".
- [x] Line 1 keeps its exact format (`line1=2026-11-10T06:54:53Z`). Both enforcing consumers read
      only line 1 (`pre-push-checks.sh:340`, `block-prod-deploy.sh:93`).
- [x] Every reader of the flag is listed: the two consumers above; `guard-drift-check.sh:28`
      (presence only, unaffected); `push-status` (line 1); `git-ops.sh` (comments only);
      `settings.json:116` (a permission rule, not a reader).
- [x] With no terminal, Layer 3 prints the refusal and exits 1 ("GUARD FIRES (no tty) rc=1"). With
      a pseudo-terminal it falls through to the normal y/N ("tty present, guard passes through").
      `bash -n` passes.
- [ ] The decisions entry 2026-09-01 "three independent clocks" gains a line naming this fourth
      clock (via `/kdd`).

## Alternatives Considered

- **Kill earlier timers via a PID file.** Rejected: a dead PID can be reused, and it adds a second
  file to keep consistent. The nonce check is self-contained.
- **Drop the timer entirely and rely on expiry enforcement.** Both consumers already reject an
  expired flag. But the decisions record a "permanent-flag bug" that the timer and cap guard
  against, and `guard-drift-check.sh:28` reports the window from the file's presence, so an
  expired file left on disk would read as "open". Keep the timer; scope it to its own grant.
- **Ask the founder never to re-arm.** Rejected: re-arming is the documented recovery.

## Rollback Strategy

Revert the `~/.zshrc` edit and the `scripts/pre-push-checks.sh` Layer 3 probe independently. A flag with a nonce on line 2
remains valid for the old function's consumers.

## Related

- decisions.md 2026-09-01 "The second `push-on` was never one bug" (three clocks). This is a fourth.
- decisions.md 2026-09-11 (flag authorises only the watched session).
- P1526, P1641 (push credential and privacy gates).
