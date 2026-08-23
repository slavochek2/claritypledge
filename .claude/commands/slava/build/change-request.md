---
name: change-request
description: File a redesign spec for a shipped feature whose design was wrong. Analyzes the predecessor spec for conflicting sections, captures root cause and current state, and creates a new P-number spec with full predecessor linkage.
when_to_use: "Use when a shipped feature needs a design correction — code works as specified, but the design itself was wrong (wrong visual ordering, actor confusion, duplication, hierarchy issues). NOT for bugs (broken code → /fix) and NOT for new capability (new user value → /create-spec)."
version: 2.1.0
---

# /change-request

File a redesign spec for a shipped feature. Creates a new P-number spec with full predecessor analysis.

**Announce at start:** "Running /change-request to file a redesign spec."

---

## Worktree guard

Before creating any file, check:
```bash
git worktree list | head -1 | awk '{print $1}'
```
Compare to `pwd`. If they differ, you are in a worktree — **stop immediately**. Tell the user:
> "Specs must be created in w0 (main). Run `cd ~/Projects/public/claritypledge` first, then re-run this skill."
Do not create any file until you are in the main repo.

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| Code is broken (wrong behavior, crash, data error) | `/fix` |
| New capability, new user value | `/create-spec` |
| **Shipped feature, design was wrong** | **`/change-request`** ← here |

**The test:** "Is the code broken, or is the design wrong?" Broken → `/fix`. Wrong design → `/change-request`.

---

## Pipeline stamp (P659)

Before any other work in this skill:
1. Read spec frontmatter
2. Set `delivery_stage: change-request`
3. Append `change-request` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, change-request]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [change-request]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `change-request` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

**Note:** Since change-request creates the file, set `delivery_stage: change-request` and `pipeline_ran: [change-request]` in the initial frontmatter (see template below).

---

## Workflow

### Step 1: Get predecessor P-number

If not provided as an argument, ask: "Which P-number does this redesign correct?"

Find the predecessor spec:
```bash
find features/done features/archive -name "p{N}_*.md" 2>/dev/null | head -3
# fallback:
ls features/p{N}_*.md 2>/dev/null
```

**Do not skip reading it.** A redesign spec that doesn't reference the original is not traceable.

---

### Step 2: Predecessor analysis (subagent)

Spawn a subagent (`model: "sonnet"`) to deeply analyze the predecessor spec:

```
You are a product analyst. Read the spec at {path} in full.

Extract and return:

1. PROBLEM STATEMENT — what problem was it solving? Quote the exact text.
2. JOBS TO BE DONE — what user jobs did it serve? List them.
3. REQUIREMENTS / DESIGN DECISIONS — what UX choices, layout decisions, component behavior did it specify?
4. ACCEPTANCE CRITERIA — list all AC verbatim.
5. SURFACES TOUCHED — which files/components were in scope?
6. CHAIN — does it have a `changes:` field? If so, what's the chain? Does it have `type: change-request`? If yes, also extract `chain_root:` if present, and report the predecessor's own `changes:` target — this is needed to compute chain depth and root.

Then, given this redesign context: {brief description of what's wrong from the conversation}

Identify for each section above:
- Which parts are STILL VALID (redesign preserves them)
- Which parts are SUPERSEDED (redesign contradicts or replaces them)
- Which parts are EXTENDED (redesign adds to them without contradicting)

Return as structured text, not prose. Be specific — quote the predecessor text when calling something superseded.

**Scope constraint:** Return only analysis of the predecessor spec's content and what the redesign changes. Do NOT recommend process changes, skill changes, or historical-origin explanations — those are out of scope. The question is "what did the predecessor spec say, and what does the redesign correct?" not "why was it built that way."
```

This analysis feeds directly into the "Current State", "What's Wrong", and "Predecessor Sections Superseded" sections of the new spec. Do not write those sections from memory.

---

### Step 3: Get redesign context from the conversation

Before asking the user, **scan the current conversation** for already-discussed context: ASCII mockups, "what was wrong" analysis, agreed UX layout, surfaces in scope, constraints, root cause analysis. If found, use it — don't ask for what's already been decided.

For anything still missing, ask (plain text, not AskUserQuestion):

1. **What was wrong with the original design?** (Specific — not "it felt off" but "the CTA appeared after Alice's stories, making '✓ Agrees' read as Alice's position not the viewer's")
2. **What should the redesign achieve?** (The corrected state — concrete)
3. **Which surfaces are in scope?** (Explicit list — what's in, what's out)
4. **Constraints from prior implementation to preserve?** (What must not break)

---

### Step 4: Determine P-number and rank

```bash
./scripts/next-p-number.sh
```

```bash
MAX_RANK=$(grep "^rank:" features/*.md features/bugs_and_debt/*.md 2>/dev/null | \
  grep -oE '[0-9]+(\.[0-9]+)?' | sort -n | tail -1)
NEW_RANK=$(echo "${MAX_RANK:-0} + 1.0" | bc)
```

---

### Step 5: Create the spec file

**File:** `features/p{N}_{redesign-slug}.md`

Slug from the redesign description, not the predecessor title.

**Slug rules (hard):**
- Underscores only — never hyphens. Wrong: `point-card-footer`. Correct: `point_card_footer`.
- Verify before creating: `ls features/p*.md | head -5` confirms existing convention.

```markdown
---
status: week
type: change-request
drafted_by: {model writing this draft: opus|sonnet|gemini|human}  # write-once, never updated
rank: {calculated}
changes: p{predecessor_N}
chain_root: p{root_N}    # ONLY if predecessor is itself a change-request. Omit otherwise.
tags:
  - redesign
  - p{predecessor_N}
created_date: {YYYY-MM-DD}
delivery_stage: change-request
pipeline_ran: [change-request]
---

# P{N}: {Redesign Title}

> **Redesign of:** [P{predecessor_N}: {predecessor title}]({path to predecessor spec})
> **What was wrong:** {2–4 sentences. Specific. From Step 2 subagent analysis.
>   Name the exact mechanism — duplication condition, actor confusion trigger, data gap.}

## Operating Mode

> This spec is an **incremental correction** to P{predecessor_N}, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P{predecessor_N} are not up for re-examination.

## Problem Statement

{Why this correction is needed. What user harm or confusion the current design causes.
Reference the predecessor's original problem statement if it's still partially valid.
If the predecessor's problem statement is fully superseded, say so.}

## Jobs To Be Done

{What user jobs this redesign serves. Distinguish:}
- **Preserved from P{N}:** {jobs still valid}
- **Corrected:** {jobs the predecessor got wrong or confused}
- **New:** {jobs the redesign adds, if any}

## Current State

{What P{predecessor_N} actually built — describe the UI and behavior as it exists now.
Be specific enough that a developer could reproduce the current behavior.}

**Before (current):**
```
{ASCII mockup of current state if available}
```

## Root Cause

{Why the original design failed. Specific mechanism — e.g.:
"On own profile, `filteredStories` is pre-filtered to the profile owner's stories upstream.
`viewerStoryCount = filteredStories.filter(s => s.authorId === currentUserId).length`
equals `filteredStories.length` when viewer === owner — same number shown twice."

Code references: {file:line if known}
}

## Redesign

{The corrected design — visual ordering, copy, component placement, state behavior.
Include ASCII mockups. Show all relevant states/contexts.}

**After (redesign):**
```
{ASCII mockup for each context: own profile, other profile no story, other profile story exists, etc.}
```

## Predecessor Sections Superseded

List which sections of P{predecessor_N} are no longer authoritative:

| Section | P{N} said | Status | Replaced by |
|---------|-----------|--------|-------------|
| {e.g. AC #3} | "{exact quote}" | Superseded | AC #X in this spec |
| {e.g. Problem Statement} | "{exact quote}" | Partially superseded | See Problem Statement above |

If nothing is superseded (extension only), state: "No predecessor sections superseded — this spec extends P{N}."

## Requirements

{What the redesign must do. Functional requirements derived from the corrected JTBD.
Cross-reference predecessor requirements that are still valid vs replaced.}

## What Stays the Same

{Explicitly list what is NOT changing — data model, other surfaces, API behavior, other features.
This prevents over-scope during implementation.}

## Surfaces in Scope

**In scope:**
{Explicit list of files/components being changed}

**Out of scope:**
{Explicit list of what is NOT changing even though it's nearby}

## Acceptance Criteria

- [ ] {Observable user-visible outcome 1}
- [ ] {Observable user-visible outcome 2}
- [ ] Surfaces NOT in scope are visually unchanged
- [ ] All existing tests for P{predecessor_N} still pass
- [ ] {Regression check specific to the design failure being corrected}

## Next Steps

{Pick the right entry point:}
- Has layout / visual hierarchy changes → run `/ux features/p{N}_{slug}.md`
- Has structural component changes → run `/architect features/p{N}_{slug}.md`
- Scope is clear, changes are targeted → run `/dev` directly
```

---

### Step 6: Add forward link to predecessor + compute chain fields

**6a. Set `superseded_by` on predecessor:**

Add `superseded_by: p{N}` to the predecessor spec's frontmatter. This is non-destructive — the predecessor spec content is preserved as historical record. The forward link lets anyone reading P{predecessor_N} navigate to the correction.

**6b. Compute `chain_root` (only when predecessor is itself a `type: change-request`):**

If the predecessor has `type: change-request`:
- If predecessor has `chain_root:`, use that same value (it already points to the original non-CR spec)
- If predecessor has no `chain_root:`, use the predecessor's `changes:` value (the predecessor's target IS the root)
- Set `chain_root: p{root_N}` in the new spec's frontmatter

If the predecessor is NOT a change-request, omit `chain_root:` — `changes:` already points to the original.

**6c. Chain depth check:**

Count the chain depth (number of CR hops from this new spec back to the non-CR root). If depth reaches 4:

> **⚠️ Chain depth warning:** This CR chain is 4 levels deep (root → CR1 → CR2 → CR3 → this). Per CR Chaining policy, chains deeper than 4 should be consolidated into a fresh spec. Consider running `/create-spec` instead, referencing the chain as historical context.

Show this warning and ask the user whether to proceed with the CR or consolidate into a fresh spec.

---

### Step 7: Self-check before creating

- [ ] Predecessor spec was read (not assumed) — via subagent
- [ ] Subagent analysis completed — superseded sections identified with quotes
- [ ] `changes: p{N}` set in frontmatter
- [ ] `superseded_by: p{N}` added to predecessor frontmatter
- [ ] If predecessor is `type: change-request`, `chain_root:` is set in new spec (pointing to a non-CR spec)
- [ ] If predecessor is NOT `type: change-request`, `chain_root:` is omitted
- [ ] Chain depth ≤ 4. If depth = 4, consolidation warning shown to user
- [ ] "Current State" section present with before ASCII if available
- [ ] "Root Cause" is specific (mechanism + code reference, not just "design was wrong")
- [ ] "Jobs To Be Done" distinguishes preserved / corrected / new
- [ ] "Predecessor Sections Superseded" table populated
- [ ] Surfaces in scope explicitly listed
- [ ] "What stays the same" section present
- [ ] Regression check in acceptance criteria
- [ ] **If `type: change-request` is new to this codebase:** confirm it is registered in `tools/kanban/lib/scanner-rules.ts` VALID_TYPE array (server strips unknown types silently), `features.md` type list, `/pick-flow` skill type table, and `CLAUDE.md` type classification table

---

### Step 8: Confirm and hand off

```
Created: features/p{N}_{slug}.md
Updated: {predecessor path} (added superseded_by: p{N})

Redesign of: P{predecessor_N}
Root cause: {1-sentence mechanism}
Predecessor sections superseded: {count or "none"}
Surfaces in scope: {list}

Next: {/ux | /architect | /dev} — {one sentence why}

Hit Refresh in kanban to see the new card (http://localhost:9050).
```

---

## Related Skills

- `/slava:build:fix` — for broken code (not design corrections)
- `/slava:build:create-spec` — for new capabilities
- `/slava:build:ux` — design the corrected layout after filing
- `/slava:build:architect` — design technical architecture after filing
- `/slava:build:dev` — implement after spec is ready
