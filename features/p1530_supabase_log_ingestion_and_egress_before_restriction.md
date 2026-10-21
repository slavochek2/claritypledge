---
status: week
type: task
rank: 52
workstream: infrastructure
created_date: '2026-10-21'
tags: [supabase, quota, egress, logs]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1530: Find what fills Supabase log ingestion, and confirm egress is back under the free plan before 11 Nov

## Problem

**Situation:** The organisation that holds both projects (prod and test) finished the 21 Sep to
21 Oct cycle over its free plan on cached egress, egress and log ingestion (figures read from the
dashboard Usage page on 2026-10-21; kept out of this public file, as P1522 did). The dashboard
shows a grace period ending **11 Nov 2026**, triggered by **cached egress**; after it, the Fair
Use Policy applies and restricted requests return HTTP 402. Log ingestion is marked "upcoming":
its billing and enforcement start in early 2027.
**Complication:** P1522 cut the measured egress causes (the offline pack under automation and in
hidden tabs, e2e user minting) but could not read logs (dead management token). Nobody knows what
produces the log volume, which is the largest overrun by ratio. Whether P1522's cut is enough is
unknown until the new cycle shows data.
**Question:** (1) Is egress on track to stay under the free plan this cycle, before 11 Nov?
(2) What fills log ingestion, and what is the smallest change that brings it under 1 GB a month
before enforcement starts?

> Founder framing, verbatim: "check the no neighboring session is working on that and that it
> was not filed the long run overrun log overrun if not then yes file it"

## Appetite

Blast radius: whichever source is found (likely logging config or a chatty client path), plus the
test project. Reversibility: config or code, git revert. Decision density: likely one founder call
(see Decision Criteria) if the fix is "upgrade the plan" or "move the test project".

## Approach

1. **Egress trend first (the 11 Nov risk).** Read the Usage page daily-egress charts for the new
   cycle through Claude in Chrome (P1525's path; no API exposes usage). Project the cycle total
   from the first days. If it projects over the free plan, return to the P1522 levers.
2. **Log sources.** In the dashboard Logs Explorer (Chrome, signed in; the Management API token
   is dead, P1148), break log volume down by source (API gateway or edge, Postgres, Auth,
   Realtime, Storage, Edge Functions) and by project, prod vs test. Read, never re-run a
   suspected cause to "see what happens" (epistemic.md gate 2b).
3. **Attribute.** Tie the top source to a mechanism: request volume (each API request is a
   gateway log line, so e2e runs on the test project count), Postgres statement logging,
   Realtime chatter, or a verbose Edge Function.
4. **Fix the top mechanism**, with a volume assertion where code changes (decisions.md
   2026-09-30, request-volume assertions).

## Decision Criteria

1. **Egress:** on track if the cycle-to-date daily average × cycle length stays under 70% of the
   limit for both egress and cached egress. Over that → it becomes the first fix, ahead of logs.
2. **Logs:** a source is "the cause" if it accounts for over 50% of ingestion. If the test project
   produces over half, moving it to the existing empty second organisation is a founder decision
   (it gives the test project its own free-plan quota).
3. **Upgrading the plan** is a founder call, never taken here (P1522 Alternatives).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Usage charts lag up to 24h | ACCEPT | Read daily; project from several days, not one |
| Turning logging down hides the next incident | MITIGATE | Reduce volume at the source; keep error-level logs |
| Reading Logs Explorer costs log-query allowance | ACCEPT | 100 GB allowance, queries are small |

**Non-Goals**
- Do NOT upgrade the plan or move a project between organisations without the founder.
- Do NOT write to prod data or change RLS.
- Do NOT add a usage check to /day: P1525 already reads usage daily.

## Done-When

- [ ] Egress projection for the 21 Oct cycle recorded, with the verdict from Decision Criteria 1.
- [ ] Log ingestion broken down by source and project, the top mechanism named with evidence.
- [ ] The top mechanism is fixed, or handed to the founder as a decision with the numbers.
- [ ] /day's `cp.quota` (P1525) shows the trend after the fix, recorded here with the date.

## Related

- [P1522](done/2026-06-10/p1522_supabase_egress_polling_and_e2e_users.md): the egress cut; RQ3 logs not readable.
- [P1525](done/2026-06-10/p1525_day_supabase_free_plan_usage_reader.md): usage readable only via the dashboard.
- [P1148](p1148_credential_rotation_system.md): the dead management token.
