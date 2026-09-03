# Product Requirements Document - P32: Ideas in /live

**Author:** Slava (via PM Agent John)
**Date:** 2026-01-04
**Status:** Draft
**Feature Doc:** `features/p350_ideas_in_live.md` (spec no longer in the tree)

---

## 1. Problem Statement

### The Core Issue

Users in `/live` sessions ask **"why must I do this?"** — the explain-back ritual feels pointless without stakes.

Currently, two people enter a session and verify understanding on... nothing specific. There's no anchor. The conversation floats. The verification flow works mechanically but lacks meaning.

### The Insight

Verification matters when there's an **idea** where agreement or disagreement has consequences.

From [Theory of Change - Facilitation Ladder](../../theory-of-change.md#the-facilitation-ladder):

> The answer: verification matters when there's an **idea** where agreement/disagreement has consequences.

### Why This Matters

This is **Level 1 of the Facilitation Ladder** — the foundation for all group features. Without ideas:
- No stakes → no motivation
- No positions → no surfaced disagreements
- No per-idea certification → no topology data (who understands whom on WHAT)

---

## 2. Solution Overview

Add **ideas** to `/live` sessions:

1. Session creator can seed ideas before or during the session
2. Both parties mark positions on each idea: **agree / disagree / don't know / unselected**
3. Either party selects an idea to verify → enters existing verification flow
4. Certification is recorded **per idea**, not just per session

### Success Outcome

When asked "why must I do this?" — the answer is: *"We're checking if you understand THIS idea, which you disagree with."*

---

## 3. User Personas

| Persona | Description | Primary Goal |
|---------|-------------|--------------|
| **Session Creator** | Person who initiates the /live session | Seed ideas for discussion, verify partner understands their positions |
| **Session Joiner** | Person who joins via code/link | Mark positions, initiate verification on ideas they want understood |

Both personas can:
- Mark positions on any idea
- Initiate verification on any idea
- (Priority 2) Add new ideas

---

## 4. User Flows

### Flow 1: Session Creation with Ideas

```
1. Creator clicks "New meeting" on /live
   └── Session created with empty ideas list

2. Creator (optionally) adds ideas before sharing code
   └── Text input → idea added to session
   └── Idea visible only to creator until partner joins

3. Creator shares code with partner

4. Partner joins → sees ideas list
   └── Both can now mark positions
```

### Flow 2: Position Marking

```
1. User sees idea in list
   └── Position buttons: [Agree] [Disagree] [Don't Know]
   └── Default state: Unselected (no button highlighted)

2. User taps position → immediately saved
   └── Optimistic UI update
   └── Synced to partner via existing realtime subscription

3. User can change position at any time
   └── New selection replaces previous
   └── History not tracked (MVP)
```

### Flow 3: Verification on Idea

```
1. Either party taps idea row → "Verify understanding" action

2. System sets context:
   └── Current idea stored in live_state
   └── Verification flow knows WHAT is being verified

3. Existing verification flow runs:
   └── Check/Prove pattern (speaker/listener roles)
   └── Sealed-bid ratings
   └── Explain-back cycles

4. On verification completion:
   └── Certification recorded against the idea
   └── Idea status updates to "Verified"
   └── (Future) Who certified whom on this idea → topology data
```

### Flow 4: Adding Ideas During Session (Priority 1 - Creator Only)

```
1. Creator taps "+ Add idea"

2. Text input appears (inline or modal TBD by UX)

3. Creator types idea → submits

4. Idea added to list
   └── Both parties see it
   └── Positions: both unselected initially
```

### Flow 5: Non-Creator Adding Ideas (Priority 2)

```
1. Joiner can also tap "+ Add idea"

2. Same flow as creator

3. Idea shows "Created by [name]" indicator
```

---

## 5. Requirements

### 5.1 Functional Requirements

#### FR1: Idea Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1.1 | Session creator can add ideas (text, max 500 chars) | P1 |
| FR1.2 | Ideas are persisted with the session | P1 |
| FR1.3 | Ideas are synced in real-time between both parties | P1 |
| FR1.4 | Ideas can be added before partner joins | P1 |
| FR1.5 | Ideas can be added during active session | P1 |
| FR1.6 | Non-creator can add ideas | P2 |
| FR1.7 | Ideas show who created them | P2 |

#### FR2: Position Marking

| ID | Requirement | Priority |
|----|-------------|----------|
| FR2.1 | Four position states: Unselected, Agree, Disagree, Don't Know | P1 |
| FR2.2 | Default position is Unselected | P1 |
| FR2.3 | User can mark position on any idea | P1 |
| FR2.4 | Position updates synced in real-time | P1 |
| FR2.5 | Both parties' positions visible to each other | P1 |
| FR2.6 | User can change position at any time | P1 |

#### FR3: Verification Flow Integration

| ID | Requirement | Priority |
|----|-------------|----------|
| FR3.1 | Tapping idea triggers "verify understanding" action | P1 |
| FR3.2 | Verification flow receives current idea as context | P1 |
| FR3.3 | Existing Check/Prove flow used (no rebuild) | P1 |
| FR3.4 | Certification recorded per idea | P1 |
| FR3.5 | Idea status shows "Verified" after successful certification | P1 |

#### FR4: Idea Display

| ID | Requirement | Priority |
|----|-------------|----------|
| FR4.1 | Ideas displayed in a list within session view | P1 |
| FR4.2 | Each idea row shows: text, your position, partner position, status | P1 |
| FR4.3 | Verification status: "Not verified" or "Verified" | P1 |
| FR4.4 | Visual indication when positions differ (disagreement) | P2 |

### 5.2 Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR1 | Ideas sync within 1 second (same as current live_state) |
| NFR2 | Position updates optimistic (immediate UI feedback) |
| NFR3 | Works on mobile (touch-friendly position buttons) |
| NFR4 | Ideas persist if session is paused/resumed |

---

## 6. Data Model Requirements

### New Table: `ideas`

```sql
CREATE TABLE public.ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES clarity_sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) <= 500),
  created_by TEXT NOT NULL,              -- name of creator (creator_name or joiner_name)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Positions stored as JSONB: { "creator_name": "agree", "joiner_name": "disagree" }
  positions JSONB NOT NULL DEFAULT '{}',

  -- Verification tracking
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by JSONB                       -- { "speaker": "name", "listener": "name" }
);

-- Index for session lookups
CREATE INDEX idx_ideas_session ON ideas(session_id);
```

### RLS Policies

```sql
-- Anyone in the session can read ideas
CREATE POLICY "ideas_read" ON ideas FOR SELECT
  USING (true);  -- Public read (session code is the security)

-- Authenticated users can insert (creator or joiner)
CREATE POLICY "ideas_insert" ON ideas FOR INSERT
  WITH CHECK (true);  -- Session membership checked at app layer

-- Anyone can update (positions, verification)
CREATE POLICY "ideas_update" ON ideas FOR UPDATE
  USING (true);
```

### live_state Extension

```typescript
interface LiveSessionState {
  // ... existing fields ...

  // NEW: Current idea being verified
  currentIdeaId?: string;
}
```

---

## 7. Story Breakdown

### Epic: P32 Ideas in /live

#### Story 1: Idea Creation (P1)

**As a** session creator
**I want to** add ideas to my session
**So that** verification has specific topics with stakes

**Acceptance Criteria:**
- [ ] "+ Add idea" button visible to session creator
- [ ] Text input accepts up to 500 characters
- [ ] Submitting adds idea to list immediately (optimistic)
- [ ] Idea persisted to database
- [ ] Idea syncs to partner if they've joined
- [ ] Can add ideas before partner joins
- [ ] Can add ideas during active session

#### Story 2: Idea List Display (P1)

**As a** session participant
**I want to** see all ideas in the session
**So that** I know what topics are available for discussion

**Acceptance Criteria:**
- [ ] Ideas displayed in a scrollable list
- [ ] Each idea shows: text (truncated if long), positions, status
- [ ] Empty state: "No ideas yet. Add one to get started."
- [ ] List updates in real-time when partner adds/modifies

#### Story 3: Position Marking (P1)

**As a** session participant
**I want to** mark my position on each idea
**So that** disagreements are visible before verification

**Acceptance Criteria:**
- [ ] Position buttons: Agree, Disagree, Don't Know
- [ ] Default state: Unselected (no button active)
- [ ] Tapping button marks position (visual feedback)
- [ ] Position saved immediately (optimistic + sync)
- [ ] Can change position by tapping different button
- [ ] Partner's position visible (after they mark it)
- [ ] "Unselected" shown if partner hasn't chosen

#### Story 4: Verify on Idea (P1)

**As a** session participant
**I want to** select an idea and enter verification
**So that** we can certify understanding on THIS specific topic

**Acceptance Criteria:**
- [ ] Tapping idea row shows "Verify understanding" action
- [ ] Action triggers existing verification flow
- [ ] Current idea ID stored in live_state.currentIdeaId
- [ ] Verification UI can show "Verifying: [idea text]" header
- [ ] On completion, certification links to idea

#### Story 5: Certification per Idea (P1)

**As the** system
**I want to** record certifications against specific ideas
**So that** we can build topology data (who understands whom on WHAT)

**Acceptance Criteria:**
- [ ] When verification completes successfully (both satisfied)
- [ ] Idea marked as verified (is_verified = true)
- [ ] Speaker/listener names recorded (verified_by JSONB)
- [ ] Idea row updates to show "Verified" status
- [ ] Verification can happen multiple times (re-verify)

#### Story 6: Mutual Idea Seeding (P2)

**As a** session joiner
**I want to** add ideas too
**So that** both parties can bring topics for verification

**Acceptance Criteria:**
- [ ] "+ Add idea" button visible to both parties
- [ ] Ideas show "Added by [name]" indicator
- [ ] Same creation flow as creator

---

## 8. Out of Scope

| Feature | Reason |
|---------|--------|
| Voice-to-text idea creation | Nice-to-have, adds complexity |
| AI refinement of ideas | Future enhancement |
| Idea statistics/analytics | Level 4 feature |
| Group/multi-person sessions | Level 2-3 feature |
| Topology visualization | Level 4 feature |
| Editing/deleting ideas | MVP simplicity |
| Idea ordering/prioritization | MVP simplicity |

---

## 9. Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Position states? | Four states: Unselected (default), Agree, Disagree, Don't Know |
| "Don't Know" meaning? | Active choice: "I'm uncertain / need more info" — not same as unselected |
| Can positions change? | Yes, at any time |
| Idea text limit? | 500 characters (force conciseness) |
| What if no ideas? | Prompt to create one, but don't block verification flow |

---

## 10. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Users no longer ask "why?" | Qualitative | User feedback, session recordings |
| Sessions have ideas before verification | >80% of sessions | Analytics: sessions with ≥1 idea |
| Positions marked before verification | >60% of ideas | Analytics: ideas with both positions marked |
| Certifications per idea | >1 per session | Analytics: verified ideas count |

---

## 11. Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Existing /live verification flow | Complete | Reuse, don't rebuild |
| Supabase Realtime sync | Complete | Extend to ideas table |
| live_state JSONB pattern | Complete | Add currentIdeaId field |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ideas table adds latency | Medium | Use same sync pattern as live_state (proven) |
| Position sync race conditions | Low | Optimistic UI + last-write-wins (positions aren't critical) |
| UX confusion: ideas vs verification | Medium | Clear visual separation (UX Designer scope) |
| Feature creep on ideas | High | Strict scope: text only, no editing, no ordering |

---

## Next Steps

1. **UX Designer** → Wireframes for idea list, position buttons, verify action
2. **Architect** → Technical design, migration plan, API contracts
3. **Stories** → Break down with tasks and estimates
4. **Implementation** → Priority 1 stories first

---

*PRD complete. Ready for UX design and architecture phases.*
