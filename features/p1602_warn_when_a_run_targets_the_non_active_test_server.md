---
status: week
type: task
rank: 86
workstream: infrastructure
created_date: '2026-11-03'
tags: [testing, self-hosted, guard]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1602: Warn when a run targets the non-active TEST server

## Problem

**Situation:** Self-hosted is the one default TEST server, and hosted TEST is opt-in (decisions.md 2026-10-29, P1591). Migrations and test SQL follow that state. Dev servers and Playwright do not compare their own target with it.
**Complication:** P1536 ran on hosted TEST for a day because a brief and a spec note said self-hosted had drafting off, blaming a rule that had already been narrowed. Nothing asked why a run was on the non-default server. Heavy runs went to the free-plan project until it stopped answering, though overload as the cause is unproven.
**Question:** How does a deliberate hosted run state its reason, so a stale premise gets challenged on day one?

> Founder framing, verbatim: "we need to make sure this and future agnets will not comit same mistake"

## Appetite

Blast radius: every dev server and Playwright start, though only as stderr output. Reversibility: git revert. Decision density: zero.

## Invariants

- Warn, never refuse. Hosted stays a legitimate opt-in (P1591, which rejected a refusal in a similar case under epistemic gate 7c).
- A failure to resolve the active server prints one note and blocks nothing.

## Solution

One shared check, called where Playwright config already guards test database runs and from the Vite dev server at start. When the active server is self-hosted and the run's Supabase URL is hosted TEST, print to stderr that hosted is opt-in, and ask why it is needed. `CP_HOSTED_TEST_REASON` records the reason; it is then printed in place of the question, and in the line Playwright prints at startup from its global setup. The check is one direction only: a self-hosted run while hosted is active is a deliberate flip state and stays silent.

| Active server | Run target | Mode | Reason set | This check prints |
|---|---|---|---|---|
| self-hosted | hosted | dev server (`vite` serve), Playwright run | no | warning with the question |
| self-hosted | hosted | dev server, Playwright run | yes | the reason |
| self-hosted | hosted | Playwright `--list` or `--ui` | any | same as a run: the target is real, and a config load must not hide it |
| self-hosted | hosted | CI, vitest, `vite build` or `preview` | any | nothing |
| self-hosted | self-hosted | any | any | nothing |
| hosted | any | any | any | nothing |
| unresolved (flip file missing or unreadable) | any | dev server, Playwright run | any | one note, then continue |

"Nothing" concerns this check's output only; other startup warnings are unaffected.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Warning lost behind `tail` or in a backgrounded dev server | ACCEPT | Playwright's header carries it too; state the limit in the guard's comment |
| A private vitest config bypasses it | DEFER | No shared integration setup exists to host it; revisit if it recurs |
| Noise on correct runs | MITIGATE | Silent on every default flow, proven by the workflow runs below |
| The stale premise is supplied as the reason | ACCEPT | A warning cannot force a re-check: it puts the question in the agent's output on day one, and gate 3b covers checking it. This reduces recurrence and does not eliminate it |

**Non-Goals**
- Do NOT refuse or slow any run.
- Do NOT add a hosted health watcher.
- Do NOT add a spec-text sweep for "founder's rule": measured 11 hits in open specs, about half flagged with no defect, and it would have missed the real one.

## Done-When

- [ ] A hosted run while self-hosted is active prints the warning and exits 0, shown by a canary beside `scripts/test-p1591-active-test.sh`
- [ ] The same canary with a self-hosted URL prints nothing (the control)
- [ ] With the reason set, the reason is printed instead, and appears in Playwright's startup line
- [ ] Every row of the matrix is proven: the helper by the canary, and one real default dev server, one real default Playwright run and one real hosted Playwright run by hand
- [ ] A missing flip file prints one note, and the dev server still starts

## Alternatives Considered

- Refuse hosted runs: blocks legitimate opt-in work.
- Rule text only: `db-access.md` already said to use the active server, was loaded, and did not fire against a brief.

## Rollback Strategy

Revert the commit; nothing persists.

## Related

P1591 · P1557 · P1536 · decisions.md 2026-10-29 "One default TEST server"
