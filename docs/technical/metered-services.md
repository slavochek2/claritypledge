# Metered services — the cost budget every design states

**Spec:** [P1531](../../features/p1531_metered_service_cost_gate.md)

We pay, or will pay, per request, byte, log line, instance-second or token. The same mistake
(a design that creates traffic nobody counted) has been found five times, each time on a bill or a
quota page. This doc is the **one owner** of the rules that stop it. Every firing point links here and
never restates the rules ([Reference Over Duplication](../../CLAUDE.md)).

**Usage, spend and quota figures for our own accounts are never written here** (public file). They
live in `.private/docs/usage/`. The limits and list prices below are the vendors' public plan terms.

## When this applies

A design touches a metered service when it does any of these:

- calls Supabase (REST, auth admin, storage, realtime, edge functions) from a timer, a loop, a retry or
  reconnect path, a script, a test helper, or per user or per row;
- adds or changes a Cloud Scheduler job, a Cloud Run service, or a ping against one;
- calls Gemini or transcription, or issues a key for either;
- creates, deletes or lists test users, or otherwise changes what an e2e run does to the shared
  Supabase organisation.

A copy change, a CSS change or a pure-local refactor does not. When none of the four applies the
Cost Budget section is absent, and its absence is not a finding.

## Registry

Limits are copied from the vendor page on the date shown, never from memory. Re-read the page before
relying on a row for a decision, and whenever a row is older than six months.

| Service | Billing unit and limit | Read on | Source | Where usage is read | Guard |
|---|---|---|---|---|---|
| Supabase, Free plan (per organisation: prod and test share it) | Egress 5 GB; cached egress 5 GB; database 500 MB per project; 50,000 MAU; storage 1 GB; 500,000 edge function invocations; 2 million realtime messages; 200 peak realtime connections; API and database logs kept 1 day | 2026-10-21 | [supabase.com/pricing](https://supabase.com/pricing) | Dashboard usage page; the /day free-plan reader (P1525); private readings in `.private/docs/usage/` | `e2e/p1522-idle-request-budget.spec.ts`; `scripts/measure-idle-requests.mjs` |
| Supabase, Pro plan (the upgrade) | From $25/month; 250 GB egress then $0.09 per GB; 250 GB cached egress then $0.03 per GB | 2026-10-21 | [supabase.com/pricing](https://supabase.com/pricing) | same | same |
| Supabase log ingestion | The pricing page as fetched states no ingestion figure, only the 1-day retention. Take the number from the dashboard usage page, not from memory | 2026-10-21 | n/a | Dashboard usage page; `.private/docs/usage/` | none yet (P1530) |
| Cloud Run | Request-based billing: "Cloud Run instances are only charged when they process requests, when they start, and when they shut down." Instance-based billing: charged "for the entire lifecycle of instances, even when there are no incoming requests." Idle window: "An instance will never stay idle for more than 15 minutes after processing a request" unless minimum instances keep it active | 2026-10-21 | [billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings) | GCP billing report; `/slava:maintain:gcp-spend` | `scripts/scheduler-warm-check.py` (daily; flags a scheduled target pinged inside the idle window) |
| Cloud Run unit prices | Tier 1: $0.000024 per vCPU-second and $0.0000025 per GiB-second (CPU only during requests); free tier 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests per month; $0.40 per million requests beyond. **Provenance: a search summary of the official page; the page itself came back truncated to the fetcher. Verify on the page before using these in a budget** | 2026-10-21 | [cloud.google.com/run/pricing](https://cloud.google.com/run/pricing) | GCP billing report | as above |
| Cloud Scheduler | $0.10 per job per 31 days, prorated daily; 3 free jobs per billing account (not per project); executions are not billed. **Same provenance caveat as the Cloud Run unit prices** | 2026-10-21 | [cloud.google.com/scheduler/pricing](https://cloud.google.com/scheduler/pricing) | GCP billing report | `scripts/scheduler-warm-check.py` |
| Gemini API | Per 1M tokens, paid tier. `gemini-3.8-flash` and `gemini-3.6-flash`: $0.75 input and $3.75 output through 2026-12-31, then $1.50 and $7.50. `gemini-3.5-flash-lite`: $0.30 input (audio $0.30) and $2.50 output. `gemini-3.1-flash-lite`: $0.25 input (audio $0.50) and $1.50 output. `gemini-3.1-pro-preview`: $2.00 and $12.00 up to 200k-token prompts. Free tier is listed for the flash and flash-lite models, not for the pro preview | 2026-10-21 | [ai.google.dev pricing](https://ai.google.dev/gemini-api/docs/pricing) | Per-key spend via `/slava:util:ai-keys` | Budget-capped keys (`/slava:util:ai-keys`) |

A service not in this table that a design wants to use gets a registry row in the same change, sourced
from its pricing page and dated, before the design ships.

## The cost budget

A design that matches [When this applies](#when-this-applies) carries a `## Cost Budget` section with
this table. Every number shows its arithmetic. A number without arithmetic counts as missing.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | `N calls x M per call = ...` | | |
| Egress (bytes) | | | |
| Log lines | | | |

"Per test run" means one full e2e run or one script run, including users created and deleted.
Log lines count the failures a design provokes (rule 5), not only the successes.

Then three lines:

1. **Fits the plan limit today?** Quote the registry row and the arithmetic against it.
2. **Fits at 10x?**
3. **If either answer is no:** name the upgrade and its list price from the registry.

## The six rules

1. **Bulk operations run on the server as one batch:** a SQL function, one statement, or one RPC per
   batch. Never one or more API calls per row or per user. (Extends
   [db-access.md](../../.claude/rules/db-access.md) "Bulk Mutations Use SQL, Not Per-Row PATCH" from an
   agent's ad-hoc changes to code and scripts.)
2. **Polling, timers and schedulers need a written reason** naming why push, realtime or on-demand
   will not do. A scheduled ping states its interval against the target's idle or scale-to-zero window.
3. **A hidden tab makes no requests** (`document.visibilityState === 'hidden'`). Visibility checks are
   local only.
4. **Retries are bounded, with backoff and jitter.** Retry and reconnect code carries a request-volume
   assertion (decisions.md 2026-10-01 [process]).
5. **Error-driven control flow is counted:** a design that learns by provoking failures pays a log line,
   usually several, per failure. Count them in the budget.
6. **Tests count as traffic.** The test project shares the organisation's quota, so an e2e design states
   its per-run cost, including users created and deleted.

## Severity (founder decision, 2026-10-21: blocking)

Reviewers apply these. A HIGH finding stops the ship.

| Finding | Severity |
|---|---|
| A design matching [When this applies](#when-this-applies) has no Cost Budget | HIGH |
| A budget number has no arithmetic | HIGH |
| The budget exceeds a registry limit at today's scale, and no upgrade is named and accepted by the founder | HIGH |
| The code or script breaks one of the six rules and the budget does not account for it | HIGH |
| Fits today, does not fit at 10x, and no upgrade is named | MEDIUM |
| A rule 2 or rule 6 reason is present but thin | MEDIUM |

## Incidents the rules come from

1. 2026-05-31: a 5-minute scheduler poll kept the GPU transcription service from scaling to zero
   (decisions.md 2026-05-31 "GPU idle-cost leak"). Rule 2.
2. 2026-10-01: a 10-minute ping inside the idle window billed 24 h a day for two weeks
   (decisions.md 2026-10-01 [technical]). Rule 2.
3. 2026-10-01: a retry fix made about 250 requests per second with every behaviour test green
   (decisions.md 2026-10-01 [process]). Rule 4.
4. 2026-10: the Supabase organisation went over its free plan on egress, cached egress and log
   ingestion. Rules 3 and 6.
5. 2026-10-21: a cleanup script deleted users one at a time and learned about blockers from errors, so
   each deletion also wrote error logs. Rules 1, 5 and 6.
