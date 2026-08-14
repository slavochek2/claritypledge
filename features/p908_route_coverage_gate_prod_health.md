---
status: backlog
type: task
rank: 69
created_date: '2026-06-06'
tags: [pre-commit, prod-health, csp, gates]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P908: Mechanical check — new public routes must join PROD_HEALTH_ROUTES

## Problem

**Situation:** Both deployed-prod gates (csp-smoke, prod-health-smoke) iterate a single curated list, `PROD_HEALTH_ROUTES` in `e2e/helpers/prod-health.ts`. A public route absent from that list is invisible to every live-behavior gate — and live-behavior gates are the only reliable catch for CSP/console regressions that dev never sees (P866/P869 lineage).
**Complication:** P906 proved the gap is real: `/cm` shipped with its main content CSP-blocked on prod and no gate noticed, because the route wasn't in the list. The decisions.md 2026-06-06 [technical] P906 entry establishes the rule — "a new public route joins `PROD_HEALTH_ROUTES` in the same diff that ships it" — but nothing enforces it; coverage depends on each shipping session remembering.
**Question:** How do we mechanically surface a new public route in `src/App.tsx` that is missing from `PROD_HEALTH_ROUTES`?

## Appetite

Low blast radius (a new warning section in `pre-commit-checks.sh` + possibly a unit test; no runtime code changes). Fully reversible (delete the check). Low decision density — one founder call on warn-vs-block and the shape of the intentionally-unwatched allowlist.

## Solution

A pre-commit check (pattern: the existing "ungated prototype routes" section at `scripts/pre-commit-checks.sh:410`) that fires when a staged `src/App.tsx` diff adds a `<Route path="...">` that is:

- not dev-gated (`import.meta.env.DEV` on the same line),
- not parameterized/auth-gated in an obviously non-public way,
- absent from `PROD_HEALTH_ROUTES`, and
- absent from an explicit intentionally-unwatched allowlist (e.g. `/story/*`, `/point/*` — embeddable shares that carry only `frame-ancestors` CSP by design, per the comment in `prod-health.ts`).

Warn (not hard-block) on first iteration; the message names the rule and the file to edit. Classification heuristics (what counts as "public") are the core design work — prefer a conservative matcher that warns on plain static paths and stays silent on `:param` routes, over a clever one that misclassifies.

## Risks / Non-Goals

### Risks
- **False positives erode trust in the gate** (auth-gated or intentionally unwatched routes flagged). Mitigation: warn-only first; explicit allowlist with comments; conservative matcher.
- **Route definitions move out of `App.tsx`** someday, silently disabling the check. Mitigation: the check also asserts it still finds >N routes in the file it scans — zero matches = loud failure, not silent pass.

### Non-Goals
- Do NOT auto-add routes to `PROD_HEALTH_ROUTES` — membership is a curated decision (each route added must tolerate the stabilization poll + allowlist).
- Do NOT fold the csp-smoke/prod-health gates together here (that consolidation is a deferred P866 end-state, separate concern).
- Do NOT hard-block commits in v1 — warn first, observe false-positive rate.

### Alternatives Considered
- **Unit test asserting App.tsx routes ⊆ PROD_HEALTH_ROUTES ∪ allowlist:** runs in CI too, but route extraction from JSX in a test duplicates the same parsing problem with no better tooling; pre-commit grep is where the sibling checks already live.
- **Runtime route registry exported from App.tsx:** cleaner source of truth, but touches production code for a tooling concern — higher blast radius than a check script.
- **Do nothing (decisions.md rule only):** the rule exists today; P906 showed memory-based coverage fails exactly once per forgotten route.

### Rollback Strategy
Delete the check section from `pre-commit-checks.sh` (and the unit test if added). No runtime surface.

## Done-When

- [ ] Staging an `App.tsx` diff that adds a public static route absent from `PROD_HEALTH_ROUTES` produces a pre-commit warning naming the route and the rule
- [ ] Dev-gated (`import.meta.env.DEV`), allowlisted, and `:param` routes produce no warning
- [ ] The check fails loud (not silent-pass) if it finds zero routes in the scanned file
- [ ] `/cm`, `/`, `/live`, `/feed`, `/manifesto`, `/events` produce no warning on an unrelated `App.tsx` edit (regression: current state is clean)

## References

- decisions.md 2026-06-06 [technical] P906 entry (establishes the rule this enforces)
- `e2e/helpers/prod-health.ts` — the list + the embeddable-shares exemption rationale
- `scripts/pre-commit-checks.sh:410` — sibling check pattern (ungated prototype routes)
