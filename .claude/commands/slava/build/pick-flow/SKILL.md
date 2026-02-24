---
name: pick-flow
description: >
  Recommends the right development flow for a task by analyzing its scope and complexity.
  Proposes 2-3 options ranked lightest to heaviest, with exact slash commands, trade-offs,
  and a recommendation. Use when starting work and unsure which flow is appropriate —
  e.g. inline fix vs quick-feature vs full PRD pipeline. Triggered by "/pick-flow",
  "what flow should I use?", "which flow for this?", "should I file a spec?", or whenever
  the user is about to start a task and the right process is unclear.
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
| Spec already written and complete | drop one level lighter |
| ASCII/design already decided in conversation | drop /ux |

## Available commands (in sequence order)

- `/fix` — targeted bug fix, auto-closes feature on success
- `/quick-feature` — skeleton spec in `features/` (30 sec), use for tracking
- `/create-prd` — full PRD with acceptance criteria (3-5 min)
- `/ux` — wireframes/design decisions (UI features only, skip if design is resolved)
- `/architect` — architecture plan (only if new infra, multi-service, or unfamiliar patterns)
- `/generate-tests` — writes test specs before implementation
- `/decompose` — splits into sub-stories (5+ files or 3+ concerns only)
- `/dev` — implements from spec, auto-closes feature on success
- `/review-all` — static code + design + UX review (post-dev, optional)
- `/verify` — live browser UAT (when look/feel matters, optional)
- `/kdd` — captures learnings into docs (optional, after shipping)

## Hard rules

- Never list a command that adds no value for this specific task
- `/architect` only if there are genuine architecture decisions (not just "which file to edit")
- `/ux` only if visual/interaction design is unresolved — skip if ASCII/mockup already decided
- `/decompose` only for 5+ files or 3+ independent concerns
- If spec already exists, start from `/generate-tests` or `/dev`, not `/quick-feature`
- `/review-all` and `/verify` are always optional — only mention in B/C, never force them
