---
status: week
type: story
rank: 99.0
workstream: infrastructure
created_date: '2026-11-05'
tags: [analytics, mixpanel, day, insights]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1640: Weekly product insights from Mixpanel, delivered through /day

## Problem

**Situation:** Mixpanel records page views, sessions, clicks and replays on prod. `/day` only uses it to look up a few named users (Wave 2b). The three Mixpanel boards date from February, and the Retention board reports no layout and no views.

**Complication:** The headline numbers are also misleading. Of 2,837 "visitors" in the last 30 days, about 69% come from data-centre cities. The eight pages our health smoke visits (`PROD_HEALTH_ROUTES`) each show about 240 visitors, which matches two 6-hourly workflows over 30 days, each run with a fresh anonymous id. That match is arithmetic plus one city breakdown, and no event property proves it yet.

**Question:** What should the founder see each week to learn how real people behave, without the page inventing patterns from small numbers?

> Founder, verbatim: "make sure that when I run slash date, it's always daily updated and I get my insights delivered so I can see patterns and I can learn from them." "who spends how much time? who is returning, who is not returning, what they do, do they explore things, do they get stuck, are there problems"

## Appetite

Blast radius: medium. Phase 0 changes the Mixpanel setup on every prod page, and the rest touches `/day` and the Day page. Reversibility: git revert, but events sent while a tag is wrong stay wrong. Decision density: low, one founder decision below.

## Invariants

- The health and CSP smokes must keep loading the Mixpanel SDK on prod. They exist to catch SDK and CSP breakage (`e2e/helpers/prod-health.ts`, `e2e/csp-smoke.spec.ts`). Never stop initialising it under automation.
- Existing URL redaction and recording limits stay in force (P1304, P1325, P1233).
- A failed read shows "not collected". It never shows blank, zero or "no change".
- An insight is a hypothesis with its numbers and base. Nothing in this pipeline updates a strategy doc.
- Private individuals are never named in any public file. Named people appear only on the local Day page.

## Solution

Split from P1628 on 2026-11-05 (a multi-phase spec cannot ship one phase, decisions.md 2026-09-08). Each phase ships only after the one before it is verified.

### Phase 0: know who is real

1. Built and shipped in P1628: read it first. `is_automation` is tagged on events, the smokes keep the recorder.
2. Prove the tag on both smoke workflows, then measure what is left.
3. Define "real visitor" as a tested filter: not automation, not internal, and outside the crawler pattern found in step 2. It must pass a known-bad control (Des Moines traffic) and a known-good control (a tagged link the founder opens).
4. Founder and agent Chrome sessions may not set webdriver, and anonymous events carry no `is_internal` (`docs/technical/analytics.md`). Handle both in the filter or state them as a known limit.
5. Treat data before the tag as contaminated. Do not rebuild it with a city filter, because that can remove real people. Every view states the date clean data starts.

### Phase 1: make the funnels true

6. Add `event_rsvp_completed` covering every path, and add event type to the RSVP events. Today `event_rsvp_initiated` fires before the auth branch (`EventDetail.tsx:482`), `event_rsvp_auto` covers only post-signup (`AuthCallbackPage.tsx:566`), and a grep finds no event for the signed-in path.
7. Reconcile against Supabase: RSVP rows for at least three recent events, and several known practice journeys. A funnel is not published until it matches or the gap is explained.
8. Keep two separate outcomes with their own denominators: completed event registration, and completed paired practice. Do not call an event visitor who RSVPs and leaves a failure of retention.

### Phase 2: the weekly delivery

9. Add a fixed list of aggregate queries to the weekly run that `/day` already triggers when it is overdue (`/weekly`), so a week with few users still gets a read. Give it its own required check, because Mixpanel calls have been dropped from some passes. `/day` shows the latest read and its date. Wave 2b's per-user drills stay as they are.
10. Write the result to the report, and show it in an Analytics tab on the Day page, answering:

| Founder's question | Measure |
|---|---|
| Who is here | Real visitors, new vs returning, landing pages, referrers |
| What they do | Event page to RSVP started to completed; next step after an event page |
| How much time | Session length, median and p75, by landing type, labelled "open time, not attention" |
| Who returns | Return within 7 days for people with a mature cohort. Signed-in people named from Supabase |
| Do they explore | Pages per session, share of one-page sessions |
| Do they get stuck | Dead and rage clicks by page, not-found views, auth and magic-link failures, each with a replay link |
| Is the practice working | Live page to session created to partner joined to explain-back done to rating |

11. Compare the last 7 days with the previous 7, in the context of the last four weeks. Never compare single days. Show counts, and no percentage on a base under 30.

### Phase 3: insights with a noise gate

12. The default line is "No change worth your attention." An insight appears only for: a new class of failure; a named real-user first (first signup, first partner join) or a stuck session; or a 7-day shift outside the Poisson range on a base of at least 30.
13. Each insight carries the observation, numbers and base, comparison, a replay or report link, a confidence label and one suggested next step. At most 3 a week.
14. Keep a small ledger so a repeat becomes a pattern. The founder can confirm or dismiss, and a dismissal suppresses repeats.
15. Include the event-sequence summary of stuck sessions, with links for the founder to watch.
16. Update the strategy section of `docs/technical/analytics.md`, which still says "weekly questions".

**Founder decision, 2026-11-05: weekly.** The founder first asked for daily, then chose weekly ("weeekly is fine") after Gemini and Codex warned that daily comparison at this volume invites false patterns. Production errors stay on the existing daily checks.

## Open before building

- **Query access is unverified.** Mixpanel's pricing page (read 2026-11-05) lists "Query API access" as not available on Free, and the plan this project is on has not been checked. Phase 2 depends on it. The MCP did answer a query on 2026-11-05.
- **This spec needs a `## Cost Budget`** before Phase 2 (`docs/technical/metered-services.md`), because the weekly run adds queries.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Weekly view still manufactures patterns at low volume | MITIGATE | Gate, rolling windows, base-size rule, default "no change". Review after 30 days using the decision criteria below |
| The clean series is still mostly third-party bots | MITIGATE | Step 3 controls run before any chart is trusted |
| Session duration read as attention | MITIGATE | Label it; no rankings by duration |
| Mixpanel MCP unavailable during `/day` | MITIGATE | Required check reports not collected, and the run continues |
| Replay contents and agents | DEFER | Agents get event sequences and links only. Reviewing replay content by agent needs a masking, consent and data-handling check first |
| Returning visitors split across devices | ACCEPT | Anonymous return is a floor. Signed-in return comes from Supabase |

**Non-Goals**
- Do NOT add an analytics vendor, warehouse, A/B testing or a chart builder.
- Do NOT rebuild old data with geographic filters.
- Do NOT let an agent watch or describe replay contents.
- Do NOT add tracking events beyond those named here unless a reconciliation step fails.
- Do NOT rebuild a parallel board set. A Mixpanel board is optional drill-down only.

## Decision Criteria

Reviewed after four weekly reads:
1. **Keep the insights?** Keep if at least half of raised insights were confirmed or led to an action. Otherwise keep the numbers and drop the insight step.
2. **Keep the tab?** Keep if the founder opened it for most weekly reads. Otherwise reduce it to a single line and a link.

## Done-When

- [ ] Both smoke workflows' events carry `is_automation=true` in Mixpanel, and their SDK and CSP checks still fail when Mixpanel is deliberately blocked
- [ ] The real-visitor filter separates the known-bad and known-good controls, with the query output pasted
- [ ] RSVP counts reconcile with Supabase for at least three events, with any gap explained
- [ ] A signed-in RSVP produces `event_rsvp_completed` with event type, verified on prod data `[post-deploy]` after the first real RSVP
- [ ] A weekly run in a week with few users still fills the Analytics tab, and a simulated Mixpanel failure shows "not collected" and fails its check
- [ ] The tab answers all seven questions at 375px, 320px and desktop
- [ ] A fixture with an in-range change shows "No change worth your attention", and a fixture with a new failure class raises one insight with all required fields
- [ ] A dismissed insight does not reappear on the next weekly read
- [ ] `docs/technical/analytics.md` matches what ships

## Related

P1233, P1304, P1325 (Mixpanel privacy limits), P1522 (`navigator.webdriver` precedent), P1578 (Day monitoring), P1629 (Day page quota and Supabase card bugs).

Plan reviewed 2026-11-05: Gemini Argon, Codex and Opus, 3 of 3 reports received. Codex's report was flagged by its wrapper as having no test evidence, so it counts as opinion. Claims adopted here were checked by grep. Gemini's claim that the practice funnel lacks events was false (the events exist), and its objection to `navigator.webdriver` applies only to third-party bots. External sources: Mixpanel docs on [sessions](https://docs.mixpanel.com/docs/features/sessions), [autocapture](https://docs.mixpanel.com/docs/tracking-methods/autocapture.md), [MCP](https://docs.mixpanel.com/docs/mcp) and the [product metrics guide](https://mixpanel.com/wp-content/uploads/2023/11/eBook_Guide-to-Product-Metrics.pdf) (search summary only; the PDF was too large to fetch).
