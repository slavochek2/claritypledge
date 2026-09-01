---
status: in-progress
type: task
rank: 1000065
workstream: infrastructure
created_date: '2026-09-01'
tags: [observability, csp, analytics, dependencies]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1216: Remove LogRocket entirely

## Problem

**Situation:** Three session recorders run in production. LogRocket (`src/main.tsx:17`), Mixpanel
Session Replay (`index.html:95`, `record_sessions_percent: 100`), and Sentry replay-on-error
(`src/main.tsx`, `replaysOnErrorSampleRate: 1.0`, masked).

**Complication:** LogRocket is wired as `LogRocket.init()` and nothing else — verified by
`grep -rn "LogRocket\." src/ e2e/ api/`, which returns exactly one line. No `identify()`, no
custom events, no Sentry `sessionURL` linkage. It produces anonymous replays nothing reads. Its
cost is not the 794KB: the vendor rotates its bundle host across ~12 CDN families to evade
ad-blockers, which is the sole reason 12 hosts sit in three CSP directives, a canary asserts
directive parity, and a 6-hour cron watches for vendor-initiated breakage. That lineage has
produced four incidents (P805, P863, P865, P869). It is currently over quota and self-disabled
in production, so the removal is already running live.

**Question:** Remove it, or keep paying the host-rotation tax for a third recorder?

> Founder framing, verbatim: "I wonder if we should disable completely lock rocket because we
> have mixed panel."

## Appetite

Blast radius: medium — touches the CSP header, which has broken production three times in this
exact area. Reversibility: high (git revert; no data migration, no schema). Decision density:
zero — the replacement is already recording and was verified this session.

## Invariants

- `script-src` and `worker-src` MUST retain `'wasm-unsafe-eval'`. This is not a LogRocket
  concern despite living in a file named for it: without the keyword, `script-src` blocks ALL
  WebAssembly site-wide and HEIC photo uploads (heic2any) break. Incident P869; ruling
  decisions.md 2026-06-01.
- Every external-origin capability keeps its governing directive declared explicitly and locked
  by a canary. Removing LogRocket's hosts must not remove or thin a directive Mixpanel or Sentry
  still depends on — directive fallback to `default-src 'self'` is a silent production-only
  block. Third instance of this class already recorded (P805, P863, P906); ruling decisions.md
  2026-06-13.
- `e2e/csp-smoke.spec.ts` must keep importing routes and the stabilization poll from
  `e2e/helpers/prod-health.ts`. P866 deliberately unified these as "one source of truth, not two
  drifting copies"; re-scoping must not fork them.

## Solution

Delete the LogRocket integration and the infrastructure that exists only to serve its host
rotation, leaving every guard that serves another purpose intact.

1. **Code** — drop the import and deferred `init()` from `src/main.tsx`, the `logrocket` dep from
   `package.json`, and its `manualChunks` entry in `vite.config.ts:83`.
2. **CSP** (`vercel.json`) — remove the 12 LogRocket hosts from `script-src` and `worker-src` and
   the 13 wildcard origins from `connect-src`. Touch nothing else in the header.
3. **Canary** (`src/tests/p865-csp-logrocket-hosts.test.ts`) — **do not delete.** Four of its five
   tests guard non-LogRocket invariants (enforcing-CSP presence, reporting directive,
   `'wasm-unsafe-eval'`, non-LogRocket allowlist preservation). Remove only the LogRocket
   host-pool assertion and rename the file to reflect what remains.
4. **Smoke gate** — keep `e2e/csp-smoke.spec.ts` and the 6-hour cron. Mixpanel and Sentry are also
   CDN-hosted and can also break without a commit from us; the gate's value never depended on
   LogRocket. Remove only LogRocket-specific expectations.
5. **Privacy policy** — update the LogRocket mention in `src/app/pages/privacy-policy-page.tsx`.

Closes the decision left open at decisions.md 2026-03-19 [technical], "Performance — defer analytics, lazy-import all pages, self-host fonts" — *"Remove LogRocket entirely — deferred for
now, decision pending on whether Sentry alone suffices."* The answer is stronger than the question
assumed: Mixpanel replay landed since, and covers more than LogRocket did.

## Alternatives Considered

- **Keep LogRocket, upgrade the plan.** Rejected: it would buy back anonymous replays that no code
  reads, on top of two recorders that already cover the ground, and would re-arm the host-rotation
  breakage class.
- **Keep the dep, gate init behind a flag.** Rejected: the CSP hosts and the canary would have to
  stay for a disabled vendor, which is the entire carrying cost with none of the benefit.
- **Self-host / proxy LogRocket through our own domain.** Already considered and deferred at P865
  ("larger infra for a vendor we already trust"); moot once the vendor is gone.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Mixpanel replay silently stops and we have no anonymous-session fallback | ACCEPT | Verified working this session (15 replays for one user over 7 days, with masked text, dead-click detection, in-replay console errors, and funnel events on the same timeline). Sentry still covers error sessions independently. |
| CSP edit thins a directive Mixpanel or Sentry needs | MITIGATE | Canary asserts non-LogRocket allowlist preservation; csp-smoke loads the deployed page. Both retained on purpose. |
| Deleting the p865 canary would drop the `'wasm-unsafe-eval'` guard and re-break HEIC uploads | MITIGATE | Explicitly out of scope — file is kept and trimmed, not deleted. See Invariants. |
| Losing LogRocket's distinct replay UI as a cross-check | ACCEPT | It had no `identify()`, so its replays were never joinable to a user or a funnel step. |

**Non-Goals**
- Do NOT change Mixpanel or Sentry configuration — no sampling changes, no new integrations.
- Do NOT delete `e2e/csp-smoke.spec.ts`, `.github/workflows/csp-smoke.yml`, or `api/csp-report.ts`.
- Do NOT delete `src/tests/p865-csp-logrocket-hosts.test.ts`.
- Do NOT chase the `getOrganizationBySlug` error found while verifying replays — separate bug.
- Do NOT refactor adjacent observability code.

## Done-When

- [x] No live LogRocket integration remains in `src/`, `vercel.json`, `package.json`, `vite.config.ts`
      — **criterion amended during `/dev`.** As originally written ("grep returns no hits") this was
      unsatisfiable without deleting comments that explain the P805/P863/P865/P869 incidents, which
      are the reason the surviving canaries exist. Historical references in comments are intended
      and were kept; the check is that no import, dependency, CSP host or init call remains.
- [x] `npm run build` succeeds and the built bundle contains no LogRocket code
      — verified against `dist/assets/*.js` with a positive control (`mxpnl` present) proving the
      grep was not blind
- [x] The p865 canary still passes and still asserts `'wasm-unsafe-eval'` on both `script-src` and
      `worker-src` — and its failure paths were exercised (re-added host / removed wasm keyword /
      broken worker-src parity all produce exit 1)
- [x] Privacy policy no longer names LogRocket, **and session replay is still disclosed** (see below)
- [ ] `[post-deploy]` `npm run smoke:csp` against the deployed site reports zero CSP violations
- [ ] `[post-deploy]` A HEIC photo upload succeeds (the guard the canary exists for)
- [ ] `[post-deploy]` A Mixpanel replay recorded after the deploy plays back with events attached

## Implementation Notes (`/dev`)

**The spec named one canary; there were four.** LogRocket CSP hosts were asserted in
`p805-csp-connect-src-gcs`, `p863-reproduce`, `p865-csp-logrocket-hosts` and (via the console
allowlist) `p866-prod-health-redaction`. Only the first was found by grep at spec time — the other
three surfaced by running the suite. Each carried the host inside a *"these entries must be
preserved"* list, where it read as a prior-fix regression guard rather than a vendor reference.
Editing tests is normally forbidden; this is the narrow case where the requirement changed by
decision rather than the implementation being wrong, so it is called out here rather than left in
a diff. Every non-LogRocket entry in every list is untouched.

**`p866` got a different fix.** Its assertion exercised `isAllowlisted()` using whatever sat in the
production allowlist, with the LogRocket entry as the fixture — coupling a test of the *mechanism*
to the *contents* of a curated list. It now uses an explicit synthetic allowlist, plus a new
assertion that an empty allowlist allows nothing (the fail-by-default inversion P866 exists to
prevent, now covered at the boundary the removal created).

**Two dead artifacts removed rather than left green.** The `p553` assertion "LogRocket is not
initialized before first paint" would have passed vacuously forever once `window.LogRocket` stopped
existing, and the `PROD_HEALTH_ALLOWLIST` console entries (`'LR-SDK'`, `'LogRocket'`) allow-listed
nothing reachable — while `'LogRocket'` is a broad substring that would have suppressed any future
console error containing the word.

**Privacy policy — the removal had a consequence the spec understated.** The LogRocket entries were
doing double duty as the site's *session-replay disclosure*. Mixpanel was disclosed only as product
analytics ("tracks events like page views, feature interactions, and user journeys") while recording
100% of sessions. Deleting the LogRocket lines would have left the recording undisclosed — strictly
worse than before. Session replay is now attributed to Mixpanel in all four places (legal basis,
sub-processor list, SCC transfer list, retention).

**[FOUNDER DECISION: Mixpanel session-replay retention period.]** The old text stated LogRocket
retained replays for 30 days. Mixpanel's replay retention is plan-dependent and was NOT verified,
so no number was invented — the retention entry now reads "Retained per Mixpanel's data retention
policy." If a specific figure should appear on a public privacy page, confirm it with Mixpanel and
replace that line.

## Related

- decisions.md 2026-03-19 [technical], "Performance — defer analytics, lazy-import all pages, self-host fonts" (P553) — the deferred decision this closes
- P865 / P863 / P805 / P869 — the CSP incident lineage LogRocket's host rotation created
- P866 — the prod-health substrate `csp-smoke` shares
