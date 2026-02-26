# Synthetic Usability Testing

Synthetic usability testing uses AI persona agents to simulate real user behavior through browser automation. It produces experience reports and change request candidates before real users encounter friction.

**Why:** User sims find issues that static code review (`/review-all`) and structured UAT (`/verify`) miss — because they test *experience*, not just correctness against the spec.

---

## When to Run

After `/dev` ships a UI feature. Complements `/verify` in the post-work pipeline:

```
/dev → /verify (did we build the spec?) → /sim (does it feel right?) → [change requests] → /ship
```

**`/verify` vs `/sim`:**
- `/verify` — structured acceptance criteria: "Did we build what we said we'd build?" Walks through UAT scenarios, ✅/❌ per criterion.
- `/sim` — persona experience: "Does it feel right to a real user?" Walks through the feature as user archetypes, surfaces friction beyond the spec.

Neither replaces the other. Run both for high-quality UI features. Run `/sim` alone when you already know the spec was met and want the experience perspective.

---

## Personas

Defined in `.claude/personas/`. Each file describes a real user archetype with:
- Background, daily tools, UX expectations
- What frustrates them, how they react when confused
- Simulation instructions (viewport, pace, evaluation method)

| File | Archetype | Best for |
|------|-----------|----------|
| `solo-founder.md` | Cold initiator, no context, low patience | Onboarding, activation, cold-start flows |
| `invited-party.md` | Reactive participant, received a link | Invite flows, second-party acceptance, trust signals |
| `coach.md` | Expert facilitator, evaluating for client adoption | Workflow tools, facilitator views, methodology clarity |
| `ux-critic.md` | Senior product designer, benchmarks against reference tools | Visual consistency, pattern violations, information architecture |

Run the personas most relevant to the feature. For features with two parties (agreements, live sessions), run Solo Founder + Invited Party together.

---

## Output Structure

Each sim run produces three layers:

### 1. Raw Experience (per persona)
First-person stream from the browser agent: observations, feelings, confusion, nice moments, what they'd do next. Desktop (1280px) + mobile (390px) where possible.

### 2. Interpretation
Findings table: what happened, category (UX/copy/flow/technical), root cause, severity (high/med/low). Cross-persona patterns (same friction from multiple personas = stronger signal).

### 3. Change Request Candidates
Proposed improvement titles + one-line descriptions. User cherry-picks which to file as P-number specs.

---

## Triage Tiers

After sim output, classify findings before filing:

| Tier | Type | Process |
|------|------|---------|
| **A — Bugs** | Broken behavior (Enter key fails, RLS error, blank page, data loss) | File as `type: bug` immediately, no design review needed |
| **B — UX polish** | Friction, confusion, inconsistency (copy, layout, empty states, loading) | Review output → approve filing → file as `type: story` with `source: sim` |
| **C — Flow redesign** | Structural issues (wrong information architecture, missing progressive disclosure) | Design first with `/ascii-flows` → spec → file |

Only Tier A items should block shipping. Tier B/C become backlog work.

---

## Change Request Spec Format

Change requests (Tier B/C) are stories with extra frontmatter:

```yaml
---
status: week
type: story
source: sim          # found via synthetic usability testing
changes: p422        # which original feature this improves
persona: solo-founder  # which persona surfaced it
rank: ...
---
```

No separate `change-request` type. Change requests appear on the kanban as regular stories.

---

## Two-Party Simulation

For features involving two parties (agreements, live sessions):

- Session A: `http://localhost:5001` — initiator persona (Solo Founder)
- Session B: `http://127.0.0.1:5001` — reactive persona (Invited Party)

Both run as separate browser agents, coordinated at handoff points. See P447 for implementation spec.

---

## QA Stress Testing (Future)

An adversarial second pass — empty inputs, rapid clicks, boundary conditions. Separate from user persona sims. See P448 for spec.

---

## Skill

```
/sim pN              # run all relevant personas against feature pN
/sim pN --persona coach    # specific persona only
/sim pN --two-party  # run initiator + invited party simultaneously
```

See `.claude/commands/slava/build/sim.md` for full usage.
