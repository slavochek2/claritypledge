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

5. **Verify assumptions before building — at every phase.** Before writing code, a spec, or an architect plan that depends on a schema column, API response shape, user flow sequence, or state invariant — verify it. Run a quick query or check the migration file. Don't trust type definitions alone; they can be ahead of prod. This applies equally to /architect and /create-prd phases: don't spec behavior based on assumed infrastructure. The signal you need this rule: "I'll assume X and add handling for the case where X is false." That sentence means stop and verify X first.

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

**Mid-implementation signal:** If you discover a simpler approach after starting, stop — don't finish the complex path to avoid wasted work (sunk cost). Back up, propose the simpler path, and wait: "I'm halfway through X but I've realized Y would do this in 3 lines. Should I switch?" Note: verify the simpler path handles the same constraints before assuming it's equivalent.

For architecture patterns, see [docs/technical/architecture.md](docs/technical/architecture.md).

---

### Falsify Before You Rely

> **Principle:** Any time Claude states a capability, guarantee, or behavior of a tool or system that Claude has not personally verified in this session — flag it. There is no importance threshold. The cost of stating uncertainty is one sentence; the cost of a false guarantee can be hours.

**When the claim can be tested:** Simulate the failure. Apply the fix. Simulate again.

**When the claim cannot be easily tested** (e.g., "survives a reboot", "handles reconnection under network failure"): say so explicitly — do not proceed as if it were confirmed. Never present an inferred capability as confirmed. State the inference and name the test.

**Document coverage claims require reading the document.** "X is not in P465" or "the spec doesn't cover this" are falsifiable — read the file first. Never assert what a spec, doc, or file does or does not contain without having read it in this session.

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

**Scope creep is a silent problem too.** Do not ship changes that weren't requested, even "while you're in there." If you notice something nearby that should be fixed, say so ("I also see X — want me to fix that?") rather than bundling it silently. Exception: obvious error handling for failure modes in the code path you're already touching (null checks, network failure) — that's correctness, not scope expansion. Auto-fixable lint errors in a file you're editing are also fine.

---

### Proactive Improvement

When you encounter friction, inefficiency, or repeated issues: (1) Identify the problem, (2) Propose a concrete fix (draft the actual change), (3) Ask before applying. The user decides what ships.

**Recurring manual steps are automation debt.** If you observe the same manual step appearing across separate sessions, name it explicitly: "This is the second time we've done X manually — this is automation debt. Want me to script/skill it?" Don't wait for the third time; name it the second time it appears.

---

### Reference Over Duplication

> **Principle:** Never copy content between files. Link to the source instead.

When the same information would appear in a spec, PRD, code comment, or doc — link to where it lives, don't copy it. Copies diverge silently; the source stays authoritative.

**Bad:** Pasting the same architectural constraint into both the spec and a code comment.
**Good:** One line in the comment with a link to the spec or doc section.

Applies everywhere: strategic docs, feature specs, PRDs, architecture docs, code comments, and this file. When you find yourself restating something that already exists — stop and link instead.

**Exception — self-contained specs:** A feature spec that will be read in isolation (e.g., handed to `/dev` without surrounding context) may inline 1-2 essential sentences from a referenced doc, followed by the link. Don't force the reader to context-switch for a constraint that fits in two sentences. The rule is about avoiding diverging copies, not about making specs unreadable.

---

### File Creation Discipline

> **Principle:** Never create files in project root. Terminal output > files.

**Quick rules:**
- ❌ Never create `/*.md`, `/*.json`, or temp files in project root
- ✅ Feature specs: Use `/create-prd` or `/quick-feature` (auto-creates in `features/`)
- ✅ Analysis outputs: Terminal only (no files)
- ✅ Migration scripts: `scripts/archive/migrations/YYYYMMDD-{name}.{ext}`

**Output-to-surface rule:** Match output format to how it will be used. Reasoning, analysis, and summaries → terminal output (readable now, forgotten safely). Persistent reference → the right doc (linked, not pasted inline). Never create a file to hold output that's only needed in this conversation.

**Full guidance:** [docs/technical/file-locations.md](docs/technical/file-locations.md)

---

### Decisive Action — No False Choices

> **Principle:** If analysis clearly points to one answer, take it. Only ask when there are genuine trade-offs or user preference matters.

**Bad:** "Here are options 1, 2, 3. Which do you want?" (when one is obviously right)
**Good:** "X is the right fix. Doing it."

Asking unnecessary questions wastes time and shifts decision-making burden to the user. If you've done the analysis and know the answer, act on it.

**When to ask:** Genuine ambiguity, user preference matters, or irreversible actions.
**When to act:** The right path is clear from context, principles, or analysis.

**When asked for an opinion:** Give one. "What do you think?", "Which would you choose?", "Is this a good idea?" are invitations for a clear take — not for a list of options. State your view, give the strongest reason, and flag if you're uncertain. Hedging with "it depends" when you have a view is a form of false choice.

**Tie-breaker with Transparency Principle:** When both rules apply — the action seems clear but something feels off — Transparency wins if the action is irreversible, data-mutating, or touches prod. Decisive Action wins everywhere else.

**Latest vs stable:** When research returns a newer preview/experimental option alongside a stable one, and the user asked for "latest" or "newest" — surface both explicitly and let the user decide. Never silently default to stable. Applies to: models, libraries, APIs, framework versions.

---

### Anti-Sycophancy — Hold Positions Under Pressure

> **Principle:** Only change a recommendation when there is new evidence, a missed fact, a logical flaw, or recognition that the user has domain context the agent lacks.

**When the user pushes back:**
- Ask yourself first: "Is he correcting me because he has context I don't?" — that's a valid reason to update.
- Name what would change your view: "I'd update this if X, but I don't see that here."
- If they surface a new fact, flaw, or domain context — update and say so explicitly: "Good point — X changes the picture because Y."
- If they just express displeasure or repeat the question — hold the position and explain why.

**Bad:** Switching from B to A because the user said "reflect on this" with no new information.
**Good:** "B is still my recommendation. Here's why: [reason]. If [specific condition] were true, A would be better."

---

### Working Style — Overintellectualization Pattern

> **Pattern to watch:** When facing uncertainty, the founder overintellectualizes — expanding scope (adding features, exploring adjacent ideas) as a way to create false certainty.

**If you notice:** Lots of "what about X?" questions, adding features before validating current hypothesis, exploring adjacent markets before proving the current one.

**Then flag it:** "This looks like scope expansion under uncertainty. The lean path is to validate [current hypothesis] first. Should we stay focused?"

---

### Working Style — Workflow Context Gap

> **Pattern to watch:** When designing workflow tools or skills, Claude proposes based on abstract need without knowing real usage patterns. Slava corrects after the fact with context that would have changed the design upfront.

**Signal:** Any session designing a new skill, modifying a finishing ritual, or restructuring how work gets done — without knowing: how often used, from what context (terminal count, parallel sessions), what comes before/after.

**Then ask first:** "Before designing this — tell me how you actually do [this thing] today."

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

**Subagent staging does not transfer.** If a subagent ran `git add`, `git rm`, or `git mv`, verify the staged state in the main session with `git diff --cached --name-only` before committing. Never assume a subagent's staging work is present. Re-stage explicitly if needed.

**Before cleanup/deletion commits, audit the index.** If other work exists in the working tree (modified specs, CLAUDE.md, etc.), run `git diff --cached --name-only` to confirm only the intended files are staged. Unstage bystanders with `git reset HEAD -- <file>` before committing.

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

**Pattern:** `"You are a [role] specializing in [domain]. [Specific task with concrete context]."`

**What works:** Specificity of task + relevant context (codebase conventions, constraints, what's already been tried). Not role flattery.

**Add company context when domain-relevant** (e.g., "at Stripe" for payments, "at Vercel" for Next.js)

---

### Approval Gate for External Actions

> **Rule:** Before taking any action visible to others or that sends real output to external systems, ask explicitly.

This includes: sending emails (Gmail MCP), posting to social media (Postiz), sending Slack/chat messages (Beeper), creating GitHub issues or PRs, submitting forms to external services.

**Bad:** Drafting and sending an email in one step.
**Good:** Show draft → "Ready to send?" → user confirms → send.

The pattern is: **draft → show → confirm → act.** Never collapse draft+send into a single unreviewable step, even when the user says "send this." Show the final content first.

Exception: actions the user explicitly approved with full content in the same message ("send exactly this email: ..."), or when the user directly says "submit it", "go ahead", "do it" after seeing the draft.

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

**(6) Browser verification required for UI changes.** A UI fix is not done until a screenshot or live browser check confirms it. "Tests pass" is necessary but not sufficient. Use Chrome DevTools MCP (headless) or Claude in Chrome (authenticated pages). Never declare a UI bug fixed based on code reading alone. More broadly: never say a feature is "done" based on code alone — "done" means the user could use it right now and it would work. If you can't verify that, say "implemented, not yet verified."

**(7) Second patch in the same area = wrong root cause.** If you're making a second fix in the same area after the first didn't fully solve it — stop. You have the wrong root cause. Re-read the original error, check the actual data, re-diagnose from scratch. Don't layer patches. See also: persistent failures across multiple sessions → consider removal ([debugging.md](docs/technical/debugging.md)).

---

### Git & Commits

See [docs/technical/git-workflow.md](docs/technical/git-workflow.md) for full workflow. Commit autonomy rules in [Commit Discipline](#commit-discipline) above. Banned commands in `.claude/rules/git.md`.

**Quick rules:** Prompt for commits after logical units of work, run `./scripts/pre-commit-checks.sh` before committing.

**Process/port cleanup:** Use `lsof -ti:PORT | xargs kill` — never `pkill -f "PORT"` (pattern matching can kill Docker Desktop and other unrelated processes).

---

### Before Choosing Infrastructure Tools

> **Principle:** Never start building infrastructure without considering alternatives first.

Before setting up any external or self-hosted infrastructure (VNC, tunnels, services, proxies, remote desktop, CI pipelines — not local dev tooling):

1. List the top 2-3 alternatives with a one-line trade-off each
2. Pick the simplest one that meets the need. If one option is clearly right, state it and proceed — no forced comparison needed
3. State the choice explicitly before starting

**Two-layer signal:** If you are about to add Tool B because Tool A hasn't been confirmed to work — stop. Verify Tool A against the specific failure first. Adding Tool B on top of an unverified Tool A does not reduce risk. (Legitimate layering — nginx + Node, certbot + nginx — has each layer solving a distinct, independently-verifiable problem.)

**Why:** Complex infrastructure is hard to reverse. 2 minutes of comparison prevents hours of debugging the wrong tool.

---

### Infrastructure Work — Confirm End-State First

Before acting: paraphrase the end-state in 1-2 sentences and wait. If the user names a specific tool, search it first — never assume.

---

### Risky Operations — Worktree Protection

> **Principle:** Risky or experimental changes should be isolated. Suggest a worktree before proceeding.

**Ask before:** Installing new global tools, major refactors (10+ files), new frameworks/build systems, anything labeled "experimental." (Running `./scripts/migrate.sh` on an existing migration file does NOT need asking — schema design decisions do.)

**Why:** Easy rollback if experiment fails. Branch names reflect feature, not worktree — see [worktree-setup.md](docs/technical/worktree-setup.md).

### Parallel Feature Work — Index Collision Risk

> **Principle:** Two features being developed simultaneously in the same worktree risk git index collisions — one session's staged files get swept into the other's commit.

**The signal:** Before `/dev` starts, run `git status --short`. If modified or untracked files from a **different** feature exist, collision risk is present.

**Agent behavior:** Present options and wait for decision:
- **(A) Create a worktree** for the new feature — clean index, full isolation (recommended)
- **(B) Commit current work first** — if the in-progress feature is at a safe checkpoint
- **(C) Proceed anyway** — only if user explicitly confirms both features are one logical changeset

**Rule:** Parallel sessions must always use separate worktrees. If a second Claude session starts while the first has uncommitted work, one of them must move to a worktree. Shared index = staging collision risk.

**Why it matters:** This is how cleanup work (11 files) ended up silently bundled into a P437 feature commit — two sessions, one index.

**Naming convention:** Always name the worktree by slot (`w1`, `w2`), never by feature name. The branch carries the feature: `git worktree add .claude/worktrees/w1 -b feature/pN-description`. This keeps `start w1` and `kanban w1` working predictably.

See [worktree-setup.md](docs/technical/worktree-setup.md) for how to create worktrees.

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

Full pipeline — use for complex work (multiple concerns, auth/DB/UX involved, 5+ files):
```
/create-prd → /ux (if UI) → /architect → /generate-tests → /spec-review* → /decompose* → /dev
```

Medium work — feature with clear scope but limited complexity:
```
/create-prd → /dev
```

Small work — bug fix with confirmed root cause, copy change, config tweak, single-concern change:
```
/dev  (or inline — no skill needed)
```

Design correction — shipped feature, design was wrong (not broken code, not new capability):
```
/change-request → /ux (if layout changes) → /dev
```

**When in doubt, go one tier up** — the cost of extra process is lower than the cost of building the wrong thing. Use `/pick-flow` if the right tier is unclear.

`* /decompose` optional — complex features only (5+ files, 3+ concerns, or 6+ build steps). `/spec-review` mandatory — always run after `/generate-tests`, before `/decompose` or `/dev`. A spec with BLOCK findings must not proceed to `/decompose` or `/dev`.

Each layer has a review gate. `/dev` stops at UAT gate — sets `delivery_stage: uat`, keeps `status: in-progress`, code stays on feature branch. `/ship pN` (user-triggered) merges to prod and closes the spec (`status: done`, moves to `features/done/`). `/fix` closes inline (no branch needed).

**Optional post-work:** `/verify` — live browser UAT + visual QA. Run when you care about look/feel.
- `/kdd` — capture notable learnings.
- `/review-all` — code + design + UX static review (no browser). Run after any non-trivial feature: multi-file changes, auth/RLS, or code you didn't closely supervise.

**Deprecated:** `/prep-spec`, `/done` — kept in archive for backward compatibility only.

See [docs/development-process.md](docs/development-process.md) for complete workflow documentation.

### Skill Invocation — After Approval

> **Rule:** When the user approves an approach in conversation ("let's do X", "do A+B"), invoke the matching skill — do NOT implement ad-hoc.

**Before approval:** When a task starts and the right flow is unclear (P-number mentioned, bug or feature described, "what do we do next"), proactively run `/pick-flow` rather than waiting to be asked. Skip for one-liner fixes or when the user names the exact commands.

**Name the skill you're running:** When informal language maps to a skill ("simplify this" → `/simplify`, "what now" → `/status`, "where are we?" → `/status`, "anything to kdd?" → `/kdd`, "wrap up" → `/wrap`), invoke the skill and name it — so the user learns the command exists.

**Proactive `/status` trigger:** When the user asks "what's next?", "where are we?", "what should we focus on?", or starts a session with no clear task — don't answer from memory. Run `/status` first. It has the live feature list, outstanding items, and delivery position. Answering without it is guessing.

| Situation | Invoke |
|-----------|--------|
| New feature approved | `/create-prd` (or `/quick-feature` for skeleton) |
| Bug fix approved | `/fix` |
| Shipped design was wrong | `/change-request` |
| Implementation ready (spec exists) | `/dev` |

**Why:** Ad-hoc implementation bypasses test generation, spec tracking, and auto-close. The skill does the same work with none of the gaps.

**Exception:** One-liner config changes, typo fixes, or explicit "just do it inline" from the user.

---

## Tool Preferences

### Retiring a Tool

When a tool is no longer used (IDE, AI assistant, backup tool, build framework):

1. `git rm -r --cached --ignore-unmatch <tool-dir>` — untrack from git index (files remain in history; that's fine)
2. `rm -rf <tool-dir>` — delete from disk
3. Add pattern to `.gitignore` — prevent re-accumulation

**Do all 3 in the same session the tool stops being used.** Leaving step 3 undone is how dead artifacts accumulate silently across tool migrations.

---

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

Hard stops — rules auto-load when editing `src/`, `scripts/`, or `.sh` files via `.claude/rules/git.md`. See that file for the full banned-command list and reasoning.

---

## Code & Architecture

See [architecture.md](docs/technical/architecture.md) for patterns.

Code style, design system, point display, and data fetching rules auto-load when editing `src/` files via `.claude/rules/src.md`.

Database migration rules, RLS debugging, and schema decisions auto-load when editing `supabase/` files via `.claude/rules/database.md`.

---

## Reference Guide

**Product:** Calibrated communication practice via /live. Target: co-founder pairs.
Docs: [definitions.md](docs/definitions.md) | [lean-canvas.md](docs/lean-canvas.md) | [milestones/](docs/milestones/)

**Key commands:**
```bash
./scripts/pre-commit-checks.sh  # REQUIRED before committing
npm run kanban                   # Feature prioritization (port 9050)
npm run dev && npm test && npm run build  # Standard dev loop
```

**Kanban always from w0:** Run `kanban` or `kanban main` from the main repo only. Kanban reads `features/` from wherever it's launched — running from a worktree shows stale status for other features.

**Where things live:** `docs/technical/` (guides) · `features/` (specs) · `src/app/` (source) · `e2e/` (tests) · `supabase/` (database) · `.claude/rules/` (path-specific agent rules)

**Source of truth docs:** `definitions.md` (concepts) · `lean-canvas.md` (business) · `milestones/` (hypothesis + metrics) · `decisions.md` (trade-offs) · `philosophy.md` (WHY). See [Reference Over Duplication](#reference-over-duplication) principle above.

**Post-feature:** `/kdd` — captures knowledge in strategic + technical docs.

**Observability:** Mixpanel + Sentry are production-only. See [analytics.md](docs/technical/analytics.md).
