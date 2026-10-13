---
status: in-progress
type: bug
disclosure: public
rank: 1
created_date: '2026-08-18'
tags:
  - security
  - process
  - drift
  - migrations
delivery_stage: dev
pipeline_ran: [create-bug, dev]
driver: anomaly
---

# P1102: the grant-drift check treats an in-flight security fix as drift, and undoes it

## Problem

**Situation:** The grant-drift check compares the live test catalog against the live prod catalog and
reports functions whose privileges disagree. It fired for the first time on real drift on 2026-08-18
and behaved exactly as designed.

**Complication:** The disagreement it found was a **deliberate security fix**, mid-flight. Security
fixes land on test first — that is the correct sequence, and the disclosure rule requires prod to be
patched before the branch is pushed. So for the entire window between "applied to test" and "deployed
to prod", **every security fix is indistinguishable from drift**, in the direction the check reads as
"test has lost something."

Worse, the remediation follows from the framing: prod is the baseline, so the fix is to restore prod's
privilege on test. That reverts the security fix. It happened: the revoke was restored, and the
vulnerability was open again on test until the canary caught it.

**Nobody did anything wrong, and that is the point.** The check's reasoning was sound on the evidence
available to it — the revocation genuinely had no trace in migration text *on main*, because the trace
was on an unmerged feature branch. The check cannot see feature branches. The failure is structural.

**The ordering consequence is the dangerous half.** The remediation migration is timestamped later
than the fix it reverted. On any ordered apply — a fresh environment, a replay, or the pending prod
deploy — the restore runs **after** the revoke. A security fix can therefore be silently undone at
deploy time by a migration written to fix drift the fix itself caused.

**Question:** how does the check distinguish "drift" from "a fix that has not reached prod yet"?

## Appetite

The immediate instance is already handled (a re-assert migration ordered after the restore, plus the
canary that detects it). This spec is about the loop, which will fire again on the next run for the
same function and any future security fix. Decision density is real: this is a policy question about
what the check treats as authoritative, not a code bug.

## Approach

1. **Decide the baseline question.** Prod-as-baseline is what produced this. Candidates: (a) treat a
   privilege *narrowing* on test as presumed-intentional and report without a restore remediation;
   (b) have the check read open feature branches' migrations before concluding "no trace in migration
   text"; (c) keep a written allowlist of in-flight fixes the check consults.
2. **Never auto-write a remediation that widens a privilege.** Whatever the baseline, restoring an
   EXECUTE grant is a privilege escalation. It should require a human decision, not a generated
   migration — the asymmetry is the safeguard: narrowing wrongly is an outage, widening wrongly is a
   vulnerability, and only one of those is silent.
3. **Make ordering safe.** Any remediation must be checked for whether an earlier migration in the
   same repo already asserts the opposite, and refuse rather than silently win on timestamp.
4. **Re-check the sibling functions.** This one was caught because a canary covered it. Establish
   whether any earlier drift remediation restored a privilege that something else had deliberately
   narrowed.

## Risks / Non-Goals

### Risks

- **The loop is live.** Until prod is patched for P1093, the check will keep reporting this same
  function and the same remediation will keep looking correct. MITIGATE: P1093's prod deploy closes
  this instance; step 1 closes the class.
- **Over-correcting kills a check that works.** It found real drift on its first live finding. The
  goal is to change what it *does* about a narrowing, not to stop it reporting. MITIGATE: step 2
  changes remediation, not detection.

### Non-Goals

- Do **NOT** revert the P1065 remediation commit. It is shipped, its header is an accurate record of
  a check working as designed, and deleting it erases the evidence of the interaction.
- Do **NOT** weaken or disable the drift check.

## Done-When

- [x] A decision recorded on what the check treats as authoritative when test is narrower than prod
      — `docs/decisions.md` 2026-08-18 [technical] "a drift check that treats production as the
      baseline will revert every security fix in flight": detection stays, remediation is asymmetric,
      a narrowing on test is presumed intentional. Implemented as option (a) of Approach step 1.
- [x] The check no longer generates a privilege-widening remediation without a human decision
      — `scripts/function-grant-drift-check.py`: a role test revokes and prod still grants is the
      new report-only direction `grant-narrower-on-test` ("presumed an in-flight security fix … Do
      NOT restore prod's grant on test"); `grant-differs` now gates only when test grants a role
      prod does not, and one widened role gates even if another narrowed. `--summary` lists the
      in-flight fix instead of saying clean; baselines never record it. Evidence:
      `python3 scripts/test-function-grant-drift-check.py` → `84/84 assertions held.` exit 0
      (15 of the new assertions failed before the change, 66/81; both mutations — all-gating and
      all-silenced — fail the suite).
- [x] A remediation that contradicts an existing migration is refused, not resolved by timestamp
      — new `scripts/check-migration-grant-order.py`, wired as pre-commit 14.97 (`--index`: staged
      bodies and the corpus are read from the git index, not the working tree) on staged
      migrations: refuses a GRANT (anon/authenticated/PUBLIC) of what an earlier migration revoked
      unless the file carries `-- widens-revoked-grant: <revoking version> <reason>`, and refuses a
      REVOKE that a later-sorting migration grants back. Evidence: `46/46 assertions held.` exit 0 (Codex review 2026-10-13: index-not-disk, overload-scoped DROP, schema identity, type-alias canonicalisation and missing-target refusal each reproduced as a failing test first, 35/46, and each fix is mutation-bound);
      across all 413 real migrations it refuses exactly the P1065 restore and passes the other 412;
      deleting the real P1093 re-assert from a copy turns the P1093 revoke into a `revoke-undone`
      refusal. Through the extracted pre-commit sections, a staged re-grant probe exits 2
      (`HARNESS ERRORS=2`) and a staged legitimate probe exits 0. Residual gap, stated in
      `docs/technical/database.md`: a contradiction created by a cherry-pick (no hook runs) is only
      visible to `--tree`.
- [x] The sibling functions audited for an earlier remediation that widened something deliberate
      — migration-text audit: `scripts/check-migration-grant-order.py --tree` finds **1**
      revoke-then-grant transition in 413 migrations (856 of 856 independently counted
      grant/revoke role-statements parsed): the P1065 restore of the P1093 revoke, final state
      revoke (closed by the P1093 re-assert). `git log --grep=drift -- supabase/migrations`: the
      only function-grant remediation that widened anything is that same commit; the RLS
      re-apply and P1327 both narrow. Not covered: a widening done out of band (no migration) —
      that is the live drift check's job, and no live read was taken for this audit.
- [ ] `.private/docs/security-log.md` updated
