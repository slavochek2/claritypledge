---
prep_status: ready
prep_date: 2026-01-25
prep_by: /prep-spec
reviews:
  ux: warnings
  architect: warnings
  tea: skipped
open_questions: 0
blindspots: 5
execution: /loop
---

# Summary: "Start Session" Button Feature

## Why This Matters

The current UI has "Open Story" / "Open Point" buttons which are passive — they just navigate to detail views. We want to make the UI more action-oriented by adding a direct path to Clarity Live sessions, which is where the core product value happens (verification → calibration).

## Core Insight

A Clarity Session requires two things:
1. A person to verify with
2. Content (Story) to verify

**Rule:** "Start Session" only appears when we know BOTH the person AND they have a story.

| Context | Person Known? | Has Story? | Show "Start Session"? |
|---------|---------------|------------|----------------------|
| StoryCard (yours) | ✅ You | ✅ Yes | ✅ Yes (invite verification) |
| StoryCard (theirs) | ✅ Author | ✅ Yes | ✅ Yes (verify them) |
| PointCard on Profile | ✅ Profile owner | ✅ If linked | ✅ Yes |
| PointCard on Feed | ❌ Unknown | — | ❌ No |
| PointDetail + story | ✅ Position holder | ✅ Yes | ✅ Yes |
| PointDetail - no story | ✅ Position holder | ❌ No | ❌ No |

## What Changes

UI per card:
```
[Start Session]  [↗]  [⤴]
    CTA         open  share
```

- **"Start Session"** — primary action (left), blue button
- **↗ icon** (`ArrowUpRight`) — replaces "Open Story/Point" text, small blue icon
- **Share icon** — stays as is

## Where Changes Are Needed

| Location | Current | New |
|----------|---------|-----|
| StoryCard (feed, profile, point-detail) | "Open Story" text button | "Start Session" + ↗ icon |
| PointCard (profile only) | "Open Point" text button | "Start Session" + ↗ icon |
| PointCard (feed) | "Open Point" text button | Just ↗ icon (no Start Session — no person context) |
| QuotedPoint (inside StoryCard) | "Open Point" text | Just ↗ icon (no Start Session) |
| QuotedStory (inside PointCard) | "Open Story" text | Just ↗ icon (no Start Session) |
| PointDetail positions with story | StoryCard shown | "Start Session" + ↗ icon |
| PointDetail positions without story | "No story shared" row | No Start Session |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Viewing your OWN story | ✅ Show "Start Session" (invite someone to verify they understand you) |
| Position without story | Show row with "No story shared", no Start Session |
| Nested/quoted content | Just ↗ icon, no Start Session (keep simple) |

## Technical Notes

- **Navigation:** "Start Session" navigates to `/live/new?with={userId}&story={storyId}`
- **Icon:** Use `ArrowUpRight` from lucide-react for the ↗ icon
- **Touch targets:** Ensure ↗ icon button has min 44x44px touch area
- **Accessibility:** Add `aria-label="Open story"` or `aria-label="Open point"` to icon buttons
- **PointCard context check:** Use `profileOwnerId` prop to determine if person context exists

## Done So Far

✅ PointDetail now shows all position holders (with and without stories)

## Completed

- [x] Add "Start Session" button to StoryCard (always show — yours or theirs)
- [x] Replace "Open Story" text with ↗ icon (`ArrowUpRight`) in StoryCard
- [x] Add "Start Session" button to PointCard (only when `profileOwnerId` is set)
- [x] Replace "Open Point" text with ↗ icon in PointCard
- [x] Replace "Open Point/Story" in QuotedPoint/QuotedStory with just ↗ icon
- [x] Add `aria-label` to all icon-only buttons
- [x] Test all pages (feed, profile, point-detail, story-detail)

## Known Limitations

**Auto-select first story:** When clicking "Start Session" on a PointCard, the button navigates to `/prototype/live/new?with={userId}&story={filteredStories[0].id}` — automatically selecting the first linked story. If the user has multiple stories linked to a point, they can't choose which one to verify. Acceptable for MVP; future enhancement could show a story picker.
