# Screen: Feed

## Purpose

The primary discovery surface for ideas. Users browse, mark positions, and find ideas worth exploring deeper or verifying understanding on.

## Layout (Mobile 375px)

### Header (Sticky)
- Height: 56px
- Background: white with subtle bottom border
- Left: "Ideas" title (28px, semibold, -0.5px tracking)
- Right: User avatar (32px, circular, tappable → Profile)

### Main Content
- Full-width scrollable area
- Top padding: 16px
- Idea cards stacked vertically
- Card spacing: 16px between cards
- Screen padding: 20px horizontal

### Bottom Navigation (Fixed)
- Height: 83px (includes safe area)
- 5 tabs: Feed, Chat, Live, Profile, Topology
- Tab icons: 24px, labels 10px below
- Active state: blue fill, inactive: gray outline

## Components

### IdeaCard
- Background: white
- Border radius: 20px
- Shadow: 0 2px 8px rgba(0,0,0,0.04)
- Padding: 20px
- Content:
  - Idea text (17px, regular, leading-relaxed)
  - Author row: avatar (24px) + name + time
  - Position buttons row
  - Stats row: verifications, cross-disagreements, comments

### PositionButton
- Three buttons: Agree, Disagree, Don't Know
- Unselected: gray-100 bg, gray-600 text
- Selected Agree: green-100 bg, green-700 text
- Selected Disagree: red-100 bg, red-700 text
- Selected Don't Know: gray-200 bg, gray-700 text
- Transition: 200ms all ease

### BottomNav
- Background: white
- Border top: 1px solid gray-200
- Safe area padding bottom
- Tab items evenly distributed

## Interactions

- **Tap IdeaCard** → Navigate to `/prototype/premium/idea/:id`
- **Tap PositionButton** → Update position (optimistic), subtle scale animation
- **Tap Author avatar** → Navigate to Profile
- **Scroll** → Smooth momentum scrolling
- **Pull to refresh** → Skeleton shimmer animation

## Mock Data Needed

- mockIdeas array
- mockUsers for author info
- currentUser for own positions
- getPositionCounts helper

## Personality Expression

### Apple Premium touches:
- **Typography**: SF Pro-style hierarchy, generous line heights
- **Whitespace**: Cards breathe with 20px padding, 16px gaps
- **Shadows**: Subtle, almost imperceptible depth
- **Corners**: 20px radius feels iOS-native
- **Colors**: Mostly grayscale, color only for positions
- **Animation**: Smooth 200ms transitions, no jarring changes
- **Touch feedback**: Subtle scale (0.98x) on card press
