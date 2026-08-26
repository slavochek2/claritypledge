---
name: postmortem
description: Post-mortem analysis of a shipped feature — finds what broke in the delivery pipeline and proposes concrete improvements. Run after any feature that required manual fixes post-delivery.
when_to_use: "After shipping a major feature (5+ files, UI-heavy) where manual fixes were needed post-delivery. Triggered by /postmortem pN."
version: 1.0.0
---

# /postmortem

Analyze a shipped feature's delivery quality. Find what the pipeline missed, where it failed, and how to fix it structurally.

**Announce at start:** First substantive output is the evidence summary (no greeting).

---

## When to use this vs other skills

| Situation | Skill |
|---|---|
| Feature shipped, needed manual fixes after — analyze why | `/postmortem` ← here |
| Capture decisions from current conversation | `/kdd` |
| Weekly personal retrospective + context hygiene | `/weekly` |
| Monthly behavioral patterns + CLAUDE.md challenge | `/monthly` |
| Deep innovation on a specific problem (10 solutions, falsify, synthesize) | `/innovate` → `/falsify` |

---

## Workflow

### Step 0: Input validation

```bash
# Require P-number argument
# Find the spec file
SPEC=$(find features/ -name "p${P_NUM}*" -not -path "*/archive/*" | head -1)
```

**Hard stops:**
- No P-number provided → "Usage: /postmortem pN"
- Spec not found → "No spec found for P{N}"
- Spec status is not `done` or `all-done` → "P{N} is still {status} — postmortem runs on shipped features only"
- Not on main branch → "Postmortem must run from main (writes to docs/decisions.md)"

---

### Step 1: GATHER — Evidence collection

1. Read the spec file to understand what was built
2. Find the feature branch and its commits:
   ```bash
   # Find feature branch
   git log --all --oneline --grep="p${P_NUM}\|P${P_NUM}" --since="3 months ago" | head -30
   # Get all commits on the branch
   git log --oneline feature/p${P_NUM}* 2>/dev/null || git log --oneline --all --grep="p${P_NUM}" | head -40
   ```
3. Identify fix commits — commits AFTER the initial implementation that contain `fix(p${P_NUM})` or similar patterns:
   ```bash
   git log --oneline --all --grep="fix.*p${P_NUM}\|fix.*P${P_NUM}" | head -30
   ```
4. For each fix commit, read the commit message and changed files to categorize it

**Fix category taxonomy:**

| Category | Description | Example |
|---|---|---|
| DESIGN_SYSTEM | Theme/color/token mismatch | Button used wrong variant, color didn't match intent |
| SPEC_WRONG | Spec contained incorrect factual claims | Copy said "visible on profile" but feature isn't on profiles |
| SPEC_INCOMPLETE | Spec didn't cover something it should have | Button order, label text, menu placement unspecified |
| VISUAL_QA_MISSED | Would have been caught by screenshot review | Overflow, clipping, wrong layout |
| UX_JUDGMENT | Required human design judgment agent couldn't make | CTA hierarchy, element composition within cards |
| MISSING_FEATURE | Feature absent from spec entirely | Share button, point controls not specced |
| NAVIGATION | Routing/context preservation issues | Back button loses doc context |
| MOBILE | Mobile-specific layout/interaction | Touch targets, event bubbling, responsive |
| DATA_COMPLETENESS | Query missing joins or fields | Points not joined in data service |
| OTHER | Doesn't fit above categories | — |

5. Present the evidence table:

```
## Post-Mortem Evidence: P{N} — {Feature Name}

Fix commits found: {count}
Time span: {first fix date} → {last fix date}

| # | Commit | Category | One-line description |
|---|--------|----------|---------------------|
| 1 | abc1234 | SPEC_INCOMPLETE | Button order not specified |
| ... | ... | ... | ... |

Category breakdown:
- SPEC_INCOMPLETE: {N}
- DESIGN_SYSTEM: {N}
- ...
```

**Gate:** If fewer than 3 fix commits found → "Clean delivery — only {N} fixes needed. No post-mortem warranted." Stop.

**Gate:** Present problem grouping to user. Wait for confirmation before spawning analysis agents. Ask: "I identified {N} problems across {M} categories. Proceed with analysis?"

---

### Step 2: ANALYZE — Parallel pipeline gap analysis

For each category with 2+ issues, spawn a parallel analysis agent (`model: "sonnet"`, max 6).

**Agent prompt template:**

```
You are a pipeline gap analyst for the ClarityPledge project.

## Problem
{Category name}: {count} fix commits in P{N}

Fix commits in this category:
{list of commits with messages and changed files}

## Your task
Read these files to find where in the pipeline this should have been caught:
- Skills in .claude/commands/slava/build/ — especially /ui, /dev, /spec-review, /ux, /challenge-prd, /verify, /generate-tests
- Rules in .claude/rules/ — especially src.md, visual-qa.md, tests.md
- Process docs in docs/technical/

For this problem category, document:
1. Which pipeline step SHOULD have caught it (skill name + step number)
2. What that step CURRENTLY does (quote the relevant lines)
3. What it SHOULD do but doesn't
4. The specific file and line where the gap exists

Return a structured analysis. Do NOT write any files.
Cap output to 500 words.
```

Collect all analysis results.

---

### Step 3: RECOMMEND — Concrete fixes

Spawn a single synthesis agent (`model: "sonnet"`) with all analysis results.

**Agent prompt:**

```
You are a pipeline improvement architect for a solo founder + AI agents project.

## Analysis results
{paste all analysis agent outputs}

## Constraints
- Solutions must be maintainable by one person + AI agents
- Prefer editing existing skills over creating new ones
- Prefer structural enforcement (hard gates) over advisory rules
- The founder cares about quality and user orientation, not speed
- Every change is an edit to a .md skill file or .md rule file

## Your task
1. For each identified gap, propose 1-2 concrete fixes
2. Self-critique each fix inline: "Risk: {what could go wrong}"
3. Group fixes into 3-5 initiatives
4. Sequence by impact (highest first)
5. Estimate effort per initiative (hours)
6. Identify what to DEFER (not every gap needs fixing now)

## Output format

### Initiative 1: {Name} ({effort}h)
Problems addressed: {categories}
Changes:
- Edit {file}: {what changes}
- Edit {file}: {what changes}
Risk: {one line}

### Deferred
- {fix name} — {why defer}

### Meta-Insight
> {One sentence: the pattern across all problems}

Cap output to 800 words.
```

---

### Step 4: PRESENT — Show findings

Present the full post-mortem to the user:

```
## Post-Mortem: P{N} — {Feature Name}

### Evidence
{from Step 1 — issue table and category breakdown}

### Pipeline Gaps
{from Step 2 — one paragraph per problem category}

### Recommended Initiatives
| # | Initiative | Problems | Effort | Key files to edit |
|---|---|---|---|---|
| 1 | {name} | {categories} | {hours}h | {files} |

### Deferred
- {what and why}

### Meta-Insight
> {pattern across problems}
```

---

### Step 5: RECORD — With user approval

**Gate:** "Write these findings to docs/decisions.md? (y/n)"

If approved, append to `docs/decisions.md`:

```markdown
### P{N} Post-Mortem — {date}

**Context:** Post-mortem analysis of P{N} ({feature name}). {N} manual fix commits were needed after delivery.

**Decision:** Implement {count} pipeline improvements:
1. {Initiative 1 name} — {one line}
2. {Initiative 2 name} — {one line}

**Alternatives rejected:** {from deferred list, with reasons}

**Consequences:** {what improves}
```

Then ask: "Create a tracking spec for these initiatives via /create-spec? (y/n)"

---

## Rules

- Evidence first, recommendations after. Never propose fixes without showing the data.
- Never write to any file without explicit user approval.
- One postmortem per P-number. If a postmortem already exists in decisions.md for this P-number, say so and ask if the user wants to re-run.
- Cap at 6 problems analyzed. If more than 6 categories have 2+ issues, filter to the top 6 by count.
- If a problem is genuinely novel (no existing pattern in the pipeline), suggest the user chain `/postmortem` → `/innovate` → `/falsify` for deeper exploration. Don't try to solve novel problems in-skill.
- Analysis agents read skill files at runtime — never hardcode skill content or line numbers in this skill file.
- The skill output is chat-only until Step 5. No files written during Steps 1-4.

---

## Related Skills

- `/kdd` — captures decisions from current conversation (use for in-session learnings, not delivery analysis)
- `/weekly` — weekly retrospective with personal reflection (broader scope, not feature-specific)
- `/monthly` — monthly meta-review that challenges CLAUDE.md principles (systemic, not per-feature)
- `/innovate` — brainstorm 10 solutions for a problem (chain after postmortem for novel issues)
- `/falsify` — adversarial critique of proposals (chain after innovate)
