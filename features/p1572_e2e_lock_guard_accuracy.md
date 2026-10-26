---
status: qa
type: bug
rank: 91
workstream: infrastructure
created_date: '2026-10-26'
tags: [e2e, tests, infra]
disclosure: public
pipeline_ran: [create-spec, fix]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1572: The e2e lock reports a bad key as an overloaded database, and overstates its reach

Promoted from a Codex review of the P1541 files, 2026-10-26.

## Problem

Codex reviewed the P1541 e2e lock and found:

1. **(MEDIUM)** Any failed health probe was reported as "TEST database is overloaded", exit 75, including an HTTP 401 from a wrong key. The rule tells agents to treat 75 as infrastructure and not retry, so a configuration error could be ignored.
2. **(MEDIUM)** The comments and rule called the lock "machine-wide". It lives in the git common dir, so it covers every worktree of this repository, and a separate clone is not held off.
3. **(LOW)** The rule did not say that `--ui`, `--list` and CI skip the lock.
4. **(LOW)** A config comment gave main's port as 5000; it is 5001.

> "Just do it yourself, you are the orchestrator"

## Appetite

Low blast radius (test tooling only). Reversible by git revert. No founder decisions.

## Solution

- A 4xx probe answer other than 408 and 429 means "TEST refused the request". It fails at once, with no retry, prints a configuration message, and exits 1.
- Item 2 is fixed in the wording, not by moving the lock. A move to `~/.cache` was tried and reverted: during the switch, checkouts on old and new code would take different locks and run at the same time. Both Gemini and Codex reproduced this. No separate clone exists on this machine.
- The rule and comments name the skip modes and the correct port.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A separate clone runs alongside | ACCEPT | none exists; documented in the module header |

Do NOT move the lock location.

## Done-When

- [x] Wrong key: a live run exits 1 with "refused the request (HTTP 401) … configuration error". 401/403/404 are not retried; 0/408/429/503 still are. 4 new unit tests fail on the old code, and all 29 pass.
- [x] A normal live run still takes the lock and passes.
- [x] Reviews: Gemini and Codex both found the lock-move HIGH, which was reverted; the final Codex round passed with no findings.
