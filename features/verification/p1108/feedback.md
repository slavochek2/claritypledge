# P1108 — Feedback Instrument

Per `goal-gate.sh` CHECK 6: two numbers, not one — quality bought with runaway spend must not read
as success on a one-axis scoreboard.

- **Corrections given:** 2 — after the initial implementation and a green `goal-gate.sh` run, the
  founder asked "how do I verify or I don't?" (redirected the agent from declaring done to actually
  substantiating verification) and then "did we run adversarial review? if not lets do it? opus?"
  (explicitly requested the review that surfaced the CRITICAL/HIGH findings below). Both corrections
  came from the human, not from the agent's own re-diagnosis — the initial green gate did not
  self-identify these gaps; epistemic gate 7b's "green bounds what was modelled, not what is true"
  was the human's call to make, not a self-caught one.
- **Turns consumed:** ~35-40 of the original 30-turn budget (exceeded — the review + fix pass was
  requested mid-session, after the original goal condition had already been satisfied once). 4
  Opus adversarial-review subagents spawned in parallel; all 4 reported. Findings: 1 CRITICAL, 4
  HIGH (after dedup across reviewers — several were independently found by 2-4 reviewers each), ~8
  MEDIUM, ~6 LOW. Fixed in this pass: CRITICAL + 3 of the 4 HIGH (pledge-claim forgery,
  `bindClaim` dead code for story/point, array-shaped `profiles` embed fail-open, cache staleness
  window). Explicitly deferred, not fixed: `og:image` validation, `operator_name` disclosure
  hijacking, the module-load blast-radius MEDIUM, and all LOWs — see
  `features/verification/p1108/assumptions.md` §4.
