---
status: all-done
type: task
rank: 1
tags:
  - verify
  - tooling
  - testing
  - dx
created_date: 2026-02-19T00:00:00.000Z
reviews:
  prd: null
  architect: null
delivery_stage: arch-review
hypothesis: C1
workstream: C1
---

# P397: /verify Skill — Two-Party Setup, Resumability, and Triage Mode

## Problem Statement

**Current state:** The `/verify` skill runs live UAT in Chrome but requires heavy manual setup for two-party scenarios (any feature involving two participants in a `/live` session). It also has no checkpointing — if context resets mid-run, all in-progress test results are lost. When a scenario fails, the skill investigates root causes instead of moving on.

**Pain points:**
- Two-party session setup takes ~15 minutes of manual work per run: log into a second browser origin, fill React forms with a special JS workaround (standard `fill` garbles text), manage two tab IDs, handle stale sessions
- If Claude's context window compresses mid-session, all test progress is lost — no record of what passed, what failed, what was skipped
- When a scenario fails, the skill reads source code and investigates root causes. This is `/fix`'s job. `/verify` loses focus and drags the session off-track
- React form filling (`mcp__claude-in-chrome__fill`) silently corrupts input in React apps — the failure only surfaces when the join attempt fails downstream, wasting a full session setup

**Who's affected:** Developer running `/verify` on any feature that uses `/live` two-party sessions. Currently P272, future P-numbers involving the live session flow.

---

## Intention (Why This Matters)

**Strategic importance:** The `/live` session is the core product differentiator. Any new feature touching it requires two-party UAT. Right now that's so painful that shortcuts are taken — tests get marked ⏭️ (skipped) instead of actually verified. A fast, automated two-party setup removes the incentive to skip.

**Why now:** P272 (Live Story Point Verification) exposed all three problems in a single session. We have fresh notes on exactly what broke and why. The fix is obvious and bounded.

**Impact if not solved:** Two-party scenarios continue to be skipped or half-tested. Bugs in listener-specific UI (role separation, story sync, verification writes) slip through. `/verify` sessions take 30+ minutes instead of 10.

---

## Business Requirements

**Must-haves:**
- Two-party session can be started automatically — skill logs in the permanent listener account on `127.0.0.1:5001`, creates a session as creator, joins as listener, confirms both are in IdleScreen — without manual steps
- Test progress is saved to the UAT scorecard after every individual scenario, not at the end — so a context reset loses at most one test result, not the whole session
- When a scenario fails, the skill records the failure and moves to the next scenario — it does not read source code, investigate root causes, or attempt fixes
- React-compatible form filling is used by default for all inputs in the app — the standard browser `fill` tool is not used for React inputs

**Success conditions:**
- Two-party setup completes in under 2 minutes (vs current ~15 min)
- A context reset mid-session loses at most 1 test result
- A `/verify` session with 18 scenarios finishes within 15 minutes
- Failures are clearly recorded in the scorecard and the session continues

**Constraints:**
- Listener account credentials already exist in `.env.test.local` (`TEST_LISTENER_EMAIL`, `TEST_LISTENER_PASSWORD`)
- `127.0.0.1:5001` already serves the app (Vite `host: true` already configured)
- No new infrastructure — this is a skill behavior change, not a new service

---

## User Stories

**As a developer running /verify on a /live feature:**
- I want two-party session setup to happen automatically, so I can start testing immediately without 15 minutes of manual browser work
- I want test results saved after each scenario, so a context reset doesn't wipe my progress
- I want failures flagged and skipped immediately, so the session stays on track and finishes in one sitting
- I want form filling to work correctly the first time, so I don't waste a session setup on a garbled email address

**As a developer resuming a /verify session after interruption:**
- I want the skill to read the UAT scorecard and skip already-tested scenarios, so I don't re-run tests that already passed
- I want to see clearly which scenarios still need to run, so I know exactly where to pick up

**As a developer reviewing /verify results:**
- I want each failure to include what was expected vs what happened, so I can file a focused bug report
- I want the scorecard to be the authoritative record, so I don't need to scroll through the conversation to find results

---

## Jobs to Be Done

**When I start a /verify session for a /live feature:**
I want the two-party setup to be automatic, so I can spend the session testing — not configuring browsers.

**When my context window resets mid-session:**
I want to resume exactly where I left off, so I don't have to re-run already-verified scenarios.

**When a scenario fails:**
I want to note it and move on, so I get a complete picture of what works and what doesn't — not a deep-dive on the first failure.

**When the session is done:**
I want to hand off a complete UAT scorecard, so the next step (fix or ship) is obvious without reading the conversation.

---

## Outcomes (Success Metrics)

**Time savings:**
- Two-party setup: 15 min → under 2 min (automated login + join)
- Full 18-scenario session: 60+ min → under 20 min (no setup overhead, no investigation detours)
- Session resume after context reset: currently 10+ min to reconstruct state → under 1 min (read scorecard)

**Quality improvements:**
- Two-party scenarios no longer defaulted to ⏭️ (skipped) — they get actually tested
- Scorecard is always up to date — no "I think we tested that" uncertainty
- Failures are triaged, not investigated — `/verify` stays in its lane

---

## Acceptance Criteria

- [ ] `/verify` detects two-party scenarios from the UAT file (scenarios tagged `requires: two-party`) and runs the boot sequence automatically
- [ ] Boot sequence: checks if listener is already logged in on `127.0.0.1:5001`; if not, logs in using `.env.test.local` credentials; creator creates session; listener joins; both confirmed in IdleScreen
- [ ] Boot sequence completes without manual intervention
- [ ] React-compatible JS form fill is used for all inputs in the app (not `mcp__claude-in-chrome__fill`)
- [ ] UAT scorecard is updated immediately after each scenario result (pass, fail, or skip)
- [ ] When a scenario fails: result recorded in scorecard, failure notes include expected vs actual, skill moves to next scenario without investigating code
- [ ] On resume: skill reads scorecard, skips scenarios already marked ✅ or ❌, runs only untested ones
- [ ] Session ends with a complete scorecard and a verdict (Ready to ship / Ship with caveats / Not ready)

---

## Out of Scope

- Playwright E2E automation (separate from Chrome-based manual UAT)
- Test project isolation (production Supabase is acceptable for now — it's already a test project)
- `requires: two-party` tag on existing UAT files (can be added incrementally as needed)

---

## Next Steps

Run `/dev` to implement — single file change to `SKILL.md`, no scripts or code changes needed.

---

## Technical Analysis

### Current Skill Structure

The skill (`.claude/commands/slava/build/verify/SKILL.md`) is a 432-line markdown prompt with 8 numbered steps:

| Step | What it does | Gap |
|------|-------------|-----|
| Step 1 | Find spec + UAT file | None |
| Step 2 | Build verification plan | Missing: two-party detection, resume detection |
| Step 3 | Pre-flight check | None |
| Step 4 | Open Chrome, baseline | None |
| Step 5 | Run scenarios | Three gaps (see below) |
| Step 6 | Visual quality pass | None |
| Step 7 | Update UAT scorecard | Critical: batch write at end only |
| Step 8 | Report + verdict | Escalation protocol contradicts triage mode |

**Three gaps in Step 5:**

1. **`5a-TWO-PARTY` is documentation, not an executable macro.** The section has the correct JS snippets and approach but is written as prose — the skill requires manual setup.
2. **`mcp__claude-in-chrome__fill` is the stated default.** The React-compatible JS fill pattern exists only in `5a-TWO-PARTY`. Step 5c lists `mcp__claude-in-chrome__fill` as the primary tool for all scenarios.
3. **Scorecard writes are batched at Step 7.** Results accumulate in conversation memory, then write once. Context reset loses everything.

**Triage gap:** Step 8 Escalation Protocol says "Suggest the fix" — actively encouraging root cause investigation. No triage-and-continue rule exists.

---

## Architecture Decisions

### A1: Two-Party Detection — `**Requires:** two-party` Tag Scan

At Step 2, scan UAT scenarios for `**Requires:** two-party`. If found, set `TWO_PARTY_NEEDED: true` in the plan. Boot macro runs once before the first tagged scenario — not once per scenario.

Tag format (add before `**Verify:**` line in each affected UAT scenario):
```
**Requires:** two-party
```

Fallback (no UAT file): detect from spec text containing "listener", "two participants", or "/live session".

### A2: Two-Party Boot Macro — Executable Numbered Procedure

Convert the existing `5a-TWO-PARTY` prose into a numbered executable procedure. No new tools — only `mcp__claude-in-chrome__*` and `javascript_tool`. Boot runs in 5 steps:

1. Check if listener tab (`127.0.0.1:5001`) already exists and listener is logged in
2. If not: navigate to `127.0.0.1:5001`, log in using React Fill Macro
3. Creator tab: navigate to `/live`, click "New meeting", extract room code
4. Listener tab: navigate to `/live/{CODE}`, fill join form with React Fill Macro, join
5. Confirm both tabs in IdleScreen, announce labeled session-state block:

```
TWO-PARTY SESSION READY
  Room code: {CODE}
  Creator tab: http://localhost:5001/live/{CODE} — IdleScreen ✅
  Listener tab: http://127.0.0.1:5001/live/{CODE} — IdleScreen ✅
```

On any boot step failure: stop and report exactly which step failed. Do not proceed to scenarios.

### A3: Per-Scenario Scorecard Write — New Step 5f

Add Step 5f immediately after Step 5e. After every scenario: read UAT file, find `| {UAT-id} | ⬜ |` row, replace with result. A context reset loses at most one result. Step 7 changes from "write all results" to "verify scorecard completeness — fill any remaining ⬜ rows."

### A4: Triage Rule — Hard Constraint After Step 5e

Add a `> **Triage Rule:**` blockquote immediately after Step 5e scoring format:

> **Triage Rule:** On ❌ or ⚠️, write the result to the scorecard with Expected vs Actual, then immediately continue to the next scenario. Do NOT open source files. Do NOT investigate why. Do NOT suggest or attempt a fix. Root cause analysis is `/fix`'s job.

Remove "Suggest the fix" from Step 8 Escalation Protocol. Replace with: "Tell user to run `/fix` to investigate."

### A5: React Fill Macro — Promoted to Default in Step 5c

Add warning block at top of Step 5c. Define macro once. Demote `mcp__claude-in-chrome__fill` to "non-React pages only." Add `change` event dispatch alongside `input` (some React components require both).

### A6: Resume Detection — Added to Step 2

At Step 2, parse Test Execution Log table. Rows with ✅, ❌, or ⏭️ are complete — exclude from plan. Announce "Resume detected: N/total already tested. Running remaining: {list}."

---

## Security Review

**Credential Handling:**
- ⚠️ `e2e-verify-listener@gmail.com` / `ClarityVerify-L2026!` are hardcoded in the current SKILL.md (`5a-TWO-PARTY` block) — a public repo. This was introduced during P272, not P397, but P397 makes the boot sequence executable, making it a first-class concern.
- ✅ Blast radius is narrow — this is a dedicated test account with normal user permissions only. It cannot access admin functions or other users' data.
- ✅ `.env.test.local` is correctly gitignored. The spec's design (read from env vars) is correct.
- **Required action:** Remove the inline credential values from SKILL.md. The boot macro instructions should reference credential names only (`TEST_LISTENER_EMAIL` / `TEST_LISTENER_PASSWORD`), not values. Rotate the password after removing from file.

**JS Injection:**
- ✅ All JS snippets inject literal values authored by the developer, not user-supplied strings. No injection risk.
- ✅ `javascript_tool` runs in the context of `localhost:5001` / `127.0.0.1:5001` (local dev server only). No exfiltration vector.
- ✅ Auth-state check reads localStorage and logs to console only — no external transmission.

**Scorecard File Writes:**
- ✅ Write target is always `features/uat/p{N}.md` where `{N}` is derived from git branch name (numeric only by convention). No path traversal risk in practice.

**Scope / Network:**
- ✅ All browser automation constrained to localhost. No new external network calls introduced.

**RLS / Auth / Database:**
- ✅ No DB migrations, no new RLS policies, no schema changes. Confirmed.

---

## Implementation Approach

**Single file to modify:** `.claude/commands/slava/build/verify/SKILL.md`

No code changes. No new files. No new scripts. All changes are prompt text edits.

### Files to Modify

1. **`.claude/commands/slava/build/verify/SKILL.md`** — 6 targeted edits (see Build Sequence)
2. **`features/uat/p272.md`** — Add `**Requires:** two-party` tag to UAT-2.1 through UAT-5.3 (optional, can be done incrementally)

### Build Sequence (ordered by impact)

- [ ] **Phase 1 — Triage Mode (~5 min):** Edit Step 8 to remove "Suggest the fix." Add Triage Rule blockquote after Step 5e. Immediate effect on next `/verify` run.
- [ ] **Phase 2 — Per-Scenario Scorecard Writes (~10 min):** Add Step 5f after Step 5e. Update Step 7 to verify-completeness mode.
- [ ] **Phase 3 — React Fill Macro as Default (~10 min):** Add warning + macro to top of Step 5c. Demote `mcp__claude-in-chrome__fill`.
- [ ] **Phase 4 — Resume Detection (~10 min):** Add resume detection + two-party detection to Step 2.
- [ ] **Phase 5 — Two-Party Boot Macro (~20 min):** Convert `5a-TWO-PARTY` prose to executable numbered procedure. Remove hardcoded credentials — reference env var names only.
- [ ] **Phase 6 — Tag existing UAT files (~5 min):** Add `**Requires:** two-party` to p272.md UAT-2.x through UAT-5.x.

### Critical Implementation Notes

- **Credential removal is part of Phase 5:** The boot macro text must reference `TEST_LISTENER_EMAIL` / `TEST_LISTENER_PASSWORD` as env var names, not inline values. Rotate the password after the SKILL.md edit is committed.
- **Tab switching:** Verify which `mcp__claude-in-chrome__*` call switches active tab before writing the boot macro. Use `tabs_context_mcp` to discover available commands.
- **Login page handling:** Boot macro must handle three states: already logged in (skip Step 2), redirected to `/` with login button, or dedicated `/auth` route. Check current app auth flow before finalizing.
- **Email field pre-fill guard:** Join form may pre-fill email from auth session. Macro already guards with `if (!emailInput.value)` — preserve this.
