# Screen: Profile

## Purpose
View user's verified listener score, positions taken, and certifications given/received.

## Layout (Mobile 375px)

### Header (sticky)
- Back arrow → navigate back
- User name
- Settings (own) or More menu (others)

### Profile Header Card
- Blue gradient cover banner
- Large avatar (overlapping cover)
- Name, role, company, bio
- Connection count
- Action buttons: Message, Connect (for others)

### Stats Cards Grid (3-col)
- Verified Listener Score (highlighted)
- Certifications Received
- Cross-Disagreement count

### Cross-Disagreement Badge (conditional)
- Blue accent card
- CheckCircle icon
- Description text

### Tabs (sticky)
- Positions | Received | Given
- Count in parentheses

### Tab Content
- List of position cards or certification cards
- Each card clickable to navigate

### Bottom Nav (fixed)

## Components
- [x] StatCard: Centered value with label
- [x] TabButton: Tab with count
- [x] PositionCard: Idea + position badge
- [x] CertificationCard: User + idea reference

## Interactions
- Tap "Message" → Navigate to /chat
- Tap position card → Navigate to /idea/:id
- Tap certification card → Navigate to /idea/:id
- Tap tab → Switch content
- Tap avatar in certification → Navigate to /profile/:id

## Mock Data Needed
- getUserById: User details
- getCertificationsForUser: Given and received
- mockIdeas filtered by user position

## Personality Expression
- LinkedIn-style profile header with cover image
- Connection count visible
- Stats prominently displayed
- Tab-based organization
- Professional role/company emphasis
- Cross-disagreement as a badge of honor
