---
status: in-progress
type: task
rank: 1000066
workstream: infrastructure
created_date: '2026-09-01'
tags: [e2e, testing, cleanup, p1043]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1217: Retire the E2E tests that assert deliberately-removed behaviour

## Problem

**Situation:** The 2026-08-31 overnight full-suite run produced 1,624 failures. The P1043 triage
measured that **580 of them (36%) come from 61 spec files whose feature spec is `status: rejected`,
carries `superseded_by:`, or is named by a successor's `predecessor:` field** — tests asserting
behaviour the product deliberately removed.

**Complication:** While those 580 failures sit in the count, the failure number carries no signal.
The ~20 genuine product defects the same triage found are 1% of the noise, and the suite cannot be
used as a gate (P1085) until the count means something. P1043 stays open for the undiagnosed
remainder; this is the separable, mechanical half.

**Question:** Which of the 61 files can be deleted outright, which still protect a live component
and must be kept or split, and how much of the 580 does deleting actually remove?

> Founder framing, verbatim: "retire the E2E tests that assert behaviour we deliberately removed,
> so the suite's failure count reflects real breakage."

## Appetite

Blast radius: **medium** — deleting a test cannot break the product, but silent coverage loss is
invisible by construction (deleting the only test for a live component makes the suite *greener*).
Reversibility: **high** — `git revert` restores any file. Decision density: **low** — the
DEAD/STALE/SPLIT rule is already decided ([decisions.md](../docs/decisions.md) 2026-09-01 [process]).

## Invariants

- **A dead spec is a filter, not a verdict.** Before deleting any file, enumerate every distinct
  component or page the file exercises — not only the feature its spec names — and grep `src/` for
  each. One spec can ship two things; the dead feature and a live shared component then share one
  test file. ([decisions.md](../docs/decisions.md) 2026-09-01 [process].)
- **No live component may lose its last coverage.** If a component still exists in `src/`, another
  `e2e/` spec must be shown to cover it before its blocks are deleted. If none does, the file is
  SPLIT, not DEAD.
- Never delete a file whose spec could not be confirmed dead by reading the spec frontmatter *and*
  the superseding spec.

## Solution

Work the candidate list in failure-count order. For each file, record one of three outcomes:

- **DEAD** — behaviour gone entirely, no live component depends on the file. Delete the file.
- **STALE** — behaviour survived under a new name/selector. Leave the file in place, list it for a
  later rewrite pass. Do not rewrite assertions here — rewriting an assertion re-specifies an AC.
- **SPLIT** — the file mixes both. Delete only the dead blocks; keep the rest and name the component
  those blocks protect.

Start with the six **CONFIRMED** files (reproduced + superseding commit traced). Do the CANDIDATE
files after, and stop to report if their DEAD/STALE/SPLIT distribution runs differently than the
confirmed ones did.

Commit in batches by feature area. Do not push.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Deleting the only coverage for a live component | MITIGATE | Per-component grep of `src/` + `e2e/`, per the Invariants |
| Frontmatter says dead but the successor kept the behaviour | MITIGATE | Read the superseding spec, not only the marker |
| A deleted file also held a *correct* failing test (a real defect) | MITIGATE | The triage's ~20 genuine defects are enumerated in `e2e-triage-2026-09-01.md`; cross-check before deleting a file named there |
| Expected failure reduction is computed, not measured | ACCEPT | The full suite takes >6h; re-running it to measure a deletion is not a good use of the window. Directories touched are re-collected to prove nothing broke |
| Some candidate files may have failure counts that shift once the P852 modal or P396 guest-join fixes land | ACCEPT | Those are separate pieces of work; the 580 is measured against this run |

**Non-Goals**
- Do NOT rewrite any test assertion. STALE files are listed, not repaired.
- Do NOT fix any product defect found along the way — file it, leave it.
- Do NOT re-run the full suite.
- Do NOT touch the P852 modal helper, the P396 guest-join guards, or the schema/migration findings.
- Do NOT close P1043.

## Done-When

- [ ] Every one of the 61 candidate files carries a recorded verdict: DEAD, STALE, SPLIT, or
      NOT-CONFIRMED (spec could not be confirmed dead)
- [ ] Every DEAD/SPLIT decision names the components checked and where their coverage survives
- [ ] `npx playwright test --list` over every touched directory collects with no error
- [ ] `./scripts/pre-commit-checks.sh` passes on each batch commit
- [ ] Expected failure reduction is stated as a number computed from the triage table, labelled as
      computed rather than measured
- [ ] Files left as stale-needing-rewrite are listed by name for a follow-up pass
- [ ] Any component whose surviving coverage could not be confirmed is named explicitly

## Alternatives Considered

- **Delete all 61 files on frontmatter alone.** Rejected: `e2e/p526-point-image.spec.ts` is a
  confirmed-dead file containing four tests for `image-lightbox.tsx`, which is still used by
  `story-image.tsx` and `profile-page-v2.tsx`. The rule that produces the candidate list is a good
  filter and a bad verdict.
- **Keep every mixed file as STALE.** Rejected: retires almost nothing, since large specs usually
  touch some still-live shared component.
- **Fix the P852 modal first (155 failures, one helper).** Not rejected — it is higher leverage per
  edit, but it is a different piece of work with a different risk profile (editing shared test
  infrastructure vs. deleting dead files) and belongs in its own spec.

## Rollback Strategy

Every change is a file deletion or block removal on `main` in small per-area commits. `git revert`
of a batch commit restores those files exactly. No migration, no product code, no schema.

## Related

- `features/p1043_repair_e2e_tests_rotted_while_suite_uncollectable.md` — parent; stays open for the
  undiagnosed remainder
- `docs/technical/e2e-triage-2026-09-01.md` — the triage this list came from
- `.private/p1043-sweep/RETIREMENT-CANDIDATES.md` — the candidate table
- `features/p1085_trusted_e2e_core_in_ci.md` — the reason the failure count needs to mean something
