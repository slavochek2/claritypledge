---
status: backlog
type: task
rank: 58
created_date: '2026-04-24'
tags: [cleanup, dead-code, refactor, knip]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P803: Dead Code Sweep (knip-guided)

## Problem

Dead code accumulates silently between feature cycles. `selectedPointId` and its associated point-picker UI are known dead (the picker was removed in earlier work) but the state variable and types were not cleaned up at the time. No tool has been run to find the full extent of unused exports, orphaned files, or unused dependencies.

The gap: each feature's cleanup is deferred ("do it later"), but "later" has no trigger. The result is gradual namespace pollution that makes codebase navigation harder and tree-shaking less effective.

## Appetite

Low blast radius — pure deletion, no logic changes. Reversible (git revert on any batch). Zero decision density — the tool output drives scope, not founder judgment.

## Solution

1. Run `knip` (preferred; detects unused exports, files, and deps in one pass) or `ts-prune` against the repo.
2. Review findings conservatively. Flag false positives: dynamic imports, Next.js route files, test helpers, config-referenced exports, public API surface.
3. Remove confirmed dead code in small batches by category:
   - Batch A: unused state / props (start here — `selectedPointId` is the confirmed first target)
   - Batch B: unused exports in shared modules
   - Batch C: orphaned files
   - Batch D: unused `package.json` dependencies
4. Gate each batch: `npm run typecheck` + E2E tests pass + manual smoke of letter → /live → results flow.

**Known first target:** `selectedPointId` in `src/app/types/index.ts`, `live-mode-view.tsx`, and `clarity-live-page.tsx` — the dead point-picker state that triggered this spec.

## Risks / Non-Goals

### Risks
- **False-positive removal of dynamically-imported code.** Next.js uses file-based routing and dynamic `import()` patterns that static analysis can miss. Mitigation: treat any file under `src/app/` that maps to a route as intentional; run E2E after each batch.
- **Config-referenced exports.** Tailwind, Supabase, and test configs import symbols that appear unused to knip. Mitigation: review each finding against the call graph before deleting.

### Non-Goals
- Do NOT refactor, rename, or restructure anything — pure deletion only
- Do NOT change component interfaces or extract shared logic
- Do NOT address code style, formatting, or linting warnings unrelated to dead code
- Do NOT remove code that is merely "unused today" but is part of a spec in-progress (check `features/` before deleting)

### Alternatives Considered
- **Per-feature cleanup at ship time:** already the policy but not enforced; this spec exists because it failed for `selectedPointId`. A dedicated sweep catches accumulated drift.
- **`ts-prune` only:** narrower than `knip` (exports only, no file/dep analysis). Use as fallback if `knip` config is too noisy.

## Done-When

- [ ] `knip` (or equivalent) reports zero findings OR all remaining findings are documented as intentional with inline comments or a `knip.json` ignore entry
- [ ] `selectedPointId` and dead point-picker UI code removed from types, components, and pages
- [ ] `npm run typecheck` passes after all batches
- [ ] E2E test suite passes after all batches
- [ ] Manual smoke of letter → /live → results flow shows no regression
