# P1210 — assumptions log

Every call the loop makes alone. **There is no escalation clause**: the agent decides, logs, and
continues. The log is the price of not being interrupted.

Format: one row per call. Date, the call, what it was chosen over, and what would reverse it.

## Seeded by /goalify, 2026-09-01 — before the loop started

| # | Call | Chosen over | What would reverse it |
|---|---|---|---|
| A-1 | Zero COMPARABLE rows; every checkable row is MECHANICAL | Classifying the objective-table and input-turn rows COMPARABLE | `goal-gate.sh` CHECK 5 gaining a non-visual reviewer path. Today it hard-fails a round that judged zero screenshots, so a COMPARABLE row here is unsatisfiable without fabricating images |
| A-2 | Regression rows assert against a committed redacted fixture, plus the real run file only when present | Reading `.private/points-runs/ai-power-remedies.run-B.md` directly | The run file becoming committable — it is not, and this spec's own Invariant is why |
| A-3 | Rows run whole files, never `-t` filters | Per-row `-t` granularity | vitest changing its zero-match exit code. Measured 2026-09-01: it exits **0**, which makes a filtered row a green that asserted nothing |
| A-4 | 16 rows collapse 20 Done-When lines; **three** rows carry more than one — DW-4+5 (2), DW-9+10 (2), DW-12+13+18 (3), plus 13 single-line rows. **Corrected 2026-09-03:** this originally read "four rows carry two lines each", which reaches 20 by coincidence (13+2+2+3 = 20, as does 12+4x2) and so was never caught by a total | One row per Done-When line | Nothing — the pairs share a subsystem and a fixture set, and splitting them would run the same file twice under two names |

## Seeded by the SECOND /goalify, 2026-09-03 — after the first contract was rejected

The seeded rows above are left unrewritten. A-1 and A-2 still hold; **A-3 is superseded by A-6**.

| # | Call | Chosen over | What would reverse it |
|---|---|---|---|
| A-5 | The eight behavioural rows become **rule-presence** checks that say so in their own text, decided by `rule-present.mjs` with a must-fail fixture each | Deleting them, or leaving them demanding a verdict on agent behaviour | The pipeline gaining an executable stage the checks could observe. Today it is six markdown files with zero executables, so a test can assert prose contains a rule and nothing more (§12) |
| A-6 | Rows run whole files **and** a dedicated row scans the suite for `.skip` / `.todo` / `.only` plus a zero-execution floor (DW-21) | Whole-file rows alone, which A-3 assumed sufficient | vitest changing the exit code for an all-skipped file. Re-measured 2026-09-03 in this session: **exit 0**, so A-3's conclusion was wrong and all 16 rows of the first contract could have been green with zero assertions executed |
| A-7 | DW-13 and DW-18 run against a **committed fixture store tree** under `src/tests/fixtures/p1210/stores/`, with the store root and ledger path as parameters | Reading the four real stores under `~/.local/share` | Nothing — the first contract routed those rows ci-tier while depending on a home directory CI does not have, and CHECK 2's tier heuristic routes only `playwright` and `e2e/` to local |
| A-8 | The run-B expectations (five canonical pairs, two counts, P3 `AMBIGUOUS-PAIR`) are **derived at goalify time by hand** and pinned in DW-4; the loop writes only the checker | Letting the loop compute them from its own fixture, as the first contract's hedge licensed | The derivation being shown wrong. Then DW-4's numbers change and the contract is re-pinned — never the checker's output promoted to the oracle |
| A-9 | Three rows added that the first contract had none of: DW-21 (no vacuous tests), DW-22 (one implementation, two callers), DW-23 (fixture derived and name-clean) | Trusting the existing anti-vacuity machinery, the §12 wiring, and the fixture's redaction | Each has a measured failure behind it: exit 0 on an all-skipped file; §12's own "two callers" requirement having no check; and a verbatim contradiction sentence reconnecting an A1–A5 roster to real people, which is this spec's own Invariant broken in its test data |
| A-10 | DW-23's derivation half prints `DERIVATION: UNVERIFIABLE (source absent)` and exits 0 in CI | Making the whole row local-tier, or committing the run file | The run file is gitignored and this spec's Invariant is why. The name and sentence scans always run because they read only the committed fixture, so the row is never fully vacuous — but the byte-for-byte half is verified locally, not in CI, and that is stated in the row |

## Added by the loop

<!-- append below; do not rewrite the seeded rows -->
