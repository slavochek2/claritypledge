# P87: Metrics Model Simplification (LinkedIn-like Prototype)

**Status:** Ready for implementation
**Scope:** LinkedIn-like prototype mock only
**Components affected:** StoryCard, Profile, PointCard

## Problem

The current metrics display has directional confusion:
- Radio icon used everywhere without clear meaning
- Zap (cross-disagreement) shown on StoryCard with speaker direction but would show on Profile with listener direction — confusing
- No clear distinction between "I was understood" (speaker) vs "I understood others" (listener)

## Solution

Simplify metrics model with clear directional semantics:

### Icon Meanings (Consistent Across App)

| Icon | Meaning | Direction |
|------|---------|-----------|
| Pin | Linked points | — |
| BookOpen | Linked stories / Stories count | — |
| Mic | "Understood me" (clarity sessions as speaker) | Speaker |
| Ear | "Understood others despite disagreeing" | Listener |

### StoryCard Metrics

| Icon | Data Source | Tooltip |
|------|-------------|---------|
| Pin | `linkedPoints.length` | "Linked points" |
| Mic | `story.verificationCount` | "People who understood this" |

**Removed:** Zap (crossDisagreementCount) — creates directional confusion when same icon appears on Profile with opposite meaning.

### Profile Metrics

| Icon | Data Source | Tooltip |
|------|-------------|---------|
| Pin | Points count | "Points" |
| BookOpen | Stories count | "Stories" |
| Mic | Sum of `story.verificationCount` | "Understood me" |
| Ear | Listener cross-disagreement sessions | "Understood others despite disagreeing" |

**Note:** Ear metric requires computing from session data where user was listener AND positions differed. For mock, can use a placeholder or derive from existing data.

### PointCard Metrics

| Icon | Data Source | Tooltip |
|------|-------------|---------|
| BookOpen | `linkedStories.length` | "Linked stories" |

**No changes needed.** Points don't accumulate clarity session metrics — they flow through Stories.

## Rationale

1. **Why remove Zap from StoryCard?**
   StoryCard's Zap would mean "others who disagreed understood ME" (speaker direction). Profile's Zap would mean "I understood OTHERS despite disagreeing" (listener direction). Same icon, opposite meanings = confusion.

2. **Why Ear instead of Zap on Profile?**
   Ear represents listening, which is the skill being measured. Tooltip "despite disagreeing" adds the cross-disagreement qualifier. Zap suggests conflict/energy, not the listening achievement.

3. **Why not show both Ear and Mic on StoryCard?**
   StoryCard has one author — only speaker direction makes sense. The author can't be "listener" on their own story.

4. **Why keep cross-disagreement only on Profile?**
   It's a cumulative achievement metric ("you've understood X people despite disagreeing"). Not meaningful for a single Story.

## Implementation Changes

### StoryCard.tsx

```diff
- import { Zap, Globe, Users, Lock, Pin, MessageCircle, ExternalLink, Radio, BookOpen } from 'lucide-react';
+ import { Mic, Globe, Users, Lock, Pin, MessageCircle, ExternalLink, BookOpen } from 'lucide-react';

// In stats row:
- <Radio size={14} />
+ <Mic size={14} />
  {story.verificationCount}
  // Tooltip: "People who understood this"

- // Remove Zap section entirely
- <Zap size={14} />
- {story.crossDisagreementCount ?? 0}
```

### Profile.tsx

```diff
- import { ... Radio, Zap ... } from 'lucide-react';
+ import { ... Mic, Ear ... } from 'lucide-react';

// In stats row:
- <Radio size={14} />  // Tooltip: "Clarity sessions completed"
+ <Mic size={14} />    // Tooltip: "Understood me"

- <Zap size={14} />    // Tooltip: "Clarity across disagreement"
+ <Ear size={14} />    // Tooltip: "Understood others despite disagreeing"
  // Note: Data source needs to change from speaker to listener direction
```

### PointCard.tsx

No changes needed.

### Mock Data

For the Ear metric on Profile, need to add listener session count. Options:
1. Add `listenerCrossDisagreementCount` to User type
2. Compute from sessions where user was listener
3. For mock, use a placeholder value

## Test Plan

1. **StoryCard**: Verify Mic icon appears with correct tooltip, no Zap icon
2. **Profile**: Verify Mic and Ear icons with correct tooltips
3. **PointCard**: Verify no changes (BookOpen only)
4. **Visual consistency**: Icons should be clear and non-confusing across all views
