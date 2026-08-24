---
status: today
type: task
rank: 0.25
workstream: infrastructure
created_date: '2026-08-21'
tags:
  - security
  - credentials
  - rotation
  - skills
delivery_stage: create-spec
pipeline_ran:
  - create-spec
driver: heuristic
---

# P1148: Credential rotation system — plugin rotators, driver, vault

**Blocked by P1147.** Do not start until the drift audit has run at least twice. P1147 produces
the classification data that sizes this work; starting first means committing to a per-provider
plugin surface on an estimate. Two independent adversarial reviews converged on that ordering.

## Problem

Rotation is documented as the remediation for any credential leak
([decisions.md](../docs/decisions.md) 2026-05-29), and no mechanism implements it. The
secret-audit skill classifies a leak and explicitly stops: *"it does not rotate."* One
single-credential rotation skill exists, for one credential. Everything else is hand-run from
prose, and most credentials have no written procedure at all.

## Appetite

**Blast radius: high** — mints, overwrites and revokes real credentials across local files, hosted
secret stores, CI, and provider dashboards. **Reversibility: mixed, and that is the design
constraint** — minting and writing are reversible, revoking is not.

## Solution

### What survived adversarial review, unchanged

The ordering. Two hostile reviewers attacked it independently and neither could construct a
sequence where an irreversible step precedes verification:

```
mint → write-consumers → verify → archive-old → revoke-old
                            ↓ fail
              roll back consumers, old stays live, report
```

Plus: `never-rotate` as a hard refuse with **no override flag**; rows retire rather than delete;
a mandatory hardening phase after any failed run; and the constraint that **adding a credential
must never require a driver edit** — one rotator file, one registry row.

### What adversarial review broke, and must be designed differently

1. **Identity is `(name, surface, value-fingerprint)`, never `name`.** Measured: one key name
   holds three *distinct* live credentials across the three env files, and three separate alias
   pairs hold byte-identical secrets under different names. A name-keyed rotator overwrites
   working credentials it was never rotating, revokes one of three, and reports full success.
2. **The contract needs a read verb, or `archive-old` is unimplementable.** The hosted secret
   store returns names and digests, never values. For any surface that cannot be read back,
   "reversible until revoke" is simply false — such a credential is `manual-only`. Rotators must
   declare `can_read_current`.
3. **Verify must be proven *discriminating*, not merely passing.** Create-before-revoke means both
   credentials are valid at verify time. A verify resolving its credential from ambient
   environment passes with the old value in place. The precedent solves this by passing the new
   value explicitly. Classification must run each verify **against the old value and observe it
   fail** — a pass proves nothing (epistemic gate 7 applied to the verifier itself).
4. **Meta-credential is a relation, not a boolean.** The rule "any credential the driver
   authenticates with" misses credentials that *rotators* authenticate with. Each `describe`
   declares what it consumes; the driver closes the set transitively. Independently, P1147
   establishes that meta-authority credentials are barred from `auto-api` by definition.
5. **`mint` is not idempotent.** An interrupted run re-mints, orphaning a live credential at the
   provider — permanently, for non-expiring tokens. Needs an intent record written *before* the
   provider call, plus a `list`/`adopt` verb so a restart finds its own orphan.
6. **Writing a surface is not the same as making it effective.** Build-time-baked variables
   require a deploy to take effect; verify passes locally while production still serves the
   revoked value. Each surface declares effectiveness, and verify runs against the *effective*
   surface. A surface needing a deploy is incompatible with no-auto-deploy — such credentials are
   `manual-only`.
7. **Two artifacts, never one.** A `rollback-vault` (plaintext, short-lived, purged on the next
   successful rotation) and a `ledger` (fingerprints and outcomes, append-only, permanent). Error
   capture is **secret-scrubbed**, never verbatim — provider 401s echo the submitted token.
8. **A vault/escrow step is load-bearing and was missing.** The precedent skill's non-negotiables
   call it out: a credential existing only on this machine makes recovery impossible when the
   machine is the thing being recovered.
9. **The backup's cloud credential has no rotator anywhere**, and the predecessor spec wrongly
   claimed it was covered by the existing skill — that skill rotates the repo password and only
   *consumes* the cloud key. Verified: no service-account-key rotator exists in the toolchain.
10. **Interrupted runs need a Done-When box.** Every criterion in the predecessor exercised a
    clean path or a single refusal; none killed a run mid-batch.

### Leak paths to close by construction

Argv exposure (`cmd --token "$VALUE"` is visible in `ps`), shell history, `source` on env files
(the 2026-08-21 incident mechanism, still present in 11 files), verbatim error capture, and the
vault's own retention tail inside backup snapshots.

## Risks / Non-Goals

### Non-Goals

- Do NOT start before P1147 has run twice.
- Do NOT rotate anything absent from the registry.
- Do NOT implement in-place rotation for any provider, even where the API offers it.
- Do NOT solve CAPTCHA or 2FA — stop and hand over the exact screen.
- Do NOT pass a secret as a shell argument, or `source` an env file.
- Do NOT auto-push, auto-deploy, or auto-commit during a rotation run.
- Do NOT grant the driver authority over meta-authority credentials (P1147 bars them from
  `auto-api` structurally).

## Done-When

Deferred until P1147 lands — the classification data determines how many rotators exist and which
tiers they fall in. Carried forward from the predecessor as non-negotiable:

- [ ] A rotation whose verify fails leaves the old credential live and working — demonstrated
- [ ] Each verify is proven discriminating by observing it **fail** against the old value
- [ ] A run killed mid-batch is resumable without orphaning a credential — demonstrated by killing one
- [ ] Rotating a `never-rotate` or meta-authority credential is refused with the reason
- [ ] Adding one credential requires one rotator file and one registry row, no driver edit —
      demonstrated by doing it
- [ ] No secret value in the ledger, the terminal, `ps` output, shell history, or any commit

## Related

- **Predecessor:** P1147 (drift audit) — blocking.
- The single-credential rotation skill — the ordering precedent. Its human hard-stops (vault
  read-back, restore-path proof) are **not expressible** in an executable four-verb contract;
  that credential stays `manual-only` and this system defers to the skill rather than wrapping it.
