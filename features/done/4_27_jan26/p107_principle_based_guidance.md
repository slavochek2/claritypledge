# P107: Principle-Based Guidance

## Problem

Our CLAUDE.md and agents mix principles with rules. Rules don't scale — they create checklists that feel complete but miss novel situations. Principles teach reasoning.

**Current state:**
- 22 total agents/skills (4 standalone + 4 skills + 14 prep-spec subagents)
- Many overlap: sustainability ≈ devils-advocate, alternatives ≈ lean thinking
- prep-spec has 14 agents — most are doc-checkers that micromanage each document
- CLAUDE.md has good principle sections but also rule-heavy sections

## Goal

Restructure all guidance (CLAUDE.md, agents, skills) to be principle-based:
- Lead with WHY, not WHAT
- Use rules as examples, not exhaustive lists
- Trust judgment over checklists
- Consolidate overlapping agents into clear perspectives

## Key Insight

**Principles scale. Rules don't.**

A rule says "don't do X". A principle says "we value Y, which means X is usually wrong — here's how to think about it."

---

## New Agent Architecture

### The Mental Model

```
         ┌─────────────────────────────────────────┐
         │           Three Perspectives            │
         ├─────────────┬─────────────┬─────────────┤
         │     UX      │     Dev     │ Lean Coach  │
         │   (User)    │  (Technical)│  (Business) │
         └─────────────┴─────────────┴─────────────┘
                           ↓
         ┌─────────────────────────────────────────┐
         │              Alignment                  │
         │    (Does it fit our strategy/docs?)     │
         └─────────────────────────────────────────┘
```

### Consolidation: 22 → 8

| Layer | Before | After |
|-------|--------|-------|
| Standalone | 4 agents | 4 agents (UX, Dev, Lean, Innovation) |
| prep-spec | 14 agents | 4 agents (UX, Architect, Lean Coach, Alignment) |
| **Total** | **22** | **8** |

### Standalone Agents (4)

| Agent | Key Question | Absorbs |
|-------|--------------|---------|
| **UX** | "How does this affect real users?" | — (unchanged) |
| **Dev** | "Will this work in production?" | sustainability + devils-advocate |
| **Lean** | "What's the simplest thing that validates our hypothesis?" | alternatives |
| **Innovation** | "What possibilities are we not seeing?" | — (unchanged) |

**Why these four — two pairs:**
- **UX + Dev** — Protect users and catch technical issues (execution quality)
- **Lean + Innovation** — Converge (eliminate waste) and diverge (explore possibilities)

The Lean/Innovation split mirrors design thinking: diverge to explore, converge to decide.

### prep-spec Agents (4)

| Agent | Key Question | Absorbs |
|-------|--------------|---------|
| **UX** | "Does this spec serve users?" | — |
| **Architect** | "Is this technically sound?" | execution-scout |
| **Lean Coach** | "Are we building the right thing simply?" | lean-startup-coach, business |
| **Alignment** | "Does this fit our docs and strategy?" | ALL doc-checkers* |

*Doc-checkers absorbed into Alignment: hypotheses, decisions, definitions, philosophy, theory-of-change, lean-canvas, kdd-scout

**Note:** Innovation stays standalone — it's about divergent thinking (exploring possibilities), while Lean Coach is convergent (eliminating waste). Different modes of thought.

**Key change:** Alignment agent thinks strategically and *references* docs as needed, rather than having separate agents babysit each document.

---

## Workflow: How to Use Agents

### Feature Development Flow

```
1. Write spec (features/pN_name.md)
     ↓
2. /prep-spec [spec-path]
   └── Runs: UX → Architect → Lean Coach → Alignment
   └── Each gives ONE key insight + findings table
     ↓
3. Fix spec based on feedback
     ↓
4. /dev [spec-path]
   └── TDD implementation
     ↓
5. /kdd (if interesting decisions were made)
```

### Quick Reviews (not full specs)

| Command | Use When |
|---------|----------|
| `/ux` | Review UI change, check user impact |
| `/dev` | Review code/architecture, check sustainability |
| `/lean` | Converge — question scope, eliminate waste |
| `/innovate` | Diverge — explore possibilities, challenge constraints |

### Code Reviews

```
/dev [file or PR]
└── Checks: sustainability, failure modes, edge cases
└── Combines what sustainability + devils-advocate did separately
```

---

## CLAUDE.md Changes

### Sections to Reframe (rule → principle)

| Current Section | Problem | New Approach |
|-----------------|---------|--------------|
| Pre-Creation Gate (MANDATORY) | Checklist, steps, MANDATORY | → "Single Source of Truth Principle" |
| File Creation Rules | NEVER lists | → Fold into principle above |
| Test Modification Rules | NEVER do X, NEVER do Y | → "Test Integrity Principle" |
| Worktree Branch Naming | Prescriptive steps | Keep as reference (procedural, not behavioral) |

### Example Rewrite

**Before:**
```markdown
### Test Modification Rules (IMPORTANT)
**NEVER do these without explicit user approval:**
- Uncomment or enable skipped tests
- Use .only() to isolate tests
- Delete or disable failing tests
```

**After:**
```markdown
### Test Integrity Principle
> Tests are executable specifications. Modifying tests to pass means changing the spec.

**The principle:** If tests fail, the code is wrong (not the test). If you believe a test is wrong, explain why and ask before changing it.

**Examples of test manipulation to avoid:**
- Enabling skipped tests (they're skipped for a reason)
- Using .only() (breaks CI for others)
- Deleting failing tests to make suite green
```

---

## File Changes

### Archive (move to `.claude/commands/slava/archive/`)

| File | Reason |
|------|--------|
| `prep-spec/agents/hypotheses.md` | → Alignment |
| `prep-spec/agents/decisions.md` | → Alignment |
| `prep-spec/agents/definitions.md` | → Alignment |
| `prep-spec/agents/philosophy.md` | → Alignment |
| `prep-spec/agents/theory-of-change.md` | → Alignment |
| `prep-spec/agents/lean-canvas.md` | → Alignment |
| `prep-spec/agents/kdd-scout.md` | → Alignment |
| `prep-spec/agents/execution-scout.md` | → Architect |
| `prep-spec/agents/business.md` | → Lean Coach |
| `prep-spec/agents/lean-startup-coach.md` | Renamed → lean-coach.md |
| `sustainability.md` | → Dev |
| `devils-advocate.md` | → Dev |
| `alternatives.md` | → Lean Coach |

### Create/Update

| File | Action |
|------|--------|
| `.claude/commands/slava/dev.md` | Rewrite: include sustainability + devils-advocate thinking |
| `.claude/commands/slava/lean/index.md` | Update: include alternatives thinking |
| `.claude/commands/slava/innovate/index.md` | Review: ensure divergent thinking focus is clear |
| `.claude/commands/slava/prep-spec/agents/lean-coach.md` | New: merge lean-startup-coach + business |
| `.claude/commands/slava/prep-spec/agents/alignment.md` | Rewrite: strategic thinking + doc reference checklist |
| `.claude/commands/slava/prep-spec/SKILL.md` | Update: call 4 agents instead of 14 |
| `CLAUDE.md` | Reframe rule sections as principles |
| `PRINCIPLES.md` | Update agent table (4 standalone: UX, Dev, Lean, Innovation) |

---

## Tasks

### Phase 1: Write New Agents
- [x] Rewrite `dev.md` — include sustainability + devils-advocate perspectives
- [x] Rewrite `lean/index.md` — include alternatives perspective
- [x] Review `innovate/index.md` — ensure divergent thinking focus is clear
- [x] Create `prep-spec/agents/lean-coach.md` — merge lean-startup-coach + business
- [x] Rewrite `prep-spec/agents/alignment.md` — strategic thinking with doc checklist
- [x] Rewrite `prep-spec/agents/architect.md` — include execution-scout thinking

### Phase 2: Update Skills
- [x] Update `prep-spec/SKILL.md` — call 4 agents (UX, Architect, Lean Coach, Alignment)
- [x] Update `simplify/SKILL.md` — reference Lean Coach instead of alternatives

### Phase 3: Update CLAUDE.md
- [x] Reframe "Pre-Creation Gate" as "Single Source of Truth Principle"
- [x] Reframe "Test Modification Rules" as "Test Integrity Principle"
- [x] Fold "File Creation Rules" into principle (kept "Where files go" as reference)
- [x] Review NEVER/MUST/MANDATORY — kept for firewalls (git safety), converted others

### Phase 4: Update PRINCIPLES.md
- [x] Update agent table to show 4 standalone agents (UX, Dev, Lean, Innovation)
- [x] Add workflow section showing when to use each
- [x] Add firewalls vs principles distinction

### Phase 5: Archive Old Agents
- [x] Create `.claude/commands/slava/archive/` directory
- [x] Move 14 archived agents (listed above)
- [ ] Verify nothing breaks by running /prep-spec on a test spec

### Phase 6: Test & Validate
- [ ] Run /prep-spec on existing spec — verify 4 agents run correctly
- [ ] Run /dev, /ux, /lean, /innovate manually — verify they work
- [ ] Delete archive folder after 1 week if no issues

---

## Success Criteria

- [ ] Reading an agent teaches you *how to think*, not *what to check*
- [ ] Novel situations handled by applying principles, not finding the right rule
- [ ] 8 agents total (down from 22): 4 standalone + 4 prep-spec
- [ ] Each agent has ONE clear perspective (User / Technical / Converge / Diverge / Strategy)
- [ ] CLAUDE.md has no NEVER/MUST lists without accompanying principle
- [ ] /prep-spec runs 4 agents, not 14

---

## References

- `.claude/commands/slava/PRINCIPLES.md` — Philosophy document
- Lean Startup methodology (Lean Coach perspective)
- TDD mindset (Dev perspective)
- "Protect the user" (UX perspective)
