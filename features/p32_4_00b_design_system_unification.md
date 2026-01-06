# P32.4_00b: Design System Unification (Hybrid Approach)

**Status:** Ready for Implementation
**Depends On:** None
**Blocks:** All P32.4 stories
**Estimated Time:** 1 hour

---

## Purpose

Unify prototype design system to match landing page (Hybrid approach - critical fixes only).

**Addresses:** Design system inconsistencies identified in [p32_4_design_system_audit.md](features/p32_4_design_system_audit.md)

**Critical Issue:** Prototype uses iOS blue (#007AFF) and iOS gray background (#F2F2F7), but landing page uses Tailwind blue (#3B82F6) and white/gray-50 background.

---

## What Changes

### Before (Prototype):
```tsx
// iOS blue
className="bg-[#007AFF] hover:bg-[#0066DD]"

// iOS gray background
className="bg-[#F2F2F7]"

// iOS green
className="text-[#34C759]"
```

### After (Unified):
```tsx
// Tailwind blue
className="bg-blue-500 hover:bg-blue-600"

// Tailwind gray background
className="bg-gray-50"

// Tailwind green
className="text-green-500"
```

---

## Files to Modify

All files in `src/app/prototypes/premium/components/`:

### 1. `Feed.tsx`

**Changes:**
```tsx
// Background: Line 21
- <div className="min-h-screen bg-[#F2F2F7]">
+ <div className="min-h-screen bg-gray-50">

// FAB: Line 58-59
- bg-[#007AFF] text-white
- hover:bg-[#0066DD]
+ bg-blue-500 text-white
+ hover:bg-blue-600
```

### 2. `IdeaCard.tsx`

**Search for and replace:**
- `#007AFF` → `blue-500`
- `#0066DD` → `blue-600`
- `#34C759` → `green-500`
- `#F2F2F7` → `gray-50`

### 3. `Chat.tsx`

**Search for and replace:**
- `#007AFF` → `blue-500`
- `#0066DD` → `blue-600`
- `#F2F2F7` → `gray-50`

### 4. `Profile.tsx`

**Search for and replace:**
- `#007AFF` → `blue-500`
- `#0066DD` → `blue-600`
- `#F2F2F7` → `gray-50`

### 5. `IdeaDetail.tsx`

**Search for and replace:**
- `#007AFF` → `blue-500`
- `#0066DD` → `blue-600`
- `#F2F2F7` → `gray-50`

### 6. `Live.tsx`

**Search for and replace:**
- `#007AFF` → `blue-500`
- `#0066DD` → `blue-600`
- `#F2F2F7` → `gray-50`

---

## Acceptable Differences (Hybrid Approach)

These differences are **OK to keep** (not critical):

| Element | Prototype | Landing | Decision |
|---------|-----------|---------|----------|
| Button radius | `rounded-full` | `rounded-md` | Keep `rounded-full` for FAB, `rounded-md` for others |
| Typography | `tracking-tight` | Default | Keep `tracking-tight` (minor difference) |
| Shadows | `shadow-blue-500/30` | `shadow-blue-500/20` | Keep existing (minor difference) |

---

## Implementation Strategy

### Step 1: Global Find/Replace

Use your editor's find/replace across all prototype files:

```bash
# Replace iOS blue with Tailwind blue
Find: bg-\[#007AFF\]
Replace: bg-blue-500

Find: hover:bg-\[#0066DD\]
Replace: hover:bg-blue-600

Find: text-\[#007AFF\]
Replace: text-blue-500

# Replace iOS gray background
Find: bg-\[#F2F2F7\]
Replace: bg-gray-50

# Replace iOS green
Find: text-\[#34C759\]
Replace: text-green-500

Find: bg-\[#34C759\]
Replace: bg-green-500
```

### Step 2: Verify Visually

After replacements:
1. Start dev server: `npm run dev`
2. Navigate to `/prototype/premium`
3. Check Feed, Chat, Profile, Idea Detail
4. Verify colors match landing page

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| FAB button | Still rounded-full (exception for floating buttons) |
| Action buttons | Should be blue-500, but can stay rounded-full or become rounded-md |
| Background transitions | Gray-50 background should feel cohesive with white sections |
| Text contrast | All text should be readable on gray-50 background |

---

## Tests That Must Pass

### P1 (Critical)
- [ ] All hex colors replaced with Tailwind classes
- [ ] No `#007AFF` found in prototype files
- [ ] No `#F2F2F7` found in prototype files
- [ ] No `#34C759` found in prototype files
- [ ] Feed background is gray-50
- [ ] FAB button is blue-500
- [ ] Buttons use blue-500 hover states
- [ ] Visual inspection: matches landing page colors
- [ ] No console errors

### P2 (Visual)
- [ ] Landing page still looks correct (no regressions)
- [ ] /live page still looks correct
- [ ] Prototype Feed looks cohesive
- [ ] Mobile (375px) view correct
- [ ] Desktop (≥768px) view correct

---

## Done When

- [ ] All iOS colors replaced with Tailwind equivalents
- [ ] Global find shows no hardcoded hex colors in prototype
- [ ] Visual inspection confirms color consistency
- [ ] All P1 tests pass
- [ ] No console errors

---

## Run Command

```bash
/loop "Implement P32.4_00b per @features/p32_4_00b_design_system_unification.md"
```

---

## Notes

- This is **Hybrid Approach** (Option C from design system audit)
- Fixes critical color inconsistencies only
- Accepts minor differences (border radius, typography)
- Can fully unify later if needed (P32.5 or later)
- Must complete BEFORE any P32.4 stories

---

*Generated: 2026-01-06*
*Prerequisite: Design system audit (p32_4_design_system_audit.md)*
