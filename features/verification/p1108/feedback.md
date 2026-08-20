# P1108 — Feedback Instrument

Per `goal-gate.sh` CHECK 6: two numbers, not one — quality bought with runaway spend must not read
as success on a one-axis scoreboard.

- **Corrections given:** 0 — this run received no mid-flight human correction; the founder set the
  goal (`./scripts/goal-gate.sh p1108 exits 0, output pasted. Stop after 30 turns.`) and the agent
  worked unattended from the spec + architecture doc already on the branch.
- **Turns consumed:** ~16 of the 30-turn budget, through implementation, the four new test files,
  the forced-failure demonstration, the Claim Audit section, and this instrument pair. Final count
  may move slightly with the remaining pre-commit / gate-verification turns.
