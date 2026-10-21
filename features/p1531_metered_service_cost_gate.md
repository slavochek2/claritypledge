---
status: in-progress
type: task
rank: 53
workstream: infrastructure
created_date: '2026-10-21'
tags: [cost, supabase, polling, process]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1531: Metered-service cost gate: every design states its request, egress and log budget

## Problem

**Situation:** We pay for metered external services: Supabase (free plan, prod and test in one
organisation, so test traffic spends production's quota), Google Cloud Run and Scheduler, Gemini and
transcription. Nothing in the pipeline asks how many requests, bytes or log lines a design creates
before it ships.

**Complication:** The same mistake has now happened five times. Each was found only after the bill or
the quota page showed it:

1. **2026-05-31:** a Cloud Scheduler poll every 5 min kept the GPU transcription service from scaling to
   zero, so it billed around the clock at zero jobs (decisions.md 2026-05-31 "GPU idle-cost leak").
2. **2026-10-01:** `transcribe-room-sweep` pinged every 10 min, inside Cloud Run's idle window. The
   service billed 24 h/day for two weeks for 8 jobs (decisions.md 2026-10-01 [technical]).
3. **2026-10-01:** a P1369 retry fix produced about 250 Supabase requests/s. All 23 behaviour tests
   stayed green (decisions.md 2026-10-01 [process]).
4. **2026-10:** the Supabase organisation went over its free plan on egress, cached egress and log
   ingestion, and production is restricted from **11 Nov 2026**. Figures are kept private
   (`.private/docs/usage/`). Causes so far: the offline pack pre-loaded for every fresh browser and
   test robot (P1522); test runs left about 17,500 junk users behind (P1523).
5. **2026-10-21:** the cleanup script deleted those users one at a time, with several requests per user.
   By design it learns about blockers from foreign-key errors, so each deletion also writes error log
   lines. It took the test project down.

> Founder framing, verbatim: "it's not only about Superbase, but also general polling of some kind of
> external things we could pay for. [...] the polling thing has to be, it seems to be a common mistake
> because we did it three times. One time was transcription. It cost us a lot of money. [...] when it
> started to delete users it started to create many logs for each deletion which is weird you know."

**Question:** Where does a cost budget get stated and checked, so it fires on every design that touches
a metered service without anyone remembering to ask?

## Appetite

Blast radius: all future work that touches a metered service, plus four skill and criteria files.
Reversibility: git revert (text-only changes to skills and docs). Decision density: one founder call
(blocking vs advisory, below).

## Invariants

- **The rules live in one owner doc. Every firing point links to it and never restates the rules.**
  Copies drift (CLAUDE.md "Reference Over Duplication").
- Existing guards stay in place and are cited, not replaced: `scripts/scheduler-warm-check.py` (the
  daily Cloud Run idle-window tripwire), the request-volume assertion rule (decisions.md 2026-10-01
  [process]), `e2e/p1522-idle-request-budget.spec.ts`, and the /day free-plan usage reader (P1525).
- `.claude/rules/db-access.md` already has "Bulk Mutations Use SQL, Not Per-Row PATCH", but only for
  an agent's ad-hoc data changes. Rule 1 below extends it to code and scripts, and the owner doc links
  to it instead of restating it. The sweeper and e2e helpers grew up outside its reach.
- Usage, spend and quota figures for our accounts stay in `.private/` (P1526). The public plan limits
  and list prices of a vendor are not account figures and may be quoted.

## Solution

### 1. Owner doc: `docs/technical/metered-services.md`

- **Registry:** each metered service we use, its billing unit and free or paid limit, where usage is read,
  and the guard that watches it. Supabase (egress, cached egress, logs, MAU, functions, realtime);
  Cloud Run with Scheduler (billed instance time, idle window); Gemini and transcription (tokens or
  audio minutes). Fill limits from the vendor's pricing page at write time and date each one. Never
  fill a limit from memory.
- **The cost budget** a design must state, as a table: requests, egress and log lines **per user, per
  hour, and per test run** (one full e2e run, one script run). Each number shows its arithmetic. Then
  one line on whether it fits the plan's limit at today's scale and at 10x. If it does not fit, name the
  upgrade and its list price.
- **The rules:**
  1. **Bulk operations run on the server as one batch:** a SQL function, one statement, or one RPC per
     batch. Never one or more API calls per row or per user.
  2. **Polling, timers and schedulers need a written reason** naming why push, realtime or on-demand
     will not do. A scheduled ping must state its interval against the target's idle or scale-to-zero
     window (incidents 1 and 2).
  3. **A hidden tab makes no requests** (`document.visibilityState === 'hidden'`). Visibility checks
     are local only.
  4. **Retries are bounded, with backoff and jitter.** Retry and reconnect code carries a
     request-volume assertion (existing rule, cited).
  5. **Error-driven control flow is counted:** a design that learns by provoking failures pays a log
     line, usually several, per failure. Count them in the budget (incident 5).
  6. **Tests count as traffic.** The test project shares the organisation quota, so an e2e design states
     its per-run cost, including users created and deleted.

### 2. Firing points: link to the owner doc, never copy it

| Where | Change | Fires when |
|---|---|---|
| `/create-spec` | New expansion module `## Cost Budget`, required when the Solution touches a metered service. Add a row to the work-type detection table and a line to the quality gates. | Every spec filing |
| Spec review | A `## Cost budget` section in `finish/criteria/specs.md`. The multi-model spec review inlines the same criteria file. | Spec review, and `/finish` on spec changes |
| `/finish` | One "Metered cost" bullet each in `criteria/code.md`, `criteria/migrations.md` and `criteria/skills.md`. Check that the `/finish` classifier covers `scripts/*.mjs`, `*.py` and `*.sh`; it lists only `scripts/*.ts` today (`finish/SKILL.md:57`). | Every build review |
| `docs/decisions.md` | One `[process]` entry recording the gate, the five incidents and the firing points. | Once |

**Decision (founder, 2026-10-21): BLOCKING.** A missing or over-limit Cost Budget on a design that
touches a metered service is a HIGH `/finish` finding, and a HIGH finding stops the ship. Reason:
every incident above was a design that never showed its numbers, and an advisory finding is the
"flagged, nobody acted" failure mode of incident 2. The owner doc defines what counts as missing and
over-limit.

### 3. First application: P1522 and P1523 reviewed through this lens

Results are in `## Review findings` below. Confirmed findings are filed where the work belongs.

## Alternatives Considered

- **A lint for `setInterval` without a visibility guard, and for per-row admin calls in loops.**
  Deferred. It catches two shapes out of six. Revisit after the gate has run on 10 specs.
- **A new always-loaded `.claude/rules/` file.** Rejected for now. It would load into every session
  for work that is mostly not metered, and editing rules requires the CLAUDE.md gate. The owner doc
  plus four firing points reach the same moments.
- **Supabase only.** Rejected by the founder: Google services failed the same way first.
- **Upgrading the Supabase plan.** Not taken here. It removes the deadline, not the waste. Remains a
  founder call, tracked in P1530.

## Rollback Strategy

Text-only edits to one doc, four criteria or skill files and one decisions entry: `git revert`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Budgets become boilerplate ("negligible") | MITIGATE | The table needs arithmetic. Reviewers treat a number without arithmetic as a finding. |
| Estimates are wrong by orders of magnitude | ACCEPT | An estimate with its arithmetic can be checked. The existing request-volume tests are the measurement. |
| Specs with no metered surface get the module anyway | MITIGATE | The module fires only on the detection signal; otherwise it is absent. |

**Non-Goals**
- Do NOT fix the code findings inside this spec. They are filed separately.
- Do NOT add a new always-loaded rules file or edit CLAUDE.md.
- Do NOT write account usage figures into any public file.

## Done-When

- [x] `docs/technical/metered-services.md` exists, with the registry (each limit dated, with its source
      URL), the budget table template and the six rules.
- [x] `/create-spec` files a spec with `## Cost Budget` for a Supabase-polling description, and files
      one without it for a copy change. Both runs are shown.
- [x] Gate fires (7c both halves): the `/finish` code criteria applied to a diff that adds an unguarded
      `setInterval` against Supabase returns a cost finding, and applied to a CSS-only diff returns
      none. Both outputs are pasted.
- [x] `criteria/specs.md`, `code.md`, `migrations.md` and `skills.md` each link to the owner doc, and
      none restates its rules (checked by grep for the rule text).
- [x] The `/finish` classifier covers non-`.ts` scripts, or the reason it does not is recorded.
- [x] decisions.md `[process]` entry written.
- [x] Founder decision on blocking vs advisory recorded here (blocking, 2026-10-21; see Solution section 2).
- [x] Each confirmed review finding below is filed (spec, inbox note or evidence on P1530), with its
      destination named. All 11 go to P1532; the user-minting evidence was also added to P1530.

## Build evidence (2026-10-21)

Built on `main` (skill files). One fresh dry-run agent, 1 of 1 reported; it wrote no files.

- **create-spec, both runs:** "unread badge, poll Supabase every 10 s" headings: Problem, Appetite,
  Solution, Risks / Non-Goals, Done-When, UX Notes, Acceptance Criteria, UI Contract, **Cost Budget**.
  "Footer copy change": agent judged it too small for a spec; if filed, headings are the five skeleton
  ones, no Cost Budget.
- **Gate fires / stays quiet (7c):** `code.md` applied to an unguarded 2 s `setInterval` against Supabase
  returned three HIGH cost findings (no budget with arithmetic: 1,800 requests per hour per tab; no
  hidden-tab guard; no bounded retry, error logs uncounted), citing rules 2 to 5. Applied to a CSS-only
  diff it returned no cost finding.
- **No restated rules:** grep for the rule text across `create-spec.md` and the four criteria files finds
  nothing; the owner doc matches (control).
- **Classifier:** `finish/SKILL.md` now routes `scripts/*.{ts,mjs,py,sh}` to the code reviewer. The Stop
  hook (`verify-before-stop.py`) selects by edit, not extension, so nothing else needed changing.
- **Limit of this evidence:** the agent saw uncommitted working-tree files; a reviewer with real stakes
  uses the committed ones, which are identical after the commit below.

**Pasted output of the dry run (agent's own words, trimmed to the rows that matter):**

```
Description 1 (poll Supabase every 10 s) -> Feature + Metered service. Headings in order:
  Problem, Appetite, Solution, Risks / Non-Goals, Done-When, UX Notes, Acceptance Criteria,
  UI Contract, Cost Budget
Description 2 (footer copy change) -> "no row matches ... my call is that it is trivial, so no spec.
  If a spec were forced: Problem, Appetite, Solution, Risks / Non-Goals, Done-When."  (no Cost Budget)

code.md on DIFF 1 (setInterval 2000 ms + supabase count query, no guard):
 1 | Unbudgeted 2s Supabase poll | HIGH | rule 2: no Cost Budget, no written reason. 1 request per 2 s =
     1,800/hour = 43,200/day per open tab.
 2 | No hidden-tab guard        | HIGH | rule 3: no document.visibilityState check.
 3 | Unbounded failing loop, overlapping requests | HIGH | rule 4: no backoff, cap or volume assertion;
     rule 5: every failed poll also writes log lines.
code.md on DIFF 2 (CSS padding and colour only): two LOW design caveats; metered-cost finding: none.
```

Note on the copy-change case: create-spec's "no spec for a trivial change" exception applied before any
module logic, so the "spec without Cost Budget" half was shown as the heading list the skill would
produce, not as a filed file. A filed one would carry the same five headings.

**Review round 1 (2026-10-21):** 3 of 3 reported (Gemini review model, Codex, one Sonnet criteria agent).
Fixed: broken mirror link, signal and severity restated in firing points (now pointers), migrations
signal and a catch-all added to the owner doc, "over-limit" defined, rules 1/3/4 no longer excusable by
counting, service-unit row added, classifier glob made recursive. Set aside, with reason: a Codex claim
that incident wording leaks account figures (the same facts are already in decisions.md 2026-10-01); a
"MUST under All optional" ambiguity (same shape as the existing Pre-deploy Checklist module); a
registry-age firing point (LOW); the spec's own junk-user count (written by the filing session before
this build).

**Known limitations (accepted, round 3):**
- A public fits / does not fit verdict beside a public formula and a public plan limit leaks a bound on a
  private input if many specs are read together. Accepted: two bits per spec, and the alternative is a
  Cost Budget nobody can check.
- Checking a verdict needs the private usage source (`.private/docs/usage/`, main checkout only). A
  reviewer without it cannot recompute the verdict and treats the budget as incomplete (HIGH), which
  is the safe direction.
- The registry's Cloud Run unit prices and Cloud Scheduler price are search-summary sourced until read
  on the vendor page (stated in the owner doc).
- While the Supabase organisation is over plan, any net-additive Supabase design is over-limit until the
  founder accepts an upgrade (P1530). This is the blocking decision working as written, not a defect.

## Review findings (P1522 + P1523, cost lens only)

**Reviewers.** Gemini 4 Argon was asked and **refused the payload** (`delegate-gemini` exit 2). The
match was the fake e2e password fixture in `e2e/helpers/test-user.ts:53`, not a real secret. Under
the delegation rule the payload was not edited to get past the scan, so an inline Claude review
stood in for that lane (A-rows). Codex (`gpt-6.1-sol`, verdict FAIL) gave the C-rows. Every row was
checked against the code by the filing session before it went into this table. **2 of 2 lanes
reported** (Gemini substituted, as stated).

| # | Where | Finding | Cost (arithmetic) | Sev | Filed to |
|---|---|---|---|---|---|
| A1 | `e2e/helpers/test-user.ts:438-530`, `scripts/sweep-e2e-test-users.ts:90-103` | User deletion is per user and learns about blockers by provoking errors. Each user costs at least 6 API calls: verifications delete, stories delete, sessions select, profile delete, auth delete, and the sweeper's `getUserById` check. Each FK blocker on the profile adds 2 more calls (the failing delete plus the nested delete), and each failing delete also writes a Postgres ERROR and a gateway error line. This is the "many logs per deletion" mechanism. | 6 + 2k calls per user, k = blockers (k=3 gives 12). 17,500 users at about 12 calls is about 210k calls, with at least as many log lines, from one cleanup. | HIGH | P1532 |
| A2 | P1522 spec (title, Solution item 4) vs `e2e/helpers/test-user.ts:148` | P1522's title says "e2e stops minting users", but the fixed user pool (Solution item 4) was never built. Every run still mints a user per test and deletes it again. `createTestUser(` appears 1,288 times in `e2e/`. P1530's private readings show the test project dominates log ingestion, with daily logs tracking new users. Minting is the main remaining driver, and P1522 claimed it fixed. | Per run: users minted x (create calls + 6 + 2k delete calls). | HIGH | P1532; evidence added to P1530 |
| A3 | `e2e/helpers/test-user.ts:554`, `:609` | `deleteTestUserByEmail` and `cleanupAllTestUsers` call `listUsers()` with no page, so they see only the first page of users. With thousands of users the target is usually not found, and the user is stranded. **Latent:** Codex found no live callers, and grep agrees (the only hit is a comment). | One stranded user per missed call, about 12 calls each to sweep later. | LOW (latent) | P1532 |
| A4 | `e2e/global-teardown.ts:15` | Every main-suite run ends with a sweep of up to 300 users in 60 s. It is sequential and time-capped, so about 10 req/s, but it runs after every local and CI run. The teardown sweep and A2 together are one budget: if pooled users make leftovers rare, the sweep becomes mostly listing. | Up to about 600 calls per run, plus `listUsers` pages until 900 candidates are found. | LOW | P1532 |
| C1 | `scripts/sweep-e2e-test-users.ts:126`, `:89` | The CLI sweep has no default limit and no time budget (`limit` defaults to Infinity; only the teardown passes `timeBudgetMs`). It has no pacing and no stop after repeated 5xx or timeouts. Same mechanism as the 2026-10-21 test-project outage. | 17,556 users x 6 = about 105k calls before blockers. | HIGH | P1532 |
| C2 | `e2e/helpers/test-user.ts:463-468` | The P1523 non-key branch clears blockers one owned row at a time, so cost grows with the user's story count S. | S + 2 extra calls per blocker class (S=100 gives about 107 calls per user). | HIGH | P1532 |
| C3 | `scripts/sweep-e2e-test-users.ts:64-74` vs `:89` | The teardown's 60 s deadline starts after listing, so listing is unbounded. Sparse candidates mean paging through every auth user (full objects, not ids) on every run, with no cursor kept between runs. | At about 20k users: 21 pages per run. | HIGH | P1532 |
| C4 | `e2e/helpers/test-user.ts:148-209`, `playwright.config.ts:111` | Same as A2. Codex's AST census: 1,286 `createTestUser` calls in 480 files, about 1,500 users per full run, and retries repeat fixtures. | About 7 calls per user, so about 10.5k calls per run before browser traffic. | MEDIUM (A2: HIGH; filing keeps HIGH) | P1532 |
| C5 | `e2e/helpers/test-user.ts:531-545` | A failed auth delete only warns, so normal per-test cleanup never sees it. The user is re-swept later at full cost. P1522 deferred the "no net new users per run" check (INBOX-204, still open). | 6+ calls per re-sweep per survivor. | MEDIUM | P1532 |
| C6 | `src/lib/offline-pack.ts:175-184`, `offline-pack-preloader.tsx:27-40`, `src/lib/offline-read-cache.ts:832` | A run cut short by hiding the tab restores the old stamp, and showing the tab restarts the pack from the beginning. `prefetchThrough` always fetches, so entries already stored are downloaded again. Tab-switching users bypass the 6-hour bound. | Half-run cut repeatedly: about 22 calls and 40 KiB per hide/show cycle. Conditional, not observed. | MEDIUM | P1532 |
| C7 | `scripts/measure-idle-requests.mjs:67` | The measurement counts only `requestfinished`, so failed requests, which still produce gateway logs, are invisible. A failure storm would read as zero. | F failed requests means F to 3F unseen log lines. | MEDIUM | P1532 |

## Related

- P1530 (log ingestion and egress before 11 Nov): the live overrun. This spec stops the class from
  recurring.
- P1527 (feed duplicate table fetches), P1522, P1523, P1525, P1369.
