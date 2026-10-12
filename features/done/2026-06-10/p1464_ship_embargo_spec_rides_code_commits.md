---
status: all-done
type: bug
rank: 29
severity: medium
workstream: infrastructure
date_reported: '2026-10-12'
created_date: '2026-10-12'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [ship, git-ops, disclosure]
disclosure: public
pipeline_ran: [create-bug, dev, ship]
related: [p1255, p1454]
completed_at: 2026-10-12
---

# P1464: `git-ops.sh ship` lands an embargoed spec on main whenever a branch commit touches it

## Problem

P1255 says an embargoed spec (`disclosure: embargo`) must not reach `main` until
`git-ops.sh publish-spec pN` confirms the fix on prod. `ship` honours that only by skipping the
**seed** step. Every branch commit is still cherry-picked whole, so a commit that adds or edits
`features/pN_*.md`, whether alone or alongside the code, carries the spec onto `main`.

Observed 2026-10-12 shipping P1454: the fix commit added the spec with the code; three later
spec-only commits (stage stamp, checklist tick) were picked too. The spec then sat on local `main`
next to its neutral stub, failing pre-commit's duplicate-P check. Nothing was pushed and the fix
was already live, so no disclosure occurred, but the guard gave no protection. `publish-spec`
then failed too, because it assumes the spec is absent from `main`. It staged the `done/` copy
while the original was still in `features/`.

Founder framing: *"you can file it, review the spec, fix it... and then ship KDD commit."*

## Appetite

Medium blast radius (ship path for every spec; embargo path is rare). High reversibility (git
revert of a script). Zero founder decisions.

## Solution

When the spec is embargoed, `ship` must not put the embargoed spec's content on `main`:
- Commits touching **only** the embargoed spec (and its UAT pair) are not cherry-picked. They are
  recorded in the journal as withheld, and `--resume` stays idempotent.
- A commit that touches the spec **and** other files is refused **before any pick**. The refusal
  names the commit and tells the operator to split it, so nothing lands half-done.
- `publish-spec` keeps working on the retained branch as before.

The stub (`features/pN_security-review-pending.md`) is still the only `main` artefact until
publish. Whether `publish-spec` removes the stub is to be checked and fixed if missing.

## Invariants

- Under `disclosure: embargo`, no commit created by `ship` adds or modifies
  `features/pN_*.md` other than the stub.
- Non-embargoed ships behave byte-for-byte as before.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Refusing mixed commits blocks a ship until the operator splits them | ACCEPT | Fail-closed is the point; message gives the fix |
| `/create-bug` and `/dev` keep producing mixed commits | MITIGATE | Refusal fires before any pick; skill guidance is a follow-up only if it recurs |

Do NOT rewrite branch history automatically. Do NOT change the non-embargo ship path.

## Acceptance Criteria

Evidence: `scripts/test-p1464-ship-embargo.sh` 32/32 pass on the fix, 31 fail on the pre-fix `git-ops.sh` (gate 7); `test-git-ops-ship.sh` (61), `test-p1444-closure-gate.sh` (82), `test-pipeline-gates.sh` (67) all pass with real `ps`.

- [x] Embargoed branch with code-only and spec-only commits ships the code; `main` never holds the spec; spec-only commit journaled as withheld; `--resume` is a no-op (A1-A3).
- [x] Mixed spec+code commit refused before any pick, `main` unchanged (B1, B2).
- [x] Public spec ships exactly as before (C1, compared against the pre-fix script).
- [x] Each test seen failing against the pre-fix `git-ops.sh`.
- [x] `publish-spec` publishes the withheld spec and removes the stub in one commit (D1, I3).

## Design (as built)

Path- and P-number-based classification was rejected after Codex adversarial review reproduced 9 leaks across two rounds (quoted filenames, multiple spec files, done/archive copies, conflict resolutions, add-then-delete, stub-named copies, other P-numbers). The shipped rule is **content-based**: any added, modified or deleted `features/**` markdown (`.md`/`.markdown`, any case) whose frontmatter declares `disclosure: embargo` is protected, at any path, depth or P-number, plus `features/uat/pX.md` for each such pX. A tolerant reader handles BOM, CRLF, indentation, quoted keys and values. The verdict is persisted in the ship journal and never downgraded. Staged blobs are re-checked before every `cherry-pick --continue` and every seed or close commit. Merge commits are refused in embargoed mode. Five Codex rounds; rounds 1-4 found 15 reproduced leaks, all fixed with a failing-then-passing test each.

## Known limits (accepted)

| Limit | Label | Why tolerable |
|---|---|---|
| A nested `disclosure:` key inside another frontmatter mapping is read as the spec's disclosure | ACCEPT | Fails toward withholding, never leaking; no spec in `features/` has a nested disclosure key (grep, 2026-10-12) |
| `publish-spec` rewrite of a nested `disclosure:` line would break that mapping | ACCEPT | Same: zero occurrences; the readback guard still blocks a still-embargoed publish |
| `publish-spec` refuses CRLF/BOM specs instead of rewriting them | ACCEPT | Refuses, never publishes wrongly |
| `ship-gates.sh` keeps its own path-based spec lookup and disclosure reader | DEFER | Report-only for disclosure; unblocks when it next needs touching |
| A refused close leaves its staged rename on the shared checkout | ACCEPT | Visible in `git status`; the refusal says so |
