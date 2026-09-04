---
status: week
type: task
rank: 1000073
workstream: infrastructure
created_date: '2026-09-04'
tags: [infrastructure, multi-agent, codex, skills]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1247: Shared policy reaches other harnesses by generation, not by pointing — measured

## Problem

**Situation:** [decisions.md](../docs/decisions.md) 2026-08-25 settled multi-harness support as
**three separately verified contracts**: (1) one canonical skill source with a closed-world
projection writer, (2) a vendor-neutral capability policy mapped by harness-specific adapters,
(3) native lifecycle hooks on each harness's documented event schema. Contracts 1 and 3 each got
a pre-commit gate — `pre-commit-checks.sh:1689` runs `sync-agent-skills.sh --check`, and `:1704`
runs `test-codex-native-hooks.sh`. Contract 2 got a canary too, `scripts/test-multi-harness-routing.sh`,
and **it is deliberately not wired to any caller** — recorded in
[P1221](done/2026-06-10/p1221_repo_structure_cleanup_and_order_gate.md):103-110 as
*"REAL CHECK, NOT wired, NOT archived — deliberate"*, for two reasons that are still true: it
makes a live `dsh` call, so wiring it puts network and spend on every commit in the repo; and
most of its 31 assertions read per-machine files under `$HOME` that no CI runner or second
machine has. P1221 named the actual work — *"Wiring it needs a decision about splitting the
repo-only assertions from the live ones"* — and scoped it out. **That split is this spec.**

**Complication:** Contract 2 is the only one that has drifted, and it drifted in the layer that
carries the safety rules. Measured 2026-09-04:

| Contract | Gate | State |
|---|---|---|
| 1 — skill projection | `pre-commit-checks.sh:1689` | 125 skills, **0 drift at commit time** |
| 3 — native hooks | `pre-commit-checks.sh:1704` | passes |
| 2 — policy + adapters | **zero callers, by decision** | **29 passed, 2 failed**; instruction layer forked |

**The gate is not the discriminator — version control is.** Adversarial review named the confound
and it holds: contracts 1 and 3 assert against subjects that live **in git** (`.claude/commands/`,
`.codex/hooks/`), so they get diff, review and CI *and* can be gated. Contract 2 asserts mostly
against `~/.claude`, `~/.codex`, `~/.dsh` — of which **only `~/.claude` and `~/.agents` are
repos** (verified). Unversioned files have no diff, no review, and no commit to hang a gate on.
Gate-absence and drift are not cause and effect; they are two symptoms of one cause. This makes the
Phase 1 split principled rather than arbitrary: **the assertions that can be gated are exactly the
assertions whose subject is in git.**

A gate also binds only at commit time, not continuously — contract 1's tree goes briefly
inconsistent between commits (observed mid-session by a reviewer, not reproducible once the
co-tenant's second stage landed). Claims here are about what **reaches a commit**, never about what
is momentarily true on disk.

`~/.codex/AGENTS.md` is a hand-maintained fork of `~/.claude/CLAUDE.md`, last touched 2026-08-26.
Against it, **two rules are wholly absent** — the 2026-09-03 "a probe whose effect lands outside
your tool output is not read-only" rule, and the 2026-08-28 "don't stop to report progress" rule.
**One rule is stale by two paragraphs** — "Enumerate dependents" is 1941 bytes there against 2707
in the Claude copy, missing the all-pass control case and the stored-oracle paragraph, both added
2026-08-28. **One rule cites tooling that does not exist** — line 47 instructs the agent to run
`Codex --help` and consult a `Codex-guide` agent, a find-and-replace scar the file's own header
admits to at line 6 and did not repair.

This is **not** the same as saying the two files should be identical. Three of the divergences are
deliberate and asserted by the unwired canary at lines 73-74: Codex correctly omits the Opus
session-start warning, correctly does not read Claude's quota, and correctly names its own
`~/.codex/hooks/block-prod-deploy.sh`. That is contract 2 working as designed. The defect is that
**nothing distinguishes designed divergence from decay** — the canary asserts two specific
absences and nothing asserts that everything else stays in step, and the canary does not run.

Codex is not a peripheral consumer. `~/.agents/bin/codex-review` clones the repo and runs
`codex exec` with the clone as cwd, so it reads `cp/AGENTS.md -> CLAUDE.md` on every adversarial
review this repo relies on — and the 18 files under `.claude/rules/`, which hold the git firewall
and the epistemic gates, are path-autoloaded by Claude Code alone and reach it not at all.

**Measured 2026-09-04, after the reviews — these three results decide the design.** Using Codex's
own assembled-prompt oracle (`codex debug prompt-input`), which reports what the model actually
receives rather than what the filesystem contains:

| Question | Result |
|---|---|
| Does Codex expand a pointer/include in `AGENTS.md`? | **No.** `@file`, `./file`, `@./file` all tried; the adapter's own marker appears, the pointed-to file's marker does not |
| Does Codex layer global `~/.codex/AGENTS.md` with a project `AGENTS.md`? | **Yes, natively** — both markers present, no configuration |
| Is there a size limit, and is it silent? | **Yes and yes.** A 54,598 B file keeps markers through ~33.5 KB and drops everything past ~36.3 KB, with no warning. cp's real 25,428 B `AGENTS.md` survives intact — the cap is per-file, ~32 KiB, and cp is at **78%** of it |

**This kills the pointer shape and replaces it.** Prose naming a file is a request the agent may
decline; nothing loads it. But Codex's directory-tree layering *is* a native include, so shared
policy reaches it by being **generated into** each harness's own `AGENTS.md` — the closed-world
projection mechanism of contract 1, which is already proven and gated in this repo. Generation, not
pointing. `~/.dsh/AGENTS.md` remains untested and `~/.gemini/GEMINI.md` could not be tested (the
Gemini CLI refused on an invalid API key); neither may be converted until each is measured the same
way.

**And the canary itself fails open, measured.** Its SKIP guard (`:22-24`) checks exactly four
files — `~/.agents/model-routing.md`, `~/.codex/model-routing.md`, `~/.dsh/model-routing.md`,
`~/.agents/bin/delegate-gemini`. But `:73-74` read `~/.codex/AGENTS.md`, which is **not** in that
list, and they use `absent()`, which is `grep -qEi … && bad || ok`. Run against the three controls
this repo's own rules require:

| Case | Result |
|---|---|
| real file, pattern genuinely absent | PASS (correct) |
| known-bad control — pattern present | FAIL (probe is not blind) |
| **file does not exist** | **PASS** |

So deleting `~/.codex/AGENTS.md` makes the two assertions that guard Codex's *deliberate*
divergences both report green. The instrument this spec proposed to promote into a gate has the
same defect the spec was written about.

**Question:** How does shared policy become structurally single-sourced, so that deliberate
adapter divergence stays expressible while decay becomes impossible rather than merely detectable?

> Founder framing, verbatim: *"we wanted to follow the harness agnostic thing but now I'm not sure
> we do do we do we need to rethink something about the process first and then reconsolidate"*

## Appetite

**Blast radius:** high — contract 2 governs the instruction layer every non-Claude harness reads,
including the reviewer that gates shipping. **Reversibility:** high; every change is a pointer, a
symlink, or a canary call, each `git revert`-able, with the forked files recoverable from their
current on-disk state. **Decision density:** one real founder call (Q1 below), plus one scoping
call already made in conversation (adopt the pointer pattern, not a re-sync).

## Invariants

- **Deliberate adapter divergence must remain expressible and asserted.** The 2026-08-25 ruling
  explicitly rejected "keep one universal model table" because it makes another harness's roster
  and quota look authoritative. Any mechanism here that collapses adapter-local content into the
  shared file re-introduces the rejected design.
- **A harness must be able to read the shared policy with no loader of ours.** Whatever the shared
  file is, it is plain text at a path a harness can be pointed at directly. No build step stands
  between a harness and the rules it must obey.
- **`.agents/skills/` is a generated projection and is never hand-edited or named as a target**
  ([decisions.md](../docs/decisions.md) 2026-09-03).
- **A structural assertion is never accepted as a runtime one.** That a file exists, resolves, or
  contains a pointer does not establish that any harness loads it. Every claim that a harness
  *obeys* a rule must rest on a fresh-session behavioral canary that observes the rule taking
  effect. This is the 2026-08-25 ruling — *"a config dump, model self-description, file shape, or
  nonempty tool output is never a substitute for a live canary"* — and the first draft of this
  spec violated it.
- **Every assertion fails closed on a missing input.** An `absent`-style check MUST assert the
  file exists before concluding anything from a non-match, and any file an assertion reads MUST be
  in the suite's own precondition list. A check that cannot distinguish "clean" from "gone" is not
  a check.

## Solution

Apply contract 2's own design to the instruction layer, which P1157 applied only to routing:
**shared policy lives once in `~/.agents/`; each harness's own file is a thin adapter that points
at it and carries only what is genuinely harness-local** (model roster, quota source, hook paths,
help command). `~/.dsh/AGENTS.md` is already exactly this — seven lines, zero drift since creation
— and is the working reference for the shape.

**Phase 1 — split the canary by what it touches, then gate only the repo-only half.**
This is the work P1221 named and deferred, not a wiring change. Assertion tiers below come from the
Opus review; **Tier A was re-verified against source by this session, Tiers B/C/D counts are the
reviewer's and are unverified**:

| Tier | Count | Touches | Commit path? |
|---|---|---|---|
| A | 2 (`:75`, `:126-132`) | repo files only — `.codex/config.toml`, `.codex/hooks/route-brief.sh` | **yes** |
| B | 19 (`:58-82`) | per-machine `$HOME` adapter files | no — machine-local check |
| C | 6 (`:113-123`) | executes `delegate-gemini`; no network **(inferred, not instrumented)** | no — machine-local check |
| D | 4 (`:87-110`) | **live `dsh`**, one a real prompt (`:93`) | **never** — separate integration run |

Tier A is exactly the coverage P1221 said archiving would lose — and, independently, exactly the
two assertions whose subject is in git. Tiers A/B/D were read off the source; **Tier C's
no-network property is the reviewer's inference and was not instrumented.**

**Fix the stale pin first (Open Question 2).** `:88`/`:100` pin a literal model version, so the
suite is red today for a reason unrelated to policy drift, and a routine `/slava:util:model-bump`
would re-break it. Assert the route and shape, not the version string, before anything is wired. Repair the fail-open while
splitting: extend the precondition list to every file any retained assertion reads, and make
`absent()` fail on a missing file. Then wire **Tier A only** to the commit path.

**Phase 1b — teach `/slava:util:model-bump` about this canary**, or make the canary version-blind
so it has nothing to teach. Today the bump skill and the assertion are unaware of each other, and
that is the mechanism by which a wired gate would fail on ordinary maintenance.

**Phase 2 — convert the fork into a pointer.**
Reduce `~/.codex/AGENTS.md` to adapter-local content plus a pointer to the shared policy, on the
`~/.dsh/AGENTS.md` pattern. Extract the shared half into `~/.agents/` alongside the routing and
history-store files already there. Same treatment for `~/.gemini/GEMINI.md`, which is seven months
stale and actively contradicts current rules (it directs the agent to prefer Chrome DevTools MCP
with Playwright as backup). **Superseded by measurement — do not build the pointer shape.** Codex does not expand includes,
so `~/.codex/AGENTS.md` becomes a **generated file**: shared policy from `~/.agents/` plus its own
adapter-local section, emitted by a closed-world writer with the same never-hand-edit contract as
`.agents/skills/`. Drift then becomes structurally impossible rather than merely detectable, which
is the whole point.

**Every harness must be measured before conversion, with the harness's own assembled-prompt oracle
— never with a file check.** Codex: done (above). DSH and Gemini: not done; `~/.dsh/AGENTS.md` is a
shape reference and has never been tested for whether DSH reads what it points at, and the Gemini
CLI could not be exercised. A harness with no oracle does not get converted.

**Budget the generator in bytes.** The target is a ~32 KiB per-file cap that truncates in silence;
cp is at 78% of it today. The generator must fail loudly when its output would exceed the cap —
a silent cut here removes rules while every structural check stays green.

**Phase 3 — resolve the rules-layer reach.** See Q1. Either project `.claude/rules/*.md` so
non-Claude harnesses receive them, or state in `AGENTS.md` that they do not apply outside Claude
Code and accept the reviewer running without them. Both are defensible; shipping neither is not.

**Phase 4 — close the projection inconsistency in the other repos.** pp projects via symlinks —
the shape P1157 replaced because a harness did not discover them — and carries two divergent
copies of one skill (`fix` symlinked at 7672 bytes, `source-command-pp-fix` a real 7313-byte fork,
both stamped 2026-08-28 14:39, and `source-command-*` is the canary naming from
`sync-agent-skills.test.sh`). ladischenski-com has an `AGENTS.md` symlink and no projection at all.
sbx-demo's `AGENTS.md` is an empty regular file, not a symlink.

**Add the missing pointer in cp.** `grep -niE "AGENTS\.md|\.agents/|harness|codex" CLAUDE.md`
returns zero matches, so no agent can learn from the instructions that the projection exists —
which is the mechanism behind the 2026-09-03 mirror incident.

**Teach the rule-writing gate about the shared file.** `/slava:maintain:claude-md` has repo
profiles for `cp/`, `pp/`, `bankruptcy_2026/` and `~/.claude/CLAUDE.md`, and none for any
`AGENTS.md`. Every rule written through the gate therefore lands in the Claude-only file by
default. This is the mechanism that produced the drift in Phase 1, and leaving it unchanged
guarantees recurrence regardless of what else ships.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Wiring the whole suite puts a live `dsh` call — network and spend — on every commit | MITIGATE | Only Tier A (2 repo-only assertions) reaches the commit path. This is P1221's recorded blocker and the reason Phase 1 is a split, not a wiring change |
| The SKIP path exits 0, so a missing adapter reports success after verifying nothing | MITIGATE | Tier A has no `$HOME` dependency and never skips. Tiers B-D move to a machine-local check where a missing adapter is a distinct *coverage failure*, not a pass |
| `absent()` returns PASS on a deleted file, and `:73-74` read a file the guard does not check | MITIGATE | Measured this session with known-good and known-bad controls. Fixed in Phase 1 before anything is gated |
| A harness never actually follows the pointer, so policy silently stops applying | MITIGATE | Phase 2's behavioral canary is a precondition for removing any content; no canary, no conversion |
| A dangling `AGENTS.md` symlink is silent — reviewer measured `codex debug prompt-input` exiting 0 with a prompt still built and nothing on stderr | MITIGATE | The Phase 2 oracle reads the harness's own assembled prompt, not the filesystem. A `diff` cannot see this and neither can an existence check |
| Instruction files are silently truncated at ~32 KiB — measured: markers past the cut vanish with no notice | MITIGATE | Budget in **bytes**, not lines. `cp/CLAUDE.md` is already 25,428 B (77%); cp's own guard counts lines and would not catch this |
| The 2 current canary failures are a real DSH regression, not a stale assertion | MITIGATE | Diagnose in Phase 1 before wiring — a gate wired while red teaches everyone to ignore it |
| The new pointer-shape assertion false-positives on legitimate adapter-local content | MITIGATE | Epistemic gate 7c — run the existing per-harness files through the new assertion and confirm each still passes before shipping it |
| Collapsing shared policy re-introduces the rejected universal-table design | MITIGATE | Invariant 1; the canary's existing roster/quota assertions (lines 69-74) stay and must keep passing |
| Projecting `.claude/rules/` is real work that may buy nothing | DEFER | Blocked on Q1 — do not build it before the answer |
| Editing global files under `~` is outside the repo and unreviewable by cp's gates | MITIGATE | `~/.agents` and `~/.claude` are git repos — commit there. **`~/.codex`, `~/.dsh` and `~/.gemini` are NOT versioned** (verified), so each needs a timestamped backup copy taken before it is touched and named in the spec's evidence |
| Reverting the shared file while a pointer still targets it silently empties that harness's policy | MITIGATE | Two-phase order: add shared file and prove the canary before removing any adapter content; on rollback, restore adapter content before removing the shared file |

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

- [ ] The suite is split by tier, and **only Tier A** is on the commit path; a commit touching
      nothing harness-related makes zero `dsh` calls, shown by a trace or a timing comparison
- [ ] Failure path exercised, not asserted (epistemic gate 7): a deliberately broken adapter makes
      the wired gate exit non-zero; the exit code is pasted as evidence
- [ ] False-positive path exercised (epistemic gate 7c) **against fixtures, not against the live
      adapters** — a fixture representing legitimate adapter-local content passes. Live adapters are
      re-checked *after* Phase 2 converts them, never before; the two runs are separate evidence
- [ ] `absent()` fails on a missing file, and every file any retained assertion reads is in the
      suite's precondition list — proven by deleting each and observing a non-zero exit
- [ ] The live tier reports **0 failures** on the machine that runs it, with each formerly-failing
      assertion classified from current command output — not a count copied from this spec
- [ ] `diff` of shared-policy rules between `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` returns
      empty, or returns only lines the canary asserts as deliberately harness-local
- [ ] `grep -n "Codex --help\|Codex-guide" ~/.codex/AGENTS.md` returns nothing
- [ ] For each harness converted: a fresh-session behavioral canary shows a directive present only
      in the shared file taking effect in that harness. A harness that fails this canary is NOT
      converted, and the spec records which mechanism it got instead
- [ ] `~/.codex/AGENTS.md` and `~/.gemini/GEMINI.md` each point at the shared policy file rather
      than restating it; a rule added to the shared file changes both harnesses' behavior without a
      second edit — verified behaviorally, not by reading the files
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
2. **ANSWERED — a stale hard-coded model pin, not a regression.** `:88` and `:100` assert the
   literal string `gemini-3.7-flash`; the live config is `gemini-3.8-flash` (verified this session).
   Both failures are that one pin. The consequence is the reason this must be fixed *before* any
   wiring: `/slava:util:model-bump` exists to bump pinned models across surfaces — including dsh
   settings — and contains **no reference to this canary** (verified). So a routine model bump
   breaks the assertion by design; had the suite been on the commit path, the bump would have
   red-lined every commit in the repo until someone hand-edited two lines. **Fix: assert the route
   and shape, never the version string.** Both assertions move to Tier D regardless.
3. Should ladischenski-com and sbx-demo get projections at all, or is `AGENTS.md` alone correct for
   repos with no skills of their own? sbx-demo's empty regular `AGENTS.md` is wrong either way.

## Alternatives Considered

**Re-sync the forked files and move on.** Rejected: this is the third occurrence of the same
divergence, and re-syncing restores the state that decays. It leaves the operator holding a
recurring manual obligation that has already been missed twice.

**Give the Codex fork its own gate that diffs it against the Claude file.** Rejected: a diff gate
must encode which divergences are legitimate, so it becomes a second hand-maintained list of
exceptions — the same failure one level up. The pointer shape has no exception list because there
is nothing to diverge.

**Make `~/.claude/CLAUDE.md` the shared file and point Codex at it.** Rejected: it is Claude's own
adapter, carrying the Opus session-start check and the Claude quota path that the 2026-08-25 ruling
requires stay harness-local. Pointing another harness at it re-imports exactly what P1157 removed.

**Invert cp to match global (`.agents/` as source, `.claude/` as symlinks).** Rejected for now: cp's
direction is gated and measures 0 drift across 125 skills. Changing the one layer that works, to
match layers that do not, is not supported by any evidence in this spec.

## Rollback Strategy

Each phase is independently revertible. Phase 1 is a call site in `pre-commit-checks.sh` plus text
edits — `git revert`. Phase 2 replaces file contents under `~`, and **three of those directories are not version
controlled** — `~/.codex`, `~/.dsh`, `~/.gemini` (verified 2026-09-04; `~/.agents` and `~/.claude`
are repos). Their pre-change contents are recoverable only from a timestamped backup taken before
the edit, so that backup is a precondition of the phase, not a courtesy. Order matters in both
directions: the shared file is added and proven before any adapter content is removed, and on
rollback adapter content is restored before the shared file is withdrawn — otherwise a harness is
left pointing at nothing, which reads as "no rules" rather than as an error. Phase 4 touches pp and ladischenski-com independently of cp. If the wired canary
proves noisy in daily use, unwiring it is a one-line revert that returns to today's state rather
than to a worse one.

## Related

- [P1151](done/2026-06-10/p1151_universal_multi_harness_architecture.md) — established the
  architecture; superseded where it inferred runtime behavior from structure
- [P1157](done/2026-06-10/p1157_make_multi_harness_projection_runtime_correct.md) — established the
  three contracts and built this spec's canary
- [P1163](p1163_orphaned_skill_sweep.md) — orphaned *skills*; this spec's canary is an orphaned
  *gate*, the same shape one layer up
- [decisions.md](../docs/decisions.md) 2026-08-25 (three contracts) · 2026-09-03 (projection is a
  mirror)

## Review Record

Filed 2026-09-04 and adversarially reviewed before any implementation.

**Reviewers: 2 of 3 attempted, 2 reported.** Gemini 3.8 Flash was requested and **not run** —
`delegate-gemini --check` hangs before reaching a verdict (traced to `${TASK//[[:space:]]/}` on the
bash macOS ships, 3.2.57: 2 KB → 1.0 s, 4 KB → 5.1 s, 8 KB → no completion in 20 s), and the payload
would additionally have been refused on the `decisions.md` private-path pattern. The payload was
**not** reshaped to pass the scan. `codex-review` (gpt-5.6-sol) substituted as the second
independent lens. The delegation-wrapper defect is a real finding and is not tracked by this spec.

**Codex — VERDICT: REJECT.** 1 CRITICAL, 4 HIGH, 1 MEDIUM. Accepted: pointer-is-not-an-include
(now Invariant 4 and a Phase 2 precondition); gate fails open; Done-When self-contradiction;
rollback assumed version control that three of the directories do not have; canary is non-hermetic.
**Rejected after verification:** its claim that the suite now reports 27/4 — the real machine
reports 29/2; its 27/4 came from its own sandbox where DSH hit `EPERM`, which incidentally
demonstrates the non-hermeticity it had already argued for.

**Opus — BLOCK-level.** Accepted: not wiring the canary was a **recorded, reasoned decision**
(P1221:103-110) that the first draft treated as an oversight — this restructured Phase 1 from
"wire" to "split"; the tier split itself, now the Phase 1 deliverable; and the SKIP guard omitting
`~/.codex/AGENTS.md` and `~/.codex/config.toml`. **Retracted by the reviewer on re-run:** a
contract-1 drift measurement, which sampled a co-tenant's mid-write state; its derived argument —
that a gate binds at commit time, not continuously — was kept and is why the table says *at commit
time*.

**Verified in this session, not taken on report:** the `absent()` fail-open (known-good and
known-bad controls both behaved correctly, missing file returned PASS); which of the five harness
directories are git repos; the live suite count; P1221's deferral paragraph; Tier A's two
assertions. Tiers B/C/D counts remain the reviewer's, labelled as such in Phase 1.
