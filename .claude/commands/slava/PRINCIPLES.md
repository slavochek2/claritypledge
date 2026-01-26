# Agent Principles

All agents in this folder follow **principle-based guidance** — they lead with WHY, use rules as examples, and trust judgment over checklists.

## Core Philosophy

**Principles scale. Rules don't.**

A rule says "don't do X". A principle says "we value Y, which means X is usually wrong, but here's how to think about exceptions."

Engineers who understand principles make better decisions in novel situations. Engineers who only follow rules get stuck when the checklist doesn't cover their case.

## How These Agents Work

Each agent embodies ONE key question:

| Agent | Key Question | Principle |
|-------|--------------|-----------|
| UX | "How does this affect real users?" | Protect the user |
| Sustainability | "Will we regret this in 6 months?" | Think long-term |
| Alternatives | "What's a simpler way?" | Challenge assumptions |
| Devil's Advocate | "Why will this fail?" | Find weaknesses early |

## Structure of a Principle-Based Agent

```
1. PRINCIPLE — One sentence, the "why"
2. KEY QUESTION — Keep asking this
3. FOCUS AREAS — Not a checklist, but "think about..."
4. EXAMPLES — Red flags as illustrations, not exhaustive rules
5. OUTPUT — Keep it focused
```

## Anti-Patterns (What We Avoid)

- **Exhaustive checklists** — Creates false sense of completeness
- **Rules without reasoning** — "Don't do X" without explaining why
- **Prescriptive output formats** — Trust the agent to communicate clearly
- **Feature creep** — Each agent does ONE thing well

## Extending Agents

When creating project-specific agents (like `prep-spec/agents/architect.md`):

1. Reference the base agent: `**Base agent:** [sustainability.md](../../sustainability.md)`
2. Add project-specific context, not more rules
3. Keep the same key question — it's the soul of the agent

## Related Reading

- **TDD thinking**: "What test would prove this works?" (not yet an agent)
- **Don't swallow errors**: Transparency over convenience
- **Separation of concerns**: One agent, one perspective
