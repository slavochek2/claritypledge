# P22: Unified Ideas Architecture

> **Note:** The live conversation portions of this spec have been merged into [P23: Live Clarity Meetings](./p23_live-clarity-meetings.md). This document remains as reference for the full async data model (chat message elevation, feed updates, migration) which is deferred.

**Status:** Partially Implemented via P23
**Priority:** Medium (deferred parts)
**Depends on:** P19.2 (Clarity Chat), P19.3 (Idea Feed)

---

## Summary

Merge `clarity_ideas` and `clarity_feed_ideas` into a single unified `clarity_ideas` table. Ideas are orphan entities (no owner) with an originator (attribution only). Verification happens in sessions, stats aggregate to people.

---

## Problem Statement

Currently we have two separate idea tables:

| Table | Purpose | Issues |
|-------|---------|--------|
| `clarity_ideas` | Session-scoped demo backlog | Barely used, demo going away |
| `clarity_feed_ideas` | Public orphan ideas | Full feature set (votes, comments) |

This creates:
- Code duplication (separate APIs, types)
- Confusion about where ideas live
- No path from chat messages to public ideas

---

## Key Decisions

### 1. Ideas are Orphan (No Owner)

**Originator ≠ Owner**

| Term | Meaning | Has special rights? |
|------|---------|---------------------|
| Owner | Controls the idea | Yes (edit, delete) - **WE DON'T HAVE THIS** |
| Originator | First person to speak it | No - just attribution |

The originator is credited ("Originated by Slava") but has NO special powers. Anyone can verify, vote, discuss.

### 2. Anyone Can Verify Anyone About Any Idea

You don't have to be the originator to request verification. The verification is about **"do you understand MY intent"** - the requester judges, not the originator.

### 3. Stats Live on People, Not Ideas

```
Person's profile stats (aggregated from all verifications):
├── calibration_score
├── total_verifications
├── avg_rounds_to_understanding
└── ideas_engaged_with
```

The idea just exists. People accumulate reputation from engaging.

### 4. Voting Rules

| Context | Can Vote? | Condition |
|---------|-----------|-----------|
| Feed / Profile | Always | Lightweight engagement |
| Session (Chat) | After verification | 10/10 or "good enough" accepted |

In chat, you earn the right to vote by demonstrating understanding.

### 5. Visibility & Privacy

- Ideas have `visibility: 'private' | 'public'`
- Private ideas can be promoted to public
- Votes follow the idea (if you voted, your vote goes public with the idea)
- Source IDs (`source_session_id`, `source_message_id`) kept in DB but hidden in public UI

### 6. Feed vs Profile = Same Data, Different Filter

- **Feed** = all public ideas (social media style)
- **Profile** = ideas this person engaged with (originated, voted, verified)

### 7. Message → Idea Elevation

When someone requests "explain this back" on a message, it becomes an idea. The act of requesting verification = "this matters enough to be an idea."

---

## Data Model

### Unified Ideas Table

```sql
CREATE TABLE clarity_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core content
  content TEXT NOT NULL,
  originator_name TEXT NOT NULL,
  originator_session_id UUID, -- Anonymous session ID (localStorage)

  -- Visibility
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('public', 'private')),

  -- Optional context (book, URL, notes, etc.)
  context JSONB DEFAULT NULL,

  -- Provenance (where did this idea come from?)
  source_session_id UUID REFERENCES clarity_sessions(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES clarity_chat_messages(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  promoted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL -- When made public
);
```

### What Gets Removed

From old `clarity_ideas` (demo-specific):
- `source_level` (demo levels going away)
- `status` (pending/in_meeting/discussed/skipped)
- `rounds_count`, `final_accuracy`, `position` (stats move to people)
- `discussed_at`

From old `clarity_feed_ideas`:
- `provenance_type` (simplified to just source_* FKs)
- `source_comment_id` (can derive from context if needed)

### Related Tables (Keep As-Is)

These stay the same, just point to unified `clarity_ideas`:

- `clarity_idea_votes` - voting on ideas
- `clarity_idea_vote_history` - vote change tracking
- `clarity_idea_comments` - comments on ideas
- `clarity_verifications` - verification rounds (on messages, not ideas directly)

---

## Migration Plan

### Phase 1: Create New Schema

1. Create new `clarity_ideas` table with unified schema
2. Keep old tables temporarily

### Phase 2: Migrate Data

```sql
-- Migrate feed ideas to new table
INSERT INTO clarity_ideas_new (
  id, content, originator_name, originator_session_id,
  visibility, source_session_id, source_message_id, created_at
)
SELECT
  id, content, originator_name, originator_session_id,
  visibility, source_session_id, source_message_id, created_at
FROM clarity_feed_ideas;

-- Old clarity_ideas (demo backlog) - decide: migrate or drop?
-- Recommendation: DROP - unused, demo going away
```

### Phase 3: Update Foreign Keys

Update `clarity_idea_votes`, `clarity_idea_comments` to point to new table.

### Phase 4: Update API

- Merge feed API + session idea API
- Single `Idea` type (drop `FeedIdea`)
- Add elevation: `elevateMessageToIdea(messageId)`

### Phase 5: Cleanup

- Drop old `clarity_feed_ideas` table
- Drop old `clarity_ideas` table
- Update all imports/types

---

## API Changes

### New/Changed Functions

```typescript
// Unified idea operations
getIdeas(filter: { visibility?, originatorId? }): Promise<Idea[]>
getIdea(id: string): Promise<Idea>
createIdea(content: string, originatorName: string, visibility?: 'public' | 'private'): Promise<Idea>
promoteIdea(id: string): Promise<Idea> // private → public

// Elevation from message
elevateMessageToIdea(messageId: string): Promise<Idea>

// Voting (unchanged API, just unified type)
voteOnIdea(ideaId: string, vote: 'agree' | 'disagree', voterName: string): Promise<void>

// Comments (unchanged)
addIdeaComment(ideaId: string, content: string, authorName: string): Promise<IdeaComment>
```

### Removed Functions

- All `clarity_feed_*` specific functions (merged into unified)
- `saveClarityIdea` (demo-specific)
- `getClarityIdeas` (never used)

---

## UI Changes

### Shared IdeaCard Component

Single `<IdeaCard>` component that works everywhere:

```typescript
interface IdeaCardProps {
  idea: Idea;
  // Context-specific options
  showVoting?: boolean;      // true for feed/profile, conditional for session
  showComments?: boolean;    // true for detail view
  onVerify?: () => void;     // session context only
}
```

### Feed Page

- Uses unified `getIdeas({ visibility: 'public' })`
- Same UI, cleaner code

### Profile Page

- Uses unified `getIdeas({ originatorId: profileId })` + user's votes/verifications
- New section: "Ideas engaged with"

### Session/Chat Page

- Messages can be elevated to ideas
- Ideas shown with verification status
- Voting unlocked after verification

---

## Out of Scope (Future)

- Idea editing (ideas are immutable for now)
- Idea deletion (orphan = permanent)
- Private visibility controls beyond binary
- Advanced stats/analytics
- Idea search/filtering

---

## Success Metrics

| Metric | What It Tells Us |
|--------|------------------|
| Ideas created | Are people posting? |
| Elevation rate | Are chat messages becoming public ideas? |
| Votes per idea | Engagement level |
| Verifications per idea | Deep engagement |
| Profile views | Are people exploring others' ideas? |

---

## Implementation Order

```
1. Write migration SQL (this doc → SQL file)
2. Test migration on dev/staging
3. Update types (Idea, remove FeedIdea)
4. Update API (merge functions)
5. Update UI components
6. Run migration on production
7. Cleanup old tables
```

---

## Open Questions

None currently - all resolved in planning discussion.

---

## Related Features

- **P19.2** - Clarity Chat (verification happens here)
- **P19.3** - Idea Feed (being unified)
- **P21** - Profile Stats (aggregates from verifications)
