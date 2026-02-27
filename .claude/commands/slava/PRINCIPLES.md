# Agent Principles

All agents in this folder follow **principle-based guidance** — they lead with WHY, use rules as examples, and trust judgment over checklists.

## Core Philosophy

**Principles scale. Rules don't.**

A rule says "don't do X". A principle says "we value Y, which means X is usually wrong, but here's how to think about exceptions."

Engineers who understand principles make better decisions in novel situations. Engineers who only follow rules get stuck when the checklist doesn't cover their case.

---

## Core Development Agents (5)

These agents form the sequential skill flow for feature development:

| Agent | Command | Key Question | Principle |
|-------|---------|--------------|-----------|
| **Business** | `/create-prd` | "Why does this matter? What's the user value?" | Start with the problem, not the solution |
| **UX** | `/ux` | "How does this affect real users?" | Protect the user |
| **Architect** | `/architect` | "Will we regret this? Is it secure?" | Think long-term, design for production |
| **Tests** | `/generate-tests` | "How do we verify this works?" | Define success before building |
| **Dev** | `/dev` | "Why will this fail?" | Find weaknesses early, iterate until tests pass |

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

### Sequential Flow (P143)

**New features (after 2026-02-13):**
```
/create-prd → /ux (if UI) → /architect → /generate-tests → /dev
```

**Old features (before 2026-02-13):**
- Can still use `/prep-spec` (deprecated, backward compatibility only)

### When to Use Strategic Thinking Agents

| Situation | Use |
|-----------|-----|
| Starting a new feature | `/create-prd` — Generate business requirements |
| Scope feels bloated | `/lean` — Challenge scope, find MVP |
| Feeling stuck on approach | `/innovate` — Explore 30 alternatives |

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

### Sustainability Thinking (defined)

When evaluating options: prefer the one that (1) holds up without maintenance discipline, (2) eliminates a recurring decision rather than deferring it, (3) catches mistakes mechanically rather than relying on memory. Development speed is explicitly not a factor — a faster solution that creates cognitive overhead or future errors is worse, not better.
