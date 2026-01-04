# Screen: Profile

## Purpose

Display user's identity, reputation (Verified Listener Score), and activity history. Show positions held and verifications earned.

## Layout (Mobile 375px)

### Header (Sticky)
- Height: 56px
- Background: white with blur
- Left: Back button (if viewing other user) or nothing (own profile)
- Center: "Profile" title
- Right: Settings gear (own profile) or Share (other user)

### Hero Section
- Large centered avatar (80px)
- Name (24px, semibold)
- Bio (14px, secondary color)
- Verified Listener Score badge (prominent)
- Cross-disagreement count badge

### Stats Row
- Three stats: Ideas, Positions, Verifications
- Tappable to show details

### Activity Tabs
- All Activity | Positions | Verifications
- Underline indicator (animated)

### Activity List
- Timeline of positions taken and verifications earned
- Each item shows idea snippet + action taken

## Components

### ProfileHeader
- Avatar (80px, centered)
- Name and bio below
- Rounded score badges

### ScoreBadge
- Large number (34px)
- Label below (12px)
- Optional icon

### ActivityTabs
- Three tabs, evenly distributed
- Animated underline on active

### ActivityItem
- Type indicator (icon)
- Idea text (truncated)
- Position or verification info
- Timestamp

## Interactions

- **Tap Settings** → Navigate to settings
- **Tap tab** → Filter activity list with animation
- **Tap activity item** → Navigate to Idea Detail
- **Tap Verified Listener Score** → Show explanation modal

## Mock Data Needed

- currentUser or getUserById(id)
- User's positions across all ideas
- User's verifications (as speaker or listener)

## Personality Expression

### Apple Premium touches:
- **Avatar**: Large, centered, subtle shadow
- **Score**: Prominent but elegant typography
- **Tabs**: Smooth underline animation
- **Activity**: Clean timeline feel
- **Stats**: Tabular figures for numbers
- **Whitespace**: Generous breathing room
