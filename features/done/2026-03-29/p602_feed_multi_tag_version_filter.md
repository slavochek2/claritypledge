---
status: all-done
completed_at: '2026-03-29'
type: story
rank: 8.0
workstream: C2
tags: [feed, tags, filtering, version]
prepped_date: '2026-03-29'
uat_file: features/uat/p602.md
test_files:
  - src/tests/p602-feed-filters.test.ts
  - e2e/p602-feed-multi-tag.spec.ts
  - e2e/a11y/p602-accessibility.spec.ts
flow: dev
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-29
---

# P602: Feed Multi-Tag Select & Version Filter

## Problem Statement

**Current state:** The feed (`/feed`) supports filtering by a single tag (`?tag=X`) and sorting by timestamp (`?sort=oldest`). After P491 (hashtag feed) and P505 (sort toggle), the infrastructure works — but the filtering is too coarse for the actual content structure.

**Pain points:**

1. **Single-tag lock-in.** A user browsing `?tag=understanding` sees only understanding points. To also see motivation points for the same story arc, they must navigate away, lose context, and manually switch tags. There's no way to build a combined view like "understanding + motivation" in one URL.

2. **Version noise.** When a point is revised (e.g., st8 has v1 and v2), both versions appear in the feed. For a reader following the narrative arc st1-st9, this is confusing — they see two st8 entries with no indication which is current. There's no way to say "show me only the latest version of each point."

3. **Shareable URLs are limited.** The feed's primary value is shareable filtered links (P491 BR-5). But single-tag + no version control means you can't share a clean "here's the understanding narrative, latest version" link. The URL `/feed?tag=understanding&sort=oldest` returns 11 points (including both st8 versions) instead of the clean 9-point arc.

**Who's affected:** Anyone sharing feed links for teaching sequences (story arcs st1-st9), event participants browsing by topic, and the founder curating public content views.

---

## Intention (Why This Matters)

**Strategic importance:** The feed is the primary public surface for ClarityPledge content. Story arcs (st1-st9) are the core teaching tool — each arc builds a narrative from point to point. If the feed can't render a clean, versioned, multi-topic view of an arc, the teaching value is diluted. Multi-tag + version filtering turns the feed from a flat content list into a curated narrative tool.

**Why now:** Content is now structured with consistent st-tags, v-tags, and topic tags (understanding, misunderstanding, motivation). The data model supports this — the feed UI doesn't. Every new point version or topic tag added makes the single-tag/all-versions feed noisier.

**Impact if not solved:** Feed links shared externally show duplicate versions and incomplete topic views. The teaching narrative is fragmented across multiple URLs instead of being one clean shareable link.

---

## Business Requirements

**Must-haves:**

- **BR-1:** Users can select multiple tags simultaneously. The feed shows points matching ANY of the selected tags (OR logic).
- **BR-2:** The URL reflects multi-tag state in a shareable format (e.g., `?tag=understanding,motivation` or `?tag=understanding&tag=motivation`).
- **BR-3:** A `version=latest` URL parameter collapses results to show only the highest-versioned point per st-group. For st-groups with one version, no change. For st-groups with multiple versions (e.g., st8 v1 + v2), only the highest version appears.
- **BR-4:** `version=latest` works independently of tag filters — it can be combined with any tag selection or no tags.
- **BR-5:** The tag cloud UI supports toggling multiple tags on/off (additive selection, not replacement).
- **BR-6:** Active tag filter area shows all selected tags with individual dismiss buttons.
- **BR-7:** `/feed?tag=understanding&sort=oldest&version=latest` returns one point per st-group that has an understanding-tagged point, ordered by created_at. (Currently 9 points, st1-st9.)
- **BR-8:** Tag cloud is computed from ALL public content, not from filtered results. Tag filtering is applied client-side after fetch. This ensures all tags remain selectable regardless of current filter.
- **BR-9:** Points without a v-tag are treated as v1 (implicit first version) during version collapse. Points without an st-tag are excluded from version collapsing (shown as-is).

**Success conditions:**
- A shareable URL with multi-tag + version filter produces a clean, predictable result set
- The same URL returns the same results for any visitor (no auth dependency for public content)

**Constraints:**
- Must not break existing single-tag URLs (`?tag=X` continues to work as before)
- Must not break existing sort behavior (`?sort=oldest` continues to use `created_at`)
- Version filtering applies to points only (stories don't have v-tags in the current model)

---

## User Stories

**As a content curator sharing a teaching arc:**
- I want to share one URL that shows the understanding narrative (9 points, latest versions, st1-st9 order), so that readers see a clean, current arc without version noise

**As a feed browser exploring topics:**
- I want to select multiple tags at once (e.g., understanding + motivation), so I can see related content in one view without switching between tag filters
- I want to deselect individual tags from my multi-tag filter, so I can narrow my view incrementally

**As someone viewing versioned content:**
- I want a "latest version" toggle, so I see only the most current version of each point without duplicates
- I want to turn off the version filter when I want to see the full history of how points evolved

---

## Jobs to Be Done

**When sharing a feed link with a partner or event group:**
- I want the link to show exactly the curated set I intend (specific tags, latest versions, narrative order), so recipients see a clean teaching sequence — not a raw dump of all tagged content

**When browsing the feed to understand a topic:**
- I want to combine related tags into one view, so I can see the full picture (e.g., both the understanding points AND the motivation statements for the same arc)

**When reviewing my own content evolution:**
- I want to toggle between "latest only" and "all versions," so I can see either the current state or the full revision history

---

## Outcomes (Success Metrics)

- `/feed?tag=understanding&sort=oldest&version=latest` returns exactly 9 points, one per st-slot, in st1-st9 order
- `/feed?tag=understanding,motivation&sort=oldest` returns understanding + motivation points combined
- Existing single-tag URLs (`?tag=understanding`) continue to work identically to today (backward compatible)
- Tag cloud allows multi-select without page navigation (no full page reload per tag toggle)

---

## Acceptance Criteria

- [ ] User can select multiple tags from the tag cloud (additive toggle, not replacement)
- [ ] URL updates to reflect all selected tags in a shareable format
- [ ] Feed results include points matching ANY of the selected tags (OR logic)
- [ ] User can dismiss individual tags from the active filter
- [ ] `version=latest` parameter shows only the highest-versioned point per st-group
- [ ] `version=latest` combined with `tag=understanding` and `sort=oldest` returns one point per st-group, ordered by created_at
- [ ] Tag cloud shows all public tags regardless of current filter (computed from all content, not filtered subset)
- [ ] Points without v-tags treated as v1 during version collapse
- [ ] Single-tag URLs (`?tag=X`) continue to work without changes (backward compatible)
- [ ] Version filter applies to points tab only (stories tab unaffected)
- [ ] All filtered/versioned URLs are shareable — same result for any visitor

---

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| URL param (multi-tag) | `?tag=X,Y` or `?tag=X&tag=Y` | Both formats supported, OR logic |
| URL param (version) | `?version=latest` | Collapse to highest vN per st-group |
| Tag cloud behavior | Toggle on/off | Click adds tag; click again removes. `role="checkbox"` with `aria-checked` |
| Active tag chips | Individual dismiss (x) buttons | One chip per active tag. `aria-label="Remove filter for #tagname"` |
| Version toggle label (OFF) | "Latest" with unfilled circle | Tab bar row, right of tabs |
| Version toggle label (ON) | "Latest" with filled circle | `role="switch"`, `aria-checked`, `aria-label="Show latest versions only"` |
| Empty state (multi-tag) | "No content matching #X or #Y yet" | Lists all active tags |
| Empty state (multi-tag) CTA | "Browse all content" | Clears all tags |

---

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Tag cloud computed from filtered results breaks multi-select | Added BR-8: tag cloud computed from ALL public content, filtering client-side | Dataset is 21 points — fetching all is trivial, no new API needed |
| 2 | /challenge-prd | [BLOCK] No edge case spec for missing st/v-tags during version collapse | Added BR-9: no v-tag = v1, no st-tag = excluded from collapse. Verified invariant: all 21 prod points have exactly 1 st-tag + >=1 v-tag | Prod data is clean; defensive behavior specified for future-proofing |
| 3 | /challenge-prd | [WARN] BR-7 "exactly 9 points" is fragile data assertion | Rewrote to "one point per st-group" instead of hardcoded count | Future st10+ additions won't break the criterion |
| 4 | /challenge-prd | [WARN] Feature is off stated critical path | Accepted — scope is client-side only, 2-4 hours, improves founder's ability to share narrative arc URLs for workshop prep |

---

## UX Design

### User Flow: Multi-Tag Selection

**Entry:** User lands on `/feed` (or `/feed?tag=X` from a shared link).

1. User sees tag cloud above the tab bar. All public topic tags shown as chips (internal tags `st\d+` and `v\d+` hidden).
2. User clicks a tag chip → chip gets highlighted (blue ring), URL updates to `?tag=X`, feed filters to matching content.
3. User clicks a second tag chip → chip also highlights, URL updates to `?tag=X,Y`, feed shows content matching X OR Y.
4. User clicks an already-highlighted chip → chip deselects, URL removes that tag from comma list.
5. Below the tag cloud, active filter area shows one pill per selected tag, each with an (x) dismiss button.
6. User clicks (x) on a pill → that tag deselected, URL updated, feed re-filtered.
7. If all tags dismissed → URL has no `?tag` param, feed shows all content (unfiltered).

**From shared URL:** User opens `/feed?tag=understanding,motivation&sort=oldest` → tag cloud shows `understanding` and `motivation` highlighted, active filter shows both pills, feed shows matching points sorted oldest first.

### User Flow: Version Filter

1. On the Points tab, user sees a "Latest versions" toggle in the tab bar row (right side, next to sort toggle).
2. Toggle is OFF by default (all versions shown).
3. User clicks toggle → ON state, URL adds `?version=latest`, feed collapses to one point per st-group (highest vN).
4. User clicks toggle again → OFF, URL removes `?version=latest`, all versions shown.
5. Toggle persists across tag changes — combining `?tag=understanding&version=latest&sort=oldest` works.
6. When on Stories tab, version toggle is hidden (stories don't have v-tags).

### Screen Layout

```
┌──────────────────────────────────────────────────────┐
│  Home                              [Share a Story]   │
├──────────────────────────────────────────────────────┤
│  🔍 Search stories and points...                     │
├──────────────────────────────────────────────────────┤
│  #understanding  #misunderstanding  #motivation      │  ← tag cloud (toggle)
├──────────────────────────────────────────────────────┤
│  Showing: [understanding ×] [motivation ×]           │  ← active pills
├──────────────────────────────────────────────────────┤
│  Points   Stories          Latest ○  Oldest first ↑↓ │  ← tab bar + controls
│  ────                                                │
├──────────────────────────────────────────────────────┤
│  [Point card st1 v1...]                              │
│  [Point card st2 v1...]                              │
│  ...                                                 │
└──────────────────────────────────────────────────────┘
```

### Version Toggle Design

**Placement:** Tab bar row, between tab buttons and sort toggle. Right-aligned with sort.

**Form:** Small toggle switch with label. OFF = "All versions", ON = "Latest only".

```
Points   Stories          Latest ○  Oldest first ↑↓
────
```

When ON:
```
Points   Stories          Latest ●  Oldest first ↑↓
────
```

**Why a toggle, not a button:** Version state is binary (on/off) and persists — a toggle communicates this better than a button that implies a one-time action.

### Tag Cloud Behavior

**Visual states for chips:**
- **Unselected:** `bg-muted text-muted-foreground` (existing style)
- **Selected:** `bg-blue-100 text-blue-800 ring-1 ring-blue-300` (existing active style)
- **Hover (unselected):** `bg-blue-50 text-blue-600` (existing hover style)

**Key change from current:** Currently, clicking a tag REPLACES the active tag and the active chip is `disabled`. New behavior: clicking TOGGLES — chips are never disabled, just visually toggled on/off.

### Edge Cases

**Empty results after multi-tag filter:**
- "No content matching #X or #Y yet" — list all active tags
- "Browse all content" link clears all tags

**Version filter with no multi-version st-groups:**
- Toggle works but produces no visible change (all st-groups already have one version). No special message needed.

**URL with unknown tag:**
- `?tag=nonexistent` → feed shows empty, tag cloud does NOT highlight unknown tag (it won't appear in the cloud). Active filter area shows the pill with (x) dismiss.

**Comma in tag name:**
- Current tags don't contain commas. If a tag contains a comma, it would conflict with the URL format. Acceptable limitation — tags should not contain commas.

**Very long tag list in URL:**
- No artificial limit. Comma-separated format handles any count. Mobile URL bar truncation is the browser's concern.

**Switching tabs with version=latest active:**
- Points tab: version filter applied
- Stories tab: version filter param stays in URL but has no effect (stories don't have v-tags). Toggle is hidden on Stories tab to avoid confusion.

### Accessibility

- **Tag cloud chips:** `role="checkbox"` with `aria-checked` (true/false) for multi-select semantics. Keyboard: Tab to focus, Space/Enter to toggle.
- **Active filter pills:** Each dismiss button has `aria-label="Remove filter for #tagname"`.
- **Version toggle:** `role="switch"` with `aria-checked` and `aria-label="Show latest versions only"`.
- **Screen reader announcements:** When tag selection changes, `aria-live="polite"` region announces "Filtered by: #X, #Y" or "No tag filter active".

### Responsive Design

**Mobile (320-767px):**
- Tag cloud wraps naturally (flex-wrap). If many tags, scrollable area would be needed but current 3 tags fit easily.
- Active filter pills wrap below tag cloud.
- Version toggle and sort toggle stay in tab bar row — fits within 320px with abbreviated labels if needed ("Latest ○" and "Oldest ↑↓").

**Tablet/Desktop (768px+):**
- Same layout, more horizontal space. No changes needed.

---

## Test Coverage Strategy

**What's Tested:**
- Unit: tag parsing, serialization, OR-logic filtering, version collapse per st-group, edge cases (missing tags, empty input)
- E2E: multi-tag toggle flow, dismiss pills, version toggle on/off, combined URL params, backward compatibility, empty states, tag cloud independence
- A11y: ARIA roles (checkbox, switch), keyboard navigation (Space/Enter toggle), descriptive labels
- Smoke: page loads without errors for base URL and complex filter URL

**What's NOT Tested (rationale):**
- Integration tests — no DB/API changes; all filtering is client-side
- Component internals — covered by E2E user flows
- Stories tab multi-tag — identical code path to Points tab, no separate test needed

**Files Generated:**
- `src/tests/p602-feed-filters.test.ts` — 18 unit tests (parse, serialize, filter, collapse)
- `e2e/p602-feed-multi-tag.spec.ts` — 9 E2E tests (multi-tag, version, combined, edge cases)
- `e2e/p602-feed-smoke.spec.ts` — 2 smoke tests
- `e2e/a11y/p602-accessibility.spec.ts` — 4 accessibility tests
- `features/uat/p602.md` — 12 UAT scenarios

**Total:** 33 automated tests + 12 UAT scenarios
