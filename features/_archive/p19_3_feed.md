# P19.3: Idea Feed & Orphan Ideas

**Status:** In Progress (MVP Core Complete)
**Priority:** High
**Parent:** [P19 Clarity Partners & Common Knowledge Engine](./p19_0_clarity-partners-common-knowledge.md)
**Builds on:** [P19.2 Clarity Chat MVP](./p19_2_clarity-chat-mvp.md)

---

## Summary

Extends Clarity Chat with a public idea feed where ideas exist independently of their creators. Users can vote (Agree / Disagree / Don't Know) without verification, or go deep via Clarity Chat to verify understanding.

**Key principle:** Lightweight engagement on feed, deep verification in chat.

---

## Prerequisites (Complete in P19.2 First)

Before starting P19.3, these P19.2 features must be complete:

| Feature | Why Required | P19.2 Story | Status |
|---------|--------------|-------------|--------|
| Multiple rounds of explain-back | Core verification loop - without it, verification is incomplete | Story 3 + Story 4 extension | ✅ Done |
| Show previous corrections for context | Users need context to improve paraphrase | Story 4 extension | ✅ Done |
| "Stop here" action (accept at current score) | Not all verifications reach 10/10 - need graceful exit | New story | ✅ Done |
| Celebration on 10/10 | Positive reinforcement for completion | Polish | 🔲 TODO |

---

## Decisions Log

Decisions made during planning (2024-12):

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Vote changing** | ✅ Allowed, history visible | Transparency - people can see vote evolution |
| **Anonymous voting** | ❌ Not possible | All votes tied to session/user, always visible |
| **Graveyard logic** | 🚫 Out of scope | Complexity not needed for MVP - defer |
| **Acceptance threshold** | ✅ 10/10 OR stop at lower score | User can accept at e.g., 6/10 and stop pursuing further |
| **Originator explain-back** | ✅ Yes, but verifies requester's intent | See nuance below |

### The Intent Verification Nuance

When originator is asked to explain back their own idea:

- **Normal flow:** Alice posts idea → Bob explains back → Alice rates → Verifies Bob understood Alice's idea
- **Flipped flow:** Alice posts idea → Bob asks Alice to explain back → Bob rates → Verifies Alice understood **Bob's intent in asking**

The explain-back is always about "do you understand what *I* meant?" — the requester is always the judge.

**UI implication:** When someone asks the originator to explain back, the copy should clarify: "Alice, Bob wants to verify you understand why he's asking. Explain back what you think Bob is looking for."

---

## Core Concepts

### Orphan Ideas

Ideas have no owners. They have:
- **Originator:** The person who first spoke the idea
- **Validators:** People who engage (votes, comments, verification)

**Key principle:** The originator has no special rights. They're just the first speaker. They don't need to Agree with an idea to request explain-back on it.

For MVP, all ideas persist indefinitely. *(Graveyard logic deferred - see Decisions Log)*

### Voting (Lightweight)

Anyone can vote on any idea from the feed:

| Vote | Meaning |
|------|---------|
| **Agree** | I believe this is true/valid |
| **Disagree** | I believe this is false/invalid |
| **Don't Know** | I'm uncertain |

**Voting is independent of verification.** You don't need to prove understanding to vote.

### Verification (Deep)

Verification happens in **Clarity Chat**, not on the feed.

To verify understanding:
1. Start a Clarity Chat about the idea
2. Go through explain-back rounds (see below)
3. Reach mutual understanding
4. Verification status can be shared (opt-in)

**Verification does not change your vote.** It proves you understood before voting.

---

## Language Guide

| User-Facing Term | Internal/Technical | Meaning |
|------------------|-------------------|---------|
| **Explain back** | Paraphrase | Restate an idea in your own words |
| **Verify understanding** | Verification | The full process of explain-back + rating |
| **Rate** | Accuracy rating | How well the explain-back captured the idea (0-10) |
| **Accept** | Verification accepted | Rating meets threshold (currently 10/10) |

### The Explain-Back Process (Multiple Rounds)

Verification is **iterative**, not one-shot:

```
Round 1:
  Listener explains back → Author rates (e.g., 6/10)
  Author provides correction → "You missed the part about X"

Round 2:
  Listener explains back again → Author rates (e.g., 8/10)
  Author provides correction → "Almost, but Y means Z"

Round 3:
  Listener explains back → Author rates (10/10)
  ✓ Understanding verified
```

**Key UX considerations:**
- Show round number ("Round 2 of explain-back")
- Show previous corrections for context
- Celebrate completion ("You've reached understanding!")
- Allow author to accept at any rating (10/10 is default threshold)

---

## Separation of Concerns

| Layer | Where | What Happens |
|-------|-------|--------------|
| **Feed** | Public | Discover ideas, vote, comment |
| **Voting** | Public | Agree / Disagree / Don't Know (no verification needed) |
| **Comments** | Public | Discuss, can elevate to new idea |
| **Chat** | Private | Deep verification via explain-back |
| **Verification status** | Shareable | "We reached understanding" (opt-in visibility) |
| **Verification transcript** | Private | The actual rounds and corrections |

---

## Idea Creation

Ideas can be created three ways:

### 1. Direct Creation (Feed)
- User taps "New Idea" on feed
- Writes or speaks the idea
- Chooses visibility (private / public)
- Posted to feed

### 2. Explicit Elevation (Chat/Comments)
- User sees a message or comment worth preserving
- Taps "Make this an idea"
- Chooses visibility
- Becomes an orphan idea on feed

### 3. Implicit Elevation (Explain-Back Request)
- User requests someone to explain back a message
- **This auto-elevates the message to an idea**
- Logic: if it's worth verifying understanding, it's an idea
- No extra step needed

```
Message: "Trust requires verified understanding"
     │
     ├─→ Just a message (no action)
     │
     └─→ "Explain this back" requested
              │
              └─→ Auto-becomes an idea
                   └─→ Verification begins
```

**The act of requesting explain-back IS the act of saying "this matters."**

---

## User Flows

### Flow 1: Browse & Vote

1. User opens feed
2. Sees idea cards with vote counts
3. Taps Agree / Disagree / Don't Know
4. Vote recorded immediately
5. Counts update

**No verification required.**

### Flow 2: Explore Voters

1. User taps vote count (e.g., "7 Agree")
2. Sees list of people who voted Agree
3. Can see:
   - Name, role, avatar
   - Whether they verified understanding (if shared)
   - Connection degree (1st, 2nd) if applicable

### Flow 3: Start Verification Chat

1. User sees idea they want to discuss deeply
2. Taps "Discuss in Chat" or "Verify Understanding"
3. Options:
   - Invite specific person
   - Create open room (anyone can join)
4. Enters Clarity Chat with idea as context
5. Explain-back rounds happen (per P19.2 mechanics)
6. On completion: verification status recorded

### Flow 4: Elevate Comment to Idea

1. User reads comments on an idea
2. Sees insightful comment
3. Taps "Make this an idea" (or author taps "Post as idea")
4. Comment becomes new orphan idea
5. Shows provenance: "Born from discussion on [original idea]"
6. Original comment remains in place

### Flow 5: View Profile Stats

1. User views their profile (or someone else's)
2. Sees:
   - Ideas originated
   - Ideas voted on (Agree/Disagree/Don't Know counts)
   - Verifications completed
   - Average rounds to understanding
   - People verified with

---

## Idea Page

Each idea has its own page.

**URL:** `/idea/:id`

**Contents:**
- Full idea text (not truncated)
- Vote buttons (Agree / Disagree / Don't Know)
- Vote counts + voter lists (tap to expand)
- Comments thread
- "Discuss in Chat" button → starts Clarity Chat with idea as context
- Provenance: where the idea came from
  - "Originated by Slava"
  - "Elevated from chat between Slava and Mike"
  - "Born from comment on [linked idea]"
- Verification summary (if any, based on sharing settings)
  - "3 people verified understanding"
  - Names visible based on connection degree

**Actions on idea page:**
- Vote
- Comment
- Share link
- "Discuss in Chat"
- "Elevate comment" (on any comment)

---

## Idea Card Design

```
┌─────────────────────────────────────────────┐
│ "Evolution is the most effective force..."  │
│                                             │
│ ┌─────────┐ ┌──────────┐ ┌────────────┐    │
│ │  Agree  │ │ Disagree │ │ Don't Know │    │
│ └─────────┘ └──────────┘ └────────────┘    │
│                                             │
│ ✓ 7        ✗ 2          ? 3       💬 4     │
│                                             │
│ Originated by Slava • 3 days ago            │
│ (tap counts to see who voted)               │
└─────────────────────────────────────────────┘
```

**When viewing voter list:**
```
Agreed (7)
├── Mike H. ✓ (verified with you)
├── Jessica S. ✓ (verified with originator)
├── Bob T.
├── Emily B.
└── ... 3 more
```

The ✓ indicates verification status (visible based on sharing settings / connection degree).

---

## Data Model Extensions

Building on P19.2 tables, add:

```sql
-- Current votes on ideas (one per user per idea)
CREATE TABLE clarity_idea_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES clarity_ideas(id) ON DELETE CASCADE,
  voter_session_id UUID,
  voter_name TEXT NOT NULL,
  vote TEXT NOT NULL, -- 'agree', 'disagree', 'dont_know'
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(idea_id, voter_session_id)
);

-- Vote history (every vote change is recorded)
CREATE TABLE clarity_idea_vote_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id UUID REFERENCES clarity_idea_votes(id) ON DELETE CASCADE,
  idea_id UUID NOT NULL,
  voter_session_id UUID,
  voter_name TEXT NOT NULL,
  vote TEXT NOT NULL, -- 'agree', 'disagree', 'dont_know'
  changed_at TIMESTAMP DEFAULT now()
);

-- Comments on ideas (can be elevated)
CREATE TABLE clarity_idea_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES clarity_ideas(id) ON DELETE CASCADE,
  author_session_id UUID,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  elevated_to_idea_id UUID REFERENCES clarity_ideas(id), -- if promoted
  created_at TIMESTAMP DEFAULT now()
);

-- Indexes
CREATE INDEX idx_idea_votes_idea ON clarity_idea_votes(idea_id);
CREATE INDEX idx_idea_votes_voter ON clarity_idea_votes(voter_session_id);
CREATE INDEX idx_idea_vote_history_idea ON clarity_idea_vote_history(idea_id);
CREATE INDEX idx_idea_comments_idea ON clarity_idea_comments(idea_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_idea_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_idea_comments;
```

**Note:** Vote history is recorded automatically when a user changes their vote. The current vote is in `clarity_idea_votes`, all previous votes are in `clarity_idea_vote_history`.

---

## N-Person Chat (Future)

Current: 1-to-1 Clarity Chat
Future: N people in shared space

**Model:** Not 1-to-N broadcast, but **pairwise verification** among N participants.

- Any two people can verify understanding with each other
- No single authority
- Multiple verification relationships on same idea
- Chat becomes a "verification space" not a single thread

*Architecture supports this (chat_id + verifier pairs), but UI is future scope.*

---

## MVP Scope

### In Scope (P19.3)
- [x] Idea feed UI (`/feed`)
- [x] Idea page (`/idea/:id`)
- [x] Vote buttons (Agree / Disagree / Don't Know)
- [x] Vote counts and voter lists
- [x] Vote history (visible when user changes vote)
- [x] Comments on ideas
- [x] Elevate comment to idea
- [x] "Discuss in Chat" → starts Clarity Chat with idea as context
- [ ] Basic profile stats
- [ ] Verification badge on voters (Epic 5.2)

### Out of Scope (Deferred)
- Graveyard logic (ideas live forever for MVP)
- N-person verification rooms
- Verification visibility by connection degree
- Anonymous voting
- Advanced profile analytics
- Idea search / filtering
- Feed algorithm / personalization

---

## Open Questions

*All original questions resolved — see Decisions Log above.*

---

## Design References

Reference mockups provided during design discussion (attach screenshots showing):
- Idea cards with True/False voting
- Reactions modal with voter list
- Activity feed with filters
- Profile view with activity tabs
- Comments thread UI
- Dark mode feed variant

---

## Success Metrics

| Metric | What It Tells Us |
|--------|------------------|
| Ideas created | Are people posting? |
| Votes per idea | Engagement level |
| Vote distribution | Consensus vs controversy |
| Vote changes | Are people reconsidering? |
| Comments per idea | Discussion depth |
| Elevation rate | Are comments becoming ideas? |
| Chat starts from feed | Are people going deep? |

---

## Relationship to P19.2

P19.2 (Clarity Chat) remains the core verification engine.
P19.3 adds the public layer on top:

```
┌─────────────────────────────────────┐
│         P19.3: Idea Feed            │
│   (discover, vote, comment)         │
└─────────────┬───────────────────────┘
              │ "Discuss in Chat"
              ▼
┌─────────────────────────────────────┐
│       P19.2: Clarity Chat           │
│   (explain-back, verify, position)  │
└─────────────────────────────────────┘
```

Build P19.2 first, then layer P19.3 on top.

---

## Epic & Story Breakdown

### Epic 1: Idea Feed Foundation

| Story | Description | Acceptance Criteria |
|-------|-------------|---------------------|
| **1.1** | Database schema | Tables created (votes, vote_history, comments), indexes, RLS policies, realtime enabled |
| **1.2** | Idea feed page (`/feed`) | List view with pagination, shows public ideas, sorted by recent |
| **1.3** | Idea card component | Displays idea text (truncated), originator, timestamp, vote counts |
| **1.4** | Idea detail page (`/idea/:id`) | Full idea text, provenance, all actions available |

### Epic 2: Voting System

| Story | Description | Acceptance Criteria |
|-------|-------------|---------------------|
| **2.1** | Vote buttons | Agree/Disagree/Don't Know buttons on card and detail page |
| **2.2** | Vote recording + history | Vote saved, history recorded on change, `updated_at` updated |
| **2.3** | Vote counts (realtime) | Counts update live via Supabase realtime |
| **2.4** | Voter list modal | Tap count → see who voted what, shows vote history if changed |

### Epic 3: Idea Creation

| Story | Description | Acceptance Criteria |
|-------|-------------|---------------------|
| **3.1** | Direct creation from feed | "New Idea" button → input → posted to feed |
| **3.2** | Elevate message from chat | "Make this an idea" on chat messages → creates idea with provenance |
| **3.3** | Auto-elevation on explain-back | When explain-back requested, message becomes idea automatically |

### Epic 4: Comments & Discussion

| Story | Description | Acceptance Criteria |
|-------|-------------|---------------------|
| **4.1** | Comments thread | Add comments to idea, threaded view, realtime updates |
| **4.2** | Elevate comment to idea | "Make this an idea" on comments → new orphan idea with provenance |

### Epic 5: Chat Integration

| Story | Description | Acceptance Criteria |
|-------|-------------|---------------------|
| **5.1** | "Discuss in Chat" button | Opens Clarity Chat with idea pre-loaded as context |
| **5.2** | Verification badge on voters | Show ✓ on voters who verified understanding (always visible for MVP) |

### Epic 6: Profile Stats

| Story | Description | Acceptance Criteria |
|-------|-------------|---------------------|
| **6.1** | Basic profile stats | Ideas originated, votes cast, verifications completed |

---

## Delivery Order

```
P19.2 Prerequisites (FIRST)
    │
    ▼
Epic 1: Foundation (1.1 → 1.2 → 1.3 → 1.4)
    │
    ├──▶ Epic 2: Voting (2.1 → 2.2 → 2.3 → 2.4)
    │
    └──▶ Epic 3: Idea Creation (3.1, then 3.2 + 3.3 need P19.2)
              │
              ▼
         Epic 4: Comments (4.1 → 4.2)
              │
              ▼
         Epic 5: Chat Integration (5.1 → 5.2)
              │
              ▼
         Epic 6: Profile Stats (6.1)
```

**Parallelizable:** Epic 2 and Epic 3.1 can run in parallel after Epic 1.

---

## Next Steps

1. [x] Review decisions - captured in Decisions Log
2. [x] Complete P19.2 prerequisites (multiple rounds, stop-here) - Done 2024-12-19
3. [x] Start Epic 1: Foundation
4. [x] Epic 2: Voting System (complete)
5. [x] Epic 3.1: Direct creation from feed
6. [x] Epic 4: Comments & Discussion (4.1 + 4.2)
7. [x] Epic 5.1: "Discuss in Chat" button
8. [ ] Epic 5.2: Verification badge on voters
9. [ ] Epic 6.1: Basic profile stats
10. [ ] Epic 3.2 + 3.3: Chat integration (now unblocked)
11. [ ] Add celebration UI on 10/10 acceptance
12. [ ] Test with users
