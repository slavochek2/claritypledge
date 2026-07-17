---
status: in-progress
type: task
rank: 1000950.0
created_date: '2026-07-17'
tags: [infrastructure, security, gcp, service-accounts]
delivery_stage: fix
pipeline_ran: [create-spec, fix]
---

# P1001: Close the residual escalation paths left on the shared identity after P998

## Problem

**Situation:** P998 removed the broad project-wide role from a shared cloud identity and proved, by attempted read/delete, that its access to the backup buckets is gone. That was the headline fix and it holds.

**Complication:** "The broad role is gone" overstates how de-privileged that identity actually is. P998 scoped itself to the one broad role and deliberately flagged — rather than silently fixed — three residual grants that remain:

1. **A project-wide impersonation grant on the shared identity.** At project scope it applies to *every* service identity in the project, including the ones that still hold backup write/read access. Anything running as the shared identity can therefore mint credentials for those identities and reach the backups **laterally** — around the very binding P998 removed. Today the only thing running as the shared identity is the build pipeline, so the realistic path is "compromised or malicious build", not an exposed runtime service.
2. **A project-wide secret-read grant on the same identity** — it can read every secret in the project, not just the ones any workload needs.
3. **The managed build agent holds a broad builder role** that carries project-wide object-delete, so it can delete backups. This is pre-existing (not introduced by P998) but is the same hole class P998 exists to close.

Together these mean the de-privileging is partial: the front door is locked, two side doors are not.

**Question:** Which of these three are load-bearing for something real, and what is the least-privilege replacement for each?

## Appetite

Medium blast radius, high reversibility. Every step is a single revertible binding change, and — unlike P998 — **none of these grants is known to be serving live product traffic**, so the failure mode is a broken build or a broken backup job, not user-visible breakage. Low decision density: the pattern is established and proven three times now (P991 Half A twice, P998 once). The genuine open question is #1 — whether anything actually needs the impersonation grant, or whether it is vestigial from an earlier design.

Not urgent in the "drop everything" sense: no evidence of exploitation, single-operator project, and the realistic path for #1 and #2 requires already controlling the build. Urgent enough to not forget — which is why it is filed rather than left in a log.

## Solution

1. **Determine whether the impersonation grant is load-bearing at all.** Derive from source and deploy config — not from the name, and not from "it's probably there for a reason." P991 Half A established that one of these grants existed for a specific, discoverable purpose (URL signing) and that guessing would have been wrong in both directions. If nothing needs it, remove it; if something does, re-grant it **scoped to the single target identity**, not project-wide.
2. **Do the same for the project-wide secret-read grant.** The per-secret pattern is already proven — P998 granted the migrated service `secretAccessor` on exactly three named secrets. Replace the project-wide grant with per-secret bindings for whatever genuinely needs them, or remove it.
3. **Decide the build agent's broad builder role** — `[FOUNDER DECISION: narrow it, or accept it?]`. Narrowing it means deriving the build's real permission set (P998 already proved this is discoverable: the failing build named the exact missing permission in its logs) and replacing the role with scoped grants. Accepting it means recording explicitly that a compromised build can delete backups, and relying on backup soft-delete retention as the compensating control.
4. **Only after each is independently verified:** re-run the same denial proof P998 used — attempt the escalation as the shared identity and confirm it fails on the permission under test.

### Verification standard (inherited from P991 Half A and P998 — non-negotiable)

Prove by observation, not by exit code. P998 produced three concrete traps worth repeating here:

- **A binding's absence proves nothing** on a legacy-ACL bucket. Prove denial by an attempted action, and pair it with a **positive control** (the same call as an authorized identity) so a 403 can be distinguished from a 404 or a broken endpoint.
- **A tool that returns no HTTP response is not a denial.** P998 saw a client return a null status code that read as "blocked" but meant "the call never completed."
- **A binding referencing an identity is not proof that identity is usable.** P998 wasted two cycles on an identity that appeared in the IAM policy but did not exist as an assignable account.
- **Read a role's actual contents before granting it.** P998's near-miss: the obvious fix for the broken build path carried project-wide object-delete and would have silently re-opened the exact hole being closed.

## Risks / Non-Goals

### Risks
- **The impersonation grant may be load-bearing for the build path** in a way that is not obvious. Mitigation: the build path is now testable in isolation — P998 established that a throwaway deploy exercises the identical pipeline with zero risk to live services. Test there, not on a real service. `MITIGATE`
- **Removing the secret-read grant could break a workload whose secret access is not obvious from config.** Mitigation: enumerate secret consumers from live config before touching it; the per-secret pattern makes the blast radius explicit. `MITIGATE`
- **Narrowing the build agent's role could break deploys.** Mitigation: same as above — throwaway deploy proves the build path before and after. A broken deploy is recoverable and blocks nothing user-facing. `MITIGATE`
- **No evidence anything is exploiting these today.** This is a hardening pass, not an incident. Do not let it displace user-facing work. `ACCEPT`

### Non-Goals
- Do NOT re-do P998 steps 3–4 — they are complete and independently verified.
- Do NOT migrate the legacy-ACL bucket to uniform access here — that remains its own spec (P998's Alternatives explains why: the other writer's ACL-based grant would be silently dropped).
- Do NOT publish the escalation mechanics in this repo. Exact identities, grants, and the current path live in the private infra decisions log (2026-07-17). This spec describes the fix generically by design; the **live, unfixed escalation narrative** is the thing that must not be public.
- Do NOT fix all three in one change. One grant per change, verified independently — the constraint that made P998 safe.

### Alternatives Considered
- **Delete the shared identity entirely rather than narrow it:** genuinely attractive — nothing live runs as it anymore. Rejected as the primary path because it is still the **default build identity**, so deleting it breaks source deploys until a dedicated build identity replaces it. Worth revisiting as the end state once #3 is decided; folded into that decision rather than treated separately.
- **Accept all three and rely on the fact that nothing live runs as the shared identity:** defensible today, and it is why this is not urgent. Rejected as a permanent answer because it makes the security posture depend on an invariant nobody is enforcing — the moment something is attached to that identity again, the escalation path is live and no one is watching for it.
- **Leave it in the private log rather than filing a spec:** rejected. The log records what was found; a spec is what gets it fixed. This is exactly the class of finding that evaporates.

### Rollback Strategy
Every step is one revertible binding; none is a one-way door. Take the same rollback record P998 took — capture the exact prior grants **before** changing them, so the revert is a paste, not a reconstruction. P998's record for the shared identity is in the private log (2026-07-17) and remains valid as the pre-P1001 baseline.

## Done-When

- [x] The impersonation grant's necessity is determined from source/config (not inferred), and it is either removed or replaced with a grant scoped to the specific target identity — recorded either way
  - **DONE 2026-07-17 — verdict: vestigial, removed.** Necessity derived from an exhaustive source/deploy-config sweep, and independently confirmed by the private log's own record of why the grant was originally created — the purpose migrated to a dedicated identity in P991 and the old project-wide copy was simply never cleaned up. No re-scoped replacement needed: the one genuine consumer already holds a self-scoped grant. Removed, then verified by observation per the standard below — the lateral path succeeded before the change and is denied after, with a valid positive control, and the build path was re-proven by throwaway deploy. Exact identities, grants, and command output: private log 2026-07-17.
- [ ] The project-wide secret-read grant is replaced with per-secret bindings for whatever genuinely needs them, or removed
- [ ] The build agent's broad role is decided (narrowed or explicitly accepted) — and if accepted, the "a compromised build can delete backups" exposure is recorded with its compensating control named
- [ ] A real deploy succeeds after all changes (proves the build path survived) — throwaway deploy, not a live service
- [ ] The escalation is re-tested as the shared identity and **fails on the permission under test**, with a positive control confirming the test itself is sound
- [ ] The private log is updated with the resulting grant set, superseding the P998 end-state record
