# Screen: Live

## Purpose
Real-time verification flow on a selected idea.

## Layout (Mobile 375px, dark theme)

### Header
- X close button
- Red dot + "Live Session" indicator
- Full width

### Idea Context Bar (if idea selected)
- Gray-800 background
- "Verifying understanding on:" label
- Idea text

### Main Content (centered, varies by phase)

#### Waiting Phase
- Large pulsing avatar
- Partner name/role
- "Connected" status
- "Start Verification" CTA

#### Roles Phase
- "Choose Your Role" heading
- Two cards: Speaker first / Listener first
- Description text for each

#### Speaking Phase
- Heading: "Explain Your Position"
- Large mic button (pulsing when active)
- Tap to mute/unmute
- "I'm done explaining" button

#### Explaining Phase
- Heading varies by role
- Avatar or target icon
- Quote/instruction card
- "Done Explaining" or "Rate the Explanation"

#### Rating Phase
- 1-10 grid of buttons
- Color-coded (red, yellow, green)
- Description text

#### Confirmed Phase
- Green checkmark
- "Rating Submitted"
- Your rating shown

#### Success Phase
- Animated checkmark with confetti
- "Understanding Verified!" heading
- Partner attribution
- Idea reference card
- Cross-disagreement badge
- "Back to Idea" CTA

### Participants Bar (fixed at bottom)
- Two avatar circles connected by line
- Labels: "You" and partner first name
- Speaking indicator (pulsing border)

## Components
- [x] ParticipantCircle: Avatar with label
- [x] MicButton: Large toggle with animation
- [x] RatingGrid: 1-10 button matrix
- [x] SuccessAnimation: Confetti effect

## Interactions
- Tap X → Exit to previous screen
- Tap Start → Begin verification
- Tap role → Assign role
- Tap mic → Toggle mute
- Tap done → Progress phase
- Tap rating → Submit and progress
- Tap "Back to Idea" → Navigate to /idea/:id

## Mock Data Needed
- getIdeaById: Current idea
- Partner user (mocked)

## Personality Expression
- Dark theme for focus
- Red live indicator
- Professional, minimal UI
- Clear phase progression
- Celebration on success
- Cross-disagreement highlighted as achievement
