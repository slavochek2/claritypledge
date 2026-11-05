---
status: in-progress
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
---

# P1628: Tag automation traffic in Mixpanel without blinding the smokes

## Problem

**Situation:** Mixpanel records page views, sessions, clicks and replays on prod. `/day` only uses it to look up a few named users (Wave 2b). The three Mixpanel boards date from February, and the Retention board reports no layout and no views.

**Complication:** The headline numbers are also misleading. Of 2,837 "visitors" in the last 30 days, about 69% come from data-centre cities. The eight pages our health smoke visits (`PROD_HEALTH_ROUTES`) each show about 240 visitors, which matches two 6-hourly workflows over 30 days, each run with a fresh anonymous id. That match is arithmetic plus one city breakdown, and no event property proves it yet.

**Question:** What should the founder see each week to learn how real people behave, without the page inventing patterns from small numbers?

> Founder, verbatim: "make sure that when I run slash date, it's always daily updated and I get my insights delivered so I can see patterns and I can learn from them." "who spends how much time? who is returning, who is not returning, what they do, do they explore things, do they get stuck, are there problems"

## Invariants

- The health and CSP smokes must keep loading the Mixpanel SDK on prod. They exist to catch SDK and CSP breakage (`e2e/helpers/prod-health.ts`, `e2e/csp-smoke.spec.ts`). Never stop initialising it under automation.
- Existing URL redaction and recording limits stay in force (P1304, P1325, P1233).
- A failed read shows "not collected". It never shows blank, zero or "no change".
- An insight is a hypothesis with its numbers and base. Nothing in this pipeline updates a strategy doc.
- Private individuals are never named in any public file. Named people appear only on the local Day page.

## Solution

Split on 2026-11-05: this spec is Phase 0 step 1. Everything else moved word for word to P1640, because a multi-phase spec cannot ship one phase (decisions.md 2026-09-08).

1. Under `navigator.webdriver`, keep initialising Mixpanel, stamp every event `is_automation=true` in the existing `before_send_events` hook, and set `record_sessions_percent` to 0. The repo already trusts this signal for our own automation (`src/lib/offline-pack.ts`). **The two smokes and the P881 recording guard opt back in** (`window.__p1628KeepRecorderForSmoke`), and the smokes answer `/record` locally so no replay is stored. Measured 2026-11-05 on the prod page: with recording simply off, a CSP that blocks only the recorder bundle or only `/record` passes both smokes, and the same breaks fail both today, because the recorder never loads. Route carve-outs still win over the opt-in. The smokes also wait for the recorder's first upload (about 10.5s) and fail if it never comes: before that wait, a `/record`-only break was caught on 1 of 8 routes, and on 8 of 8 with it. Known limits: the tag is on events and not profile updates, a few automation events can arrive untagged, and answering `/record` locally means a real server failure on that request is not seen (the HTTP check already allowlisted that host).

## Cost Budget

Verdict: the 30-day event count read on 2026-11-05 fits the 1M Free limit in the registry, today and at 10x. The reading is in `.private/docs/usage/`. This change adds no event and no query.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | 0 added | `2 workflows x 8 routes / 6 h = 2.67 visits/h`, same as before | `8 routes x 1 visit = 8 visits`, same as before |
| Egress (bytes) | 0 added | 0 added | 0 added |
| Replays stored | 0 added | `2.67/h before, 0/h after` | `8 before, 0 after` |

Replays per month saved: `2 x 8 x 4 runs/day x 30 days = 1,920`, against the 10K Free limit. Rule 6, tests as traffic: scheduled runs stay at `2 x 8 x 4 = 64 visits/day`, and each smoke test waits about 10s longer, which spends no quota. The plan this project is on has not been checked; these figures fit Free, the lowest.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A few automation events arrive untagged | ACCEPT | Tag is a strong filter, documented in `docs/technical/analytics.md` |
| Other prod automation runs without the recorder | ACCEPT | Recorder-only bugs reproduce in a real browser or with the flag; documented |

Non-Goals: everything in P1640.

## Done-When

- [x] Events under `navigator.webdriver` carry `is_automation=true` on the wire through the real SDK (`e2e/p1628-automation-tag.spec.ts`)
- [x] Automation records nothing by default, and route carve-outs win over the opt-in (`src/tests/p1628-automation-tag.test.ts`)
- [x] The SDK stays loaded, and a CSP block of the SDK, the recorder bundle or `/record` fails the smokes; measured on the prod page with the new init, `/record` caught on 8 of 8 routes, healthy clean on 8 of 8
- [x] The smokes fail if the recorder never reaches `/record` (`e2e/p1628-automation-tag.spec.ts`, `src/tests/p1628-recorder-watch.test.ts`)
- [x] `docs/technical/analytics.md` and the metered-services registry match what ships

## Next Steps

After deploy: prove the tag on both smoke workflows in Mixpanel. That is P1640 step 2.
