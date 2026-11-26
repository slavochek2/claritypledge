---
status: all-done
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
pipeline_ran: [create-bug, inline, ship]
flow: inline
completed_at: 2026-11-26
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

- [x] The three largest saved prompts that failed with exit 5 before the fix each end `verified=served ... exit=0` with a complete review, with `reasoning_tokens` and elapsed time pasted, each well below the new cap and within the callers' timeout.
  Evidence (2026-11-26, cap 48,000 set through `ASK_MODEL_OPENROUTER_MAX_TOKENS`, `--raw --timeout 600`, one run at a time):

  | Prompt | Bytes | Original failure | Re-run header | Elapsed |
  |---|---|---|---|---|
  | 1 | 346,872 | `reasoning_tokens=16000`, exit 5 | `verified=served effort=low reasoning_tokens=14467 exit=0` | 180 s |
  | 2 | 309,658 | `reasoning_tokens=15718`, exit 5 | `verified=served effort=low reasoning_tokens=4221 exit=0` | 65 s |
  | 3 | 294,974 | `reasoning_tokens=16000`, exit 5 | `verified=served effort=low reasoning_tokens=7800 exit=0` | 90 s |

  Those three runs set the cap through the environment variable. One more run of prompt 2 with the env variable unset (same `--raw --timeout 600`): `verified=served effort=low reasoning_tokens=0 exit=0`, 32 s, 11 KB findings table. **This live run only shows the shipped file is accepted and a run completes.** It cannot show the 48,000 was applied, because about 3,000 tokens would also have finished under the old 16,000 and the header does not record the cap. The evidence that the shipped file's value is what gets sent is the hermetic check in the suite ("the real defaults file's cap (48000) is what is sent").

  Each output is a findings table of 7.4 to 9.4 KB. How the prompts were found: `~/.agents/logs/delegation.log` keeps every GLM send in full; each exit-5 header in the session transcripts was paired with the nearest earlier send (within 12 minutes), and the three largest pairs were extracted and checked against the logged sha256. The pairing is by time, not by an id, so it is a strong match and not proof; the re-sent shas equal the originals (`19a182c0…`, `f983db3e…`, `39cad0ac…`). 66 exit-5 results in the transcripts since 2026-11-05 (the spec's 22 counted distinct headers).
- [x] The cap comes from `OPENROUTER_MAX_TOKENS`: a test with the fake-response hook (`ASK_MODEL_OPENAI_FAKE_RESPONSE` and `ASK_MODEL_OPENAI_FAKE_BODY`, both needed) and a temporary defaults file set to a non-default value (for example 12345) shows exactly that value in the request body, along with `allow_fallbacks: false` and `zdr: true`. With the key absent the body carries 16000. The environment override wins over the file. `0`, `-5`, `16k`, `48000.5`, `200000` and a quoted or commented line each make `ask-model` refuse to run, from the file and from the environment variable. A `local` run's body still carries 16000.
  Evidence: `~/.agents/bin/ask-model-maxtokens.test.sh`, `passed: 156   failed: 0` (commits `fceb127`, `9c647ee`, `a328b62` in `~/.agents`). Control: the same suite against the unmodified `ask-model` (from git) fails (the cap never reaches the body, and `0`, `-5`, `16k`, `48000.5`, `200000`, quoted and commented lines all run with exit 0). Further controls from the review rounds, each failing before its fix: "the first plain line wins instead of the last" (passed the 111-check suite, now fails one test); an `export`, other-case or `ASK_MODEL_`-named line beside a valid line (a mutation weakening the guard passed 142/0, now fails); and the fixture helper returning one path for every call (the previous helper, now 3 failing checks). It also checks 999 and 131073 (refused), 1000 and 131072 (accepted), a valid line beside a bad one (refused), an `export `-prefixed, other-case or `ASK_MODEL_OPENROUTER_MAX_TOKENS=` line (refused), and that the shipped defaults file's own line runs. Reading of "commented line": a value with a trailing comment (`KEY=48000 # why`) is refused from the file and from the environment variable; a line that starts with `#` is an ordinary comment, ignored like every comment in that file, so commenting the setting out reverts to 16000 (tested).
- [x] If the largest re-run prompt needs more than 600 seconds, the GLM timeout in `/finish` Step 4b and the spec review is raised in the same change.
  Not triggered: the largest prompt (346,872 bytes) finished in 180 s, so `--timeout 600` in `/finish` Step 4b and in `create-spec.md` is unchanged.
- [x] A task-inbox item due two weeks after the change is filed (`/note`): compare the median `reasoning_tokens` of successful GLM runs with today's (median 4,124 over 322 runs), to confirm the cap did not lengthen runs that already finished.
  Filed as INBOX-P445 in the private store (`/note` routes text naming `~/.agents/...` paths there), check on or after 2026-12-10, but it will probably first surface about 2026-12-18 (`/monthly` last ran 2026-11-19 and `/day` starts it after 28 days). The inbox offers only `due: week` or `due: month` (`inbox-cli.ts`), so it is `due: month` with the date in its text; "due two weeks after" cannot be set more exactly. It was not filed in the public store because `/note` writes to the main checkout's `docs/process-learnings.md`, which held another session's uncommitted edits.
- [x] A run that still ends with `finish_reason=length` still exits 5 (shown with the fake-response hook), so `/finish` Step 4b reports it `GLM missing (exit 5)`.
  Evidence: in the same suite, a fake response with `finish_reason: length` exits 5 with header `verified=failed ... exit=5`, both with the cap set and with none.
- [x] The existing wrapper tests in `~/.agents/bin/` still pass.
  Evidence (final config): `ask-model-effort.test.sh` 80/0, `codex-review.test.sh` 63/0, `delegate-gemini.test.sh` 671/0, `ask-model-image.test.sh` 24/0, `ask-model-scan.recall.test.py` 0 regressions. `ai-keys.test.sh` and `forgejo-autopush.test.sh` were not run: they test neither `ask-model` nor `model-defaults.env`.

## Resolved Decisions

- **Cap value: 48,000** (`OPENROUTER_MAX_TOKENS` in `~/.agents/model-defaults.env`, code in `~/.agents/bin/ask-model`, commits `fceb127`, `9c647ee`, `a328b62` in `~/.agents`). The starting point in Fix Approach held: the slowest of the three failing prompts spent 14,467 reasoning tokens plus about 7.4 KB of answer, roughly a third of the cap.
- **Timeout unchanged at 600 s**: slowest re-run 180 s, which meets the criterion as written. **Residual risk, an inference and not a measurement:** run 1 produced about 16,500 tokens in 180 s (about 91 tokens/s, prefill included), which puts a run that uses the whole 48,000 cap near 530 s, inside 600 s with about 12% margin. A run that burns the full cap on a slow host can still time out (exit 124, reported `GLM missing`, the same outcome as today's exit 5). Raising the callers' timeout was not required and was not done.
- **Cost ceiling of the validated range:** the Cost Budget prices the shipped 48,000 ($0.32 worst case). An environment override can go to 131,072, which is 131,072 x $6.60 / 1M = $0.87 for a run. No caller sets an override today (grep found none).
- **Env var, empty value:** `ASK_MODEL_OPENROUTER_MAX_TOKENS=` (set but empty) is refused, unlike `ASK_MODEL_OPENROUTER_EFFORT`, where empty means unset. Deliberate and tested; the Fix Approach sentence "as `ASK_MODEL_OPENROUTER_EFFORT` does" holds for precedence, not for this case.
- **Review rounds (2026-11-26): round one Gemini + Opus, round two Gemini + Opus, 4 of 4 received.** Round two found that my own counter fix in the test helper returned one path for every call (it ran in `$(...)` subshells), which both reviewers reproduced; replaced with `mktemp` and a control. Round one fixed: an `export OPENROUTER_MAX_TOKENS=...` or other-case line was silently ignored and 16000 sent (now refused); the environment cases for a single-quoted value, a trailing comment and a trailing carriage return were untested; "last plain line wins" and the `#`-line behaviour were untested; the one live verification used the environment override (a file-only run was added). Set aside, with the reason:
  - Gemini: "spec frontmatter lacks `title` and `p_number`, and `week` is invalid" is false. `.claude/rules/features.md` makes `week` a valid status and requires neither field; `criteria/specs.md` is stale against it.
  - Gemini: the two unrun suites. Neither file mentions `ask-model`, `model-defaults` or `OPENROUTER` (0 matches each), and the criterion's evidence names them as unrun.
  - Gemini and Opus: a `#`-prefixed line does not refuse. `OPENROUTER_EFFORT` behaves the same, and refusing would block commenting the setting out to go back to the default.
  - Gemini: `ask-model-openai` does not bound `--max-tokens` itself. Out of scope: Affected Files says that file is unchanged, and `ask-model` is its only caller.
  - Opus (round two sharpened it): the header and `delegation.log` do not record which cap a run used, so a later exit 5 cannot be traced to 16000, 48000 or an override, the file-only live run above cannot prove which cap applied, and the INBOX-P445 comparison cannot exclude override runs. A real gap that blocks those claims, **not built** because the spec did not ask for a header change; founder to decide.
  - Opus: `--check` with a bad cap line exits 2 (normally "secret found"); a carriage return at the end of an env value shows an invisible character in the error; `-ge 1000` never decides on its own because the pattern already forces four digits. All harmless, left as is.
- **Known limitations (not fixed, recorded):** forms that name the key but are still ignored and send 16000: `declare -x`, `readonly`, `KEY: 48000`, `setenv KEY 48000`, and a BOM or zero-width character before the key. The same `export` and letter-case gap exists, from before this change, for `OPENROUTER_EFFORT` and `OPENROUTER_MODEL` (an `export OPENROUTER_EFFORT=high` line is ignored and `low` used); this change did not touch them.
- **Still unverified:** whether the cap lengthens runs that already finish. The same prompt 2 spent 15,718 reasoning tokens when it failed, then 4,221, then 0 on the file-only run. The 0 may be run-to-run variance, a host that skipped reasoning, or a 0 reported in place of a count; the header cannot tell these apart. A handful of runs cannot show the cap's effect either way. The two-week check in INBOX-P445 is the test.
