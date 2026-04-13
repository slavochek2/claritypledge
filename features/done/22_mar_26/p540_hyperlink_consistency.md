---
status: all-done
completed_at: "2026-03-19"
type: feature
rank: 140627.672
workstream: E1
created_date: 2026-03-17T00:00:00.000Z
flow: dev
tags:
  - ux
  - links
  - consistency
uat_file: features/uat/p540.md
test_files:
  - src/tests/p540-linkify-markdown.test.ts
  - e2e/p540-hyperlink-consistency.spec.ts
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

Add helper text to entry forms that accept links. Use concrete examples instead of abstract syntax — non-technical users learn from seeing, not from notation.

- **Story creation** (`create-story-page.tsx`): hint below textarea — "Paste URLs or write `[click here](https://...)` for named links"
- **Point creation** (inline point input on story detail): hint below point input — "Paste URLs or write `[click here](https://...)` for named links"
- **Bio editing** (`settings-page.tsx`): update existing hint from "Links auto-detected" to "Paste URLs or write `[click here](https://...)` for named links"

Hint styling: `text-xs text-muted-foreground` — matches existing bio hint class, theme-aware (works in dark mode).

### Concern 3: Consistent Styling

Standardize all links to `text-blue-500 hover:underline` (the lighter shade, matching the existing bio style). Remove `text-blue-600` from LinkedText consumers.

Links open in new tabs (`target="_blank" rel="noopener noreferrer"`) — this is already the behavior in both systems.

## Files to Change

### Core (Concern 1)
- `src/app/utils/linkify.ts` — extend to parse `[text](url)` markdown before auto-detecting URLs
- `src/app/components/shared/linked-text.tsx` — deprecate and remove after all callers migrate

### Display surfaces (switch LinkedText → linkifyText)

**Migration note:** All call sites change from `<LinkedText text={foo} />` (component) to `{linkifyText(foo)}` (expression). `linkifyText` is in a `.ts` file using `createElement` — keep using `createElement` for new code (no rename to `.tsx` needed).

- `src/app/components/partners/live-content-cards.tsx` — **heaviest consumer** (~11 LinkedText usages including story text, point statements, point context)
- `src/app/components/social/story-card-with-links.tsx` — switch to linkifyText
- `src/app/components/social/point-card-with-links.tsx` — switch to linkifyText (includes `point.context` surface)
- `src/app/components/social/StoryCardDetail.tsx` — switch to linkifyText (~4 usage sites)
- `src/app/components/feed/feed-story-card.tsx` — switch to linkifyText (1 usage)
- `src/app/components/feed/feed-point-card.tsx` — switch to linkifyText (2 usages: statement + context)
- `src/app/components/partners/live-story-card-expanded.tsx` — switch to linkifyText (2 usages)
- `src/app/pages/profile-page-v2.tsx` — already uses linkifyText for bio; verify no LinkedText imports
- `src/app/pages/point-detail-page.tsx` — switch to linkifyText (1 usage)
- `src/app/components/profile/compact-profile-card.tsx` — already uses linkifyText; verify no LinkedText imports

### Entry forms (Concern 2 — add hints)
- `src/app/pages/settings-page.tsx` — update bio help text
- `src/app/pages/create-story-page.tsx` — add link hint to story textarea
- `src/app/pages/story-detail-page.tsx` — add link hint to `AddPointForm` component (point creation input)

### Styling (Concern 3)
- All display surface files above — ensure `text-blue-500 hover:underline` consistently
- Scope: only link elements (`<a>` tags from linkifyText). `text-blue-600` on non-link elements (e.g., pin icons) is out of scope.

## Acceptance Criteria

- [x] `linkifyText()` handles raw URLs (existing behavior preserved)
- [x] `linkifyText()` handles `[text](url)` markdown — renders named link
- [x] `linkifyText()` handles mixed content: markdown links + raw URLs + plain text in same string
- [x] `[text](url)` inside markdown is not double-processed as a raw URL
- [x] `<LinkedText>` component removed; no remaining imports
- [x] All link elements render `text-blue-500 hover:underline` — no `text-blue-600` on link `<a>` tags
- [x] All links open in new tab with `rel="noopener noreferrer"`
- [x] Bio entry form shows updated hint mentioning both syntaxes
- [x] Story creation form shows link hint
- [x] Point creation form shows link hint
- [x] Hints are styled `text-xs text-muted-foreground`
- [x] No regressions in existing link rendering (bio URLs, story markdown links, point markdown links)

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

## Test Coverage Strategy

**What's Tested:**
- ✅ Markdown `[text](url)` parsing — 15 unit tests covering basic, mixed, edge cases
- ✅ Processing order (no double-processing) — 2 unit tests
- ✅ XSS prevention in markdown hrefs — 3 unit tests (javascript:, data:, vbscript:)
- ✅ Malformed markdown graceful fallback — 4 unit tests
- ✅ Existing auto-URL behavior preserved — 4 regression unit tests
- ✅ Link attributes consistency (color, target, rel) — 4 unit tests
- ✅ Bio link rendering (E2E) — raw URL regression + new markdown support
- ✅ Color consistency (E2E) — text-blue-500, no text-blue-600
- ✅ Form hints visible (E2E) — settings + story creation
- ✅ Smoke tests — profile, settings, create, feed pages load without errors
- ✅ UAT — 14 manual scenarios covering all surfaces + security + regressions

**What's NOT Tested (and why):**
- ❌ Story/point link rendering (E2E) — TODO stubs, depends on story creation helpers (filled in during /dev)
- ❌ Integration tests — no DB/API/RLS changes in this feature
- ❌ Accessibility tests — no new interaction patterns; links already exist, just changing renderer
- ❌ Point creation form hint (E2E) — exact form location TBD (verify during /dev)

**Test Pyramid:**
```
     /\
    /  \   7 E2E tests (2 TODO)
   /    \
  /______\
 /  0 INT  \
/____________\
/ 32 UNIT     \
```

**Total:** 32 unit tests + 7 E2E tests (2 TODO) + 4 smoke tests + 14 UAT scenarios

**Files:**
- `src/tests/p540-linkify-markdown.test.ts` — 32 new unit tests for markdown parsing
- `src/tests/linkify.test.ts` — 27 existing unit tests (unchanged, regression suite)
- `e2e/p540-hyperlink-consistency.spec.ts` — 7 E2E tests
- `e2e/p540-smoke.spec.ts` — 4 smoke tests
- `features/uat/p540.md` — 14 UAT scenarios

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.

### Task 1: Extend linkifyText with markdown [text](url) support
- **Files:** `src/app/utils/linkify.ts` (modify)
- **Spec refs:** "Solution > Concern 1 (lines ~59-65)", "Acceptance Criteria (lines ~115-118)"
- **Tests:** `src/tests/p540-linkify-markdown.test.ts`, `src/tests/linkify.test.ts`
- **Depends on:** None
- **Verify:** All 32 new unit tests pass + all 27 existing regression tests pass. `npm test -- --run src/tests/p540-linkify-markdown.test.ts src/tests/linkify.test.ts`
- [x] Complete

### Task 2: Migrate social/feed LinkedText consumers to linkifyText
- **Files:** `src/app/components/social/story-card-with-links.tsx` (modify), `src/app/components/social/point-card-with-links.tsx` (modify), `src/app/components/social/StoryCardDetail.tsx` (modify), `src/app/components/feed/feed-story-card.tsx` (modify), `src/app/components/feed/feed-point-card.tsx` (modify)
- **Spec refs:** "Files to Change > Display surfaces (lines ~89-102)", "Solution > Concern 3 (lines ~77-81)"
- **Tests:** `e2e/p540-smoke.spec.ts`
- **Depends on:** Task 1
- **Verify:** `grep -r "LinkedText" src/app/components/social/ src/app/components/feed/` returns zero results. Build passes (`npm run build`). No `text-blue-600` on link elements in these files.
- [x] Complete

### Task 3: Migrate partners/profile/page LinkedText consumers + remove LinkedText component
- **Files:** `src/app/components/partners/live-content-cards.tsx` (modify), `src/app/components/partners/live-story-card-expanded.tsx` (modify), `src/app/pages/point-detail-page.tsx` (modify), `src/app/pages/profile-page-v2.tsx` (modify — verify no LinkedText import), `src/app/components/profile/compact-profile-card.tsx` (modify — verify no LinkedText import), `src/app/components/shared/linked-text.tsx` (delete)
- **Spec refs:** "Files to Change > Display surfaces (lines ~89-102)", "Files to Change > Core (lines ~85-87)"
- **Tests:** `e2e/p540-smoke.spec.ts`, `e2e/p540-hyperlink-consistency.spec.ts`
- **Depends on:** Task 1, Task 2
- **Verify:** `grep -r "LinkedText" src/` returns zero results (component fully removed). `grep -r "linked-text" src/` returns zero import paths. Build passes. AC: "LinkedText component removed; no remaining imports."
- [x] Complete

### Task 4: Add form hints to story creation, point creation, and bio editing
- **Files:** `src/app/pages/create-story-page.tsx` (modify), `src/app/pages/story-detail-page.tsx` (modify — AddPointForm component), `src/app/pages/settings-page.tsx` (modify)
- **Spec refs:** "Solution > Concern 2 (lines ~67-75)", "Acceptance Criteria (lines ~122-125)"
- **Tests:** `e2e/p540-hyperlink-consistency.spec.ts`
- **Depends on:** None (independent of Tasks 1-3)
- **Verify:** All 3 forms show hint text "Paste URLs or write [click here](https://...) for named links" styled `text-xs text-muted-foreground`. E2E hint tests pass.
- [x] Complete

**Total tasks:** 4 | **Can parallelize:** Task 1 + Task 4 (no shared dependencies) | **Must be sequential:** Task 1 → Task 2 → Task 3
