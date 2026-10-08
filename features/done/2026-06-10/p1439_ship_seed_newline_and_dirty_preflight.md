---
status: all-done
type: bug
rank: 1
created_date: '2026-10-08'
tags: [git-ops, ship, process]
disclosure: public
pipeline_ran: [inline, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
severity: medium
completed_at: 2026-10-08
---

# P1439: `/ship` seed loses the spec's trailing newline; no up-front check for co-tenant edits

## Problem

> Founder framing (2026-10-08, after the P1438 ship): *"Do we need to adversarially review these two problems and consider alternative causes ... If you reach a decision to change it, you can file the spec or just proceed without the spec."*

**1. Seed byte drift (since June).** For a spec born on its branch, `git-ops.sh ship` commits a "creation blob" seed on main so the creation cherry-pick replays as a no-op (decisions.md 2026-06-27 [process], the add/add fix). The seed was written via `x="$(ship_spec_creation_blob …)"; printf '%s' "$x" > file`. Command substitution strips the trailing newline, so the seed was never the creation blob. Measured: 25 of 25 recent seed commits on main lack the final newline; P1438's seed was 13298 bytes against a 13299-byte creation blob, and its first pick conflicted add/add. The Layer-2 safety net compared `$(git show …)` strings, which hid the same difference, so it only rescued specs never edited after creation — and `/dev` stamps edit nearly every spec. No test drove the real seed path: HH pre-seeds main by hand, so `need_seed=0`. A `FileNotFoundError` traceback also printed on every seed path (`ship_journal_flag` read the journal before it existed).

**2. No tracked-dirty preflight (INBOX-42, second instance).** When a co-tenant has an uncommitted edit on main to a file a pending commit changes, git refuses that pick — partway through the sequence, leaving main half-landed. P1174 (2026-08-28) and P1438 (2026-10-08, `docs/process-learnings.md`) both hit it; P1438's recovery needed a hand-applied partial commit plus `--mark-landed`.

**Review before fixing:** the cause of (1) was found by a `/kdd` Opus critic that falsified the first diagnosis ("the spec was edited between creation and first commit") and reproduced with real bytes; a Sonnet critic reproduced the add/add independently; the main session re-measured 25/25. (2) was already specified in INBOX-42.

## Solution

1. Seed: redirect `ship_spec_creation_blob` straight into the file — no `$()`.
2. Layer 2: compare blob ids (`git rev-parse <rev>:<spec>`), not substituted strings.
3. `ship_journal_flag`: return "not set" when the journal does not exist yet.
4. Preflight, before the seed and the first pick: intersect files touched by the not-yet-landed commits (journal, or `main..branch` on a fresh run) with main's modified + staged files; refuse naming them, nothing picked. Skipped while our own pick is paused (dirty files are then the operator's resolution).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Preflight refuses a legitimate resume | MITIGATE | Scoped to pending commits only; skipped under our own CHERRY_PICK_HEAD; QQ/KK/MM resume tests pass |
| A co-tenant edit lands between preflight and pick | ACCEPT | The lock serializes committers, not editors; git still refuses safely, as before |
| Long-lived co-tenant edit still blocks the ship | ACCEPT | The preflight changes WHEN it refuses (before main moves), not WHETHER |

Non-goals: no change to the add/add auto-resolve rules beyond the comparison; no stash or auto-commit of co-tenant files.

## Done-When

- [x] HH2: real seed path (branch-only spec ending in a newline, edited after creation) — seed blob id equals creation blob id, no conflict, no traceback, ship completes. Fails on the old code (seed `3a59a39` ≠ creation `ad3db26`).
- [x] HH3: co-tenant edit to a file a pending commit changes — refused up front, file named, main HEAD unchanged, edit preserved. Fails with the check disabled.
- [x] HH4 control (gate 7c): co-tenant edit to an unrelated file — ship completes, edit preserved.
- [x] Full `scripts/test-git-ops-ship.sh` passes (59 PASS), including KK/MM/QQ resume paths.
- [x] Adversarial review of the diff; findings addressed or recorded.

## Related

- INBOX-42 (`docs/process-learnings.md`) — implemented here; delete it once the task inbox is free (it held a co-tenant edit at ship time).
- decisions.md 2026-06-27 [process] (the add/add fix this repairs); 2026-08-28 [process] P1174.
- P1438 (where both surfaced).

## Review (Codex, 2026-10-08) — 1 of 1 report received

Verdict FIX FIRST; four defects, all fixed and tested:
- Failed seed extraction left a truncated spec (redirect truncates before `|| die`) → write to a temp file, `mv` only on success.
- Preflight ran before the kanban-noise discard, so an unstaged edit to the feature's own spec refused a normal ship → unstaged changes to `features/pN_*.md` exempt; staged kept. Test HH5.
- Rename-aware `git diff --cached` hid a staged rename's source path → `--no-renames` on both sides. Test HH6 (mutation-checked: dropping `--no-renames` fails it).
- `printf '%s' $_blocking` split filenames with spaces → printed unsplit.

Accepted risks: a CRLF creation blob can still drift if main's `.gitattributes` normalizes on `git add` (not this repo's case); `main..branch` on a fresh run counts commits already landed under a different SHA, refusing conservatively. Suite: 61 PASS.
