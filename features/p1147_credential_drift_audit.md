---
status: week
type: task
rank: 63
workstream: infrastructure
created_date: '2026-08-21'
tags: [security, credentials, audit, drift]
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
driver: anomaly
---

# P1147: Credential drift audit — classify every secret, detect drift in three directions

## Problem

**Situation:** Two private registries document credentials — an account-level one and an
edge-function one. Between them they hold 15 rows (plus 2 documented in prose). The three local
env files hold **43 unique secrets** by name, plus at least 2 more on malformed lines the obvious
parser cannot see.

**Complication:** **33 of 43 (77%) are in neither registry**, and nothing detects that. Nothing
ever will, because no mechanism has the job. Three separate drift instances exist *today*, all
verified by command:

1. **Three registry-documented credentials have no entry in any env file.** Two of those rows
   explicitly name a local env file in their "stored elsewhere" column — the registry does not
   merely omit them, it **asserts a storage location that does not hold**. One is a service-account
   key with no local copy at all, i.e. no rollback source exists for it right now.
2. **Registry-vs-registry disagreement.** One key is documented with two different values in the
   two registries. That key is low-stakes; another dual-registered credential is not.
3. **Consumer lists in the registry are stale against live code.** One secret is documented with
   one consumer and has two; another is documented with five and has six.

Meanwhile the same day this spec was filed, `docs/decisions.md` recorded a live incident: sourcing
a local env file echoed several unrelated third-party credentials into a session transcript,
because that file contains lines that are not valid shell assignments. **Those are the same
malformed lines any naive audit parser silently skips** — so the keys most likely to be mishandled
are exactly the ones a careless implementation would report as clean.

**Question:** What mechanism establishes, and keeps establishing, that every credential is known,
correctly located, and correctly described?

## Appetite

**Blast radius: low.** This spec reads and compares. It mints nothing, writes no credential, and
revokes nothing. Its worst failure is a wrong report, not an outage.

**Reversibility: total.** One script plus additive registry columns. Deleting the script removes
the system.

**Decision density: low, and honestly so.** The four decisions this scope depends on were resolved
after adversarial review (see Resolved Decisions). Rotation's genuinely hard decisions — authority
model, rollback storage, verify discrimination — are **out of scope here** and recorded in the
successor spec.

**Sizing, which the predecessor scope never stated:** classification is ~46 credentials × (tier +
`never-rotate` screen). No `verify_cmd` execution, no per-provider rotators. That is the cheap
half, and it produces the data that would size the expensive half with facts instead of estimates.

## Solution

Two components: registry columns, and one audit script.

### 1. Registry columns

Both existing registries gain: `tier`, `consumers`, `interval`, `last_rotated`, `status`.
No new registry file — the existing two stay authoritative, and ~20 documents already reference
them (`.private/docs/accounts.md`, `.private/docs/edge-function-secrets.md`; the paths are already
named in public committed files, so naming them here adds no exposure).

`tier` values: `auto-api` · `browser-assisted` · `manual-only` · `never-rotate` · `not-a-secret`.

Two rules on `tier`, both structural rather than left to judgment:

- **Meta-authority is `browser-assisted` by definition.** Any credential that can mint,
  administer, or revoke *other* credentials is barred from `auto-api` — not classified into it by
  a judgment call. This is [decisions.md](../docs/decisions.md) 2026-06-27's reusable pattern
  ("the agent's credential must be unable to administer the gate it's subject to") applied to a
  static registry field instead of a runtime property.
- **`never-rotate` must state what breaks**, and distinguish *data loss* from *inconvenience*.
  The two currently share one word in the existing registries; collapsing them teaches every
  future reader that `never-rotate` means "annoying," which is how it eventually gets overridden.

### 2. The audit script

Reports drift in **three** directions, not two:

| Direction | Detects |
|---|---|
| consumer → registry | a live key nobody classified |
| registry → consumer | a documented credential that lives nowhere, or claims a location it does not occupy |
| registry → registry | the same key described two different ways in the two registries |

**The parser is the correctness surface, not an implementation detail.** A `^[A-Z_][A-Z0-9_]*=`
parser misses 8 of 84 lines in the largest env file — 4 lowercase-named, and 4 that yield no key
at all. Those last 4 cannot even be *reported* as unclassified, because no name is emitted. Every
line that is neither blank nor a comment must produce either a classified key or an explicit
unparseable-line finding.

**Unreachable surfaces are declared, never silently counted as clean.** The CI secret surface
returns HTTP 403 to the agent's credential **by deliberate design** — the audit must report it as
*not enumerated* rather than contributing zero unclassified keys to a total that then reads as
complete coverage.

## Risks / Non-Goals

### Risks

- **A parser that reports clean over what it cannot see** — the failure this spec exists to
  prevent, reproducible today on 8 real lines. Mitigation: unparseable lines are a finding class,
  and the Done-When fixture is a malformed key, not a well-formed one.
- **Reading the registries loads secrets into agent context** — one registry row currently holds a
  plaintext password inline. Mitigation: that value is removed under a separate action before this
  script is written; the audit compares fingerprints only.
- **Classification drifts the moment it is finished.** Mitigation: the audit is the ongoing check,
  not the classification pass; it runs in `/weekly`.

### Non-Goals

- Do NOT mint, write, rotate, or revoke any credential. This spec **reads**. Rotation is the
  successor spec.
- Do NOT build rotator plugins, a driver, or a rollback vault here.
- Do NOT print any secret value anywhere — context, terminal, or file. Fingerprints only
  (`first2…last2(length)`), matching the existing secret-audit skill's discipline.
- Do NOT store any secret value in either registry — and treat an existing one as a finding.
- Do NOT use `source` on any env file. That is the mechanism of the 2026-08-21 incident, and it is
  still present in 11 files in this repo. Parse line-by-line.
- Do NOT pass any secret as a shell argument (visible in `ps`) — file-based or stdin only.
- Do NOT create a third registry.

### Alternatives Considered

- **Full five-component rotation system** (the predecessor scope). Rejected for now on adversarial
  review: two independent reviewers returned RETHINK, and the decisive argument was that every
  value claim the spec made was a claim about *this* component. Deferred, not abandoned — the
  ordering design survived both attacks and is preserved in the successor spec.
- **Derive everything at runtime, no registry columns.** Rejected: `never-rotate` and its
  justification have nowhere to live.
- **New registry in the private personal repo.** Rejected on evidence: the existing location is
  inside the whole-home backup (verified against the backup script's exclude list), and ~20
  documents reference it.
- **Two-direction audit** (consumer ↔ registry only). Rejected: registry-vs-registry drift exists
  today and would be invisible.

### Rollback Strategy

Delete the script. The registry columns are inert without it and carry independent documentary
value.

## Done-When

- [ ] Every key in every **reachable** consumer surface is classified in a registry, or listed as
      an accepted exclusion with a reason
- [ ] Every surface the agent's credential **cannot** enumerate is named in the audit's output as
      not-enumerated, and excluded from any coverage percentage
- [ ] Each `never-rotate` row states what breaks, and whether that is data loss or inconvenience
- [ ] Every newly classified key has been screened for the `never-rotate` property
- [ ] The audit reports each of the 3 drift instances that exist today: the credentials with no
      env entry, the registry-vs-registry disagreement, and a stale consumer list
- [ ] Running the audit against a deliberately unregistered key with a **malformed, non-`KEY=VALUE`
      name** reports it as a finding (failure path exercised per epistemic gate 7 — a well-formed
      fixture certifies a parser proven blind to 8 real lines)
- [ ] Every non-blank non-comment line in every env file produces either a classified key or an
      explicit unparseable-line finding — zero silently dropped
- [ ] Running the audit against a registry row with no live consumer reports a retirement candidate
- [ ] No secret value appears in the audit output, either registry, the terminal, or any commit
- [ ] The audit runs as a `/weekly` sub-step
- [ ] The registry contains no inline plaintext secret value

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | adversarial review | [BLOCK] Concentrates mint/write/revoke over every credential into one agent-invoked driver; contradicts the 2026-06-27 decision, uncited | Scope cut to read-only; meta-authority barred from `auto-api` **by definition** in the successor | A read-only audit has no authority to concentrate. The constraint becomes a static registry fact rather than a runtime judgment |
| 2 | adversarial review | [BLOCK] Ledger section self-contradictory — archive plaintext for rollback vs. no secret in any file | Two separate artifacts in the successor: a short-lived purged `rollback-vault` and a permanent fingerprint-only `ledger` | Only option under which both properties hold; distinct names are what stop an implementer conflating them. Neither exists in this spec's scope |
| 3 | adversarial review | [BLOCK] "Every consumer surface" untestable — one surface returns 403 by design, 8 env lines defeat the parser | Unreachable surfaces declared explicitly; unparseable lines are a finding class | A coverage number over surfaces you cannot see is the exact lie the spec was written to prevent |
| 4 | adversarial review | [WARN] "The only worked example of safe ordering anywhere in the toolchain" — **false**; a registry row encodes that exact ordering | Claim removed | The prior art was in the file the author had read. The claim was doing argumentative work: no prior art → build from scratch |
| 5 | adversarial review | [WARN] "The rest carry none" — false; 6 rows carry Generator + Rotation columns, 2 carry mint commands, plus a shared write procedure and a verify script | Claim removed | 4 of 5 plugin verbs already written down. Both false claims pointed the same direction |
| 6 | adversarial review | [WARN] Appetite mis-sized ~3× — Problem said 17, Done-When committed to ~46 | Sized explicitly; scope cut to classification only | Largest gap between what the spec said it was and what it committed to |
| 7 | adversarial review | [WARN] `driver: heuristic` mislabeled; the same-day incident went unmentioned | Corrected to `anomaly`; incident now in the Problem | Its only consumer reads it as a ratio; a fabricated value corrupts the signal |
| 8 | founder | Skill placement | Global | The credentials span personal and project infrastructure; cross-repo read of the private registry is established practice |

## Related

- **Successor:** the rotation system itself — plugin rotators, driver, ordering, vault. The
  ordering design (`mint → write → verify → archive → revoke-old`, revocation last,
  `never-rotate` as unoverridable refuse, no-driver-edit constraint) survived both adversarial
  reviews intact and is preserved there.
- The existing secret-audit skill — classifies **leak** findings from git history; this classifies
  the **live inventory**. Complementary, different input.
- `docs/decisions.md` 2026-05-29 (rotation is the remediation for a leak) · 2026-06-27 (the agent's
  credential must not administer the gate it is subject to) · 2026-08-21 (the env-sourcing incident)
