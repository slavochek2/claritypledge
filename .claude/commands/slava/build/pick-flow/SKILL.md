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
Commands: /cmd1 → /cmd2
Fits when: [one line]
Trade-off: [one line risk/downside]

**B — [name]** (medium)
Commands: /cmd1 → /cmd2 → /cmd3
Fits when: [one line]
Trade-off: [one line risk/downside]

**C — [name]** (full)   ← only include if genuinely warranted
Commands: /cmd1 → /cmd2 → /cmd3 → /cmd4
Fits when: [one line]
Trade-off: [one line risk/downside]

→ Recommend: [A/B/C] — [one sentence why]

Which flow?
```

## Scope scoring

| Signal | Points toward |
|--------|--------------|
| 1-2 files, pure UI state change | A |
| 3-5 files, no new DB/auth | A or B |
| New route, API endpoint, or DB column | B |
| New auth logic, RLS, or edge function | C |
| 5+ files or 3+ independent concerns | B or C |
| Spec already written and complete | skip spec-writing steps, start from `/generate-tests` or `/dev` |
| ASCII/design already decided in conversation | drop /ux |

## Available commands (in sequence order)

- `/fix` — targeted bug fix, stops at QA gate on success (run `/ship` to close)
- `/quick-feature` — skeleton spec in `features/` (30 sec), use for tracking
- `/create-prd` — full PRD with acceptance criteria (3-5 min)
- `/ux` — wireframes/design decisions (UI features only, skip if design is resolved)
- `/architect` — architecture plan (only if new infra, multi-service, or unfamiliar patterns)
- `/generate-tests` — writes test specs before implementation
- `/decompose` — splits into sub-stories (5+ files or 3+ concerns only)
- `/dev` — implements from spec, stops at QA gate on success (run `/ship` to close)
- `/review-all` — 3-agent parallel review (code + design + UX); **auto-runs inside both `/dev` and `/fix`** — do NOT list it as a step in any flow (it's already included)
- `/verify` — live browser UAT (when look/feel matters, optional)
- `/kdd` — captures learnings into docs (optional, after shipping)

## Quality principle

> **Run steps with meaningful quality impact for this task's scope and risk. Skip steps where overhead exceeds the gain — not because they add zero value in theory, but because for a 1-file UI change, `/architect` costs 5 min and adds nothing that reading the file doesn't already provide.**

Apply this to every step. Don't default to "might help a bit" — default to "clearly helps for this specific task."

## Hard rules

- Never list a command that adds no value for this specific task
- `/architect` only if there are genuine architecture decisions (not just "which file to edit")
- `/ux` only if visual/interaction design is unresolved — skip if ASCII/mockup already decided
- `/decompose` only for 5+ files or 3+ independent concerns
- If spec already exists, start from `/generate-tests` or `/dev`, not `/quick-feature`
- `/review-all` runs automatically inside `/dev` and `/fix` — never list it as a step in any flow
- `/verify` is optional — only list it if look/feel matters for this task
