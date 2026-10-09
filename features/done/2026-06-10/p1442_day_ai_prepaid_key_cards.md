---
status: all-done
type: task
rank: 24
workstream: infrastructure
created_date: '2026-10-08'
tags: [day, ai-keys, monitoring, kanban]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-10-09
---

# P1442: /day — every AI prepaid key card on the Monitor tab

Split out of P1440 (founder decision 2026-10-08: three specs). Term decided by the founder
2026-10-08: "AI prepaid key card".

## Problem

> Founder framing, verbatim (2026-10-08): "I mean, we have different budgets. I call them cards. I call them prepared cards. But they have different budgets in Google and different caps."

**Situation:** `/day` step 9d builds `monitoring.cloud.keys` from the ai-keys report
(`~/.claude/commands/day.md`, the per-key block ending `cloud["keys"] = keys`). The Monitor tab
renders it (`tools/kanban/src/components/day/MonitoringTab.tsx`).

**Complication:** On the 2026-10-08 report the tab got 5 keys, 3 of them `collected:false` with
"no billing data: unused, or not in the billing export". The billing account holds 10 budgets
(`gcloud billing budgets list`, run 2026-10-08): one account-wide (400), one GPU leak alarm (100),
3 keys with both a cap budget and an alert budget, 2 keys with a cap budget only (1+1+3×2+2 = 10).
The tab already shows the account budget and each collected key's budget with a Raise button
(`MonitoringTab.tsx:144-183`); it does not show cap state, alert budgets, the leak alarm, or the 3
uncollected keys' budgets, and "unused" and "unmeasurable" share one sentence.

**Question:** What does the Monitor tab need so every budget is visible, each key reads as one
card, and "unused" is only said when it is measured?

## Appetite

Blast radius: low — the founder's local board and one /day step; read-only against Google.
Reversibility: high — git revert. Decision density: zero (term decided).

## Invariants

- Read-only: nothing in this work creates, changes or deletes a budget, cap or key.
- "Unused" is said only on positive evidence; absence of data reads "unmeasurable", never EUR 0
  (the current 9d block already says "never as EUR 0").
- No project id reaches the board (current rule in the 9d block).

## Solution

- **Term:** "AI prepaid key card" = one AI key, its project, its budgets (cap and/or alert), its cap
  state and this month's spend. Defined in the private AI-keys infra doc and the ai-keys skill; the
  board uses the term; cp docs do not define it.
- **Data:** step 9d also records every row of `gcloud billing budgets list` (display name, amount,
  scope, threshold count, `spendCap.outputState` when present), mapped to keys through the ai-keys
  registry, so the board receives: account budgets, alarms, and one card per registry key.
- **Board:** Monitor tab sections: account budget · alarms · AI prepaid key cards · unmatched
  budgets (display name and amount only — no project id, no filter detail). Each card: label,
  spend vs cap, cap state, alert budget present or missing, and exactly one state from this union:
  - **spent** — billing export has rows this month (EUR number);
  - **unused this month** — billing export has no rows AND the request-count oracle returns an
    explicit zero for the month;
  - **no spend recorded** — billing export has no rows, oracle unavailable or not yet trusted;
  - **unmeasurable** — billing export query failed or is stale (reason shown).
- **Cap state** shows Google's `spendCap.outputState` as-is with one line of meaning: `CONFIGURED`
  means a cap is set up, not that it has been proven to stop spend (day.md AI KEYS section). A
  key with no cap budget reads "no cap" in warning colour.
- The existing Raise button stays where it is and behaves as today; this spec only adds to the cards.
- **Unused oracle:** the key's project Gemini API request count from Cloud Monitoring for the month.
  Valid per key only because each key has its own project (day.md ~line 776: "restricted Gemini keys, each in its own
  project with its own monthly budget"); the step asserts that 1:1 mapping from the registry and reports a multi-key project as
  unmeasurable. No time series returned = unmeasurable, not zero. Before trust: the same query on a
  key known to be used and one known to be unused must return different answers (paste both). If
  no oracle passes the control, ship without "unused" and say "no spend recorded" instead.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Budgets API omits cap rows again (seen 2026-09-09) | MITIGATE | Existing `WARN_CAP_LIST_BLIND` path; the board shows it |
| Monitoring metric wrong, returns 0 everywhere | MITIGATE | Known-used / known-unused control before trust |
| Report JSON shape change breaks older reports | MITIGATE | New fields optional; parser test with an old report |

**Non-Goals**
- Do NOT change budgets, caps, keys or alerts.
- Do NOT add a spend data source beyond the billing export and the request-count metric.

## Done-When

- [x] The report's budget rows equal what `gcloud billing budgets list` returned during that pass (same display names, pasted), and the Monitor tab renders every one of them, grouped account / alarms / key cards / unmatched (10 on 2026-10-08)
      Evidence 2026-10-09: the 06:56Z report's 10 budget names are identical to a live `gcloud billing budgets list` (LC_ALL=C diff, mutated-copy control detected); the board's `parseReport` keeps all 10 (account 1, alarm 1, key-cap 5, key-alert 3); grouping rendered by e2e `day-page.spec.ts` (`.d-h3` order assertion).
- [x] Each AI prepaid key card shows spend vs cap, cap state, alert budget present or missing, and exactly one of spent / unused this month / no spend recorded / unmeasurable
- [x] The unused oracle returns different answers for a known-used and a known-unused key (pasted); until it does, no card says "unused this month"
      Evidence 2026-10-09 — oracle control FAILED, pre-registered fallback in force: Cloud Monitoring `api/request_count` (generativelanguage, Oct 1–9) returned 1 series / 226 and 1 series / 4474 for two used key projects, and **no series** (not an explicit zero) for two revoked ones. Absence is "unmeasurable" per the Solution, so the oracle cannot say "unused"; the /day producer emits only spent / no-spend / unmeasurable (`P1442_STATES`), and the board shows "unused" only with same-month request evidence (unit REVIEW 5, ROUND 3 C3).
- [x] An older report without the new fields still renders (test)
- [x] The term is defined in the private AI-keys infra doc and the ai-keys skill
- [x] Checked at 375px, 320px and desktop — e2e asserts no sideways scroll and no element escaping its card at 1280/375/320 (innerWidth polled); independent visual QA pass found one defect (dangling '·' in the key-cards header at 320/375), fixed with a binding test, red→green

## Related

- P1440 (reflection rebuild), P1443 (LinkedIn/VM monitoring removal); pp P45, P58, P75 (AI keys, caps)
