---
status: week
type: story
rank: 8.0
workstream: C2
tags: [feed, tags, filtering, version]
prepped_date: '2026-03-29'
delivery_stage: 1-prd-review
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
- **BR-7:** `/feed?tag=understanding&sort=oldest&version=latest` returns exactly 9 points (one per st-slot, latest version), ordered st1 through st9.

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
- [ ] `version=latest` combined with `tag=understanding` and `sort=oldest` returns exactly 9 points in st1-st9 order
- [ ] Single-tag URLs (`?tag=X`) continue to work without changes (backward compatible)
- [ ] Version filter applies to points tab only (stories tab unaffected)
- [ ] All filtered/versioned URLs are shareable — same result for any visitor

---

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| URL param (multi-tag) | `?tag=X,Y` | Comma-separated, OR logic |
| URL param (version) | `?version=latest` | Collapse to highest vN per st-group |
| Tag cloud behavior | Toggle on/off | Click adds tag; click again removes |
| Active tag chips | Individual dismiss (x) buttons | One chip per active tag |

---

## Next Steps

1. Run `/challenge-prd features/p602_feed_multi_tag_version_filter.md` to stress-test requirements
2. Run `/ux features/p602_feed_multi_tag_version_filter.md` to design tag cloud multi-select and version toggle UX
3. Run `/architect features/p602_feed_multi_tag_version_filter.md` for technical approach
4. Run `/dev features/p602_feed_multi_tag_version_filter.md` to implement
