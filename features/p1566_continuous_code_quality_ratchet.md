---
status: qa
type: task
rank: 72
workstream: infrastructure
created_date: '2026-10-26'
tags: [code-quality, lint, tooling, multi-agent]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1566: Code quality ratchets up continuously, whichever agent writes the code

## Problem

**Situation:** The rules in cp govern how agents *behave*: git safety, epistemic gates, spec
discipline. Almost none govern the *shape of the code* they produce. The mechanical code gates are
ESLint `tseslint.configs.strict` at zero warnings (decisions.md, eslint strict entry), a typecheck
gate (P861) and the unit suite. There is no size, complexity, duplicate, unused-code or import-cycle
check. Largest source files measured 2026-10-26: `src/app/data/api.ts` 5,064 lines,
`src/app/pages/clarity-live-page.tsx` 4,807, `src/app/components/partners/live-mode-view.tsx` 3,822,
`src/app/data/letters-service.ts` 2,130.

**Complication:** Most code here is written by agents (Claude, Codex, Gemini), and the mix will keep
changing. Quality practices that live in skills (an architect pass, `/refactor`, `/simplify`) fire
only when an agent chooses to invoke them, and agents often don't: the founder observed that
architect-style skills are not used consistently. Code shape therefore drifts one large file at a
time, and nothing stops it.

The reference case is `sirknigget/spaghetti-busters`, analysed 2026-10-26. It is an agent-written
repo held in shape by 11 blocking CI checks. Its most transferable practice is its **adoption
protocol** (`docs/architecture-rollout.md`): every candidate rule is run on the real code, findings
are read, one refactor is attempted, and the rule is kept or *withdrawn with the reason recorded*.
Two of its seven candidate rules were withdrawn that way.

> Founder framing, verbatim: "the intention, that it's about increasing data quality continuously"
> (from context: code quality) · "modern agents are not necessarily using skills or not always. So
> how do we make it sustainable? ... maybe model agnostic or skill agnostic"

**Question:** Which mechanical code-shape gates should cp adopt? How can they ratchet quality upward
without a big-bang cleanup? And how can they bind every agent and model, including ones that never
invoke a skill?

## Appetite

- **Blast radius:** medium. Every future commit passes through these gates, but each gate blocks
  only new regressions, never existing code.
- **Reversibility:** high. A gate is removed by deleting a config entry and a pre-commit block.
- **Decision density:** low to medium. Thresholds are calibrated from data, and the founder makes a
  keep or withdraw call per stage (below).

## Invariants

- **Enforcement never depends on an agent invoking a skill, reading a doc, or being a particular
  model.** Every retained gate runs in CI (`.github/workflows/quality-ratchet.yml`, on the
  `staging/*` hop that every push to `main` passes through). File-local gates also run in `scripts/pre-commit-checks.sh` for early feedback.
  Whole-graph gates (Knip, cycles, duplicates) are **CI-only**, because a staged-files run cannot
  see the graph. Skills and guides may *explain* a gate. They must never be the only thing that
  *enforces* it.
- **Ratchet, never big-bang.** A gate blocks a change that makes a measured property worse
  (a file over the limit growing, a new cycle, a new unused export). It never blocks a commit for
  debt that predates it. **No committed baseline files.** "Before" is computed at run time from
  `HEAD` (pre-commit) or the merge-base (CI), the shape `scripts/validate-doc-links.cjs` already
  uses. That removes baseline merge conflicts across concurrent worktrees, and the agent being
  gated has no baseline to edit.
- **Measure the index blob, never the working tree** (`git show :path`, as
  `validate-doc-links.cjs` `stagedContent()` does). A co-tenant's unstaged edit must not change
  the verdict.
- **Every failure message states its own fix** in one or two lines: what was measured, the limit,
  and the expected remedy (for example, "extract into a sibling module; see the nested guide in
  this folder"). That message is the only documentation guaranteed to reach an agent that reads
  nothing else.
- **No silent exemptions.** Every ignore or allowlist entry carries a one-line reason, the P1241
  rule. A bare glob is a finding. A newly added `eslint-disable` for a ratchet rule fails the gate.
- **Pre-commit wall-clock must not grow materially.** The hook is already minutes long, and that
  window is a known commit-race surface (P1279, git.md "The lock does not cover the pre-commit hook
  window"). New pre-commit checks run on staged files only. Whole-repo scans go to CI.

## Solution

### A. Adoption protocol (applies to every stage)

For each stage, in order:
1. Run the tool on the real tree. Record raw counts per category in this spec.
2. Read the findings. Classify a sample of at least 20 (or all, if fewer) as real or false positive.
3. Attempt **one** refactor the rule pushes toward. Judge whether the code got better or worse.
4. Decide: **keep** (wire as a ratchet), **tune** (change the threshold and repeat 1–3), or
   **withdraw** (remove it and record why). Record the decision in `docs/decisions.md` either way.
5. Before wiring, prove the gate both ways (epistemic gates 7, 7c). A known-bad change must fail,
   and an ordinary existing workflow (a normal commit touching an over-limit file without growing
   it) must pass.

### B. One ratchet runner, then stages

**B.0 Generic ratchet runner** (one script, not inline in the 2,689-line hook). Contract: a metric
function takes file content and returns a set of findings or a number. The runner computes it on
"before" (`HEAD` or merge-base blob) and "after" (index blob) and fails only on new findings or a
worse number. It prints measured value, limit and remedy. Rename handling: pair moves with
`git diff --cached -M --name-status` so a `git mv` carries its "before" across. Build it so the
deferred typecheck baseline ratchet (`scripts/typecheck-gate.sh` "Option B"; the open founder
decision in decisions.md) can plug in as one more metric.

Stages, ordered by signal per unit of judgment and install cost. **As built, the
tool choices below were superseded** (Prettier, ESLint JSON output, dependency-cruiser and
jscpd were replaced by the TypeScript compiler already in the repo, and no devDependency was
added). The Trial Record states the deviations and the mechanism that shipped.

1. **Size and complexity (pre-commit + CI, no new dependency).** ESLint's `max-lines` is a static
   threshold with no baseline, so it cannot ratchet on its own and is **not** turned on in
   `eslint.config.js` (that would fail `npm run lint` repo-wide on day one). The runner measures
   per file: formatted line count (after Prettier, so compaction can't game it), the set of
   functions over the length limit, and per-function complexity via ESLint's JSON output with the
   ratchet rules enabled only in the runner. Ratchet: an over-limit file may not grow; a new file
   must be within the limit; no function may newly cross a limit or get more complex once over it.
   **Split laundering:** when a commit adds files and shrinks an over-limit file, judge the net
   delta across the set. Thresholds come from step A.1 data (the current distribution), not from
   spaghetti-busters' numbers.
2. **Import cycles: dependency-cruiser (CI-only),** cycle rule only, compared against the
   merge-base set of cycles. Folder-boundary rules are a non-goal.
3. **Unused code: Knip (CI-only).** **Depends on [P1241](p1241_knip_configuration_and_triage.md)'s
   config landing first.** P1241 is still in backlog with no config, and its triage stays there.
   Ratchet: compare whole-project finding IDs against the merge-base. That catches a commit that
   orphans an export in an untouched file.
4. **Exact duplicates: jscpd (CI-only),** exact profile only, compared against the merge-base.

Stages 2–4 each add a devDependency. **Install approval is asked per tool before that stage
starts.**

### C. Sustainability across agents and models (the founder's core question)

Three layers. Only the first enforces anything.

| Layer | Reaches | Mechanism |
|---|---|---|
| **Enforcement** | Every agent and every human | pre-commit + CI gate, with fix-stating messages |
| **Discovery** | Agents that read repo files (all current harnesses) | Short **nested guides** in hot folders (`src/app/data/`, `src/app/pages/`, `src/app/components/`): a `CLAUDE.md` with an `AGENTS.md` symlink, mirroring the root pair (`AGENTS.md -> CLAUDE.md`). Each says what the folder owns, the split pattern to use when a file hits the limit, and how to test. ≤40 lines |
| **Assistance** | Agents that invoke skills | `/refactor` and `/simplify` mention the gates. Optional, never relied on |

Nested guides must respect the P1265 findings: Codex silently truncates `AGENTS.md` past ~32 KiB per
file, and the root is at 78%. Nested files are separate files, so they do not consume the root's
budget. UNVERIFIED: that Claude Code and Gemini CLI load nested guides on file access. Verify per
harness before relying on discovery (enforcement does not depend on it).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Ratchet pushes agents to split files badly (arbitrary cuts to get under a line count) | MITIGATE | Step A.3 refactor trial per stage. The nested guide names the split pattern. Withdraw if trials make code worse |
| Agents game the line count by compacting code or deleting comments and checks | MITIGATE | Measure after Prettier; ratchet function count and complexity too, not only lines |
| Split laundering (move 300 lines out, add 300 back) | MITIGATE | Net delta across files added in the same commit (B.0 stage 1) |
| Existing hook re-stages working-tree files after `eslint --fix` (`pre-commit-checks.sh` line ~149) | DEFER | Pre-existing P1279-class hazard, out of scope. File via `/note`. The runner itself reads index blobs only |
| Pre-commit gets slower and widens the P1279 race window | MITIGATE | Staged-files-only in pre-commit, whole-repo scans in CI. Measure wall-clock before and after; Done-When bounds it |
| Knip false positives delete live code (P1241 found 72 structural FPs) | MITIGATE | P1241's entry-point config first. This spec deletes nothing |
| Gates added on top of gates leave the hook unreadable | ACCEPT | Each stage is one labelled block. Withdrawn stages are removed, not commented out |
| Agents bypass with `--no-verify` | ACCEPT | Already banned (git.md); CI is the backstop |
| A future harness reads no repo files at all | ACCEPT | The enforcement layer still binds it at commit and CI |

**Non-Goals**
- Do NOT refactor the existing large files in this spec. Shrinking them is follow-up work the
  ratchet makes visible.
- Do NOT add semantic (embedding) duplicate scans, archlint or cohesion metrics. Spaghetti-busters'
  own trials show high calibration cost and two withdrawals.
- Do NOT add folder-boundary or architecture-layer rules yet.
- Do NOT make any gate depend on a skill, hook or harness-specific feature.
- Do NOT relax the existing ESLint strict / zero-warning policy.

## Done-When

- [x] Each of the 4 stages has a recorded trial (raw counts, sample classification, one refactor
      attempt, keep/tune/withdraw verdict) in this spec and a `docs/decisions.md` entry (a stage
      deferred under the last item records the deferral and its entry instead)
- [x] Every retained gate is proven on the real repo (gates 7, 7c, 7d), exit codes pasted:
      fails on a known-bad change, on a newly added disable directive, and on split laundering;
      passes on a commit that touches an over-limit file without growing it, and on a `git mv` of
      an over-limit file
- [x] Every retained gate runs in CI: its own workflow `quality-ratchet.yml` (job
      `quality-ratchet`, on `main`, `staging/**` and PRs to `main`), so it judges commits before
      they become `main`. Proven by running the exact CI command locally on a known-bad tree (exit
      code pasted), and in staging mode on the real repo: this branch exits 0, the same branch plus
      3 lines in `clarity-live-page.tsx` exits 1. The first real PR run is the `[post-deploy]` re-check
      (a push needs founder approval)
- [x] Every gate's failure message names the measured value, the limit and the remedy
- [x] Pre-commit wall-clock on a fixed 3-file commit grows by ≤10 s: median of 5 runs before and
      after, pasted (method substituted under machine contention: the added blocks timed
      directly, median 0.90 s of 5; see Trial Record, "Pre-commit wall-clock")
- [x] Nested guides exist in the hot folders, each ≤40 lines, each `AGENTS.md` a symlink to its
      sibling `CLAUDE.md`, and a pre-commit check enforces both. Loading verified per harness
      (Claude Code, Codex, Gemini CLI) by a probe; a harness that doesn't load them is recorded,
      and the gate message then carries the remedy alone
- [x] Stage 3 status recorded: P1241 config landed and the Knip ratchet is wired, or stage 3 is
      explicitly deferred to after P1241

## Alternatives Considered

- **Copy spaghetti-busters' full stack** (11 checks, five duplicate profiles, archlint): rejected
  on cost. It would require hours of calibration and a pinned git dependency, and its own record
  shows two withdrawals.
- **Hard limits repo-wide on day one:** rejected. Hundreds of existing files would fail, and the
  likely responses are a mass exemption list or rushed splits.
- **Skill-based enforcement** (make the architect or `/refactor` pass mandatory in `/dev`):
  rejected as the primary layer. It binds only agents that invoke skills, which is the exact gap
  the founder named. It is retained as the assistance layer.
- **Do nothing:** strongest case is that ESLint strict plus review already catch bugs. Rejected:
  neither measures shape, and the 5,000-line files exist under the current regime.

## Rollback Strategy

Each stage is one commit: a metric module, its CI step and (stage 1 only) its pre-commit call.
Revert that commit. There are no baseline files to clean up.

## Related

- [P1241](p1241_knip_configuration_and_triage.md): Knip config and triage, the prerequisite for stage 3
- [P1265](p1265_codex_agents_md_becomes_a_generated_projection.md): AGENTS.md size cap and
  projection findings, which constrain layer C
- decisions.md: tsconfig typecheck baseline/ratchet listed as an open founder decision (batch-run
  entry). Same ratchet shape, so align the mechanism if both proceed
- decisions.md: doc-link gate is already a staged-files ratchet, the in-repo precedent for the
  ratchet shape

## Review Record

**Round 1 (2026-10-26).** Gemini 10 findings (REVISE), Opus 12 findings. Codex 4 findings
(REQUEST CHANGES, reviewed the pre-revision draft, each backed by an inline probe). All 4 were
already covered by this revision: Knip blind to newly orphaned files → merge-base whole-project
compare; regression after improvement → no stored baseline, before = HEAD; per-file complexity →
per-function ratchet; jscpd contradiction → CI-only class. 3 of 3 reviews received. Every load-bearing repo claim was re-run by command before folding in
(test.yml triggers on main only; hook re-stage at ~149; `validate-doc-links.cjs` HEAD-vs-index
ratchet; `typecheck-gate.sh` Option B; no Knip/jscpd/depcruise in `package.json`).
Folded in: ESLint can't ratchet (both, BLOCK) → B.0 runner; Knip and cycles are whole-graph (both)
→ CI-only; jscpd pre-commit contradiction (Gemini); committed baselines conflict and are editable
(both) → derive from HEAD/merge-base; disable-directive bypass, split laundering, rename handling,
index-blob measurement (Opus); compaction gaming (Gemini) → measure after Prettier; CI proof on a
throwaway branch impossible (Opus) → local CI command; size stage first, no install (Opus).
Rejected: Gemini #7 (dependency-cruiser on a staged file misses cycles). It follows imports from
the given file, so a cycle through that file is still found; moot anyway because cycles are now
CI-only. Gemini #10 (Windows symlinks): the root `AGENTS.md` is already a symlink; no Windows
contributors.

## Trial Record

Run 2026-10-26 on the real tree, per section A. Full reasoning per stage is in
`docs/decisions.md` (four entries dated 2026-10-26, "P1566 stage N").

**Deviations from the Solution as written.** (1) Prettier is not installed, so stage 1
normalizes with the TypeScript printer (comments stripped, blocks expanded, one statement
per line). That is stronger against gaming, because Prettier keeps comments. (2) Stages 2
and 4 are built on the TypeScript compiler already in the repo instead of
dependency-cruiser and jscpd, after a security review the founder asked for (18 direct
deps for one rule; an unauditable native binary or a `colors`-dependent 4.x). No
devDependency was added. (3) Complexity is ESLint 9's classic count reimplemented on the TS
AST (matched ESLint on 560 of 560 functions), not ESLint's JSON output, so one parse serves
lines, functions and complexity, and an eslint-disable cannot silence it. (4) **CI judges on the staging hop.** The
founder chose (2026-10-26) to judge before `main`, not after: the gates moved out of `test.yml`
into their own workflow, `quality-ratchet.yml`, which also runs on `staging/**`. Its own job name
means requiring it never makes the unit tests a push blocker. It refuses a promote once
`quality-ratchet` is added to the `main-privacy-gate` ruleset's required checks, a founder-only
setting; until then it shows red on the hop without refusing. (5) In a worktree, the installed git hook runs the **main
checkout's** `pre-commit-checks.sh`, so the new pre-commit blocks take effect only after
merge. Proofs below ran the worktree's copy explicitly.

| Stage | Raw counts (HEAD) | Sample | Refactor trial | Friction (replay) | Verdict |
|---|---|---|---|---|---|
| 1 size / complexity | 702 files in scope; 47 over 400 lines; 122 functions over 80 lines, 135 over complexity 20 (703 / 48 / 123 / 137 after the JS family joined scope) | 61 findings classified, 60 real; 1 FP (in-file rename), fixed | `getUnreadLetterCount` complexity 24 to 9, 47 to 17 lines, 53/53 tests green, ratchet OK: better | 104 of 300 src commits (35%) after the review fixes; 0 laundering findings | **KEEP**, tuned: complexity 15 to 20, own-line function length, rename handling, tests out of scope |
| 2 import cycles | 0 cycles; 673 modules, 2,102 runtime edges at the shipped scope (715 / 2,463 in the first trial; prototypes now exempt, `supabase/functions/_shared/` now in the graph). Controls: planted cycle caught via relative and `@/`; type-only loop ignored | 0 live findings; history: cycles at 3 points in the past year | September's 3-file cycle broken by moving one 3-line constant: better | 0 of 60 src commits | **KEEP** |
| 3 unused code | not run | n/a | n/a | n/a | **DEFERRED** to after P1241 (backlog, no config) |
| 4 exact duplicates | 662 windows, 294 regions, 72 of 650 files at the shipped scope | 22 regions (drawn before the scope tuning): 18 real, 4 noise (3 prototype copies, 1 type field list) | three identical time-ago helpers consolidated, 5 windows removed, none added: better | 1 of 60 src commits, real | **KEEP**, tuned: prototype folders out of scope, findings reported in touched files only |

**Gate proofs on the real repo** (exit codes; worktree index, restored after each; re-run
on the final, post-review code with identical results, plus P2b):

| Proof | Exit |
|---|---|
| P1 `api.ts` (over limit) grows by one statement | 1 |
| P2 new `// eslint-disable-next-line complexity` in `letters-service.ts` | 1 |
| P2b new blanket `/* eslint-disable */` in `letters-service.ts` | 1 |
| P3 `letters-service.ts` edited without growing | 0 |
| P4 `git mv` of `letters-service.ts` | 0 |
| P5 split laundering: a real function moved out of `api.ts`, same amount added back | 1 |
| P6 the same extraction done as the message prescribes (import + re-export only) | 0 |
| Worktree hook copy, `api.ts` growth staged: blocked by the ratchet alone (build, tests, ESLint green) | 1 |
| Worktree hook copy (final), a new 401-line `.jsx` staged | 1, but **silently**: see below |
| Block 2b alone under `set -e` after the fix, the same `.jsx` / a 1-line `.jsx` | finding printed, ERRORS=1 / pass; old block as control: dies with no output |
| CI command (`--ci`, push form) on a known-bad commit (size + cycle + duplicate) | 1, four findings |
| CI command, pull_request form, same commit | 1 |
| CI command on a known-good commit | 0 |
| CI command, push with no usable before SHA | 2 (refuses an empty range) |
| `check-nested-guides.cjs --rev HEAD` on a tree without the guides | 1 |
| Hermetic canary `scripts/test-quality-ratchet.sh` | 0 (86/86 after three review rounds and a final check: every confirmed reviewer finding is a scenario, plus `--ci` push, staging push (new and force-updated), PR, zero-SHA and force-push cases; CI runs it before the ratchet itself); each mutant (growth rule, laundering, cycles, duplicates, class-extends and JS-import fixes disabled) exits 1 |

**Nested guide loading probe** (scratch repo, root token as control): Claude Code 2.1.310
loads a nested `CLAUDE.md` on file access. Codex 0.162.1 loads a nested `AGENTS.md` only when
started inside that folder (control from `sub/`: both tokens). Gemini CLI 0.55.1 reads
neither name: its discovery looks for `GEMINI.md` only, and with `GEMINI.md` present it loads
the root file at startup. On-access loading is unverified because the CLI's API key is
rejected. So the gate message, which states value, limit and remedy, is the only channel
that reaches every harness.

**Review round** (`/finish`, 4 of 4 reviewers reported: Gemini, Codex, an Opus adversary,
a Sonnet criteria reviewer). Every claim was reproduced by command before acting; each
confirmed code defect was fixed and is now a canary scenario (list in the stage 1
decisions entry), and each confirmed docs inaccuracy was corrected. **Known limitations, accepted:** laundering where every moved line is
edited in transit; branches spread over immediately-invoked functions (decomposition, the
remedy itself); a rename that rewrites every line in the same commit (judged as a new
file); near-duplicates with one line in nine changed (exact profile by design); a `git mv`
into an excluded path; a cycle through a folder outside `src/` and
`supabase/functions/_shared/`; a top-level `await import()` (treated as lazy); a parameter
shadowing an imported type's name can make the cycle check report a cycle the build would
not have (errs toward flagging, never toward missing); the staging verdict is per push and is
not re-judged if `main` moves before the promote, so a push regrowing a file another push just
shrank can stay green there (pre-commit judges each commit, and the push-to-`main` run still
turns red on it).

**Review round 3 (CI placement, 2 of 2 reviewers reported: Gemini, Codex).** Fixed: job
timeout; CI runs the canary before trusting the runner; force-updated staging cases added;
the workflow comment's "cannot reach production" overclaim corrected. Set aside: a stale
staging base (moot, since the ruleset forbids non-fast-forward pushes to `main`, so any promoted
SHA contains the base it was judged against or a newer one); a concurrency group (a cancelled
run would leave a required check cancelled; no sibling gate workflow cancels); a canary trigger
on the workflow file (the canary exercises the runner, not the YAML).

**Defect found by the final wiring proof, not by the review.** The fix round changed block
2b to branch on the ratchet's exit code with a bare `RATCHET_OUT="$(...)"` then
`RATCHET_RC=$?`. The hook runs under `set -e`, so the first regression ended the hook right
there with no message at all: still blocked (fail-closed), but with no value, limit or
remedy shown. Fixed with `RATCHET_RC=0; RATCHET_OUT="$(...)" || RATCHET_RC=$?` and proven
both ways under `set -e`, with the old block as the control. The hermetic canary cannot
see this class, because it drives the runner, not the hook; the manual proof is the only
cover.

**Pre-commit wall-clock.** Method substituted, stated plainly: the planned median of 5
full-hook runs before and after could not be measured cleanly, because concurrent sessions
were running their own hooks on the same machine. The same 3-file commit took 205 s on one
"before" run and 753 s on another, and a CPU-timed unit test (`p1547-mirror-budget`) failed
under that load. So the added work was timed directly instead: blocks 2b (ratchet) and 2c
(guides) on the same fixed 3-file commit, 5 runs: 0.83, 0.89, **0.90 (median)**, 0.99,
1.00 s. Block 2d runs only when the ratchet's own files are staged. The added wall-clock is
therefore about 1 s, well inside the 10 s bound. A full-hook re-measure in a quiet window
is offered, not required.
