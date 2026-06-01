---
status: in-progress
type: task
rank: 1000768
created_date: '2026-06-01'
tags: [ci, smoke, deploy, observability]
feature_type: backend
delivery_stage: dev
pipeline_ran: [create-spec, challenge-prd, architect, spec-review, dev]
---

# P866: Post-deploy prod smoke gate (console + HTTP errors, public routes)

## Problem

**Situation:** When a feature ships (`/ship` → push → Vercel deploys), nothing
loads the deployed page in a real browser to check the console. `test.yml` runs
on push but is unit-only (Vitest/JSDOM — no browser, never hits prod).
`csp-smoke.yml` *does* load prod in a real browser, but it is CSP-violations-only
(`csp-smoke.spec.ts:94` explicitly excludes general console noise) and runs on a
6-hour cron + manual dispatch — it is **not** deploy-triggered. The `/letter/*`
route (the core delivered artifact) is in no smoke route list (csp-smoke covers
`/, /live, /feed, /manifesto, /events`; app-boot-smoke covers `/, /feed, /live`
against localhost only).

**Complication:** A `406` failed-resource error on `/letter/:id` reached
production unnoticed (console screenshot, 2026-06-01) — a token-based REST/RPC
call in the letter-reading path. No gate caught it: it is not a CSP violation
(so csp-smoke ignores it), not a fatal React crash (so app-boot-smoke's filter at
`app-boot-smoke.spec.ts:36` ignores it), and the letter route is unsmoked. Up to
6 hours can pass between a breaking deploy and any prod browser check, and even
then the check would not visit a letter page or flag a 406.

**Question:** How do we catch console/HTTP errors on prod (including the letter
route) within minutes of a deploy, without the gate being flaky from third-party
SDK noise?

## Appetite

Low–medium blast radius — adds a CI gate that alerts on every prod deploy; a
false-positive-prone gate would erode trust in the signal. **Fully reversible** —
the new spec, the cron change, and the `/ship` watch step are all git-revertable
with **no schema change, no prod data, no new secrets** (scope cut to public routes
only — see Non-Goals). Low decision density — only the allowlist contents are open;
the shape (generalize `csp-smoke`; run via the `/ship` post-push loop + the existing
cron) is decided.

## Solution

**The gate loads the public pages after a deploy and fails on console/HTTP errors.**
The real problem: prod errors get found *manually, by chance* (the founder opened the
console after a push and saw a red 406). Automate that check. This is standard
synthetic-smoke practice — `csp-smoke` already does it for CSP; we widen what it
watches.

**Generalize the existing `csp-smoke.spec.ts` harness** (it already loads the deployed
routes in a real browser, stabilization-polls for late vendor SDKs, and opens a
find-or-append GitHub issue on failure). Broaden its assertion from CSP-only to: fail
on **any** console `error` **and any HTTP response ≥ 400**, minus a curated allowlist
of known-benign vendor patterns (LogRocket / Mixpanel / Sentry). The allowlist is the
load-bearing choice: existing gates filter *what they observe* (CSP-only) to stay
green; this one observes everything and filters *what is known-benign*, so a novel
error fails by default.

**Routes: the existing public set only** — `/, /live, /feed, /manifesto, /events`. No
auth, no token, no fixture, no prod data. (Auth/token-gated pages like `/letter` are
explicitly out of scope — see Non-Goals.)

**Two runners** — build the route-list + allowlist + spec once, run it two ways:
- **`/ship` post-push watch** (the primary trigger, for the founder's own deploys) —
  after the user approves the push, the agent waits for the new prod deploy to be
  **ready**, runs the spec against prod (`PROD_SMOKE_URL=… npm run smoke:prod`, the
  same pattern `smoke:csp` uses), reads pass/fail directly, and on failure surfaces it
  **inline** with a revert (Vercel rollback / git revert) / fix-forward /
  triage-as-benign choice — **never auto-acting**. Sequencing push → wait-ready →
  smoke is what removes the edge-propagation race; no webhook needed.
- **CI cron** (the async net) — broaden the existing 6-hour schedule so prod is
  checked even with no deploy (no-commit vendor rotations). `workflow_dispatch` kept
  for manual runs. On failure, the existing find-or-append GitHub-issue pattern.

**End-state:** once the broad allowlist is proven non-flaky, fold `csp-smoke`'s CSP
assertion into this one harness (a CSP violation is just another non-allowlisted
failure) — one prod-health gate, not two. Day one stays **alert-only** so an unproven
allowlist cannot destabilize the currently-green CSP gate.

**The 406 is the spark, not a deliverable.** It lives on a `/letter` page the gate
does NOT load, so the gate won't re-catch this specific one — accepted: the 406 is
harmless console noise, and the gate's value is catching the *class* on the public
pages going forward. Do not design or chase a 406 fix.

## Risks / Non-Goals

### Risks
- **Flaky failures from third-party noise** (MITIGATE). A broad console/HTTP gate
  catches benign vendor errors. Mitigation: the curated allowlist; start alert-only,
  observe a few deploys, tighten before any promotion to blocking.
- **`/ship` loop smokes a not-yet-propagated build** (MITIGATE). Mitigation: poll
  Vercel for `readyState=READY` before smoking the prod alias; a brief
  alias-propagation lag is acceptable for an alert-only gate (re-run once if a
  transient network error is suspected).
- **Allowlist drift hides a real regression** (MITIGATE). Too-broad patterns swallow
  real errors. Mitigation: entries are exact/narrow + commented with why, reviewed
  like the P865 canary.

### Non-Goals
- Do NOT make the gate hard-blocking on day one — land it alert-only, promote to
  blocking only after the allowlist is proven against real deploys.
- Do NOT remove or weaken the existing `csp-smoke.yml` cron — this gate is additive
  (and eventually folds csp-smoke in).
- **Do NOT test the `/letter` page (or any auth/token-gated page).** It needs a
  seeded prod letter + fixture + elevated creds — all out of scope. **Public routes
  only.** This deletes the entire fixture A/B/C decision and the prod-data/secret
  surface.
- **Do NOT build a Vercel deploy-webhook auto-trigger now.** The `/ship` post-push
  loop covers the founder's own deploys; the cron covers the rest. Add a webhook
  later only if out-of-terminal (dashboard) deploys become common.
- Do NOT chase the 406 as a deliverable — it's a harmless example on a page the gate
  doesn't load; handle it separately (or not) later.
- Do NOT fix unrelated console warnings surfaced during this work — log them, do
  not bundle them into this spec.
- Do NOT bundle the `/verify` improvement here. `/verify` already reads the
  console (`verify/SKILL.md:356`) but with pattern `error|Error|TypeError|Uncaught`
  — a "Failed to load resource: …406" line does not match it, and it runs no
  HTTP-status check, so it would have missed this 406 too. Broadening `/verify`'s
  console sweep + adding an HTTP≥400 check, **sharing this gate's allowlist**, is a
  separate follow-up (different layer: per-feature pre-ship vs every-deploy post-ship).

### Alternatives Considered
- **Widen app-boot-smoke's error filter instead of a new gate.** Rejected as the
  primary: app-boot-smoke runs against localhost (no prod headers, no prod data,
  no token flow) and is not deploy-triggered. The prod surface is the point.
- **Vercel Checks / a third-party synthetic monitor (Checkly, etc.).** Adds an
  external dependency and a second dashboard for a check we can run in our existing
  Playwright + GitHub Actions stack. Revisit only if the in-house gate proves
  insufficient.
- **CSP report-uri-style passive backstop only** (already exists via
  `api/csp-report.ts`). Passive catches real-user violations after the fact; it
  does not gate a deploy and does not cover non-CSP errors like the 406.

### Rollback Strategy
- Gate: delete `.github/workflows/<new>.yml` (or revert the cron change), the new
  spec + `e2e/helpers/prod-health.ts` + `e2e/prod-health-smoke.spec.ts`, and the
  `/ship` watch step. **No app, schema, prod-data, or secret change to reverse.**

## Done-When

- [ ] A prod smoke spec fails on any non-allowlisted console `error` **or any HTTP
      ≥ 400**, covering the public routes (`/, /live, /feed, /manifesto, /events`).
- [ ] The allowlist is curated + commented (one line per entry on why it is benign),
      colocated with the spec like the P865 canary.
- [ ] **`/ship` post-push watch:** after the user pushes, the agent waits for the new
      prod deploy to be ready, runs the gate against prod, and reports pass/fail
      **inline** — on failure offering revert (Vercel rollback / git revert) /
      fix-forward / triage-as-benign, never auto-acting (every option is a prod change
      → explicit OK).
- [ ] The existing cron runs the prod-health spec (broadened from CSP-only); a failing
      run opens a find-or-append GitHub issue, not a silent red in the Actions tab.
- [ ] A deliberately-broken check (narrow the allowlist / point at a known-bad route)
      is shown to fail the gate — it catches the class, not just exists.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] 406 root cause undiagnosed → "regression test at the layer that broke" Done-When is untestable | Keep ONE spec; sequence the Done-When so the 406 is root-caused (which call, why) via `/fix`'s reproduce phase *before* the regression test is written. Spec's original lead (`get_letter_for_reading` `.single()`) **falsified this session** — token path is an `.rpc()` with no `.single()`; reproduce live. | The 406 is the gate's own test fixture ("replay of the 406 fails the gate") — splitting severs the exemplar from its validator. The real defect was Done-When wording, not file structure. |
| 2 | /challenge-prd | [WARN→fix] "same-origin HTTP ≥ 400" filter | Drop "same-origin"; observe ALL HTTP ≥ 400 + console errors, filter by allowlisted pattern (Supabase host + vendors) | **Verified this session:** letter `*ByToken` calls go through `supabase` client → `besjtuodziykmjidubzw.supabase.co` (cross-origin to claritypledge.com). An origin-filtered HTTP net structurally misses the cross-origin 4xx that motivated the gate. The gate is about *console errors AND any HTTP error*, not just the 406. |
| 3 | /challenge-prd | [WARN] deploy webhook races CDN edge | **SUPERSEDED by #8 (webhook cut).** ~~Smoke the per-deployment URL, `/architect` verifies the two Vercel facts.~~ Now: the `/ship` loop polls `readyState=READY` then smokes the prod alias — no webhook, no per-deployment URL, no protection-bypass. | Per-deployment URL is immutable and serves the build's own headers once ready — sidesteps edge propagation. |
| 4 | /challenge-prd | Follow-up: `/verify` would miss this class too | Separate fast-follow, not built in P866. `/verify` change list: (a) broaden its console pattern beyond `error\|Error\|TypeError\|Uncaught` to catch "Failed to load resource …4xx"; (b) add a `read_network_requests` HTTP≥400 check; (c) run on the feature's actual routes incl. `/letter`; (d) consume THIS gate's allowlist | Different layer (per-feature pre-ship vs every-deploy post-ship). Build the allowlist once in P866, share it — don't invent it twice. |
| 5 | /challenge-prd | **[RESOLVED by #8 — dropped]** prod seed-letter fixture contradicts Appetite's "reversible / no schema change" | **CUT.** The `/letter` page is no longer tested (see #8 + Non-Goals), so there is no fixture, no prod write, no A/B/C decision, no elevated creds. The contradiction is gone by removal. | A permanent tokenized prod row would be a data-state change with no clean rollback — the simplest fix was to not test the letter page at all. |
| 8 | this session | "Are we over-engineering / reinventing the wheel in a shitty way?" — the `/letter` fixture + the Vercel webhook relay were the bloat | **Scope cut to the minimal best-practice gate.** (a) **Drop `/letter`-page testing** entirely → removes the fixture, the A/B/C decision, the prod write, and the elevated creds (#5). (b) **Drop the Vercel webhook relay** → removes a new public API surface, HMAC verification, 2 secrets, and the deployment-protection question (#3). What remains: generalize `csp-smoke` to watch console + HTTP≥400 on the **public routes**, run via the **`/ship` post-push loop** (founder's deploys) + the **existing cron** (background net). | The core — load deployed public pages headless, fail on console/HTTP errors — IS standard synthetic-smoke practice (already done for CSP). The cut machinery existed only to test one extra page and to auto-trigger on dashboard deploys (rare). Founder's actual flow (`/ship` → push) loses nothing. |
| 6 | this session | "Are we reinventing the wheel — is this just `/verify`?" | **One substrate, multiple runners. [UPDATED by #8: P866 ships TWO runners — `/ship` watch (post-push, prod) + the existing cron. The `/verify` runner is a deferred follow-on (#4); the webhook was cut.]** Build the route-list + allowlist + Playwright spec once. Generalize `csp-smoke.spec.ts` rather than clone it; fold its CSP assertion in once the allowlist is proven. | A check shifts left only as far as the failure is reproducible: app/console/HTTP errors → pre-push; CSP / SW / prod-data / vendor-rotation → prod-only (the P865/P864 lineage). So `/verify` and the gate catch *different partitions* — neither replaces the other. csp-smoke already does ~80% of the harness. |
| 7 | this session | Gap: the async GitHub issue is the only failure surface — useless when the agent that just broke prod is still in-session | Add a **synchronous push-time loop** in `/ship`'s post-push phase: after the approved push, the agent waits for the prod deploy to be ready, runs the spec locally against prod, surfaces pass/fail inline, and offers revert (Vercel instant rollback / git revert) / fix-forward / triage-as-benign. Never auto-acts (prod change → explicit OK). | A 10-second revert beats a GitHub issue read hours later. Sequencing push → wait-ready → smoke also removes the webhook/CDN race (WARN-1) for the agent's own deploys; the webhook path remains the net for non-agent deploys. |

---

## Technical Architecture

### Technical Analysis

#### Current state

**`e2e/csp-smoke.spec.ts`** (the harness to generalize):
- Loads `STRICT_CSP_ROUTES = ['/', '/live', '/feed', '/manifesto', '/events']` against `CSP_SMOKE_URL` (defaults to `https://claritypledge.com`).
- Registers a `securitypolicyviolation` DOM listener via `addInitScript` before page load — this is the primary capture path.
- Secondary: `page.on('console')` filtered by `CSP_VIOLATION_RE` — a complement, not the primary signal.
- Stabilization poll: MIN 4 s / MAX 12 s / STABLE window 2.5 s — designed for late-init SDKs (LogRocket/Mixpanel behind `requestIdleCallback`).
- Does NOT intercept network responses (no `page.on('response')`) — no HTTP≥400 capture exists today.
- Asserts `all.toHaveLength(0)` (fail on any CSP violation). The HTTP-gate is additive — it attaches to the same page load.
- Comment at line 94 explicitly calls out that generic console noise is excluded: the new gate INVERTS that — observe everything, filter known-benign.

**`.github/workflows/csp-smoke.yml`** (the workflow to extend/mirror):
- Triggers: `schedule: cron '0 */6 * * *'` + `workflow_dispatch`.
- Runs `npm run smoke:csp` (= `playwright test --project=chromium e2e/csp-smoke.spec.ts`).
- On failure: find-or-append GitHub issue via `gh issue list --search "$TITLE in:title"` → comment existing or create new. Shell values are built-in env vars only — no untrusted input in the issue body today (security note: the new workflow must maintain this).
- Permissions: `contents: read`, `issues: write`.

**`package.json` smoke scripts**:
- `"smoke": "playwright test --project=chromium e2e/app-boot-smoke.spec.ts"` — localhost only, fatal-React-only.
- `"smoke:csp": "playwright test --project=chromium e2e/csp-smoke.spec.ts"` — prod URL from `CSP_SMOKE_URL`.
- New script needed: `"smoke:prod"` — runs `e2e/prod-health-smoke.spec.ts` against `PROD_SMOKE_URL`.

**`playwright.config.ts`**:
- `webServer` block is gated: `process.env.CSP_SMOKE_URL ? undefined : { ... }`. The same guard applies to `PROD_SMOKE_URL` — when set, no local dev server is started.
- The new spec uses `PROD_SMOKE_URL`; the config guard must be extended to also skip `webServer` when `PROD_SMOKE_URL` is set.

**`vercel.json`**:
- CSP headers live on the `"/(.*)"` catch-all route. Per-deployment URLs (`<project>-<hash>.vercel.app`) serve these same headers once ready — this is confirmed by the csp-smoke spec already working against the deployed URL.
- `/point/(.*)` and `/story/(.*)` carry only `frame-ancestors *` — not in scope for the strict-CSP gate or this prod-health gate.

**`src/tests/p865-csp-logrocket-hosts.test.ts`** (the P865 canary):
- Static Vitest unit test — parses `vercel.json` and asserts every LogRocket host appears in `script-src`, `connect-src`, `worker-src`.
- This is the model for the allowlist file format: a TypeScript module of named, documented arrays.

**`.claude/commands/slava/build/ship.md`** (`/ship` skill — the post-push watch seam):
- Step 5 prints "Ready to push: `git push origin main`". Vercel auto-deploys on push.
- Step 6 asks: "Run post-deploy smoke test? (`/verify pN` against prod)" — this is the existing seam.
- The prod-health gate attaches to Step 6, replacing or supplementing the manual `/verify` offer: after the user confirms the push, the agent polls Vercel for `readyState=READY`, then runs `PROD_SMOKE_URL=https://claritypledge.com npm run smoke:prod`, reports inline, and offers revert/fix/triage. It does NOT auto-act.

**`scripts/git-ops.sh`** (`ship` subcommand):
- Handles cherry-pick, spec closure, branch/worktree cleanup, prints "Ready to push."
- The post-push watch is a `/ship` skill-layer concern, not a `git-ops.sh` concern — `git-ops.sh` has no network I/O today and that should not change.

**`.github/workflows/check-deploy-drift.yml`**:
- Cron `0 6 * * *` + `workflow_dispatch`. Runs `./scripts/check-deploy-manifest.sh --env prod`. Permissions `contents: read` (no `issues: write`). Reference for cron + manual dispatch workflow pattern.

**`api/csp-report.ts`** (CSP report-uri sink, passive):
- Receives real-user CSP reports from prod browsers. Passive net — does not gate deploys and does not catch non-CSP errors (the 406 scenario). Not modified by this spec.

#### Reuse inventory

| File / Pattern | Used by P866 | Reason |
|---|---|---|
| `e2e/csp-smoke.spec.ts` | Generalized (in-place extension) | The harness — `securitypolicyviolation` listener, stabilization poll, `STRICT_CSP_ROUTES`, `BASE_URL` from env. No parallel spec. |
| `.github/workflows/csp-smoke.yml` | Referenced as template; NEW workflow mirrors its structure | The cron interval, find-or-append issue shell pattern, `npm ci` + `npx playwright install chromium` steps are reused verbatim. |
| `package.json` `smoke:csp` script | Extended: adds `smoke:prod` alongside | Same Playwright invocation pattern; new env var `PROD_SMOKE_URL` mirrors `CSP_SMOKE_URL`. |
| `playwright.config.ts` `webServer` guard | Modified: extend condition to cover `PROD_SMOKE_URL` | Already gates on `CSP_SMOKE_URL`; same logic needed for the new env var. |
| `src/tests/p865-csp-logrocket-hosts.test.ts` | Allowlist file format model | Named, documented host arrays in TypeScript. The new `e2e/helpers/prod-health.ts` mirrors this structure for the runtime allowlist. |
| `scripts/git-ops.sh` | Read (structure understood); NOT modified | Ship subcommand produces "Ready to push" — the post-push watch lives in the `/ship` skill layer, not in this script. |
| `.claude/commands/slava/build/ship.md` | Modified: Step 6 gains the prod-health watch step | Existing "Run post-deploy smoke?" seam is the right attachment point. |
| `e2e/app-boot-smoke.spec.ts` | Read only; not modified | Localhost-only; filter shows fatal-React-only pattern (the *opposite* of the new gate's approach). |
| `api/csp-report.ts` | Not modified | Passive sink; unrelated to the active gate. |
| `check-deploy-drift.yml` | Pattern reference only | Cron + `workflow_dispatch` + `permissions` block template. |

---

### Architecture Decisions

**AD-1: Generalize `csp-smoke.spec.ts` in-place via a shared helper module (not a new parallel spec)**

- **Chosen:** Introduce `e2e/helpers/prod-health.ts` as a shared module exporting (a) `PROD_HEALTH_ROUTES` (the route list), (b) `PROD_HEALTH_ALLOWLIST` (the error/URL allowlist), and (c) the stabilization-poll helper function. `csp-smoke.spec.ts` imports `PROD_HEALTH_ROUTES` (replacing its inline `STRICT_CSP_ROUTES` constant) and the poll helper. The new `e2e/prod-health-smoke.spec.ts` imports all three. The new spec adds `page.on('response')` HTTP≥400 capture and a broadened `page.on('console', type === 'error')` capture alongside the existing CSP violation path.
- **Rationale:** The spec says "do NOT build a parallel spec" (Resolved Decision #6). The stabilization poll is non-trivial (MIN/MAX/STABLE logic); extracting it prevents drift between the CSP spec and the new one. One substrate — if the poll tuning changes, both specs benefit automatically.
- **Trade-off:** `csp-smoke.spec.ts` gains an import dependency on the new helper module. Acceptable: the dependency is local and the spec already has the poll logic inline — extraction is a net simplification.
- **Alternative rejected:** Duplicating the stabilization poll and route list into a second spec — rejected because two copies diverge silently (the P865 lesson: copies rot).

**Broadened assertions in `prod-health-smoke.spec.ts`:**
```
// console capture — ALL errors, not just CSP patterns
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    const text = msg.text();
    if (!isAllowlisted(text, PROD_HEALTH_ALLOWLIST.consolePatterns)) {
      consoleErrors.push(text);
    }
  }
});

// HTTP capture — ALL responses ≥ 400
page.on('response', (response) => {
  if (response.status() >= 400) {
    const url = response.url();
    if (!isAllowlisted(url, PROD_HEALTH_ALLOWLIST.urlPatterns)) {
      httpErrors.push(`HTTP ${response.status()} ${url}`);
    }
  }
});
```

Day-one behavior: `expect([...consoleErrors, ...httpErrors]).toHaveLength(0)` — but the workflow runs **alert-only** (the CI workflow opens an issue; it does NOT fail the build). Hard-blocking is a post-launch promotion once the allowlist is proven.

---

**AD-2: Allowlist file format and location**

- **Chosen:** `e2e/helpers/prod-health.ts` exports the allowlist as a typed TypeScript object with two arrays: `consolePatterns: string[]` (substring/regex-source strings matched against console error text) and `urlPatterns: string[]` (substring strings matched against response URL). Each entry has a required comment on the preceding line explaining why it is benign (the P865 canary model). The `isAllowlisted` helper does `patterns.some(p => text.includes(p))` — exact substring match by default, which is narrow and auditable.
- **Example entry:**
  ```typescript
  export const PROD_HEALTH_ALLOWLIST = {
    // Console error substrings that are known-benign and should not fail the gate.
    consolePatterns: [
      // LogRocket initialization: "LR-SDK: [warn] session recording blocked"
      // — appears when the recorder is suppressed for a session; not an app error.
      'LR-SDK',
    ],
    // HTTP response URL substrings for known-benign ≥400 responses.
    urlPatterns: [
      // Supabase API calls are cross-origin — all Supabase 4xx are filtered here
      // because they surface as console errors too; the individual call sites handle errors.
      // This is the allowlist entry for the motivating 406 until the root cause is fixed.
      '.supabase.co',  // TODO: narrow to specific RPC once 406 root cause confirmed
      // Mixpanel: occasional 429 (rate limit) on the ingest endpoint; not an app error.
      'api-eu.mixpanel.com',
      // Sentry: 429 on the store endpoint during event bursts.
      '.sentry.io',
    ],
  };
  ```
- **Rationale:** TypeScript + colocated comment = the pattern the codebase already uses (P865 canary). The reviewer sees the "why" at the allowlist entry — no separate doc. Substring matching is intentionally strict: a future Supabase URL change would NOT be silently swallowed.
- **Trade-off:** Substring matching can produce false negatives if a new benign URL doesn't share a listed substring. Mitigation: the allowlist is reviewed like a code change (PR), not treated as configuration.
- **Alternative rejected:** Regex patterns — more expressive but harder to audit; a too-broad regex can silently swallow real errors. Start with substring; escalate to regex only when a legitimate entry can't be expressed as a substring.

**Note on the `.supabase.co` entry:** Per Resolved Decision #2, the gate observes ALL HTTP≥400 but allowlists Supabase by host (public-route pages make cross-origin Supabase calls that can legitimately 4xx). This host-level allow is intentionally broad for v1; narrowing it to specific endpoints is a future allowlist-tightening review, independent of this spec (P866 does not chase the 406).

---

**AD-3: Route list for increment-1 (public, no fixture)**

- **Chosen:** Increment-1 route list in `PROD_HEALTH_ROUTES` (exported from `e2e/helpers/prod-health.ts`):
  ```typescript
  export const PROD_HEALTH_ROUTES = [
    '/',           // home — strict CSP, analytics SDKs init here
    '/live',       // live session entry — mic permission dialog, realtime setup
    '/feed',       // story feed — Supabase fetch on load
    '/manifesto',  // static-ish content page
    '/events',     // events listing — Supabase fetch on load
  ];
  ```
  This is identical to `csp-smoke.spec.ts`'s `STRICT_CSP_ROUTES`. When `csp-smoke.spec.ts` is refactored to import from `prod-health.ts`, it uses the same list — one source of truth.
- **Rationale:** These five routes are the existing smoke-tested surface. Increment-1 adds zero new routes, ensuring the first prod-health run has a baseline against which "no new noise" can be evaluated before expanding.
- **Alternative rejected:** Starting with only `'/'` to minimize surface — the existing csp-smoke already covers all five with no flakiness; starting with all five gives more signal at no extra cost.

---

**AD-4: CI trigger — broaden the existing cron; the `/ship` loop is the deploy-time trigger**

- **Chosen:** Run the prod-health spec on a schedule — add a sibling
  `.github/workflows/prod-health-smoke.yml` (`schedule: cron '0 */6 * * *'` +
  `workflow_dispatch`), or extend `csp-smoke.yml` to also run `smoke:prod`. Target is
  the prod alias `https://claritypledge.com` (a cron has no deploy-timing concern). On
  failure: the existing find-or-append GitHub-issue pattern. **Alert-only** (not a
  required PR check) until the allowlist is proven.
- **No Vercel webhook / `repository_dispatch` / relay — CUT (Resolved Decision #8).**
  The deploy-time trigger is the **`/ship` post-push loop** (AD-5): the founder is in
  the terminal when they deploy, so the agent runs the smoke synchronously right after
  the push. The cron is the background net for no-commit vendor rotations. A webhook to
  auto-trigger on out-of-terminal (dashboard) deploys is a **deferred follow-on**, not
  built here — it would add a public API relay + HMAC verification + a dispatch PAT for
  a case the founder rarely hits.
- **Rationale:** Drops an entire new public surface (the relay endpoint), two secrets,
  and the whole deployment-protection question — for zero loss on the founder's actual
  deploy flow (`/ship` → push). Standard synthetic-smoke setups are cron + on-demand;
  this matches.
- **Alternative rejected:** The webhook-relay design — deferred as premature machinery;
  revisit only if dashboard deploys become common.

---

**AD-5: `/ship` post-push watch — exact seam, wait logic, and revert surface**

- **Chosen seam:** `/ship` skill Step 6 currently asks "Run post-deploy smoke test? (`/verify pN`)". This is the right attachment point. The prod-health watch replaces (or precedes) the `/verify` offer with a mandatory prod-health smoke when `prod-health-smoke.spec.ts` exists. Flow:

  1. User runs `git push origin main` (explicitly — never auto-pushed by `/ship`).
  2. After the user **confirms the push** in reply to the Step 6 prompt (`/ship` never auto-detects the push — it asks).
  3. Poll the Vercel deployments API (`GET api.vercel.com/v*/deployments?projectId=<projectId>&target=production&limit=1` with `Authorization: Bearer $VERCEL_TOKEN` — **verify exact API version + params at `/dev`**) until the newest deployment's `readyState` is `READY` (max ~3 min, 15s interval). `VERCEL_TOKEN` is in `.env.local` (used by `check-deploy-manifest.sh`); pin the `claritypledge` `projectId` in the `/ship` step. **At `/dev`, verify `VERCEL_TOKEN` has deployment-read scope** (`vercel projects ls --token $VERCEL_TOKEN` exits 0). Fallback if it doesn't: a fixed post-READY wait, then smoke the alias.
  4. Smoke the **prod alias** `https://claritypledge.com` (public routes — no per-deployment URL, no deployment-protection bypass needed).
  5. Run: `PROD_SMOKE_URL=https://claritypledge.com npm run smoke:prod`.
  6. Read exit code. On pass: `"Prod health smoke passed."` — then offer `/verify pN` and `/kdd` as before.
  7. On fail: surface the failing routes/errors inline. Offer three options (never auto-act — all are prod changes):
     - **(A) Instant rollback:** `vercel rollback --token $VERCEL_TOKEN` — reverts prod to the previous deployment in ~10s. Use when the error is clearly a regression introduced by this deploy.
     - **(B) Fix forward:** Start a `/fix` session. Use when the error is a known issue with a quick fix.
     - **(C) Triage as benign:** Add the error pattern to `PROD_HEALTH_ALLOWLIST` in `e2e/helpers/prod-health.ts`, commit, push a fix. Use when the error is a known-benign vendor behavior not yet in the allowlist.

- **Why poll-then-alias (not the per-deployment URL):** smoking the public prod alias avoids the deployment-protection bypass entirely. Cost: a brief (~15–60s) alias-propagation lag after `readyState=READY`; tolerable for an alert-only gate (the cron backstops; the agent re-runs if it suspects a stale hit). If false-"clean"-on-lag ever bites, add a short post-READY wait or poll the alias for the new build's asset hash before asserting.
- **Rationale:** The push-to-smoke loop gives the agent — the actor most likely to have just broken prod — an inline remediation path. The cron is the net for other actors (dashboard redeploy, vendor rotation). Two runners, one substrate (Resolved Decision #6, as cut by #8).
- **Alternative rejected:** Auto-rollback on smoke failure — rejected as a hard rule because the spec says "never auto-act (every option is a prod change → explicit OK)". A wrong rollback is worse than a known-broken prod for 30 seconds while the founder decides.

---

**AD-6: (CUT) Deployment-protection bypass — not needed**

The gate smokes the **prod alias** `claritypledge.com` (anon-accessible public routes),
not a per-deployment URL, so Vercel Deployment Protection never gates it and **no
`x-vercel-protection-bypass` secret is required**. The `/ship` loop polls Vercel for
`readyState=READY` then smokes the alias (AD-5). Removed vs. the prior design:
`VERCEL_AUTOMATION_BYPASS_SECRET`, the `extraHTTPHeaders` injection, and per-deployment-URL
targeting. (The prod alias already serves the strict-CSP headers — `csp-smoke` proves it.)

---

**AD-7: Redact captured URLs / console text before any public surface (security)**

- **Chosen:** The gate captures failing response URLs + console error text. Before any
  of it reaches a **public** GitHub issue body OR the inline `/ship` report, it passes
  through `redactUrl()` (AD-1 / Build Sequence step 1): strip the entire query string
  (`?…` → `?[REDACTED]`), strip `Authorization`/`apikey` header values, cap each entry
  at ~200 chars. Public routes rarely carry tokens, but cross-origin captured URLs and
  future param additions make this cheap defense-in-depth, not optional.
- **Rationale:** The issue body is public (AGPL-3.0). `csp-smoke.yml` keeps its body to
  `$GITHUB_RUN_ID` only; this gate adds error detail, so the detail must be redacted.
- The only credential involved is `VERCEL_TOKEN` (the `/ship` readiness poll), a local
  `.env.local` secret — never echoed, never needed in the cron CI path.

---

### Security Review

CI/infra — no new tables/RLS/columns, no LLM, **no new secrets** (scope cut to public
routes + cron + `/ship` loop; the only credential is the existing `VERCEL_TOKEN` used
for the readiness poll). Remaining surfaces:

**Token leakage into a public issue — MITIGATE (cheap):**
- The gate captures failing response URLs + console text and (CI path) posts them into
  a **public** GitHub issue. Public routes rarely carry tokens, but cross-origin
  captured URLs and future param additions make raw posting a latent leak.
- **Required (Build Sequence step 1/3):** route every captured URL/console entry through
  `redactUrl()` (strip the whole query string; strip `Authorization`/`apikey`; cap ~200
  chars) before it reaches an issue body or the inline `/ship` report. Comment the
  contract: "never change without security review."

**Read-only Guarantee — ✅:**
- The public-route gate is structurally read-only (navigate + observe; no authed RPC,
  no POST/PATCH, no DB write). The `/ship` watch runs the same spec locally. There is
  no prod write path anywhere in this spec.

**PII in Spec/Repo — ✅ / ⚠️:**
- ✅ The spec contains no real letter IDs, tokens, row IDs, or emails (the diagnosis
  used a real prod token + letter id from a screenshot — kept out of the spec).
- ⚠️ **Required:** during the first-prod-run / allowlist-population steps, any captured
  real request URL (with a token) goes to `.private/incidents/` ONLY — never into the
  spec, the committed allowlist file, or a fixture. The allowlist holds host/substring
  patterns only.

*(Findings about a service-role key in CI, Vercel webhook signature verification, and a
deployment-protection bypass secret are now **moot** — those features were cut. See
Resolved Decision #8.)*

---

### Implementation Approach

**Worktree recommended:** touches `.github/workflows/`, `package.json`, `e2e/`, and the `/ship` skill under `.claude/`. Run from a dedicated worktree slot to avoid conflicts with any active feature branch.

#### Build Sequence

**Increment-1 (public routes, no fixture — build this first):**

1. **Create `e2e/helpers/prod-health.ts`** — export `PROD_HEALTH_ROUTES`, `PROD_HEALTH_ALLOWLIST`, `isAllowlisted()`, the stabilization-poll helper (extracted from `csp-smoke.spec.ts`), and **`redactUrl(url)`** (strips the entire query string `?…` → `?[REDACTED]` + strips `Authorization`/`apikey` header values — Security Review HIGH; tokens live in `?token=`). Every captured URL passes through `redactUrl()` before it can reach a reporter, the inline `/ship` report, or an issue body.
2. **Refactor `e2e/csp-smoke.spec.ts`** — replace inline `STRICT_CSP_ROUTES` + the inline poll loop with imports from `e2e/helpers/prod-health.ts`. Keep the `securitypolicyviolation` assertion unchanged. Run `npm run smoke:csp` against prod to confirm no regression.
3. **Create `e2e/prod-health-smoke.spec.ts`** — imports `PROD_HEALTH_ROUTES`, `PROD_HEALTH_ALLOWLIST`, `isAllowlisted()`, `redactUrl()`, and the poll helper from `e2e/helpers/prod-health.ts`. Adds `page.on('response')` HTTP≥400 capture + broadened `page.on('console', type === 'error')` capture. **Every captured URL stored in the failure message goes through `redactUrl()` first** (Security Review HIGH — no raw token may reach the reporter). Asserts on combined `consoleErrors + httpErrors` after stabilization. Uses `PROD_SMOKE_URL` env var.
4. **Update `package.json`** — add `"smoke:prod": "playwright test --project=chromium e2e/prod-health-smoke.spec.ts"`.
5. **Update `playwright.config.ts`** — extend the `webServer` guard to also skip the local dev server when `PROD_SMOKE_URL` is set (mirrors the existing `CSP_SMOKE_URL` guard). No bypass headers (AD-6 cut).
6. **Create `.github/workflows/prod-health-smoke.yml`** (a sibling to `csp-smoke.yml`, mirroring its structure) — `schedule: cron '0 */6 * * *'` + `workflow_dispatch`; runs `smoke:prod` against `https://claritypledge.com`; find-or-append GitHub issue on failure (**redacted body**); alert-only (not a required check). **No `repository_dispatch`, no webhook, no relay (cut).** Also add `e2e/prod-health-smoke.spec.ts` to the standalone-smoke allowlist in `.claude/rules/tests.md` (alongside `csp-smoke.spec.ts`).
7. **Update `.claude/commands/slava/build/ship.md`** — Step 6: after the user confirms the push, poll Vercel for `readyState=READY` (`vercel inspect` / API, `VERCEL_TOKEN` from `.env.local`, max ~3 min), then run `PROD_SMOKE_URL=https://claritypledge.com npm run smoke:prod`; surface pass/fail inline with revert (`vercel rollback`) / fix-forward / triage-as-benign — never auto-acting (AD-5).
8. **First prod run** — run `npm run smoke:prod` manually against prod, observe failures, populate the allowlist with real prod noise, commit the allowlist, confirm green before enabling the cron schedule. **PII (Security Review):** any captured real request URL (with a token) goes to `.private/incidents/` ONLY — never into the spec, the committed allowlist, or a fixture; the allowlist holds host/substring patterns only.
9. **Prove the gate catches the class** — temporarily narrow an allowlist entry or point at a known-bad route; confirm the gate fails; restore.
10. **Verify before/at `/dev`** — confirm the `VERCEL_TOKEN` in `.env.local` can read deployment state for the `/ship` readiness poll. That is the only external fact left to check (webhook + deployment-protection verification are gone with the cut).

#### Files to Create

| File | Purpose |
|---|---|
| `e2e/helpers/prod-health.ts` | Shared module: `PROD_HEALTH_ROUTES`, `PROD_HEALTH_ALLOWLIST`, `isAllowlisted()`, `redactUrl()`, stabilization-poll helper |
| `e2e/prod-health-smoke.spec.ts` | New Playwright spec: console error + HTTP≥400 gate for public routes (redacted failure output) |
| `.github/workflows/prod-health-smoke.yml` | CI: cron `0 */6 * * *` + `workflow_dispatch`; runs `smoke:prod` against the prod alias; find-or-append issue on failure |

#### Files to Modify

| File | Change |
|---|---|
| `e2e/csp-smoke.spec.ts` | Import `PROD_HEALTH_ROUTES` and the poll helper from `e2e/helpers/prod-health.ts`; remove the duplicated inline definitions |
| `package.json` | Add `"smoke:prod": "playwright test --project=chromium e2e/prod-health-smoke.spec.ts"` |
| `playwright.config.ts` | Extend `webServer` condition: `process.env.CSP_SMOKE_URL \|\| process.env.PROD_SMOKE_URL` (skip local dev server). No bypass headers (AD-6 cut) |
| `.claude/commands/slava/build/ship.md` | Step 6: replace optional `/verify` offer with the mandatory prod-health watch (poll for ready → `smoke:prod` → inline pass/fail → revert/fix/triage options) |
