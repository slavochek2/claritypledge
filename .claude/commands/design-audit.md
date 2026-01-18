---
description: 'Systematic UI audit - checks every button, all user states, accessibility'
---

# Design System Audit (Systematic)

This skill performs a **systematic** design audit, going beyond color violations to verify every interactive element matches its intended purpose.

**When to use:** After implementing UI features, before PR review, when user asks to "check design compliance"

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
