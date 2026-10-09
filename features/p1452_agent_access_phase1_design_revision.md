---
status: backlog
type: task
rank: 106
workstream: infrastructure
created_date: '2026-10-09'
tags: [security, agents, design]
disclosure: public
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: heuristic
blocked_by: [p1321]
blocks: [p1215]
related: [p1321, p1215, p1207]
---

# P1452: Phase-1 agent-access design — revise after review round 2 and pass a third blind round

> Split out of P1321 on 2026-10-09. P1321 keeps the security-gate work (its fixes, drift checks
> and re-audit) and ships; the phase-1 design it drafted is parked here with its open findings.

## Problem

Founder framing, verbatim (2026-10-09):

> *"P1321 split. Move the parked phase-1 design and its open round-2 findings into a new
> disclosure: public spec."*

P1215 (a member's agent acts as them) needs a reviewed read-only authorization design before
anything is built. P1321 drafted one in
[docs/technical/agent-access-phase1-architecture.md](../docs/technical/agent-access-phase1-architecture.md)
and put it through two blind adversarial rounds. Both returned **NO**. Round 1's findings were
revised (§6 of the document); round 2 then left **1 critical and 5 high findings open** (C1, H1–H5),
plus M1–M7 and L1–L4, recorded in the document's § Review record. They are open on purpose: a
revision judged by its own author is not a review.

The design was parked rather than revised in P1321 because nothing can be built on it yet: P1215
is deferred ([decisions.md](../docs/decisions.md) 2026-09-21 [product]) and P1321's re-audit still
answers P1207's Criterion 1 **No** ([docs/audits/p1321-reaudit.md](../docs/audits/p1321-reaudit.md)).

## Appetite

**Blast radius: high** — the design decides whether an authenticated agent entry path to the whole
data surface may be built. **Reversibility: high** — design and review only; no code, no database
change. **Decision density: low until unparked** — H5 may force a founder call (accept bounded
consent phishing, or declare the design dead).

## Solution

Start only when P1215 is un-deferred and Criterion 1 is re-answered **Yes**.

1. Revision 2 of the document against C1 and H1–H5 first, then M1–M7 and L1–L4, each with its
   resolution or an explicit acceptance and reason, in the document.
2. Round 3: a blind adversarial review by a reviewer who has not seen rounds 1–2, given only the
   document and the P1215 spec. Record which reviewer actually reviewed, and `<reports received> of
   <spawned>`.
3. Repeat until a round returns zero unresolved critical or high findings.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Standard OAuth cannot meet the consent-phishing bound (H5) | ACCEPT | A valid outcome; record it as the design's answer and take it to the founder |
| The vendor documentation the design rests on has moved | MITIGATE | Re-read the sources before revising (P1321 assumptions entry 15) |

**Non-Goals:** building phase-1 agent access; any database or production change; modifying P1215's
Problem, Solution or Appetite.

## Done-When

- [ ] Revision 2 resolves or explicitly accepts every round-2 finding (C1, H1–H5, M1–M7, L1–L4), in the document
- [ ] A third blind round is recorded with its reviewer and report count
- [ ] The latest round leaves zero unresolved critical or high findings

## Related

- P1321 — drafted the design and rounds 1–2; its assumption log (`features/verification/p1321/assumptions.md`, entries 14, 15, 18) records the reviewers and the parking call
- P1215 — the build this design unblocks
- P1207 — Criterion 1, re-answered by P1321
