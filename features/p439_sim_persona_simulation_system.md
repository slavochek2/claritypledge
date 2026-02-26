---
status: today
type: task
rank: 125481.0
workstream: foundation
created_date: 2026-02-26
tags:
  - personas
  - ux-simulation
  - sim
  - change-request
  - tooling
---

# P439: /sim — Persona Simulation System

## Problem

After `/dev` ships a feature, there is no structured way to discover UX friction before calling it done. Static code review (`/review-all`) catches patterns but not experience. Smoke testing (`/verify`) confirms things work but not whether they feel right. The gap: no synthetic user walkthrough that produces actionable improvement specs.

p422 and p425 were shipped but feel off in ways that only become visible when you actually use them. This is the general problem.

## Solution

A three-layer persona simulation system:

1. **Experience Reporter** — browser agent navigates the feature as a persona (Claude in Chrome), records raw first-person stream: observations, feelings, confusion, what's nice, what's not, what they'd do next. Desktop + mobile viewport.
2. **Interpreter** — reads raw reports across personas, classifies issues (UX pattern / copy / flow / technical), identifies root cause, flags cross-persona patterns.
3. **Change Request Generator** — produces consolidated report. User cherry-picks findings. Selected findings become `type: change-request` P-number specs linked to the original.

## Pipeline Position

```
/dev → /sim → [change requests if any] → done
```

Replaces `/verify` as the pre-done gate for any feature with UI. `/verify` stays for pure functional smoke testing.

## Architecture

### Personas (`.claude/personas/`)
Public, version-controlled, agent-accessible. Three to start:

| File | Archetype | Tests |
|------|-----------|-------|
| `solo-founder.md` | Cold initiator, no context, low patience | Onboarding, activation, cold-start |
| `invited-party.md` | Reactive participant, received a link | Other side of every feature |
| `coach.md` | Expert facilitator, workflow-focused | Distribution fit, facilitator adoption |
| `ux-critic.md` | Senior product designer, benchmarks against reference tools | Visual consistency, pattern violations, information architecture |

Each persona defines: background, daily tools, UX expectations, what frustrates them, how they react when confused.

### New Feature Type
Add `type: change-request` to `.claude/rules/features.md`. Required additional frontmatter:
- `changes: pN` — which original spec this modifies
- `source: sim` — origin (vs manual, user-reported, etc.)
- `persona: <name>` — which persona surfaced it

### Skill (`.claude/commands/slava/build/sim.md`)
```
/sim pN              # all personas
/sim pN --persona solo-founder  # specific persona
/sim                 # features in-progress status
```

## Output Format

```
## [Persona Name] — [Feature]

### Raw Experience
[First-person stream: observations, feelings, actions, confusions]

### Desktop vs Mobile
[What differs at 390px vs 1280px]

---

## Interpretation

| Finding | Category | Root Cause | Severity |
|---------|----------|------------|----------|
| ...     | UX/copy/flow/technical | ... | high/med/low |

### Cross-persona patterns
[Same friction from multiple personas = stronger signal]

---

## Change Request Candidates
[Proposed CR titles + one-line description — user decides which to file]
```

## Acceptance Criteria

- [x] 4 persona files exist in `.claude/personas/` (solo-founder, invited-party, coach, ux-critic)
- [x] `/sim` skill created at `.claude/commands/slava/build/sim.md`
- [x] `source: sim` change request pattern added to `.claude/rules/features.md`
- [x] CLAUDE.md updated: merge gate hard rule added (pipeline table held until skill is live)
- [x] First run completed on p422 + p425 (on `p422-p425-uat` branch)
- [x] Change requests filed from findings (P442–P446 bugs, plus P447/P448 backlog items)

## First Run Targets

- **p422** — Clarity Partner Agreement (create + invite + accept flow)
- **p425** — AI-Guided Story Creation (stake position → chat loop → save)
- **Personas to run:** Solo Founder + Invited Party (most relevant to these two features)
- **URL:** `localhost:5001`
