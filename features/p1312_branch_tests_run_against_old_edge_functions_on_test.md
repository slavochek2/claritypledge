---
status: backlog
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
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1312: A branch's tests call the edge functions already deployed on the test project, so a changed function is never tested before prod

## Problem

**Situation:** When a branch runs its E2E tests locally, the app code comes from the branch, but
every edge-function call goes to the functions currently **deployed on the shared test Supabase
project**. Nothing connects the two.

- `scripts/deploy-functions.sh` deploys to test only when someone runs it.
- The deploy manifest's `test` section cannot be trusted as the record of what test serves. The
  stamper refuses to run from a worktree (`scripts/stamp-deploy-manifest.sh:22-24`), and every
  branch deploys from a worktree, so the section rots. Measured 2026-09-14:
  `./scripts/check-deploy-manifest.sh --env test` exits 1 with 9 `FUNCTION_*` findings, including
  `FUNCTION_MISSING: transcribe-slice (not in manifest — never deployed to test)`. Nobody reads it
  because it is always red. Even when stamped, a manifest proves only that the stamper ran
  (decisions.md 2026-09-07 [technical]).
- The other checks look elsewhere: `check-deploy-drift.yml` checks prod only, and `edge-smoke.yml`
  runs on a schedule against prod, with a `transcribe-slice` row that never sends a real slice.

**Complication:** On P1307 (2026-09-14) the branch raised `transcribe-slice`'s limits
(320 KB / 8 s to 640 KB / 17 s) and moved the app to 13 s audio slices (416 KB). The test project
still served `main`'s function, so every audio slice was refused with
`400 {"error":"Slice exceeds the maximum size"}` (captured by an E2E test on the P1307 branch).
The P1307 E2E suite was green anyway, because no test checked that a slice was accepted; it was
found by reading the browser console during screenshot QA. The same class was seen on 2026-06-30
(decisions.md [process]): the test project was a version behind prod on `create-and-sign`, and the
proposed per-function sweep was never built.

**Question:** How do we make a branch's evidence run tell the truth when a function the branch
changed is not what the test project serves, without anyone having to remember to check?

> Founder framing, verbatim: "what is spec for ? what happens if we dont do it? explain sin simple suer or buisness terms withe xamples"

**In plain terms.** Picture the app and the server functions as a phone and its charger. The
branch builds a new phone that needs a new charger. The tests plug the new phone into the old
charger still on the desk, see the screen light up, and report success, while it never charges.
Without this spec, any branch that changes a server function can look fully tested while its main
action fails. The prod deploy order (functions before the app) is today's only protection, and it
works only when someone follows it. With this spec, the evidence run warns or stops when the
charger on the desk is not the one the branch built, and tests that depend on a function check
that the function actually said yes. It does not guarantee every behaviour of the new function is
tested.

## Appetite

Blast radius: medium. Every branch touching `supabase/functions/**`, a shared test project used by
concurrent sessions, and a one-time redeploy of every function to both projects.
Reversibility: high (scripts, a small change to each function, git revert).
Decision density: one founder call (below), after detection is measured.

## Invariants

- The check reads what the test project **actually serves**, never the deploy manifest.
- It never deploys to prod and never reads prod, except the one-time redeploy carved out below.
- When the check cannot determine the deployed state (network down, credential declined), it says
  so loudly and never reports the check as passed.
- It does not raise a keychain prompt on every test run.

## Solution

**Step 1 comes first and decides whether the rest is built.** Measure how to learn which code a
function on the test project is running. What is known:

- `supabase functions list --output-format json` exists (CLI 2.106.0). Whether it returns a
  per-function version or hash is **not measured**. If it returns a hash, that is likely of the
  bundled build, not the branch's source, and can be matched only by bundling identically. Treat as
  unusable until shown otherwise.
- The likely path is a **deploy-injected build id**: `deploy-functions.sh` injects the source hash
  (or git tree hash) at deploy time, and each function returns it in a response header. Every
  function changes once, and both projects need one full redeploy before any check means anything.

If no build id can be checked without redeploying every function, cut this spec to the response-
status rule plus a warning, and do not build a refusal.

**Step 2, detect.** List the functions this branch changed against the merge base. A change under
`supabase/functions/_shared/` counts as changing every function that imports the changed file.
`deploy-functions.sh` skips underscore directories (line ~78), so a directory-level diff alone
reports nothing for a `_shared`-only change. A function whose newer version from `main` is on test
reads as stale for this branch; that is correct.

**Step 3, act.** The test project holds **one version per function**. Two branches changing the
same function will conflict under any option; the check makes the conflict visible, it does not
remove it.

- A hand-run `playwright test some-file.spec.ts` **warns** and continues.
- The `/dev` step that claims E2E evidence **refuses** (or deploys) when a changed function is stale.
  [FOUNDER DECISION: at that step, refuse and print the deploy command, or auto-deploy the changed
  functions to test?] Recommendation: **refuse**. Auto-deploy silently switches a function another
  session is testing against, with no signal on their side.
- The check is skipped when Playwright runs against a deployed URL (`PROD_SMOKE_URL`,
  `CSP_SMOKE_URL`, `playwright.config.ts:180`).

**Step 4, the response-status rule.** This is what would actually have turned P1307 red. A client
change that depends on new function behaviour must include an E2E assertion on that function's
response status for a real payload, not only on the UI. It is a required test pattern, referenced
from `docs/technical/e2e-testing-guide.md`, and `/generate-tests` asks for it when a spec changes a
function. The reference implementation is P1307's "a live slice sent while transcribing is accepted
by transcribe-slice" in `e2e/p1307-event-transcription.spec.ts`.

## Alternatives Considered

- **Pre-commit warning when `supabase/functions/**` and `src/**` both change.** Rejected: most such
  branches change no contract, so it fires often and gets ignored, and it cannot see deployed state.
- **Compare the branch's source hash to the manifest's `test.functions` hash.** Rejected twice over:
  the stamper refuses worktrees, so the test section is never current, and a stamp proves only that
  the stamper ran (decisions.md 2026-09-07).
- **Fix the stamper to run from worktrees and trust the manifest.** Rejected for the second reason
  above; it would make the record current, not true.
- **Rely only on the prod deploy-order checklist line.** Keeps prod safe when followed, says nothing
  about what a branch's green run proved.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| No build id is readable from the test project | MITIGATE | Step 1 measures first; the spec shrinks to Step 4 + warning |
| Build-id header needs a change to every function and a full redeploy | ACCEPT | One-time; carved out of the prod non-goal |
| Two branches changing one function flip it on test | ACCEPT | Inherent to one shared project; the check makes it visible |
| Check needs a network call and a keychain-protected token | MITIGATE | Read the build id from a public response header, so no token is needed |
| `_shared/` import mapping is wrong | MITIGATE | If mapping is unreliable, treat any `_shared/` change as changing all functions |

**Non-Goals**
- Do NOT change how or when prod deploys happen, **except** the one-time redeploy of every function
  needed to add the build-id header.
- Do NOT build the migration equivalent (schema drift on test). That is P1211's territory.
- Do NOT add a pre-commit hook for this.
- Do NOT check functions this branch did not change.

## Done-When

- [ ] Step 1 measured and written into this spec: what `supabase functions list` returns per function,
      and the chosen build-id mechanism, with pasted output.
- [ ] Every function returns its build id, deployed once to test and to prod, verified by one
      request per project.
- [ ] A branch that changed a function not yet on test: the `/dev` evidence step refuses (or deploys,
      per the founder call) and names the function; a hand-run single E2E file warns and continues.
      Pasted output for both.
- [ ] A branch whose changed functions are on test: E2E starts with no warning (gate 7c).
- [ ] A `_shared/`-only change is detected as changing the functions that import it.
- [ ] Two branches that changed the same function: the second to run sees the first's version as
      stale and is told so.
- [ ] Runs under `PROD_SMOKE_URL` or `CSP_SMOKE_URL` skip the check.
- [ ] With the test project unreachable, the run says it could not check and does not report a pass.
- [ ] The check was watched failing on a deliberately stale function before it was trusted (gate 7).
- [ ] No keychain prompt appears on a normal E2E start.
- [ ] The response-status test pattern is in `e2e-testing-guide.md` and `/generate-tests` asks for it
      when a spec changes an edge function.
- [ ] Founder decision (refuse or auto-deploy at the evidence step) recorded in this spec.

## Related

- P1307: where it was found. Its KDD entry (decisions.md 2026-09-14 [process], "A branch's local
  E2E runs the client from the branch against the edge functions deployed on the test project") is
  on `feature/p1307-event-transcription` and reaches `main` when P1307 ships; this spec resolves it.
- P1211: the same failure shape for migrations.
- decisions.md 2026-09-07 [technical]: a manifest is not evidence of deployed state.
- decisions.md 2026-06-30 [process]: test project found behind prod on `create-and-sign`.
- decisions.md 2026-03-28 [process]: deploy drift check runs daily, prod only.

## Review log

- 2026-09-14, one Opus hostile reviewer: BUILD AFTER EDITS. All eight ranked edits applied. Its
  claims were re-run before editing: stamper worktree refusal (`stamp-deploy-manifest.sh:22-24`),
  9 `FUNCTION_*` findings on `check-deploy-manifest.sh --env test`, and `_shared` skipped by
  `deploy-functions.sh` were confirmed. Its claim that the P1307 decisions entry does not exist was
  true on `main` only; the entry is on the P1307 branch.
