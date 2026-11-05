---
status: in-progress
type: task
rank: 100
workstream: infrastructure
created_date: '2026-11-05'
tags: [finish, review, receipt, openrouter, reviewers]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: sonnet
exec_model: opus
exec_effort: high
---

# P1630: `/finish` runs GLM-5.3 as an always-on extra reviewer, and the review receipt requires a Gemini or Codex run and records which vendors back it

## Problem

**Situation:** `/finish` Step 4b runs the Gemini review model on every run, Codex when the change is larger than one file or 50 lines or ran long, and an Opus adversary on sensitive paths. The P1505 receipt (`scripts/review_receipt.py`) is written from at least one successful `ask-model` run. A third external reviewer now exists: GLM-5.3 through `ask-model openrouter`.

**Complication:** Four facts.

1. **Coverage.** A benchmark on 12 real past bugs from this repo's history (the reviewer sees only the diff that introduced the bug; the known bug is what the later fix repaired; one non-contestant judge model, hand-checked on five cases) scored: known-bug score of 12: GLM 5.6, Codex 3.9, Gemini Argon 3.5; at least part of the bug found in 9, 7 and 5 cases. GLM caught one bug neither of the other two did (verified by hand). About half of GLM's extra findings are noise, at about 4 extra findings per review. Gemini Argon answered "NO DEFECTS FOUND, SHIP" on 3 of the 12 diffs that each contain a known bug. Caveats: 12 cases, one judge, subjective partial credit, the known bugs were mostly first found by Codex, Gemini and Opus reviews, and only bugs that were eventually found are in the sample. **Scope of the evidence, counted 2026-11-05:** under Step 4b's trigger, 10 of the 12 bug cases are large enough that Codex would run anyway, and beside Gemini and Codex GLM added one case. Only 2 of the 12 are small enough for today's Gemini-only roster, so the benchmark says almost nothing about small changes. The method, data and verdict are kept in the founder's private decisions log (2026-11-05), whose rule is: GLM output needs triage and is never clearance, and Argon's "no defects" is not clearance either.
2. **A hole, re-verified 2026-11-05 by running `EVIDENCE_RE` against real header shapes.** It accepts `vendor=openrouter` and `vendor=local` runs and refuses a model mismatch. Once GLM is in the flow, "at least one successful `ask-model` run" can be GLM alone.
3. **The receipt cannot say who reviewed.** It stores only hashes of the evidence files, and those files live in session scratchpads that get cleaned. For 89% of distinct receipts to date, no vendor can be recovered. 94% of receipts cite a single evidence file; of the 45 that can still be traced, 43 cite Gemini alone. A cited file is not proof that no other reviewer ran, but it is the only proof the gate holds, and it rests on the reviewer that scored lowest and said "SHIP" on 3 of 12.
4. **The payload does not go to one known vendor, and not all of it is public.** OpenRouter serves `z-ai/glm-5.3` from dozens of endpoints, priced from $0.07/$1.40 to $2.80/$8.80 per 1M tokens on the 2026-11-05 listing, and `ask-model-openai` pins no provider or data policy. A test request went to one of the smallest providers on the list. Embargoed specs (`.claude/rules/features.md`, Disclosure) are live security fixes that must never be published, and `/finish` has no check for them: an embargoed diff would go to that pool.

**Question:** How does GLM join `/finish` so it adds coverage without lowering the bar the receipt enforces, without sending embargoed work to an unknown host, and without moving triage work onto the founder?

> Founder framing, verbatim: *"But is it cheaper and better or just cheaper?"* — and, once the benchmark had answered it: *"yes on finish or whatever you need to"*.

## Appetite

Blast radius: high. Every `/finish` run and the P1505 Stop-hook gate that blocks "done" in every session depend on it. Reversibility: high, one commit in this repo and one line in `~/.agents`. Decision density: low. The one real call, always-on versus stakes-gated, is made below on cost and ordering grounds, and no copy, pricing or naming is involved.

## Invariants

- **A receipt must not be writable when every evidence file comes from `openrouter` or `local`.** At least one evidence run must come from `gemini` or `codex`. The floor is checked on the files that already passed `_valid_evidence`, so an old or failed Gemini file cannot satisfy it. The floor's justification is narrow and stated plainly: GLM's benchmark sample is small, its noise is high and its serving host varies; **Gemini's weakness is not fixed by this floor**, and is addressed by running GLM beside it and by recording who reviewed.
- **No single reviewer's clean verdict counts as clearance.** A receipt records that an independent review of this content ran, not that the code is clean. The Step 4b text must not treat "no defects" from any one reviewer as a pass.
- **A missing, failed or mismatched GLM run never blocks and never counts as clean.** A non-zero exit, a model MISMATCH or an empty file all mean that review did not run. GLM has no second route, so there is no re-run: it is reported missing.
- **GLM never receives embargoed work, and the decision fails closed.** Embargoed specs are branch-born (`.claude/rules/features.md`), so the lookup is deterministic: on a `feature/pN-*` or `fix/pN-*` branch, read that spec on the branch. GLM is skipped when its `disclosure` is `embargo`, or when the spec is missing or has no `disclosure` value. It is also skipped when any changed path is under `.private/`, or when the prompt file would carry anything from `.private/` or an embargoed spec. The report says why.
- **Skipping GLM for embargo never drops the run to one reviewer.** Codex then runs whatever the size, so the highest-stakes work does not get the weakest roster.
- **GLM requests use zero-retention endpoints only.** `provider.zdr: true`. Verified 2026-11-05 with a negative control: the flag refused two named providers outside OpenRouter's zero-retention list (404) while the same request without it was served. A 404 here means GLM did not run.
- **The model id is never written in the skill file.** `ask-model openrouter` reads it from `OPENROUTER_MODEL` in `~/.agents/model-defaults.env`.
- **Never edit a payload to get past the credential-shape scan.** `ask-model` runs the same scan for `openrouter` as for `gemini`; an exit of 2 means GLM did not run, reported as missing. (Decisions 2026-09-04 [technical], the delegation gate.)
- **Use `ask-model --timeout` for the wall-clock bound, not `timeout`.** macOS has no `timeout` (Decisions 2026-09-14 [process], P1313). Its default is 1800 seconds, so the row passes 600: GLM is advisory and must not hold `/finish` for half an hour.
- **The receipt is how the end-of-build review is proven** (Decisions 2026-10-16 [process], P1505). This spec adds one field to it and changes which evidence is sufficient. Existing receipts stay valid.

## Solution

1. **Step 4b of `/finish`, the GLM row:** runs on every run except the embargo case, on the same prompt file as the Gemini review, as its own background Bash call: `~/.agents/bin/ask-model openrouter --timeout 600 --prompt-file <prompt file>`. Its output must satisfy the existing check: non-empty and an `ASK-MODEL:` first line with `exit=0`.
2. **Triage happens before the founder sees anything.** The main session checks each GLM finding, with the check the claim calls for: a reproduction, a failing test, or a concrete counterexample in the source or schema (epistemic gate 9). A finding that fails the check is dropped and counted. A finding that matters but cannot be checked locally, such as a production-only race, reaches Step 5 labelled `unverified`, never silently dropped. The report states `GLM: N findings, M verified, K unverified`. Delegating a check to a subagent is optional, not a required tier.
3. **Re-review rounds.** The Freshness bullet and Step 6b today say any external `ask-model` reviewer is enough. Both change to: every new snapshot needs **at least one fresh Gemini or Codex run**. The reviewer that found the fixed issue re-runs too if it is reachable; if not, it is reported missing and nothing blocks. Otherwise an agent following the text re-reviews with GLM alone and `write` refuses it.
4. **Receipt floor in `scripts/review_receipt.py write`:** require at least one valid evidence file whose header carries `vendor=gemini` or `vendor=codex`. `openrouter` and `local` files are still accepted alongside. The refusal names the rule.
5. **The receipt records which vendors back it:** add `"vendors": [...]`, the sorted vendors of the valid evidence files. Additive: `_latest` ignores unknown keys. Step 6b says to pass every `ask-model` output file from this round as evidence; `write` already filters out failed and stale files rather than refusing the call (line 259), and the floor reads the filtered set. The field does not say who was attempted, skipped or failed, nor name Opus, which is not an `ask-model` run. That stays in the report line.
6. **One fixed report line,** so nobody has to ask which reviewers ran, naming each reviewer's outcome and any skip reason: `Reviewers: Gemini ok · GLM ok (5 findings, 2 verified, 0 unverified) · Codex skipped (one file) · Opus not triggered · 2 of 2 received`.
7. **Zero-retention routing:** add `"zdr": True` to the existing `body["provider"]` in `~/.agents/bin/ask-model-openai`. The only caller is `ask-model openrouter`. The fake-response test hook skips the network and never exposes the request body, and no flag reaches `provider.only`, so the proof is a one-off `curl` negative control, as run 2026-11-05, plus a grep for the field.
8. **`docs/technical/metered-services.md`:** add an OpenRouter registry row (price range and read date, source, where usage is read, guard), as that doc requires for any new paid API. It has no OpenRouter row today (grep, 2026-11-05).
9. **Review of this change:** a full `/finish` run, not one lens. `scripts/review_receipt.py` is a gate, so the Opus adversary row applies, and more than one file means Codex applies.

Known readers of the receipt, grepped 2026-11-05, to re-run at `/dev`: `.claude/hooks/verify-before-stop.py` imports `locate`, `unreviewed` and `waive`, none of which this touches; `scripts/test-p1505-review-gate.sh` uses a gemini-header fixture; `scripts/pre-commit-checks.sh` pins both sides of the gate near line 829; `dev.md` and `fix.md` call `write` and reach the roster by pointing at Step 4b.

## Cost Budget

Price source: OpenRouter's public endpoint listing for `z-ai/glm-5.3`, read 2026-11-05. It varies by host, so the row below uses the zero-retention endpoint named in the original draft ($0.08 per 1M input, $3.60 per 1M output) as typical and the dearest zero-retention price as the worst case ($2.10, $6.60). `Runs per month` is the count of `/finish` stamps in the shared stamp file over the last 30 days; its value, and the monthly totals worked out from it, are kept in `.private/docs/usage/` and never written here. Token counts are estimated at 4 bytes per token (an assumption).

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | n/a, no end users | n/a | 1 GLM call per `/finish` run; `runs per month` = stamp count over 30 days (figure in .private/) |
| Egress (bytes) | n/a | n/a | Median delegated prompt since 2026-10 is about 6 KB, 90th percentile about 100 KB, 99th about 390 KB (all `ask-model` runs, not only reviews) |
| Log lines | n/a | n/a | 0 added (the run is recorded in the existing delegation log) |
| Service unit x registry price | n/a | n/a | Typical: `10,000 input x $0.08/1M + 1,000 output x $3.60/1M`. Large prompt at the dearest host and the output cap: `100,000 input x $2.10/1M + 16,000 output x $6.60/1M`. |
| Triage tokens | n/a | n/a | The main session checks about 4 extra findings per run. Subscription quota, not cash. This, not the API price, is the real cost of this change, and it is unmeasured; the 30-day check in Done-When is what bounds it. |

1. **Fits today?** `runs per month x cost per run`, for both per-run formulas, with `runs per month` read from the stamp file. Worked figures in `.private/docs/usage/p1630-cost-budget.md`. Verdict: the typical case fits within the prepaid balance for months. The worst-case formula would not, and needs every run to hit a 100 KB-class prompt, the dearest host and the output cap, which no benchmark run approached.
2. **Fits at 10x?** Typical case, yes. The prepaid balance is the hard ceiling at any volume.
3. **If either answer were no:** gate GLM by stakes like Codex. Spend is read from `total_usage` on OpenRouter's `/credits` endpoint. The guard is the prepaid balance: empty means GLM reports missing and never blocks.

## Alternatives Considered

| Option | Verdict | Why |
|---|---|---|
| A. Always-on and advisory, with a 30-day check | **Chosen** | Cash cost is negligible, it fits the 2026-10-16 ruling (cheapest first, add as stakes rise), and it gives every run a second vendor. Evidence is thin at both ends: one extra case on large diffs, almost no data on small ones. The Done-When check decides whether it stays. |
| B. Run GLM only when Codex does not | Fallback | Least triage, and it adds a second vendor exactly where Gemini is alone today. Unproven: only 2 of the 12 bug cases are that size. This is what the 30-day check falls back to. |
| C. Replace the Gemini review | Rejected | The reviewers fail differently: GLM missed 3 of 12 and Gemini found one GLM found only half of. |
| D. Let GLM count as sufficient receipt evidence | Rejected | The floor invariant. |
| E. Add local Qwen as well | Deferred | It needs about 24 GB free and its real start is untested. |
| F. Require any two vendors on every receipt | Deferred | Directly attacks single-reviewer receipts, and Gemini plus Codex could satisfy it with GLM down. It blocks when Codex is out of quota and GLM is down, so it needs a degraded mode for a case that is rare once GLM runs every time. `vendors` will show how often single-vendor receipts still happen; reopen on that. |
| G. Pick reviewers by live quota | Moved out | A real need, but `/finish` is not the only surface where the roster is chosen. See Non-Goals. |

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Triage work: about half of GLM's extra findings do not reproduce | MITIGATE | Solution 2 and the 30-day check. Token cost is unmeasured and listed in the budget. |
| A GLM-only receipt clears the gate | MITIGATE | Solution 4 and the first Invariant. |
| Embargoed diff reaches a third-party host through GLM | MITIGATE | The embargo Invariant. Gemini already receives embargoed diffs; that is an existing, separate question and is not changed here. |
| A public-repo diff goes to a third party before it is pushed | ACCEPT | Same scan as the Gemini path, plus zero-retention routing. |
| Zero-retention narrows the pool and a run returns 404 or a slower host | ACCEPT | GLM is reported missing and never blocks. |
| Another reader of the receipt breaks | MITIGATE | Listed under Solution, re-run at `/dev`. |
| OpenRouter outage or exhausted credits | ACCEPT | GLM is reported missing and never blocks. |
| The host serving GLM varies between runs, so the benchmark may not hold for it, and the header does not record the host | ACCEPT | On 2026-11-05 the same host served test requests with and without `zdr`, on one request each. Recording the host needs an `ask-model` header change, left for the next benchmark. |
| A newer GLM version appears and `OPENROUTER_MODEL` goes stale | DEFER | `model-watch` reads the OpenRouter catalog, but its bump plan checks `google/` ids and nothing points it at this key (grep, 2026-11-05). File with `/note` at `/dev`. |
| Small benchmark, one judge, a sample that favours Codex and Gemini | ACCEPT | The change is cheap and reversible, and `vendors` starts producing real data. |

**Non-Goals**
- Do NOT make GLM or local Qwen sufficient receipt evidence.
- Do NOT change the Gemini, Codex or Opus rows or their conditions, except that an embargo skip of GLM makes Codex run.
- Do NOT add local Qwen to `/finish` in this spec.
- Do NOT edit `ask-model` or `ask-model-openai` beyond Solution 7.
- Do NOT call GLM from `/dev` or `/fix` directly; they reach it through Step 4b.
- Do NOT write the model id into the skill file.
- **This spec does not reduce the founder's typed review requests, and does not make the gate see subagent edits.** It changes one roster and one receipt. Who builds, who reviews a spec, what happens when a reviewer is out of quota, and the Stop-hook gate's blindness to subagent edits belong to a separate spec.

## Done-When

- [x] `/finish` Step 4b lists the GLM row. A `/finish <file>` run on a changed file produces a GLM output file whose first line is `ASK-MODEL: vendor=openrouter ... verified=served ... exit=0`, and the report carries the fixed `Reviewers:` line.
- [x] With GLM unreachable (key unset or credits out), `/finish` reports GLM as missing and still writes the receipt from Gemini or Codex evidence.
- [x] On a branch whose spec is `disclosure: embargo`, the GLM row is skipped, the report says `GLM skipped (embargo)`, and the delegation log shows no `vendor=openrouter` line for that run. Same for a changed `.private/` path.
- [x] `python3 scripts/review_receipt.py write` with only an openrouter evidence file exits non-zero and says why; the same with only a local evidence file; with an old gemini file plus a fresh openrouter file it refuses; with openrouter plus gemini it succeeds and records both in `vendors`; with gemini only it succeeds as before. Canned-header tests added and run, exit codes pasted.
- [x] A GLM finding reaches the founder only after a check, or labelled `unverified`; the report shows `N findings, M verified, K unverified`.
- [x] The Freshness bullet and Step 6b say a fresh Gemini or Codex run is required on every new snapshot, a re-review with GLM alone is refused by `write`, and an unreachable finder is reported missing without blocking.
- [x] `grep -n zdr ~/.agents/bin/ask-model-openai` finds the field. A `curl` with the same `provider` body and `only` set to a provider outside the zero-retention list returns 404, and a real `ask-model openrouter` run still exits 0.
- [ ] On an embargoed spec's branch with a one-file change, Codex runs. On a feature branch whose spec has no `disclosure` value, GLM is skipped with the reason stated.
- [x] A `/note` entry with `due: month` is filed: read ten `/finish` runs from the 30 days after merge. If GLM produced no verified defect the other reviewers missed, fall back to Alternative B, or remove GLM if it is no better there.
- [x] `grep -n -i glm .claude/commands/slava/build/finish/SKILL.md` finds the row and no model id; the row names `OPENROUTER_MODEL` in `~/.agents/model-defaults.env` as where the id lives.
- [x] `docs/technical/metered-services.md` has a dated, sourced OpenRouter row.
- [x] Every other reader of the receipt and of the evidence pattern was found by grep and still passes its tests: `.claude/hooks/verify-before-stop.py`, `scripts/test-p1505-review-gate.sh`, `scripts/pre-commit-checks.sh`, `dev.md`, `fix.md`. The post-merge re-check moved to the inbox by founder decision, 2026-11-05.
- [x] A full `/finish` review of this change, including the Opus adversary, is clean, or each finding is fixed or listed.

## Rollback Strategy

Revert the one commit in this repo (skill text, the vendor check, the `vendors` field) and the one line in `ask-model-openai`. Receipts written before the revert stay valid, because `vendors` is additive and nothing reads it yet. No data to migrate.

## Related

- P1505: the review gate this changes.
- P1531: the metered-service rules (the registry row).
- P1158: AI key provisioning.
