---
status: backlog
type: task
rank: 250
workstream: infrastructure
created_date: '2026-08-21'
tags:
  - security
  - credentials
  - rotation
  - skills
related: [p1214, p1186]
delivery_stage: create-spec
pipeline_ran:
  - create-spec
driver: heuristic
---

# P1148: Credential rotation system — plugin rotators, driver, vault

**P1147 is met; P1214 is a peer, not a blocker.** P1147 shipped 2026-06-10 and its audit ran
2026-09-01 with the full argument set, exit 0 — meaning only that no registry row held an inline
plaintext value, the script's single hard-fail class. It is not a clean bill: the same run
reported 28 retirement candidates out of 101 classified credentials, 48 stale consumer lists,
`COVERAGE:84/86`, and a prod/test master-key row sharing metadata.

An earlier revision of this note declared this spec blocked by
[P1214](p1214_credential_separation_and_privilege_reduction.md). Codex review (2026-09-01) showed
that deadlocks: P1214 would create, swap and delete credentials while the spec building the
safeguards for exactly those operations waited on it. **Resolved as a boundary instead of an
order — P1214 performs no irreversible step; this spec owns every deletion, revocation and
provider-side disable, including the retirements P1214 marks but deliberately does not execute.**
Both proceed in parallel — **and "parallel" needs one shared-resource rule, because
`.private/docs/accounts.md` is written by both.** This spec's driver resolves `coupled_with` and
consumer lists from registry rows that P1214 Phase 4 rewrites (it splits the bundled prod/test
row and repairs 48 consumer lists). A split landing mid-rotation, after `mint` and before
`verify`, leaves this spec's rollback targeting a row identity that no longer exists.
**Requirement: fingerprint the registry rows a run starts from and abort on change** — the
fingerprint concept already exists here for values (item 1); apply it to the rows too. P1214
carries the reciprocal rule: no Phase 4 with a run in flight.

**Scheduling, stated rather than assumed:** this spec is `status: backlog` while P1214 is
`status: week`. P1214 hands over a queue of credentials marked retired but NOT revoked — each one
still live and no longer monitored by any consumer. That window stays open until this spec runs,
so either it leaves backlog when the first retirement verdict lands, or P1214's liveness probes
are the accepted compensating control for an unbounded window. It is not automatically both.

Two independent adversarial reviews established this work must not be sized on an estimate. That
still holds: build rotators against the set that survives P1214's de-privileging, and treat any
credential P1214 has marked retired as this spec's input queue.

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

### Learned in the field (2026-08-28, rotating the leaked prod Supabase `service_role` key)

Not from adversarial review — from an actual attempted rotation that went down the wrong path
and was caught by the operator's instinct, not by analysis. Full write-up: `pp/docs/decisions.md`
2026-08-28 "The leaked credential's TYPE decides the rotation path".

**Reference implementation — read this before designing any rotator.**
`pp/docs/infra/supabase.md` is a rotation that was actually carried out end-to-end against live
production: leaked key enumerated, replaced, cut over, killed, and the kill *proven*. It is the
only worked example this spec has, and it is worth more than the abstractions below because it
records what the real thing cost. It maps 1:1 onto the ordering diagram above:

| This spec's verb | What it was, concretely |
|---|---|
| `mint` | `POST /api-keys?reveal=false` — creates without returning the value, so the secret never enters the agent session. **The `reveal` flag is the single most useful thing found**; any provider offering it should be preferred over a dashboard copy-paste |
| `write-consumers` | GCP Secret Manager version, `.env.local`, Vercel env var. Edge functions needed nothing — the platform swaps its own injected values |
| `verify` | new key 200 *and* the live site up, before anything was revoked |
| `archive-old` / `revoke-old` | `PUT /api-keys/legacy?enabled=false`, then `DELETE /api-keys/{id}?was_compromised=true` |

Also note what this example proves about **item 15**: the rotation *was* driver-automatable end
to end — the mint/write steps ran as a script and no human pasted anything. What stayed human was
the **deploy** (gated by a push flag the agent must not touch). So the boundary in item 15 is
sharper than first written: the constraint is not "an agent cannot mint," it is "an agent must
never *observe* the value, and must never deploy." A rotator that pipes `reveal=true` straight to
its destination and prints only a fingerprint satisfies both.

And what it proves about **item 11**: the coupled set was not discovered from documentation. It
surfaced from a provider warning dialog and had to be confirmed against the codebase. `describe`
declaring `coupled_with` is right, but the spec needs to say where that list comes from — nothing
in the registry today would have contained it.

11. **Credentials can be *coupled* — a shared-fate set, not independent rows.** Supabase's
    legacy `anon` and `service_role` are two static JWTs signed by **one** secret: revoking the
    admin key necessarily kills the public frontend key. A rotator that models credentials as
    independent will plan a safe-looking rotation and take down an unrelated public surface.
    This is distinct from item 1 — those are the *same* credential under several names; these
    are *different* credentials that die together. `describe` must declare
    `coupled_with: [...]`, and the driver must expand any rotation to the full coupled set and
    plan a single ordered cutover across all of them.

12. **Prefer migrating the credential *type* over rotating the value in place.** Before
    rotating, ask whether the provider offers a newer key format that decouples the credential
    from whatever it is entangled with. Here, rotating the legacy key meant an auth-wide JWT
    signing-key operation; switching to the new `sb_secret_`/`sb_publishable_` format made the
    key independently revocable and reduced every future rotation to create → swap → delete.
    A rotator should declare `preferred_target_format`, and a one-time migration is the correct
    output when the current format is the reason rotation is expensive. **Corollary:** the first
    rotation of a badly-designed credential is a migration, and should be estimated as one.

13. **Provider warning dialogs are boilerplate; verify their claims against the codebase.**
    Supabase's rotation dialog listed 15 edge functions as "may stop functioning… as they verify
    the legacy JWT secret." Grep proved **none** verify it — all call `getUser()`, which
    validates server-side and survives rotation. Had that warning been taken at face value it
    would have inflated the work and could have aborted a safe rotation. Treat provider blast-radius
    claims as hypotheses to check, never as findings. (The inverse of gate 7: a scary warning is
    as unproven as a passing test.)

14. **Some providers have no rotation API at all.** Verified 2026-08-28: `supabase` CLI v2.106
    can `secrets set` (edge-function env) and `projects api-keys` (list only) — there is **no**
    command to rotate the JWT secret or service_role key. Dashboard only. Such credentials are
    `manual-only` by provider constraint, not by policy choice, and the registry should record
    *why* so it is not re-litigated each cycle.

15. **The rotation itself cannot run inside an agent session.** The new value passing through any
    tool call is written to the session transcript — reproducing the leak the rotation exists to
    close. This bounds the whole system: the driver can plan, enumerate consumers, and verify by
    status code, but the mint/paste steps are human-only. `auto-api` is therefore never fully
    autonomous for any credential whose value the agent would observe.

### Leak paths to close by construction

Argv exposure (`cmd --token "$VALUE"` is visible in `ps`), shell history, `source` on env files
(the 2026-08-21 incident mechanism, still present in 11 files), verbatim error capture, and the
vault's own retention tail inside backup snapshots.

## Risks / Non-Goals

### Non-Goals

- Do NOT build a rotator for a credential P1214 has already marked retired — retire it instead.
- Do NOT rotate anything absent from the registry.
- Do NOT implement in-place rotation for any provider, even where the API offers it.
- Do NOT solve CAPTCHA or 2FA — stop and hand over the exact screen.
- Do NOT pass a secret as a shell argument, or `source` an env file.
- Do NOT auto-push, auto-deploy, or auto-commit during a rotation run.
- Do NOT grant the driver authority over meta-authority credentials (P1147 bars them from
  `auto-api` structurally).

## Done-When

Sized by the surviving credential set. P1147's classification data exists as of 2026-09-01; what
is still unknown is how much of it P1214 marks retired. Add one Done-When as a consequence of the
boundary: **every deletion or revocation in this repo flows through this spec's driver**, so a
credential P1214 marked retired is either retired here with evidence, or its verdict is reversed. Carried forward from the predecessor as non-negotiable:

- [ ] A rotation whose verify fails leaves the old credential live and working — demonstrated
- [ ] Each verify is proven discriminating by observing it **fail** against the old value
- [ ] A run killed mid-batch is resumable without orphaning a credential — demonstrated by killing one
- [ ] Rotating a `never-rotate` or meta-authority credential is refused with the reason
- [ ] Adding one credential requires one rotator file and one registry row, no driver edit —
      demonstrated by doing it
- [ ] No secret value in the ledger, the terminal, `ps` output, shell history, or any commit

## Related

- **Predecessor:** P1147 (drift audit) — **met** (shipped 2026-06-10, ran clean 2026-09-01).
- **Peer:** [P1214](p1214_credential_separation_and_privilege_reduction.md) — shrinks and
  de-privileges the set, and hands this spec its retirement queue. Non-destructive by
  construction; this spec is the destructive half. Parallel, not sequential.
- The single-credential rotation skill — the ordering precedent. Its human hard-stops (vault
  read-back, restore-path proof) are **not expressible** in an executable four-verb contract;
  that credential stays `manual-only` and this system defers to the skill rather than wrapping it.
