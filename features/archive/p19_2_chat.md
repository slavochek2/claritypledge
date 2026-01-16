# P19.2: Clarity Chat MVP

**Status:** Planning
**Priority:** High
**Parent:** [P19 Clarity Partners & Common Knowledge Engine](./p19_clarity-partners-common-knowledge.md)
**Supersedes:** [P19.1 Clarity Partners MVP](./p19_1_clarity-partners-mvp.md) (pivot, not abandoned)

---

## The Pivot

P19.1 built a "Clarity Partners" demo with commitment ceremony. User feedback revealed:

| P19.1 Assumption | What We Learned |
|------------------|-----------------|
| Pre-existing trust needed | **Wrong.** No trust required — the structure creates safety |
| Value = partnership commitment | **Wrong.** Value = the paraphrase loop itself |
| Need relationship to engage | **Wrong.** Anyone can use it with anyone |

**Key insight from user research:**
> "It's a universal human need to be understood. I want to use it with my parents."

But "become Clarity Partners with my parents" feels weird. "Start a Clarity Chat" doesn't.

---

## Vision: Common Knowledge Infrastructure

**Core idea:** Turn any idea into common knowledge through verified understanding.

```
IDEA: "Trust requires verified understanding"
├── Author: Slava
├── Visibility: Public
├── Verifications:
│   ├── Gosha: ✓ 10/10 — Agrees
│   ├── Alex: ✓ 9/10 accepted — Disagrees
│   └── 47 others verified
└── Pending: 3 attempted, not yet accepted
```

**Ideas are first-class citizens:**
- Ideas exist independently (not nested in chats)
- Anyone can verify understanding of any public idea
- Chat is one interface to the idea graph

**Like Wikipedia for understanding:**
- Wikipedia: shared knowledge, anyone can edit
- Clarity: shared ideas, anyone can prove they understand

---

## Verification Patterns

| Pattern | Use Case |
|---------|----------|
| **1-to-1** | "I want my partner to understand this" |
| **1-to-N** | "I want my team to understand this" |
| **N-to-N** | Public idea, anyone can verify |

MVP starts with 1-to-1, architecture supports all.

---

## Core Concepts

| Concept | Definition |
|---------|------------|
| **Idea** | A statement someone wants understood |
| **Verification** | Someone proving they understood an idea (paraphrase + rating) |
| **Position** | Agree / Disagree / Don't Know / Skip (unlocked after verification) |
| **Chat** | A context for real-time verification between people |
| **Profile** | Ideas authored + ideas verified |

---

## What is a "Clarity Chat"?

A shared space where people verify understanding of ideas together.

**Not:** A messaging app with clarity features
**But:** A clarity tool that uses chat as the interface

**In a chat you can:**
- Submit an idea (text or voice → transcribed)
- Request paraphrase on any idea
- Paraphrase someone's idea
- Rate a paraphrase (accept/correct)
- State your position (after understanding verified)

---

## MVP Scope

### In Scope
- Create/join chat (room code or link)
- 2 people per chat (1-to-1)
- Send ideas (text or voice)
- Request paraphrase ("verify my understanding")
- Paraphrase submission
- Rating flow (0-100, correction if needed)
- Position after verification (agree/disagree/neutral)
- Chat persists (permanent log)
- Ideas stored separately (for future: public ideas, cross-chat verification)

### Out of Scope (Future)
- Group chats (N people)
- Public ideas browser
- Verify ideas outside of chat context
- Import/quote external content
- Calibration scores
- User accounts (keep session-based for MVP)

---

## Data Model

```sql
-- Ideas are first-class (not nested in chats)
CREATE TABLE clarity_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_session_id UUID, -- who created it (session-based for MVP)
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT DEFAULT 'original', -- 'original', 'quoted', 'forked'
  source_url TEXT, -- if quoted from somewhere
  visibility TEXT DEFAULT 'private', -- 'private', 'chat', 'public'
  created_at TIMESTAMP DEFAULT now()
);

-- Chats are containers / contexts
CREATE TABLE clarity_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- 6-char room code
  creator_name TEXT NOT NULL,
  joiner_name TEXT,
  status TEXT DEFAULT 'waiting', -- 'waiting', 'active', 'ended'
  created_at TIMESTAMP DEFAULT now()
);

-- Link ideas to chats (many-to-many for future)
CREATE TABLE clarity_chat_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES clarity_chats(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES clarity_ideas(id) ON DELETE CASCADE,
  added_by TEXT NOT NULL,
  added_at TIMESTAMP DEFAULT now(),
  UNIQUE(chat_id, idea_id)
);

-- Verifications (paraphrase attempts)
CREATE TABLE clarity_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES clarity_ideas(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES clarity_chats(id), -- context where verification happened
  verifier_name TEXT NOT NULL,
  paraphrase_text TEXT NOT NULL,
  round_number INT DEFAULT 1,
  accuracy_rating INT, -- 0-100, set by author
  correction_text TEXT, -- if author provides correction
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
  position TEXT, -- 'agree', 'disagree', 'dont_know', NULL for skip (after accepted)
  created_at TIMESTAMP DEFAULT now()
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_ideas;
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_chat_ideas;
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_verifications;

-- Indexes
CREATE INDEX idx_clarity_chats_code ON clarity_chats(code);
CREATE INDEX idx_clarity_chat_ideas_chat ON clarity_chat_ideas(chat_id);
CREATE INDEX idx_clarity_verifications_idea ON clarity_verifications(idea_id);
```

---

## User Flows

### Flow 1: Start a Chat

**Creator:**
1. Open `/clarity-chat`
2. Enter name
3. Tap "Start Chat"
4. Get shareable link/code
5. Share with person

**Joiner:**
1. Open link or enter code
2. Enter name
3. In the chat

### Flow 2: Submit an Idea

1. Type or tap 🎤 to record
2. (If voice: see transcription, edit if needed)
3. Tap "Send"
4. Idea appears in chat
5. Syncs to partner

### Flow 3: Request Verification

1. Tap on any idea
2. Tap "Request Paraphrase"
3. Partner sees: "Slava wants you to paraphrase this"
4. Partner paraphrases (text or voice)
5. Author rates accuracy (0-100)
6. If < accepted: correction shown, partner tries again
7. If accepted: partner can state position

### Flow 4: Voluntary Paraphrase

1. See partner's idea
2. Tap "Paraphrase"
3. Submit paraphrase without being asked
4. Author rates when ready
5. Position unlocked after acceptance

---

## Screen States

### Chat Setup (reuse from P19.1)
1. **Start Screen** — Name input, Create/Join
2. **Waiting Room** — Code displayed, waiting for partner
3. **Join Screen** — Enter code, see who invited

### Chat (new)
4. **Chat View** — Message list, input, send button
5. **Idea Actions** — Tap idea → Request Paraphrase / Paraphrase
6. **Paraphrase Input** — Text/voice input for paraphrase
7. **Rating View** — Slider, correction field, accept button
8. **Position Selection** — Agree / Disagree / Don't Know / Skip

### Verification States (inline in chat)
- Idea: normal / paraphrase-requested / paraphrase-pending / verified
- Shows: verification badge, position, rounds taken

---

## What We Reuse from P19.1

| Component | Reuse? |
|-----------|--------|
| Room code generation | ✅ Yes |
| Join flow UI | ✅ Yes, simplify |
| Supabase realtime sync | ✅ Yes |
| Speech-to-text | ✅ Yes |
| Rating slider UI | ✅ Yes |
| Correction input | ✅ Yes |
| Position buttons | ✅ Yes |
| 5-level demo | ❌ Move to optional onboarding |
| Commitment ceremony | ❌ Remove |
| "Clarity Partners" language | ❌ Replace with "Clarity Chat" |

---

## MVP Stories

### Story 0: Create or Join Chat

**As** a user
**I want** to create a chat or join with a code
**So that** I can start verifying understanding with someone

**Acceptance Criteria:**
- [ ] Name input required
- [ ] "Create Chat" generates 6-char code
- [ ] Shareable link: `/clarity-chat?code=ABC123`
- [ ] "Join" with code input
- [ ] Both see each other's name when connected
- [ ] Chat auto-starts when both present

---

### Story 1: Send Ideas

**As** a chat participant
**I want** to send ideas via text or voice
**So that** my partner can verify their understanding

**Acceptance Criteria:**
- [ ] Text input with send button
- [ ] Voice input: tap 🎤 → record → transcribe → edit → send
- [ ] Ideas appear in chat (message list UI)
- [ ] Ideas sync to partner in realtime
- [ ] Ideas stored in `clarity_ideas` table
- [ ] Link to chat via `clarity_chat_ideas`

---

### Story 2: Request Paraphrase

**As** the author of an idea
**I want** to request my partner paraphrase it
**So that** I know they understood before they react

**Acceptance Criteria:**
- [ ] Tap idea → "Request Paraphrase" action
- [ ] Partner sees notification/highlight
- [ ] Idea state changes to `paraphrase-requested`
- [ ] Partner can't state position until verified

---

### Story 3: Submit Paraphrase

**As** the partner
**I want** to paraphrase an idea (requested or voluntary)
**So that** I can prove I understood

**Acceptance Criteria:**
- [ ] Paraphrase input (text or voice)
- [ ] Submit sends to author for rating
- [ ] Paraphrase stored in `clarity_verifications`
- [ ] Multiple rounds supported (correction → retry)

---

### Story 4: Rate Paraphrase

**As** the author
**I want** to rate how accurately my partner paraphrased
**So that** I can accept or provide correction

**Acceptance Criteria:**
- [ ] Rating slider (0-100)
- [ ] Optional correction text
- [ ] "Accept" button (can accept < 100)
- [ ] Rating syncs to partner
- [ ] If not accepted: partner sees correction, can retry
- [ ] If accepted: unlock position selection

---

### Story 5: State Position

**As** a partner who verified understanding
**I want** to state whether I agree/disagree
**So that** we know where we stand after understanding

**Acceptance Criteria:**
- [ ] Position buttons: Agree / Disagree / Don't Know / Skip (or do nothing)
- [ ] Only enabled after verification accepted
- [ ] Position stored and displayed on idea
- [ ] Position syncs to author

---

### Story 6: Chat History

**As** a user
**I want** to see full chat history with verification status
**So that** I have a record of what we've clarified

**Acceptance Criteria:**
- [ ] Chat persists (no expiry)
- [ ] Can rejoin via code/link
- [ ] Shows all ideas with verification status
- [ ] Shows positions where given
- [ ] Shows number of rounds per idea

---

## Future Stories (Post-MVP)

- **Onboarding:** Optional tutorial for first-time users
- **Group chats:** N people, multiple verifiers per idea
- **Public ideas:** Browse and verify any public idea
- **Profile view:** Ideas I've authored / verified
- **Quote external:** Import idea from URL
- **Calibration score:** Track confidence vs accuracy over time

---

## Success Metrics

| Metric | What It Tells Us |
|--------|------------------|
| Chats created | Are people starting? |
| Ideas per chat | Depth of engagement |
| Verification completion rate | Is the loop working? |
| Rounds to acceptance | How hard is understanding? |
| Position usage | Do people use agree/disagree? |
| Return usage | Do people come back? |
| Qualitative feedback | What feels awkward? |

---

## Open Questions

1. **Onboarding:** How do first-time users learn the flow? Tooltips? Bot message? Skip for MVP?
2. **Notifications:** If partner is offline, how do they know to come back? (Out of scope for MVP?)
3. **Chat naming:** Should chats have names/topics? Or just participant names?
4. **Idea editing:** Can you edit an idea after submitting? What about after verification started?

---

## Next Steps

1. [ ] Review this doc — gaps?
2. [ ] Create database tables
3. [ ] Build chat UI (message list + input)
4. [ ] Implement Story 0: Create/Join (adapt from P19.1)
5. [ ] Implement Stories 1-5 (core loop)
6. [ ] Test with real users
7. [ ] Iterate based on feedback
