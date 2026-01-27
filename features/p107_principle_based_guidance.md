# P107: Principle-Based Guidance

## Problem

Our CLAUDE.md and agents mix principles with rules. Rules don't scale — they create checklists that feel complete but miss novel situations. Principles teach reasoning.

## Goal

Restructure all guidance (CLAUDE.md, agents, skills) to be principle-based:
- Lead with WHY, not WHAT
- Use rules as examples, not exhaustive lists
- Trust judgment over checklists

## Key Insight

**Principles scale. Rules don't.**

A rule says "don't do X". A principle says "we value Y, which means X is usually wrong — here's how to think about it."

## Current State

- CLAUDE.md has good principles buried under many rules
- Too many agents with overlapping concerns (sustainability, alternatives, devil's advocate)
- Agents structured as checklists, not thinking frameworks

## Proposed Agent Structure

Instead of 4+ specialized reviewers, consolidate to 3 perspectives:

| Agent | Perspective | Key Question |
|-------|-------------|--------------|
| **UX** | User advocate | "How does this affect real users?" |
| **Lean Coach** | Business/simplicity | "What's the simplest thing that could work?" |
| **Dev** | Technical sustainability | "Will this work in production?" |

### Why These Three?

- **UX** — Protects users (can't defend themselves in design meetings)
- **Lean Coach** — Challenges assumptions, finds simpler paths, validates we're building the right thing
- **Dev** — Catches technical issues before they ship (errors, edge cases, maintainability)

### What Gets Merged

| Old | New Home | Reasoning |
|-----|----------|-----------|
| sustainability.md | Dev | Technical long-term thinking |
| alternatives.md | Lean Coach | Simpler solutions, challenge constraints |
| devils-advocate.md | Dev + Lean Coach | Split: technical failures → Dev, business assumptions → Lean Coach |
| ux.md | UX | Stays as-is |

## Tasks

- [ ] Rewrite CLAUDE.md "Agent Behavior Rules" as principles with examples
- [ ] Consolidate agents to UX / Lean Coach / Dev
- [ ] Update skills that reference old agents (simplify, prep-spec)
- [ ] Review all checklists — convert to "think about..." with examples

## Success Criteria

- Reading an agent teaches you how to think, not what to check
- Novel situations are handled by applying principles, not finding the right rule
- Fewer agents, each with clear purpose

## References

- `.claude/commands/slava/PRINCIPLES.md` — Initial philosophy draft
- Lean Startup methodology (Lean Coach perspective)
- TDD mindset (Dev perspective)
