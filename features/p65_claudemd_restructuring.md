# P65: CLAUDE.md Restructuring

**Status:** Ready for Implementation
**Priority:** High (foundational)
**Created:** 2026-01-16
**Updated:** 2026-01-17

---

## Problem Statement

CLAUDE.md is 622 lines. Every agent loads it, but most content is situational:
- Auth flow details only matter for auth work
- Worktree setup only matters when using worktrees
- MCP server details only matter when debugging browser issues
- Database schema only matters for data layer changes

**Result:** Token waste, slower context loading, agents wading through irrelevant info.

---

## Goal

Lean CLAUDE.md (~380 lines) containing only what EVERY agent needs. Situational content moves to reference docs that agents load on-demand.

---

## Existing Reference Docs (Audit)

| Doc | Lines | Status |
|-----|-------|--------|
| `docs/technical/authentication.md` | 12 | Stub — needs expansion |
| `docs/technical/database.md` | 31 | Stub — needs expansion |
| `docs/technical/debugging.md` | 10 | Stub — not useful |
| `docs/technical/testing.md` | 56 | Partial |
| `docs/technical/e2e-testing.md` | 481 | Comprehensive |
| `docs/technical/analytics.md` | 501 | Comprehensive |
| `docs/technical/worktree-setup.md` | 290 | Comprehensive |
| `docs/technical/cloud-agent.md` | 330 | Comprehensive |

**Key insight:** 4 docs already comprehensive. Only need to expand 2 stubs + create 1 new doc.

---

## What Stays in CLAUDE.md (~380 lines)

| Section | Lines | Rationale |
|---------|-------|-----------|
| Project Overview | 15 | Every agent needs context |
| Development Commands | 30 | Every agent runs commands |
| Configuration | 15 | Every agent needs env setup |
| Project Structure | 40 | Every agent navigates code |
| Common Gotchas | 25 | **Critical** — prevents repeat mistakes |
| Pre-Commit Checks | 50 | Every agent commits code |
| Code Style & Quality | 60 | Every agent writes code |
| File Creation Rules | 50 | Every agent creates files |
| Design System (brief) | 10 | Every agent touches UI |
| Tech Debt | 15 | Prevents confusion |
| Known Issues | 10 | Prevents confusion |
| Source of Truth | 20 | Prevents doc conflicts |
| Test Modification Rules | 20 | Every agent may touch tests |
| **Deep Dive References (new)** | 20 | Index to situational docs |

**Total:** ~380 lines

---

## What Moves Out (~240 lines)

| Content | Lines | Destination | Action |
|---------|-------|-------------|--------|
| MCP Servers + Browser Tools Guide | 70 | `docs/technical/browser-tools.md` | **Create new** |
| Auth Architecture (Reader-Writer, callback) | 50 | `docs/technical/authentication.md` | **Expand stub** |
| Database Schema + RLS + Data Layer | 40 | `docs/technical/database.md` | **Expand stub** |
| Type Definitions | 30 | `docs/technical/database.md` | **Merge into DB doc** |
| Observability (Mixpanel/Sentry details) | 40 | `docs/technical/analytics.md` | **Already there** — just link |
| Cloud Agent details | 25 | `docs/technical/cloud-agent.md` | **Already there** — just link |
| Worktree details | 30 | `docs/technical/worktree-setup.md` | **Already there** — just link |

---

## New Section: Deep Dive References

Add this to CLAUDE.md after "Development Commands":

```markdown
## Deep Dive References

Load these when working on specific areas:

| Working on... | Read |
|---------------|------|
| Auth, login, magic link, sessions | [authentication.md](docs/technical/authentication.md) |
| Database, RLS, profiles, witnesses, types | [database.md](docs/technical/database.md) |
| Playwright, screenshots, browser MCP tools | [browser-tools.md](docs/technical/browser-tools.md) |
| E2E tests, Playwright test suite | [e2e-testing.md](docs/technical/e2e-testing.md) |
| Analytics, Mixpanel, Sentry | [analytics.md](docs/technical/analytics.md) |
| Git worktrees, parallel development | [worktree-setup.md](docs/technical/worktree-setup.md) |
| Cloud agent, /c commands | [cloud-agent.md](docs/technical/cloud-agent.md) |
```

---

## Implementation Plan

### Phase 1: Expand Reference Docs

**Task 1.1:** Create `docs/technical/browser-tools.md`
- Extract MCP Servers section from CLAUDE.md
- Extract Browser Tools Decision Guide from CLAUDE.md
- Include the decision table and isolation/headless notes

**Task 1.2:** Expand `docs/technical/authentication.md`
- Extract Auth Architecture section from CLAUDE.md
- Include Reader-Writer pattern explanation
- Include AuthCallbackPage transaction flow
- Include "DO NOT move profile creation" warning

**Task 1.3:** Expand `docs/technical/database.md`
- Extract Database Schema section from CLAUDE.md
- Extract Type Definitions section from CLAUDE.md
- Include RLS design decisions
- Include slug generation trade-off explanation

### Phase 2: Slim CLAUDE.md

**Task 2.1:** Add Deep Dive References section (after Development Commands)

**Task 2.2:** Remove moved content, replace with 1-line pointers:
- MCP Servers → "See [browser-tools.md](docs/technical/browser-tools.md)"
- Auth Architecture → "See [authentication.md](docs/technical/authentication.md)"
- Database Schema → "See [database.md](docs/technical/database.md)"
- Type Definitions → "See [database.md](docs/technical/database.md)"
- Observability details → "See [analytics.md](docs/technical/analytics.md)"
- Cloud Agent details → Already has link, just trim
- Worktree details → Already has link, just trim

**Task 2.3:** Keep these in CLAUDE.md (critical):
- Common Gotchas (all 5 items)
- Test Modification Rules
- Pre-Commit Checks
- File Creation Rules

### Phase 3: Validate

- [ ] Line count under 400
- [ ] Run `./scripts/pre-commit-checks.sh`
- [ ] Verify an agent can complete a typical task (e.g., "fix a bug")
- [ ] Verify auth-related task still works with reference doc

---

## Features Folder Cleanup (Separate PR)

### Files to Rename

| Current | New |
|---------|-----|
| `p55_Understanding Verification Loop.md` | `p55_understanding_verification_loop.md` |
| `p60_navigating stories and points.md` | `p60_navigating_stories_and_points.md` |

### Files to Renumber

| Current | New | Reason |
|---------|-----|--------|
| `p65_live_auth_gate.md` | `p66_live_auth_gate.md` | Duplicate p65 |

### Naming Convention (document in CLAUDE.md)

| Prefix | Meaning | Location |
|--------|---------|----------|
| `p{N}_` | Feature | `features/` |
| `b{N}_` | Bug fix | `features/bugs_and_debt/` |
| `r{N}_` | Refactor | `features/` |

---

## Success Criteria

- [ ] CLAUDE.md ≤ 400 lines
- [ ] All 5 Common Gotchas remain in CLAUDE.md
- [ ] Deep Dive References table added
- [ ] 3 reference docs created/expanded
- [ ] No broken agent workflows
- [ ] Features folder naming consistent

---

## Out of Scope

- Automated context loading (agents decide what to read)
- Restructuring `docs/` folder beyond `technical/`
- Changes to existing comprehensive docs (analytics, e2e-testing, worktree-setup, cloud-agent)
