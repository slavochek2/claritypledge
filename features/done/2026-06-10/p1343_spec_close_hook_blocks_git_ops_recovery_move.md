---
status: all-done
type: bug
rank: 11
severity: medium
workstream: infra
date_reported: 2026-09-22
created_date: 2026-09-22
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [hooks, git-ops, spec-close]
disclosure: public
pipeline_ran: [create-bug, fix, ship]
completed_at: 2026-09-22
---

# P1343: block-manual-spec-close refuses the reverse move git-ops prints as its own recovery

## Summary

INBOX-62. When `git-ops.sh ship` fails at the close commit it tells the operator to move the spec
back OUT of `features/done/`. `.claude/hooks/block-manual-spec-close.py` refuses that move, so the
only working recovery has been a Python rename the hook's regex does not see.

## Root Cause

Verified 2026-09-22 by feeding the hook synthetic tool-input JSON: `is_close_shaped` returns True
when *any* spec path in the command is not already under `features/done/`. In a reverse move the
destination (the open path) is exactly such a path, so the recovery is classified as a close.
It never asks which path is the source and which the destination.

Probe results on current `main` (exit 2 = blocked):

| command shape | expected | actual |
|---|---|---|
| `git mv <done>/pN.md features/pN.md` (recovery) | allow | **2** |
| `git mv features/pN.md <done>/pN.md` | block | 2 |
| `git mv features/pN.md <done-dir>/` | block | 2 |
| `mv features/pN.md <done>/pN.md && git add …` | block | 2 |
| `cp x /tmp/y; cat <done>/pN.md` | allow | 0 |

Side finding: the hook also blocked this session's own diagnostic Bash calls because the probe
strings contained both paths, which is the same co-occurrence weakness.

## Invariants

- Every forward close (spec → `features/done/`) by `mv`/`git mv`/`cp`/`rsync`/`install` stays blocked.
- The hook fails OPEN on anything it cannot parse (module docstring).

## Reproduction Steps

1. Pipe `{"tool_name":"Bash","tool_input":{"command":"git mv features/done/2026-09-14/p500_x.md features/p500_x.md"}}` to the hook.
2. Observe exit 2 and the "BLOCKED" message.

**Reproduction rate:** 100%.

## Expected Behavior

A move whose destination is outside `features/done/` is allowed; forward closes are still refused.

## Actual Behavior

Both directions are refused.

## Affected Files

- `.claude/hooks/block-manual-spec-close.py` — `is_close_shaped`.
- `scripts/test-pipeline-gates.sh` — the hook's canary.

## Severity

**Medium** — blocks the documented recovery after the P1279 race; the workaround is a bypass.

## Fix Approach

For `mv`/`git mv` commands, parse the argument list (shlex, per `&&`/`;`-separated segment) and
treat the LAST path argument as the destination: block only when the destination is in
`features/done/` and a source spec is not. Keep the current co-occurrence rule as the fallback for
`cp`/`rsync`/`install` and for anything that fails to parse (still refusing forward closes).
Add both directions to the canary.

## Acceptance Criteria

- [x] The reverse (recovery) move is allowed (exit 0). — canary F8, F9; direct probe exit 0.
- [x] The three forward-close shapes above are still blocked (exit 2). — F1, F7, F10-F13, plus F14-F19 added after review: a reopen chained with `sudo mv`, `/bin/mv`, `$VAR` destination, `cd && mv`, `xargs mv`, `sh -c` is blocked; `command mv`, `env mv`, `bash -c` probed, exit 2.
- [x] The read-only closed-spec command is still allowed. — F4, F6.
- [x] `bash scripts/test-pipeline-gates.sh` passes, with the new cases included. — "all P1246 pipeline-gate invariants hold (… F1-F19 …)". Controls: pre-fix hook fails F8; the first fix commit fails F14-F19.

## Review

Opus and Codex both found the first version's bypass (a reopen segment carried any
non-`mv` segment through). Fixed in `c319a3816`: any segment that is not a plain `mv` /
`git mv` voids the exemption, and any `$` token does too.
