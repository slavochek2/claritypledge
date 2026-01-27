# P87: Metrics Model Simplification (LinkedIn-like Prototype)

**Status:** Completed
**Scope:** LinkedIn-like prototype mock only
**Components affected:** StoryCard, Profile, PointCard (QuotedStory subcomponent)

## Problem

The current metrics display has directional confusion:
- Radio icon (clarity session count) used everywhere without clear meaning
- Zap (cross-disagreement) shown on StoryCard with speaker direction but would show on Profile with listener direction — confusing
- No clear distinction between "I was understood" (speaker) vs "I understood others" (listener)

## Solution

Simplify metrics model with clear directional semantics:

### Icon Meanings (Consistent Across App)

| Icon | Current | New Meaning | Direction |
|------|---------|-------------|-----------|
| Pin | Linked points | (unchanged) | — |
| BookOpen | Linked stories / Stories count | (unchanged) | — |
| Radio | Clarity session count | **Remove** — replace with Mic | — |
| Mic | (new) | "Understood me" (clarity sessions as speaker) | Speaker |
| Zap | Cross-disagreement count | **Remove** from StoryCard; replace with Ear on Profile | — |
| Ear | (new) | "Understood others despite disagreeing" | Listener |

### StoryCard Metrics

| Icon | Data Source | Tooltip |
|------|-------------|---------|
| Pin | `linkedPoints.length` | "Linked points" |
| Mic | `story.verificationCount` | "People who understood this" |

**Changes:**
- Radio → Mic (same data, clearer metaphor: "I spoke, they understood")
- Remove Zap (crossDisagreementCount) — creates directional confusion

### Profile Metrics

| Icon | Data Source | Tooltip |
|------|-------------|---------|
| Ear | All listening sessions | "People you understood" |
| Mic | Sum of `story.verificationCount` | "Understood me" |

**Changes:**
- Remove Pin and BookOpen (redundant with tabs showing counts)
- Radio → Mic (clarity sessions as speaker)
- Zap → Ear (listening achievement)
- Ear first, Mic second (listener before speaker)
- Simplified: Ear counts ALL listening sessions, not just cross-disagreement

**Note:** Ear metric counts all sessions where user was listener. For mock, use hardcoded value (7).

### PointCard Metrics (main component)

| Icon | Data Source | Tooltip |
|------|-------------|---------|
| BookOpen | `linkedStories.length` | "Linked stories" |

**No changes needed.** Points don't accumulate clarity session metrics — they flow through Stories.

### PointCard QuotedStory Subcomponent

QuotedStory displays Story metrics inline. Apply same changes as StoryCard:
- Radio → Mic
- Remove Zap

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
- // Tooltip: "Clarity sessions completed"
+ // Tooltip: "People who understood this"

- // Remove Zap section entirely
- <Zap size={14} />
- {story.crossDisagreementCount ?? 0}
```

### Profile.tsx

```diff
- import { ... Radio, Zap, Pin, BookOpen ... } from 'lucide-react';
+ import { ... Mic, Ear ... } from 'lucide-react';

// Remove Pin and BookOpen stats (redundant with tabs)
// Reorder: Ear first, Mic second

// In stats row (only 2 stats now):
+ <Ear size={14} />    // Tooltip: "People you understood"
  // Data: hardcode mock value (7) for prototype

+ <Mic size={14} />    // Tooltip: "Understood me"
```

### PointCard.tsx (main component)

No changes to main PointCard metrics.

### PointCard.tsx (QuotedStory subcomponent)

```diff
- import { BookOpen, ExternalLink, Pin, Radio, Zap } from 'lucide-react';
+ import { BookOpen, ExternalLink, Pin, Mic } from 'lucide-react';

// In QuotedStory stats row:
- <Radio size={12} />
+ <Mic size={12} />
  {story.verificationCount}
- // Tooltip: "Clarity sessions completed"
+ // Tooltip: "People who understood this"

- // Remove Zap section entirely
- <Zap size={12} />
- {story.crossDisagreementCount ?? 0}
```

### Mock Data

For Profile Ear metric: hardcode a placeholder value (`7`) rather than computing from sessions.

## Test Plan

1. **StoryCard**: Verify Mic icon appears with tooltip "People who understood this", no Zap icon
2. **Profile**: Verify only 2 stats: Ear ("People you understood") first, then Mic ("Understood me"). No Pin/BookOpen.
3. **PointCard main**: Verify no changes (BookOpen only for linked stories)
4. **PointCard QuotedStory**: Verify Mic icon, no Zap icon (matches StoryCard)
5. **Visual consistency**: Icons should be clear and non-confusing across all views
