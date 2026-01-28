# Agent Principles

All agents in this folder follow **principle-based guidance** — they lead with WHY, use rules as examples, and trust judgment over checklists.

## Core Philosophy

**Principles scale. Rules don't.**

A rule says "don't do X". A principle says "we value Y, which means X is usually wrong, but here's how to think about exceptions."

Engineers who understand principles make better decisions in novel situations. Engineers who only follow rules get stuck when the checklist doesn't cover their case.

---

## Standalone Agents (4)

Use these anytime — they're invocable skills, not just prep-spec components.

| Agent | Command | Key Question | Principle |
|-------|---------|--------------|-----------|
| **UX** | `/ux` | "How does this affect real users?" | Protect the user |
| **Dev** | `/dev` | "Will we regret this? Why will this fail?" | Think long-term, find weaknesses early |
| **Lean** | `/lean` | "What's the simplest thing that validates?" | Build less, learn faster |
| **Innovation** | `/innovate` | "What possibilities are we not seeing?" | Diverge before converging |

### Two Pairs, Two Modes

```
┌─────────────────────────────────────────────┐
│         EXECUTION QUALITY                   │
│   UX (protect users) + Dev (production)     │
├─────────────────────────────────────────────┤
│         STRATEGIC THINKING                  │
│   Lean (converge) + Innovation (diverge)    │
└─────────────────────────────────────────────┘
```

- **UX + Dev**: Catch issues before they ship (user friction, tech debt, failure modes)
- **Lean + Innovation**: Converge (eliminate waste) and diverge (explore possibilities)

### When to Use Each

| Situation | Use |
|-----------|-----|
| About to write code | `/dev` — TDD + sustainability thinking |
| Reviewing UI/flow | `/ux` — User perspective |
| Scope feels bloated | `/lean` — Challenge, find MVP |
| Feeling stuck on approach | `/innovate` — Explore 30 alternatives |
| Full spec review | `/prep-spec` — All perspectives |

---

## prep-spec Agents (4)

When you run `/prep-spec`, these four perspectives review the spec:

| Agent | Key Question | Absorbs |
|-------|--------------|---------|
| **UX** | "How does this feel to use?" | — |
| **Architect** | "Will we regret this in 6 months?" | sustainability, devils-advocate, execution-scout |
| **Lean Coach** | "Are we building the right thing simply?" | lean-startup-coach, business, alternatives |
| **Alignment** | "Does this fit our strategy?" | hypotheses, decisions, definitions, philosophy, kdd-scout |

---

## Structure of a Principle-Based Agent

```
1. PRINCIPLE — One sentence, the "why"
2. KEY QUESTION — Keep asking this
3. HOW TO THINK — Teach reasoning, not rules
4. FOCUS AREAS — Not a checklist, but "think about..."
5. EXAMPLES — Red flags as illustrations, not exhaustive rules
6. OUTPUT — Keep it focused
```

## Anti-Patterns (What We Avoid)

- **Exhaustive checklists** — Creates false sense of completeness
- **Rules without reasoning** — "Don't do X" without explaining why
- **Many small agents** — Each babysitting one document (consolidate!)
- **Feature creep** — Each agent does ONE thing well

---

## Firewalls vs Principles

Not everything is a principle. Some things are **firewalls** — non-negotiable rules:

| Firewalls (Hard Rules) | Principles (Teach Reasoning) |
|------------------------|------------------------------|
| Never commit secrets | Test integrity |
| No destructive git without asking | Single source of truth |
| No production database access | Sustainability thinking |

Firewalls protect against catastrophic, irreversible harm. Principles guide everyday decisions.
