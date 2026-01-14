# Screen: Feed

## Purpose
Browse ideas from your network, see community positions, and mark your own positions quickly.

## Layout (Mobile 375px)

### Header (sticky)
- Profile avatar button (left) → navigates to /profile
- Search bar (center, blue-50 background)
- Notification bell (right) with unread indicator

### Filter Tabs (sticky below header)
- Horizontal scroll of filter chips: All Ideas, Disputed, Verified, My Network
- Active chip uses green-700 background

### Main Content
- "Share an idea" prompt card at top
- Scrollable list of IdeaCards with 8px gap

### Bottom Nav (fixed)
- 5 items: Home, Messages, Live, Network, Profile
- Active item highlighted in blue-600

## Components
- [x] BottomNav: Shared navigation component
- [x] IdeaCard: LinkedIn-style post card with author, content, position bar, actions
- [x] FilterChip: Pill-style filter toggle

## Interactions
- Tap idea card → Navigate to /idea/:id
- Tap position button → Mark/unmark position (optimistic)
- Tap profile avatar → Navigate to /profile
- Tap notification bell → (future) Show notifications
- Scroll → Infinite scroll (mock: static list)

## Mock Data Needed
- mockIdeas: Array of ideas with positions
- mockUsers: Array of users with roles/companies
- currentUser: Logged-in user info

## Personality Expression
- LinkedIn-style header with profile avatar + search
- Card-based layout with clear author attribution
- Professional role/company shown on author
- Green primary for filter chips (LinkedIn uses green for engagement)
- Position breakdown bar with percentages
- Cross-disagreement verification highlight
