---
description: 'Systematic UI audit - checks every button, all user states, accessibility'
when_to_use: "After shipping a UI feature. When checking every button, state, and accessibility issue."
name: design-audit
version: 1.0.0
archived_reason: "absorbed into /finish criteria/code.md — button, state, and accessibility checks now part of consolidated code review"
disable-model-invocation: true
---

# Design System Audit (Systematic)

This skill performs a **systematic** design audit, going beyond color violations to verify every interactive element matches its intended purpose.

**When to use:** After implementing UI features, before PR review, when user asks to "check design compliance"

## Step 0: Check Excalidraw Wireframes

Scan wireframe files for forbidden colors:

```bash
# Find all excalidraw files
find docs/archive/bmad/diagrams -name "*.excalidraw" -type f 2>/dev/null

# For each file, check for forbidden colors:
# Forbidden: amber (#f59e0b, #fbbf24), orange (#ff9800, #f97316), yellow (#eab308)
# Forbidden: iOS blue (#007AFF) - should be #3b82f6
# Forbidden: purple (#a855f7, #9333ea, #7c3aed)
```

**Correct colors per design-system.md:**
| Element | Stroke | Background |
|---------|--------|------------|
| Primary button | #3b82f6 | #3b82f6 |
| Secondary button | #e0e0e0 | #ffffff |
| Your status | #bfdbfe | #eff6ff |
| Other's status | #e0e0e0 | #f5f5f5 |
| Success state | #22c55e | #dcfce7 |

## Step 1: Read the Design Spec

First, read the current design system specification:

```bash
cat docs/design-system.md
```

Pay special attention to:
- "Auditing Existing UI (Systematic Check)" section
- Button purpose matrix
- State coverage matrix
- Anti-patterns section

## Step 2: Find All Buttons

Grep for every Button usage in the target files:

```bash
# Find all Button usages in prototypes
grep -n "<Button" src/app/prototypes/**/*.tsx 2>/dev/null

# Find all Button usages in app components
grep -n "<Button" src/app/components/**/*.tsx 2>/dev/null

# Find all button elements (lowercase - custom buttons)
grep -n "<button" src/app/prototypes/**/*.tsx 2>/dev/null
```

## Step 3: Classify Each Button

For EACH button found, determine its purpose and verify styling:

| Purpose | Required Styling | How to Identify |
|---------|------------------|-----------------|
| **Primary CTA** | `bg-blue-500 hover:bg-blue-600 text-white` | Submit, Create, RSVP, Sign Up, Save, Continue |
| **Secondary** | `variant="outline"` | Add to Calendar, Edit, View Details, Learn More |
| **Tertiary** | `variant="ghost"` | Cancel (dialog), Back, Skip |
| **Destructive** | Red styling OR `variant="destructive"` | Delete, Remove, Cancel Event, Cancel RSVP |

**Common violations to flag:**
- `<Button>` without className (uses dark default, should be blue for CTAs)
- `<Button variant="default">` for primary CTAs (should have blue override)
- Red on green backgrounds (accessibility issue)

## Step 4: Check State Coverage

Identify all user states the UI should handle:

1. **Visitor (logged out)** - Do CTAs say "Sign Up to..."?
2. **Logged in, no action** - Is primary action available?
3. **Logged in, action completed** - Does success state show green?
4. **Owner/Host view** - Are owner controls visible? No redundant UI?
5. **Past/Disabled state** - Do disabled states render correctly?

For each state, verify:
- Mock data supports testing this state
- Visual appearance is correct

## Step 5: Accessibility Checks

- [ ] No red text on green backgrounds
- [ ] No green text on red backgrounds
- [ ] Destructive buttons in success contexts use muted → red-on-hover pattern
- [ ] All buttons have visible focus states (shadcn/ui handles this)

## Step 5.5: Cross-Page Consistency Check

**Purpose:** Ensure the same semantic concept looks identical across all pages. When introducing new UI patterns, verify they match existing implementations.

### A. Neighboring Page Analysis (CRITICAL)

**Before implementing any UI element, check how sibling/related pages handle the same pattern.**

1. **Identify neighboring pages** in the same directory or feature area
2. **Search for the same UI pattern** across those pages
3. **Extract the exact implementation** (icon, size, styling, placement, behavior)
4. **Match it exactly** unless there's a documented reason to differ

```bash
# 1. Find sibling files in the same directory
ls -la $(dirname TARGET_FILE)

# 2. Search for the pattern you're implementing (e.g., back button)
grep -n "ArrowLeft\|ChevronLeft\|back\|Back" SIBLING_FILES

# 3. Read the implementation in context (get surrounding lines)
grep -B2 -A10 "ArrowLeft" SIBLING_FILE.tsx
```

### B. Pattern Categories to Check:

| Pattern | What to Search | Consistency Rule |
|---------|----------------|------------------|
| **Back Navigation** | `ArrowLeft`, `ChevronLeft`, `navigate(-1)` | Same icon, size, placement, behavior |
| **Page Headers** | `<h1`, title patterns | Same hierarchy, spacing from back button |
| **RSVP/Attendance Status** | "going", "attending", "registered" | Same color, badge style, text |
| **Empty States** | "No .* found", "empty", "nothing here" | Same layout (icon + text + optional CTA) |
| **Loading States** | "loading", "Skeleton", "Spinner" | Same component, same placement |
| **User Status Badges** | `<Badge`, status indicators | Same semantic meaning = same styling |
| **Card Layouts** | Event cards, person cards | Same info hierarchy, spacing |
| **Action Buttons** | RSVP, Join, Cancel | Same styling for same action type |
| **Filter Controls** | tabs, dropdowns, toggles | Same component, same styling |
| **Position Badges** | `PositionBadge`, agrees/disagrees | ALL blue - see Position UI rules below |
| **Position Buttons** | `PositionButtons`, Agree/Disagree/Unsure | Same component everywhere, responsive layout |

### B.1 Position UI Rules (LinkedIn-like Prototype)

**Philosophy:** Taking ANY position (agree, disagree, unsure) is equally valuable. The goal is engagement and understanding, not judgment.

**Position Badges (`PositionBadge` component):**
- ALL positions use **blue** (`bg-blue-100 text-blue-700`)
- Icons differentiate stance: ✓ (agree variants), ✗ (disagree variants), ? (unsure)
- Never use semantic colors (no green for agree, no red for disagree)

**Position Buttons (`PositionButtons` component):**
- Use the shared component everywhere - never duplicate
- Active/selected button: `bg-blue-500 text-white`
- Inactive buttons: `bg-white text-gray-600 border-gray-200`
- Layout: Stack vertically on mobile (`flex-col`), horizontal on desktop (`sm:flex-row`)
- The `compact` prop does NOT change layout - always responsive

**Common violations:**
- Using slate/grey for disagree badges (should be blue)
- Using different colors for different positions (should all be blue)
- Hardcoding horizontal layout for embedded position buttons (should use shared component)
- Inconsistent button structure causing visual differences (all should use div wrapper)

### C. How to Check:

```bash
# 1. Find all instances of a pattern in related files
grep -rn "ArrowLeft\|navigate" src/app/prototypes/linkedin-like/components/

# 2. For each match, note: file, line, implementation details

# 3. Compare - flag any differences in:
#    - Icon (e.g., ArrowLeft vs ChevronLeft)
#    - Size (e.g., size={18} vs size={20})
#    - Styling (e.g., different className)
#    - Container (e.g., wrapped in div vs not)
#    - Behavior (e.g., navigate(-1) vs navigate(routes.home))
#    - Placement (e.g., inside/outside content container)
```

### D. Cross-Page Consistency Report Format:

```markdown
### Cross-Page Consistency

| Pattern | Reference Implementation | Current Implementation | Issue |
|---------|-------------------------|------------------------|-------|
| Back button | StoryDetail: `<div className="px-4 pt-3">` | MyEvents: N/A (is home) | N/A - MyEvents is the landing page |
| Back icon | PointDetail: `<ArrowLeft size={16} />` | All detail pages: same | ✅ Matches |
| Back behavior | All detail pages: `navigate(routes.myEvents)` | Consistent across pages | ✅ Unified navigation |
```

### E. Component Reuse Check:

When auditing new code, verify:
1. **Does a shared component exist?** Check `src/app/components/shared/` or `src/app/prototypes/*/components/shared/` first
2. **If similar code exists in 2+ places**, flag for extraction to shared component
3. **New patterns should be discussed** before implementing differently than existing
4. **If you find 3+ implementations of the same pattern**, propose extracting to a shared component

## Step 6: Generate Report

```markdown
## Design Audit Report

### Button Inventory
| File:Line | Button Text | Purpose | Current Style | Status |
|-----------|-------------|---------|---------------|--------|
| EventDetail.tsx:283 | RSVP | Primary CTA | bg-blue-500 | ✅ |
| EventDetail.tsx:290 | Cancel RSVP | Destructive | text-muted-foreground hover:red | ✅ |
| EditEvent.tsx:341 | Save Changes | Primary CTA | (default) | ❌ Missing blue |

### State Coverage
| State | Testable? | Visual Check |
|-------|-----------|--------------|
| Visitor | ✅ Mock supports | ✅ Verified |
| RSVP'd user | ✅ Mock supports | ✅ Verified |
| Host | ✅ Mock supports | ✅ Verified |

### Accessibility
- [ ] Red on green: None found ✅
- [ ] Color contrast: OK ✅

### Issues Found
1. **EditEvent.tsx:341** - "Save Changes" uses default Button styling, should be blue CTA
2. **EventsList.tsx:128** - "Sign Up to Host" missing blue styling

### Recommended Fixes
[Code snippets for each fix]
```

## Step 7: Offer to Fix

After generating the report, ask:
> Found N issues. Want me to fix them?

If yes, apply fixes and re-run verification.

---

## Quick Mode

For a faster check, just run:

```bash
# Find buttons that might be missing blue styling
grep -n "<Button>" src/app/prototypes/**/*.tsx | grep -v "bg-blue" | grep -v 'variant="'

# Find potential red-on-green issues
grep -B5 "text-red" src/app/prototypes/**/*.tsx | grep -A5 "bg-green"
```

This catches the most common violations quickly.
