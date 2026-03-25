---
status: today
type: story
rank: 0.313
tags:
  - docs
  - privacy
  - container
  - letters
delivery_stage: 1-prd-review
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
locked_at: '2026-03-24T14:45:28.211Z'
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
- Users can create a doc with a title and visibility (`public` or `private`)
- Users can add their own stories to a doc (stories only — no standalone points as doc items in V1)
- Users can create stories inline within a doc (story inherits doc visibility automatically)
- Stories created inline inside a doc are automatically set to the doc's visibility
- Private docs can contain both private stories AND existing public stories (doc is a private collection — public stories retain their independent visibility)
- Public docs can only contain public stories (private stories in a public doc would expose private content)
- Private stories cannot be added to a public doc (visibility leak blocked)
- A private story can appear in multiple private docs owned by the same user
- Doc owner can reorder stories within a doc (drag or manual position)
- Doc owner can reorder points within a story (controls display order of linked points)
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
- I want to create a doc with stories about our key decisions, so I have a curated collection that grows session by session

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
- [ ] User can see their docs at `/docs` route
- [ ] User can create a new doc with a title and visibility (`public` or `private`)
- [ ] Doc list shows visibility icon (lock for private, globe for public), title, item count, last updated
- [ ] Creation modal: title field + visibility toggle, defaults to private

### Doc Detail Page
- [ ] Doc page accessible at `/d/:docId`
- [ ] Doc page shows title, visibility indicator, story count
- [ ] Stories displayed in user-controlled order (default: chronological add order)
- [ ] Each story card shows content, author, date, and visibility indicator (lock/globe)
- [ ] Each story card shows linked points with visibility indicators
- [ ] Privacy banner at top for private docs ("Only you can see this")

### Adding Content
- [ ] User can add an existing story to a doc (from their own stories)
- [ ] User can create a new story inline and add it to the doc
- [ ] Stories created inline within a doc inherit the doc's visibility automatically (works in both public and private docs)
- [ ] User can add existing public stories to a private doc (doc is a private collection; stories retain their own visibility)
- [ ] Cannot add a private story to a public doc (public doc page would expose private content)
- [ ] Public stories in a private doc remain visible on owner's profile/feed independently (doc privacy ≠ story privacy)
- [ ] Bottom input form for adding stories (desktop) / FAB (mobile)
- [ ] UNIQUE constraint: same story cannot appear twice in the same doc
- [ ] A private story can appear in multiple private docs owned by the same user

### Ordering & Curation
- [ ] Doc owner can reorder stories within a doc (drag-to-reorder or manual position)
- [ ] Doc owner can reorder points within a story (controls display order of linked points)
- [ ] `doc_stories.position` column determines story display order
- [ ] `story_points.position` column determines point display order within a story card

### Privacy & Visibility
- [ ] Private doc (as a collection) does NOT appear in the public feed or profile
- [ ] Public stories within a private doc remain independently visible on profile/feed (the doc is private, not the stories)
- [ ] Private doc content does NOT appear in any search or discovery
- [ ] Non-owners cannot see private doc content even if they guess the URL (auth + ownership check)
- [ ] Doc visibility is set at creation — no UI to change it in V1
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
- Doc deletion (V1: docs persist)
- Letter integration UI ("Send as Letter" button, letter status section) — ships with P581
- "One doc, many letters" with individual predictions — P581 scope
- Snapshots/versioning (letter = frozen snapshot of doc at send time) — P581 scope
- Private story encryption — separate backlog spec (P551 relies on RLS-only privacy)
- Point visibility RLS, story immutability, `shared` removal, visual indicators — P586 (prerequisite)
- Hiding specific linked points from display — future

## UX Flows

### Flow 1: Doc List + Creation (`/docs`)

```
+============================================================+
|  nav: [Logo]  Feed  Practice  Docs  [Avatar]               |
+============================================================+
|                                                             |
|  Your Docs                                         [+ New] |
|                                                             |
|  +-------------------------------------------------------+ |
|  | [lock]  Therapy Notes                            [>] | |
|  |         3 stories  ·  Updated 2h ago                  | |
|  +-------------------------------------------------------+ |
|  | [globe] Workshop: False Beliefs                  [>] | |
|  |         7 stories  ·  Updated 3 days ago              | |
|  +-------------------------------------------------------+ |
|                                                             |
+============================================================+

CREATE MODAL (triggered by [+ New]):
+------------------------------------------+
|  New Doc                            [X]  |
|                                          |
|  Title                                   |
|  [Session Notes — Mar 2026_________]     |
|                                          |
|  Visibility                              |
|  (•) Private [lock]  ( ) Public [globe]  |
|                                          |
|  [Cancel]              [Create Doc]      |
+------------------------------------------+
```

- Entry: standalone `/docs` route (not nested under profile)
- Creation: title + visibility toggle, defaults to private
- List shows visibility icon, story count + recency

### Flow 2: Doc Page

```
+============================================================+
| +--------------------------------------------------------+ |
| | [lock]  PRIVATE DOC  ·  Only you can see this          | |
| +--------------------------------------------------------+ |
|                                                             |
|  Therapy Notes                                             |
|  3 stories                                                  |
|                                                             |
|  +-------------------------------------------------------+ |
|  | STORY                                           [...] | |
|  | "Last Tuesday when we reviewed the budget, I tried    | |
|  |  to explain my concern but felt like the conversation | |
|  |  moved on before I finished."                         | |
|  |                                                       | |
|  | Mar 15                                                | |
|  +-------------------------------------------------------+ |
|                                                             |
|  +-------------------------------------------------------+ |
|  | STORY                                           [...] | |
|  | "I believe that trust requires consistent             | |
|  |  follow-through on small commitments before big ones  | |
|  |  can be attempted."                                   | |
|  |                                                       | |
|  | Mar 22                                                | |
|  +-------------------------------------------------------+ |
|                                                             |
+-------------------------------------------------------------+
| [________________________] [Add Story]                      |
+============================================================+
```

- Privacy banner at top for private docs (warm amber bg, lock icon) — never scrolls away
- Bottom input for adding stories
- `...` menu on each card (remove from doc, reorder, delete story)
- Drag handles on story cards for reordering

### Flow 2b: Doc Page (mobile)

```
+-------------------------------+
| < Docs    Therapy Notes  [...] |
+================================+
| [lock] Private · 3 stories     |
+================================+
|                                 |
| +-----------------------------+ |
| | STORY                       | |
| | "Last Tuesday when we..."   | |
| | Mar 15                [...] | |
| +-----------------------------+ |
|                                 |
| +-----------------------------+ |
| | STORY                       | |
| | "I believe that trust..."   | |
| | Mar 22                [...] | |
| +-----------------------------+ |
|                                 |
|                          (+)    |
+================================+
```

- FAB for adding stories
- Drag handles for reordering

### Flow 3: Adding Content (bottom form expands)

```
+============================================================+
| Add a story to this doc                                     |
|                                                             |
| [________________________                                   |
|  ________________________                                   |
|  ________________________]                                  |
|                                                             |
| Or select from your existing stories:                       |
| +-------------------------------------------------------+  |
| | "I believe that trust requires..."            [Add]   |  |
| | "When we discussed the budget..."             [Add]   |  |
| +-------------------------------------------------------+  |
|                                                             |
| [Cancel]                                  [Add to Doc]      |
+============================================================+
```

- Write new story inline OR select from existing stories
- Only shows stories matching doc visibility (private doc = private stories + new)
- New stories created here inherit doc visibility automatically

### Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Entry point | `/docs` standalone route | Docs are personal curation, not profile subsection |
| Creation | Title + visibility modal | Two fields, get in fast. Visibility is a first-class decision |
| Layout | Sequential story cards | Reuses profile card components. Canvas is a future renderer |
| Privacy indicator | Persistent amber banner + lock icons | Ambient trust signal, never scrolls away |
| Ownership | Single owner, no co-editing | Each partner has their own doc; gap map emerges from letter exchanges (P581) |
| Content addition | Bottom form (desktop) / FAB (mobile) | Lowest friction — no modal, no page nav |
| Story creation | Inline in both public and private docs | Symmetric UX — story inherits doc visibility automatically |
| Story visibility | Immutable, matches doc (P586 enforces) | Eliminates cascading edge cases |
| Ordering | User-controlled position on stories and points | Curation requires control over flow and emphasis |
| Cross-doc linking | Private story can appear in multiple private docs (same owner) | No reason to restrict — owner controls both |
| Points | Via story-point links only | No standalone points as doc items — points visible through stories |
| Letter integration | Deferred to P581 | Doc is compose surface; letter is delivery. Clean boundary. |

## Next Steps

**Prerequisite:** P586 (Visibility & Privacy Foundation) must ship first.

1. **Run `/challenge-prd`** — stress-test updated spec assumptions
2. **Run `/ux`** — doc page interaction design (ordering UX, add-story flow, mobile)
3. **Run `/architect`** — doc data model (`clarity_docs`, `doc_stories` with position), `story_points.position` column
4. **Run `/ui`** — component strategy
5. **Run `/generate-tests`** — acceptance criteria → test stubs
6. **Run `/spec-review`** — validate before implementation
7. **Run `/dev`** — implement
