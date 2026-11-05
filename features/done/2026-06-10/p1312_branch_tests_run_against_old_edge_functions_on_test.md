---
status: all-done
type: task
rank: 15
workstream: infrastructure
created_date: '2026-09-14'
tags:
  - edge-functions
  - e2e
  - deploy
  - testing
disclosure: public
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 188a40d2b3640f91187dc884089e4182e9bb00dae83fee5b97abada00fa48fd6
spec_review_vendors: [gemini, openrouter]
completed_at: 2026-11-05
---

# P1312: A branch's tests call the edge functions already deployed on shared TEST, so a run can prove nothing about the branch's own functions

## Problem

**Situation:** When a branch runs E2E locally, the app comes from the branch, but every edge-function
call goes to the one shared TEST server. Whatever was deployed there last is what answers. Nothing
connects the two. P1612 (2026-11-04) stops a checkout that is *behind main* from deploying, and
`deploy-drift.sh` compares the server with *main*. Neither compares the server with *this branch*,
and P1612's decision names the remaining gap: "Two current branches can still overwrite each other's
own function changes (P1312)."

**Complication, three real cases:**

- **P1307 (2026-09-14):** the branch raised `transcribe-slice`'s limits, and TEST still served main's
  function, so every audio slice was refused with a 400. The E2E suite stayed green, because no test
  checked that a slice was accepted. It was found by reading the browser console.
- **2026-06-30 (decisions.md [process]):** TEST was a version behind prod on `create-and-sign`.
- **2026-11-05:** another session's deploy wiped a branch's round-update function mode from TEST
  before a latency run. It was caught only because that session happened to check.

The mechanism is measurable. Three things overwrite a branch's code:

1. A single-function deploy from any branch replaces all of `_shared`, the root `deno.json` and
   `deno.lock`, the router and the JWT list. Read from the server's manifest on 2026-11-05: all of
   `_shared` came from `feature/p1529-sales-mastermind-room` with uncommitted changes.
2. A full deploy replaces every function and prunes those the deploying checkout lacks.
3. A landing that changes a deployed input runs a detached full deploy of main (`deploy-on-land.sh`).

**Question:** How does a branch's evidence run tell the truth about whether its changed functions, and
the shared code they run on, are what TEST serves, at the start and end of the run, without anyone
having to remember?

**In plain terms.** The branch builds a new phone that needs a new charger. There is one charger desk,
and every team swaps chargers on it. The tests plug the new phone into whatever is on the desk, see the
screen light up, and report success. With this spec, the run looks at the charger before and after
testing, says so when it is not the branch's, and leaves a record. It does not stop teams swapping
chargers, it does not prove every behaviour of the new function, and **a branch that changes no
function gets no check at all**, so a client-only branch still runs on whatever is there.

## Appetite

Blast radius: high, because it adds a refusal to the evidence step and runs at the start and end of
every local E2E run on a branch that changes functions. Reversibility: high (scripts, git revert).
No function code changes and no deploy to prod. Decision density: one founder call, recorded below.

## Invariants

- The check reads the files on the server by content, and the functions container's state. The manifest
  supplies only who deployed them, for the message: a missing manifest means "deployer unknown", never
  `unknown` as a verdict.
- It never reads or deploys prod.
- When it cannot determine the state, it says `unknown` and never reports a pass.
- It raises no keychain prompt.
- A branch that changes no deployed file makes no network call.

## Solution

**Step 1, measurement (done 2026-11-05; replaces the earlier build-id plan).** The original plan
injected a build id into every function, needing a change to each function and one full redeploy to test
and prod. That plan predates self-hosted TEST. Today the server's files can be hashed directly: one
`gcloud compute ssh ... --tunnel-through-iap` call measured 3.7 s, read-only, using the login the drift
check already relies on and no keychain item. Hosted TEST is paused and out of scope.

**Step 2, `scripts/selfhosted/branch-functions-check.sh`.** Evaluated in this order:

1. **Changed set:** `git diff --no-renames --name-only <merge-base with main>` against the working tree,
   plus `git ls-files --others --exclude-standard`, under `DG_INPUT_PATHS`, filtered through
   `dg_filter_deployed_repo_paths`. Empty: `no changed functions`, exit 0, no network.
2. **Local reasons for `unknown`, no network:** a failed landing deploy recorded in `dg_land_failed_file`;
   the deploy lock held (`dg_lock_dir_of`), which means a deploy is under way.
3. **Target:** `active_test_target` must say `selfhosted`, and `VITE_SUPABASE_URL` when set must match it.
4. **One SSH call** returning the manifest, the file hashes, the container's health and `StartedAt`, and
   the newest function file's mtime, closed by an end-of-output sentinel. A missing sentinel is `unknown`.
   A 45 s deadline covers the whole check.

**What is compared.** Local content against server content by SHA-256:

- Every changed file. A branch-deleted file the server holds differs, and a branch-added file it lacks
  differs.
- Also, because `match` must mean the function runs on this branch's code: the whole directory of each
  changed function, all of `_shared`, root `deno.json` and `deno.lock`, the router and the JWT list. A
  file in this wider set **that the branch did not change** differs only if the server's copy is also not
  main's tip copy. Server holding main's newer version of a file the branch left alone is what the branch
  gets after a rebase, so it passes.

The container must be healthy and started after the newest function file's mtime, otherwise `unknown`:
files on disk that the running process has not loaded are not served code.

**Status line, exit code as contract:**

- `no changed functions` exit 0
- `match: <n> file(s)` exit 0
- `differs: <path or function> (server has <branch> from <time>[, uncommitted])` exit 1, then the fix
- `unknown: <reason>` exit 2

Branch names from the manifest are stripped of `<>|` (`shell-safety.md`). `deno.*` files have no `D` line,
so their provenance reads from `_shared`'s, which every deploy writes together. Does not reuse drift's
`say()`, which turns exit 0 into 1. Path mapping is extracted from `deploy-drift.sh` to `deploy-guard.sh`
in both directions.

**The fix it prints, and it must be a command that works:**

- Behind main on a deployed file (`dg_stale_files` non-empty): rebase first, because the deploy would refuse.
- Changed functions: one `deploy-functions.sh <fn>` per changed function, because the script takes one name.
- Changes only in `_shared`, `deno.*`, the router or the JWT list: `deploy-functions.sh <first function
  alphabetically>`, since any named deploy carries them, and `_shared` is not a valid name.
- A branch-deleted function: the full deploy, with a warning that it replaces and prunes other sessions'
  functions.
- Every form states that a deploy recreates the shared functions container.

**Step 3, verdict module and wiring.** `scripts/lib/branch-functions-verdict.mjs` is pure and takes start
and end results to a verdict, on the `reused-server-check.mjs` pattern, so it can be tested without
Playwright. Anything other than exit 0/1/2 with the expected prefix is `unknown`.

| Start | End | Verdict | With `E2E_REQUIRE_FUNCTIONS=1` |
|---|---|---|---|
| none | none | not-applicable: nothing was compared | pass |
| match | match, same HEAD, same container start | trusted | pass |
| match or none | any other end, a different HEAD, or a different container start | changed or unconfirmed during the run: results untrusted | fail |
| differs or unknown | any | started on other code: results untrusted | refused at setup |

- `e2e/global-setup.ts` runs the check when a local webServer is in use and not in CI, and records the
  result in `process.env` (setup and teardown share the runner process). Default: a loud warning, continue.
  With the flag: throw. Playwright registers teardown before setup, so teardown still runs after a refusal,
  and it must then skip the second check.
- `e2e/global-teardown.ts` takes the `config` argument Playwright passes and uses the same gate. It runs its
  check **before** the `isTestProjectUrl` return, retries `unknown` once, then does the existing cleanup, and
  throws only at the very end in a `finally`, so a failure never leaks test users. Runs outside the 60 s
  cleanup budget. The header's "never fails the run" is updated to name this exception.
- **Skipped** by the same gate: no webServer (`PROD_SMOKE_URL`, `CSP_SMOKE_URL`), CI, `VERIFY_PROD`,
  `E2E_LOADTEST`, and `--ui`/`--list` (the `e2e-test-db-lock.mjs` argv rule). `e2e/offline/` has its own setup
  and calls no functions, so it is excluded. `playwright.p1608.config.ts` shares these hooks and is in scope.
- **Receipt:** every checked run appends one JSON line to `<git-common-dir>/cp-function-checks.jsonl` with
  time, branch, SHA, flag state, start, end and verdict. It is what the agent quotes as evidence, and what
  the falsifier below counts. Teardown's last output is one line starting `FUNCTIONS:`, because
  `.claude/rules/tests.md` tells agents to log to a file and grep the counts, which hides warnings.

**Step 4, the evidence step.** `dev.md` step 4 ("Run tests") and `fix.md`'s equivalent tell the agent to run
E2E evidence with `E2E_REQUIRE_FUNCTIONS=1`, `grep FUNCTIONS:` alongside the counts, and quote that line. Any
non-Playwright measurement, such as a latency run, calls the script directly before and after. These are skill
files, so they land on `main` in a separate commit (`.claude/rules/skills.md` Branch Guard).

Founder decision, 2026-11-05: **refuse and print the deploy command**, never auto-deploy. The founder was told
the recommendation ("detection comes first", with prevention deferred) and answered "do the lasting fix".
Auto-deploy would silently switch a function another session is testing against.

**Step 5, the deploy says what it replaces.** Inside the existing remote block of
`selfhosted/deploy-functions.sh`, before the manifest merge, with no new SSH call, it prints
`replacing <dir> deployed by <branch> at <time>[, uncommitted]` for each directory about to be replaced or
pruned, derived from the stage. It prints when the previous deployer is another branch, or when the previous
deploy had uncommitted changes, whichever branch that was. It never blocks. A landing's output goes to a log
nobody watches, so this serves interactive deploys only.

**Step 6, the response-status rule.** The check proves the code is there, not that it works. A client change
depending on new function behaviour must include an E2E assertion on that function's response status for a real
payload. It goes in `docs/technical/e2e-testing-guide.md`, referencing P1307's "a live slice sent while
transcribing is accepted by transcribe-slice" in `e2e/p1307-event-transcription.spec.ts`. The earlier plan also
wired `/generate-tests`, archived 2026-10-20 (P1514), so that part is dropped.

## Alternatives Considered

- **Deploy-injected build id in every function.** Rejected after measuring: a change to every function and a
  prod redeploy to obtain what hashing gives directly, and a build id proves what the deploy claimed rather than
  what is on disk.
- **Compare only the files the branch changed.** Rejected in review: the branch's function could run on another
  branch's `_shared` and report `match`, the state the 2026-11-05 manifest shows.
- **Compare everything against the branch with no main exemption.** Rejected: every unrelated landing would
  refuse every function-changing branch over files it never touched.
- **A server per branch, or per-branch function paths.** Prevents overwrites but adds a function server per
  branch and its failure modes. Deferred: falsifier below.
- **A lease that blocks other deploys while a run is live.** Adds a state machine with stuck-lease failures and
  blocks other sessions. Deferred with the same falsifier.
- **Stop single-function deploys replacing `_shared`.** Rejected: a function needs the `_shared` it was written
  against, so a partial `_shared` can stop a worker booting, the P1536 failure.
- **Only main may deploy.** Already rejected in P1612: branches could not test their own functions.
- **Trust a manifest.** A record proves that a stamp ran (decisions.md 2026-09-07).

**Falsifier for choosing detection over prevention:** the receipt shows refusals often enough that evidence runs
regularly wait on redeploys, or redeploys keep interrupting other sessions.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Two branches changing one function flip it on TEST | ACCEPT | Inherent to one shared server; the check makes it visible |
| A refused run's redeploy recreates the container and interrupts another session's run | ACCEPT | That session's teardown reports it; the message states the cost |
| A landing overwrites every branch's functions | ACCEPT | Reported as `deployed by main`, and the fix reads rebase and redeploy |
| A scoped run touching no function still refuses under the flag | ACCEPT | The flag is for evidence runs only; a plain hand run warns |
| One SSH call added at each end of a run on function-changing branches | ACCEPT | About 4 s by measurement, 45 s deadline |
| A transient tunnel failure turns a finished evidence run red | MITIGATE | Teardown retries `unknown` once |
| Editing a function during a run reports `differs` | ACCEPT | True; the message names the deployer, so the editor may misread it |
| A deploy straddling the hash read | ACCEPT | Every deploy recreates the container, so one restored before teardown is caught by the changed container start |
| Committing during an evidence run fails it, even with unchanged files | ACCEPT | Fails in the safe direction; commit before or after the run |
| A function needing a new secret passes the check | ACCEPT | Secrets are outside this check |
| Client-only branch on another branch's functions | ACCEPT | No check; stated in plain terms and covered by Step 6 |

**Non-Goals**
- Do NOT change how or when prod deploys happen, or edit any function.
- Do NOT build the migration equivalent. That is P1211's territory.
- Do NOT add a pre-commit hook.
- Do NOT prevent overwrites. Detection only, per the falsifier above.
- Do NOT change `dg_stale_files` or `deploy-on-land.sh`, which also list without `--no-renames`.

## Done-When

Each scenario runs in hermetic canary `scripts/test-p1312-branch-functions-check.sh` on the P1612 canary's
pattern (stub gcloud, real scripts), unless marked otherwise.

- [x] A branch that changed a function not on the server: exit 1, names it and who deployed it, and the printed command works when run in the canary.
- [x] Documented sequences (gate 7c): deploy then check gives exit 0 using the real deploy script; deploy, edit, check gives exit 1.
- [x] A `_shared`-only change: differs when absent, matches when present, and its printed command works.
- [x] Two changed functions print two commands; a branch behind main prints rebase first; a deleted function prints the full deploy with its warning.
- [x] A rename: old path still on server and new path absent both differ.
- [x] Unchanged `_shared` file: another branch's copy differs (B deploys over A, A's check names B); main's tip copy passes.
- [x] A branch changing no deployed file: exit 0 and gcloud is never called.
- [x] Each gives exit 2, never a pass: server unreachable, gcloud logged out, deadline hit by a hanging stub, hosted active, URL mismatch, truncated output with no sentinel, lock held, failed landing recorded, container unhealthy, container older than the files.
- [x] A missing manifest with matching hashes: exit 0 with "deployer unknown".
- [x] Verdict module tests cover every row of the verdict table and malformed script output.
- [x] One real Playwright run per hook path, using an empty spec and a stub check script: warn and continue; refuse under the flag without a second check; a run whose end differs fails under the flag and cleanup still ran.
- [x] Each skip condition runs no check.
- [x] A checked run appends a receipt line and prints a `FUNCTIONS:` line.
- [x] Deploy prints `replacing _shared deployed by <branch>` for another branch's code and for uncommitted content, prints nothing for clean main or its own, and is not blocked by an unreadable manifest.
- [x] The P1612 canary still passes (`scripts/test-p1612-deploy-guard.sh`).
- [x] Live, read-only against the real TEST server: the check run from this branch, watched failing with a local-only function edit that is never deployed, and passing without it (gate 7). Pasted output.
- [x] `./scripts/keyring.sh requests` shows no new request across the live run.
- [x] `/dev` and `/fix` carry the evidence-step instruction, committed to main.
- [x] The response-status rule is in `e2e-testing-guide.md`.

## Related

- P1612: stale checkouts cannot deploy; drift against main. This spec is the branch half.
- P1307: where it was first found.
- P1211: the same failure shape for migrations.
- decisions.md 2026-09-07 [technical]: a manifest is not evidence of deployed state.
- decisions.md 2026-11-04 [technical]: P1612.

## Evidence limits

The live run on real TEST proved `differs` (a local-only edit, naming the other branch's `_shared`) and `no changed functions`, with no new keychain request. `match` on the real server was not exercised, because that needs a deploy that recreates the shared container, and TEST was serving another branch's `_shared`. `match` is proven only in the canary. The first real function-changing branch to run under the flag is its live proof. If `match` then never appears on correctly deployed code, suspect the container-start comparison first.

Final results: canary 221/0, P1612 canary 236/0, unit 70/70. The fix that stops suggesting a redeploy of an already matching function has no dedicated canary row.

## Review log

- 2026-09-14, one Opus hostile reviewer: BUILD AFTER EDITS, on the earlier build-id design.
- 2026-11-05, rewritten design. Gemini, GLM and Opus reported; Codex ran and returned no review. 3 of 4 received.
  Folded: comparing shared inputs (Gemini 1, Opus B1), working fix commands (Opus B2), receipt and `FUNCTIONS:`
  line (Opus B3), container state, rename handling, teardown gate and ordering, skip list, one SSH call, deadline,
  sentinel, provenance, landings. Dropped: Gemini 2 (stale local main), because worktrees share `refs/heads/main`
  and a merge-base diff shows only the branch's own changes. Re-run by command: deploy takes one name, `_shared`
  fails the name regex, Playwright registers teardown before setup, `e2e/offline` has its own setup.
