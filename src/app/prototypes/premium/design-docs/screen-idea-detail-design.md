# Screen: Idea Detail

## Purpose

Deep dive into a single idea with full context. View position breakdown, comments, and initiate verification flow.

## Layout (Mobile 375px)

### Header (Sticky, Frosted Glass)
- Height: 56px
- Background: white/80 with backdrop-blur
- Left: Back chevron
- Center: "Idea" title
- Right: Share button

### Hero Section
- Full idea text (large, 20px)
- Author info with avatar
- Created timestamp
- Current user position (if any)

### Position Breakdown
- Visual bar showing agree/disagree/unsure distribution
- Tappable to see who holds each position
- List of avatar faces grouped by position

### Verification Section
- Cross-disagreement count (highlighted)
- "Verify Understanding" CTA button
- List of verified pairs

### Comments Section
- Comment count header
- Threaded comments
- Comment input at bottom

### Bottom Actions (Sticky)
- Position buttons (if not already selected)
- OR "Verify Understanding" prominent button

## Components

### PositionBar
- Horizontal bar visualization
- Green/Red/Gray segments proportional to counts
- Numbers below each segment

### PositionAvatarRow
- Row of small avatars (24px)
- "+N more" if >5

### VerifiedPairCard
- Shows speaker → listener verification
- Indicates cross-disagreement with special badge
- Timestamp

### CommentItem
- User avatar + name + time
- Comment text
- Like button + count
- Reply action

### CommentInput
- Avatar + text input
- Send button (blue when active)

## Interactions

- **Tap back** → Navigate back to Feed
- **Tap position button** → Update position
- **Tap position segment** → Show modal with users
- **Tap "Verify Understanding"** → Navigate to Live with idea context
- **Tap verified pair** → Show verification details modal
- **Tap comment** → Expand/collapse replies
- **Submit comment** → Optimistic add, scroll to new

## Mock Data Needed

- getIdeaById(id)
- getCommentsForIdea(ideaId)
- getCertificationsForIdea(ideaId)
- getUserById for all referenced users

## Personality Expression

### Apple Premium touches:
- **Hero area**: Large, confident typography
- **Position bar**: Subtle rounded ends, smooth colors
- **Frosted header**: backdrop-blur effect on scroll
- **Comments**: Clean card treatment with generous spacing
- **Transitions**: Smooth expand/collapse animations
- **Verification CTA**: Blue, prominent but not aggressive
- **Cross-disagreement**: Subtle blue highlight (not loud)
