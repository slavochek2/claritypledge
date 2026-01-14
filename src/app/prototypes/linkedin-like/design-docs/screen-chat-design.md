# Screen: Chat

## Purpose
Async messaging to discuss ideas before going live for verification.

## Layout (Mobile 375px)

### Header (sticky)
- Back arrow OR participant avatar (when in conversation)
- "Messages" title OR participant name/role
- More menu (when in conversation)

### Conversation List (when no conversation selected)
- List of conversation previews
- Avatar with unread badge
- Name + timestamp
- Message preview (truncated)
- Unread messages bold

### Chat View (when conversation selected)
- Messages with alternating alignment (own = right, other = left)
- Sender avatar for incoming messages
- Rounded bubble backgrounds (blue-600 for own, gray-100 for other)
- Timestamps below bubbles
- Idea reference cards inline
- "Go Live" action on idea cards

### Message Input (fixed at bottom)
- Text input (rounded)
- Send button (blue-600)

### Bottom Nav (fixed, below input)

## Components
- [x] ConversationPreview: List item with avatar, name, preview
- [x] MessageBubble: Styled message with timestamp
- [x] IdeaReferenceCard: Embedded idea with "Go Live" action

## Interactions
- Tap conversation → Open chat view
- Tap back → Return to list (mobile)
- Type message + send → Add to conversation
- Tap idea reference → Navigate to /idea/:id
- Tap "Go Live" → Navigate to /live/:ideaId
- Tap participant avatar → Navigate to /profile/:id

## Mock Data Needed
- conversations: Array of conversation summaries
- mockMessages: Messages in active conversation

## Personality Expression
- LinkedIn Messaging style layout
- Blue send button and message bubbles
- Inline idea cards maintain context
- "Go Live" CTA integrated into conversation flow
- Read receipts shown
- Professional, clean typography
