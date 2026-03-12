---
title: "P491: Hashtag Feed — Public Content Discovery by Tag"
status: in-progress
type: feature
rank: 8.0
workstream: C2
tags: [feed, hashtags, discovery, navigation]
prepped_date: '2026-03-10'
delivery_stage: uat
flow: dev
reviews:
  ux: '2026-03-10'
  architect: '2026-03-10'
  alignment: null
uat_file: features/uat/p491.md
test_files:
  - src/tests/p491-hashtag-feed.test.tsx
  - src/tests/p491-feed-service.test.ts
  - e2e/p491-hashtag-feed.spec.ts
  - e2e/p491-feed-smoke.spec.ts
  - e2e/a11y/p491-accessibility.spec.ts
---

# P491: Hashtag Feed — Public Content Discovery by Tag

## Problem Statement

ClarityPledge users create stories and points with tags, but tags are invisible — never rendered on cards, never clickable, and there is no way to browse public content by topic. This creates three concrete pain points:

1. **Partner prep is manual.** Before a /live session, a user who wants to share relevant stories with their partner must copy-paste individual links. There is no way to send a single URL that shows "all my public stories tagged #fundraising."

2. **Event participants can't discover each other's content.** At in-person events, participants want to browse public stories and points by topic (e.g., #co-founder-conflict, #pitch-practice). Today they'd have to search blindly or ask each person individually.

3. **Tags are dead data.** Tags exist in the database and type system but deliver zero user value. Users who tag their content see no benefit, which discourages tagging and reduces content quality over time.

**Who's affected:** Active users preparing for /live sessions, event participants browsing community content, and any user who tags their stories or points expecting discoverability.

## Intention (Why This Matters)

**Strategic:** ClarityPledge's value compounds with network effects — the more users can discover and learn from each other's calibrated communication, the stickier the product becomes. A public feed with tag-based filtering is the first step toward content-driven community engagement, directly supporting the co-founder pair target audience who benefit from seeing how others navigate similar challenges.

**Why now:** Tags already exist in the data model (P424 added visibility to stories, tags exist on both stories and points). The infrastructure is ready — this is a rendering and navigation problem, not a data model problem. Event usage is growing, and partner prep is a repeated friction point in /live sessions.

**Impact if not solved:** Tags remain dead metadata. Partner prep stays manual. Event participants have no self-serve content discovery. The product misses an opportunity to create browse-and-discover behavior that drives retention.

## Business Requirements

### Must-haves

- **BR-1:** A feed page at `/feed` where users can browse public points and public stories.
- **BR-2:** The feed has two tabs — Points (default/first) and Stories.
- **BR-3:** Tags appear as clickable pills on story and point cards wherever they are rendered.
- **BR-4:** Clicking a tag pill navigates to `/feed?tag=X`, showing only content matching that tag.
- **BR-5:** The `/feed?tag=X` URL is shareable — anyone with the link sees the same filtered view.
- **BR-6:** For authenticated users, `/feed` becomes the logged-in home (redirect from `/`).
- **BR-7:** Feed replaces History in mobile bottom navigation. History moves to a dropdown/overflow menu.
- **BR-8:** Tag pills on cards within `/live` context do NOT navigate away — they are display-only (non-clickable).
- **BR-9:** Only public content appears in the feed (`visibility: 'public'` for stories; equivalent for points).
- **BR-10:** A tag cloud at the top of the feed (above the tab bar) shows all distinct tags from public content as clickable chips, sorted by frequency. When a `?tag=X` filter is active, that chip is visually highlighted. Clicking a chip applies that tag filter.
- **BR-11:** A search bar above the tag cloud allows client-side text filtering of feed cards (story content / point statement). Search and tag filter can be combined. Placeholder: "Search stories and points..."

### Success conditions

- A user can send a partner a single URL (e.g., `/feed?tag=fundraising`) that shows all public content tagged with that topic.
- At an event, a participant can open the feed, tap a tag they see on any card, and instantly see all public content with that tag.
- Tags are visible on every story and point card that has them.

### Constraints

- No new database columns or migrations required (tags and visibility already exist).
- Public content only — no private or shared content appears in the feed.
- Must not break existing /live search functionality (search already works on content text).

## User Stories

- **US-1:** As a user preparing for a /live session, I want to send my partner a link filtered by a specific tag so they can review relevant stories before we start.
- **US-2:** As an event participant, I want to browse public stories and points by topic so I can discover content from other participants.
- **US-3:** As a user viewing a story or point card, I want to see its tags displayed as pills so I know what topics it covers.
- **US-4:** As a user viewing a card with tags, I want to click a tag pill to see all public content with that tag so I can explore related content.
- **US-5:** As an authenticated user, I want the feed to be my home page so I see community content when I open the app.
- **US-6:** As a user in a /live session, I want tag pills to be visible but non-navigating so I'm not accidentally taken out of the session.
- **US-7:** As a user, I want to access my History from a menu so I can still review my past sessions after the nav change.
- **US-8:** As a user sharing a filtered feed URL, I want the recipient to see the same filtered content so we have shared context.
- **US-9:** As a user opening the feed without a tag filter, I want to see a tag cloud of popular topics so I can quickly discover and jump into content that interests me.
- **US-10:** As a user browsing the feed, I want to search by text so I can find specific stories or points without scrolling through the entire feed.

## Jobs to Be Done

- **JTBD-1:** When I'm preparing my partner for an upcoming /live session, I want to share a curated set of my public stories by topic, so I can give them context without manual copy-pasting.
- **JTBD-2:** When I'm at a ClarityPledge event and curious about a topic, I want to browse what others have shared publicly on that topic, so I can find conversation starters and learn from their experiences.
- **JTBD-3:** When I see a tag on someone's story card, I want to tap it and see more content on that topic, so I can go deeper on subjects that interest me.
- **JTBD-4:** When I open the app as a returning user, I want to see a feed of community content, so I'm immediately engaged rather than staring at an empty landing page.

## Outcomes (Success Metrics)

- **OM-1:** Within 4 weeks of launch, at least 20% of authenticated page loads on `/` result in feed engagement (scroll, tab switch, or tag click).
- **OM-2:** At least 10 unique `/feed?tag=X` URLs are shared (measured by external referrer or clipboard events) within the first 2 events where ClarityPledge is used.
- **OM-3:** Tag click-through rate on cards in the feed is >5% (users who see tags click at least one).
- **OM-4:** History page usage does not drop by more than 30% after relocation to dropdown menu (users can still find it).

## Acceptance Criteria

- [ ] A `/feed` page exists and is accessible to all authenticated users.
- [ ] The feed displays two tabs: Points (shown first) and Stories.
- [ ] Points tab shows public points; Stories tab shows public stories.
- [ ] Tags appear as visible pills on story and point cards that have tags.
- [ ] Clicking a tag pill on the feed navigates to `/feed?tag=X` and filters content to that tag.
- [ ] The `/feed?tag=X` URL works when shared — the recipient sees the same filtered content.
- [ ] Authenticated users visiting `/` are redirected to `/feed`.
- [ ] Mobile bottom navigation shows Feed where History previously appeared.
- [ ] History is accessible from a dropdown or overflow menu.
- [ ] Tag pills in `/live` context are displayed but not clickable (no navigation).
- [ ] Only content with `visibility: 'public'` (or equivalent for points) appears in the feed.
- [ ] Existing /live search functionality continues to work unchanged.
- [ ] The feed works on both mobile and desktop viewports.
- [ ] A tag cloud above the tab bar shows all distinct tags from public content as clickable chips, sorted by frequency (most used first).
- [ ] Clicking a tag cloud chip applies that tag as a filter (`/feed?tag=X`).
- [ ] When a `?tag=X` filter is active, the corresponding chip in the tag cloud is visually highlighted.
- [ ] A search bar above the tag cloud allows filtering cards by text content (story content / point statement).
- [ ] Search and tag filter can be combined (search within a tag).
- [ ] Search uses client-side filtering (same pattern as StorySearchPicker in /live).

---

**Chosen flow:**

`/create-prd` → `/ascii-flows` → `/ux` → `/architect` → `/generate-tests` → `/spec-review` → `/decompose` → `/dev` → `/verify`

---

## ASCII Flows

### 1. Feed Page Layout — Mobile

```
 POINTS TAB ACTIVE, NO TAG FILTER (BARE FEED)
 ┌─────────────────────────────┐
 │  [CP Logo]            [Av]  │  ← top nav
 ├─────────────────────────────┤
 │  [🔍 Search stories...]     │  ← search bar
 │                             │
 │  #trust #equity #remote     │  ← tag cloud
 │  #fundraising #leadership   │    (clickable chips,
 │                             │     sorted by frequency)
 │  [ Points ]  [ Stories ]    │  ← tab bar, Points = active
 │   ────────                  │
 │                             │
 │  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  │
 │  │ Pin  Community Point   │  │  ← PointCardWithLinks
 │  │      "Remote work..."  │  │
 │  │  [Agree] [?] [Disagr]  │  │
 │  │  #remote  #fundraising │  │  ← tag pills row
 │  │  ▸ 3 stories   [↗][⤴] │  │
 │  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
 │                             │
 │  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  │
 │  │ Pin  Another Point     │  │
 │  │      "Co-founder..."   │  │
 │  │  [Agree] [?] [Disagr]  │  │
 │  │  #co-founder-conflict  │  │
 │  │  ▸ 1 story     [↗][⤴] │  │
 │  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
 │                             │
 │          · · ·              │  ← more cards (scroll)
 │                             │
 ├─────────────────────────────┤
 │ Feed | Session | Events|Prof│  ← bottom nav
 └─────────────────────────────┘


 STORIES TAB ACTIVE, TAG FILTER APPLIED
 ┌─────────────────────────────┐
 │  [CP Logo]            [Av]  │
 ├─────────────────────────────┤
 │  [🔍 Search stories...]     │  ← search bar (still visible)
 │                             │
 │  #trust #equity #remote     │  ← tag cloud
 │  [#fundraising] #leadership │    (#fundraising highlighted)
 │                             │
 │  [ Points ]  [ Stories ]    │
 │               ─────────     │  ← Stories tab active
 │                             │
 │  Showing: [fundraising ✕]   │  ← tag filter pill with dismiss
 │                             │
 │  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  │
 │  │▌ (Av) Slava           │  │  ← StoryCardWithLinks
 │  │▌ Member · 2d ago      │  │
 │  │▌ "Our first pitch..." │  │
 │  │▌ 3 understood         │  │
 │  │▌ #fundraising #pitch  │  │
 │  │  ▸ 2 points   [↗][⤴] │  │
 │  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
 │                             │
 ├─────────────────────────────┤
 │ Feed | Session | Events|Prof│
 └─────────────────────────────┘


 EMPTY STATE (tag filter, no matches)
 ┌─────────────────────────────┐
 │  [CP Logo]            [Av]  │
 ├─────────────────────────────┤
 │                             │
 │  [ Points ]  [ Stories ]    │
 │   ────────                  │
 │                             │
 │  Showing: [vaporware ✕]     │
 │                             │
 │         ┌ ─ ─ ─ ─ ─ ┐      │
 │         │   (empty)  │      │
 │         │            │      │
 │         │  No public │      │
 │         │  content   │      │
 │         │  tagged    │      │
 │         │ #vaporware │      │
 │         │            │      │
 │         │ [Browse all│      │
 │         │  content]  │      │  ← clears tag filter
 │         └ ─ ─ ─ ─ ─ ┘      │
 │                             │
 ├─────────────────────────────┤
 │ Feed | Session | Events|Prof│
 └─────────────────────────────┘
```

### 2. Feed Page Layout — Desktop

```
 ┌──────────────────────────────────────────────────────────────────┐
 │ [CP Logo]    [My Events] [My Profile] [Start Session] [Av ▾]   │
 ├──────────────────────────────────────────────────────────────────┤
 │                                                                  │
 │            ┌──────────────────────────────────┐                  │
 │            │  [ Points ]    [ Stories ]        │                  │
 │            │   ────────                        │                  │
 │            │                                   │                  │
 │            │  ┌──────────────────────────────┐ │                  │
 │            │  │ Pin  "Remote work increases" │ │                  │
 │            │  │ [Agree] [Unsure] [Disagree]  │ │                  │
 │            │  │ #remote  #productivity        │ │                  │
 │            │  │ ▸ 5 stories        [↗] [⤴]  │ │                  │
 │            │  └──────────────────────────────┘ │                  │
 │            │                                   │                  │
 │            │  ┌──────────────────────────────┐ │                  │
 │            │  │ Pin  "Fundraising requires"  │ │                  │
 │            │  │ [Agree] [Unsure] [Disagree]  │ │                  │
 │            │  │ #fundraising                  │ │                  │
 │            │  │ ▸ 2 stories        [↗] [⤴]  │ │                  │
 │            │  └──────────────────────────────┘ │                  │
 │            │                                   │                  │
 │            └──────────────────────────────────┘                  │
 │             max-width container, centered                        │
 └──────────────────────────────────────────────────────────────────┘
   No bottom nav on desktop (lg:hidden).
```

### 3. Tag Pill Detail

```
  Card content...
  "Our fundraising round was harder than expected..."

  ┌──────────────┐  ┌──────────┐  ┌─────────────────┐
  │ #fundraising │  │ #pitch   │  │ #co-founder     │
  └──────────────┘  └──────────┘  └─────────────────┘
    ↑ clickable: rounded-full, bg-muted, text-sm,
      hover:bg-blue-50, hover:text-blue-600, cursor-pointer

  On /live context:
  ┌──────────────┐  ┌──────────┐
  │ #fundraising │  │ #pitch   │   ← same visual
  └──────────────┘  └──────────┘     but cursor-default,
                                     no hover, no onClick
```

### 4. Tag Click Navigation Flow

```
  USER ON ANY PAGE WITH CARDS
  ┌──────────────────────────────────────┐
  │  ┌────────────────────────────────┐  │
  │  │  Story by Slava                │  │
  │  │  "Our first pitch deck..."     │  │
  │  │  [#fundraising] [#pitch]       │  │
  │  │       ↑                        │  │
  │  └──────┼─────────────────────────┘  │
  └─────────┼────────────────────────────┘
            │ click
            ▼
  navigate("/feed?tag=fundraising")
            │
            ▼
  ┌──────────────────────────────────────┐
  │  /feed?tag=fundraising               │
  │  [ Points ]  [ Stories ]             │
  │   ────────                           │
  │  Showing: [fundraising ✕]            │
  │            click ✕ → /feed (no tag)  │
  │                                      │
  │  ┌────────────────────────────────┐  │
  │  │  Pin: "Fundraising requires.."│  │
  │  │  #fundraising                  │  │ ← already active tag,
  │  └────────────────────────────────┘  │   no-op on click
  │  ┌────────────────────────────────┐  │
  │  │  Pin: "VCs want traction..."  │  │
  │  │  #fundraising #traction        │  │ ← #traction navigates
  │  └────────────────────────────────┘  │   to /feed?tag=traction
  └──────────────────────────────────────┘
```

### 5. Mobile Bottom Nav — Before and After

```
 BEFORE:
 ┌───────────┬───────────┬───────────┬───────────┐
 │   Mic     │  History  │ Calendar  │   User    │
 │   Start   │  History  │ My Events │ My Profile│
 │  Session  │           │           │           │
 └───────────┴───────────┴───────────┴───────────┘
   /live       /sessions   /events     /p/{slug}

 AFTER:
 ┌───────────┬───────────┬───────────┬───────────┐
 │   Hash    │   Mic     │ Calendar  │   User    │
 │   Feed    │   Start   │ My Events │ My Profile│
 │           │  Session  │           │           │
 └───────────┴───────────┴───────────┴───────────┘
   /feed       /live       /events     /p/{slug}
```

### 6. Logged-in Home Redirect

```
 User navigates to "/"
          │
    ┌─────┴─────┐
   YES          NO  ← authenticated?
    │           │
    ▼           ▼
 Redirect    Show landing page
 to /feed    (ClarityPledgeLanding)
```

### 7. History Relocation — Dropdown Menu

```
 Desktop avatar dropdown (AFTER):
 ┌──────────────────┐
 │ Session History   │  ← NEW: moved from icon bar
 │ ──────────────── │
 │ Pledgers          │
 │ Manifesto         │
 │ Blog              │
 │ About             │
 │ ──────────────── │
 │ Settings          │
 │ ──────────────── │
 │ Log Out           │
 └──────────────────┘

 Mobile hamburger (AFTER):
 ┌──────────────────┐
 │ Session History   │  ← NEW
 │ Pledgers          │
 │ Manifesto         │
 │ Blog              │
 │ About             │
 │ Settings          │
 │ Log Out           │
 └──────────────────┘
```

### 8. Live Session Tag Behavior

```
 /live/abc-123 — Active Session
 ┌─────────────────────────────────────┐
 │  Partner's Story                     │
 │  ┌───────────────────────────────┐  │
 │  │▌ (Av) Partner Name            │  │
 │  │▌ "When we discussed equity..."│  │
 │  │▌ #co-founder  #equity         │  │ ← VISIBLE but:
 │  │▌  - no cursor:pointer          │  │   display-only
 │  │▌  - no hover effect            │  │   no navigation
 │  │▌  - no onClick                 │  │
 │  │  [Understand] [Ask more]      │  │
 │  └───────────────────────────────┘  │
 └─────────────────────────────────────┘
```

### 9. Partner Prep Flow

```
 User A                              Partner B
 ──────                              ─────────
 Opens /feed                              │
 Clicks #fundraising                      │
 → /feed?tag=fundraising                  │
 Copies URL from address bar              │
 Sends via WhatsApp/email ──────────►Opens link
                                     /feed?tag=fundraising
                                     Sees filtered public content
                                     (auth not required to VIEW)
                                     Position buttons → signup gate
```

### 10. Tag Cloud Behavior

```
 TAG CLOUD — NO FILTER ACTIVE
 ┌─────────────────────────────┐
 │  #trust(5) #equity(4)       │  ← chips sorted by frequency
 │  #remote(3) #fundraising(3) │    (count shown for clarity,
 │  #leadership(2) #pitch(1)   │     not rendered in UI)
 └─────────────────────────────┘
   All chips: bg-muted, text-sm, rounded-full
   Click any chip → navigate("/feed?tag=X")


 TAG CLOUD — ?tag=equity ACTIVE
 ┌─────────────────────────────┐
 │  #trust  [#equity]  #remote │  ← #equity highlighted
 │  #fundraising  #leadership  │    (bg-blue-100, text-blue-800,
 │  #pitch                     │     ring-1 ring-blue-300)
 └─────────────────────────────┘
   Clicking highlighted chip → no-op (already active)
   Clicking another chip → replaces filter

 DATA SOURCE:
   SELECT tag, COUNT(*) as freq FROM (
     SELECT UNNEST(tags) AS tag FROM stories
       WHERE visibility = 'public'
     UNION ALL
     SELECT UNNEST(tags) AS tag FROM points
   ) sub
   GROUP BY tag ORDER BY freq DESC
```

### 11. Search Bar Behavior

```
 SEARCH INTERACTION FLOW
 ┌──────────────────────────────────────┐
 │  [🔍 Search stories and points... ]  │
 └──────────────────────────────────────┘
          │ user types "fundrais"
          ▼
 ┌──────────────────────────────────────┐
 │  [🔍 fundrais                    ✕ ] │  ← clear button
 └──────────────────────────────────────┘
          │ client-side filter
          ▼
  Cards filtered: story.content or
  point.statement includes "fundrais"
  (case-insensitive substring match)

 COMBINED WITH TAG FILTER:
  ?tag=equity + search "fundrais"
  → shows only cards that match BOTH:
    - tagged with #equity
    - content contains "fundrais"

 CLEAR BEHAVIOR:
  ✕ button or empty input → resets search
  Tag filter remains independent
```

---

## UX Requirements

### 1. User Flows

#### Flow A: Browse the Feed (US-2, US-5, JTBD-4)

1. Authenticated user opens `/` or taps Feed in bottom nav
2. Redirect lands on `/feed`
3. Points tab is active (default). Single-column list of public point cards loads
4. User scrolls through cards. Each card shows tag pills below content text
5. User taps "Stories" tab to switch. URL updates to `/feed?tab=stories`. Stories tab loads
6. User scrolls through story cards with tag pills visible

#### Flow B: Filter by Tag (US-4, US-2, JTBD-3)

1. User sees tag pills on a card (e.g., "fundraising", "co-founder-conflict")
2. User taps a tag pill
3. Navigation: `/feed?tag=fundraising` (preserves current tab if `&tab=stories` was active)
4. Feed reloads showing only content matching that tag
5. Active tag filter pill appears at top of feed: "[tag name] X"
6. User can tap the X to dismiss filter, returning to unfiltered `/feed`
7. User can tap a different tag pill on a filtered card to switch filters

#### Flow C: Share a Filtered Feed URL (US-1, US-8, JTBD-1)

1. User navigates to `/feed?tag=fundraising`
2. User copies the URL from browser address bar
3. Recipient opens the link
4. If authenticated: sees the filtered feed directly
5. If anonymous: sees the same filtered public feed (no auth gate on read-only browsing)

#### Flow D: Authenticated Home Redirect (US-5)

1. Authenticated user navigates to `/`
2. App detects authenticated state and redirects to `/feed`
3. Anonymous user navigates to `/` — sees existing landing page (no redirect)

#### Flow E: History Access After Nav Change (US-7)

1. User wants to access History (previously in bottom nav)
2. Mobile: taps hamburger menu — History appears at the top of the menu item list
3. Desktop: clicks avatar dropdown — History appears at the top of the dropdown list
4. User taps History — navigates to `/sessions` as before

#### Flow F: Tags in /live Context (US-6)

1. User is in a /live session viewing story or point cards
2. Tag pills are visible on cards that have tags
3. Tags render with muted styling and no hover/focus effects
4. Tapping a tag pill does nothing (no navigation, no visual feedback beyond standard tap)

#### Flow G: Discover via Tag Cloud (US-9, BR-10)

1. User opens `/feed` (no tag filter active)
2. Above the tab bar, a tag cloud shows all distinct tags from public content as clickable chips
3. Chips are sorted by frequency (most used first)
4. User taps a chip (e.g., "#fundraising")
5. Navigation: `/feed?tag=fundraising` — same as tapping a tag pill on a card
6. The tag cloud remains visible; the "#fundraising" chip is now highlighted (bg-blue-100, ring)
7. Clicking the highlighted chip is a no-op (already active)
8. Clicking a different chip replaces the current tag filter

#### Flow H: Search Content in Feed (US-10, BR-11)

1. User opens `/feed` and sees the search bar above the tag cloud
2. User types into the search bar (e.g., "fundrais")
3. Client-side: cards are filtered to only show those whose content (story text or point statement) contains the search string (case-insensitive substring match)
4. A clear (✕) button appears in the search input when non-empty
5. Clearing the search (✕ or empty input) restores the full list
6. Search works independently of tag filter — both can be active simultaneously
7. When both are active, only cards matching BOTH the tag AND the search text are shown
8. Search state is local (not in URL) — refreshing the page clears the search but preserves the tag filter

### 2. Screen Designs

#### Feed Page (`/feed`)

**Layout (top to bottom):**

1. **Page header:** "Feed" title (consistent with other page headers)
2. **Search bar:** Text input with search icon and placeholder "Search stories and points...". Clear (✕) button when non-empty. Full-width within content container
3. **Tag cloud:** Horizontally wrapping row of clickable tag chips. Each chip shows `#tagname`. Sorted by frequency (most used first). When `?tag=X` is active, that chip is highlighted (`bg-blue-100 text-blue-800 ring-1 ring-blue-300`); others remain default (`bg-muted text-sm`). Query: `SELECT tag, COUNT(*) FROM (SELECT UNNEST(tags) FROM stories WHERE visibility='public' UNION ALL SELECT UNNEST(tags) FROM points) GROUP BY tag ORDER BY count DESC`
4. **Active tag filter pill (conditional):** Only shown when `?tag=X` is active. Positioned between tag cloud and tabs. Shows tag name + dismiss X button. Full-width row, left-aligned pill
5. **Tab bar:** Two tabs — "Points" (default active) | "Stories". Underline-style active indicator. Tapping a tab updates content below without full page reload
6. **Content area:** Single-column card list, max-width matching existing page container. Cards render with the same visual treatment as profile and detail pages (blue left border for stories, slate left border for points)
7. **Bottom spacing:** Enough padding to clear mobile bottom nav (16px + safe area)

**Card anatomy — tag pills placement:**

Tags appear in a new row below the content text and above the footer/stats row:
- Row of horizontally wrapping pills
- Each pill: `rounded-full`, `bg-muted` background, `text-sm`, `px-2.5 py-0.5`
- On feed/profile/detail pages: pills are links (`<Link to="/feed?tag=X">`) with hover state (slightly darker background)
- On /live pages: pills are `<span>` elements with no interactive styling

**Active tag filter pill (at top of feed):**

- Pill with tag name + X icon button
- Background: slightly more prominent than card-level tag pills (e.g., `bg-blue-100 text-blue-800`)
- X button: `aria-label="Remove tag filter"`, keyboard accessible
- When dismissed: URL reverts to `/feed` (or `/feed?tab=stories` if on stories tab)

**Tab bar:**

- Two text tabs, horizontally adjacent, left-aligned
- Active tab: bold text + bottom border accent
- Inactive tab: normal weight, muted text color
- Tab switching is instant (client-side), updates URL param `?tab=stories` or removes it for Points (default)

**Empty state (filtered feed with no results):**

- Centered message: "No content tagged [tag name] yet"
- Below: "Browse all content" button linking to `/feed` (removes tag filter)
- Friendly, non-alarming tone

**Empty state (unfiltered feed with no content at all):**

- Centered message: "No public content yet"
- Below: brief guidance text like "Stories and points shared publicly will appear here"
- No action button (nothing the viewer can do to fix an empty public feed)

**Loading state:**

- Skeleton cards (3-4 placeholder cards with pulsing gray rectangles matching card layout)
- No spinner — skeleton feels faster and less jarring

**Error state:**

- Centered error message: "Could not load feed. Please try again."
- Retry button
- Toast notification is acceptable as alternative

#### Bottom Navigation Changes

**New order (4 items):**
1. Feed (new, replaces History) — uses an icon suggesting content/list (e.g., LayoutList or Newspaper)
2. Start Session (unchanged)
3. My Events (unchanged)
4. My Profile (unchanged)

**Active state:** Feed tab highlights when on `/feed` or `/feed?tag=X`

#### Navigation Menu Changes (History relocation)

**Mobile hamburger menu:** History item added at the top of the verified-user menu items (above Pledgers), with the existing History icon

**Desktop avatar dropdown:** History item added at the top of the verified-user dropdown items (above Pledgers), with the existing History icon

### 3. Edge Cases

**No tags on a card:**
- Tag row is simply not rendered. No empty row, no "No tags" placeholder. Card renders identically to current behavior

**Very long tag name (e.g., "this-is-an-extremely-long-hyphenated-tag-name"):**
- Tag pill truncates with ellipsis after ~20 characters (`max-w-[200px] truncate`)
- Full tag name visible as `title` attribute on hover (tooltip)
- URL still uses the full tag string

**Many tags on a single card (e.g., 8+ tags):**
- Tags wrap to multiple rows (flex-wrap)
- No "show more" collapse — all tags visible. Tags are small pills; even 8 tags take only 2-3 rows
- If a card has more than 10 tags, show first 8 + "+N more" pill that links to the content detail page

**Tag with special characters:**
- Tags are URL-encoded in the `?tag=` param (handled by router)
- Display shows the decoded, human-readable tag name

**Tab switching preserves tag filter:**
- If on `/feed?tag=fundraising` (Points tab) and user taps Stories, URL becomes `/feed?tag=fundraising&tab=stories`
- Both params are independent and composable

**Rapid tab switching:**
- Debounce or cancel in-flight requests when tab changes before previous load completes
- Show skeleton while loading, never show stale data from wrong tab

**Anonymous user on `/feed`:**
- Feed content loads (public, no auth required for read)
- Position buttons on point cards trigger auth gate (existing behavior from P458)
- Tag pills are clickable and navigate to filtered feed
- Bottom nav is not shown (existing behavior — bottom nav is auth-only)

**Shared URL with invalid tag:**
- `/feed?tag=nonexistent` — shows empty state with the tag name: "No content tagged nonexistent yet"
- Does not show an error. The filter is valid; it simply matches nothing

**Browser back/forward:**
- Tag filter changes and tab switches push to browser history
- Back button restores previous filter/tab state correctly

### 4. Accessibility

**Tag pills:**
- In feed/profile context: rendered as `<a>` or `<Link>` elements, focusable via Tab
- `aria-label="Filter feed by tag: [tag name]"` on each pill
- In /live context: rendered as `<span>` with `aria-hidden="false"` — visible to screen readers as informational text, but not interactive
- Focus ring visible on keyboard focus (existing `focus-visible:ring-2` pattern)

**Tab bar:**
- Uses `role="tablist"` with `role="tab"` on each tab and `role="tabpanel"` on content area
- `aria-selected="true"` on active tab
- Arrow keys navigate between tabs (Left/Right)
- Tab key moves focus out of tablist to content

**Active tag filter pill:**
- X dismiss button: `aria-label="Remove tag filter for [tag name]"`
- Focus order: filter pill (informational) then X button (actionable)

**Feed content:**
- Cards maintain existing accessibility patterns (role="button", keyboard Enter/Space to navigate)
- Screen reader announces tab panel changes via `aria-live="polite"` on the content region

**Empty states:**
- Heading level appropriate (h2 or role="status")
- "Browse all content" button is keyboard focusable

**Color contrast:**
- Tag pills: muted background with foreground text meets WCAG AA 4.5:1 ratio
- Active filter pill: blue-100/blue-800 meets AA
- All interactive elements maintain existing contrast standards

### 5. Responsive Design

**Mobile (320px-767px):**
- Single column, full-width cards with standard page padding
- Tab bar: full-width, tabs evenly distributed
- Active tag filter pill: full-width row, pill left-aligned
- Bottom nav: Feed tab replaces History
- Tag pills on cards: same size, horizontally wrapping. Touch targets at minimum 44px height via padding
- Cards show compact text variant (existing `compact` prop behavior)

**Tablet (768px-1023px):**
- Same as mobile but with wider content container
- Bottom nav still visible (existing `lg:hidden` breakpoint)
- More horizontal space allows more tags per row before wrapping

**Desktop (1024px+):**
- Centered content column with max-width (matching existing page layout)
- No bottom nav (existing behavior). Feed accessible via top nav or `/` redirect
- Tab bar: left-aligned tabs within content column
- Tag pills: hover state shows slightly darker background
- Cards show full text variant (not compact)

### 6. Component Analysis

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| Feed page | **New** | New page component at `src/app/pages/feed-page.tsx`. Replaces the `/feed` route currently pointing to `idea-feed-page.tsx` | Should `idea-feed-page.tsx` be removed or kept at a different route? |
| Tab bar | **New** | No existing tabs component in `src/components/ui/`. Build a lightweight tab bar (role="tablist" + tabs) specific to the feed. Could use Radix Tabs if already a dependency, or plain HTML | Add to design system or keep feed-specific? |
| Tag pills row | **New** | New `TagPills` component. Accepts `tags: string[]`, `context: 'feed' \| 'live'`, renders as links or spans accordingly. Placed inside both story and point cards | None |
| Active tag filter pill | **New** | New `ActiveTagFilter` component. Accepts `tag: string`, `onDismiss: () => void`. Rendered at feed page level, not inside cards | None |
| Story card with tags | **Extend** | `src/app/components/social/story-card-with-links.tsx` — add `tags?: string[]` prop and `context` prop to control clickability. Insert tag pills row below story text, above stats row | None |
| Point card with tags | **Extend** | `src/app/components/social/point-card-with-links.tsx` — same extension: `tags?: string[]` prop, tag pills row below point text, above position buttons | None |
| Bottom nav (Feed tab) | **Extend** | `src/app/components/layout/bottom-nav.tsx` — replace History item with Feed item. Change icon from HistoryIcon to a feed/list icon. Change route from `/sessions` to `/feed` | None |
| Navigation menu (History) | **Extend** | `src/app/components/layout/navigation-menu-items.tsx` — add History item at top of verified-user section (both mobile and dropdown variants) | None |
| Home redirect | **Extend** | `src/App.tsx` — modify `/` route to conditionally redirect authenticated users to `/feed`. Keep existing landing page for anonymous | None |
| Skeleton loader | **New** | `FeedSkeleton` component — 3-4 pulsing placeholder cards matching card layout shape | None |
| Live content cards | **Extend** | `src/app/components/partners/live-content-cards.tsx` — add tag pills with `context='live'` (display-only) | None |

**Decisions requiring founder input:**

1. **`idea-feed-page.tsx` disposition:** The current `/feed` route points to `IdeaFeedPage` (P19.3 orphan ideas feed). Should this be removed entirely, moved to `/ideas`, or kept alongside the new feed? The new feed serves a fundamentally different purpose (public content discovery vs. idea voting).

2. **Tabs component — design system or one-off?** The codebase has no `src/components/ui/tabs.tsx`. This is the first use of tabs. Add to design system (anticipating reuse elsewhere) or build inline in the feed page?

---

## Technical Analysis

**Current State:**

- **Stories table:** Has `tags TEXT[]`, `visibility story_visibility` (enum: `public`, `shared`, `private`). RLS: `"Stories are publicly readable" ON stories FOR SELECT USING (true)` — all stories are SELECTable by any client (including anonymous/anon key). The `getStoriesFeed()` method already filters `.eq('visibility', 'public')`.
- **Points table:** Has `tags TEXT[]`, no visibility column (points are always public). RLS: `"Points are publicly readable" ON points FOR SELECT USING (true)`. The `getPointsFeed()` / `getPointsForFeedDisplay()` methods already exist with pagination.
- **Existing feed route:** `/feed` → `IdeaFeedPage` (P19.3 orphan ideas). Uses a completely different data model (`feed_ideas` table, localStorage usernames, vote/comment system). No overlap with stories/points.
- **No tag filtering exists anywhere** — no Supabase query in the codebase uses `tags @> ARRAY[...]` or `.contains()`. This will be new.
- **No tabs component** in `src/components/ui/`. The project uses Radix UI primitives (dialog, dropdown-menu, etc.) but has not installed `@radix-ui/react-tabs`.
- **Card components:** `StoryCardWithLinks` and `PointCardWithLinks` operate on prototype types (`Point`, `Story` from `@/app/prototypes/shared/types`), not production types (`StoryWithAuthor`, `PointWithCreator` from `@/app/types`). The feed page will need adapter logic or dedicated lightweight feed cards.
- **Navigation:** Bottom nav has 4 items (Start Session, History, My Events, My Profile). Desktop top nav shows Session History icon link, My Events, My Profile for logged-in users.
- **Home route (`/`):** Currently renders `ClarityPledgeLanding` for all users (no auth-conditional redirect).

**Dependencies:**
- Supabase client (`@/lib/supabase`) — existing
- React Router (`useSearchParams`, `Link`) — existing
- Lucide icons — existing
- No new npm packages needed (tabs built from scratch; no Radix Tabs)

**Related Systems:**
- `/live` content picker uses `LiveStoryCard` and `LivePointCard` (different card components from `live-content-cards.tsx`) — tag pills will be added to these as display-only
- Profile page (`profile-page-v2.tsx`) renders `StoryCardWithLinks` and `PointCardWithLinks` — tag pills will be added here as clickable links
- Story detail page and Point detail page — tag pills clickable

---

## Architecture Decisions

**Decision 1: New service methods for tag-filtered feed queries**
- **Chosen:** Add `getPublicStoriesFeed(limit, offset, tag?)` and `getPublicPointsFeed(limit, offset, tag?, viewerUserId?)` methods to the existing service interfaces. The stories method uses `.eq('visibility', 'public')` and optionally `.contains('tags', [tag])`. The points method wraps `getPointsForFeedDisplay` with an optional tag filter.
- **Rationale:** Follows existing service pattern (interface + real implementation). Tag filtering is a Supabase `.contains()` call on the `tags TEXT[]` column — no DB migration needed. Keeping feed queries in services keeps data fetching testable and decoupled from UI.
- **Trade-off:** Two new service methods vs. reusing existing `getStoriesFeed`/`getPointsForFeedDisplay`. Existing methods don't accept tag parameter, and modifying them would break the interface contract for other callers.
- **Alternative rejected:** Client-side tag filtering (fetch all, filter in JS). Rejected because it doesn't scale and defeats pagination.

**Decision 2: Lightweight feed-specific card wrappers instead of reusing StoryCardWithLinks/PointCardWithLinks**
- **Chosen:** Create thin feed-card wrappers (`FeedStoryCard`, `FeedPointCard`) that accept production types (`StoryWithAuthor`, `PointWithCounts`) and render simplified cards with tag pills. These wrappers compose existing UI primitives (avatar, LinkedText, tag pills) but skip the heavy linked-points/linked-stories expansion logic that profile and detail cards need.
- **Rationale:** `StoryCardWithLinks` and `PointCardWithLinks` operate on prototype types and carry 400+ lines of position-button, quote-pattern, and thread-line logic that the feed doesn't need. Wrapping them would require adapter functions to convert production types to prototype types and pass many unused props. Clean feed cards are simpler, faster, and easier to maintain.
- **Trade-off:** Some visual duplication (author row, card border styling). Mitigated by extracting the shared tag pills into a reusable `TagPills` component.
- **Alternative rejected:** Adapter pattern to convert `StoryWithAuthor` → prototype `Story` and reuse existing cards. Adds complexity (type mapping, prop gymnastics) for no user benefit. The feed cards are intentionally simpler (no position buttons, no expand/collapse, no quote pattern).

**Decision 3: TagPills as a shared component, context-aware via prop**
- **Chosen:** Single `TagPills` component that accepts `tags: string[]` and `context: 'feed' | 'live' | 'profile' | 'detail'`. For `'live'`, renders `<span>` elements with muted styling. For all other contexts, renders `<Link to="/feed?tag=X">` elements. Placed in `src/app/components/shared/tag-pills.tsx`.
- **Rationale:** Tag pills appear on 6+ card variants across feed, profile, detail, and live pages. A single component with a context prop avoids duplication while keeping the /live display-only behavior explicit.
- **Trade-off:** Context prop adds a branch, but it's a single boolean check (link vs span), not complex logic.
- **Alternative rejected:** Two separate components (ClickableTagPill, DisplayTagPill). Over-abstraction for a one-line difference.

**Decision 4: Tab bar built inline in feed page (not design system)**
- **Chosen:** Build the tab bar as a local component within `feed-page.tsx` using semantic HTML (`role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`). Uses URL search params (`?tab=stories`) as state — no React state for tab selection.
- **Rationale:** This is the only tabs usage in the app. Adding to `src/components/ui/` adds overhead with no reuse. URL-driven tabs give free browser back/forward support and shareable URLs. If tabs are needed elsewhere later, extract then.
- **Alternative rejected:** Installing `@radix-ui/react-tabs`. Adds a dependency for one component. The accessibility requirements (arrow keys, aria attributes) are simple enough to implement inline.

**Decision 5: Delete `idea-feed-page.tsx` and related idea feed code**
- **Chosen:** Delete `idea-feed-page.tsx`, `idea-detail-page.tsx`, and the `/idea/:id` route. The idea feed (P19.3) uses a separate data model (`feed_ideas`, `idea_votes`, `idea_comments` tables) with localStorage-based anonymous voting. It has zero active users and serves a fundamentally different purpose from the new content discovery feed.
- **Rationale:** Keeping dead code at a route the new feature needs creates confusion. The `/feed` route must serve the new hashtag feed. The idea data model (localStorage names, anonymous voting) is incompatible with the authenticated content model.
- **Trade-off:** Loses the P19.3 orphan ideas feature. Acceptable because it was a prototype with no production usage.
- **Alternative rejected:** Move idea feed to `/ideas`. Adds a route nobody uses and keeps dead code alive.

**Decision 6: Home redirect via wrapper component, not route-level Navigate**
- **Chosen:** Create a small `HomeRedirect` component that uses `useAuth` to check session state. If authenticated + verified, renders `<Navigate to="/feed" replace />`. Otherwise, renders `<ClarityPledgeLanding />`. This replaces the current static `<ClarityPledgeLanding />` at the `/` route.
- **Rationale:** The redirect needs auth context which is only available inside `<AuthProvider>`. A route-level `<Navigate>` can't conditionally check auth. The wrapper pattern is already used for `ChatRedirect` in the same file.
- **Trade-off:** Adds a flash of landing page while auth loads. Mitigated by showing a loading skeleton during `!sessionChecked`.

**Decision 7: Feed page accessible to anonymous users (no auth gate)**
- **Chosen:** `/feed` is publicly accessible. Anonymous users see public content, can browse and filter by tag, but position buttons on point cards trigger the existing auth gate (P458 pattern). Tag pills are clickable for everyone.
- **Rationale:** BR-5 requires shareable URLs. BR-9 limits to public content only. The auth gate pattern for interactive actions already exists.
- **Alternative rejected:** Auth-gating the entire feed page. Breaks shareable URLs and the event participant use case.

**Decision 8: Tag cloud — client-side extraction from already-fetched data**
- **Chosen:** Extract unique tags and their frequency counts client-side from the stories and points already fetched for the feed. No new Supabase RPC function or additional query. The `FeedPage` component iterates over the loaded stories (filtered to `visibility: 'public'`) and points, collects all tags into a frequency map, and passes the sorted result to a `TagCloud` sub-component.
- **Rationale:** The feed already fetches all public stories and points for display. Extracting tags from this data is a trivial client-side operation — no extra network round-trip, no new RPC function to maintain. For the current content volume (tens to low hundreds of items), this is more than adequate.
- **Trade-off:** If content volume grows to thousands of items with pagination, client-side extraction would only reflect tags from the currently loaded page. At that point, a server-side `getPublicTagsWithCounts()` RPC (e.g., `SELECT tag, COUNT(*) FROM (SELECT UNNEST(tags) FROM stories WHERE visibility='public' UNION ALL SELECT UNNEST(tags) FROM points) sub GROUP BY tag ORDER BY count DESC`) would be needed. This is a future concern, not an MVP concern.
- **Alternative rejected:** New Supabase RPC function `getPublicTagsWithCounts()`. Adds a DB function, a service method, and a separate loading state — over-engineered for the current data volume.

**Decision 9: Search bar — client-side filtering, local state only**
- **Chosen:** Search is a client-side filter on the already-fetched feed data. Filter matches case-insensitive substrings against `story.content` for stories and `point.statement` for points. Search state is local React state (`useState`), not persisted to URL. Combined with tag filter using AND logic (both must match).
- **Rationale:** Same reasoning as Decision 8 — data is already loaded. Client-side substring matching is instant and avoids a server round-trip. Keeping search out of the URL means refreshing clears the search (intentional — search is ephemeral exploration, tag filter is shareable). This matches the `StorySearchPicker` pattern already in the codebase.
- **Trade-off:** No deep-linking to search results. Acceptable for MVP — search is a discovery aid, not a permalink target.
- **Alternative rejected:** Server-side full-text search via Supabase `.textSearch()` or `.ilike()`. Adds latency and complexity for no benefit at current data volumes.

---

## Security Review

**RLS Policies:**
- ✅ `"Stories are publicly readable" ON stories FOR SELECT USING (true)` — all stories readable by anon key. The feed query adds `.eq('visibility', 'public')` as an application-level filter. This is defense-in-depth, not security-critical: even if the filter is accidentally removed, RLS still allows SELECT (stories with `private`/`shared` visibility would leak). However, the existing `getStoriesFeed()` already uses this pattern and has been in production since P117.
- ✅ `"Points are publicly readable" ON points FOR SELECT USING (true)` — points have no visibility column; all are public by design.
- ✅ `"Positions are publicly readable" ON point_positions FOR SELECT USING (true)` — position counts displayed on feed cards.
- ✅ No write operations in the feed — purely read-only. Position-setting goes through existing `setPosition()` which has its own RLS (`user_id = auth.uid()` + verified check).

**Authentication:**
- ✅ Feed page is publicly accessible (read-only) — no auth required for viewing.
- ✅ Position buttons on point cards use existing P458 auth gate for anonymous users.
- ✅ Home redirect only fires for authenticated + verified users (checked via `useNavAuthState` / `useAuth`).

**Input Validation:**
- ✅ Tag parameter comes from URL search params (`?tag=X`). Used directly in Supabase `.contains('tags', [tag])` which is parameterized (no SQL injection risk — Supabase JS client uses parameterized queries).
- ✅ Tag value is URL-decoded by the router automatically. No user-supplied HTML rendered — tag text is rendered as text content inside React elements (XSS-safe by default).
- ⚠️ **Tab parameter validation:** `?tab=stories` should be validated — unknown values should fall back to the default (points) tab. Simple string check, no security risk, but prevents unexpected behavior.

**Data Protection:**
- ✅ No PII exposed. Feed shows public stories (author chose `visibility: 'public'`) and public points. Author names, slugs, and avatar URLs are already public on profile pages.
- ✅ No new API endpoints — uses existing Supabase client queries with anon key.
- ✅ Private and shared stories are excluded by the `.eq('visibility', 'public')` filter.

---

## Implementation Approach

**Worktree recommended:** 10+ files to create or modify — use a worktree to avoid index collisions with other in-progress work.

### Files to Create

1. **`src/app/pages/feed-page.tsx`** — New feed page component. Two tabs (Points default, Stories), tag filter from URL params, tag cloud (client-side extracted from fetched data, see Decision 8), search bar (client-side substring filter, local state, see Decision 9), skeleton loading, empty states. Replaces `IdeaFeedPage` at `/feed` route.

2. **`src/app/components/shared/tag-pills.tsx`** — Shared `TagPills` component. Accepts `tags: string[]`, `context: 'feed' | 'live' | 'profile' | 'detail'`. Renders clickable `<Link>` pills or display-only `<span>` pills. Handles truncation (`max-w-[200px] truncate`), "+N more" overflow (>8 tags), and `title` attribute for full tag on hover.

3. **`src/app/components/feed/feed-story-card.tsx`** — Lightweight story card for feed context. Takes `StoryWithAuthor`, renders author row (avatar, name, role, time), story text (truncated with "more"), tag pills, understood count. Blue left border. Clickable → navigates to `/story/:id`.

4. **`src/app/components/feed/feed-point-card.tsx`** — Lightweight point card for feed context. Takes `PointWithCounts` (or `PointWithUserPosition`), renders pin icon, statement text, position buttons (existing `PositionButtons` component), tag pills. Slate left border. Clickable → navigates to `/point/:id`.

5. **`src/app/components/feed/active-tag-filter.tsx`** — Active tag filter pill displayed between header and tabs. Shows tag name + dismiss X button. `bg-blue-100 text-blue-800` styling.

6. **`src/app/components/feed/feed-skeleton.tsx`** — Skeleton loading component. 3-4 pulsing placeholder cards matching card layout shape.

7. **`src/app/components/feed/index.ts`** — Barrel export for feed components.

### Files to Modify

8. **`src/App.tsx`** — (a) Replace `IdeaFeedPage` lazy import with `FeedPage`. (b) Replace `/feed` route element. (c) Add `HomeRedirect` component for `/` route (auth-conditional redirect to `/feed`). (d) Remove `/idea/:id` route. (e) Remove `IdeaFeedPage` and `IdeaDetailPage` lazy imports.

9. **`src/app/data/stories-service.interface.ts`** — Add `getPublicStoriesFeed(limit: number, offset: number, tag?: string): Promise<StoryWithAuthor[]>` to the interface.

10. **`src/app/data/stories-service-real.ts`** — Implement `getPublicStoriesFeed`. Query: `.from('stories').select('*, author:profiles!...').eq('visibility', 'public')` + optional `.contains('tags', [tag])` + `.order('created_at', { ascending: false }).range(offset, offset + limit - 1)`.

11. **`src/app/data/stories-service-mock.ts`** — Add mock implementation of `getPublicStoriesFeed` (filter mock data by visibility + tag).

12. **`src/app/data/points-service.interface.ts`** — Add `getPublicPointsFeed(limit: number, offset: number, tag?: string, viewerUserId?: string): Promise<PointWithUserPosition[]>` to the interface.

13. **`src/app/data/points-service-real.ts`** — Implement `getPublicPointsFeed`. Similar to `getPointsForFeedDisplay` but adds optional `.contains('tags', [tag])` filter.

14. **`src/app/data/points-service-mock.ts`** — Add mock implementation.

15. **`src/app/components/layout/bottom-nav.tsx`** — Replace History item with Feed: change icon from `HistoryIcon` to `LayoutList` (or `Newspaper`), label from "History" to "Feed", route from `/sessions` to `/feed`. Update `isActive` to match `/feed`.

16. **`src/app/components/layout/navigation-menu-items.tsx`** — Add History item (with `HistoryIcon`) at the top of the verified-user section in both `'mobile'` and `'dropdown'` variants. Route: `/sessions`.

17. **`src/app/components/layout/simple-navigation.tsx`** — Desktop icon nav: replace "Session History" link (`/sessions`) with "Feed" link (`/feed`) using a feed icon. Keep the `HistoryIcon` + "Session History" accessible via dropdown (already handled by navigation-menu-items.tsx change above).

18. **`src/app/components/social/story-card-with-links.tsx`** — Import and render `TagPills` component after story text, before stats row. Pass `story.tags` (requires mapping from prototype `Story` type which may not have tags — check and pass from caller if available). Context: `'profile'` or `'story-detail'` based on existing `context` prop.

19. **`src/app/components/social/point-card-with-links.tsx`** — Import and render `TagPills` component after point text, before position buttons. Pass `point.tags`. Context: based on usage (profile/detail/feed).

20. **`src/app/components/partners/live-content-cards.tsx`** — Add `TagPills` to `LiveStoryCard` and `LivePointCard` with `context='live'` (display-only). Show tags from `story.tags` / `point.tags` below content text.

21. **`src/app/components/social/StoryCardDetail.tsx`** — Add `TagPills` with `context='detail'`.

### Files to Delete

22. **`src/app/pages/idea-feed-page.tsx`** — Replaced by `feed-page.tsx`.

23. **`src/app/pages/idea-detail-page.tsx`** — Orphaned by `/idea/:id` route removal.

24. **`src/app/components/feed/`** — Check if existing feed components (`VoteButton`, `NameDialog`) are only used by idea feed. If so, delete them too.

### Build Sequence

1. **Create `TagPills` component** (`tag-pills.tsx`) — shared dependency for all card modifications
2. **Create service methods** — `getPublicStoriesFeed` and `getPublicPointsFeed` in interfaces + real implementations
3. **Create feed card components** — `FeedStoryCard`, `FeedPointCard`, `ActiveTagFilter`, `FeedSkeleton`
4. **Create `FeedPage`** — wire up tabs, URL params, data fetching, tag cloud (client-side), search bar (client-side), empty states
5. **Update `App.tsx`** — swap route, add `HomeRedirect`, remove idea routes
6. **Update navigation** — bottom nav (swap History→Feed), menu items (add History to dropdown), desktop nav (swap Session History→Feed)
7. **Add `TagPills` to existing cards** — `StoryCardWithLinks`, `PointCardWithLinks`, `LiveStoryCard`, `LivePointCard`, `StoryCardDetail`
8. **Delete old idea feed code** — `idea-feed-page.tsx`, `idea-detail-page.tsx`, orphaned feed components
9. **Test** — verify feed loads, tag filtering works, navigation correct, /live tags non-clickable, anonymous access works, home redirect works

**No database migrations needed.** Tags (`TEXT[]`) and visibility (`story_visibility` enum) already exist on the stories table. Points have tags but no visibility column (all public).

---

## Test Coverage Strategy

### What's Tested (and WHY)

- **Unit: TagPills component** — Core shared component with context-dependent behavior (link vs span). Validates clickable vs display-only rendering, truncation, overflow ("+N more"), empty/undefined tags, and aria-labels.
- **Unit: ActiveTagFilter** — Interactive component with dismiss callback. Validates display, aria-label, click handler, and styling.
- **Unit: Feed service methods** — New `getPublicStoriesFeed` and `getPublicPointsFeed` with tag filtering via `.contains()`. Validates query chain (visibility filter, tag filter, pagination, author join), error handling, and viewer position loading.
- **Unit: Bottom nav change** — Feed replaces History. Validates correct label, correct route, active state on `/feed` and `/feed?tag=X`.
- **Unit: Home redirect** — Conditional `/` → `/feed` for authenticated users. Validates redirect, anonymous landing, and loading state.
- **Unit: Navigation menu** — History relocated to dropdown/hamburger. Validates presence in menu, correct route.
- **Unit: Tab bar** — URL-driven tabs with ARIA roles. Validates default tab, URL param, unknown param fallback, semantic structure.
- **Unit: Tag filtering** — Active filter pill display, empty states (filtered vs unfiltered), tab+tag composition.
- **E2E: User flows** — Browse feed, switch tabs, click tag pill, dismiss filter, shareable URL, back/forward navigation. Uses real DB fixtures.
- **E2E: Smoke** — `/feed`, `/feed?tag=X`, `/feed?tab=stories` load without JS errors. Anonymous access (no auth gate).
- **Accessibility** — Tab bar ARIA (tablist/tab/tabpanel, arrow keys, Tab key), tag pill aria-labels and focus, dismiss button accessibility, aria-live on tab panel, empty state focusability.
- **UAT** — 14 manual scenarios covering all acceptance criteria + edge cases.

### What's NOT Tested (and WHY)

- **Integration tests** — No new DB migrations, no new RLS policies, no new API endpoints. All data access uses existing Supabase RLS policies (`stories/points are publicly readable`). Tag filtering uses `.contains()` which is a standard PostgREST operator.
- **FeedStoryCard / FeedPointCard internals** — New lightweight card components. Rendering correctness is covered by E2E tests (visible text, tags displayed). Unit testing card markup would be brittle and low-value.
- **Skeleton loading component** — Pure presentational. Smoke test verifies page loads without errors.
- **Delete of idea-feed-page.tsx** — Removal of dead code. Covered by smoke test (no 404 on `/feed`).
- **Desktop nav icon swap** — Covered by existing navigation-acceptance-full.test.tsx pattern (extend after implementation).

### Test Pyramid

```
       /\
      /  \   5 E2E tests (e2e/p491-hashtag-feed.spec.ts)
     /    \  5 Smoke tests (e2e/p491-feed-smoke.spec.ts)
    /------\
   / 6 A11Y \ (e2e/a11y/p491-accessibility.spec.ts)
  /----------\
 / ~30 UNIT   \ (src/tests/p491-hashtag-feed.test.tsx + p491-feed-service.test.ts)
/==============\
```

**Total:** ~46 automated tests + 14 UAT scenarios
**Estimated run time:** Unit: ~2s, E2E: ~30s, A11y: ~15s

### Files Generated

| File | Type | Tests |
|------|------|-------|
| `src/tests/p491-hashtag-feed.test.tsx` | Unit (UI) | ~22 tests — TagPills, ActiveTagFilter, BottomNav, NavMenu, TabBar, TagFiltering, HomeRedirect |
| `src/tests/p491-feed-service.test.ts` | Unit (Service) | ~12 tests — getPublicStoriesFeed, getPublicPointsFeed |
| `e2e/p491-hashtag-feed.spec.ts` | E2E | ~8 tests — Browse feed, tag filter, shareable URL, tab+tag, back/forward |
| `e2e/p491-feed-smoke.spec.ts` | Smoke | 5 tests — Page loads, tabs present, tag filter, stories tab, anonymous access |
| `e2e/a11y/p491-accessibility.spec.ts` | Accessibility | 6 tests — Tab bar ARIA, arrow keys, tag pill labels, dismiss button, aria-live, empty state |
| `features/uat/p491.md` | UAT | 14 scenarios — All acceptance criteria + edge cases |

---

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.

### Task 1: Create shared TagPills component
- **Files:** `src/app/components/shared/tag-pills.tsx` (create)
- **Spec refs:** "Architecture Decisions > Decision 3 (lines ~403-407)", "UX Requirements > Screen Designs > Card anatomy (lines ~184-191)", "UX Requirements > Edge Cases (lines ~247-263)"
- **Tests:** `src/tests/p491-hashtag-feed.test.tsx` (TagPills tests)
- **Depends on:** None
- **Verify:** Unit tests pass for clickable links (feed/profile/detail contexts), display-only spans (live context), truncation at >20 chars, "+N more" overflow at >8 tags, empty/undefined tags, aria-labels
- [ ] Complete

### Task 2: Add story feed service method
- **Files:** `src/app/data/stories-service.interface.ts` (modify), `src/app/data/stories-service-real.ts` (modify), `src/app/data/stories-service-mock.ts` (modify)
- **Spec refs:** "Architecture Decisions > Decision 1 (lines ~392-395)", "Implementation Approach > Files to Modify 9-11 (lines ~481-486)"
- **Tests:** `src/tests/p491-feed-service.test.ts` (getPublicStoriesFeed tests)
- **Depends on:** None
- **Verify:** Unit tests pass for public stories query with visibility filter, optional tag filter via `.contains()`, pagination, author join, error handling
- [ ] Complete

### Task 3: Add point feed service method
- **Files:** `src/app/data/points-service.interface.ts` (modify), `src/app/data/points-service-real.ts` (modify), `src/app/data/points-service-mock.ts` (modify)
- **Spec refs:** "Architecture Decisions > Decision 1 (lines ~392-395)", "Implementation Approach > Files to Modify 12-14 (lines ~487-491)"
- **Tests:** `src/tests/p491-feed-service.test.ts` (getPublicPointsFeed tests)
- **Depends on:** None
- **Verify:** Unit tests pass for public points query with optional tag filter, pagination, viewer position loading, error handling
- [ ] Complete

### Task 4: Create feed card components
- **Files:** `src/app/components/feed/feed-story-card.tsx` (create), `src/app/components/feed/feed-point-card.tsx` (create), `src/app/components/feed/active-tag-filter.tsx` (create), `src/app/components/feed/feed-skeleton.tsx` (create), `src/app/components/feed/index.ts` (create)
- **Spec refs:** "Architecture Decisions > Decision 2 (lines ~397-401)", "UX Requirements > Screen Designs > Feed Page (lines ~176-227)", "Implementation Approach > Files to Create 3-7 (lines ~467-476)"
- **Tests:** `src/tests/p491-hashtag-feed.test.tsx` (ActiveTagFilter tests)
- **Depends on:** Task 1 (TagPills used by feed cards)
- **Verify:** ActiveTagFilter unit tests pass (display, aria-label, dismiss click). Feed cards render with tag pills, correct border colors, author info. Skeleton shows pulsing placeholders
- [ ] Complete

### Task 5: Create FeedPage with tabs, tag cloud, search bar, filtering, and empty states
- **Files:** `src/app/pages/feed-page.tsx` (create)
- **Spec refs:** "UX Requirements > User Flows A-C (lines ~125-151)", "UX Requirements > User Flows G-H (lines ~521-541)", "UX Requirements > Screen Designs > Feed Page (lines ~176-227)", "Architecture Decisions > Decision 4 (lines ~409-412)", "Architecture Decisions > Decision 7 (lines ~426-428)", "Architecture Decisions > Decision 8 (tag cloud client-side extraction)", "Architecture Decisions > Decision 9 (search bar client-side filtering)"
- **Tests:** `src/tests/p491-hashtag-feed.test.tsx` (TabBar, TagFiltering, TagCloud, SearchBar tests), `e2e/p491-feed-smoke.spec.ts`, `e2e/a11y/p491-accessibility.spec.ts`
- **Depends on:** Task 1 (TagPills), Task 2 (stories service), Task 3 (points service), Task 4 (feed cards)
- **Verify:** Unit tests pass for tab bar (default tab, URL param, unknown param fallback, ARIA roles), tag filtering (active filter display, empty states, tab+tag composition), tag cloud (renders chips sorted by frequency from fetched data, highlights active tag, click navigates to `?tag=X`), search bar (filters cards by case-insensitive substring match on story.content / point.statement, clear button resets, AND logic with tag filter, local state not in URL). Page renders with search bar, tag cloud, two tabs, loads data, filters by tag from URL
- **Includes:**
  - Tag cloud component (inline in feed-page or extracted as `TagCloud` sub-component): renders clickable chips from tags extracted client-side from fetched stories + points, sorted by frequency. Active tag highlighted with `bg-blue-100 text-blue-800 ring-1 ring-blue-300`. Click navigates to `/feed?tag=X`
  - Search bar component (inline in feed-page): text input with search icon, placeholder "Search stories and points...", clear (X) button when non-empty. Local React state (`useState`), not URL-persisted
  - Client-side filtering logic: search filters on `story.content` / `point.statement` (case-insensitive substring). Combined with tag filter via AND — both must match when both are active
- [ ] Complete

### Task 6: Update App.tsx — swap routes and add HomeRedirect
- **Files:** `src/App.tsx` (modify)
- **Spec refs:** "Architecture Decisions > Decision 5 (lines ~414-418)", "Architecture Decisions > Decision 6 (lines ~420-423)", "UX Requirements > User Flows D (lines ~153-157)", "Implementation Approach > Files to Modify 8 (lines ~479-480)"
- **Tests:** `src/tests/p491-hashtag-feed.test.tsx` (HomeRedirect tests)
- **Depends on:** Task 5 (FeedPage must exist)
- **Verify:** Unit tests pass for home redirect (auth → /feed, anonymous → landing, loading state). `/feed` route renders FeedPage. `/idea/:id` route removed. Lazy imports swapped
- [ ] Complete

### Task 7: Update navigation — bottom nav and menu items
- **Files:** `src/app/components/layout/bottom-nav.tsx` (modify), `src/app/components/layout/navigation-menu-items.tsx` (modify), `src/app/components/layout/simple-navigation.tsx` (modify)
- **Spec refs:** "UX Requirements > Screen Designs > Bottom Navigation Changes (lines ~229-237)", "UX Requirements > Screen Designs > Navigation Menu Changes (lines ~239-243)", "UX Requirements > User Flows E (lines ~159-163)", "Implementation Approach > Files to Modify 15-17 (lines ~493-497)"
- **Tests:** `src/tests/p491-hashtag-feed.test.tsx` (BottomNav, NavMenu tests)
- **Depends on:** Task 5 (Feed page must exist for navigation to target)
- **Verify:** Unit tests pass for bottom nav (Feed label, /feed route, active state on /feed and /feed?tag=X), nav menu (History item present in dropdown/hamburger, correct /sessions route). Desktop nav shows Feed link instead of Session History
- [ ] Complete

### Task 8: Add TagPills to existing card components
- **Files:** `src/app/components/social/story-card-with-links.tsx` (modify), `src/app/components/social/point-card-with-links.tsx` (modify), `src/app/components/social/StoryCardDetail.tsx` (modify)
- **Spec refs:** "UX Requirements > Screen Designs > Card anatomy (lines ~184-191)", "Implementation Approach > Files to Modify 18-21 (lines ~498-505)"
- **Tests:** `e2e/p491-hashtag-feed.spec.ts` (tag visibility on cards)
- **Depends on:** Task 1 (TagPills component)
- **Verify:** Tag pills render on story and point cards in profile and detail contexts as clickable links. Cards without tags show no tag row
- [ ] Complete

### Task 9: Add TagPills to /live card components (display-only)
- **Files:** `src/app/components/partners/live-content-cards.tsx` (modify)
- **Spec refs:** "UX Requirements > User Flows F (lines ~165-170)", "UX Requirements > Screen Designs > Card anatomy — /live context (lines ~190-191)", "Implementation Approach > Files to Modify 20 (lines ~503-504)"
- **Tests:** `e2e/p491-hashtag-feed.spec.ts` (live context tags non-clickable)
- **Depends on:** Task 1 (TagPills component)
- **Verify:** Tag pills render on LiveStoryCard and LivePointCard as non-clickable spans with muted styling. No navigation occurs on tap. Tags from story/point data are passed through
- [ ] Complete

### Task 10: Delete old idea feed code
- **Files:** `src/app/pages/idea-feed-page.tsx` (delete), `src/app/pages/idea-detail-page.tsx` (delete), `src/app/components/feed/` (delete existing files — check for orphaned VoteButton, NameDialog, etc.)
- **Spec refs:** "Architecture Decisions > Decision 5 (lines ~414-418)", "Implementation Approach > Files to Delete 22-24 (lines ~509-514)"
- **Tests:** `e2e/p491-feed-smoke.spec.ts` (no 404 on /feed)
- **Depends on:** Task 6 (routes must be swapped before deleting old page files)
- **Verify:** Build succeeds with no import errors. `/feed` loads the new FeedPage. No references to `IdeaFeedPage`, `IdeaDetailPage`, or `idea-feed` remain in the codebase
- [ ] Complete

### Task 11: Run full test suite
- **Files:** (none — verification only)
- **Spec refs:** "Test Coverage Strategy (lines ~530-582)"
- **Tests:** `src/tests/p491-hashtag-feed.test.tsx`, `src/tests/p491-feed-service.test.ts`, `e2e/p491-hashtag-feed.spec.ts`, `e2e/p491-feed-smoke.spec.ts`, `e2e/a11y/p491-accessibility.spec.ts`
- **Depends on:** All previous tasks (1-10)
- **Verify:** All unit tests pass (~34 tests), all E2E tests pass (~8 tests), all smoke tests pass (5 tests), all accessibility tests pass (6 tests). `npm run build` succeeds. Pre-commit checks pass
- [ ] Complete

**Total tasks:** 11 | **Can parallelize:** Tasks 1, 2, 3 (no shared dependencies); Tasks 8, 9 (both depend only on Task 1) | **Must be sequential:** Task 1 → Task 4 → Task 5 → Task 6 → Task 10; Task 5 → Task 7
