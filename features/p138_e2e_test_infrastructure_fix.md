---
status: in-progress
type: task
workstream: C1
created: 2026-02-09T00:00:00.000Z
prepped_date: null
reviews:
  ux: null
  architect: null
  alignment: null
rank: 125000
---

# P138: Fix E2E Test Infrastructure - Enable Agent Self-Verification

## Problem

**Agents cannot verify authenticated features, forcing manual testing of everything.**

Current workflow:
1. Agent builds feature
2. Agent says "implementation complete ✅"
3. User manually tests → discovers it's broken
4. User reports bugs
5. Agent fixes blindly (can't test)
6. Repeat 20+ times per feature

**User is stuck as the verification layer for all authenticated flows.**

---

## How We Know This is a Problem

### Evidence from Recent Work (Feb 9, 2026)

**P135 (Event Waiting Room):**
- Marked "implementation complete ✅"
- Core button completely broken (chunk loading error)
- Agent couldn't verify because can't test authenticated navigation
- User discovered by clicking manually

**P137 (Position Persistence):**
- E2E test written but fails
- 4 separate RLS issues discovered through manual testing
- Agent added 3 RLS bypass policies in one day (band-aids)
- Test still failing after multiple fix attempts
- User clicked "20 times" to verify each iteration

**Test Infrastructure State:**
```bash
# E2E tests can't create authenticated users:
❌ RLS policies block test user creation (service_role hitting RLS)
❌ Auth helpers fail to create verified users
❌ Test data creation fails (profiles, points, positions)
❌ All position persistence tests fail (7/7)
❌ All event waiting room tests fail (7/7)
```

**Accumulated Workarounds:**
- 3 "service_role bypass" policies added (Feb 9)
- 4 ad-hoc test scripts in root directory (`test-*.mjs`)
- Manual migration execution (Supabase MCP not used)
- Git stash of unrelated work (working on multiple broken features)

**User Impact:**
> "I was 20 times clicking and don't understand why I need to do it... why am I in the fucking loop - why agents are not catching errors themselves?"

**Root Cause:** E2E test infrastructure is broken → agents can't run tests → can't self-verify → user must manually test everything.

---

## Proposed Solution

**Fix E2E test infrastructure ONCE to unblock all future feature development.**

Enable agents to:
1. Write E2E tests for authenticated flows
2. Run tests and see results
3. Catch their own errors
4. Fix and re-test automatically
5. Only mark "done" when tests pass

**User outcome:** Verify features once (when tests pass), not 20+ times during development.

---

## Technical Approach

### Layer 1: Fix Test User Creation (Core Blocker)

**Problem:** `e2e/helpers/test-user.ts` uses `supabaseAdmin` (service_role key) but still hits RLS policies.

**Current state:**
```typescript
// Fails because RLS blocks service_role INSERT on profiles
await supabaseAdmin.from('profiles').insert({
  user_id: authUser.user.id,
  slug: slug,
  display_name: displayName,
  is_verified: true  // ← RLS policy requires this, but blocks the INSERT
});
```

**Root cause:** RLS policies exist but don't properly allow service_role bypass.

**Fix:**
1. Audit all RLS policies on tables used in tests:
   - `profiles` - needs service_role INSERT/UPDATE bypass
   - `points` - needs service_role INSERT bypass
   - `point_positions` - needs service_role INSERT/UPDATE/DELETE bypass
   - `point_position_history` - needs service_role INSERT bypass (for trigger)
   - `stories` - needs service_role INSERT bypass
   - `event_attendees` - needs service_role INSERT bypass
   - `event_sub_rooms` - needs service_role INSERT bypass

2. Add proper service_role bypass policies (NOT blanket `true`, but `current_setting('role') = 'service_role'`):
```sql
CREATE POLICY "Service role bypass for test data"
  ON public.profiles FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');
```

3. Verify test user creation works:
```bash
npm run test:e2e -- e2e/test-user-creation.spec.ts
```

### Layer 2: Fix Playwright Authentication

**Problem:** Playwright tests don't maintain authentication between page navigations.

**Current approach:** Tests try to use `supabaseAdmin` but don't set up browser auth context.

**Fix:**
1. Create auth helper that:
   - Creates user via admin API
   - Gets session token
   - Injects auth cookies into Playwright context
   - Verifies auth state before tests run

2. Pattern:
```typescript
// e2e/helpers/auth.ts
export async function authenticateTestUser(page: Page, user: TestUser) {
  // Get session from Supabase
  const { data } = await supabaseAdmin.auth.admin.createUser({
    email: user.email,
    password: 'test-password',
    email_confirm: true
  });

  // Inject auth cookies into browser
  await page.context().addCookies([/* auth cookies */]);

  // Verify auth worked
  await page.goto('/');
  await expect(page.getByText(user.displayName)).toBeVisible();
}
```

### Layer 3: Fix Test Data Creation Helpers

**Problem:** Helpers for creating points, positions, stories fail due to RLS.

**Fix:**
1. Update all test helpers to handle RLS properly
2. Use service_role with proper bypass policies
3. Add error handling and helpful error messages

**Files to fix:**
- `e2e/helpers/test-user.ts` - user/profile creation
- `e2e/helpers/test-point.ts` (create if needed) - point creation
- `e2e/helpers/test-story.ts` (create if needed) - story creation
- `e2e/helpers/test-event.ts` (create if needed) - event creation

### Layer 4: Get ONE Test Passing (Proof of Concept)

**Target:** `e2e/point-position-persistence.spec.ts`

**Why this test:**
- Covers authenticated flow (login → navigate → click button → verify persistence)
- Tests core feature (positions)
- Currently failing with known issues (perfect for validation)

**Success criteria:**
```bash
npm run test:e2e -- e2e/point-position-persistence.spec.ts
# → All tests pass ✅
```

**What this proves:**
- Test infrastructure works
- Agents can run tests
- Agents can see test failures
- Pattern can be replicated for all features

### Layer 5: Document Pattern for Agents

**Create:** `docs/technical/e2e-testing-guide.md`

**Contents:**
- How to write E2E tests for authenticated flows
- How to use test helpers
- How to run tests and interpret failures
- Pattern: write test → run → fix → run → mark done
- Examples from position persistence test

**Why:** Agents need reference for "how to self-verify features"

### Layer 6: Apply to Current Broken Features

**Once infrastructure works:**

1. **P137 (position persistence):** Already has test, just needs to pass
2. **P135 (event waiting room):** Fix test selectors, get passing
3. **Future features:** Write tests FIRST, then implement until tests pass

---

## Success Metrics

### Before (Current State)
- ❌ E2E tests: 0/14 passing (all fail)
- ❌ Manual testing: 20+ clicks per feature
- ❌ Agent verification: 0% (can't test)
- ❌ RLS policies: discovered through errors
- ❌ Time to ship: weeks (debug loop)

### After (Target State)
- ✅ E2E tests: 14/14 passing (for existing features)
- ✅ Manual testing: 1 click per feature (spot check)
- ✅ Agent verification: 100% (tests pass before "done")
- ✅ RLS policies: designed upfront, tested automatically
- ✅ Time to ship: days (agent self-verifies)

### Key Indicator: User Manual Testing Clicks
- **Current:** 20+ per feature
- **Target:** 1 per feature (verify when tests pass)

---

## Implementation Tasks

### Phase 1: Fix RLS Policies ⚡ CRITICAL PATH
- [ ] Audit all RLS policies on tables used in tests
- [ ] Add service_role bypass policies (using `current_setting('role')`)
- [ ] Apply via Supabase MCP (not manual execution)
- [ ] Verify with test query: `supabaseAdmin.from('profiles').insert(testData)`

### Phase 2: Fix Test Helpers
- [ ] Fix `test-user.ts` - create verified users
- [ ] Create `test-point.ts` - create test points
- [ ] Create `test-event.ts` - create test events
- [ ] Add proper error handling and messages

### Phase 3: Fix Playwright Auth
- [ ] Create `e2e/helpers/auth.ts`
- [ ] Implement session injection into browser context
- [ ] Add auth verification before tests run
- [ ] Test: user stays logged in across page navigations

### Phase 4: Get Position Persistence Test Passing
- [ ] Run `e2e/point-position-persistence.spec.ts`
- [ ] Fix each failure until all 5 tests pass
- [ ] Document what was fixed
- [ ] Verify: can run test 10 times, passes every time

### Phase 5: Documentation
- [ ] Create `docs/technical/e2e-testing-guide.md`
- [ ] Document test helper patterns
- [ ] Document auth setup
- [ ] Add examples from working test

### Phase 6: Apply to Current Features
- [ ] P137: Use working test to verify position persistence
- [ ] P135: Fix event waiting room test, get passing
- [ ] Update feature specs to require E2E tests

---

## Dependencies

**Blocks:**
- P135 (Event Waiting Room) - can't verify without E2E tests
- P137 (Position Persistence) - test exists but can't pass
- All future authenticated features

**Required:**
- Supabase MCP (`mcp__supabase__query`) - apply migrations
- Playwright (`npm run test:e2e`) - run tests
- Test database access

---

## Agent Workflow Change

### Old Workflow (Broken)
```
1. Agent writes feature
2. Agent marks "implementation complete ✅"
3. User tests manually → finds bugs
4. Repeat
```

### New Workflow (Fixed)
```
1. Agent writes E2E test (acceptance criteria)
2. Agent implements feature
3. Agent runs E2E test
4. Test fails → agent sees error → agent fixes → run again
5. Test passes → agent marks "done"
6. User verifies once (spot check)
```

**Critical rule for agents:**
> "Feature is NOT done until E2E test passes. Run test, see failure, fix, repeat."

---

## Migration Strategy

**Apply RLS policies via Supabase MCP:**
```typescript
// Agent uses mcp__supabase__query to apply migration
// NOT: generate SQL file for user to run manually
```

**Create migration file for git history:**
```
supabase/migrations/20260209_e2e_test_rls_policies.sql
```

**Both:** Git history + immediate application via MCP

---

## Related

- **P135:** Event Waiting Room (blocked by this)
- **P137:** Position Persistence Bug (blocked by this)
- **CLAUDE.md:** Test Integrity Principle, Transparency Principle
- **docs/technical/testing.md:** E2E testing patterns

---

## Notes

**Why this is P0:**
Without working E2E tests, every feature requires 20+ manual verification clicks. This is unsustainable and blocks all development velocity.

**Time investment vs. payoff:**
- Fix time: ~2-4 hours (one time)
- Saves: 1-2 hours per feature (20+ features planned)
- ROI: 10x in first month

**User feedback:**
> "I don't want to click 20 times... why am I in the fucking loop... why agents are not catching errors themselves?"

This spec directly addresses user frustration by making agents self-sufficient.

---

**Run /kdd after:** Capture decision: "E2E test infrastructure is foundation for agent autonomy" in decisions.md
