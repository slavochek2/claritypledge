---
id: p592
title: Fix hashtag update on story edit
type: bug
status: all-done
completed_at: "2026-03-27"
flow: fix
priority: 2
created: 2026-03-27
tags: []
rank: 1000036.0
created_date: 2026-03-27
---

## Problem

When editing a story's content (adding/removing hashtags), the `tags` column in DB only updates from the profile page edit path. Two other edit paths pass content but don't re-extract tags.

## Root Cause

| Call site | Passes tags? |
|-----------|-------------|
| `profile-page-v2.tsx:1135` | Yes |
| `story-detail-page.tsx:803` | **No** |
| `StoryGuideChat.tsx:646` | **No** |

## Fix

### Layer 1: Client (immediate)
Add `extractHashtags()` to the two broken call sites.

### Layer 2: DB trigger (sustainable)
Create a Postgres trigger on `stories` that auto-extracts hashtags from `content` on INSERT/UPDATE. Safety net for future call sites.

## Acceptance Criteria

- [ ] Editing a story from story detail page updates tags in DB
- [ ] Saving from StoryGuide chat updates tags in DB
- [ ] DB trigger auto-extracts tags even when client omits them
