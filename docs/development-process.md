# Development Process

**Sequential skill flow with review gates for AI-native development.**

This document describes how features move from idea to production in the Clarity Pledge codebase.

---

## Quick Start

**New feature flow:**
```bash
/create-prd "Feature idea"           # Business layer
# [Review & approve business requirements]

/ux features/pN_feature.md           # UX layer (if UI)
# [Review & approve UX design]

/architect features/pN_feature.md    # Technical layer
# [Review & approve architecture]

/generate-tests features/pN_feature.md  # Test generation
# [Auto-generated, no review needed]

/decompose features/pN_feature.md    # Task manifest (complex features only*)
# [Review & approve task breakdown — /decompose reads Test Coverage section to add test refs to tasks]

/dev features/pN_feature.md          # Implementation
# [Agent tests itself until all pass]
```

**/decompose is optional** — only for complex features: 5+ files OR 3+ concerns OR 6+ build steps.

**Time:** ~1 hour for P1 UI feature, ~50 min for P1 backend feature (vs 2-3 hours with old process including rework cycles)

---

## Philosophy

**Principle:** Agent tests itself, user validates UX only.

**Goals:**
1. Get user out of manual testing loop (20 min → 5 min per feature)
2. Sequential flow with review gates (approve each layer before next)
3. Automated test generation (E2E stubs, smoke tests, UAT scenarios)
4. Test-driven development (agent iterates until ALL tests pass)

**Anti-goals:**
- Parallel work where dependencies exist (UX before architecture)
- Manual testing by user (agent should catch functional bugs)
- Skill duplication (each skill does ONE thing)

---

## The Five Layers

### Layer 1: Business Requirements (`/create-prd`)

**What it does:** Generates business layer only (WHY, user value, outcomes)

**Output:**
- Problem statement (current pain)
- Intention (why this matters strategically)
- Business requirements (what solution must achieve)
- User stories (atomic, testable)
- Jobs to be done (user motivations)
- Outcomes (measurable success metrics)
- Acceptance criteria (business-level, not technical)

**Does NOT include:**
- Technical implementation details
- UX design (flows, screens)
- Test templates or verification steps
- File paths or architecture decisions

**Review gate:** User reviews business requirements, approves or requests changes.

**Example:**
```bash
/create-prd "Add dark mode toggle to profile page"

# Agent generates:
# - Problem: Users complain about bright UI at night
# - Intention: Improve accessibility, reduce eye strain
# - Business requirements: Toggle visible, persists choice, works on all pages
# - User stories: As a user with light sensitivity, I want dark mode...
# - Outcomes: 30% of users enable dark mode within 1 week

# User reviews, approves
```

---

### Layer 2: UX Design (`/ux`)

**What it does:** Designs user experience (flows, screens, edge cases)

**When to use:** Only for UI features (skip for backend/infrastructure)

**Input:** Reads business requirements from spec

**Output:**
- User flows (step-by-step interactions)
- Screen designs (layouts, components)
- Edge cases (errors, loading, empty states)
- Accessibility (screen reader, keyboard, ARIA)
- Responsive design (mobile, tablet, desktop)

**Does NOT include:**
- Technical implementation
- Database schema
- API endpoints
- File paths

**Review gate:** User reviews UX design, approves or requests changes.

**Example:**
```bash
/ux features/p142_dark_mode.md

# Agent generates:
# - User flow: User clicks toggle → preference saved → UI updates
# - Edge cases: First-time user (default to system preference)
# - Accessibility: Toggle keyboard accessible, screen reader announces state
# - Responsive: Toggle visible on mobile (top-right corner)

# User reviews, approves
```

---

### Layer 3: Technical Architecture (`/architect`)

**What it does:** Designs technical architecture + security review

**Input:** Reads business + UX requirements from spec

**Output:**
- Technical analysis (current code state, what exists)
- Architecture decisions (patterns, trade-offs, rationale)
- Security review (RLS, auth, validation, data protection)
- Implementation approach (build sequence, files to change)
- Files to create/modify (concrete paths)

**Review gate:** User reviews architecture, approves or requests changes.

**Example:**
```bash
/architect features/p142_dark_mode.md

# Agent generates:
# - Technical analysis: Current theme uses Tailwind CSS classes
# - Architecture decision: Use CSS variables (easier than class swapping)
# - Security review: No auth needed (user preference only)
# - Files to modify: tailwind.config.ts, src/app/layout.tsx, src/components/ThemeToggle.tsx
# - Build sequence: 1) Add CSS variables, 2) Create toggle component, 3) Wire up persistence

# User reviews, approves
```

---

### Layer 3.5: Task Decomposition (`/decompose`) — Optional

**What it does:** Converts the architect's build sequence into a structured task manifest so /dev can dispatch one subagent per task instead of loading the full 700+ line spec.

**When to use:** Only for complex features — triggers when ANY of:
- 5+ files to create/modify
- 3+ distinct system concerns (DB, service, UI, API, tests each = 1)
- 6+ build steps in the architect's sequence

**Skip when:** Below all three thresholds — run /dev directly.

**Run order:** Run `/generate-tests` BEFORE `/decompose`. /decompose reads the `## Test Coverage Strategy` section (written by /generate-tests) to add `Tests:` lines to each task entry. If /decompose runs first, it cannot add test file references to tasks.

**Input:** Reads ONLY the `### Implementation Approach` section of the spec (not the full spec).

**Output:** Appends `## Implementation Tasks` to the spec file. Each task has:
- Files to create/modify (1–3 files, one concern)
- Spec section references with line ranges (so subagents fetch only relevant lines)
- Dependencies (which tasks must run first)
- Verification method (how to confirm the task is done)
- `[ ] Complete` checkbox (marked `[x]` by /dev as tasks complete)

**Spec-as-reference pattern:** Agents read specific spec sections by line offset, never the full spec. The task manifest includes precise line range hints for this purpose.

**Review gate:** User reviews task breakdown, approves or adjusts boundaries.

**Example:**
```bash
/decompose features/p142_complex_feature.md

# Agent outputs:
# - Complexity: 7 files, 4 concerns, 8 build steps → exceeds threshold
# - Task 1: DB migration (1 file, no deps, verify: migration runs clean)
# - Task 2: Service layer (2 files, depends Task 1, verify: TypeScript passes)
# - Task 3: UI component (2 files, depends Task 2, verify: renders correctly)
# - Task 4: Wiring + integration (2 files, depends Task 3, verify: E2E test passes)
# Can parallelize: none | Sequential: Task 1 → 2 → 3 → 4

# User reviews, approves
```

**Next:** If approved → Run `/dev`

---

### Layer 4: Test Generation (`/generate-tests`)

**What it does:** Auto-generates tests from spec (UAT, E2E stubs, smoke tests)

**Input:** Reads business + UX + technical requirements from spec

**Output:**
1. **UAT scenarios** (`features/uat/pN.md`) - Manual checklist for user validation
2. **E2E test stubs** (`e2e/pN-feature.spec.ts`) - Runnable test files with TODO stubs
3. **Smoke tests** (`e2e/pN-smoke.spec.ts`) - Fast regression detection (page loads, no errors)

**No review gate:** Auto-generated from approved layers (user doesn't need to review)

**Frontmatter written:** After generating test files, /generate-tests writes `uat_file` and `test_files` keys to spec frontmatter. /decompose reads the `## Test Coverage Strategy` section and adds a `Tests:` line to each task manifest entry. This makes test files explicitly discoverable by /dev subagents without relying on naming convention guesses.

**Example:**
```bash
/generate-tests features/p142_dark_mode.md

# Agent generates 3 files:
# 1. features/uat/p142.md - Manual scenarios (user validates feel)
# 2. e2e/p142-dark-mode.spec.ts - Test stubs (agent fills in during /dev)
# 3. e2e/p142-smoke.spec.ts - Smoke test (page loads, toggle visible)

# No user review needed, proceed to /dev
```

---

### Layer 5: Implementation (`/dev`)

**What it does:** Test-driven implementation (reads tests, implements, iterates until pass)

**Two modes:**

- **Standard mode** (no task manifest): Reads full spec, implements everything, iterates until tests pass.
- **Orchestrator mode** (task manifest exists): Reads ONLY `## Implementation Tasks`. Dispatches one subagent per task in dependency order. Each subagent gets fresh context (only its task + referenced spec lines). Marks `[x] Complete` after each task commits. Runs full test suite when all tasks done.

**Input:** Reads business + UX + technical + tests from spec (or task manifest if present)

**Workflow (standard):**
1. **Read tests** (UAT, E2E stubs, acceptance criteria)
2. **Implement** (feature code + fill in test stubs)
3. **Run tests** (`npm test && npm run test:e2e`)
4. **Iterate** (if failures, fix code and re-run)
5. **Commit** (only if ALL tests pass)

**Progress reporting:** Agent tells user what's happening
- "Tests: 7/10 passing, fixing login validation..."
- "Tests: 9/10 passing, fixing edge case..."
- "Tests: 10/10 passing ✅"

**No review gate:** Agent tests itself, user only validates UX (not functionality)

**Example:**
```bash
/dev features/p142_dark_mode.md

# Agent workflow:
# 1. Reads UAT scenarios + E2E stubs
# 2. Implements dark mode toggle
# 3. Fills in test stubs
# 4. Runs tests: 8/10 passing
# 5. Fixes: Missing persistence logic
# 6. Re-runs tests: 10/10 passing ✅
# 7. Commits

# User validates: "Does dark mode feel right?" (UX only)
```

---

## Review Gates

**How to approve:** Review the checklist below, then say "Approved" (or "Needs work: [specific feedback]") and proceed to the next skill.

---

### Gate 1: Business Requirements

**Checklist:**
- [ ] Problem statement is clear (not vague)
- [ ] Intention explains WHY this matters
- [ ] Business requirements are specific (not "improve UX")
- [ ] User stories are testable (not "users are happy")
- [ ] Outcomes are measurable (numbers, not feelings)
- [ ] Acceptance criteria are business-level (not technical)

**How to approve:**

✅ **Good approval example:**
```
Problem statement clear ✓ (users complain about bright UI at night)
Outcomes measurable ✓ (30% adoption within 1 week)
User stories testable ✓ (specific actions described)
Approved. Running /ux next.
```

❌ **Needs work example:**
```
Intention too vague — "improve accessibility" is not specific enough.
What specific accessibility issue are we solving?
Please clarify before moving to UX.
```

**Next:** If approved → Run `/ux` (if UI) or `/architect` (if backend)

---

### Gate 2: UX Design (UI features only)

**Should I skip this gate?**

✅ **Run /ux if:**
- Feature has user-facing UI (buttons, pages, forms, modals)
- Feature changes existing UX (new flow, different layout)
- Feature affects accessibility or mobile experience

❌ **Skip /ux if:**
- Pure backend (API endpoint, database migration, cron job)
- Infrastructure work (deployment, monitoring, CI/CD)
- Zero UI changes at all

**Rule of thumb:** If users see it or interact with it → run /ux. If not → skip.

**Checklist:**
- [ ] User flows cover all user stories
- [ ] Edge cases identified (errors, loading, empty states)
- [ ] Accessibility requirements specified
- [ ] Responsive design considered (mobile, tablet, desktop)
- [ ] No technical implementation details

**How to approve:**

✅ **Good approval example:**
```
User flows cover all stories ✓ (toggle click → save → UI update)
Edge cases identified ✓ (first-time user defaults to system preference)
Accessibility specified ✓ (keyboard + screen reader)
Approved. Running /architect next.
```

❌ **Needs work example:**
```
Missing edge case: What happens if localStorage is disabled?
Please add handling for privacy mode browsers.
```

**Next:** If approved → Run `/architect`

---

### Gate 3: Technical Architecture

**Checklist:**
- [ ] Current code state analyzed (not assumptions)
- [ ] Architecture decisions justified (trade-offs documented)
- [ ] Security review complete (RLS, auth, validation)
- [ ] Files to change are concrete (specific paths, not "update auth module")
- [ ] Build sequence makes sense

**How to approve:**

✅ **Good approval example:**
```
Current code analyzed ✓ (found existing theme system using Tailwind)
Architecture justified ✓ (CSS variables chosen over class swapping — clearer rationale)
Security complete ✓ (no RLS needed, user preference only)
Files concrete ✓ (3 specific file paths listed)
Approved. Running /generate-tests next.
```

❌ **Needs work example:**
```
Security review incomplete — what if user tries to set preference for another user?
Need RLS policy or validation that userId matches authenticated user.
```

**Next:** If approved → Run `/generate-tests`, then `/decompose` (if complex: 5+ files OR 3+ concerns OR 6+ steps)

---

## When to Use Which Skill

| Skill | When to Use | Output |
|-------|-------------|--------|
| `/create-prd` | Starting any new feature | Business requirements only |
| `/ux` | UI features (after business approved) | UX design (flows, screens, edge cases) |
| `/architect` | All features (after UX approved if UI) | Technical architecture + security |
| `/generate-tests` | All features (after architecture approved) | UAT + E2E stubs + smoke tests |
| `/decompose` | Complex features only: 5+ files OR 3+ concerns OR 6+ steps — run AFTER /generate-tests | Task manifest (`## Implementation Tasks` in spec) with test refs per task |
| `/dev` | All features (after tests generated) | Implementation + tests passing; orchestrator mode if task manifest exists |
| `/quick-feature` | Quick skeleton (different use case) | Empty spec structure |

---

## Common Questions

### Q: When should I run /decompose?

**A:** Only for features that hit at least one threshold:
- 5+ files to create/modify
- 3+ distinct system concerns (DB + service + UI = 3 concerns)
- 6+ build steps in the architect's sequence

Below all thresholds → run /dev directly. Above any one → run /decompose first.

**Complexity tiers:**
- Simple (< 5 files, < 3 concerns, < 6 steps): `/dev` directly
- Medium (3–5 files, 3–5 steps): `/dev` or ralph-loop
- Large (5+ files OR 3+ concerns OR 6+ steps): `/decompose` then `/dev`

### Q: What changes in /dev when a task manifest exists?

**A:** /dev switches to orchestrator mode. Instead of reading the full spec and implementing everything in one pass, it:
1. Reads only `## Implementation Tasks`
2. Spawns one subagent per task (each gets fresh context with only its relevant spec lines)
3. Marks tasks complete as they finish
4. Runs full test suite after all tasks complete

This avoids context overflow on large features.

### Q: Does /decompose replace ralph-loop?

**A:** They solve the same problem (context overflow) at different complexity tiers. Ralph-loop is better for medium features (3–5 files, external iteration loop). /decompose + /dev orchestrator is better for large features (5+ files) because subagents get fresh context per task without needing an external tool.

### Q: Do I always need UX layer?
**A:** No. Skip `/ux` for backend-only features (API endpoints, data migrations, infrastructure). Run `/architect` directly after `/create-prd`.

**Decision tree:**
- Has user-facing UI? → Run /ux
- Changes existing UX? → Run /ux
- Pure backend? → Skip /ux
- When in doubt → Run /ux (5 min overhead vs hours of UX rework)

### Q: Can I run skills in parallel?
**A:** No. Each skill depends on the previous layer being approved. Sequential flow is intentional.

### Q: What if I skip a layer?
**A:** Later skills will fail or produce incomplete output. Follow the sequence.

### Q: Can I still use /prep-spec?
**A:** Yes for backward compatibility (features started before the new sequential flow), but it's deprecated. New features should use sequential flow.

### Q: Do I need to manually test anymore?
**A:** Yes, but only UX validation (5 min): "Does this feel right?" Not functionality testing (agent does that).

### Q: What if tests keep failing?
**A:** Agent iterates up to 5 times. If still failing, agent reports to you with details for debugging help.

### Q: What about P0 urgent bugs?
**A:** Run `/fix "Fix login on Safari"` directly. It creates a minimal spec inline, implements + tests, and closes on success.

---

## Examples

### Example 1: UI Feature (Dark Mode)

```bash
# Step 1: Business requirements
/create-prd "Add dark mode toggle to profile page"
# Review: Approve ✅

# Step 2: UX design
/ux features/p142_dark_mode.md
# Review: Approve ✅

# Step 3: Architecture
/architect features/p142_dark_mode.md
# Review: Approve ✅

# Step 4: Test generation
/generate-tests features/p142_dark_mode.md
# Auto-generated, no review

# Step 5: Implementation
/dev features/p142_dark_mode.md
# Agent tests itself, all pass ✅

# Step 6: User validation
# User clicks toggle, checks feel: "Looks good ✅"
```

**Time:** 1 hour total (70 min skill execution + 10 min review gates)

---

### Example 2: Backend Feature (API Endpoint)

```bash
# Step 1: Business requirements
/create-prd "Add API endpoint to export user data"
# Review: Approve ✅

# Step 2: Skip UX (no UI)

# Step 3: Architecture
/architect features/p143_export_api.md
# Review: Approve ✅

# Step 4: Test generation
/generate-tests features/p143_export_api.md
# Auto-generated, no review

# Step 5: Implementation
/dev features/p143_export_api.md
# Agent tests itself, all pass ✅

# Step 6: User validation
# User tests API with curl: "Works ✅"
```

**Time:** 50 min total (40 min skill execution + 10 min review gates)

---

## Comparison: Old vs New Flow

| Aspect | Old Flow | New Flow |
|--------|----------|----------|
| **Skills** | create-prd → prep-spec → dev | create-prd → ux → architect → generate-tests → dev |
| **Review gates** | ❌ None (can't approve layers) | ✅ After each layer |
| **Duplication** | ❌ create-prd + prep-spec overlap | ✅ Each skill does ONE thing |
| **Parallel agents** | ❌ UX + Architect run together | ✅ Sequential (UX before Architect) |
| **Test generation** | ❌ Manual checklist only | ✅ Runnable E2E stubs + smoke tests |
| **Test-driven dev** | ❌ dev doesn't run tests | ✅ dev iterates until ALL pass |
| **Manual testing** | ❌ User tests 20+ times | ✅ User validates UX only (5 min) |
| **Time per feature** | 1-3 days (P1) | ~1 day (P1) |

---

## Success Metrics

**After 2 weeks of using new flow:**

| Metric | Baseline | Target | Actual |
|--------|----------|--------|--------|
| Manual testing time | 20 min/feature | 5 min/feature | TBD |
| Tests passing before commit | ~60% | 100% | TBD |
| Cascading bugs ("fix breaks something else") | 2-3/week | 0/week | TBD |
| Time to ship P1 feature | 3 days | 1 day | TBD |

---

## Troubleshooting

### Problem: "Agent keeps asking about business requirements"
**Solution:** Business requirements not specific enough. Add concrete examples, measurable outcomes.

### Problem: "UX agent doesn't know what to design"
**Solution:** User stories too vague. Make them atomic and testable.

### Problem: "Architect can't find files to change"
**Solution:** Current code state unclear. Run `grep` to find related code, share with agent.

### Problem: "Tests keep failing"
**Solution:** Check if test is correct (tests = spec). If test is wrong, fix test. If code is wrong, agent should fix code.

### Problem: "Agent commits before tests pass"
**Solution:** Report this (agent should NEVER commit with failing tests). Bug in /dev skill.

### Problem: "/generate-tests can't create tests from spec"
**Solution:** Acceptance criteria too vague. Add concrete testable criteria: "User can click X and see Y" (not "user experience is good").

### Problem: "/dev can't fill in test stubs"
**Solution:** Test TODO comments too vague. /generate-tests should create specific TODOs: "// TODO: Click export button and verify download" (not "// TODO: Test export").

### Problem: "E2E tests fail during /dev but code looks correct"
**Solution:** Check test assertions (might be testing wrong thing). Review test stub expectations vs implementation. Ask: "Is the test correct?"

### Problem: "What's happening during /dev iteration?"
**Solution:** Agent reports progress:
- "Running tests... 7/10 passing" ← Normal, agent is iterating
- "Fixing: Login validation missing email check" ← Agent identified issue
- "Re-running tests... 9/10 passing" ← Getting closer
- "All tests pass ✅" ← Ready to commit

If agent iterates 5+ times without progress, it will ask for help.

---

## Migration from Old Flow

**Features started before P143 (2026-02-13):**
- Continue with old flow (no mid-flight migration needed)
- /prep-spec still works (backward compatible)

**New features after P143:**
- Use new flow (sequential, review gates, test-driven)
- /prep-spec deprecated (don't use for new work)

---

## Related Documentation

- [Feature Specs Format](technical/feature-specs.md) - Frontmatter, file naming, lifecycle
- [Testing Guide](technical/testing.md) - How to write E2E tests, run tests, interpret results
- [Git Workflow](technical/git-workflow.md) - Branching, committing, merging
- [CLAUDE.md](../CLAUDE.md) - Universal principles for agents

---

## Feedback

**Process not working?** Open an issue or update this doc with improvements.

**Found a better way?** Document it here and update the skills.

---

## Skills Ecosystem: Beyond the Core Flow

The sequential flow (`/create-prd → /ux → /architect → /generate-tests → /dev`) is the core, but there are other skills that help optimize your workflow.

### Pre-Work Skills (Optional - Use When Needed)

**Decision tree for starting a feature:**

```
Starting a feature?
│
├─ 🤔 Unclear APPROACH (know what to build, not how)
│   → Run /innovate to explore 30 alternatives
│   → Then run /create-prd with chosen approach
│
├─ 🎯 Unclear SCOPE (idea feels too big)
│   → Run /lean to challenge scope and find MVP
│   → Then run /create-prd with refined scope
│
├─ 🌫️ Both unclear (fuzzy idea, unclear scope and approach)
│   → Run /innovate to brainstorm possibilities
│   → Run /lean to narrow to MVP
│   → Then run /create-prd
│
└─ ✅ Clear on both scope and approach
    → Run /create-prd directly
```

**Pre-work skills:**
- `/lean` - Challenge scope, find the simplest thing that validates the hypothesis
- `/innovate` - Explore 30 alternative approaches before committing to one

**Research:**
- Codebase research: Agents do this automatically during `/create-prd`, `/ux`, `/architect` (using Grep/Glob)
- External research: You do this before starting (or spawn a research agent if needed)

---

### Bug Workflow (Different from Features)

Bugs need a different approach than features. They require reproduction, diagnosis, and regression prevention.

**Decision tree for bugs:**

```
Bug reported
│
├─ 🎯 Simple bug (cause is obvious)
│   → Run /fix directly
│   → Workflow: Reproduce → Test → Fix → Verify
│
└─ 🔍 Complex bug (cause unclear, hard to reproduce)
    → Investigate using debugging protocol (see docs/technical/debugging.md)
    → Then run /fix to remediate the identified issue
```

**Bug skills:**
- `/fix` - Systematic bug remediation workflow (reproduce → test → fix → verify)

**For complex bugs:** Use the debugging protocol in `docs/technical/debugging.md` to find root cause:
- Screenshot-driven debugging (verify current code state)
- Database debugging (RLS → migrations → columns)
- UI bug fix process (diagnose fully before deploying)

---

### Post-Work Skills (After Implementation)

`/dev` and `/fix` auto-close the feature on success — spec moves to `features/done/`, `status: done` and `completed_at` are set.

**Optional post-work:**
- `/review-all` — code + design + UX static review (no browser). Run after any non-trivial feature: multi-file changes, auth/RLS, or code you didn't closely supervise.
- `/verify` — live browser UAT + visual QA. Run when you care about look/feel. Returns ✅ / ❌. Can be run on specs already in `features/done/`.
- `/kdd` — capture notable learnings in strategic docs.

**When to use what:**

| Situation | Run |
|-----------|-----|
| Simple UI tweak | `/verify` only |
| Non-trivial feature (multi-file, auth) | `/review-all` then `/verify` |
| Pure backend | `/review-all` only |

---

**Specialist tools (not standard flow):**

These exist but aren't in the default path. Invoke them when you have a specific reason:

- `/refactor` — post-implementation code cleanup (rename, deduplicate, restructure). Run after `/dev` closes the feature, only when code quality warrants it.
- `/review-all` — parallel code + design + UX static review (no browser). Run after any non-trivial feature: multi-file changes, auth/RLS, or unsupervised agent output.
- `/design-audit` — focused design system compliance check. Subset of `/review-all`.

---

### Parallel Skills (Use Anytime)

These skills can be used at any point during development when you need them:

| Skill | When to Use | What It Does |
|-------|-------------|--------------|
| `/simplify` | Facing complex decision with many options | Decision-by-decision analysis and recommendations |
| `/review-all` | Any non-trivial feature: multi-file, auth/RLS, agent-written code | Static code + design + UX review (no browser). You decide what to fix. |

**Usage pattern:**
- These don't block the main flow
- Use them when you encounter the specific situation they address
- Return to main flow after they provide clarity

---

### Complete Workflow Map

**Full development lifecycle:**

```
┌─────────────────────────────────────────────────────┐
│ PRE-WORK (Optional - when needed)                   │
│ /lean      - Scope unclear? Challenge it            │
│ /innovate  - Approach unclear? Explore alternatives │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ CORE FLOW                                           │
│                                                     │
│ Features:                                           │
│ /create-prd → /ux → /architect → /generate-tests → /decompose* → /dev │
│                                                     │
│ * /decompose optional — 5+ files OR 3+ concerns OR 6+ build steps      │
│   /decompose reads Test Coverage section from /generate-tests           │
│                                                     │
│ Bugs:                                               │
│ Investigate (if complex) → /fix                     │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ POST-WORK                                           │
│ (auto) /dev or /fix closes feature on success       │
│ (optional) /review-all — code+design+UX static      │
│ (optional) /verify — live UAT + visual QA           │
│ (optional) /kdd                                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ PARALLEL (use anytime when needed)                  │
│ /simplify                                           │
└─────────────────────────────────────────────────────┘
```

**Key principle:** Not every feature needs every skill. Use the decision trees above to determine which skills your specific situation requires.
