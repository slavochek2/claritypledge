# Feature: Refactor Landing Page Content to Single Source of Truth

**Goal:** Eliminate content drift between documentation and code, and implement the new "Moral Injury / Mutual Hallucination" messaging strategy.

**Status:** Planned
**Priority:** High

## Context
Currently, the landing page content is hardcoded in React components (`src/polymet/components/*.tsx`), while the updated copy lives in `_docs/content/landing-copy.md`. This causes duplication and makes updates risky.

We need to move to a **Content-First Architecture** where the copy lives in a dedicated file, and components are just renderers.

## Implementation Plan

### 1. Create Content Source
- Create `src/polymet/content/landing-content.ts`
- Export a typed constant `LANDING_CONTENT` matching the structure of the landing page.
- Populate it with the **NEW** copy from `_docs/content/landing-copy.md` (Headline: "Stop The Mutual Hallucination").

### 2. Refactor Components
Refactor the following components to accept content via props or import it directly:

- `src/polymet/components/clarity-hero.tsx`
  - Replace "Sign the Clarity Pledge" with `content.hero.headline`
  - Replace "A public promise..." with `content.hero.subheadline`
  - Replace dynamic words if needed (though [Comfort, Fear, Ego] is still relevant)

- `src/polymet/components/manifesto-section.tsx`
  - Replace "Clarity Tax" text with the new "Mutual Hallucination" / "Moral Injury" narrative.

- `src/polymet/components/pledge-card.tsx`
  - **CRITICAL:** Update the Pledge Text to the new version:
    - *Right:* "Do not let me nod if you think I am drifting."
    - *Promise:* "Crucially, I promise not to pretend."

- `src/polymet/components/cta-section.tsx`
  - Update headline and body to match the new "Stop Subsidizing Confusion" copy.

### 3. Cleanup
- Verify `_docs/content/landing-copy.md` is now redundant (or mark it as "Reference Only").
- Ensure `App.tsx` or `ClarityPledgeLanding` passes the content down correctly (or components import it).

## Verification
- Run the app locally.
- Confirm the Headline is "Stop The Mutual Hallucination".
- Confirm the Pledge Card contains the "Promise not to pretend" clause.

