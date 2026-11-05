# P1638 results: does a harness or more context make the Argon reviewer better?

Run 2026-11-05 on the [manifest](p1638-benchmark-manifest.json), fixed before any scored run. Spec: [P1638](../../features/p1638_external_reviewers_repo_access_experiment.md). Argon only; no GLM or OpenRouter call.

**Verdict: neither setup qualifies. Keep today's reviewer.** The Decision Criteria were pre-registered, and these are raw counts on 12 cases, not statistical claims.

**Read these limits first:**
- **Blinding is only partial.** The scorer saw shuffled files with no setup names, but citations and writing style can give a setup away.
- **The benchmark was selected to include context-dependent defects.** It does not show how much reviews improve overall, and it says nothing about GLM.

## Setups

| Setup | Input | Runs |
|---|---|---|
| A | Criteria plus the diff, through the test gateway with no tools | 36 |
| C | A plus the full text of changed files. Only `docs/decisions.md` in CF-3 was left out, under the 1 MB rule fixed in the manifest | 36 |
| D | A plus a read-only export, under sandboxed DSH with a shell | 36 |

**D is not plain DSH.** As first specified it hit the input limit on every pilot run, and it read until wrap-up on all 3 runs even with a 700k ceiling. It was scored with a budget note, a live budget meter and tighter tool-output settings, all fixed before scoring. D's result describes that setup.

## Results

| Measure | A | C | D |
|---|---|---|---|
| Cross-file defects found, of 6 | 1 | 3 | 2 |
| Evidence in a changed file, of 3 | 0 | 1 | 1 |
| Evidence only in an unchanged file, of 3 | 1 | 2 | 1 |
| Cross-file matches, of 18 runs | 4 | 9 | 7 |
| Cross-file matches by run (A's spread and the others) | 2, 1, 1 | 4, 3, 2 | 2, 2, 3 |
| Diff-visible defects found, of 3 | 3 | 2 | 3 |
| Diff-visible matches, of 9 runs | 9 | 7 | 8 |
| False claims, total | 26 | 9 | 3 |
| False claims per review | 0.72 | 0.25 | 0.08 |
| Real but unexpected, distinct, of 50 across all setups | 17 | 36 | 45 |
| Found by this setup alone | 0 | 4 | 13 |
| Tool calls per review, mean | 0 | 0 | 15.6 |
| Input tokens per review, median | 6,778 | 46,006 | 164,536 |
| Output tokens per review, median, thinking included | 1,094 | 1,256 | 5,235 |
| Cost per review, mean, at current prices | $0.034 | $0.126 | $0.396 |
| Cost per review, mean, after 2026-11-30 | $0.067 | $0.252 | $0.791 |

A defect counts as found when matched in at least 2 of 3 runs. Cost treats all input at the full rate. The API reported much of C's and D's input as cached, so true cost is lower.

Matches per case, run 1 to 3 (Y match, . miss, * found):

| Case | Type | A | C | D |
|---|---|---|---|---|
| CF-1 | cross-file, changed file | `...` | `...` | `.Y.` |
| CF-3 | cross-file, changed file | `...` | `YYY` * | `..Y` |
| CF-4 | cross-file, changed file | `Y..` | `...` | `Y.Y` * |
| UF-1 | cross-file, unchanged file | `YYY` * | `YYY` * | `YYY` * |
| UF-3 | cross-file, unchanged file | `...` | `YY.` * | `...` |
| UF-6 | cross-file, unchanged file | `...` | `Y..` | `...` |
| DV-1 | diff-visible | `YYY` * | `YYY` * | `YYY` * |
| DV-2 | diff-visible | `YYY` * | `YYY` * | `YYY` * |
| DV-4 | diff-visible | `YYY` * | `..Y` | `.YY` * |

## Verdict against the Decision Criteria

| Rule | C | D |
|---|---|---|
| At least 2 more cross-file defects than A | Pass (+2) | **Miss (+1)** |
| At least 6 more cross-file matches than A | **Miss (+5)** | **Miss (+3)** |
| No fewer diff-visible defects than A | **Miss (2 against 3)** | Pass (3 against 3) |
| False claims per review no higher, or increase under 1 | Pass (-0.47) | Pass (-0.64) |
| **Candidate for a follow-up** | **No** | **No** |

- **Criterion 3 applies:** neither qualifies, so today's reviewer stays. Criterion 4 also applies to C: its result is close, and a close result counts as no proven gain.
- **Criteria 6 to 9 do not stop the verdict.** Containment controls passed for D (6). No run went unrun and the budget stop did not fire (7). D's runs at a limit were 9 of 36, or 25%, against the one-third line (8). A found 1 cross-file defect, below the 5 that would void the benchmark (9).

## Accounting

All 108 planned runs ran: 97 completed, 7 hit a limit and kept their output, and 4 hit an output limit with no output. Those 4 are A on CF-3 twice, D on CF-3 once and D on UF-3 once. Each was thinking that used up the whole limit, and each counts as a miss under the spec's rule. The served model was `gemini-4-argon` on every request of every run.

**Total spend stayed under the $40 hard stop,** and the stop did not fire. The figures are in `.private/` (own spend is not published). The pilot went over its $4.08 estimate, because it took several rounds to find a D setup that stops on its own.

## How firm the result is

- **A's two empty CF-3 runs do not help C.** The output limit was set by the pilot, and it probably cost A those runs. Crediting A could only shrink C's gain, and C already fails.
- **D's two empty runs do not rescue it on the scorer's matches.** Counting both as matches gives 9 of 18, or +5, still short of +6.
- **Only a stack of favourable assumptions reaches D's threshold:** every Codex call in D's favour and both empty runs counted as matches. The spec's rule is that an empty run is a miss, so this is not the result.
- **The 2 flagged adjudications do not change it.** Each was tested by reversing it.

## Audit

Codex independently scored all 77 non-empty reviews on the 9 defect cases, plus a random 20% of other findings (125 of 625).

- **Matches:** 74 of 77 agree. The 3 disagreements are all D: Codex would add 2 matches on CF-1 and remove 1 on CF-4. Taking every Codex call in D's favour gives +2 defects but only +5 matches, so D still does not qualify. None would change a verdict, so none needs the founder's ruling.
- **Findings:** the verdicts are identical on 112 of 125, and agree on whether a finding is false on 119 of 125. The false-claim test passes by far more than these 6 could move.
- **The audit had a failed first attempt.** The first findings run returned "unverifiable" for all 125 because Codex could not reach the commits. It was discarded and re-run on plain exports, after a 4-item control including known-false items came back correct. `ask-model` marked the final run exit 126 because its evidence line was not where the check expects it; the line is present, and every verdict cites a file and line.

## What else the data shows

These do not change pass or fail, and the verdict covers recovery of the proven defects only.

- **False claims fell as context rose:** 26, then 9, then 3. This was not a threshold anyone could win on, but it is the largest difference in the table, and it bears directly on the spec's question about why extra findings fail to reproduce.
- **More context also found more other real defects.** 50 distinct ones turned up, including in the 3 "clean" cases, where "clean" only ever meant none known. The scorer gave each a counterexample or reproduction; the main session re-ran 4, and all 4 held. The rest are the scorer's claims. The full list is held privately, because some may describe weaknesses still live.
- **D barely used its shell:** 1 of 36 runs, against 385 reads, 135 searches and 39 file globs. In practice this tested read and search. UF-6, chosen because a shell could see a file's size, was missed by all 3 D runs.
- **D's instruction files:** DSH loaded the repo's `AGENTS.md` or `CLAUDE.md` into D's first request, whichever the commit had. A and C did not get them.
- **Benchmark notes:** A found UF-1 on all 3 runs, though its evidence lies in an unchanged file, so that case separated nothing. C's matches on UF-3 drew partly on a changed file's related code.

## Containment

58 of 58 controls passed on the final setup, from inside the sandbox with exit codes recorded. These targets were first shown to exist and be reachable outside it: decoys under `$HOME` and temp, DSH's real credentials and sessions, the manifest, writes outside the work area, signals to another process, and requests to hosts. Grounding and OpenRouter requests through the test gateway were refused, with no outside probe of either (see below). A file in the export read correctly and the gateway reached Argon.

- **Not exercised:** the AppleEvents probe failed at script compile, before any event was sent. The profile denies by default and has no allow for it.
- **Not probed from outside:** OpenRouter, because this experiment makes no OpenRouter call, and grounding, because a live grounded call would give a reviewer path web access. For both, a function-tool request through the same gateway path passed, and the p78 gateway's source shows the route or tool the test copy removed.

Everyday DSH's configuration and the gateway's LaunchAgent match the checksums taken at the start, and the agent is still disabled. One note: a `--help` call before the baseline regenerated the generated stub `profiles/headless/cordis.yml`, whose hash matches the `web` profile's stub. The test profile, gateway copy and DSH homes are removed.
