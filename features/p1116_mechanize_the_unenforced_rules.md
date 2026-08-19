---
status: week
type: task
rank: 48.0
created_date: '2026-08-19'
tags: [claude-md, rules, hooks, mechanization, instruction-layer]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1116: Mechanize the rules that were measured not firing

## Problem

**Situation:** Spec B of three from the 2026-08-14/16 instruction-layer review (A = P1113,
shipped 2026-08-19; C = the structural re-scope, still queued). The always-on instruction
layer is ~807 lines loaded in the large majority of sessions and re-paid on every
compaction. Most of it is *advisory*: rules an agent must read, recall at the right moment,
and choose to follow.

**Complication:** Three independent measurements say that layer is not binding.

- `docs/decisions.md` 2026-08-13 [process]: a CLAUDE.md routing line fired **0 of 30**
  literal triggers over 91 days. A control on the identical probe returned `/ship` 73,
  `/kdd` 71, `/dev` 55 — the counter works; the zeros are real.
- The 2026-08-14 session-log review: "where are we" typed **75 times across 38 sessions**
  and "which model / effort" **14 times across 12** — both with an always-on rule telling
  the agent to pre-empt exactly that.
- The same review: **12 wrong absence claims** in 28 days, against *two* always-on rules
  forbidding them. A parallel review sharpened the mechanism — the agent **did** grep, but
  grepped the wrong token (searched `AlertDialog`, missed the existing `ConfirmDialog`).
  A gate that can be satisfied while committing the error it names is worse than none: it
  manufactures confidence.

The repo has already proven the remedy twice. `.claude/hooks/block-pw-tail-pipe.sh` exists
because a rule in `.claude/rules/tests.md` was violated **twice** despite being written
down; its header says so. `~/.claude/hooks/decision-brief.sh` was built the day the 0/30
was measured, and reaches ~95.8% recall on the same asks the rule missed.

**Question:** Which advisory rules can become mechanisms, and how do we prove each one
actually fires rather than merely existing?

## Appetite

Medium blast radius: hooks intercept real tool calls, so an over-broad matcher blocks
legitimate work. Reversible (delete the hook / unregister it). Low decision density — the
technique is established in this repo; only the match patterns are new.

## Solution

Three groups. **Every hook in this spec carries the same proof obligation** (epistemic gate
7): it is not trusted until it has been *watched to fail* — trigger the forbidden input,
paste the non-zero exit or the injected output. "Installed" is not evidence. A hook that
silently never fires is indistinguishable from a hook with nothing to catch.

1. **Refuse the banned git commands at call time.** `.claude/rules/git.md` spends ~190
   always-on lines describing commands that must never run; exactly one of them
   (`branch-guard.sh`) is enforced, and via pre-commit rather than at the point of use.
   Extend the existing PreToolUse Bash hook pattern to refuse the commands listed in that
   file's banned-commands table: the stash, the bare add-everything forms, the forced-add,
   the argument-less index reset, the revert-to-HEAD pair, force-push to main, and the two
   verification-skipping flags. Once refused mechanically, the prose describing them shrinks
   to a pointer, and the freed lines leave the always-on layer (the removal itself belongs
   to spec C).

2. **Fire the routing rules that don't fire.** Extend `~/.claude/hooks/decision-brief.sh`
   (or add a sibling) with triggers for the three measured misses: "where are we / what
   now / are we done" → `/status`; "which model / which effort" → the model-effort call;
   "opus or sonnet / do we need adversarial review" → `/pick-flow`. Also the unmeasured but
   frequent fourth: "should we compact / plan mode / use subagents" (60 occurrences), which
   has no rule at all today.

3. **Validate that every `/command` named in an instruction file exists.** The root-cause
   fix for the dead-pointer class. P1113 remapped a routing line after its target had been
   archived; nothing would have caught it, and nothing today prevents the next one. A check
   over `CLAUDE.md` + `.claude/rules/*.md` that resolves each referenced command against the
   command tree, wired into `pre-commit-checks.sh`.

## Risks / Non-Goals

### Risks
- **Over-blocking is the main failure mode, and it is not hypothetical.** While this very
  spec was being written, the existing push-guard hook refused the write — because the
  spec's *prose* contained a forbidden command as quoted text. The hook matched the word,
  not the command. Every matcher here must distinguish a real invocation from a mention of
  one, and must not catch near-misses (an add of a specific path is not an add of
  everything). Mitigation: `block-pw-tail-pipe.sh` already solved this exact shape ("Match
  the run, not the word") — copy its approach, and give every matcher an explicit allow-list
  of near-miss cases proven by test. The incident above is the canonical test case.
- **A hook that never fires looks like success.** Mitigation: the proof obligation above,
  per hook, pasted in the commit.
- **Group 2 edits a file outside this repo.** `~/.claude/hooks/decision-brief.sh` is global
  and not version-controlled here, so changes are invisible to cp's history and to other
  machines. Mitigation: state this in the commit; back the file up before editing.
- **Contract duplication.** The decision-brief *contract text* exists in five copies across
  two repos and has already drifted once (five days of banned vocabulary). Mitigation: this
  spec adds **triggers only** — if any contract wording changes, all five copies must move
  together, and copy 5 (`verify-before-stop.py`) is normative.
- **Blocking hooks can strand a session.** A wrong refusal with no override leaves the agent
  unable to proceed. Mitigation: every refusal message names the sanctioned alternative.

### Non-Goals
- Do NOT remove any prose from `CLAUDE.md` or `.claude/rules/` in this spec. Mechanize
  first, prove it fires, remove second — removal is spec C. Deleting the prose in the same
  change would leave no guarantee during the window where the hook is unproven.
- Do NOT re-scope any rules file from `globs: "*"` to path-scoped — spec C.
- Do NOT change the decision-brief contract wording — triggers only.
- Do NOT add a new advisory rule anywhere. If the answer to a gap is "write a rule telling
  the agent to remember," this spec is the wrong home for it.
- Work on `main`, NOT in a worktree: a hook edited in a worktree is not the hook that runs,
  so every test would pass against a file that never executes (same reasoning applied in
  P1113).

### Alternatives Considered
- **Add prose rules instead** — rejected on the measurement: the 2026-08-16 parallel review
  proposed exactly this for the model-effort gap, and the rule it proposed strengthening is
  one of the three measured as under-firing.
- **One mega-hook** — rejected: a single matcher over many patterns fails as a unit and is
  harder to prove per-case.
- **Do groups 1-3 in separate specs** — rejected: they share one proof technique and one
  registration surface; splitting triples the setup for no isolation benefit.

### Rollback Strategy
Each hook is a standalone file plus one registration entry. Remove the entry (or the file)
and behavior returns to today's advisory state. No data, no migration. Prose is untouched by
design, so nothing is lost if every hook is reverted.

## Done-When

- [ ] Each new hook has been **watched to fail**: the forbidden input was submitted and the
      refusal (or injection) is pasted in the commit message or spec. No hook is marked done
      on "installed"
- [ ] Each git matcher has at least one proven near-miss that is NOT blocked, and one proven
      *mention* that is not blocked — a document or commit message quoting the command must
      pass, per the incident recorded in Risks
- [ ] Every refusal message names the sanctioned alternative
- [ ] The three measured routing misses fire on their real recorded phrasings, sampled from
      the transcripts that produced the 75 / 14 / 33 counts — not on invented test strings
- [ ] The command-existence validator fails on a deliberately broken pointer, and passes on
      `CLAUDE.md` as it stands after P1113
- [ ] `./scripts/pre-commit-checks.sh` passes with the validator wired in
- [ ] No prose removed from `CLAUDE.md` or `.claude/rules/` (verify: `git diff --stat` shows
      no deletions in those paths)

## References

- `docs/decisions.md` 2026-08-13 [process] — the 0/30 measurement, its control, and the
  decision to fix mechanically rather than by adding a rule.
- P1113 (shipped 2026-08-19) — spec A; the contradictions fix, and the gate's finding that
  its routing-line edit was symptom-level with the root cause routed here.
- `.claude/hooks/block-pw-tail-pipe.sh` — the in-repo precedent, including its
  match-the-run-not-the-word technique and its "second violation despite the rule" header.
- `.claude/rules/epistemic.md` gate 7 — a gate you have not seen FAIL is unproven.
- Instrumentation: `~/.claude/instructions-loaded.log` — which instruction files load, and
  how often the always-on set is re-paid on compaction.
