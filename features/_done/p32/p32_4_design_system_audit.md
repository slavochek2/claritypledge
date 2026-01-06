# Design System Audit: Landing vs /live vs Prototype

**Status:** Pre-Implementation Blocker
**Date:** 2026-01-06
**Purpose:** Identify design inconsistencies before P32.4 implementation

---

## Executive Summary

**CRITICAL FINDING:** Three different design systems exist in the codebase:
1. **Landing Page** - Blue (#3B82F6) primary, clean modern design
2. **/live Page** - Gray-based, minimal semantic colors
3. **Prototype** - iOS-inspired (#007AFF blue, #F2F2F7 gray)

**Recommendation:** Unify to landing page design system before implementing P32.4.

---

## Comparison Table

| Element | Landing | /live | Prototype | Conflict? |
|---------|---------|-------|-----------|-----------|
| **Primary Blue** | `#3B82F6` (blue-500) | `#3B82F6` | `#007AFF` | ⚠️ YES |
| **Background** | White | White | `#F2F2F7` (iOS) | ⚠️ YES |
| **Button Radius** | `rounded-md` | `rounded-lg` | `rounded-full` | ⚠️ YES |
| **Typography** | Tailwind default | Tailwind default | Tracking-tight | ⚠️ Minor |
| **Shadows** | `shadow-lg shadow-blue-500/20` | Minimal | `shadow-lg shadow-blue-500/30` | ⚠️ Minor |
| **Success Color** | Not defined | `green-600` | `#34C759` (iOS) | ⚠️ YES |

---

## Detailed Audit

### 1. Landing Page Design System

**Source:** [clarity-pledge-landing.tsx](src/app/pages/clarity-pledge-landing.tsx), [ux-design-specification.md](docs/bmad/ux-design-specification.md)

#### Colors
```css
Primary: #3B82F6 (blue-500)
Primary Hover: #2563EB (blue-600)
Primary Light: #EFF6FF (blue-50)
Foreground: Near black
Muted: Gray
Background: White
```

#### Buttons
```tsx
// Primary CTA
className="bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-md shadow-lg shadow-blue-500/20"

// Secondary
className="border border-input bg-background hover:bg-accent rounded-md"
```

#### Typography
```tsx
Hero: text-4xl sm:text-5xl lg:text-7xl font-bold
H2: text-3xl md:text-4xl font-bold
H3: text-2xl font-bold
Body: text-base or text-lg
```

#### Border Radius
- Buttons/inputs: `rounded-md`
- Cards: `rounded-lg` to `rounded-2xl`
- Avatars: `rounded-full`

---

### 2. /live Page Design System

**Source:** [clarity-live-page.tsx](src/app/pages/clarity-live-page.tsx)

#### Colors
```tsx
Primary: #3B82F6 (blue-500) ✅ MATCHES LANDING
Background: White ✅ MATCHES LANDING
Success: Uses standard Button components
```

#### Buttons
```tsx
// Uses shadcn/ui Button component
import { Button } from '@/components/ui/button'
// Variants: default, secondary, ghost, outline
```

#### Notable Patterns
- Uses shadcn/ui components (Button, Input, Dialog)
- Minimal custom styling
- Follows landing page color scheme ✅

---

### 3. Prototype Design System (Premium/Converged)

**Source:** [src/app/prototypes/premium/components/Feed.tsx](src/app/prototypes/premium/components/Feed.tsx)

#### Colors ⚠️ CONFLICTS WITH LANDING
```css
Primary: #007AFF (iOS blue) ❌ Different from landing
Primary Hover: #0066DD ❌ Different from landing
Background: #F2F2F7 (iOS gray) ❌ Different from landing
Success: #34C759 (iOS green) ❌ Different from landing
```

#### Buttons ⚠️ CONFLICTS WITH LANDING
```tsx
// FAB
className="bg-[#007AFF] hover:bg-[#0066DD] rounded-full" ❌ Different radius

// Secondary actions
className="rounded-full" ❌ Different from landing (rounded-md)
```

#### Typography ⚠️ MINOR DIFFERENCE
```tsx
Header: text-[28px] font-semibold tracking-tight ⚠️ Uses tracking-tight
```

#### Layout
```tsx
Background: bg-[#F2F2F7] ❌ Different from landing (white)
Max width: max-w-[500px] ℹ️ Mobile-first constraint
```

---

## Critical Issues

### Issue #1: Blue Color Mismatch
**Problem:** Prototype uses iOS blue (#007AFF), landing uses Tailwind blue (#3B82F6)

**Impact:**
- Brand inconsistency
- Users see different blues across the app
- Breaks visual continuity

**Fix:**
```tsx
// Before (Prototype)
className="bg-[#007AFF]"

// After (Unified)
className="bg-blue-500"
```

---

### Issue #2: Background Color Mismatch
**Problem:** Prototype uses iOS gray (#F2F2F7), landing uses white

**Impact:**
- Jarring transition when navigating landing → prototype
- Different "feel" to the app

**Fix:**
```tsx
// Before (Prototype)
className="bg-[#F2F2F7]"

// After (Unified)
className="bg-gray-50" // or bg-white if we want pure white
```

---

### Issue #3: Border Radius Inconsistency
**Problem:** Landing uses `rounded-md` for buttons, prototype uses `rounded-full`

**Impact:**
- Buttons look different
- iOS-like feel conflicts with web-standard feel

**Fix:**
```tsx
// Before (Prototype FAB)
className="rounded-full"

// After (Unified) - Decision needed:
// Option A: Keep rounded-full for FAB only (exception for floating buttons)
// Option B: Use rounded-lg for ALL buttons (consistency)
```

**Recommendation:** Option A - FABs can be round, but action buttons should be `rounded-md` or `rounded-lg`

---

### Issue #4: Success Color Undefined in Landing
**Problem:** Landing page doesn't define success color, prototype uses iOS green (#34C759)

**Impact:**
- No standard for success states
- Could cause confusion when adding success feedback

**Fix:**
Add to landing design system:
```css
Success: #22C55E (green-500 - standard Tailwind)
Success Light: #DCFCE7 (green-50)
```

---

## Recommended Solution

### Option A: Unify to Landing System (RECOMMENDED)

**What:** Update prototype to match landing page design system

**Changes:**
1. Replace `#007AFF` → `#3B82F6` (blue-500)
2. Replace `#F2F2F7` → `bg-gray-50` or `bg-white`
3. Keep `rounded-full` for FAB only
4. Use `rounded-md` for action buttons
5. Add success color: `green-500` (#22C55E)

**Pros:**
- One consistent design system
- Matches existing landing page
- Users see cohesive brand
- Easier to maintain

**Cons:**
- Need to update all prototype components
- ~2 hours of work

**Estimated Time:** 2 hours (can be done as P32.4_00b pre-req story)

---

### Option B: Accept Divergence (NOT RECOMMENDED)

**What:** Document differences, plan future unification

**Pros:**
- Can start P32.4 immediately
- No rework needed

**Cons:**
- Brand inconsistency
- Technical debt
- Confusing for users
- Harder to merge prototype → production later

---

### Option C: Hybrid (COMPROMISE)

**What:** Unify critical elements only (colors), accept minor differences (radius, shadows)

**Changes:**
1. Replace `#007AFF` → `#3B82F6` ✅ CRITICAL
2. Replace `#F2F2F7` → `bg-gray-50` ✅ CRITICAL
3. Keep `rounded-full` buttons ⚠️ Accept difference
4. Keep tracking-tight typography ⚠️ Accept difference

**Pros:**
- Fixes biggest inconsistencies (color)
- Less work than full unification (~1 hour)
- Can start P32.4 sooner

**Cons:**
- Still some inconsistency
- Partial solution

**Estimated Time:** 1 hour (P32.4_00b pre-req story)

---

## Proposed Design System (Unified)

### Colors (Final)
| Token | Value | Usage |
|-------|-------|-------|
| `blue-500` | #3B82F6 | Primary CTA, accent, interactive |
| `blue-600` | #2563EB | Hover states |
| `blue-50` | #EFF6FF | Highlight backgrounds |
| `green-500` | #22C55E | Success/Accepted states |
| `green-50` | #DCFCE7 | Success backgrounds |
| `red-500` | #EF4444 | Recording indicator, errors |
| `gray-50` | #F9FAFB | Page background (alt to white) |
| `gray-900` | #111827 | Primary text |
| `gray-500` | #6B7280 | Secondary text |

### Buttons (Final)
```tsx
// Primary CTA
className="bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-md px-4 py-2"

// Secondary
className="border border-gray-300 bg-white hover:bg-gray-50 rounded-md px-4 py-2"

// FAB (Exception: can be rounded-full)
className="bg-blue-500 hover:bg-blue-600 text-white rounded-full w-14 h-14 shadow-lg"

// Action Pill (e.g., "Explain back")
className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full px-3 py-1.5 text-xs font-medium"
```

### Typography (Final)
```tsx
Hero: text-4xl sm:text-5xl lg:text-7xl font-bold
H2: text-3xl md:text-4xl font-bold
H3: text-2xl font-bold
Body: text-base text-gray-900
Small: text-sm text-gray-600
XS: text-xs text-gray-500
```

### Border Radius (Final)
```tsx
Buttons (standard): rounded-md
Buttons (pill/FAB): rounded-full
Small cards: rounded-lg
Medium cards: rounded-xl
Large cards: rounded-2xl
Avatars: rounded-full
```

---

## Implementation Plan

### Pre-P32.4 Story: P32.4_00b (Design System Unification)

**Story:** Update prototype to use landing design system

**Files to modify:**
- `src/app/prototypes/premium/components/Feed.tsx`
- `src/app/prototypes/premium/components/IdeaCard.tsx`
- `src/app/prototypes/premium/components/Chat.tsx`
- `src/app/prototypes/premium/components/Profile.tsx`
- `src/app/prototypes/premium/components/IdeaDetail.tsx`
- `src/app/prototypes/premium/components/Live.tsx`

**Changes:**
1. Find/replace: `#007AFF` → `blue-500`
2. Find/replace: `#0066DD` → `blue-600`
3. Find/replace: `bg-[#F2F2F7]` → `bg-gray-50`
4. Find/replace: `#34C759` → `green-500`
5. Update button classes to use `rounded-md` (except FAB)
6. Remove `tracking-tight` if inconsistent (optional)

**Estimated Time:** 1-2 hours

**Run command:**
```bash
/loop "Unify prototype design system to match landing page per @features/p32_4_design_system_audit.md Option C"
```

---

## Testing Checklist

After unification, verify:
- [ ] Landing page still looks correct (no regressions)
- [ ] /live page still looks correct
- [ ] Prototype Feed matches landing color scheme
- [ ] Prototype buttons use correct blue
- [ ] Background colors consistent
- [ ] No hardcoded hex colors in prototype (use Tailwind classes)
- [ ] FAB still looks good (rounded-full exception)
- [ ] Mobile (375px) view correct
- [ ] Desktop (≥768px) view correct

---

## Decision Required

**Question for User (Slava):**

Which option should we proceed with?

**A. Unify to Landing (2 hours, full consistency)** ✅ RECOMMENDED
**B. Accept Divergence (0 hours, technical debt)**
**C. Hybrid (1 hour, critical fixes only)** ⚠️ COMPROMISE

**My Recommendation:** Option C (Hybrid)
- Fixes biggest issue (color inconsistency)
- Allows starting P32.4 sooner
- Can fully unify later if needed

---

## Next Steps

1. **User decides** Option A, B, or C
2. **If A or C:** Create P32.4_00b story, run unification
3. **Get reviews:** Architect + UX designer review P32.4 specs
4. **Then proceed** with P32.4 implementation

---

**Status:** ⏳ Awaiting user decision on Option A/B/C

---

*Generated: 2026-01-06*
*Agent: UX Designer (Sally)*
