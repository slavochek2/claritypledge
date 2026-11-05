---
status: week
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
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1641: Privacy scan refuses branch deletes, so staging branches leak and push recovery dies

## Summary

Layer 1 of `scripts/pre-push-checks.sh` scans a range ending in an all-zero local SHA on a branch delete, exits 3 and refuses the push, so no `git push origin --delete` can succeed. Surfaced by the fail-closed input handling added in P1623.

## Root Cause

The Layer 1 loop handles an all-zero remote SHA but not an all-zero local SHA, so a delete builds `<remote_sha>..0000000000000000000000000000000000000000` (`scripts/pre-push-checks.sh:169-179`). The scanner cannot read that range and returns 3, which P1623 turned into a refusal (`:183-188`). The skip for deletes exists at `:207`, after the scan. Layer 0 already allows deletes (comment at `:71`, skip at `:91`).

Read from the code on 2026-11-05. The exit 3 was observed in the session that filed INBOX-295. The recovery failures below are read from the code and not yet exercised.

## Invariants

- A delete passes Layer 1 only because it publishes no commits. Any ref with a non-zero local SHA is still scanned.
- An unreadable or bad range still fails closed.
- Never `--no-verify`.

## Reproduction Steps

1. On a checkout with the hook installed, have a `staging/doc-*` branch on origin.
2. Run `git push origin --delete staging/doc-<sha>`.
3. Observe: "the privacy scan could not read its input for range <sha>..0000000000000000000000000000000000000000 (exit 3)" and the push is refused.

**Reproduction rate:** 100% by code path; the canary must confirm it before the fix.

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

Move the existing all-zero local SHA skip to the top of the Layer 1 loop, before the range is built. Check that the later layers of the hook also pass a delete.

P1623's hook change is already on main (`fd429c2eb`, `ccf4d6ebd`), so start from main. Confirm w5's `feature/p1623-privacy-scanner-hardening` holds nothing further that touches this code.

`docs/decisions.md` has no entry rejecting this; P1260 introduced the reclaim of staging refs and intends deletes to work.

## Acceptance Criteria

- [ ] Canary: a delete passes the hook. It fails before the fix and passes after.
- [ ] Canary: a bad or unreadable range on a non-delete ref is still refused, with exit 3 handling intact.
- [ ] Canary: a non-delete push carrying a known personal identifier is still blocked.
- [ ] A mixed push (one delete and one bad ref) is still refused.
- [ ] Gate 7c: `push-docs` staging push, promote to main and `--resume` all run through the changed hook and pass.
- [ ] INBOX-295 closed in the same change.
- [ ] `/finish` review completed, including Codex and Opus.
- [ ] After the fix is live, the three staging branches above are deleted in one push (needs `push-on`).
