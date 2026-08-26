---
name: spec-compact
description: >
  Strip agent conversation residue, resolved decision analyses, and cross-layer restatements
  from a spec without changing semantics. Run after /spec-review, before /decompose or /dev.
when_to_use: After /spec-review resolves BLOCKs, before /decompose or /dev. Skip for specs under 100 lines.
version: 1.0.0
---

## Dispatch

**Phase A — Measure + manifest (spawn → collect → present):**
Spawn Agent tool: `model: "sonnet"`, `subagent_type: "general-purpose"`.
Prompt: Phases 1–2 from the skill below (measure + identify removable content) + spec path from $ARGUMENTS. Working dir: `<cp-root>`.
Collect the removal manifest. Present it to the user — quote the first line of each item and state why it's removable.
Wait for user approval. User may exclude specific items ("keep item 3").

**Phase B — Apply (only after user approves):**
Spawn a second Agent tool: `model: "sonnet"`, `subagent_type: "general-purpose"`.
Prompt: Phase 4 (apply and report) from the skill below + the approved removal manifest inline. Apply all approved removals, commit, report line reduction.
Report subagent output verbatim.

# /spec-compact

Remove dead weight from a spec file — agent Q&A threads, resolved decision prose, cross-layer
restatements, and authoring-time notes — without changing any requirement or decision.

**Announce at start:** "I'm using the /spec-compact skill to prune the spec before implementation."

---

## Usage

```bash
/spec-compact features/pN_feature.md
```

**Run after:** `/spec-review` (spec is audited, BLOCKs resolved)
**Run before:** `/decompose` (if complex) or `/dev`

---

## What Gets Removed

| Category | Example | Action |
|----------|---------|--------|
| **Agent Q&A threads** | "Q from /architect: does the UX assume X? A: yes, confirmed" | Delete — the answer is already in the spec as a requirement |
| **Resolved decision analyses** | "Option A vs B vs C. We chose A because..." (3 paragraphs) | Collapse to: "**Decision:** A. **Why:** [1 sentence]" |
| **Authoring-time notes** | "Note to architect:", "TODO: confirm with user", "See conversation above" | Delete — these are process artifacts, not requirements |
| **Cross-layer restatements** | Same requirement in Business, UX, and Architecture sections verbatim | Keep the most specific version, delete copies. Add a one-line cross-reference if helpful: "See AC-3 in Business Requirements." |
| **Hedging language** | "It might be good to consider...", "Possibly we should..." | If it's a requirement, make it direct. If it's not, delete. |
| **Preamble/summaries agents add** | "Based on the business requirements above, here is the technical architecture..." | Delete — section headers already convey the layer |
| **Deprecated/superseded content** | Sections marked "superseded by" or old versions left inline | Delete — the superseding content is authoritative |

## What Gets Preserved (never touch)

- Acceptance criteria
- Architecture decisions (the decision itself + rationale, not the analysis process)
- UX flows and wireframes
- Test coverage strategy
- Build sequence / implementation approach
- Component strategy classifications
- Security review findings
- Any content that `/spec-review` specifically referenced (it's load-bearing)

---

## How It Works

### Phase 1: Measure

1. Read the full spec file.
2. Count total lines. Report: "Spec is {N} lines before compaction."
3. Identify each section header (`##`, `###`) and its line count.

### Phase 2: Identify removable content

For each section, scan for the six categories above. Build a removal manifest:

```
Removal manifest:
- Lines 45-52: Agent Q&A thread (/ux asked /architect about tooltip placement — resolved in UX flows section)
- Lines 110-135: Decision analysis for caching strategy (collapsed to 2-line decision + rationale)
- Lines 200-205: Preamble paragraph restating business requirements in architecture section
- ...
```

### Phase 3: Show diff, get approval

Present the removal manifest to the user. For each item:
- Quote the first line being removed (so user can recognize it)
- State why it's removable (which category)
- For collapses (not deletions): show the replacement text

**Wait for user approval before applying.** User may say "keep item 3" — respect that.

### Phase 4: Apply and report

Apply all approved removals. Report:

```
Spec compacted: {before} → {after} lines ({percent}% reduction)
Removed: {N} Q&A threads, {N} decision analyses collapsed, {N} restatements, {N} notes
```

Commit the change: `chore(pN): compact spec — remove {percent}% agent residue`

---

## Edge Cases

- **Spec under 100 lines:** Skip — not worth compacting. Report: "Spec is {N} lines — compact not needed."
- **Nothing to remove:** Report: "Spec is clean — no agent residue found." Don't force removals.
- **`/spec-review` not run yet:** Warn: "/spec-review should run first — compacting before audit risks removing content that /spec-review would have flagged as load-bearing." Proceed if user confirms.

---

## What This Skill Does NOT Do

- Does not change requirements (if a line is an AC, it stays)
- Does not restructure sections (section order is set by prior skills)
- Does not evaluate product decisions (that's `/challenge-prd`)
- Does not fix spec quality issues (that's `/spec-review`)
- Does not auto-apply without approval (user sees the manifest first)

---

## Related Skills

- `/spec-review` — audit spec quality (run before /spec-compact)
- `/decompose` — task decomposition (run after /spec-compact, complex features only)
- `/dev` — implementation (run after /spec-compact)
