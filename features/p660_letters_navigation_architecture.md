---
status: qa
type: change-request
rank: 1000062.0
changes: p581
superseded_by: p664
tags:
  - redesign
  - p581
  - letters
  - navigation
  - information-architecture
created_date: 2026-04-05
delivery_stage: verify
flow: dev
pipeline_plan: [change-request, challenge-prd, ux, architect, generate-tests, dev, verify]
pipeline_ran: [change-request, challenge-prd, ux, architect, generate-tests, dev, verify]
pipeline_skipped: [ui -- no net-new design system components, decompose -- under 7 tightly coupled files, spec-compact -- spec is fresh no residue, spec-review -- challenge-prd covers consistency for fresh CR]
uat_file: features/uat/p660.md
test_files:
  - e2e/integration/p660-letters-nav-migration.spec.ts
  - e2e/p660-letters-nav.spec.ts
  - e2e/p660-drafts-tab.spec.ts
  - e2e/p660-inbox-tab.spec.ts
  - e2e/p660-smoke.spec.ts
  - e2e/a11y/p660-accessibility.spec.ts
---

# P660: Letters Navigation Architecture — Drafts/Sent/Inbox Tabs

> **Redesign of:** [P581: Letters with Comprehension Assessment](p581_letters_with_comprehension_assessment.md)
> **Sibling CR:** [P651: Letter Recipient Onboarding Redesign](p651_letter_recipient_onboarding_redesign.md) (different surface — onboarding)
> **What was wrong:** P581 bolts letter tracking onto doc pages — "Sent Letters" section at bottom of doc detail, "Received Letters" at bottom of docs list. Letters are the product's primary delivery instrument but are visually demoted to sub-sections on an editing surface. The navigation model ("Docs") doesn't reflect that letters are a first-class concept. Sent status, recipients, and responses are mixed with content editing. There's no dedicated place for incoming letters or responses to your own letters.

## Operating Mode

> This spec is an **incremental correction** to P581, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P581 are not up for re-examination.

---

## Problem Statement

P581's letter mechanics are sound (sealed-bid, reading flow, gap reveal, composition wizard). The problem is where these things live in the UI.

The current design houses everything under Docs: "Prepare a Letter" on the doc header, sent letter status at the bottom of each doc, received letters at the bottom of the docs list. This creates three UX failures:

1. **Letters are invisible.** A first-class product concept (the async understanding instrument) lives as a secondary section you scroll past. Workshop participants' responses, the most valuable data in the product, appear below the stories they already read.

2. **Editing and tracking are mixed.** The doc detail page serves two unrelated jobs: editing content (stories, points) and tracking letter delivery (who opened, who completed). These are different tasks with different cadences.

3. **Responses have no home.** When a recipient completes a letter, where does the author see it? Somewhere at the bottom of the doc that sourced it. When an anonymous workshop attendee responds via link, it surfaces in the same place. There's no unified "what's new" view.

P581's problem statement (six pain points about async understanding measurement) remains fully valid. This CR corrects only the information architecture, not the instrument.

---

## Jobs To Be Done

- **Preserved from P581:** All six JTBD (post-workshop proof, pre-session triage, focused reading, gap reveal, false premise rejection, post-reading triage). These are user-need level, not IA-level.
- **Corrected:** "Find my received letters" — P581 placed these at the bottom of docs list; redesign gives them a dedicated Inbox. "Track letter responses" — P581 scattered across doc pages; redesign consolidates into Inbox.
- **New:** "See all incoming in one place" — both received letters AND responses to my letters arrive in a single chronological Inbox.

---

## Current State

P581 specifies (D28): "Within Clarity Docs page — 'Letters' section showing sent + received. Letters are always sourced from docs, so doc page is the natural home. No separate `/letters` nav item V1."

**Before (P581 design):**

```
Nav: [Home] [Docs] [Events] [Profile]

/docs (docs list page)
┌─────────────────────────────────────┐
│  Your Clarity Docs                  │
│  Untitled Doc               [Open]  │
│  Borbosobich Karih          [Open]  │
│  Test Mokovich              [Open]  │
│                                     │
│  ── RECEIVED LETTERS ──────────     │
│  Letter from sender   Opened [Read] │
└─────────────────────────────────────┘

/docs/:id (doc detail page)
┌─────────────────────────────────────┐
│  Borbosobich Karih                  │
│  [Prepare a Letter] [Select] [Write]│
│                                     │
│  (story cards...)                   │
│                                     │
│  ── SENT LETTERS ──────────────     │
│  slava@...  Completed  [View]       │
│  slava@...  Opened     [View]       │
│  slava@...  Sent       [View]       │
└─────────────────────────────────────┘
```

---

## Root Cause

D28 assumed "letters are always sourced from docs, so doc page is the natural home." This conflates the data model (letter = snapshot of doc) with the navigation model (letters should be found where they were created). The source relationship is correct, but the IA conclusion is wrong — just as email attachments are created from documents but found in the inbox, not stapled to the original file.

---

## Redesign

### Core Concept: One Nav Item, Three Tabs

"Docs" disappears from the nav. It becomes "Drafts" — a tab inside Letters. Because that's what docs are: drafts of letters.

```
Nav: [Home] [Letters] [Events] [Profile]
                │
                └─ /letters (one page, three tabs)
                   ┌──────────┐ ┌──────────┐ ┌──────────┐
                   │  Drafts  │ │   Sent   │ │ Inbox(3) │
                   └──────────┘ └──────────┘ └──────────┘
                        │            │            │
                        │            │            └─ all incoming:
                        │            │               received letters
                        │            │               + responses to mine
                        │            │
                        │            └─ sealed letters:
                        │               recipients + status
                        │
                        └─ my editing workspace:
                           create/edit content,
                           start new letters

Nav label: "Clarity Letters" on desktop, "Letters" on mobile.
```

### Tab: Drafts (editing workspace — replaces "Docs")

**Drafts list (currently: docs list page)**

```
BEFORE (current docs-list-page.tsx):
┌──────────────────────────────────────┐
│  Your Clarity Docs           [+ New] │
│                                      │
│  "False consensus"  [Share] [Open]   │
│  3 stories · 🔒                      │
│                                      │
│  "Our hiring gaps"  [Share] [Open]   │
│  1 story · 🌐                        │
│                                      │
│  ── RECEIVED LETTERS ──────────      │
│  Letter from sender  Opened [Read]   │
└──────────────────────────────────────┘

AFTER (Drafts tab):
┌──────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │  Drafts  │  │   Sent   │  │ Inbox(3) │               │
│  └──────────┘  └──────────┘  └──────────┘        [+ New] │
│                                                          │
│  "False consensus" · 3 stories · 🔒  [Edit] [New Letter] │
│  "Our hiring gaps" · 1 story · 🌐    [Edit] [New Letter] │
│  "Untitled" · 0 stories              [Edit]              │
│                                                          │
└──────────────────────────────────────────────────────────┘

Changes:
- [Open] → [Edit] (label rename)
- [Share] → removed (letters are the sharing mechanism)
- [New Letter] added per row (triggers send wizard, disabled if 0 stories)
- "RECEIVED LETTERS" section → removed (moved to Inbox tab)
- ShareDialog component → removed from this page
```

**Draft detail (currently: doc detail page)**

```
BEFORE (current doc-detail-page.tsx):
┌──────────────────────────────────────┐
│  ← Back                             │
│  Borbosobich Karih                   │
│  PUBLIC · Anyone with the link...    │
│                                      │
│  [Share 🔗] [Select your story]      │
│            [Write a story]           │
│                                      │
│  (story cards with points...)        │
│                                      │
│  ── SENT LETTERS ──────────────      │
│  slava@...  Completed  [View]        │
│  slava@...  Opened     [View]        │
└──────────────────────────────────────┘

AFTER (/letters/drafts/:id):
┌──────────────────────────────────────┐
│  ← Letters                           │
│  Borbosobich Karih                   │
│  PRIVATE / PUBLIC banner             │
│                                      │
│  [Select your story]                 │
│  [Write a story]                     │
│                                      │
│  (story cards with points...)        │
│                                      │
└──────────────────────────────────────┘

Changes:
- "← Back" → "← Letters" (navigates to Drafts tab)
- [Share 🔗] button → removed (sharing is via letters now)
- ShareDialog component → removed from this page
- "SENT LETTERS" section → removed (moved to Sent tab)
- [Select your story] → stays
- [Write a story] → stays
- Story cards with points → stay (pure editing)
```

### Tab: Sent (sealed letters + recipients/respondents)

```
/letters (Sent tab)
┌──────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │  Drafts  │  │   Sent   │  │ Inbox(3) │               │
│  └──────────┘  └──────────┘  └──────────┘                │
│                                                          │
│  "False consensus" · private · sealed Mar 28             │
│  RECIPIENTS                                              │
│  ✉ Alex R.         sent → opened → ✓ done    [Results]  │
│  ✉ Pat M.          sent → opened                        │
│  [+ Add recipient]                                       │
│                                                          │
│  "Workshop prep" · public · sealed Mar 27                │
│  🔗 link: [copy]                                         │
│  RECIPIENTS (invited)                                    │
│  ✉ Chris L.        sent → ✓ done             [Results]  │
│  [+ Add recipient]                                       │
│  RESPONDENTS (via link)                                  │
│  Anonymous          completed Apr 1            [Results] │
│  Anonymous          completed Apr 2            [Results] │
│  Dana K. (reg.)    completed Apr 2            [Results] │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Private letters:** No link. At least 1 recipient (otherwise letter not created). I track per-recipient pipeline: sent → opened → in progress → completed.

**Public letters:** Always has a link (🔗 with copy button). Optionally has named recipients too (emailed). Respondents appear as they complete via link (anonymous unless they registered).

**Distinction:** Recipients = people I chose. Respondents = people who found the link.

**One draft → multiple letters:** Each send creates a new sealed snapshot. If I edit the draft and send again, that's a new letter (new row in Sent tab with different sealed date and potentially different story count).

### Tab: Inbox (all incoming)

```
/letters (Inbox tab)
┌──────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │  Drafts  │  │   Sent   │  │ Inbox(3) │               │
│  └──────────┘  └──────────┘  └──────────┘                │
│                                                          │
│  📩 Robin sent you "Q2 goals"                     [Read] │
│     yesterday                                            │
│                                                          │
│  ✉ Alex R. completed "False consensus"         [Results] │
│     2h ago · Gap: 5                                      │
│                                                          │
│  🔗 Someone responded to "Workshop prep"       [Results] │
│     5h ago                                               │
│                                                          │
│  🔗 Someone responded to "Workshop prep"       [Results] │
│     Mar 29                                               │
│                                                          │
│  ✉ Chris L. completed "Workshop prep"          [Results] │
│     Mar 28                                               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Inbox is a chronological feed of everything arriving. Three item types, visually distinct:
- 📩 **Letter received** (someone sent me a letter) → [Read] → reading flow
- ✉ **Recipient responded** (someone I emailed completed) → [Results] → gap results page
- 🔗 **Link respondent** (anonymous person via public link) → [Results] → gap results page

One badge count in nav, one place to check. Icons make item types scannable without filters.

### Send Wizard

Unchanged from P581. This CR only moves the trigger point: [New Letter] on Drafts tab instead of "Prepare a Letter" on doc header. Wizard internals (predictions, share method, preview, seal) are not in scope.

### Results Page (unchanged from P581)

`/letters/:sid/results` — sealed snapshot content + that person's responses. Shared page, role-aware labels ("I predicted" vs "Author predicted"). Gap reveal, positions, /live CTA.

### Reading Flow (unchanged from P581)

`/letters/:sid/read` — cover → sequential stories → rate → reveal → next → completion summary. All P581 reading mechanics preserved.

---

## Predecessor Sections Superseded

| Section | P581 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| D28 | "Within Clarity Docs page — 'Letters' section showing sent + received. No separate `/letters` nav item V1." | Superseded | Single nav item "Letters" with three tabs: Drafts / Sent / Inbox |
| AC: Letter Visibility in Docs #1 | "Doc detail page shows 'Letters' section listing letters sent from this doc" | Superseded | Sent tab shows sealed snapshots + recipients |
| AC: Letter Visibility in Docs #4 | "Docs list page shows received letters under a 'Letters received' section" | Superseded | Inbox tab shows received letters + responses |
| AC: Letter Visibility in Docs #2 | "Each letter entry shows: date, receiver(s), status" | Extended | Same data, new location (Sent tab) |
| AC: 1-to-1 #5 | "Registered receiver can access 1-to-1 letter from within app (Docs page)" | Superseded | Receiver accesses from Inbox tab |
| UX: Sender Results View | "Letters section on doc page (below stories, no tab)" + ASCII showing Sent/Received sections | Superseded | Sent tab + Inbox tab |
| AC: Composition entry | "'Prepare a Letter' button on doc page header opens composition wizard" | Superseded | [New Letter] button on Drafts tab per draft row |
| Nav label | "Docs" as nav item | Superseded | "Letters" (or "Clarity Letters" on desktop) as single nav item with Drafts/Sent/Inbox tabs |

---

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [WARN] Data layer declared out of scope but AC items require read/unread state, inbox queries, grouped-by-draft queries | Data layer for new views added to scope | Can't specify "mark as read on click" without owning the storage mechanism |
| 2 | /challenge-prd | [WARN] "Drafts" label may confuse users who use docs without intent to send | Keep "Drafts" — commit to the email metaphor | The product wants people to send letters; the label nudges toward intended use |

---

## Requirements

1. **Single nav item "Letters" with three tabs: Drafts, Sent, Inbox.** Nav label: "Clarity Letters" on desktop, "Letters" on mobile. Replaces "Docs" nav item entirely. Inbox tab shows unread badge count in nav.
2. **Drafts tab shows drafts (formerly "docs") with [Edit] and [New Letter] actions.** [New Letter] triggers send wizard. Disabled if draft has 0 stories. [+ New] creates a new draft.
3. **Draft detail page is pure editing.** No letter sections, no sent status, no share button. Only: story management (select, write, reorder, point management). Route: `/letters/drafts/:id`.
4. **Sent tab shows sealed letters grouped by source draft/title.** Each letter shows: sealed date, story count, private/public label. Under each letter: recipients (with delivery pipeline status) and respondents (for public letters).
5. **Private letters** have no link, require ≥1 recipient email. Recipient pipeline: sent → opened → in progress → completed.
6. **Public letters** always have a copyable link. Optionally have named recipients. Respondents appear when they complete via link (anonymous unless registered).
7. **Recipients vs respondents.** Recipients = people I chose (✉). Respondents = people who came via link. Shown in separate sections on public letters.
8. **Inbox tab shows all incoming chronologically.** Three visually distinct item types: 📩 letter received ([Read]), ✉ named recipient responded ([Results]), 🔗 link respondent ([Results]). Items mark as read on click.
9. **Send wizard trigger moves** from "Prepare a Letter" on doc header to [New Letter] on Drafts tab. Wizard internals unchanged (out of scope).
10. **[+ Add recipient]** on existing sealed letters in Sent tab — allows adding more email recipients to an already-sealed letter.
11. **Reading flow and results pages unchanged.** All P581 letter mechanics (sealed-bid, gap reveal, reading sequence, completion summary) preserved exactly.

---

## What Stays the Same

- **Data model:** `clarity_letters`, `letter_deliveries`, `letter_story_snapshots`, `story_verifications` schema — unchanged
- **Letter = immutable snapshot of a draft** (D13) — unchanged
- **Send wizard** internals (predictions, mode selector, preview, seal & send) — unchanged, only trigger point moves (from doc header to Drafts tab)
- **Reading flow** (cover, sequential stories, rating, gap reveal, position engagement) — all 22 AC items preserved
- **Completion summary** — unchanged
- **1-to-1 auth flows** (token validation, magic link, create-and-sign) — unchanged
- **1-to-many anonymous flow** (sessionStorage, registration gate at exit) — unchanged
- **Sealed-bid integrity** (4 AC items) — unchanged
- **Edge functions** (send-letter-emails, create-and-open-letter) — unchanged
- **P651 onboarding redesign** — orthogonal, unaffected by this IA change

---

## Surfaces in Scope

**In scope:**
- `src/app/components/layout/bottom-nav.tsx` — rename "Docs" to "Letters", single nav item with tab structure
- `src/App.tsx` — restructure routes under `/letters` (drafts, sent, inbox tabs + draft detail)
- `src/app/pages/docs-list-page.tsx` — becomes Drafts tab: remove "Received Letters" section, add [New Letter] per draft row
- `src/app/pages/doc-detail-page.tsx` — becomes draft detail (`/letters/drafts/:id`): remove "Prepare a Letter" button, remove "Sent Letters" section, remove share action
- New: `src/app/pages/letters-sent-page.tsx` — Sent tab (sealed letters + recipients/respondents)
- New: `src/app/pages/letters-inbox-page.tsx` — Inbox tab (chronological feed of incoming)
- `src/app/components/letters/letters-section.tsx` — repurpose or replace for Sent tab context

**Out of scope:**
- Letter reading flow pages/components (unchanged)
- Letter composition wizard (internals unchanged, only trigger point moves)
- Letter results page (unchanged)
- Letter reading/composition data services (`letters-service.ts`, `calibration-service-real.ts`) — existing query logic unchanged
- Database schema and migrations (unchanged)
- Edge functions (unchanged)

**In scope (data layer for new views):**
- Inbox read/unread state storage (new column or table) and badge count query
- Sent tab: query sealed letters grouped by source draft with recipient pipeline status
- Inbox tab: chronological query across received letters + recipient responses + link responses
- P651 onboarding components

---

## Acceptance Criteria

- [x] Single nav item "Letters" (or "Clarity Letters" on desktop) replaces "Docs"
- [x] Letters page has three tabs: Drafts, Sent, Inbox
- [x] Inbox tab shows unread badge count in nav
- [x] Drafts tab shows [Edit Draft] and [Send as Letter] per draft row
- [x] [Send as Letter] navigates to compose page; disabled when draft has 0 stories
- [x] Draft detail page (`/letters/drafts/:id`) has NO letter tracking sections (no sent letters, no received letters, no "Prepare a Letter" button)
- [x] Draft detail page is pure editing: select story, write story, reorder, point management
- [x] Sent tab shows sealed letters with recipients and delivery status
- [x] Private letters show recipients only, no link
- [x] Public letters show link (with copy) + optional recipients + respondents section
- [x] [+ Add recipient] available on existing sealed letters
- [x] Inbox shows three item types with distinct icons: letter received ([Read]), recipient responded ([Results]), link respondent ([Results])
- [x] Inbox items mark as read on click
- [x] All existing P581 reading flow tests still pass
- [x] All existing P581 composition tests still pass
- [x] Surfaces NOT in scope are visually unchanged

---

## UX Design

### 1. User Flows

#### Tab Switching

The Letters page is a single route (`/letters`) with three tabs rendered as in-page tab controls (not separate routes). Tab state is preserved via URL search param (`?tab=drafts|sent|inbox`), defaulting to `drafts` when absent. Switching tabs replaces content in-place with no page transition. Browser back/forward navigates between tab states.

**Default tab on entry:** Drafts. Rationale: the most common action is editing or sending a new letter. If the user arrives from a nav badge tap (inbox has unread), default to Inbox instead.

#### Drafts Flow

1. User taps "Letters" in nav, lands on Drafts tab
2. Sees list of drafts with [Edit] and [New Letter] per row
3. **Create new draft:** Taps [+ New] at top-right. Popover offers "Private" or "Public" (same as current doc creation). New draft appears in list. User taps [Edit] to enter draft detail.
4. **Edit existing draft:** Taps [Edit] on a row. Navigates to `/letters/drafts/:id` (focus page with FocusHeader). Pure editing: select story, write story, reorder, manage points. Back button labeled "Letters" returns to Drafts tab.
5. **Start new letter from draft:** Taps [New Letter] on a row. Opens send wizard (unchanged P581 flow). [New Letter] is disabled (visually muted, no pointer events) when draft has 0 stories.

#### Sent Flow

1. User switches to Sent tab
2. Sees sealed letters grouped by source draft title, newest first
3. **Check recipient status:** Each recipient row shows the delivery pipeline (sent / opened / in progress / completed). No interaction needed for status — it updates on load.
4. **View results:** Taps [Results] next to a completed recipient or respondent. Navigates to `/letters/:sid/results` (existing P581 results page, focus page).
5. **Add recipient:** Taps [+ Add recipient] under a sealed letter. Opens a minimal inline form (email input + send button) or the same recipient step from the send wizard. On success, new recipient row appears with "sent" status.
6. **Copy public link:** Taps copy icon next to the link indicator on a public letter. Link copied to clipboard, toast confirms.

#### Inbox Flow

1. User switches to Inbox tab (or arrives via badge tap)
2. Sees chronological feed, newest first, with unread items visually distinct (bolder text weight)
3. **Read a received letter:** Taps [Read] on a received-letter item. Navigates to `/letters/:sid/read` (P581 reading flow). On tap, item marks as read. Badge count decrements.
4. **View response results:** Taps [Results] on a recipient-responded or link-respondent item. Navigates to `/letters/:sid/results`. On tap, item marks as read. Badge count decrements.
5. Items that are already read remain in the list but with normal (non-bold) text weight.

#### Badge / Read State Flow

- Badge count = number of unread Inbox items. Displayed on the Inbox tab label and on the "Letters" nav item.
- An item becomes read when the user taps its action button ([Read] or [Results]). This fires a single mutation (set `read_at` timestamp).
- Badge count is fetched on Letters page load and on tab switch to Inbox. No polling; re-fetch on focus/visibility if stale (simple `visibilitychange` listener).
- If marking as read fails (network error), the item remains visually unread. No retry loop. Toast: "Couldn't update — try again."

---

### 2. Screen Designs

#### Letters Page (shell — all three tabs)

- **Header area:** Page title "Clarity Letters" (desktop) or no title on mobile (tab bar is sufficient). No page-level actions in the header.
- **Tab bar:** Horizontal, left-aligned. Three tabs: "Drafts", "Sent", "Inbox (N)" where N is unread count (omitted when 0). Active tab has underline indicator. Tab bar is sticky below the page header on scroll.
- **Content area:** Below tab bar. Each tab's content fills the viewport minus nav and tab bar. Scrollable independently.

#### Drafts Tab

- **Top-right action:** [+ New] button (same as current [+ New Doc] popover).
- **List layout:** Vertical stack of draft cards. Each card is a single row: draft title, story count, visibility icon (lock/globe), then [Edit] and [New Letter] buttons right-aligned.
- **Visual hierarchy:** Draft title is primary text. Story count and visibility are secondary metadata. Buttons are tertiary (standard size, not oversized).
- **Three-dot menu per draft:** Contains "Delete" (same as current). Positioned at far right of row.
- **Sort order:** Most recently edited first.

#### Sent Tab

- **No top-level action button.** Sending happens from Drafts tab.
- **Grouping:** Each sealed letter is a card. Card header: draft title, sealed date, story count, private/public label. Cards sorted by sealed date, newest first.
- **Within each card:** Two sections for public letters ("Recipients" and "Respondents"), one section for private ("Recipients" only). Each person row: icon (envelope or link), name/email, status pipeline, and [Results] button (only when completed).
- **[+ Add recipient]:** Text-style button at the bottom of the recipients section within each card.
- **Public link row:** Appears at the top of a public letter card, with a copy-to-clipboard icon button.

#### Inbox Tab

- **No action buttons.** Inbox is read-only; actions are per-item.
- **List layout:** Vertical stack of inbox items, chronological (newest first). Each item: icon (per type), description line, relative timestamp, and action button ([Read] or [Results]).
- **Unread indicator:** Unread items have bolder text weight on the description line. No separate dot or badge per item — the text weight difference is the signal.
- **Content organization:** Single flat list, no grouping. The three item types are distinguished by their leading icon and description pattern:
  - Received letter: "[Sender name] sent you [title]"
  - Recipient responded: "[Name] completed [title]"
  - Link respondent: "Someone responded to [title]"

#### Draft Detail (focus page)

- **FocusHeader:** Back label "Letters" (navigates to `/letters?tab=drafts`).
- **Content:** Draft title (editable), visibility banner, story management (select, write, reorder, points). Identical to current doc detail minus: share button, "Prepare a Letter" button, sent letters section.
- **No tab bar.** This is a focus page, not a browse page.

---

### 3. Edge Cases & UI States

#### Empty States

| Screen | Condition | Display |
|--------|-----------|---------|
| Drafts tab | No drafts | Centered message: "No drafts yet." with [+ New] button below. |
| Sent tab | No sealed letters | Centered message: "No letters sent yet. Create a draft and send your first letter." |
| Inbox tab | No items | Centered message: "No letters or responses yet." |

#### Loading States

- **Tab content:** Skeleton loaders matching the layout of each tab's list items (3 skeleton rows). Tab bar remains interactive during loading.
- **Badge count:** While loading, show no badge (not "0", not a spinner). Badge appears once the count resolves.
- **Draft detail:** Same skeleton pattern as current doc detail page.

#### Error States

- **Failed to load tab content:** Replace content area with: "Something went wrong loading your [drafts/sent letters/inbox]. [Retry]" button.
- **Failed to mark as read:** Toast notification: "Couldn't mark as read." Item stays visually unread. No blocking UI.
- **Failed to add recipient:** Toast: "Couldn't add recipient. Check the email and try again." Inline form remains open with input preserved.
- **Failed to create draft:** Toast: "Couldn't create draft." Popover closes.
- **Failed to delete draft:** Toast: "Couldn't delete draft." Three-dot menu closes.

#### Edge Data

| Scenario | Behavior |
|----------|----------|
| Very long draft title | Truncate with ellipsis after 2 lines on mobile, 1 line on desktop. Full title visible on draft detail page. |
| Draft with 0 stories | [New Letter] button disabled with muted styling. Tooltip on hover (desktop): "Add at least one story first." |
| Many recipients on one letter (10+) | Show first 5, then "[+N more]" toggle to expand. All shown when expanded. |
| Many inbox items (50+) | Load first 20, then "Load more" button at bottom. No infinite scroll (avoids accidental mass-read). |
| Many sealed letters from same draft | Each is a separate card in Sent tab (different sealed dates). No collapsing. |
| One draft, multiple sealed letters | All appear in Sent tab as separate cards. Draft row in Drafts tab is unaffected. |

---

### 4. Accessibility

#### Tab Pattern (ARIA)

- Tab bar uses `role="tablist"` on the container, `role="tab"` on each tab, `role="tabpanel"` on the content area.
- `aria-selected="true"` on active tab, `"false"` on others.
- `aria-controls` links each tab to its panel ID.
- Inbox tab: `aria-label="Inbox, N unread"` when badge > 0.

#### Keyboard Navigation

- **Tab bar:** Arrow Left/Right moves focus between tabs. Enter/Space activates the focused tab. Home/End jump to first/last tab.
- **Within tab content:** Tab key moves through interactive elements (buttons, links) in DOM order. Each list item's action buttons are focusable.
- **Draft detail:** Standard focus page keyboard behavior (Escape or back-button focus returns to Letters).

#### Screen Reader Announcements

- On tab switch: announce "[Tab name] tab, [N items]" via a live region (e.g., `aria-live="polite"` on the tab panel).
- Badge count change: the nav item's `aria-label` updates to "Letters, N unread" — no separate announcement (avoids interruption).
- Unread items: use `aria-label` including "unread" for items where `read_at` is null.
- Delivery status pipeline: read as text, e.g., "sent, then opened, then completed" — not as visual-only indicators.

#### Focus Management

- On tab switch: focus moves to the tab panel (the content area), not the first item. This allows screen reader users to hear the panel announcement before navigating.
- On returning from a focus page (draft detail, results, reading flow): focus returns to the item that was activated (the [Edit], [Results], or [Read] button). Use a focus-restoration ref.

---

### 5. Responsive Design

#### Mobile (320px-767px)

- **BottomNav:** "Letters" replaces "Docs". Uses `MailIcon` (lucide). Badge count shown as a small numeric indicator on the nav icon (top-right of icon, same pattern as app notification badges).
- **Letters page:** Full-width. Tab bar spans the screen horizontally. Tab labels: "Drafts", "Sent", "Inbox (N)".
- **List items:** Full-width cards. Action buttons stack below metadata on narrow screens (below 375px), or remain inline on wider phones.
- **Draft detail:** Full-width focus page. FocusHeader with "Letters" back label.
- **Touch targets:** All buttons and tab items meet 40px minimum height. List item rows are tappable on the action button, not the entire row (avoids accidental navigation).

#### Tablet (768px-1023px)

- **BottomNav still shows** (hidden at lg breakpoint per current behavior).
- **Letters page:** Content has horizontal padding (same as current docs page). Tab bar and list items have comfortable spacing.
- **Sent tab cards:** Recipient rows can show more status detail inline (no truncation needed).

#### Desktop (1024px+)

- **No BottomNav** (existing behavior — hidden at lg). Desktop nav (if present) shows "Clarity Letters" label.
- **Letters page:** Centered content column (max-width consistent with other pages). Tab bar left-aligned within content column.
- **Drafts list:** Single-line rows with all metadata and buttons on one line.
- **Sent tab:** Cards with comfortable internal spacing. Recipient pipeline status shown as inline text, not stacked.
- **Inbox:** Single-line items with timestamp right-aligned.

---

### 6. Visual Context

#### Density Intent

- **Drafts tab:** Medium density — scanning workspace. Users are choosing which draft to edit or send from, not deeply reading. Similar to a file manager.
- **Sent tab:** Lower density — monitoring and occasional action. Each card has internal whitespace to separate the letter header from recipient rows. Users check in periodically, not continuously.
- **Inbox tab:** Medium-high density — notification feed. Users want to quickly scan what's new and act. Tighter vertical spacing than Sent, but each item must remain individually tappable without mis-taps.
- **Draft detail:** Spacious — focused editing. Same density as current doc detail page. Editing requires cognitive space.

#### Visual Reference

The Drafts tab layout inherits directly from the current docs list page (`/docs`): vertical list of cards with metadata and action buttons per row. The tab bar is a new element sitting between the page header and the list — reference the Events page for tab-bar-over-list pattern if one exists, otherwise use standard shadcn Tabs component sizing.

The Inbox tab follows a notification-feed pattern: icon + text + timestamp + action, one item per row. Comparable to a simplified email inbox (Gmail's list view density, not card-based).

The Sent tab uses a card-with-nested-list pattern: card header (letter metadata), then indented rows (recipients/respondents). This is structurally similar to the current "Sent Letters" section on doc detail, but promoted to full-page width with better spacing.

---

## Technical Architecture

### Technical Analysis

#### Current Code State

**Routing (w2 `src/App.tsx`):**
- `/docs` renders `DocsListPage` (lazy-loaded, wrapped in `ClarityLandingLayout`)
- `/d/:docId` renders `DocDetailPage` (same wrapper)
- `/letter/:docId/compose` renders `LetterComposePage` (P661 composition)
- `/letter/:docId/preview` renders `LetterPreviewPage` (P661 preview)
- `/letter/:id/results` renders `LetterResultsPage` (P581 sender results)
- `/letter/:id` renders `LetterReadingPage` (P581 reading flow)
- Focus routes that hide BottomNav: `['/agreements/', '/create', '/letter/']`

**Navigation (w2 `src/app/components/layout/bottom-nav.tsx`):**
- Four nav items: Home (`/feed`), Docs (`/docs`), Events (`/events`), My Profile
- `isActive` for Docs: `pathname.startsWith("/docs") || pathname.startsWith("/d/")`
- No badge count mechanism exists
- Hidden during live sessions, on focus routes, and at `lg` breakpoint

**Pages:**
- `docs-list-page.tsx` — auth-gated, fetches docs via `docsService.getDocsByUser()`, renders doc cards with Share/Open/Delete actions. Includes `ReceivedLettersSection` at bottom. Uses `ShareDialog` per doc.
- `doc-detail-page.tsx` — fetches doc + stories, renders `DocHeader` with "Prepare a Letter" button, story cards with DnD, `SentLettersSection` at bottom. Uses `ShareDialog`, `LetterReceiverModal`. Back link goes to `/docs`.

**Letter components (w2 `src/app/components/letters/`):**
- `letters-section.tsx` — exports `SentLettersSection` (per-doc sent letters + deliveries) and `ReceivedLettersSection` (user's received deliveries). Both are supplementary sections embedded in doc pages.
- `letter-status-badge.tsx` — renders delivery status as a badge
- `letter-receiver-modal.tsx` — modal for choosing letter recipients/mode
- `letter-cover.tsx`, `letter-story-reader.tsx`, `letter-gap-reveal.tsx`, `letter-point-engagement.tsx`, `letter-prediction-walk.tsx`, `letter-progress-bar.tsx`, `letter-review-screen.tsx`, `letter-seal-confirmation.tsx`, `letter-completion-summary.tsx` — reading flow and composition internals (unchanged by this CR)

**Data layer (w2 `src/app/data/letters-service.ts`):**
- `getSentLettersForDoc(docId)` — returns `ClarityLetter[]` for one doc
- `getDeliveriesForLetter(letterId)` — returns `LetterDelivery[]` for one letter
- `getReceivedLetters(userId)` — returns `LetterDelivery[]` where `receiver_profile_id = userId`
- No query for "all sent letters across all docs" (Sent tab needs this)
- No query for inbox items combining received + completed deliveries
- No `read_at` column exists on any table

**Database schema (confirmed from migration `20260403224331`):**
- `clarity_letters`: `id, source_doc_id, sender_id, mode, status, sealed_at, created_at`
- `letter_deliveries`: `id, letter_id, receiver_email, receiver_profile_id, receiver_name, invitation_token, invitation_expires_at, access_token_expires_at, status, stories_rated, opened_at, completed_at, created_at`
- No `read_at` column on `letter_deliveries`
- No `title` denormalized onto `clarity_letters` (title lives on `clarity_docs`)

**UI primitives:**
- No `tabs.tsx` in `src/components/ui/` — shadcn Tabs component not yet installed
- `FocusHeader` exists at `src/app/components/layout/focus-header.tsx` — accepts `onBack` + optional `label`

#### Reuse Inventory

| Component / Service | File Path (w2) | Reuse in P660 |
|---|---|---|
| `DocsListPage` | `src/app/pages/docs-list-page.tsx` | Refactor into Drafts tab content — remove `ReceivedLettersSection`, rename labels |
| `DocDetailPage` | `src/app/pages/doc-detail-page.tsx` | Refactor — remove `SentLettersSection`, `ShareDialog`, "Prepare a Letter" button |
| `SentLettersSection` | `src/app/components/letters/letters-section.tsx` | Retire from doc page; logic moves to Sent tab page |
| `ReceivedLettersSection` | `src/app/components/letters/letters-section.tsx` | Retire from docs list; logic moves to Inbox tab page |
| `LetterStatusBadge` | `src/app/components/letters/letter-status-badge.tsx` | Reuse directly in Sent tab and Inbox tab |
| `LetterReceiverModal` | `src/app/components/letters/letter-receiver-modal.tsx` | Reuse — triggered from [New Letter] on Drafts tab |
| `FocusHeader` | `src/app/components/layout/focus-header.tsx` | Reuse for draft detail page (`label="Letters"`) |
| `BottomNav` | `src/app/components/layout/bottom-nav.tsx` | Modify — rename Docs to Letters, add badge, update isActive |
| `docsService.getDocsByUser()` | `src/app/data/docs-service.ts` | Reuse for Drafts tab |
| `docsService.getDoc()` | `src/app/data/docs-service.ts` | Reuse for draft detail |
| `getSentLettersForDoc()` | `src/app/data/letters-service.ts` | Reference pattern; Sent tab needs a cross-doc variant |
| `getDeliveriesForLetter()` | `src/app/data/letters-service.ts` | Reuse directly in Sent tab |
| `getReceivedLetters()` | `src/app/data/letters-service.ts` | Reuse in Inbox tab (received letters item type) |
| `InlineVisibilityIcon` | `src/app/components/shared/visibility-badge.tsx` | Reuse in Drafts tab rows |
| `formatTimeAgo` | `src/app/utils/format-time.ts` | Reuse across all three tabs |
| `ShareDialog` | `src/app/components/shared/ShareDialog.tsx` | Remove from doc pages (sharing is via letters now) |

---

### Architecture Decisions

**AD1: Route structure — URL search param tabs, not separate routes**

- **Chosen:** Single route `/letters` with `?tab=drafts|sent|inbox` search param. Draft detail at `/letters/drafts/:id`. Legacy redirects: `/docs` -> `/letters?tab=drafts`, `/d/:id` -> `/letters/drafts/:id`.
- **Rationale:** Tab switching is in-page state, not navigation. Search params give browser history support (back/forward between tabs) without full page transitions. The spec explicitly requires this pattern: "Tab state is preserved via URL search param."
- **Trade-off:** Tab content loads on every switch (no route-level code splitting per tab). Acceptable — all three tabs are lightweight list views, not heavy components.
- **Alternative rejected:** Three separate routes (`/letters/drafts`, `/letters/sent`, `/letters/inbox`). Would cause full page transitions between tabs, breaks the in-page switching UX, and would require shared layout wrapper to avoid tab bar remounting.

**AD2: Tab state management — useSearchParams with controlled default**

- **Chosen:** `useSearchParams` to read/write `tab` param. Default to `drafts` when absent. When user arrives via nav badge tap (signaled by `?tab=inbox`), land on Inbox. No React state duplication.
- **Rationale:** Single source of truth (URL). Supports deep linking, browser history, and share-ability.
- **Trade-off:** Slightly more verbose than `useState` for tab switching. Worth it for URL persistence.

**AD3: Page decomposition — one LettersPage shell with three tab content components**

- **Chosen:** `LettersPage` renders the tab bar and conditionally renders `<DraftsTab />`, `<SentTab />`, or `<InboxTab />` based on the active search param. Each tab component is a separate file for code organization but NOT lazy-loaded (they're lightweight lists).
- **Rationale:** Single page component owns the tab bar, badge count state, and auth gate. Tab components are presentation-focused. Keeps the shell thin.
- **Trade-off:** All three tab components are in the initial chunk. Given they're list views with no heavy dependencies, this is acceptable (<5KB each estimated).

**AD4: Inbox read/unread — new `read_at` column on `letter_deliveries`**

- **Chosen:** Add `read_at TIMESTAMPTZ` column to `letter_deliveries`. An inbox item is "unread" when `read_at IS NULL` and the item is relevant to the current user (either as receiver or sender viewing responses). Mark as read by setting `read_at = now()` on the delivery row when the user clicks [Read] or [Results].
- **Rationale:** `letter_deliveries` already tracks per-delivery state (`opened_at`, `completed_at`). Adding `read_at` follows the same pattern. No new table needed.
- **Trade-off:** For sender-side inbox items (responses to my letters), `read_at` on the delivery tracks whether the *sender* has seen this completion. This means `read_at` serves double duty: receiver reads the letter, and sender reads the notification. Since each delivery row belongs to one letter-recipient pair, and the sender's "read" action is on a different UI surface than the receiver's, this is unambiguous in practice.
- **Alternative rejected:** Separate `inbox_reads` table with `(user_id, delivery_id, read_at)`. Over-engineered for V1 — only two actors per delivery (sender and receiver). If multi-reader scenarios emerge later, migrate then.
- **Migration:** Single `ALTER TABLE letter_deliveries ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;` with index on `(receiver_profile_id, read_at)` for badge count query.

**AD5: Sent tab data — new `getAllSentLetters(senderId)` query**

- **Chosen:** New service function `getAllSentLetters(senderId)` that queries `clarity_letters` where `sender_id = senderId AND status = 'sealed'`, joined with `clarity_docs` to get the source doc title. Returns letters grouped by title client-side.
- **Rationale:** Existing `getSentLettersForDoc(docId)` is per-doc. Sent tab needs all sealed letters across all docs. The join to `clarity_docs` for title is necessary since `clarity_letters` only stores `source_doc_id`.
- **Trade-off:** N+1 for deliveries (one `getDeliveriesForLetter` per letter). For V1, with typically <20 sealed letters, this is acceptable. Optimize to batch query if performance becomes an issue.

**AD6: Inbox data — new `getInboxItems(userId)` query**

- **Chosen:** New service function that combines two query sources into a unified chronological list:
  1. Received letters: `letter_deliveries WHERE receiver_profile_id = userId` (existing query)
  2. Responses to my letters: `letter_deliveries WHERE letter_id IN (SELECT id FROM clarity_letters WHERE sender_id = userId) AND status IN ('completed') AND receiver_profile_id != userId`
  - Client-side merge, sort by timestamp descending, limit 20.
- **Rationale:** Two simple queries merged client-side. No complex SQL view or RPC needed.
- **Trade-off:** Two round-trips instead of one. Acceptable for V1 with small data sets. An RPC could combine them if performance matters later.

**AD7: Badge count — computed from Inbox data, passed via context**

- **Chosen:** `LettersPage` computes unread count from Inbox query results (`items.filter(i => !i.read_at).length`). For the BottomNav badge (visible outside Letters page), add a lightweight `useUnreadLetterCount()` hook that runs a single `SELECT count(*) FROM letter_deliveries WHERE (receiver_profile_id = userId AND read_at IS NULL) OR (letter_id IN (...sender's letters...) AND status = 'completed' AND read_at IS NULL)`. This hook fires on mount and on `visibilitychange`.
- **Rationale:** Badge count needs to be visible on every page (BottomNav), not just the Letters page. A standalone hook keeps the concern isolated.
- **Trade-off:** Extra query on every page load for logged-in users. Mitigated by: single count query (not full data fetch), no polling (only refetch on visibility change).

**AD8: Shadcn Tabs component — install via CLI**

- **Chosen:** Install `@radix-ui/react-tabs` via shadcn CLI (`npx shadcn-ui@latest add tabs`). This generates `src/components/ui/tabs.tsx` with proper ARIA attributes (`role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`).
- **Rationale:** Spec requires full ARIA tab pattern. Shadcn/Radix handles keyboard navigation (arrow keys, Home/End) and focus management out of the box. Project already uses shadcn for all UI primitives.

**AD9: Legacy route redirects — React Router `<Navigate>` elements**

- **Chosen:** Add `<Navigate>` elements in `App.tsx` for `/docs` -> `/letters?tab=drafts` and a redirect component for `/d/:id` -> `/letters/drafts/:id` (needs param extraction). Both use `replace` to avoid back-button loops.
- **Rationale:** Users may have bookmarked `/docs` or `/d/:id`. Email links may contain `/d/:id` URLs. Redirects preserve access.

---

### Security Review

**RLS Policies:**
- ✅ `clarity_letters` SELECT: sender OR receiver (via `_is_letter_receiver` helper). Sufficient for Drafts (sender), Sent (sender), and Inbox (receiver) tabs.
- ✅ `letter_deliveries` SELECT: sender (via `_is_letter_sender`) OR `receiver_profile_id = auth.uid()`. Sufficient for Sent tab (sender sees deliveries) and Inbox (receiver sees theirs).
- ✅ `letter_story_snapshots`, `letter_predictions`, `letter_point_responses` — existing policies sufficient, no changes needed.

**Authentication:**
- ✅ `/letters` route uses same `useAuth()` pattern as current `/docs` — component-level auth gate with redirect to login.
- ✅ `letters-service.ts` functions call `requireAuth()` as defense-in-depth on top of RLS.

**Authorization:**
- ✅ Sent tab: sender sees only their own letters and recipients. `receiver_email` visible to sender is expected (they added those emails).
- ✅ Inbox tab: receiver sees only deliveries addressed to them. `invitation_token` not leaked across recipients (RLS scopes to own delivery row).
- ✅ Badge count query: `WHERE receiver_profile_id = auth.uid() AND read_at IS NULL` — RLS prevents cross-user leakage.
- ⚠️ **[+ Add recipient] requires new RPC.** Current `letter_deliveries` INSERT is `WITH CHECK (false)` — all inserts go through `seal_and_send_letter` RPC which only works on draft letters. **New SECURITY DEFINER RPC `add_recipient_to_sealed_letter` needed:** validates `auth.uid()` is letter sender, validates letter is sealed (not draft), creates delivery row, triggers email send.
- ⚠️ **`read_at` UPDATE by sender for "responses to my letters" inbox items.** Existing UPDATE RLS restricts to `receiver_profile_id = auth.uid()`. Sender cannot update delivery rows for completed responses. **New SECURITY DEFINER RPC `mark_inbox_item_read` needed:** validates user is either the receiver OR the sender of the parent letter, sets `read_at` timestamp.

**Input Validation:**
- ⚠️ Email validation required in `add_recipient_to_sealed_letter` RPC (server-side format check). Client-side validation alone is insufficient.
- ⚠️ Consider max recipient count per letter to prevent abuse (business logic, not critical).

**Data Protection:**
- ✅ `receiver_email` and `receiver_name` stored in plaintext — visible only to sender + specific receiver via RLS. P651 correctly redacted from anonymous RPCs.
- ✅ `invitation_token` — secret granting letter access — not leaked across recipients by RLS.

---

### Implementation Approach

**Worktree recommended:** Route restructure + nav change + 2 new pages across 7+ files.

#### Build Sequence

1. **Migration + RPCs** — Add `read_at` column to `letter_deliveries`. Create SECURITY DEFINER RPCs: `mark_inbox_item_read(delivery_id)` (validates user is receiver OR sender of parent letter), `add_recipient_to_sealed_letter(letter_id, email)` (validates sender ownership, letter is sealed, email format). Update TypeScript types.
2. **Install shadcn Tabs** — `npx shadcn-ui@latest add tabs`. Verify `src/components/ui/tabs.tsx` generated.
3. **Data layer** — Add `getAllSentLetters(senderId)`, `getInboxItems(userId)`, `markInboxItemRead(deliveryId)` (calls RPC), `addRecipientToSealed(letterId, email)` (calls RPC), `getUnreadLetterCount(userId)` to `letters-service.ts`.
4. **LettersPage shell + DraftsTab** — Create `letters-page.tsx` with tab bar. Extract Drafts tab from `docs-list-page.tsx` (remove `ReceivedLettersSection`, rename labels, add [New Letter] button). Wire `LetterReceiverModal`.
5. **SentTab** — New component consuming `getAllSentLetters` + `getDeliveriesForLetter`. Reuse `LetterStatusBadge`.
6. **InboxTab** — New component consuming `getInboxItems`. Three item types with distinct icons. Read/unread visual state.
7. **Badge hook** — `useUnreadLetterCount()` hook for BottomNav integration.
8. **Routing + Nav** — Update `App.tsx` routes (add `/letters`, `/letters/drafts/:id`, redirects for `/docs` and `/d/:id`). Update `bottom-nav.tsx` (rename, icon, badge, isActive logic, focusRoutes).
9. **Draft detail cleanup** — Modify `doc-detail-page.tsx`: remove `SentLettersSection`, `ShareDialog`, "Prepare a Letter" button. Update back link to `/letters?tab=drafts`. Update FocusHeader label.
10. **Cleanup** — Remove `ReceivedLettersSection` and `SentLettersSection` imports from old pages. Verify no dead imports.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/app/pages/letters-page.tsx` | Shell: auth gate, tab bar, tab switching, badge count |
| `src/app/components/letters/drafts-tab.tsx` | Drafts list (extracted from docs-list-page) |
| `src/app/components/letters/sent-tab.tsx` | Sent letters with recipients/respondents |
| `src/app/components/letters/inbox-tab.tsx` | Chronological inbox feed |
| `src/app/hooks/useUnreadLetterCount.ts` | Badge count hook for BottomNav |
| `src/components/ui/tabs.tsx` | Generated by shadcn CLI |
| `supabase/migrations/YYYYMMDDHHMMSS_p660_read_at_and_rpcs.sql` | `ALTER TABLE letter_deliveries ADD COLUMN read_at` + index + `mark_inbox_item_read` RPC + `add_recipient_to_sealed_letter` RPC |

#### Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Add `/letters` route, `/letters/drafts/:id` route, redirect routes for `/docs` and `/d/:id`, lazy import for `LettersPage` |
| `src/app/components/layout/bottom-nav.tsx` | Rename "Docs" to "Letters", change icon to `MailIcon`, add badge count via `useUnreadLetterCount`, update `isActive` to match `/letters` paths, update `focusRoutes` to include `/letters/drafts/` |
| `src/app/pages/doc-detail-page.tsx` | Remove `SentLettersSection` import/render, remove `ShareDialog` import/render, remove "Prepare a Letter" button, update back link to `/letters?tab=drafts`, add FocusHeader with `label="Letters"` |
| `src/app/data/letters-service.ts` | Add `getAllSentLetters()`, `getInboxItems()`, `markDeliveryRead()`, `getUnreadLetterCount()` |
| `src/app/types/index.ts` | Add `read_at: string \| null` to `LetterDelivery` interface, add `InboxItem` type |
| `src/app/components/letters/letters-section.tsx` | Remove `ReceivedLettersSection` export (dead code after Inbox tab). `SentLettersSection` can remain temporarily if other pages reference it, but mark deprecated. |
| `docs/technical/database.md` | Document `read_at` column on `letter_deliveries` |

---

## Test Coverage Strategy

### Test Files

| File | Type | What it covers |
|------|------|---------------|
| `e2e/integration/p660-letters-nav-migration.spec.ts` | Integration | `read_at` column existence, `mark_inbox_item_read` RPC (receiver, sender, third-party), `add_recipient_to_sealed_letter` RPC (sender, non-sender, draft guard, email validation), RLS delivery visibility scoping |
| `e2e/p660-letters-nav.spec.ts` | E2E | Nav rename Docs→Letters, default tab, tab switching with URL params, legacy redirects (`/docs`, `/d/:id`), browser back/forward |
| `e2e/p660-drafts-tab.spec.ts` | E2E | Draft list with [Edit]/[New Letter], edit navigation, [New Letter] disabled at 0 stories, draft detail has no letter tracking sections, back button labeled "Letters" |
| `e2e/p660-inbox-tab.spec.ts` | E2E | Received letters with [Read], completed responses with [Results], unread bold styling, badge on tab and nav, mark-as-read on click, empty state |
| `e2e/p660-smoke.spec.ts` | Smoke | Page loads without console errors, all three tabs render, auth gate |
| `e2e/a11y/p660-accessibility.spec.ts` | Accessibility | ARIA tabs pattern, arrow key navigation, Enter/Space activation, Home/End, inbox aria-label with unread count, screen-readable delivery status |
| `features/uat/p660.md` | UAT | 47 manual scenarios covering navigation, tabs, drafts, sent, inbox, badge, redirects, accessibility, error handling |

### Coverage Mapping to Acceptance Criteria

| AC | Test coverage |
|----|--------------|
| Single nav item "Letters" replaces "Docs" | `p660-letters-nav` (nav rename test), `p660-smoke` |
| Three tabs: Drafts, Sent, Inbox | `p660-smoke` (all three render), `p660-letters-nav` (tab switching) |
| Inbox badge count in nav | `p660-inbox-tab` (badge on nav and tab) |
| Drafts tab: [Edit] and [New Letter] per row | `p660-drafts-tab` |
| [New Letter] disabled at 0 stories | `p660-drafts-tab` |
| Draft detail: no letter tracking | `p660-drafts-tab` (no Sent Letters, no Prepare a Letter, no Share) |
| Inbox: three item types with actions | `p660-inbox-tab` (received [Read], completed [Results]) |
| Inbox items mark as read | `p660-inbox-tab` + `p660-migration` (RPC tests) |
| `read_at` column + RPCs | `p660-migration` (schema, RPC, RLS) |
| ARIA tabs pattern | `p660-accessibility` |
| Legacy redirects | `p660-letters-nav` (/docs, /d/:id) |

### Not Covered by Automation (UAT-only)

- Sent tab: grouped sealed letters, recipient pipeline visual, [+ Add recipient] UI flow, public link copy
- Badge decrement animation and zero-state badge hiding
- Error handling: toast messages on network failures
- Responsive behavior across breakpoints
- Visual density matching spec intent
