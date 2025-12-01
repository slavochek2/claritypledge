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






