# P85: Event Verification Flow

**Status:** Planning
**Created:** 2026-01-23
**Updated:** 2026-01-23
**Priority:** High — Required for H2 test (30-person event)
**Supersedes:** p84_verify_with_author.md (archived), p91_navigation_ia.md (merged)

---

## Goal

Enable the H2 hypothesis test: Run a 30-person event where verification visibility changes behavior. This requires:
1. Event page with outcomes visibility (who verified, calibration leaderboard)
2. Card selection inside /live (not a separate "feed")
3. Verification flow (select content → /live → rate → log position shift)
4. Calibration display that creates FOMO (H0b)

---

## Key Insight: No Feed Needed

At physical events, people match in person — they walk up and talk. Digital "feed" for partner discovery is unnecessary.

What matters:
- **Card selection** happens inside /live (browse your cards + partner's cards)
- **Event page** shows outcomes (who's calibrated, verification count)
- **Visibility** creates social proof and FOMO

---

## Event Page Structure

**Single page, no tabs:** `/event/:id`

```
┌─────────────────────────────────────────────┐
│ 🥾 Clarity Hike: Golden Gate               │
│ Jan 20, 2026 • San Francisco               │
│                                             │
│ [Event description - keep current design]   │
│                                             │
│ Host: @maria_k                              │
│                                             │
├─────────────────────────────────────────────┤
│ PARTICIPANTS (12)                           │
│                                             │
│ 👂 12  Maria K.        [Start /live]        │
│ 👂 8   John D.         [Start /live]        │
│ 👂 6   Carol C.        [Start /live]        │
│ 👂 3   You             [Invite to verify]   │
│ 👂 --  New Person      [Start /live]        │
│                                             │
├─────────────────────────────────────────────┤
│ EVENT OUTCOMES                              │
│                                             │
│ 8 verifications completed                   │
│ Avg understanding: 7.2/10                   │
│                                             │
│ [Join this event]  ← CTA for non-members    │
└─────────────────────────────────────────────┘
```

### What Each Section Shows

| Section | Content | Purpose |
|---------|---------|---------|
| **Header** | Event name, date, location, host | Context |
| **Description** | Event details (keep current design) | Why attend |
| **Participants** | List with ears (👂) count + /live CTA | See who's calibrated, start session |
| **Outcomes** | Verification count, avg score | Social proof, H2 visibility |

### Ears (👂) Display

Ears = calibration reputation. Shows on participant list:
- `👂 12` = verified understanding with 12 people
- `👂 --` = no verifications yet (new user)

Tap participant → opens their profile (see their Stories/Points there)

---

## Card Selection: Inside /live

"Feed" was the wrong mental model. It's actually **card selection for verification**.

### Where Card Selection Happens

| Context | What You See |
|---------|--------------|
| **Inside /live** | Your cards + Partner's cards — select what to verify |
| **On profile** | Someone's Stories/Points — browse before /live |
| **NOT on event page** | Event page shows outcomes, not content to browse |

### Card Selection UI (inside /live)

```
┌─────────────────────────────────────────────┐
│ /live with Carol                            │
│                                             │
│ SELECT CONTENT TO VERIFY                    │
│                                             │
│ [Your Stories]  [Carol's Stories]  ← tabs   │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 📖 "I burned out commuting 2 hours..."  │ │
│ │    → 3 Points linked                    │ │
│ │                            [Select]     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 📖 "My experience with remote work..."  │ │
│ │    → 1 Point linked                     │ │
│ │                            [Select]     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

### Card Design (Simplified)

```
┌─────────────────────────────────────────┐
│ 📖 "Story text preview..."              │
│    → 3 Points linked                    │  ← collapsed, not expanded
│                            [Select]     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 📍 "Point text preview..."              │
│    → 2 Stories linked                   │  ← collapsed, not expanded
│                            [Select]     │
└─────────────────────────────────────────┘
```

- **Collapsed by default** — "has X linked" not full expansion
- **Select action** — brings into current /live session
- **Same component** used on profiles and inside /live

---

## Verification Flow

### Entry Points

| From | Action | Flow |
|------|--------|------|
| **Event participant list** | Tap "Start /live" | Enter session → select content |
| **Profile** | Tap "Verify with [name]" | Enter session → select content |
| **Inside /live** | Select card | Begin explain-back on that Story |

### Primary Flow (Physical Event)

```
1. At event, walk up to Carol
2. Both open app, one taps "Start /live with Carol"
3. In /live: browse each other's cards
4. Select Carol's Story to verify
5. You explain back → Carol rates (0-10)
6. If ≥8/10 → "Verified" ✓
7. Stance prompt (position on linked Points)
8. "Verify another?" or end session
```

### Session Link/QR (for starting)

```
Start /live with Carol:

[Show QR]  [Copy link]

Carol scans QR or clicks link → both enter session
```

- Works in-person (QR) and remote (link)
- No presence system needed
- 24hr TTL on links

---

## Post-Verification: Stance Prompt

After verification completes, **both people** see:

```
✓ Verification complete! Carol rated 9/10.

This Story relates to these Points:

📍 "Remote work increases productivity"
   Your current stance: Disagree (-2)
   [Update stance]  [Keep]

📍 "Work-life balance matters more than salary"
   Your current stance: Strongly Agree (+3)
   [Update stance]  [Keep]

[Done]
```

**Why this matters:**
- Captures position change at moment of understanding
- Data for H-Core (asymmetric conversion tracking)
- Both prompted = symmetric data collection

---

## Event Outcomes Section

The key H2 visibility feature — what happened at this event.

### Basic Display

```
EVENT OUTCOMES

8 verifications completed
Avg understanding score: 7.2/10

TOP CALIBRATED (this event)
👂 12  Maria K.
👂 8   John D.
👂 6   You
```

### Future Enhancement: Impact Score

Once we have enough data, add simplified P90:

```
STRONGEST CONTENT (this event)

📍 "Remote work improves wellbeing" ⚡ 72
   3 position shifts after verification

📖 "My burnout story" ⚡ 64
   Changed 2 people's minds
```

---

## Data Model

### VerificationEvent (logs each verification)

```typescript
interface VerificationEvent {
  id: string;
  sessionId: string;           // /live session

  // Who
  verifierId: string;          // Who explained back
  authorId: string;            // Whose Story was verified

  // What
  storyId: string;             // Which Story
  pointIds: string[];          // Linked Points (for stance prompt)

  // Scores
  understandingScore: number;  // 0-10, from author

  // Position tracking (for H-Core)
  positionsBefore: Record<string, number>;  // pointId → position (-3 to +3)
  positionsAfter: Record<string, number>;   // after stance prompt

  // Context
  eventId: string | null;      // If at an event
  timestamp: Date;
}
```

### Computed: Event Outcomes

```typescript
interface EventOutcomes {
  eventId: string;

  verificationCount: number;
  avgUnderstandingScore: number;

  // Leaderboard
  participantEars: Array<{
    userId: string;
    ears: number;  // verifications at this event
  }>;

  // Future: Impact scores
  topContent?: Array<{
    contentId: string;
    contentType: 'story' | 'point';
    impactScore: number;
  }>;
}
```

---

## Key Decisions Summary

| Decision | Answer | Rationale |
|----------|--------|-----------|
| Event page tabs | **No tabs** | Single page with info + outcomes |
| Feed on event page | **No** | Card selection happens inside /live |
| Partner discovery | **In person** | Physical events don't need digital matching |
| Card selection location | **Inside /live** | Same UI for your cards + partner's cards |
| Card display | **Collapsed** | "has X linked" not full expansion |
| Event outcomes | **Leaderboard + counts** | Creates H2 visibility + H0b FOMO |
| Ears display | **On participant list** | Shows calibration at glance |

---

## What's NOT in Scope

| Feature | Why Deferred |
|---------|--------------|
| Feed tab on events | Physical events don't need it |
| Horizontal attendee filter | Not needed without feed |
| Content discovery on event page | Browse profiles instead |
| Presence system | Link/QR sufficient for MVP |
| Notifications | Manual coordination for physical events |
| AI Sifter | After verification flow works |

---

## Dependencies

- [x] /live session flow (exists)
- [x] Event page (exists, needs outcomes section)
- [ ] Card selection UI inside /live
- [ ] Simplified card component (collapsed linked content)
- [ ] Stance prompt after verification
- [ ] VerificationEvent logging
- [ ] Event outcomes calculation + display
- [ ] Ears count on participant list

---

## Acceptance Criteria

1. Event page shows single view (no tabs): info + participants + outcomes
2. Participants list shows ears (👂) count for each person
3. "Start /live" button on each participant
4. Inside /live: can browse your cards + partner's cards
5. Cards show "X linked" collapsed (not full expansion)
6. Selecting card starts explain-back flow
7. After verification (≥8/10), stance prompt appears for linked Points
8. Position changes logged in VerificationEvent
9. Event outcomes section shows verification count + leaderboard
10. Leaderboard ordered by ears at this event

---

## Navigation & Information Architecture

### Global Navigation

| Item | Label | Notes |
|------|-------|-------|
| Home | **Events** | Not "My Events", not "Dashboard" |
| Profile | **Profile** | Not "My Profile" |

### Information Architecture

```
Events (home)
├── Event List
│   └── Event Card → tap to open
│
└── Event Detail `/event/:id`
    ├── Header (name, date, location, host)
    ├── Description
    ├── Participants (with ears, /live CTA)
    └── Outcomes (verification count, leaderboard)

Profile `/p/:slug`
├── Stories (with verification counts)
├── Points (with positions)
├── Calibration banner
└── Verification history

/live `/live/:sessionId`
├── Card selection (your cards / partner's cards)
├── Explain-back flow
├── Stance prompt
└── "Verify another?" prompt
```

### Naming Rules

- ❌ No "Dashboard" anywhere
- ❌ No "My Events" (just "Events")
- ❌ No "My Profile" (just "Profile")
- ❌ No "Feed" on event page
- ✅ Simple, direct labels

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-23 | **Major revision:** Removed tabs, moved card selection to inside /live, added event outcomes focus, simplified for physical events. Key insight: at physical events people match in person — no "feed" needed on event page. |
| 2026-01-23 | Created from design session. Supersedes p84, p91 (navigation). |
