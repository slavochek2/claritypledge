---
status: week
type: bug
rank: 1000072
severity: high
workstream: infrastructure
date_reported: '2026-09-04'
created_date: '2026-09-04'
tags: [pipeline, ship, hooks, gates, tooling]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1246: Every control in the delivery pipeline is advisory, and none is deterministic

## Problem

**Situation:** The pipeline is built from ~138 skill files. Each quality step is an
instruction written in prose for an agent to follow.

**Complication:** Measured this session, those steps run at these rates:

| Step | Specified in | Actually runs |
|---|---|---|
| Capture the founder's verbatim framing | `create-spec.md:213` | **37 / 106 specs (35%)** |
| `/verify` | `pick-flow`, `dev` | **6%** of implemented specs |
| `/architect` | `pick-flow` | **9%** |
| `/generate-tests` | `pick-flow` | **6%** |
| `ship-gates.sh` at close time | `ship.md:51` prose | **0 call sites in the closing code** |
| Worktree cleanup | last step of `cmd_ship` | only on a fully successful ship |

Anthropic's own AI-native SDLC playbook (21 Aug 2026) states the mechanism directly:
*"A skill is a control, though an advisory one… nothing forces a session to comply
with it. A policy that must always hold needs something deterministic behind the
skill, such as a hook that blocks the action."*

The consequence is that finished and unfinished work are indistinguishable at the
end. Scored against `ship-gates.sh`'s own gate 2.5 **at the moment of each close**,
**15 of 18 co-located closes (83%)** and **at least 19 of 40 sampled ordinary closes
(≥48%)** would have been refused had the gate run. One spec sits in `features/done/`
stamped `all-done` while its own body reads *"PARKED — the decided architecture was
never built."* Another was a live security spec marked complete.

**Correction, recorded because the first draft got it wrong.** This table first
reported the framing rule at **4% (38/981)** — a denominator including ~892 specs
created before the rule existed (it entered `create-spec.md` on 2026-08-26,
`4f0d981e9`). Split at that date: **1% before, 35% after**. The rule is nine days old
with rising adoption, not a dead letter, and this row is the weakest in the table.
The same defect class — scoring against a population that predates the thing measured —
was the error corrected twice elsewhere in this investigation.

**Question:** What is the smallest deterministic layer that makes the existing
controls actually bind?

> Founder framing, verbatim: *"now I do need to control my agents. I need to see
> which worktrees are there, are they closed, are the specs finished."*

> And on the worktrees specifically: *"I honestly don't even want to think about
> them. Why would I think about them? They should be automatically happening within
> ship or finish or whatever, and done."*

**This defect has been correctly diagnosed three times in eight days and never
fixed** — [decisions.md](../docs/decisions.md) 2026-08-27, 2026-09-01 and 2026-09-04.
The first two both ended in a discipline rule and both recurred. A fourth discipline
entry is not worth writing.

**Why the prior spec sat.** [p931](p931_ship_phase2b_coclose_false_close.md) was filed
2026-06-11 with a correct root cause and a correct fix approach, at
`severity: medium`, `status: backlog`. The founder triaged it from that label and it
has not moved in three months. The severity was wrong, not the triage — a defect that
silently marks security specs complete at an 83% wrong rate is not medium. **Re-triage
p931 as part of this work.**

## Appetite

**Blast radius: high** — every close, every worktree, every spec creation. A gate wired
wrong blocks all shipping.
**Reversibility: medium** — hook configuration and scripts revert cleanly; no data
migration. But a gate that wrongly blocks costs a session each time.
**Decision density: two founder calls**, both named inline below.

## Invariants

- **A control that must always hold is enforced by the harness, not by prose.** Adding
  an instruction to a skill file is not a fix for this class — that is the defect.
- **Every gate fails closed.** Unreadable spec, missing script, unresolvable branch →
  deny. `detect_cospecs` already sets this precedent (P1105).
- **No gate reads `status:`.** [features.md](../.claude/rules/features.md): *"no skill,
  script or hook may gate a merge, a close or a deploy on this field."*
  `git-ops.sh:2240-2249` violates this today; the fix removes the violation.
- **No override is writable by the agent being gated.** The repeated failure in this
  repo is a bypass the gated party can type — `inline` in gate 2.5, the hand-written
  review stamp. Any escape hatch must be auditable and out of the agent's reach.

## Solution

Build the deterministic layer out of Claude Code's native blocking hooks, which the
repo already uses correctly in two places (`verify-before-stop.py`,
`verify-screenshot-before-reedit.py`) and nowhere in the pipeline.

Verified available (`code.claude.com/docs/en/hooks.md`):

| Hook event | Blocks | Use here |
|---|---|---|
| `TaskCompleted` | *"Prevents the task from being marked as completed"* | Run `ship-gates.sh`; refuse completion on failure |
| `WorktreeRemove` / `WorktreeCreate` | Yes | Detect and report strandings |
| `Stop` | Yes | Already proven in this repo |
| `PreToolUse` | Yes (`permissionDecision: deny`) | Guard the close path itself |

Four gates, one mechanism:

1. **Closure gate.** `ship-gates.sh` runs from the closing path, not from prose. Covers
   all three close routes — named, direct-to-main, and Phase 2b co-located, which today
   runs no gate at all.
2. **Cleanup gate.** Cleanup runs even when the ship sequence fails earlier, and a
   stranded worktree is reported without the founder asking.
3. **Step-ran gate.** Hooks read the session transcript — the repo's own
   `_transcript_lib.py` already does exactly this — to check a required prior step ran.
4. **Intent gate.** A spec created from a conversation must carry the founder's verbatim
   framing. This is mechanically checkable and requires nothing new from the founder:
   the agent already reads the conversation; only the check is missing.

**Also in scope:** remove the `status:` gating at `git-ops.sh:2240-2249`, and adopt
`claude plugin eval` as a merge check on any change to `CLAUDE.md`, skills or hooks —
confirmed available on this machine, with a built-in no-plugin baseline arm. Approved
by the founder this session.

**[FOUNDER DECISION: what does the override look like when a gate blocks legitimate
work?]** At least 48% of historical closes would fail today, so a hard gate with no
escape blocks work on day one. The escape must be auditable and not agent-writable —
its shape is a product call about how much friction is acceptable.

**[FOUNDER DECISION: may a gate block *you*, not only agents?]** If not, the layer can
only advise the founder while binding agents, which is a different design and should be
settled before building.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Gates block legitimate work on day one (≥48% historical failure rate) | MITIGATE | Required: run the repo's own documented workflows through each gate and measure false positives before shipping — [epistemic.md](../.claude/rules/epistemic.md) gate 7c |
| "Would fail gate 2.5" over-counts non-delivery — a finished spec can carry a stale unticked line | ACCEPT | The gate's job is to force the question. The override absorbs this |
| The override becomes the new self-attestation hole | MITIGATE | Named as an invariant above and as a founder decision |
| Agent teams are documented as sometimes failing to mark tasks complete | MITIGATE | The hook is load-bearing; the task list is not. Gates must not assume the task list is reliable |
| `TaskCompleted` ignores `continue: false` when a task update triggered it | ACCEPT | Exit code 2 still blocks; use the exit code, not the JSON form |
| Founder framing quoted in a spec may carry personal context | MITIGATE | Specs are public; the existing privacy gate and [pii.md](../.claude/rules/pii.md) apply to the quoted line like any other |
| Enforcing steps that don't earn their place | DEFER | Of two skills benchmarked, one showed no measurable advantage and one was void. Evals (in scope) measure this; deleting skills is not this spec |

**Non-Goals**

- **Do NOT adopt an off-the-shelf orchestrator.** Surveyed this session; decided against.
  Nothing in a ~450-tool census models "done", and none preserves the founder-decision
  markers or epistemic gates. Conductor solves worktree ergonomics only.
- **Do NOT add a new manual step, artifact folder, or `create-intent` command.** The
  intent capture already exists in `create-spec`; only its check is missing. The founder
  must not have to remember anything new.
- **Do NOT delete or rewrite `/dev`, `/architect` or `/adversarial-review` on current
  evidence.** The `/dev` A/B was declared **void**, not lost; `/architect` has never been
  benchmarked. Evals settle this later.
- **Do NOT fix `detect_cospecs`' set arithmetic.** [p931](p931_ship_phase2b_coclose_false_close.md)
  owns it. Wire the gate into Phase 2b here; leave the detection logic there.
- **Do NOT edit `.claude/commands/slava/build/*.md` while the concurrent session holds
  them.** Sequence or coordinate.

## Alternatives Considered

- **A richer machine-checkable spec format.** Rejected — evidence refuted it. A spec was
  closed carrying four unticked criteria and no implementation record; a better format
  would have sat in the same place, equally unread.
- **Fix the co-located auto-close alone.** Rejected — it is worth ~35 points on top of an
  ungated baseline that still fails at ≥48%.
- **Discipline rules.** Rejected — tried three times in eight days, recurred each time.
  Two of the nine known false closes were caused by the *repair* of a previous false
  close, which no discipline rule reaches.
- **Adopt Anthropic's artifact chain wholesale.** Partially adopted (intent capture) and
  otherwise rejected: verified against the primary source, the chain has **no mechanism**
  checking that a spec satisfies its intent — that check is a human answering a prose
  question — and it never mentions cleanup or skip detection. It also assumes distinct
  role-holders, which a solo founder does not have.
- **Buy (Conductor, gastown, spec-kit).** Rejected this session. Two structural ideas
  from gastown are worth stealing without adopting it: the implementer may not close its
  own work, and the reviewing task is dependency-blocked and carries no memory of the
  implementation.

## Rollback Strategy

Hook configuration and scripts; `git revert` restores prior behaviour with no data
migration. Gates only ever *refuse* closes, so a revert cannot corrupt state a gate
created. The `status:` removal at `git-ops.sh:2240-2249` is the one change that alters
which closes *succeed* — revert it together with the wiring, never alone.

## Done-When

- [ ] `ship-gates.sh` is invoked from the closing code on all three close routes, shown
      by call sites in `git-ops.sh` (or a hook it cannot bypass)
- [ ] A spec with an unticked completion box cannot be closed — the `p1043` case replayed
      against the new code, with the non-zero exit pasted
- [ ] Phase 2b refuses to close a co-located spec that fails the gate, shown on a fixture
- [ ] A ship that fails before cleanup leaves no stranded worktree, **or** the stranding
      is reported without anyone asking — demonstrated by killing a ship mid-sequence
- [ ] A spec created from a conversation without the founder's verbatim framing is
      refused, with the exit code pasted
- [ ] `git-ops.sh` no longer reads `status:` to decide whether a close may proceed
- [ ] The `p1113` case replayed: a spec whose frontmatter reads `status: done` with work
      on main can be closed rather than dying
- [ ] Every gate's **failure path** exercised with a pasted exit code — unreadable spec,
      missing script, unresolvable branch (epistemic gate 7)
- [ ] **False-positive pass:** the repo's own documented ship and dev workflows run
      end-to-end against the wired gates and still complete. Name which were run
      (epistemic gate 7c)
- [ ] `claude plugin eval` runs as a merge check on changes to `CLAUDE.md`, skills or
      hooks, with the threshold and baseline arm recorded
- [ ] Both founder decisions above recorded in this spec
- [ ] `p931` re-triaged to a severity matching its measured impact

## Open Questions

1. Does the override belong per-gate or once globally? → changes whether one bypass
   defeats everything.
2. Should the intent gate apply to bug specs, where the problem is an observed symptom
   rather than a stated intent? `/create-bug` deliberately skips `/problemify` for this
   reason.

## Related

- [p931](p931_ship_phase2b_coclose_false_close.md) — owns the co-located detection logic.
  Filed 2026-06-11, never implemented, still at `severity: medium`.
- [p1211](p1211_frontend_ships_ahead_of_its_migration_with_no_gate.md) — the same defect
  one gate over; its Done-When already asks that a step be *"enforced by `ship-gates.sh`
  (or the hook), not by prose an agent may skip."*
- [p1040](p1040_ship_gates_accept_matching_review_type.md) — gate 2.7 review-type
  matching; presupposes the gate runs.
- `docs/decisions.md` 2026-09-04, 2026-09-01, 2026-08-27 — the three discipline-only
  rulings this spec replaces.
