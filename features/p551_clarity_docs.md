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
- Stories created inside a private doc are automatically `visibility: 'private'`
- Stories must match doc visibility (private doc = private stories only, public doc = public stories only)
- Doc content is displayed in sequential order (top to bottom)
- Doc page is accessible at its own URL (`/d/:docId`)
- "Send as letter" button on doc page header opens the letter composition wizard (P581)
- Doc page shows sent letters and their delivery statuses
- Private doc content is invisible to non-owners at every level (database, API, UI)
- Each person owns their own doc — no co-ownership, no shared editing

**Success conditions:**
- A facilitator can curate stories into a doc and send them as a letter in one flow
- The founder feels confident using private docs for therapy work (the ultimate trust test)
- Content created inside a private doc stays invisible outside the doc/letter context

**Constraints:**
- Points come through story-point links (existing `story_points` junction) — no standalone points as doc items
- Stories have visibility (`public`/`private`) — `shared` is cut (see D16 in plan)
- Story visibility is immutable after creation (D13) — want to "unpublish"? Delete and recreate
- No co-ownership in V1 — each partner has their own doc with their own stories on shared points
- The gap map emerges from letter exchanges between docs, not from co-editing one doc (D2)
- v1 does NOT include auto-fill from /live sessions (future — P547 integration)
- v1 does NOT include canvas/grid layout (sequential blocks only)

## User Stories

**As a facilitator preparing a workshop:**
- I want to create a doc with curated false-belief stories, so I can send them as a letter to each participant after the group session

**As a co-founder (partner A):**
- I want to create a doc with stories about our key decisions, so I have a curated collection to send my partner before our next /live session

**As a therapy client:**
- I want to create a private doc with stories about my beliefs and schemas, so I can send them as a letter to my therapist in a trusted space

**As a doc owner:**
- I want to add stories to my doc over time, so my collection grows session by session
- I want to see which letters I've sent from this doc and their status, so I know who has received and completed the reading

**As a private doc owner:**
- I want stories I create inside my private doc to be automatically private, so I don't have to think about visibility settings
- I want to be certain nothing in my private doc appears on my profile or in any feed

## Jobs to Be Done

**When I finish a coaching session with my co-founder:**
- I want to file stories from the session into a doc, so they accumulate over time and I can send the collection as a letter before our next meeting (motivation: the doc is the working surface, the letter is the delivery moment)

**When I'm working through something sensitive with my therapist:**
- I want to file beliefs and observations in a private doc, so I can send them as a letter only to her — even if she doesn't have an account yet (motivation: the unregistered receiver flow in P581 must work for this)

**When I've curated stories for a workshop:**
- I want to send the same doc as a letter to each participant with individual predictions, so they each get a personalized assessment experience (motivation: one doc, many letters)

## Outcomes (Success Metrics)

**Adoption:**
- At least 1 doc created and used as letter source within 2 weeks of launch
- At least 2 co-founder pairs using docs to accumulate stories within 4 weeks

**Trust:**
- Founder (Slava) uses private docs for personal therapy work and reports feeling secure (qualitative)
- Zero instances of private doc content appearing in feed, profile, or search (absolute — any leak is a critical bug)

**Letter integration:**
- At least 1 letter sent from a doc within the first week (validates the doc → letter flow)

## Acceptance Criteria

### Doc List & Creation
- [ ] User can see their docs at `/docs` route
- [ ] User can create a new doc with a title and visibility (`public` or `private`)
- [ ] Doc list shows visibility icon (lock for private, globe for public), title, item count, last updated
- [ ] Creation modal: title field + visibility toggle, defaults to private

### Doc Detail Page
- [ ] Doc page accessible at `/d/:docId`
- [ ] Doc page shows title, visibility indicator, story count
- [ ] Stories displayed in sequential order (top to bottom)
- [ ] Each story card shows content, author, date
- [ ] Privacy banner at top for private docs ("Only you can see this")

### Adding Content
- [ ] User can add an existing story to a doc (from their own stories)
- [ ] User can create a new story inline and add it to the doc
- [ ] Stories created inside a private doc get `visibility: 'private'` automatically
- [ ] Cannot add a public story to a private doc (visibility mismatch blocked)
- [ ] Cannot add a private story to a public doc (visibility mismatch blocked)
- [ ] Bottom input form for adding stories (desktop) / FAB (mobile)
- [ ] UNIQUE constraint: same story cannot appear twice in the same doc

### Letter Integration
- [ ] "Send as letter" button on doc page header
- [ ] Button opens letter composition wizard (P581): confirm stories → add receivers → set predictions → seal & send
- [ ] Sent letters section on doc page showing letter status per delivery (sent/opened/in_progress/completed)

### Privacy & Visibility
- [ ] Private doc content does NOT appear in the public feed
- [ ] Private doc content does NOT appear on owner's public profile
- [ ] Private doc content does NOT appear in any search or discovery
- [ ] Non-owners cannot see private doc content even if they guess the URL (auth + ownership check)
- [ ] Story visibility is immutable after creation — no UI to change it
- [ ] Doc visibility is set at creation — no UI to change it in V1

### Points Visibility (via stories)
- [ ] Points are visible to a viewer only if they can see at least one linked story (RLS update)
- [ ] No standalone point browsing — points encountered through story context
- [ ] Positions on private points visible only within doc/letter context (not on public profile)

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
- Reordering stories within a doc (V1: chronological add order)
- "Shared" visibility value — cut per D16. Two modes only: public, private

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
|  Therapy Notes                          [Send as Letter]   |
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
|  --- Letters -------------------------------------------- |
|  | To: anna@example.com  ·  Completed  ·  3/3 rated     | |
|  | To: Dr. K             ·  Sent       ·  0/3 rated     | |
|  -------------------------------------------------------- |
|                                                             |
+-------------------------------------------------------------+
| [________________________] [Add Story]                      |
+============================================================+
```

- Privacy banner at top for private docs (warm amber bg, lock icon) — never scrolls away
- "Send as Letter" button in header opens P581 composition wizard
- Sent letters section shows delivery statuses
- Bottom input for adding stories
- `...` menu on each card (remove from doc, delete story)

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
| --- Letters ------------------- |
| anna@  Completed  3/3          |
| Dr. K  Sent       0/3          |
|                                 |
|                  [Send Letter]  |
|                          (+)    |
+================================+
```

- FAB for adding stories, "Send Letter" button above FAB
- Compact letter status rows

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
| Ownership | Single owner, no co-editing | Gap map emerges from letter exchanges, not shared editing (D2) |
| Letter integration | "Send as Letter" header button + status section | Doc is compose surface, letter is delivery (D4) |
| Content addition | Bottom form (desktop) / FAB (mobile) | Lowest friction — no modal, no page nav |
| Story visibility | Immutable, matches doc | Eliminates cascading edge cases (D13, D14) |
| Points | Via story-point links only | No standalone points as doc items — points visible through stories (D6) |

## Next Steps

1. **Run `/architect`** — unified data model with P581 (4 new tables + story_verifications extension)
2. **Run `/ux`** — doc page + send wizard interaction design
3. **Run `/generate-tests`** — acceptance criteria → test stubs
4. **Run `/dev`** — implement (Phase 1: schema, Phase 2: doc CRUD)
