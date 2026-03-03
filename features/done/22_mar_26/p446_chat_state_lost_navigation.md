---
status: all-done
type: bug
rank: 62745
workstream: C1
severity: medium
date_reported: 2026-02-26T00:00:00.000Z
created_date: 2026-02-26T00:00:00.000Z
source: sim
changes: p425
tags:
  - chat
  - state
  - navigation
locked_at: '2026-03-02T08:35:52.924Z'
---

# BUG: Chat State Lost When Navigating Away and Back

## Problem

In the AI-guided story creation flow (p425), if the user navigates away from the chat page and returns, the conversation history is lost and the chat resets to the beginning. This breaks the experience for users who check another tab or navigate to a different part of the app mid-session.

## Symptoms

- User starts a story guide chat conversation
- User navigates away (e.g., to dashboard or another page)
- User returns to story guide chat
- Conversation is gone — chat shows initial state
- Found by Solo Founder persona in sim run on `p422-p425-uat` branch

## Root Cause

Chat state (`messages`, `phase`, `iterationCount`, `currentDraftVersion`, `polishedContent`, `selectedVisibility`) is held entirely in React component state. `StoryGuideChat` unmounts on navigation, and React discards all component state on unmount — no persistence existed.

## Resolution

Persist chat state to `sessionStorage` on every state change, restore on mount. Key: `story-chat-{pointId}` (or `story-chat-no-point` for standalone flow). State is cleared when the chat reaches `phase === 'saved'`. Edit mode (`existingStory` prop present) is excluded — the story is already in DB and the edit state is always re-derived from the DB record. Implementation: module-level helpers (`storageKey`, `loadChatState`, `saveChatState`, `clearChatState`) + a `useRef`-cached initial load + a `useEffect` that persists on every relevant state change.

## Verification

- Start a chat conversation (3+ exchanges)
- Navigate away and return
- Conversation history is intact
- Chat continues from where it left off
