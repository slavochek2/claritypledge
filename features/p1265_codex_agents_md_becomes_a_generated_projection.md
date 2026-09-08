---
status: backlog
type: task
rank: 1000074
workstream: infrastructure
created_date: '2026-09-08'
tags: [infrastructure, multi-agent, codex, skills]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: anomaly
---

# P1265: Shared policy reaches other harnesses by generation, not by pointing — measured

**Continues [P1247](p1247_harness_agnostic_contract_2_has_no_gate.md), Phase 2 onward.** P1247
closed with only Phase 1 done (contract 2's canary split by tier, Tier A wired to the commit
path) — split off because `/ship`'s completion gate checks every `## Done-When` box in one spec,
and mixing all four phases in one Done-When list would have blocked shipping Phase 1
indefinitely. **Read P1247 in full before starting this spec** — its Problem, Invariants, and
Review Record sections carry the background (the three-contract architecture, why contract 2
drifted, the canary's own fail-open bug and how it was fixed) that this spec assumes without
restating.

## Problem

**Measured 2026-09-04, after two hostile reviews — these three results decide the design.** Using
Codex's own assembled-prompt oracle (`codex debug prompt-input`), which reports what the model
actually receives rather than what the filesystem contains:

| Question | Result |
|---|---|
| Does Codex expand a pointer/include in `AGENTS.md`? | **No.** `@file`, `./file`, `@./file` all tried; the adapter's own marker appears, the pointed-to file's marker does not |
| Does Codex layer global `~/.codex/AGENTS.md` with a project `AGENTS.md`? | **Yes, natively** — both markers present, no configuration |
| Is there a size limit, and is it silent? | **Yes and yes.** A 54,598 B file keeps markers through ~33.5 KB and drops everything past ~36.3 KB, with no warning. cp's real 25,428 B `AGENTS.md` survives intact — the cap is per-file, ~32 KiB, and cp is at **78%** of it |

**This kills the pointer shape.** Prose naming a file is a request the agent may decline; nothing
loads it. But Codex's directory-tree layering *is* a native include, so shared policy reaches it
by being **generated into** each harness's own `AGENTS.md` — the closed-world projection mechanism
of contract 1 (`.agents/skills/`), which is already proven and gated in this repo (0 drift across
125 skills). Generation, not pointing.

`~/.dsh/AGENTS.md` (seven lines, zero drift since creation) remains **untested** for whether DSH
actually reads what it points at — it is a shape reference, not proof. `~/.gemini/GEMINI.md` could
not be tested (the Gemini CLI refused on an invalid API key) and is seven months stale, actively
contradicting current rules (it directs the agent to prefer Chrome DevTools MCP with Playwright as
backup). Neither may be converted until each is measured the same way Codex was.

`.claude/rules/*.md` totals **123,005 bytes** against roughly **7 KB** of remaining headroom in the
~32 KiB per-file channel that truncates silently — measured, not inferred. Projecting the rules
verbatim is therefore impossible, and there is no include mechanism to escape it. The only
workable form is a short curated **hard-stops block** carried in the generated shared policy: the
non-negotiables that must hold in any harness (never push or deploy unasked, never install
unasked, stop at a CAPTCHA, the banned destructive git commands). Everything else stays
Claude-only and says so. `codex-review` — the adversarial reviewer this repo leans on, cited
throughout `decisions.md` — currently runs without the git firewall or the epistemic gates, both
of which live under `.claude/rules/`.

pp projects via symlinks — the shape P1157 replaced because a harness did not discover them — and
carries two divergent copies of one skill (`fix` symlinked at 7672 bytes,
`source-command-pp-fix` a real 7313-byte fork, both stamped 2026-08-28 14:39). ladischenski-com has
an `AGENTS.md` symlink and no projection at all. sbx-demo's `AGENTS.md` is an empty regular file,
not a symlink.

## Appetite

**Blast radius:** high — contract 2 governs the instruction layer every non-Claude harness reads,
including the reviewer that gates shipping. **Reversibility:** high in principle, but **three of
the touched directories are not version controlled** (`~/.codex`, `~/.dsh`, `~/.gemini` — verified
2026-09-04; `~/.agents` and `~/.claude` are repos), so reversibility depends on a timestamped
backup taken before each edit, not on `git revert` alone. **Decision density:** one real founder
call (Q1 below).

## Invariants

Carried forward from P1247 — read that spec's `## Invariants` section in full. Restated here only
because this spec's own Done-When cites them directly:

- Deliberate adapter divergence must remain expressible and asserted (P1247 Invariant 1).
- A harness must be able to read the shared policy with no loader of ours (P1247 Invariant 2).
- `.agents/skills/` is a generated projection and is never hand-edited (P1247 Invariant 3).
- A structural assertion is never accepted as a runtime one — every "harness obeys this rule" claim
  needs a fresh-session behavioral canary (P1247 Invariant 4).
- Every assertion fails closed on a missing input (P1247 Invariant 5).

## Solution

**Phase 2 — convert the fork into a generated file.**
Reduce `~/.codex/AGENTS.md` to adapter-local content plus shared policy, on the pattern
`.agents/skills/` already proves. Extract the shared half into `~/.agents/` alongside the routing
and history-store files already there. Same treatment for `~/.gemini/GEMINI.md` if it measures the
same way. `~/.codex/AGENTS.md` becomes a **generated file**: shared policy from `~/.agents/` plus
its own adapter-local section, emitted by a closed-world writer with the same never-hand-edit
contract as `.agents/skills/`. Drift then becomes structurally impossible rather than merely
detectable, which is the whole point.

**Every harness must be measured before conversion, with the harness's own assembled-prompt oracle
— never with a file check.** Codex: done (above). DSH and Gemini: not done; `~/.dsh/AGENTS.md` is a
shape reference and has never been tested for whether DSH reads what it points at, and the Gemini
CLI could not be exercised. A harness with no oracle does not get converted.

**Budget the generator in bytes.** The target is a ~32 KiB per-file cap that truncates in silence;
cp is at 78% of it today. The generator must fail loudly when its output would exceed the cap — a
silent cut here removes rules while every structural check stays green.

**Phase 3 — resolve the rules-layer reach.** See Q1. Either project `.claude/rules/*.md` (in the
curated hard-stops-block form the Problem section above narrows this to) so non-Claude harnesses
receive them, or state in `AGENTS.md` that they do not apply outside Claude Code and accept the
reviewer running without them. Both are defensible; shipping neither is not.

**Phase 4 — close the projection inconsistency in the other repos.** pp, ladischenski-com, and
sbx-demo (see Problem section for current state of each) each need either a real generated
projection or an explicit "no skills here" `AGENTS.md` — sbx-demo's empty regular file is wrong
either way.

**Add the missing pointer in cp.** `grep -niE "AGENTS\.md|\.agents/|harness|codex" CLAUDE.md`
returns zero matches, so no agent can learn from the instructions that the projection exists —
which is the mechanism behind the 2026-09-03 mirror incident.

**Teach the rule-writing gate about the shared file.** `/slava:maintain:claude-md` has repo
profiles for `cp/`, `pp/`, `bankruptcy_2026/` and `~/.claude/CLAUDE.md`, and none for any
`AGENTS.md`. Every rule written through the gate therefore lands in the Claude-only file by
default. This is the mechanism that produced the drift P1247 Phase 1 measured, and leaving it
unchanged guarantees recurrence regardless of what else ships.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A harness never actually follows the pointer/generated file, so policy silently stops applying | MITIGATE | A behavioral canary (directive present only in the shared file, observed taking effect in a fresh session) is a precondition for removing any content; no canary, no conversion |
| A dangling `AGENTS.md` symlink is silent — a reviewer measured `codex debug prompt-input` exiting 0 with a prompt still built and nothing on stderr | MITIGATE | The oracle reads the harness's own assembled prompt, not the filesystem. A `diff` cannot see this and neither can an existence check |
| Instruction files are silently truncated at ~32 KiB — measured: markers past the cut vanish with no notice | MITIGATE | Budget in **bytes**, not lines. `cp/CLAUDE.md` is already 25,428 B (77%); cp's own guard counts lines and would not catch this |
| The new pointer/generation-shape assertion false-positives on legitimate adapter-local content | MITIGATE | Epistemic gate 7c — run the existing per-harness files through any new assertion and confirm each still passes before shipping it. P1247 Phase 1's fixture-harness pattern (`scripts/test-multi-harness-routing-tierA-fixtures.sh`) is the reference shape |
| Collapsing shared policy re-introduces the rejected universal-table design | MITIGATE | Invariant 1; the canary's existing roster/quota assertions must keep passing |
| Projecting `.claude/rules/` is real work that may buy nothing | DEFER | Blocked on Q1 — do not build it before the answer |
| Editing global files under `~` is outside the repo and unreviewable by cp's gates | MITIGATE | `~/.agents` and `~/.claude` are git repos — commit there. **`~/.codex`, `~/.dsh` and `~/.gemini` are NOT versioned** (verified), so each needs a timestamped backup copy taken before it is touched and named in this spec's evidence |
| Reverting the shared file while a pointer/generated file still targets it silently empties that harness's policy | MITIGATE | Two-phase order: add shared file and prove the canary before removing any adapter content; on rollback, restore adapter content before removing the shared file |

**Non-Goals**
- Do NOT re-open the direction of truth for cp's skill projection. Contract 1 measures 0 drift; it
  is the control case, not a problem.
- Do NOT unify model rosters, quota sources or executor selection into the shared file. Explicitly
  rejected 2026-08-25.
- Do NOT hand-edit anything under any `.agents/skills/` tree; regenerate.
- Do NOT change Claude Code's native hooks or its Opus-specific preference — both are asserted as
  correct by the existing canary.
- Do NOT rewrite the rules files themselves. This spec moves and points at them; it does not
  re-author their content.

## Done-When

- [ ] `diff` of shared-policy rules between `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` returns
      empty, or returns only lines the canary asserts as deliberately harness-local
- [ ] `grep -n "Codex --help\|Codex-guide" ~/.codex/AGENTS.md` returns nothing
- [ ] For each harness converted: a fresh-session behavioral canary shows a directive present only
      in the shared file taking effect in that harness. A harness that fails this canary is NOT
      converted, and the spec records which mechanism it got instead
- [ ] `~/.codex/AGENTS.md` and `~/.gemini/GEMINI.md` (if converted) each carry the shared policy via
      generation rather than restating it by hand; a rule added to the shared file changes both
      harnesses' behavior without a second edit — verified behaviorally, not by reading the files
- [ ] Q1 answered and the chosen branch implemented — either the rules reach non-Claude harnesses,
      or `AGENTS.md` states in one sentence that they do not
- [ ] pp projects through the same generator cp uses, and its two divergent `fix` copies resolve to
      one; `ls pp/.agents/skills | grep source-command` returns nothing
- [ ] cp `CLAUDE.md` names `.agents/skills/` as generated-never-hand-edited in ≤3 lines, within the
      350-line budget
- [ ] `/slava:maintain:claude-md` has a repo profile for the shared policy file, and routes a
      cross-harness rule there rather than to `~/.claude/CLAUDE.md`
- [ ] `~/.agents` carries a commit for every change made under it — nothing left only on disk

## Open Questions

1. **[FOUNDER DECISION] — narrowed by measurement to one workable shape.** `.claude/rules/*.md`
   totals **123,005 bytes** against roughly **7 KB** of remaining headroom in a per-file ~32 KiB
   channel that truncates silently. Projecting the rules is therefore impossible, and there is no
   include mechanism to escape it — both measured, not inferred. The only workable form is a short
   curated **hard-stops block** carried in the generated shared policy: the non-negotiables that
   must hold in any harness (never push or deploy unasked, never install unasked, stop at a CAPTCHA,
   the banned destructive git commands). Everything else stays Claude-only and says so.
   **The remaining call is yours and is only: which rules earn a place in that block.** Proposed
   starting set above; nothing is built until you name it. The git firewall
   and the epistemic gates live there, and `codex-review` — the adversarial reviewer this repo
   leans on, cited throughout `decisions.md` — currently runs without them. Projecting them is real
   work; the honest alternative is one sentence in `AGENTS.md` saying they are Claude-only. Both
   are defensible. Not answerable from the code.
2. Should ladischenski-com and sbx-demo get projections at all, or is `AGENTS.md` alone correct for
   repos with no skills of their own? sbx-demo's empty regular `AGENTS.md` is wrong either way.

## Alternatives Considered

**Re-sync the forked files and move on.** Rejected: this is the third occurrence of the same
divergence, and re-syncing restores the state that decays. It leaves the operator holding a
recurring manual obligation that has already been missed twice.

**Give the Codex fork its own gate that diffs it against the Claude file.** Rejected: a diff gate
must encode which divergences are legitimate, so it becomes a second hand-maintained list of
exceptions — the same failure one level up. The generated-file shape has no exception list because
there is nothing to diverge.

**Make `~/.claude/CLAUDE.md` the shared file and point Codex at it.** Rejected: it is Claude's own
adapter, carrying the Opus session-start check and the Claude quota path that the 2026-08-25 ruling
requires stay harness-local. Pointing another harness at it re-imports exactly what P1157 removed.

**Invert cp to match global (`.agents/` as source, `.claude/` as symlinks).** Rejected for now: cp's
direction is gated and measures 0 drift across 125 skills. Changing the one layer that works, to
match layers that do not, is not supported by any evidence in this spec.

**Build the pointer shape P1247 originally proposed (`~/.dsh/AGENTS.md` pattern).** Rejected by
measurement, not preference: Codex does not expand a pointer/include — see Problem section. A
pointer only works for a harness that natively layers or includes; Codex's directory-tree layering
qualifies it for generation, not pointing.

## Rollback Strategy

Each phase is independently revertible. This spec's changes replace file contents under `~`, and
**three of those directories are not version controlled** — `~/.codex`, `~/.dsh`, `~/.gemini`
(verified 2026-09-04; `~/.agents` and `~/.claude` are repos). Their pre-change contents are
recoverable only from a timestamped backup taken before the edit, so that backup is a precondition
of the phase, not a courtesy. Order matters in both directions: the shared file is added and proven
before any adapter content is removed, and on rollback adapter content is restored before the
shared file is withdrawn — otherwise a harness is left pointing at nothing, which reads as "no
rules" rather than as an error. Phase 4 touches pp and ladischenski-com independently of cp.

## Related

- [P1247](p1247_harness_agnostic_contract_2_has_no_gate.md) — Phase 1 (canary tier split, Tier A
  wired to the commit path), shipped separately; this spec's problem framing, invariants, and
  review history live there
- [P1151](done/2026-06-10/p1151_universal_multi_harness_architecture.md) — established the
  architecture; superseded where it inferred runtime behavior from structure
- [P1157](done/2026-06-10/p1157_make_multi_harness_projection_runtime_correct.md) — established the
  three contracts and built contract 2's canary
- [P1163](p1163_orphaned_skill_sweep.md) — orphaned *skills*; contract 2's canary was an orphaned
  *gate*, the same shape one layer up
- [decisions.md](../docs/decisions.md) 2026-08-25 (three contracts) · 2026-09-03 (projection is a
  mirror)

## Review Record

This spec's content (Problem, Solution phases 2-4, Risks, Alternatives, Rollback Strategy, Open
Questions) is carried forward verbatim from
[P1247](p1247_harness_agnostic_contract_2_has_no_gate.md), which was filed 2026-09-04 and
adversarially reviewed by two independent reviewers (Codex, Opus) before any implementation — see
that spec's own Review Record for the full history. No new review has run against this spec as a
standalone artifact; the content has not changed since that review, only which file it lives in.
Re-review is recommended before Phase 2 implementation starts, since a spec split is itself a
structural edit worth a fresh pass.
