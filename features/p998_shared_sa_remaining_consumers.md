---
status: week
type: task
rank: 1000949.0
created_date: '2026-07-15'
tags: [infrastructure, security, gcp, service-accounts]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P998: Migrate the remaining consumers of the shared service account, then finish P991 steps 3–4

## Problem

**Situation:** P991 set out to de-privilege a broad, shared service account by giving each of its consumers a dedicated least-privilege identity. Its Half A migrated two consumers (a VM backup job and a file-upload signing service); both are done and independently verified.

**Complication:** P991 stopped there because its central premise is wrong. Both the spec and the private review it defers to assert the shared account has **two** consumers. A live enumeration during Half A found **four**. The two unaccounted-for consumers are:
1. A **live service carrying real production traffic today**, deployed in a different region from everything else — which is almost certainly why two prior passes missed it. It sits behind a core product flow and is also that flow's recovery path.
2. A **currently-stopped VM** with narrow legacy scopes.

Removing the shared account's broad role now — P991 step 3 — would break (1) outright, with no dedicated identity in place. P991's own Non-Goals explicitly forbid this ("Do NOT remove anything from the shared service account until BOTH dependent migrations are independently confirmed working"; the constraint holds, the count was just wrong).

Separately, P991 **step 4 does not work in the order it specifies.** Its target bucket uses the legacy, non-uniform access model, whose ACL grants owner-equivalent access to *any project editor*. The shared account holds the broad project-wide role, so it is a project editor and retains full access to that bucket **regardless of which IAM binding is removed**. Step 4 is cosmetic until step 3 lands.

**Question:** What does each remaining consumer actually need, and in what order can the broad role be removed without breaking live product functionality?

## Appetite

Medium-high blast radius — one consumer is live production traffic behind a core flow, and the final step (removing the broad role) is project-wide in effect. Medium reversibility: every individual step is a revertible IAM/deploy command, but a mistake on the live consumer causes real user-visible failure, not a silent one. Low-medium decision density: the migration pattern is already established and proven twice in P991 Half A; the genuine open questions are the fourth consumer's fate and whether the legacy-ACL bucket is worth migrating to uniform access.

## Solution

1. **Derive the live consumer's real permission set from its source and deploy config — do not infer from its name or its current role.** P991 Half A proved this matters: the file-upload service's true requirement was *not* the obvious create-only scope, and a name-based guess would have caused silent data loss. Known from its deployed config: it reads objects from one bucket and pulls three secrets from a secret store. Confirm against source before granting.
2. Create a dedicated identity with exactly that set, cut the service over, and verify with **real traffic through the product** — not a synthetic exit code (see "Verification standard" below). Do this alone; do not touch the other consumer in the same change.
3. **Decide the stopped VM's fate** — `[FOUNDER DECISION: migrate, delete, or leave stopped?]`. It is currently stopped and holds narrow legacy scopes, so it is not a live dependency; but if it is ever started after step 4 below, it breaks. Deleting it (if obsolete) is a legitimate resolution and removes the problem instead of migrating it.
4. **Only after every consumer is independently verified:** remove the broad project-wide role from the shared account.
5. **Then** remove the shared account's now-redundant grant on the second backup bucket (P991 step 4), and re-verify that its access is genuinely gone — the legacy ACL means a removed IAM binding proves nothing on its own. Verify by attempting an actual read/delete as that identity and observing denial.

### Verification standard (non-negotiable, learned from P991 Half A)

Prove identity **by observation, not by exit code.** During Half A, a cached credential produced a confident false positive: a backup "succeeded" under the new identity while actually authenticating as the old one, and the mistake was only caught by inspecting the written object's ACL owner. A negative test also appeared to pass while silently failing for the wrong reason.

- Confirm *who* acted by inspecting an artifact the action left behind (object owner, signed-URL credential, audit log principal).
- Clear or expire cached credentials before testing an identity change; a token minted before the swap can remain valid for up to an hour.
- A denial is only proof if it fails on the permission under test — check the actual error, not just a non-zero exit.

## Risks / Non-Goals

### Risks
- **The live consumer sits behind a core product flow and is that flow's recovery path.** A broken cutover degrades more than one feature. Mitigation: migrate it alone, verify with real traffic, and keep the prior revision one command away (see Rollback).
- **The consumer count may still be wrong.** It has been wrong twice (asserted 2, actually 4). Mitigation: enumerate every consumer type — services, functions, instances, jobs, schedulers, and build pipelines — before step 4, and treat the enumeration as the source of truth over any document, including this one.
- **Build pipelines may depend on the broad role.** In this cloud, function/container builds can default to using the shared account as the build identity. Removing its broad role may not break anything at runtime but could break the *next deploy*. Mitigation: verify a real deploy after step 4, not just runtime health.
- **Removing the broad role is the one step with project-wide reach.** Mitigation: it is a single revertible binding; re-grant restores the prior state immediately.

### Non-Goals
- Do NOT remove the broad role until every consumer is migrated AND independently verified. This is P991's constraint and it still holds.
- Do NOT migrate more than one consumer per change.
- Do NOT re-do P991 steps 1, 2, or 2a — they are complete and verified.
- Do NOT publish the vulnerability mechanics in this repo. Identities, exact grants, the consumer inventory, and the current over-permission live in the private infra decisions log (2026-07-15). Identifiers alone are not the concern (P994 established they are already public by design); the **live, unfixed exploit narrative** is.
- Do NOT migrate the legacy-ACL bucket to uniform access as a side quest — see Alternatives.

### Alternatives Considered
- **Migrate the legacy-ACL bucket to uniform access instead of removing the broad role:** would also close the ACL bypass and is arguably the cleaner end state. Rejected as the primary path — the private log deliberately deferred this because that bucket's other writer holds an **ACL-based** grant that a uniform-access migration would silently drop, breaking a second backup job. Worth its own spec with that writer's grant re-established as IAM first.
- **Leave the shared account as-is, rely on the network-level restrictions already in place:** this is P991's own rejected alternative and it stays rejected — an application-level compromise of any consumer still inherits the broad project access, which is the entire point.
- **Delete the stopped VM rather than migrate it:** genuinely on the table; folded into the step-3 founder decision rather than treated as a separate option.

### Rollback Strategy
Every step is independently revertible and none is a one-way door:
- Live consumer cutover: redeploy the prior revision, or point it back at the shared account (one command).
- Broad-role removal: re-grant the role (one command).
- Bucket grant removal: re-add the binding (one command).
Take the same rollback record P991 Half A took — capture the exact prior identity and scopes *before* changing them, so the revert is a paste, not a reconstruction.

## Done-When

- [ ] Every consumer of the shared account is enumerated from live state (not from a doc), and the list is recorded in the private log — replacing the twice-wrong count
- [ ] The live consumer runs under a dedicated identity holding only the permissions its source actually requires; **real product traffic through it still succeeds**, and the acting identity is confirmed by observed artifact, not exit code
- [ ] The stopped VM's fate is decided and executed (migrated, deleted, or explicitly accepted as "will break if started" — recorded either way)
- [ ] The shared account no longer holds the broad project-wide role
- [ ] The shared account's grant on the second backup bucket is removed, **and** its access to that bucket is confirmed gone by an attempted read/delete that is actually denied — not merely by the binding's absence
- [ ] A real deploy succeeds after the broad role is removed (proves no build-time dependency on it)
- [ ] P991's Done-When items for steps 3–4 are checked off, and P991 is closed
