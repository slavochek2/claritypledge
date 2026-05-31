---
globs: "*"
---

# Epistemic Gates

Auto-loaded for all work. Six gates that prevent specific past failure modes — apply before asserting, diagnosing, or routing.

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
