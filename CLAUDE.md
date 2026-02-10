# CLAUDE.md

This file provides guidance for AI agents working with code in this repository.

**For humans:** See [README.md](./README.md) for setup instructions and deployment guide.

**For agent philosophy:** See [.claude/commands/slava/PRINCIPLES.md](.claude/commands/slava/PRINCIPLES.md) — principles scale, rules don't.

---

## Quick Start

**Clarity Pledge** — TypeScript web app for calibrated communication practice.

**Development pattern:** Read spec → implement → test → commit → `/done`

**Deep dive:** See `docs/technical/` for architecture, auth, database, testing guides.

---

## Universal Principles

### Before Starting Work

> **Principle:** Check what already exists before building new.

Before implementing ANY feature or UI component:

1. **Check git history** for prior implementations:
   ```bash
   git log --oneline --all -- <relevant-path>
   git log --all --grep="keyword"
   ```

2. **Search codebase** for existing components:
   ```bash
   grep -r "ComponentName" src/
   ```

3. **Read the feature spec completely** if working from a P-number

**Why:** 5 minutes checking history saves hours of redundant work.

---

### Architecture & Implementation Style

> **Principle:** Prefer simple, direct solutions over complex patterns.

When presenting implementation options, lead with the simplest production-ready approach. Avoid:
- Adapter patterns when direct migration works
- Context-aware conditional logic when a simple check suffices
- Over-abstraction for one-time operations

**Good:** "Direct migration to new types is cleanest. Doing it."
**Bad:** "We could use an adapter pattern to maintain backward compatibility..."

If the user pushes back on complexity, they're right — simplify.

For architecture patterns, see [docs/technical/architecture.md](docs/technical/architecture.md).

---

### Transparency Principle

> **Principle:** Never silently work around problems. Report issues to the user, even if you can technically proceed.

**Report these immediately:**
- Scripts producing incorrect results (false positives/negatives)
- Tests that fail intermittently (flaky tests) — don't just retry until they pass
- Type errors you're tempted to suppress with `@ts-ignore` or `as any`
- Tests you want to modify to make them pass (fix the code, not the test)
- Multi-step operations where some steps failed
- Commands with warnings or errors in output

**How to report:** State what you observed, why it's concerning, ask how to proceed.

**When in doubt:** If something feels "off" but technically works — report it. False alarms are better than silent failures.

---

### Proactive Improvement

When you encounter friction, inefficiency, or repeated issues: (1) Identify the problem, (2) Propose a concrete fix (draft the actual change), (3) Ask before applying. The user decides what ships.

---

### Decisive Action — No False Choices

> **Principle:** If analysis clearly points to one answer, take it. Only ask when there are genuine trade-offs or user preference matters.

**Bad:** "Here are options 1, 2, 3. Which do you want?" (when one is obviously right)
**Good:** "X is the right fix. Doing it."

Asking unnecessary questions wastes time and shifts decision-making burden to the user. If you've done the analysis and know the answer, act on it.

**When to ask:** Genuine ambiguity, user preference matters, or irreversible actions.
**When to act:** The right path is clear from context, principles, or analysis.

---

### Working Style — Overintellectualization Pattern

> **Pattern to watch:** When facing uncertainty, the founder overintellectualizes — expanding scope (adding features, exploring adjacent ideas) as a way to create false certainty.

**If you notice:** Lots of "what about X?" questions, adding features before validating current hypothesis, exploring adjacent markets before proving the current one.

**Then flag it:** "This looks like scope expansion under uncertainty. The lean path is to validate [current hypothesis] first. Should we stay focused?"

---

### Plan Mode — No Writing, Just Planning

> **Rule:** In plan mode, do NOT write spec content into the plan file. Plan mode is for exploration and decision-making only.

**Plan mode is for:** Exploring code (Read, Grep, Glob), asking questions (AskUserQuestion), making architectural decisions, outlining approaches (brief bullets OK).

**Plan mode is NOT for:** Writing full specs/docs/code, working around "can't create files" by stuffing content into plan file.

**If asked to write a spec in plan mode:** Tell them "I'm in plan mode — I can't create files. Please approve the ExitPlanMode prompt." Call `ExitPlanMode` immediately. Do NOT write into plan file.

---

### Test Integrity Principle

> **Principle:** Tests are executable specifications. Modifying tests to pass means changing the spec.

If tests fail, the code is wrong (not the test). If you believe a test is genuinely incorrect, explain why and ask before changing it. Never enable skipped tests without understanding why, use `.only()` (breaks CI), delete failing tests, or change assertions to match buggy output.

---

### Commit Discipline

> **Pattern to watch:** The founder tends to accumulate changes rather than commit incrementally.

After completing a logical unit of work, suggest: "Good checkpoint for a commit. Want to commit now?"

---

## Agent Behavior

### Debugging

See [docs/technical/debugging.md](docs/technical/debugging.md) for full protocol.

**Quick rules:** (1) Verify current code before acting on screenshots, (2) For DB issues check RLS → migrations → columns, (3) Fix ONE root cause at a time.

#### UI Bug Fix Process

> **Principle:** Diagnose FULLY before deploying. One deployment, fully verified.

When fixing visual bugs in systems with slow deploy cycles (Ghost, production):
1. Reproduce (screenshot)
2. Diagnose ALL contributing elements before any fix
3. Verify logic in browser console BEFORE deploying (test selectors with `.matches()`, test JS with `eval`)
4. Deploy once
5. Verify (screenshot)

**Anti-pattern:** Finding one cause → ship → fail → find another → ship again. Wastes deploy cycles.

---

### Git & Commits

See [docs/technical/git-workflow.md](docs/technical/git-workflow.md) for full workflow.

**Quick rules:** Prompt for commits after logical units of work, use `git stash` if pre-commit fails due to unrelated work, run `./scripts/pre-commit-checks.sh` before committing.

---

### Risky Operations — Worktree Protection

> **Principle:** Risky or experimental changes should be isolated. Suggest a worktree before proceeding.

**Ask before:** Installing new global tools, major refactors (10+ files), new frameworks/build systems, database migrations, anything labeled "experimental."

**Why:** Easy rollback if experiment fails.

---

### Task Tracking

> **Principle:** Non-trivial work should be visible. Suggest tracking, never force it.

**Frontmatter required:** All feature files MUST have YAML frontmatter with at minimum a `status` field. See [feature-specs.md](docs/technical/feature-specs.md) for complete format and lifecycle, or use `/slava:build:create-feature` skill.

When starting non-trivial work (multi-file changes, features, bug fixes), suggest: "Want me to create a tracking task?" Never auto-create. If user declines, don't ask again that session. When done, update to `status: done`.

**Type classification:** `type: story` (user value), `task` (technical), `bug` (fix), `comment` (decisions). If work delivers user value, frame as story: "As a [user], I want [goal], so that [benefit]."

**Number assignment:** Scan ALL `features/` subdirectories for highest `p{N}`. Next = highest + 1.

---

### Open Source Safety (PII Protection)

This repo is public. Before creating/updating files (especially `content/`, `docs/stories/`), check for: personal addresses/phones, private business details, location patterns. **When in doubt, ask:** "Is this safe to publish openly?"

---

## Skills — Local Only

**All skills live in `.claude/commands/`** — visible in IDE, version controlled with project. Check `.claude/commands/slava/` first for custom workflows.

**Approval required** before creating, modifying, or deleting skills, or installing plugins/MCP servers. **Always ask first:** "I'd like to create [X] for [reason]. OK?"

---

## Tool Preferences

### Library Documentation (Context7)

**Before web-searching for library/framework docs, use Context7 first.**

Context7 MCP provides up-to-date docs for React, Supabase, Playwright, Tailwind, Ghost, Vite, Radix, and more.

**Workflow:** (1) `resolve-library-id` to find the library, (2) `query-docs` to ask a specific question.

---

### Browser Automation

Three tools, different lanes — pick based on the task:

| Need | Tool | Why |
|------|------|-----|
| Automated test suite, CI, `/live` two-party | **Playwright** (`npm run test:e2e`) | Repeatable, headless, parallel |
| Debugging, perf profiling, network inspection | **Chrome DevTools MCP** (`mcp__chrome-devtools__*`) | Headless, no user browser needed |
| Visual QA, authenticated pages, ad-hoc checks | **Claude in Chrome** (`mcp__claude-in-chrome__*`) | Real browser, cookies, vision |

No priority order. Each has a unique strength. For full details: [browser-tools.md](docs/technical/browser-tools.md)

---

## Git Safety (Firewall)

These are hard rules, not principles to reason about. Leaking secrets to git history is catastrophic and irreversible — there's no "it depends."

**Never use these commands:**
- `git add .` — can stage secrets and ignored files
- `git add -A` — same problem
- `git add -f <file>` — forces adding ignored files

**ALWAYS use explicit file names:**
```bash
git add src/app/pages/MyPage.tsx src/components/Button.tsx
```

**Files that MUST NEVER be committed:**
- `.mcp.json` — contains API tokens
- `.env.local` — contains secrets
- Any file with `token`, `secret`, `key`, `password` in content

**If you accidentally stage a secret:**
```bash
git reset HEAD <file>        # Unstage
git rm --cached <file>       # Untrack (if already tracked)
```

---

## Code & Architecture

### Code Style

- **Never put dates in documentation** — Use relative terms ("current", "recent"). Git history provides temporal context.
- React 19 patterns, hooks at top, Supabase for state, Tailwind CSS, shadcn/ui

See [architecture.md](docs/technical/architecture.md) for details.

---

### Design System

See [docs/design-system.md](docs/design-system.md). **Quick rule:** Blue for actions/CTAs, green for SUCCESS ONLY. Never green action buttons or amber/orange/yellow/purple in UI.

---

### Database Access Policy

Agents have TEST database access only. No production access. Workflow: Test on test DB → capture as migrations → human reviews → human applies to production. See [database.md](docs/technical/database.md) for details.

---

### Worktree Branch Naming

Worktree identity: `claritypledge-N` = wN. Branch names reflect feature, not worktree. See [worktree-setup.md](docs/technical/worktree-setup.md) for details.

---

## Reference Guide

### Product Overview

**Clarity Pledge** — Calibrated communication practice via /live verification. Target: coaches.

Docs: [definitions.md](docs/definitions.md) | [lean-canvas.md](docs/lean-canvas.md) | [milestones/](docs/milestones/)

---

### Development Commands

**Non-obvious commands:**
```bash
./scripts/pre-commit-checks.sh  # REQUIRED before committing
npm run kanban                   # Feature prioritization (port 9050)
```

**Standard commands:** `npm run dev`, `npm test`, `npm run build` — see `package.json` for full list.

Worktree ports & env setup: [infrastructure.md](docs/technical/infrastructure.md)

---

### Deep Dive References

**Technical:** `docs/technical/` — architecture, auth, database, testing, debugging, git-workflow, infrastructure

**Strategic:** `docs/` — decisions (trade-offs), milestones (what we're building), definitions (concepts), philosophy (WHY), theory-of-change (evidence)

---

### Project Structure

Key folders: `docs/technical/` (guides), `features/` (specs), `src/app/` (source), `e2e/` (tests), `supabase/` (database).

Full structure: [README.md](README.md#project-structure)

---

### File Locations

Feature specs: `features/p{N}_{name}.md` | Completed: `features/done/` | Skills: `.claude/commands/slava/`

Full guide: [feature-specs.md](docs/technical/feature-specs.md#file-locations)

---

### Creating Features, Bugs, Tasks

**Recommended:** Use `/slava:build:create-feature` skill (ensures correct frontmatter, P-number, template).

**Handles:** Features, bugs, tasks — prompts for type, status, priority, generates proper structure.

**Manual creation (if needed):**

When creating ANY file in `features/` manually, ALWAYS include frontmatter:

```yaml
---
status: backlog | week | today | in-progress | blocked | done
type: feature | bug | task
priority: p0 | p1 | p2 | p3
tags: []
---
```

**For bugs, add:**
```yaml
severity: low | medium | high | critical
date_reported: YYYY-MM-DD
date_resolved: YYYY-MM-DD         # when fixed
root_cause: brief description     # after resolution
```

**File naming:** `features/p{N}_{slug}.md` (skill auto-generates P-number)

Full format & lifecycle: [feature-specs.md](docs/technical/feature-specs.md)

---

### Knowledge-Driven Development

`/kdd` — Run after features to capture knowledge in strategic (`decisions.md`, `milestones/`) and technical docs (`database.md`, `authentication.md`).

---

### Observability

Mixpanel (analytics) and Sentry (errors) are production-only. See [analytics.md](docs/technical/analytics.md) for event catalog.

---

### Documentation Architecture

**Source of truth:** `definitions.md` (concepts), `lean-canvas.md` (business), `milestones/` (roadmap), `decisions.md` (trade-offs), `philosophy.md` (WHY), `theory-of-change.md` (evidence). Never duplicate — add to source and link.
