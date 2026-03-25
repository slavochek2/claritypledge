---
status: in-progress
type: story
rank: 3.5
tags:
  - consistency
  - point-card
  - ux
  - profile
prepped_date: '2026-03-23'
delivery_stage: 1-prd-review
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-23
locked_at: '2026-03-23T14:37:33.088Z'
---

# P579: Remove "Add your story" CTA from point cards on other profiles

## Problem Statement

**Current state:** When viewing another person's profile, point cards show an "Add your story" CTA (both on cards with no stories and cards with existing stories). After the viewer clicks and adds a story, nothing visibly changes on the card where they clicked — the CTA disappears but there's no confirmation, and the stories listed on the card are filtered to the profile owner's stories only. The viewer's newly created story is invisible on that surface.

**Pain points:**
- **Broken feedback loop:** The CTA promises action but the result is invisible on the card where the user clicked. The viewer has no way to confirm their story was added from the profile view.
- **Misleading affordance:** The CTA implies the viewer's story will appear alongside the profile owner's stories on this card. It won't — stories shown are filtered to the profile owner.
- **No state awareness:** The viewer can't tell from the profile view whether they already have a story on a given point. There's no "you already responded" indicator.
- **Wrong surface for this action:** The point-detail page already has "Add your story" in its footer, and that page shows all stories (not just the profile owner's). That's the correct location — the viewer can see their contribution in context.

**Who's affected:** Any user viewing another person's profile who wants to add stories to points. The CTA sets an expectation the UI cannot fulfill on this surface.

**Related work:**
- **P456** (Story CTA footer consistency) — established the pattern of embedding CTAs inside point cards and making them context-aware. This spec extends that thinking: a CTA should only appear where its result is visible.
- **P560** (Story filing without position) — removed the position requirement for story CTAs on point-detail. The point-detail page remains the right home for story creation CTAs.

---

## Intention (Why This Matters)

**Strategic importance:** ClarityPledge's core loop is position-taking followed by story-telling. Every CTA in that loop must deliver on its promise. A CTA that leads to an invisible result erodes trust in the platform's responsiveness. Removing it from the wrong surface and keeping it on the right surface (point-detail) strengthens the loop by ensuring the user always sees the outcome of their action.

**Why now:** This is a quick consistency fix that improves trust in the story creation flow. The current behavior creates confusion that compounds with each profile visit. The correct CTA already exists on point-detail — this is purely about removing the misleading duplicate.

**Impact if not solved:** Users who add stories from profile cards experience a "nothing happened" moment. Over time, this trains them to distrust the CTA, reducing story creation — the exact opposite of the intended behavior.

---

## Business Requirements

**Must-haves:**
- Point cards on another user's profile must NOT show "Add your story" CTA (neither the standalone version nor the inline version next to story counts)
- The "edit your story" link for authors viewing their own profile cards (existing behavior) must remain unchanged
- The "Add your story" CTA on the point-detail page footer must remain unchanged — this is the canonical location for story creation
- No new UI elements are introduced — this is purely a removal

**Must-not:**
- Must not affect point cards on the viewer's own profile
- Must not affect point-detail page CTAs
- Must not remove the ability to navigate to point-detail (where the CTA lives correctly)

**Open question — Feed view:**
The same problem exists on feed view point cards: stories shown are filtered, so the viewer's story won't appear after adding it. Should the feed view also remove "Add your story" from point cards? The same logic applies (CTA result is invisible on this surface), but the feed is a different navigational context — it may be the only surface where a user encounters a point. **Decision needed before implementation.**

---

## User Stories

1. **As a user viewing someone else's profile,** I should not see a CTA that leads to an invisible result, so that I trust the actions the app presents to me.
2. **As a user who wants to add a story to a point I see on a profile,** I can tap into the point detail to find the "Add your story" CTA there, so that I see my story alongside others after creating it.
3. **As a user viewing my own profile,** I still see the "edit your story" link on my point cards, so that my existing workflow is unaffected.

---

## Jobs to Be Done

- **When** I see a point on someone's profile that I want to respond to, **I want to** navigate to a surface where my response will be visible, **so that** I get confirmation my story was added.
- **When** I browse someone's profile, **I want to** see only actions that produce visible results on this page, **so that** I'm not confused by CTAs that seem to do nothing.

---

## Expected Outcomes

| Metric | Current | Expected |
|--------|---------|----------|
| Confused "nothing happened" moments after adding story from profile | Occurs every time | Eliminated — CTA only appears where result is visible |
| Story creation from point-detail page | Existing flow | Unchanged — still the primary story creation surface |
| Trust in CTA responsiveness | Eroded by invisible results | Preserved — every CTA leads to visible feedback |

---

## Acceptance Criteria

- [ ] Point cards on another user's profile do NOT show "Add your story" CTA (standalone or inline)
- [ ] Point cards on the viewer's OWN profile are unchanged (including "edit your story" link)
- [ ] Point-detail page "Add your story" CTA in footer is unchanged
- [ ] No new UI elements are introduced
- [ ] Decision documented on whether feed view CTAs are also removed (open question above)
- [ ] Props that become unused after removal are cleaned up (no dead code left behind)
