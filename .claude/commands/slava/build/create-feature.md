# Create Feature/Bug File

**Purpose:** Create a properly formatted feature or bug specification file with correct frontmatter, P-number, and structure.

**When to use:**
- Starting work on a new feature
- Documenting a bug
- Creating a task specification

**DO NOT use for:**
- Quick notes (use `features/drafts/`)
- Research findings (use `features/research/`)

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

**Question 3: Priority?**
- Header: "Priority"
- Options:
  - P0 - Critical, must do
  - P1 - High priority
  - P2 - Medium priority
  - P3 - Low priority / nice-to-have

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

Run this command to find the next available number:

```bash
ls features/*.md features/done/*.md 2>/dev/null | grep -oE 'p[0-9]+' | sort -t'p' -k2 -n | tail -1
```

Take the highest number and add 1. Example: if highest is `p137`, use `p138`.

### 4. Create File

**Filename format:** `features/p{N}_{slug}.md`

Where:
- `{N}` = P-number from step 3
- `{slug}` = lowercase, underscores, from title (e.g., "Fix Login Bug" → "fix_login_bug")

**For features:**

```markdown
---
status: {from user}
type: feature
priority: {from user}
tags: []
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

**For bugs:**

```markdown
---
status: {from user}
type: bug
priority: {from user}
severity: {from user}
date_reported: {today's date YYYY-MM-DD}
tags: []
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
priority: {from user}
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

### 5. Confirm with User

After creating the file, tell the user:

```
✅ Created: features/p{N}_{slug}.md

**Next steps:**
- Review and fill in remaining sections
- Run `/slava:build:prep-spec` when ready for review
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
  - Priority: `p2`
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
Priority: P1

Creates: features/p138_add_dark_mode_toggle.md
```

**Example 2: Bug**
```
User: "Login button doesn't work on mobile"
Type: Bug
Status: Today
Priority: P0
Severity: High

Creates: features/p139_login_button_mobile_bug.md
```

**Example 3: Task**
```
User: "Refactor authentication code"
Type: Task
Status: Backlog
Priority: P2

Creates: features/p140_refactor_authentication.md
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

- `/slava:build:prep-spec` - Review spec before implementation
- `/slava:done` - Mark feature complete and move to `features/done/`
- `/slava:build:dev` - Start implementing the feature
