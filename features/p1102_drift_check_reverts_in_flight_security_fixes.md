---
status: today
type: bug
rank: 1
created_date: '2026-08-18'
tags: [security, process, drift, migrations]
delivery_stage: create-bug
pipeline_ran: [create-bug]
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

- [ ] A decision recorded on what the check treats as authoritative when test is narrower than prod
- [ ] The check no longer generates a privilege-widening remediation without a human decision
- [ ] A remediation that contradicts an existing migration is refused, not resolved by timestamp
- [ ] The sibling functions audited for an earlier remediation that widened something deliberate
- [ ] `.private/docs/security-log.md` updated
