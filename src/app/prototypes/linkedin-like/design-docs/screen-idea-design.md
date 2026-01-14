# Screen: Idea Detail

## Purpose
View full idea, see position breakdown, mark your position, view comments, and initiate verification.

## Layout (Mobile 375px)

### Header (sticky)
- Back arrow → navigate back
- "Idea" title
- Share button

### Idea Card
- Author info: avatar, name, role@company, timestamp
- Full idea text (no truncation)
- Position breakdown with visual bars
- "Your Position" selector (3 buttons)
- "Verify Understanding" CTA button

### Cross-Disagreement Section (conditional)
- Highlighted blue-50 background
- Shows pairs who verified across disagreement
- Dual avatar display

### People with Positions
- Horizontal wrap of user chips
- Each shows avatar, name, position badge

### Comments Section
- Header with count
- Comment input with avatar
- Comment list with likes

### Bottom Nav (fixed)

## Components
- [x] PositionBar: Horizontal bar showing percentage
- [x] PositionButton: Toggle button for agree/disagree/uncertain
- [x] CommentCard: Comment with author, text, like button

## Interactions
- Tap "Verify Understanding" → Navigate to /live/:ideaId
- Tap author avatar → Navigate to /profile/:id
- Tap user chip → Navigate to /profile/:id
- Tap position button → Mark position
- Type comment → Send on enter/button
- Tap like → Increment (mock)

## Mock Data Needed
- getIdeaById: Single idea
- getCommentsForIdea: Comments array
- getCertificationsForIdea: Certifications array

## Personality Expression
- Clean, professional layout
- Blue primary CTA for "Verify Understanding"
- Cross-disagreement highlighted with blue accent
- LinkedIn-style comments with rounded backgrounds
- Like counts visible on comments
