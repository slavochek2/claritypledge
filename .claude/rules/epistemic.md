---
globs: "*"
---

# Epistemic Gates

Auto-loaded for all work. Eight gates that prevent specific past failure modes — apply before asserting, diagnosing, or routing.

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

## 8. Record under uncertainty — never withhold on "wait until validated" grounds

Recording a decision, bet, or learning is never deferred because it is unvalidated, unproven, or "wait until the test / the interviews / it's confirmed." Record it NOW with an honest `UNTESTED` label + a one-line falsifier — that axis is retired ([docs/decisions.md](../../docs/decisions.md) 2026-07-03 [process]). Routing (which doc it belongs in) is advisory, never a block. Applies **in open conversation too**, before `/docs-strategy-update` or `/kdd` is entered — the recommendation to "hold off recording for now" is itself the failure this gate names.
