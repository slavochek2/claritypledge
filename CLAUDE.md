# CLAUDE.md

This file provides guidance for AI agents working with code in this repository. **Budget: ≤350 lines.** Adding content requires removing equivalent lines. Enforced by `pre-commit-checks.sh`.

**For humans:** See [README.md](./README.md) for setup instructions and deployment guide.

**For agent philosophy:** See [.claude/commands/slava/PRINCIPLES.md](.claude/commands/slava/PRINCIPLES.md) — principles scale, rules don't.

---

## Quick Start

**Clarity Pledge** — Vite + React 19 SPA (NOT Next.js) for calibrated communication practice — routes in `src/App.tsx`, pages in `src/app/pages/`, Supabase backend.

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
5. **Verify assumptions before building — at every phase, scoped to schema/API/state dependencies.** Before writing code, a spec, or an architect plan that depends on a schema column, API response, or state invariant — verify it. A change with no such dependency (copy, CSS, styling-only) doesn't need this pass. Don't trust type definitions alone; check the migration files and `docs/technical/database.md`. "I'll assume X" → stop and verify X. **For answering questions about existing behavior:** a pure "what does it do" fact (is there a loading state, what prop name) — read the code directly. But if the question is "why is it built this way," "is it safe to change this," or the code looks deliberate-but-odd — `grep docs/decisions.md` for the relevant token first (when unsure which kind of question it is, treat it as a rationale question): the log holds invariants and rejected alternatives that source grep cannot surface.

---

### Architecture & Implementation Style

> **Principle:** Prefer simple, direct solutions over complex patterns.

Lead with the simplest production-ready approach. Avoid adapter patterns when direct migration works, over-abstraction for one-time operations. Before any proposal, state why the current state might already be sufficient — argue against building before arguing for it. **The against-argument carries the same evidentiary burden as the for-argument** — and it is the only one nothing downstream catches, because if it lands, no code runs and no test fires. "Blast radius", "needs its own spec", "nobody reviewed that" are claims: read the file and cite the lines, or don't make the claim.

**Founder decisions:** Never fill in CTA text, pricing, tone, naming, or value propositions without being told. Mark each with `[FOUNDER DECISION: ...]` and ask.

**Mid-implementation signal:** If you discover a simpler approach mid-way, stop — don't finish the complex path (sunk cost). Propose the switch: "I'm halfway through X but Y has fewer runtime failure modes. Switch?" Verify the simpler path handles the same constraints first.

For architecture patterns, see [docs/technical/architecture.md](docs/technical/architecture.md).

---

### Quality Over Build Speed

> **Principle:** When recommending build options, time is not a criterion — unless iteration speed genuinely blocks a hypothesis test. In that case, tag it `[SPEED: blocks hypothesis <name>]`; it may never outrank correctness or security.

Rank reasons: (1) user outcome / mission fit, (2) correctness, (3) security, (4) stability, (5) sustainability, (6) runtime complexity. `[SPEED:]` may enter at (1) only when blocking a stated hypothesis; it can never displace (2) or (3).

**Runtime complexity** = observable units only: processes, network hops, state-machine states, failure modes, external dependencies, concurrent actors. NOT lines of code — authoring effort.

**Banned phrasing** (build-option recommendations): "faster", "quicker", "less effort", "cleaner", "leaner", "lightweight", "straightforward", "low-effort", "minimal", "trivial", "overkill", "X min vs Y min", "just a few lines", "weekend project", "low-hanging fruit". "Simpler" is valid only when naming a concrete runtime unit saved. Iteration speed? Use `[SPEED: ...]` instead.

**Template:** "Recommend A over B because [ranked dimension]: [runtime-observable consequence]."

**Scope:** governs build-option recommendations — not the agent's own work-scheduling (parallelize vs defer). See "Leverage AI Agent Speed."

**Exception:** live incidents or throwaways marked `[EXPIRES: YYYY-MM-DD]` — name the category.

---

### Falsify Before You Rely

> **Principle:** Any capability, guarantee, or behavior of a tool you haven't verified this session — flag it.

When the claim can be tested: simulate the failure, apply the fix, simulate again. When it cannot be tested: say so explicitly — never present inference as confirmed. Never assert what a spec or doc contains without having read it this session. **Easy-to-miss categories:** env vars and model-behavior knobs (verify applicability to the running model before recommending); savings percentages from research subagents (flag as unverified unless sourced).

---

### Evidence Over Declaration

> **Principle:** Never say "done." Provide evidence; the user decides completion.

Present observable output — test results, screenshots, query output, command logs — and say: "Evidence produced: [output]. Awaiting your confirmation." Reasoning about code ("this should work because...") is not evidence. Running it and pasting the result is. Completion claims on any spec'd work require per-AC evidence — see the `/ship` gate. "Tests pass" is evidence for the ACs the tests cover, nothing more.

---

### Transparency Principle

> **Principle:** Never silently work around problems. Report issues to the user.

Report: false-positive/negative scripts, flaky tests (don't retry until green), type errors you'd suppress with `@ts-ignore`, tests you want to modify to pass, commands with warnings/errors, multi-step partial failures.

**Scope creep is silent too.** Don't ship unrequested changes. If you notice something, ask: "I also see X — fix it?" Exception: obvious null/error guards in the code path you're touching, auto-fixable lint in files you're editing.
**Cut prose when asked to simplify.** When the user signals "too much," "simplify," or asks for options — strip framing and rationale prose; the comparison/decision surface is the deliverable, not the explanation around it.

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
- Feature specs: Use `/create-spec` (auto-creates in `features/`)
- Analysis outputs: Terminal only — never create a file for output only needed in this conversation
- Migration scripts: `scripts/archive/migrations/YYYYMMDD-{name}.{ext}`

**Full guidance:** [docs/technical/file-locations.md](docs/technical/file-locations.md)

---

### Decisive Action — No False Choices

> **Principle:** If analysis clearly points to one answer, take it. Only ask for genuine trade-offs or irreversible actions.

When asked for an opinion — give one. "It depends" when you have a view is a form of false choice.

**Reversibility classifier — three lists, no judgment needed:**

ALWAYS-ACT (never ask): code changes on a branch, lint/format fixes, creating files in `.private/`, local git commits in skills context (see Commit Discipline for the open-conversation default), running tests, reading/searching code, reverting a single uncommitted edit you made yourself this session, npm install (devDependencies).

ALWAYS-ASK (never skip): `git push`, deploy to prod, send email/message/social post, DELETE/TRUNCATE/DROP on any DB (any env), merge to main, run migrations on prod, modify `.env.prod`, create/modify GitHub PR, publish anything.

JUDGMENT (use context): npm install (dependencies), DB migrations on test, modifying shared config (`CLAUDE.md`, `.claude/rules/`), bulk file operations (5+ files), infrastructure changes, discarding uncommitted work via `git checkout HEAD --`/`git restore` on more than one file, or on any file you did not just edit yourself — see [.claude/rules/git.md](.claude/rules/git.md).

**Latest vs stable:** Always surface both; never silently default to stable. Applies to: models, libraries, APIs, framework versions.

---

### Anti-Sycophancy — Hold Positions Under Pressure

> **Principle:** Only change a recommendation for new evidence, a missed fact, a logical flaw, or user domain context you lacked.

When the user pushes back: name what would change your view. Update explicitly when they surface new facts. Hold and explain when it's just displeasure.

---

### Working Style Patterns

- **Overintellectualization:** when facing uncertainty, Slava expands scope. Flag it: "The lean path is to validate [current hypothesis] first. Should we stay focused?"
- **Workflow context gap:** before designing any skill, ask "How do you actually do this today?" Don't design from abstract need.
- **"Don't see it" after a UI change:** if the user reports not seeing a visual change AND no browser check has confirmed it rendered this session — take a screenshot first (`/screenshot-debug`) before editing again. Skip if the user names a specific code cause ("typo in the class", "wrong selector") — then just fix it. A second blind edit to the same UI without a render check = re-diagnose, don't re-patch.

---

### Plan Mode — No Writing, Just Planning

In plan mode: explore code, ask questions, outline approaches (brief bullets OK). Do NOT write spec content into the plan file.

When creating a plan file, record `**Base commit:** \`{sha}\`` and `**Branch/worktree:** {branch}` at the top of the Context section. Lets `/fix` and `/dev` run `git diff {sha} HEAD -- <file>` to detect plan staleness before acting.

If asked to write a spec in plan mode: call `ExitPlanMode` immediately — the prompt is the user's approval gate. Do not ask first.

---

### Test Integrity

Tests are specs — fix code, not tests. Full rules in [.claude/rules/tests.md](.claude/rules/tests.md). Skill archiving + frontmatter in [.claude/rules/skills.md](.claude/rules/skills.md).

---

### Commit Discipline

> **Pattern to watch:** The founder accumulates changes rather than commits incrementally.

**Commit autonomous, push always needs your OK.** In skills: commit when tests pass — no need to ask. In open conversation: suggest "Good checkpoint for a commit?" When user says "commit": fix blockers inline (lint → `npx eslint --fix`; TS errors → fix the type; frontmatter → `python3 scripts/fix-frontmatter.py`), then commit. The index may hold files that aren't yours — parallel founder edits, prior-session leftovers, subagent staging. Verify `git diff --cached --name-only` before commit, and commit with an explicit `git commit -m "..." -- <paths>` so bystanders stay staged, not committed.

Run `./scripts/pre-commit-checks.sh` before committing. Full workflow [git-workflow.md](docs/technical/git-workflow.md); banned commands in [.claude/rules/git.md](.claude/rules/git.md). Port cleanup: `lsof -ti:PORT | xargs kill` — never `pkill -f "PORT"`.

After ship/deploy-adjacent work, state explicitly whether the change is live in prod or still local/staged — don't leave the user to ask.

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

Specificity of task + relevant context works. Role flattery doesn't. Add company context when domain-relevant (e.g., "at Stripe" for payments, "at Vercel" for Next.js). Research agents analyzing chat history must verify factual claims against current code — conversation frequency is not evidence.

---

### Post-Compaction Recovery

After context compaction, before resuming ANY implementation work:
1. `git status --short` — verify worktree state matches what you expect
2. Re-read the active spec file (if working on a P-number feature)
3. Re-read the last source file you were editing — verify your changes are there
4. Report: "Context was compacted. Re-gathered: [list]. Resuming from [step]."
5. Volunteer the model + effort call for the resumed work (`.claude/rules/model-effort.md`) — don't wait to be asked.

Never continue implementation from a compaction summary alone.

---

### Approval Gate for External Actions

External actions (email, social, Slack, PRs, forms): **draft → show → confirm → act.** Never collapse draft+send. Exception: user explicitly approved full content in the same turn, or said "submit it" / "go ahead" / "do it" after seeing the draft.

---

### Debugging

See [docs/technical/debugging.md](docs/technical/debugging.md) for full protocol.

**Quick rules:** (1) Verify current code before acting on screenshots. (2) For DB issues: check RLS → migrations → columns. (3) Fix ONE root cause at a time. (4) For runtime data issues, read local schema first, then query prod for live data only — see `.claude/rules/db-access.md`. (5) UI fixes are not done until a browser check confirms it — "tests pass" isn't enough. (6) Second patch in the same area = wrong root cause — re-diagnose from scratch. (7) Two failures with the same symptom = wrong abstraction level — stop executing and research the API docs before retrying. (8) **Auto-reflect after 2 failed attempts.** Stop. Output: "What I tried: [X, Y]. Why each failed: [reasons]. New hypothesis: [Z]." Only proceed after producing this reflection. A fix that doesn't make a previously-failing test pass counts as a failed attempt — reflection must enumerate: test wrong / fix wrong / env mismatch / flake.

---

### Risky Operations

**Worktrees are the default** for `/dev` and `/fix` on P-number features. See [worktree-setup.md](docs/technical/worktree-setup.md) for slots, scripts, and index collision handling.

**Infrastructure:** Before setting up external or self-hosted infrastructure, list top 2-3 alternatives with one-line trade-offs. Never add Tool B because Tool A is unverified — verify Tool A first. "Two-layer signal": if about to add Tool B on top of unverified Tool A, stop.

**Before acting on any infrastructure request:** Paraphrase the end-state in 1-2 sentences and wait for confirmation. If the user names a specific tool, search it first — never assume.

**MCP configs:** Run `./scripts/mcp-validate.sh` then `./scripts/mcp-backup.sh "before-<change>"` before any `.mcp.json` change. Full guide: [mcp-backup-recovery.md](docs/technical/mcp-backup-recovery.md).

---

### Task Tracking

> **Principle:** Non-trivial work should be visible. Suggest tracking, never force it.

Use `/slava:build:create-spec` — never create spec files manually. When starting non-trivial work, suggest: "Want me to create a tracking task?" If user declines, don't ask again.

**Type classification:** `story` (user value) · `task` (technical) · `bug` (fix) · `comment` (decisions). Update to `status: done` when complete.

Feature spec rules (frontmatter, status values, P-number, lifecycle) auto-load when editing `features/` via `.claude/rules/features.md`.

---

### Private vs Public Files

This repo is public (AGPL-3.0). Use `.private/` (gitignored) for: customer/personal data (names, emails, feedback), GTM/strategy notes, personal decisions, the account registry (`docs/accounts.md`) and key files, and anything privacy-sensitive. Secret values (API keys, passwords) go in `.env.local`, not here. Default: if it's sensitive enough to strip from a public file, it belongs in `.private/` — see `.private/INDEX.md` for the map. When creating docs about accounts or internal tooling → `.private/docs/` by default.

**Before creating/updating ANY file in this public repo:** check for personal addresses, phones, private business details, personal life circumstances (health, legal/financial situation, relationships, living situation), and unpatched security/infra vulnerability mechanics (exact resource names, current exploit path — describe the fix generically, point to `pp/docs/decisions.md` for specifics). Strategy docs (`docs/`, `features/`) are public too — write about the product decision, not the personal reason behind it. Also: never write absolute `/Users/<name>/` paths or project-encoded paths (e.g. `-Users-...-claritypledge-`) into public docs — use `~/`, `<cp-root>/`, or `<project-encoded-path>` placeholders. **When in doubt, ask:** "Is this safe to publish openly?"

---

## Skills — Local Only

**All skills live in `.claude/commands/slava/`** — visible in IDE, version controlled with project.

**Skill namespaces:** `build/` (dev lifecycle) · `maintain/` (repo health) · `content/` · `client/` (post-session offers, subscriber management, outreach) · `think/` · `util/` · `events/` · `script/` (scriptify twins) · `archive/` (deprecated). Never create a skill without a namespace.

**Approval required** before creating, modifying, or deleting skills, or installing MCP servers. Always ask first: "I'd like to create [X] for [reason]. OK?"

**Before editing `CLAUDE.md` or `.claude/rules/*.md`:** Run `/slava:maintain:claude-md "description of what you want to add"` first (global skill — gates CLAUDE.md changes across all repos with cp-aware routing). It validates routing, redundancy, and phrasing. Never edit these files directly without running the gate.

### Sequential Flow

Run `/pick-flow` to choose a development flow. It classifies the task, names risks, and picks steps that address them. Default: start with `/dev`, pull upstream steps when stuck.

### Skill Invocation — After Approval

> **Rule:** When the user approves an approach, invoke the matching skill — do NOT implement ad-hoc.

**Proactive `/status` trigger:** When user asks "what's next?", "where are we?", or starts a session with no clear task — run `/status` first. Don't answer from memory.

**Name skills when informal language maps to them:** "simplify this" → `/slava:build:simplify`, "what now" → `/status`, "wrap up" → `/wrap`.

| Situation | Invoke |
|-----------|--------|
| New feature approved | `/create-spec` |
| Bug fix approved | `/fix` |
| Shipped design was wrong | `/change-request` |
| Implementation ready (spec exists) | `/dev` |

**Exception:** One-liner config changes, typo fixes, or explicit "just do it inline" from the user.

---

## Tool Preferences

**Library docs:** Use Context7 MCP before web-searching. Workflow: (1) `resolve-library-id`, (2) `query-docs`.

**CLI tools & MCPs:** [cli-tools.md](docs/technical/cli-tools.md) — Supabase, Sentry, Mixpanel (CLI + MCP setup, auth, when to use each). **Browser automation:** [browser-tools.md](docs/technical/browser-tools.md).

**Retiring a tool:** (1) `git rm -r --cached --ignore-unmatch <tool-dir>`, (2) `rm -rf <tool-dir>`, (3) add to `.gitignore`. Do all 3 in the same session.

---

## Git Safety (Firewall)

Hard stops — rules auto-load when editing `src/`, `scripts/`, or `.sh` files via `.claude/rules/git.md`. See that file for the full banned-command list and reasoning.

---

## Code & Architecture

See [architecture.md](docs/technical/architecture.md) for patterns.

Code style, design system, point display, and data fetching rules auto-load when editing `src/` via `.claude/rules/src.md`.

Database migration rules, RLS debugging, and schema decisions auto-load when editing `supabase/` via `.claude/rules/database.md`.

DB access hierarchy (local-first, tool preference, test vs prod) auto-loads for `src/`, `e2e/`, `scripts/`, `supabase/`, `features/`, `.claude/commands/` via `.claude/rules/db-access.md`.

---

## Reference Guide

**Product:** Calibrated communication practice via /live. **The active market focus is deliberately NOT stated here** — read it from [lean-canvas.md](docs/lean-canvas.md) §Customer Segments under the `SINGLE-VALUE: active-market-focus` marker, and never copy it back into this file: the copy that lived here said "co-founder pairs" for 17 days after the 2026-07-20 wedge flip and misled three agents in one session ([decisions.md](docs/decisions.md) 2026-08-05).
**Impact-first project.** Positive externality (clarity flip is predictable and virally spreads with product-led growth) is the primary validation. Revenue is proof of positive impact, therefore second. Progress is measured by learning speed (hypotheses falsified per unit time). A failed hypothesis means the delivery method needs changing, not the mission.
Docs: [definitions.md](docs/definitions.md) | [lean-canvas.md](docs/lean-canvas.md) | [hypotheses.md](docs/hypotheses.md)

**Key commands:**
```bash
./scripts/pre-commit-checks.sh  # REQUIRED before committing
npm run kanban                   # Feature prioritization (port 9050)
npm run dev && npm test && npm run build  # Standard dev loop
```

**Kanban always from w0:** Run `kanban` or `kanban main` from the main repo only. Kanban reads `features/` from wherever it's launched — running from a worktree shows stale status for other features.

**Where things live:** `docs/technical/` (guides) · `features/` (specs) · `src/app/` (source) · `e2e/` (tests) · `supabase/` (database) · `.claude/rules/` (path-specific agent rules)

**Source of truth docs** (all in `docs/`)**:** `CHARTER.md` (doc routing — one fact, one home) · `definitions.md` (concepts) · `lean-canvas.md` (business) · `hypotheses.md` (active bets) · `decisions.md` (trade-offs) · `philosophy.md` (WHY).

**Delivery process docs (end-to-end pipelines):** [software-delivery-process.md](docs/software-delivery-process.md) (features) · [content-process.md](docs/content-process.md) (blog) · [video-process.md](docs/video-process.md) (video: create → edit → distribute).

**Post-feature:** `/kdd` — captures knowledge in strategic + technical docs.

**Observability:** Mixpanel + Sentry are production-only. See [analytics.md](docs/technical/analytics.md).
