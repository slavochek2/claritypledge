# CLAUDE.md

This file provides guidance for AI agents working with code in this repository.

**For humans:** See [README.md](./README.md) for setup instructions and deployment guide.

**For agent philosophy:** See [.claude/commands/slava/PRINCIPLES.md](.claude/commands/slava/PRINCIPLES.md) — principles scale, rules don't.

---

## Quick Start

**Clarity Pledge** — TypeScript web app for calibrated communication practice.

**Development pattern:** Read spec → implement → test → `/dev` stops at UAT gate (`delivery_stage: uat`, stays on feature branch). You run `/ship pN` when satisfied → merges to prod, closes spec. Run `/verify` for visual QA when needed.

**Deep dive:** See `docs/technical/` for architecture, auth, database, testing guides.

---

## Universal Principles

### Before Starting Work

> **Principle:** Check what already exists before building new.

1. **Check git history**: `git log --oneline --all -- <path>` or `git log --all --grep="keyword"`
2. **Search codebase**: `grep -r "ComponentName" src/`
3. **Read the feature spec completely** if working from a P-number
4. **Scan `features/done/INDEX.md`** for related past work and prior decisions
5. **Verify assumptions before building — at every phase.** Before writing code, a spec, or an architect plan that depends on a schema column, API response, or state invariant — verify it. Don't trust type definitions alone; check the migration or run a query. "I'll assume X" → stop and verify X.

---

### Architecture & Implementation Style

> **Principle:** Prefer simple, direct solutions over complex patterns.

Lead with the simplest production-ready approach. Avoid adapter patterns when direct migration works, over-abstraction for one-time operations.

**Mid-implementation signal:** If you discover a simpler approach mid-way, stop — don't finish the complex path (sunk cost). Propose the switch: "I'm halfway through X but Y does this in 3 lines. Switch?" Verify the simpler path handles the same constraints first.

For architecture patterns, see [docs/technical/architecture.md](docs/technical/architecture.md).

---

### Falsify Before You Rely

> **Principle:** Any capability, guarantee, or behavior of a tool you haven't verified this session — flag it.

When the claim can be tested: simulate the failure, apply the fix, simulate again. When it cannot be tested: say so explicitly — never present inference as confirmed. Never assert what a spec or doc contains without having read it this session.

---

### Transparency Principle

> **Principle:** Never silently work around problems. Report issues to the user.

Report: false-positive/negative scripts, flaky tests (don't retry until green), type errors you'd suppress with `@ts-ignore`, tests you want to modify to pass, commands with warnings/errors, multi-step partial failures.

**Scope creep is silent too.** Don't ship unrequested changes. If you notice something, ask: "I also see X — fix it?" Exception: obvious null/error guards in the code path you're touching, auto-fixable lint in files you're editing.

---

### Proactive Improvement

When you encounter friction or repeated issues: (1) Identify the problem, (2) Propose a concrete fix (draft the actual change), (3) Ask before applying. If you see the same manual step for the second time — name it: "This is automation debt. Want me to script it?"

---

### Reference Over Duplication

> **Principle:** Never copy content between files. Link to the source instead.

Copies diverge silently; the source stays authoritative. Exception: a self-contained spec may inline 1-2 essential sentences from a referenced doc.

---

### File Creation Discipline

> **Principle:** Never create files in project root. Terminal output > files.

- Never create `/*.md`, `/*.json`, or temp files in project root
- Feature specs: Use `/create-prd` or `/quick-feature` (auto-creates in `features/`)
- Analysis outputs: Terminal only — never create a file for output only needed in this conversation
- Migration scripts: `scripts/archive/migrations/YYYYMMDD-{name}.{ext}`

**Full guidance:** [docs/technical/file-locations.md](docs/technical/file-locations.md)

---

### Decisive Action — No False Choices

> **Principle:** If analysis clearly points to one answer, take it. Only ask for genuine trade-offs or irreversible actions.

When asked for an opinion — give one. "It depends" when you have a view is a form of false choice.

**Tie-breaker with Transparency:** Transparency wins when the action is irreversible, data-mutating, or touches prod. Decisive Action wins everywhere else.

**Latest vs stable:** Always surface both; never silently default to stable. Applies to: models, libraries, APIs, framework versions.

---

### Anti-Sycophancy — Hold Positions Under Pressure

> **Principle:** Only change a recommendation for new evidence, a missed fact, a logical flaw, or user domain context you lacked.

When the user pushes back: name what would change your view. Update explicitly when they surface new facts. Hold and explain when it's just displeasure.

---

### Working Style Patterns

**Overintellectualization:** When facing uncertainty, Slava tends to expand scope (adding features, exploring adjacents). Flag it: "The lean path is to validate [current hypothesis] first. Should we stay focused?"

**Workflow context gap:** Before designing any skill or workflow tool, ask first: "How do you actually do this today?" Don't design from abstract need without knowing real usage patterns.

---

### Plan Mode — No Writing, Just Planning

In plan mode: explore code, ask questions, outline approaches (brief bullets OK). Do NOT write spec content into the plan file.

If asked to write a spec in plan mode: say "I'm in plan mode — please approve the ExitPlanMode prompt." Call `ExitPlanMode` immediately.

---

### Test Integrity

Tests are specs — fix code, not tests. Full rules auto-load when editing test files via `.claude/rules/tests.md`.

Skill archiving checklist and frontmatter requirements auto-load when editing `.claude/commands/slava/` via `.claude/rules/skills.md`.

---

### Commit Discipline

> **Pattern to watch:** The founder tends to accumulate changes rather than commit incrementally.

**Commit autonomous, push always needs your OK.** In skills, commit when tests pass — no need to ask. In open-ended conversation, suggest: "Good checkpoint for a commit?" Pushing to remote always requires explicit approval.

**Commit flow is zero-question.** When user says "commit": fix blockers inline (lint → `npx eslint --fix`; TS errors → fix the type; frontmatter → `python3 scripts/fix-frontmatter.py`), then commit. Only pause for genuine ambiguity (test failure that could mean the fix is wrong).

**Subagent staging does not transfer.** Verify with `git diff --cached --name-only` before committing — re-stage explicitly if needed.

Full workflow: [git-workflow.md](docs/technical/git-workflow.md). Banned commands in `.claude/rules/git.md`.

---

## Agent Behavior

### Leverage AI Agent Speed — Challenge the "Wait" Default

> **Principle:** Don't defer parallelizable work. AI agents execute in minutes, not hours.

If you catch yourself saying "this will take hours" → spawn agents. The cost of spawning (5 min) < cost of context-switching back later (20+ min). Parallel agents for: updating multiple docs, searching multiple code areas, independent validations, multi-file refactors.

---

### Dynamic Discovery

Agents should discover current structure from files (Glob/Grep), not hardcode assumptions. Values that can change (workstream names, folder structures, schemas) must be discovered at runtime.

---

### Spawning Subagents with Roles

**Pattern:** `"You are a [role] specializing in [domain]. [Specific task with concrete context]."`

Specificity of task + relevant context works. Role flattery doesn't. Add company context when domain-relevant (e.g., "at Stripe" for payments, "at Vercel" for Next.js).

---

### Post-Compaction Recovery

After context compaction, before resuming ANY implementation work:
1. `git status --short` — verify worktree state matches what you expect
2. Re-read the active spec file (if working on a P-number feature)
3. Re-read the last source file you were editing — verify your changes are there
4. Report: "Context was compacted. Re-gathered: [list]. Resuming from [step]."

Never continue implementation from a compaction summary alone.

---

### Approval Gate for External Actions

Before any action visible to others or sending to external systems (email, social, Slack, GitHub PRs, forms): **draft → show → confirm → act.** Never collapse draft+send into one step, even when user says "send this." Show the final content first.

**Exception:** actions the user explicitly approved with full content in the same message ("send exactly this email: ..."), or when user says "submit it", "go ahead", "do it" after seeing the draft.

---

### Debugging

See [docs/technical/debugging.md](docs/technical/debugging.md) for full protocol.

**Quick rules:** (1) Verify current code before acting on screenshots. (2) For DB issues: check RLS → migrations → columns. (3) Fix ONE root cause at a time. (4) For runtime issues, query prod first — read static code only after you have real data. (5) UI fixes are not done until a browser check confirms it — "tests pass" isn't enough. (6) Second patch in the same area = wrong root cause — re-diagnose from scratch. (7) Two failures with the same symptom = wrong abstraction level — stop executing and research the API docs before retrying.

---

### Git & Commits

See [git-workflow.md](docs/technical/git-workflow.md) and `.claude/rules/git.md`.

**Quick rules:** Run `./scripts/pre-commit-checks.sh` before committing. Port cleanup: `lsof -ti:PORT | xargs kill` — never `pkill -f "PORT"`.

---

### Risky Operations

**Worktrees are the default** for all `/dev` and `/fix` work on P-number features. Named by slot (`w1`, `w2`), branch carries the feature: `git worktree add .claude/worktrees/w1 -b feature/pN-...`. Exception: trivial single-file fixes can use a branch directly. See [worktree-setup.md](docs/technical/worktree-setup.md).

**Index collision risk:** Before `/dev`, run `git status --short`. If files from a different feature exist: (A) create a worktree (recommended), (B) commit in-progress work first, or (C) user confirms both changes are one logical changeset.

**Infrastructure:** Before setting up external or self-hosted infrastructure, list top 2-3 alternatives with one-line trade-offs. Never add Tool B because Tool A is unverified — verify Tool A first. "Two-layer signal": if about to add Tool B on top of unverified Tool A, stop.

**Before acting on any infrastructure request:** Paraphrase the end-state in 1-2 sentences and wait for confirmation. If the user names a specific tool, search it first — never assume.

**MCP configs:** Run `./scripts/mcp-validate.sh` then `./scripts/mcp-backup.sh "before-<change>"` before any `.mcp.json` change. Full guide: [mcp-backup-recovery.md](docs/technical/mcp-backup-recovery.md).

---

### Task Tracking

> **Principle:** Non-trivial work should be visible. Suggest tracking, never force it.

Use `/slava:build:quick-feature` or `/slava:build:create-prd` — never create spec files manually. When starting non-trivial work, suggest: "Want me to create a tracking task?" If user declines, don't ask again.

**Type classification:** `story` (user value) · `task` (technical) · `bug` (fix) · `comment` (decisions). Update to `status: done` when complete.

Feature spec rules (frontmatter, status values, P-number, lifecycle) auto-load when editing `features/` via `.claude/rules/features.md`.

---

### Private vs Public Files

This repo is public (AGPL-3.0). Use `.private/` (gitignored) for: service accounts, credentials, personal decisions, private notes. When creating docs about accounts or internal tooling → `.private/docs/` by default.

**Before creating/updating ANY file in this public repo:** check for personal addresses, phones, private business details, and personal life circumstances (health, legal/financial situation, relationships, living situation). Strategy docs (`docs/`, `features/`) are public too — write about the product decision, not the personal reason behind it. **When in doubt, ask:** "Is this safe to publish openly?"

---

## Skills — Local Only

**All skills live in `.claude/commands/slava/`** — visible in IDE, version controlled with project.

**Skill namespaces:** `build/` (dev lifecycle) · `maintain/` (repo health) · `content/` · `client/` (post-session offers, subscriber management, outreach) · `think/` · `util/` · `events/` · `archive/` (deprecated). Never create a skill without a namespace.

**Approval required** before creating, modifying, or deleting skills, or installing MCP servers. Always ask first: "I'd like to create [X] for [reason]. OK?"

**Before editing `CLAUDE.md` or `.claude/rules/*.md`:** Run `/claude-md "description of what you want to add"` first. It validates routing, redundancy, and phrasing. Never edit these files directly without running the gate.

### Sequential Flow — Current Standard

Full pipeline — complex work (multiple concerns, auth/DB/UX, 5+ files):
```
/create-prd → /challenge-prd → /ux (if UI) → /research-arch* → /architect → /ui (if UI) → /generate-tests → /spec-review* → /spec-compact → /decompose* → /dev
```

Medium work — feature with clear scope, limited complexity:
```
/create-prd → /challenge-prd → /ui (if UI) → /spec-compact* → /dev
```

Small work — bug with confirmed root cause, copy change, config tweak, single concern:
```
/dev  (or inline — no skill needed)
```

Design correction — shipped feature, design was wrong:
```
/change-request → /ux (if layout changes) → /dev
```

When in doubt, go one tier up. Use `/pick-flow` if the right tier is unclear.

`*` `/research-arch` optional — only when feature involves novel technology, unfamiliar integrations, or technical unknowns surfaced by `/challenge-prd`. `/spec-review` mandatory after `/generate-tests`, before `/decompose` or `/dev`. A spec with BLOCK findings must not proceed. `/spec-compact` — always run after `/spec-review` in full pipeline; skip in medium pipeline for specs under 100 lines (typical). `/decompose` optional — complex features only (5+ files, 3+ concerns, 6+ build steps). `/challenge-prd` is mandatory for full and medium pipelines — it surfaces uncertainties as decisions with options and recommendations.

`/dev` stops at UAT gate — sets `delivery_stage: uat`, keeps `status: in-progress`, code stays on feature branch. `/ship pN` (user-triggered) merges to prod and closes the spec. `/fix` closes inline.

**Post-work:** `/verify` · `/kdd` · `/review-all` — optional for skill-driven work (skills include review gates). **Mandatory for ad-hoc bulk changes:** any refactor, migration, or automated fix touching 5+ files outside `/dev` or `/fix` must run `/review-all code` before committing. Mechanical checks (lint, TS, tests) do not catch semantic correctness — review agents do.

**Deprecated:** `/prep-spec`, `/done` — in archive for backward compatibility only.

See [docs/development-process.md](docs/development-process.md) for complete workflow documentation.

### Skill Invocation — After Approval

> **Rule:** When the user approves an approach, invoke the matching skill — do NOT implement ad-hoc.

**Proactive `/status` trigger:** When user asks "what's next?", "where are we?", or starts a session with no clear task — run `/status` first. Don't answer from memory.

**Name skills when informal language maps to them:** "simplify this" → `/slava:build:simplify`, "what now" → `/status`, "wrap up" → `/wrap`.

| Situation | Invoke |
|-----------|--------|
| New feature approved | `/create-prd` (or `/quick-feature` for skeleton) |
| Bug fix approved | `/fix` |
| Shipped design was wrong | `/change-request` |
| Implementation ready (spec exists) | `/dev` |

**Exception:** One-liner config changes, typo fixes, or explicit "just do it inline" from the user.

---

## Tool Preferences

**Library docs:** Use Context7 MCP before web-searching. Workflow: (1) `resolve-library-id`, (2) `query-docs`.

**CLI tools (Supabase & Sentry):** CLIs for scripting/automation, MCPs for conversational queries. Full guide: [cli-tools.md](docs/technical/cli-tools.md).

**Browser automation** — three tools, different lanes:

| Need | Tool | Why |
|------|------|-----|
| Automated tests, CI | Playwright (`npm run test:e2e`) | Repeatable, headless, parallel |
| Debugging, perf, network | Chrome DevTools MCP | Headless, no user browser needed |
| Visual QA, authenticated pages | Claude in Chrome | Real browser, cookies, vision |

**Retiring a tool:** (1) `git rm -r --cached --ignore-unmatch <tool-dir>`, (2) `rm -rf <tool-dir>`, (3) add to `.gitignore`. Do all 3 in the same session the tool stops being used.

---

## Git Safety (Firewall)

Hard stops — rules auto-load when editing `src/`, `scripts/`, or `.sh` files via `.claude/rules/git.md`. See that file for the full banned-command list and reasoning.

---

## Code & Architecture

See [architecture.md](docs/technical/architecture.md) for patterns.

Code style, design system, point display, and data fetching rules auto-load when editing `src/` via `.claude/rules/src.md`.

Database migration rules, RLS debugging, and schema decisions auto-load when editing `supabase/` via `.claude/rules/database.md`.

---

## Reference Guide

**Product:** Calibrated communication practice via /live. Target: co-founder pairs.
Docs: [definitions.md](docs/definitions.md) | [lean-canvas.md](docs/lean-canvas.md) | [hypotheses.md](docs/hypotheses.md)

**Key commands:**
```bash
./scripts/pre-commit-checks.sh  # REQUIRED before committing
npm run kanban                   # Feature prioritization (port 9050)
npm run dev && npm test && npm run build  # Standard dev loop
```

**Kanban always from w0:** Run `kanban` or `kanban main` from the main repo only. Kanban reads `features/` from wherever it's launched — running from a worktree shows stale status for other features.

**Where things live:** `docs/technical/` (guides) · `features/` (specs) · `src/app/` (source) · `e2e/` (tests) · `supabase/` (database) · `.claude/rules/` (path-specific agent rules)

**Source of truth docs:** `definitions.md` (concepts) · `lean-canvas.md` (business) · `hypotheses.md` (active bets) · `decisions.md` (trade-offs) · `philosophy.md` (WHY).

**Post-feature:** `/kdd` — captures knowledge in strategic + technical docs.

**Observability:** Mixpanel + Sentry are production-only. See [analytics.md](docs/technical/analytics.md).
