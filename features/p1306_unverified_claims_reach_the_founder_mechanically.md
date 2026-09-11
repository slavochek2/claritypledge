---
status: week
type: comment
rank: 98
workstream: infrastructure
created_date: '2026-09-11'
tags: [hooks, stop-hook, verification, epistemics]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1306: Can a Stop hook catch an unverified claim before it reaches the founder?

## Problem

**Situation:** Written rules already forbid telling the founder something before running the command
that would falsify it: `.claude/rules/epistemic.md` gate 9, CLAUDE.md "Falsify Before You Rely" and
"Evidence Over Declaration". `.claude/hooks/verify-before-stop.py` (P1116) already enforces one
narrow class of this mechanically: it blocks a turn that ends on an "it's live / fixed / deployed"
claim with no verifying tool call since the last edit.

**Complication:** The pattern keeps recurring in shapes the hook does not match. Four same-shape
instances in about two days; the two from 2026-09-11 were:

- **Attribution:** "the stray *placeholder* fork pushed". A transcript grep then showed the *other*
  fork ran the push script, and the placeholder ran nothing push-related.
- **Exposure:** "nothing sensitive is exposed on GitHub right now". The commit that introduced the
  detail was already in the pushed history; only the latest version had been checked.

Both were stated before the falsifying command ran, and were corrected only after the founder asked.
`~/.claude/kdd-suppressed-log.md` recorded the previous instance with *"revisit with a non-prose
intervention if it recurs"*. It recurred. decisions.md 2026-09-09 [process] (P1275) has already
rejected adding another checklist, because the check that would have caught it had already been
performed.

**Question:** Can a mechanical check, most likely an extension of the existing Stop hook, catch these
claim classes at a precision that does not train the agent to route around it?

> Founder, verbatim, on the incident that produced both claims: *"what do we do bout the thing?
> anyhtng to investiage nad irmpove not srue?"* — and, offered written versus mechanical options,
> chose **"Explore a mechanical fix"**.

## Appetite

Blast radius: medium. The Stop hook runs at the end of every turn in this repo, so a false block
costs every session. Reversibility: high, since a hook change reverts with git. Decision density:
low, apart from the open question below.

## Invariants

- **The claim gate stays the safety gate.** A new check must never consume the one block per turn
  the existing claim gate needs (decisions.md 2026-08-19 [process], "Adding a second check to an
  existing Stop hook consumed the block the first one needed"; the hook's own ordering invariants).
- **Verification is judged only by recorded tool calls, never by text that mentions a command.**
  The oracle must be an artifact the agent cannot write by typing (decisions.md 2026-09-01
  [technical], P1206).

## Approach

1. Build a replay corpus: the two 2026-09-11 claims verbatim from this session's transcript, the
   earlier instances named in the suppression log, a known-good control (a claim stated *after* its
   verifying command — e.g. the prod refusal quoted after the `curl` that produced it), and at least
   20 recent final assistant messages from `~/.claude/projects/` transcripts as a false-positive
   sample.
2. For each claim class (attribution, exposure/absence), try to specify a trigger pattern and a
   matching "verifying tool call" the hook can read, following `verify-before-stop.py`'s structure.
3. Score against the corpus and the decision criteria below. Record the verdict either way.

## Research Questions

1. Can attribution claims ("X did Y", "it was the other one") and exposure/absence claims
   ("nothing is exposed", "no one can reach it") be recognised in a final message by pattern, at
   the precision below?
2. For each class, which recorded tool calls count as the falsifying check (for example
   `git log -S` over the pushed range for exposure; a transcript grep for attribution)?
3. Can the check live in `verify-before-stop.py` without breaking its ordering invariants, or does
   it need its own hook?

## Decision Criteria

Pre-registered — set before the corpus is scored:

1. **Build** only if, on replay, it blocks **both** 2026-09-11 claims **and** passes the known-good
   control **and** falsely blocks **at most 1 in 20** of the recent-message sample.
2. If a class cannot reach that bar, drop **that class** rather than lowering the bar. A claim class
   that cannot be caught at this precision is recorded as not mechanizable, with the numbers.
3. If no class reaches it, close this spec with the measured numbers in decisions.md. That is a
   result, not a failure.

## Time Box

One session. If the corpus cannot be assembled within it, record what was missing and stop.

## Deliverable

A decisions.md entry with the measured numbers, and either a hook change plus tests that fail on the
old hook and pass on the new one (blocked and allowed cases both), or a not-mechanizable verdict.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| False blocks teach the agent to rephrase around the pattern (decisions.md 2026-08-31 [process], the workarounds an agent reaches for under a blocking Stop hook) | MITIGATE | Precision bar in Decision Criteria; false-block rate measured before building |
| A determined rephrase evades any pattern | ACCEPT | The target is the "forgot to check" case, not an adversary, same as the existing claim gate |
| The replay corpus under-represents real phrasing | MITIGATE | At least 20 real final messages, not synthetic ones |

**Non-Goals**
- Do NOT add prose rules or a checklist (decisions.md 2026-09-09 [process], P1275).
- Do NOT change the KDD format gate in the same hook.
- Do NOT change the existing completion-claim patterns except to fix a measured defect.

## Done-When

- [ ] Replay corpus assembled: both 2026-09-11 claims, the known-good control, and at least 20 recent final messages
- [ ] Decision criteria scored with the numbers pasted in this spec
- [ ] Verdict recorded in decisions.md: built (tests pasted, failing on the old hook and passing on the new) or not mechanizable (with numbers)

## Open Questions

1. May the hook call a model to classify a claim, or must it stay pattern-only? A model call adds
   latency, cost and non-determinism to every turn's end. [FOUNDER DECISION: allowed or not]

## Related

- P1116 (done): mechanized the unenforced rules, including this hook's claim gate
- decisions.md 2026-07-15 [process]: prose rules that keep getting bypassed get mechanized as hooks, not reworded
- decisions.md 2026-08-10 [process]: three false claims in one session shared one shape
- decisions.md 2026-09-11 [technical] (P1303): the session that produced the two claims
