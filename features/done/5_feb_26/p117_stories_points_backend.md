---
status: done
type: story
priority: p1
completed_at: '2026-02-05'
prepped_date: '2026-02-04'
reviews:
  ux: passed-with-notes
  architect: passed-with-notes
  alignment: passed
decisions:
  - story-versioning: "Use versions table (not snapshots in verifications) for normalization and future edit history UI"
  - calibration-averages: "Compute on-read via AVG() query, not stored columns — fast enough (<100ms), avoids trigger complexity"
---

# P117: Stories, Points, and Calibration Backend

## Summary

Replace mock data layer with real Supabase backend for stories, points, positions, and calibration tracking.

## Context

The frontend has extensive mocks for:
- **Stories**: User-created content with titles, content, linked points
- **Points**: Statements users take positions on (7-point Likert scale)
- **Calibration**: Ears count, session history, accuracy tracking
- **Verifications**: Who understood whom in /live sessions

Events are already production-backed. This feature brings stories/points/calibration to parity.

## Database Schema

Migration: `supabase/migrations/20260204_stories_points_calibration.sql`

### New Tables

| Table | Purpose |
|-------|---------|
| `stories` | User-created content |
| `story_versions` | Immutable snapshots for verification tracking |
| `points` | Statements with positions |
| `story_points` | Many-to-many junction |
| `point_positions` | Current user positions (7-point) |
| `point_position_history` | Audit log of all position changes |
| `story_verifications` | /live verification attempts (references version_id) |

### Story Versioning

When a story is created, version 1 is automatically created via trigger. When story content changes, a new version is created. Verifications reference the specific version that was verified.

```
stories ─────────── story_versions (1:N)
    │                      │
    │                      ▼
    └──────────── story_verifications (references version_id)
```

This enables "view what was verified" without content duplication.

### Profile Extensions

| Column | Type | Purpose |
|--------|------|---------|
| `ears_count` | INTEGER | Successful listener verifications (≥8/10) |
| `verification_session_count` | INTEGER | Total verification sessions |

**Note:** Calibration averages (`listener_calibration_avg`, `speaker_calibration_avg`) are computed on-read via `AVG()` query, not stored. This is fast (<100ms) and avoids trigger complexity.

### Session Linking

Added to `clarity_sessions`:
- `creator_profile_id` — FK to profiles
- `joiner_profile_id` — FK to profiles

## Data Model

### Position Scale (7-point Likert)

```
strongly_disagree (-3) ← disagree (-2) ← somewhat_disagree (-1)
                              ↓
                           unsure (0)
                              ↓
somewhat_agree (+1) → agree (+2) → strongly_agree (+3)
```

UI shows 3 buttons with expandable dropdowns for granularity.

### Relationships

```
profiles ─────┬───── stories (author_id)
              │
              ├───── points (first_validator_id)
              │
              ├───── point_positions (user_id)
              │
              └───── story_verifications (speaker_id, listener_id)

stories ←──── story_points ────→ points (many-to-many)
   │
   └───── story_versions (1:N, auto-created on insert/update)

story_versions ←──── story_verifications (version_id)

clarity_sessions ────→ story_verifications (session_id)
                 ────→ profiles (creator_profile_id, joiner_profile_id)
```

## RLS Policies

| Table | Read | Create | Update | Delete |
|-------|------|--------|--------|--------|
| stories | Public | Verified users | Author only | Author only |
| story_versions | Public | System (trigger) | — | — |
| points | Public | Verified users | — (immutable) | — |
| story_points | Public | Story author | — | Story author |
| point_positions | Public | Verified users (own) | Own only | Own only |
| point_position_history | Public | System (trigger) | — | — |
| story_verifications | Public | Authenticated | — | — |

## API Functions Needed

### Stories

```typescript
// Create
createStory(title: string, content: string, pointIds?: string[], tags?: string[]): Promise<Story>

// Read
getStory(id: string): Promise<StoryWithDetails>
getStoryVersion(versionId: string): Promise<StoryVersion>  // for "view what was verified"
getStoriesByAuthor(authorId: string): Promise<Story[]>
getStoriesFeed(limit: number, offset: number): Promise<Story[]>

// Update
updateStory(id: string, updates: Partial<Story>): Promise<Story>  // creates new version
linkPointToStory(storyId: string, pointId: string): Promise<void>
unlinkPointFromStory(storyId: string, pointId: string): Promise<void>

// Delete
deleteStory(id: string): Promise<void>
```

### Points

```typescript
// Create
createPoint(statement: string, context?: string, tags?: string[]): Promise<Point>

// Read
getPoint(id: string): Promise<PointWithPositions>
getPointsByValidator(validatorId: string): Promise<Point[]>
getPointsFeed(limit: number, offset: number): Promise<Point[]>
getPositionCounts(pointId: string): Promise<Record<PositionType, number>>
```

### Positions

```typescript
// Set/Update
setPosition(pointId: string, position: PositionType, reasoning?: string): Promise<void>

// Remove
removePosition(pointId: string): Promise<void>

// Read
getMyPosition(pointId: string): Promise<PointPosition | null>
getPositionsForPoint(pointId: string): Promise<PointPositionWithUser[]>
getPositionHistory(pointId: string, userId?: string): Promise<PositionHistoryEntry[]>
```

### Verifications & Calibration

```typescript
// Record verification from /live session
recordStoryVerification(
  storyId: string,
  versionId: string,  // must pass the version being verified
  sessionId: string,
  speakerId: string,
  listenerId: string,
  speakerRating: number,
  listenerRating: number
): Promise<void>

// Read
getStoryVerifications(storyId: string): Promise<StoryVerification[]>
getProfileCalibration(userId: string): Promise<CalibrationStats>  // computes AVG on-read
getVerificationHistory(userId: string): Promise<VerificationHistoryEntry[]>
```

## Implementation Phases

### Phase 1: Schema & Types
- [x] Create migration file
- [x] Apply migration to test database
- [x] Generate TypeScript types from schema
- [x] Update `src/app/types/index.ts`

### Phase 2: API & Services
- [x] Create `src/app/data/stories-service-real.ts`
- [x] Create `src/app/data/points-service-real.ts`
- [x] Add verification functions to `api.ts`
- [x] Add calibration query (AVG on-read)
- [x] Wire up session profile linking (`creator_profile_id`/`joiner_profile_id` in createClaritySession/joinClaritySession)
- [x] Add feature flag or environment check (`VITE_USE_REAL_API`)
- [x] Update imports to use real services

### Phase 3: /Live Integration & Cleanup
- [x] Update /live to link sessions to profiles
- [ ] Call `recordStoryVerification` when story discussed (pass version_id) — *deferred: requires story picker in /live (separate feature)*
- [ ] Update session end to display calibration — *deferred: requires verification recording*
- [x] Update tests to use real services
- [x] Document API in technical docs

## Testing Strategy

### Unit Tests
- Service functions with mocked Supabase client
- RLS policy verification queries

### Integration Tests
- Create story → verify version created
- Update story → verify new version created
- Link points → verify positions
- Record verification → check ears_count incremented (incremental, not COUNT(*))
- Position change → verify history logged

### E2E Tests
- Verified user creates story with points
- Users take positions on point
- /live session records verification with version_id

## Dependencies

- Supabase migration applied
- Profile linking in /live (session → profile_id)
- Unverified user flow (separate feature for UI prompts)

## Resolved Questions

1. **Calibration calculation**: Compute on-read via `AVG()` query. No batch job needed — query is fast (<100ms even with hundreds of verifications).

2. **Position reasoning**: Per-position only. Threaded discussions are a social feature we don't need yet.

3. **Story editing**: Authors can edit after verifications. Verifications reference specific version_id, so users can always "view what was verified."

## Success Metrics

- Stories/points creation works for verified users
- Position changes logged with full history
- /live verifications increment ears_count (incremental trigger)
- Story versions created automatically on create/update
- Verifications link to specific version
- Profile calibration computed on-read displays correctly
- No regression in existing mock UI

## Prep Notes

From prep-spec review:

**UX notes:**
- Unverified users need UI guidance before RLS rejection (handled by unverified user flow feature)
- New users with 0 ears need graceful empty state
- 8/10 threshold should be visible during rating ("8+ = verified understanding")

**Architect notes:**
- Triggers use incremental updates (O(1) not O(N))
- Calibration averages computed on-read, not stored
- Story versions table avoids content duplication in verifications
