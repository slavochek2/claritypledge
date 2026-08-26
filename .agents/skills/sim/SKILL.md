---
name: sim
description: Run persona simulations against a feature — synthetic usability testing that produces experience reports and change request candidates persisted to .private/sim/
when_to_use: After /dev ships a UI feature. Replaces /verify as the pre-done UX gate. Run before calling a feature done.
version: 1.0.0
---

# /sim — Persona Simulation System

**Purpose:** Simulate real users walking through a feature using browser automation. Produces first-person experience reports, classified findings, and change request candidates (user cherry-picks which to file as P-number specs).

**Pipeline position:**
```
/dev → /verify (spec compliance) → /sim (experience) → [file change requests if any] → /ship
```
Both `/verify` and `/sim` are optional post-work. `/verify` checks you built what the spec said. `/sim` checks that what you built feels right to real users. Run both for high-quality UI features.

**Full reference:** `docs/technical/synthetic-usability-testing.md`

---

## Invocation

```
/sim pN                          # all relevant personas for this feature
/sim pN --persona solo-founder   # single persona only
/sim pN --two-party              # coordinated two-session run (P447, not yet implemented)
/sim pN --stress                 # adversarial QA pass (P448, not yet implemented)
```

---

## Step 1 — Load the Feature Spec

Read `features/p{N}_*.md`. Identify:
- What flow does this feature implement?
- Who are the parties involved (one user? two users? facilitator + participant?)
- What are the entry points (URLs, starting states)?

---

## Step 2 — Select Personas

Choose the most relevant personas from `.claude/personas/`:

| Persona | Use when |
|---------|----------|
| `solo-founder` | Feature has an initiator / creator flow (starting a session, creating an agreement, drafting a story) |
| `invited-party` | Feature has a second-party flow (accepting an invitation, joining a session, receiving something) |
| `coach` | Feature is used in a professional facilitation context, or has workflow / dashboard elements |
| `ux-critic` | Always useful — run for any UI feature to catch pattern violations and consistency issues |

**Minimum:** `solo-founder` + `ux-critic` for any UI feature.
**For two-party features** (agreements, live sessions): also run `invited-party`.

---

## Step 3 — Generate Persona Context

Before running browser automation, generate a specific use-case scenario for each persona. This anchors the simulation in a realistic situation rather than generic exploration.

**Template:**
```
You are [persona name]. [2-sentence backstory from persona file].

Today you are: [specific scenario — what brought you here, what you want to accomplish].

Your starting point: [URL and any required setup — logged in as user X, agreement ID Y already created, etc.]
```

**Example (Solo Founder on p425):**
```
You are Alex, a solo founder building a B2B SaaS tool. You heard about ClarityPledge from a newsletter and want to try creating a communication agreement with your co-founder before your next difficult conversation.

Today you are: opening ClarityPledge for the first time with zero prior context, trying to figure out how to create a story.

Starting point: http://localhost:5001 — not logged in.
```

---

## Step 4 — Run Browser Automation (per persona)

Use **Claude in Chrome** (`mcp__claude-in-chrome__*`) for each persona.

**Instructions for the browser agent:**

```
You are simulating [PERSONA NAME]. Read their full profile at `.claude/personas/[file].md` before starting.

Simulation instructions:
1. Follow the persona's natural behavior (from their "Simulation Instructions" section)
2. Narrate in first person as you navigate: what you see, what you feel, what confuses you, what you'd click next
3. Note every moment of friction, confusion, or delight
4. At each screen: note what draws your eye first, what's unclear, what's missing
5. Don't skip steps or jump ahead — move through the UI as a real user would
6. If you get stuck for more than 30 seconds on a step, note exactly where and why, then try one more approach before stopping

Starting context:
[PASTE GENERATED CONTEXT FROM STEP 3]

Produce a raw experience stream — not a list, but a narrative. We'll classify it afterward.
```

**Viewport:** Desktop 1280px default. Mobile 390px if the persona file specifies mobile checking.

---

## Step 5 — Interpret Findings

After all browser agents complete, produce an interpretation pass:

```markdown
## Interpretation

### Findings

| Finding | Persona(s) | Category | Severity | Root Cause |
|---------|-----------|----------|----------|------------|
| Enter key doesn't submit | solo-founder, ux-critic | Technical/UX | High | Missing onKeyDown handler |
| ... | ... | ... | ... | ... |

**Categories:** `bug` · `ux-pattern` · `copy` · `flow` · `visual`
**Severity:** `high` (blocks task) · `medium` (friction) · `low` (polish)

### Cross-Persona Patterns

[Same friction appearing across 2+ personas = stronger signal. Call these out explicitly.]
```

---

## Step 6 — Triage and Produce Change Request Candidates

Classify findings into tiers:

| Tier | What | Action |
|------|------|--------|
| **A — Bugs** | Broken behavior (error, blank page, data loss, key not working) | File as `type: bug` immediately |
| **B — UX polish** | Friction, confusion, bad empty states, inconsistency | Present to user for approval, then file as story with `source: sim` |
| **C — Flow redesign** | Wrong information architecture, missing progressive disclosure | Design first with `/ascii-flows`, then spec |

**Output format:**

```markdown
## Change Request Candidates

### Tier A — File immediately (bugs)
- [ ] **Enter key doesn't submit chat** — p425 chat input, missing onKeyDown handler (High)
- [ ] **Agreement not found — RLS** — invited party can't read agreement before accepting (High)

### Tier B — Your call (UX polish)
- [ ] **[Copy] "Coming soon" shown on live feature** — misleading label on working functionality (Medium)
- [ ] **[UX] Dead space below fold on agreement page** — no CTA or next step visible (Medium)

### Tier C — Design first (flow changes)
- [ ] **[Flow] Draft card has no save confirmation** — user doesn't know if draft was saved (Medium)

---

Tier A bugs: file now? (I'll run /create-bug for each)
Tier B/C: tell me which ones to file and I'll create specs with source: sim + changes: p{N}
```

---

## Step 6.5 — Save Findings

Write triage output to `.private/sim/p{N}-YYYYMMDD.md` (create `.private/sim/` if it doesn't exist).

**This file is the source of truth for this sim run. If conversation context is lost, the findings are here.**

```bash
mkdir -p .private/sim
```

**File template:**

```markdown
## Sim Run: p{N} — {YYYY-MM-DD}

### Personas Run
- solo-founder: [one sentence summary]
- invited-party: [one sentence summary]
- ux-critic: [one sentence summary]

### Change Request Candidates

#### Tier A — Bugs (file immediately)
- ...

#### Tier B — UX Polish (your call)
- ...

#### Tier C — Flow Redesign (design first)
- ...

### Filed specs
- [ ] pXXX — [title]
```

Write the full Tier A / B / C table from Step 6 plus one-line persona summaries. Then continue to Step 7.

---

## Step 7 — File Selected Specs

For **Tier A bugs:** Run `/create-bug` for each confirmed item.

For **Tier B/C change requests:** Run `/create-spec` with:
```yaml
type: story
source: sim
changes: p{N}
persona: [which persona found it]
```

---

## Triage Guidance

**What blocks shipping:** Only Tier A bugs that break core flows (can't complete the primary task). Tier B and C are improvements, not blockers.

**When to skip /sim:** Pure backend features, config changes, pure content updates. `/sim` is for UI features only.

**When to stop a sim early:** If the browser agent hits the same error 3 times in a row — note the blocking issue, don't retry. The block itself is a finding.

---

## Related Skills

- `/verify` — functional smoke test (no UX depth); use for pure backend or quick working-check
- `/finish` — static review (code, design, UX, skills, rules, docs — no browser)
- `/ascii-flows` — design Tier C flow redesigns before filing specs
- `/create-bug` — file Tier A bugs
- `/create-spec` — file Tier B/C change requests
- `docs/technical/synthetic-usability-testing.md` — full methodology reference
