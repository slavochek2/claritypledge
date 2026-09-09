---
status: all-done
type: bug
disclosure: public
rank: 225
severity: medium
workstream: infra
date_reported: '2026-08-20'
created_date: '2026-08-20'
tags: [pre-commit, worktree, testing, git-ops, p1116]
pipeline_ran: [create-bug, reproduce, fix]
completed_at: 2026-09-09
---

# P1131: "Banned-git hook canary" fixture leaks GIT_DIR — cherry-pick mid-sequence BLOCK case is unverified for gated-path worktree commits

## Summary

`scripts/test-block-banned-git.py`'s cherry-pick-mid-sequence fixture doesn't isolate itself from
the inherited `GIT_DIR` environment variable, so the pre-commit "Banned-git hook canary" fails
with "FIXTURE BROKEN: sequencer dir not resolvable" on any worktree commit that stages one of the
seven paths this canary group is gated on — even though nothing about `block-banned-git.py`'s real
behavior changed. It only passes on `main` by coincidence.

## Root Cause

The fixture (`scripts/test-block-banned-git.py:159-172`) creates a fresh temp repo (`git init`,
then manually makes `tmp/.git/sequencer/`), then calls `git rev-parse --git-path sequencer` with
`cwd=tmp` to confirm the fixture's own sequencer path resolved, before running the actual
BLOCK-case checks against it. It never strips the inherited `GIT_DIR`/`GIT_WORK_TREE` env vars
before spawning that subprocess.

When `scripts/pre-commit-checks.sh` runs as a real git hook from a worktree (e.g.
`.claude/worktrees/w4`), git sets `GIT_DIR` to an **absolute** path for the hook's environment
(e.g. `/Users/.../claritypledge/.git/worktrees/w4`). An absolute `GIT_DIR` env var wins over
`cwd`-based repo discovery in `git rev-parse`, so the subprocess resolves the sequencer path
against the *outer* worktree's real git-dir instead of the fixture's own `tmp/.git`. The fixture's
own integrity guard (added specifically so this failure mode reports "FIXTURE BROKEN" instead of
a false PASS — see the comment at line ~165) catches this and correctly refuses to silently pass,
but the practical effect is: the commit is blocked with "1 error(s)" any time this canary runs
from a worktree.

**Why it passes on `main`:** from the main checkout, git sets `GIT_DIR` to the relative string
`.git`, not an absolute path. A relative `GIT_DIR` resolves relative to the subprocess's `cwd`,
which is the fixture's own `tmp` dir — so on main it accidentally resolves to `tmp/.git` and the
fixture works by coincidence, not by design.

## Reproduction Steps

1. `cd .claude/worktrees/w4` (or any worktree)
2. `GIT_DIR="$(git rev-parse --git-dir)" python3 scripts/test-block-banned-git.py`
3. Observe: `FAIL: 1 case(s) regressed -- block-banned-git.py behaviour changed` /
   `FIXTURE BROKEN: sequencer dir not resolvable at <worktree>/.git/worktrees/wN/sequencer`
4. Compare: running the identical command from `main` (where `GIT_DIR` is the relative string
   `.git`) → `PASS: all cases behave as expected` (77/77)
5. Compare: running `python3 scripts/test-block-banned-git.py` bare (no `GIT_DIR` set) from the
   same worktree → also PASSES — proving the trigger is specifically the git-hook-injected
   absolute `GIT_DIR`, not the worktree location itself.

**Reproduction rate:** 100% for a `git commit` from a worktree that stages any of the seven paths
`pre-commit-checks.sh:363` gates this canary group on (`.claude/settings.json`,
`.claude/hooks/block-banned-git.py`, `.claude/hooks/route-brief.sh`,
`scripts/test-block-banned-git.py`, `scripts/test-route-brief.sh`,
`scripts/test-validate-command-refs.py`, `scripts/validate-command-refs.py`) — **not** every
worktree commit; the P1122 commit that surfaced this tripped it by staging
`scripts/validate-command-refs.py` for an unrelated reason (`git show --stat 6bb763c4`).
Commits that touch none of those seven paths skip the whole canary group
(`>>> P1116 mechanization canaries skipped`) and never see this failure.

## Expected Behavior

The "SHOULD BLOCK: cherry-pick --abort/--quit MID-sequence" fixture case should build and probe
its own isolated temp repo regardless of the invoking shell's `GIT_DIR`/`GIT_WORK_TREE`, and
either pass or fail based on `block-banned-git.py`'s actual behavior — never on which directory
(main vs. worktree) the hook happened to run from.

## Actual Behavior

Any worktree commit that stages one of the seven gated paths (see Reproduction Steps) blocks on
"Banned-git hook canary (P1116)... ✗" with "FIXTURE BROKEN: sequencer dir not resolvable,"
forcing the committer to either commit from main instead, or invoke `--no-verify` with a manual
pre-existing-failure classification each time.

## Affected Files

- `scripts/test-block-banned-git.py:159-172` — the cherry-pick-mid-sequence fixture; the
  `subprocess.run` calls for `git init`, `git rev-parse --git-path sequencer`, and the two
  `check(..., project_dir=tmp)` calls that follow all need an explicit `env=` with `GIT_DIR` and
  `GIT_WORK_TREE` stripped.
- `scripts/test-block-banned-git.py:37` — `run()`'s `env = dict(os.environ, CLAUDE_PROJECT_DIR=project_dir)`
  starts from the inherited `os.environ` and only adds `CLAUDE_PROJECT_DIR`; it never strips
  `GIT_DIR`/`GIT_WORK_TREE` before invoking the real hook (`block-banned-git.py`) as a subprocess.
  This is the second, more severe leak site: `check(..., project_dir=tmp)` calls `run(cmd,
  project_dir=tmp)`, so the *actual hook under test* — not just the fixture's own probe — can
  resolve `GIT_DIR` from the invoking shell instead of respecting `project_dir`/`CLAUDE_PROJECT_DIR`,
  changing its BLOCK/PASS verdict independent of the sequencer-probe issue above.

## Severity

**Medium** — does not itself let a banned git command through (the real hook,
`block-banned-git.py`, is untouched); it silently removes test *coverage* for the "cherry-pick
mid-sequence should BLOCK" case whenever a worktree commit stages one of the seven gated paths.

**Corrected timeline (2026-08-20, post-review):** the fixture is not P1116-original — `git log
--follow -- scripts/test-block-banned-git.py` shows it landed 2026-08-19 (`5e2f2c8d`, "mechanize
three measured-unenforced rule classes"), one day before this bug was found, not six weeks. The
original "since P1116 shipped (2026-06-10)" claim was a folder-name misread:
`features/done/2026-06-10/` is where the P1122 and P1116 *specs* happen to sit, but that folder
name is not a ship date — both specs' own files were last touched 2026-08-20. The actual exposure
window is ~1 day, and only for commits touching the seven gated paths, not "the overwhelming
majority of real commits."

## Fix Approach

In the fixture's `subprocess.run()` calls inside `scripts/test-block-banned-git.py` (the ones that
build/probe/exercise the `tmp` repo), pass an explicit `env=` with `GIT_DIR` and `GIT_WORK_TREE`
removed:

```python
_clean_env = {k: v for k, v in os.environ.items() if k not in ("GIT_DIR", "GIT_WORK_TREE")}
```

Thread `env=_clean_env` through the `git init`, `git rev-parse --git-path sequencer` calls in the
sequencer-probe block (lines ~159-172), **and** separately fix `run()` at line 37 to build its
`env` from `_clean_env` instead of raw `os.environ`, so the actual hook subprocess it invokes
(`check()` → `run()` → `block-banned-git.py`) can't inherit `GIT_DIR`/`GIT_WORK_TREE` either.
Both sites need the fix — stripping only the sequencer-probe leak (159-172) would still leave
`run()`'s own leak able to change the hook's verdict on any `project_dir=tmp` check.

## Acceptance Criteria

- [x] `GIT_DIR="$(git rev-parse --git-dir)" python3 scripts/test-block-banned-git.py`, run from
      inside any worktree, passes 77/77 (no "FIXTURE BROKEN")
      — run in `w22` with `GIT_DIR=<repo>/.git/worktrees/w22` and `GIT_INDEX_FILE=<same>/index`:
      `77 cases checked / PASS: all cases behave as expected`, exit 0.
- [x] The same command, run from `main`, still passes 77/77 (no regression on the
      currently-working path)
      — the main checkout's shape is a RELATIVE `GIT_DIR=.git`; `GIT_DIR=.git python3
      scripts/test-block-banned-git.py` gives `77 cases checked / PASS`, exit 0. Pinned as
      scenario 5 of the new canary so the coincidence cannot be mistaken for the fix. The
      main checkout's working tree was not entered (concurrent sessions own it).
- [x] A real `git commit` from a worktree no longer blocks on this canary for unrelated reasons
      — this spec's own commit in `w22` stages `scripts/test-block-banned-git.py` and
      `scripts/test-p1131-banned-git-canary-env-isolation.sh`, both gated paths, so the P1116
      canary group ran for real under git's hook environment and passed.
- [x] No console errors / no change to `block-banned-git.py`'s actual banned-command detection
      behavior (only the fixture's isolation changes)
      — `.claude/hooks/block-banned-git.py` is untouched (`git diff HEAD --stat` names only the
      fixture, the new canary and `pre-commit-checks.sh`); case count is 77 in every scenario,
      and a count change is itself a hard failure in the new canary (scenarios 2, 3, 5).

## Fix Delivered

Three changes, all in the test layer. `.claude/hooks/block-banned-git.py` is untouched.

1. **`scripts/test-block-banned-git.py`** — the env scrub landed with P1246 (`7dfb65fd6`) covering
   six variables. Widened here to ten: `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_NAMESPACE`,
   `GIT_CEILING_DIRECTORIES` and `GIT_TEMPLATE_DIR` can each redirect a child git command at
   another repository or at somebody else's code, and the 2026-09-09 incident below proved the
   blast radius is wider than the two variables git exports to hooks.
   `scripts/test-push-snapshot-pinning.sh` already unsets a list of the same shape.
2. **`scripts/test-p1131-banned-git-canary-env-isolation.sh`** (new) — pins the one property the
   fixture's own 77 cases structurally cannot check: that it ignores the caller's git environment.
   Six scenarios; scenario 4 is the epistemic-gate-7 proof and scenario 6 the safety invariant.
3. **`scripts/pre-commit-checks.sh`** — registers the new canary in the P1116 gated group and adds
   its filename to that group's staged-path alternation, so staging the canary runs it.

### Reproduction evidence for the widened scope (2026-09-09)

The first draft of the new canary injected the **real** repository's absolute git-dir, reasoning
that this is literally what git hands a hook. That made the file destructive by construction and it
corrupted the shared checkout four times before the cause was found. Observed on
`/Users/.../claritypledge` (values quoted verbatim from the orchestrator's report):

```
core.bare      = true
core.worktree  = <cp-root>/.claude/worktrees/w22
```

Every git command in the repo then failed with `this operation must be run in a work tree`, for
every concurrent session, and each occurrence was repaired by hand.

Mechanism, measured in a throwaway sandbox rather than inferred — `git init <dir>` does **not**
create `<dir>/.git` when `GIT_DIR` is set; it re-initialises `GIT_DIR`, and a linked worktree's
git-dir writes into the **shared** config:

```
env GIT_DIR=<repo>/.git/worktrees/wN git init -q <tmp>
    -> <repo>/.git/config gains core.bare = true
env GIT_DIR=<...> GIT_WORK_TREE=<wN> git init -q <tmp>
    -> <repo>/.git/config gains core.worktree = <wN>
```

Both observed values, reproduced exactly. This is why the scrub covers the whole repo-scoping
family and not just `GIT_DIR`/`GIT_WORK_TREE` as originally specified, and why the canary now
injects a **decoy** repository built under `mktemp` — same shape (absolute path under a
`.git/worktrees/` prefix), same mechanism, nothing the founder cares about in the blast radius.

### The canary's six scenarios

| # | Asserts | Fails when |
|---|---------|-----------|
| 0 | the fixture's scrub list names every variable this file injects | the two lists drift apart |
| 1 | clean run is green (how a human runs it) | baseline broken |
| 2 | absolute `GIT_DIR` + `GIT_INDEX_FILE` change nothing | the P1131 defect returns |
| 3 | the whole ten-variable family changes nothing | a partial scrub |
| 4 | a copy with the scrub deleted **fails** | the scrub stops being load-bearing |
| 5 | relative `GIT_DIR=.git` (the main-checkout accident) still passes | — |
| 6 | this repository's `core.bare` / `core.worktree` are unchanged | the file damages the repo |

Scenario 6's check also runs after **every** scenario and aborts on the first breach rather than
letting later scenarios add to the damage. A single assertion of that shape would have caught all
four of the 2026-09-09 incidents at the first one.

### Epistemic gate 7 — watched to fail

A mirror of the repo with the scrub deleted from the copied fixture:

```
=== 3 passed, 4 failed ===
GATE-7 PROOF EXIT=1
```

Scenarios 0, 2 and 3 each detect it independently, and scenario 4 reports `MUTATION FAILED` rather
than passing vacuously when there is no scrub left to remove. Against the fixed code, same command
shape: `=== 9 passed, 0 failed ===`, exit 0.

### Epistemic gate 7c — the new gate against existing workflows

The new canary is wired into `pre-commit-checks.sh`, so a false positive would block every session.
Run under the exact environment git gives a pre-commit hook in a worktree
(`GIT_DIR=<repo>/.git/worktrees/w22`, `GIT_INDEX_FILE=<same>/index`, `GIT_PREFIX=`): `9 passed,
0 failed`, exit 0. The gated-path alternation was checked against controls: 8 of 8 real gated paths
match, 0 of 6 near-misses (`scripts/pre-commit-checks.sh`, a `.bak` suffix, an `x`-prefixed path,
`src/App.tsx`, `docs/decisions.md`, the spec file itself).

The repository's `core.bare` / `core.worktree` were re-read after every test invocation in this
session and were `false` / empty each time.

### Adversarial review (codex, gpt-5.6-terra) — 1 issue found, 1 fixed

Verdict on the first pass: **NOT SAFE TO SHIP**. It confirmed every direct git invocation writes
only to the decoy, that the pre-commit alternation cannot over- or under-match, that the mutation
anchor fails closed, and that scenario 0 is a look-alike check whose behavioural cover comes from
scenarios 3 and 4 — and then found one real defect the author had missed.

**The defect.** The decoy is built with `git init` followed by `git worktree add`. `git init`
copies a *template* into the new repo, and `git worktree add` then executes the `post-checkout`
hook it finds there. The template is selected by `GIT_TEMPLATE_DIR` — which the first version did
not scrub — or by `init.templateDir`, which is **config** and therefore survives any amount of env
scrubbing. So a template carrying an executable hook would have run arbitrary code with the
committer's privileges on every commit that staged a gated path, and the file's "hermetic" claim
did not hold as written.

**Fixed** by adding `GIT_TEMPLATE_DIR` to the scrub list in both files, and by having the canary's
`git_clean` wrapper pass `-c init.templateDir=<empty dir>` and an empty hook path on every git
command it runs.

Not live on this machine — `GIT_TEMPLATE_DIR`, `init.templateDir` (global and system) and the
global hook path are all unset (measured 2026-09-09) — so this is defence in depth rather than a
live exploit closed. Proven load-bearing with both controls through one probe, in a sandbox:

```
A: UNHARDENED (GIT_TEMPLATE_DIR honoured)   -> HOOK FIRED  -> template hook executed
B: HARDENED   (var unset + -c overrides)    -> hook did NOT fire
```

## Follow-up: sibling fixtures with the same exposure (not fixed here)

`grep -rn "GIT_DIR\|GIT_WORK_TREE\|git init" scripts/ --include="*.sh" --include="*.py"` finds three
scripts that run `git init` with no env scrub at all — `grep -n 'unset\|env -u\|GIT_DIR'` returns
nothing for each:

- `scripts/test-pipeline-gates.sh` (`git init -q` at lines 137, 170)
- `scripts/test-hook-sha-gate.sh` (lines 20, 23)
- `scripts/test-goal-gate.sh` (line 107)

None is wired into `pre-commit-checks.sh` (`grep -c` returns 0 for each), so none runs under git's
hook environment today; the exposure is limited to a human or agent invoking them from a shell that
already carries `GIT_DIR`. Out of scope for this spec, which is about the banned-git canary — these
need their own P-number.

Already covered, checked and needing nothing: `test-p924-sigterm-orphan-reap.sh`,
`test-p972-resume-cherry-pick-head.sh`, `test-worktree-setup.sh`, `test-git-ops-extensions.sh`,
`test-git-ops-ship.sh` (five-variable unset) and `test-push-snapshot-pinning.sh` (fifteen, the
widest in the repo and the model for the widening above).

## Context

Discovered while committing P1122 (docs contradiction fix) from worktree `.claude/worktrees/w4`.
`scripts/validate-command-refs.py` (one of the seven gated paths) was staged for an unrelated
reason (`KNOWN_RETIRED` update) — the failure itself is independent of what was staged, only the
*triggering* of the canary group depended on it; confirmed via the reproduction steps above.

**Post-review correction (2026-08-20):** an independent Opus critic pass on this session's `/kdd`
meta-reflection re-verified this spec against the actual files and found three overclaims already
committed to main (this spec + `docs/decisions.md`): the fix was framed as adding a `cwd=`
override (wrong — an absolute `GIT_DIR` beats `cwd`-based discovery regardless; the fix is env
stripping, already what Fix Approach says, but the chat/decisions.md summary said "cwd" not "env"),
the blast radius was overstated as "every worktree commit" (actually gated to seven staged paths),
and the exposure window was overstated as "six weeks since 2026-06-10" (actually ~1 day — a
folder-name misread; `features/done/2026-06-10/` is not a ship-date bucket for either P1122 or
P1116's own spec files, both last touched 2026-08-20). All three corrected above. The general
lesson: derive a "how long has this been broken" claim from `git log -- <the actual file>`, never
from the name of the `features/done/<date>/` folder a spec happens to sit in.
