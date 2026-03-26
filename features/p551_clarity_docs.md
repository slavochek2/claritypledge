---
status: today
type: story
rank: 0.156
tags:
  - docs
  - privacy
  - container
  - letters
delivery_stage: uat
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-18T00:00:00.000Z
related:
  - p431
  - p422
  - p547
  - p581
  - p586
superseded_by: p590
locked_at: '2026-03-26T05:41:19.555Z'
uat_file: features/uat/p551.md
test_files:
  - e2e/integration/p551-clarity-docs-migration.spec.ts
  - e2e/p551-clarity-docs.spec.ts
  - e2e/p551-smoke.spec.ts
  - e2e/a11y/p551-accessibility.spec.ts
---

# P551: Clarity Docs — Curated Story Collections

## Problem Statement

**Current state:** ClarityPledge has two surfaces for content — profiles (stories, points) and the feed. Both are individual. Stories belong to an author's profile. Points are globally public and ownerless. After a /live session, each person walks away with their own artifacts on their own profile.

**Pain points:**
- **No curation surface.** Stories accumulate on profiles as a flat list. There's no way to group stories by theme, session, or relationship — no "this is the collection I want to send to my co-founder" or "these are the stories from our therapy work."
- **Privacy insecurity.** Stories are created within profile context and feel like they could leak to the feed. The founder himself (the first user) doesn't trust the current privacy model for sensitive content. If the product's creator feels insecure, no therapy client or vulnerable co-founder pair will trust it either.
- **Points are always public.** A point like "I feel unheard when we discuss finances" created in a therapy context is immediately visible to everyone (RLS: `USING(true)`). There is no mechanism for private claims.
- **No composition surface for letters.** P581 (Clarity Letters) needs a source — a curated collection that becomes the letter's content. Without docs, letter composition requires an ad-hoc story selector that duplicates what docs already provide.
- **Private use cases have no home.** Therapy, pair prep, family contexts — any situation where understanding needs to be verified privately. These users need private stories that exist only within a doc, sent as letters to specific people (who may not have accounts).

**Who's affected:**
- Co-founder pairs who want to accumulate session-by-session understanding in one place
- Therapy/couples dyads who need claims that never touch the public feed
- Workshop facilitators who curate false-belief stories into letters for participants
- Slava (founder) who wants to use the platform with his own psychotherapist

## Intention (Why This Matters)

**Strategic importance:** A Clarity Doc is the compose/edit surface for Clarity Letters (P581). The Doc is where stories accumulate and get curated; the Letter is the delivery mechanism with assessment. Without docs, letters require a throwaway composition flow that gets replaced when docs ship. Building docs first means letters have a proper source from day one.

Docs also unlock the therapy/couples market by solving the trust problem architecturally — private docs contain private stories that are invisible outside the doc/letter context. No toggles, no "are you sure?" — private by construction.

**Why now:**
- P581 (Letters) is next in the build sequence. Letters need a content source. Building docs first avoids throwaway composition UI.
- First Clarity Partner Agreement signed (Jan + Nejc, Mar 22). They need a place to accumulate stories between sessions.
- The therapy use case is Slava's personal need — dog-fooding drives urgency and quality.

**Impact if not solved:**
- P581 builds a standalone composition flow that gets replaced when docs ship (migration debt)
- Therapy/couples use case stays permanently blocked (no private claims possible)
- Co-founder pairs get no accumulating artifact — every session is ephemeral

## Business Requirements

**Must-haves:**
- Users can create a Clarity Doc instantly (Google Docs pattern — click creates and opens, title editable inline, defaults to "Untitled Doc" + private)
- Users can add their own stories to a doc (stories only — no standalone points as doc items in V1)
- Users can create stories from within a doc using the full existing story creation flow (same page as profile, with doc context — back button returns to doc, visibility inherited from doc)
- After creating a story in a doc, user can immediately add points (same flow as profile story detail)
- Private docs can contain both private stories AND existing public stories (doc is a private collection — public stories retain their independent visibility)
- Public docs can only contain public stories (private stories in a public doc would expose private content)
- Private stories cannot be added to a public doc (visibility leak blocked)
- A private story can appear in multiple private docs owned by the same user
- Doc owner can reorder stories within a doc (drag or manual position)
- Doc owner can reorder and hide/show individual points within a story per doc (controls which points appear and in what order)
- Doc owner can remove a story from a doc via `[x]` icon (unlinks — does not delete the story itself)
- Doc owner can delete a Clarity Doc via `[...]` menu in doc header (destructive, confirmation dialog)
- Stories and points within a doc are tappable — open full detail pages (same as profile). Back button returns to doc
- Doc page is accessible at its own URL (`/d/:docId`)
- Private doc content is invisible to non-owners at every level (database, API, UI)
- Each person owns their own doc — no co-ownership, no shared editing

**Success conditions:**
- A facilitator can curate stories with points (including both true knowledge and false beliefs as points) into a doc
- The founder feels confident using private docs for therapy work (the ultimate trust test)
- Content created inside a private doc stays invisible outside the doc/letter context

**Dependency:** P586 (Visibility & Privacy Foundation) must ship first — provides point visibility RLS, story immutability, `shared` removal, and visual privacy indicators.

**Constraints:**
- Points come through story-point links (existing `story_points` junction) — no standalone points as doc items
- Stories have visibility (`public`/`private`) — `shared` removed by P586. Story visibility is immutable (enforced by P586)
- No co-ownership in V1 — each partner has their own doc with their own stories on shared points
- Doc is the mutable editing surface; letter (P581) is the immutable snapshot for delivery
- Orphan points (created in /live but not yet linked to a story) are public until linked — known gap, acceptable for V1. After P586 ships, point visibility cascade will be evaluated (see P586 open questions)
- v1 does NOT include auto-fill from /live sessions (future — P547 integration)
- v1 does NOT include canvas/grid layout (sequential blocks only)
- v1 does NOT include letter integration UI — "Send as Letter" button ships with P581

## User Stories

**As a facilitator preparing a workshop:**
- I want to create a doc with curated stories and points (including both true knowledge and false beliefs formulated as points), so I have a structured collection ready for delivery

**As a co-founder (partner A):**
- I want to create a doc with my stories about our key decisions, so I can curate my perspective and later send it as a letter to my co-founder

**As a therapy client:**
- I want to create a private doc with stories about my beliefs and schemas, so they exist in a trusted private space

**As a doc owner:**
- I want to add stories to my doc over time, so my collection grows session by session
- I want to reorder stories and points within my doc to control how the content flows

**As a private doc owner:**
- I want stories I create inside my private doc to be automatically private, so I don't have to think about visibility settings
- I want to be certain nothing in my private doc appears on my profile or in any feed
- I want to clearly see which stories are private and which are public from the card itself

## Jobs to Be Done

**When I finish a coaching session with my co-founder:**
- I want to file stories from the session into a doc, so they accumulate over time (motivation: the doc is the working surface that grows session by session; delivery happens later via P581 letters)

**When I'm working through something sensitive with my therapist:**
- I want to file beliefs and observations in a private doc, so they exist only in a trusted space I control (motivation: private by construction — no toggles, no leaks)

**When I'm curating stories for a workshop:**
- I want to arrange stories and their points in a specific order, so the reading flow makes sense for the audience (motivation: curation = ordering + selection)

## Outcomes (Success Metrics)

**Adoption:**
- At least 1 doc created within 2 weeks of launch
- At least 2 co-founder pairs using docs to accumulate stories within 4 weeks

**Trust:**
- Founder (Slava) uses private docs for personal therapy work and reports feeling secure (qualitative)
- Zero instances of private doc content appearing in feed, profile, or search (absolute — any leak is a critical bug)

## Acceptance Criteria

### Doc List & Creation
- [ ] User can see their Clarity Docs at `/docs` route
- [ ] "Docs" added to desktop nav (Home → **Docs** → Events → My Profile) and mobile bottom nav (replaces "Start Session" which moves to top-right header near avatar)
- [ ] User can create a new Clarity Doc instantly — click `[+ New Doc]` creates and opens (no modal). Title defaults to "Untitled Doc", visibility defaults to private (Google Docs pattern)
- [ ] Doc list shows visibility icon (lock for private, globe for public), title, item count, last updated. Private cards: amber left border. Public cards: blue left border
- [ ] Empty state: notebook icon + "No Clarity Docs yet" + `[+ Create a Doc]` CTA

### Doc Detail Page
- [ ] Doc page accessible at `/d/:docId`
- [ ] Header: `< Docs` back button, inline editable title, `[lock Private ▾]` / `[globe Public ▾]` visibility dropdown, `[...]` menu (Delete this Clarity Doc — red, confirmation dialog)
- [ ] Visibility dropdown: switching to Public blocked if doc contains private stories (toast: "Remove private stories first")
- [ ] Top-right action buttons: `[+ Write a story]` and `[Select your story]`
- [ ] Stories displayed in user-controlled order (default: chronological add order)
- [ ] Story cards reuse exact profile stories tab `StoryCardDetail` component (author, text, date, points with position indicators). `StoryCardDetail` extended with optional `renderPoints` prop for per-doc point ordering/hide controls
- [ ] Story cards tappable → open full story detail page (same as profile). Back button returns to doc
- [ ] Points tappable → open full point page (same as profile). Back button returns to doc
- [ ] Privacy banner: amber bg for private docs ("Only you can see this Clarity Doc"), blue bg for public docs ("Visible on your profile") — sticky top
- [ ] Empty doc state: notebook icon + "Add your first story" + text pointing to action buttons

### Adding & Removing Content
- [ ] `[+ Write a story]` button → navigates to full story creation page (same as from profile), with doc context: back button returns to doc, amber banner "This story will be private — only you can see it" for private docs, button label "Save Private Story"
- [ ] After saving a story from doc context → story detail page opens (same as profile) where user can immediately add points. Points inherit doc visibility (amber banner "This point will be private")
- [ ] `[Select your story]` button → opens search panel: search input → filtered list of visibility-compatible stories (private doc shows private + public; public doc shows public only). Stories already in doc excluded. Reuses /live selection pattern
- [ ] User can remove a story from a doc via `[x]` icon on hover/always-visible (unlinks — does not delete the story)
- [ ] Only the user's own stories can be added to a doc (RLS: `stories.author_id = auth.uid()`). Adding another user's public story is blocked
- [ ] Stories created from doc context inherit the doc's visibility automatically
- [ ] User can add existing public stories to a private doc (doc is a private collection; stories retain their own visibility)
- [ ] Cannot add a private story to a public doc (public doc page would expose private content)
- [ ] Public stories in a private doc remain visible on owner's profile/feed independently (doc privacy ≠ story privacy)
- [ ] UNIQUE constraint: same story cannot appear twice in the same doc
- [ ] A private story can appear in multiple private docs owned by the same user

### Ordering & Curation (Tally-Style Block Controls)
- [ ] Unified hover controls on story blocks: `[≡]` drag handle + `[x]` remove from doc — appear on hover (desktop), always visible (mobile)
- [ ] Unified hover controls on point rows: `[≡]` drag handle + `[eye]` hide/show in this doc — appear on hover (desktop), always visible (mobile)
- [ ] Icon semantics are consistent everywhere: `[x]` = remove/unlink (non-destructive), `[trash]` = delete permanently (only in detail pages/menus, always with confirmation), `[eye]` = hide/show in doc context
- [ ] Doc owner can reorder stories within a doc by dragging `[≡]` handle
- [ ] Doc owner can reorder points within a story (per doc) by dragging `[≡]` handle
- [ ] Doc owner can hide/show individual points via `[eye]` toggle. Hidden points show in edit view with reduced opacity + "(hidden)" label, actually hidden in read/letter mode
- [ ] `doc_stories.position` column determines story display order
- [ ] `doc_stories.point_config` JSON column stores per-doc point ordering and visibility (e.g., `{ "order": [pointId1, pointId2], "hidden": [pointId3] }`) — P581 letter snapshots preserve this config
- [ ] Points not in `point_config` default to visible, ordered by `story_points.created_at`

### Privacy & Visibility
- [ ] Private doc (as a collection) does NOT appear in the public feed or profile
- [ ] Public stories within a private doc remain independently visible on profile/feed (the doc is private, not the stories)
- [ ] Private doc content does NOT appear in any search or discovery
- [ ] Non-owners cannot see private doc content even if they guess the URL (auth + ownership check)
- [ ] Doc visibility changeable via header dropdown. Switching to Public blocked if doc contains private stories (toast error)
- [ ] Story visibility is immutable (enforced by P586) — no UI to change it
- [ ] Visual privacy indicators (lock/globe) on story cards and point cards (provided by P586)

## Out of Scope (v1)

- Co-ownership / shared editing (future — each person owns their own doc)
- Section headers between items (future — V1 is stories only)
- Publish-to-feed flow (story visibility is immutable — create with the right visibility from the start)
- Remix flow ("copy points to your own doc, write your own stories") — future
- Auto-fill from /live sessions (future — P547 integration)
- Canvas/grid layout (future — CSS renderer over sequential blocks)
- Doc-to-doc linking (future)
- Version history UI (future)
- Importing existing public points into a doc
- Real-time collaborative editing (not needed — single owner)
- Doc templates (e.g., "Clarity Canvas template") — future
- ~~Doc deletion (V1: docs persist)~~ (moved to V1 — `[...]` menu in doc header, confirmation dialog)
- Letter integration UI ("Send as Letter" button, letter status section) — ships with P581
- "One doc, many letters" with individual predictions — P581 scope
- Snapshots/versioning (letter = frozen snapshot of doc at send time) — P581 scope
- Private story encryption — separate backlog spec (P551 relies on RLS-only privacy)
- Point visibility RLS, story immutability, `shared` removal, visual indicators — P586 (prerequisite)
- ~~Hiding specific linked points from display — future~~ (moved to V1 via per-doc `point_config`)

## UX Flows (from /ascii-flows exploration)

### Navigation Changes

**Desktop nav:** Home → **Docs** → Events → My Profile. "Start a Clarity Session" button stays top-right.

**Mobile bottom nav:** Home → **Docs** → Events → My Profile. "Start Session" (`[mic]` icon) moves to top-right header near avatar.

### Flow 1: Doc List — Empty State

```
+================================================================+
|  [C] Clarity Pledge    Home  Docs  Events  My Profile          |
|                                       [Start a Clarity Session] |
+================================================================+
|                                                                 |
|                     (notebook icon)                             |
|                                                                 |
|           No Clarity Docs yet                                   |
|           Curate stories into collections                       |
|           you control.                                          |
|                                                                 |
|                    [+ Create a Doc]                              |
|                                                                 |
+================================================================+
```

### Flow 2: Doc List — Populated

```
+================================================================+
|  [C] Clarity Pledge    Home  Docs  Events  My Profile          |
|                                       [Start a Clarity Session] |
+================================================================+
|                                                                 |
|  Your Clarity Docs                                 [+ New Doc] |
|                                                                 |
|  +----------------------------------------------------------+  |
|  | [lock]  Therapy Notes                              [>]   |  |
|  |         3 stories  ·  Updated 2h ago                      |  |
|  +----------------------------------------------------------+  |
|  | [lock]  Session Notes — Mar 2026                   [>]   |  |
|  |         1 story   ·  Updated 1d ago                       |  |
|  +----------------------------------------------------------+  |
|  | [globe] Workshop: False Beliefs                    [>]   |  |
|  |         7 stories  ·  Updated 3d ago                      |  |
|  +----------------------------------------------------------+  |
|                                                                 |
+================================================================+
```

- Private cards: `border-l-4 border-l-amber-400`. Public cards: `border-l-4 border-l-blue-500`.
- `[+ New Doc]` creates doc instantly and navigates to it. No modal.

### Flow 3: New Clarity Doc — Just Created (Google Docs Style)

```
+================================================================+
|  [C] Clarity Pledge    Home  Docs  Events  My Profile          |
|                                       [Start a Clarity Session] |
+================================================================+
| < Docs  [Untitled Doc________] [lock Private ▾]               |
|                        [+ Write a story]  [Select your story]  |
+================================================================+
| +----------------------------------------------------------+  |
| | [lock]  PRIVATE  ·  Only you can see this Clarity Doc    |  |
| +----------------------------------------------------------+  |
|                                                                 |
|                     (notebook icon)                             |
|                                                                 |
|           Add your first story                                  |
|           Write a new one or select from                        |
|           your existing stories.                                |
|                                                                 |
+================================================================+
```

- Title is inline editable text field. Defaults to "Untitled Doc".
- `[lock Private ▾]` dropdown: Private / Public. Defaults to Private.
- Switching to Public blocked if doc contains private stories.
- Two action buttons top-right: `[+ Write a story]` and `[Select your story]`.

### Flow 4: Private Clarity Doc — With Stories (Profile Card Layout)

```
+================================================================+
| < Docs  [Therapy Notes_______] [lock Private ▾]      [...]    |
|                        [+ Write a story]  [Select your story]  |
+================================================================+
| +----------------------------------------------------------+  |
| | [lock]  PRIVATE  ·  Only you can see this Clarity Doc    |  |
| +----------------------------------------------------------+  |
|                                                                 |
|  3 stories                                                      |
|                                                                 |
|  [≡] [x]                                                       |
|  +----------------------------------------------------------+  |
|  | [lock]  Slava Ladischenski                                |  |
|  |                                                           |  |
|  | "Last Tuesday when we reviewed the budget, I tried       |  |
|  |  to explain my concern but felt like the conversation    |  |
|  |  moved on before I finished."                             |  |
|  |                                                           |  |
|  |  Mar 15                                                   |  |
|  |                                                           |  |
|  |  📌 Points                                                |  |
|  |                                                           |  |
|  |    [≡] [eye]                                              |  |
|  |    [lock] 📌 Trust requires consistent follow-through     |  |
|  |    -3 ·········|·· +3     Slava: Agrees+                 |  |
|  |                                                           |  |
|  |    [≡] [eye]                                              |  |
|  |    [lock] 📌 Financial decisions need both voices         |  |
|  |    -3 ····|······· +3     Slava: Strongly agrees          |  |
|  +----------------------------------------------------------+  |
|                                                                 |
|  [≡] [x]                                                       |
|  +----------------------------------------------------------+  |
|  | [lock]  Slava Ladischenski                                |  |
|  |                                                           |  |
|  | "I believe that trust requires consistent follow-through |  |
|  |  on small commitments before big ones can be attempted." |  |
|  |                                                           |  |
|  |  Mar 22                                                   |  |
|  |                                                           |  |
|  |  📌 Points                                                |  |
|  |    [≡] [eye]                                              |  |
|  |    [lock] 📌 Small commitments build trust                |  |
|  |    -3 ·········|·· +3     Slava: Agrees                   |  |
|  +----------------------------------------------------------+  |
|                                                                 |
|  [≡] [x]                                                       |
|  +----------------------------------------------------------+  |
|  | [globe]  Slava Ladischenski                               |  |
|  |                                                           |  |
|  | "When I told my co-founder about the client feedback,    |  |
|  |  I realized I had been filtering the negative parts."    |  |
|  |                                                           |  |
|  |  Mar 24                                                   |  |
|  |  📌 0 points                                              |  |
|  +----------------------------------------------------------+  |
|                                                                 |
+================================================================+
```

- **Story cards = exact profile stories tab `StoryCard` component.** Same layout, just with `[≡] [x]` overlay on hover (desktop) / always visible (mobile).
- **Point rows = exact profile point rows.** Same component, just with `[≡] [eye]` overlay.
- `[≡]` = drag to reorder. `[x]` = remove story from doc (unlink). `[eye]` = hide/show point in this doc.
- Tapping story card → opens full story detail page (same as profile). Back → doc.
- Tapping point → opens full point page (same as profile). Back → doc.
- `[...]` menu in header: "Delete this Clarity Doc" (red, confirmation dialog).
- Hidden point state: `[eye-off]` icon, reduced opacity, "(hidden)" label. Visible in edit view, hidden in read/letter mode.

### Flow 5: Public Clarity Doc

```
+================================================================+
| < Docs  [Workshop: False Beliefs] [globe Public ▾]    [...]    |
|                        [+ Write a story]  [Select your story]  |
+================================================================+
| +----------------------------------------------------------+  |
| | [globe]  PUBLIC  ·  Visible on your profile              |  |
| +----------------------------------------------------------+  |
|                                                                 |
|  7 stories                                                      |
|  ...same card layout, all globe icons, same [≡][x] controls... |
+================================================================+
```

- Blue banner instead of amber. Only public stories allowed.

### Flow 6: Write a Story from Doc (Full Existing Flow)

```
+=================================================================+
| < Therapy Notes                                                  |
+=================================================================+
| +----------------------------------------------------------+  |
| | [lock] This story will be private — only you can see it  |  |
| +----------------------------------------------------------+  |
|                                                                 |
|  (SAME story creation page as from profile)                     |
|  (text input, same layout, same components)                     |
|                                                                 |
|                                          [Save Private Story]   |
+=================================================================+
```

After saving → story detail page opens in doc context:

```
+=================================================================+
| < Therapy Notes                                                  |
+=================================================================+
|                                                                 |
|  (SAME story detail page as from profile)                       |
|  (story text, author, date, points section)                     |
|                                                                 |
|  +----------------------------------------------------------+  |
|  | [lock] This point will be private — only you can see it  |  |
|  | [Add a point to this story...________________________]    |  |
|  |                                  [Add Private Point]      |  |
|  +----------------------------------------------------------+  |
|                                                                 |
+=================================================================+
```

- Same pages as profile flow. Only differences: back button says "< Therapy Notes" (doc name), amber inheritance banners for private docs.
- User can add points immediately after story creation.

### Flow 7: Select Your Story (Search Panel)

```
+--------------------------------------------------------------+
|  Select your story                                      [X]  |
|                                                               |
|  [Search your stories...________________________]             |
|                                                               |
|  +----------------------------------------------------------+|
|  | "I believe that trust requires..."            [+ Add]    ||
|  | Mar 15 · [lock]                                          ||
|  +----------------------------------------------------------+|
|  | "When we discussed the budget..."             [+ Add]    ||
|  | Mar 12 · [globe]                                         ||
|  +----------------------------------------------------------+|
|  | "I told my therapist about..."                [+ Add]    ||
|  | Mar 8 · [lock]                                           ||
|  +----------------------------------------------------------+|
|                                                               |
|  3 stories match                                              |
+--------------------------------------------------------------+
```

- Reuses /live selection pattern. Filtered by visibility compatibility. Stories already in doc excluded.

### Flow 8: Mobile — Doc List

```
+-------------------------------+
| [C] Clarity Pledge  [mic] O  |
+-------------------------------+

        (doc list content)

+-------------------------------+
| [Home] [Docs] [Events] [Me]  |
+-------------------------------+
```

- `[mic]` = Start Session, top-right near avatar.
- Bottom nav: Home, **Docs**, Events, My Profile.

### Flow 9: Mobile — Doc Detail

```
+-------------------------------+
| [C] Clarity Pledge  [mic] O  |
+-------------------------------+
| < Docs  Therapy No.. [lock▾] |
| [+ Write]  [Select your story]|
+================================+
| [lock] Private · 3 stories     |
+================================+
|                                 |
| [≡][x]                         |
| +-----------------------------+ |
| | [lock] Slava Ladischenski   | |
| |                             | |
| | "Last Tuesday when we..."   | |
| | Mar 15                      | |
| |                             | |
| | 📌 Points                   | |
| |  [≡][eye]                   | |
| |  [lock] Trust requires...   | |
| |  -3 ·····|··· +3            | |
| +-----------------------------+ |
|                                 |
| [≡][x]                         |
| +-----------------------------+ |
| | [lock] Slava Ladischenski   | |
| | "I believe that trust..."   | |
| | Mar 22                      | |
| +-----------------------------+ |
|                                 |
+-------------------------------+
| [Home] [Docs] [Events] [Me]  |
+-------------------------------+
```

- Controls `[≡][x]` and `[≡][eye]` always visible on mobile (no hover).

### Flow 10: Drag Reordering

```
  [≡] [x]                                 ← dragging this story
  +----------------------------------------------------------+
  | [lock]  Slava Ladischenski                               |
  | "I believe that trust requires..."                        |
  +----------------------------------------------------------+
                          (elevated shadow)

  +- - - - - - - - - - - - - - - - - - - - - - - - - - - - -+
  |  (drop zone — dashed border, light blue bg)               |
  +- - - - - - - - - - - - - - - - - - - - - - - - - - - - -+

  [≡] [x]
  +----------------------------------------------------------+
  | [globe]  Slava Ladischenski                              |
  | "When I told my co-founder..."                            |
  +----------------------------------------------------------+
```

- Same drag pattern for both stories and points (nested level).

### Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Nav placement | Desktop: Home → Docs → Events → My Profile. Mobile: replaces "Start Session" in bottom nav | Docs is a primary surface |
| Doc creation | No modal. Instant create → open. Google Docs style | Zero friction, rename anytime |
| Title | Inline editable in header, defaults "Untitled Doc" | Always accessible |
| Visibility | Header dropdown, defaults private. Public blocked if private stories exist | Safe default + constraint enforcement |
| Doc deletion | `[...]` menu → "Delete this Clarity Doc" (red, confirmation) | Rare action, doesn't need prominence |
| Story cards | Exact profile `StoryCard` component reused | Maximum consistency, zero new components |
| Point rows | Exact profile point rows reused | Same |
| Block controls | Tally-style: `[≡]` drag + `[x]` remove (stories) / `[eye]` hide (points) — hover desktop, always mobile | One pattern for both levels |
| Icon semantics | `[x]` = remove/unlink, `[trash]` = delete permanently (only in menus), `[eye]` = hide/show | Consistent everywhere |
| Story creation | Full existing flow (same page as profile) with doc context | User can add points immediately after |
| Story selection | Search panel, /live pattern | Proven, reusable |
| Navigation | Stories/points tappable → full detail pages. Back → doc | Reuse existing detail pages |
| Privacy banner | Amber (private) / Blue (public), sticky top | Trust signal |
| Ordering | Drag handles at both story and point level | Tally pattern, one interaction model |
| Cross-doc linking | Private story can appear in multiple private docs (same owner) | No reason to restrict |
| Letter integration | Deferred to P581 | Clean boundary |

## UX Design

### 1. User Flows — Validated and Gap-Filled

The ASCII flows (above) are confirmed accurate against the codebase. Below documents the complete interaction model with gaps filled.

#### Flow A: Doc List Page (`/docs`)

**Entry:** Desktop nav "Docs" link or mobile bottom nav "Docs" tab. Auth-gated — unauthenticated users redirected to `/login`.

**Page type:** Browse page. BottomNav visible on mobile. No FocusHeader.

**States:**
1. **Loading** — `ClarityPageLoader` spinner centered (same pattern as profile page load).
2. **Empty** — Notebook icon + "No Clarity Docs yet" + subtitle "Curate stories into collections you control." + `[+ Create a Doc]` primary button (blue, centered).
3. **Populated** — "Your Clarity Docs" heading + `[+ New Doc]` button (top-right, secondary style). Cards listed vertically, sorted by `updated_at` descending. Each card shows: visibility icon (lock/globe), title, story count ("N stories"), relative time ("Updated 2h ago"), chevron right. Private cards: `border-l-4 border-l-amber-400`. Public cards: `border-l-4 border-l-blue-500`.
4. **Error** — Toast: "Couldn't load your docs. Please try again." + retry affordance.

**Interactions:**
- `[+ New Doc]` / `[+ Create a Doc]` — POST creates doc, navigates to `/d/:docId`. Loading state: button shows spinner, disabled during creation. If creation fails: toast "Couldn't create doc. Please try again."
- Card tap — navigates to `/d/:docId`.
- Pull-to-refresh — standard browser behavior, no custom pull-to-refresh.

#### Flow B: Doc Detail Page (`/d/:docId`)

**Page type:** Browse page (primary surface, not transient). BottomNav visible on mobile. Route added to `bottom-nav.tsx` active-state matching for `/d/`.

**Header structure:**
- `< Docs` back link (navigates to `/docs`).
- Inline editable title — `contentEditable` or text input styled as heading. Saves on blur or Enter. Empty title reverts to "Untitled Doc". Max length: 100 characters. Title truncated with ellipsis on mobile when space is constrained.
- `[lock Private ▾]` / `[globe Public ▾]` visibility dropdown. Styled as compact dropdown button matching existing `InlineVisibilityIcon` patterns.
- `[...]` overflow menu — "Delete this Clarity Doc" (red text, destructive).
- Below header: `[+ Write a story]` (primary blue button) and `[Select your story]` (secondary/outline button).

**Privacy banner:**
- Amber background: `[lock] PRIVATE · Only you can see this Clarity Doc` — for private docs.
- Blue background: `[globe] PUBLIC · Visible on your profile` — for public docs.
- Sticky below header. Uses same amber/blue pattern established by P586 (`bg-amber-50 border-amber-200` / `bg-blue-50 border-blue-200`).

**States:**
1. **Loading** — `ClarityPageLoader` centered below header.
2. **Empty doc** — Notebook icon + "Add your first story" + "Write a new one or select from your existing stories." (centered, muted text).
3. **Populated** — Story count label ("N stories"), then story cards in user-controlled order.
4. **Not found / unauthorized** — "This doc doesn't exist or you don't have access." + back link to `/docs`. Same pattern as profile 404.
5. **Error** — Toast for transient failures.

**Story cards within doc:**
- Reuse `StoryCardDetail` component (from `src/app/components/social/StoryCardDetail.tsx`). This is the production story card with author avatar, story text, date, visibility icon (`InlineVisibilityIcon`), linked points with expand/collapse, position buttons on points. Private stories show amber left border; public stories show blue left border (P586 already implements this in `StoryCardDetail`).
- **Doc-context overlay controls** (new — not part of `StoryCardDetail` itself):
  - Story level: `[≡]` drag handle + `[x]` remove — positioned above the card, left-aligned.
  - Point level: `[≡]` drag handle + `[eye]` toggle — positioned above each point row within the expanded points section.
  - Desktop: controls appear on hover (story card hover zone includes the control row above it).
  - Mobile: controls always visible.
  - Control row height: 32px. Icons: 20px. Touch targets: min 44px tap area (padding around icons).

**Point hide/show behavior:**
- `[eye]` icon toggles point visibility in this doc context.
- Visible points: normal opacity, `[eye]` icon.
- Hidden points: `opacity-50`, `[eye-off]` icon, "(hidden)" label in muted text after point text.
- Hidden points visible only in doc edit view (owner viewing their own doc). In read/letter mode: hidden points omitted entirely.

**Inline title editing:**
- Click title text to enter edit mode.
- Input auto-focuses, text selected on focus.
- Save on: blur, Enter key.
- Cancel on: Escape (reverts to previous value).
- Validation: non-empty after trim. If empty on blur, reverts to "Untitled Doc".
- Saving indicator: none visible (optimistic save). Toast on failure: "Couldn't update title."

#### Flow C: Creating a Story from Doc Context

**Trigger:** `[+ Write a story]` button on doc detail page.

**Navigation:** Navigates to `/create` with doc context query params (e.g., `/create?docId=xxx`). This is the same `CreateStoryPage` (`src/app/pages/create-story-page.tsx`), extended with doc awareness.

**Doc context differences (vs. standalone `/create`):**
- Back button: shows `< {Doc Title}` instead of generic "Back". Navigates to `/d/:docId`.
- Visibility: For private docs, visibility is forced to `private` (no selector shown). Amber banner: "This story will be private — only you can see it". Save button: "Save Private Story" (amber-accented or standard blue with "Private" label). For public docs, visibility forced to `public`, blue banner: "This story will be visible on your profile", save button: "Save Story".
- After save: navigates to `/story/:storyId` (story detail page) with doc context preserved (back button returns to doc). The story is auto-linked to the doc.

**Point creation from story detail (in doc context):**
- Same story detail page (`src/app/pages/story-detail-page.tsx`), with doc context back navigation.
- When adding a point to a private story: amber banner "This point will be private — only you can see it". Button label: "Add Private Point".
- Cross-visibility guard: if a public story tries to link a private point (DB trigger rejects), toast: "This point is private and cannot be linked to a public story. To discuss this topic publicly, create a new public point."

#### Flow D: Selecting an Existing Story

**Trigger:** `[Select your story]` button on doc detail page.

**Pattern:** Slide-in panel (right side on desktop, bottom sheet on mobile) or full-overlay panel. Reuses the search-and-select pattern from `StorySearchPicker` (`src/app/components/partners/story-search-picker.tsx`), but enhanced for doc context.

**Panel contents:**
- Header: "Select your story" + `[X]` close button.
- Search input: "Search your stories..." with search icon. Filters as user types (debounced 200ms).
- Results list: Shows stories filtered by visibility compatibility:
  - Private doc: shows both private and public stories owned by user.
  - Public doc: shows only public stories owned by user.
  - Stories already in this doc are excluded from results.
- Each result row: story text preview (truncated at 80 chars), date, visibility icon (lock/globe), `[+ Add]` button.
- `[+ Add]` adds story to doc, shows brief success feedback (row animates out or shows check), story appears in doc behind the panel.
- Footer: "N stories match" count.

**States:**
1. **Loading** — Spinner in results area while stories load.
2. **Empty results (no stories at all)** — "You haven't created any stories yet." + link "Write your first story" (navigates to `/create?docId=xxx`).
3. **Empty search results** — "No stories match '{query}'" (same pattern as `StorySearchPicker`).
4. **All compatible stories already in doc** — "All your stories are already in this doc."
5. **Error** — Toast: "Couldn't load your stories."

#### Flow E: Drag Reordering

**Interaction model:**
- Grab `[≡]` handle to initiate drag.
- Dragged item elevates (shadow increase, slight scale: `scale-[1.02]`).
- Drop zones appear between remaining items (dashed border, light blue background: `border-dashed border-blue-300 bg-blue-50/50`).
- On drop: item moves to new position, `position` values updated optimistically, server sync in background.
- On drag cancel (Escape or drop outside valid zone): item returns to original position.
- Works for both story blocks (reorder stories in doc) and point rows (reorder points within a story in this doc's context).

**Touch support:**
- Long-press on `[≡]` handle initiates drag on mobile (200ms threshold).
- Haptic feedback on drag start (if browser supports).
- Scroll-while-dragging: auto-scroll when dragged item is near viewport edges.

**Keyboard alternative:**
- Focus on `[≡]` handle, press Space/Enter to pick up.
- Arrow keys to move position.
- Space/Enter to drop, Escape to cancel.
- Screen reader announcements: "Grabbed {story title}. Position 1 of 3." / "Moved to position 2 of 3." / "Dropped at position 2 of 3."

#### Flow F: Visibility Change

**Trigger:** Visibility dropdown in doc header.

**Private to Public:**
- If doc contains private stories: dropdown option "Public" is disabled. Tooltip/explanation: "Remove private stories first". Alternatively, selecting "Public" shows toast: "Remove private stories before making this doc public." and reverts.
- If doc contains only public stories (or is empty): changes immediately. Banner updates from amber to blue.

**Public to Private:**
- Always allowed (making something less visible is safe). Changes immediately. Banner updates from blue to amber.

**Confirmation:** No confirmation dialog for visibility change — it's reversible and non-destructive. Optimistic update with toast on failure.

#### Flow G: Doc Deletion

**Trigger:** `[...]` menu → "Delete this Clarity Doc" (red text).

**Confirmation dialog:**
- Title: "Delete this Clarity Doc?"
- Body: "This will permanently delete the doc '{Doc Title}'. Stories and points in this doc will not be deleted — they'll stay on your profile."
- Buttons: "Cancel" (secondary) + "Delete" (destructive red).
- On confirm: navigates to `/docs`, doc removed from list. Toast: "Doc deleted."
- On error: toast "Couldn't delete doc. Please try again." Dialog remains open.

#### Flow H: Navigation Changes

**Desktop nav (SimpleNavigation):**
- Current: Home | Events | My Profile + "Start a Clarity Session" CTA + avatar dropdown.
- New: Home | **Docs** | Events | My Profile + "Start a Clarity Session" CTA + avatar dropdown.
- "Docs" link: icon `FileTextIcon`, label "Docs", route `/docs`. Active state: `location.pathname.startsWith('/docs') || location.pathname.startsWith('/d/')`.
- Logged-out users: "Docs" not shown (auth-gated feature).

**Mobile bottom nav (BottomNav):**
- Current: Home | Start Session | Events | My Profile.
- New: Home | **Docs** | Events | My Profile.
- "Start Session" (`MicIcon`) moves to top-right area of `SimpleNavigation` header on mobile, next to the avatar/menu button.
- "Docs" tab: icon `FileTextIcon`, label "Docs", route `/docs`. Active state: `pathname.startsWith('/docs') || pathname.startsWith('/d/')`.

**Focus page registration:**
- `/create` (already registered as focus route — BottomNav hidden).
- `/d/` paths: NOT focus routes — BottomNav visible (doc detail is a browse surface).
- `/story/` and `/point/` detail pages opened from doc context: already focus-like but currently show BottomNav. Keep existing behavior — back button in page header returns to doc.

### 2. Screen Designs — Component Mapping

All screen layouts are defined in the ASCII flows above. This section maps them to actual codebase components.

| Screen | Primary Component | Reused From | New Elements |
|--------|------------------|-------------|-------------|
| Doc list page | New page component | — | Doc list card (new), empty state |
| Doc detail page | New page component | `StoryCardDetail` for story cards, `QuotedPoint` for point rows | Doc header (title, visibility, menu), privacy banner, block controls overlay, action buttons |
| Story creation (doc context) | `CreateStoryPage` | Existing `/create` page | Doc context params, forced visibility, amber/blue banner, modified back button |
| Story detail (doc context) | `story-detail-page.tsx` | Existing story detail | Doc context back navigation, point inheritance banner |
| Story selection panel | New panel component | `StorySearchPicker` pattern | Visibility filtering, "already in doc" exclusion, `[+ Add]` per row |
| Point detail (doc context) | `point-detail-page.tsx` | Existing point detail | Doc context back navigation |

**Component reuse notes:**
- `StoryCardDetail` already supports: amber/blue left borders (P586), `InlineVisibilityIcon`, expand/collapse points, position buttons, author avatar, tag pills, share button. The doc context adds an overlay wrapper for `[≡][x]` controls — not modifications to `StoryCardDetail` itself.
- `StorySearchPicker` pattern (search input + filtered results + select action) is reused but the component itself is too tightly coupled to /live (`StoryWithPoints` type, no visibility filtering). A new component using the same UX pattern is needed.
- `FocusHeader` is NOT used for the doc detail page (it's a browse page). The `< Docs` back link is part of the doc header layout.

### 3. Edge Cases

#### Empty and Boundary States

| State | Behavior |
|-------|----------|
| No docs | Empty state with CTA (Flow 2 in ASCII) |
| Empty doc (no stories) | Empty state with guidance text (Flow 3 in ASCII) |
| Doc with 0 visible points on all stories | Stories render normally, point sections show "0 points" per `StoryCardDetail` existing behavior |
| All points hidden in a story | Point section shows "0 visible points" or "N points (all hidden)". Points still visible to owner in edit mode at reduced opacity |
| Story with 0 points added to doc | Card renders with "0 points" in footer — same as profile |
| Very long doc title (100+ chars) | Truncated with ellipsis in header. Full title shown in edit mode. Title maxlength enforced at 100 |
| Very long doc (50+ stories) | Virtualized list or pagination deferred to V1 — render all. Performance acceptable at expected V1 scale (< 20 stories per doc) |
| Single story in doc | No drag handle visible (nothing to reorder). `[x]` remove still shown. Or: drag handle visible but no-op |
| Private story in public doc attempt | Cannot happen — `[Select your story]` filters out private stories for public docs. DB constraint as backup |
| Last private story removed from doc → switch to public | Allowed — dropdown now enables "Public" option |

#### Loading States

| Action | Loading UX |
|--------|-----------|
| Doc list load | `ClarityPageLoader` centered |
| Doc detail load | `ClarityPageLoader` centered below header |
| Creating new doc | Button shows spinner icon, disabled. Navigate on success |
| Adding story via `[+ Add]` | Button shows spinner, disabled. Row updates on success |
| Removing story `[x]` | Optimistic — card fades out immediately. Revert on error |
| Reordering (drag) | Optimistic — position updates immediately. Revert on error |
| Toggling point visibility `[eye]` | Optimistic — opacity changes immediately. Revert on error |
| Saving title | Optimistic — no loading indicator. Toast on error |
| Changing visibility | Optimistic — banner/icon update immediately. Toast + revert on error |
| Deleting doc | Button shows spinner in confirmation dialog. Navigate to `/docs` on success |

#### Error States

| Error | UX Response |
|-------|------------|
| Network failure on doc list load | Toast: "Couldn't load your docs. Please try again." + manual retry |
| Doc not found (invalid URL) | Full page: "This doc doesn't exist or you don't have access." + "Go to Docs" link |
| Unauthorized access to private doc | Same as not found (no information leakage about existence) |
| Doc creation fails | Toast: "Couldn't create doc. Please try again." Button re-enables |
| Story add fails | Toast: "Couldn't add story to doc." `[+ Add]` button re-enables |
| Story remove fails | Toast: "Couldn't remove story." Card reappears (optimistic revert) |
| Reorder save fails | Toast: "Couldn't save order." Items revert to previous positions |
| Title save fails | Toast: "Couldn't update title." Title reverts to previous value |
| Visibility change blocked (contains private stories) | Toast: "Remove private stories before making this doc public." Dropdown reverts |
| Visibility change fails (server error) | Toast: "Couldn't change visibility." Banner/icon revert |
| Doc deletion fails | Toast: "Couldn't delete doc. Please try again." Dialog stays open |
| Cross-visibility point link rejected | Toast: "This point is private and cannot be linked to a public story. To discuss this topic publicly, create a new public point." |

#### Validation Rules

| Field | Rule | Feedback |
|-------|------|----------|
| Doc title | Non-empty after trim, max 100 chars | Reverts to "Untitled Doc" if empty on blur. Truncation at 100 chars |
| Story content | Same as existing `CreateStoryPage` — min 1 char, max 10,000 | Existing validation (inline error below textarea) |
| Point content | Same as existing point creation | Existing validation |
| Add story to public doc | Story must be public | Private stories filtered from selection panel results |
| Add duplicate story | Story already in doc | Story excluded from selection panel results |
| Switch doc to public | No private stories in doc | Dropdown disabled or toast error |

### 4. Accessibility

#### Screen Reader Support

| Element | ARIA | Announcement |
|---------|------|-------------|
| Doc list page | `<main aria-label="Your Clarity Docs">` | "Your Clarity Docs" |
| Doc card in list | `role="link"`, `aria-label="{title}, {visibility}, {N} stories, updated {time}"` | Full card context |
| Doc detail page | `<main aria-label="Clarity Doc: {title}">` | "Clarity Doc: {title}" |
| Privacy banner | `role="status"`, `aria-live="polite"` | "Private. Only you can see this Clarity Doc." |
| Inline title edit | `aria-label="Doc title"`, `role="textbox"` | Standard text input behavior |
| Visibility dropdown | `aria-label="Doc visibility"`, `aria-expanded` | "Doc visibility, Private. Dropdown collapsed." |
| `[+ Write a story]` | `aria-label="Write a new story"` | Standard button |
| `[Select your story]` | `aria-label="Add an existing story"` | Standard button |
| `[≡]` drag handle | `aria-label="Drag to reorder"`, `aria-roledescription="draggable"` | "Drag to reorder. Press Space to grab." |
| `[x]` remove | `aria-label="Remove {story preview} from this doc"` | "Remove story from this doc" |
| `[eye]` toggle | `aria-label="Hide {point text} in this doc"` / `aria-label="Show {point text} in this doc"`, `aria-pressed` | "Hide point in this doc" / "Show point in this doc" |
| Story card in doc | Same ARIA as `StoryCardDetail` — already has `role="button"`, `tabIndex`, keyboard handlers | Existing accessibility |
| Selection panel | `role="dialog"`, `aria-label="Select your story"`, `aria-modal="true"` | "Select your story dialog" |
| Selection panel search | `aria-label="Search your stories"`, `role="searchbox"` | Standard search input |
| `[+ Add]` in selection | `aria-label="Add {story preview} to doc"` | "Add story to doc" |
| Delete confirmation | `role="alertdialog"`, `aria-label="Delete this Clarity Doc"` | "Delete this Clarity Doc? dialog" |

#### Keyboard Navigation

| Context | Key | Action |
|---------|-----|--------|
| Doc list | Tab | Move focus between cards and `[+ New Doc]` button |
| Doc list | Enter/Space on card | Navigate to doc |
| Doc detail | Tab | Cycle: back link → title → visibility dropdown → menu → action buttons → story cards (in order) |
| Story card in doc | Tab within card | Focus moves through card interactive elements (same as `StoryCardDetail`) |
| Block controls | Tab to `[≡]` | Focus on drag handle |
| Block controls | Space on `[≡]` | Enter keyboard drag mode |
| Keyboard drag mode | Arrow Up/Down | Move item up/down in list |
| Keyboard drag mode | Space/Enter | Drop item at current position |
| Keyboard drag mode | Escape | Cancel drag, return to original position |
| Selection panel | Escape | Close panel, return focus to `[Select your story]` button |
| Selection panel | Tab | Cycle through search input, result items, close button |
| Delete dialog | Tab | Cycle between Cancel and Delete buttons |
| Delete dialog | Escape | Close dialog without deleting |
| Title editing | Enter | Save title |
| Title editing | Escape | Cancel editing, revert to previous value |

#### Color Contrast

All visibility indicators use text labels alongside icons — not icon-only. The amber/blue system established by P586 meets WCAG AA for both light and dark themes:
- Amber banner: `bg-amber-50 text-amber-900` (light), adapted for dark mode.
- Blue banner: `bg-blue-50 text-blue-900` (light), adapted for dark mode.
- Lock/globe icons are supplementary — text labels ("PRIVATE", "PUBLIC") provide the primary information.
- Hidden point indicator: `opacity-50` with "(hidden)" text label — not relying on opacity alone.

### 5. Responsive Design

#### Breakpoints

| Breakpoint | Width | Layout Behavior |
|-----------|-------|-----------------|
| Mobile | < 640px (`sm`) | Single column. Block controls always visible. Title truncated. Action buttons stack if needed. Selection panel = bottom sheet. |
| Tablet | 640px-1023px (`md`/`lg`) | Single column, wider cards. Block controls on hover. Selection panel = side panel (half-width). |
| Desktop | >= 1024px (`lg`) | Max-width container (`container mx-auto`). Block controls on hover. Selection panel = right slide-in (400px). |

#### Mobile-Specific Adaptations

| Element | Mobile Behavior |
|---------|----------------|
| Doc header | Title truncates with ellipsis. Visibility dropdown shows icon only (no text label). `[...]` menu stays visible. |
| Action buttons | `[+ Write a story]` shortens to `[+ Write]`. `[Select your story]` stays full text or wraps to second line. Both remain full-width tappable (min-h 44px). |
| Block controls `[≡][x]` / `[≡][eye]` | Always visible (not hover-dependent). Positioned above each card/row. Icons spaced for 44px touch targets. |
| Privacy banner | Full width, single line. Text wraps if needed ("Only you can see this Clarity Doc" may wrap on very narrow screens). |
| Story cards | Full bleed within container padding. Same `StoryCardDetail` responsive behavior as profile page. |
| Selection panel | Bottom sheet, slides up from bottom. 80% viewport height. Dismissible by swipe-down or `[X]`. |
| Drag reordering | Long-press to initiate (200ms). Larger drop zones (48px minimum height). Auto-scroll near edges. |
| Title editing | Full-width text input. On-screen keyboard does not obscure input (scroll into view). |
| Delete confirmation | Standard `AlertDialog` — centers on screen, overlays everything. |
| Navigation | BottomNav shows Docs tab. "Start Session" button in top-right header area. |

#### Desktop-Specific Adaptations

| Element | Desktop Behavior |
|---------|-----------------|
| Doc header | Full title visible. Visibility dropdown shows icon + text ("Private" / "Public"). |
| Block controls | Hidden by default. Appear on hover over the story card zone (parent hover, not just icon hover). Transition: `opacity-0 → opacity-100`, 150ms. |
| Selection panel | Right slide-in panel (400px width). Overlay with backdrop. Can coexist with doc content visible behind backdrop. |
| Drag reordering | Click-and-drag immediately (no long-press). Cursor changes to `grab` on handle hover, `grabbing` during drag. |

### P586 UX Dependencies — Resolution

The following decisions resolve the open questions from the P586 UX Dependencies section:

**1. AddPointForm on private story:**
- Amber banner above point input: "This point will be private — only you can see it."
- Button label changes to "Add Private Point" (standard blue button, text indicates privacy).
- Banner uses same amber style as doc privacy banner (`bg-amber-50 border-amber-200`).

**2. Cross-visibility error toast:**
- Toast text: "This point is private and cannot be linked to a public story. To discuss this topic publicly, create a new public point."
- Standard error toast styling (Sonner, red accent).
- This can only occur programmatically (the UI prevents the action) — the toast is a safety net for race conditions.

**3. Private story creation context:**
- When `/create?docId=xxx` and doc is private: amber banner at top "This story will be private — only you can see it." Button: "Save Private Story."
- No visibility selector shown — context determines privacy.
- Points extracted/created from this story also inherit private visibility. Banner on point creation: "This point will be private — only you can see it."

**4. Point inheritance indicator:**
- Decision: **Badge only** (option b). The `InlineVisibilityIcon` lock icon already rendered by P586 is sufficient. No additional tooltip or label text — the lock icon inline with the point text communicates privacy. Users who created the point from a private doc already saw the amber banner during creation; the lock badge is the persistent reminder.

## P586 UX Dependencies (Inheritance Communication)

The following UX flows are deferred from P586 to P551 because they only arise when P551 creates private content. P586 ships the DB infrastructure; P551 must design the user-facing communication.

**Must design during P551 `/ux`:**
- **AddPointForm on private story:** When user adds a point to a private story, pre-creation banner must communicate that the point inherits private visibility (amber banner + "This point will be private — only you can see it" + button label "Add Private Point")
- **Cross-visibility error toast:** When a public story tries to link to a private point, the DB trigger rejects it. P551 must surface a helpful toast: "This point is private and cannot be linked to a public story. To discuss this topic publicly, create a new public point."
- **Private story creation context:** When creating a story inside a private doc, the UI must communicate that the story (and its extracted points) will be private. Context determines privacy, not a selector.
- **Point inheritance indicator:** How to explain to users why a point is private ("Created inside a private doc"). Options: (a) tooltip, (b) just the badge, (c) badge + label text. `/ux` agent decides.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] No way to remove a story from a doc | Added "Remove from doc" to `...` menu (unlinks, doesn't delete) | Curation without removal is accumulation, not curation |
| 2 | /challenge-prd | [BLOCK] Point reordering scope conflict — `story_points.position` is global, but docs need per-doc ordering | Per-doc point ordering + hide/show via `doc_stories.point_config` JSON column. P581 letter snapshots preserve this config | Avoids mutating global story-point state from a doc context |
| 3 | /challenge-prd | [BLOCK] No discovery/selection UI for "add existing story" | Reuse /live selection pattern: "Select your story" → search input → filtered results (visibility-compatible) | Proven pattern, self-contained, no new infrastructure |
| 4 | /challenge-prd | [BLOCK→NOTE] Public stories in private docs create correlation leak | Downgraded. Public stories are already public. Correlation attack requires both receiving a letter AND cross-referencing profile — paranoid for V1 | Real privacy boundary is private stories never leak, which is enforced |
| 5 | /challenge-prd | [WARN] Strategic disconnect — P551 doesn't advance P0 hypotheses directly | Accepted. P551→P581→workshops is the hypothesis validation chain. Without composition surface, workshops stay Slava-facilitated-only | Two steps removed from H-WTP-Pain but IS the mechanism for productizing false-belief facilitation |
| 6 | /challenge-prd | [WARN] Therapy use case validated by one user (founder) | Accepted risk. Dog-fooding is the strongest validation available pre-launch. Therapy market expansion is future | Founder trust test is the immediate bar |
| 7 | /challenge-prd → /ascii-flows | [WARN] No doc visibility change — accidental public doc permanent | Resolved: header dropdown allows change. Switching to Public blocked if private stories exist | Dropdown is trivial, constraint enforcement handles the risk |
| 8 | /challenge-prd | [WARN] Single-owner docs don't match co-founder JTBD wording | Rewrote user story: "create a doc with MY stories... send as letter to co-founder." Shared understanding emerges from letter exchange (P581), not co-editing | Matches actual single-owner design |
| 9 | /challenge-prd | [WARN] Existing story_points have no position value | Migration: `position = row_number() OVER (PARTITION BY story_id ORDER BY created_at)`. Architect handles | Standard migration pattern |
| 10 | /ascii-flows | [REVISED] Story creation from doc | Full existing story creation flow (same page as profile), not minimal text field. User can add points immediately after. Back button returns to doc | Reuses existing components, enables full workflow |
| 11 | /challenge-prd | [NEW] Point hide/show per doc | Added to V1 scope. `doc_stories.point_config` stores `hidden` array alongside `order`. Moved from "Out of Scope" | Essential for workshop curation |
| 12 | /ascii-flows | [NEW] No creation modal — Google Docs pattern | Click creates and opens instantly. Title editable inline, defaults "Untitled Doc" + private | Zero friction, proven pattern |
| 13 | /ascii-flows | [NEW] Tally-style block controls | Stories: `[≡]` drag + `[x]` remove. Points: `[≡]` drag + `[eye]` hide. Hover desktop, always visible mobile | One pattern for both levels, clean cards |
| 14 | /ascii-flows | [NEW] Nav changes | Desktop: Docs between Home and Events. Mobile: Docs replaces "Start Session" in bottom nav, "Start Session" moves to top-right header | Docs is a primary surface |
| 15 | /ascii-flows | [NEW] Doc deletion | `[...]` menu in doc header → "Delete this Clarity Doc" (confirmation dialog) | Moved from Out of Scope to V1 |
| 16 | /ascii-flows | [NEW] Cards/pages reuse existing components | Story cards = profile `StoryCard`. Point rows = profile point rows. Story detail = same page. Back nav → doc | Maximum reuse, zero new page components |

## Technical Architecture

### Technical Analysis

#### Current Code State

**Database schema (relevant tables):**
- `stories` — `id UUID PK`, `author_id UUID FK→profiles`, `content TEXT`, `visibility content_visibility DEFAULT 'public'`, `tags TEXT[]`, `created_at`, `updated_at`. RLS: public visible to all, private visible to author only. Immutability trigger on visibility (P586).
- `points` — `id UUID PK`, `statement TEXT`, `first_validator_id UUID FK→profiles`, `visibility content_visibility DEFAULT 'public'`, `tags TEXT[]`, `created_at`. RLS: public visible to all, private visible to creator only. Immutability trigger on visibility (P586).
- `story_points` — junction table `(story_id, point_id) PK`, `created_at`. RLS: visible when parent story is visible. Cross-visibility constraint trigger: rejects public story linking to private point (P586).
- `content_visibility` enum — `('public', 'private')`. Shared by stories and points. Created in P586 migration. Reusable for `clarity_docs.visibility`.

**Navigation components:**
- `SimpleNavigation` (`src/app/components/layout/simple-navigation.tsx`) — Desktop nav with three states: loading skeleton, logged-in icon nav (Home/Events/My Profile + avatar dropdown), logged-out text links. Icons: `HomeIcon`, `CalendarIcon`, `UserIcon`. "Start a Clarity Session" CTA always visible as blue button with `MicIcon`. Mobile: avatar/hamburger toggle for full-screen menu.
- `BottomNav` (`src/app/components/layout/bottom-nav.tsx`) — Mobile-only, 4 tabs: Home (`/feed`), Start Session (`/live`), Events (`/events`), My Profile (`/p/:slug`). `focusRoutes` array hides BottomNav on creation/focus pages (`['/agreements/', '/create']`). Auth-gated (only shown for logged-in users).
- `nav-links.ts` — Static config for footer links. Not relevant to P551 changes.

**Story card components:**
- `StoryCardDetail` (`src/app/components/social/StoryCardDetail.tsx`) — Production story card. Props: `story: StoryWithAuthor`, `linkedPoints: PointSummary[]`, `positionCounts`, `userPositions`, plus optional `routes`, `visibilitySlot`, `footerActionsSlot`, `hideActions`, `onAddPoint`. Already supports amber/blue left borders based on `story.visibility` (P586). Points rendered inline with expand/collapse via `QuotedPoint` subcomponent. 86 lines of props interface — well-designed for composition via slots.
- `StoryCardContext` type — `'profile' | 'point-detail' | 'story-detail'`. Drives conditional rendering. Can be extended to `'doc-detail'` if needed, but the existing `'profile'` context should work for doc display (shows all features: points, actions, author).

**Story creation flow:**
- `CreateStoryPage` (`src/app/pages/create-story-page.tsx`) — Route `/create`. Auth-gated. Reads `pointId` from query params for point context. Visibility hardcoded to `'public'` since P586 (comment: "private creation only via Clarity Docs"). After save, navigates to `/story/:id`. Key extension point: read `docId` from query params to set visibility, modify back navigation, and auto-link story to doc.

**Story detail page:**
- `story-detail-page.tsx` — Route `/story/:id`. Uses `FocusHeader` for back navigation. Renders `StoryCardDetail` in detail mode. Author can add/unlink points inline. Extension point: read doc context from location state or query params to customize back navigation.

**Route structure (App.tsx):**
- All routes use `ClarityLandingLayout` wrapper + `LazyRoute` for code-splitting. Routes are flat (no nested routing). Adding `/docs` and `/d/:docId` follows the existing pattern: lazy import + `ClarityLandingLayout` + `LazyRoute`.

**Drag-and-drop:**
- No DnD library exists in the main app's `package.json`. `@dnd-kit/core` and `@dnd-kit/sortable` exist only in `tools/kanban/package.json` (separate tool, not the main app). A DnD library must be added for P551.

**Existing patterns for search/select:**
- `StorySearchPicker` (`src/app/components/partners/story-search-picker.tsx`) — Inline search dropdown for /live flow. Tightly coupled to `StoryWithPoints` type and the /live context. The UX pattern (search input + filtered results + select action) is reusable but the component is not — a new `DocStoryPicker` component is needed with visibility filtering and doc exclusion logic.

#### Dependencies

- **P586 (Visibility & Privacy Foundation)** — shipped. Provides `content_visibility` enum, story/point visibility columns, immutability triggers, cross-visibility constraint, RLS hardening. All required infrastructure for P551 privacy model.
- **New npm dependency required:** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` for drag-and-drop reordering. Already proven in the kanban tool. Tree-shakeable, accessible, touch-friendly.

### Architecture Decisions

**Decision 1: `clarity_docs` table uses `content_visibility` enum**

- **Chosen:** Reuse the existing `content_visibility` enum (`'public' | 'private'`) from P586 for `clarity_docs.visibility`.
- **Rationale:** Single enum type for all visibility across the platform. Already referenced by stories, points, RLS policies, and DB triggers. Using a separate type would create divergent semantics for the same concept.
- **Trade-off:** If docs ever need a third visibility state (e.g., `'shared-with-link'`), the enum change affects all tables. Acceptable — V1 explicitly excludes sharing, and enum migration is a known pattern.
- **Alternative rejected:** Separate `doc_visibility` enum — unnecessary duplication, no foreseeable divergence.

**Decision 2: Junction table `doc_stories` with `position` + `point_config` JSONB**

- **Chosen:** `doc_stories` junction table with columns: `doc_id UUID FK`, `story_id UUID FK`, `position INTEGER NOT NULL`, `point_config JSONB DEFAULT '{}'`, `created_at TIMESTAMPTZ`. PK: `(doc_id, story_id)` (enforces uniqueness). `point_config` stores `{"order": [pointId1, pointId2, ...], "hidden": [pointId3, ...]}`.
- **Rationale:** Per-doc ordering avoids mutating global `story_points` state. JSONB for point config avoids a third junction table (`doc_story_points`) that would triple the join depth. P581 letter snapshots can copy `point_config` directly.
- **Trade-off:** JSONB is not referentially constrained — deleted point IDs linger in `point_config` until the user edits. Acceptable: UI treats missing point IDs as "not configured" (fallback to default ordering), and orphan cleanup is a future concern.
- **Alternative rejected:** Third junction table `doc_story_points(doc_id, story_id, point_id, position, hidden)` — excessive normalization for a config that changes as a unit and has no independent query need.

**Decision 3: Hard delete for docs (not soft delete)**

- **Chosen:** `DELETE FROM clarity_docs WHERE id = :docId AND owner_id = auth.uid()` with `ON DELETE CASCADE` on `doc_stories` FK.
- **Rationale:** V1 docs are personal containers — no sharing, no collaboration, no audit trail needed. Stories and points persist independently (they belong to the author's profile, not the doc). Soft delete adds complexity (filtered queries everywhere, "deleted" state management) with no V1 benefit.
- **Trade-off:** No undo after deletion beyond the browser-level confirmation dialog. Acceptable — the dialog says "Stories and points in this doc will not be deleted."
- **Alternative rejected:** Soft delete (`deleted_at TIMESTAMPTZ`) — adds WHERE clause to every query, no use case for restoration in V1.

**Decision 4: RLS scoped through `clarity_docs.owner_id` ownership**

- **Chosen:** Simple ownership-based RLS on `clarity_docs`: SELECT returns `visibility = 'public' OR owner_id = auth.uid()`, INSERT/UPDATE/DELETE requires `owner_id = auth.uid()`. `doc_stories` RLS scoped through doc ownership via EXISTS subquery on `clarity_docs`.
- **Rationale:** Matches the single-owner model. No co-ownership = no shared access patterns. Public docs are discoverable (future: profile page, feed). Private docs invisible to everyone except owner.
- **Trade-off:** Public doc discovery (showing on profile) is a future concern not blocked by this RLS. SELECT on public docs returns the doc row but `doc_stories` still requires story-level RLS (a public doc linking a story the viewer can't see won't leak content).
- **Alternative rejected:** RLS via `doc_stories` only (no direct doc table RLS) — would allow enumeration of doc metadata even for private docs.

**Decision 5: `@dnd-kit` for drag-and-drop**

- **Chosen:** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`. Install in main app `package.json`.
- **Rationale:** Already proven in `tools/kanban`. Framework-agnostic core with React bindings. Built-in accessibility (keyboard navigation, screen reader announcements). Touch support with configurable activation constraints (`PointerSensor` for mouse, `TouchSensor` with 200ms delay for mobile). Tree-shakeable — only imports what's used.
- **Trade-off:** Adds ~15KB gzipped to the bundle. Only loaded on doc detail page (lazy route), so no impact on initial load.
- **Alternative rejected:** `react-beautiful-dnd` — maintenance mode, no React 19 support. Manual HTML5 drag — poor touch support, no accessibility.

**Decision 6: Navigation restructure — Docs replaces Start Session in mobile bottom nav**

- **Chosen:** Desktop: insert "Docs" between Home and Events in icon nav. Mobile bottom nav: replace "Start Session" with "Docs"; move "Start Session" to top-right header area (next to avatar) as a persistent `MicIcon` button.
- **Rationale:** Docs is a primary browse surface (like Events). Four bottom nav items is the mobile standard. "Start Session" as a header button remains one-tap accessible and is consistent with the CTA already present in the desktop nav.
- **Trade-off:** "Start Session" loses prominence on mobile (moves from dedicated bottom tab to header icon). Mitigated: the `MicIcon` in the header is always visible and matches desktop placement.
- **Alternative rejected:** 5-item bottom nav (add Docs, keep Start Session) — violates mobile UX best practice (4 items max for thumb reach). Drop-down overflow for 5th item adds friction.

**Decision 7: Doc context passed via query params, not React context**

- **Chosen:** Pass doc context through URL query params (`?docId=xxx`) when navigating to `/create` and through `location.state` when navigating to `/story/:id` from a doc. Back navigation reads from these to return to the doc.
- **Rationale:** URL-based context survives page refresh. `location.state` handles the story-detail→doc back navigation without polluting the URL. This matches existing patterns: `CreateStoryPage` already reads `pointId` from query params; `story-detail-page.tsx` uses `useLocation` state for `justCreated`.
- **Trade-off:** `location.state` is lost on direct URL access (e.g., sharing `/story/abc` with someone). Acceptable — the story detail page works standalone; doc context only affects back navigation.
- **Alternative rejected:** React context provider wrapping doc routes — over-engineering for passing one ID; doesn't survive refresh.

**Decision 8: Optimistic UI with revert-on-error for all mutations**

- **Chosen:** Reorder, remove story, toggle point visibility, title edit, and visibility change all apply optimistically in the UI. Server sync happens in the background. On failure: revert to previous state + toast error.
- **Rationale:** Doc editing is single-user with no conflicts. Optimistic updates make the UI feel instant. The revert pattern is established across the codebase (position buttons, feed interactions).
- **Trade-off:** Brief inconsistency window between UI state and server state. Acceptable for single-user flows — no concurrent editors.
- **Alternative rejected:** Pessimistic (wait for server) — creates visible lag on every interaction.

### Security Review

**RLS Policies:**

- ✅ **`clarity_docs` SELECT:** `visibility = 'public' OR owner_id = auth.uid()` — private docs invisible to non-owners. Matches P586 pattern on stories.
- ✅ **`clarity_docs` INSERT:** `auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)` — verified users only, no guest creation.
- ✅ **`clarity_docs` UPDATE:** `auth.uid() = owner_id` — owner only.
- ✅ **`clarity_docs` DELETE:** `auth.uid() = owner_id` — owner only.
- ✅ **`doc_stories` SELECT:** `EXISTS (SELECT 1 FROM clarity_docs WHERE id = doc_stories.doc_id AND (visibility = 'public' OR owner_id = auth.uid()))` — scoped through doc ownership. Prevents enumerating which stories are in someone's private doc.
- ✅ **`doc_stories` INSERT:** Verify doc ownership (`clarity_docs.owner_id = auth.uid()`) AND story ownership (`stories.author_id = auth.uid()`). Only your own stories can be added to your docs — prevents attribution confusion from adding others' public stories.
- ✅ **`doc_stories` UPDATE:** Doc ownership check (for reorder/point_config changes).
- ✅ **`doc_stories` DELETE:** Doc ownership check (for remove-from-doc).
- ✅ **Existing tables:** P586 RLS on stories, points, story_points unchanged. Cross-visibility trigger on story_points already prevents private-to-public leaks.

**DB Triggers (belt-and-suspenders — UI also enforces):**

- ⚠️ **BEFORE UPDATE on `clarity_docs`:** When `visibility` changes from `private` to `public`, reject if any linked story is private: `NOT EXISTS (SELECT 1 FROM doc_stories ds JOIN stories s ON s.id = ds.story_id WHERE ds.doc_id = NEW.id AND s.visibility = 'private')`. Prevents API bypass of UI guard. Same pattern as P586 immutability triggers.
- ⚠️ **BEFORE INSERT on `doc_stories`:** When the doc is public, reject if the story is private. Prevents crafted INSERT from exposing private stories through a public doc. Same pattern as P586 cross-visibility constraint.

**Authentication:**

- ✅ **`/docs` list page:** Auth-gated (requires login). Standard `useAuth()` pattern.
- ✅ **`/d/:docId` detail page:** Public docs viewable by anyone (matches profile pattern — profiles are public). Private docs: owner only (RLS returns zero rows for non-owners, UI shows "doesn't exist or you don't have access").
- ✅ **Story creation from doc context:** Uses existing `CreateStoryPage` auth checks.

**Authorization:**

- ✅ **All doc mutations (create/edit/delete/add-story/remove-story/reorder/point-config):** Owner-only via RLS.
- ⚠️ **Story ownership on INSERT into doc_stories:** RLS must verify `stories.author_id = auth.uid()` — not just that the story is public. Only your own stories can be added. Prevents attribution confusion.

**Input Validation:**

- ⚠️ **Doc title:** Add DB CHECK constraint `length(title) <= 100 AND length(title) > 0`. Client renders via React JSX (safe by default). `contentEditable` must extract `textContent`, not `innerHTML`, to prevent XSS.
- ⚠️ **`point_config` JSON:** Validate structure on write — only `order` (UUID array) and `hidden` (UUID array) keys allowed. Client should gracefully ignore unknown point IDs in config (points may be deleted or unlinked independently).
- ✅ **UNIQUE constraint:** `(doc_id, story_id)` on `doc_stories` prevents duplicate entries.

**Data Protection:**

- ✅ **Private doc invisibility:** RLS on both `clarity_docs` and `doc_stories` ensures complete invisibility at DB/API level. URL guessing returns same response as not-found.
- ✅ **Doc ID format:** UUIDs (matching existing tables). Enumeration impractical.
- ✅ **Doc deletion cascade:** `doc_stories` rows deleted (FK CASCADE on `doc_id`). Stories and points untouched — remain on profile independently.
- ✅ **Orphaned private stories after doc deletion:** Private stories remain owned by user, invisible to others via P586 RLS. Correct behavior — documented in UX.
- ⚠️ **`point_config.hidden` visible in public doc API responses:** Low risk — hidden points are public and visible elsewhere. Accept as V1 known limitation.

### Implementation Approach

#### Build Sequence

1. **Database migration** — Create `clarity_docs` table, `doc_stories` junction table, RLS policies, indexes. Migration file: `YYYYMMDDHHMMSS_p551_clarity_docs.sql`.
2. **TypeScript types** — Add `ClarityDoc`, `DocStory`, `DbClarityDoc`, `DbDocStory` to `src/app/types/index.ts`.
3. **Data service** — Create `docs-service.ts` (interface + real implementation) following the `stories-service` pattern: `createDoc`, `getDoc`, `getDocsByUser`, `updateDoc`, `deleteDoc`, `addStoryToDoc`, `removeStoryFromDoc`, `reorderStories`, `updatePointConfig`.
4. **Route setup** — Add `/docs` and `/d/:docId` routes to `App.tsx` with lazy imports.
5. **Navigation changes** — Update `SimpleNavigation` (add Docs tab, move Start Session on mobile header) and `BottomNav` (replace Start Session with Docs).
6. **Doc list page** — New page `docs-list-page.tsx` with empty state, populated state, `[+ New Doc]` CTA.
7. **Doc detail page** — New page `doc-detail-page.tsx` with inline title edit, visibility dropdown, privacy banner, story cards via `StoryCardDetail`, block controls overlay.
8. **Install @dnd-kit** — Add to `package.json`, implement drag-and-drop for story blocks and point rows.
9. **Story selection panel** — New component `DocStoryPicker` with search, visibility filtering, doc exclusion.
10. **CreateStoryPage doc context** — Extend with `docId` query param: forced visibility, modified back nav, auto-link to doc on save.
11. **Story detail doc context** — Extend with doc back navigation via `location.state`.
12. **Doc deletion** — Overflow menu with confirmation dialog, hard delete with cascade.

#### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDDHHMMSS_p551_clarity_docs.sql` | DB migration: tables, RLS, indexes, triggers |
| `src/app/data/docs-service.ts` | Data service (Supabase CRUD for docs + doc_stories) |
| `src/app/data/docs-service.interface.ts` | Service interface |
| `src/app/pages/docs-list-page.tsx` | `/docs` page — list of user's docs |
| `src/app/pages/doc-detail-page.tsx` | `/d/:docId` page — doc detail with stories, controls |
| `src/app/components/docs/doc-story-picker.tsx` | Story search/select panel for adding existing stories |
| `src/app/components/docs/doc-block-controls.tsx` | `[≡][x]` and `[≡][eye]` overlay controls for stories and points |
| `src/app/components/docs/doc-privacy-banner.tsx` | Amber/blue privacy banner component |
| `src/app/components/docs/doc-header.tsx` | Inline title editor, visibility dropdown, overflow menu |
| `src/app/hooks/use-doc-context.ts` | Hook to read/manage doc context from URL params and location state |

#### Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add lazy imports + routes for `/docs` and `/d/:docId` |
| `src/app/components/layout/simple-navigation.tsx` | Add "Docs" icon tab (logged-in state, between Home and Events). On mobile, add `MicIcon` Start Session button near avatar in header |
| `src/app/components/layout/bottom-nav.tsx` | Replace "Start Session" tab with "Docs" (`FileTextIcon`, `/docs`). Update `isActive` for `/docs` and `/d/` paths |
| `src/app/types/index.ts` | Add `ClarityDoc`, `DocStory`, `DbClarityDoc`, `DbDocStory`, `DocPointConfig` types |
| `src/app/pages/create-story-page.tsx` | Read `docId` from query params. When present: force visibility from doc, modify back nav to `< {Doc Title}`, add amber/blue banner, auto-link story to doc on save |
| `src/app/pages/story-detail-page.tsx` | Read doc context from `location.state`. When present: modify `FocusHeader` back navigation to return to `/d/:docId`, add point inheritance banner for private stories |
| `package.json` | Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |

## Component Strategy

### Step 1 — Component Inventory

**Design system primitives (`src/components/ui/`):** button, input, textarea, label, dialog, dropdown-menu, scroll-area, accordion, tooltip, checkbox, slider, drawer, sonner (toast), clarity-logo, clarity-loader, person-avatar, gravatar-avatar, ear-badge, understood-badge.

**Relevant feature components (`src/app/components/`):**
- `StoryCardDetail` — full story card with author avatar, visibility borders (amber/blue via P586), expand/collapse points, `QuotedPoint` subcomponent, position buttons. Rich prop interface with `routes`, `visibilitySlot`, `footerActionsSlot`, `hideActions`, `onAddPoint` slots.
- `InlineVisibilityIcon` — small lock/globe icon with tooltip. Used inline in metadata lines.
- `VisibilityBadge` — icon-only or icon+label badge for visibility. Supports `showLabel` prop.
- `ConfirmDialog` — generic confirmation dialog with title, description, destructive/default variant, loading state.
- `FocusHeader` — back button for focus pages. Simple `onBack` callback, renders `< Back` with ArrowLeft icon.
- `SimpleNavigation` — desktop/mobile top nav. Logged-in state: icon nav (Home/Events/My Profile) + CTA + avatar dropdown. Supports adding new icon tabs between existing ones.
- `BottomNav` — mobile bottom nav. 4 items: Home/Start Session/Events/My Profile. `NavItem` interface with icon, label, to, disabled. `focusRoutes` array controls hide behavior.
- `StorySearchPicker` — inline search dropdown for /live. Tightly coupled to `StoryWithPoints` type. UX pattern reusable; component itself is not (no visibility filtering, no panel layout).
- `OwnerPreviewBanner` — blue info banner pattern (`bg-blue-50 border-blue-200`). Reference for privacy banner styling.
- `MobileTooltip` — tooltip that works on both desktop (hover) and mobile (tap).
- `TagPills` — tag display component used within story cards.

**Drag-and-drop:** No DnD library in main app. `@dnd-kit/core` + `@dnd-kit/sortable` exist in `tools/kanban/package.json` only. Must be installed as a new dependency.

### Step 2 — Component Map

| UI Element | Classification | Source | Notes |
|-----------|---------------|--------|-------|
| **Doc list page layout** | **New** | — | New page `docs-list-page.tsx`. Standard page shell: `container mx-auto`, heading, content area. Follows existing page patterns (events-page, feed-page). |
| **Doc list card (row)** | **New** | — | New component. No existing card matches this shape (visibility icon + title + count + time + chevron + colored left border). Simple enough to be inline in the page. |
| **Doc creation button** | **Reuse** | `Button` from `ui/button` | Primary variant for empty state CTA, secondary/outline for `[+ New Doc]` in populated state. Add `Loader2Icon` spinner during creation (existing pattern). |
| **Doc detail page layout** | **New** | — | New page `doc-detail-page.tsx`. Browse page (BottomNav visible). Contains: doc header, privacy banner, story list with DnD. |
| **Doc header (title + visibility + menu)** | **New** | — | New component `doc-header.tsx`. Composed of: inline editable title (plain `<input>` styled as heading), visibility dropdown (`DropdownMenu` from ui/dropdown-menu), overflow menu (`DropdownMenu`). Back link uses `ArrowLeft` icon + "Docs" text (NOT `FocusHeader` — doc detail is a browse page). |
| **Inline title editor** | **New** | — | Part of `doc-header.tsx`. Controlled `<input type="text">` styled with `text-lg font-semibold bg-transparent border-none focus:ring-0`. Saves on blur/Enter, reverts on Escape/empty. No separate component file needed — inline in header. |
| **Visibility dropdown** | **Extend** | `DropdownMenu` + `InlineVisibilityIcon` | Reuse `DropdownMenu` primitives. Trigger button renders current visibility icon + label via `InlineVisibilityIcon`. Menu items: Private (lock icon) and Public (globe icon). Disabled state for "Public" when private stories exist. |
| **Overflow menu (`[...]`)** | **Reuse** | `DropdownMenu` | Same pattern as existing overflow menus. Single item: "Delete this Clarity Doc" in red. |
| **Privacy banner** | **New** | — | New component `doc-privacy-banner.tsx`. Two variants: amber (`bg-amber-50 border-amber-200 text-amber-900`) and blue (`bg-blue-50 border-blue-200 text-blue-900`). Icon + "PRIVATE/PUBLIC" label + description text. Pattern exists in `OwnerPreviewBanner` (blue only) but needs both colors + different content. Sticky below header. |
| **Story cards in doc** | **Reuse** | `StoryCardDetail` | Direct reuse. Pass `routes` prop to customize navigation (point/story links return to doc). Pass `hideActions={true}` to suppress share/external-link in doc context (unnecessary clutter). `context='profile'` works as-is. |
| **Block controls — story level `[≡][x]`** | **New** | — | New component `doc-block-controls.tsx`. Two variants: `story` (drag handle + remove X) and `point` (drag handle + eye toggle). Renders above the card, left-aligned. Desktop: `opacity-0 group-hover:opacity-100` transition. Mobile: always visible. Icons from lucide: `GripVertical`, `X`, `Eye`, `EyeOff`. Min 44px touch targets. |
| **Block controls — point level `[≡][eye]`** | **New** | Same file as story controls | Same component, different `variant` prop. `[eye]`/`[eye-off]` toggles `hidden` state. Hidden points: `opacity-50` + "(hidden)" label. |
| **Story selection panel** | **New** | `StorySearchPicker` pattern | New component `doc-story-picker.tsx`. Cannot reuse `StorySearchPicker` directly (coupled to `StoryWithPoints`, no visibility filtering, inline dropdown vs. panel). Same UX pattern: search input + filtered list + select action. New: visibility icon per row, `[+ Add]` button per row, panel layout (right slide-in desktop / bottom sheet mobile), footer count. Uses `Dialog` or `Drawer` from ui primitives. |
| **Selection panel — desktop** | **Extend** | `Dialog` from ui/dialog | Right-aligned slide-in. Override `DialogContent` positioning to slide from right (custom className). Width 400px. Backdrop. |
| **Selection panel — mobile** | **Extend** | `Drawer` from ui/drawer | Bottom sheet via Vaul drawer. 80% viewport height. Swipe-to-dismiss. Already in design system. |
| **Empty states (doc list, doc detail)** | **New** | — | Inline in page components. Pattern: centered icon + heading + subtitle + CTA button. No separate component needed — 10-15 lines of JSX each. Icon: `FileTextIcon` from lucide (notebook). |
| **Confirmation dialog (doc deletion)** | **Reuse** | `ConfirmDialog` | Direct reuse. Props: `title="Delete this Clarity Doc?"`, `description="..."`, `confirmLabel="Delete"`, `variant="destructive"`. Already supports `isLoading`. |
| **Desktop nav — Docs tab** | **Extend** | `SimpleNavigation` | Add new `Link` block between Home and Events in the logged-in icon nav section. Icon: `FileTextIcon`. Label: "Docs". Route: `/docs`. Active state: `pathname.startsWith('/docs') || pathname.startsWith('/d/')`. ~15 lines of JSX following the exact existing pattern. |
| **Mobile bottom nav — Docs tab** | **Extend** | `BottomNav` | Replace `MicIcon`/"Start Session" entry in `navItems` array with `FileTextIcon`/"Docs"/`/docs`. Update `isActive` to handle `/docs` and `/d/` paths. ~5 lines changed. |
| **Mobile header — Start Session button** | **Extend** | `SimpleNavigation` | Add `MicIcon` button in mobile header area (next to avatar/hamburger). Links to `/live`. Visible only on mobile (`lg:hidden`). ~10 lines. |
| **DnD wrapper** | **New** | — | `@dnd-kit` integration in `doc-detail-page.tsx`. `DndContext` + `SortableContext` wrapping the story list. `SortableItem` wrapper for each story card. Nested `SortableContext` for point rows within expanded stories. Sensors: `PointerSensor` (mouse), `TouchSensor` (mobile, 200ms delay). |
| **Action buttons row** | **New** | — | Inline in doc detail page. Two buttons: `[+ Write a story]` (primary, navigates to `/create?docId=xxx`) and `[Select your story]` (outline, opens picker panel). Mobile: `[+ Write]` shortened label. |
| **CreateStoryPage doc context** | **Extend** | `CreateStoryPage` | Read `docId` from query params. Fetch doc to get title + visibility. Force visibility. Replace back nav. Add amber/blue banner. Auto-link story to doc on save. ~40 lines of additions. |
| **Story detail doc context** | **Extend** | `story-detail-page.tsx` | Read `{ docId, docTitle }` from `location.state`. When present: back button says `< {docTitle}`, navigates to `/d/:docId`. Point creation banner for private stories. ~15 lines of additions. |

**Summary:** 5 new components (doc-header, doc-privacy-banner, doc-block-controls, doc-story-picker, DnD wrapper inline), 2 new pages, 7 extensions to existing components, 4 direct reuses.

### Step 3 — Composition Tree

#### 1. Doc List Page (`/docs`)

```
docs-list-page.tsx
├── <main aria-label="Your Clarity Docs">
│   ├── [Loading] ClarityLoader (from ui/clarity-loader)
│   ├── [Empty] Empty state (inline JSX)
│   │   ├── FileTextIcon
│   │   ├── "No Clarity Docs yet" heading
│   │   ├── Subtitle text
│   │   └── Button (primary) → create doc + navigate
│   └── [Populated]
│       ├── "Your Clarity Docs" heading + Button "[+ New Doc]" (outline)
│       └── Doc card list (inline, map over docs)
│           └── DocCard (inline or small component)
│               ├── InlineVisibilityIcon (lock/globe)
│               ├── Title text
│               ├── "N stories · Updated Xh ago" metadata
│               ├── ChevronRight icon
│               └── border-l-4 (amber-400 private / blue-500 public)
```

#### 2. Doc Detail Page (`/d/:docId`)

```
doc-detail-page.tsx
├── <main aria-label="Clarity Doc: {title}">
│   ├── [Loading] ClarityLoader
│   ├── [Not found / unauthorized] Error state (inline)
│   ├── [Loaded]
│   │   ├── DocHeader (new component)
│   │   │   ├── ArrowLeft + "Docs" back link → /docs
│   │   │   ├── <input> inline title editor
│   │   │   ├── DropdownMenu (visibility selector)
│   │   │   │   ├── Trigger: InlineVisibilityIcon + label
│   │   │   │   └── Items: Private (lock), Public (globe, conditionally disabled)
│   │   │   └── DropdownMenu (overflow [...])
│   │   │       └── Item: "Delete this Clarity Doc" (red)
│   │   ├── Action buttons row (inline)
│   │   │   ├── Button "[+ Write a story]" (primary) → /create?docId=xxx
│   │   │   └── Button "[Select your story]" (outline) → opens DocStoryPicker
│   │   ├── DocPrivacyBanner (new component)
│   │   │   ├── [private] amber: lock + "PRIVATE · Only you can see this Clarity Doc"
│   │   │   └── [public] blue: globe + "PUBLIC · Visible on your profile"
│   │   ├── Story count label ("N stories")
│   │   ├── [Empty doc] Empty state (inline)
│   │   └── [Has stories] DndContext (@dnd-kit)
│   │       └── SortableContext (story list)
│   │           └── SortableStoryBlock (per story) — wrapper div
│   │               ├── DocBlockControls variant="story"
│   │               │   ├── GripVertical (drag handle via useSortable)
│   │               │   └── X (remove from doc)
│   │               └── StoryCardDetail (REUSED — existing component)
│   │                   ├── (all existing internals: avatar, text, date, visibility icon)
│   │                   └── Expanded points section (existing)
│   │                       └── Per point: SortablePointRow wrapper
│   │                           ├── DocBlockControls variant="point"
│   │                           │   ├── GripVertical (drag handle)
│   │                           │   └── Eye / EyeOff (hide/show toggle)
│   │                           └── QuotedPoint (REUSED — existing subcomponent)
│   │   └── DocStoryPicker (new, conditionally rendered)
│   │       ├── [desktop] Dialog (slide-in from right)
│   │       └── [mobile] Drawer (bottom sheet)
│   │           ├── Header: "Select your story" + X close
│   │           ├── Search input (with Search icon)
│   │           ├── Results list
│   │           │   └── StoryPickerRow (per result)
│   │           │       ├── Story text preview (truncated)
│   │           │       ├── Date + InlineVisibilityIcon
│   │           │       └── Button "[+ Add]"
│   │           └── Footer: "N stories match"
│   └── ConfirmDialog (REUSED — for doc deletion)
```

#### 3. Story Selection Panel (DocStoryPicker)

```
DocStoryPicker
├── [desktop] Dialog with right-aligned DialogContent (w-[400px])
│   └── Panel content (shared between desktop/mobile)
└── [mobile] Drawer with DrawerContent (h-[80vh])
    └── Panel content (shared)
        ├── Header row
        │   ├── "Select your story" heading
        │   └── X close button
        ├── Search input
        │   └── <input> with Search icon, debounced 200ms
        ├── Results area
        │   ├── [Loading] Spinner
        │   ├── [No stories at all] "You haven't created any stories yet." + link
        │   ├── [No search results] "No stories match '{query}'"
        │   ├── [All in doc] "All your stories are already in this doc."
        │   └── [Results] ScrollArea (from ui/scroll-area)
        │       └── StoryPickerRow[] (inline)
        │           ├── Text preview (80 chars)
        │           ├── Date + InlineVisibilityIcon
        │           └── Button "[+ Add]" (loading state per row)
        └── Footer: "N stories match" count
```

### Step 4 — Visual Refinements

These are implementation-level visual choices below the wireframe resolution in the spec:

| Element | Refinement | Rationale |
|---------|-----------|-----------|
| **Doc list card** | `rounded-lg border border-border shadow-sm hover:shadow-md transition-all` + colored `border-l-4` | Matches `StoryCardDetail` card styling. Consistent elevation on hover. |
| **Doc list card — inner layout** | Flex row: `[icon 20px] [title+meta flex-1] [chevron]`. Meta line: `text-xs text-muted-foreground`. | Compact info density. Chevron signals navigability. |
| **Doc header — back link** | `text-sm text-muted-foreground hover:text-foreground` + `ArrowLeft` size 16. Not a `Button` — a plain `Link` to `/docs`. | Matches breadcrumb pattern, not action pattern. Browse pages use links, not FocusHeader. |
| **Doc header — title input** | `text-lg font-semibold bg-transparent border-none outline-none focus:ring-2 focus:ring-ring rounded px-1 -mx-1`. Min-width 120px, flex-1. | Looks like a heading until focused. Ring on focus signals editability. Negative margin compensates padding so text aligns with non-editing state. |
| **Doc header — mobile truncation** | Title `truncate` with `max-w-[50vw]`. Visibility dropdown shows icon only (no text label) via responsive class `hidden sm:inline`. | Prevents header overflow on narrow screens. |
| **Privacy banner** | `rounded-md mx-4 mt-2 px-3 py-2 text-sm flex items-center gap-2`. Not full-bleed — inset within container padding. | Distinct from page-level banners (like `OwnerPreviewBanner` which is full-bleed). Doc banner is content-level, not chrome-level. |
| **Block controls — hover zone** | Parent wrapper: `group relative`. Controls: `opacity-0 group-hover:opacity-100 transition-opacity duration-150`. On mobile (`lg:` breakpoint): always `opacity-100`. | Smooth reveal. Mobile override ensures touch accessibility. |
| **Block controls — layout** | `flex items-center gap-1 h-8 -mb-1` positioned above the card. Icons in `min-w-[44px] min-h-[44px]` touch target wrappers with `rounded-md hover:bg-accent`. | 44px touch targets. Negative bottom margin tightens gap between controls and card. |
| **Hidden point state** | `opacity-50` on the entire point row + `text-muted-foreground text-xs ml-1` for "(hidden)" label after point text. `EyeOff` icon replaces `Eye`. | Clear visual distinction. Text label provides non-color information. |
| **Story picker — desktop slide-in** | `DialogContent` with `fixed right-0 top-0 h-full w-[400px] rounded-none border-l data-[state=open]:animate-in data-[state=open]:slide-in-from-right`. Remove default centering. | Slide-in panel pattern. Override Dialog's default centered positioning. |
| **Story picker — row layout** | `flex items-center gap-3 px-3 py-2 border-b border-border last:border-0`. Text: `flex-1 min-w-0 truncate text-sm`. Meta: `text-xs text-muted-foreground whitespace-nowrap`. Button: `shrink-0`. | Compact, scannable rows. Truncation prevents overflow. |
| **Story picker — add feedback** | Row briefly shows `CheckIcon` in green replacing `[+ Add]`, then fades out of the list after 300ms. | Immediate visual confirmation. Row removal after brief delay keeps the list scannable. |
| **DnD — dragging state** | `shadow-lg scale-[1.02] opacity-90 z-50` on the dragged item. Transition on pick-up. | Elevation signals the item is "lifted." Slight scale increase matches the spec. |
| **DnD — drop zone** | `border-2 border-dashed border-blue-300 bg-blue-50/50 rounded-md h-3 my-1 transition-all` between items when dragging. | Visible drop target. Dashed border signals "placeholder." Blue matches the action color system. |
| **Empty state icon** | `FileTextIcon` from lucide, `w-12 h-12 text-muted-foreground/50 mx-auto mb-4`. | Consistent with other empty states in the app. Muted to avoid drawing focus away from the CTA. |
| **Action buttons — mobile** | `[+ Write a story]` shortens to `[+ Write]` via `<span class="hidden sm:inline">a story</span>`. Both buttons: `min-h-[44px]` touch target. | Preserves touch targets. Responsive label avoids overflow. |

### Step 5 — Extraction Plan

**Duplicated patterns in scope and resolution:**

1. **Amber/blue banner pattern** — appears in three places: doc detail page (doc-level banner), create-story page (doc context banner), story detail page (point inheritance banner). All share the same visual: colored background + icon + text.
   - **Extract:** `DocPrivacyBanner` component with props `visibility: 'public' | 'private'` and `children: ReactNode` (for the text). Single file, three call sites.

2. **Block controls `[≡] + [action]`** — appears at two levels (story-level with X, point-level with eye) but the layout pattern is identical: `flex items-center gap-1`, drag handle + action icon, hover/always-visible responsive behavior.
   - **Extract:** Single `DocBlockControls` component with `variant: 'story' | 'point'` prop. Story variant renders X with `onRemove` callback. Point variant renders Eye/EyeOff with `onToggleHidden` callback and `isHidden` state. Drag handle integration via `@dnd-kit` `useSortable` passed as `dragAttributes`/`dragListeners` props.

3. **Responsive panel (desktop Dialog / mobile Drawer)** — the story picker needs right-slide desktop and bottom-sheet mobile. This responsive pattern could be reused by P581 (letter recipient picker). However, only one consumer exists in P551.
   - **Decision:** Build inline in `DocStoryPicker` using a `useMediaQuery` check to switch between `Dialog` and `Drawer`. Extract to shared `ResponsivePanel` only if P581 needs the same pattern. Premature extraction for one consumer.

4. **Doc context awareness in existing pages** — `CreateStoryPage` and `story-detail-page.tsx` both need to read doc context (ID, title, visibility) and modify back navigation + banners. The reading logic is shared.
   - **Extract:** `useDocContext` hook (already in architecture's Files to Create). Reads `docId` from `searchParams`, fetches doc metadata, provides `{ docId, docTitle, docVisibility, isDocContext, backPath }`. Two consumers.

### Step 6 — Challenge Notes

1. **`StoryCardDetail` point-level DnD integration.** The spec requires drag handles on individual `QuotedPoint` rows within `StoryCardDetail`. However, `StoryCardDetail` currently renders points internally via `QuotedPoint` in a closed loop (lines 354-427). To add per-point drag handles and hide/show controls, the doc detail page cannot simply wrap `StoryCardDetail` — it needs to intercept point rendering. **Resolution options:**
   - **(a) Render slot for points.** Add an optional `renderPoints` prop to `StoryCardDetail` that replaces the internal point rendering. The doc page passes a custom renderer that wraps each point in `SortableItem` + `DocBlockControls`. Non-doc consumers (profile, feed) continue using the default internal rendering. This is the cleanest approach — no changes to `StoryCardDetail` internals.
   - **(b) Compose outside.** Don't use `StoryCardDetail` for the point section in doc context. Render the story header/body via `StoryCardDetail` with points collapsed (or `hideActions`), then render points separately below with doc controls. Risk: visual divergence from profile layout.
   - **Recommendation:** Option (a). A `renderPoints` slot keeps `StoryCardDetail` as the single source of truth for story card layout while allowing doc-specific point wrapping. The prop is optional with no impact on existing consumers.

2. **`@dnd-kit` nested sortable contexts.** The spec requires both story-level and point-level drag reordering. `@dnd-kit` supports nested `SortableContext` but requires careful ID namespacing to avoid collisions between story IDs and point IDs. Use prefixed IDs: `story-{id}` and `point-{storyId}-{pointId}`. The outer `DndContext` needs `onDragEnd` logic that detects which level the drag occurred at (check ID prefix) and dispatches to the appropriate handler.

3. **Start Session button relocation on mobile.** Moving `MicIcon` from bottom nav to the top header area changes a high-visibility placement. The spec is clear on this, but the implementation must ensure the button remains visually prominent (not just a small icon that gets lost). Recommend: `MicIcon` inside a small blue circle/pill (`bg-blue-500 text-white rounded-full p-2`) next to the avatar, visible only on mobile. This maintains the blue CTA color association.

## Test Coverage Strategy

### Test Files

| File | Type | Tests | What it covers |
|------|------|-------|----------------|
| `e2e/integration/p551-clarity-docs-migration.spec.ts` | Integration | 24 | Schema existence (clarity_docs, doc_stories columns), RLS policies (private/public docs, doc_stories scoping, owner-only writes), cross-visibility constraint (private story blocked from public doc), cascade delete (doc deletion preserves stories), UNIQUE constraint, INSERT/UPDATE/DELETE RLS |
| `e2e/p551-clarity-docs.spec.ts` | E2E | 14 | User flows: doc list page, creation modal, rename title, inline story creation, existing story selection, remove story from doc, delete doc with confirmation, private doc access denied for non-owner, navigation (Docs link), visibility indicators on story cards |
| `e2e/p551-smoke.spec.ts` | Smoke | 5 | Route loading: /docs auth gate, /docs authenticated load, /d/:validId owner access, /d/:invalidId not-found, /d/:invalidFormat graceful error |
| `e2e/a11y/p551-accessibility.spec.ts` | Accessibility | 10 | Keyboard nav through doc list, creation modal focus trap + Escape, @dnd-kit drag handle ARIA labels, keyboard drag-and-drop, aria-live region for drag announcements, visibility icon ARIA labels, privacy banner WCAG AA contrast, delete dialog accessibility |
| `features/uat/p551.md` | UAT | 26 | Manual validation checklist: all acceptance criteria groups (creation, detail page, adding content, ordering, privacy, deletion, navigation, edge cases) in Given/When/Then format |

### Coverage by Acceptance Criteria Group

| AC Group | Integration | E2E | Smoke | A11y | UAT |
|----------|------------|-----|-------|------|-----|
| Doc List & Creation | Schema, RLS | List page, create modal | /docs load | Modal focus, keyboard nav | UAT-1 to UAT-3 |
| Doc Detail Page | — | Title, story cards, banner | /d/:id load | Banner contrast | UAT-4 to UAT-6 |
| Adding Content | Cross-visibility, UNIQUE | Inline write, story selector | — | — | UAT-7 to UAT-12 |
| Ordering & Curation | Position column | — (DnD hard to E2E) | — | Keyboard DnD, drag ARIA | UAT-13 to UAT-15 |
| Privacy & Visibility | RLS (5 tests), cascade | Non-owner access denied | Auth redirect | Visibility ARIA labels | UAT-16 to UAT-19 |
| Doc Deletion | Cascade test | Delete with confirmation | — | Delete dialog a11y | UAT-20 to UAT-21 |
| Navigation | — | Docs link click | — | — | UAT-22 to UAT-23 |

### Security-Critical Tests (Must-Pass)

1. **Private doc invisible to non-owner** — integration RLS test + E2E URL-guessing test
2. **Private story cannot be added to public doc** — integration cross-visibility trigger test
3. **Only own stories can be added to doc** — integration RLS INSERT test
4. **Non-owner cannot UPDATE/DELETE docs** — integration RLS tests
5. **Cascade deletes doc_stories but not stories** — integration cascade test

### Known Gaps

- **Drag-and-drop E2E testing** — @dnd-kit mouse-based DnD is notoriously hard to test in Playwright. Covered by keyboard alternative in a11y tests and manual UAT-13/14. If mouse DnD testing is needed, consider Playwright's `dragTo` with explicit coordinate offsets.
- **Mobile FAB** — FAB (floating action button) for mobile story addition not tested in E2E (requires mobile viewport setup). Covered by UAT-23.
- **Story creation with point extraction** — Point extraction from inline story creation involves existing components; covered by existing story creation E2E tests. Doc context (visibility inheritance) is tested at integration level.

## Implementation Tasks

**13 tasks — 3 parallel tracks after Task 1 completes. Estimated: Tasks 1-3 are foundation (serial), Tasks 4-5 can parallelize, Tasks 6-7 can parallelize, Tasks 8-9 depend on Task 7, Tasks 10-13 can parallelize after Task 7.**

---

### Task 1: Database migration — tables, RLS, triggers, indexes

**Files to create:**
- `supabase/migrations/YYYYMMDDHHMMSS_p551_clarity_docs.sql`

**Scope:**
- Create `clarity_docs` table: `id UUID PK DEFAULT gen_random_uuid()`, `owner_id UUID FK→profiles NOT NULL`, `title TEXT NOT NULL DEFAULT 'Untitled Doc'`, `visibility content_visibility NOT NULL DEFAULT 'private'`, `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`. CHECK constraint: `length(title) <= 100 AND length(title) > 0`.
- Create `doc_stories` junction table: `doc_id UUID FK→clarity_docs ON DELETE CASCADE`, `story_id UUID FK→stories`, `position INTEGER NOT NULL`, `point_config JSONB DEFAULT '{}'`, `created_at TIMESTAMPTZ DEFAULT now()`. PK: `(doc_id, story_id)`.
- Indexes: `clarity_docs(owner_id)`, `doc_stories(doc_id, position)`.
- RLS on `clarity_docs`: SELECT (`visibility = 'public' OR owner_id = auth.uid()`), INSERT (verified user, `owner_id = auth.uid()`), UPDATE/DELETE (`owner_id = auth.uid()`).
- RLS on `doc_stories`: SELECT (scoped through doc ownership via EXISTS), INSERT (doc ownership + story ownership: `stories.author_id = auth.uid()`), UPDATE/DELETE (doc ownership).
- BEFORE UPDATE trigger on `clarity_docs`: reject `private→public` if any linked story is private.
- BEFORE INSERT trigger on `doc_stories`: reject if doc is public and story is private.
- `updated_at` auto-update trigger on `clarity_docs`.

**Verify:** Run `./scripts/migrate.sh`. Confirm tables, RLS, triggers, indexes exist.

**Tests:** `e2e/integration/p551-clarity-docs-migration.spec.ts` (24 tests — schema, RLS, cross-visibility, cascade, UNIQUE)

**AC coverage:** Privacy & Visibility (RLS), Adding Content (UNIQUE constraint, cross-visibility), Doc deletion (CASCADE)

---

### Task 2: TypeScript types

**Files to modify:**
- `src/app/types/index.ts`

**Scope:**
- Add `DocPointConfig` type: `{ order?: string[]; hidden?: string[] }`
- Add `DbClarityDoc` type: `{ id: string; owner_id: string; title: string; visibility: 'public' | 'private'; created_at: string; updated_at: string }`
- Add `DbDocStory` type: `{ doc_id: string; story_id: string; position: number; point_config: DocPointConfig; created_at: string }`
- Add `ClarityDoc` type (app-level, extends DB type with story count and relative time)
- Add `DocStory` type (app-level, DB type + resolved story data)

**Verify:** `npx tsc --noEmit` passes.

**AC coverage:** Foundation for all subsequent tasks.

---

### Task 3: Data service — docs-service

**Files to create:**
- `src/app/data/docs-service.interface.ts`
- `src/app/data/docs-service.ts`

**Scope:**
- Interface: `IDocsService` with methods: `createDoc()`, `getDoc(docId)`, `getDocsByUser(userId)`, `updateDoc(docId, updates)`, `deleteDoc(docId)`, `addStoryToDoc(docId, storyId)`, `removeStoryFromDoc(docId, storyId)`, `reorderStories(docId, storyIds[])`, `updatePointConfig(docId, storyId, config)`, `getCompatibleStories(docId)` (for story picker — visibility-filtered, excludes already-in-doc).
- Real implementation using Supabase client. Follow `stories-service` pattern (dependency injection, error handling).
- `reorderStories`: accepts ordered array of story IDs, updates all `position` values in one transaction.
- `updatePointConfig`: updates `doc_stories.point_config` JSONB for a specific story in a doc.
- `getCompatibleStories`: fetches user's own stories filtered by doc visibility (private doc = all, public doc = public only), excluding stories already linked.

**Verify:** Types compile. Methods callable from a test page or console.

**AC coverage:** Adding Content, Ordering & Curation, Doc deletion.

---

### Task 4: Route setup — App.tsx

**Files to modify:**
- `src/App.tsx`

**Scope:**
- Add lazy imports for `DocsListPage` and `DocDetailPage`.
- Add routes: `/docs` → `DocsListPage`, `/d/:docId` → `DocDetailPage`.
- Both wrapped in `ClarityLandingLayout` + `LazyRoute` (existing pattern).

**Verify:** Routes resolve (even if pages are stub components). No TypeScript errors.

**AC coverage:** Doc List & Creation (route exists), Doc Detail Page (route exists).

**Parallelizable with:** Task 5

---

### Task 5: Navigation changes — SimpleNavigation + BottomNav

**Files to modify:**
- `src/app/components/layout/simple-navigation.tsx`
- `src/app/components/layout/bottom-nav.tsx`

**Scope:**
- `SimpleNavigation`: Add "Docs" icon tab (`FileTextIcon`, `/docs`) between Home and Events in the logged-in icon nav. Active state: `pathname.startsWith('/docs') || pathname.startsWith('/d/')`. Only shown for authenticated users.
- `SimpleNavigation` mobile: Add `MicIcon` Start Session button in header area next to avatar (visible only on mobile, `lg:hidden`). Blue circle/pill styling (`bg-blue-500 text-white rounded-full p-2`).
- `BottomNav`: Replace "Start Session" (`MicIcon`, `/live`) with "Docs" (`FileTextIcon`, `/docs`). Update `isActive` to match `/docs` and `/d/` paths.
- `BottomNav`: Add `/d/` to active state matching for Docs tab (so doc detail pages highlight Docs).

**Verify:** Desktop nav shows Home → Docs → Events → My Profile. Mobile bottom nav shows Home → Docs → Events → Me. Start Session visible in mobile header.

**AC coverage:** Navigation changes AC ("`Docs` added to desktop nav... and mobile bottom nav").

**Parallelizable with:** Task 4

---

### Task 6: Doc list page

**Files to create:**
- `src/app/pages/docs-list-page.tsx`

**Scope:**
- Auth-gated (redirect to `/login` if not authenticated).
- Loading state: `ClarityPageLoader` centered.
- Empty state: `FileTextIcon` + "No Clarity Docs yet" + subtitle + `[+ Create a Doc]` primary button.
- Populated state: "Your Clarity Docs" heading + `[+ New Doc]` button (outline). Cards sorted by `updated_at` desc. Each card: visibility icon (lock/globe via `InlineVisibilityIcon`), title, "N stories", relative time, chevron right. Private: `border-l-4 border-l-amber-400`. Public: `border-l-4 border-l-blue-500`.
- `[+ New Doc]` / `[+ Create a Doc]`: calls `docsService.createDoc()`, navigates to `/d/:docId`. Spinner on button during creation.
- Error state: toast via Sonner.
- `<main aria-label="Your Clarity Docs">`.

**Verify:** Page renders at `/docs`. Create button works. Cards link to `/d/:docId`.

**Tests:** `e2e/p551-clarity-docs.spec.ts` (doc list page, creation), `e2e/p551-smoke.spec.ts` (/docs auth gate, /docs authenticated load)

**AC coverage:** Doc List & Creation ACs (all 5).

**Parallelizable with:** Task 7 (after Tasks 1-4 complete)

---

### Task 7: Doc detail page — header, privacy banner, story rendering

**Files to create:**
- `src/app/pages/doc-detail-page.tsx`
- `src/app/components/docs/doc-header.tsx`
- `src/app/components/docs/doc-privacy-banner.tsx`

**Scope:**
- Page: fetches doc + linked stories via `docsService.getDoc()`. Auth check: if doc not found or private + not owner, show "doesn't exist or you don't have access" + link to `/docs`.
- `DocHeader`: `< Docs` back link, inline `<input>` title editor (save on blur/Enter, revert on Escape/empty, max 100 chars), visibility dropdown (`DropdownMenu` with Private/Public items, Public disabled if private stories exist), overflow `[...]` menu with "Delete this Clarity Doc" (red).
- `DocPrivacyBanner`: amber variant (private) / blue variant (public). Icon + "PRIVATE/PUBLIC" label + description. Props: `visibility`, `children`.
- Story cards: render `StoryCardDetail` for each linked story in position order. Pass `routes` prop to customize point/story navigation (returns to doc). Pass `hideActions` in doc context if needed.
- Action buttons row: `[+ Write a story]` (primary, → `/create?docId=xxx`) and `[Select your story]` (outline, opens picker).
- Empty doc state: `FileTextIcon` + "Add your first story" + subtitle.
- Story count label: "N stories".
- `<main aria-label="Clarity Doc: {title}">`.
- Privacy banner: `role="status"`, `aria-live="polite"`.

**Verify:** Page renders at `/d/:docId`. Title editable. Visibility dropdown works. Privacy banner shows. Story cards render.

**Tests:** `e2e/p551-clarity-docs.spec.ts` (rename title, visibility indicators), `e2e/p551-smoke.spec.ts` (/d/:validId, /d/:invalidId, /d/:invalidFormat), `e2e/a11y/p551-accessibility.spec.ts` (banner contrast, visibility ARIA)

**AC coverage:** Doc Detail Page ACs (all 10), Privacy & Visibility (banner, dropdown).

---

### Task 8: Block controls overlay — drag handles + remove/hide

**Files to create:**
- `src/app/components/docs/doc-block-controls.tsx`

**Scope:**
- Single component with `variant: 'story' | 'point'` prop.
- Story variant: `[≡]` drag handle (`GripVertical`) + `[x]` remove (`X` icon, `onRemove` callback).
- Point variant: `[≡]` drag handle (`GripVertical`) + `[eye]`/`[eye-off]` toggle (`Eye`/`EyeOff`, `onToggleHidden` callback, `isHidden` prop).
- Layout: `flex items-center gap-1 h-8`. Icons in 44px touch target wrappers.
- Desktop: `opacity-0 group-hover:opacity-100 transition-opacity duration-150`.
- Mobile: always `opacity-100`.
- Hidden point state: `opacity-50` on parent row + "(hidden)" label.
- Drag handle receives `@dnd-kit` `dragAttributes`/`dragListeners` as props (from parent `useSortable`).
- ARIA: drag handle `aria-label="Drag to reorder"`, `aria-roledescription="draggable"`. Remove `aria-label="Remove {preview} from this doc"`. Eye toggle `aria-pressed`, `aria-label="Hide/Show {text} in this doc"`.

**Verify:** Controls render above story cards and point rows. Hover behavior on desktop. Always visible on mobile.

**Tests:** `e2e/a11y/p551-accessibility.spec.ts` (drag handle ARIA labels)

**AC coverage:** Ordering & Curation ACs (unified hover controls, icon semantics, hide/show).

**Depends on:** Task 7

---

### Task 9: Install @dnd-kit + drag-and-drop integration

**Files to modify:**
- `package.json` (add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)

**Files to modify:**
- `src/app/pages/doc-detail-page.tsx` (add DnD wrapper)

**Scope:**
- Install `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` in main app.
- Wrap story list in `DndContext` + `SortableContext`. Each story card wrapped in `SortableItem` using `useSortable`.
- Nested `SortableContext` for point rows within expanded stories.
- ID namespacing: `story-{id}` and `point-{storyId}-{pointId}` to avoid collisions.
- Sensors: `PointerSensor` (mouse), `TouchSensor` (200ms delay for mobile).
- `onDragEnd`: detect level from ID prefix, dispatch to `docsService.reorderStories()` or `docsService.updatePointConfig()`.
- Optimistic reorder: update local state immediately, revert on server error + toast.
- Drag visual: `shadow-lg scale-[1.02] opacity-90 z-50`. Drop zone: `border-dashed border-blue-300 bg-blue-50/50`.
- Keyboard: Space/Enter to grab, Arrow keys to move, Space/Enter to drop, Escape to cancel.
- Screen reader: announcements for grab, move, drop.

**Verify:** Stories draggable. Points within stories draggable. Positions persist after refresh. Keyboard DnD works.

**Tests:** `e2e/a11y/p551-accessibility.spec.ts` (keyboard drag-and-drop, aria-live announcements)

**AC coverage:** Ordering & Curation ACs (reorder stories, reorder points, position column, drag handles).

**Depends on:** Task 7, Task 8

---

### Task 10: Story selection panel — DocStoryPicker

**Files to create:**
- `src/app/components/docs/doc-story-picker.tsx`

**Scope:**
- Panel component: desktop = `Dialog` (right slide-in, 400px), mobile = `Drawer` (bottom sheet, 80vh). Switch via `useMediaQuery`.
- Header: "Select your story" + `[X]` close.
- Search input: debounced 200ms. `aria-label="Search your stories"`.
- Results: fetched via `docsService.getCompatibleStories(docId)`, filtered client-side by search query.
- Visibility filtering: private doc shows private + public stories; public doc shows public only. Stories already in doc excluded.
- Each row: story text preview (truncated 80 chars), date, `InlineVisibilityIcon`, `[+ Add]` button.
- `[+ Add]`: calls `docsService.addStoryToDoc()`. Row shows `CheckIcon` briefly, then fades out.
- States: loading, empty (no stories), no search results, all in doc, results.
- Footer: "N stories match".
- `role="dialog"`, `aria-label="Select your story"`, `aria-modal="true"`.

**Verify:** Panel opens from `[Select your story]` button. Search filters. `[+ Add]` links story to doc. Story appears in doc.

**Tests:** `e2e/p551-clarity-docs.spec.ts` (existing story selection)

**AC coverage:** Adding Content ACs (select story, visibility filtering, UNIQUE exclusion, own stories only).

**Depends on:** Task 7

---

### Task 11: CreateStoryPage doc context extension

**Files to modify:**
- `src/app/pages/create-story-page.tsx`

**Files to create:**
- `src/app/hooks/use-doc-context.ts`

**Scope:**
- `useDocContext` hook: reads `docId` from `searchParams`. Fetches doc metadata (title, visibility) via `docsService.getDoc()`. Returns `{ docId, docTitle, docVisibility, isDocContext, backPath }`.
- When `docId` present in `CreateStoryPage`:
  - Back button: `< {docTitle}` → navigates to `/d/:docId`.
  - Visibility forced: private doc → `private` (no selector), public doc → `public`.
  - Banner: amber "This story will be private — only you can see it" (private doc), blue "This story will be visible on your profile" (public doc). Uses `DocPrivacyBanner`.
  - Save button: "Save Private Story" (private doc) or "Save Story" (public doc).
  - On save: auto-link story to doc via `docsService.addStoryToDoc()`. Navigate to `/story/:id` with doc context in `location.state`.

**Verify:** Navigate from doc to `/create?docId=xxx`. Banner shows. Visibility forced. Save links story to doc. Back returns to doc.

**Tests:** `e2e/p551-clarity-docs.spec.ts` (inline story creation)

**AC coverage:** Adding Content ACs (write story from doc, visibility inheritance, auto-link).

**Depends on:** Task 7

---

### Task 12: Story detail page doc context extension

**Files to modify:**
- `src/app/pages/story-detail-page.tsx`

**Scope:**
- Read `{ docId, docTitle }` from `location.state`.
- When doc context present:
  - `FocusHeader` back button: `< {docTitle}` → navigates to `/d/:docId`.
  - Point creation: if story is private, show amber banner "This point will be private — only you can see it" above `AddPointForm`. Button label: "Add Private Point".
- Cross-visibility toast: if point link rejected by DB trigger, show: "This point is private and cannot be linked to a public story. To discuss this topic publicly, create a new public point."

**Verify:** Open story from doc context. Back button returns to doc. Point creation banner shows for private stories.

**Tests:** `e2e/p551-clarity-docs.spec.ts` (story/point tappable, back returns to doc)

**AC coverage:** Doc Detail Page ACs (stories/points tappable, back returns to doc), Adding Content ACs (point inheritance).

**Depends on:** Task 7, Task 11

---

### Task 13: Doc deletion — overflow menu + confirmation

**Scope:** Integrated into Task 7's `DocHeader`, but listed separately for verification.

**Files already created in Task 7:**
- `src/app/components/docs/doc-header.tsx` (overflow menu)
- `src/app/pages/doc-detail-page.tsx` (confirmation dialog)

**Scope (verification focus):**
- `[...]` menu in doc header → "Delete this Clarity Doc" (red text).
- Click triggers `ConfirmDialog` (reused): title "Delete this Clarity Doc?", body includes doc title, explains stories/points preserved. Buttons: Cancel + Delete (destructive red).
- On confirm: `docsService.deleteDoc()`, navigate to `/docs`, toast "Doc deleted."
- On error: toast, dialog stays open.
- Spinner on Delete button during request.

**Verify:** Delete from overflow menu. Confirmation dialog shows. Stories preserved after deletion. Navigate to `/docs`.

**Tests:** `e2e/p551-clarity-docs.spec.ts` (delete doc with confirmation), `e2e/a11y/p551-accessibility.spec.ts` (delete dialog accessibility)

**AC coverage:** Doc List & Creation (doc deletion via menu), Privacy & Visibility (cascade preserves stories).

**Depends on:** Task 7

---

### Parallelization Summary

```
Task 1 (DB migration)
  └──→ Task 2 (types)
        └──→ Task 3 (data service)
              ├──→ Task 4 (routes)  ─────────────────┐
              └──→ Task 5 (nav changes)  ────────────┤
                                                      ├──→ Task 6 (doc list page)
                                                      └──→ Task 7 (doc detail page)
                                                            ├──→ Task 8 (block controls)
                                                            │     └──→ Task 9 (DnD integration)
                                                            ├──→ Task 10 (story picker)
                                                            ├──→ Task 11 (create story ext)
                                                            │     └──→ Task 12 (story detail ext)
                                                            └──→ Task 13 (doc deletion verify)
```

**Critical path:** 1 → 2 → 3 → 7 → 9 (5 serial tasks). Tasks 4+5, 6+7, 8+10+11+13 are parallelizable within their tiers.
