---
status: qa
type: task
rank: 1000073
workstream: infrastructure
created_date: '2026-09-04'
tags: [infrastructure, multi-agent, codex, skills]
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1247: Contract 2's canary is split by tier, and only the repo-only half is gated

**Phase 1 of a multi-phase effort — closes here.** Phase 2 (convert `~/.codex/AGENTS.md` into a
generated file instead of a hand-maintained fork), Phase 3 (the rules-layer-reach founder
decision), and Phase 4 (pp/ladischenski-com projection cleanup) continue in
[P1265](p1265_codex_agents_md_becomes_a_generated_projection.md) — split off because `/ship`'s
completion gate checks every `## Done-When` box in one spec, and this spec's original Done-When
mixed all four phases. Read this spec in full for the Problem/Invariants/Risks that bind every
phase; P1265 carries the not-yet-done Solution/Risks/Alternatives/Open-Questions text forward
rather than restating it here.

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
**DONE (Phase 1):** made the canary version-blind (asserts `provider: google` +
`model: gemini-<version>-flash` shape, never the literal version string) — there is nothing left
for `/slava:util:model-bump` to know about. See Done-When evidence below.

**Phase 2 onward — continues in [P1265](p1265_codex_agents_md_becomes_a_generated_projection.md).**
That spec carries forward, verbatim from this spec's original draft: converting
`~/.codex/AGENTS.md` (and, if measured to support it, `~/.gemini/GEMINI.md`) from a hand-maintained
fork into a generated file; the byte-budget requirement for the generator; the rules-layer-reach
founder decision (Q1); and the pp/ladischenski-com projection cleanup. Read this spec's Problem,
Invariants and Risks sections first — they bind every phase, not just this one.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Wiring the whole suite puts a live `dsh` call — network and spend — on every commit | RESOLVED | Only Tier A (2 repo-only assertions) reaches the commit path, proven with a `dsh`-call trace: 0 for Tier A, 3 for Tier D under an identical logging shim |
| The SKIP path exits 0, so a missing adapter reports success after verifying nothing | RESOLVED | Tier A has no `$HOME` dependency and never skips. Tiers B-D moved to a machine-local check where a missing adapter is a distinct *coverage failure*, not a pass |
| `absent()` returns PASS on a deleted file, and `:73-74` read a file the guard does not check | RESOLVED | Fixed and proven by deleting each affected file and observing a non-zero exit — see Done-When evidence |
| The 2 current canary failures are a real DSH regression, not a stale assertion | RESOLVED | Diagnosed as the stale `gemini-3.7-flash` pin, not a regression; fixed to assert route+shape. Live suite now 31/0 |
| The new Tier A logic false-positives on legitimate adapter-local content, or has gaps a review would catch | RESOLVED | Epistemic gate 7c fixture harness (legit/bad-env/bad-hook) plus one adversarial code review this session, which found and fixed 2 HIGH + 3 MEDIUM real gaps (working-tree-vs-index read, ambient env-var override, `-e` vs `-f`, undeclared `jq` dependency, dangling fixture-script reference) — see Review Record |

**Phase 2+ risks (pointer-vs-generation, byte budget, global-file editing, rollback ordering,
universal-table collapse, `.claude/rules/` projection) carry forward to
[P1265](p1265_codex_agents_md_becomes_a_generated_projection.md)'s own Risks table — not restated
here.**

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

- [x] The suite is split by tier, and **only Tier A** is on the commit path; a commit touching
      nothing harness-related makes zero `dsh` calls, shown by a trace or a timing comparison.
      **DONE (Phase 1):** `scripts/test-multi-harness-routing.sh` now takes `[a|b|c|d|all]`; only
      Tier A is wired into `pre-commit-checks.sh`. Proof: a PATH shim that logs every `dsh`
      invocation recorded 0 calls for `--tier a` and 3 calls for `--tier d` run with the identical
      shim (positive control confirming the shim itself works).
- [x] Failure path exercised, not asserted (epistemic gate 7): a deliberately broken adapter makes
      the wired gate exit non-zero; the exit code is pasted as evidence.
      **DONE (Phase 1):** appended a `CLAUDE_CODE_` line to `.codex/config.toml` and re-ran the
      actual `./scripts/pre-commit-checks.sh` (not just the tier script standalone) — exit 1,
      "commit blocked", Tier A line shown red. Restored and re-ran green (exit 0) to confirm no
      collateral damage.
- [x] False-positive path exercised (epistemic gate 7c) **against fixtures, not against the live
      adapters** — a fixture representing legitimate adapter-local content passes. Live adapters are
      re-checked *after* Phase 2 converts them, never before; the two runs are separate evidence.
      **DONE (Phase 1):** `scripts/test-multi-harness-routing-tierA-fixtures.sh` (committed, not
      throwaway shell) builds 3 fixtures (legit / bad-env / bad-hook) and runs each through the real
      `run_tier_a()` via `TIER_A_CODEX_CONFIG`/`TIER_A_ROUTE_HOOK`. legit: 2/2 PASS. bad-env
      (injected `CLAUDE_CODE_`): 1 FAIL. bad-hook (injected `.claude/rules/model-effort.md` leak):
      1 FAIL. `./scripts/test-multi-harness-routing-tierA-fixtures.sh` reproduces this on demand.
- [x] `absent()` fails on a missing file, and every file any retained assertion reads is in the
      suite's precondition list — proven by deleting each and observing a non-zero exit.
      **DONE (Phase 1):** `absent()`/`contains()` now check file existence before concluding
      anything. Proven by deleting, one at a time (each backed up and restored), the 4 files whose
      absence previously fell through the old fail-open path or Tier A's hard precondition:
      `~/.codex/AGENTS.md` (exit 1), `~/.codex/config.toml` (exit 1), `.codex/config.toml` repo copy
      (exit 1, Tier A never skips), `.codex/hooks/route-brief.sh` (exit 1). The 3 core adapter files
      (`~/.agents/model-routing.md`, `~/.codex/model-routing.md`, `~/.dsh/model-routing.md`) keep
      their existing, correct SKIP-not-silent-pass behavior when genuinely absent (unchanged —
      that was never the bug; the bug was two files outside that list falling through `absent()`).
- [x] The live tier reports **0 failures** on the machine that runs it, with each formerly-failing
      assertion classified from current command output — not a count copied from this spec.
      **DONE (Phase 1):** `./scripts/test-multi-harness-routing.sh all` -> 31 passed, 0 failed (was
      29/2 before this session's fix). Both prior failures were the stale `gemini-3.7-flash` pin
      against a live `gemini-3.8-flash` config; fixed by asserting `provider: google` +
      `model: gemini-<version>-flash` shape instead of the literal string. Falsified by simulating a
      further bump to a synthetic `gemini-4.0-flash`: both version-blind assertions still passed
      (a third, unrelated assertion failed only because the synthetic version isn't a real `dsh`
      route — an artifact of the test value, not the fix).

**All 5 Done-When items above are this spec's complete scope.** The 9 items originally listed here
for Phase 2/3/4 (rules diff, Codex fork content, behavioral canaries, pp projection, `CLAUDE.md`
pointer, `/slava:maintain:claude-md` profile) moved to
[P1265](p1265_codex_agents_md_becomes_a_generated_projection.md)'s own Done-When, unchecked —
`/ship`'s gate 2.5 counts every unticked box in one spec's Done-When section, and this spec's
original list mixed all four phases, which would have blocked shipping Phase 1 indefinitely.

## Open Questions

**ANSWERED — a stale hard-coded model pin, not a regression.** `:88` and `:100` assert the
literal string `gemini-3.7-flash`; the live config is `gemini-3.8-flash` (verified this session).
Both failures are that one pin. The consequence is the reason this must be fixed *before* any
wiring: `/slava:util:model-bump` exists to bump pinned models across surfaces — including dsh
settings — and contains **no reference to this canary** (verified). So a routine model bump
breaks the assertion by design; had the suite been on the commit path, the bump would have
red-lined every commit in the repo until someone hand-edited two lines. **Fix: assert the route
and shape, never the version string.** Done — see Done-When evidence.

The founder-decision question (which rules earn a place in a cross-harness hard-stops block) and
the ladischenski-com/sbx-demo projection question both belong to later phases and moved to
[P1265](p1265_codex_agents_md_becomes_a_generated_projection.md)'s Open Questions.

## Rollback Strategy

Phase 1 (this spec) is a call site in `pre-commit-checks.sh` plus text edits in
`scripts/test-multi-harness-routing.sh` and a new fixture-test script — a plain `git revert` of
`bb924ba1e` and `1cee65ffb` returns the repo to the unwired, undrifted-detection state (contract 2
had before this spec: 29/2 on the live suite, zero commit-path coverage). No global (`~`) files were
touched in this phase. Later phases' rollback strategy (global-file backups, two-phase add/remove
ordering) moved to [P1265](p1265_codex_agents_md_becomes_a_generated_projection.md).

## Related

- [P1151](done/2026-06-10/p1151_universal_multi_harness_architecture.md) — established the
  architecture; superseded where it inferred runtime behavior from structure
- [P1157](done/2026-06-10/p1157_make_multi_harness_projection_runtime_correct.md) — established the
  three contracts and built this spec's canary
- [P1163](p1163_orphaned_skill_sweep.md) — orphaned *skills*; this spec's canary is an orphaned
  *gate*, the same shape one layer up
- [P1265](p1265_codex_agents_md_becomes_a_generated_projection.md) — continues Phase 2/3/4 of this
  spec's original plan
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

**Phase 1 implementation review (this session) — VERDICT: 2 HIGH, 3 MEDIUM, all fixed and
re-verified by reproduction (epistemic gate 9 — every claim tested by command, not taken on
report).**

- **HIGH — Tier A read the working tree, not the git index.** A commit's actual content is the
  staged index, not whatever the working tree currently holds. Reproduced: stage a `CLAUDE_CODE_`
  leak, then clean the working copy without re-staging — the old check read the clean working file
  and PASSed while `git show :.codex/config.toml` still carried the leak. Fixed: `run_tier_a()` now
  snapshots `git show :.codex/config.toml` / `:.codex/hooks/route-brief.sh` into temp files when
  using the real repo paths (fixture overrides are read as-is, since they're outside git by
  design). Re-verified: same repro now exits 1.
- **HIGH — the `TIER_A_CODEX_CONFIG`/`TIER_A_ROUTE_HOOK` fixture-override env vars were honored
  unconditionally.** An override left exported in a shell from earlier fixture testing would
  silently redirect the real wired gate. Reproduced: staged a leak, exported the override to a
  clean fixture, ran `./scripts/pre-commit-checks.sh` — PASSed on a leak it should have caught.
  Fixed: overrides are honored only when the script is *sourced*; when *executed* (the real
  commit-time path), both variables are forced back to the repo defaults regardless of the ambient
  environment. Re-verified: the identical repro now exits 1 (fails on the real leak, ignores the
  stale override).
- **MEDIUM — `absent()`/`contains()` checked `-e`, not "is a regular file."** A same-named directory
  satisfies `-e`, then `grep` fails with "Is a directory" (exit 2), which the old fail-open path
  read as "no match" → PASS — the exact bug this phase exists to close, via a different filesystem
  object type. Fixed: both helpers and every tier's precondition check now use `-f`. Re-verified:
  replacing `.codex/config.toml` with a directory now exits 1.
- **MEDIUM — Tier A's routing-hook assertion had an undeclared `jq` dependency.**
  `.codex/hooks/route-brief.sh` hardcodes `JQ=/usr/bin/jq` and no-ops silently if absent there; Tier
  A's own `jq -e` call is PATH-resolved. On a machine without `jq` at that exact path, the check
  would fail with a misleading "pattern absent" and block every commit — a false-positive risk none
  of this phase's original fixtures exercised. Fixed: `command -v jq` added to Tier A's
  precondition list. Not independently reproduced (this machine has `jq` at `/usr/bin/jq`); verified
  by source read and by confirming the precondition line is now present and exercised by the
  existing "missing tool" precondition path.
- **MEDIUM — the fixture-test evidence for epistemic gate 7c was not reproducible from the repo.**
  The script's own header comment cited `scripts/test-multi-harness-routing-tierA-fixtures.sh`,
  which did not exist — the original evidence was ad hoc shell, not a committed artifact — and
  sourcing the script directly threw `TMP_ROOT: unbound variable` (it was only initialized inside
  the direct-execution guard). Fixed: `TMP_ROOT` is now initialized unconditionally at the top of
  the file (safe whether sourced or executed), and the named fixture script now exists, is
  committed, and reproduces all three fixture outcomes on demand.

Not flagged by the reviewer, and separately confirmed sound: the tier split itself (all 31 original
assertions accounted for, none dropped or duplicated — A=2, B=19, C=6, D=4); `pre-commit-checks.sh`
wiring's control flow (`run_quiet` exit-code capture, no `set -e` interaction); the version-blind
DSH regex's primary (`awk`) anchor.
