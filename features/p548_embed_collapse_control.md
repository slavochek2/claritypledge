---
status: in-progress
type: feature
rank: 250013.75
workstream: E3
created_date: 2026-03-18
flow: dev
tags: [embed, share-dialog]
uat_file: features/uat/p548.md
test_files:
  - e2e/p548-embed-collapse.spec.ts
  - e2e/p548-share-dialog.spec.ts
  - e2e/p548-smoke.spec.ts
# For complete frontmatter specification, see docs/technical/feature-specs.md
---

# P548: Embed Collapse Control

## Problem

Story and point embeds auto-expand linked content (points/stories), taking excessive vertical space in blog posts. No way for the embed author to control collapse state per usage. The ShareDialog's Link/Embed tab toggle is also hard to discover — the embed option blends into the UI.

## Solution

Three changes in one:

1. **Default collapsed** — point-card: replace `useState(isEmbed)` with `useState(isExpanded)`. Story-card: replace `useState(isDetailView || isEmbed)` with `useState(isDetailView || isExpanded)` (story-card already uses `isDetailView`, we add `isExpanded` as OR condition)
2. **`expanded` URL param** — `?embed=true&expanded=true` opts into expanded; read in `useEmbedNavigation` hook
3. **ShareDialog redesign** — ditch tabs, stack Link + Embed vertically (both always visible), add Collapsed/Expanded preset row under embed code

### ShareDialog Layout (approved ASCII)

```
┌─────────────────────────────────────┐
│  Share story                        │
│                                     │
│  🔗 Link                           │
│  ┌──────────────────────────┬─────┐ │
│  │ claritypledge.com/story/ │ 📋  │ │
│  └──────────────────────────┴─────┘ │
│                                     │
│  </> Embed                          │
│  ┌──────────────────────────┬─────┐ │
│  │ <iframe src="...">       │ 📋  │ │
│  └──────────────────────────┴─────┘ │
│  Linked content:                    │
│  ┌─────────────┐ ┌─────────────┐   │
│  │ ● Collapsed │ │  Expanded   │   │
│  └─────────────┘ └─────────────┘   │
└─────────────────────────────────────┘
```

### Design Decisions (from /innovate + /falsify)

- **Why not just remove auto-expand (no param)?** YAGNI concern valid, but ShareDialog generates the param — user never types it manually. The /falsify critique ("permanent API surface for one author") is resolved because the dialog handles URL construction.
- **Why not remove linked content entirely?** Non-proportional. The problem is expansion state, not presence. Removing content forecloses value that linked points provide in embeds.
- **Why stacked layout vs tabs?** Tabs were hard to discover (gray-on-gray segmented control). Stacking both sections makes embed option always visible. The Collapsed/Expanded toggle sits naturally under the embed code.
- **Why two-button preset vs checkbox?** Scored highest on DISCOVERABLE + MEMORABLE in /innovate evaluation. Named states ("Collapsed" / "Expanded") are clearer than a checkbox label.

## Technical Notes

| File | Change | Lines |
|------|--------|-------|
| `src/app/hooks/useEmbedNavigation.ts` | Parse `expanded` param, return `isExpanded` | ~3 |
| `src/app/components/social/story-card-with-links.tsx:97` | `useState(isDetailView \|\| isExpanded)` | 1 |
| `src/app/components/social/point-card-with-links.tsx:135` | `useState(isExpanded)` | 1 |
| `src/app/components/shared/ShareDialog.tsx` | Ditch tabs, stack sections, add preset row | ~15 |

- **Hook signature change:** `useEmbedNavigation()` returns `{ isEmbed: boolean, isExpanded: boolean, embedNavigate: (path: string) => void }`. New `isExpanded` field added.
- `isExpanded = isEmbed && expandedParam` — defensive guard so `?expanded=true` alone (without `?embed=true`) has no effect. When `expandedParam` absent, `isExpanded` is `false`.
- The preset row drives a `useState<'collapsed' | 'expanded'>('collapsed')` that adds/removes `expanded=true` in `embedParams`
- Existing `?embed=true` URLs become collapsed (intentional — this is the stated goal)
- **ShareDialog `handleCopy` rewrite:** Remove `activeTab` branch. Each section (Link, Embed) gets its own Copy button. Embed copy always uses the current `embedCode` (which reflects the preset selection). Delete `activeTab` state entirely.
- **Embed param ordering:** `embed=true` first, then `from={userId}` (if present), then `expanded=true` (if selected). Order is functionally irrelevant but kept consistent.
- **Embed route verified:** `/story/{id}?embed=true` renders `StoryCardWithLinks` (story-detail-page.tsx:1132), NOT `StoryCardDetail`. Both card components in the spec scope are the correct render targets for embed mode.

## Acceptance Criteria

- [ ] `?embed=true` → linked content collapsed by default (both story and point embeds)
- [ ] `?embed=true&expanded=true` → linked content starts expanded
- [ ] Toggle button in embed footer still works (manual expand/collapse after load)
- [ ] ShareDialog shows Link and Embed sections stacked (no tabs)
- [ ] Embed section has Collapsed/Expanded preset row
- [ ] Selecting "Expanded" adds `&expanded=true` to generated iframe code
- [ ] Copy button copies the correct code for the selected state
- [ ] Non-embed behavior unchanged (feed, detail views, profile pages)
- [ ] `?expanded=true` without `?embed=true` has no effect

## Test Coverage Strategy

**What's Tested:**
- ✅ Embed collapse default (E2E) — `?embed=true` → collapsed, `?embed=true&expanded=true` → expanded
- ✅ Manual toggle in embed (E2E) — chevron click still works after initial load
- ✅ Guard: `?expanded=true` without `?embed=true` (E2E) — no effect on non-embed pages
- ✅ ShareDialog stacked layout (E2E) — both Link + Embed sections visible simultaneously
- ✅ Preset row interaction (E2E) — Collapsed/Expanded buttons update embed code
- ✅ Copy correctness (E2E) — copied code matches selected preset
- ✅ Smoke: embed pages load without console errors

**What's NOT Tested (rationale):**
- ❌ Unit test for `useEmbedNavigation` hook — 3-line URL param read, covered fully by E2E
- ❌ Integration tests — no DB/API changes
- ❌ Accessibility — no new interaction patterns beyond standard buttons (existing a11y coverage applies)
- ❌ Profile share hides embed — minor defensive check, low regression risk

**Test Pyramid:**
```
     /\
    /  \   8 E2E tests (3 embed + 3 dialog + 2 smoke)
   /____\
  / 0 INT \
 /__________\
/ 0 UNIT    \
```

**Files:**
- `e2e/p548-embed-collapse.spec.ts` — embed default + expanded param + manual toggle + guard
- `e2e/p548-share-dialog.spec.ts` — stacked layout + preset row + code update
- `e2e/p548-smoke.spec.ts` — embed pages load without errors + dialog opens
- `features/uat/p548.md` — 11 UAT scenarios

Total: 8 automated tests + 11 UAT scenarios
