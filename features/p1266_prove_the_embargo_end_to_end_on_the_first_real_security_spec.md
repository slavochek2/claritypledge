---
status: backlog
type: task
rank: 1000075
workstream: infra
created_date: '2026-09-08'
tags: [security, disclosure, process, verification]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1266: Prove the disclosure embargo end-to-end on the first real security spec

## Problem

P1255 built the embargo mechanism and verified every gate it could verify against
fixtures — both directions, exit codes pasted. Two of its Done-When items are not
falsifiable that way, because they assert what happens to a **real** embargoed spec
across a **real** push and a **real** prod apply:

- a security spec filed after P1255 does not appear in
  `git ls-tree -r --name-only origin/main features/` after a push;
- `/ship` plus `git-ops.sh publish-spec` make it public in the same commit range as
  its fix, confirmed by `git cat-file -e origin/main:features/done/…`.

A fixture cannot discharge either: the first needs a push, the second needs a
migration actually applied to production. Holding P1255 open until a security defect
happens to appear would park a finished mechanism in `in-progress` indefinitely, and
`ship-gates.sh` gate 2.5 correctly refuses to close a spec with unticked boxes — so
the honest move is to carry the two claims here rather than tick them untruthfully.

**This spec is the deferral P1255's gate 3.65 requires to name a P-number.**

## Appetite

**Blast radius: none until it runs** — it is a verification pass over a mechanism
that already exists. **Reversibility: high.** **Decision density: zero** — every
design call was made in P1255.

## Solution

On the **first genuine embargoed spec** — do not manufacture one; a fixture would
reproduce exactly the fixture-shaped confidence this spec exists to replace:

1. File it through `/create-spec` or `/create-bug` and confirm the classification
   step routes it branch-born with `disclosure: embargo`, and that a neutral stub
   lands on `main` at `features/pN_security-review-pending.md`.
2. Push. Assert `git ls-tree -r --name-only origin/main features/` contains the stub
   and **not** the real spec.
3. Confirm `pre-push-checks.sh` Layer 0 (P1260) refuses to publish the `feature/*`
   ref carrying it — the two controls are complementary and neither is sufficient
   alone.
4. Ship the fix, apply the migration to prod, then run
   `./scripts/git-ops.sh publish-spec pN`. Assert it hard-fails **before** the prod
   apply and passes after — the failure direction is the half that matters
   (epistemic.md gate 7), and it has never been exercised against real prod state.
5. Confirm the published spec reads `disclosure: public` (D4) and that its
   `features/done/` copy carries no exposure-duration marker.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| No security spec appears for months, so this sits in backlog | ACCEPT | Correct outcome — the mechanism is built; this is confirmation, not construction |
| Someone manufactures a fake embargoed spec to close this | MITIGATE | Explicitly forbidden above; a fixture run reproduces the confidence P1255 already has |
| `publish-spec`'s prod assertions fail for an unrelated reason and the spec is stuck unpublished | ACCEPT | Fails closed, toward non-disclosure — the correct direction |

**Non-Goals**
- Do **NOT** re-verify what P1255 already proved against fixtures.
- Do **NOT** file a synthetic security spec to exercise this.

## Done-When

- [ ] A real embargoed spec is filed, pushed, and confirmed absent from
      `origin/main`'s `features/` tree while its stub is present
- [ ] `publish-spec` is observed FAILING before the prod apply (exit code pasted)
      and PASSING after
- [ ] The published spec reads `disclosure: public`


## First real run — P1303 (2026-09-11): the embargo was not honoured

P1303 (an embargoed revoke of an unintended function grant) was the first real security spec
through the path, and the first two Done-When items could not be exercised as written:

- **The spec did not stay off main.** `/create-bug` committed the neutral stub
  `features/p1303_security-review-pending.md`. At ship, `resolve_ship_spec` found that stub as
  the only `p1303_*.md` on main and used it as the spec; `branch_spec_file` is only set when main
  has no match, so `ship_spec_disclosure` read the stub's `disclosure: public`. `ship-gates.sh`
  gate 1.5, which reads the branch, printed EMBARGO in the same run while `git-ops.sh` treated
  the spec as public. The branch commits carried the spec with the code, so the cherry-picks put
  it on local main; the close then tried to move the stub into `done/` and was stopped only by
  the pre-commit duplicate-spec check.
- **`publish-spec` was never reached**, and reading `cmd_publish_spec` shows it would have failed
  too: it writes the branch spec into `done/` but never deletes the stub, and the duplicate-spec
  check blocks a commit while a `p1303_*` file sits in both `features/` and `done/`.
- **Nothing reached GitHub.** Prod was patched and verified live before any push, the disclosure
  was flipped to `public` on that evidence, the stub was deleted, and the spec closed through
  `ship --resume` after the journal's `spec_file` was corrected by hand. See decisions.md
  2026-09-11 [technical] (P1303).

What this now needs beyond its Done-When: (1) when a branch exists, resolve the spec from the
branch, or skip `disclosure-embargo` stubs; (2) `publish-spec` deletes the stub in its own commit.
**P1302's stub is on main — P1302 must not ship until both land**, or it repeats P1303.

## Related

- [features/p1255_security_specs_publish_before_the_defect_is_fixed.md](p1255_security_specs_publish_before_the_defect_is_fixed.md) — the mechanism
- [docs/decisions.md](../docs/decisions.md) 2026-09-08 [process] (P1255) — why an
  in-place gate proof is not a proof of the deployed path
