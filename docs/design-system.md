# Clarity Pledge Design System

**Purpose:** Document our Tailwind CSS + shadcn/ui conventions for consistent UI implementation.

**Audience:** AI agents (Claude), human developers

**Status:** Active (supersedes `docs/archive/bmad/archive/ux-design-specification.md`)

---

## Section 1: Foundation (~30 lines)

### Design Token System

We use **Tailwind CSS** as our design token system. Don't reinvent tokens - use Tailwind's semantic classes.

- **Colors:** `blue-500`, `green-600`, `text-muted-foreground` (NOT hex codes in components)
- **Spacing:** `p-4`, `gap-2`, `space-y-6` (NOT arbitrary `p-[13px]`)
- **Typography:** `text-lg`, `font-semibold` (NOT pixel sizes like `text-[17px]`)
- **Reference:** [Tailwind CSS Documentation](https://tailwindcss.com/docs)

### Component Library

We use **shadcn/ui** for accessible components (built on Radix UI primitives).

- **Location:** `src/components/ui/`
- **Pattern:** Import and use, don't copy-paste or create custom variants inline
- **Example:** `<Button variant="outline">` (NOT `className="border border-gray-300..."`)
- **Reference:** [shadcn/ui Documentation](https://ui.shadcn.com/)

### Visual Reference

The **landing page** ([src/app/pages/landing-page.tsx](../src/app/pages/landing-page.tsx)) demonstrates our visual style in production code.

- Use it as a reference for patterns (button styles, spacing rhythms, color usage)
- NOT a dependency - spec is the canonical source
- If landing page diverges from spec, spec wins (landing page gets refactored)

---

## Section 2: Our Conventions (~120 lines)

### Color Semantics

#### Interactive Elements (Blue)

**Use blue for:**
- Primary CTAs and action buttons
- Interactive elements (links, clickable pills)
- "Your" content in multi-user contexts (see Multi-User Pattern below)
- Pending/in-progress states (no amber needed)

**Tailwind tokens:**
- `blue-500` (#3b82f6) - Primary
- `blue-600` (#2563eb) - Hover states
- `blue-50` - Highlight backgrounds
- `blue-200` - Borders for action pills

**Examples:**
```tsx
// Primary CTA button
<Button className="bg-blue-500 hover:bg-blue-600">Sign Up</Button>

// Action pill
<button className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full px-3 py-1.5 text-xs font-medium">
  Explain Back
</button>

// Pending badge
<span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-md px-2 py-1 text-xs">
  Pending
</span>
```

#### Success States (Green)

**Use green ONLY for:**
- Confirmation screens (post-action success)
- Verified/accepted status badges
- Success state indicators (checkmarks, "Connected!")

**NEVER use green for:**
- Action buttons (Continue, Next, Submit) - use blue
- CTAs that initiate actions - use blue
- Anything clickable that starts a flow - use blue

**Tailwind tokens:**
- `green-500` (#22c55e) - Success indicators
- `green-600` (#16a34a) - Success text
- `green-50` (#dcfce7) - Success backgrounds

**Examples:**
```tsx
// ✅ Correct: Success badge (post-action)
<span className="bg-green-50 text-green-700 border border-green-200 rounded-md">
  Verified
</span>

// ❌ Wrong: Green action button
<button className="bg-green-500">Continue →</button>

// ✅ Correct: Blue action button
<button className="bg-blue-500">Continue →</button>
```

#### Destructive Actions (Red)

**Use red for:**
- Destructive actions (Delete, Remove, Disconnect)
- Recording indicators (red dot)
- Error states (use sparingly - prefer messaging)

**Tailwind tokens:**
- `red-500` (#ef4444) - Destructive actions, recording indicator
- `red-600` - Hover states

**Examples:**
```tsx
// Destructive button (use shadcn/ui variant)
<Button variant="destructive">Delete Account</Button>

// Recording indicator
<span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
```

#### Neutral Content (Gray)

**Use gray for:**
- Secondary text and descriptions
- "Other person's" content in multi-user contexts
- Non-interactive backgrounds
- Info banners (NOT blue - blue implies clickable)

**Tailwind tokens:**
- `muted` - Secondary backgrounds
- `muted-foreground` - Secondary text
- `border` - Default borders

**Examples:**
```tsx
// Secondary text
<p className="text-muted-foreground">Optional description</p>

// Info banner (non-interactive)
<div className="bg-muted border border-border rounded-lg p-4">
  <p className="text-sm">Your session will expire in 10 minutes.</p>
</div>
```

#### Multi-User Context Pattern

When showing content from multiple users in the same interface:

- **Blue** = "Your" content/status (things you do, your data)
- **Gray** = "Other person's" content/status (things they do, their data)

**Currently used in:** Excalidraw wireframes (documented below)

**Future use case:** Live chat interfaces, collaborative tools

**Examples (Excalidraw wireframes):**
- "You're speaking..." → Blue background (#eff6ff)
- "Gosha finished speaking" → Gray background (#f5f5f5)

#### Copy/Text Convention: "You" vs Actual Name

**Rule:** In **third-person narrative contexts** (logs, history, relationship statements), always use the actual user name. In **direct address contexts**, "You" is fine.

| Context | Use | Example |
|---------|-----|---------|
| Clarity Sessions log | Real name | "Alice Chen understands **Jordan Taylor**" ✓ |
| Relationship statements | Real name | "**Jordan** verified **Alice**'s understanding" ✓ |
| Historical records | Real name | "**Jordan Taylor** staked a position on Jan 5" ✓ |
| Network graph labels | "You" | Node labeled "You" (personal view) ✓ |
| Possessive phrases | "You/Your" | "Your profile", "Your idea" ✓ |
| Participant lists | "You" | Showing "You" in a list of participants ✓ |
| Notifications (in-app) | "You" | "You have a new verification" ✓ |
| Notifications (email/push) | Real name | "Jordan, Alice verified understanding of your story" ✓ |

**Why:** Third-person narratives read like historical records. "Alice understands You" is grammatically awkward and unclear when viewed later or by others. Real names create a clear, professional ledger.

### Component Patterns

#### Buttons

Always use shadcn/ui `<Button>` component with variants. Don't create custom button styles inline.

**Available variants** (from [src/components/ui/button.tsx](../src/components/ui/button.tsx)):
- `default` - Primary action (dark gray by default, override with blue for CTAs)
- `outline` - Secondary action
- `ghost` - Tertiary action
- `destructive` - Delete, remove, disconnect
- `link` - Text link style

##### Button Hierarchy

| Level | Use Case | Style | Example |
|-------|----------|-------|---------|
| **Primary CTA** | One main action per card/section | Full-width, `bg-blue-600`, `rounded-lg`, `py-2.5` | "Start a Clarity Session" |
| **Secondary** | Supporting actions | Icon-only, gray, `rounded-full`, 44px touch target | Share, Open icons |
| **Tertiary** | Less important actions | `variant="ghost"` or `variant="outline"` | Cancel, Skip |
| **Destructive** | Dangerous actions | `variant="destructive"` or red styling | Delete, Remove |

##### Primary CTA Pattern

Primary CTAs should be **prominent and consistent** across the app:

```tsx
// Card CTA - full width at bottom of card
<button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
  <Icon size={16} />
  Action Label
</button>
```

**Placement rules:**
- One primary CTA per card/section (avoid competing actions)
- Position at bottom of cards for easy thumb reach on mobile
- Always visible (not hidden behind hover states)

##### Secondary Actions Pattern

Secondary actions should be **subtle and non-competing**:

```tsx
// Icon-only button with tooltip
<button className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
  <ShareIcon size={16} />
</button>
```

**On desktop:** Can appear on hover (opacity-0 → opacity-100)
**On mobile:** Use overflow menu (•••) to group secondary actions

##### Touch Targets

All interactive elements must have **minimum 44px touch target** on mobile:

```tsx
// Icon button - explicit 44px
<button className="min-w-[44px] min-h-[44px] ...">

// Text button - padding achieves 44px height
<button className="px-4 py-2.5 ...">  // ~40px + border = 44px
```

##### Common patterns:
```tsx
// Primary CTA (blue, full-width)
<Button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5">
  Start a Clarity Session
</Button>

// Secondary action (outline)
<Button variant="outline">Learn More</Button>

// Destructive action
<Button variant="destructive">Delete</Button>

// Ghost button (minimal)
<Button variant="ghost">Cancel</Button>
```

#### Choice Controls (Segmented Control)

**Position selection (Agree/Unsure/Disagree) is NOT 3 buttons** — it's a single-select choice control.

Use **segmented control pattern** for mutually exclusive options:

```
┌─────────────────────────────────────────────────┐
│  Disagree ▾  │   Unsure   │   Agree (2) ▾ ✓   │
└─────────────────────────────────────────────────┘
```

**Structure:**
- Connected segments (no gaps between options)
- Selected segment: `bg-blue-600 text-white`
- Unselected segment: `bg-white text-gray-700 hover:bg-gray-50`
- Border: `border border-gray-200 rounded-lg overflow-hidden`

**With sub-options (7-point scale):**
- Disagree/Agree segments have dropdown arrow (▾)
- Dropdown shows: Strongly, Default, Somewhat
- Unsure has no sub-options

```tsx
// Segmented control structure
<div className="flex rounded-lg border border-gray-200 overflow-hidden">
  <button className={cn(
    "flex-1 px-3 py-2 text-sm font-medium transition-colors",
    selected === 'disagree' ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"
  )}>
    Disagree {hasSubOptions && "▾"}
  </button>
  <button className="flex-1 px-3 py-2 text-sm font-medium border-x border-gray-200 ...">
    Unsure
  </button>
  <button className="flex-1 px-3 py-2 text-sm font-medium ...">
    Agree (2) ▾
  </button>
</div>
```

**Rationale:**
- Visually communicates "pick one" instead of "here are 3 buttons"
- Reduces visual noise
- Consistent with iOS/Android segmented controls

#### Status Badges

Two main patterns:

```tsx
// Success/Accepted (green)
<span className="bg-green-50 text-green-700 border border-green-200 rounded-md px-2 py-1 text-xs font-medium">
  Accepted
</span>

// Pending/In Progress (blue)
<span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-md px-2 py-1 text-xs font-medium">
  Pending
</span>

// Neutral/Info (gray)
<span className="bg-muted text-muted-foreground border border-border rounded-md px-2 py-1 text-xs font-medium">
  Draft
</span>
```

#### Position Badges (Prototype)

Position badges (Agrees/Disagrees/Unsure) use **uniform blue styling** regardless of position type:

```tsx
// All positions use same blue styling
<span className="bg-blue-100 text-blue-700 text-xs font-medium px-1.5 py-0.5 rounded">
  Agrees
</span>
```

**Rationale:** Visual consistency — the badge indicates someone took a position, not the position's "value". Disagree isn't negative, Agree isn't positive. They're equal actions.

**Implementation:** See `PositionBadge.tsx` in linkedin-like prototype.

#### Message Bubbles (Chat Pattern)

```tsx
// Your own message
<div className="bg-primary text-primary-foreground rounded-2xl px-4 py-2.5">
  {message}
</div>

// Other person's message
<div className="bg-muted rounded-2xl px-4 py-2.5">
  {message}
</div>
```

### Typography Scale

Use Tailwind's semantic type scale, NOT pixel sizes.

| Use Case | Classes | Example |
|----------|---------|---------|
| Hero heading | `text-4xl sm:text-5xl lg:text-7xl font-bold` | Landing page hero |
| H2 | `text-3xl md:text-4xl font-bold` | Section headers |
| H3 | `text-2xl font-bold` | Subsection headers |
| Body (large) | `text-lg` | Main content |
| Body (default) | `text-base` | Form labels, body text |
| Small | `text-sm` | Captions, helper text |
| Extra small | `text-xs` | Badges, timestamps |

**Responsive typography:**
```tsx
// ✅ Good: Responsive semantic classes
<h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold">

// ❌ Bad: Fixed pixel size
<h1 className="text-[64px] font-bold">
```

### Border Radius Scale

| Token | Usage |
|-------|-------|
| `rounded-md` | Buttons, inputs, badges |
| `rounded-lg` | Small cards, dropdowns |
| `rounded-xl` | Medium cards |
| `rounded-2xl` | Large cards, message bubbles |
| `rounded-full` | Avatars, pills, icon buttons |

### Spacing Patterns

Use Tailwind's spacing scale consistently:

- **Inline spacing:** `gap-2`, `space-x-4` (NOT margin on every child)
- **Card padding:** `p-6` (medium cards), `p-8` (large cards)
- **Section spacing:** `space-y-12` (sections), `space-y-6` (within sections)
- **Button padding:** Use shadcn/ui Button sizes (`sm`, `default`, `lg`)

### Thread Lines (Visual Hierarchy)

Twitter-style vertical lines connecting parent → child relationships. Use when showing hierarchical data (Point → Position → Story).

```
Point (parent)
│
├─ AGREE (section)
│  │
│  ├─ Alice agrees:        ← position label
│  │  ┌──────────────┐
│  │  │ Story card   │     ← child content
│  │  └──────────────┘
│  │
│  └─ Bob agrees:
│     ┌──────────────┐
│     │ Story card   │
│     └──────────────┘
```

**CSS pattern:**
```tsx
// Container with thread line
<div className="relative pl-4 border-l-2 border-gray-200">
  {/* Horizontal connector */}
  <div className="absolute left-0 top-4 w-3 h-0.5 bg-gray-200" />
  {/* Child content */}
  <div className="ml-2">...</div>
</div>

// Last item (no continuation line)
<div className="relative pl-4 border-l-2 border-transparent">
  <div className="absolute left-0 top-4 w-3 h-0.5 bg-gray-200" />
  <div className="ml-2">...</div>
</div>
```

**When to use:**
- PointDetail: Stories grouped by position under a Point
- Profile expanded views: Stories under Points, Points under Stories
- Any parent-child relationship where visual connection matters

**When NOT to use:**
- Flat lists (no hierarchy)
- Feed views (cards are independent)
- Single-item views

### Excalidraw Wireframe Conventions

When creating wireframes in Excalidraw (`.excalidraw` files), use these hex colors:

| Element Type | Stroke | Background | Text | When to use |
|--------------|--------|------------|------|-------------|
| **Primary button** | `#3b82f6` | `#3b82f6` | `#ffffff` | Main CTAs ("Continue →", "Start") |
| **Secondary button** | `#e0e0e0` | `#ffffff` | `#1e1e1e` | Alternative actions ("Skip", "Back") |
| **Your status/action** | `#bfdbfe` | `#eff6ff` | `#1e40af` | "You're speaking...", "You rated: 6/10" |
| **Other person's status** | `#e0e0e0` | `#f5f5f5` | `#757575` | "Slava finished speaking" |
| **Content/Quotes** | `#e0e0e0` | `#fafafa` | `#1e1e1e` | "You said:...", transcript boxes |
| **Success state** | `#22c55e` | `#dcfce7` | `#166534` | ONLY verified/confirmed states |
| **Recording indicator** | `#ef4444` | `#ef4444` | - | Red dot only |
| **Phone frame** | `#1e1e1e` | `#ffffff` | - | Device outline |
| **Footer area** | `#e0e0e0` | `#f5f5f5` | - | Bottom status bar |

**Element ID Naming Convention** (enables validation):
- `primary-button-{action}` - e.g., `primary-button-continue`
- `secondary-button-{action}` - e.g., `secondary-button-skip`
- `status-yours-{context}` - e.g., `status-yours-speaking`
- `status-theirs-{context}` - e.g., `status-theirs-finished`
- `success-state-{name}` - e.g., `success-state-verified`

**Multi-user context in Excalidraw:**
- Blue = YOUR actions/status (things you do or your data)
- Gray = OTHER person's actions/status or neutral info
- Green = SUCCESS only (verified, confirmed, connected)

---

## Section 3: Anti-Patterns (~50 lines)

### Forbidden Color Usage

#### ❌ Green Action Buttons

**Problem:** Green implies "success" or "already done", not "do this action".

```tsx
// ❌ WRONG: Green CTA button
<button className="bg-green-500">Continue →</button>

// ✅ CORRECT: Blue CTA button
<button className="bg-blue-500">Continue →</button>

// ✅ CORRECT: Green for post-action success
<div className="bg-green-50 border border-green-200 p-4 rounded-lg">
  <p className="text-green-700">Understanding verified! ✓</p>
</div>
```

**Real violation:** V8 wireframe used green (#22c55e) for "Continue →" action button.

#### ❌ Amber/Orange/Yellow Anywhere

**Problem:** Creates unnecessary color palette complexity. Use blue with messaging instead.

```tsx
// ❌ WRONG: Amber pending state
<span className="bg-amber-100 text-amber-700">Pending</span>

// ✅ CORRECT: Blue pending state
<span className="bg-blue-50 text-blue-700">Pending</span>

// ❌ WRONG: Orange warning
<div className="bg-orange-100">Warning: Check your input</div>

// ✅ CORRECT: Gray info banner with clear messaging
<div className="bg-muted border border-border p-4 rounded-lg">
  <p className="font-medium">Check your input</p>
  <p className="text-sm text-muted-foreground">Email format should be...</p>
</div>
```

#### ❌ Purple in UI Components

**Problem:** Purple is reserved for Excalidraw annotations/notes only.

```tsx
// ❌ WRONG: Purple accent in UI
<button className="bg-purple-500">New Feature</button>

// ✅ CORRECT: Blue for interactive elements
<button className="bg-blue-500">New Feature</button>
```

**Excalidraw exception:** Purple text is OK for notes/annotations in wireframes (not interactive elements).

#### ❌ iOS Blue (#007AFF)

**Problem:** We use Tailwind blue-500 (#3b82f6), not iOS system blue.

```tsx
// ❌ WRONG: iOS blue
<button className="bg-[#007AFF]">Continue</button>

// ✅ CORRECT: Tailwind blue-500
<button className="bg-blue-500">Continue</button>
```

#### ❌ Blue Info Banners

**Problem:** Blue implies interactivity/clickability. Use gray for non-interactive info.

```tsx
// ❌ WRONG: Blue non-interactive banner
<div className="bg-blue-50 border border-blue-200 p-4">
  <p className="text-blue-700">Your session expires in 10 minutes</p>
</div>

// ✅ CORRECT: Gray info banner (non-interactive)
<div className="bg-muted border border-border p-4 rounded-lg">
  <p className="text-sm">Your session expires in 10 minutes</p>
</div>

// ✅ CORRECT: Blue banner with action button (interactive)
<div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-center justify-between">
  <p className="text-blue-700">Your session expires in 10 minutes</p>
  <Button size="sm" className="bg-blue-500">Extend Session</Button>
</div>
```

### Forbidden Component Patterns

#### ❌ Custom Button Styles (Inline)

**Problem:** Duplicates code, bypasses shadcn/ui accessibility, inconsistent with design system.

```tsx
// ❌ WRONG: Custom inline button styling
<button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-md text-white font-semibold">
  Submit
</button>

// ✅ CORRECT: Use shadcn/ui Button
<Button className="bg-blue-500 hover:bg-blue-600">Submit</Button>
```

#### ❌ Pixel Font Sizes

**Problem:** Breaks responsive design, hard to maintain, not semantic.

```tsx
// ❌ WRONG: Fixed pixel size
<h2 className="text-[32px]">Section Title</h2>

// ✅ CORRECT: Semantic responsive class
<h2 className="text-2xl md:text-3xl">Section Title</h2>
```

#### ❌ Hex Colors in Components

**Problem:** Bypasses design tokens, hard to update globally, not semantic.

```tsx
// ❌ WRONG: Hex color in component
<div className="bg-[#3b82f6] text-[#ffffff]">Content</div>

// ✅ CORRECT: Semantic Tailwind token
<div className="bg-blue-500 text-white">Content</div>
```

#### ❌ Red on Green (Accessibility)

**Problem:** Red-green colorblindness affects ~8% of men. Red text on green backgrounds is inaccessible and visually jarring.

```tsx
// ❌ WRONG: Red destructive button on green success banner
<div className="bg-green-50 border-green-200">
  <Button className="text-red-600">Cancel</Button>
</div>

// ✅ CORRECT: Muted text that turns red on hover
<div className="bg-green-50 border-green-200">
  <Button className="text-muted-foreground hover:text-red-600 hover:bg-white/50">
    Cancel
  </Button>
</div>
```

**Rule:** Destructive actions inside success banners should use muted styling with red appearing only on hover.

#### ❌ Backwards Compatibility Hacks

**Problem:** Clutters code with unused exports, confusing for AI agents.

```tsx
// ❌ WRONG: Keeping unused code "for compatibility"
export const OldButtonComponent = Button; // Unused
export const deprecatedFunction = () => {}; // Unused

// ✅ CORRECT: Delete unused code
// If something is unused, remove it completely
```

---

## Before Creating UI (Checklist)

Use this checklist before creating wireframes, prototypes, or modifying frontend components.

### For Excalidraw Wireframes:
- [ ] Primary buttons use `#3b82f6` (blue-500), not green
- [ ] User's own content uses blue tints (`#eff6ff` bg, `#bfdbfe` stroke)
- [ ] Other's content uses gray (`#f5f5f5` bg, `#e0e0e0` stroke)
- [ ] Success states ONLY use green (`#dcfce7` bg, `#22c55e` stroke)
- [ ] No yellow/amber/orange/purple in interactive elements
- [ ] Element IDs follow naming convention (enables validation)

### For React Components:
- [ ] Use shadcn/ui `<Button>` variants, not custom inline styles
- [ ] Use semantic Tailwind classes (`blue-500`, `text-muted-foreground`), not hex codes
- [ ] Check existing components in `src/components/ui/` before creating new ones
- [ ] Green only for success states, NOT action buttons
- [ ] Blue for CTAs and interactive elements
- [ ] Gray for non-interactive info banners

### Auditing Existing UI (Systematic Check)

When reviewing existing components for compliance, check **every button** against this matrix:

| Button Purpose | Required Style | Check |
|----------------|----------------|-------|
| Primary CTA (Submit, Create, RSVP, Sign Up) | `bg-blue-500 hover:bg-blue-600 text-white` | [ ] |
| Secondary action (Add to Calendar, Edit) | `variant="outline"` | [ ] |
| Tertiary action (Cancel dialog, View Details) | `variant="ghost"` | [ ] |
| Destructive (Delete, Cancel Event, Remove) | Red styling or `variant="destructive"` | [ ] |

**State Coverage Matrix** - Test all user states visually:

| State | What to Check |
|-------|---------------|
| Visitor (logged out) | CTAs say "Sign Up to..." and are blue |
| Logged in (no action taken) | Primary action available and blue |
| Logged in (action completed) | Success state shows green confirmation |
| Owner/Host view | Owner controls visible, no redundant states |
| Past/Completed state | Disabled states render correctly |

**Common Misses:**
- Default `<Button>` without blue override (renders dark gray, not blue)
- Status text using green when it's not a success state
- Missing user states in mock data (can't visually verify all scenarios)

---

## Validation and Tools

### Automatic Validation

The `.claude/hooks/design-system-check.sh` hook runs automatically when you edit `.tsx` or `.excalidraw` files.

**What it catches (syntax violations):**
- Amber/orange/yellow colors
- iOS blue (#007AFF)
- Pixel font sizes (text-[17px])
- Purple in UI components (warnings only)

**What it doesn't catch (semantic violations):**
- Green action buttons (context-dependent)
- Blue info banners (depends on interactivity)
- Multi-user context violations (requires understanding)

### Manual Validation

Use the `/design-check` skill for comprehensive design system checks:

```
/design-check
```

This skill reads this spec and validates UI files against our conventions.

### Visual Validation (Playwright/Chrome DevTools MCP)

For semantic design decisions that can't be caught by regex:

1. Start dev server: `npm run dev`
2. Use Playwright MCP to navigate and screenshot
3. Verify color usage matches spec (blue for CTAs, green for success only)
4. Check responsive behavior (mobile 375px, desktop 1024px+)

---

## Questions or Gaps?

If you encounter a design decision not covered in this spec:

1. Check [shadcn/ui documentation](https://ui.shadcn.com/) for component patterns
2. Check [Tailwind CSS documentation](https://tailwindcss.com/docs) for token usage
3. Reference the landing page for visual examples
4. Ask the user for clarification

**Don't guess** - when in doubt, ask or use the most conservative pattern (blue for interactive, gray for neutral).

---

**Spec version:** 1.0.0
**Last updated:** 2026-01-15
**Supersedes:** docs/archive/bmad/archive/ux-design-specification.md
