---
status: all-done
type: task
rank: 1000052
workstream: DX
created_date: '2026-04-04'
tags:
  - infrastructure
  - skills
  - process
  - specs
locked_at: '2026-04-07T11:26:03.051Z'
---

# P647: Unified Spec System — One Skeleton, Adaptive Depth, All Work Types Tracked

## Problem

**Situation:** ClarityPledge has four spec-creation skills (`/create-prd`, `/quick-feature`, `/create-bug`, `/change-request`) that evolved independently. `/create-prd` forces user-oriented sections (JTBD, User Stories) on all work types. `/quick-feature` is too thin for complex work. Infrastructure, refactors, migrations, and research have no proper template — they get shoehorned into `type: task` with awkward "As a developer..." user stories.

**Complication:** The founder decided ALL work must be tracked with specs and go through processes (2026-04-04). This means infrastructure, refactors, migrations, research, and process changes all need proper specs — not forced into a user-feature template. Additionally, bug fixes skip TDD because `/fix` quick mode creates no spec, and `/pick-flow` doesn't route bugs through `/create-bug` first. 86% of historical bug specs had no regression tests.

**Question:** How do we create a single, adaptive spec system that covers all work types with the right depth — without cargo-cult sections that get filled with "N/A"?

## Appetite

High blast radius — affects all future spec creation and bug fix flows. Fully reversible (git revert on skill files). Low decision density — all design decisions resolved in conversation (research across 26 sources, CTO adversarial review, self-review). Scope: 6-8 files in `.claude/commands/` and `docs/`. No DB, no UI, no auth.

## Solution

### Architecture (researched and adversarial-reviewed in conversation)

**One universal 5-field skeleton** (grounded in industry consensus across Cagan, Shape Up, Amazon, Torres, Lenny, Google/RFC, Linear — 26 sources):

1. **Problem** (use SCQ for complex/ambiguous problems; flat statement OK for simple ones)
2. **Appetite** (blast radius + reversibility + decision density — NOT time estimates)
3. **Solution / Approach** ("Solution" for implementation work; "Approach" for research/investigation where the solution is the deliverable)
4. **Risks / Non-Goals** (what could go wrong, what we're NOT doing — highest-leverage section for AI agents per research)
5. **Done-When** (measurable completion signal)

**Expansion modules** per work type (not separate templates):

| Work type | Expansions added to skeleton |
|-----------|----------------------------|
| Feature | + UX Notes, + Acceptance Criteria, + UI Contract |
| Infrastructure/Refactor | + Alternatives Considered, + Rollback Strategy |
| Bug | Stays `/create-bug` (separate skill — symptom-first, not business-need) |
| Research | + Approach, + Time Box, + Deliverable Format |
| Migration | + Migration Plan, + Rollback Plan, + Data Integrity Check |
| Redesign | Stays `/change-request` (separate skill — predecessor-linked) |

**Pipeline roles (skills as roles for review steps, functions for action steps):**

| Skill | Type | Role/Function | What it does |
|-------|------|--------------|-------------|
| `/create-spec` | Function | PM structuring founder's intent | Files 5-field skeleton + type-appropriate expansions | **NEW** — replaces `/create-prd` + `/quick-feature` |
| `/challenge-prd` | Role | Devil's advocate (includes lean check as subagent for features) | Validates: lean viability, assumptions, scope, strategy | **MODIFIED** — add lean check subagent |
| `/product-owner` | Role | Product owner (features only) | Enriches with JTBD, user stories, success metrics | **FUTURE** — not in this spec |
| `/create-bug` | Function | Keeps current behavior | Symptom-first bug spec | **MODIFIED** — remove inline exception |
| `/change-request` | Function | Keeps current behavior | Predecessor-linked redesign | UNCHANGED |

**Bug fix TDD enforcement (adversarial-reviewed, 3 criticals resolved):**

1. `fix.md` — Phase 0.pre: auto-invoke `/create-bug` when no P-number (runs on main before worktree creation); halt on failure, no fallback to untracked mode
2. `create-bug.md` — Remove "inline fix without tracking" exception; narrow exemptions to CI/build/pre-commit only
3. `pick-flow/SKILL.md` — Update Step 0: bugs without P-number route through `/create-bug` first; universal "does a spec exist?" gate for all work types
4. `dev.md` — Remove exemption for adjacent bugs during /dev: bugs outside feature's acceptance criteria must call `/fix`

### Key design decisions

- **SCQ (not Deutschian Gap) for PRD problem statements.** SCQ frames for action; Deutschian Gap frames for investigation. Deutschian Gap stays in `/dd:frame-analyze`.
- **`/lean` is a subagent within `/challenge-prd`**, not a separate skill. Skills are per outcome; lean viability is one lens of "is this spec worth building?"
- **`/create-bug` and `/change-request` stay separate** — structurally different relationships to existing work (symptom-first vs predecessor-linked).
- **`/quick-feature` absorbed into `/create-spec`** as lightweight mode. Depth scales with blast radius, not a separate skill.
- **Product-owner sections (JTBD, user stories, metrics) are enrichment, not spec creation.** They follow challenge, not precede it. Cagan's insight: discovery artifacts follow validation.
- **Agent persona for `/create-spec`:** PM — structures founder's intent, asks clarifying questions, flags [FOUNDER DECISION]. Does not make product decisions.

## Risks / Non-Goals

### Risks
- **Bootstrapping paradox:** Creating the new system requires a spec, but the new system doesn't exist yet. Mitigation: file this spec manually in the 5-field format, build `/create-spec`, then rerun on itself to validate.
- **Worktree deadlock in /fix auto-filing:** `/create-bug` has a worktree guard. Mitigation: `/create-bug` runs before Phase 0.0 (worktree creation), while still on main. If already in worktree, agent switches to main, creates spec, returns and rebases.
- **Spec pollution from auto-filed bugs:** Lightweight auto-filed specs may clutter features/. Mitigation: existing archiving flow handles this; `/ship` moves to `done/`.
- **Cargo-cult risk in new template:** Adding expansion modules that become mandatory. Mitigation: modules are optional; agents select based on work type. Kill any field consistently filled with "N/A."
- **`spec-sections.md` header conflict:** Downstream skills (`/architect`, `/ux`, `/generate-tests`) search for canonical headers like `## Problem Statement`, `## Business Requirements`, `## User Stories`, `## Acceptance Criteria`. The new 5-field skeleton uses different headers (`## Problem`, `## Appetite`, `## Solution`, `## Risks / Non-Goals`, `## Done-When`). Mitigation: update `spec-sections.md` to add the new skeleton headers as a "Skeleton Layer" while preserving existing headers as expansion-layer aliases. Downstream skills that READ must check both. Skills that WRITE use new headers for skeleton, existing headers for expansion modules (e.g., `## Acceptance Criteria` remains canonical when used as a feature expansion).
- **`CLAUDE.md` references:** Sequential Flow section references `/create-prd`. Must update to reference `/create-spec`. Similarly update any skill cross-references.

### Non-Goals
- Do NOT change how existing completed specs look (no retroactive migration)
- Do NOT change the downstream implementation pipeline (/ux, /architect, /generate-tests, /dev, /verify) — routing changes to /pick-flow ARE in scope
- Do NOT merge /create-bug or /change-request into /create-spec
- Do NOT add new frontmatter fields to existing spec types
- Do NOT create /product-owner in this spec — file separately after /create-spec is validated
- Do NOT change agent persona per work type — single PM persona for /create-spec (work-type-specific personas like "Staff Engineer for infra" are a future consideration)

## Done-When

- [ ] `/create-spec` skill exists and produces 5-field skeleton with type-appropriate expansions
- [ ] `/create-spec` successfully recreates its own spec (bootstrap test)
- [ ] `/quick-feature` is archived with pointer to `/create-spec`
- [ ] `/create-prd` is archived with pointer to `/create-spec` + `/product-owner` (future)
- [ ] `fix.md` auto-invokes `/create-bug` when called without P-number
- [ ] `create-bug.md` inline exception removed
- [ ] `pick-flow/SKILL.md` routes all work types through spec creation when no P-number exists
- [ ] `dev.md` adjacent-bug exemption removed
- [ ] `spec-sections.md` updated with skeleton layer headers + legacy alias rules
- [ ] `CLAUDE.md` references updated (`/create-prd` → `/create-spec`)
- [ ] `docs/decisions.md` entry documents the design and alternatives rejected
- [ ] All existing tests pass after changes
