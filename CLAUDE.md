# CLAUDE.md

This file provides guidance for AI agents working with code in this repository.

**For humans:** See [README.md](./README.md) for setup instructions and deployment guide.

**For agent philosophy:** See [.claude/commands/slava/PRINCIPLES.md](.claude/commands/slava/PRINCIPLES.md) — principles scale, rules don't.

---

## Quick Start

**Clarity Pledge** — TypeScript web app for calibrated communication practice.

**Development pattern:** Read spec → implement → test → `/dev` auto-closes on success. Run `/verify` for visual QA when needed.

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

4. **Check the done-features index** for related past work:
   ```bash
   grep -i "keyword" features/done/INDEX.md
   ```
   Scan `features/done/INDEX.md` — one line per completed feature, grouped by domain. Catches gotchas, patterns, and prior decisions before you repeat them.

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

### File Creation Discipline

> **Principle:** Never create files in project root. Terminal output > files.

**Quick rules:**
- ❌ Never create `/*.md`, `/*.json`, or temp files in project root
- ✅ Feature specs: Use `/create-prd` or `/quick-feature` (auto-creates in `features/`)
- ✅ Analysis outputs: Terminal only (no files)
- ✅ Migration scripts: `scripts/archive/migrations/YYYYMMDD-{name}.{ext}`

**Full guidance:** [docs/technical/file-locations.md](docs/technical/file-locations.md)

---

### Decisive Action — No False Choices

> **Principle:** If analysis clearly points to one answer, take it. Only ask when there are genuine trade-offs or user preference matters.

**Bad:** "Here are options 1, 2, 3. Which do you want?" (when one is obviously right)
**Good:** "X is the right fix. Doing it."

Asking unnecessary questions wastes time and shifts decision-making burden to the user. If you've done the analysis and know the answer, act on it.

**When to ask:** Genuine ambiguity, user preference matters, or irreversible actions.
**When to act:** The right path is clear from context, principles, or analysis.

---

### Anti-Sycophancy — Hold Positions Under Pressure

> **Principle:** Only change a recommendation when there is new evidence, a missed fact, or a logical flaw pointed out. Pushback alone is not a reason to change position.

**When the user pushes back:**
- Name what would change your view: "I'd update this if X, but I don't see that here."
- If they surface a new fact or flaw — update and say so explicitly: "Good point — X changes the picture because Y."
- If they just express displeasure or repeat the question — hold the position and explain why.

**Bad:** Switching from B to A because the user said "reflect on this" with no new information.
**Good:** "B is still my recommendation. Here's why: [reason]. If [specific condition] were true, A would be better."

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

Tests are specs — fix code, not tests. Rules auto-load when editing test files via `.claude/rules/tests.md`.

Skill archiving checklist and frontmatter requirements auto-load when editing `.claude/commands/slava/` files via `.claude/rules/skills.md`.

---

### Commit Discipline

> **Pattern to watch:** The founder tends to accumulate changes rather than commit incrementally.

**Commit autonomous, push always needs your OK.** When running a skill (`/dev`, `/fix`, etc.), commit independently when tests pass and the change is clearly complete — no need to ask. In open-ended conversation (no skill running), suggest: "Good checkpoint for a commit. Want to commit now?" Pushing to remote (`git push`) always requires explicit user approval first — ask before every push, even in "autonomous" mode.

**Pre-commit failures: fix inline, never ask.** Apply the known fix and re-run. See [git-workflow.md](docs/technical/git-workflow.md) for remedies by failure type.

**Commit flow is zero-question.** When the user says "commit", "wrap", "ship", or equivalent: fix any blockers inline (lint → `npx eslint --fix`; TS errors → fix the type; frontmatter → `python3 scripts/fix-frontmatter.py`), then commit. Do NOT ask "should I fix the lint error?" — just fix it. Only pause for genuine ambiguity (e.g., a test failure that could mean the fix is wrong, not auto-fixable lint).

---

## Agent Behavior

### Leverage AI Agent Speed — Challenge the "Wait" Default

> **Principle:** Don't defer parallelizable work. AI agents execute in minutes, not hours.

**Anti-pattern to watch:** Saying "we should wait until X is done" when work can be parallelized NOW.

**Example:**
- ❌ "Let's update docs after M1 ships (in 2 weeks)"
- ✅ Spawn 3 agents, update all docs in 15 minutes

**Calibration check:**
- If you catch yourself saying "this will take hours" → spawn agents and time it
- If work is parallelizable (no dependencies) → do it now, not later
- Document updates, file searches, multi-file refactors: **minutes with agents, not hours**

**Rule:** Don't defer parallelizable work. The cost of spawning agents (5 min) is less than the cost of context-switching back to it later (20+ min).

**When to use parallel agents:**
- Updating multiple doc files (lean canvas, workstreams, strategic docs)
- Searching/analyzing multiple code areas
- Running independent validations
- Any work with clear separation of concerns

---

### Dynamic Discovery

> **Principle:** Agents should discover current structure from files (Glob/Grep), not hardcode assumptions. Values that can change (workstream names, folder structures, schemas) must be discovered at runtime.

---

### Spawning Subagents with Roles

**Pattern:** `"You are a [role] specializing in [domain], top 1% in [skill]"`

**Example:** "You are a senior technical writer specializing in API documentation, top 1% in clarity"

**Add company context when domain-relevant** (e.g., "at Stripe" for payments, "at Vercel" for Next.js)

---

### MCP Configuration Safety

> **Principle:** NEVER touch MCP configs without backing up first.

Run `./scripts/mcp-validate.sh` and `./scripts/mcp-backup.sh "before-<change>"` before any change.

**Full guide:** [mcp-backup-recovery.md](docs/technical/mcp-backup-recovery.md) | **Checklist:** [mcp-pre-change-checklist.md](docs/technical/mcp-pre-change-checklist.md)

---

### Debugging

See [docs/technical/debugging.md](docs/technical/debugging.md) for full protocol.

**Quick rules:** (1) Verify current code before acting on screenshots, (2) For DB issues check RLS → migrations → columns, (3) Fix ONE root cause at a time, (4) For slow-deploy systems: diagnose ALL causes before deploying — one deployment, fully verified.

**(5) Query prod before static analysis.** For runtime/data/behavior issues: first tool is a live prod query (Supabase MCP, Sentry MCP, or `curl` against the API). Read static code only after you have real data. Exception: build/compile/type errors where no runtime data exists.

**(6) Browser verification required for UI changes.** A UI fix is not done until a screenshot or live browser check confirms it. "Tests pass" is necessary but not sufficient. Use Chrome DevTools MCP (headless) or Claude in Chrome (authenticated pages). Never declare a UI bug fixed based on code reading alone.

---

### Git & Commits

See [docs/technical/git-workflow.md](docs/technical/git-workflow.md) for full workflow.

**Quick rules:** Prompt for commits after logical units of work, run `./scripts/pre-commit-checks.sh` before committing.

**Process/port cleanup:** Use `lsof -ti:PORT | xargs kill` — never `pkill -f "PORT"` (pattern matching can kill Docker Desktop and other unrelated processes).

---

### Before Choosing Infrastructure Tools

> **Principle:** Never start building infrastructure without considering alternatives first.

Before setting up any external or self-hosted infrastructure (VNC, tunnels, services, proxies, remote desktop, CI pipelines — not local dev tooling):

1. List the top 2-3 alternatives with a one-line trade-off each
2. Pick the simplest one that meets the need. If one option is clearly right, state it and proceed — no forced comparison needed
3. State the choice explicitly before starting

**Why:** Complex infrastructure is hard to reverse. 2 minutes of comparison prevents hours of debugging the wrong tool.

---

### Risky Operations — Worktree Protection

> **Principle:** Risky or experimental changes should be isolated. Suggest a worktree before proceeding.

**Ask before:** Installing new global tools, major refactors (10+ files), new frameworks/build systems, anything labeled "experimental." (Running `./scripts/migrate.sh` on an existing migration file does NOT need asking — schema design decisions do.)

**Why:** Easy rollback if experiment fails.

---

### Task Tracking

> **Principle:** Non-trivial work should be visible. Suggest tracking, never force it.

**Creating features/bugs:** Use `/slava:build:quick-feature` (quick skeleton, 30 sec) or `/slava:build:create-prd` (comprehensive PRD, 3-5 min). Do NOT create files manually.

When starting non-trivial work (multi-file changes, features, bug fixes), suggest: "Want me to create a tracking task?" Never auto-create. If user declines, don't ask again that session. When done, update to `status: done`.

**Type classification:** `type: story` (user value), `task` (technical), `bug` (fix), `comment` (decisions).

**Multi-session work:** If a task involves external systems or infrastructure and is not fully verified complete when a session ends, suggest filing a spec before the next session starts. After context compaction, if complex in-progress work exists with no tracking spec, suggest creating one before continuing — specs survive compaction, context doesn't.

Feature spec rules (frontmatter, status values, P-number, lifecycle) auto-load when editing `features/` files via `.claude/rules/features.md`.

---

### Private vs Public Files

This repo is public (AGPL-3.0). Use `.private/` (gitignored) for anything that shouldn't be public:

- Service accounts, email addresses, operational infrastructure
- Personal decisions, private business notes
- Drafts not ready to share

**Rule:** When creating docs about accounts, credentials, personal contacts, or internal tooling → use `.private/docs/` by default. When in doubt, ask.

`.private/` mirrors the `docs/` structure. It has a double-safety `.gitignore` with `*`.

---

### Open Source Safety (PII Protection)

This repo is public. Before creating/updating files (especially `content/`, `docs/stories/`), check for: personal addresses/phones, private business details, location patterns. **When in doubt, ask:** "Is this safe to publish openly?"

---

## Skills — Local Only

**All skills live in `.claude/commands/slava/`** — visible in IDE, version controlled with project.

**Skill namespaces:** `build/` (dev lifecycle) · `maintain/` (repo health) · `content/` · `think/` · `util/` · `archive/` (houses deprecated skills). Never create a skill without a namespace — if none fits, propose a new one first.

**Approval required** before creating, modifying, or deleting skills, or installing plugins/MCP servers. **Always ask first:** "I'd like to create [X] for [reason]. OK?"

**Before editing `CLAUDE.md` or `.claude/rules/*.md`:** Run `/claude-md "description of what you want to add"` first. It validates whether the change belongs there, where it should actually go, and how to phrase it. Never edit these files directly without running the gate first.

### Sequential Flow — Current Standard

```
/create-prd → /ux (if UI) → /architect → /generate-tests → /spec-review* → /decompose* → /dev
```

`* /decompose` optional — complex features only (5+ files, 3+ concerns, or 6+ build steps). `* /spec-review` optional — use when spec has evolved significantly since architect review, or when you want a pre-dev sanity check.

Each layer has a review gate. `/dev` and `/fix` auto-close the feature on success (move to `features/done/`, set `completed_at`).

**Optional post-work:** `/verify` — live browser UAT + visual QA. Run when you care about look/feel.
- `/kdd` — capture notable learnings.
- `/review-all` — code + design + UX static review (no browser). Run after any non-trivial feature: multi-file changes, auth/RLS, or code you didn't closely supervise.

**Deprecated:** `/prep-spec`, `/done` — kept in archive for backward compatibility only.

See [docs/development-process.md](docs/development-process.md) for complete workflow documentation.

### Skill Invocation — After Approval

> **Rule:** When the user approves an approach in conversation ("let's do X", "do A+B"), invoke the matching skill — do NOT implement ad-hoc.

**Before approval:** When a task starts and the right flow is unclear (P-number mentioned, bug or feature described, "what do we do next"), proactively run `/pick-flow` rather than waiting to be asked. Skip for one-liner fixes or when the user names the exact commands.

**Name the skill you're running:** When informal language maps to a skill ("simplify this" → `/simplify`, "what now" → `/status`, "anything to kdd?" → `/kdd`, "wrap up" → `/wrap`), invoke the skill and name it — so the user learns the command exists.

| Situation | Invoke |
|-----------|--------|
| New feature approved | `/create-prd` (or `/quick-feature` for skeleton) |
| Bug fix approved | `/fix` |
| Implementation ready (spec exists) | `/dev` |

**Why:** Ad-hoc implementation bypasses test generation, spec tracking, and auto-close. The skill does the same work with none of the gaps.

**Exception:** One-liner config changes, typo fixes, or explicit "just do it inline" from the user.

---

## Tool Preferences

### Library Documentation (Context7)

**Before web-searching for library/framework docs, use Context7 first.**

Context7 MCP provides up-to-date docs for React, Supabase, Playwright, Tailwind, Ghost, Vite, Radix, and more.

**Workflow:** (1) `resolve-library-id` to find the library, (2) `query-docs` to ask a specific question.

---

### CLI Tools (Supabase & Sentry)

**Hybrid approach:** CLIs for scripting/automation, MCPs for conversational queries.

| Task | Use | Why |
|------|-----|-----|
| Database queries (ad-hoc) | Supabase MCP | Conversational, no connection string needed |
| Migrations & schema management | Supabase CLI | Version control, build automation |
| Type generation | Supabase CLI | Build step (`supabase gen types`) |
| Debug Sentry issues (ad-hoc) | Sentry MCP | Conversational, no issue IDs needed |
| Release management | Sentry CLI | CI/CD, scripting |
| Sourcemap uploads | Sentry CLI (via Vite) | Build automation |

**Full guide:** [cli-tools.md](docs/technical/cli-tools.md)

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
- `git reset HEAD` (no args) — resets the **entire** index, not just target files; always use `git reset HEAD -- file1 file2`
- `git stash` (agent-initiated) — agents must NOT stash unilaterally; only stash if user explicitly asks; prefer `git commit -m "wip: ..."` instead

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

See [architecture.md](docs/technical/architecture.md) for patterns.

Code style, design system, point display, and data fetching rules auto-load when editing `src/` files via `.claude/rules/src.md`.

Database migration rules, RLS debugging, and schema decisions auto-load when editing `supabase/` files via `.claude/rules/database.md`.

---

### Worktree Branch Naming

Worktree identity: `claritypledge-N` = wN. Branch names reflect feature, not worktree. See [worktree-setup.md](docs/technical/worktree-setup.md) for details.

---

## Reference Guide

**Product:** Calibrated communication practice via /live. Target: coaches.
Docs: [definitions.md](docs/definitions.md) | [lean-canvas.md](docs/lean-canvas.md) | [milestones/](docs/milestones/)

**Key commands:**
```bash
./scripts/pre-commit-checks.sh  # REQUIRED before committing
npm run kanban                   # Feature prioritization (port 9050)
npm run dev && npm test && npm run build  # Standard dev loop
```

**Where things live:** `docs/technical/` (guides) · `features/` (specs) · `src/app/` (source) · `e2e/` (tests) · `supabase/` (database) · `.claude/rules/` (path-specific agent rules)

**Source of truth docs:** `definitions.md` (concepts) · `lean-canvas.md` (business) · `milestones/` (hypothesis + metrics) · `decisions.md` (trade-offs) · `philosophy.md` (WHY). Never duplicate — add to source and link.

**Post-feature:** `/kdd` — captures knowledge in strategic + technical docs.

**Observability:** Mixpanel + Sentry are production-only. See [analytics.md](docs/technical/analytics.md).
