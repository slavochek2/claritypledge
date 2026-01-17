# P14: Clarity Partners & Network Effects

## Summary

Solve the "What Now?" problem after signing by introducing **Clarity Partners** — people who commit to practice paraphrasing with each other. This drives Frequency (how often) and viral growth (Number of People) in the North Star metric.

This feature also addresses the **current endorsement flow blind spots** that create confusion and dead ends.

**Status:** Problem defined, solution needs design work.

## Problem Statement

### Problem A: "What Now?" After Signing

**Current State:**
- User signs pledge → lands on profile → doesn't know what to do next
- No clear next action after signing
- No mechanism to practice paraphrasing with someone
- Witnesses/endorsers are one-time actions, not ongoing relationships

### Problem B: Endorsement Flow Blind Spots

**Current State:**
1. **Post-endorsement confusion:**
   - Logged-in users who already have a pledge see "Take My Own Pledge" button after endorsing — redundant and confusing
   - No clear confirmation of what just happened
   - Dead end after endorsing

2. **Witness distinction missing:**
   - All witnesses look the same
   - Can't tell which witnesses are fellow pledgers ("Clarity Champions")
   - No links to pledger profiles
   - `witness_profile_id` field exists in DB but is unused

### Why These Are Connected

The endorsement action IS the entry point for becoming Clarity Partners:

```
Current (broken):
Visitor endorses → confusing UI → dead end

Desired:
Visitor endorses → clear confirmation → path to become Clarity Partners
```

**Impact on North Star (Time × Frequency × Number of People):**
- Without clear next steps, Frequency = 0 (no practice happens)
- Without invite mechanism, Number of People grows only through manual outreach
- Broken endorsement flow = missed conversion opportunities

## Priority

**HIGH** — Second most important after Comprehension (P1).

Comprehension enables the behavior. Network Effects scales the behavior.

## Core Insight: Why Would Someone Want a Clarity Partner?

The pledge text says: *"We all crave being understood."*

**The value proposition is asymmetric:**
- When I sign the pledge, I'm promising to paraphrase YOUR ideas
- But what do I GET? → Someone who will paraphrase MY ideas

**A Clarity Partner is someone who:**
1. Has also signed the pledge
2. Commits to practice with me specifically
3. Will paraphrase my ideas when I ask
4. I will paraphrase their ideas when they ask

**The benefit to ME:** Finally, someone who will actually try to understand what I mean.

## Witness vs Clarity Partner

| Aspect | Witness | Clarity Partner |
|--------|---------|-----------------|
| **Action** | One-time endorsement | Ongoing commitment |
| **Relationship** | "I vouch for you" | "We practice together" |
| **Direction** | One-way (witness → pledger) | Two-way (mutual) |
| **Pledge required?** | No (can be non-pledger) | Yes (both must be pledgers) |
| **Value** | Social proof | Actual practice |

## Solutions

### Fix B1: Context-Aware Post-Endorsement State

After someone endorses a pledge, show different UI based on their state:

| User State | What They See |
|------------|---------------|
| **Logged in + has pledge** | "You accepted [Name]'s promise. You're now holding them accountable." + subtle "View your pledge" link. NO "Take My Own Pledge" button. |
| **Logged in + no pledge** | "You accepted [Name]'s promise. Take your own pledge to become Clarity Partners." + CTA |
| **Anonymous** | "You accepted [Name]'s promise." + "Take Your Own Pledge" CTA to drive conversion |

### Fix B2: Witness Distinction & Discovery

Make it clear which witnesses are fellow pledgers:

1. **Data:** Populate `witness_profile_id` field when endorser has a profile
2. **Badge:** Add Clarity Logo Mark badge to avatars of witnesses who are pledgers
3. **Sorting:** Display pledger-witnesses at top of list
4. **Linking:**
   - Pledgers → link to their profile (`/p/slug`)
   - Non-pledgers → link to LinkedIn (if available)

### Solution A: Clarity Partners System

(See detailed flow below)

## User Flow (Proposed)

### After Comprehension Check

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ✓ You understand the pledge!                          │
│                                                         │
│  Now let's put it into practice.                       │
│                                                         │
│  The pledge works best when you have someone           │
│  to practice with — a Clarity Partner.                 │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Invite a Clarity Partner                        │   │
│  │                                                  │   │
│  │  Send this to someone you want to practice      │   │
│  │  paraphrasing with:                             │   │
│  │                                                  │   │
│  │  [Copy invite link]  [Share on LinkedIn]        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [ Skip for now → Go to my profile ]                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Invite Flow

1. **Existing pledger** completes comprehension check
2. Sees "Invite a Clarity Partner" prompt
3. Shares personalized link: `understandingpledge.com/partner/[slug]`
4. **New person** clicks link → sees invitation + pledge signup
5. New person signs pledge → becomes Clarity Partner with inviter
6. Both are now linked as partners

### On Profile Page

```
┌─────────────────────────────────────────────────────────┐
│  My Clarity Partners (2)                               │
│                                                         │
│  👤 Sarah Chen                                         │
│     Partner since Dec 10, 2024                         │
│     [Practice now] [View profile]                      │
│                                                         │
│  👤 Marcus Williams                                    │
│     Partner since Dec 8, 2024                          │
│     [Practice now] [View profile]                      │
│                                                         │
│  [+ Invite another partner]                            │
└─────────────────────────────────────────────────────────┘
```

## Data Model (Proposed)

### clarity_partners

```sql
- id (uuid)
- user_a_id (uuid, FK to profiles)
- user_b_id (uuid, FK to profiles)
- created_at (timestamp)
- created_by (uuid) — who initiated
- status ('pending' | 'active' | 'declined')
```

**Note:** Partnership is mutual — if A invites B and B accepts, both are partners. Only one row needed (not two).

### partner_invites

```sql
- id (uuid)
- inviter_id (uuid, FK to profiles)
- invite_code (text, unique) — for the link
- created_at (timestamp)
- accepted_by (uuid, nullable) — filled when someone accepts
- accepted_at (timestamp, nullable)
```

## Open Questions

1. **Can you have multiple Clarity Partners?** (Probably yes — more practice = better)
2. **What does "Practice now" do?** (Link to video call? In-app prompts? Just a reminder?)
3. **Can you remove a partner?** (Probably yes — relationships change)
4. **Do partners see each other's comprehension check results?** (Privacy consideration)
5. **Is partner relationship public or private?** (On profile or hidden?)

## Success Metrics

- **Partner invite rate:** % of users who invite at least one partner after comprehension check
- **Partner conversion rate:** % of invites that result in new signups
- **Partner retention:** Do partners stay engaged longer than solo pledgers?
- **Viral coefficient:** Average partners invited per user

## Relationship to Other Features

```
P1: Comprehension (p12) → User understands the pledge
        ↓
P3: Clarity Partners (p14) → User has someone to practice with
        ↓
P4: Verification (p13) → Can verify practice actually happened
```

## Implementation Priority

This is HIGH priority but depends on P1 (Comprehension) being built first.

### Phase 1: Fix Blind Spots (Quick Wins)

These can be built independently of Comprehension Check:

1. **Fix post-endorsement UI** — context-aware state (Fix B1)
2. **Populate witness_profile_id** — link endorsers to their profiles
3. **Add pledger badge to witnesses** — visual distinction (Fix B2)
4. **Make witness names clickable** — link to profiles or LinkedIn

### Phase 2: "What Now?" Prompt

After Comprehension Check is built:

1. Add "What now?" screen after comprehension check completion
2. Simple invite link sharing (no partner tracking yet)
3. Track invite clicks as early metric

### Phase 3: Full Partner System

Once we have data on invite behavior:

1. Build partner tracking (clarity_partners table)
2. Add partner management UI on profile
3. Partner invite acceptance flow

## Related Documents

- [p12_onboarding-comprehension-check.md](./p12_onboarding-comprehension-check.md) — Comprehension check MVP
- [p13_future-ideas-meme-platform.md](./p13_future-ideas-meme-platform.md) — Future verification vision
- [p15_admin-dashboard.md](./p15_admin-dashboard.md) — Admin visibility (separate feature)
