---
status: draft
type: story
workstream: C1
tags: []
rank: 125370.0
created_date: 2026-01-14
---
# V7: Context Portal Design — "Catch Up" for Events

**Status:** Design draft
**Created:** 2026-01-14
**Parent:** v6_mvp_decision_tree.md

---

## The Problem

At an event, someone approaches a Point with existing Positions:

```
Point: "AI will replace most knowledge work within 10 years"

Positions:
- 8 people AGREE
- 12 people DISAGREE
- 4 UNSURE
```

A newcomer sees this and thinks: "I want to engage, but I don't know WHY these people hold these positions. What am I walking into?"

**The Context Portal** answers: "What's the history here? Why do people disagree?"

---

## The v5 Origin

From the Brain Dump document:

> **The Context Portal (Breadcrumbs):** A "Catch Up" button for readers that uses AI to summarize the weeks of conversation/context behind a specific Point in 30 seconds.

For an event, "weeks of conversation" becomes "the Stories behind current Positions."

---

## User Flow

### Entry Point: The "Catch Up" Button

On any Point card with Positions:

```
┌─────────────────────────────────────────────────────────┐
│ Point: "AI will replace most knowledge work"            │
│                                                         │
│ ○ AGREE (8)  ● DISAGREE (12)  ○ UNSURE (4)             │
│                                                         │
│ [🔍 Catch Up]  [Stake Position]                         │
└─────────────────────────────────────────────────────────┘
```

### The Portal View

Tapping "Catch Up" reveals an AI-generated summary:

```
┌─────────────────────────────────────────────────────────┐
│                    CONTEXT PORTAL                       │
│            "AI will replace knowledge work"             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  WHY PEOPLE AGREE (8)                                   │
│  ─────────────────────                                  │
│  Common themes in their Stories:                        │
│  • Personal experience with AI tools outperforming      │
│    colleagues (3 people)                                │
│  • Economic analysis of automation trends (2 people)    │
│  • Frustration with repetitive work that feels          │
│    automatable (3 people)                               │
│                                                         │
│  Representative quote:                                  │
│  "I watched GPT-4 do in 10 minutes what took my        │
│   team 2 days. The writing is on the wall."            │
│                                         — Anonymous     │
│                                                         │
│  WHY PEOPLE DISAGREE (12)                               │
│  ───────────────────────                                │
│  Common themes in their Stories:                        │
│  • Tacit knowledge that AI can't capture (4 people)     │
│  • Failed AI implementations at their companies         │
│    (3 people)                                           │
│  • Concern about hype cycles vs. reality (5 people)     │
│                                                         │
│  Representative quote:                                  │
│  "Every decade has its 'this changes everything.'      │
│   I've seen too many bubbles to believe this one."     │
│                                         — Anonymous     │
│                                                         │
│  ⚡ KEY TENSION                                         │
│  ─────────────                                          │
│  The disagreement centers on: timeframe (10 years)      │
│  and definition of "replace" (augment vs. eliminate)    │
│                                                         │
│  VERIFIED UNDERSTANDING: 3 cross-disagreement           │
│  verifications have occurred. 9 gaps remain.            │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [Close]           [Stake My Position]                  │
└─────────────────────────────────────────────────────────┘
```

---

## Data Requirements

### Input Data

To generate the Context Portal, we need:

| Data | Source | Required? |
|------|--------|-----------|
| Point text | `points` table | Yes |
| Positions (agree/disagree/unsure) | `positions` table | Yes |
| Stories linked to Positions | `stories` table | Yes |
| Verification sessions on this Point | `clarity_sessions` table | Nice-to-have |

### Minimum Viable Data

For MVP, the portal can work with just:
- Point text
- Positions
- Stories (even if not all positions have Stories)

```sql
-- Query for Context Portal
SELECT
  p.text as point_text,
  pos.position,
  s.text as story_text,
  s.created_by
FROM points p
JOIN positions pos ON pos.point_id = p.id
LEFT JOIN stories s ON s.id = pos.story_id
WHERE p.id = :point_id;
```

---

## AI Prompt Design

### System Prompt

```
You are a neutral summarizer helping newcomers understand an ongoing discussion.

Given:
- A Point (a claim or assertion)
- Positions people have taken (agree/disagree/unsure)
- Stories behind those positions (personal experiences explaining why)

Generate a Context Portal summary that:
1. Groups Stories by position (agree vs disagree)
2. Identifies common themes within each group
3. Selects one representative quote per position (anonymized)
4. Identifies the key tension or crux of disagreement
5. Reports verification status (how many cross-disagreement verifications exist)

Rules:
- Be neutral — don't favor either position
- Preserve the "soul" of each Story without revealing identity
- Focus on understanding WHY, not WHO
- Keep total summary under 200 words
```

### Example Input

```json
{
  "point": "AI will replace most knowledge work within 10 years",
  "positions": [
    {
      "stance": "agree",
      "story": "I've been a technical writer for 15 years. Last month, Claude wrote documentation that my junior colleagues couldn't match. I'm genuinely scared for our profession."
    },
    {
      "stance": "agree",
      "story": "I run a consulting firm. We cut our research team by 40% after implementing AI tools. Productivity went UP."
    },
    {
      "stance": "disagree",
      "story": "I've been in tech through the dot-com bust, mobile revolution, and cloud hype. Each was supposed to 'change everything.' AI is impressive but the timeline is always wrong."
    },
    {
      "stance": "disagree",
      "story": "I work in healthcare compliance. The nuance and judgment required can't be automated. AI makes mistakes that would be catastrophic."
    }
  ],
  "verifications": [
    {
      "participants": ["user_1 (agree)", "user_3 (disagree)"],
      "completed": true,
      "mutual_understanding": true
    }
  ]
}
```

### Example Output

```markdown
## Why People Agree (8)

Common themes:
- Direct observation of AI outperforming human colleagues
- Economic evidence: reduced headcount, maintained productivity
- Personal fear/concern about job security

Representative: "I watched AI do in minutes what took my team days."

## Why People Disagree (12)

Common themes:
- Skepticism based on past technology hype cycles
- Domain-specific complexity that AI handles poorly
- Concern about catastrophic errors in high-stakes fields

Representative: "I've seen too many 'this changes everything' moments to trust the timeline."

## Key Tension

The crux: Is "10 years" realistic, and does "replace" mean augment or eliminate?

## Verification Status

1 verified cross-disagreement conversation.
Many gaps remain — people with opposing views haven't yet verified mutual understanding.
```

---

## UI Components

### Portal Trigger Button

```tsx
// In IdeaCard.tsx or PointCard.tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setShowPortal(true)}
>
  <Search className="h-4 w-4 mr-1" />
  Catch Up
</Button>
```

### Portal Modal

```tsx
interface ContextPortalProps {
  pointId: string;
  isOpen: boolean;
  onClose: () => void;
}

function ContextPortal({ pointId, isOpen, onClose }: ContextPortalProps) {
  const { data: context, isLoading } = useContextPortal(pointId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Context Portal</DialogTitle>
          <DialogDescription>{context?.pointText}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <PortalSkeleton />
        ) : (
          <>
            <Section title="Why People Agree" count={context?.agreeCount}>
              <ThemesList themes={context?.agreeThemes} />
              <Quote text={context?.agreeQuote} />
            </Section>

            <Section title="Why People Disagree" count={context?.disagreeCount}>
              <ThemesList themes={context?.disagreeThemes} />
              <Quote text={context?.disagreeQuote} />
            </Section>

            <KeyTension text={context?.tension} />

            <VerificationStatus
              verified={context?.verifiedCount}
              gaps={context?.gapCount}
            />
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => navigate(`/point/${pointId}/stake`)}>
            Stake My Position
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## API Design

### Endpoint

```typescript
// GET /api/points/:id/context
interface ContextPortalResponse {
  pointId: string;
  pointText: string;

  agreeCount: number;
  agreeThemes: string[];
  agreeQuote: string | null;

  disagreeCount: number;
  disagreeThemes: string[];
  disagreeQuote: string | null;

  unsureCount: number;

  tension: string;

  verifiedCount: number;  // Cross-disagreement verifications
  gapCount: number;       // Unverified cross-disagreements

  generatedAt: string;
  cachedUntil: string;
}
```

### Caching Strategy

Context Portals are expensive (AI generation). Cache aggressively:

| Event | Cache Action |
|-------|--------------|
| Portal requested | Return cached if < 5 min old |
| New Position staked | Invalidate cache |
| Verification completed | Invalidate cache |
| Story added/edited | Invalidate cache |

```typescript
async function getContextPortal(pointId: string): Promise<ContextPortalResponse> {
  const cached = await cache.get(`context:${pointId}`);
  if (cached && Date.now() < cached.cachedUntil) {
    return cached;
  }

  const fresh = await generateContextPortal(pointId);
  await cache.set(`context:${pointId}`, fresh, { ttl: 300 }); // 5 min
  return fresh;
}
```

---

## Privacy Considerations

### What's Exposed

| Data | Exposed? | How |
|------|----------|-----|
| Position counts | Yes | Aggregate only |
| Story themes | Yes | AI-extracted, anonymized |
| Representative quotes | Yes | Anonymized, no attribution |
| Individual Stories | No | Only AI sees raw text |
| User identities | No | Never in portal |

### Consent Model

For MVP (event context):
- Staking a Position implies consent to have your Story themes included
- No individual attribution

For V2 (public platform):
- Explicit opt-in: "Include my Story in Context Portal summaries?"
- Option to write a public-facing Story summary vs. private full Story

---

## Edge Cases

### Not Enough Data

If a Point has < 3 Positions with Stories:

```
┌─────────────────────────────────────────────────────────┐
│                    CONTEXT PORTAL                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Not enough context yet.                                │
│                                                         │
│  This Point has 2 positions but the Stories behind      │
│  them haven't been shared yet.                          │
│                                                         │
│  Be one of the first to stake your position and         │
│  share your Story!                                      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [Stake My Position]                                    │
└─────────────────────────────────────────────────────────┘
```

### All Same Position

If everyone agrees (or disagrees):

```
┌─────────────────────────────────────────────────────────┐
│                    CONTEXT PORTAL                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Current consensus: AGREE (15 people)                   │
│                                                         │
│  No one has disagreed with this Point yet.              │
│  Common themes among those who agree:                   │
│  • ...                                                  │
│                                                         │
│  ⚡ No cross-disagreement to bridge yet.                │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [Stake My Position]  — Be the first to disagree?       │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Priority

For MVP (first event):

| Feature | Priority | Why |
|---------|----------|-----|
| Basic portal with themes | P0 | Core value prop |
| Representative quotes | P1 | Makes it feel human |
| Key tension extraction | P1 | Helps newcomers orient |
| Verification status | P2 | Shows progress |
| Caching | P2 | Performance |

---

## Success Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Portal opens | >30% of attendees | Are people curious? |
| Time in portal | 15-45 seconds | Long enough to read, not too long |
| Position stake after portal | >50% | Does context help decision? |
| "Helpful" rating | >60% thumbs up | Qualitative validation |

---

## Related Documents

- [v5: Brain Dump](./v5.%20chat%20brain%20dump.md) — Origin of Context Portal concept
- [v6: MVP Decision Tree](./v6_mvp_decision_tree.md) — Where this fits in build order
- [P57: Event Roadmap](../../features/p57_roadmap_first_clarity_event.md) — Event context

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-14 | Initial design |
