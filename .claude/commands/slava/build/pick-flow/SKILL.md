---
name: pick-flow
description: >
  Recommends the right development flow for a task by analyzing its scope and complexity.
  Proposes 2-3 options ranked lightest to heaviest, with exact slash commands, trade-offs,
  and a recommendation. Use when starting work and unsure which flow is appropriate —
  e.g. inline fix vs quick-feature vs full PRD pipeline. Triggered by "/pick-flow",
  "what flow should I use?", "which flow for this?", "should I file a spec?", or whenever
  the user is about to start a task and the right process is unclear.

  Proactively offer this at the start of any non-trivial task (P-number mentioned, bug
  described, "what do we do next" asked) — do not wait to be asked. Skip for one-liner
  fixes, typo edits, or when the user has already named the exact commands to run.
---

# pick-flow

Analyze the task in context and output exactly this structure — no preamble, no padding.

## Output format (≤30 lines)

```
## Flow options for: [task name, ≤8 words]

**A — [name]** (lightest)
Commands: /cmd1 → /cmd2 → /cmd3 → /cmd4
Fits when: [one line]
Trade-off: [one line risk/downside]

**B — [name]** (medium)
Commands: /cmd1 → /cmd2 → /cmd3 → /cmd4
Fits when: [one line]
Trade-off: [one line risk/downside]

**C — [name]** (full)   ← only include if genuinely warranted
Commands: /cmd1 → /cmd2 → /cmd3 → /cmd4 → /cmd5
Fits when: [one line]
Trade-off: [one line risk/downside]

→ Recommend: [A/B/C] — [one sentence why]

Which flow?
```

Commands line lists every applicable step — do not compress into labels like "full pipeline."

## After the user confirms a flow

- If a spec file exists for this task: add `flow: <fix|dev|inline|quick-feature>` to its frontmatter
- If no spec exists yet: note the chosen flow so the next skill (`/quick-feature` or `/create-prd`) sets it on creation
- If a mandatory stage was skipped (e.g. `/architect` for a UI-only change): add a one-line note to the spec's `## Next Steps` section: `Skipped: /architect — [reason in ≤10 words].` Use the Edit tool.

## Step 0: Identify task type first

Before applying the scoring table, classify the task:

| Task type | Default flow |
|-----------|-------------|
| **Feature** (new user-facing capability) | Apply scoring table below |
| **Bug** (broken behavior, root cause known) | `/fix` → done |
| **Bug** (root cause unclear) | Investigate first, then `/fix` |
| **Redesign** (shipped feature, code works, design was wrong) | `/change-request` → then `/ux` / `/architect` / `/generate-tests` / `/dev` / `/verify` per scoring table hard rules (DB column → `/architect` mandatory; net-new visual pattern → `/ux` mandatory — apply drop-`/ux` rule from scoring table; ASCII in conversation ≠ UX resolved for new interaction patterns); if redesign also adds new capability, file `/create-prd` for that portion separately |
| **Refactor** (restructuring, no behavior change) | `/quick-feature` (skeleton for tracking) → `/dev` — no `/create-prd`, no `/ux` |
| **Data migration** (one-time SQL script) | `/dev` + `/generate-tests` mandatory (P270 rule) |
| **Dependency upgrade** | Inline or `/dev` — apply scoring if upgrade touches auth/DB/build |
| **Test-only change** | Inline edit — no spec, no flow |
| **Content/copy change** | Inline or `/dev` — no spec unless copy is acceptance-criteria-level |
| **Analytics instrumentation** | `/dev` — no `/ux`, no `/architect` unless new DB column |

**Redesign test:** "Is the code broken, or is the design wrong?" Broken → `/fix`. Wrong design → `/change-request`. Both (design wrong AND fix requires new capability) → `/change-request` for the redesign + `/create-prd` for the new capability, filed separately.

If task type is non-feature/non-bug, state the type and give the default flow directly. Skip the scoring table.

## Scope scoring (features and bugs only)

Use this table to build the command chain directly. Each row maps a signal to a tier and which commands to include. When multiple rows match, union all commands and take the highest tier.

| Signal | Tier | Commands to include |
|--------|------|---------------------|
| 1-2 files, pure UI state or copy change | A | `/quick-feature` → `/dev` |
| 3-5 files, no DB/auth/API changes | A or B | `/quick-feature` → `/dev` |
| New route, API endpoint, or DB column | B | + `/architect`, `/generate-tests` |
| New auth logic, RLS, or edge function | C | + `/architect`, `/generate-tests` |
| New DB migration (any) | B | + `/generate-tests` mandatory (P270 rule) |
| Any conditional rendering, UI state change, or interactive behavior | any | + `/generate-tests` |
| New business logic, permissions, owner/visitor split, role-based rendering, multi-step flow state, billing/access derived values | any | + `/generate-tests` |
| 5+ files or 3+ independent concerns | B or C | + `/decompose` (after `/generate-tests`) |
| New layout structure, net-new styled component, visual acceptance criteria in spec, or responsive/animation changes | any | + `/verify` |
| Spec already written — `test_files:` present, `type` ≠ `change-request` | — | skip `/generate-tests`, start from `/dev` |
| Spec already written — `test_files:` present, `type: change-request` | — | skip `/generate-tests`, run `/spec-review` → `/dev` |
| Spec already written — `test_files:` absent | — | start from `/generate-tests` → `/dev` |
| Spec exists, `delivery_stage: 5-decomposed` | — | resume from `/dev` |
| Spec exists, `delivery_stage: 4-tests-ready` | — | resume from `/spec-review` → `/decompose`* → `/dev` |
| Spec exists, `delivery_stage: 3-arch-review` | — | resume from `/generate-tests` → `/spec-review` → `/dev` |
| Spec exists, `delivery_stage: 2-ux-done` | — | resume from `/architect` → `/generate-tests` → `/spec-review` → `/dev` |
| Spec exists, `delivery_stage: 1-prd` | — | resume from `/ux` (if UI changes) or `/architect` → `/generate-tests` → `/spec-review` → `/dev` |
| Drop `/ux` only when ALL of the following are true: (a) ASCII/mockups in conversation cover all states: happy path, edge cases, empty states, loading states, and responsive/mobile layout; (b) No net-new visual component or layout pattern is being introduced; (c) No mobile-specific layout concerns exist. Otherwise: run `/ux` even if happy-path structure is sketched in conversation. "ASCII decided" ≠ "UX resolved". | — | drop `/ux` |
| `type: change-request` in spec frontmatter | any | `/spec-review` mandatory (not optional) |
| **Changes `.claude/commands/`, `.claude/rules/`, `.claude/hooks/`, `CLAUDE.md`, git workflow, or `scripts/` invoked by hooks/CI** | **Infra** | **See infrastructure tier below** |

**Command ordering when multiple signals apply:** `/create-prd` → `/ux` → `/architect` → `/generate-tests` → `/decompose` → `/dev` → `/verify`

## Infrastructure tier (skills / hooks / process changes)

These changes affect **all future work** — not a single feature. Risk is asymmetric: hard to detect when broken, blast radius is every session.

**Required before implementing:**
1. Draft the complete proposed change in conversation (exact before/after for key sections; for large rewrites spanning 3+ sections, an outline-level description with before/after for changed sections is sufficient)
2. Run adversarial analysis subagent against the draft: "Challenge this design. Find failure modes, edge cases, invariant violations. Return: SURVIVES / BUBBLES UP with findings."
3. If SURVIVES → write design decision to `docs/decisions.md` (what was chosen and why alternatives were rejected)
4. Implement only after adversarial review passes on the concrete change

**Commands (infrastructure):**
```
[draft in conversation] → [adversarial subagent on draft] → decisions.md entry → inline implementation (no /dev, no feature branch)
```

**Skip adversarial review only if:** change is purely additive (new standalone skill with no cross-dependencies) AND scope is a single file with no shared state.

## Available commands (in sequence order)

- `/fix` — targeted bug fix, stops at QA gate on success (run `/ship` to close)
- `/change-request` — redesign spec for a shipped feature whose design was wrong (wrong ordering, actor confusion, duplication, hierarchy); creates new P-number with predecessor linkage and superseded-sections table; use when code works as specified but UX/design is wrong; NOT for new capability (new user value → `/create-prd`)
- `/quick-feature` — skeleton spec in `features/` (30 sec), use for tracking
- `/create-prd` — full PRD with acceptance criteria (3-5 min)
- `/ux` — wireframes/design decisions (UI features only, skip if design is resolved)
- `/architect` — architecture plan + mandatory security review; include whenever task has DB columns, RLS, auth, API changes, or new patterns; skip only for trivial 1-2 file UI-only changes with no security surface
- `/generate-tests` — writes test specs before implementation; include whenever a regression would be annoying to debug manually — this covers any conditional rendering (phase-based, auth-based, role-based), UI state that changes on user interaction or event, placeholder text or UI strings that could drift, button enable/disable logic, CSS class conditionals (e.g. centered vs sticky based on state), and all security/auth/DB cases; mandatory for any DB migration (P270 rule); also include when `/architect` is in the flow; skip only for pure CSS-only changes, single hardcoded strings with no logic, or one-liner typo fixes
- `/decompose` — splits into sub-stories (5+ files or 3+ concerns only, run after `/generate-tests`)
- `/dev` — implements from spec, stops at QA gate on success (run `/ship` to close)
- `/review-all` — 3-agent parallel review (code + design + UX); **auto-runs inside both `/dev` and `/fix`** — do NOT list it as a step in any flow (it's already included)
- `/verify` — live browser UAT; include when the task introduces net-new visual surface (new layout, new component, visual acceptance criteria, responsive/animation); skip for extractions of existing UI, pure logic/backend/config changes
- `/kdd` — captures learnings into docs (optional, after shipping)

## Quality principle

> **Run steps with meaningful quality impact for this task's scope and risk. Skip steps where overhead exceeds the gain — not because they add zero value in theory, but because for a 1-file UI change, `/architect` costs 5 min and adds nothing that reading the file doesn't already provide.**

Apply this to every step. Don't default to "might help a bit" — default to "clearly helps for this specific task."

## Hard rules

- Never list a command that adds no value for this specific task
- `/architect` for any task with DB, RLS, auth, or API changes; skip for pure UI-only changes with no security surface
- `/generate-tests` whenever a regression would be annoying to debug manually — includes any conditional rendering, UI state change, interactive behavior, placeholder copy that could drift, button enable/disable logic, CSS class conditionals, and all security/auth/DB cases; mandatory for any DB migration (P270); skip only for pure CSS-only changes, single hardcoded strings with no logic, or one-liner typo fixes
- `/ux` only if visual/interaction design is unresolved — skip if ASCII/mockup already decided
- `/decompose` only for 5+ files or 3+ independent concerns
- If spec exists: check `delivery_stage:` first — it takes precedence (see scoring table rows for all 5 stages: `1-prd` through `5-decomposed`); if absent, fall back to `test_files:` — present → start from `/dev`; absent → `/generate-tests` → `/dev`
- `/review-all` runs automatically inside `/dev` and `/fix` — never list it as a step in any flow
- `/verify` for net-new visual surface (new layout, new component with new UI, visual acceptance criteria, responsive/animation) — not for every `.tsx` change, not for component extraction with identical output
- **`/spec-review` is mandatory (not optional) for `type: change-request` specs.** Redesigns have pre-existing elements that can silently conflict with new AC — spec-review catches these before implementation. The `*` optional marker applies to new features only.
- After user confirms flow: set `flow:` in spec frontmatter if spec exists
- When writing `flow:` to spec frontmatter, write exactly one of: `fix`, `dev`, `inline`, `quick-feature` — never the command chain string
