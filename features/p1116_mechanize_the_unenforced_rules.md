---
status: in-progress
type: task
rank: 48.0
created_date: '2026-08-19'
tags: [claude-md, rules, hooks, mechanization, instruction-layer]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

   **Two points carried from P1115 (archived 2026-08-19, absorbed here):**
   - **The review trigger routes to a rule that does not cover most work.** `/pick-flow`'s
     only skip policy is the infrastructure gate (`pick-flow/SKILL.md:132`, scoped to
     `.claude/**`, `CLAUDE.md`, `scripts/`). For `src/`, copy, specs and plans the agent
     re-derives the answer each time. Measured: of 25 readable asks in a hand-classified
     sample, **12 (48%) were answered "no review needed"** — so the missing artifact is a
     *skip* policy, not a gate. Routing to a rule with no clause for the asked-about change
     class satisfies the trigger without answering the question.
   - **This trigger is reactive by construction.** `decision-brief.sh` is a
     `UserPromptSubmit` hook: it fires on the founder's text, so it improves the answer's
     consistency but cannot reduce the ~3×/active-day rate of *asking*. Removing the ask
     needs a different surface (Stop hook, or an end-of-change statement of review status)
     and is explicitly **not** in this spec's scope — record it, do not build it here.

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

- [x] Each new hook has been **watched to fail**: the forbidden input was submitted and the
      refusal (or injection) is pasted in the commit message or spec. No hook is marked done
      on "installed"
- [x] Each git matcher has at least one proven near-miss that is NOT blocked, and one proven
      *mention* that is not blocked — a document or commit message quoting the command must
      pass, per the incident recorded in Risks
- [x] Every refusal message names the sanctioned alternative
- [x] The three measured routing misses fire on their real recorded phrasings, sampled from
      the transcripts that produced the 75 / 14 / 33 counts — not on invented test strings
- [x] The command-existence validator fails on a deliberately broken pointer, and passes on
      `CLAUDE.md` as it stands after P1113
- [x] `./scripts/pre-commit-checks.sh` passes with the validator wired in
- [~] No prose removed from `CLAUDE.md` or `.claude/rules/` — **one deliberate exception,
      founder-approved mid-run.** `.claude/rules/spec-sections.md` lines 45/51/52 were the
      validator's first real catch: three pointers to `/product-owner`, a skill P647 recorded
      as "future, not yet built" and which has never existed. Rewritten (not removed) through
      the `/slava:maintain:claude-md` gate; line count unchanged at 109, net prose 0. Nothing
      else in `CLAUDE.md` or `.claude/rules/` was touched by this spec.

## Adversarial review outcome (2026-08-19) — READ THIS BEFORE /ship

`/slava:think:adversarial-review`, 5 hostile reviewers. **Group 1 is UNREGISTERED.** The
hook file and its canary remain in the repo; the `.claude/settings.json` entry is gone.

**Why**, in the spec's own words: *"A gate that can be satisfied while committing the error
it names is worse than none: it manufactures confidence."* The guard refused the documented
recovery for an already-broken tree (`git.md:158`, `worktree-setup.md:74`,
`revert-feature.md:143`), refused `--no-verify` which `fix.md:637` sanctions with founder
approval while naming no escape, and was bypassable by prefixing `env`. It blocked recovery
but not intent. Re-register only once the findings are closed.

Groups 2 and 3 stay registered, with 8 findings fixed and new canary cases pinning each.
The three that matter most were all **structurally invisible to the canaries** (gate 7b):
the validator's green depended on an untracked directory outside the repo; the router
missed the canonical spelling of its own #1 trigger because `INVARIANT 5` forbids an
apostrophe in the fixture; and the "hermetic" canary was writing into the production log
that measures the hook.

**Coverage, honestly:** 4 of 5 reviewers reported, 3 only after being chased, 1 never. The
evasion lens was run by hand after the channel failed. Every finding was re-verified locally
before being acted on — none was promoted on a reviewer's word (gate 9).

**Incident:** a reviewer executed a real force-push against `origin` while building a
fixture. Verified: `origin/main` at `d40c4582` is an ancestor of local main, no history
rewritten. The **pre-push privacy firewall rejected it** — which is the review's most
important structural finding: the server-side check (P917/P919) is the real boundary, and a
local hook was never going to be one.

## Evidence

**Group 1 — `.claude/hooks/block-banned-git.py`** (registered PreToolUse/Bash).
Watched to fail at the live hook layer, not just in the harness:

```
$ git add -f docs/CHARTER.md
BLOCKED: `git add -f/--force` is banned (.claude/rules/git.md) -- it overrides .gitignore,
which is what keeps .env.local, .mcp.json and .private/ out of a PUBLIC repo. Use instead: ...
```

Canary `scripts/test-block-banned-git.py`: **77/77**, covering every row of the git.md
banned table, 9 shell-structure wrappings, 21 near-misses that must pass (`git add
.claude/settings.json`, `git reset HEAD -- file`, `git reset <sha>`, `git restore --staged`,
`push -n` = dry-run not no-verify, `+feature/x` refspec), and 10 *mentions* that must pass
(commit messages, greps, heredocs writing docs). Watched to fail against two deliberately
broken copies — under-blocking (rule neutered) and over-blocking (word-match instead of
run-match) — exit 1 both times, 10 cases caught on the second.

Two real defects were found by the canary on its first run and fixed: `git push origin
+main` was not detected as a force push (a `+` refspec needs no `--force` flag), and six
refusal messages did not name the alternative in a form the assertion could verify.

**The mention problem is not hypothetical.** Writing this hook tripped the existing
push-guard **three times** — once on the spec, twice on the hook file itself — because that
guard matches the word. That is why this one tokenizes with a quote/heredoc-aware scanner
and only inspects the first token of each simple command.

**Group 2 — `.claude/hooks/route-brief.sh`** (registered UserPromptSubmit, cp-scoped).
Canary `scripts/test-route-brief.sh`: **43/43**. Every fire case is a real string pulled
from `~/.claude/projects/*/*.jsonl` (typed prompts, same extraction path as
`decision-brief-rate.py`) — `"opus or sonent oand on which effort for dev"`, `"do we need
reviewe agnet?"`, `"whats next ? opus ? sonent? wihtihc effort?"` — never an invented one,
which is why the matcher is typo-tolerant by multiset rather than by spelling. Watched to
fail against three broken copies: dead multiset constant, over-broad status trigger, and an
INVARIANT-1 violation (non-zero exit, which would ERASE the user's prompt) — exit 1 each.

One real over-fire was caught and fixed: `"we agreed on sonnet for the subagents already,
just run it"` triggered the subagent route. A decided prompt is not a deliberation, so the
trigger now requires an interrogative frame.

**Sibling, not an edit to `decision-brief.sh`**, and scoped to cp rather than
`~/.claude/hooks/` — every route target (`/status`, `/pick-flow`,
`.claude/rules/model-effort.md`) is a cp artifact. This retires the spec's
"Group 2 edits a file outside this repo" risk rather than mitigating it.

**Group 3 — `scripts/validate-command-refs.py`** (wired unconditionally into
`pre-commit-checks.sh` §12b). Passes on the repo as it stands: **134 references across 19
instruction files all resolve**. Canary `scripts/test-validate-command-refs.py`: **9/9**,
including a deliberately broken pointer in `CLAUDE.md` and in `.claude/rules/` (exit 1), an
archive-only pointer — the literal P1113 shape (exit 1), and a refusal to pass vacuously
when the command tree is empty (exit 1).

Deliberately *not* scoped to staged files, unlike the neighbouring doc-links check: the
defect it exists to catch is a command being archived, where the referring file is never
touched and a staged-file scan would see nothing.

**Wiring proof.** A deliberate failing case was added to one canary and staged;
`./scripts/pre-commit-checks.sh` exited **1** with `✗ 1 error(s) - commit blocked`. The
defect was then reverted and all three canaries re-run green (77 + 43 + 9 = 129 cases).

**Adversarial pass, run AFTER the canaries were green** — bypass probes rather than
opinion. It found one genuine over-block that 74 green cases had missed:
`git commit -m "-n means no-verify"` was refused, because a quoted value beginning with a
dash was read as a short-flag cluster carrying `n`. Fixed with a whitespace guard
(`_is_short_cluster`), three regression cases added. This is the failure direction that
looks like the hook working, which is exactly why the probe had to come after green.

Confirmed-and-documented residuals (all named in the hook header, none silent):
`bash -c "..."`, `eval`, `git add $(echo .)`, and `g=git; $g add .` pass — a literal
invocation inside a quoted string or behind a variable reads as a mention. Blocking those
would re-introduce the over-block class this hook exists to avoid.

`route-brief.sh` was probed with hostile input — apostrophes, command-substitution syntax,
multi-line, unicode, a null byte, and a JSON-breakout attempt (`whats next", "continue":
false`). Exit 0 in every case, output always valid JSON, and the emitted object carries
only `hookSpecificOutput` with `hookEventName` + `additionalContext`: `jq -Rs` makes
sibling-key injection structurally impossible, so INVARIANT 1 and 2 hold under attack.

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
- P1115 (archived 2026-08-19, `features/archive/2026-08/`) — the review-gate spec absorbed
  here; its rejection reason carries the measurement that falsified the blocking-gate
  approach.
- P1040 (open) — gate 2.7 accepting the review type matching what changed; the ship-path
  half of P1115, deliberately left there rather than merged into this spec.
