---
status: week
type: story
rank: 7.0
tags:
  - docs
  - privacy
  - shared-artifact
  - container
delivery_stage: 1-prd-review
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-18
related: [p431, p422, p547]
---

# P551: Clarity Docs — Private Shared Pages

## Problem Statement

**Current state:** ClarityPledge has two surfaces for content — profiles (stories, points) and the feed. Both are individual. Stories belong to an author's profile. Points are globally public and ownerless. After a /live session, each person walks away with their own artifacts on their own profile.

**Pain points:**
- **No "ours."** Co-founder pairs produce shared understanding through sessions but have no place to put it. Session outputs scatter across two individual profiles instead of building a shared knowledge base.
- **Privacy insecurity.** Stories are created within profile context and feel like they could leak to the feed. The founder himself (the first user) doesn't trust the current privacy model for sensitive content. If the product's creator feels insecure, no therapy client or vulnerable co-founder pair will trust it either.
- **Points are always public.** A point like "I feel unheard when we discuss finances" created in a therapy context is immediately visible to everyone (RLS: `USING(true)`). There is no mechanism for private claims.
- **No pair entity.** Sessions aren't grouped by pair. `clarity_agreements` exists (P422) but is disconnected from sessions. The system cannot answer "what have these two people worked on together?"

**Who's affected:**
- Co-founder pairs (current target market) who want to accumulate session-by-session shared understanding
- Therapy/couples dyads who need claims that never touch the public feed
- Slava (founder) who wants to use the platform with his own psychotherapist
- Future: workshop groups, advisory relationships

## Intention (Why This Matters)

**Strategic importance:** Docs is the third surface area that makes ClarityPledge a complete platform — feed (social), profile (individual), docs (relational). It unlocks the therapy/couples market by solving the trust problem architecturally, not with toggles. It also creates the container that will host the Clarity Canvas (strategic assumption grid for co-founders) without requiring a separate build.

**Why now:**
- Slava mediates all sessions and manually tracks pair progress in his head. This doesn't scale past ~10 active pairs.
- The therapy use case is Slava's personal need — dog-fooding drives urgency and quality.
- P547 (AI Post-Session Coach) will need somewhere to put its draft outputs. Docs is that container. Building docs first means P547 has a target when it ships.
- The Clarity Canvas vision (9-box strategic grid for co-founders) is a layout template applied to a doc — building docs now means canvas is a renderer, not a product.

**Impact if not solved:**
- Therapy/couples use case stays permanently blocked (no private claims possible)
- Co-founder pairs get no accumulating shared artifact — every session is ephemeral
- P547 outputs have nowhere to land except email (dead end)
- Clarity Canvas requires building a separate product instead of a layout over existing primitives

## Business Requirements

**Must-haves:**
- Users can create a private document page (a "doc") accessible at its own URL
- Users can add points and stories to a doc — content created inside a doc is private to doc members by default
- Users can share a doc with another person via link (recipient clicks → becomes member)
- Doc members can see all content in the doc and add their own content
- Content in a doc never appears in the public feed, on profiles, or in any search/discovery surface
- Doc content is invisible to non-members at every level (database, API, UI)
- A doc member can explicitly "publish" their own points/stories from a doc to the public feed (private → public, one-directional, intentional act). Publishing another member's content is not possible.

**Success conditions:**
- Two people can leave a session with one private, co-owned record that neither can accidentally expose
- The founder feels confident using it for his own therapy work (the ultimate trust test)
- Content created inside a doc stays inside the doc unless explicitly published

**Constraints:**
- Points remain ownerless (the "wiki article" paradigm is preserved) — the doc scopes who can SEE a point, not who OWNS it
- No new content primitives (no "claims" entity) — docs contain points and stories, same as profiles/feed
- Stories already have visibility (`public`/`shared`/`private`) — doc stories use the existing `private` visibility + doc scoping
- v1 does NOT include auto-fill from /live sessions (that's P547 + future work)
- v1 does NOT include canvas/grid layout (sequential blocks only — canvas is a future renderer)
- v1 does NOT require the connections model (P431) — link sharing is sufficient

## User Stories

**As a co-founder in a pair:**
- I want to create a shared doc with my co-founder, so we have one place to accumulate what we've verified together
- I want to add a claim (point) to our doc after a session, so our shared understanding is captured
- I want to see my co-founder's claims alongside mine in the same doc, so we can see where we agree and disagree
- I want to be certain nothing in our doc appears on my profile or in any feed, so I can be honest about sensitive topics

**As a therapy client:**
- I want to create a doc shared only with my therapist, so I can file claims about my beliefs and schemas in a trusted space
- I want my therapist to add her own observations as points in the same doc, so I can see her perspective alongside mine
- I want to feel that this doc is architecturally separate from any public surface, so I trust the platform with vulnerable content

**As a doc creator:**
- I want to share my doc via a link, so I don't need the other person's account details upfront
- I want to see who has access to my doc, so I know exactly who can see the content
- I want to later publish a point from my doc to the public feed, so validated insights can benefit others (only when I choose)

**As a doc member (invited):**
- I want to click a share link and immediately see the doc, so joining is frictionless
- I want to add my own points and stories to the doc, so the artifact is co-owned
- I want to know I can't accidentally make doc content public, so the trust is built into the system

## Jobs to Be Done

**When I finish a coaching session with my co-founder:**
- I want to capture the key claims we discussed in a shared private space, so they don't evaporate and we can build on them next session (motivation: accumulation of shared understanding over time)

**When I'm working through something sensitive with my therapist:**
- I want to file beliefs and observations in a space only she and I can see, so I can be fully honest without fear of exposure (motivation: psychological safety enables deeper work)

**When I've validated a claim in our private doc and want to share it publicly:**
- I want to deliberately publish that one point to the feed, so I can share verified insights without exposing the rest of our private work (motivation: selective transparency)

**When my partner sends me a link to our shared doc:**
- I want to open it and immediately start adding content, so the shared artifact starts building from the first interaction (motivation: low-friction co-creation)

## Outcomes (Success Metrics)

**Adoption:**
- At least 1 doc created and shared within 2 weeks of launch (Slava's own therapy use case)
- At least 2 co-founder pairs using docs within 4 weeks

**Trust:**
- Founder (Slava) uses docs for personal therapy work and reports feeling secure (qualitative)
- Zero instances of doc content appearing in feed, profile, or search (absolute — any leak is a critical bug)

**Engagement:**
- Doc members return to add content after the initial creation (not a one-time artifact)
- Average doc has ≥3 items (points or stories) after 2 weeks

**Publish flow:**
- At least 1 point published from a doc to the feed within 4 weeks (validates the private → public path)

## Acceptance Criteria

- [ ] User can create a new doc with a title
- [ ] User can add a point to a doc (statement + optional context)
- [ ] User can add a story to a doc (text content)
- [ ] User can take a position (stance) on any point in the doc
- [ ] Doc content is displayed in sequential order (top to bottom, reorderable)
- [ ] Section headers can be added between items for organization
- [ ] User can generate a share link for their doc
- [ ] Recipient of a share link can join the doc as a member
- [ ] Doc members can see all items and add their own
- [ ] Doc page shows who has access (member list)
- [ ] Doc content does NOT appear in the public feed under any circumstance
- [ ] Doc content does NOT appear on any member's public profile
- [ ] Doc content does NOT appear in any search or discovery feature
- [ ] Non-members cannot see doc content even if they guess the URL (auth + membership check)
- [ ] User can publish a point/story from a doc to the public feed ONLY if they authored it (explicit action, confirmation required)
- [ ] Publishing another member's content is not possible (enforced at DB level, not just UI)
- [ ] Published point loses its doc scoping and becomes globally visible (standard point behavior)
- [ ] Doc page shows lock icon and "Only [members] can see this" indicator
- [ ] Doc page is accessible at its own URL (not nested under a profile)
- [ ] Creating content inside a doc does NOT require choosing visibility (it's always private to the doc)

## Out of Scope (v1)

- Auto-fill from /live sessions (future — P547 integration)
- Canvas/grid layout (future — CSS renderer over sequential blocks)
- Connections model for sharing (P431 — link sharing sufficient for v1)
- Importing existing public points into a doc
- Point editing/versioning within docs
- Real-time collaborative editing (async is fine for v1)
- Doc templates (e.g., "Clarity Canvas template") — future
- Doc-level permissions beyond owner/member (e.g., read-only, admin)
- Removing a member from a doc
- Doc deletion

## Next Steps

1. **Run `/challenge-prd`** — stress-test business requirements before design
2. **Run `/ux`** — design user flows, doc page layout, share flow, creation flow
3. **Run `/architect`** — data model (`docs`, `doc_members`, `doc_items`), RLS policies, point `doc_id` FK
4. **Run `/generate-tests`** — acceptance criteria → E2E test stubs
5. **Run `/dev`** — implement
