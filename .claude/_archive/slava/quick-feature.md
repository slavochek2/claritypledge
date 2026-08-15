---
name: quick-feature
description: Quick feature/bug skeleton with frontmatter - minimal template for idea capture (30 seconds)
when_to_use: Quick idea capture, simple placeholders - when you'll fill in sections manually later
version: 2.0.0
archived_reason: "Absorbed into /create-spec — lightweight specs are just specs with shorter sections, not a separate template. Use /create-spec instead."
---

# Quick Feature/Bug Skeleton

**Purpose:** Create a minimal feature/bug skeleton with proper frontmatter and P-number. Sections are empty placeholders you'll fill in manually.

**When to use:**
- ✅ Quick idea capture (just need a placeholder file)
- ✅ Meeting notes (capture idea, fill in details later)
- ✅ Very simple features (you know exactly what to write)

**DO NOT use for:**
- ❌ Features needing comprehensive spec → Use `/create-prd` instead
- ❌ Features needing business requirements, technical analysis, or test coverage → Use `/create-prd`
- ❌ Quick notes without P-number → Use `features/drafts/`
- ❌ Research findings → Use `features/research/`

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

## Quick Feature vs Comprehensive PRD

| Aspect | `/quick-feature` (this skill) | `/create-prd` |
|--------|------------------------------|---------------|
| **Output** | Skeleton with placeholders | Complete PRD with all sections |
| **Time** | 30 seconds | 3-5 minutes |
| **Business requirements** | ❌ Empty ("To be filled in") | ✅ Generated (WHY, outcomes) |
| **Technical analysis** | ❌ Empty | ✅ Generated (current code) |
| **Implementation plan** | ❌ Empty | ✅ Concrete (file paths) |
| **Test requirements** | ❌ Empty | ✅ E2E test templates |
| **When to use** | Quick placeholder | Ready to implement |

**Rule of thumb:** If you know you'll need a comprehensive spec, use `/create-prd` from the start.

---

## Workflow

### 1. Gather Information

Ask the user these questions (use `AskUserQuestion` tool):

**Question 1: What type?**
- Header: "Type"
- Options:
  - Feature - New functionality or enhancement
  - Bug - Something broken that needs fixing
  - Task - Operational work (refactor, cleanup, etc.)

**Question 2: What status?**
- Header: "Status"
- Options:
  - Backlog - Not scheduled
  - Week - Planned for this week (Recommended for new items)
  - Today - Working on today

**Question 3: Workstream?**
- Header: "Workstream"
- Options:
  - C1, C2, C3... - Coaching track
  - R1, R2... - Recognition track
  - E1, E2... - Enhancements track
  - X1, X2... - Exploratory track
  - foundation - Infrastructure/meta work

**Question 4 (if bug): Severity?**
- Header: "Severity"
- Options:
  - Critical - System down, data loss
  - High - Major feature broken
  - Medium - Feature partially works
  - Low - Minor issue, workaround exists

### 2. Get Details from User

Ask (text input, NOT AskUserQuestion):
- **Title:** Brief description (will become filename)
- **Problem:** What needs to be solved? (1-2 sentences)

**Before writing the file:** Scan the conversation for any already-decided design context — ASCII mockups, wireframes, file paths, implementation approach, architecture decisions, output formats, personas, pipeline position. If found, include it in the spec rather than leaving placeholders. The spec should capture what's already known. **Agents may add any additional sections beyond the template when conversation context warrants it** — the template is a floor, not a ceiling. Name sections descriptively (e.g., `## Architecture`, `## Personas`, `## Output Format`).

### 3. Determine P-Number

Run the canonical script:

```bash
./scripts/next-p-number.sh
```

It prints the correct next integer. Never compute it manually — the script handles exclusions correctly (`uat/` and `archive/` are excluded; they contain companion/retired files that must not drive the sequence).

**If the script is unavailable:** halt and warn the user rather than guessing.

### 4. Calculate Rank

**Automatically assign rank (new features go to bottom of backlog):**

```bash
MAX_RANK=$(grep "^rank:" features/*.md features/bugs_and_debt/*.md 2>/dev/null | \
  grep -oE '[0-9]+(\.[0-9]+)?' | sort -n | tail -1)
NEW_RANK=$(echo "${MAX_RANK:-0} + 1.0" | bc)
echo "Assigning rank: $NEW_RANK"
```

**Edge cases:**
- No existing ranks → Use `1.0`
- `bc` not available → Use `awk`: `awk "BEGIN {print ${MAX_RANK:-0} + 1.0}"`

### 5. Create File

**Filename format:** `features/p{N}_{slug}.md`

Where:
- `{N}` = P-number from step 3
- `{slug}` = lowercase, underscores, from title (e.g., "Fix Login Bug" → "fix_login_bug")

**For features:**

```markdown
---
status: {from user}
type: feature
rank: {calculated rank}
workstream: {from user}
created_date: {today's date YYYY-MM-DD}
tags: []
# For complete frontmatter specification, see docs/technical/feature-specs.md
---

# P{N}: {Title}

## Problem Statement

{Problem from user}

## Solution

{If ASCII mockups, wireframes, or design decisions were already discussed in the conversation — include them here verbatim. Otherwise write: _To be filled in during implementation planning._}

## UX Design

{If ASCII mockups were already produced in the conversation — paste them here with brief labels. Otherwise omit this section entirely.}

## Technical Architecture

{If specific files, patterns, or implementation approach were already discussed — summarize them here. Otherwise write: _Implementation details, architecture decisions._}

## Acceptance Criteria

- [ ] _Criteria 1_
- [ ] _Criteria 2_

## Test Coverage Strategy

_How to verify this works._
```

**Frontmatter Reference:** See [docs/technical/feature-specs.md](../../../docs/technical/feature-specs.md) for complete field definitions, valid values, and examples.

**For bugs:**

```markdown
---
status: {from user}
type: bug
rank: {calculated rank}
workstream: {from user}
severity: {from user}
date_reported: {today's date YYYY-MM-DD}
created_date: {today's date YYYY-MM-DD}
tags: []
# For bug-specific fields (severity, root_cause), see docs/technical/feature-specs.md
---

# BUG: {Title}

## Problem

{Problem from user}

## Symptoms

_What the user experiences._

## Root Cause

_To be filled in after investigation._

## Resolution

_How it was fixed._

## Verification

_How to confirm it's fixed._
```

**For tasks:**

```markdown
---
status: {from user}
type: task
rank: {calculated rank}
workstream: {from user}
created_date: {today's date YYYY-MM-DD}
tags: []
---

# TASK: {Title}

## Goal

{Problem from user}

## Steps

1. _Step 1_
2. _Step 2_

## Done When

- [ ] _Completion criteria_
```

### 6. Confirm with User

After creating the file, tell the user:

```
✅ Created: features/p{N}_{slug}.md

**Next steps:**
- Review and fill in remaining sections
- Run `/create-prd` to generate comprehensive business requirements (recommended)
- OR continue manually for simple features
- Change status to `in-progress` when starting work
```

---

## Error Handling

**If P-number detection fails:**
- Halt and warn the user — do NOT guess or use a fallback number
- Ask user to run `./scripts/next-p-number.sh` manually and provide the result

**If user provides incomplete info:**
- Use sensible defaults:
  - Status: `week`
  - Severity (bugs): `medium`

**If P-number already exists in any file in `features/`:**
- Do NOT append `-2` or any suffix — a suffixed filename leaves the `p:` frontmatter field and `# P{N}:` heading unchanged, which still causes a duplicate P-number collision at pre-commit.
- Re-run `./scripts/next-p-number.sh` immediately to get a fresh number.
- Start the file creation over with the new number in all three places: filename (`p{N}_slug.md`), `p:` frontmatter field, and `# P{N}:` heading.

---

## Examples

**Example 1: Feature**
```
User: "Add dark mode toggle"
Type: Feature
Status: Week
Milestone: E2

Creates: features/p138_add_dark_mode_toggle.md
(Rank auto-calculated: 45.0)
```

**Example 2: Bug**
```
User: "Login button doesn't work on mobile"
Type: Bug
Status: Today
Severity: High
Milestone: foundation

Creates: features/p139_login_button_mobile_bug.md
(Rank auto-calculated: 46.0)
```

**Example 3: Task**
```
User: "Refactor authentication code"
Type: Task
Status: Backlog
Milestone: foundation

Creates: features/p140_refactor_authentication.md
(Rank auto-calculated: 47.0)
```

---

## Notes

- **Tags:** Leave empty initially, user can add later
- **File location:** Always `features/` (NOT `features/done/` or `features/drafts/`)
- **Frontmatter format:** Must use YAML with `---` delimiters
- **Status values:** Use lowercase: `week` not `Week`
- **Dates:** Always `YYYY-MM-DD` format
- **Kanban visibility:** After creating the file, tell user to hit the Refresh button in the kanban UI to see the new card (`http://localhost:9050` → Refresh)

---

## Related Skills

- `/slava:build:create-prd` - Generate comprehensive PRD (use this instead for complex features)
- `/slava:build:ux` - Design UX layer (if UI feature)
- `/slava:build:architect` - Design technical architecture
- `/slava:build:dev` - Start implementing the feature
- `/slava:done` - Mark feature complete and move to `features/done/`
