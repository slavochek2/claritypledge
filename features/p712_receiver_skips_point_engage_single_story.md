---
status: qa
type: bug
rank: 1
tags: []
delivery_stage: fix
pipeline_ran: [fix]
created_date: 2026-04-15
---

# P712: Receiver View Skips point-engage for Single-Story Letters

## Bug Description

**Reported:** 2026-04-15
**Severity:** High (defeats the purpose of the letter — point is never evaluated)

**Symptoms:**
- For a 1-story, 1-point letter, the receiver reaches `story-revealed`, sees "Complete Letter", and is taken straight to completion
- The point (the claim being evaluated) is never surfaced for position rating
- The receiver rates story comprehension without ever seeing or rating the point itself

**Reproduction steps:**
1. Start dev server (port 5200)
2. Open http://localhost:5200/letter/0783575e-f035-408c-a565-4f83ed910b7e in fresh incognito window
3. Rate comprehension of the story in `story-rate`
4. Observe `story-revealed`: confidence meters, gap banner, story card, single blue "Complete Letter" button
5. Click it → goes straight to completion. Point card never shown.

**Expected:** After clicking in step 4, `point-engage` should render a `PointRow` with a position selector. Only after submitting a position and acknowledging the revealed point should the letter complete.

**Root cause:** `src/app/components/letters/letter-flow-content.tsx:300` — in the `story-revealed` phase render:
```tsx
onClick={isFinalStory ? nextStory : advanceFromStoryReveal}
```
`isFinalStory` is computed as `state.currentStoryIndex === snapshots.length - 1`. For a single-story letter this is **always true**, so the button always shortcuts to `nextStory` regardless of whether any points remain. That bypasses `advanceFromStoryReveal` entirely, which is the only path that routes to `point-engage`.

**Affected surfaces:**
- Authenticated reading flow (`LetterReadingFlow`)
- Public one-to-many flow (`LetterReadingFlowPublic`)
- Letter preview page (`letter-preview-page.tsx`) — shares same component

**Regression test:** `src/tests/p712-receiver-skips-point-engage.test.tsx`

---

## Resolution

**Fixed:** 2026-04-15
**Root cause:** `isFinalStory` shortcut in `story-revealed` button bypasses `advanceFromStoryReveal`, skipping `point-engage` for single-story letters with points.
**Resolution:** Always call `advanceFromStoryReveal`; derive button label from `hasRemainingPoints` + `isFinalStory` combination.
