---
status: all-done
type: bug
rank: 125483
workstream: C1
severity: high
date_reported: 2026-02-26T00:00:00.000Z
created_date: 2026-02-26T00:00:00.000Z
source: sim
changes: p425
tags:
  - chat
  - ux
locked_at: '2026-02-27T15:47:05.313Z'
---

# BUG: Enter Key Does Not Submit Message in Chat

## Problem

In the AI-guided story creation chat (p425), pressing Enter does not submit the message. Users expect Enter to send (standard chat convention: Claude, ChatGPT, iMessage, Slack all use Enter to send). Currently the user must click the send button manually, which breaks the interaction flow.

## Symptoms

- User types a message and presses Enter
- Nothing happens — message stays in input field
- Send button click works correctly
- Found by Solo Founder and UX Critic personas in sim run on `p422-p425-uat` branch

## Root Cause

_To be filled in after investigation. Likely: missing `onKeyDown` handler on the textarea / input component in StoryGuideChat.tsx._

## Resolution

_Add Enter-to-submit handler. Shift+Enter should insert newline (standard behavior)._

## Verification

- Type message → press Enter → message submits
- Type multi-line message with Shift+Enter → newlines preserved
- Send button still works
