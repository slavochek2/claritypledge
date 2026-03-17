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

## Step -1: Signal scan

Before building options, explicitly list which signals from the scoring table fire for this task.
This prevents under-classifying multi-concern work.

```
Signals detected:
- [signal 1] → [tier, commands]
- [signal 2] → [tier, commands]
- ...
Union: [highest tier], commands: [merged set]
```

If 3+ signals fire, or any `/architect`-mandatory or `/verify`-mandatory signal fires, state it explicitly.

## Output format (≤35 lines)

```
## Flow for: [task name, ≤8 words]

Signals: [list fired signals, one line each]

**A — [name]** (lightest)
Commands: /cmd1 → /cmd2 → /cmd3 → /cmd4
Fits when: [one line]
Risk: [one line — what breaks if this tier is too light]

**B — [name]** (medium)
Commands: /cmd1 → /cmd2 → /cmd3 → /cmd4
Fits when: [one line]
Risk: [one line — what breaks if this tier is too light]

**C — [name]** (full)   ← only include if genuinely warranted
Commands: /cmd1 → /cmd2 → /cmd3 → /cmd4 → /cmd5
Fits when: [one line]
Risk: [one line — overhead for this scope]

→ **[A/B/C]** — [one decisive sentence: "This is X because [specific signals]"]

Which flow?
```

Commands line lists every applicable step — do not compress into labels like "full pipeline."

**Be decisive.** When signals clearly point to one tier, say "This is clearly B" — not "B is recommended but A could work." Only present genuine options when the signals are ambiguous.

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
| **Redesign** (shipped feature, code works, design was wrong) | `/change-request` → `/challenge-prd` → then `/ux` / `/architect` / `/generate-tests` / `/spec-review` / `/dev` / `/verify` per scoring table hard rules (DB column → `/architect` mandatory; net-new visual pattern → `/ux` mandatory — apply drop-`/ux` rule from scoring table; ASCII in conversation ≠ UX resolved for new interaction patterns); `/challenge-prd` mandatory for redesigns (same as medium pipeline); if redesign also adds new capability, file `/create-prd` for that portion separately; if ASCII exploration exists in conversation, `/change-request` must capture it as raw material so `/ux` has context |
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

### File/scope signals

| Signal | Tier | Commands to include |
|--------|------|---------------------|
| 1-2 files, pure UI state or copy change | A | `/quick-feature` → `/dev` |
| 3-5 files, no DB/auth/API changes | A or B | `/quick-feature` → `/dev` |
| 5+ files or 3+ independent concerns | B or C | + `/decompose` (after `/generate-tests`) |

### `/architect`-mandatory signals

Any ONE of these fires → `/architect` is required. Do not skip.

| Signal | Tier | Commands to include |
|--------|------|---------------------|
| New route, API endpoint, or DB column | B | + `/architect`, `/generate-tests` |
| New auth logic, RLS, or edge function | C | + `/architect`, `/generate-tests` |
| New DB migration with schema change (new table, column, constraint, index) | B+ | + `/architect`, `/generate-tests` |
| New Postgres function, trigger, or stored procedure | B+ | + `/architect`, `/generate-tests` |
| Multiple architectural layers touched (e.g., DB + client state, API + realtime, edge function + client) | C | + `/architect`, `/generate-tests`, `/spec-review` |
| State machine changes (new states, transitions, or recovery logic) | B+ | + `/architect`, `/generate-tests` |
| New infrastructure component (new realtime channel, new storage bucket, new cron, new observability hook) | B+ | + `/architect`, `/generate-tests` |
| Cross-concern coordination (e.g., DB schema + client state + observability; auth + billing + UI) | C | + `/create-prd`, `/challenge-prd`, `/architect`, `/generate-tests`, `/spec-review` |

### `/verify`-mandatory signals

Any ONE of these fires → `/verify` is required. Do not skip.

| Signal | Tier | Commands to include |
|--------|------|---------------------|
| New layout structure, net-new styled component, visual acceptance criteria in spec, or responsive/animation changes | any | + `/verify` |
| State machine or flow-state bugs (behavior only confirmable by stepping through states visually) | any | + `/verify` |
| Multi-user flows (two browsers needed: host+participant, owner+visitor, admin+user) | any | + `/verify` |
| UI recovery/reconnection flows (disconnect → reconnect, error → retry, offline → online) | any | + `/verify` |
| Realtime/WebSocket behavior (presence, broadcast, channel lifecycle) | any | + `/verify` |
| Visual regression risk (existing UI changes appearance based on new logic) | any | + `/verify` |
| Anything the spec says "user should see X when Y happens" that unit tests can't fully cover | any | + `/verify` |

### `/generate-tests` signals

| Signal | Tier | Commands to include |
|--------|------|---------------------|
| New DB migration (any) | B | + `/generate-tests` mandatory (P270 rule) |
| Any conditional rendering, UI state change, or interactive behavior | any | + `/generate-tests` |
| New business logic, permissions, owner/visitor split, role-based rendering, multi-step flow state, billing/access derived values | any | + `/generate-tests` |

### Spec-based resume signals

| Signal | Tier | Commands to include |
|--------|------|---------------------|
| Spec already written — `test_files:` present, `type` ≠ `change-request` | — | skip `/generate-tests`, start from `/dev` |
| Spec already written — `test_files:` present, `type: change-request` | — | skip `/generate-tests`, run `/spec-review` → `/dev` |
| Spec already written — `test_files:` absent | — | start from `/generate-tests` → `/dev` |
| Spec exists, `delivery_stage: 5-decomposed` | — | resume from `/dev` |
| Spec exists, `delivery_stage: 4-tests-ready` | — | resume from `/spec-review` → `/decompose`* → `/dev` |
| Spec exists, `delivery_stage: 3-arch-review` | — | resume from `/generate-tests` → `/spec-review` → `/dev` |
| Spec exists, `delivery_stage: 2-ux-done` | — | resume from `/architect` → `/generate-tests` → `/spec-review` → `/dev` |
| Spec exists, `delivery_stage: 1-prd` | — | resume from `/ux` (if UI changes) or `/architect` → `/generate-tests` → `/spec-review` → `/dev` |

### Drop/skip signals

| Signal | Tier | Commands to include |
|--------|------|---------------------|
| Drop `/ux` only when ALL of the following are true: (a) ASCII/mockups in conversation cover all states: happy path, edge cases, empty states, loading states, and responsive/mobile layout; (b) No net-new visual component or layout pattern is being introduced; (c) No mobile-specific layout concerns exist. Otherwise: run `/ux` even if happy-path structure is sketched in conversation. "ASCII decided" ≠ "UX resolved". | — | drop `/ux` |
| `type: change-request` in spec frontmatter | any | `/spec-review` mandatory (not optional) |
| **Changes `.claude/commands/`, `.claude/rules/`, `.claude/hooks/`, `CLAUDE.md`, git workflow, or `scripts/` invoked by hooks/CI** | **Infra** | **See infrastructure tier below** |

**Command ordering when multiple signals apply:** `/create-prd` → `/challenge-prd`* → `/ux` → `/architect` → `/generate-tests` → `/decompose` → `/dev` → `/verify`

`*` `/challenge-prd` recommended for novel features (new capability, new actor, unvalidated flow). Skip for incremental improvements.

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
- `/challenge-prd` — adversarial stress-test of PRD assumptions, flows, strategic fit (5-10 min); recommended for novel features, skip for incremental improvements; use `--quick` for reduced depth (3-5 min)
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
- `/architect` is mandatory when ANY `/architect`-mandatory signal fires (see scoring table). This includes: DB schema changes, new Postgres functions/triggers, multiple architectural layers, state machine changes, new infrastructure components, cross-concern coordination. Skip only for pure UI-only changes with no DB/auth/API/state-machine surface.
- `/verify` is mandatory when ANY `/verify`-mandatory signal fires (see scoring table). This includes: state machine bugs, multi-user flows, UI recovery/reconnection, realtime behavior, visual regression risk, and any "user should see X when Y" that unit tests can't cover. Not for every `.tsx` change, not for component extraction with identical output.
- `/generate-tests` whenever a regression would be annoying to debug manually — includes any conditional rendering, UI state change, interactive behavior, placeholder copy that could drift, button enable/disable logic, CSS class conditionals, and all security/auth/DB cases; mandatory for any DB migration (P270); skip only for pure CSS-only changes, single hardcoded strings with no logic, or one-liner typo fixes
- `/spec-review` is mandatory after `/generate-tests` when the flow includes `/architect` (architecture decisions need validation against test expectations)
- `/ux` — apply drop-`/ux` rule strictly: skip ONLY when ALL three conditions are met: (a) ASCII covers ALL states (happy, edge, empty, loading, responsive), (b) no net-new visual component/pattern, (c) no mobile concerns. If ANY condition fails, include `/ux`. "ASCII in conversation covers happy path" ≠ "UX resolved"
- `/decompose` only for 5+ files or 3+ independent concerns
- If spec exists: check `delivery_stage:` first — it takes precedence (see scoring table rows for all 5 stages: `1-prd` through `5-decomposed`); if absent, fall back to `test_files:` — present → start from `/dev`; absent → `/generate-tests` → `/dev`
- `/review-all` runs automatically inside `/dev` and `/fix` — never list it as a step in any flow
- **`/spec-review` is mandatory (not optional) for `type: change-request` specs.** Redesigns have pre-existing elements that can silently conflict with new AC — spec-review catches these before implementation. The `*` optional marker applies to new features only.
- **`/challenge-prd` is mandatory** for full and medium pipeline flows AND for all redesigns (`/change-request`). Redesigns inherit assumptions from the predecessor spec that need stress-testing. Skip only for small/inline work.
- After user confirms flow: set `flow:` in spec frontmatter if spec exists
- When writing `flow:` to spec frontmatter, write exactly one of: `fix`, `dev`, `inline`, `quick-feature` — never the command chain string
- If you are currently in a worktree (not w0/main), remind the user: spec creation skills (/create-prd, /quick-feature, /change-request, /create-bug) must be run from the main repo.

## Full pipeline detection

When 3+ of these are true simultaneously, the task is almost certainly a **full pipeline** (C tier). Don't present A as an option — it would be misleading:

1. Touches DB schema (migration, new column, new table, new function)
2. Touches client-side state management (new state machine, new context, new store)
3. Has observability/infrastructure concern (logging, metrics, error tracking, realtime channels)
4. Involves multi-user interaction (host/participant, owner/visitor)
5. Has recovery/resilience behavior (reconnection, retry, fallback states)
6. Requires visual verification (state transitions visible in UI, multi-browser testing)

When 3+ fire: recommend C directly with "This is clearly full pipeline because [list the 3+ signals]."
