---
status: week
type: task
rank: 102
workstream: keyring
created_date: '2026-09-15'
tags: [security, credentials, keyring, least-privilege]
disclosure: public
related: [p1316, p1239, p1214, p1148]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1318: Measure the locked path in real use, then remove the plaintext copies of the critical credential half

## Problem

**Situation:** P1316 moved every remaining consumer of the prod master key onto the per-access lock or
the read-only helper, proved it with a canary that fails against the old code, and gave all 28
credential-drift candidates a verdict. Every critical credential is still readable in the plaintext env
files — the lock guards only callers that choose to use it.

**Complication:** The last steps cannot be done in the same session as the migration. The removal is
gated on a measured week of real use, the first locked prod migrate/deploy/publish has not happened yet,
and one archived script still reads prod with the master key. P1316's own ship gate refuses a spec with
unticked boxes, so these items would have held finished, verified code off `main`. The founder chose to
split them out (2026-09-15).

The P1316 liveness probes also changed what "retired" means: four credentials no consumer uses still
authenticate (each probe was controlled with a deliberately wrong credential, which was refused). So
retiring them means revoking them, not deleting a dead string.

**Question:** Does the locked path hold up in a real week of use — and, if the prompt count stays near
the prediction, can the plaintext copies finally be removed without breaking any consumer?

> Founder framing, verbatim (2026-09-15, on P1316): "did we eliminate something from .env.local and put
> it somewhere else? Or that is part of some future thing?" — this spec is the part that removes it.

## Appetite

Blast radius: high at the final step — every consumer of every critical credential. Reversibility: high
until the removal (measurement and one script edit), low after it, which is why removal is last and
gated. Decision density: one founder call on the archived export script, and a stop/continue call if the
prompt count exceeds the threshold.

## Invariants

- **Never remove a plaintext copy until the locked path has served every consumer at least once**,
  through a full cycle (a `/weekly` run, a `/day-cp` run, one deploy) — carried from P1239 via P1316.
  The order of the Done-When items is the control.
- **The lock gates an access, never a state.** No time window, and no grant an agent could satisfy by
  creating a file (P1239).
- **Attribution precedes removal.** Once the plaintext is gone a wrongly-denied prompt breaks real work,
  so every prompt must already name its session and reason (decisions.md 2026-09-08 [technical], P1239).
- **No fallback to a plaintext copy, ever** (`.claude/rules/credentials.md`).
- **Nothing is revoked at a provider by this spec** — revocation is P1148's.
- Credential identifiers stay out of this spec and its commit messages; per-credential detail lives in
  `.private/docs/`.

## Solution

1. Run the first real prod migrate, deploy and publish on the locked path, one dialog each, and start
   the prompt count from that date.
2. Record the prompt count over one full `/weekly` + `/day-cp` cycle against the ~4/week prediction. Above
   roughly 10/week, stop and revisit before removing anything.
3. Resolve the one remaining master-key read: an archived prod-export script. Either move its reads to
   the read-only helper, or remove the archived script.
   [FOUNDER DECISION: rewrite the archived export script's reads, or delete the script — it is already
   not runnable from its archived path.]
4. Hand the unused-but-still-valid credentials to P1148 as a standing `/weekly` item until the queue is
   empty, carrying each one's liveness result.
5. Remove the plaintext copies of the critical half, keeping the recovery drill (`keyring.sh enroll` from
   the plaintext source) re-runnable until removal is verified. Update the removal pointer in
   `.claude/rules/credentials.md` to this spec, through `/slava:maintain:claude-md`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A rarely-run consumer breaks only after removal | MITIGATE | The full-cycle invariant; the recovery drill stays runnable until verified |
| Prompt fatigue leads to "Always Allow", silently disabling the gate | MITIGATE | `keyring.sh verify` in the measurement week; the ~10/week stop line |
| The prompt count is inflated by one unusual week | ACCEPT | One cycle is the pre-registered bar; revisit only above the threshold |
| Revocation lags the handoff | DEFER | P1148 owns execution; this spec only queues |

**Non-Goals**
- Do NOT revoke, rotate or delete any credential at a provider.
- Do NOT change which credentials are in the locked half.
- Do NOT re-migrate consumers P1316 already moved; a newly found consumer is a P1316-style census entry.

## Done-When

- [ ] The first real prod migrate, deploy and publish each complete on the locked path with one dialog,
      while the plaintext copy still exists; the prompt count starts from that date
- [ ] Prompt count over one full `/weekly` + `/day-cp` cycle is recorded and compared to the ~4/week
      prediction — above ~10/week, stop and revisit before removing anything
- [ ] The archived prod-export script no longer reads the prod master key (rewritten or removed per the
      founder decision), and a grep for the key across `.claude/commands/slava/` and `scripts/` returns
      only files whose verdict is *write* or *warning text only*
- [ ] Every credential P1316 found unused carries a liveness result (live, dead, or "no safe probe" with
      the reason), and the unused-but-live ones sit in a standing `/weekly` handoff item to P1148
- [ ] The critical half is unreadable on disk without a confirmation — the plaintext copies are removed,
      verified by reading the env files, and every consumer still runs afterwards
- [ ] `.claude/rules/credentials.md` names this spec as the removal gate
- [ ] Nothing was revoked at any provider by this spec

## Open Questions

1. **The two in-process Python consumers the drift audit cannot see** (filed in the private inbox
   2026-09-15) — fix the audit's matcher before removal, or accept the blind spot for two known files?
2. **The two payment links' liveness** — the HTTP probe was blind (a fake link returned the same page);
   checking them needs the provider dashboard. Not assessed.

## Related

- [P1316](p1316_finish_moving_remaining_master_key_consumers.md) — the consumer migration this finishes; its time-gated items moved here
- [P1239](done/2026-06-10/p1239_encrypt_the_critical_credential_half_with_per_access_unlock.md) — the per-access lock
- [P1214](done/2026-06-10/p1214_credential_separation_and_privilege_reduction.md) — credential separation
- [P1148](p1148_credential_rotation_system.md) — rotation and revocation execution
