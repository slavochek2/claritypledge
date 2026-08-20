# P1114 — calls the loop made alone

Every judgement made without asking the founder goes here, at the moment it is made.
**There is no escalation clause.** The agent decides, logs, and continues; this log is the
price of not being interrupted.

Format: `- [YYYY-MM-DD] <what was assumed> — <why> — <what would falsify it>`

- [2026-08-20] Seeded fixture event for `e2e/p1114-gate.spec.ts` is read from
  `P1114_TEST_EVENT_SLUG`, defaulting to `p1114-gate-fixture` — so the file never hardcodes an
  event a later migration might rename — falsified if the fixture helper mints a slug the
  variable is not set from, which shows up as every gate test failing on navigation.
