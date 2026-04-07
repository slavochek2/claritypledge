---
status: week
type: task
rank: 1000068.0
created_date: '2026-04-06'
tags: [testing, skills, infrastructure]
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
---

# P669: /verify and /generate-tests Coverage Gaps

## Problem

**Situation:** `/verify` runs UAT scenarios using two tools — Playwright (headless, functional) and Claude in Chrome (visual QA). `/generate-tests` creates E2E test stubs and UAT scorecards from specs.

**Complication:** P660 verification exposed systematic gaps: 12 of 47 scenarios were skipped. Breakdown by root cause:

**Routing failures — Chrome can't click React Router links (5 scenarios):**
UAT-7 (browser back), UAT-10 (Edit click), UAT-17 (story management), UAT-28 (Read click), UAT-29 (Results click)

**Missing test data — no seeding for boundary conditions (6 scenarios):**
UAT-11 (0-story draft), UAT-14 (no docs), UAT-22 (public letter), UAT-23 (public respondents), UAT-24 (no sent letters), UAT-31 (no inbox)

**Multi-step sequential flow (1 scenario):**
UAT-35/36 (badge decrement after mark-as-read) — solvable by Playwright with proper flow orchestration

Split is ~50/50, justifying both fixes.

**Question:** How do we fix the skill logic so future features get full UAT coverage without manual intervention?

## Appetite

Low blast radius (two skill files only, no production code). Fully reversible (skill files are on main, `git revert` works). Low decision density — the classification rules and seeding patterns are straightforward.

## Solution

### 1. Fix `/verify` tool routing (Step 2 classification)

Current: Default is Playwright, but Chrome is used too aggressively for scenarios involving "visual" keywords or UI components.

Fix: Sharpen the routing table in `/verify` Step 2. Playwright handles anything with clicks, navigation, form fills, state assertions, or React Router links. Chrome is ONLY for:
- Pure visual appearance (spacing, colors, alignment)
- Mobile viewport screenshots
- Scenarios explicitly tagged `[visual]`

Add a decision rule: "If a scenario involves clicking a button, link, or form element → Playwright, even if it also checks visual state."

### 2. Fix `/generate-tests` edge-case seeding

Current: Generated E2E stubs use whatever test data exists. No setup/teardown for boundary conditions.

Fix: When generating stubs from acceptance criteria, detect boundary keywords (`empty`, `no items`, `zero`, `disabled`, `first time`, `new user`) and generate a `beforeAll` block that seeds the required data state using existing helpers (`createTestUser()`, `createTestStory()`, service role key inserts).

Add a "Data Seeding" section to generated test files:
```typescript
// Data seeding for edge cases
test.describe('Empty states', () => {
  let emptyUser: TestUser;
  test.beforeAll(async () => {
    emptyUser = await createTestUser({ prefix: 'empty_' });
    // No docs, no letters — tests empty state rendering
  });
  test.afterAll(async () => {
    await deleteTestUser(emptyUser.id);
  });
});
```

## Risks / Non-Goals

### Risks
- Over-routing to Playwright misses genuine visual regressions. Mitigation: Chrome visual pass (Step 4) is a separate phase — it always runs when UI files changed, regardless of Step 3 routing.
- Generated seeding code may not match all data shapes. Mitigation: seeding uses existing helpers that are already tested; novel shapes fall back to service role key inserts.

### Non-Goals
- Do NOT rewrite existing E2E test files — only change how new ones are generated
- Do NOT change `/verify` Step 4 (Chrome visual pass) — it works correctly
- Do NOT add new test helpers or infrastructure — use existing `e2e/helpers/` toolkit
- Do NOT address two-party Chrome automation — that's P668

## Alternatives Considered

- **Add a `--playwright-only` flag to `/verify`**: Rejected — skills auto-detect, no flags (user feedback).
- **Make `/generate-tests` create ALL edge-case variants**: Over-generation — most features have 2-3 edge cases, not 20. Better to detect from keywords than enumerate all possibilities.
- **Move edge-case seeding to `/dev`**: Wrong layer — `/dev` fills in test stubs, `/generate-tests` creates the structure. Seeding belongs in the structure.

## Done-When

### Routing fix
- [ ] `/verify` routes click/navigation/form scenarios to Playwright (not Chrome) — verified by re-running P660 UAT-7, UAT-10, UAT-17, UAT-28, UAT-29 (all previously skipped as "Chrome extension click limitation")
- [ ] Routing rules tested against 2+ past features (one navigation-heavy, one form-heavy) to confirm generalization beyond P660

### Seeding fix
- [ ] `/generate-tests` detects boundary keywords in acceptance criteria and generates `beforeAll` seeding blocks — verified by running on P660 spec and confirming stubs for UAT-11, UAT-14, UAT-22, UAT-24, UAT-31 include data setup
- [ ] Seeding detection verified against at least one additional spec with known boundary conditions (e.g., any feature with empty-state acceptance criteria)

### Combined
- [ ] Re-running `/verify p660` covers >= 38 of 47 scenarios (vs current 30)
- [ ] No regression in existing E2E test suite (`npm run test:e2e` passes)

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [WARN] Missing routing-vs-seeding breakdown for 12 skips | Added per-scenario classification to Problem section | Split is ~50/50 (5 routing, 6 seeding, 1 multi-step), justifying both fixes |
| 2 | /challenge-prd | [WARN] /generate-tests done-when untestable — no input spec specified | Added explicit verification specs (P660 + one additional) to Done-When | Prevents single-feature tuning |
