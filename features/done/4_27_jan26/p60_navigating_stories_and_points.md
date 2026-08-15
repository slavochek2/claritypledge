---
status: all-done
type: story
tags: []
rank: 125446.0
created_date: 2026-01-15
completed_at: '2026-02-09'
---

# P60: Exploration UX - Navigating Stories and Points

## Status: Planning

## What This Is

**Exploration UX** = How users discover, browse, and navigate between Stories and Points in the app.

This is the **navigation layer** that lets users move through the content created by P58 (Sifter MVP).

## What This Is NOT

- **P58 (Sifter MVP)**: Creating Stories and Points (brain dump → AI separates → review)
- **P59 (Context Portal)**: AI-generated summary of why people disagree on a Point
- **P55 (Understanding Verification)**: The `/live` session mechanics

P60 is the **connective tissue** that lets users flow between all of these.

## Why This Matters

Without exploration UX:
- Users create Stories/Points but can't find others' content
- Cross-position discovery doesn't happen
- The core value prop (understanding disagreement) fails

**The goal**: Make it easy to find someone who disagrees with you and understand why.

## Design Decisions

### Pattern B (Reddit Border Links)

From P58 UX exploration, we chose **Pattern B** for Story/Point relationships:

| Element | Meaning |
|---------|---------|
| Blue border line | Stories linked to a Point |
| Yellow border line | Points linked to a Story |
| Tap line | Collapse/expand |
| Position badges | Agrees/Disagrees on Story cards |
| Avatar stack | Collapsed state preview |

This pattern handles **N:N relationships** cleanly — a Story can link to multiple Points, and a Point can appear in multiple Stories. See [decisions.md](../docs/decisions.md#2026-01-22-story-point-relationship-is-nn-many-to-many) for rationale.

### Point Cards Have No Icon

Points are **global/ownerless** - no person posted them, they emerge from the system.

- **No avatar circle** on Point cards (unlike Stories which have author avatar)
- Yellow card color + border is sufficient visual distinction
- Removes confusion of "who posted this Point"

### Verification Request Flow (MVP)

**Anyone can request verification** from any public Story. No "connect first" required.

Flow:
```
See Sarah's Story → Tap "Verify Understanding"
  → Sarah gets notification: "Slava wants to verify understanding"
  → [Accept] [Decline] buttons
  → Accept → Both enter /live session (P55)
```

**Where requests land:** Simple notification system (like LinkedIn connection requests).

**No chat needed for MVP.** The /live session IS the conversation.

Post-MVP considerations:
- "Clarity Partners" (people you've verified with)
- Chat for coordination before /live
- Event-scoped verification requests

### Linked Points Show Both Positions

On Story Detail, linked Points show **both** the author's position AND your position:

```
Linked Points (2)
├── "Remote work increases..."
│   Sarah: Agrees | You: Agree
└── "Fewer meetings = better..."
    Sarah: Agrees | You: -
```

This matches the LinkedIn prototype pattern and helps understand alignment/disagreement.

## Key User Journeys

### Journey 1: Point-First (Explore a debate)

```
Feed → Point card → Tap
  ↓
Point Detail
├── Point text (yellow card)
├── Your position buttons: [Agree] [Disagree] [Unsure]
├── Stories (12) - blue border line
│   ├── [All | Agree | Disagree] filter tabs
│   ├── Story 1 (Sarah) [Agrees badge]
│   ├── Story 2 (Mike) [Disagrees badge]
│   └── + 10 more (tap to expand)
└── [Catch Up] button → P59 Context Portal
```

**User can:**
- Stake their position
- Filter Stories by position
- Tap Story → see full Story + verify understanding
- Use Context Portal for AI summary

### Journey 2: Story-First (Understand a person)

```
Feed → Story card → Tap
  ↓
Story Detail
├── Story text + author avatar (blue card)
├── [Verify Understanding] button → /live
├── Linked Points (2) - yellow border line
│   ├── Point 1: "Remote work improves..." [Your: Agree]
│   └── Point 2: "Fewer meetings = better..." [Your: -]
└── Other Stories by this author
```

**User can:**
- Read full Story
- Initiate verification with author
- See which Points this Story supports
- Explore author's other Stories

### Cross-Position Discovery = Filter

**Not a separate journey** - just use the filter tabs in Point Detail:

```
Point Detail → Filter tab: "Disagree" → Same view, filtered to disagreeing Stories
```

The filter IS the cross-position discovery mechanism. No separate screen needed.

### Journey 3: Feed/Discovery (What's new)

```
Home/Feed
├── Recent activity across Points you follow
├── Stories from people you've verified with
├── New Points in topics you care about
└── "Unverified disagreements" - prompts to verify
```

**Algorithm considerations** (out of scope for wireframe):
- Surface Points with position diversity
- Prioritize unverified cross-disagreements
- Show activity from verification partners

## Open Questions

1. **Where does Explore live?**
   - New bottom nav tab? ("Explore" between Feed and Profile)
   - Integrated into Feed?
   - Search/Topics entry point?

2. **How do users find Points initially?**
   - Browse trending?
   - Search by topic?
   - From Stories they see?

3. **Privacy for Stories**
   - Stories are private by default (P58)
   - How does sharing work for exploration?
   - Explicit "make public" toggle?

4. **Empty state**
   - New user with no content, no follows
   - What do they see?

## Wireframe Deliverables

1. **Point Detail screen** (Journey 1) - main exploration view
2. **Story Detail screen** (Journey 2) - with linked Points
3. **Feed with Pattern B cards** - collapsed/expanded states
4. **Filter interaction** - Agree/Disagree filtering
5. **Navigation between screens** - back/forward, breadcrumbs

## Integration with Existing Prototype

Current prototype structure:
```
/prototype/linkedin-like/
├── Feed.tsx (shows Ideas - needs Story/Point distinction)
├── IdeaDetail.tsx (needs split into StoryDetail + PointDetail)
├── Live.tsx (P55 verification - keep as-is)
└── Profile.tsx (user's own Stories/Points)
```

Changes needed:
- `Feed.tsx`: Pattern B cards with collapse/expand
- New `PointDetail.tsx`: Point + linked Stories
- New `StoryDetail.tsx`: Story + linked Points
- `IdeaCard.tsx` → split into `StoryCard.tsx` + `PointCard.tsx`

## Related Files

- [Pattern B Wireframe](../../../docs/bmad/diagrams/story-point-pattern-B-reddit-border.excalidraw)
- [Sifter MVP Wireframe v4](../../../docs/bmad/diagrams/_archive/sifter-mvp-wireframe-v4.excalidraw)
- [P59 Context Portal](../../drafts/p59_context_portal_design.md)
- [P55 Verification Loop](./done/p55_understanding_verification_loop.md)
- [Shared Types](../../../tools/kanban/src/lib/types.ts)

## Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Stories discovered per session | >5 | Are users exploring? |
| Cross-position Story views | >30% of views | Finding disagreement? |
| Verification initiations from explore | >10% of sessions | Acting on discovery? |
| Time in Point Detail | 30-90 sec | Meaningful engagement |

## Changelog

| Date | Change |
|------|--------|
| 2025-01-15 | Added design decisions: no Point icon, verification flow, dual positions |
| 2025-01-15 | Simplified: Cross-position discovery is just filtering, not separate journey |
| 2025-01-14 | Initial design from P58 UX exploration |
