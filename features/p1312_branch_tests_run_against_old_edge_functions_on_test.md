---
status: week
type: task
rank: 99
workstream: infrastructure
created_date: '2026-09-14'
tags: [edge-functions, e2e, deploy, testing]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1312: A branch's tests call the edge functions already deployed on the test project, so a changed function is never tested before prod

## Problem

**Situation:** When a branch runs its E2E tests locally, the app code comes from the branch, but
every edge-function call goes to the functions currently **deployed on the shared test Supabase
project**. `scripts/deploy-functions.sh` deploys to test only when someone runs it, and the deploy
manifest records only that someone did (decisions.md 2026-09-07: the manifest proves a stamp ran,
not what the project actually serves).

**Complication:** On P1307 (2026-09-14) the branch raised `transcribe-slice`'s limits
(320 KB / 8 s to 640 KB / 17 s) and moved the app to 13 s audio slices (416 KB). The test project
still served `main`'s function, so **every live-text request was refused with 400**. The P1307 E2E
suite was green anyway, because no test checked that a slice was accepted. It was found only by
reading the browser console during screenshot QA. If the app had been deployed to prod before the
function, real users would have lost live text while every test said green. The same class was
seen before: a 2026-06 entry found the test project a version behind prod on `create-and-sign` and
proposed a per-function sweep that was never built.

**Question:** How do we make a branch's test run fail, or refuse to run, when a function the branch
changed is not the version deployed on the test project, without anyone having to remember to check?

> Founder framing, verbatim: "what is spec for ? what happens if we dont do it? explain sin simple suer or buisness terms withe xamples"

**In plain terms.** Picture the app and the server functions as a phone and its charger. The
branch builds a new phone that needs a new charger. The tests plug the new phone into the old
charger that is still on the desk, check the phone's screen lights up, and report success, while
it never actually charges. Without this spec that can happen on any branch that changes a server
function: the team sees green, ships, and customers hit errors. With it, the test run either uses
the new charger or stops and says the charger is old.

## Appetite

Blast radius: medium. Every branch that touches `supabase/functions/**`, and a shared test project
other sessions use at the same time. Reversibility: high (scripts and a test helper, git revert).
Decision density: one real founder call (below).

## Invariants

- The check must read what the test project **actually serves**, never only the deploy manifest.
  A manifest stamp is written by the same actor it would be checking (decisions.md 2026-09-07).
- It must never deploy to or read from **prod**.
- A test run that cannot determine the deployed state must say so loudly. It must not report green
  as if the check passed.

## Solution

Before E2E runs on a branch, compare each edge function the branch changed against the version
deployed on the test project, and act on any mismatch.

- **Detect:** list functions under `supabase/functions/` that differ from `main` on this branch.
  For each, obtain what the test project serves: a version or hash the function reports, or the
  Management API's function metadata. `/architect` chooses which, after measuring what the API
  actually returns.
- **Act on mismatch:** [FOUNDER DECISION: which behaviour?]
  - **A. Refuse:** the E2E run stops before starting and prints which functions are stale and the
    exact deploy command. Nothing is written to the shared test project without a human choosing to.
  - **B. Auto-deploy:** the run deploys the branch's changed functions to the test project first.
    Nobody has to remember, but a branch overwrites a function other sessions' tests are using at
    the same time, and two branches can flip it back and forth.
  - Recommendation: **A**, because a shared project changed silently by one branch breaks
    another session's run with no signal (correctness over convenience).
- **Close the second hole found on P1307:** document in `docs/technical/e2e-testing-guide.md` that
  a client change depending on new function behaviour asserts the function's **response status**
  (P1307's `e2e/p1307-event-transcription.spec.ts` "a live slice … is accepted" is the example).

## Alternatives Considered

- **Pre-commit warning when `supabase/functions/**` and `src/**` both change.** Rejected by the
  P1307 KDD critic: most such branches change no contract, so it fires often and gets ignored, and
  it cannot see what is deployed.
- **Trust the deploy manifest's `test.functions` hashes.** Rejected: the manifest records that the
  stamper ran, not what the project serves (decisions.md 2026-09-07).
- **Only the prod deploy-order checklist line.** Already exists. It protects the prod release
  order but says nothing about what a branch's green run proved.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Management API gives no usable per-function version, so detection needs a function change | MITIGATE | `/architect` measures the API first; fallback is a version field the function returns |
| Check needs a network call and the token behind a keychain prompt | MITIGATE | Fail loud, never silently pass (Invariant 3); name the credential generically |
| Option B makes one branch break another session's run | ACCEPT only if B is chosen | Recorded as the reason A is recommended |
| Functions changed on `main` after the branch was cut read as "branch changed them" | MITIGATE | Compare against the merge base, not `main`'s tip |

**Non-Goals**
- Do NOT change how or when prod deploys happen (`/ship`, `deploy-functions.sh --env prod`).
- Do NOT build the migration equivalent (schema drift on test). That is P1211's territory.
- Do NOT add a pre-commit hook for this.
- Do NOT run a sweep of every function on every run; only the functions this branch changed.

## Done-When

- [ ] On a branch that changed a function not yet deployed to test, starting E2E produces the
      chosen behaviour (refusal naming the function, or a deploy), shown by pasted output.
- [ ] On a branch whose changed functions are deployed to test, E2E starts normally (the check does
      not block correct work, per epistemic gate 7c).
- [ ] With the test project unreachable or the credential declined, the run says it could not check
      and does not report the check as passed.
- [ ] The check was watched failing on a deliberately stale function before it was trusted (gate 7).
- [ ] `e2e-testing-guide.md` carries the response-status rule, pointing at the P1307 test.
- [ ] Founder decision A/B recorded in this spec.

## Related

- P1307: where it was found (`decisions.md` 2026-09-14 [process], Status: proposed — this spec resolves it).
- P1211: the same failure shape for migrations (app ships ahead of its schema).
- decisions.md 2026-09-07 [technical]: manifest is not evidence of deployed state.
- decisions.md 2026-03-28 [process]: deploy drift check runs daily and only for prod-vs-manifest.

## Open Questions

1. Does the Supabase Management API return a content hash or version per deployed function? Not measured.
2. Which entry point runs the check: `npm run test:e2e`, Playwright global setup, or `/dev` step 4?
