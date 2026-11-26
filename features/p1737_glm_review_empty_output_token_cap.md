---
status: week
type: bug
rank: 362
severity: medium
workstream: infrastructure
date_reported: '2026-11-26'
created_date: '2026-11-26'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [finish, review, openrouter, reviewers]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1737: GLM reviews come back empty on large prompts because the wrapper caps reasoning and answer together at 16,000 tokens

## Summary

`ask-model openrouter` (the GLM reviewer in `/finish` and spec review) returns `verified=failed exit=5` with no review on large prompts: it spends the whole fixed 16,000-token output budget on reasoning, so the answer is cut off or never starts. Promoted from the task inbox, 2026-11-26.

## Root Cause

`~/.agents/bin/ask-model-openai` sends `max_tokens` from `--max-tokens`, default 16000 (`ap.add_argument("--max-tokens", type=int, default=16000)`). `~/.agents/bin/ask-model` calls it without `--max-tokens` (grep for `max-tokens` in `ask-model` finds nothing), so every GLM run gets 16,000 tokens for reasoning and answer combined. On large review prompts GLM reasons past that even at `OPENROUTER_EFFORT=low`: the failed runs' headers report `reasoning_tokens` between 12,643 and 16,002 (20 of 22 report it; 14 of the 22 ran at `low`). The API returns `finish_reason=length` and the wrapper correctly refuses the partial output (exit 5).

The cap is the wrapper's choice, not the model's: OpenRouter's public endpoint listing for `z-ai/glm-5.3`, read 2026-11-26 without generating anything, gives every host a maximum output of at least 131,072 tokens.

## Invariants

- **A cut-off answer is never accepted as a review.** Exit 5 on `finish_reason != stop` stays (`ask-model-openai`, "the only completion status that proves the answer is whole").
- **Zero-retention routing and no fallbacks stay** (`provider: {allow_fallbacks: false, zdr: true}`, P1630).
- **GLM stays advisory**: a failed run is reported missing and never blocks (P1630).
- **The limit is read from `~/.agents/model-defaults.env`, not hard-coded in a skill** (P1630's rule for the model id applies to its settings too).

## Reproduction Steps

1. Take a review prompt of about 60 KB or more (for example the `/finish` prompt for a multi-file diff).
2. Run `~/.agents/bin/ask-model openrouter --timeout 600 --prompt-file <prompt>`.
3. Observe the first line, `ASK-MODEL: vendor=openrouter requested=z-ai/glm-5.3 ... verified=failed effort=low reasoning_tokens=<12k-16k> exit=5`, the wrapper's "generation did not finish cleanly" message (its exit 5 for any `finish_reason` other than `stop`), and an empty review.

**Reproduction rate:** intermittent, depends on prompt size. 22 of 369 distinct GLM result headers in session transcripts since 2026-11-05 are exit 5. One session (P1674, 2026-11-13) lost 5 of 5 GLM runs this way on prompts of 20 KB to 260 KB. The size of the other 17 failed prompts was not recovered.

## Expected Behavior

A GLM review of a large prompt returns a complete answer, or fails for a reason other than the wrapper's own budget.

## Actual Behavior

`exit=5`, `finish_reason=length`, empty output; the round is reported `GLM missing (exit 5)` and runs one reviewer short.

## Affected Files

- `~/.agents/bin/ask-model-openai` — `--max-tokens` default 16000. Unchanged by the fix; it stays the default for `local` and for an absent key.
- `~/.agents/bin/ask-model` — its only `ask-model-openai` call (around line 579, shared by `openrouter` and `local`) passes no `--max-tokens`; the setting is read in the `openrouter` block (around line 198), beside `OPENROUTER_EFFORT`.
- `~/.agents/model-defaults.env` — where an `OPENROUTER_MAX_TOKENS` setting would live, next to `OPENROUTER_EFFORT`.

## Severity

**Medium.** GLM is advisory and other reviewers still run, but about 6% of GLM runs return nothing, including every run of one session's large review prompts.

## Fix Approach

Add `OPENROUTER_MAX_TOKENS` to `model-defaults.env`, read it in `ask-model` the way `OPENROUTER_EFFORT` is read, and pass it as `--max-tokens` for `openrouter` only. `ASK_MODEL_OPENROUTER_MAX_TOKENS` overrides the file, as `ASK_MODEL_OPENROUTER_EFFORT` does. When neither is set, `ask-model-openai`'s current default of 16000 applies. Both sources are validated the same way: a whole number from 1000 to 131072 (the smallest host limit), a plain `KEY=value` line in the file, anything else refuses to run. The `OPENROUTER_EFFORT` check cannot be copied as is, because its pattern accepts any word. Choose the value by re-running the largest saved failing prompts. The failed runs' reasoning spend stopped at 16,000 only because the cap stopped it, so their real need is unknown. About 48,000 is a starting point, below every host's published limit (131,072 at the smallest). Lowering `OPENROUTER_EFFORT` is not the fix: the failures already happen at `low`.

**The timeout moves with the cap.** `/finish` and spec review call GLM with `--timeout 600`. Finishing 48,000 tokens in 600 seconds needs about 80 tokens a second, which the zero-retention hosts may not sustain. A fix that only raises the cap could turn the same lost reviews into timeouts. Measure the elapsed time on the re-run prompts. If the largest one does not finish within 600 seconds, raise the timeout in both callers in the same change.

**Whether the cap changes successful runs is unverified.** A run that stops on its own below 16,000 tokens should not get longer. That holds only if GLM's reasoning length does not scale with `max_tokens`; some OpenRouter models map effort to a share of `max_tokens`. The failures argue against it for GLM (14 reached 12,600 or more reasoning tokens at `low`, far above any 20% share of 16,000), but it is checked after the change, not assumed.

Rejected alternative, checked against decisions 2026-11-25 [process] (Gemini `MAX_TOKENS`): there, raising the wrapper's output limit was deferred until the model's real limit was read without generating. For GLM that read is done (above), so the same objection no longer applies.

## Cost Budget

Price source: `docs/technical/metered-services.md`, OpenRouter row (P1630): zero-retention hosts typical $3.60 and dearest $6.60 per 1M output tokens, list prices. Output is charged per token generated. If reasoning length does not scale with `max_tokens` (Fix Approach), only runs that would have hit 16,000 tokens spend more; the after-change check verifies this. Those runs already use the whole cap today and return nothing. A run that needs more than the new cap still fails, after using the whole larger cap.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | n/a, no end users | n/a | Unchanged: 1 GLM call per `/finish` run or spec review |
| Egress (bytes) | n/a | n/a | Unchanged |
| Log lines | n/a | n/a | 0 added |
| Service unit x registry price | n/a | n/a | Worst case per run rises from `16,000 x $6.60/1M` = $0.11 to `48,000 x $6.60/1M` = $0.32, whether or not the run then succeeds. Successful runs' reasoning spend: median 4,124, 90th percentile 9,659, maximum 14,234 tokens (322 headers), so a typical run is unchanged |

1. **Fits today?** Yes, if the after-change check holds: then only runs that would have failed spend more, about 6% of runs. Monthly figures stay in `.private/docs/usage/`.
2. **Fits at 10x?** Yes; the prepaid balance is the ceiling, as in P1630.
3. **If not:** drop the cap back to 16,000 and accept the missing runs.

## Acceptance Criteria

- [ ] The three largest saved prompts that failed with exit 5 before the fix each end `verified=served ... exit=0` with a complete review, with `reasoning_tokens` and elapsed time pasted, each well below the new cap and within the callers' timeout.
- [ ] The cap comes from `OPENROUTER_MAX_TOKENS`: a test with the fake-response hook (`ASK_MODEL_OPENAI_FAKE_RESPONSE` and `ASK_MODEL_OPENAI_FAKE_BODY`, both needed) and a temporary defaults file set to a non-default value (for example 12345) shows exactly that value in the request body, along with `allow_fallbacks: false` and `zdr: true`. With the key absent the body carries 16000. The environment override wins over the file. `0`, `-5`, `16k`, `48000.5`, `200000` and a quoted or commented line each make `ask-model` refuse to run, from the file and from the environment variable. A `local` run's body still carries 16000.
- [ ] If the largest re-run prompt needs more than 600 seconds, the GLM timeout in `/finish` Step 4b and the spec review is raised in the same change.
- [ ] A task-inbox item due two weeks after the change is filed (`/note`): compare the median `reasoning_tokens` of successful GLM runs with today's (median 4,124 over 322 runs), to confirm the cap did not lengthen runs that already finished.
- [ ] A run that still ends with `finish_reason=length` still exits 5 (shown with the fake-response hook), so `/finish` Step 4b reports it `GLM missing (exit 5)`.
- [ ] The existing wrapper tests in `~/.agents/bin/` still pass.
