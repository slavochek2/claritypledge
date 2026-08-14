---
status: backlog
type: task
rank: 28
tags:
  - testing
  - chrome-extension
  - two-party
  - infra
  - p666
created_date: 2026-04-06T00:00:00.000Z
---

# P668: Two-Party Chrome Automation — Level 2 Testing for `/live`

## Problem

ClarityPledge's core product is two-party `/live` sessions. Playwright E2E (Level 1) tests scripted assertions against DOM state. But visual bugs, timing issues, and state delivery gaps between parties can only be caught by real-browser observation (Level 2). Today, Chrome extension automation is single-identity only — one cookie jar, one user at a time. There's no way for an agent to visually verify what both parties see simultaneously.

**Parent spec:** P666 (Testing Infrastructure Gaps — Phase 2)
**Predecessor:** P447 (Two-Party Simulation, draft in `features/drafts/`)
**Depends on:** P666 Phase 1 (test migration — confirms P644 infra works)

## Architecture Options

[FOUNDER DECISION: Which approach?]

### Option A: Two Chrome Profiles

Two separate Chrome instances with separate extension installs. Each has its own cookie jar + auth session.
- **Pro:** True isolation, no auth leakage
- **Con:** Requires managing two Chrome profiles, two extension installs. MV3 service worker dies after 5min idle — now two workers to keep alive.

### Option B: Two Tabs, Auth Switching

Single Chrome instance, two tabs. Agent switches auth context between interactions (clear cookies → re-auth as other user).
- **Pro:** Simpler setup, single browser
- **Con:** Slow (re-auth on every switch), fragile (cookie leakage risk), can't observe both simultaneously

### Option C: Playwright + Chrome Tandem

Playwright drives the scripted mechanics (create session, inject auth, navigate, advance state). Chrome extension observes as a third-party viewer, taking screenshots at each state transition.
- **Pro:** Leverages existing P644 infra, Chrome only needs to watch (not act), no two-identity problem
- **Con:** Chrome observer sees a third perspective (not exactly what host/guest see), limited to observation

### Option D: Parallel Subagents via SendMessage

Two Claude Code subagents, each with their own browser session (via Chrome DevTools MCP or separate Chrome profiles). Orchestrator coordinates via `SendMessage` at handoff points.
- **Pro:** True two-party simulation, each agent sees exactly what their user sees
- **Con:** Most complex, two Chrome sessions, orchestration logic, MV3 timeout risk doubled

## Open Questions

1. Can Claude in Chrome open two tabs with different auth sessions via `tabs_create_mcp`? Or does the single cookie jar apply per-browser, not per-tab?
2. Can Chrome DevTools MCP inject auth tokens via `evaluate_script`? If so, it could serve as a second "identity" alongside Chrome extension.
3. Is P447's `localhost` vs `127.0.0.1` trick (separate cookie jars) actually reliable across OS/Chrome versions?
4. For Option C: what exactly does the Chrome observer see that Playwright assertions miss? Need concrete examples to justify the complexity.

## Acceptance Criteria

- [ ] Architecture decision made and documented
- [ ] At least one two-party `/live` scenario verifiable at Level 2 (Chrome automation, two identities)
- [ ] Integration with `/sim` — `--two-party` flag works (currently stub in sim.md)
- [ ] Findings from both perspectives captured in a single report

## References

- P666: Parent spec (Testing Infrastructure Gaps)
- P447: Original two-party simulation draft (`features/drafts/p447_two_party_simulation.md`)
- P644: Two-party test infrastructure (Level 1 foundation)
- `.claude/commands/slava/build/sim.md`: `/sim` skill with `--two-party` stub
- `docs/technical/browser-tools.md`: Tool capabilities matrix
