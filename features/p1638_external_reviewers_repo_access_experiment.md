---
status: week
type: comment
rank: 107
workstream: infrastructure
created_date: '2026-11-05'
tags: [reviewers, finish, harness, experiment]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
spec_review_hash: f9ab5f5a27f8737478f5ecbce07810e907098fe561af21e4e0186015780c33d2
spec_review_vendors: [gemini, openrouter]
---

# P1638: Does repo access make the Gemini and GLM reviewers better?

## Problem

**Situation:** In `/finish` and the spec review, Gemini (review model) and GLM run as single REST calls through `ask-model` (`delegate-gemini` is an entrypoint onto it). Their scripts pass no tool parameters, so they see only the prompt file. Codex runs in a disposable copy of the repo and can run commands, and the Opus adversary is a full agent.

**Complication:** A reviewer that sees only the diff cannot check callers, schemas, migrations or rules outside it. About half of GLM's extra findings do not reproduce (`/finish` Step 4b). Missing context may be why, or the cause may be the model. Nobody has measured it.

**Question:** Does more context find enough additional real defects to justify its cost and exposure? If so, is whole-file prompt context enough, or do reviewers need to explore the repo?

> Founder framing, verbatim: "how are they supposed to be as powerufl as codex or opus if they have no harness? or they do? shouldnt we run then via dsh? so they are empwoered e.g. to search in repo etc?"

## Appetite

Blast radius: one script and a scratch directory; nothing live changes. Reversibility: delete the output. Decision density: one founder call on the result. Any change to `/finish` needs its own spec, because that is high blast radius and its design depends on this result.

## Invariants

- **Reviewers only ever see already-public code.** Every case commit must be an ancestor of `origin/main`. Reviewers get a `git archive` export with no `.git`, so no other branch or later commit is reachable.
- **P1630 stands.** GLM requests keep zero-retention routing. GLM stays advisory.
- **The tool executor is untrusted and holds nothing.** It runs as a separate OS-sandboxed child process with no network and no credentials. It can read only the export. A separate parent process holds the key and makes the model calls.
- **The arms differ only in context.** One runner, protocol and instruction set for all of them.
- **Results are not reviews.** Experiment output never produces a review receipt.
- A control proves containment by failing against a known-present target, with a known-good control through the same path. A refused prompt injection proves nothing.

## Solution

### Benchmark

Twelve cases, fixed in a committed manifest before any scored run:

- **6 cross-file defects:** the defect cannot be established from the diff alone.
- **3 diff-visible defects:** so a loss of diff-only strength shows up.
- **3 clean changes:** no defect found since, with at least 30 days on `main` and a read-through recorded. "Clean" means none known, and any true finding gets adjudicated rather than scored false.

Each manifest row records the reviewed commit pair (the change that introduced the defect), the export revision (that change's head, so later bug reports are absent), the later fix, a concrete failure demonstration or source counterexample, and why the case was chosen. A fix commit alone is not proof. Exclude any fix that came from a finding by a reviewer under test.

### Arms

Argon and GLM, each with:

- **A, diff only:** today's input.
- **C, diff plus full changed files:** adds no process or tool exposure.
- **B, diff plus read-only tools:** "read file" and "search" inside the export.

All arms use the same runner, with tools declared only where allowed, under per-run limits on tool calls, input and output tokens. A run that hits a limit is forced to give its final answer from what it has, and is flagged. Every tool result gets the same credential-shape scan as prompts. Each cell runs 3 times.

DSH is deliberately not the runner. Its gateway route is incompatible with the zero-retention requirement as it stands, it brings its own prompts and a shell, and a different harness would confound the comparison. The question of whether DSH is good for anything else is out of scope.

### Scoring

A separate Opus agent scores findings from shuffled files. Citations cannot be fully hidden, so this is partial blinding, and results must say so.

- **Match rule, pre-registered:** a finding matches when it names the same root cause and either the location or the failure. Symptom alone is not a match.
- **Defect found:** matched in at least 2 of 3 repeats.
- **False claim:** a deduplicated finding checked against the source and shown wrong. Report it as a count per review, not a share.
- **Real but unexpected:** a finding proven by a reproduction or counterexample. Report it separately. It does not count toward adoption.
- **Audit:** Codex independently scores about 20% of findings. Report disagreements and let the founder resolve any that would change a verdict.

## Decision Criteria

Pre-registered, per model, comparing each of C and B with A. Counts are on 12 cases, so these are decision rules, not statistical claims. Report raw counts.

1. **Candidate for adoption** only if all hold:
   - It finds at least 2 more of the 6 cross-file defects than A.
   - That gain is greater than A's spread: the number of the 6 cross-file cases where A's 3 repeats did not all agree on whether the defect was matched.
   - It finds no fewer diff-visible defects than A.
   - Its false claims per review are no higher than A's, or the increase is under 1 per review.
2. **If both C and B qualify,** prefer C unless B finds at least 2 more cross-file defects than C, since C adds no tool exposure.
3. **If neither qualifies,** keep today's reviewer and record that.
4. **Cost has no preset multiple,** because no real figure exists yet. The result reports cost per review at current and post-2026-11-30 prices, and the founder weighs it.
5. **If any B containment control fails,** B cannot be a candidate.
6. **If the run is incomplete,** no adoption verdict: only report what ran. All arms of a case run together, so cases stay paired.

The set is selected to include context-dependent defects, so a win shows that the gain exists for this kind of defect, not how much it adds overall. The result must say this.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Path tricks or symlinks in an export escape the read tools | MITIGATE | OS sandbox plus realpath checks; planted symlink control |
| A commit's own content steers a reviewer | ACCEPT | Experiment cases are our own already-public code, and output is only scored. A later build spec must treat reviewer output as untrusted |
| Exported code contains a secret from history | MITIGATE | Credential-shape scan on prompts and tool results; public code only |
| Runs differ for reasons other than context | MITIGATE | Same runner and 3 repeats; compare gain with A's own spread |
| Spend exceeds budget | MITIGATE | Per-run limits and the hard stop in Cost Budget |
| Small benchmark | ACCEPT | Enough to justify or reject a follow-up, and reported as raw counts |

**Non-Goals**
- Do NOT change `/finish`, the spec review, `ask-model` or `delegate-gemini`.
- Do NOT use DSH, or restart its gateway, for this experiment.
- Do NOT give reviewers write access, web access, grounding or a shell.
- Do NOT use this benchmark to decide whether GLM stays. INBOX-289 owns that.

## Alternatives Considered

- **Plain `dsh`.** Rejected: its sandbox restricts writes only, and file access bypasses the prompt-based embargo control.
- **DSH under a narrowed profile and gateway.** Rejected for this experiment, per Solution. May be revisited by a build spec.
- **Building the harness into `/finish` first.** Rejected: nobody has shown context is the limit.

## Done-When

- [ ] Manifest committed before the first scored run, with every field above; each case verified as an ancestor of `origin/main`
- [ ] Runner's containment controls run with exit codes shown. Through the executor: a decoy outside the export under `$HOME` and one under the temp directory both fail to read, a symlink planted in the export pointing at a decoy fails, `../` and absolute paths fail, a write fails, and a network request to a host reachable outside the sandbox fails. A file inside the export reads successfully. The executor's environment has no API key
- [ ] A zero-retention request is confirmed for GLM in every arm, and served model is recorded per request
- [ ] One pilot on a case outside the benchmark confirms per-run limits and gives real token counts; Cost Budget is updated before the scored run
- [ ] Every planned run is accounted for as completed, limit-hit or missing, and the report states whether the budget stop fired
- [ ] Results table per model and arm: defects found by type, false claims per review, real-but-unexpected findings, A's spread, tool calls, tokens and cost per review
- [ ] Verdict for each model and arm written against Decision Criteria and recorded in `docs/decisions.md`, even if the answer is "no change"
- [ ] Founder decision recorded in this spec: no change, or a follow-up spec is filed

## Cost Budget

Applies: calls Gemini and OpenRouter. Estimates until the pilot. Prices are from `docs/technical/metered-services.md`, with Argon at its current price and GLM at the dearest zero-retention host.

Assumptions (input / output tokens): A 20k / 3k. C 60k / 3k. B 150k / 5k, limited to 300k / 8k.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | n/a | n/a | 12 cases x 3 repeats x 2 models x 3 arms = 216 runs; B is several requests per run |
| Egress (bytes) | n/a | n/a | Public-repo code only, included in input tokens |
| Log lines | n/a | n/a | One per request, local |
| Argon | n/a | n/a | A 20k x $2/M + 3k x $10/M = $0.07. C 60k x $2/M + 3k x $10/M = $0.15. B 150k x $2/M + 5k x $10/M = $0.35. Sum $0.57 |
| GLM | n/a | n/a | A 20k x $2.10/M + 3k x $6.60/M = $0.062. C 60k x $2.10/M + 3k x $6.60/M = $0.146. B 150k x $2.10/M + 5k x $6.60/M = $0.348. Sum $0.556 |
| Total | n/a | n/a | 12 x 3 x ($0.57 + $0.556) = 36 x $1.126 = $40.54 |

Worst case at B's limit: Argon B 300k x $2/M + 8k x $10/M = $0.68, GLM B 300k x $2.10/M + 8k x $6.60/M = $0.683. 36 x ($0.07 + $0.15 + $0.68 + $0.062 + $0.146 + $0.683) = 36 x $1.791 = $64.48. After 2026-11-30, Argon's cost doubles, which raises the worst case further.

**Hard stop: $50 by the runner's own running total from reported usage,** checked before each case. Stopping leaves an incomplete run under Decision Criteria 6. Scoring runs on the subscription lane. No recurring cost.

## Rollback Strategy

Delete the experiment's exports and outputs. Nothing live changes.

## Related

- [P1630](features/done/) GLM reviewer and its embargo rule
- [P1634](features/done/2026-06-10/p1634_default_build_and_review_roster.md) default review roster
- `docs/decisions.md` 2026-11-05 entries for both; 2026-09-04 "The delegation gate hangs on exactly the payloads it exists to scan"
- Private infra notes on DSH containment (p78)
