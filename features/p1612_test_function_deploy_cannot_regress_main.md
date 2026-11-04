---
status: qa
type: task
rank: 90
workstream: infrastructure
created_date: '2026-11-04'
tags: [edge-functions, deploy, self-hosted, testing]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1612: A stale checkout can silently put old edge functions on the shared TEST server

## Problem

> Founder, verbatim: "how come these things were not deployed? Is there a gap in our process? ... let's close it sustainably so things are properly going to test and not like skipped."

**Situation:** Every session and the founder's dev server share one self-hosted TEST server. `scripts/selfhosted/deploy-functions.sh` ships whatever the current checkout holds. Even `deploy-functions.sh <fn>` replaces all of `_shared`.

**Complication:** On 2026-11-04 a session on `feature/p1604-transcription-belongs-to-chat` (86 commits behind main) deployed three functions. P1536 had been deployed to TEST and closed on main earlier, so this was not a skipped deploy: the shipped code was on TEST and then got overwritten. `_shared` fell from main's copy to the branch's old one (`canvas-material.ts` gone, terms `v1.7` back to `v1.6`). The results:

- `canvas-draft` crashed on boot, so the Canvas `+`, Clone and the workspace chat disappeared.
- A person who had accepted `v1.7` was told to accept the updated terms.
- The script reported success and `functions container: healthy`, because the container is healthy even when one worker cannot boot.
- Nothing recorded what TEST was serving. Finding the cause took a hand inspection of the VM.

This is a recurrence. The 2026-11-03 decision "a stale deploy looked like app failure" answered the same class with a prose instruction: redeploy after a rebase.

**Question:** How does TEST stop losing main's functions, and how does a mismatch get noticed without a human diagnosing symptoms?

## Appetite

Blast radius: every session testing on TEST, not prod. Reversibility: git revert. Decision density: zero founder decisions expected; `/ship` already owns landing on main.

## Solution

"Deployed inputs" below means everything a deploy overwrites: `supabase/functions` (`_shared`, `deno.json`, `deno.lock`), `supabase/selfhosted/functions-main/index.ts` and `supabase/no-verify-jwt-functions.txt`. `.test.ts` files are excluded, as the deploy already excludes them.

1. **Refuse a deploy from stale ancestry.** In both the full and the single-function form, compare the deployed inputs at `merge-base(HEAD, main)` and at `main`. Any difference refuses with exit non-zero, nothing uploaded, naming the file count and the fix (rebase onto main). The branch's own changes and uncommitted work stay allowed. No override flag: rebasing is always available, and an agent can forge a flag.
2. **Serialize it.** The self-hosted script itself takes the TEST deploy lock (today only the hosted wrapper does), and holds it from the ancestry check through the post-deploy probe. It re-reads `main` under the lock, so a ship landing while a deploy waits is seen. A lock left by a dead run is reported with its age, never silently removed.
3. **Record what the server holds, by content.** Each deploy writes a manifest on the server listing every deployed file's hash, plus per-function-directory the source commit, branch, UTC time and whether the tree was dirty. A single-function deploy updates only the entries it replaced, so a mixed server is described truthfully.
4. **Probe every function with OPTIONS after deploying.** OPTIONS passes the router's JWT check and reaches worker creation (`functions-main/index.ts:94,117`), and function handlers answer it without side effects. A boot error, any 5xx, a 404, a timeout or a transport failure fails the deploy and names the function. A 401, 405 or 429 passes and is printed per function: the worker answered, and four functions answer OPTIONS that way today. At least one function must answer 2xx. Probe all functions, because a `_shared` change breaks functions that were not the target.
5. **Report drift by content, in its own check.** A new read-only script compares the server manifest with the deployed inputs at `main`. It answers `in sync`, `differs: <functions>, of which behind main / branch-only`, or `unknown`, and `/day` shows that line. It does not extend `health.sh`'s SSH command or its scheduled `guest-attributes` mode, so a missing manifest cannot turn disk and WAL monitoring, or the hourly workflow, to unknown.
6. **Bring TEST forward on ship.** When a ship or `commit-to-main` lands a change to deployed inputs, deploy the exact landed commit, extracted to a temporary directory (`git archive`), never a working tree: a co-tenant's uncommitted edits and the caller's worktree must not ride along. A failed deploy does not undo the landing.

**Landing:** a landing never waits for a deploy. It starts the deploy in the background under a hard deadline, with a log, and returns at once; every gcloud call has its own deadline. The background job waits for a running deploy (bounded), then ships main's current tip, using the script from that tip, so quick landings end on the newest code. A lock whose owner is provably dead on this machine is cleared by that job; a live holder or an ownerless lock never is. A failed job leaves a record that the drift check and `/day` report. An interactive deploy still refuses at once.

**Limit:** the guard lives in the script, and an old branch runs its own old copy, so it protects a branch only once that branch has rebased past this change. 2026-11-04: six worktrees were 85 or more commits behind main.

**Scope of the guarantee:** this closes stale ancestry. A current branch that deliberately edits a shared file still deploys that edit; that is what branch testing is for, and the manifest shows it.

## Invariants

- A deploy from a checkout missing any function change on main never reaches the server (the 2026-11-04 failure).
- `--secrets` behaviour is not weakened; P1602's refusal rules stand when it lands (decisions.md 2026-11-03).
- The script never targets anything but the self-hosted server (P1557).
- A drift check that cannot read the stamp or the server answers `unknown`, never `in sync`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Comparing against a local `main` that is itself old | ACCEPT | Local main is where every worktree lands and ships from; no network dependency is added |
| A branch must rebase before testing a function change | ACCEPT | That is the point; a behind branch's result is not valid against main anyway |
| Two current branches overwrite each other's own function changes | DEFER | Shared-server limit, owned by P1312 (per-branch functions). The stamp makes it visible; P1312 unblocks the fix |
| Auto-redeploy on ship replaces a branch's functions under test | ACCEPT | That branch must rebase and redeploy, and the guard sends it there |
| Merge conflict with P1602's edits to the same script | MITIGATE | Keep the guard in a small sourced library, and rebase P1602 when it ships |
| Guard blocks a legitimate documented workflow (epistemic gate 7c) | MITIGATE | Done-When runs the documented forms through it |

**Non-Goals**
- Do NOT build per-branch function namespaces (P1312).
- Do NOT change hosted or prod deploy paths (`scripts/deploy-functions.sh`).
- Do NOT change migrations; this covers functions only.

## Done-When

- [x] A checkout behind main on a function, router or JWT-list path is refused, full and single-function, exit non-zero, nothing uploaded. Failure path shown with a real exit code. *(Harness sections with real exit codes; also refused when git itself fails.)*
- [x] A checkout behind main only on other paths deploys. A checkout current with main plus its own function change deploys, uncommitted changes included. A deploy from main deploys. These are the script's documented forms (epistemic gate 7c). *(Harness; plus a real full deploy from this branch on the real server: exit 0.)*
- [x] The controls use real git history in a throwaway repo, so the same check both passes and refuses. *(Throwaway repos; mutation controls failed the harness when the ancestry, probe and under-lock checks were disabled.)*
- [x] Main moving between the first check and taking the lock refuses. A second deploy while the lock is held refuses, and a stale lock is reported with its age. *(Harness. The race inside the script is shown at library level through a test seam.)*
- [x] A function that cannot boot makes the deploy exit non-zero and names only that function, including a protected function that answers 401 to POST, and including a function that was not the deploy's target. *(Harness only, not staged on the real server. The real run answered all 24 functions; the real boot error `InvalidWorkerCreation` was observed on 2026-11-04 from the stale deploy and is a 500, which fails the probe.)*
- [x] A real full deploy from main reads `in sync`. After a single-function deploy from a current branch with its own change, it reads `differs` and names that function as branch-only. With a server file replaced by an older copy, it reads behind main. With the manifest missing or the server unreachable, it reads `unknown`. *(Real server: `in sync`, exit 0, deployed from this branch current with main. The other three readings are harness only.)* `[post-deploy]` re-run after ship, from main.
- [x] `/day` shows the drift line, and `health.sh --source guest-attributes` exits as before. *(`cp.testfns` in day-cp.md and the check registry; `health.sh` has no diff.)*
- [x] Landing a change to deployed inputs deploys that commit's contents, proven with an uncommitted edit in the checkout that does not reach the bundle (test harness). A landing that touches none does not deploy. A failed deploy leaves the landing intact and prints the failure. *(Harness calls `deploy_test_on_land` and the `--from-main-tip` path. No real ship has run it.)* `[post-deploy]` first real landing that touches functions.
- [x] The recurrence is recorded in `docs/decisions.md`, replacing the prose remedy of 2026-11-03. *(`docs/decisions.md` 2026-11-04.)*

## Known Limitations

- A clearer that dies inside the dead-lock mutex, followed by two landings recovering it at the same moment, could let two deploys overlap. It needs three unlikely events in a few seconds, and the drift check would show the result.
- A landing job killed by its deadline can record a failure just after a later deploy succeeded, leaving a stale warning until the next deploy clears it.
- `deno.json` or `deno.lock` missing from the server reads `unclassified` in drift, not behind or branch-only. It still reads as drift.
- The hook's log is truncated at 200 KB by the next landing, which can cut a running job's log. The failure record is separate.
- Old branches run their own old script until they rebase; the global guard `~/.agents/guards/stale_test_deploy.py` covers them for Claude sessions. It is not registered for Codex or Gemini sessions.

## Alternatives Considered

- **Prose rule to redeploy after rebasing:** already tried on 2026-11-03; it recurred the next day.
- **Only main may deploy:** rejected. It stops branches testing their own function changes before ship, which widens P1312's gap.
- **A warning instead of a refusal:** rejected. The failing session ran the deploy inside a long command, with output sent to a log file, so a warning would not have been read.

## Rollback Strategy

Revert the commit. The server stamp is an inert file.

## Related

P1312 (branch tests run against old functions) · P1602 (same script, unshipped, `--secrets`) · P1557 · P1584
