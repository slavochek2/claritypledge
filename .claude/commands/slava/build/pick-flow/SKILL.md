---
name: pick-flow
description: >
  Recommends the quality-default development flow with smart opt-out suggestions.
  Presents the full quality flow first, then suggests which steps are safe to skip
  and why. Optimizes for outcome quality, not minimal effort. User opts OUT of steps
  explicitly ("skip diagnosis", "light flow"), never opts IN to quality.
when_to_use: >
  When starting work and unsure which development flow to use. Triggered by "/pick-flow",
  "what flow should I use?", "which flow for this?", "should I file a spec?", or whenever
  the user is about to start a task and the right process is unclear.
  Proactively offer this at the start of any non-trivial task (P-number mentioned, bug
  described, "what do we do next" asked) — do not wait to be asked. Skip for one-liner
  fixes, typo edits, or when the user has already named the exact commands to run.
version: 2.0.0
---

# pick-flow

Analyze the task in context and output exactly this structure — no preamble, no padding.

## Step -2: Lean viability check

Before analyzing scope, ask: **does the prerequisite use case for this feature exist today?**

Read `docs/lean-canvas.md`. Check:
1. **Who needs this?** — which customer segment from the lean canvas?
2. **Are they using the product today?** — or is this building for a future segment that hasn't been validated?
3. **Does it help the current 30-day priority?** — check Validation Status section.

If the feature builds for a use case that doesn't exist yet (e.g., self-serve without facilitator, coach adoption before pairs validate), say so:

```
⚠️ Lean check: This feature serves [segment/use case] which doesn't exist yet.
Current priority: [what the lean canvas says].
Recommend: backlog. Update spec with "Why Backlog" section and unblock condition.
```

**Skip this check for:** bugs, refactors, infrastructure, and features where the user has already stated the use case exists.

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

## Output format (≤50 lines)

Present ONE recommended quality flow — not 2-3 options. The flow defaults to full quality; opt-out suggestions tell the user what's safe to skip.

**Execution order:** Run Step 0 (task type) + scoring tables FIRST to gather signals and classify. Then populate this template with the results.

```
## Flow for: [task name, ≤8 words]

Signals: [list fired signals, one line each]
Tier: [A/B/C] — [one decisive sentence why]

### Phase 1: Understand
[Include for B/C tier, OR when problem clarity is low, OR spec is >14 days old / change-request]
Commands: /dd:frame-analyze → [/challenge-prd if applicable] → [spec validation if stale]
Why: [one line — what this phase catches for THIS task]

### Phase 2: Build
Commands: /cmd1 → /cmd2 → ... → /dev → /verify
Why: [one line — what quality gates protect in THIS task]

### Safe to skip (never suggest skipping a step whose mandatory signal fired)
- /[command]: [specific reason it's safe for THIS task — e.g., "no net-new visual component"]. Risk: [what could go wrong]
- /[command]: [reason]. Risk: [what could go wrong]
- (none — all steps carry weight for this task)

→ Proceed with full flow? Or type "skip [step]" / "light flow" to reduce.
```

Commands line lists every applicable step — do not compress into labels like "full pipeline."

**Be decisive.** Present the quality-default flow with confidence. Smart opt-out suggestions handle the "lighter" path — don't hedge with "but you could also do less."

**A-tier simple tasks** (1-2 files, known cause, no DB/auth): Phase 1 is omitted (cause is known, spec is fresh or absent). Phase 2 lists only the steps that apply — no mandatory signals fire, so the applicable set is small by nature. Opt-out suggestions may say "(none — all steps carry weight for this task)."

## Smart opt-out suggestions

After presenting the full quality flow, analyze each included step and suggest which are genuinely safe to skip. This is NOT about minimizing work — it's about helping the user make informed trade-offs.

**Format for each suggestion:**
```
- /[command]: Safe to skip. [Reason rooted in signals — e.g., "No DB changes, so /architect would only confirm existing patterns."] Risk accepted: [what could go wrong].
```

**Rules:**
- Never suggest skipping a step whose mandatory signal fired (architect-mandatory, verify-mandatory, etc.)
- Maximum 3 suggestions. If everything carries weight, say "(none — all steps carry weight for this task)"
- Each suggestion must name the risk the user accepts by skipping
- /verify: only suggest skip when genuinely no visual surface AND no state-machine behavior
- /generate-tests: only suggest skip per existing rules (pure CSS, single string, one-liner)
- Phase 1 (/dd:frame-analyze): only suggest skip when root cause is stated and falsifiable

**User opt-out keywords:**
When the user says "light flow", "skip diagnosis", "just do it", or "quick" — collapse to the minimal viable flow, but state what was removed:

```
Light flow activated: [derive from task type — feature: /create-spec → /dev | bug: /fix | refactor: /dev | etc.]
Skipped: [list each removed step and what it would have caught]
Proceeding. Add any step back by name.
```

## After the user confirms a flow

- If a spec file exists for this task: add `flow: <fix|dev|inline|create-spec>` to its frontmatter
- If no spec exists yet: note the chosen flow so the next skill (`/create-spec`) sets it on creation
- If a mandatory stage was skipped (e.g. `/architect` for a UI-only change): add a one-line note to the spec's `## Next Steps` section: `Skipped: /architect — [reason in ≤10 words].` Use the Edit tool.
- If the user opted out of steps (via "skip [step]" or "light flow"): log which steps were skipped and why in the spec's `## Next Steps` section: `User opted out: /verify (no visual surface), /dd:frame-analyze (cause stated).`

## Step 0: Identify task type first

Before applying the scoring table, classify the task:

| Task type | Default flow |
|-----------|-------------|
| **Feature** (new user-facing capability, no spec) | `/create-spec` → Apply scoring table below |
| **Feature** (spec exists) | Apply scoring table below |
| **Bug** (has P-number, root cause known) | `/fix pN` → done |
| **Bug** (no P-number, root cause known) | `/create-bug` → `/fix` → done |
| **Bug** (no P-number, root cause unclear) | `/dd:frame-analyze` first → `/create-bug` → `/fix` → done |
| **Redesign** (shipped feature, code works, design was wrong) | `/change-request` → `/challenge-prd` → then `/ux` / `/architect` / `/generate-tests` / `/spec-review` / `/dev` / `/verify` per scoring table hard rules (DB column → `/architect` mandatory; net-new visual pattern → `/ux` mandatory — apply drop-`/ux` rule from scoring table; ASCII in conversation ≠ UX resolved for new interaction patterns); `/challenge-prd` mandatory for redesigns (same as medium pipeline); if redesign also adds new capability, file `/create-spec` for that portion separately; if ASCII exploration exists in conversation, `/change-request` must capture it as raw material so `/ux` has context |
| **Refactor** (restructuring, no behavior change) | `/create-spec` (type: task) → `/dev` — no `/ux` |
| **Data migration** (one-time SQL script) | `/create-spec` (type: task) → `/dev` + `/generate-tests` mandatory (P270 rule) |
| **Dependency upgrade** | `/create-spec` (type: task) → `/dev` — apply scoring if upgrade touches auth/DB/build |
| **Infrastructure** (skills, hooks, process, rules) | `/create-spec` (type: task) → infrastructure tier flow (draft → adversarial → decisions.md → implement) |
| **Test-only change** | Inline edit — no spec, no flow |
| **Content/copy change** | `/create-spec` (type: task, lightweight) → `/dev` |
| **Analytics instrumentation** | `/create-spec` (type: task) → `/dev` — no `/ux`, no `/architect` unless new DB column |

**Universal spec gate:** Before any flow, check: "Does a spec with a P-number exist for this work?" If not, route to the appropriate creation skill first (`/create-spec` for features/refactors/infra/migrations, `/create-bug` for bugs, `/change-request` for redesigns). Only test-only changes skip spec creation.

**Redesign test:** "Is the code broken, or is the design wrong?" Broken → `/fix`. Wrong design → `/change-request`. Both (design wrong AND fix requires new capability) → `/change-request` for the redesign + `/create-spec` for the new capability, filed separately.

If task type is non-feature/non-bug, state the type and give the default flow directly. Skip the scoring table.

## Diagnose protocol (bugs with unclear root cause)

When the user reports a symptom but root cause is unknown, do NOT jump to `/fix` or `/create-bug`.

**Route to `/dd:frame-analyze`** — it produces SCQ framing + structural root-cause analysis + 5-Why in one pass. **This IS Phase 1 ("Understand") in the output format** — they are the same step, not separate protocols.

**After `/dd:frame-analyze` completes**, present findings and recommend which build flow to take (`/fix`, `/create-bug`, or escalate to `/create-spec` if the problem is a design issue).

**Skip shortcut:** If the user says "skip diagnosis", "I know the cause", or states a specific falsifiable root cause — accept their stated cause and proceed directly to flow selection.

**Fallback** (if `/dd:frame-analyze` is unavailable — e.g., global skills not installed): spawn a general-purpose subagent with prompt: "You are a root-cause analyst. Investigate [symptom] using structured 5-Why analysis. At each level, gather evidence before concluding. Output: root cause + recommended fix path. Do NOT edit files."

## Scope scoring (features and bugs only)

Use this table to build the command chain directly. Each row maps a signal to a tier and which commands to include. When multiple rows match, union all commands and take the highest tier.

### File/scope signals

| Signal | Tier | Commands to include |
|--------|------|---------------------|
| 1-2 files, pure UI state or copy change | A | `/create-spec` → `/dev` |
| 3-5 files, no DB/auth/API changes | A or B | `/create-spec` → `/dev` |
| 5+ files or 3+ independent concerns | B or C | + `/decompose` (after `/generate-tests`) |

### `/research-arch` signals

Any ONE of these fires → include `/research-arch` before `/architect`. Optional but recommended.

| Signal | Commands to include |
|--------|---------------------|
| Novel technology not yet in codebase (new library, protocol, or service category) | + `/research-arch` before `/architect` |
| Multiple viable architectural approaches with non-obvious trade-offs (e.g., 3+ ways to solve, no clear winner from codebase) | + `/research-arch` before `/architect` |
| External API/service integration where pitfalls aren't well-known | + `/research-arch` before `/architect` |
| Performance-critical decision (caching strategy, concurrency model, data structure choice at scale) | + `/research-arch` before `/architect` |
| `/challenge-prd` surfaced technical unknowns that need research before design | + `/research-arch` before `/architect` |

**Skip when:** Codebase already has established patterns for this kind of work, or architect can resolve unknowns by exploring existing code alone.

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
| Cross-concern coordination (e.g., DB schema + client state + observability; auth + billing + UI) | C | + `/create-spec`, `/challenge-prd`, `/architect`, `/generate-tests`, `/spec-review` |

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
| Spec exists, `delivery_stage: 4-tests-ready` | — | resume from `/spec-review` → `/spec-compact` → `/decompose`* → `/dev` |
| Spec exists, `delivery_stage: 3-arch-review` | — | resume from `/ui` (if UI) → `/generate-tests` → `/spec-review` → `/spec-compact` → `/decompose`* → `/dev` |
| Spec exists, `delivery_stage: 3.5-ui-review` | — | resume from `/generate-tests` → `/spec-review` → `/spec-compact` → `/decompose`* → `/dev` |
| Spec exists, `delivery_stage: 2-ux-done` | — | resume from `/research-arch`* (if novel tech) → `/architect` → `/generate-tests` → `/spec-review` → `/spec-compact` → `/decompose`* → `/dev` |
| Spec exists, `delivery_stage: 1-prd` | — | resume from `/ux` (if UI changes) or `/architect` → `/generate-tests` → `/spec-review` → `/spec-compact` → `/decompose`* → `/dev` |

### Drop/skip signals

| Signal | Tier | Commands to include |
|--------|------|---------------------|
| Drop `/ux` only when ALL of the following are true: (a) ASCII/mockups in conversation cover all states: happy path, edge cases, empty states, loading states, and responsive/mobile layout; (b) No net-new visual component or layout pattern is being introduced; (c) No mobile-specific layout concerns exist. Otherwise: run `/ux` even if happy-path structure is sketched in conversation. "ASCII decided" ≠ "UX resolved". | — | drop `/ux` |
| `type: change-request` in spec frontmatter | any | ADD `/spec-review` mandatory (not optional) — exception: this row ADDS a step, not drops one |
| **Changes `.claude/commands/`, `.claude/rules/`, `.claude/hooks/`, `CLAUDE.md`, git workflow, or `scripts/` invoked by hooks/CI** | **Infra** | **See infrastructure tier below** |

**Command ordering when multiple signals apply:** `/create-spec` → `/challenge-prd`* → `/ux` → `/research-arch`* → `/architect` → `/ui` → `/generate-tests` → `/spec-review`* → `/spec-compact` → `/decompose` → `/dev` → `/verify`

`*` `/challenge-prd` mandatory for full and medium pipeline flows and all redesigns. Skip only for small/inline work. `/research-arch` optional — only when feature involves novel technology, unfamiliar integrations, or technical unknowns surfaced by `/challenge-prd`.

## Infrastructure tier (skills / hooks / process changes)

These changes affect **all future work** — not a single feature. Risk is asymmetric: hard to detect when broken, blast radius is every session.

**Required before implementing:**
1. Draft the complete proposed change in conversation (exact before/after for key sections; for large rewrites spanning 3+ sections, an outline-level description with before/after for changed sections is sufficient)
2. Run adversarial analysis subagent against the draft: "Challenge this design. Find failure modes, edge cases, invariant violations. Return: SURVIVES / BUBBLES UP with findings."
3. If SURVIVES → write design decision to `docs/decisions.md` (what was chosen and why alternatives were rejected)
4. Implement only after adversarial review passes on the concrete change

**Commands (infrastructure):**
```
/create-spec (type: task) → [draft in conversation] → [adversarial subagent on draft] → decisions.md entry → inline implementation (no /dev, no feature branch)
```

**Note:** A `/dd:think` spec in `.private/thinking/` does NOT satisfy the universal spec gate. The build spec requires a P-number in `features/`. The adversarial analysis gate and the spec gate are independent — both must be satisfied.

**Skip adversarial review only if:** change is purely additive (new standalone skill with no cross-dependencies) AND scope is a single file with no shared state.

## Available commands (in sequence order)

- `/fix` — targeted bug fix, stops at QA gate on success (run `/ship` to close)
- `/change-request` — redesign spec for a shipped feature whose design was wrong (wrong ordering, actor confusion, duplication, hierarchy); creates new P-number with predecessor linkage and superseded-sections table; use when code works as specified but UX/design is wrong; NOT for new capability (new user value → `/create-spec`)
- `/create-spec` — structured spec with 5-field skeleton (Problem, Appetite, Solution, Risks/Non-Goals, Done-When)
- `/challenge-prd` — adversarial stress-test of PRD assumptions, flows, strategic fit (5-10 min); recommended for novel features, skip for incremental improvements; use `--quick` for reduced depth (3-5 min)
- `/ux` — wireframes/design decisions (UI features only, skip if design is resolved)
- `/research-arch` — pre-architect research for novel tech, unfamiliar integrations, or technical unknowns; spawns parallel research agents + benchmarking synthesis; skip when codebase has established patterns
- `/architect` — architecture plan + mandatory security review; include whenever task has DB columns, RLS, auth, API changes, or new patterns; skip only for trivial 1-2 file UI-only changes with no security surface
- `/ui` — component strategy mapping UX + architecture to concrete component choices; mandatory for all UI features (full and medium pipeline); maximizes reuse of existing design system; skip for backend-only, pure CSS, single-file copy changes
- `/generate-tests` — writes test specs before implementation; include whenever a regression would be annoying to debug manually — this covers any conditional rendering (phase-based, auth-based, role-based), UI state that changes on user interaction or event, placeholder text or UI strings that could drift, button enable/disable logic, CSS class conditionals (e.g. centered vs sticky based on state), and all security/auth/DB cases; mandatory for any DB migration (P270 rule); also include when `/architect` is in the flow; skip only for pure CSS-only changes, single hardcoded strings with no logic, or one-liner typo fixes
- `/spec-compact` — strips agent conversation residue from spec (Q&A threads, decision analyses, restatements); always after `/spec-review`, before `/decompose` or `/dev`; skip for specs under 100 lines
- `/decompose` — splits into sub-stories (5+ files or 3+ concerns only, run after `/generate-tests`)
- `/dev` — implements from spec, stops at QA gate on success (run `/ship` to close)
- `/finish` — consolidated review dispatcher (classifies changes, runs type-appropriate reviews); **auto-runs inside both `/dev` and `/fix`** — do NOT list it as a step in any flow (it's already included)
- `/verify` — live browser UAT; include when the task introduces net-new visual surface (new layout, new component, visual acceptance criteria, responsive/animation); skip for extractions of existing UI, pure logic/backend/config changes
- `/kdd` — captures learnings into docs (optional, after shipping)

## Quality principle

> **Include all quality steps that protect this task's outcome. Recommend skipping only when you can name the specific reason the step adds no protection for THIS task. Default to quality; optimize for speed only when the user explicitly requests it.**

Apply this to every step. Don't default to "skip unless proven useful" — default to "include unless proven unnecessary for this specific task."

## Hard rules

- Include all commands that protect outcome quality for this task. After presenting the full flow, suggest which are safe to skip and why in the "Safe to skip" section. Never remove a quality gate silently — if a step is excluded, it must appear in opt-out suggestions with a reason
- `/architect` is mandatory when ANY `/architect`-mandatory signal fires (see scoring table). This includes: DB schema changes, new Postgres functions/triggers, multiple architectural layers, state machine changes, new infrastructure components, cross-concern coordination. Skip only for pure UI-only changes with no DB/auth/API/state-machine surface.
- `/verify` is mandatory when ANY `/verify`-mandatory signal fires (see scoring table). This includes: state machine bugs, multi-user flows, UI recovery/reconnection, realtime behavior, visual regression risk, and any "user should see X when Y" that unit tests can't cover. Not for every `.tsx` change, not for component extraction with identical output.
- `/generate-tests` whenever a regression would be annoying to debug manually — includes any conditional rendering, UI state change, interactive behavior, placeholder copy that could drift, button enable/disable logic, CSS class conditionals, and all security/auth/DB cases; mandatory for any DB migration (P270); skip only for pure CSS-only changes, single hardcoded strings with no logic, or one-liner typo fixes
- `/spec-review` is mandatory after `/generate-tests` when the flow includes `/architect` (architecture decisions need validation against test expectations)
- `/spec-compact` — always include after `/spec-review` (or after `/generate-tests` if `/spec-review` is skipped) for any flow with 2+ pipeline skills that append to the spec. Agent Q&A threads, resolved decision prose, and cross-layer restatements accumulate — `/spec-compact` is the only step that prunes. Skip only for specs under 100 lines or flows where only `/dev` touches the spec.
- `/ux` — apply drop-`/ux` rule strictly: skip ONLY when ALL three conditions are met: (a) ASCII covers ALL states (happy, edge, empty, loading, responsive), (b) no net-new visual component/pattern, (c) no mobile concerns. If ANY condition fails, include `/ux`. "ASCII in conversation covers happy path" ≠ "UX resolved"
- `/decompose` only for 5+ files or 3+ independent concerns
- If spec exists: check `delivery_stage:` first — it takes precedence (see scoring table rows for all 5 stages: `1-prd` through `5-decomposed`); if absent, fall back to `test_files:` — present → start from `/dev`; absent → `/generate-tests` → `/dev`
- `/finish` runs automatically inside `/dev` and `/fix` — never list it as a step in any flow
- **`/spec-review` is mandatory (not optional) for `type: change-request` specs.** Redesigns have pre-existing elements that can silently conflict with new AC — spec-review catches these before implementation. The `*` optional marker applies to new features only.
- **`/challenge-prd` is mandatory** for full and medium pipeline flows AND for all redesigns (`/change-request`). Redesigns inherit assumptions from the predecessor spec that need stress-testing. Skip only for small/inline work.
- After user confirms flow: set `flow:` in spec frontmatter if spec exists
- When writing `flow:` to spec frontmatter, write exactly one of: `fix`, `dev`, `inline`, `create-spec` — never the command chain string
- If you are currently in a worktree (not w0/main), remind the user: spec creation skills (/create-spec, /change-request, /create-bug) must be run from the main repo.
- `/verify` is default for ALL B/C tier tasks AND any task with UI changes at any tier. Suggest skipping only with explicit reason (e.g., "pure backend change, no visual surface, no state-machine behavior")
- **Phase 1 (`/dd:frame-analyze`) is default** when problem clarity is low: symptom described but root cause unknown, user says "something is wrong with X", or multiple possible causes mentioned. Skip only when user says "skip diagnosis" or states a specific falsifiable root cause
- **Spec age check:** when spec exists and (last modified >14 days ago OR `type: change-request`), flag for validation: "Spec is [N] days old / is a change-request. Recommend running `/spec-review` before `/dev` to catch drift against current code."
- **User opt-out keywords:** "light flow", "skip diagnosis", "just do it", "quick" — reduce to scope-only minimal flow. Acknowledge the opt-out: "Light flow activated. Skipped: [list steps and what each would have caught]. Add any step back by name."

## Full pipeline detection

When 3+ of these are true simultaneously, the task is almost certainly a **full pipeline** (C tier). Don't present A as an option — it would be misleading:

1. Touches DB schema (migration, new column, new table, new function)
2. Touches client-side state management (new state machine, new context, new store)
3. Has observability/infrastructure concern (logging, metrics, error tracking, realtime channels)
4. Involves multi-user interaction (host/participant, owner/visitor)
5. Has recovery/resilience behavior (reconnection, retry, fallback states)
6. Requires visual verification (state transitions visible in UI, multi-browser testing)

When 3+ fire: recommend C directly with "This is clearly full pipeline because [list the 3+ signals]."
