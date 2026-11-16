---
status: all-done
type: task
rank: 342
workstream: infrastructure
created_date: '2026-11-16'
tags: [deploy, edge-functions, self-hosted, tooling]
disclosure: public
intent: cold-start
pipeline_ran: [create-spec, dev]
drafted_by: fable
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-11-16
---

# P1690: Two deploy scripts report success, or fail, for the wrong reason

## Problem

Two defects in the edge-function deploy scripts. Both end with a person believing something about
the server that is not true. Filed from two task-inbox notes with no founder conversation to mine;
the only founder words on record are the two in the inbox note, that TEST was "updating forever".

**1. Several function names deploy only the last one, and the script prints success.**
`scripts/selfhosted/deploy-functions.sh` takes one optional function name. Its argument loop stores
every positional argument in the same variable, so each name overwrites the one before it:
`deploy-functions.sh a b c` deploys `c` (plus `_shared`), prints "Deployed", and exits 0. On
2026-11-13 this cost a day of founder testing on a branch: TEST kept serving main's copies of two
functions after "redeploys" that had named them (decisions.md 2026-11-13 [process]).

`scripts/deploy-functions.sh` (the wrapper that routes TEST to the active server and deploys prod)
has the same overwrite in its own loop, so the defect is reachable through both entry points and,
on the hosted path, on prod: `deploy-functions.sh a b --env prod` deploys and stamps only `b`.

**2. A prod deploy cannot find `.env.prod` from a worktree.**
`.env.prod` is gitignored and exists only in the main checkout. When it is missing from the
checkout being deployed, the wrapper falls back to the parent of its own `scripts/` directory.
That fallback was written when a worktree's `scripts/` was a link to the main checkout's. It is a
native checkout in every worktree now, so the fallback names the worktree again and the deploy
stops with "not found". Deploying from the main checkout instead ships main's source, which is the
wrong code exactly when the branch is unmerged (decisions.md 2026-08-28 [process], second finding;
2026-05-15 [technical], alternative b). The workaround so far has been a temporary link.

## Appetite

- **Blast radius: high for a small change.** `scripts/deploy-functions.sh` is the only scripted
  path that uploads edge functions to prod, and its argument parsing and env-file lookup both
  change. `scripts/selfhosted/deploy-functions.sh` is the path every TEST deploy and every landing
  takes. A mistake in either parser can widen a deploy (one function becomes all) or narrow it
  (the defect being fixed). Nothing here changes what a deploy does on the server, which token it
  uses, or which project it targets.
- **Reversibility: git revert.** No migration, no server state, no stored format.
- **Decision density: zero.** No founder decision is needed.

## Invariants

- A plain deploy still deploys the checkout it is run from, and `--from-commit`,
  `--from-main-tip` and `--record-landing` still target the main lane without asking the lane
  resolver (decisions.md 2026-04-18 [process]; P1672 landing invariant).
- The stale-ancestry guard, the TEST deploy lock and the every-function probe run once per call,
  whatever the number of names (decisions.md 2026-11-04 [technical], P1612).
- A deploy with no name is the only full deploy. Only a full deploy prunes functions the checkout
  lacks. Naming functions never prunes.
- The hosted path stamps exactly the functions that uploaded (P1620), and reads the prod token only
  through the locked keyring (P1214, P1239). The env file supplies the project address, never a
  token.

## Solution

**Defect 1: accept several names, in one deploy.** Both scripts collect every positional argument
as a function name. The self-hosted script validates every name before it stages or uploads
anything, then stages all named directories plus `_shared` into the one bundle it already
builds. The wrapper forwards every name to the self-hosted script, and on the hosted path deploys,
stamps and smokes each named function through the loop it already has.

Why accept rather than refuse a second name: the two options differ in what runs. Refusing turns a
three-function redeploy into three runs, so three lock acquisitions, three uploads, three restarts
of the functions container and three probe sweeps, with TEST serving the branch's `_shared`
beside a mix of old and new functions between runs, and no record of which names are still to go
if run two fails. Accepting keeps it to one lock, one upload, one restart and one probe, and adds
no new state: the server half of both targets (the main-lane remote step and the lane controller)
already replaces whatever set of directories the bundle holds. Recommend accept over refuse on
stability: fewer processes, fewer restarts, no intermediate mixed state.

Four rules keep the wider input from failing quietly in a new way. They hold in both scripts:

- A name that is not a bare function name (lower-case letters, digits and hyphens), or has no
  directory, refuses the whole call before anything is uploaded, wherever it sits in the list.
  On the hosted path this is new: `alpha-fn _shared`, or `alpha-fn beta-fn/` as tab completion
  leaves it, used to pass the directory check, upload the first name and fail on the second. Every
  function directory in the repository today fits the rule.
- On prod, every name is checked before the prod token is asked for, so a mistyped name never
  costs an authorization dialog.
- An empty name is refused. Before, an empty argument (an unset variable in quotes) counted as "no
  name" and ran the full, pruning deploy.
- A name given twice is deployed once.

The self-hosted script prints the names it is deploying, so the output can be checked against the
command.

**The same class, in the same loop: `--env` must carry a value.** `fn --env`, `--env=` and
`--env --help` used to fall through to a TEST deploy with exit 0 when the operator meant prod, and
`--env` alone deployed everything there. The wrapper now refuses a missing value, an empty value,
or a value that starts with a hyphen. Each value is checked where it is read, so a later valid
`--env` cannot hide an earlier one that had none: `--env --env prod` and `--env "" --env local` are
refused. It does not restrict which names are accepted: anything else that is not `prod` still
means TEST, as before.

**Defect 2: resolve the main checkout from git.** When `.env.prod` is not in the checkout being
deployed, the wrapper looks in the main checkout, found as the parent of git's common directory.
That is the same resolution other scripts here already use to reach main from a worktree. A
checkout's own `.env.prod` still wins when it exists. When neither exists, the error names both
places it looked. The parent is used only when the common directory is named `.git`: a bare
repository, or a git directory kept somewhere else, has no main checkout, and its parent is an
unrelated folder.

**A prod deploy from a worktree says what it is before it asks for the token.** Finding the env
file makes this run reach prod by default, where it used to stop. The run still ends non-zero
after the upload and the smoke, because the manifest stamp refuses this repository's worktrees,
and the remedy that failure prints is to re-stamp from the main checkout. Before the branch is
merged that re-stamp records main's source, so the drift check would report prod in sync while
prod runs the branch. So a prod run in a worktree prints one notice before the token prompt (this
deploys the worktree's code, do not re-stamp from main until the branch is merged), and every
re-stamp hint printed after a failed stamp says "only after this branch is merged". The notice
keys on being in a worktree, whichever checkout the env file came from, because the trap applies
either way.

Two details keep those messages true. The stamp refuses by path (a working directory under
`.claude/worktrees`), not by asking git, so the notice promises a non-zero exit only there; a
worktree kept somewhere else gets the rest of the notice without that promise. And when the smoke
fails after a failed stamp, the smoke message no longer says the manifest records the upload.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The new parser breaks an invocation that works today | MITIGATE | The canary runs every documented shape of both scripts (help text, callers, printed fix commands) with the deploy stubbed; the existing deploy canaries are re-run. |
| A prod deploy from a worktree now reaches the upload, then the manifest stamp refuses (it refuses a working directory under `.claude/worktrees`, by design) and the run ends non-zero with the re-stamp command | ACCEPT | Already the documented behaviour of this script once the env file is found: upload, smoke, then exit 1 naming the stamp. Before this fix the same run stopped earlier with nothing deployed. The prod token still needs its keyring dialog on every run, so the lookup failure was never the gate. |
| Re-stamping from the main checkout hashes main's source, not the worktree's that was deployed | MITIGATE | Known since 2026-05-15 [technical], and made more likely here: a prod deploy from a worktree used to need a hand-made link and is now the default path, ending at a printed re-stamp command. Mitigated by the notice before the token prompt and the "only after this branch is merged" line under every re-stamp hint. The fix itself, a stamp that records the source that was deployed, stays deferred. An operator who ignores both lines can still stamp main's source over branch code. |
| The main checkout cannot be derived (a bare repository, or a git directory kept outside the checkout) | MITIGATE | The parent of git's common directory is used only when that directory is named `.git`. Otherwise there is no fallback: the deploy stops before anything is uploaded and names the one place it looked. Left open: a separate git directory that is itself named `.git` inside an unrelated folder holding an `.env.prod`. |
| A hosted function whose name has an upper-case letter or an underscore is now refused by name | ACCEPT | The hosted CLI allows such names; the self-hosted server never has. No function directory uses one today, and a single rule for both targets is what keeps a name from deploying to one and not the other. |
| The new canary is run by hand, not by the commit gate | DEFER | Wiring it needs the commit gate run to prove the wiring fires. Listed under Follow-ups. |

**Non-Goals**

- Do NOT change what a deploy does on the server, the guard, the lock, the probe or the manifest.
- Do NOT change `branch-functions-check.sh`: it keeps printing one deploy command per function.
- Do NOT make the wrapper refuse unknown flags. It still ignores the flag itself (`--help`
  included, which then deploys everything to the active TEST server). One thing did change as a
  side effect: the VALUE of an ignored flag is now read as a function name and refused, where the
  old loop let a later name overwrite it. `--from-commit abc123 fn-a` on the wrapper used to deploy
  `fn-a` from the working tree with the flag silently dropped; it now stops on `abc123`.
- Do NOT touch the manifest stamp's worktree refusal.
- Do NOT add a second positional meaning (paths, globs, comma lists). Names only.
- Do NOT restrict which `--env` names are accepted. Only a missing, empty or flag-shaped value is
  refused.

## Done-When

All checked by `bash scripts/test-p1690-deploy-args.sh` (hermetic: throwaway repositories, stubbed
`gcloud`, `curl`, `supabase`, keychain and sibling scripts, a fake env file; no server, no secret).

- [x] Self-hosted, two names: both functions are replaced on the stand-in server, a third function
      that was not named is left as it was, exit 0, and the output names both (canary A1).
      `[post-deploy]` read the "Named functions" line on the first real multi-name TEST deploy.
- [x] Self-hosted, three names: all three are replaced in one upload, and a function that exists
      only on the server is not pruned (canary A2).
- [x] Self-hosted: a name with no directory, a name that is not a bare function name, and an empty
      name each refuse the whole call with a non-zero exit and no upload, in first or last position
      (canary A3).
- [x] Self-hosted: a repeated name deploys once and leaves no nested copy (canary A4).
- [x] Self-hosted lane: the bundle sent to the lane controller holds the named directories and no
      full-deploy marker; with no name it holds every function and the marker (canary A5; the
      controller and the lane resolver are stand-ins, so the controller's handling of several
      directories is read from its code, not run).
- [x] Wrapper to self-hosted: every name given is forwarded, in order, also with a flag between
      two names (canary B).
- [x] Wrapper to hosted (`--env prod`): every name given is deployed, stamped and smoked; a function
      on the open list keeps its flag beside another name and only it gets the flag (canary C,
      against a stand-in CLI that refuses the names the real one refuses).
- [x] Wrapper to hosted: a name with no directory, the shared library, a trailing slash, a `./`
      prefix, a dot, a path and a name with a space each refuse the whole call with nothing
      uploaded, nothing offered to the CLI, and the prod token never asked for (canary C2).
- [x] `--env` as the last argument, alone, with an empty value, followed by a flag, or typed twice
      before its value is refused with nothing run, also when a later `--env` is valid;
      `--env test`, `--env local`, `--env=local`, `--env prod`, `--env=prod` and
      `--env hosted-test` parse as before (canary B2, C).
- [x] `--env prod` from a linked worktree with no `.env.prod` of its own reads the main checkout's
      and deploys to the project that file names; a worktree's own file wins when present; with
      neither, the run stops before any upload and names both places (canary D, a real
      `git worktree`). `[post-deploy]` confirm on the next real prod deploy from a worktree.
- [x] A prod run in a worktree prints the notice before the prod token is asked for (shown with the
      token declined), and the re-stamp hint after a refused stamp, in both places the script
      prints one, says to wait for the merge. A run from the main checkout prints neither, also
      when the main checkout is reached through a symbolic link (canary D).
- [x] The notice promises a non-zero exit only where the stamp refuses: in a worktree under
      `.claude/worktrees` the run does end non-zero; in a worktree kept elsewhere the stamp runs,
      the run exits 0, and the notice makes no such promise. The canary fails if the real stamp
      script stops refusing by that path rule (canary D).
- [x] When the smoke fails after a refused stamp, the smoke message says the manifest was not
      updated; after a successful stamp it still says the manifest records the upload (canary D).
- [x] A worktree of a bare repository never reads an `.env.prod` from the folder beside the
      repository: refused, nothing uploaded, token never asked for (canary D).
- [x] Every documented invocation of both scripts behaves as before: no name, one name,
      `--from-commit` with and without a name, `--from-main-tip` with the landing flags, `--setup`,
      `--check-secrets`, `--help` (first and last line compared with the header), the refused
      hosted flags, `--env prod`, `--env=prod`, a name before or after `--env prod` (canary A6, B,
      C; the six existing deploy canaries pass unchanged before and after).
- [x] Recorded once, not repeated by a normal canary run: the canary fails against the two scripts
      as they were before this change, and against a copy with each fix removed (one mutant per
      rule; counts in the build reports). To repeat the first control, expect exit 1 from:
      `git show a4affff77:scripts/deploy-functions.sh > "$TMPDIR/w.sh"`, the same for
      `scripts/selfhosted/deploy-functions.sh` into `"$TMPDIR/s.sh"`, then
      `P1690_WRAPPER_UNDER_TEST="$TMPDIR/w.sh" P1690_SELFHOSTED_UNDER_TEST="$TMPDIR/s.sh" bash scripts/test-p1690-deploy-args.sh`.

## Known limitations

Each found in review, checked, and left as it is:

- The main-checkout lookup uses `git rev-parse --path-format=absolute`, which needs git 2.31 or
  later. On an older git the lookup returns nothing and a worktree prod deploy stops with "not
  found", as it did before this change. Not new to this repository: 37 files under `scripts/`
  already used the same option before this change, among them `keyring.sh`, which every prod
  deploy sources.
- A hosted TEST deploy from a worktree gets no worktree notice, and its re-stamp hint carries no
  merge caveat: the worktree check runs for prod only. Hosted TEST is switched off by default.
- The self-hosted script's value-taking flags read whatever follows as their value. A missing value
  is refused by name (`--from-commit` alone: "needs a commit"). `--from-commit` followed by a flag
  is refused as "not a commit" (both run in canary A6). `--lock-wait` followed by a flag is refused
  as not a number, and `--record-landing` followed by a flag takes the flag as the landed commit
  without complaint (these two read from the code, not run). Only the landing job passes
  `--record-landing`, always with a commit.
- A separate git directory that is itself named `.git`, in an unrelated folder that also holds an
  `.env.prod`, is taken for the main checkout. Git reports that folder as the main worktree too,
  so no rule built on git's answers can tell them apart.
- The wrapper copies the stamp's path rule to decide whether to promise a non-zero exit. The
  canary checks the real stamp script still contains that rule, so a change there fails the canary
  instead of leaving the notice wrong.

## Follow-ups

Seen while doing this work, deliberately not changed here, to be filed separately:

- `scripts/selfhosted/deploy-functions.sh --check-secrets` exits 1 and prints a blank where it
  should print "none" when no required secret is missing. No canary asserts its exit code.
- `scripts/deploy-functions.sh` ignores unknown flags, so `--help` deploys every function to the
  active TEST server.
- `scripts/test-p1690-deploy-args.sh` is run by hand. Wiring it into the commit gate, beside the
  hosted deploy canary that already runs when the wrapper is staged, needs a gate run to prove the
  wiring fires.

## Related

- Promoted from the task inbox, 2026-11-16.
- decisions.md 2026-11-13 [process] (the day of testing), 2026-11-04 [technical] (P1612),
  2026-08-28 [process] and 2026-05-15 [technical] (the `.env.prod` lookup), 2026-04-18 [process]
  (a deploy uses the checkout it runs from).
- P1612 (guard, lock, probe), P1312 (branch functions check), P1620 (stamp what deployed),
  P890 (hosted deploy canary), P1672 (lanes).
