---
status: in-progress
type: story
rank: 7.0
tags: [consistency, story-card, footer, ux]
prepped_date: '2026-03-23'
delivery_stage: 1-prd-review
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-23
---

# P580: Story Card Point Footer — Consistent Count + Author CTA

## Problem Statement

**Current state:** Story cards and point cards have inconsistent footer behavior. Point cards always display "N stories" in their footer, even when the count is zero. Story cards do not follow this pattern — when a story has zero linked points, the footer shows nothing (empty span). The "Add a Point" action is only reachable from the story detail page, requiring an extra tap. On story detail, the empty-state "No points yet" section floats outside the card body as a disconnected block.

**Pain points:**

1. **Unnecessary friction for authors.** To add a point, the author must navigate to story detail first — the action is buried one tap deeper than needed.
2. **Inconsistent count display.** Point cards always show their linked-story count; story cards silently hide the linked-point count at zero. This breaks the symmetry users rely on to understand the data model.
3. **Disconnected empty state.** The dashed "No points yet. Points are claims..." section on story detail sits outside the card, visually orphaned from the story it belongs to.
4. **Dead code.** `_isCurrentUserStory` is computed but never used in `story-card-with-links.tsx`, suggesting an incomplete prior implementation.

**Who is affected:** Story authors who want to add points to their stories, and all users who rely on consistent card patterns to navigate the app.

**Prior art:** P456 (story CTA footer consistency) addressed the point→story CTA direction. P407 (story detail points unification) removed duplicate point lists. This feature completes the symmetry by addressing the story→point direction.

## Intention

Make story cards behave like point cards: always show the linked count, and give authors a direct path to add content — without requiring navigation to a detail page first.

## Business Requirements

1. **BR-1: Always-visible point count.** Every story card must display the count of linked points in its footer, regardless of whether the count is zero.
2. **BR-2: Author add-point CTA.** Story authors must be able to initiate "add a point" directly from the story card footer, without navigating to the story detail page first.
3. **BR-3: Consistent card pattern.** The story card footer layout (count + author CTA) must follow the same visual pattern already established by point card footers (count left, actions right).
4. **BR-4: Non-author read-only.** Non-authors and anonymous users see the point count only — no add-point CTA.
5. **BR-5: First-time guidance preserved.** The `justCreated` flow (banner encouraging the author to add points) must continue to function on the story detail page when an author has just created a story with zero points.
6. **BR-6: Remove disconnected empty state.** The standalone "No points yet" prose block on story detail must be eliminated. The count-based footer replaces it.

## User Stories

- **As a story author,** I want to see how many points are linked to my story at a glance, so I know whether my story needs more supporting claims.
- **As a story author,** I want to add a point directly from my story card, so I don't have to navigate to the detail page first.
- **As a reader,** I want every story card to show its point count, so I can gauge how well-supported a story is before opening it.
- **As a new author who just created a story,** I want clear guidance to add my first point, so I understand the story→point relationship.

## Jobs to Be Done

| When I... | I want to... | So I can... |
|-----------|-------------|-------------|
| See my story card anywhere in the app | Know how many points it has | Decide if I need to add more |
| Want to add a point to my story | Start from the card itself | Skip the extra navigation step |
| Browse other people's stories | See point counts on every card | Judge story depth at a glance |
| Just created my first story | Get prompted to add points | Learn the story-point model |

## Outcomes

- **Primary:** Reduce friction for authors adding points to stories (fewer taps to reach the add-point action).
- **Secondary:** Establish consistent card footer patterns across story and point cards, reducing cognitive load for all users.
- **Tertiary:** Remove dead code and disconnected UI elements that create visual noise.

## Acceptance Criteria

- [ ] **AC-1:** Story card footer displays "0 points" when no points are linked, "1 point" when one is linked, "N points" for N > 1.
- [ ] **AC-2:** Story card footer shows "+ add a point" link for the story author only. Non-authors and anonymous users see count only.
- [ ] **AC-3:** Tapping "+ add a point" on a non-detail card (profile, feed) navigates to the story detail page with the add-point form focused.
- [ ] **AC-4:** Tapping "+ add a point" on the story detail card expands the inline add-point form without navigation.
- [ ] **AC-5:** The `justCreated` banner ("Story saved. Now add key points...") still appears on story detail when the story has 0 points and was just created.
- [ ] **AC-6:** The standalone dashed "No points yet" empty-state block is removed from story detail.
- [ ] **AC-7:** The `_isCurrentUserStory` unused variable is removed from `story-card-with-links.tsx`.
- [ ] **AC-8:** Feed story cards (`feed-story-card.tsx`) show the point count in their footer, matching the pattern of other story card surfaces.
- [ ] **AC-9:** The footer layout follows the established point card pattern: count/CTA left-aligned, card actions right-aligned.
