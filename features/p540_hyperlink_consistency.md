---
status: week
type: feature
rank: 250009.75
workstream: E1
created_date: 2026-03-17
flow: dev
tags: [ux, links, consistency]
---

# P540: Hyperlink Consistency Across All Text Surfaces

## Problem

Two parallel link systems exist in the codebase with different syntax, different styling, and inconsistent documentation to users:

1. **`linkifyText()`** in `src/app/utils/linkify.ts` — auto-detects raw URLs, used for profile bio only. Renders links as `text-blue-500`.
2. **`<LinkedText>`** in `src/app/components/shared/linked-text.tsx` — parses markdown `[text](url)` syntax, used for stories and points. Renders links as `text-blue-600`.

Users have no way to know which surfaces support links, what syntax to use, or why the same feature behaves differently across pages. Bio doesn't support `[text](url)` markdown. Stories and points don't auto-detect raw URLs. The blue shades differ. Most entry forms have zero documentation about link support.

## Current State

| Surface | Mechanism | Syntax | Documented in UI? |
|---------|-----------|--------|-------------------|
| Profile Bio | `linkifyText()` | Auto-detect URLs | Yes — "Links auto-detected" |
| Story Text | `<LinkedText>` | Markdown `[text](url)` | No |
| Point Text | `<LinkedText>` | Markdown `[text](url)` | No |
| Profile Role | None | None (+ truncated) | Plain text |
| Agreement Terms | None | None | Plain text |

**Consequences:**
- Users paste raw URLs in stories/points expecting auto-detection — they render as plain text
- Users who discover markdown links in stories don't know they can use them in bio (they can't)
- Two different blue shades (`text-blue-500` vs `text-blue-600`) create subtle visual inconsistency
- No entry form for stories or points mentions that links are supported

## User Stories

- As a pledger writing a story, I want to include links to sources so readers can verify my claims.
- As a pledger adding a point, I want to link to evidence without pasting ugly raw URLs.
- As a pledger editing my bio, I want to use `[text](url)` for clean named links alongside auto-detected URLs.
- As a new user filling out any text field, I want to know whether links are supported and what syntax to use.

## JTBD

When I'm entering text on any ClarityPledge surface, I want consistent link behavior so I don't have to guess what works where.

## Solution

### Concern 1: Unify Link Systems

Extend `linkifyText()` to support both auto-URL detection AND `[text](url)` markdown syntax. This makes it a superset of both current systems. Then replace all `<LinkedText>` usage with `linkifyText()`.

**Processing order:** Parse `[text](url)` markdown first, then auto-detect remaining raw URLs. This prevents the URL inside `[text](https://example.com)` from being double-processed.

After migration, deprecate and remove `<LinkedText>`.

### Concern 2: Add Form Hints

Add helper text to entry forms that accept links:

- **Story creation** (`create-story-page.tsx`): hint below textarea — "Links supported: paste URLs or use `[text](url)`"
- **Point creation** (`story-detail-page.tsx`): hint below point input — "Links supported: paste URLs or use `[text](url)`"
- **Bio editing** (`settings-page.tsx`): update existing hint from "Links auto-detected" to "Links supported: paste URLs or use `[text](url)`"

Hint styling: `text-xs text-gray-400` — subtle, doesn't compete with the input.

### Concern 3: Consistent Styling

Standardize all links to `text-blue-500 hover:underline` (the lighter shade, matching the existing bio style). Remove `text-blue-600` from LinkedText consumers.

Links open in new tabs (`target="_blank" rel="noopener noreferrer"`) — this is already the behavior in both systems.

## Files to Change

### Core (Concern 1)
- `src/app/utils/linkify.ts` — extend to parse `[text](url)` markdown before auto-detecting URLs
- `src/app/components/shared/linked-text.tsx` — deprecate and remove after all callers migrate

### Display surfaces (switch LinkedText → linkifyText)
- `src/app/pages/profile-page-v2.tsx` — update LinkedText usage to linkifyText
- `src/app/components/profile/compact-profile-card.tsx` — same
- `src/app/components/social/story-card-with-links.tsx` — switch to linkifyText
- `src/app/components/social/point-card-with-links.tsx` — switch to linkifyText

### Entry forms (Concern 2 — add hints)
- `src/app/pages/settings-page.tsx` — update bio help text
- `src/app/pages/create-story-page.tsx` — add link hint to story textarea
- `src/app/pages/story-detail-page.tsx` — add link hint to point input

### Styling (Concern 3)
- All display surface files above — ensure `text-blue-500 hover:underline` consistently

## Acceptance Criteria

- [ ] `linkifyText()` handles raw URLs (existing behavior preserved)
- [ ] `linkifyText()` handles `[text](url)` markdown — renders named link
- [ ] `linkifyText()` handles mixed content: markdown links + raw URLs + plain text in same string
- [ ] `[text](url)` inside markdown is not double-processed as a raw URL
- [ ] `<LinkedText>` component removed; no remaining imports
- [ ] All link surfaces render `text-blue-500 hover:underline` — no `text-blue-600` anywhere
- [ ] All links open in new tab with `rel="noopener noreferrer"`
- [ ] Bio entry form shows updated hint mentioning both syntaxes
- [ ] Story creation form shows link hint
- [ ] Point creation form shows link hint
- [ ] Hints are styled `text-xs text-gray-400`
- [ ] No regressions in existing link rendering (bio URLs, story markdown links, point markdown links)

## Testing

### Unit tests (`linkifyText`)
- Raw URL → clickable link
- `[text](url)` → named link with correct href and display text
- Mixed: `Check [this](https://a.com) and https://b.com` → two links, correct text
- Nested brackets / malformed markdown → graceful fallback (render as plain text)
- Empty input / no links → returns text unchanged
- XSS vector: `[click](javascript:alert(1))` → not rendered as link (only http/https)

### Integration tests
- Story with markdown links renders correctly after migration
- Point with markdown links renders correctly after migration
- Bio with raw URLs continues to work
- Bio with new `[text](url)` syntax works
- Form hints visible on story creation, point creation, and settings pages

### Visual QA
- Link color consistent across all surfaces (`text-blue-500`)
- Hover state (underline) works on all links
- Hints don't crowd the input fields
- Links in long text wrap correctly without layout breakage
