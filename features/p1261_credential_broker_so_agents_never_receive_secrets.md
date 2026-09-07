---
status: rejected
type: task
rank: 1000075
workstream: keyring
created_date: '2026-09-07'
tags: [security, credentials, broker, proxy]
related: [p1239, p1214, p1148]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: founder
reviewed_by: [opus, codex]
---

# P1261: Hold the web-facing credentials in a broker so agents never receive them

## VERDICT — REJECTED 2026-09-07 after adversarial review

Two independent hostile reviewers (Opus, 10 findings; Codex, 7) were run in parallel against this
spec as drafted below. A third lane (Gemini) was refused by the delegation gate before sending, so
that lens is **uncovered** — 2 of 3 reports received. Both delivered reviewers returned a
do-not-build verdict, converging on the same four points, which are recorded here because the
reasoning is reusable even though the spec is not.

**1. The broker is an unauthenticated local capability, so it LOWERS the bar for the stated
adversary.** Under P1239 alone, an injected agent gets nothing without the founder answering a
system dialog. Under P1239 + broker, the agent needs only the broker's address — which is by design
not a secret — and gets full production capability with **zero** dialogs for the broker's entire
lifetime. The spec conceded the broker is not a boundary against a same-user process, and then
failed to draw the consequence. It raises the theft bar and lowers the misuse bar.

**2. Open Question 2b answers YES.** A long-lived broker does reintroduce exactly the time-window
failure P1239 rejected. P1239's own invariant is *"the unlock gates an ACCESS, not a state"* — a
running broker is precisely a state, and its cited precedent for why states fail is a "30-minute"
grant still live 3h23m later because its cleanup died with its terminal. A broker process has that
same lifetime failure mode. The readable-vs-usable distinction this spec leaned on does not carry
the weight put on it: usable-by-everything delivers the attacker's actual objective — the data, or
its destruction — without ever needing the value. **The one half that survives is the injection
record**, and a record is not worth a service in the write path of production.

**3. P1214 Phase 2 makes this spec's only valuable row disappear — and answers it better.**
Verified directly against that spec: Phase 2's success condition is *"the prod master key no longer
present in `.env.local`"*, achieved by collapsing write consumers into roughly four operation-scoped
functions whose callers *"present a credential authorizing an operation, never the database."* That
is a strictly better answer to the misuse risk this spec accepted, and it removes the one credential
carrying all of this spec's value. Three of the four in-scope credentials measured **0–1 uses per 30
days**; the whole benefit sat in one row, and P1214 takes that row.

**4. Host-granular egress allowlisting is a confused deputy.** For the prod key the allowed host
*is* the production database. Forwarding any method and any path to it converts "cannot steal the
key" into "can drop every table without ever seeing the key". Any revival must scope the allowlist
by method and path, in Invariants, not Open Questions.

**Kill-condition, stated so a future session does not re-derive this:** if P1214 Phase 2 completes,
this spec closes rather than shrinks. It should only be reconsidered if Phase 2 is abandoned as
"immovable" (a possibility P1214 names explicitly) **and** a design exists that authenticates
individual local clients to the broker — which, on this machine, means the sandbox question this
spec was written to avoid.

**What stands after the review:** ship P1214, then P1239, and accept the hand-off gap — the ~14
moments a month where an approved read puts the live prod key inside a process — as a documented
residual risk rather than paying a production-path service to convert it into a differently-shaped
one.

**The draft below is preserved unedited except for one corrected false claim (it asserted P1239's
protection in the present tense; P1239 is unshipped and its Open Question 4 is unresolved).**

---

## Problem

**Situation:** [P1239](p1239_encrypt_the_critical_credential_half_with_per_access_unlock.md) locks
the critical credentials at rest and gates each read behind a confirmation the founder answers at
the moment of the read. Once shipped **and once its own Open Question 4 is resolved**, that closes the *file*. It is not
closed today: P1239 is unshipped, its only spelling-proof read guard is staged but inert, and the
deployed hook has three reproduced bypasses that cannot be closed by any pattern match. Since this
spec's entire seed protection rests on P1239, an unresolved P1239 is an unresolved P1261.

**Complication:** It does not close the *hand-off*. After the founder approves a read, the consuming
process holds the real secret in its own memory and can do anything with it, including send it
somewhere. On the measured baseline that is **14 approved reads of the prod master key in 30 days**,
each one a moment where the live secret exists inside a process an injected agent may be driving.
P1239 names this honestly and does not claim otherwise; it gates *who may cause a read*, not *what
happens to the value afterwards*.

> Founder framing, verbatim: *"it gives agent only one time a temporary password. So the agent
> cannot leak it. He can only do something wrong without it but he cannot leak it."*

**The framing is right and the mechanism is stronger than described.** A short-lived token still
puts a real secret in the agent's hands, just an expiring one. The pattern this spec adopts —
commonly called a **secretless broker** or a credential-injecting egress proxy — hands the consumer
**nothing at all**: the consumer addresses a local broker, and the broker attaches the credential on
the outbound request. There is no token to expire, because there is no token.

**Question:** Which credentials can move behind a broker, what does the broker hold and where, and
what remains exposed after it exists?

## Prior reasoning this spec corrects

`pp` `docs/decisions.md` 2026-09-03 declined to containerise interactive sessions, on the ground
that *"a container holding the same keys with network access exfiltrates exactly as well as the
laptop does."* That argument is sound and **does not apply here**: under a broker the consumer does
not hold the keys. The same entry's second argument — that an interactive session needs the repo,
the servers, the browser and the git identity, so confining it costs full price — is untouched and
is **why this spec requires no sandbox**. Sandboxing remains a separate, open question about a
different threat (tampering and non-credential exfiltration), and nothing here depends on it.

## Appetite

**Blast radius: high** — the broker sits in the path of every production write it fronts.
**Reversibility: high** while consumers can still be pointed back at direct credentials; low once
the direct path is removed. **Decision density: two** — the credential scope line, and where the
broker's own copy of each secret lives. Both are named in Open Questions.

## Solution

A local broker process holds the web-facing critical credentials and is the only thing that ever
sees their values. Consumers are configured with the broker's address instead of a secret. The
broker attaches the credential to the outbound request, applies an egress allowlist, and records
what it did.

**The broker never writes a plaintext secret to disk.** It is seeded once at start from the
P1239-locked store — one confirmation per broker start, not one per consumer read — and holds the
values in memory only. This makes P1239 a **dependency, not a duplicate**: P1239 is what protects
the broker's seed. Without it the broker just moves the plaintext file somewhere else.

### Scope — which credentials fit

The broker only works for credentials carried in a web request it can rewrite. Classification is
by wire shape, not by importance:

| Credential | Wire shape | Broker? | Why |
|---|---|---|---|
| prod master key | HTTP header | **yes** | the highest-value key and the highest-traffic one (14 reads/30d) |
| mail-sending key | HTTP header | **yes** | already a deployed secret for the hosted functions; only the manual local path moves |
| blog admin key | HTTP header | **yes** | zero measured local use — free to move |
| social-publishing tokens | HTTP header | **yes** | zero measured local use — free to move |
| ops mailbox password | IMAP over TLS | **no** | not a rewritable request; stays on the P1239 path |
| direct DB credential | Postgres wire protocol | **no** | would need a separate protocol-aware proxy; out of scope |

**Two of six stay on encryption permanently.** This spec must not be described as replacing P1239.

### What the broker does beyond injection

- **Egress allowlist.** A request the broker will not recognise as targeting an allowed host is
  refused, not forwarded. Without this the broker is a credential-attaching open relay.
- **A record of every injection.** Which credential, which target, when. This is the property no
  other control on the roadmap provides — today a credential read leaves no trace of what was done
  with it.

## Invariants

- **The broker never persists a secret value.** In memory only, seeded at start. If the broker
  restarts, it re-asks.
- **Fail closed and loud.** A consumer that cannot reach the broker stops with a non-zero exit and
  a message naming what happened — never falls back to a direct credential, never proceeds empty.
- **Never remove a direct credential path until its consumers have run through the broker at least
  once.** Both paths coexist through a full cycle, matching P1239's own staging rule.
- **The broker is not a security boundary against a process running as the founder.** It is a
  boundary against a process that has been handed a URL instead of a key. Anything that can read
  the broker's memory or replace the broker binary defeats it, and no part of this spec claims
  otherwise.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Misuse is entirely unaddressed — an injected agent can ask the broker to destroy production | **ACCEPT, and say so loudly** | The broker converts *theft* into *misuse*. Misuse is bounded only by the egress allowlist and by P1214's privilege reduction, which is the actual answer to it |
| The broker is tampered with — killed, replaced, or its memory read | ACCEPT | Requires a sandbox to close; explicitly out of scope per Prior Reasoning |
| The broker becomes a single point of failure for every production write | MITIGATE | Direct paths stay live through a full cycle; recovery path documented and executed once before any removal |
| Consumers silently keep using direct credentials, so the broker protects nothing | **MITIGATE — likeliest real failure** | Needs a check that reports which consumers still hold a direct credential. A broker nobody routes through is theatre |
| The broker's own start-up seed becomes a standing unlock | MITIGATE | The seed is per broker start; a long-lived broker is a long-lived unlock. Bound the lifetime or accept it explicitly — see Open Questions |
| Building this instead of P1214 | ACCEPT | P1214 shrinks what the broker must front; it should land first |

**Non-Goals**
- Do NOT sandbox anything as part of this spec.
- Do NOT move the two non-HTTP credentials behind the broker.
- Do NOT remove or weaken P1239 — the broker depends on it for its seed.
- Do NOT adopt short-lived tokens as a substitute. A token in the agent's hands is the thing this
  spec removes.
- Do NOT treat the broker as protection against a hostile process running as the founder.

## Done-When

- [ ] A consumer configured for the broker completes a real production call holding **no**
      credential value — verified by inspecting the consumer's environment and process during the
      call, output pasted
- [ ] The broker refuses a request to a host outside the allowlist, with a non-zero exit at the
      consumer — observed, exit code pasted (epistemic gate 7)
- [ ] Killing the broker makes a consumer **fail**, not silently fall back — observed
- [ ] No plaintext secret is written to disk by the broker at any point — verified by watching for
      file writes across a full start-to-request cycle
- [ ] No secret value appears in shell history, session transcripts, process arguments, or the
      broker's own log
- [ ] A one-command check reports which consumers still hold a direct credential, and it returns a
      non-empty list before migration and an empty one after
- [ ] All four in-scope credentials have run through the broker at least once while their direct
      paths still exist
- [ ] The recovery path (broker unavailable, founder needs production access) is documented and has
      been executed once

## Alternatives Considered

- **Short-lived tokens.** Rejected: the consumer still holds a real secret. Defends against a stolen
  value used next week, not against a live process that can use it now — the same argument that
  rejected a credential-manager CLI on 2026-09-03.
- **Broker plus sandbox.** Not rejected, deferred. Adds protection against tampering and
  non-credential exfiltration, at the workflow cost recorded 2026-09-03. Decided separately.
- **Sandbox without broker.** Rejected on the original 2026-09-03 reasoning, which still holds: the
  container would hold the same keys.
- **Encryption alone (P1239, ship and stop).** Viable and much smaller. It leaves the hand-off open
  — 14 moments a month where the live prod key sits in a process. That gap is the whole reason this
  spec exists; if the founder judges it acceptable, this spec should be closed rather than shrunk.
- **A protocol-aware proxy covering the database credential too.** Rejected for now: separate
  mechanism, separate failure modes, and P1214 may retire the local copy first.

## Open Questions

1. **Where does the broker's seed come from at start, exactly?** It must come from the P1239-locked
   store and must not transit a tool call or shell history. Founder call on whether one confirmation
   per broker start is acceptable, or whether the broker should re-confirm on a schedule.
2. **How long may a broker live?** A broker running all day is a standing unlock for its whole
   lifetime — the same shape as the time-window P1239 explicitly rejected. Either bound the lifetime
   or record deliberately that the trade is accepted here because the value never leaves the
   broker's memory. **This is the sharpest unresolved tension between the two specs.**
2b. **Does a long-lived broker reintroduce what P1239 rejected?** Stated plainly so a reviewer can
   attack it: P1239 rejected a 30-minute window on the ground that it made secrets readable to
   everything for its duration. A broker makes secrets *usable* by everything for its duration, but
   never readable. Whether that distinction is load-bearing or a rationalisation needs an
   adversarial answer, not this spec's own.
3. **Does the ordering hold?** P1214 → P1239 → this. Confirm P1214's retirement list does not remove
   any of the four in-scope credentials, which would shrink this spec before it starts.
4. **What enforces routing?** Nothing in this spec stops a consumer from keeping its direct
   credential. The check in Done-When detects it; nothing prevents it. Is detection enough, or does
   removal of the direct path have to be part of this spec rather than a follow-up?
5. **Does the broker's log become a new exposure?** It records targets and timings, not values, but
   it is a map of production activity sitting on the same disk.

## Related

- **Dependency:** [P1239](p1239_encrypt_the_critical_credential_half_with_per_access_unlock.md) —
  protects the broker's seed and permanently owns the two non-HTTP credentials.
- **Should land first:** [P1214](p1214_credential_separation_and_privilege_reduction.md) — shrinks
  the credential set and is the real answer to the misuse risk this spec accepts.
- **Peer:** [P1148](p1148_credential_rotation_system.md) — rotation becomes cheaper once a broker
  is the single place a value lives.
