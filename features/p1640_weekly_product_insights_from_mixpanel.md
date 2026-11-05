---
status: qa
type: story
rank: 99.0
workstream: infrastructure
created_date: '2026-11-05'
tags: [analytics, mixpanel, day, insights]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 65b42172f777e0b1e1642bbc6a764dc08ef078b45677552a5220992a893101f4
spec_review_vendors: [gemini, openrouter]
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

## Build Notes (spec review, 2026-11-06)

- **Scope split (decisions.md 2026-09-08).** Gate 2.5 counts every Done-When box, and code cannot produce prod data before it ships. Checks that need post-deploy data or a founder click (filter controls on a clean window, smoke-tag proof by workflow, RSVP reconciliation, first real RSVP) move to a follow-up spec. All four phases are built here. Until the follow-up passes, the tab labels the real-visitor filter and both funnels "not yet reconciled".
- **Query access.** All reads go through the Mixpanel MCP, which answered on 2026-11-05 and 2026-11-06. If it stops, the read records "not collected". The plan in use is still unchecked; the follow-up records it.
- **RSVP paths.** Three callers exist: `EventDetail.tsx` (signed-in), `AuthCallbackPage.tsx` (post-signup), `EventClosePage.tsx` (next event from the close page). Each success fires `event_rsvp_completed` with `event_id`, `event_type` and `path`. `event_type` is `series_slug`, or `standalone` when there is none.
- **Weekly read vs daily check.** The read runs inside `/weekly`. `cp.analytics` runs on every `/day`: `ok` if the latest read is under 8 days old and collected, `problem` otherwise. A problem fails the check and the pass continues.
- **Storage.** Reads and the insight ledger live in `~/.claude-analytics/`, outside the repo, because they may name people. Dismiss and confirm go through a local kanban route.
- **Replay links.** Links are opaque to agents: never opened, never described.
- **Poisson range.** A shift counts when the previous 7-day base is at least 30 and `|current - previous| > 1.96 * sqrt(current + previous)`.
- **Tab opens** are not instrumented. Decision criterion 2 is answered by the founder at the four-read review.

## Cost Budget

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | 0, no per-user calls | 0, runs weekly only | `about 12 Mixpanel queries + 2 Supabase reads = about 14 per weekly read`; `14 x 52 = 728 per year`. Tests use fixtures: 0 |
| Egress (bytes) | 0 | 0 | Aggregate JSON, `14 x under 50 KB = under 700 KB per read`. Fixtures: 0 |
| Log lines | 0 | 0 | 0 new server lines on success; `1 per failed read` |
| Service unit x registry price | New events: `1 event_rsvp_completed per RSVP`, against the 1M events per month in the registry row, at $0 on Free | 0 | $0: queries are not billed per call in the registry row, and no Query API billing unit is stated. At 10x users, still 14 queries a week |

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

- [x] Each of the three RSVP paths fires `event_rsvp_completed` with `event_type` and `path` on success and not on failure, proven by unit tests
- [x] A weekly run in a week with few users still fills the Analytics tab, and a simulated Mixpanel failure shows "not collected" and makes `cp.analytics` report `problem`
- [x] Each of the seven questions renders its fixture numbers at 375px, 320px and desktop, and a real-visitor or funnel number shows "not yet reconciled"
- [x] The follow-up spec holding the post-deploy checks is filed
- [x] A fixture with an in-range change shows "No change worth your attention", and a fixture with a new failure class raises one insight with all required fields
- [x] A dismissed insight does not reappear on the next weekly read
- [x] `docs/technical/analytics.md` matches what ships

## Related

P1233, P1304, P1325 (Mixpanel privacy limits), P1522 (`navigator.webdriver` precedent), P1578 (Day monitoring), P1629 (Day page quota and Supabase card bugs).

Plan reviewed 2026-11-05: Gemini Argon, Codex and Opus, 3 of 3 reports received. Codex's report was flagged by its wrapper as having no test evidence, so it counts as opinion. Claims adopted here were checked by grep. Gemini's claim that the practice funnel lacks events was false (the events exist), and its objection to `navigator.webdriver` applies only to third-party bots. External sources: Mixpanel docs on [sessions](https://docs.mixpanel.com/docs/features/sessions), [autocapture](https://docs.mixpanel.com/docs/tracking-methods/autocapture.md), [MCP](https://docs.mixpanel.com/docs/mcp) and the [product metrics guide](https://mixpanel.com/wp-content/uploads/2023/11/eBook_Guide-to-Product-Metrics.pdf) (search summary only; the PDF was too large to fetch).
