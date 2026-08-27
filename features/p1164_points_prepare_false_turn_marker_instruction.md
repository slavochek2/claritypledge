---
status: week
type: task
rank: 73
workstream: infrastructure
created_date: '2026-08-27'
tags: [skills, points-pipeline, correctness]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: low
driver: anomaly
---

# P1164 — `/slava:disagreement:prepare` instructs attribution by `>>` markers that captions do not contain

## Problem

`.claude/commands/slava/disagreement/prepare.md:106` (v0.7.0) reads: *"Auto-captions carry no
speaker labels. Attribute by content and by the `>>` turn markers, and say so."* The sentence
contradicts itself — it states the absence, then instructs the reader to use the absent thing.

Measured 2026-08-24 during P1156 on a control pair, a one-speaker talk and a two-speaker interview
probed identically: `>>` turn markers **0 and 0**, dash-dialogue markers **0 and 0**, bracketed
speaker labels **0 and 0**. Harmless for new runs, which are single-speaker by construction under
the P1156 selector's Gate 0; a run on any pre-Gate-0 multi-speaker source inherits a method that
cannot work and will silently fall back to guessing.

## Appetite

Blast radius: one line in one skill file. Reversibility: `git revert`. Decision density: zero.

## Solution

Delete the `>>` clause. Attribution stays content-based, with the existing unattributed-rather-than-
guess rule carrying the ambiguous cases — that rule is the actual safeguard and it already works.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Removing the clause reads as removing the safeguard | MITIGATE | The safeguard is the next sentence (mark unattributed rather than guess); it stays verbatim |
| A future source format does carry turn markers | ACCEPT | Re-add against a measurement then; a method claim with no evidence behind it is the thing being removed |

**Non-Goals**

- Do NOT substitute another parsing method. `decisions.md` 2026-08-19 already ruled attribution is
  solved by **source selection**, not by parsing markers out of a transcript.
- Do NOT touch Gate 0, the selector, or any other stage — P1156 shipped stages 1-5 byte-identical
  on purpose, and this is a one-line correction inside that constraint, not a reopening of it.
- Do NOT edit the version-history block beyond the version bump.

## Done-When

- [ ] `grep -n '>>' prepare.md` returns only the `.sha256` redirect at line ~95 — no
      attribution instruction among the hits
- [ ] The unattributed-rather-than-guess sentence is present and unchanged
- [ ] The `docs/process-learnings.md` entry that filed this is closed out

## Related

- `docs/process-learnings.md` — "False `>>` marker claim in disagreement:prepare Stage 2", filed
  2026-08-25 with the control-pair measurement and its falsifier
- `docs/decisions.md` — the P1156 entry flagging this **"Open and flagged, not fixed here"**
- P1156 — the spec that measured it and deliberately left it
