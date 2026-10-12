---
status: in-progress
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
delivery_stage: create-bug
pipeline_ran: [create-bug]
related: [p1255, p1454]
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

- [ ] Hermetic test: an embargoed branch with a code-only commit and a spec-only commit ships the code; `main` has no `features/pN_<slug>.md`; the spec-only commit is journaled as withheld; `--resume` is a no-op.
- [ ] Hermetic test: an embargoed branch with a mixed commit is refused before any pick, and `main` is unchanged.
- [ ] Hermetic test: a public spec on the same fixtures ships exactly as before (all commits picked).
- [ ] Each test seen failing against the pre-fix `git-ops.sh` (gate 7).
- [ ] `publish-spec` publishes the withheld spec and removes the stub, verified in the hermetic test.
