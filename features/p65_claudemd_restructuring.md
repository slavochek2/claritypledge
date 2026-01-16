# P65: CLAUDE.md Restructuring

**Status:** Planning
**Priority:** High (foundational - blocks P64)
**Created:** 2026-01-16
**Updated:** 2026-01-16

---

## Problem Statement

CLAUDE.md is ~620 lines. Every agent loads it, but most content is situational:
- Auth flow details only matter for auth work
- Worktree setup only matters when using worktrees
- MCP server details only matter when debugging browser issues
- Database schema only matters for data layer changes

**Result:** Token waste, slower context loading, agents wading through irrelevant info.

---

## Goal

Lean CLAUDE.md that contains only what EVERY agent needs. Situational context moves to referenced docs that agents load on-demand.

---

## Analysis: What's in CLAUDE.md Today

| Section | Lines | Every agent needs it? |
|---------|-------|----------------------|
| Project Overview | 15 | ✅ Yes |
| Development Commands | 30 | ✅ Yes |
| MCP Servers Available | 30 | ❌ Only browser debugging |
| Browser Tools Decision Guide | 40 | ❌ Only browser debugging |
| Cloud Agent | 25 | ❌ Only when using /c |
| Git Worktree Setup | 60 | ❌ Only parallel dev |
| Configuration | 15 | ✅ Yes |
| Project Structure | 45 | ✅ Yes (abbreviated) |
| Architecture (Auth, Data, DB) | 100 | ⚠️ Partial - gotchas yes, details no |
| Type Definitions | 30 | ❌ Can read from code |
| Common Gotchas | 25 | ✅ Yes (critical) |
| Testing | 50 | ⚠️ Partial - rules yes, details no |
| Known Issues | 10 | ✅ Yes |
| Source of Truth | 20 | ✅ Yes |
| Observability | 40 | ❌ Only when adding analytics |
| Pre-Commit Checks | 50 | ✅ Yes |
| Cloud Credits | 10 | ❌ Rarely needed |
| Tech Debt | 15 | ✅ Yes |
| Design System | 10 | ✅ Yes (brief) |
| Code Style | 30 | ✅ Yes |
| Code Quality Principles | 30 | ✅ Yes |
| File Creation Rules | 50 | ✅ Yes |

**Estimated savings:** ~250 lines (40%) can move to referenced docs.

---

## Proposed Structure

### CLAUDE.md (Lean Core ~370 lines)

Keep:
- Project Overview
- Development Commands
- Configuration
- Project Structure (abbreviated)
- Common Gotchas
- Key Conventions (source of truth, pre-commit, code style, file rules)
- Design System (brief)
- Tech Debt
- Known Issues

Add:
- "Deep Dive References" section pointing to docs for situational context

### New Reference Docs

| Doc | Contains | When to load |
|-----|----------|--------------|
| `docs/technical/mcp-servers.md` | MCP tools, browser decision guide | Browser debugging, visual testing |
| `docs/technical/worktree-setup.md` | Already exists, expand | Parallel development |
| `docs/technical/cloud-agent.md` | Already exists | Using /c command |
| `docs/technical/auth-architecture.md` | Reader-Writer pattern, auth callback | Auth work |
| `docs/technical/database.md` | Schema, RLS, data layer patterns | Database work |
| `docs/technical/testing.md` | Test setup, helpers, modification rules | Writing tests |
| `docs/technical/observability.md` | Mixpanel, Sentry patterns | Adding analytics |

---

## Migration Plan

### Phase 1: Create/Update Reference Docs
- [ ] Create `docs/technical/mcp-servers.md` (extract from CLAUDE.md)
- [ ] Create `docs/technical/auth-architecture.md` (extract from CLAUDE.md)
- [ ] Create `docs/technical/database.md` (extract from CLAUDE.md)
- [ ] Update `docs/technical/testing.md` if needed
- [ ] Create `docs/technical/observability.md` (extract from CLAUDE.md)

### Phase 2: Slim CLAUDE.md
- [ ] Add "Deep Dive References" section
- [ ] Remove sections that moved to reference docs
- [ ] Keep abbreviated pointers ("For auth details, see docs/technical/auth-architecture.md")

### Phase 3: Validate
- [ ] Run a few typical tasks, verify agents still work
- [ ] Check that gotchas and critical rules stayed in CLAUDE.md

---

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| Agents miss context they need | Keep gotchas and critical rules in CLAUDE.md |
| Extra tool calls for references | Only ~5 reference docs; agents load on-demand |
| Reference docs go stale | Minimal content + links to code; same risk as today |

---

## Success Criteria

- [ ] CLAUDE.md under 400 lines
- [ ] All critical gotchas still in CLAUDE.md
- [ ] Reference docs created and linked
- [ ] No broken workflows (agents can still complete tasks)

---

## Out of Scope

- Automated context loading (agent decides what to read)
- Removing any information (only moving it)
- Restructuring docs/ folder beyond technical/
