# UX Spec: Consolidate Share Actions (Option A)

**Priority:** P6
**Scope:** Owner profile view - consolidate duplicate sharing UI into single top bar with dropdown
**Status:** Draft

## Problem Statement

Currently, profile owners see **two separate sharing UIs**:

1. **Top bar** (in `ProfileVisitorView`): Quick "Copy Link" + "Download Image" buttons
2. **Bottom ShareHub card**: Full card with Copy Link, LinkedIn, Email, Download Certificate

This creates:
- **Cognitive load**: Users wonder "which should I use?"
- **Visual clutter**: The bottom card feels heavy (card-within-cards)
- **Duplicate functionality**: Copy Link and Download appear twice

## Solution: Unified Top Bar with Dropdown

Keep the minimal top bar placement (high visibility, immediate access) but add a dropdown to reveal additional options. Remove the ShareHub card entirely for owners.

### Design

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│      [🔗 Share ▾]              [📥 Download Image]      │
│           │                                             │
│           └──┬─────────────────────┐                   │
│              │  Copy Link          │                   │
│              │  Share on LinkedIn  │                   │
│              │  Invite by Email    │                   │
│              └─────────────────────┘                   │
│                                                         │
│      ┌──────────────────────────────┐                  │
│      │                              │                  │
│      │    [Certificate Card]        │                  │
│      │                              │                  │
│      └──────────────────────────────┘                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Interaction Flow

1. **Default state**: Two buttons visible - "Share" (with chevron) and "Download Image"
2. **On "Share" click**: Dropdown appears with three options
3. **Copy Link**: Copies URL, shows "Copied!" feedback, dropdown stays open
4. **LinkedIn**: Opens modal with 3-step guide (existing flow from ShareHub)
5. **Email**: Opens mailto: with pre-filled content
6. **Click outside**: Closes dropdown

### Visual Specifications

**Top Bar Container:**
- Position: Right-aligned above certificate (existing placement)
- Gap: 8px (gap-2) between buttons
- Max-width: Follows certificate (max-w-3xl)

**Share Button:**
- Style: Secondary/outline (matches current)
- Icon: Link icon + ChevronDown
- Text: "Share" (simpler than "Copy Link" - action is implied)
- Hover: Background subtle highlight

**Dropdown Menu:**
- Width: 200px minimum
- Position: Below button, left-aligned to button
- Shadow: shadow-lg
- Border: 1px border-border
- Border-radius: rounded-lg
- Animation: Fade in + slight slide down (150ms)

**Dropdown Items:**
```
┌────────────────────────────────┐
│ 🔗  Copy Link                  │  ← Icon + label
│     Share anywhere             │  ← Subtle helper text
├────────────────────────────────┤
│ in  Share on LinkedIn          │
│     Post with certificate      │
├────────────────────────────────┤
│ ✉️  Invite by Email            │
│     Send personal invite       │
└────────────────────────────────┘
```

**Item Styling:**
- Padding: 12px 16px
- Icon: 16x16, left-aligned
- Label: font-medium, foreground
- Helper: text-sm, muted-foreground
- Hover: bg-muted/50
- Dividers: Optional (can use spacing instead)

**Download Button:**
- Keep as separate button (most common action deserves dedicated space)
- Icon: ImageIcon (current)
- Text: "Download Image"
- Loading state: Spinner + "Exporting..."

### Copy Feedback

When "Copy Link" is clicked:
1. Icon changes to CheckIcon (green)
2. Text changes to "Copied!"
3. Toast appears: "Link copied!"
4. Revert after 2000ms
5. Dropdown stays open (user might want to do another action)

### LinkedIn Flow

Clicking "Share on LinkedIn" opens the existing modal from ShareHub with:
1. Download certificate button
2. Copy suggested text
3. Open LinkedIn button

This modal is already implemented - we just trigger it from dropdown instead.

### Email Flow

Opens `mailto:` link with pre-filled subject and body (existing implementation from ShareHub).

## Technical Implementation

### Components to Modify

1. **`ProfileVisitorView`** - Replace inline buttons with new ShareDropdown
2. **`profile-page.tsx`** - Remove ShareHub render for owners

### New Component: ShareDropdown

Create `src/app/components/profile/share-dropdown.tsx`:

```typescript
interface ShareDropdownProps {
  profileUrl: string;
  profileName: string;
  slug: string;
  role?: string;
  signedAt: string;
  isVerified: boolean;
  acceptanceCount: number;
}
```

This component:
- Renders the "Share" button with dropdown
- Contains Copy Link, LinkedIn, Email handlers
- Manages LinkedIn modal state
- Uses Radix UI DropdownMenu for accessibility

### Migration Path

1. Create ShareDropdown component (extract logic from ShareHub)
2. Update ProfileVisitorView to use ShareDropdown
3. Remove ShareHub render from profile-page.tsx (owner case)
4. Keep ShareHub component file (may be useful for visitors or other pages)

## Acceptance Criteria

- [ ] Owner profile shows single "Share" dropdown + "Download Image" button
- [ ] Dropdown contains: Copy Link, LinkedIn, Email
- [ ] Copy Link shows confirmation feedback
- [ ] LinkedIn opens existing 3-step modal
- [ ] Email opens mailto: with pre-filled content
- [ ] ShareHub card no longer appears below certificate for owners
- [ ] All existing share functionality preserved
- [ ] Keyboard navigation works (Radix DropdownMenu)
- [ ] Mobile: Dropdown is touch-friendly

## Out of Scope

- Visitor sharing (they don't see these buttons)
- QR code sharing (was removed in previous iteration)
- Native share API integration (future consideration)

## Open Questions

1. **Should Download also be in dropdown?**
   - Current recommendation: No, keep separate for prominence
   - Alternative: Single "Share & Download" dropdown with everything

2. **Mobile behavior?**
   - Dropdown works on mobile but could consider bottom sheet for more options
   - For MVP: Standard dropdown is fine

## Success Metrics

- Reduced visual clutter on owner profile page
- Single mental model for sharing
- No loss of sharing functionality
