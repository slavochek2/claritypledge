# P100: /ralph-loop Skill Generator

**Status:** Idea — Validate with P61 first
**Priority:** Low (workflow optimization)
**Origin:** Reflection during P61 planning session
**Related:** P99 (/prep-spec skill)

---

## Existing Command Format

The `/ralph-loop:ralph-loop` command already exists with this signature:

```
/ralph-loop:ralph-loop PROMPT [--max-iterations N] [--completion-promise TEXT]
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `PROMPT` | Yes | Instructions for what to implement |
| `--max-iterations` | No | Safety limit (default: ?) |
| `--completion-promise` | No | Output when 100% complete |

---

## Problem

Creating the PROMPT manually is tedious. Need to include:
- Spec path
- UAT path
- Prerequisites
- Tools to use
- TDD instructions
- Commit strategy

**This skill would generate the prompt automatically from a UAT file.**

---

## Proposed Skill: /generate-ralph-loop

```
/generate-ralph-loop <path-to-uat-file> [options]
```

Generates a ready-to-paste `/ralph-loop:ralph-loop` command.

### What It Does

1. **Read UAT file** — Extract test count, current score
2. **Find related spec** — Convention: `foo_acceptance_tests.md` → `foo.md` or `foo_tech_spec.md`
3. **Generate loop instructions** — Inject into context
4. **Run loop** with:
   - TDD approach (test first)
   - Playwright MCP for visual verification
   - Chrome DevTools MCP for network/console
   - Scorecard updates after each test
   - Commits after each category
5. **Exit when:**
   - Score = 100%
   - Max iterations reached
   - Blocked (ask user)
   - Context pressure (suggest fresh context)

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--spec` | auto-detect | Path to tech spec |
| `--max-iterations` | 30 | Safety limit |
| `--pause-on-category` | true | Pause after each category completes |
| `--fresh-context` | ask | When to suggest fresh context |

---

## Loop Protocol (to embed)

```markdown
## Ralph Loop Protocol

1. Read UAT file, check scorecard
2. Find first ❌ or ⬜ test
3. Implement fix (TDD: write/verify test first)
4. Verify:
   - Playwright MCP: visual check, interactions
   - Chrome DevTools MCP: network, console errors
5. Update scorecard: ⬜→✅ or ⬜→❌
6. Commit if category complete
7. Report: "Score: X/Y (N%)"
8. If < 100%: continue
9. If context long: "Pause for fresh context?"

## Exit Conditions
- Score = 100% → `<promise>UAT COMPLETE</promise>`
- N iterations no progress → stop, ask user
- Blocked → report, ask user
```

---

## Integration with /prep-spec

```
/prep-spec features/p61.md
  → Reviews spec
  → Recommends ralph-loop
  → Generates p61_acceptance_tests.md
  → Suggests: "Run /ralph-loop features/p61_acceptance_tests.md"
```

---

## Open Questions

1. **Should it auto-continue or pause between tests?**
   - Auto: faster
   - Pause: more control

2. **How to handle fresh context handoff?**
   - Write state to UAT file (scorecard)
   - Next context reads and continues

3. **What triggers "context pressure" warning?**
   - File read count > 15?
   - Iterations > 10 without commit?

---

## Prompt Template (for manual use until skill exists)

```markdown
# Ralph Loop: {FEATURE_NAME}

## Parameters
- **Spec:** `{SPEC_PATH}`
- **UAT:** `{UAT_PATH}`
- **Max iterations:** {MAX_ITERATIONS|30}
- **Completion promise:** `<promise>{FEATURE_NAME} UAT COMPLETE</promise>`
- **Pause on category:** {PAUSE_ON_CATEGORY|true}
- **Tools:** Playwright MCP, Chrome DevTools MCP

## Prerequisites
{PREREQUISITES|None}

## Loop Protocol

1. **Read** UAT file — check scorecard for current score
2. **Find** first ⬜ or ❌ test
3. **Implement** using TDD:
   - Write/verify test first
   - Read relevant spec section (not whole spec)
   - Implement minimal code to pass
4. **Verify** with:
   - Playwright MCP: screenshots, interactions, visual checks
   - Chrome DevTools MCP: network requests, console errors
5. **Update** scorecard: ⬜→✅ or ⬜→❌ with notes
6. **Commit** after each category completes: `wip({feature}): category N complete`
7. **Report**: `Score: X/{TOTAL_TESTS} ({PERCENT}%) | Iteration {N}/{MAX_ITERATIONS}`
8. **Continue** if score < 100% AND iterations < max
9. **Handoff** if context pressure: write state to UAT, suggest fresh context

## Exit Conditions

| Condition | Action |
|-----------|--------|
| Score = 100% | Output `{COMPLETION_PROMISE}` |
| Iterations = max | Stop, report progress, ask user |
| Same test fails 3x | Stop, report blocker, ask user |
| Blocked by external | Stop, document in UAT notes, ask user |
| Context pressure | Write state, suggest "Fresh context for next category?" |

## Start

Read `{UAT_PATH}` and begin with first ⬜ test.
```

---

## Example: P61 Events Command

**Ready-to-use command:**

```
/ralph-loop:ralph-loop "Implement P61 Events until all UATs pass. Spec: features/p61_events_complete_tech_spec.md | UAT: features/p61_acceptance_tests.md | Prereq: P61.0 DONE | Tools: Playwright MCP + Chrome DevTools MCP | TDD: test first | Update scorecard after each test | Commit after each category" --max-iterations 30 --completion-promise "<promise>P61 UAT COMPLETE</promise>"
```

---

## Example: P61 Detailed Prompt (for reference)

If you need more detailed instructions in the prompt:

```markdown
# Ralph Loop: P61 Events Implementation

You are running an iterative implementation loop until ALL acceptance tests pass.

## Inputs
- **Tech spec:** `features/p61_events_complete_tech_spec.md`
- **Acceptance tests:** `features/p61_acceptance_tests.md`
- **Total tests:** 25
- **Prerequisite:** P61.0 service abstraction DONE

## Pre-Flight (Run Once at Start)

Before entering the loop, verify prerequisites:

1. **Verify P61.0 complete:**
   - Check `src/app/data/events-service.ts` exists
   - Check `src/app/data/events-service.interface.ts` exists
   - If missing → HALT: "P61.0 not complete. Run P61.0 first."

2. **Run pre-checks:**
   ```bash
   npm run lint && npm run build && npm test
   ```
   - If any fail → fix first, then proceed

3. **Check dev server:**
   - Verify `npm run dev` is running on expected port
   - If not → start it or ask user

## Loop Protocol

1. **Read** `features/p61_acceptance_tests.md` — check scorecard table
2. **Find** first ⬜ or ❌ test (in order)
3. **Classify test type:**

   | Category | Type | Strategy |
   |----------|------|----------|
   | 1.x | Database | Verify tables exist; if missing, HALT → ask user to apply migration in Supabase |
   | 2.x-3.x | UI (public) | Playwright MCP: screenshots, navigation |
   | 4.x | Auth (anonymous) | Playwright MCP: verify redirects, URL params |
   | 5.x-6.x | Auth (logged-in) | Use test user helpers OR skip with ⏭️ + blocker note |
   | 7.x | Create flow | Playwright MCP with form fill |
   | 8.x | Confirmation | Playwright MCP screenshot |

4. **Implement** using TDD:
   - Write/verify test assertion first
   - Read ONLY the relevant spec section (not whole spec)
   - Implement minimal code to pass
   - Avoid over-engineering

5. **Verify** with tools:
   - **Playwright MCP:** screenshots, form fills, clicks, navigation
   - **Chrome DevTools MCP:** network errors, console errors
   - **Fallback:** `npm run test:e2e -- --grep events` if MCP unavailable

6. **Update scorecard** in UAT file:
   - ⬜→✅ if pass
   - ⬜→❌ if fail (add note explaining why)
   - ⬜→⏭️ if blocked (add blocker note)

7. **Commit** when category completes:
   ```bash
   git add -A && git commit -m "wip(events): UAT category N complete"
   ```
   - Also commit if blocked mid-category (preserve progress)

8. **Report** after each test:
   ```
   Score: X/25 (N%) | Category M | Iteration I
   ```

9. **Continue** if score < 100% AND not blocked

10. **Context check:** If iterations > 15 or many file reads, ask:
    > "Context getting long. Continue or fresh context?"

## Exit Conditions

| Condition | Action |
|-----------|--------|
| Score = 25/25 (100%) | Output `<promise>P61 UAT COMPLETE</promise>` then run `./scripts/pre-commit-checks.sh` |
| Same test fails 3x | HALT → report what's failing, ask user |
| Blocked by migration | HALT → "Tables missing. Apply migration in Supabase dashboard, then continue." |
| Blocked by auth | Mark ⏭️ → continue to next test, circle back |
| Context pressure | Commit progress → suggest fresh context with current score |

## Test-Specific Notes

### Category 1 (Database)
- Agent cannot run SQL migrations directly
- User must apply `supabase/migrations/20260118_create_events.sql` via Supabase dashboard
- Verification: Query `SELECT * FROM events LIMIT 1;` should return empty, not error

### Category 4-6 (Auth flows)
- Anonymous tests (4.x): Use incognito/clean browser state
- Authenticated tests (5.x, 6.x): Options:
  1. Use `e2e/helpers/test-user.ts` if E2E auth is set up
  2. Manual verification with real login
  3. Skip with ⏭️ and note for later

### Category 7 (Create event)
- Requires authenticated user
- Form fields: title, description, datetime, duration, timezone, location
- Verify slug generation (no collisions)

## Start

Run pre-flight checks. If all pass, read `features/p61_acceptance_tests.md` and begin with UAT-1.1.
```

---

## Validation Plan

1. Run P61 with manual ralph-loop (using template above)
2. Note friction points
3. Extract pattern into skill
4. Test on P100+ features

---

## Related

- P99: /prep-spec skill (generates UAT files)
- `/loop`: Single-session dev loop
- `/simplify`: Decision surfacing
