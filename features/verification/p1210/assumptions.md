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
| A-4 | 16 rows collapse 20 Done-When lines; four rows carry two lines each | One row per Done-When line | Nothing — the pairs share a subsystem and a fixture set, and splitting them would run the same file twice under two names |

## Added by the loop

<!-- append below; do not rewrite the seeded rows -->
