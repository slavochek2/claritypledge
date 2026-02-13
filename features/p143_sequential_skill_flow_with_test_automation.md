---
status: week
type: task
rank: 13
workstream: foundation
tags: [development-process, skills, testing, automation]
---

# P143: Sequential Skill Flow with Test Automation

## Problem Statement

**Current development workflow has fundamental issues:**

1. **Skill duplication:** `/create-prd` generates business + technical + UX + test requirements, then `/prep-spec` re-reviews UX + technical, duplicating work
2. **Parallel agents without dependencies:** `/prep-spec` runs UX + Architect + Security agents in parallel, but architecture can't be designed without UX approved, UX can't be designed without business requirements clear
3. **No review gates:** User can't approve business requirements before moving to UX, can't approve UX before moving to technical
4. **Manual testing loop:** Agent implements feature, user manually tests 20+ times, finds bugs, agent fixes, repeat—wastes 10+ hours per week
5. **Tests not enforced:** `/dev` doesn't read or run tests, doesn't iterate until tests pass
6. **No test automation:** E2E tests exist but aren't generated from specs, aren't run during development

**Impact:**
- Wasted time: 20 min manual testing per feature × 30 features = 10+ hours
- Rework: User finds bugs after implementation (should be caught by tests)
- Unclear process: User doesn't know when to run which skill
- Quality issues: "Fix breaks something else" pattern because no automated regression tests

## Intention (Why This Matters)

**Current trajectory is unsustainable:**
- Research (Feb 6-10) showed "ad-hoc fixes break something else" happened 5 times in 2 weeks
- P140 bug (undefined variable) would have been caught by `tsc --noEmit` in pre-commit (now fixed)
- P135, P137 required 20+ manual clicks to test, found bugs late in cycle
- User is "in the loop" for every feature—can't scale, can't ship fast

**Why now:**
- We need to finish current milestone (stories + points + verification + events)
- Can't finish if every feature requires 20+ manual test cycles
- Process improvements have 10x ROI (5-7 hours investment → save 100+ hours)

**Strategic importance:**
- Enables shipping 3x faster (less manual testing)
- Enables higher quality (automated regression detection)
- Enables scaling (agent tests itself, not user)

## Business Requirements

What the new process MUST achieve:

1. **Eliminate skill duplication**
   - Each skill does ONE thing (no overlapping work)
   - Business requirements separate from technical design
   - UX design separate from architecture

2. **Sequential flow with review gates**
   - User reviews business requirements before UX design starts
   - User reviews UX design before architecture starts
   - User reviews architecture before test generation
   - No parallel work where dependencies exist

3. **Automated test generation**
   - E2E test stubs generated from spec
   - UAT scenarios generated from acceptance criteria
   - Smoke tests generated for every feature
   - Tests are runnable files, not manual checklists

4. **Test-driven development enforcement**
   - `/dev` must read tests before implementing
   - `/dev` must run tests after implementing
   - `/dev` must iterate until ALL tests pass
   - `/dev` only commits if tests pass

5. **Reduce manual testing from 20 min → 5 min per feature**
   - Agent tests functionality automatically
   - User only validates UX/design (not functionality)
   - Regression tests catch "fix breaks something else" pattern

## User Stories

**As a developer implementing features:**
- I want clear separation between business/UX/technical layers, so I can approve each before moving to next
- I want agent to generate tests automatically from my spec, so I don't write test files manually
- I want agent to test its own work and iterate until tests pass, so I'm not clicking 20+ times per feature
- I want to only validate UX (visual, feel), not functionality (buttons work, data persists), so I focus on user experience

**As a developer fixing bugs:**
- I want automated regression tests to catch "fix breaks something else," so I don't create new bugs while fixing old ones
- I want smoke tests to catch simple issues (page doesn't load, console errors), so I don't deploy broken code

**As a developer maintaining the codebase:**
- I want documented development process, so I know which skill to run when
- I want clear skill responsibilities (what each does), so I don't duplicate work or skip steps

## Jobs to Be Done

**When implementing a feature:**
- I want confidence it works without manual testing, so I can ship faster
- I want to know each layer is approved before building the next, so I don't rework technical design because business requirements changed

**When fixing bugs:**
- I want automated tests to verify the fix, so I know I didn't break something else
- I want regression tests to catch similar bugs in the future, so we don't repeat mistakes

**When maintaining quality:**
- I want a systematic process, so quality doesn't depend on remembering manual steps
- I want tests to prevent regressions, so "fix breaks something else" pattern stops

## Outcomes (Success Metrics)

**Time savings:**
- Manual testing time: 20 min → 5 min per feature (75% reduction)
- Time to ship feature: Current baseline TBD → Target 50% reduction
- Bug discovery time: Post-implementation → During implementation (shift left)

**Quality improvements:**
- "Fix breaks something else" incidents: Current ~2-3/week → Target 0/week
- Tests passing before commit: Current ~60% → Target 100%
- Regression test coverage: Current <20% → Target >80%

**Process clarity:**
- Skills with clear responsibilities: Current ambiguous → Target 100% documented
- Review gates enforced: Current optional → Target mandatory
- Duplication eliminated: Current 40% overlap → Target 0%

## Acceptance Criteria

**Skill changes:**
- [ ] `/create-prd` slimmed to business layer only (no technical/UX/tests)
- [ ] `/ux` skill created (UX design layer)
- [ ] `/architect` skill created (technical + security layer)
- [ ] `/generate-tests` enhanced (creates runnable E2E test files, not just checklists)
- [ ] `/dev` enhanced (reads tests, implements, runs tests, iterates until pass)
- [ ] `/prep-spec` deprecated (marked in docs, kept for backward compatibility)

**Process documentation:**
- [ ] `docs/development-process.md` created documenting new flow
- [ ] Sequential flow documented: create-prd → ux → architect → generate-tests → dev
- [ ] Review gates documented: when to approve, what to check
- [ ] Examples included: real feature walkthrough

**Testing verification:**
- [ ] One real feature tested with new flow (end-to-end)
- [ ] Agent generates tests automatically (UAT + E2E stubs + smoke)
- [ ] Agent runs tests and iterates until pass (no manual testing needed)
- [ ] User validates UX only (not functionality)

**Backward compatibility:**
- [ ] Old skills still work (don't break existing workflow during transition)
- [ ] Migration path documented (how to transition existing features)
- [ ] `/quick-feature` unchanged (different use case, keep as-is)

---

## Current Process (What Exists Today)

### Flow
```
/create-prd → /prep-spec → /dev → manual testing
```

### Skills Involved

**1. `/create-prd` (comprehensive PRD generator)**
- Generates: Business + Technical + UX + Verification requirements
- Issues: Does too much, duplicates prep-spec work
- Output: PRD with all layers mixed together

**2. `/prep-spec` (3-agent review)**
- Spawns: UX agent + Architect agent + Alignment agent (parallel)
- Reviews: UX + Technical (duplicates create-prd output)
- Offers: "Want me to run /generate-uat?" (optional, can be skipped)
- Issues:
  - Runs agents in parallel (but Architect needs UX to be designed first)
  - User can't review business before UX starts
  - Duplicates create-prd work

**3. `/generate-uat` (test checklist generator)**
- Generates: `features/uat/pN.md` (manual checklist with Given/When/Then)
- Issues: Creates manual checklist, not runnable test files
- Optional: User must accept in prep-spec

**4. `/dev` (implementation)**
- Implements: Feature based on spec
- Issues:
  - Doesn't read UAT file
  - Doesn't read E2E test stubs
  - Doesn't run tests
  - Doesn't iterate until tests pass
  - User must manually test

### Problems with Current Process

| Problem | Impact |
|---------|--------|
| **create-prd generates technical details** | Duplicates prep-spec Architect agent work |
| **prep-spec runs agents in parallel** | Can't approve business before UX, UX before technical |
| **No review gates** | Can't stop after each layer to approve |
| **generate-uat creates manual checklist** | Can't be run automatically |
| **dev doesn't read/run tests** | User manually tests 20+ times |
| **No test iteration** | Bugs found after implementation, not during |

---

## New Process (What We're Building)

### Flow
```
/create-prd → [GATE: Review business] → /ux → [GATE: Review UX] → /architect → [GATE: Review technical] → /generate-tests → /dev
```

### Sequential Layers with Review Gates

**Layer 1: Business Requirements** (`/create-prd`)
- Problem statement
- Intention (why this matters)
- Business requirements
- User stories
- Jobs to be done
- Outcomes
- Acceptance criteria
- **NO technical details, NO UX design, NO tests**

**[GATE: User reviews business requirements, approves or requests changes]**

**Layer 2: UX Design** (`/ux`) - **IF UI feature**
- User flows
- Screen designs
- Interactions, edge cases
- Accessibility requirements
- Uses user stories as input

**[GATE: User reviews UX design, approves or requests changes]**

**Layer 3: Technical Architecture** (`/architect`)
- Technical analysis (current code state)
- Architecture decisions
- Security review (RLS, auth, validation)
- Implementation approach
- Files to change
- Uses business + UX as input

**[GATE: User reviews architecture, approves or requests changes]**

**Layer 4: Test Generation** (`/generate-tests`)
- Generates UAT scenarios (from acceptance criteria)
- Generates E2E test file stubs (runnable)
- Generates smoke tests (page loads, no errors)
- Uses business + UX + technical as input
- **No user review needed** (automated from approved layers)

**Layer 5: Implementation** (`/dev`)
- Reads: Business + UX + Technical + Tests
- Implements: Feature + test files (fills in stubs)
- Runs: All tests (UAT verification, E2E, unit, smoke)
- Iterates: Until ALL tests pass
- Commits: Only if tests pass
- Reports: Progress ("Running tests: 7/10 passing, fixing...")

---

## Implementation Plan

### Phase 1: Slim create-prd (2 hours)

**File:** `.claude/commands/slava/build/create-prd.md`

**Changes:**
- Remove: Technical analysis section
- Remove: Technical requirements section
- Remove: UX requirements section
- Remove: Verification requirements section
- Remove: E2E test templates
- Keep: Business requirements, user stories, JTBD, outcomes, acceptance criteria
- Enhance: Make user stories atomic and testable
- Enhance: Add explicit jobs-to-be-done extraction

**Agent:** general-purpose

### Phase 2: Create /ux skill (1 hour)

**File:** `.claude/commands/slava/build/ux.md` (NEW)

**Creates:**
- New skill file
- Spawns UX agent (extracted from prep-spec)
- Reads: Business requirements from spec
- Generates: UX section in spec (flows, screens, interactions, edge cases, accessibility)
- Updates: Spec file with UX layer

**Agent:** general-purpose

### Phase 3: Create /architect skill (1.5 hours)

**File:** `.claude/commands/slava/build/architect.md` (NEW)

**Creates:**
- New skill file
- Spawns: Architect agent + Security agent (parallel)
- Reads: Business + UX from spec
- Generates:
  - Technical analysis (current code)
  - Architecture decisions
  - Security review (RLS, auth, validation)
  - Implementation approach
  - Files to change
- Updates: Spec file with Technical layer

**Agent:** general-purpose

### Phase 4: Enhance generate-tests (2 hours)

**File:** `.claude/commands/slava/build/generate-uat/SKILL.md`

**Changes:**
- Keep: Generating `features/uat/pN.md` (manual checklist)
- Add: Generate `e2e/pN-feature.spec.ts` (E2E test file with TODO stubs)
- Add: Generate `e2e/pN-smoke.spec.ts` (smoke tests: page loads, no errors)
- Enhance: Extract test scenarios from acceptance criteria (not just success criteria)

**Agent:** general-purpose

### Phase 5: Enhance /dev (2 hours)

**File:** `.claude/commands/slava/build/dev.md`

**Changes:**
- Add: Read UAT file (features/uat/pN.md)
- Add: Read E2E test stubs (e2e/pN-*.spec.ts)
- Add: Implement test files (fill in TODO stubs)
- Add: Run tests (npm test && npm run test:e2e)
- Add: Iterate loop (run → fix → run → fix until all tests pass)
- Add: Progress reporting ("Tests: 7/10 passing, fixing X...")
- Add: Only commit if ALL tests pass
- Enhance: Report test results to user

**Agent:** general-purpose

### Phase 6: Deprecate prep-spec (30 min)

**File:** `.claude/commands/slava/build/prep-spec/SKILL.md`

**Changes:**
- Add deprecation notice at top
- Add: "This skill is deprecated. Use: /create-prd → /ux → /architect → /generate-tests → /dev"
- Keep: Skill functional for backward compatibility
- Update: Related skills section to point to new flow

**Agent:** general-purpose

### Phase 7: Document new process (1 hour)

**File:** `docs/development-process.md` (NEW)

**Creates:**
- Process overview (5 layers, review gates)
- When to use each skill
- Review gate checklist (what to approve at each stage)
- Examples: Real feature walkthrough
- FAQ: Common questions
- Comparison: Old vs new flow

**Agent:** general-purpose

---

## Parallel Execution Strategy

**All skill changes can be done IN PARALLEL:**
- Agent 1: Slim create-prd (2 hours)
- Agent 2: Create ux skill (1 hour)
- Agent 3: Create architect skill (1.5 hours)
- Agent 4: Enhance generate-tests (2 hours)
- Agent 5: Enhance dev (2 hours)
- Agent 6: Deprecate prep-spec (30 min)
- Agent 7: Document process (1 hour)

**Total real-time: ~2 hours** (longest agent runs 2 hours, all run in parallel)

---

## Testing Plan

### Validation Approach

**After all skills updated:**

1. **Test with real feature** (e.g., P135 Event Waiting Room or new small feature)
2. **Run new flow:**
   ```bash
   /create-prd "Test feature for new flow"
   # Review business requirements, approve
   /ux features/p144_test_feature.md
   # Review UX, approve
   /architect features/p144_test_feature.md
   # Review technical, approve
   /generate-tests features/p144_test_feature.md
   # Auto-generated, no review
   /dev features/p144_test_feature.md
   # Agent implements, tests, iterates until pass
   ```

3. **Verify:**
   - [ ] Each skill generates only its layer (no duplication)
   - [ ] Review gates work (can approve/reject at each stage)
   - [ ] Tests generated automatically (UAT + E2E stubs + smoke)
   - [ ] Agent runs tests and iterates (visible progress)
   - [ ] Agent commits only if all tests pass
   - [ ] User only validated UX (not functionality)

4. **Measure:**
   - Time to complete feature (compare to baseline)
   - Manual testing clicks (should be <5 min, not 20 min)
   - Tests passing before commit (should be 100%)

---

## Migration Path

**For existing features (in-progress):**
- Continue with old flow (don't break current work)
- Document: "Features started before P143 can use old flow"

**For new features (after P143 ships):**
- Use new flow: create-prd → ux → architect → generate-tests → dev
- Document: "All new features after 2026-02-13 use new flow"

**For /quick-feature:**
- No changes (different use case: quick skeleton)
- Still used for quick idea capture

**Backward compatibility:**
- Old skills still work (prep-spec, old create-prd)
- Marked deprecated in docs
- Will be removed in future milestone (TBD)

---

## Documentation Locations

**Where to document this change:**

1. **`docs/development-process.md`** (NEW)
   - Full process documentation
   - When to use each skill
   - Review gates
   - Examples

2. **`docs/technical/feature-specs.md`** (UPDATE)
   - Add: "Development workflow" section
   - Link to development-process.md

3. **`CLAUDE.md`** (UPDATE - minimal)
   - Reference development-process.md
   - Don't duplicate (link only)

4. **Skill files** (UPDATE)
   - Each skill references its place in flow
   - Links to development-process.md

---

## Success Criteria (Rollout)

**Week 1: Implementation**
- [ ] All 7 agents complete skill changes
- [ ] Process documentation written
- [ ] Self-review: Flow makes sense end-to-end

**Week 2: Validation**
- [ ] Test with one real feature (full flow)
- [ ] Measure: Time, manual testing, test coverage
- [ ] Adjust: Fix issues found during testing

**Week 3: Rollout**
- [ ] Use new flow for all new features
- [ ] Measure: Reduction in manual testing time
- [ ] Measure: "Fix breaks something else" incidents (should be 0)

**Success metrics after 2 weeks:**
- Manual testing time: <5 min per feature (vs 20 min baseline)
- Test coverage: >80% (vs <20% baseline)
- Cascading bugs: 0/week (vs 2-3/week baseline)
- User satisfaction: "I only validate UX, not functionality" ✅

---

## Notes

**Why this matters long-term:**
- Scales: Agent tests itself, not user
- Quality: Automated regression detection
- Speed: Ship 3x faster with less manual work
- Learning: Tests document expected behavior

**Risks:**
- Adoption friction: User must learn new flow (mitigated: documentation + examples)
- Test maintenance: E2E tests need updates when UI changes (mitigated: tests are stubs, easy to update)
- Over-testing: Too many tests slow down development (mitigated: smoke tests are fast, E2E are specific)

**Related work:**
- P138: E2E Test Infrastructure (auth testing fix) - not blocking, but helpful
- Research findings (Feb 11): Process breakdown analysis
- Pre-commit checks: Already have `tsc --noEmit` (catches type errors)
