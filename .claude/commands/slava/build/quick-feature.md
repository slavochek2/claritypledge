---
name: quick-feature
description: Quick feature/bug skeleton with frontmatter - minimal template for idea capture (30 seconds)
when_to_use: Quick idea capture, simple placeholders - when you'll fill in sections manually later
version: 2.0.0
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

**Question 3: Milestone?**
- Header: "Milestone"
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

### 3. Determine P-Number

Run this command to find the next available number (scans ALL subdirectories):

```bash
find features -type f -name "p[0-9]*.md" 2>/dev/null | grep -oE 'p[0-9]+' | sort -t'p' -k2 -n | tail -1
```

Take the highest number and add 1. Example: if highest is `p137`, use `p138`.

**IMPORTANT:** This scans ALL folders including `done/`, `archive/`, `bugs_and_debt/` to prevent P-number reuse.

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

## Problem

{Problem from user}

## Solution

_To be filled in during implementation planning._

## Technical Notes

_Implementation details, architecture decisions._

## Acceptance Criteria

- [ ] _Criteria 1_
- [ ] _Criteria 2_

## Testing

_How to verify this works._
```

**Frontmatter Reference:** See [docs/technical/feature-specs.md](../../../../docs/technical/feature-specs.md) for complete field definitions, valid values, and examples.

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
- Default to next sequential number based on date (e.g., `p999_temp_{timestamp}`)
- Warn user to manually verify number

**If user provides incomplete info:**
- Use sensible defaults:
  - Status: `week`
  - Severity (bugs): `medium`

**If filename already exists:**
- Append `-2`, `-3`, etc.
- Warn user about duplicate

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

---

## Related Skills

- `/slava:build:create-prd` - Generate comprehensive PRD (use this instead for complex features)
- `/slava:build:ux` - Design UX layer (if UI feature)
- `/slava:build:architect` - Design technical architecture
- `/slava:build:dev` - Start implementing the feature
- `/slava:done` - Mark feature complete and move to `features/done/`
