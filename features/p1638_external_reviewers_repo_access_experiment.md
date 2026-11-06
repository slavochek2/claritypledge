---
status: qa
type: comment
rank: 107
workstream: infrastructure
created_date: '2026-11-05'
tags: [reviewers, finish, harness, experiment]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
spec_review_hash: 5094a981835d7499094cb1fa717f1cdcc46567e8a70bcef5ca08e05cfe328921
spec_review_vendors: [gemini]
---

# P1638: Does a harness or more context make the Argon reviewer better?

## Problem

**Situation:** In `/finish` and the spec review, Gemini (review model, Argon) and GLM run as single REST calls through `ask-model` (`delegate-gemini` is an entrypoint onto it). Their scripts pass no tool parameters, so they see only the prompt file. Codex runs in a disposable copy of the repo and can run commands, and the Opus adversary is a full agent.

**Complication:** A reviewer that sees only the diff cannot check callers, schemas, migrations or rules outside it, or run anything. About half of GLM's extra findings do not reproduce (`/finish` Step 4b). Missing context may be why, or the cause may be the model. Nobody has measured it.

**Question:** Does Argon find enough additional real defects with a sandboxed harness to justify the cost and upkeep? Or does putting the full changed files in the prompt get most of that gain with no harness?

> Founder framing, verbatim: "how are they supposed to be as powerufl as codex or opus if they have no harness? or they do? shouldnt we run then via dsh? so they are empwoered e.g. to search in repo etc?"

## Appetite

Blast radius: a test script, a test-only sandbox and a scratch directory; no live review changes. Reversibility: delete the output and turn the test sandbox off. Decision density: one founder call on the result. Any change to `/finish` needs its own spec, because that is high blast radius and its design depends on this result.

## Invariants

- **Reviewers only ever see already-public code.** Every case commit must be an ancestor of `origin/main`. Reviewers get a `git archive` export with no `.git`, so no other branch or later commit is reachable.
- **No GLM or other OpenRouter call.** This experiment spends no cash. Argon runs on credits.
- **Everyday `dsh` does not change.** It does not use p78 today: the containment was reverted on 2026-10-09 and its gateway is off. This experiment does not turn either back on. It uses its own gateway copy on its own port, its own profile and its own DSH home, all removed at the end.
- **The D process cannot read a credential, reach any host except the model endpoint through the gateway, or write anything that later runs outside the sandbox.** The key stays in the gateway, outside the sandbox.
- **Results are not reviews.** Experiment output never produces a review receipt.
- A control proves containment by failing against a known-present target, with a known-good control through the same path. A refused prompt injection proves nothing.

## Solution

### Benchmark

Twelve cases, fixed in a committed manifest ([docs/audits/p1638-benchmark-manifest.json](../docs/audits/p1638-benchmark-manifest.json)) before any scored run:

- **6 cross-file defects:** the defect cannot be established from the diff alone. Record for each whether the evidence is inside a changed file or only in an unchanged one. At least 3 must be the first kind, so C has a fair chance, and at least 2 the second. Report C on each subset.
- **3 diff-visible defects:** so a loss of diff-only strength shows up.
- **3 clean changes:** no defect found since, with at least 30 days on `main` and a read-through recorded. "Clean" means none known, and any true finding gets adjudicated rather than scored false.

Each manifest row records the reviewed commit pair (the change that introduced the defect), the export revision (that change's head, so later bug reports are absent), the later fix, a concrete failure demonstration or source counterexample, and why the case was chosen. A fix commit alone is not proof. Exclude any fix that came from a finding by a reviewer under test.

### Setups

Argon only, same criteria text, 3 runs per case:

- **A, diff only:** today's input through `ask-model`. The baseline.
- **C, diff plus full changed files:** same path as A. Adds no process or tool exposure.
- **D, sandboxed DSH with a shell:** the same input as A, with an export to explore, run under a test-only derivative of `dsh-contained`.

D differs from A in its harness as well as its access, so a D win shows that this harness helped, not which part of it did. That is the question being asked.

### D's test sandbox

Starting from `dsh-contained` and the p78 gateway, a test-only profile must:

- Start from deny-by-default reads, not the `(allow default)` base of `dsh-contained`, allowing only the export, a fresh DSH home and an explicit list of system and runtime paths. Record that list.
- Copy the DSH packages it needs into the fresh home and make them read-only there, so nothing under the real `~/.dsh` is readable, including its credentials, sessions and instruction files.
- Allow writes only to a per-run work area and writable state in that home. Point the temp directory inside the work area, with no access to the shared user temp or cache directories. All of it is deleted after each run, after saving the run's event log.
- Refuse signals to other processes and inbound network.
- Keep answer material (manifest, oracle, scoring files, pilot outputs) outside every readable path.
- Keep the repo's own `CLAUDE.md` and `.claude/` in the export, since they are part of the commit, and record whether DSH loaded them.

**Test gateway:** the p78 gateway cannot serve as is, since it allows search grounding, has no token or time limits, and logs only denials. Use a test copy on its own port, with one instance per run so usage can be attributed. It must have the OpenRouter route and grounding removed, an allowlist holding only Argon, per-request logging of tokens and served model, and limits that apply to cumulative input, output and wall-clock time per run.

**Limits:** near the limit, the run gets one wrap-up instruction to give its final review. A run that hits a limit is flagged, and its final output is scored. No output at all counts as misses.

**Metering:** A and C go through the same test gateway with no tools, because `ask-model` does not report text token counts. Their request settings are identical and recorded. C differs from A only in the added file text.

### Fallback

If D cannot run within the limits, or fails a containment control that cannot be fixed, D is reported as not run. Then run **B** in its place: a small loop with only "read file" and "search" tools inside the export. Its executor must be an OS-sandboxed child process with no network and no credentials, while a separate parent holds the key. B must pass the same pilot, metering, limit and applicable containment checks before scored runs. A B result answers only whether those two tools help, not whether a full harness would.

### Scoring

A separate Opus agent scores findings from shuffled files. Citations cannot be fully hidden, so this is partial blinding, and results must say so.

- **Match rule, pre-registered:** a finding matches when it names the same root cause and either the location or the failure. Symptom alone is not a match.
- **Defect found:** matched in at least 2 of 3 runs.
- **False claim:** a deduplicated finding checked against the source and shown wrong. Report it as a count per review, not a share.
- **Real but unexpected:** a finding proven by a reproduction or counterexample. Report it separately and put it in front of the founder with the verdict. It does not change pass or fail, so the verdict covers recovery of these proven defects, not every kind of reviewer value.
- **Audit:** Codex independently scores a random 20% of findings, plus every match or miss on the cases that could change a verdict. Report disagreements and let the founder resolve any that would change a verdict.

## Decision Criteria

Pre-registered, comparing C and D (or B) each with A. Counts are on 12 cases, so these are decision rules, not statistical claims. Report raw counts.

1. **Candidate for a follow-up** only if all hold:
   - It finds at least 2 more of the 6 cross-file defects than A.
   - Its total matches on those cases, out of 18 runs, are at least 6 more than A's. This keeps a gain from resting on run-to-run luck.
   - It finds no fewer diff-visible defects than A.
   - Its false claims per review are no higher than A's, or the increase is under 1 per review.
2. **If both qualify,** prefer C unless D finds at least 2 more cross-file defects than C, since C needs no harness.
3. **If neither qualifies,** keep today's reviewer and record that.
4. **A close result counts as no proven gain.** Anything that misses a threshold in 1 does not qualify.
5. **Cost has no preset multiple,** because no real figure exists yet. The result reports cost per review at current and post-2026-11-30 prices, and the founder weighs it.
6. **If any containment control for a setup fails,** that setup cannot be a candidate.
7. **If the benchmark stops early** (budget stop or missing runs on any case), no verdict: only report what ran. All setups of a case run together, so cases stay paired. A single run hitting its limit does not stop the benchmark.
8. **If over a third of D's runs hit a limit,** D gets no verdict, because the limit rather than the harness may have decided the result.
9. **If A already finds 5 or more cross-file defects,** no setup can show the gain, and the result is reported as no verdict. Report the fixture error rather than swapping cases afterwards.

The set is selected to include context-dependent defects, so a win justifies a follow-up spec, which must check the gain on real `/finish` runs. It does not show how much reviews improve overall. Nor does it say anything about GLM.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| DSH hangs or cannot run under the sandbox | MITIGATE | Pilot finds out first; Fallback section. This is recorded as a past failure |
| Killing a D run loses its output | MITIGATE | Wrap-up instruction before the limit; pilot proves it |
| The sandbox leaves a path open | MITIGATE | Default-deny reads, fresh home, public-only exports and failing controls |
| A commit's own content steers the reviewer | ACCEPT | Cases are our own public code and output is only scored. A later build spec must treat reviewer output as untrusted |
| D's shell runs code from an export | ACCEPT | Contained by the sandbox: no network, no credentials, disposable writes |
| Spend exceeds budget | MITIGATE | Per-run limits and the hard stop in Cost Budget |
| Small benchmark | ACCEPT | Enough to justify or reject a follow-up, and reported as raw counts |

**Non-Goals**
- Do NOT change `/finish`, the spec review, `ask-model`, `delegate-gemini`, the existing gateway or everyday `dsh`.
- Do NOT call GLM or OpenRouter.
- Do NOT use plain, unsandboxed `dsh`.
- Do NOT give reviewers web access or grounding.
- Do NOT use this benchmark to decide whether GLM stays. INBOX-289 owns that.

## Alternatives Considered

- **Plain `dsh`.** Rejected: its own sandbox restricts writes only.
- **Testing GLM too.** Deferred: it costs cash and needs a gateway change to keep zero-retention routing. Consider it only if Argon shows a clear gain.
- **B as a main setup.** Dropped: if the stronger D cannot clearly beat A, B is unlikely to justify its work. It remains the fallback.
- **Building the harness into `/finish` first.** Rejected: nobody has shown context is the limit.

## Done-When

- [x] Manifest committed before the first scored run, with every field above; each case verified as an ancestor of `origin/main`
- [x] Containment controls run from inside the sandbox with exit codes shown: decoys under `$HOME` and the temp directory fail to read, DSH's real credentials and sessions paths fail to read, the manifest fails to read, a write outside the work area fails, a signal to a process started for the test fails, a request to a host fails, and grounding and OpenRouter requests through the test gateway are refused. Each target is first shown to exist and be reachable outside the sandbox. A file inside the export reads successfully, and the gateway reaches Argon. Exception: OpenRouter and grounding were not probed from outside, since this experiment makes no OpenRouter call and gives reviewers no web access; both refusals were tested
- [x] A pilot on 2 cases outside the benchmark proves D's limits, wrap-up and usage metering, and gives real token counts; Cost Budget is updated before the scored run, or the Fallback is taken and recorded
- [x] The served model is recorded for every run in every setup
- [x] Every planned run is accounted for as completed, limit-hit or missing, and the report states whether the budget stop fired
- [x] Results table per setup: defects found by type, false claims per review, real-but-unexpected findings, A's spread, tool calls, tokens and cost per review
- [x] Verdict for C and D (or B) written against Decision Criteria and recorded in `docs/decisions.md`, even if the answer is "no change"
- [x] Test profile, gateway copy and DSH home removed. Checksums of everyday DSH's configuration files and the gateway's LaunchAgent match those taken before the experiment, and it is still disabled
- [x] Founder decision recorded in this spec: no change, or a follow-up spec is filed

**Founder decision (2026-11-06): no change.** Today's reviewer stays, as the pre-registered criteria require, and no follow-up spec is filed.

Results and verdict: [docs/audits/p1638-results.md](../docs/audits/p1638-results.md).

## Cost Budget

Applies: calls Gemini. Estimates until the pilot. Prices are from `docs/technical/metered-services.md`, with Argon at its price through 2026-11-30. Paid from credits; no cash.

Assumptions (input / output tokens): A 20k / 3k. C 60k / 3k. D 150k / 5k, limited to 300k / 8k. B, if used, has D's budget.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | n/a | n/a | 12 cases x 3 runs x 3 setups = 108 runs; D is several requests per run |
| Egress (bytes) | n/a | n/a | Public-repo code only, included in input tokens |
| Log lines | n/a | n/a | One per request, written by the test gateway |
| A | n/a | n/a | 20k x $2/M + 3k x $10/M = $0.07 per run; x 36 = $2.52 |
| C | n/a | n/a | 60k x $2/M + 3k x $10/M = $0.15 per run; x 36 = $5.40 |
| D | n/a | n/a | 150k x $2/M + 5k x $10/M = $0.35 per run; x 36 = $12.60 |
| Total | n/a | n/a | $2.52 + $5.40 + $12.60 = $20.52 |

Worst case at D's limit: 300k x $2/M + 8k x $10/M = $0.68 per run; x 36 = $24.48. Total $2.52 + $5.40 + $24.48 = $32.40, assuming A and C stay near their estimates. The test gateway forces an output limit on them too; the pilot sets it. Thinking tokens may bill as output, which the pilot will show. Prices double after 2026-11-30 ($41.04 expected, $64.80 worst case). A run after that date needs the founder to reset the stop.

Pilot: 2 cases x 3 setups x up to $0.68 = up to $4.08.

**Hard stop: $40 total, including the pilot, retries and any fallback.** Before each case, the runner reserves that case's maximum cost from metered spend so far, and it does not start a case that could exceed the stop. Stopping leaves no verdict under Decision Criteria 7. Scoring runs on the subscription lane. No recurring cost.

### Pilot result, measured before the scored run (2026-11-05)

Real token counts on the 2 pilot cases, one run each, input / output including thinking. Spend counts all input at the full input rate, though the API reported much of D's input as cached, so true cost is lower than these figures.

| Setup | PILOT-1 | PILOT-2 | Cost per run |
|---|---|---|---|
| A | 17,824 / 1,252 | 4,945 / 960 | $0.02 to $0.05 |
| C | 86,477 / 1,332 | 13,796 / 959 | $0.04 to $0.19 |
| D, final setup | 179,067 / 3,068 | 149,605 / 5,609 | $0.36 to $0.39 |

**The pilot went over its $4.08 estimate** (figure in `.private/`), because it took four rounds to find a D setup that stops on its own. As first specified, D hit the input limit on every run. With ceilings raised to 700k it read until wrap-up on all 3 runs, at 622k to 680k input, so no affordable limit would have stopped it, and Decision Criteria 8 would have left D with no verdict.

**Changes to D, fixed before any scored run,** so a D result describes this setup rather than plain DSH:
- A budget note in D's environment section of the prompt.
- A live budget meter the test gateway appends to each request after the first, telling D how much is used and how many requests it can afford.
- Tighter tool-output settings: `spill-policy.maxInlineTokens` 2,500 and `tool-result-pruner` 4,096 / 2,000 / 500.

With all three, both pilot runs finished on their own with no wrap-up.

**Limits, lowered so the worst case stays under the stop:** D 270k input and 8k output, 900 s, was 300k and 8k. A and C 6k output per run. Wrap-up, output limit, wall-clock wrap-up, the kill path and the hard stop after wrap-up were each forced in the pilot and worked. A killed run with no output counts as misses.

| Measure | Projected scored run |
|---|---|
| A, 36 runs | $1.10 expected, $2.79 at the limit |
| C, 36 runs | $4.28 expected, $5.97 at the limit |
| D, 36 runs | $13.68 expected at $0.38 per run, $22.32 at the limit |
| With the pilot's spend | **Under the $40 stop even at every limit** (figures in `.private/`) |

Thinking tokens were reported on some D requests and none on the pilot A and C runs. D's requests asked for no thinking override, so its default is the same as A's and C's.

## Rollback Strategy

Delete exports and outputs, remove the test profile and DSH home, and return the gateway to its prior state. Nothing live changes.

## Related

- [P1630](features/done/) GLM reviewer and its embargo rule
- [P1634](features/done/2026-06-10/p1634_default_build_and_review_roster.md) default review roster
- `docs/decisions.md` 2026-11-05 entries for both; 2026-09-04 "The delegation gate hangs on exactly the payloads it exists to scan"
- Private infra notes on DSH containment (p78)
