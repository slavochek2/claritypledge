---
globs: "*"
---

# Epistemic Gates

Auto-loaded for all work. Each gate prevents a specific past failure mode — apply before asserting, diagnosing, or routing. Numbering is append-only (`7b`, not a renumber), so references from other docs keep pointing at the same rule.

## 1. Grep before asserting absence

Never claim a field, function, column, or pattern is missing based on partial reads (`head -N`, scrolling, or memory). Run `grep -rn "<token>"` first. Negative existential claims require a search, not an inference.

## 2. Present root causes as hypotheses

When proposing why something failed, frame it as:

- **Hypothesis:** [what you think is wrong]
- **Cheapest disproof:** [the smallest test that would falsify it]
- **Run it?** [yes/no, then act]

Do not declare "root cause" without running the disproof. A confident-sounding diagnosis without a falsifying test is a guess in costume.

## 3. Test model claims against fixture, not prose

Before declaring "the model/schema/system can't represent X" — grep the seed data, migration, or live row. Spec prose and type definitions are not reality; the database and runtime state are. Verify against the artifact, not the documentation about the artifact. This includes infra capacity numbers (GPU quota, instance limits, tier counts): a stale doc is not authoritative — verify against the live source (provider console / CLI / quota API) before designing around the constraint.

## 4. Read the manifest before guessing among N paths

When N candidate paths could be canonical (plugin versions, worktree slots, env files, migration directories) — read the registry/manifest/index that names the active one. Don't guess from filesystem order, recency, or naming heuristics. If a manifest exists, it wins.

## 5. Confirm tool-call success before asserting its output

Never present the output of a browser, MCP, or external tool call as verified fact until you have confirmed the call itself succeeded. Errors can return silently: stale tab IDs, network failures, and auth drops may produce no error message — just empty or missing data that the agent then fills in from inference.

Before reporting any number, state, or status from a tool call: check that the call returned a non-error result (screenshot rendered, JSON returned, HTTP 200, etc.). If the call is ambiguous, say so explicitly: "I have not confirmed this number — the tool call may have failed."

## 6. Grep + trust plan code snippets

When a plan or spec contains code verbatim, don't re-read the source file to "verify" it — the plan already captured it. Instead, grep the surrounding directory for patterns (call sites, similar shapes) to confirm context. Sequential file-reads of files you already have content for is wasted work.

## 7. Exercise a gate's failure path before trusting it

A failure-detecting or alerting artifact (CI gate, smoke test, canary, lint/typecheck gate, monitoring alert) you have not seen FAIL is unproven — a green run proves only that the happy path runs, not that the gate fires when it should. Before committing such an artifact, simulate its failure path locally and confirm the exit code is non-zero (or the alert step would fire).

This is "Falsify Before You Rely" (CLAUDE.md) applied to gate artifacts. Common masking mechanisms that make a broken gate look green: `script | tee` under `bash -e` without `pipefail` (tee's exit 0 masks the script's exit 1), `|| true`, swallowed exit codes, `continue-on-error` on the wrong step. Proof = paste the exit code from the simulated failure, not "it should fail because…". See [docs/decisions.md](../../docs/decisions.md) 2026-06-06 "Scheduled-gate alerts route to GitHub issues".

## 7b. Green bounds what was MODELLED, not what is true

Gate 7 gets you a gate you have watched fail. That still only proves it catches the failures you were able to **stage**. Before treating a passing suite as evidence on a security or trust-boundary fix, enumerate the inputs the fixture structurally *cannot* emit, and check that list against the artifact's own docs. **If the docs describe more entities than the fixture constructs, the gap is the attack surface.**

Mutation testing does not close this: mutations prove the assertions bind the code, never that the input space is complete. Nor does a stub that intercepts a boundary — anything on the far side of it (a remote command, a real `ps`, another process's argv) is unreachable by every test in that file, so its correctness is *unverified* no matter how green the run is. Test that surface outside the stub, or state plainly that it is untested.

Two live instances: a page-title injection suite reached 162/0 while every defect class it claimed closed was still reachable through a window the fixture never emitted (the docs had described that window for three days); and a GCS lifecycle rule that matched a prefix the archive layout never produced, under a script that was genuinely end-to-end tested against itself. See `pp/docs/decisions.md` 2026-08-07 and 2026-08-01.

## 8. Record under uncertainty — never withhold on "wait until validated" grounds

Recording a decision, bet, or learning is never deferred because it is unvalidated, unproven, or "wait until the test / the interviews / it's confirmed." Record it NOW with an honest `UNTESTED` label + a one-line falsifier — that axis is retired ([docs/decisions.md](../../docs/decisions.md) 2026-07-03 [process]). Routing (which doc it belongs in) is advisory, never a block. Applies **in open conversation too**, before `/docs-strategy-update` or `/kdd` is entered — the recommendation to "hold off recording for now" is itself the failure this gate names.

## 9. A subagent's claim is not evidence until a command confirms it — and the command must test the CLAIM

This gate binds the **consumer** of agent output, not the producer. Producer self-verification is already asked for elsewhere and is **measurably defeated**: an agent asserted it had `grep`-verified its own absence claims when one was false.

**The failure mode.** An agent asserts a finding; the synthesizing agent restates it in a summary; the restatement *reads as corroboration* although **no new evidence exists between the two utterances**. Three claims reached the founder this way in one session, all three false, all three caught from memory rather than by any gate ([docs/decisions.md](../../docs/decisions.md) 2026-07-30). Separate contexts do not prevent it — independence is established at fan-out and lost again at synthesis.

**Test the claim, not the quote under it.** Every one of those three was built on a real, correctly-attributed quote. An anchor test (`grep -F` the quote) passes on all of them, because it verifies the quote exists — never that the assertion built on it is true. Distinct from gate 5, which asks whether the *call succeeded*: these calls all succeeded and returned well-formed output.

**In practice:** before promoting any agent claim into a doc, a decision, or a user-facing summary, run the command that would falsify it — `grep` the negative, count the occurrences, re-derive the number. Absence claims ("X never appears") are the highest-risk class and the cheapest to check. If you cannot test it, forward it labelled as the agent's claim, not as a finding.
