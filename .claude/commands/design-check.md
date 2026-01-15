---
description: 'Run a full design system compliance check on UI files'
---

# Design System Compliance Check

You are running a design system audit. Check all UI-related files against the design specification in [docs/design-system.md](../../docs/design-system.md).

## What to Check

### 1. Excalidraw Wireframes (docs/bmad/diagrams/*.excalidraw)

Run these checks on each file:

```bash
# Find all excalidraw files
find docs/bmad/diagrams -name "*.excalidraw" -type f 2>/dev/null

# For each file, check for forbidden colors:
# Forbidden: amber (#f59e0b, #fbbf24), orange (#ff9800, #f97316), yellow (#eab308)
# Forbidden: iOS blue (#007AFF) - should be #3b82f6
# Forbidden: purple (#a855f7, #9333ea, #7c3aed)
```

**Correct colors per docs/design-system.md:**
| Element | Stroke | Background |
|---------|--------|------------|
| Primary button | #3b82f6 | #3b82f6 |
| Secondary button | #e0e0e0 | #ffffff |
| Your status | #bfdbfe | #eff6ff |
| Other's status | #e0e0e0 | #f5f5f5 |
| Success state | #22c55e | #dcfce7 |

### 2. Prototype Components (src/app/prototypes/**/*)

Check `.tsx` files for:
- `#007AFF` or `#007aff` → Should be `blue-500` or `#3b82f6`
- `bg-amber-*`, `bg-orange-*`, `bg-yellow-*` → Should be `bg-blue-*`
- `text-[Npx]` pixel sizes → Should use semantic `text-sm`, `text-lg`, etc.
- Custom button styling → Should use shadcn/ui `<Button variant="...">`

### 3. UI Components (src/components/ui/*, src/app/components/**/*)

Check for consistency with landing page patterns.

## Output Format

Generate a report like:

```
## Design System Audit Report

### ✅ Compliant Files
- file1.excalidraw
- ComponentA.tsx

### ⚠️ Files with Warnings
- file2.excalidraw
  - Line XX: Found #007AFF, should be #3b82f6
  - Line YY: Found amber color

### 📋 Summary
- X files checked
- Y compliant
- Z with warnings

### Recommendations
[List specific fixes needed]
```

## Instructions

1. Search for all relevant files (excalidraw, prototype tsx, component tsx)
2. Run the color/pattern checks
3. Generate the report
4. If issues found, offer to fix them

Start by reading docs/design-system.md to confirm the current spec, then scan the files.
