---
status: done
type: task
rank: 270.0
workstream: foundation
tags: [testing, process, migrations, integration-tests]
delivery_stage: arch-review
completed_at: 2026-02-18
---

# P270: Integration Test Coverage for DB Migrations

## Problem

P160 shipped to production with a missing or unapplied database migration (`is_private` column on `clarity_sessions`). The runtime error — **"Could not find the 'is_private' column of 'clarity_sessions' in the schema cache"** — was not caught by any automated test.

**Root cause (two-layer failure):**

1. **No integration test layer:** All 44 automated tests for P160 (unit + E2E + smoke + a11y) mocked or bypassed database calls. Not one test created a real session or verified the column existed.
2. **UAT never executed:** The UAT scorecard had 22 scenarios (including 3 DB schema checks), all marked ⬜. P160 was closed without UAT running.

## Goal

Make it structurally impossible to ship a feature with a missing DB migration without a test failing first.

## Business Requirements

1. Any feature that adds a database migration must produce at least one automated test that touches the real test database.
2. The UAT scorecard must not be fully ⬜ when a feature moves to `done`.
3. The pre-commit or CI flow must catch stale/unapplied migrations before deploy.

## Acceptance Criteria

- [ ] `/generate-tests` emits an integration test file for any feature spec that mentions a migration
- [ ] That integration test does a real Supabase query against the affected table/column (not mocked)
- [ ] `pre-commit-checks.sh` has a step that warns if new migrations in `supabase/migrations/` have not been applied to the local dev DB
- [ ] `/done` skill checks UAT scorecard — warns (or blocks) if 100% of scenarios are ⬜
- [ ] Process documented in `docs/technical/testing.md` under a new "Integration Tests" section

## Scope / Out of Scope

**In scope:**
- Template for DB migration integration test (`e2e/integration/`)
- Pre-commit migration freshness check
- `/done` skill UAT gate
- Testing.md update

**Out of scope:**
- CI/CD changes (production pipeline)
- Fixing P160 bug itself (separate bug ticket)

---

## Technical Analysis

### Current Code State

**Testing infrastructure:**
- `e2e/` — 30+ Playwright spec files, no `integration/` subfolder exists yet
- `e2e/helpers/` — `test-user.ts` (user creation/cleanup), `auth-helpers.ts` (session setup), `supabase-admin.ts` (service role client)
- `src/lib/supabase-admin.ts` — service role client lives **inside application source tree** (not test-only directory), importable from production code — a pre-existing risk that P270 would amplify
- Unit tests use Vitest with full Supabase mocks — zero real DB queries across all test files
- E2E tests authenticate via `setTestSession()` but navigate UI rather than calling API layer

**Pre-commit checks (`scripts/pre-commit-checks.sh`, 292 lines):**
- 13 steps: TypeScript, lint, build, tests, secrets (gitleaks), bundle size, console.log, TODO, ts-ignore, debugger, `any` type, doc links, duplicate P-numbers + root file pollution
- No Supabase CLI invocation anywhere
- No migration awareness

**`/done` skill (`.claude/commands/slava/done/SKILL.md`):**
- Step 1: Find spec → Step 2: Update frontmatter → Step 3: Check off acceptance criteria → Step 4: Move to `features/done/` → Step 5: KDD → Step 6: Commit
- No UAT scorecard check
- No gate between "criteria checked" and "move to done"

**Migration files (`supabase/migrations/`):**
- Naming: `YYYYMMDDHHMMSS_description.sql` or `YYYYMMDD_description.sql`
- Applied via `supabase db push` (human step) or `supabase migration up`
- No automated verification that local dev DB is in sync with migration files

**`/generate-tests` skill:**
- Produces unit, E2E, smoke, a11y test templates based on spec sections
- Has "Example 3: Database Migration" pattern referencing `e2e/integration/` path
- But the integration test example in the skill is a template only — `e2e/integration/` dir does not exist, and the pattern is not consistently enforced

---

## Architecture Decisions

### Decision 1: Integration Test Location — `e2e/integration/` subfolder

**Chosen:** `e2e/integration/{feature}-migration.spec.ts`

**Rationale:** Playwright's `testDir: './e2e'` already picks up subdirectories. No config change needed. Keeps tests co-located with other E2E tests. The `e2e/integration/` path is already referenced in generate-tests skill examples — making it real closes the gap.

**Pattern:** No browser page needed. Import `supabaseAdmin` (setup/cleanup) + user-scoped client (assertions). Example shape:
```typescript
// e2e/integration/{feature}-migration.spec.ts
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createUserScopedClient } from '../helpers/test-user';

test('migration: {column} column accessible', async () => {
  // 1. Verify column exists (schema-level check)
  const { error } = await supabaseAdmin
    .from('{table}')
    .select('{column}')
    .limit(1);
  expect(error).toBeNull(); // fails if column missing

  // 2. Write via user-scoped client (verifies RLS allows the write)
  const userClient = await createUserScopedClient();
  const { error: writeError } = await userClient
    .from('{table}')
    .insert({ {column}: {value} });
  expect(writeError).toBeNull();
});
```

**Security constraint (from security review):** Schema existence check uses `supabaseAdmin` (bypasses RLS, proves column exists). RLS assertions must use a user-scoped JWT client — not service role — otherwise the test proves the column exists but not that users can access it.

**Trade-off:** Integration tests require `.env.test.local` with live test DB credentials. They will be slower than unit tests. Mitigation: separate Playwright project config (`integration`) that can be run independently.

**Alternative rejected:** A unit test that imports the migration SQL file and validates its syntax. Would not catch schema cache staleness — the exact failure mode we hit with P160.

---

### Decision 2: Pre-commit Migration Freshness Check — Warning, Not Block

**Chosen:** New Step 14 in `pre-commit-checks.sh` that detects migration files staged for commit that haven't been applied to the local dev DB. Emits a **warning** (not error, does not block).

**Detection approach:** Compare git-staged `.sql` files in `supabase/migrations/` against `supabase migration list` output. If a staged migration shows as "pending" (not applied locally), warn.

```bash
# Step 14. Migration freshness check
STAGED_MIGRATIONS=$(git diff --cached --name-only | grep '^supabase/migrations/.*\.sql$' || true)
if [ -n "$STAGED_MIGRATIONS" ]; then
  if supabase migration list --local 2>/dev/null | grep -q "pending"; then
    echo "⚠ Unapplied migrations detected — run 'supabase db push' before deploying"
    WARNINGS=$((WARNINGS + 1))
  fi
fi
```

**Rationale:** Blocking on "pending migrations" would be too aggressive — the developer may be committing the migration _before_ applying it (valid workflow). A warning surfaces the issue without blocking.

**Security constraint (from security review):** Add guard: only run if `supabase status` confirms we're targeting localhost or the known test project. If CLI is linked to production, skip the check with a note. Prevents accidentally validating migration state against prod.

**Shell injection mitigation:** Do NOT iterate migration filenames with unquoted variables or `ls`. Use `git diff --cached --name-only` (safe) piped with `grep` (safe).

**Trade-off:** Requires Supabase CLI to be installed and `supabase start` to be running locally. If not, the check is skipped with a warning. This is acceptable — local DB is already required for `npm test`.

**Alternative rejected:** `supabase db diff` — generates a SQL diff, slower, more complex to parse, and may produce false positives from schema decorators not in migrations.

---

### Decision 3: `/done` UAT Gate — Warn, Don't Block

**Chosen:** New check inserted between Step 3 (check off acceptance criteria) and Step 4 (move to done/) in `/done` SKILL.md. Reads `features/uat/pN.md` and counts ⬜ vs ✅. If file exists and **all** scenarios are ⬜, agent asks: "UAT scorecard is 100% untested. Proceed anyway? (yes/no)"

**Rationale:** Blocking would be too strict — some tasks (pure refactors, tooling tasks) legitimately have no UAT. Warn-and-ask puts human judgement in the loop. The key catch: P160 had 22 UAT scenarios and all were ⬜ — that should require explicit override, not silent proceed.

**Detection:** `grep -c "⬜" features/uat/pN.md` vs `grep -c "✅"`. If ✅ count is 0 and ⬜ count > 0 → trigger warning.

**Trade-off:** Relies on the UAT file existing. If no UAT file exists, skip check (some features won't have one). Does not enforce _partial_ execution — 1 ✅ out of 22 passes the gate. That's intentional; perfect should not be the enemy of good.

**Alternative rejected:** Hard block. Would break the `/done` flow for legitimate tasks without UAT. Adding an `uat: skip` frontmatter override would create a habit of bypassing the gate.

---

## Security Review

**RLS / Auth in Integration Tests:**
- ✅ Service role key in `.env.test.local` is gitignored — safe on disk
- ⚠️ **Integration test assertions must use user-scoped JWT client, not service role.** Schema existence check with `supabaseAdmin` is correct; RLS validation must use a real user session. Update the template and generate-tests skill example accordingly.
- ⚠️ `src/lib/supabase-admin.ts` lives in application source tree, importable from production code. Consider adding ESLint `no-restricted-imports` rule, or moving it to `e2e/helpers/`. Not in P270 scope but worth tracking.
- ⚠️ No environment guard prevents integration tests from pointing at production if `.env.test.local` is absent and `.env.local` has prod URL. Playwright config loads `.env.test.local` explicitly — this is mostly safe, but the pre-commit check should assert local CLI target.

**Pre-commit Script:**
- ✅ Gitleaks runs before migration check (step 5 vs step 14) — migration check itself cannot leak secrets
- ⚠️ Pre-commit step must verify `supabase status` targets localhost before running `supabase migration list` to avoid validating against production
- ✅ Shell injection risk mitigated by using `git diff --cached --name-only | grep` pattern (quoted) rather than iterating filenames

**UAT Gate:**
- ✅ Agent reads markdown files via Read tool — no `eval`, no shell execution, no injection surface
- ✅ No credentials in UAT files, check is purely textual

**Data Protection:**
- ✅ Integration test users must use `e2e-test-{timestamp}@` email prefix (existing convention), not `test-@` (which `cleanupAllTestUsers` targets broadly)
- ⚠️ Verify `.env.test.local` has never been committed: `git log --all --full-history -- .env.test.local` (pre-existing concern, not introduced by P270)

---

## Implementation Approach

### Files to Create

1. `e2e/integration/` — new directory
2. `e2e/integration/migration-template.spec.ts` — reference template (used by `/generate-tests`)

### Files to Modify

1. `scripts/pre-commit-checks.sh` — add Step 14: migration freshness check
2. `.claude/commands/slava/done/SKILL.md` — insert UAT gate between Step 3 and Step 4
3. `.claude/commands/slava/build/generate-tests.md` — update "Database Migration" example to use two-client pattern (admin for schema check, user-scoped for RLS assertions) and mandate `e2e/integration/` output
4. `docs/technical/testing.md` — new "Integration Tests" section: when to write them, file location, two-client pattern, security constraints

### Build Sequence

1. Create `e2e/integration/migration-template.spec.ts` (the actual pattern, serves as reference)
2. Update `pre-commit-checks.sh` Step 14 (migration freshness check)
3. Update `/done` SKILL.md (UAT gate)
4. Update `/generate-tests` skill (mandate integration test for migration features)
5. Update `docs/technical/testing.md` (document the integration test layer)
6. Update `features/p270_integration-test-coverage-for-db-migrations.md` delivery_stage → `arch-review`

**No database migrations needed.**
