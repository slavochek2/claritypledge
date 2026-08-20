---
name: pick-flow
description: >
  Recommends a development flow by classifying the task, naming real risks,
  and picking steps that address those risks. Principles over scoring tables.
when_to_use: >
  When starting work and unsure which development flow to use. Triggered by "/pick-flow",
  "what flow should I use?", or whenever the user is about to start a task and the right
  process is unclear. Proactively offer at the start of any non-trivial task (P-number
  mentioned, bug described, "what do we do next" asked). Skip for one-liner fixes, typo
  edits, or when the user has already named the exact commands to run.
version: 3.1.0
---

# pick-flow

Analyze the task and recommend a flow. No preamble, no padding.

## How to think about flow selection

Don't score signals. Don't classify tiers. Instead:

1. **Classify** — what type of task is this? (Step 0)
2. **Name risks** — what 1-3 things could actually go wrong? (Step 1, features/redesigns only)
3. **Match steps to risks** — each risk maps to a protective step. No risk, no step.
4. **Check firewalls** — five hard stops that override judgment.

A good flow has every step justified by a named risk. A bad flow includes steps "just in case."

## Step -1: Lean viability check

Read `docs/lean-canvas.md`. Ask: who needs this, are they using the product today, does it help the current 30-day priority?

If the feature serves a use case that doesn't exist yet:
```
⚠️ Lean check: This serves [segment/use case] which doesn't exist yet.
Current priority: [from lean canvas]. Recommend: backlog.
```

Skip for: bugs, refactors, infrastructure, and when user has confirmed the use case. If lean-canvas doesn't state a current priority, skip this check and note the gap.

## Step 0: Classify the task

| Task type | Default flow |
|-----------|-------------|
| **Feature** (no spec) | `/create-spec` → risk assessment (Step 1) |
| **Feature** (spec exists) | Check `pipeline_plan`/`pipeline_ran` → resume from first unrun step. If absent, check `delivery_stage:` (legacy). If neither → Step 1 |
| **Bug** (trivial, self-evident cause) | `/fix` → done |
| **Bug** (root cause known, needs proof) | `/reproduce` → `/fix` → done |
| **Bug** (root cause unclear) | `/slava:dd:frame-analyze` → `/reproduce` → `/fix` → done |
| **Redesign** (design was wrong, code works) | `/change-request` → `/challenge-prd` → risk assessment (Step 1) |
| **Refactor** (no behavior change) | `/create-spec` (type: task) → `/dev` |
| **Data migration** | `/create-spec` (type: task) → `/generate-tests` → `/dev` |
| **Infrastructure** (skills/hooks/rules/CLAUDE.md) | `/create-spec` → draft → adversarial subagent → `decisions.md` → implement |
| **Test-only / content-only** | Inline or `/create-spec` (lightweight) → `/dev` |

**If Step 0 gives a complete flow, output it and stop.** Only features and redesigns continue to Step 1.

### Artifact-weight check (before routing to a full spec)

Not every change needs a full spec. Three tiers:

- **Full spec** (`/create-spec`): multi-file changes, new features, migrations, anything with blast radius, work that crosses subsystems.
- **Plan** (Plan Mode, written to `~/.claude/plans/`): multi-step but small scope, needs alignment before implementation. Example: 20-line `.claude/rules/` file, single-file refactor.
- **Inline**: single-file, obvious, user said "just do it." Example: typo, copy tweak.

Signal: if the spec's Done-When would have only 1-2 checkboxes, it doesn't need a full spec. A `/create-spec` for a 20-line rule file is overhead — propose Plan Mode or inline instead.

**Spec gate:** Does a P-number exist? If not, route to `/create-spec`, `/create-bug`, or `/change-request` first. Only test-only changes skip this.

**Redesign test:** Code broken → `/fix`. Design wrong → `/change-request`. Both → `/change-request` + separate `/create-spec` for new capability.

## Step 1: Name the risks (features and redesigns only)

Look at the spec, conversation, and code. Name 1-3 concrete risks — not categories, actual things that could go wrong. Then match each risk to the step that addresses it.

**How to reason (examples, not a lookup table):**

- "Users will see something new or different" → `/ux` (resolve design) + `/verify` (confirm in browser)
- "DB schema changes or new data model" → `/architect` (structure review) + `/generate-tests` (lock behavior)
- "Auth, RLS, or permissions logic" → `/architect` (security review) + `/generate-tests`
- "Multiple viable approaches, trade-offs unclear" → research the options before `/architect`
- "PRD assumptions haven't been stress-tested" → `/challenge-prd`
- "Spec is stale (>14 days) or is a change-request" → `/spec-review` before `/dev`
- "5+ files or 3+ independent concerns" → `/decompose`
- "Conditional rendering, state changes, business logic" → `/generate-tests`
- "Spec has grown past 100 lines with pipeline residue" → `/spec-compact`
- "Feature is a new visual surface where polish will splinter across /dev iterations" → `/view` (between `/ui` and `/generate-tests`)

**If you cannot name a risk that a step addresses, don't include that step.**

## Step 2: Output

```
## Flow for: [task name, ≤8 words]

### Risks
1. [concrete risk] → [step(s) that address it]
2. [concrete risk] → [step(s)]
3. [concrete risk] → [step(s)] (if applicable)

### Recommended flow
/cmd1 → /cmd2 → ... → /dev

### Model + effort
[e.g. Opus/xhigh through /architect → switch to Sonnet/low for /dev]

### Safe to skip
- /[cmd]: [why risk is low enough]. Accepting: [what could go wrong].
- (none — all steps address real risks)

→ Proceed? Or "skip [step]" / "light flow" to adjust.
```

**Light flow:** When user says "light flow", "quick", or "just do it" — collapse to minimal flow. State what was removed: "Light flow: /dev only. Skipped: /architect (would catch X), /verify (would catch Y). Add any step back by name."

## Model + effort

Every flow runs at a model + effort tier. Recommend it explicitly — the user toggles `/model` and `/effort`; you cannot set them yourself, so recommend and let them flip.

| Work in the flow | Model | Effort |
|---|---|---|
| Planning, `/create-spec`, `/challenge-prd`, `/ux`, `/architect`, `/spec-review`, `/falsify`, `/adversarial-review`, strategy, ambiguous root-cause, value judgment | **Opus** | high / xhigh |
| Executing a detailed spec or plan — `/dev`, `/fix`, `/generate-tests`, `/decompose`, `/verify`, `/kdd`, `/finish`, code review, mechanical edits | **Sonnet** | low / medium |
| Status, cleanup, lookups, frontmatter fixes | Sonnet / Haiku | low |

Most flows split: **Opus to plan, Sonnet to execute.** Name the switch point in the output, e.g. "Opus/xhigh through `/architect`, then Sonnet/low for `/dev`." This table is for the **session** model only — subagents spawned inside skills are already pinned to `sonnet`.

## Firewalls

1. **Spec gate:** Work needs a P-number before building. Route to creation skill first.
2. **Infrastructure gate:** Changes to `.claude/commands/`, `.claude/rules/`, `.claude/hooks/`, `CLAUDE.md`, or `scripts/` → draft → adversarial subagent → `decisions.md` → implement. Skip only for purely additive single-file changes with no shared state.
3. **`/finish` is inside `/dev`:** Never list it as a separate step.
4. **`flow:` frontmatter:** Write exactly one of: `fix`, `dev`, `inline`, `quick-feature`.
5. **Resume from pipeline trail:** If spec has `pipeline_plan` and `pipeline_ran`, diff them — first item in plan not in ran = resume point. Present remaining pipeline. If spec has old-format `delivery_stage` (numbered: `1-prd`, `2-ux-review`, etc.) without `pipeline_plan`, use legacy resume table below.

### Legacy resume table (old-format specs only)

| `delivery_stage` value | Resume from |
|----------------------|-------------|
| `5-decomposed` | `/dev` |
| `4-tests-ready` | `/spec-review` → `/spec-compact` → `/decompose`* → `/dev` |
| `3.5-ui-review` | `/generate-tests` → ... → `/dev` |
| `3-arch-review` | `/ui` (if UI) → `/generate-tests` → ... → `/dev` |
| `2-ux-done` or `2-ux-review` | `/architect` → ... → `/dev` |
| `1-prd` or `1-prd-review` | `/ux` (if UI) or `/architect` → ... → `/dev` |

## After user confirms

- Set `flow:` in spec frontmatter if spec exists (values: `fix|dev|inline|quick-feature`)
- **Set `pipeline_plan:`** — ordered inline list of all tracked skills in the confirmed flow. Example: `pipeline_plan: [create-spec, challenge-prd, architect, generate-tests, dev, verify]`
- **Set `pipeline_skipped:`** — inline list of skipped skills with reasons. Example: `pipeline_skipped: [ux -- no net-new visual component, decompose -- under 5 files]`. Omit if nothing skipped.
- **Initialize `pipeline_ran: []`** (empty — skills fill this as they run)
- Do NOT write skip info to `## Next Steps` (it goes to `pipeline_skipped` in frontmatter)
- If in a worktree: remind user that spec creation must happen from main repo

## Available commands (sequence order)

`/create-spec` · `/challenge-prd` · `/ux` · `/architect` · `/ui` · `/view` · `/generate-tests` · `/spec-review` · `/spec-compact` † · `/decompose` · `/dev` · `/verify` · `/park` · `/kdd` †

Also: `/reproduce` (bug confirmation + failing test) · `/fix` (bugs) · `/change-request` (redesigns) · `/create-bug` (bug without P-number) · `/slava:dd:frame-analyze` (unclear root cause) · `/park` (done on branch, merge later)

† **Non-stamping — never put these in `pipeline_plan`.** `/spec-compact` and `/kdd` do not write
`pipeline_ran`. Every tracked skill's predecessor check is an **exact string match** against
`pipeline_ran`, so a plan naming a non-stamping skill deadlocks whatever step follows it —
permanently, with no way to satisfy the check. (Live instance: `p686`'s plan carries
`spec-compact`, which hard-stops `/decompose` on that spec.)

**Rule when editing these two lines:** before adding a name, grep its skill file for
`pipeline_ran`. No hit → mark it `†` here, or leave it out. This list is the plan vocabulary;
anything in it must be a name some skill will stamp.
