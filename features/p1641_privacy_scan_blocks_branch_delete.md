---
status: qa
type: bug
rank: 109
severity: high
workstream: infra
date_reported: 2026-11-05
created_date: 2026-11-05
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [privacy-gate, pre-push, push-docs, staging]
disclosure: public
delivery_stage: ship
date_resolved: 2026-11-05
root_cause: Layer 1 scanned a delete before its skip ran
resolution: moved the skip ahead of the scan; a canary covers deletes and everything that publishes
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: scripts/test-p1641-prepush-delete.sh
  root_cause: "Layer 1 builds a scan range for an all-zero local SHA; its delete skip runs only after the scan, so the scanner exits 3 and the hook refuses"
  confidence: high
  surfaces_in_scope: [pre-push-layer-1]
  surfaces_deferred: []
  reproduced_at: 2026-11-05
spec_review_hash: 6682020bc6c53d7882e05838cbabec7bb59002e0ea957378d64002dfa391624d
spec_review_vendors: [gemini]
---

# P1641: Privacy scan refuses branch deletes, so staging branches pile up and push recovery dies

## Summary

Layer 1 of `scripts/pre-push-checks.sh` scans a range ending in an all-zero local SHA on a branch delete, exits 3 and refuses the push, so no `git push origin --delete` can succeed. Surfaced by the fail-closed input handling added in P1623.

## Root Cause

The Layer 1 loop handles an all-zero remote SHA but not an all-zero local SHA, so a delete builds `<remote_sha>..0000000000000000000000000000000000000000` (`scripts/pre-push-checks.sh:169-179`). The scanner cannot read that range and returns 3, which P1623 turned into a refusal (`:183-188`). The skip for deletes exists at `:207`, after the scan. Layer 0 already allows deletes (comment at `:71`, skip at `:91`).

Read from the code on 2026-11-05. The exit 3 was observed in the session that filed INBOX-295. Reproduced 2026-11-05 by `scripts/test-p1641-prepush-delete.sh`: D1 and D5 fail with that exit 3, and all five controls pass. Layer 2 already refuses a delete of main, and Layers 2 and 3 skip other refs, so only Layer 1 needs the change. The recovery failures below are read from the code and not yet exercised.

## Invariants

- A delete passes Layer 1 only because it publishes no commits. Any ref with a non-zero local SHA is still scanned.
- An unreadable or bad range still fails closed.
- Never `--no-verify`.

## Reproduction Steps

1. On a checkout with the hook installed, have a `staging/doc-*` branch on origin.
2. Run `git push origin --delete staging/doc-<sha>`.
3. Observe: "the privacy scan could not read its input for range <sha>..0000000000000000000000000000000000000000 (exit 3)" and the push is refused.

**Reproduction rate:** 100% (canary, against the real hook and scanner).

## Expected Behavior

A delete passes Layer 1. A bad range is still refused.

## Actual Behavior

Every delete is refused. Effects:

- Each `/push` leaves one `staging/doc-*` branch on origin. Present now: `staging/doc-20f511708`, `staging/doc-4af0e39e4`, `staging/doc-f37654208`, all with commits on `origin/main`, so nothing leaks.
- Recovery paths that require a delete `die`: `push-docs --resume` (`scripts/git-ops.sh:6468`), a `push-docs` re-push when the staging branch already exists (`:6530`), and a `ship-to-prod` re-run on the same SHA (`:5924`).

## Affected Files

- `scripts/pre-push-checks.sh:169-207` — Layer 1 loop.
- `scripts/git-ops.sh:5924,6468,6530` and the other `push origin --delete` calls — callers, no change expected.
- `scripts/test-pre-push-refclass.sh` — existing hook canary to extend, or a sibling.
- `docs/process-learnings.md` — INBOX-295.

## Severity

**High** — not a leak, but it disables the push pipeline's own recovery paths and branch cleanup, with no permitted workaround through the hook.

## Fix Approach

Move the existing all-zero local SHA skip to the top of the Layer 1 loop, before the range is built.

P1623's hook change is already on main (`fd429c2eb`, `ccf4d6ebd`), so start from main. Confirm w5's `feature/p1623-privacy-scanner-hardening` holds nothing further that touches this code.

`docs/decisions.md` has no entry rejecting this; P1260 introduced the reclaim of staging refs and intends deletes to work.

## Acceptance Criteria

- [x] Canary: a delete passes the hook. It fails before the fix and passes after.
- [x] Canary: a bad or unreadable range on a non-delete ref is still refused, with exit 3 handling intact.
- [x] Canary: a non-delete push carrying a known personal identifier is still blocked.
- [x] A mixed push (one delete and one bad ref) is still refused.
- [x] Gate 7c, push shapes: real `git push` through the installed hook on a throwaway remote, for staging push, delete, re-push and promote. The unfixed hook fails the deletes, the fixed hook passes all. The promote ran under an active push-on window, so the Layer 3 prompt was not exercised.
- [x] INBOX-295 closed in the same change.
- [x] `/finish` review completed, including Codex and Opus.

## After Landing

These can only happen once the fix is live, so they are tracked in INBOX-299, not above: confirm the real `/push` flows on the fixed hook, and delete the leftover staging branches.
