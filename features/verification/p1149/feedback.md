# P1149 — Feedback Instrument

Two numbers, written when corrections are given. Quality bought with runaway spend reads
as success on a one-axis scoreboard — this file is the second axis.

corrections given: 1

The user sent one interrupt mid-session with no corrective content attached, and the run
resumed on the `/goal` Stop hook's own directive to continue. Later, when CHECK 5's
2-consecutive-PASS requirement became structurally unreachable from a FAIL×4→PASS
sequence, the agent presented four resolution options via a direct question rather than
deciding unilaterally (modifying shared gate infrastructure or accepting a red gate were
both judged to need founder authorization) — the founder chose "archive rounds 1-4, run a
fresh pair," which the agent executed. Counted as one correction: a policy decision the
agent could not make on its own.

turns consumed: ~55-60 (estimated from visible conversation turns since the goal was
acknowledged; not an instrumented count — this session has no turn counter to read from).
Covers: spec/context research (4 parallel Explore agents), branch fast-forward to main,
migration authoring + two rounds of live-DB debugging found via real e2e tests (RLS
recursion, then INSERT-RETURNING vs. RLS), full feature implementation (hook, service
layer, page, routing), 5 vitest files + 3 Playwright specs (iterated to green), 8 rounds of
blind visual review (6 of which found and drove real fixes: banned-color violation,
ended-screen deviations, missing prominent stop control, status/action color collision,
broken headline typography — a pre-existing repo-wide `font-serif` bug found along the
way), a genuinely unpassable mechanical-gate edge case worked through with the founder
rather than routed around unilaterally, and this instrument.
