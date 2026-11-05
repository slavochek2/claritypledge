---
status: in-progress
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
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
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

The mechanism is measurable. A single-function deploy replaces **every** `_shared` file
(`deploy-functions.sh` stages all of it), so deploying function A overwrites a `_shared` change
another branch needs for function B. Read from the server's manifest on 2026-11-05: all of `_shared`
came from `feature/p1529-sales-mastermind-room` with uncommitted changes, deployed at 12:32 UTC.
`deploy-drift.sh` reported `branch-only: _shared dispatch-event-emails send-event-emails` at that
moment. Its answer is about main, so it cannot tell a branch whether its own code is there.

**Question:** How does a branch's evidence run tell the truth about whether its changed functions are
what TEST serves, at the start and at the end of the run, without anyone having to remember?

**In plain terms.** The branch builds a new phone that needs a new charger. There is one charger
desk, and every team swaps chargers on it. The tests plug the new phone into whatever is on the desk,
see the screen light up, and report success. With this spec, the run looks at the charger before and
after testing and says so when it is not the branch's. It does not stop teams swapping chargers, and
it does not prove every behaviour of the new function.

## Appetite

Blast radius: high, because it adds a refusal to the evidence step and runs at the start and end of
every local E2E run on a branch that changes functions. Reversibility: high (scripts, git revert).
No function code changes and no deploy to prod. Decision density: one founder call, recorded below.

## Invariants

- The check reads the files the functions container **actually serves**, by content. The manifest
  supplies only who deployed them, for the message.
- It never reads or deploys prod.
- When it cannot determine the state (server unreachable, gcloud logged out, deadline passed, hosted
  TEST active), it says `unknown` and never reports a pass.
- It raises no keychain prompt.
- A branch that changes no deployed file makes no network call.

## Solution

**Step 1, measurement (done 2026-11-05; replaces the earlier build-id plan).** The original plan
injected a build id into every function, needing a change to each function and one full redeploy to
test and prod. That plan predates self-hosted TEST. Today the server's files can be hashed directly:
`gcloud compute ssh ... --tunnel-through-iap` round trip, measured at 3.7 s total, read-only, using
the login the drift check already relies on and no keychain item. So no function changes and no prod
deploy are needed. Hosted TEST is paused and out of scope; when it is the active target the check
answers `unknown`.

**Step 2, `scripts/selfhosted/branch-functions-check.sh`.**

- Changed set: `git diff --name-only <merge-base with main>` against the **working tree**, plus
  untracked files, both under `DG_INPUT_PATHS` and filtered through
  `dg_filter_deployed_repo_paths`, so the deployed-file rule has one home. Uses `scripts/lib/active-test.sh`
  for the target.
- Compares each changed file's local content with the server's by SHA-256, per file. Uses the same
  path mapping as `deploy-drift.sh` (extract it to `deploy-guard.sh` rather than copy it). A `_shared`
  file is compared as itself, which needs no import mapping: if the file the branch changed is on the
  server, the branch's change is there.
- A file the branch deleted that the server still holds counts as differing. A file the branch added
  that the server lacks counts as differing.
- One status line, exit code as contract:
  - `no changed functions` exit 0, no network
  - `match: <n> file(s)` exit 0
  - `differs: <function> (server has <branch> from <time>[, uncommitted])...` exit 1, with the command
    to deploy this branch's copy
  - `unknown: <reason>` exit 2
- Output follows `shell-safety.md`: no redirect or pipe tokens in the status line.

**Step 3, wired into every E2E run.**

- `e2e/global-setup.ts` runs it when a local webServer is in use and not in CI, which already covers
  the `PROD_SMOKE_URL` and `CSP_SMOKE_URL` skip. Exit 1 or 2 prints a loud warning and continues.
- `e2e/global-teardown.ts` runs it again, because a deploy during the run is the 2026-11-05 shape. If
  the start was a match and the end is not, it prints that the run's results cannot be trusted and
  names who deployed. This runs outside the existing 60 s cleanup budget, under its own deadline, and
  before the existing `isTestProjectUrl` return.
- With `E2E_REQUIRE_FUNCTIONS=1`, a non-match refuses at setup and fails the run at teardown. The
  teardown header's "never fails the run" stays true for cleanup and is updated to name this one
  exception.

**Step 4, the evidence step.** `/dev` and `/fix` tell the agent to run the E2E evidence run with
`E2E_REQUIRE_FUNCTIONS=1`, and any non-Playwright measurement (such as a latency run) to call the
script directly before and after. These are skill files, so they land on `main` in a separate commit
(`.claude/rules/skills.md` Branch Guard).

Founder decision, 2026-11-05: **refuse and print the deploy command**, never auto-deploy. The founder
was told the recommendation ("detection comes first", with prevention deferred) and answered "do the
lasting fix". Auto-deploy would silently switch a function another session is testing against.

**Step 5, the deploy says what it replaces.** `selfhosted/deploy-functions.sh` reads the server's
manifest before uploading. For each directory it is about to replace, always including `_shared`,
whose last deployer is neither main nor this branch, it prints:
`replacing <dir> deployed by <branch> at <time>`. It never blocks, and a manifest it cannot read
prints that it could not tell. This is what lets the deployer see the collision while it happens.

**Step 6, the response-status rule.** The check proves the code is there, not that it works. A client
change depending on new function behaviour must include an E2E assertion on that function's response
status for a real payload. It goes in `docs/technical/e2e-testing-guide.md`, referencing P1307's "a
live slice sent while transcribing is accepted by transcribe-slice" in
`e2e/p1307-event-transcription.spec.ts`. The earlier plan also wired `/generate-tests`, archived
2026-10-20 (P1514), so that part is dropped.

## Alternatives Considered

- **Deploy-injected build id in every function.** Rejected after measuring: a change to every function
  and a prod redeploy to obtain what hashing the server's files gives directly, and a build id proves
  what the deploy claimed rather than what is on disk.
- **A server per branch, or per-branch function paths.** Prevents overwrites but adds a function server
  per branch and its failure modes. Deferred: falsifier below.
- **A lease that blocks other deploys while a run is live.** Adds a state machine with stuck-lease
  failures, and blocks other sessions' work on a shared server. Deferred with the same falsifier.
- **Stop single-function deploys replacing `_shared`.** Rejected: a function needs the `_shared` it was
  written against, so a partial `_shared` can stop a worker booting, the P1536 failure.
- **Only main may deploy.** Already rejected in P1612: branches could not test their own functions.
- **Trust the manifest's `test` section, or `deploy-manifest.tsv`.** A record proves that a stamp ran
  (decisions.md 2026-09-07).

**Falsifier for choosing detection over prevention:** overwrites keep blocking evidence runs after this
ships, measured by how often refusals fire and whether they delay a run by more than a redeploy.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Two branches changing one function flip it on TEST | ACCEPT | Inherent to one shared server; the check makes it visible |
| Refusal when another session redeployed, so runs wait | ACCEPT | Redeploy takes one command, and false evidence costs more |
| Adds two SSH round trips to E2E runs on function-changing branches | ACCEPT | About 4 s each by measurement; other branches pay nothing |
| gcloud logged out makes every such run warn | ACCEPT | Warning continues; only evidence runs refuse, and that is correct |
| A deploy lands after the teardown check | ACCEPT | Results were already produced before it |
| Deploy during a test, restored before teardown | ACCEPT | Not seen by two point-in-time reads; the server's deploy manifest timestamp could show it later if it recurs |

**Non-Goals**
- Do NOT change how or when prod deploys happen, or edit any function.
- Do NOT build the migration equivalent. That is P1211's territory.
- Do NOT add a pre-commit hook.
- Do NOT check files this branch did not change, including another branch's `_shared` edits to a file
  this branch left alone.
- Do NOT prevent overwrites. Detection only, per the falsifier above.

## Done-When

Each scenario runs in a hermetic canary, `scripts/test-p1312-branch-functions-check.sh`, on the P1612
canary's pattern (stub gcloud, real scripts), unless marked live.

- [ ] Step 1 measurement is written in this spec with its number.
- [ ] A branch that changed a function not on the server: exit 1, names it and who deployed it.
- [ ] A branch whose changed files are on the server: exit 0, and E2E starts with no warning (gate 7c).
- [ ] An uncommitted edit counts: committed copy on server, working copy changed gives exit 1.
- [ ] A `_shared`-only change is detected, and matches when that file is on the server.
- [ ] A branch-deleted file still on the server, and a branch-added file missing from it, both give exit 1.
- [ ] A branch changing no deployed file: exit 0 and gcloud is never called.
- [ ] Server unreachable, gcloud logged out, deadline passed, hosted TEST active: each exit 2 `unknown`, never a pass.
- [ ] Two branches: B deploys over A, A's check names B.
- [ ] Setup warns and continues by default; with `E2E_REQUIRE_FUNCTIONS=1` a non-match refuses.
- [ ] Teardown: start match and end differs reports untrustworthy results; with `E2E_REQUIRE_FUNCTIONS=1` it fails the run.
- [ ] Remote smoke modes skip the check (no webServer).
- [ ] Deploy prints `replacing _shared deployed by <branch>` for another branch's code, prints nothing for main's or its own, and is not blocked when the manifest is unreadable.
- [ ] The P1612 canary still passes (`scripts/test-p1612-deploy-guard.sh`).
- [ ] Live: the check run against the real TEST server from this branch, watched failing on a deliberately changed function and passing on an unchanged branch (gate 7). Pasted output.
- [ ] No keychain prompt during a live run.
- [ ] `/dev` and `/fix` carry the evidence-step instruction, committed to main.
- [ ] The response-status rule is in `e2e-testing-guide.md`.
- [ ] Founder decision recorded in this spec.

## Related

- P1612: stale checkouts cannot deploy; drift against main. This spec is the branch half.
- P1307: where it was first found.
- P1211: the same failure shape for migrations.
- decisions.md 2026-09-07 [technical]: a manifest is not evidence of deployed state.
- decisions.md 2026-11-04 [technical]: P1612.

## Review log

- 2026-09-14, one Opus hostile reviewer: BUILD AFTER EDITS, on the earlier build-id design.
