# Journey Spec: LinkedIn-like

## Personality Definition

**Design Philosophy:** Professional Networking Platform

> Clean, trust-building design inspired by LinkedIn. Every element emphasizes professional credibility, endorsement-based validation, and meaningful professional connections. The aesthetic is corporate-friendly with subtle blue accents, card-based layouts, and prominent engagement metrics.

**Reference:** What would LinkedIn do?

---

## User Story

As a professional user, I want to discover ideas where my colleagues hold positions, verify understanding across disagreements, and build my reputation as a "Verified Listener" — showcasing my ability to understand perspectives I disagree with.

## Entry Point

**Start:** `/prototype/linkedin-like/feed`

**Why:** LinkedIn is fundamentally feed-first. Users scroll through ideas like LinkedIn posts, seeing engagement metrics, positions from their network, and opportunities to verify understanding. The feed is the discovery mechanism.

## Screen Flow

```
1. Feed → User browses ideas from their network
   └── Tap idea card → navigates to Idea Detail

2. Idea Detail → User sees full idea, comments, positions breakdown
   └── Tap "Verify Understanding" → navigates to Live
   └── Tap commenter profile → navigates to Profile

3. Profile → User sees someone's verified listener score, positions, certifications
   └── Tap "Message" → navigates to Chat
   └── Tap idea in positions list → navigates to Idea Detail

4. Chat → Async messaging to discuss ideas before live verification
   └── Tap "Go Live" suggestion → navigates to Live
   └── Idea references link back to Idea Detail

5. Live → Real-time verification flow on selected idea
   └── Verification complete → back to Idea Detail (now shows "Verified")
   └── Exit → returns to previous screen

6. Topology → Network visualization of who verified whom on which ideas
   └── Tap node → navigates to Profile
   └── Tap edge → navigates to Idea Detail
```

## Key Interactions Per Screen

### /feed
- Scroll through idea cards (LinkedIn post-style)
- See position breakdown per idea (agree/disagree/don't know)
- See "Verified Listeners" count on each idea
- Quick-react: tap position buttons directly from feed
- Tap card to see full details
- Sticky header with search and profile avatar
- Bottom nav: Feed | Chat | Live | Profile

### /idea/:id
- Full idea text in card format
- Position breakdown with percentages and names
- "Your Position" selector (prominent, LinkedIn-style buttons)
- Comments section (LinkedIn comment style)
- "Verify Understanding" CTA button
- "Cross-Disagreement Verifications" highlight section
- Share actions

### /profile
- Professional header: avatar, name, role, bio
- "Verified Listener Score" prominently displayed (like LinkedIn connections)
- Badge for cross-disagreement verifications
- Tabs: Positions | Certifications Given | Certifications Received
- List of ideas with user's positions
- "Message" and "Connect" buttons

### /chat
- LinkedIn Messaging style
- Conversation list on mobile shows most recent
- In-thread: idea references displayed as cards
- "Go Live on this idea" action in thread
- Timestamp and read receipts

### /live
- Minimalist verification flow
- Current idea displayed at top
- Speaker/Listener role assignment
- Explain-back interface
- Rating selectors
- Certification confirmation
- Success state with confetti

### /topology
- Network graph visualization
- Nodes = people (sized by verified listener score)
- Edges = certifications (colored by agree/disagree)
- Filter by idea
- Tap to drill down
- Legend explaining visual encoding

## Personality Expression

### Navigation patterns
- Bottom tab bar (mobile-first like LinkedIn app)
- Sticky headers with current context
- Smooth transitions between screens
- Back navigation via chevron, not swipe

### Information density
- Medium-high: LinkedIn shows a lot per card
- Professional metrics visible upfront
- Truncation with "see more" for long content

### Animation/transitions
- Subtle fade transitions
- Button press states
- Loading skeletons (LinkedIn style)
- Celebration animation on verification

### Typography choices
- Sans-serif (system font stack)
- Hierarchy: Large names, medium descriptions, small metadata
- Blue for links and CTAs
- Gray for secondary text

### Whitespace usage
- Cards with consistent padding
- Clear section separation
- Breathable but not sparse
- Grid alignment

### Color palette
- Primary: Blue (#0A66C2 LinkedIn blue, or our `blue-500`)
- Background: White/Light gray
- Success: Green for verified states
- Text: Dark gray for primary, medium gray for secondary
- Borders: Light gray, subtle
