---
globs: "*"
---

# Epistemic Gates

Auto-loaded for all work. Each gate prevents a specific past failure mode — apply before asserting, diagnosing, or routing. Numbering is append-only (`7b`, not a renumber), so references from other docs keep pointing at the same rule.

## 1. Grep before asserting absence

Never claim a field, function, column, or pattern is missing based on partial reads (`head -N`, scrolling, or memory). Run `grep -rn "<token>"` first. Negative existential claims require a search, not an inference.

**A grep that excludes files satisfies nothing.** Never `-v`/exclude files from a discovery search because you believe they're "already handled" — that belief is exactly what the search is supposed to test. Read an excluded file's relevant content before excluding it, or don't exclude it. An "N results, none elsewhere" claim built on an unverified exclusion is a false negative wearing a search's credibility.

## 2. Present root causes as hypotheses

When proposing why something failed, frame it as:

- **Hypothesis:** [what you think is wrong]
- **Cheapest disproof:** [the smallest test that would falsify it]
- **Run it?** [yes/no, then act]

Do not declare "root cause" without running the disproof. A confident-sounding diagnosis without a falsifying test is a guess in costume.

## 2b. The cheapest disproof must also be a non-destructive one

Gate 2 asks for the *smallest* test that would falsify a hypothesis. It never says the test may not
destroy the answer. **A diagnostic that WRITES to the system under investigation overwrites the
evidence: use the read-only probe, or snapshot the state first.**

Reading is almost always available and costs nothing — dump the rows, print the pointer, copy the
directory. Re-running the failing write "to see what it does" is not a probe; it is the experiment
and the destruction of its own control, in one command.

Three existing rules each name one instance of this and none of them reach the general case, which
is why it kept happening: [db-access.md](db-access.md) scopes it to databases (*"if you're about to
use a tool that needs user approval just to look at something, you're using the wrong tool"*),
[git.md](git.md) scopes it to `git checkout HEAD --` / `git restore` (wip-commit before an
experiment that reverts files), and `docs/technical/debugging.md` does not mention it at all.
Any persistent store is in scope: a cache, a ledger, a journal, a task board, a log.

P1187 (2026-08-28): investigating why a caption-store save had recorded nothing, the same save was
re-run by hand as a "diagnostic". It wrote a new revision and moved the pointer, so the failing
state no longer existed. The cause was never found, is recorded as unexplained, and the substitute
was instrumenting the write path so a recurrence self-reports — a mitigation, not the answer.

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

**The agent shell is zsh, where `${PIPESTATUS[0]}` expands to EMPTY** — zsh's array is `$pipestatus` and is 1-indexed (`${pipestatus[1]}`). A failure proof that reads `PIPESTATUS` prints no exit code and reports nothing wrong, silently destroying the one artifact this gate demands. Paste a real non-zero status or the proof does not count.

## 7b. Green bounds what was MODELLED, not what is true

Gate 7 gets you a gate you have watched fail. That still only proves it catches the failures you were able to **stage**. Before treating a passing suite as evidence on a security or trust-boundary fix, enumerate the inputs the fixture structurally *cannot* emit, and check that list against the artifact's own docs. **If the docs describe more entities than the fixture constructs, the gap is the attack surface.**

Mutation testing does not close this: mutations prove the assertions bind the code, never that the input space is complete. Nor does a stub that intercepts a boundary — anything on the far side of it (a remote command, a real `ps`, another process's argv) is unreachable by every test in that file, so its correctness is *unverified* no matter how green the run is. Test that surface outside the stub, or state plainly that it is untested.

Two live instances: a page-title injection suite reached 162/0 while every defect class it claimed closed was still reachable through a window the fixture never emitted (the docs had described that window for three days); and a GCS lifecycle rule that matched a prefix the archive layout never produced, under a script that was genuinely end-to-end tested against itself. See `pp/docs/decisions.md` 2026-08-07 and 2026-08-01.

## 7c. A new gate must be run against the workflows that already exist

Gate 7 proves a gate CAN fire. It says nothing about what the gate does to work that was already
correct. Both halves are needed, and only the first one has a natural prompt — a gate you built
because something slipped past is a gate you are motivated to see catch things, not a gate you are
motivated to see wave things through.

**Before shipping any new refusal, gate, validation or guard: run the tool's own documented
workflows through it and confirm they still pass.** Not a synthetic happy path you invent — the
sequences the tool's own help text, skill files or comments already tell people to perform.

The tell is a gate whose test suite contains only inputs the gate should reject. If nothing in the
fixture is a legitimate input that must be *allowed*, the false-positive rate is unmeasured.

P1173 (2026-08-27): a new guard refused any manifest differing from `HEAD`, on the reasoning that
this run did not write that difference. But `migrate.sh` stamps the manifest **and stages it**,
expecting a later commit — so the manifest is routinely dirty when the next run starts. Running
`migrate.sh` twice before committing hard-failed, and the error blamed a co-tenant session for an
edit the same tool had written a minute earlier. Three commands would have caught it; the canary
had a "no false positive" scenario and still missed it, because that scenario only covered a clean
run and never the stage-then-run-again sequence the tool itself creates. Fixed by classifying the
diff's *shape* rather than its existence. See [decisions.md](../../docs/decisions.md) 2026-08-27
[technical] (P1173).

## 8. Record under uncertainty — never withhold on "wait until validated" grounds

Recording a decision, bet, or learning is never deferred because it is unvalidated, unproven, or "wait until the test / the interviews / it's confirmed." Record it NOW with an honest `UNTESTED` label + a one-line falsifier — that axis is retired ([docs/decisions.md](../../docs/decisions.md) 2026-07-03 [process]). Routing (which doc it belongs in) is advisory, never a block. Applies **in open conversation too**, before `/docs-strategy-update` or `/kdd` is entered — the recommendation to "hold off recording for now" is itself the failure this gate names.

## 9. A subagent's claim is not evidence until a command confirms it — and the command must test the CLAIM

This gate binds the **consumer** of agent output, not the producer. Producer self-verification is already asked for elsewhere and is **measurably defeated**: an agent asserted it had `grep`-verified its own absence claims when one was false.

**The failure mode.** An agent asserts a finding; the synthesizing agent restates it in a summary; the restatement *reads as corroboration* although **no new evidence exists between the two utterances**. Three claims reached the founder this way in one session, all three false, all three caught from memory rather than by any gate ([docs/decisions.md](../../docs/decisions.md) 2026-07-30). Separate contexts do not prevent it — independence is established at fan-out and lost again at synthesis.

**Test the claim, not the quote under it.** Every one of those three was built on a real, correctly-attributed quote. An anchor test (`grep -F` the quote) passes on all of them, because it verifies the quote exists — never that the assertion built on it is true. Distinct from gate 5, which asks whether the *call succeeded*: these calls all succeeded and returned well-formed output.

**In practice:** before promoting any agent claim into a doc, a spec (including Root Cause / Acceptance Criteria text), a decision, code (e.g. a regex or condition change derived from the claim), or a user-facing summary, run the command that would falsify it — `grep` the negative, count the occurrences, re-derive the number. Absence claims ("X never appears") are the highest-risk class and the cheapest to check. If you cannot test it, forward it labelled as the agent's claim, not as a finding. A spec/code change is the highest-cost promotion target — P1041 propagated an adversarial reviewer's unverified "this migration matches the bug shape" into both a regex widening and a spec's Root Cause section before a failing test caught it (2026-08-11).

## 9b. Count the reports against the agents you spawned

Gate 9 binds you to verify a subagent's claim. This binds the reviews that **never arrived** — a
different failure, and the quieter one: gate 9 fires on something you can read, this one fires on
an absence you have to notice.

**After any fan-out, state `<reports received> of <agents spawned>` in the output**, and name which
lens is missing. A silent subagent is indistinguishable from a subagent that found nothing, so
without the count a partial review reads as a complete one — and the agent that summarizes it will
describe the coverage it *intended*, not the coverage it *got*.

Two things follow. A report that arrives only after you chase it still counts as a miss for the
ratio — the default outcome was silence. And when a lens never reports, either re-run it or say
plainly that it was not covered; never let "3 reviewers were spawned" stand in for "3 reviewers
reported".

Measured: 2026-08-19, one session spawned 3 hostile reviewers — 1 delivered unprompted, 1 after two
explicit requests, 1 never; a 4th agent spawned to critique *this very finding* also never reported.
Two of the confirmed findings that session came from the reviewer that had to be chased twice, one
of them a shipped Stop hook that was disabling an existing safety gate. The repo's own
`.finish-reviewed` log carries four earlier instances across four branches ("two subagent reviewers
(code, migrations) never reported"; "spawned reviewer returned no report" ×2; "ux-review reported
late (post-ship)") — each recorded by hand, none by a gate. See [docs/decisions.md](../../docs/decisions.md)
2026-08-19 "Adding a second check to an existing Stop hook".
