Onboarding Comprehension Check

## Summary

Build an "Ideas" system that allows users to engage with statements via Agree/Don't Know/Disagree + comments. MVP focuses on a comprehension check for pledge mechanics to verify new signers understand what they signed.

## Problem Statement

**Current State:**
- Users sign the Understanding Pledge but don't understand the mechanics
- When asked what the pledge means, they have misconceptions (e.g., thinking it's about "honesty")
- Users land on their profile after signing and don't know what to do next
- Manual explanation to each user doesn't scale

**Observed Misconceptions:**
- Thinking pledge is about being honest (it's about verifying understanding)
- Not knowing how the pledge is triggered (any paraphrase request)
- Not knowing how to break it (only by walking away without explaining)
- Not understanding the "backdoor" (can always explain why you can't follow right now)

## Goal

50 users in 30 days, 25% bring 1-2 new pledgers themselves.

## North Star Metric

**Total time spent paraphrasing** = Time × Frequency × Number of People

This metric captures the core behavior we're trying to encourage. All problems are ranked by their impact on this formula.

## Problem Ranking (by Impact on North Star)

| Priority | Problem | Impact | Rationale |
|----------|---------|--------|-----------|
| **CRITICAL** | P1: Comprehension | Enables behavior to exist | You cannot practice what you don't understand. Without comprehension, Time = 0 because users won't even attempt paraphrasing. This is the necessary condition for anything else to work. |
| **HIGH** | P3: Network Effects ("What now?") | Drives Frequency + Viral Growth | After signing, users need to know what to do next. This drives both how often they practice (Frequency) and whether they invite others (Number of People). The endorsement flow creates "Clarity Partners" who practice together. |
| **MEDIUM** | P4: Verification | Drives Quality + Depth | Knowing whether paraphrasing actually happened increases Time per session (deeper conversations) and Frequency (positive reinforcement). This is a "Level 2" problem — enhances behavior that's already happening. |
| **LOW** | P2: Dashboard | Internal tooling | Admin visibility helps prioritize follow-ups but doesn't directly cause users to paraphrase. Build this for operational efficiency, not user impact. |

### Why This Order Matters

```
Comprehension (P1) → enables the behavior
Network Effects (P3) → scales the behavior
Verification (P4) → deepens the behavior
Dashboard (P2) → monitors the behavior
```

Fixing P1 is the prerequisite. Without it, P3/P4 optimizations have nothing to scale or deepen.

## MVP Scope

### What We Build

1. **Idea Card Component**
   - Statement text
   - Three buttons: Agree / Don't Know / Disagree (Don't Know in middle)
   - Comment input (expandable)
   - Reaction counts with social proof

2. **7 Pledge Mechanics Statements**
   - Pre-defined content for comprehension check
   - Stored as a "list" of ideas

3. **Comprehension Check Flow**
   - User sees 7 cards, responds to each
   - Results saved to their profile
   - After completion → hand off to "What Now?" (see [p14](./p14_clarity-partners-network-effects.md))

**Note:** Admin Dashboard is a separate feature — see [p15](./p15_admin-dashboard.md).

### What We Defer

- Understanding certification (peer-to-peer verification) → see p13
- Cross-disagreement highlighting
- PageRank-style reputation scoring
- Custom idea/list creation by users
- AI verification of understanding
- Cohort-based facilitated sessions

## The 7 Mechanics Statements

1. "The pledge is triggered when someone asks me to explain back or paraphrase their idea — in any words, not a specific phrase."

2. "Only someone I'm currently in live conversation with can trigger my pledge — not via email, social media, or if we're not actively speaking."

3. "Following the pledge means I try to explain back without judgment — my intention matters more than getting it perfect."

4. "The only way to break the pledge is to walk away without explaining why when someone makes a valid trigger."

5. "I can always say 'I can't follow my pledge right now because [reason]' — this keeps me in good standing."

6. "The pledge is NOT about being honest or always agreeing — it's specifically about verifying I understood someone's idea the way they meant it."

7. "When others accept my pledge, they're saying they value being understood and want to hold me accountable to this promise."

## UI/UX Design

### Idea Card Component

```
┌─────────────────────────────────────────────────────────┐
│ "The pledge is triggered when someone asks you to       │
│  mirror back their idea — in any words."                │
│                                                         │
│ ┌─────────┐  ┌───────────┐  ┌──────────┐               │
│ │ ✓ Agree │  │ ? Don't   │  │ ✗ Disagree│              │
│ │         │  │   Know    │  │          │               │
│ └─────────┘  └───────────┘  └──────────┘               │
│                                                         │
│ [💬 Add comment...]                                     │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│ ✓ 12    ? 2    ✗ 3    💬 5                              │
│ "Agreed by Sarah T. and 11 others"                      │
└─────────────────────────────────────────────────────────┘
```

### Button States
- Default: Outline style
- Selected: Filled with color (green for agree, gray for don't know, red for disagree)
- Hover: Subtle highlight

### Interactions
- Click button to select (radio behavior — only one selection)
- Click "Add comment" to expand text input
- Click counts to see who reacted (modal)

## Data Model

### Tables Needed

**ideas**
- id (uuid)
- statement (text)
- list_id (uuid, nullable) — for grouping into lists
- created_at
- created_by (uuid, nullable) — null for system-created

**idea_reactions**
- id (uuid)
- idea_id (uuid)
- user_id (uuid)
- reaction ('agree' | 'dont_know' | 'disagree')
- comment (text, nullable)
- created_at
- updated_at

**idea_lists**
- id (uuid)
- name (text)
- description (text, nullable)
- is_system (boolean) — true for "Pledge Mechanics" list
- created_at

## Technical Implementation

### Files to Create

- `src/app/components/ideas/idea-card.tsx` — The card component
- `src/app/components/ideas/idea-list.tsx` — List of cards
- `src/app/pages/comprehension-check.tsx` — The check flow
- `src/app/content/pledge-mechanics.ts` — The 7 statements
- `src/app/data/ideas-api.ts` — API functions for ideas
- `supabase/migrations/xxx_create_ideas_tables.sql`

### Routes

- `/comprehension-check` — The check flow

### Design System

Use existing patterns:
- Colors: Primary blue (#0044CC), cream (#FDFBF7), dark (#1A1A1A)
- Components: Button, Card from shadcn/ui
- Styling: Tailwind CSS

## Open Questions

1. Where does comprehension check live? (New route? Dashboard? Post-signup redirect?)
2. Required or optional for new signers?
3. What happens after completion? (Redirect? Prompt? Email?)
4. How do we handle disagreement? (Show explanation? Ask for comment? Follow up manually?)

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Defer understanding certification | Complex UI, sparse data with 50 users |
| Use "Don't Know" not "Unsure" | Clearer language |
| Don't Know in middle | Natural ordering (Agree / neutral / Disagree) |
| Start with admin-only dashboard | Need visibility; users don't need complex views yet |
| Keep pledge system separate from ideas | Accountability vs. comprehension are different concerns |

## Implementation Steps

1. Create Idea Card component with mock data
2. Test locally at `/comprehension-check`
3. Add database tables
4. Wire up API
5. Deploy and test with real users
6. Build admin dashboard (separate feature — see [p15](./p15_admin-dashboard.md))

## Related Problems

### P3: Network Effects ("What Now?")

After comprehension check, users need clear next steps. The endorsement flow creates network effects:

1. **Witness vs Clarity Partner distinction:**
   - Witness = someone who endorses your pledge (one-time action)
   - Clarity Partner = someone you practice paraphrasing with (ongoing relationship)

2. **Post-signup flow:**
   - Complete comprehension check → Show "What Now?" prompt
   - Suggest: "Invite someone to be your Clarity Partner"
   - Partner receives invite → signs pledge → both practice together

3. **Why this matters:** Comprehension without action = wasted learning. The "What Now?" moment immediately after comprehension check is the highest-intent moment to convert understanding into behavior.

### P4: Verification

How do we know paraphrasing actually happened? See [p13](./p13_future-ideas-meme-platform.md) for understanding certification vision.

## Related Documents

- [p13_future-ideas-meme-platform.md](./p13_future-ideas-meme-platform.md) — Future vision: peer-to-peer understanding certification
- [p14_clarity-partners-network-effects.md](./p14_clarity-partners-network-effects.md) — Network effects: "What Now?" + Clarity Partners
- [p15_admin-dashboard.md](./p15_admin-dashboard.md) — Admin dashboard for monitoring comprehension
