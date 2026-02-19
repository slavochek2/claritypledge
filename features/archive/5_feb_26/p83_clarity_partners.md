---
status: all-done
type: comment
tags: []
rank: 125413.0
created_date: 2026-01-21
completed_at: '2026-02-09'
---

# P83: Clarity Partners — Relationship Tiers Before Meetings

**Status:** Planning
**Created:** 2026-01-21
**Priority:** Medium — UX improvement for pre-meeting connection
**Depends on:** P64 (Meeting Requests)

---

## One-Sentence Description

Before starting a Clarity Meeting, users declare their relationship tier — Unknown, Known, or Clarity Partner — and can upgrade it after successful verification.

---

## Problem Statement

**Current state:** Clarity Meetings happen in a vacuum. Two people meet, verify understanding, but there's no relationship context or progression.

**Missing:**
1. **Pre-meeting context** — Are we strangers? Colleagues? Close friends?
2. **Relationship progression** — No way to track how relationships evolve through verification
3. **Social incentive** — No visible reward for building understanding with someone over time

**The opportunity:** Relationships should have tiers that upgrade through successful Clarity sessions, creating a visible "understanding ladder."

---

## Solution

### Three Relationship Tiers

| Tier | Icon | Meaning | How you get there |
|------|------|---------|-------------------|
| **Unknown** | 👤 | Never met or interacted | Default for all new connections |
| **Known** | 🤝 | We've interacted before | Self-declared at meeting start |
| **Clarity Partner** | ⚡ | Verified mutual understanding | Earned through successful Clarity session |

### Pre-Meeting Connection Flow

Before starting a Clarity Meeting, both users must:
1. Acknowledge who they're meeting with
2. Declare their current relationship tier
3. (Optional) Request upgrade after successful session

---

## User Stories

### As a meeting initiator
- I want to see my relationship tier with someone before inviting them
- I want to declare "I know this person" if we've met before
- I want to earn "Clarity Partner" status through verified understanding

### As a meeting recipient
- I want to see who's inviting me and our relationship tier
- I want to confirm/correct the relationship tier
- I want to see my Clarity Partners on my profile

### As a profile visitor
- I want to see someone's Clarity Partners (mutual understanding relationships)
- I want to see my shared Clarity Partners with this person
- I want to understand how to become someone's Clarity Partner

---

## Design

### Pre-Meeting Connection Screen

When User A invites User B to a Clarity Meeting:

```
┌────────────────────────────────────────────────────────────────────┐
│                    Connect with Sarah                              │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │     👤 Sarah Chen                                             │ │
│  │     Product Designer at Acme                                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  How do you know each other?                                       │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  👤  We don't know each other                      ○        │   │
│  │      First time connecting                                  │   │
│  └────────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  🤝  We know each other                            ○        │   │
│  │      Met before, colleagues, friends                        │   │
│  └────────────────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  ⚡  Clarity Partners                               ●        │   │
│  │      Verified mutual understanding (2 sessions)             │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  [Start Meeting]                                                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Rules:**
- "Clarity Partners" option only shown if already earned
- Highest tier is pre-selected if relationship exists
- Both users confirm independently

### Post-Meeting Upgrade Prompt

After a successful Clarity session (understanding gap < 3):

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│                        🎉 Great session!                           │
│                                                                    │
│     You and Sarah understand each other well.                      │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │            Upgrade to Clarity Partners?                       │ │
│  │                                                               │ │
│  │  ⚡ Clarity Partners can:                                     │ │
│  │  • Appear on each other's profiles                            │ │
│  │  • See shared insights                                        │ │
│  │  • Get priority meeting requests                              │ │
│  │                                                               │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  [Become Clarity Partners]         [Maybe later]                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Rules:**
- Both must accept for upgrade to happen
- If only one accepts: "Waiting for Sarah to confirm"
- If declined: "Sarah declined for now" (no hard feelings messaging)

### Profile — Clarity Partners Section

On user profiles, show Clarity Partners:

```
┌────────────────────────────────────────────────────────────────────┐
│  ⚡ Clarity Partners (4)                                           │
│                                                                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                              │
│  │ 👤   │ │ 👤   │ │ 👤   │ │ 👤   │                              │
│  │Sarah │ │Marcus│ │Elena │ │Alex  │                              │
│  │ 3⚡  │ │ 2⚡  │ │ 1⚡  │ │ 1⚡  │                              │
│  └──────┘ └──────┘ └──────┘ └──────┘                              │
│                                                                    │
│  [View all]                                                        │
└────────────────────────────────────────────────────────────────────┘
```

**The number (e.g., 3⚡)** = successful Clarity sessions together

### Relationship Badge on Cards

Anywhere a user card appears, show relationship tier:

```
┌────────────────────────────────────────────────────────────────────┐
│  👤 Sarah Chen                              ⚡ Clarity Partner     │
│  Product Designer at Acme                                          │
│                                                                    │
│  [Request Meeting]                                                 │
└────────────────────────────────────────────────────────────────────┘
```

---

## Relationship State Machine

```
                 ┌─────────────┐
                 │   UNKNOWN   │ ← Default
                 └──────┬──────┘
                        │
                        │ User declares "We know each other"
                        │ (self-reported, no verification)
                        ▼
                 ┌─────────────┐
                 │    KNOWN    │
                 └──────┬──────┘
                        │
                        │ Successful Clarity session
                        │ + Both accept upgrade
                        ▼
                 ┌─────────────────────┐
                 │  CLARITY PARTNER    │
                 │  (sessions: N)      │
                 └─────────────────────┘
                        │
                        │ More sessions → increment count
                        │ (never downgrades automatically)
```

**Downgrade scenarios (future):**
- User can manually "disconnect" a Clarity Partner
- Reported misunderstanding could trigger review

---

## Technical Notes

### Database Schema

```sql
-- Relationship between two users
CREATE TABLE user_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a_id UUID NOT NULL REFERENCES profiles(id),
  user_b_id UUID NOT NULL REFERENCES profiles(id),

  -- Tier: 'unknown' | 'known' | 'clarity_partner'
  tier TEXT NOT NULL DEFAULT 'unknown' CHECK (tier IN ('unknown', 'known', 'clarity_partner')),

  -- For Clarity Partners: how many successful sessions
  clarity_sessions_count INTEGER NOT NULL DEFAULT 0,

  -- When they became Clarity Partners
  clarity_partner_since TIMESTAMPTZ,

  -- Pending upgrade (both must accept)
  pending_upgrade_from TEXT,  -- user_id who proposed upgrade
  pending_upgrade_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure unique pair (user_a < user_b for consistency)
  CONSTRAINT user_relationship_pair UNIQUE(user_a_id, user_b_id),
  CONSTRAINT user_relationship_order CHECK (user_a_id < user_b_id)
);

-- Index for efficient lookups
CREATE INDEX idx_user_relationships_user_a ON user_relationships(user_a_id);
CREATE INDEX idx_user_relationships_user_b ON user_relationships(user_b_id);
CREATE INDEX idx_user_relationships_clarity_partners ON user_relationships(user_a_id, user_b_id)
  WHERE tier = 'clarity_partner';
```

### RLS Policies

```sql
-- Users can view relationships they're part of
CREATE POLICY "Users can view their relationships"
  ON user_relationships FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Users can update relationships they're part of
CREATE POLICY "Users can update their relationships"
  ON user_relationships FOR UPDATE
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Users can create relationships they're part of
CREATE POLICY "Users can create their relationships"
  ON user_relationships FOR INSERT
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);
```

### Helper Functions

```typescript
interface RelationshipService {
  // Get relationship between two users
  getRelationship(userAId: string, userBId: string): Promise<UserRelationship | null>;

  // Declare "we know each other"
  declareKnown(userId: string, otherUserId: string): Promise<UserRelationship>;

  // Propose upgrade to Clarity Partner (after successful session)
  proposeUpgrade(userId: string, otherUserId: string): Promise<UserRelationship>;

  // Accept upgrade proposal
  acceptUpgrade(userId: string, otherUserId: string): Promise<UserRelationship>;

  // Decline upgrade proposal
  declineUpgrade(userId: string, otherUserId: string): Promise<void>;

  // Increment session count (called after each successful session)
  incrementSessionCount(userAId: string, userBId: string): Promise<void>;

  // Get all Clarity Partners for a user
  getClarityPartners(userId: string): Promise<ClarityPartner[]>;

  // Get mutual Clarity Partners between two users
  getMutualPartners(userAId: string, userBId: string): Promise<ClarityPartner[]>;
}

interface UserRelationship {
  id: string;
  userAId: string;
  userBId: string;
  tier: 'unknown' | 'known' | 'clarity_partner';
  claritySessionsCount: number;
  clarityPartnerSince?: string;
  pendingUpgradeFrom?: string;
  pendingUpgradeAt?: string;
}

interface ClarityPartner {
  userId: string;
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  slug: string;
  claritySessionsCount: number;
  clarityPartnerSince: string;
}
```

### Integration with /live

In `live-mode-view.tsx`, before starting a session:

```typescript
// 1. Check existing relationship
const relationship = await getRelationship(currentUser.id, partnerId);

// 2. Show pre-meeting connection screen
// (user confirms/declares relationship tier)

// 3. After successful session (gap < 3):
if (relationship?.tier !== 'clarity_partner') {
  // Show upgrade prompt
  await proposeUpgrade(currentUser.id, partnerId);
}

// 4. If already partners:
await incrementSessionCount(currentUser.id, partnerId);
```

### New Files

| File | Purpose |
|------|---------|
| `src/app/components/partners/connect-before-meeting.tsx` | Pre-meeting connection screen |
| `src/app/components/partners/upgrade-prompt.tsx` | Post-meeting upgrade dialog |
| `src/app/components/profile/clarity-partners-section.tsx` | Profile section for partners |
| `src/app/components/shared/relationship-badge.tsx` | Badge showing tier on user cards |
| `src/app/data/relationships.ts` | Relationship API calls |
| `src/hooks/use-relationship.ts` | Hook for relationship state |
| `supabase/migrations/xxx_user_relationships.sql` | DB schema |

### Modified Files

| File | Change |
|------|--------|
| `src/app/components/partners/live-mode-view.tsx` | Add pre-meeting flow, post-meeting upgrade |
| `src/app/prototypes/linkedin-like/components/Profile.tsx` | Add Clarity Partners section |
| Dashboard people cards | Add relationship badge |
| Event attendee cards | Add relationship badge |

---

## Phases

### Phase 1: Database + Basic API
- [ ] Create `user_relationships` table with RLS
- [ ] Implement `RelationshipService` (get, declare known, propose/accept upgrade)
- [ ] Helper function for consistent user_a/user_b ordering

### Phase 2: Pre-Meeting Connection Screen
- [ ] Create `ConnectBeforeMeeting` component
- [ ] Show in /live flow before session starts
- [ ] Store selected relationship tier

### Phase 3: Post-Meeting Upgrade Flow
- [ ] Create `UpgradePrompt` component
- [ ] Show after successful session (gap < 3)
- [ ] Handle pending state (waiting for other user)
- [ ] Real-time update when other user responds

### Phase 4: Profile Integration
- [ ] Create `ClarityPartnersSection` for profiles
- [ ] Show session count badges
- [ ] "View all" page for full partner list

### Phase 5: Badges Everywhere
- [ ] Create `RelationshipBadge` component
- [ ] Add to user cards across the app
- [ ] Show mutual partners on profile visits

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| User A says "known", User B says "unknown" | Go with lower tier (unknown) — both must agree |
| Upgrade proposed but session ends | Proposal persists, can be accepted later |
| Multiple sessions same day | Only count as 1 session for upgrade threshold |
| User removes Clarity Partner | Downgrade to "known" (not unknown) |
| One user deletes account | Remove from other user's partner list |

---

## Success Metrics

- **Clarity Partner conversion rate** — % of sessions that result in partnership
- **Partner session frequency** — Do partners meet more often?
- **Profile completeness** — Users with 1+ Clarity Partners vs none
- **Relationship progression** — Average time from first meeting to Clarity Partner

---

## Out of Scope (Future)

- Partner recommendations ("People you might want to verify with")
- Relationship health score (based on session frequency)
- "Clarity Circle" — groups of mutual partners
- Breaking/blocking partners
- Public vs private partner lists

---

## Open Questions

1. **Threshold for Clarity Partner:** 1 successful session enough? Or require 2-3?
2. **What's "successful"?** Gap < 3? Or any completed session?
3. **Visibility:** Should partner count be public? Or just to partners?
4. **Symmetry:** Does User A saying "known" auto-set it for User B?

---

## References

- LinkedIn connections (but earned, not requested)
- Duolingo streaks (visible commitment indicator)
- P64 (Meeting Requests) — Partner tier could affect request visibility

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-21 | Initial spec created from user concept |
